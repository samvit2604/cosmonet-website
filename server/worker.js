import { EmailDeliveryError } from './email.js';

const HOUR = 60 * 60 * 1000;

export function retryDelay(attempts, { retryAfterMs = null, baseMs = 30_000, capMs = HOUR, random = Math.random } = {}) {
  const exponent = Math.max(0, Math.min(20, Number(attempts || 1) - 1));
  const exponential = Math.min(capMs, baseMs * (2 ** exponent));
  const jittered = Math.min(capMs, Math.ceil(exponential * (0.75 + random() * 0.5)));
  return Math.max(jittered, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
}

/** Resend retains idempotency keys for 24h; never resend outside our 23h window. */
export function createOutboxWorker({
  store, emailClient, concurrency = 2, pollMs = 1000, sendIntervalMs = 600,
  leaseMs = 60_000, maxAttempts = 24, maxRetryAgeMs = 23 * HOUR,
  retryBaseMs = 30_000, retryCapMs = HOUR,
  now = Date.now, random = Math.random, logger = console,
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20 ||
      !Number.isFinite(pollMs) || pollMs < 1 || !Number.isFinite(sendIntervalMs) || sendIntervalMs < 0 ||
      !Number.isFinite(leaseMs) || leaseMs < 30 || !Number.isInteger(maxAttempts) || maxAttempts < 1 ||
      !Number.isFinite(maxRetryAgeMs) || maxRetryAgeMs <= 0 || maxRetryAgeMs >= 24 * HOUR) throw new Error('Invalid worker configuration');
  let running = false;
  let stopped = false;
  let loops = [];
  let nextSendAt = 0;
  let providerPausedUntil = 0;
  let pausedReason = null;
  const waitController = new AbortController();
  const active = new Set();
  const wakeListeners = new Set();
  const counters = { claimed: 0, accepted: 0, retried: 0, failed: 0, storageErrors: 0, lostLeases: 0, active: 0 };
  const log = (event, fields = {}) => {
    if (typeof logger === 'function') logger(event, { ...fields, code: fields.errorCode || fields.code });
    else logger?.error?.(JSON.stringify({ event, ...fields }));
  };

  function wait(ms, wakeable = false) {
    if (ms <= 0 || waitController.signal.aborted) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timer); waitController.signal.removeEventListener('abort', finish); wakeListeners.delete(finish); resolve(); };
      const timer = setTimeout(finish, Math.min(ms, 2_147_483_647));
      waitController.signal.addEventListener('abort', finish, { once: true });
      if (wakeable) wakeListeners.add(finish);
    });
  }

  async function persist(method, job, options, counter) {
    const owned = await store[method](job, options);
    if (owned === false) {
      counters.lostLeases++;
      log('outbox_lease_lost', { jobId: job.id, operation: method });
    } else counters[counter]++;
  }

  async function process(job) {
    const firstAttempt = new Date(job.firstAttemptAt ?? job.createdAt).getTime();
    const deadline = firstAttempt + maxRetryAgeMs;
    if (!Number.isFinite(firstAttempt) || now() >= deadline || job.attempts > maxAttempts) {
      await persist('failJob', job, { errorCode: 'manual_review_required' }, 'failed');
      return;
    }
    const controller = new AbortController();
    active.add(controller);
    counters.active = active.size;
    let renewing = false;
    const heartbeat = typeof store.heartbeatJob === 'function' ? setInterval(async () => {
      if (renewing) return;
      renewing = true;
      try {
        const owned = await store.heartbeatJob(job, { leaseMs });
        if (owned === false) controller.abort();
      } catch {
        controller.abort();
        log('outbox_lease_renewal_failed', { jobId: job.id });
      } finally { renewing = false; }
    }, Math.max(10, Math.floor(leaseMs / 3))) : null;
    heartbeat?.unref();
    try {
      let sent;
      try { sent = await emailClient.send(job, { signal: controller.signal }); }
      catch (error) {
        const failure = error instanceof EmailDeliveryError ? error : new EmailDeliveryError('email_transport_error', { retryable: true });
        const delay = retryDelay(job.attempts, { retryAfterMs: failure.retryAfterMs, baseMs: retryBaseMs, capMs: retryCapMs, random });
        const nextAttemptAt = new Date(now() + delay);
        if (failure.status === 429) {
          providerPausedUntil = Math.max(providerPausedUntil, nextAttemptAt.getTime());
          pausedReason = failure.code;
          if (typeof store.pauseEmailSending === 'function') await store.pauseEmailSending({ until: nextAttemptAt, errorCode: failure.code });
        }
        if (!failure.retryable || job.attempts >= maxAttempts || nextAttemptAt.getTime() >= deadline) {
          await persist('failJob', job, { errorCode: failure.retryable ? 'manual_review_required' : failure.code }, 'failed');
        } else await persist('retryJob', job, { nextAttemptAt, errorCode: failure.code }, 'retried');
        log('outbox_send_failed', { jobId: job.id, kind: job.kind, errorCode: failure.code, retryable: failure.retryable });
        return;
      }
      // If this write fails, retain the lease for durable recovery with the same
      // provider key/body. Do not change the row to a different retry state here.
      await persist('markSent', job, { providerId: sent.id }, 'accepted');
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      active.delete(controller);
      counters.active = active.size;
    }
  }

  async function loop() {
    while (running) {
      try {
        if (providerPausedUntil > now()) { await wait(providerPausedUntil - now(), true); continue; }
        providerPausedUntil = 0; pausedReason = null;
        const delay = Math.max(0, nextSendAt - now());
        nextSendAt = Math.max(nextSendAt, now()) + sendIntervalMs;
        await wait(delay);
        if (!running) break;
        if (providerPausedUntil > now()) continue;
        if (typeof store.reserveEmailSlot === 'function') {
          const permit = await store.reserveEmailSlot({ intervalMs: sendIntervalMs });
          if (!permit.allowed) { await wait(Math.max(pollMs, new Date(permit.nextAttemptAt).getTime() - now())); continue; }
        }
        if (!running || providerPausedUntil > now()) continue;
        const job = await store.claimJob({ leaseMs });
        if (!job) { await wait(pollMs, true); continue; }
        counters.claimed++;
        await process(job);
      } catch {
        counters.storageErrors++;
        log('outbox_storage_error');
        await wait(pollMs, true);
      }
    }
  }

  const api = {
    start() {
      if (running) return api;
      if (stopped) throw new Error('Create a new worker after stopping it');
      running = true;
      loops = Array.from({ length: concurrency }, () => loop());
      return api;
    },
    wake() { for (const finish of [...wakeListeners]) finish(); },
    get stats() { return { ...counters, running, pausedUntil: providerPausedUntil || null, pausedReason }; },
    async stop({ timeoutMs = 20_000, abortGraceMs = 2000 } = {}) {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(abortGraceMs) || abortGraceMs < 0) throw new Error('Invalid shutdown timeout');
      timeoutMs = Math.min(timeoutMs, 20_000);
      abortGraceMs = Math.min(abortGraceMs, 2000);
      running = false; stopped = true;
      waitController.abort();
      const finished = Promise.allSettled(loops).then(() => true);
      const waitForDrain = async milliseconds => {
        let timer;
        try { return await Promise.race([finished, new Promise(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]); }
        finally { clearTimeout(timer); }
      };
      const drained = await waitForDrain(timeoutMs);
      let settled = drained;
      if (!drained) {
        for (const controller of active) controller.abort();
        // Give aborted sends time to persist their retry state before the caller
        // closes the database. The total worker shutdown is bounded to 22s.
        settled = await waitForDrain(abortGraceMs);
      }
      return { drained, settled, active: active.size };
    },
  };
  return api;
}
