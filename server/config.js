import path from 'node:path';
import fs from 'node:fs';
import validator from 'validator';

function integer(env, name, fallback, min, max) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

function origin(value, production) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid SITE_URL or additional origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:') ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use an HTTPS origin without a path for SITE_URL');
  if (production && (url.port || !validator.isFQDN(url.hostname))) throw new Error('Production requires a public HTTPS hostname without a port');
  return url.origin;
}

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = integer(env, 'PORT', 3000, 1, 65535);
  const siteOrigin = origin(env.SITE_URL || (production ? '' : `http://localhost:${port}`), production);
  const allowedOrigins = new Set([siteOrigin]);
  for (const value of (env.ADDITIONAL_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)) allowedOrigins.add(origin(value, production));
  const dataDir = path.resolve(env.DATA_DIR || './.data');
  const distDir = path.resolve('dist');
  const realDataDir = fs.existsSync(dataDir) ? fs.realpathSync(dataDir) : dataDir;
  const realDistDir = fs.existsSync(distDir) ? fs.realpathSync(distDir) : distDir;
  if (realDataDir === realDistDir || realDataDir.startsWith(realDistDir + path.sep)) throw new Error('DATA_DIR must be outside public dist/');
  const hashSecret = env.HASH_SECRET || (production ? '' : 'local-preview-only-change-this-secret-32-chars');
  const resendApiKey = (env.RESEND_API_KEY || '').trim();
  const resendFrom = (env.RESEND_FROM || '').trim();
  const teamEmail = (env.LEADS_TO || 'hello@cosmonet.ai').trim();
  const turnstileSiteKey = (env.TURNSTILE_SITE_KEY || '').trim();
  const turnstileSecretKey = (env.TURNSTILE_SECRET_KEY || '').trim();
  const turnstileRequired = production || env.TURNSTILE_REQUIRED !== 'false';
  const opsToken = (env.OPS_TOKEN || '').trim();
  const webhookSecret = (env.RESEND_WEBHOOK_SECRET || '').trim();
  const fromMatch = resendFrom.includes('<') ? resendFrom.match(/^[^<>\r\n]{1,80}<([^<>\s]+)>$/) : [null, resendFrom];
  if (resendFrom && (!fromMatch || !validator.isEmail(fromMatch[1]) || /[\r\n\u0000]/.test(resendFrom))) throw new Error('Invalid RESEND_FROM');
  if (!validator.isEmail(teamEmail) || /[\r\n]/.test(teamEmail)) throw new Error('Invalid LEADS_TO');
  if (resendApiKey && (!/^re_[A-Za-z0-9_-]{8,}$/.test(resendApiKey))) throw new Error('Invalid RESEND_API_KEY');
  if (hashSecret.length < 32) throw new Error('HASH_SECRET must contain at least 32 characters');
  if (opsToken && opsToken.length < 32) throw new Error('OPS_TOKEN must contain at least 32 characters');
  if (webhookSecret && !/^whsec_[A-Za-z0-9+/=_-]+$/.test(webhookSecret)) throw new Error('Invalid RESEND_WEBHOOK_SECRET');
  if (turnstileSiteKey && !/^[A-Za-z0-9_-]{10,100}$/.test(turnstileSiteKey)) throw new Error('Invalid TURNSTILE_SITE_KEY');
  if (production) {
    if (!(resendApiKey && resendFrom && turnstileSiteKey && turnstileSecretKey)) throw new Error('Production requires Resend and Turnstile settings');
    if (/^(1x|2x|3x)/.test(turnstileSiteKey)) throw new Error('Production cannot use Turnstile test keys');
    if (!env.DATA_DIR || !path.isAbsolute(env.DATA_DIR)) throw new Error('Production requires an absolute DATA_DIR on a persistent disk');
    if (!env.HASH_SECRET) throw new Error('Production requires HASH_SECRET');
    if (!opsToken) throw new Error('Production requires OPS_TOKEN for protected operational status');
    if (/example|replace|dummy/i.test(resendApiKey + resendFrom + hashSecret)) throw new Error('Replace example production settings');
  }
  const config = {
    production, port, host: env.HOST || '0.0.0.0', siteOrigin, allowedOrigins,
    allowedHosts: new Set([...allowedOrigins].map(value => new URL(value).hostname)),
    dataDir, dbPath: path.join(dataDir, 'enquiries.sqlite'), distDir,
    hashSecret, resendApiKey, resendFrom, teamEmail, turnstileSiteKey, turnstileSecretKey,
    turnstileRequired, opsToken, webhookSecret,
    emailWorkerEnabled: env.EMAIL_WORKER_ENABLED !== 'false',
    trustProxy: integer(env, 'TRUST_PROXY_HOPS', production ? 1 : 0, 0, 5),
    maxPendingRequests: integer(env, 'MAX_PENDING_REQUESTS', 100, 1, 10000),
    maxQueuedEmails: integer(env, 'MAX_QUEUED_EMAILS', 10000, 2, 1000000),
    ipRateLimit: integer(env, 'IP_RATE_LIMIT', 30, 1, 1000000),
    ipWindowMs: integer(env, 'IP_RATE_WINDOW_MS', 600000, 100, 86400000),
    emailRateLimit: integer(env, 'EMAIL_RATE_LIMIT', 5, 1, 1000000),
    emailWindowMs: integer(env, 'EMAIL_RATE_WINDOW_MS', 3600000, 100, 86400000),
    globalRateLimit: integer(env, 'GLOBAL_RATE_LIMIT', 300, 1, 1000000),
    globalWindowMs: integer(env, 'GLOBAL_RATE_WINDOW_MS', 60000, 100, 86400000),
    retentionDays: integer(env, 'LEAD_RETENTION_DAYS', 180, 1, 3650),
    captchaTimeoutMs: integer(env, 'CAPTCHA_TIMEOUT_MS', 5000, 100, 10000),
    providerTimeoutMs: integer(env, 'EMAIL_TIMEOUT_MS', 10000, 100, 15000),
    sendIntervalMs: integer(env, 'EMAIL_SEND_INTERVAL_MS', 600, 100, 60000),
    workerConcurrency: integer(env, 'EMAIL_CONCURRENCY', 2, 1, 8),
  };
  config.formsAvailable = Boolean(resendApiKey && resendFrom && (!turnstileRequired || (turnstileSiteKey && turnstileSecretKey)));
  return config;
}
