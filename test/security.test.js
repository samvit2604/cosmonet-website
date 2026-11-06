import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../server/config.js';
import { createCaptchaVerifier } from '../server/captcha.js';
import { assertRenderDisk } from '../server/runtime.js';
import { createLogger } from '../server/logger.js';

const base = () => readConfig({ NODE_ENV: 'test', SITE_URL: 'http://localhost:3000' });
const captchaConfig = () => ({ ...base(), turnstileRequired: true, turnstileSecretKey: 'test-secret-never-log', allowedHosts: new Set(['cosmonet.example']), captchaTimeoutMs: 15 });
const response = value => new Response(JSON.stringify(value), { status: 200 });

test('CAPTCHA accepts only the expected hostname and action', async () => {
  for (const [hostname, action, expected] of [['cosmonet.example', 'contact', true], ['other.example', 'contact', false], ['cosmonet.example', 'login', false]]) {
    const verify = createCaptchaVerifier(captchaConfig(), { fetchImpl: async () => response({ success: true, hostname, action }) });
    assert.equal((await verify({ token: 'token', ip: '127.0.0.1', requestId: randomUUID() })).ok, expected);
  }
});

test('new verification tokens do not reuse a lead ID as the CAPTCHA idempotency key', async () => {
  const bodies = [], requestId = randomUUID();
  const verify = createCaptchaVerifier(captchaConfig(), { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    bodies.push(JSON.parse(options.body));
    return response({ success: true, hostname: 'cosmonet.example', action: 'contact' });
  } });
  await verify({ token: 'first', ip: '127.0.0.1', requestId });
  await verify({ token: 'second', ip: '127.0.0.1', requestId });
  assert.deepEqual(bodies.map(body => body.response), ['first', 'second']);
  assert.ok(bodies.every(body => body.idempotency_key === undefined));
});

test('CAPTCHA provider/config errors are unavailable, not incorrect visitor challenges', async () => {
  for (const code of ['internal-error', 'invalid-input-secret', 'missing-input-secret']) {
    const verify = createCaptchaVerifier(captchaConfig(), { fetchImpl: async () => response({ success: false, 'error-codes': [code] }) });
    assert.deepEqual(await verify({ token: 'token' }), { ok: false, unavailable: true });
  }
  const wrongToken = createCaptchaVerifier(captchaConfig(), { fetchImpl: async () => response({ success: false, 'error-codes': ['invalid-input-response'] }) });
  assert.deepEqual(await wrongToken({ token: 'bad-token' }), { ok: false });
});

test('CAPTCHA network timeouts and malformed or oversized responses are safe', async () => {
  const stalled = createCaptchaVerifier(captchaConfig(), { fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('private network details')), { once: true });
  }) });
  assert.deepEqual(await stalled({ token: 'token' }), { ok: false, unavailable: true });
  const malformed = createCaptchaVerifier(captchaConfig(), { fetchImpl: async () => new Response('<html>proxy problem</html>') });
  assert.deepEqual(await malformed({ token: 'token' }), { ok: false, unavailable: true });
  const huge = createCaptchaVerifier(captchaConfig(), { fetchImpl: async () => new Response('x'.repeat(17000)) });
  assert.deepEqual(await huge({ token: 'token' }), { ok: false, unavailable: true });
});

test('Render startup requires the declared persistent mount and rejects volatile filesystems', () => {
  const config = { production: true, dataDir: '/var/data/enquiries' }, env = { RENDER: 'true' };
  assert.doesNotThrow(() => assertRenderDisk(config, env, '30 20 8:1 / /var/data rw - ext4 /dev/disk rw'));
  for (const filesystem of ['tmpfs', 'ramfs', 'overlay']) assert.throws(() => assertRenderDisk(config, env, `30 20 8:1 / /var/data rw - ${filesystem} none rw`));
  assert.throws(() => assertRenderDisk(config, env, '30 20 8:1 / / rw - ext4 /dev/disk rw'));
  assert.throws(() => assertRenderDisk({ ...config, dataDir: '/tmp/data' }, env, '30 20 8:1 / /var/data rw - ext4 /dev/disk rw'));
});

test('private storage cannot be configured under public dist', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'test', DATA_DIR: './dist/data' }), /outside public/);
});

test('operational logs discard secrets, personal information, and raw exception details', () => {
  let text = '';
  const log = createLogger({ write: value => { text += value; } });
  log('test_event', { jobId: randomUUID(), code: 'provider_timeout', email: 'private@example.com', message: 'private message', authorization: 'Bearer private-secret' });
  assert.match(text, /provider_timeout/);
  assert.doesNotMatch(text, /private@example|private message|private-secret/);
});
