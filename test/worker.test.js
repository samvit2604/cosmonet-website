import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxWorker, retryDelay } from '../server/worker.js';
import { EmailDeliveryError } from '../server/email.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for worker'); await wait(2); }
}
const job = (index = 1, changes = {}) => ({ id: `job-${index}`, leadId: `lead-${index}`, kind: 'team', attempts: 1, createdAt: new Date(), firstAttemptAt: new Date(), ...changes });
function fixture(jobs) {
  const rows = [...jobs];
  const events = { sent: [], retry: [], failed: [], claims: 0, permits: 0, pauses: [] };
  const store = {
    async reserveEmailSlot() { events.permits++; return { allowed: true }; },
    async pauseEmailSending(data) { events.pauses.push(data); return true; },
    async claimJob() { const result = rows.shift(); if (result) events.claims++; return result; },
    async markSent(row, data) { events.sent.push({ row, ...data }); return true; },
    async retryJob(row, data) { events.retry.push({ row, ...data }); return true; },
    async failJob(row, data) { events.failed.push({ row, ...data }); return true; },
  };
  return { store, events, rows };
}
function makeWorker(store, emailClient, options = {}) {
  return createOutboxWorker({ store, emailClient, pollMs: 5, sendIntervalMs: 0, logger: { error() {} }, ...options });
}

test('concurrent queue draining respects in-flight concurrency and processes each claim once', async t => {
  const { store, events } = fixture(Array.from({ length: 30 }, (_, i) => job(i)));
  let active = 0, peak = 0;
  const worker = makeWorker(store, { async send(row) { active++; peak = Math.max(active, peak); await wait(4); active--; return { id: `provider-${row.id}` }; } }, { concurrency: 3 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.sent.length === 30);
  assert.equal(peak, 3);
  assert.equal(new Set(events.sent.map(event => event.row.id)).size, 30);
  assert.equal(worker.stats.accepted, 30);
});

test('provider Retry-After wins over exponential backoff', async t => {
  const { store, events } = fixture([job()]);
  const before = Date.now();
  const worker = makeWorker(store, { async send() { throw new EmailDeliveryError('provider_http_503', { retryable: true, retryAfterMs: 50_000 }); } }, { random: () => 0.5, retryBaseMs: 1000 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.retry.length);
  assert.equal(events.retry[0].errorCode, 'provider_http_503');
  assert.ok(events.retry[0].nextAttemptAt.getTime() >= before + 50_000);
  assert.equal(events.failed.length, 0);
});

test('rate limiting pauses the shared sender and leaves untouched backlog queued', async t => {
  const { store, events } = fixture([job(1), job(2)]);
  const worker = makeWorker(store, { async send(row) { if (row.id === 'job-1') throw new EmailDeliveryError('rate_limit_exceeded', { status: 429, retryable: true, retryAfterMs: 50 }); return { id: 'accepted' }; } }, { concurrency: 1, retryBaseMs: 1, retryCapMs: 1 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.retry.length);
  assert.equal(events.pauses.length, 1);
  assert.equal(events.pauses[0].errorCode, 'rate_limit_exceeded');
  assert.equal(events.claims, 1);
  await until(() => events.sent.length);
  assert.equal(events.claims, 2);
});

test('quota beyond retry window deadletters the attempted job and durably pauses untouched jobs', async t => {
  const { store, events, rows } = fixture([job(1), job(2)]);
  const worker = makeWorker(store, { async send() { throw new EmailDeliveryError('monthly_quota_exceeded', { status: 429, retryable: true, retryAfterMs: 25 * 60 * 60 * 1000 }); } }, { concurrency: 1 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.failed.length);
  await wait(10);
  assert.equal(events.failed[0].errorCode, 'manual_review_required');
  assert.equal(events.pauses[0].errorCode, 'monthly_quota_exceeded');
  assert.equal(events.claims, 1);
  assert.equal(rows.length, 1);
});

test('permanent provider errors and attempt exhaustion become observable failed jobs', async t => {
  const { store, events } = fixture([job(1), job(2, { attempts: 3 })]);
  const logs = [];
  const worker = makeWorker(store, { async send(row) { throw new EmailDeliveryError(row.id === 'job-1' ? 'provider_http_401' : 'provider_http_503', { retryable: row.id !== 'job-1' }); } }, { maxAttempts: 3, logger: { error: data => logs.push(JSON.parse(data)) } });
  t.after(() => worker.stop()); worker.start(); await until(() => events.failed.length === 2);
  assert.equal(events.failed.find(event => event.row.id === 'job-1').errorCode, 'provider_http_401');
  assert.equal(events.failed.find(event => event.row.id === 'job-2').errorCode, 'manual_review_required');
  assert.ok(logs.some(entry => entry.errorCode === 'provider_http_401'));
  assert.equal(events.retry.length, 0);
});

test('supports the application function logger and maps safe operational codes', async t => {
  const { store, events } = fixture([job()]);
  const logs = [];
  const worker = makeWorker(store, { async send() { throw new EmailDeliveryError('provider_http_403'); } }, { logger: (event, fields) => logs.push({ event, ...fields }) });
  t.after(() => worker.stop()); worker.start(); await until(() => events.failed.length);
  assert.ok(logs.some(entry => entry.event === 'outbox_send_failed' && entry.code === 'provider_http_403' && entry.jobId === 'job-1'));
});

test('does not contact provider after the conservative idempotency deadline', async t => {
  const { store, events } = fixture([job(1, { firstAttemptAt: new Date(Date.now() - 2000) }), job(2)]);
  const calls = [];
  const worker = makeWorker(store, { async send(row) { calls.push(row.id); throw new EmailDeliveryError('provider_http_503', { retryable: true, retryAfterMs: 2000 }); } }, { maxRetryAgeMs: 1000, retryBaseMs: 10 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.failed.length === 2);
  assert.deepEqual(calls, ['job-2']);
  assert.ok(events.failed.every(event => event.errorCode === 'manual_review_required'));
});

test('newly attempted old queued jobs use the persisted first attempt time', async t => {
  const { store, events } = fixture([job(1, { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) })]);
  const worker = makeWorker(store, { async send() { return { id: 'accepted' }; } });
  t.after(() => worker.stop()); worker.start(); await until(() => events.sent.length);
  assert.equal(events.failed.length, 0);
});

test('failed acceptance write leaves the lease for recovery without changing retry state', async t => {
  const { store, events } = fixture([job()]);
  store.markSent = async () => { throw new Error('database unavailable; private info'); };
  const logs = [];
  const worker = makeWorker(store, { async send() { return { id: 'accepted' }; } }, { logger: { error: data => logs.push(data) } });
  t.after(() => worker.stop()); worker.start(); await until(() => worker.stats.storageErrors === 1);
  assert.equal(events.retry.length, 0);
  assert.equal(events.failed.length, 0);
  assert.ok(logs.includes('{"event":"outbox_storage_error"}'));
  assert.ok(logs.every(value => !value.includes('private info')));
});

test('lease-fenced failed updates do not report accepted, retried, or failed persistence', async t => {
  const { store } = fixture([job(1), job(2), job(3)]);
  store.markSent = store.retryJob = store.failJob = async () => false;
  const worker = makeWorker(store, { async send(row) { if (row.id === 'job-2') throw new EmailDeliveryError('temporary', { retryable: true }); if (row.id === 'job-3') throw new EmailDeliveryError('permanent'); return { id: 'accepted' }; } });
  t.after(() => worker.stop()); worker.start(); await until(() => worker.stats.lostLeases === 3);
  assert.equal(worker.stats.accepted, 0);
  assert.equal(worker.stats.retried, 0);
  assert.equal(worker.stats.failed, 0);
});

test('durable permit is acquired before any job claim', async t => {
  const { store, events } = fixture([job()]);
  let allowed = false;
  store.reserveEmailSlot = async () => ({ allowed, nextAttemptAt: new Date(Date.now() + 5) });
  const worker = makeWorker(store, { async send() { return { id: 'accepted' }; } });
  t.after(() => worker.stop()); worker.start(); await wait(20);
  assert.equal(events.claims, 0);
  allowed = true; await until(() => events.sent.length);
});

test('send pacing spans concurrent loops', async t => {
  const { store, events } = fixture(Array.from({ length: 5 }, (_, index) => job(index)));
  const starts = [];
  const worker = makeWorker(store, { async send() { starts.push(Date.now()); return { id: 'accepted' }; } }, { concurrency: 4, sendIntervalMs: 15 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.sent.length === 5);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 12, `starts too close: ${starts[i] - starts[i - 1]}ms`);
});

test('lease is renewed while a provider call is in flight', async t => {
  const { store, events } = fixture([job()]);
  let renewals = 0; store.heartbeatJob = async () => { renewals++; return true; };
  const worker = makeWorker(store, { async send() { await wait(60); return { id: 'accepted' }; } }, { leaseMs: 30 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.sent.length);
  assert.ok(renewals >= 2);
});

test('lost lease aborts the provider call instead of allowing an unfenced worker to continue', async t => {
  const { store, events } = fixture([job()]);
  let aborted = false; store.heartbeatJob = async () => false;
  const worker = makeWorker(store, { async send(_row, { signal }) { return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new EmailDeliveryError('worker_shutdown', { retryable: true })); }, { once: true })); } }, { leaseMs: 30 });
  t.after(() => worker.stop()); worker.start(); await until(() => events.retry.length);
  assert.equal(aborted, true);
  assert.equal(events.sent.length, 0);
});

test('shutdown drains active sends and stops claiming new work', async () => {
  const { store, events } = fixture([job(1), job(2)]);
  let sending = false;
  const worker = makeWorker(store, { async send() { sending = true; await wait(25); return { id: 'accepted' }; } }, { concurrency: 1 });
  worker.start(); await until(() => sending);
  const result = await worker.stop({ timeoutMs: 200 });
  assert.equal(result.drained, true);
  assert.equal(events.sent.length, 1);
  assert.equal(events.claims, 1);
  assert.equal(worker.stats.running, false);
});

test('shutdown deadline aborts stalled sends and leaves an idempotent retry', async () => {
  const { store, events } = fixture([job()]);
  let sending = false;
  const worker = makeWorker(store, { async send(_row, { signal }) { sending = true; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new EmailDeliveryError('worker_shutdown', { retryable: true })), { once: true })); } }, { concurrency: 1 });
  worker.start(); await until(() => sending);
  const result = await worker.stop({ timeoutMs: 10 });
  assert.equal(result.drained, false);
  assert.equal(result.settled, true);
  assert.equal(result.active, 0);
  assert.equal(events.retry.length, 1);
  assert.equal(events.retry[0].errorCode, 'worker_shutdown');
});

test('shutdown abort grace waits for persistence but remains bounded if transport ignores abort', async () => {
  const { store } = fixture([job()]);
  let started = false, release;
  const worker = makeWorker(store, { async send() { started = true; return new Promise(resolve => { release = resolve; }); } }, { concurrency: 1 });
  worker.start(); await until(() => started);
  const before = Date.now();
  const result = await worker.stop({ timeoutMs: 5, abortGraceMs: 10 });
  assert.equal(result.drained, false);
  assert.equal(result.settled, false);
  assert.equal(result.active, 1);
  assert.ok(Date.now() - before < 500);
  release({ id: 'accepted' });
  await worker.stop({ timeoutMs: 200 });
});

test('stopped workers cannot restart with an already-aborted wait controller', async () => {
  const { store } = fixture([]);
  const worker = makeWorker(store, { async send() { return { id: 'unused' }; } });
  await worker.stop();
  assert.throws(() => worker.start(), /new worker/);
});

test('retry jitter remains bounded and never shortens provider Retry-After', () => {
  assert.equal(retryDelay(1, { baseMs: 1000, random: () => 0.5 }), 1000);
  assert.equal(retryDelay(20, { baseMs: 1000, capMs: 2000, random: () => 0.5 }), 2000);
  assert.equal(retryDelay(20, { baseMs: 1000, capMs: 2000, random: () => 1 }), 2000);
  assert.equal(retryDelay(1, { baseMs: 1000, retryAfterMs: 60_000, random: () => 0.5 }), 60_000);
});
