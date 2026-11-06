import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail, createEmailClient, EmailDeliveryError, parseRetryAfter } from '../server/email.js';

const providerId = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
const job = (kind = 'team') => ({ id: 'job-1', leadId: '6d9b00d9-1b0a-4e44-a9ce-620845411b8a', kind, payload: { reference: 'COS-20261105-ABC123', name: 'Sam <script>', company: 'Research & Co', email: 'sam+tag@example.com', service: 'AI services', interest: 'Startup', message: '<img src=x onerror=alert(1)>\nNext line', campaign: { utm_source: '<partner>' } } });
const options = { apiKey: 're_test_secret', from: 'Cosmonet <enquiries@notify.cosmonet.ai>', teamEmail: 'hello@cosmonet.ai' };
const response = (status, data, headers = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('team notification escapes user content and sets the correct reply route', () => {
  const mail = buildEmail(job(), options);
  assert.deepEqual(mail.to, ['hello@cosmonet.ai']);
  assert.equal(mail.reply_to, 'sam+tag@example.com');
  assert.equal(mail.from, options.from);
  assert.match(mail.html, /Sam &lt;script&gt;/);
  assert.match(mail.html, /Research &amp; Co/);
  assert.match(mail.html, /&lt;img src=x onerror=alert\(1\)&gt;<br>Next line/);
  assert.doesNotMatch(mail.html, /<script>|<img src=x/);
  assert.match(mail.text, /Reference: COS-20261105-ABC123/);
  assert.match(mail.text, /Next line/);
});

test('acknowledgement confirms receipt without reflecting any visitor-supplied text', () => {
  const input = job('ack');
  input.payload.name = 'https://visitor-name.example/unwanted';
  input.payload.company = 'https://visitor-company.example/unwanted';
  input.payload.service = 'https://visitor-service.example/unwanted';
  input.payload.interest = 'https://visitor-interest.example/unwanted';
  const mail = buildEmail(input, options);
  assert.deepEqual(mail.to, ['sam+tag@example.com']);
  assert.equal(mail.reply_to, 'hello@cosmonet.ai');
  assert.doesNotMatch(mail.html, /onerror|utm_source|<partner>/);
  assert.doesNotMatch(mail.text, /onerror|utm_source|<partner>/);
  for (const body of [mail.subject, mail.html, mail.text]) {
    assert.doesNotMatch(body, /visitor-|sam\+tag@example\.com/);
  }
  assert.match(mail.html, /<p>Hello,<\/p>/);
  assert.match(mail.text, /^Hello,/);
  assert.match(mail.text, /COS-20261105-ABC123/);
  assert.match(mail.text, /We have received your enquiry/);
  assert.doesNotMatch(mail.text, /delivered to|inbox/);
  assert.equal(mail.headers['Auto-Submitted'], 'auto-generated');
});

test('rejects invalid job kinds and header injection', () => {
  assert.throws(() => buildEmail(job('unknown'), options), { code: 'invalid_email_job' });
  const invalid = job(); invalid.payload.email = 'sam@example.com\r\nBcc: recipient@example.com';
  assert.throws(() => buildEmail(invalid, options), EmailDeliveryError);
  assert.throws(() => buildEmail(job(), { ...options, from: 'x\nInjected' }), EmailDeliveryError);
});

test('uses fixed endpoint, persisted email body, stable idempotency key and safe headers', async () => {
  const input = job(); input.emailPayload = buildEmail(input, options);
  input.payload.name = 'Changed after enqueue';
  const requests = [];
  const client = createEmailClient({ ...options, from: 'Changed <new@notify.cosmonet.ai>', fetchImpl: async (url, init) => { requests.push({ url, init }); return response(200, { id: providerId }); } });
  assert.deepEqual(await client.send(input), { id: providerId });
  await client.send(input);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].init.redirect, 'error');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer re_test_secret');
  assert.equal(requests[0].init.headers['Idempotency-Key'], `lead/${input.leadId}/team`);
  assert.equal(requests[0].init.body, requests[1].init.body);
  assert.doesNotMatch(requests[0].init.body, /Changed after enqueue|new@notify/);
});

test('interprets Retry-After seconds and HTTP dates', () => {
  assert.equal(parseRetryAfter('1.5', 0), 1500);
  assert.equal(parseRetryAfter('Thu, 05 Nov 2026 00:00:03 GMT', Date.UTC(2026, 10, 5)), 3000);
  assert.equal(parseRetryAfter('Thu, 05 Nov 2026 00:00:03 GMT', Date.UTC(2026, 10, 6)), 0);
  assert.equal(parseRetryAfter('bad', 0), null);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('99999999999999999999999', 0), null);
});

test('classifies provider errors without leaking private provider messages', async () => {
  for (const [status, name, retryable] of [[400, 'validation_error', false], [401, 'invalid_api_key', false], [403, 'validation_error', false], [408, 'timeout', true], [409, 'concurrent_idempotent_requests', true], [409, 'resource_locked', true], [409, 'invalid_idempotent_request', false], [429, 'rate_limit_exceeded', true], [503, 'service_unavailable', true]]) {
    const client = createEmailClient({ ...options, fetchImpl: async () => response(status, { name, message: 'private response includes sam@example.com and re_test_secret' }, { 'Retry-After': '3' }) });
    await assert.rejects(client.send(job()), error => error instanceof EmailDeliveryError && error.status === status && error.retryable === retryable && error.retryAfterMs === 3000 && !error.message.includes('sam@') && !error.message.includes('re_test'));
  }
});

test('quota errors wait for the UTC reset when Retry-After is absent', async () => {
  const now = Date.UTC(2026, 10, 5, 23, 59);
  const daily = createEmailClient({ ...options, now: () => now, fetchImpl: async () => response(429, { name: 'daily_quota_exceeded' }) });
  await assert.rejects(daily.send(job()), error => error.code === 'daily_quota_exceeded' && error.retryAfterMs === 61_000);
  const monthly = createEmailClient({ ...options, now: () => now, fetchImpl: async () => response(429, { name: 'monthly_quota_exceeded' }) });
  await assert.rejects(monthly.send(job()), error => error.code === 'monthly_quota_exceeded' && error.retryAfterMs > 23 * 60 * 60 * 1000);
});

test('treats malformed successful responses as ambiguous and retryable', async () => {
  for (const data of ['<html>proxy error</html>', {}, { id: 'bad-id' }]) {
    const client = createEmailClient({ ...options, fetchImpl: async () => response(200, data) });
    await assert.rejects(client.send(job()), { code: 'provider_invalid_response', retryable: true });
  }
});

test('bounds provider response size', async () => {
  const client = createEmailClient({ ...options, fetchImpl: async () => response(200, 'a'.repeat(20_000)) });
  await assert.rejects(client.send(job()), { code: 'provider_invalid_response', retryable: true });
});

test('aborts a stalled provider call and redacts network errors', async () => {
  const client = createEmailClient({ ...options, timeoutMs: 10, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  await assert.rejects(client.send(job()), { code: 'provider_timeout', retryable: true });
  const failing = createEmailClient({ ...options, fetchImpl: async () => { throw new Error('leaked re_test_secret'); } });
  await assert.rejects(failing.send(job()), error => error.code === 'provider_network_error' && !error.message.includes('secret'));
});

test('honors an in-flight worker shutdown abort', async () => {
  const controller = new AbortController();
  const client = createEmailClient({ ...options, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  const promise = client.send(job(), { signal: controller.signal }); controller.abort();
  await assert.rejects(promise, { code: 'worker_shutdown', retryable: true });
});

test('timeout also covers a response body that stalls after HTTP headers', async () => {
  const client = createEmailClient({ ...options, timeoutMs: 10, fetchImpl: async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"id":'));
      init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true });
    },
  }), { status: 200 }) });
  await assert.rejects(client.send(job()), { code: 'provider_timeout', retryable: true });
});

test('an already-aborted shutdown signal never starts a provider request', async () => {
  let requests = 0;
  const controller = new AbortController(); controller.abort();
  const client = createEmailClient({ ...options, fetchImpl: async () => { requests++; return response(200, { id: providerId }); } });
  await assert.rejects(client.send(job(), { signal: controller.signal }), { code: 'worker_shutdown', retryable: true });
  assert.equal(requests, 0);
});
