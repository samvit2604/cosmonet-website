export function createCaptchaVerifier(config, { fetchImpl = globalThis.fetch } = {}) {
  return async function verifyCaptcha({ token, ip, requestId }) {
    if (!config.turnstileRequired) return { ok: true };
    if (!token) return { ok: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.captchaTimeoutMs);
    try {
      const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        // A lead request ID survives retries with NEW challenge tokens. It must
        // not be reused as Cloudflare's per-verification idempotency key.
        body: JSON.stringify({ secret: config.turnstileSecretKey, response: token, remoteip: ip }),
      });
      if (!response.ok) return { ok: false, unavailable: true };
      const reader = response.body?.getReader();
      if (!reader) return { ok: false, unavailable: true };
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16384) { await reader.cancel(); return { ok: false, unavailable: true }; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (Array.isArray(result['error-codes']) && result['error-codes'].some(code => ['internal-error', 'missing-input-secret', 'invalid-input-secret'].includes(code))) return { ok: false, unavailable: true };
      return { ok: result.success === true && result.action === 'contact' && config.allowedHosts.has(result.hostname) };
    } catch { return { ok: false, unavailable: true }; }
    finally { clearTimeout(timer); }
  };
}
