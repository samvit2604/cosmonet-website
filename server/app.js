import express from 'express';
import helmet from 'helmet';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Webhook } from 'svix';
import { validateLead, UUID } from './validation.js';
import { createCaptchaVerifier } from './captcha.js';
import { StoreError, DELIVERY_EVENTS } from './store.js';

const secretHash = (secret, namespace, value) => createHmac('sha256', secret).update(namespace + '\0' + value).digest('hex');
const tokenMatches = (a, b) => {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function createApp({ config, store, verifyCaptcha = createCaptchaVerifier(config), logger = () => {}, wakeWorker = () => {} }) {
  const app = express(), pending = new Map();
  let closing = false;
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy || false);
  app.locals.beginShutdown = () => { closing = true; };
  app.locals.pending = pending;
  app.locals.drainPending = () => Promise.allSettled([...pending.values()].map(value => value.promise));
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"],
      connectSrc: ["'self'", 'https://challenges.cloudflare.com'], frameSrc: ['https://challenges.cloudflare.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.production ? [] : null,
    } },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: config.production ? { maxAge: 31536000, includeSubDomains: false } : false,
  }));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    if (req.path.startsWith('/api/') || req.path === '/readyz' || req.path === '/healthz') res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/healthz', (req, res) => res.status(closing ? 503 : 200).json({ ok: !closing }));
  app.get('/readyz', (req, res) => {
    try { if (closing || !config.formsAvailable || !store.ping()) return res.status(503).json({ ok: false }); }
    catch { return res.status(503).json({ ok: false }); }
    res.json({ ok: true });
  });
  app.get('/api/form-config', (req, res) => {
    let available = config.formsAvailable && !closing;
    try { if (available) store.ping(); } catch { available = false; }
    res.json({ available, turnstileRequired: config.turnstileRequired, turnstileSiteKey: available ? config.turnstileSiteKey : '', submissionTimeoutMs: 15000 });
  });
  app.get('/api/ops/status', (req, res) => {
    if (!config.opsToken) return res.status(404).json({ ok: false });
    if (!tokenMatches(req.get('authorization') || '', 'Bearer ' + config.opsToken)) return res.status(401).json({ ok: false });
    try { return res.json({ ok: true, formsAvailable: config.formsAvailable && !closing, emailWorkerEnabled: config.emailWorkerEnabled, ...store.stats() }); }
    catch { return res.status(503).json({ ok: false }); }
  });
  app.post('/api/resend/webhook', (req, res, next) => {
    if (!config.webhookSecret) return res.status(404).json({ ok: false });
    next();
  }, express.raw({ type: 'application/json', limit: '64kb', inflate: false }), (req, res) => {
    let event;
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('Invalid body');
      const raw = req.body.toString('utf8');
      new Webhook(config.webhookSecret).verify(raw, {
        'svix-id': req.get('svix-id'), 'svix-timestamp': req.get('svix-timestamp'), 'svix-signature': req.get('svix-signature'),
      });
      event = JSON.parse(raw);
    } catch { return res.status(400).json({ ok: false, error: 'Invalid webhook.' }); }
    const id = req.get('svix-id'), providerId = event?.data?.email_id;
    if (!DELIVERY_EVENTS[event?.type] || !UUID.test(providerId || '') || !/^[A-Za-z0-9_-]{1,200}$/.test(id || '')) return res.json({ ok: true, ignored: true });
    try {
      store.recordDelivery({ id, providerId, type: event.type });
      return res.json({ ok: true });
    } catch { return res.status(503).json({ ok: false }); }
  });
  const replyError = (req, res, error) => {
    if (error instanceof StoreError) {
      if (error.status >= 500) logger('enquiry_unavailable', { requestId: req.requestId, code: error.code });
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      const message = error.status === 409 ? 'These details do not match the previous attempt. Start a new enquiry to send changed details.' : error.status === 429 ? 'Please wait before sending another enquiry.' : 'The enquiry service is busy. Please try again shortly or email hello@cosmonet.ai.';
      return res.status(error.status).json({ ok: false, error: message });
    }
    logger('enquiry_storage_error', { requestId: req.requestId, code: /^[A-Z0-9_]{1,60}$/.test(error?.code || '') ? error.code : 'storage_unavailable' });
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ ok: false, error: 'We could not save your enquiry. Your details are still here. Please retry or email hello@cosmonet.ai.' });
  };
  app.post('/api/leads', (req, res, next) => {
    if (closing || !config.formsAvailable) return res.status(503).json({ ok: false, error: 'The enquiry form is temporarily unavailable. Please email hello@cosmonet.ai.' });
    if (!config.allowedOrigins.has(req.get('origin')) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ ok: false, error: 'Please submit the enquiry from our website.' });
    if (!req.is('application/json')) return res.status(415).json({ ok: false, error: 'Please reload the enquiry form and try again.' });
    try { store.checkRequestRate(secretHash(config.hashSecret, 'ip', req.ip || req.socket.remoteAddress || 'unknown')); }
    catch (error) { return replyError(req, res, error); }
    next();
  }, express.json({ limit: '16kb', strict: true, inflate: false }), async (req, res) => {
    const input = validateLead(req.body);
    if (Object.keys(input.errors).length) return res.status(400).json({ ok: false, error: 'Please check the form details.', fieldErrors: input.errors });
    const { data, requestId, captchaToken } = input;
    const payloadHash = secretHash(config.hashSecret, 'payload', JSON.stringify(data));
    const emailHash = secretHash(config.hashSecret, 'email', data.email.toLowerCase());
    const reply = result => res.status(result.duplicate ? 200 : 201).json({ ok: true, reference: result.reference, queued: true });
    try {
      // Successful retries must not need a new or already-consumed CAPTCHA token.
      const existing = store.findRequest(requestId, payloadHash);
      if (existing) return reply(existing);
      const active = pending.get(requestId);
      if (active) {
        if (active.payloadHash !== payloadHash) throw new StoreError('idempotency_conflict', 409, 0);
        return reply({ ...await active.promise, duplicate: true });
      }
      if (pending.size >= config.maxPendingRequests) throw new StoreError('busy', 503, 2);
      const promise = (async () => {
        let verified;
        try { verified = await verifyCaptcha({ token: captchaToken, ip: req.ip, requestId }); }
        catch { throw new StoreError('verification_unavailable', 503, 5); }
        if (!verified?.ok) {
          if (verified?.unavailable) throw new StoreError('verification_unavailable', 503, 5);
          const error = new StoreError('verification_failed', 403, 0);
          throw error;
        }
        const accepted = store.acceptLead(data, { requestId, payloadHash, emailHash });
        try { wakeWorker(); } catch { /* A future poll will find the durable jobs. */ }
        return accepted;
      })();
      pending.set(requestId, { payloadHash, promise });
      try { return reply(await promise); }
      finally { if (pending.get(requestId)?.promise === promise) pending.delete(requestId); }
    } catch (error) {
      if (error?.code === 'verification_failed') return res.status(403).json({ ok: false, error: 'Please complete verification again before sending your enquiry.' });
      return replyError(req, res, error);
    }
  });
  app.all('/api/leads', (req, res) => { res.setHeader('Allow', 'POST'); res.status(405).json({ ok: false, error: 'Method not allowed.' }); });
  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));
  app.use(express.static(config.distDir, {
    dotfiles: 'deny', index: 'index.html', redirect: true,
    setHeaders(res, filename) { res.setHeader('Cache-Control', /\.(html|js|css)$/.test(filename) ? 'no-cache' : 'public, max-age=3600'); },
  }));
  app.use((req, res) => res.status(404).type('text').send('Page not found.'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.status === 415 ? 415 : error instanceof SyntaxError || error.type === 'entity.parse.failed' ? 400 : 500;
    logger('request_rejected', { requestId: req.requestId, code: String(status) });
    res.status(status).json({ ok: false, error: status === 413 ? 'The enquiry is too large. Please shorten your message.' : 'Please reload the enquiry form and try again.' });
  });
  return app;
}
