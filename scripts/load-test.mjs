/** Synthetic local API/SQLite/outbox load only. No requests are sent to Resend. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { readConfig } from '../server/config.js';
import { createOutboxWorker } from '../server/worker.js';

const reportPath = path.resolve(process.env.LOAD_TEST_REPORT || 'test-results/api-load.json');
const lowCount = Number(process.env.LOAD_TEST_LOW_COUNT || 100);
const highCount = Number(process.env.LOAD_TEST_HIGH_COUNT || 1000);
for (const value of [lowCount, highCount]) if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error('Load counts must be integers between 1 and 10,000');
const directory = await mkdtemp(path.join(os.tmpdir(), 'cosmonet-load-'));
const config = readConfig({ NODE_ENV: 'test', SITE_URL: 'http://127.0.0.1:3000', DATA_DIR: directory,
  HASH_SECRET: 'synthetic-load-test-hash-secret-32-characters', RESEND_API_KEY: 're_test_key_1234567890',
  RESEND_FROM: 'Cosmonet <enquiries@example.com>', TURNSTILE_REQUIRED: 'false',
  IP_RATE_LIMIT: '1000000', EMAIL_RATE_LIMIT: '1000000', GLOBAL_RATE_LIMIT: '1000000',
  MAX_PENDING_REQUESTS: '1000', MAX_QUEUED_EMAILS: '1000000' });
const filename = path.join(directory, 'enquiries.sqlite');
let store;
let server;
let baseURL;
let worker;
const results = [];
const providerAcceptances = new Map();
let providerCalls = 0;

const mockEmailClient = {
  async send(job) {
    providerCalls++;
    assert.ok(job.emailPayload, 'Email requests must use a durable immutable snapshot');
    assert.ok(['team', 'ack'].includes(job.kind));
    if (!providerAcceptances.has(job.id)) providerAcceptances.set(job.id, randomUUID());
    await new Promise(resolve => setTimeout(resolve, 1));
    return { id: providerAcceptances.get(job.id) };
  },
};

function lead(phase, index) {
  return { name: 'Synthetic Load Test', company: 'Example Company', email: `${phase}-${index}@example.com`, service: 'Software development',
    interest: 'Startup', message: 'A synthetic local load test enquiry; no real emails are sent.', consent: true, website: '', request_id: randomUUID(), turnstile_token: '', campaign: { utm_source: 'local-load-test' } };
}

async function start() {
  store = createStore({ filename, config });
  server = http.createServer(createApp({ config, store, verifyCaptcha: async () => ({ ok: true }), logger: () => {} }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseURL = 'http://127.0.0.1:' + server.address().port;
}

async function stopHTTP() {
  if (server) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); server = null; }
}

async function post(body) {
  const response = await fetch(baseURL + '/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.siteOrigin }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

async function phase(name, bodies, concurrency, expectedStatus) {
  const started = performance.now();
  const timings = [];
  const statuses = {};
  const references = [];
  let next = 0;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(concurrency, bodies.length) }, async () => {
    while (next < bodies.length) {
      const body = bodies[next++]; const before = performance.now(); const response = await post(body);
      timings.push(performance.now() - before); statuses[response.status] = (statuses[response.status] || 0) + 1;
      assert.equal(response.status, expectedStatus, JSON.stringify(response));
      if (expectedStatus < 300) { assert.equal(response.data.ok, true); assert.equal(response.data.queued, true); assert.ok(response.data.reference); references.push(response.data.reference); }
    }
  }));
  timings.sort((a, b) => a - b);
  const durationMs = performance.now() - started;
  const failures = outcomes.filter(outcome => outcome.status === 'rejected').map(outcome => outcome.reason);
  const report = { name, passed: failures.length === 0, requests: bodies.length, completedRequests: timings.length, concurrency, statuses, durationMs: Math.round(durationMs), requestsPerSecond: Math.round(timings.length * 1000 / durationMs), p50Ms: Math.round(timings[Math.floor(timings.length * .5)] || 0), p95Ms: Math.round(timings[Math.min(timings.length - 1, Math.floor(timings.length * .95))] || 0), uniqueReferences: new Set(references).size };
  results.push(report); console.log(JSON.stringify(report));
  if (failures.length) throw new AggregateError(failures, name + ' failed after all request loops were drained');
  return references;
}

try {
  await start();
  const low = Array.from({ length: lowCount }, (_, index) => lead('low', index));
  const high = Array.from({ length: highCount }, (_, index) => lead('high', index));
  await phase('low-traffic', low, 5, 201);
  await phase('high-traffic', high, 50, 201);
  const totalLeads = lowCount + highCount;
  assert.equal(store.stats().leads, totalLeads); assert.equal(store.stats().jobs.queued, totalLeads * 2);
  const originalReference = (await post(low[0])).data.reference;
  const duplicates = await phase('duplicate-burst', Array.from({ length: 100 }, () => low[0]), 100, 200);
  assert.ok(duplicates.every(reference => reference === originalReference));
  await phase('conflicting-retry-burst', Array.from({ length: 100 }, () => ({ ...low[0], message: 'Changed details must not overwrite an accepted enquiry.' })), 50, 409);
  assert.equal(store.stats().leads, totalLeads); assert.equal(store.stats().jobs.queued, totalLeads * 2);
  await stopHTTP(); store.close(); store = null;
  await start();
  const afterRestart = await post(low[0]); assert.equal(afterRestart.status, 200); assert.equal(afterRestart.data.reference, originalReference);
  assert.equal(store.stats().leads, totalLeads);
  const drainStarted = performance.now();
  worker = createOutboxWorker({ store, emailClient: mockEmailClient, concurrency: 4, pollMs: 2, sendIntervalMs: 0, leaseMs: 60000, logger: { error() {} } }).start();
  const deadline = Date.now() + 120000;
  while (true) {
    const stats = store.stats();
    if (!stats.jobs.queued && !stats.jobs.processing) break;
    if (Date.now() > deadline) throw new Error('Mock outbox did not drain within 120 seconds');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await worker.stop(); worker = null;
  const finalStats = store.stats();
  assert.equal(finalStats.jobs.sent, totalLeads * 2); assert.equal(finalStats.jobs.failed, 0);
  assert.equal(providerAcceptances.size, totalLeads * 2); assert.equal(providerCalls, totalLeads * 2);
  results.push({ name: 'restart-and-outbox-drain', durableLeadsAfterRestart: finalStats.leads, sentJobs: finalStats.jobs.sent, uniqueMockProviderAcceptances: providerAcceptances.size, providerCalls, durationMs: Math.round(performance.now() - drainStarted), simulatedProviderDelayMs: 1, simulatedSendIntervalMs: 0 });
  const report = { recordedAt: new Date().toISOString(), passed: true, externalEmailDeliveryTested: false, scope: 'Local Express/SQLite persistence and mocked outbox throughput. CAPTCHA and Resend are mocked. Synthetic rate limits are raised and send cadence is zero for this test only; results do not establish production hosting or provider capacity.', results };
  await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, report: reportPath, leads: totalLeads, emailJobs: totalLeads * 2 }));
} catch (error) {
  await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify({ recordedAt: new Date().toISOString(), passed: false, externalEmailDeliveryTested: false, error: error.stack || String(error), results }, null, 2) + '\n');
  console.error(error.stack || String(error)); process.exitCode = 1;
} finally {
  if (worker) await worker.stop({ timeoutMs: 1000 });
  await stopHTTP(); store?.close(); await rm(directory, { recursive: true, force: true });
}
