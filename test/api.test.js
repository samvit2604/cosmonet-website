import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { readConfig } from '../server/config.js';

const secret = 'local-test-hash-secret-with-at-least-32-characters';
const apiKey = 're_test_key_1234567890';
const silent = () => {};
const cleanupByTest = new WeakMap();

function validLead(overrides = {}) {
  return {
    name: 'Synthetic API Audit', company: 'Example Company', email: 'visitor@example.com',
    service: 'Software development', interest: 'Startup', message: 'A synthetic API integration enquiry for local tests only.',
    consent: 'on', website: '', request_id: randomUUID(), turnstile_token: 'synthetic-captcha-token',
    campaign: { utm_source: 'local-api-tests' }, ...overrides,
  };
}

async function fixture(t, options = {}) {
  const directory = options.directory || await mkdtemp(path.join(os.tmpdir(), 'cosmonet-api-'));
  const filename = path.join(directory, 'enquiries.sqlite');
  const config = { ...readConfig({
    NODE_ENV: 'test', SITE_URL: 'http://127.0.0.1:3000', DATA_DIR: directory,
    RESEND_API_KEY: apiKey, RESEND_FROM: 'Cosmonet <enquiries@example.com>', HASH_SECRET: secret,
    TURNSTILE_REQUIRED: 'false', IP_RATE_LIMIT: '10000', EMAIL_RATE_LIMIT: '10000',
    GLOBAL_RATE_LIMIT: '10000', MAX_PENDING_REQUESTS: '1000', MAX_QUEUED_EMAILS: '10000',
    ...options.env,
  }), ...options.config };
  let store, app, server;
  try {
    store = createStore({ filename, config, ...(options.now ? { now: options.now } : {}) });
    app = createApp({ config, store, verifyCaptcha: options.verifyCaptcha || (async () => ({ ok: true })), logger: silent });
    server = http.createServer(app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (error) {
    server?.closeAllConnections?.(); store?.close();
    if (!options.directory) await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    store.close();
  };
  let cleanup = cleanupByTest.get(t);
  if (!cleanup) {
    cleanup = { close: [], directories: new Set() }; cleanupByTest.set(t, cleanup);
    t.after(async () => {
      const failures = [];
      for (const shutdown of [...cleanup.close].reverse()) try { await shutdown(); } catch (error) { failures.push(error); }
      for (const owned of cleanup.directories) try { await rm(owned, { recursive: true, force: true }); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'API fixture cleanup failed');
    });
  }
  cleanup.close.push(close); if (!options.directory) cleanup.directories.add(directory);
  const request = async (pathname, { body, headers = {}, method = body === undefined ? 'GET' : 'POST', raw = false } = {}) => {
    const response = await fetch(baseURL + pathname, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: config.siteOrigin }), ...headers }, ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, headers: response.headers, data, text };
  };
  return { directory, filename, config, store, app, server, baseURL, close, request, post: (body, options = {}) => request('/api/leads', { body, ...options }) };
}

function counts(store) {
  const stats = store.stats();
  return { leads: stats.leads, jobs: Object.values(stats.jobs).reduce((sum, value) => sum + value, 0) };
}

test('public form configuration exposes capability settings and no secrets', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/form-config');
  assert.equal(response.status, 200);
  assert.equal(response.data.available, true);
  assert.equal(response.data.turnstileRequired, false);
  assert.ok(response.data.submissionTimeoutMs > 0);
  assert.doesNotMatch(response.text, new RegExp(apiKey + '|' + secret));
  for (const key of ['resendApiKey', 'turnstileSecretKey', 'hashSecret', 'dataDir', 'dbPath']) assert.equal(response.data[key], undefined);
});

test('valid enquiry commits one lead and two immutable email snapshots', async t => {
  const f = await fixture(t);
  const body = validLead({ name: '<b>API Audit</b>', message: 'Untrusted URL https://invalid.example/ must not be echoed to the public acknowledgement.' });
  const response = await f.post(body);
  assert.equal(response.status, 201);
  assert.equal(response.data.ok, true); assert.equal(response.data.queued, true); assert.ok(response.data.reference);
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
  const jobs = f.store.db.prepare('SELECT kind,payload FROM email_jobs ORDER BY kind').all().map(row => ({ kind: row.kind, payload: JSON.parse(row.payload) }));
  assert.deepEqual(jobs.map(row => row.kind), ['ack', 'team']);
  const ack = jobs.find(row => row.kind === 'ack').payload;
  const team = jobs.find(row => row.kind === 'team').payload;
  assert.deepEqual(team.to, ['hello@cosmonet.ai']); assert.equal(team.reply_to, body.email);
  assert.deepEqual(ack.to, [body.email]); assert.equal(ack.reply_to, 'hello@cosmonet.ai');
  assert.match(team.html, /&lt;b&gt;API Audit&lt;\/b&gt;/); assert.doesNotMatch(ack.html, /https:\/\/invalid\.example/);
  assert.equal(f.store.db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(f.store.db.pragma('synchronous', { simple: true }), 2);
  assert.equal((await stat(f.filename)).mode & 0o777, 0o600);
});

test('100 simultaneous identical requests create one lead and one pair of jobs', async t => {
  let verifications = 0;
  const f = await fixture(t, { config: { turnstileRequired: true, turnstileSiteKey: 'synthetic-site-key', turnstileSecretKey: 'synthetic-secret', formsAvailable: true }, verifyCaptcha: async () => { verifications++; await new Promise(resolve => setTimeout(resolve, 15)); return { ok: true }; } });
  const body = validLead();
  const responses = await Promise.all(Array.from({ length: 100 }, () => f.post(body)));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 200).length, 99);
  assert.equal(new Set(responses.map(response => response.data.reference)).size, 1);
  assert.equal(verifications, 1);
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('100 concurrent unique enquiries preserve every accepted lead and both jobs', async t => {
  const f = await fixture(t);
  const bodies = Array.from({ length: 100 }, (_, index) => validLead({ email: `visitor${index}@example.com` }));
  const responses = await Promise.all(bodies.map(body => f.post(body)));
  assert.ok(responses.every(response => response.status === 201), JSON.stringify(responses.filter(response => response.status !== 201)));
  assert.equal(new Set(responses.map(response => response.data.reference)).size, 100);
  assert.deepEqual(counts(f.store), { leads: 100, jobs: 200 });
});

test('concurrent conflicting payloads for one request ID have only one winner', async t => {
  const f = await fixture(t);
  const request_id = randomUUID();
  const responses = await Promise.all(Array.from({ length: 40 }, (_, index) => f.post(validLead({ request_id, name: index % 2 ? 'Payload A' : 'Payload B' }))));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.ok(responses.some(response => response.status === 409));
  assert.ok(responses.every(response => [200, 201, 409].includes(response.status)));
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('accepted requests survive close/reopen and retry without a fresh captcha', async t => {
  const f = await fixture(t, { config: { turnstileRequired: true, formsAvailable: true }, verifyCaptcha: async () => ({ ok: true }) });
  const body = validLead();
  const first = await f.post(body); assert.equal(first.status, 201); await f.close();
  let verificationCalls = 0;
  const reopened = await fixture(t, { directory: f.directory, config: { turnstileRequired: true, formsAvailable: true }, verifyCaptcha: async () => { verificationCalls++; return { ok: false }; } });
  const repeat = await reopened.post({ ...body, turnstile_token: 'expired-or-consumed-token' });
  assert.equal(repeat.status, 200); assert.equal(repeat.data.reference, first.data.reference);
  assert.equal(verificationCalls, 0); assert.deepEqual(counts(reopened.store), { leads: 1, jobs: 2 });
  await reopened.close();
});

test('disconnecting before the response does not lose a committed enquiry or duplicate its retry', async t => {
  let announce, release, verifications = 0;
  const started = new Promise(resolve => { announce = resolve; });
  const verification = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { config: { turnstileRequired: true, formsAvailable: true }, verifyCaptcha: async () => { verifications++; announce(); return verification; } });
  const body = validLead(), serialized = JSON.stringify(body);
  const request = http.request(f.baseURL + '/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: f.config.siteOrigin, 'Content-Length': Buffer.byteLength(serialized) } });
  request.on('error', () => {}); request.end(serialized); await started; request.destroy(); release({ ok: true });
  const deadline = Date.now() + 1000;
  while (!f.store.stats().leads && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
  const reference = f.store.db.prepare('SELECT reference FROM leads WHERE request_id=?').get(body.request_id).reference;
  const repeated = await f.post({ ...body, turnstile_token: 'already-consumed-token' });
  assert.equal(repeated.status, 200); assert.equal(repeated.data.reference, reference); assert.equal(verifications, 1);
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('changed payload with an existing request ID is rejected with 409', async t => {
  const f = await fixture(t); const body = validLead(); assert.equal((await f.post(body)).status, 201);
  const conflict = await f.post({ ...body, message: 'Different details must not silently overwrite the original enquiry.' });
  assert.equal(conflict.status, 409); assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('server rejects malformed email, missing fields, header controls and unexpected routing fields', async t => {
  const f = await fixture(t);
  const invalid = [
    { email: 'visitor@gmail.com1' }, { email: 'visitor@company' }, { email: 'visitor@@example.com' },
    { name: '' }, { company: '' }, { message: 'too short' }, { consent: false },
    { service: 'Unlisted service' }, { interest: 'Unlisted stage' }, { request_id: 'not-a-uuid' },
    { email: 'visitor@example.com\r\nBcc:attacker@example.com' }, { name: 'API\nBcc: injected' },
    { to: 'attacker@example.com' }, { access_key: 'old-provider-key' }, { website: 'spam.example' },
    { campaign: [] }, { campaign: { utm_source: 'x'.repeat(201) } }, { turnstile_token: 'x'.repeat(2049) },
  ];
  for (const overrides of invalid) {
    const response = await f.post(validLead(overrides));
    assert.equal(response.status, 400, JSON.stringify(overrides)); assert.ok(response.data?.error);
  }
  assert.deepEqual(counts(f.store), { leads: 0, jobs: 0 });
});

test('malformed JSON, excessive body size and unsupported body types fail safely', async t => {
  const f = await fixture(t);
  const malformed = await f.post('{"name":', { raw: true }); assert.equal(malformed.status, 400); assert.ok(malformed.data?.error);
  const excessive = await f.post(validLead({ message: 'x'.repeat(20000) })); assert.equal(excessive.status, 413); assert.ok(excessive.data?.error);
  const unsupported = await f.post('name=test', { raw: true, headers: { 'Content-Type': 'text/plain' } }); assert.ok([400, 415].includes(unsupported.status));
  const array = await f.post([]); assert.equal(array.status, 400);
  assert.deepEqual(counts(f.store), { leads: 0, jobs: 0 });
});

test('missing, null and foreign origins cannot submit', async t => {
  const f = await fixture(t);
  for (const origin of ['', 'null', 'https://evil.example', f.config.siteOrigin + '.evil.example']) {
    const response = await f.post(validLead(), { headers: { Origin: origin } }); assert.equal(response.status, 403, origin);
  }
  assert.deepEqual(counts(f.store), { leads: 0, jobs: 0 });
});

test('failed and unavailable captcha never create email jobs', async t => {
  let result = { ok: false };
  const f = await fixture(t, { config: { turnstileRequired: true, formsAvailable: true }, verifyCaptcha: async () => result });
  assert.equal((await f.post(validLead())).status, 403);
  result = { ok: false, unavailable: true }; assert.equal((await f.post(validLead())).status, 503);
  assert.deepEqual(counts(f.store), { leads: 0, jobs: 0 });
});

test('spoofed forwarding headers do not bypass the configured client IP policy', async t => {
  let seen;
  const f = await fixture(t, { config: { turnstileRequired: true, formsAvailable: true, trustProxy: 0 }, verifyCaptcha: async value => { seen = value; return { ok: true }; } });
  assert.equal((await f.post(validLead(), { headers: { 'X-Forwarded-For': '198.51.100.55' } })).status, 201);
  assert.match(seen.ip, /127\.0\.0\.1/); assert.notEqual(seen.ip, '198.51.100.55');
});

test('durable IP transport limits apply to every attempt, including accepted retries', async t => {
  const f = await fixture(t, { config: { ipRateLimit: 2, ipWindowMs: 600000 } });
  const first = validLead({ email: 'first@example.com' }); assert.equal((await f.post(first)).status, 201);
  assert.equal((await f.post(validLead({ email: 'second@example.com' }))).status, 201);
  const limited = await f.post(validLead({ email: 'third@example.com' })); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  await f.close();
  const reopened = await fixture(t, { directory: f.directory, config: { ipRateLimit: 2, ipWindowMs: 600000 } });
  assert.equal((await reopened.post(validLead({ email: 'fourth@example.com' }))).status, 429);
  assert.equal((await reopened.post(first)).status, 429); assert.deepEqual(counts(reopened.store), { leads: 2, jobs: 4 });
  await reopened.close();
});

test('recipient and global limits reject excess without partial writes', async t => {
  const recipient = await fixture(t, { config: { emailRateLimit: 2 } });
  assert.equal((await recipient.post(validLead())).status, 201); assert.equal((await recipient.post(validLead())).status, 201);
  assert.equal((await recipient.post(validLead())).status, 429); assert.deepEqual(counts(recipient.store), { leads: 2, jobs: 4 });
  const buckets = recipient.store.db.prepare('SELECT bucket FROM rate_limits').all(); assert.ok(buckets.every(row => !row.bucket.includes('@')));
  const global = await fixture(t, { config: { globalRateLimit: 2 } });
  for (let index = 0; index < 2; index++) assert.equal((await global.post(validLead({ email: `global${index}@example.com` }))).status, 201);
  assert.equal((await global.post(validLead({ email: 'global-excess@example.com' }))).status, 429);
  assert.deepEqual(counts(global.store), { leads: 2, jobs: 4 });
});

test('queue capacity rejects a new enquiry but keeps accepted requests retryable', async t => {
  const f = await fixture(t, { config: { maxQueuedEmails: 2 } }); const body = validLead();
  const first = await f.post(body); assert.equal(first.status, 201);
  assert.equal((await f.post(validLead({ email: 'other@example.com' }))).status, 503);
  assert.equal((await f.post(body)).status, 200); assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('an outbox insertion fault rolls back the lead and both jobs atomically', async t => {
  const f = await fixture(t);
  f.store.db.exec("CREATE TRIGGER fail_ack_for_test BEFORE INSERT ON email_jobs WHEN NEW.kind='ack' BEGIN SELECT RAISE(ABORT,'injected_sqlite_outbox_fault'); END;");
  const failed = await f.post(validLead()); assert.equal(failed.status, 503); assert.deepEqual(counts(f.store), { leads: 0, jobs: 0 });
  assert.doesNotMatch(failed.text, /injected_sqlite|SQLITE|sqlite|enquiries\.sqlite/);
  f.store.db.exec('DROP TRIGGER fail_ack_for_test'); assert.equal((await f.post(validLead())).status, 201);
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('a closed durable store returns a safe failure instead of acknowledging a lost enquiry', async t => {
  const f = await fixture(t); f.store.close();
  const response = await f.post(validLead()); assert.equal(response.status, 503); assert.ok(response.data?.error);
  assert.doesNotMatch(response.text, /not open|SQLITE|enquiries\.sqlite|re_test_key|HASH_SECRET/);
});

test('concurrency overload returns 503 and does not lose the in-flight accepted enquiry', async t => {
  let release; let announce;
  const started = new Promise(resolve => { announce = resolve; });
  const f = await fixture(t, { config: { maxPendingRequests: 1, turnstileRequired: true, formsAvailable: true }, verifyCaptcha: () => { announce(); return new Promise(resolve => { release = resolve; }); } });
  const first = f.post(validLead({ email: 'inflight@example.com' })); await started;
  const rejected = await f.post(validLead({ email: 'overload@example.com' }));
  release({ ok: true });
  assert.equal(rejected.status, 503); assert.equal((await first).status, 201); assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('shutdown rejects new requests without corrupting already committed data', async t => {
  const f = await fixture(t); const body = validLead(); assert.equal((await f.post(body)).status, 201);
  f.app.locals.beginShutdown();
  assert.equal((await f.post(validLead({ email: 'later@example.com' }))).status, 503);
  assert.deepEqual(counts(f.store), { leads: 1, jobs: 2 });
});

test('production settings fail closed for missing secrets, ephemeral paths and unsafe origins', () => {
  const production = { NODE_ENV: 'production', SITE_URL: 'https://cosmonet.ai', DATA_DIR: '/var/data', RESEND_API_KEY: 're_synthetic_key_123456', RESEND_FROM: 'Cosmonet <enquiries@cosmonet.ai>', HASH_SECRET: secret, OPS_TOKEN: 'synthetic-production-ops-token-32-characters', TURNSTILE_SITE_KEY: '0x4AAAAAAAAAAAAAAAAAAA', TURNSTILE_SECRET_KEY: 'synthetic-server-only-secret' };
  assert.equal(readConfig(production).turnstileRequired, true);
  for (const key of ['RESEND_API_KEY', 'RESEND_FROM', 'HASH_SECRET', 'OPS_TOKEN', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'DATA_DIR']) assert.throws(() => readConfig({ ...production, [key]: '' }), key);
  assert.throws(() => readConfig({ ...production, SITE_URL: 'http://cosmonet.ai' }));
  assert.throws(() => readConfig({ ...production, DATA_DIR: './ephemeral' }));
  assert.equal(readConfig({ ...production, TURNSTILE_REQUIRED: 'false' }).turnstileRequired, true);
});

test('health and authenticated operations endpoints avoid exposing lead data or secrets', async t => {
  const opsToken = 'synthetic-operations-token-at-least-32-characters';
  const f = await fixture(t, { config: { opsToken } });
  assert.equal((await f.request('/healthz')).status, 200); assert.equal((await f.request('/readyz')).status, 200);
  assert.equal((await f.post(validLead())).status, 201);
  assert.equal((await f.request('/api/ops/status')).status, 401);
  const authenticated = await f.request('/api/ops/status', { headers: { Authorization: 'Bearer ' + opsToken } });
  assert.equal(authenticated.status, 200); assert.equal(authenticated.data.leads, 1);
  assert.doesNotMatch(authenticated.text, /visitor@example\.com|Synthetic API Audit|re_test_key|local-test-hash/);
  f.app.locals.beginShutdown();
  assert.equal((await f.request('/healthz')).status, 503); assert.equal((await f.request('/readyz')).status, 503);
  assert.equal((await f.request('/api/form-config')).data.available, false);
});

test('signed Resend events authenticate, deduplicate and cannot regress delivery status', async t => {
  const webhookSecret = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
  const signer = new Webhook(webhookSecret);
  const f = await fixture(t, { config: { webhookSecret } });
  assert.equal((await f.post(validLead())).status, 201);
  const job = f.store.claimJob({ leaseMs: 60000 }); const providerId = randomUUID();
  assert.equal(f.store.markSent(job, { providerId }), true);
  const send = async (type, { id = 'msg_' + randomUUID().replaceAll('-', ''), timestamp = new Date(), invalid = false } = {}) => {
    const body = JSON.stringify({ type, created_at: timestamp.toISOString(), data: { email_id: providerId } });
    const signature = signer.sign(id, timestamp, body);
    return f.request('/api/resend/webhook', { method: 'POST', raw: true, body, headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)), 'svix-signature': invalid ? 'v1,invalid' : signature } });
  };
  const firstID = 'msg_' + randomUUID().replaceAll('-', '');
  assert.equal((await send('email.delivered', { id: firstID })).status, 200);
  assert.equal((await send('email.delivered', { id: firstID })).status, 200);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM delivery_events').get().n, 1);
  assert.equal((await send('email.sent')).status, 200);
  assert.equal(f.store.db.prepare('SELECT delivery_state FROM email_jobs WHERE id=?').get(job.id).delivery_state, 'delivered');
  assert.equal((await send('email.bounced')).status, 200);
  assert.equal((await send('email.delivered')).status, 200);
  assert.equal(f.store.db.prepare('SELECT delivery_state FROM email_jobs WHERE id=?').get(job.id).delivery_state, 'bounced');
  assert.equal((await send('email.delivered', { invalid: true })).status, 400);
  assert.equal((await send('email.delivered', { timestamp: new Date(Date.now() - 10 * 60 * 1000) })).status, 400);
  const before = f.store.db.prepare('SELECT count(*) AS n FROM delivery_events').get().n;
  assert.equal((await send('unsupported.event')).data.ignored, true);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM delivery_events').get().n, before);
});

test('a verified webhook arriving before the send result is retained and reconciled', async t => {
  const webhookSecret = 'whsec_' + Buffer.alloc(32, 8).toString('base64');
  const signer = new Webhook(webhookSecret); const f = await fixture(t, { config: { webhookSecret } });
  assert.equal((await f.post(validLead())).status, 201);
  const job = f.store.claimJob({ leaseMs: 60000 }); const providerId = randomUUID();
  const id = 'msg_' + randomUUID().replaceAll('-', ''), timestamp = new Date();
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: providerId } });
  const response = await f.request('/api/resend/webhook', { method: 'POST', raw: true, body, headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)), 'svix-signature': signer.sign(id, timestamp, body) } });
  assert.equal(response.status, 200); assert.equal(f.store.markSent(job, { providerId }), true);
  assert.equal(f.store.db.prepare('SELECT delivery_state FROM email_jobs WHERE id=?').get(job.id).delivery_state, 'delivered');
});
