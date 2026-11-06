/* Browser checks use synthetic data and mock the same-origin enquiry API and Turnstile. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.FORM_TEST_OUTPUT || path.join(root, 'test-results', 'form-browser.json'));
const defaultConfig = { available: true, turnstileRequired: true, turnstileSiteKey: 'test-site-key', submissionTimeoutMs: 15000 };
const results = [];
let browser;
let server;
let baseURL;

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '@playwright/test', '/private/tmp/dmin-i18n-browser/node_modules/playwright'].filter(Boolean);
  for (const candidate of candidates) {
    try { const module = require(candidate); if (module.chromium) return module; } catch (error) { if (candidate === process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('Playwright is required. Install it as a development dependency or set PLAYWRIGHT_MODULE to its installed module path.');
}

async function startServer() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filename = path.resolve(root, '.' + pathname);
      if (filename !== root && !filename.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
      if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(await fs.readFile(filename));
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseURL = 'http://127.0.0.1:' + server.address().port;
}

const turnstileFixture = String.raw`
(() => {
  let sequence = 0;
  let options;
  let current;
  const state = window.__captchaTest = { renders: [], resets: 0, removed: 0, issued: [], auto: true };
  function solve() {
    if (!options) return;
    const token = 'synthetic-captcha-token-' + (++sequence);
    state.issued.push(token);
    options.callback(token);
  }
  state.solve = solve;
  state.expire = () => options && options['expired-callback']();
  state.fail = () => options && options['error-callback']('test-error');
  window.turnstile = {
    ready(callback) { callback(); },
    render(container, configuration) {
      options = configuration;
      current = 'synthetic-widget-' + (++sequence);
      state.renders.push({ container: typeof container === 'string' ? container : container.id, action: options.action, sitekey: options.sitekey, responseField: options['response-field'] });
      if (state.auto) queueMicrotask(solve);
      return current;
    },
    reset() { state.resets++; if (state.auto) queueMicrotask(solve); },
    remove() { state.removed++; options = null; },
    getResponse() { return state.issued.at(-1) || ''; },
    isExpired() { return false; }
  };
})();`;

async function harness(options = {}) {
  const context = options.context || await browser.newContext({ viewport: options.viewport || { width: 1365, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const state = { config: { ...defaultConfig, ...options.config }, scriptMode: options.scriptMode || 'normal', provider: options.provider || {}, configResponse: options.configResponse || {}, configRequests: 0, references: new Map(), requests: [], scripts: [], unexpectedExternal: [], pageErrors: [] };
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (url.origin === baseURL && url.pathname === '/api/form-config') {
        state.configRequests++;
        const behavior = state.configResponse;
        if (behavior.delay) await new Promise(resolve => setTimeout(resolve, behavior.delay));
        if (behavior.networkError) await route.abort('failed');
        else await route.fulfill({ status: behavior.status || 200, contentType: 'application/json', body: behavior.body ?? JSON.stringify(state.config) });
        return;
      }
      if (url.origin === baseURL && url.pathname === '/api/leads') {
        let payload;
        try { payload = request.postDataJSON(); } catch { payload = request.postData(); }
        state.requests.push({ method: request.method(), payload });
        if (!state.references.has(payload.request_id)) state.references.set(payload.request_id, 'COS-TEST-' + state.requests.length);
        const reference = state.references.get(payload.request_id);
        const behavior = state.provider;
        if (behavior.delay) await new Promise(resolve => setTimeout(resolve, behavior.delay));
        if (behavior.networkError) await route.abort('failed');
        else await route.fulfill({ status: behavior.status || 201, contentType: behavior.contentType || 'application/json', headers: behavior.headers || {}, body: behavior.body ?? JSON.stringify({ ok: true, reference, queued: true }) });
        return;
      }
      if (url.origin === baseURL) { await route.continue(); return; }
      if (url.hostname === 'challenges.cloudflare.com' && url.pathname === '/turnstile/v0/api.js') {
        state.scripts.push(request.url());
        if (state.scriptMode === 'fail') await route.abort('failed');
        else await route.fulfill({ contentType: 'application/javascript', body: state.scriptMode === 'missing-api' ? 'window.__captchaScriptWithoutAPI=true;' : turnstileFixture });
        return;
      }
      state.unexpectedExternal.push(request.url());
      await route.abort('blockedbyclient');
    } catch (error) {
      if (!context.pages().length || /closed|disposed|already handled/i.test(error.message)) return;
      throw error;
    }
  });
  page.on('pageerror', error => state.pageErrors.push(error.message));
  try { await page.goto(baseURL + (options.route || '/contact/'), { waitUntil: 'domcontentloaded' }); }
  catch (error) { if (options.context) await page.close(); else await context.close(); throw error; }
  return { context, page, state, close: () => options.context ? page.close() : context.close() };
}

async function fillForm(page, email = 'visitor+audit@example.com') {
  await page.locator('#name').fill('Synthetic Browser Audit');
  await page.locator('#company').fill('Example Company');
  await page.locator('#email').fill(email);
  await page.locator('#service').selectOption({ label: 'Software development' });
  await page.locator('#stage').selectOption({ label: 'Startup' });
  await page.locator('#message').fill('A synthetic enquiry for local testing; no external email should be sent.');
  await page.locator('input[name=consent]').check();
}

async function ready(page) {
  await page.waitForFunction(() => window.__captchaTest?.issued.length > 0 && !document.querySelector('button[type=submit]')?.disabled);
  await page.locator('button[type=submit]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('button[type=submit]').isEnabled(), true);
}

async function expectError(page) {
  await page.waitForFunction(() => document.querySelector('#form-status')?.textContent.trim().length > 0);
  assert.equal(await page.locator('#form-success').isVisible(), false);
  assert.equal(await page.locator('#contact-form').isVisible(), true);
  assert.equal(await page.locator('#name').inputValue(), 'Synthetic Browser Audit');
  assert.equal(await page.locator('#email').inputValue(), 'visitor+audit@example.com');
  assert.match(await page.locator('#message').inputValue(), /synthetic enquiry/);
  assert.equal(await page.locator('#name').isEnabled(), true);
}

async function check(name, run) {
  const started = performance.now();
  try { const details = await run(); results.push({ name, passed: true, durationMs: Math.round(performance.now() - started), ...(details ? { details } : {}) }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, passed: false, durationMs: Math.round(performance.now() - started), error: error.stack || String(error) }); console.error('FAIL ' + name + ': ' + error.message); }
}

async function withForm(options, callback) {
  const h = await harness(options);
  try { const result = await callback(h); assert.deepEqual(h.state.unexpectedExternal, []); assert.deepEqual(h.state.pageErrors, []); return result; }
  finally { await h.close(); }
}

async function functionalTests() {
  await check('Unavailable or incomplete public config disables sending without provider traffic', async () => {
    for (const config of [{ available: false }, { available: true, turnstileSiteKey: '' }]) await withForm({ config }, async ({ page, state }) => {
      await page.waitForFunction(() => document.querySelector('#form-status')?.textContent.includes('hello@cosmonet.ai'));
      assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
      assert.equal(state.requests.length, 0); assert.equal(state.scripts.length, 0);
    });
  });
  await check('Configuration failure can be retried without losing inputs', () => withForm({ configResponse: { status: 503, body: JSON.stringify({ error: 'Unavailable' }) } }, async ({ page, state }) => {
    await fillForm(page); await page.locator('#form-retry').waitFor({ state: 'visible' });
    assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
    state.configResponse = {}; await page.locator('#form-retry').click(); await ready(page);
    assert.equal(await page.locator('#email').inputValue(), 'visitor+audit@example.com');
    assert.equal(state.configRequests, 2);
  }));
  await check('Explicitly optional local captcha does not load a third-party script', () => withForm({ config: { turnstileRequired: false, turnstileSiteKey: '' } }, async ({ page, state }) => {
    await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled);
    await fillForm(page); await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.scripts.length, 0); assert.equal(state.requests.length, 1);
  }));
  await check('Captcha initializes with contact action and no duplicate response field', () => withForm({}, async ({ page, state }) => {
    await ready(page);
    const render = await page.evaluate(() => window.__captchaTest.renders[0]);
    assert.equal(render.action, 'contact'); assert.equal(render.sitekey, defaultConfig.turnstileSiteKey); assert.equal(render.responseField, false);
    assert.equal(state.scripts.length, 1); assert.equal(state.requests.length, 0);
  }));
  await check('Required fields and malformed email prevent API submission', () => withForm({}, async ({ page, state }) => {
    await ready(page); await page.locator('button[type=submit]').click(); assert.equal(state.requests.length, 0);
    await fillForm(page, 'visitor@example.com1'); await page.locator('button[type=submit]').click();
    assert.equal(state.requests.length, 0); assert.equal(await page.locator('#email-error').isVisible(), true);
    assert.equal(await page.locator('#email').getAttribute('aria-invalid'), 'true');
    await page.locator('#email').fill('visitor+audit@sub.example.co.uk');
    assert.equal(await page.locator('#email-error').isVisible(), false);
  }));
  await check('Personal, business, alias and punycode addresses pass format checks', () => withForm({}, async ({ page }) => {
    const valid = ['person@gmail.com', 'person@outlook.com', 'PERSON@COMPANY.AI', 'person+tag@sub.company.co.uk', "o'connor@company.org", 'person@my-company.technology', 'person@example.xn--p1ai'];
    const invalid = ['person@gmail.com1', 'person@company.123', 'person@company', 'personcompany.com', 'person@@company.com', 'person@company..com', 'person@-company.com', 'person@my_company.com', '.person@company.com', 'first..last@company.com', 'person.@company.com', 'person name@company.com', ''];
    for (const [values, expected] of [[valid, true], [invalid, false]]) for (const value of values) { await page.locator('#email').fill(value); assert.equal(await page.locator('#email').evaluate(input => input.validity.valid), expected, value); }
    return { validCases: valid.length, invalidCases: invalid.length };
  }));
  await check('Success uses same-origin API, bounded allowlisted data and backend reference', () => withForm({ route: '/contact/?utm_source=browser-audit&email=ignored%40example.com&token=ignore&utm_campaign=' + 'x'.repeat(350) }, async ({ page, state }) => {
    await ready(page); await fillForm(page);
    await page.evaluate(() => { const input = document.createElement('input'); input.name = 'to'; input.value = 'attacker@example.com'; document.querySelector('#contact-form').append(input); });
    await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.length, 1); const { method, payload } = state.requests[0];
    assert.equal(method, 'POST'); assert.match(payload.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.match(payload.turnstile_token, /^synthetic-captcha-token-/);
    assert.equal(payload.name, 'Synthetic Browser Audit'); assert.equal(payload.email, 'visitor+audit@example.com'); assert.equal(payload.service, 'Software development');
    assert.equal(payload.website, ''); assert.equal(payload.campaign.utm_source, 'browser-audit'); assert.ok((payload.campaign.utm_campaign || '').length <= 200);
    for (const forbidden of ['to', 'token', 'access_key', 'subject', 'from_name', 'enquiry_reference', 'utm_source']) assert.equal(payload[forbidden], undefined, forbidden);
    assert.match(await page.locator('.reference').textContent(), /COS-TEST-1/);
    assert.equal(await page.locator('#form-success').evaluate(element => element === document.activeElement), true);
  }));
  await check('In-flight submission locks fields and ignores duplicate clicks', () => withForm({ provider: { delay: 250 } }, async ({ page, state }) => {
    await ready(page); await fillForm(page);
    await page.evaluate(() => { const form = document.querySelector('#contact-form'); form.requestSubmit(); form.requestSubmit(); });
    await page.waitForFunction(() => document.querySelector('button[type=submit]').disabled);
    assert.equal(await page.locator('#name').isDisabled(), true);
    await page.locator('#form-success').waitFor({ state: 'visible' }); assert.equal(state.requests.length, 1);
  }));
  await check('Start another enquiry clears data and creates a new request ID', () => withForm({}, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    await page.locator('#new-enquiry').click();
    assert.equal(await page.locator('#name').inputValue(), ''); assert.equal(await page.locator('#email').inputValue(), '');
    assert.equal(await page.locator('#email-error').isVisible(), false); assert.equal(await page.locator('#form-success').isVisible(), false);
    assert.equal(await page.locator('#name').evaluate(element => element === document.activeElement), true);
    await ready(page); assert.ok(await page.evaluate(() => window.__captchaTest.resets >= 1));
    await fillForm(page); await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.length, 2); assert.notEqual(state.requests[0].payload.request_id, state.requests[1].payload.request_id);
  }));
  await check('Captcha expiration blocks sending until a fresh solution arrives', () => withForm({}, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.evaluate(() => { window.__captchaTest.auto = false; window.__captchaTest.expire(); });
    assert.equal(await page.locator('button[type=submit]').isDisabled(), true); assert.ok((await page.locator('#verification-status').textContent()).trim());
    assert.equal(state.requests.length, 0); await page.evaluate(() => window.__captchaTest.solve()); await ready(page);
    await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' }); assert.equal(state.requests.length, 1);
  }));
  await check('Captcha widget errors expose a retry path', () => withForm({}, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.evaluate(() => { window.__captchaTest.auto = false; window.__captchaTest.fail(); });
    assert.equal(await page.locator('button[type=submit]').isDisabled(), true); await page.locator('#form-retry').waitFor({ state: 'visible' });
    await page.evaluate(() => { window.__captchaTest.auto = true; });
    await page.locator('#form-retry').click(); await ready(page); assert.equal(await page.locator('#name').inputValue(), 'Synthetic Browser Audit'); assert.equal(state.requests.length, 0);
  }));
  await check('Captcha script failure is recoverable without losing form data', () => withForm({ scriptMode: 'fail' }, async ({ page, state }) => {
    await fillForm(page); await page.locator('#form-retry').waitFor({ state: 'visible' }); assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
    assert.equal(state.requests.length, 0); state.scriptMode = 'normal'; await page.locator('#form-retry').click(); await ready(page);
    assert.equal(await page.locator('#email').inputValue(), 'visitor+audit@example.com');
  }));
  const failures = [
    ['HTTP 200 ok:false', { status: 200, body: JSON.stringify({ ok: false, error: 'Rejected synthetic request' }) }],
    ['HTTP 400', { status: 400, body: JSON.stringify({ error: 'Check your details' }) }],
    ['HTTP 403', { status: 403, body: JSON.stringify({ error: 'Rejected verification' }) }],
    ['HTTP 503', { status: 503 }],
    ['HTML proxy failure', { status: 502, contentType: 'text/html', body: '<html>Upstream unavailable</html>' }],
    ['Invalid JSON', { status: 200, body: 'not json' }],
    ['Missing queued acknowledgement', { status: 200, body: JSON.stringify({ ok: true, reference: 'COS-NOT-QUEUED' }) }],
    ['Missing backend reference', { status: 200, body: JSON.stringify({ ok: true, queued: true, reference: '' }) }],
    ['Network interruption', { networkError: true }],
    ['Request timeout', { delay: 1400 }]
  ];
  for (const [name, provider] of failures) await check(name + ' preserves input and retry request ID', () => withForm({ provider, config: { submissionTimeoutMs: 1000 } }, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.locator('button[type=submit]').click(); await expectError(page);
    const message = await page.locator('#form-status').textContent(); assert.doesNotMatch(message, /Unexpected token|SyntaxError|<!DOCTYPE|<html>|not json/i);
    await ready(page); assert.equal(state.requests.length, 1); state.provider = {};
    await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.length, 2); assert.equal(state.requests[0].payload.request_id, state.requests[1].payload.request_id);
    assert.notEqual(state.requests[0].payload.turnstile_token, state.requests[1].payload.turnstile_token);
  }));
  await check('Server email field errors display accessibly and clear when corrected', () => withForm({ provider: { status: 400, body: JSON.stringify({ error: 'Check your details.', fieldErrors: { email: 'Please use a complete email address.' } }) } }, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.locator('button[type=submit]').click();
    await page.locator('#email-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#email').getAttribute('aria-invalid'), 'true');
    await page.locator('#email').fill('corrected@example.com'); assert.equal(await page.locator('#email-error').isVisible(), false);
    state.provider = {}; await ready(page); await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.at(-1).payload.email, 'corrected@example.com');
  }));
  await check('Changed details after an uncertain result require explicit new-enquiry confirmation', () => withForm({ provider: { networkError: true } }, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.locator('button[type=submit]').click(); await expectError(page); await ready(page);
    const originalID = state.requests[0].payload.request_id;
    await page.locator('#message').fill('Changed synthetic enquiry after an uncertain network response.');
    state.provider = {}; await page.locator('button[type=submit]').click();
    await page.locator('#changed-enquiry-notice').waitFor({ state: 'visible' }); assert.equal(state.requests.length, 1);
    assert.equal(await page.locator('#changed-enquiry-notice').evaluate(element => element === document.activeElement), true);
    await page.locator('#send-changed-enquiry').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.length, 2); assert.notEqual(state.requests[1].payload.request_id, originalID);
  }));
  await check('Reverting changed details retries the original uncertain request ID', () => withForm({ provider: { networkError: true } }, async ({ page, state }) => {
    await ready(page); await fillForm(page); const originalMessage = await page.locator('#message').inputValue();
    await page.locator('button[type=submit]').click(); await expectError(page); await ready(page);
    await page.locator('#message').fill('Temporary changed enquiry details.'); await page.locator('button[type=submit]').click();
    await page.locator('#changed-enquiry-notice').waitFor({ state: 'visible' });
    await page.locator('#message').fill(originalMessage); state.provider = {}; await page.locator('button[type=submit]').click();
    await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.length, 2); assert.equal(state.requests[1].payload.request_id, state.requests[0].payload.request_id);
  }));
  await check('409 conflicts require explicit confirmation before a new request ID', () => withForm({ provider: { status: 409, body: JSON.stringify({ error: 'The enquiry request changed.' }) } }, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.locator('button[type=submit]').click();
    await page.locator('#changed-enquiry-notice').waitFor({ state: 'visible' }); assert.equal(state.requests.length, 1);
    state.provider = {}; await page.locator('#send-changed-enquiry').click(); await page.locator('#form-success').waitFor({ state: 'visible' });
    assert.equal(state.requests.length, 2); assert.notEqual(state.requests[1].payload.request_id, state.requests[0].payload.request_id);
  }));
  await check('429 respects Retry-After and recovers after the cooldown', () => withForm({ provider: { status: 429, headers: { 'Retry-After': '1' }, body: JSON.stringify({ error: 'Too many requests' }) } }, async ({ page, state }) => {
    await ready(page); await fillForm(page); await page.locator('button[type=submit]').click(); await expectError(page);
    assert.equal(await page.locator('button[type=submit]').isDisabled(), true); assert.equal(state.requests.length, 1);
    state.provider = {}; await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled, null, { timeout: 5000 });
    await page.locator('button[type=submit]').click(); await page.locator('#form-success').waitFor({ state: 'visible' }); assert.equal(state.requests.length, 2);
  }));
  await check('Narrow contact viewport has no document overflow and errors stay associated', () => withForm({ viewport: { width: 320, height: 740 } }, async ({ page }) => {
    await ready(page); await fillForm(page, 'visitor@example.com1'); await page.locator('#email').blur();
    assert.equal(await page.locator('#email-error').isVisible(), true); assert.equal(await page.locator('#email').getAttribute('aria-describedby'), 'email-error');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1); assert.equal(overflow, false);
  }));
  await check('Other pages keep working without enquiry API or captcha requests', async () => {
    for (const route of ['/', '/about/', '/services/']) await withForm({ route }, async ({ page, state }) => {
      assert.equal(await page.locator('h1').count(), 1); assert.equal(state.scripts.length, 0); assert.equal(state.requests.length, 0); assert.equal(state.configRequests, 0);
      await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.menu-toggle').click(); assert.equal(await page.locator('#mobile-menu').isVisible(), true);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#mobile-menu').isVisible(), false);
    });
  });
}

async function clientConcurrency(count) {
  const started = performance.now();
  const latencies = [];
  const requests = [];
  const forms = [];
  const contexts = [];
  try {
    for (let index = 0; index < Math.min(count, 10); index++) contexts.push(await browser.newContext({ viewport: { width: 1365, height: 900 }, reducedMotion: 'reduce' }));
    // Prepare browsers in small batches; the measured burst begins after all forms are ready.
    for (let start = 0; start < count; start += 5) {
      const prepared = await Promise.allSettled(Array.from({ length: Math.min(5, count - start) }, async (_, offset) => {
        const h = await harness({ context: contexts[(start + offset) % contexts.length], provider: { delay: 250 } });
        forms.push(h); await ready(h.page); await fillForm(h.page); return h;
      }));
      const failure = prepared.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (count > 10 && forms.length % 10 === 0) console.log('Prepared ' + forms.length + '/' + count + ' concurrent form pages');
    }
    const burstStarted = performance.now();
    const outcomes = await Promise.allSettled(forms.map(async ({ page, state }) => {
      const before = performance.now(); await page.evaluate(() => { const form = document.querySelector('#contact-form'); form.requestSubmit(); form.requestSubmit(); });
      await page.locator('#form-success').waitFor({ state: 'visible', timeout: 30000 });
      latencies.push(performance.now() - before); requests.push(state.requests.length); assert.equal(state.requests.length, 1);
      assert.deepEqual(state.unexpectedExternal, []); assert.deepEqual(state.pageErrors, []);
    }));
    const rejected = outcomes.filter(result => result.status === 'rejected');
    assert.equal(rejected.length, 0, rejected.slice(0, 3).map(result => result.reason?.message || String(result.reason)).join('\n'));
    latencies.sort((a, b) => a - b);
    return { concurrentForms: count, isolatedBrowserContexts: contexts.length, providerRequests: requests.reduce((total, n) => total + n, 0), successfulForms: outcomes.length, totalDurationMs: Math.round(performance.now() - started), submissionBurstDurationMs: Math.round(performance.now() - burstStarted), p50SubmitMs: Math.round(latencies[Math.floor(latencies.length * .5)]), p95SubmitMs: Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * .95))]), scope: 'Preloaded independent browser pages across isolated contexts submitted concurrently to a mocked same-origin enquiry API and Turnstile; does not measure Resend capacity or email delivery.' };
  } finally { await Promise.allSettled(forms.map(h => h.close())); await Promise.allSettled(contexts.map(context => context.close())); }
}

(async () => {
  try {
    await startServer();
    const { chromium } = loadPlaywright();
    const launch = { headless: true };
    if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    if (process.env.PLAYWRIGHT_CHANNEL) launch.channel = process.env.PLAYWRIGHT_CHANNEL;
    try { browser = await chromium.launch(launch); }
    catch (error) { if (launch.executablePath || launch.channel || !/Executable doesn't exist/.test(error.message)) throw error; browser = await chromium.launch({ ...launch, channel: 'chrome' }); }
    if (process.env.FORM_TEST_ONLY_LOAD !== '1') await functionalTests();
    if (process.env.FORM_TEST_SKIP_LOAD !== '1') for (const count of [10, 50]) await check(count + ' concurrent independent browser forms each send exactly one mocked request', () => clientConcurrency(count));
  } catch (error) { results.push({ name: 'Test infrastructure', passed: false, error: error.stack || String(error) }); }
  finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
    await fs.mkdir(path.dirname(output), { recursive: true });
    const report = { recordedAt: new Date().toISOString(), externalDeliveryTested: false, total: results.length, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results };
    await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, report: output }, null, 2));
    if (report.failed) process.exitCode = 1;
  }
})();
