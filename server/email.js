// Persist buildEmail()'s result with the outbox row: retries must retain the
// original provider request body across deployments and sender-setting changes.
const RESEND_URL = 'https://api.resend.com/emails';
const MAX_RESPONSE_BYTES = 16_384;
const TRANSIENT_CONFLICTS = new Set(['concurrent_idempotent_requests', 'resource_locked']);
const QUOTA_ERRORS = new Set(['daily_quota_exceeded', 'monthly_quota_exceeded']);

export class EmailDeliveryError extends Error {
  constructor(code, { status = null, retryable = false, retryAfterMs = null } = {}) {
    super(code);
    this.name = 'EmailDeliveryError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

const safeHeader = value => typeof value === 'string' && value.length > 0 && !/[\r\n\u0000]/.test(value);

export function buildEmail(job, { from, teamEmail = 'hello@cosmonet.ai' }) {
  const lead = job.payload;
  if (!lead || !['team', 'ack'].includes(job.kind) || !safeHeader(from) || !safeHeader(teamEmail) ||
      !safeHeader(lead.email) || !safeHeader(lead.reference) || !safeHeader(String(job.leadId ?? ''))) {
    throw new EmailDeliveryError('invalid_email_job');
  }
  const reference = lead.reference;
  const heading = job.kind === 'team' ? 'New project enquiry' : 'We have received your enquiry';
  let text;
  let content;
  if (job.kind === 'team') {
    const fields = [
      ['Reference', reference], ['Name', lead.name], ['Company', lead.company],
      ['Email', lead.email], ['Service', lead.service], ['Business stage', lead.interest || 'Not provided'],
      ['Message', lead.message],
      ...Object.entries(lead.campaign || {}).map(([key, value]) => [key, value]),
    ];
    text = `${heading}\n\n${fields.map(([label, value]) => `${label}: ${value ?? ''}`).join('\n\n')}`;
    content = fields.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value).replace(/\r?\n/g, '<br>')}</p>`).join('');
  } else {
    // Reflect no visitor-supplied text: mail clients may auto-link even names.
    text = `Hello,\n\nThank you for contacting Cosmonet. We have received your enquiry.\n\nYour reference: ${reference}\n\nOur team will review your message and respond to this email. You can reply to this email to add information.\n\nCosmonet\n${teamEmail}`;
    content = `<p>Hello,</p><p>Thank you for contacting Cosmonet. We have received your enquiry.</p><p><strong>Your reference: ${escapeHtml(reference)}</strong></p><p>Our team will review your message and respond to this email. You can reply to this email to add information.</p><p>Cosmonet<br>${escapeHtml(teamEmail)}</p>`;
  }
  return {
    from,
    to: [job.kind === 'team' ? teamEmail : lead.email],
    reply_to: job.kind === 'team' ? lead.email : teamEmail,
    subject: job.kind === 'team' ? `New Cosmonet enquiry — ${reference}` : `We have received your enquiry — ${reference}`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f2ec;color:#21192a;font-family:Arial,sans-serif"><main style="max-width:600px;margin:32px auto;padding:32px;background:#fff"><h1 style="font-size:24px">${heading}</h1>${content}</main></body></html>`,
    text,
    headers: { 'X-Entity-Ref-ID': reference, 'Auto-Submitted': 'auto-generated' },
    tags: [{ name: 'kind', value: job.kind }, { name: 'lead_id', value: String(job.leadId) }],
  };
}

export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1000;
    return Number.isSafeInteger(Math.ceil(milliseconds)) ? Math.ceil(milliseconds) : null;
  }
  const date = Date.parse(trimmed);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

async function readResponse(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new EmailDeliveryError('provider_invalid_response', { retryable: true });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return null; }
}

function quotaDelay(code, now) {
  const date = new Date(now);
  if (code === 'daily_quota_exceeded') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - now + 1000;
  if (code === 'monthly_quota_exceeded') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - now + 1000;
  return null;
}

export function createEmailClient({ apiKey, from, teamEmail = 'hello@cosmonet.ai', timeoutMs = 10_000, fetchImpl = globalThis.fetch, now = Date.now }) {
  if (!safeHeader(apiKey) || !safeHeader(from) || !safeHeader(teamEmail) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || typeof fetchImpl !== 'function') throw new Error('Invalid email transport configuration');
  return {
    async send(job, { signal } = {}) {
      const controller = new AbortController();
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        if (combined.aborted) throw new EmailDeliveryError('worker_shutdown', { retryable: true });
        if (!safeHeader(String(job.leadId ?? '')) || !['team', 'ack'].includes(job.kind)) throw new EmailDeliveryError('invalid_email_job');
        const body = job.emailPayload || buildEmail(job, { from, teamEmail });
        const response = await fetchImpl(RESEND_URL, {
          method: 'POST', redirect: 'error', signal: combined,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `lead/${job.leadId}/${job.kind}` },
          body: JSON.stringify(body),
        });
        const result = await readResponse(response);
        if (response.ok) {
          if (typeof result?.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.id)) throw new EmailDeliveryError('provider_invalid_response', { retryable: true });
          return { id: result.id };
        }
        const name = typeof result?.name === 'string' ? result.name : '';
        const quota = QUOTA_ERRORS.has(name);
        const retryable = response.status >= 500 || response.status === 408 || response.status === 429 || (response.status === 409 && TRANSIENT_CONFLICTS.has(name));
        const code = quota || TRANSIENT_CONFLICTS.has(name) || name === 'invalid_idempotent_request' ? name : `provider_http_${response.status}`;
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), now()) ?? (quota ? quotaDelay(name, now()) : null);
        throw new EmailDeliveryError(code, { status: response.status, retryable, retryAfterMs });
      } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;
        if (combined.aborted) throw new EmailDeliveryError(signal?.aborted ? 'worker_shutdown' : 'provider_timeout', { retryable: true });
        // Do not log provider response bodies, addresses, credentials, or raw errors.
        throw new EmailDeliveryError('provider_network_error', { retryable: true });
      } finally { clearTimeout(timer); }
    },
  };
}
