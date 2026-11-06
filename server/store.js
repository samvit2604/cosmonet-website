import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildEmail } from './email.js';

export class StoreError extends Error {
  constructor(code, status = 503, retryAfter = 2) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}

const deliveryRank = { pending: 0, accepted: 1, delayed: 2, delivered: 3, suppressed: 4, failed: 5, bounced: 6, complained: 7 };
export const DELIVERY_EVENTS = { 'email.sent': 'accepted', 'email.delivered': 'delivered', 'email.delivery_delayed': 'delayed', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.failed': 'failed', 'email.suppressed': 'suppressed' };

export function createStore({ filename, config, now = Date.now }) {
  if (!filename || filename === ':memory:') throw new Error('Use an on-disk SQLite file for the durable store');
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const realDirectory = fs.realpathSync(path.dirname(filename));
  const publicDirectory = fs.existsSync(config.distDir) ? fs.realpathSync(config.distDir) : path.resolve(config.distDir || 'dist');
  if (realDirectory === publicDirectory || realDirectory.startsWith(publicDirectory + path.sep)) throw new Error('Private enquiry storage cannot be placed in public dist/');
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw new Error('Database cannot be a symbolic link');
  const db = new Database(filename, { timeout: 2000 });
  fs.chmodSync(filename, 0o600);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('wal_autocheckpoint = 1000');
  const version = db.pragma('user_version', { simple: true });
  if (version > 1) { db.close(); throw new Error('Database schema is newer than this application'); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS email_jobs (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('team','ack')), payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','failed')),
      attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL,
      first_attempt_at INTEGER, lease_token TEXT, lease_until INTEGER,
      provider_id TEXT, delivery_state TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
      UNIQUE(lead_id,kind)
    );
    CREATE INDEX IF NOT EXISTS email_jobs_ready ON email_jobs(status,next_attempt_at,lease_until);
    CREATE UNIQUE INDEX IF NOT EXISTS email_provider_id ON email_jobs(provider_id) WHERE provider_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(bucket,window));
    CREATE TABLE IF NOT EXISTS email_control (id INTEGER PRIMARY KEY CHECK(id=1), next_slot INTEGER NOT NULL DEFAULT 0, paused_until INTEGER NOT NULL DEFAULT 0, reason TEXT);
    INSERT OR IGNORE INTO email_control(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS delivery_events (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS delivery_by_provider ON delivery_events(provider_id);
    PRAGMA user_version = 1;
  `);
  const find = db.prepare('SELECT id,reference,payload_hash FROM leads WHERE request_id=?');
  const checkDuplicate = (requestId, payloadHash) => {
    const row = find.get(requestId);
    if (!row) return null;
    if (row.payload_hash !== payloadHash) throw new StoreError('idempotency_conflict', 409, 0);
    return { reference: row.reference, id: row.id, duplicate: true };
  };
  const useRate = (bucket, limit, windowMs) => {
    const timestamp = now(), window = Math.floor(timestamp / windowMs) * windowMs;
    const row = db.prepare('SELECT count FROM rate_limits WHERE bucket=? AND window=?').get(bucket, window);
    if (row && row.count >= limit) throw new StoreError('rate_limited', 429, Math.max(1, Math.ceil((window + windowMs - timestamp) / 1000)));
    db.prepare('INSERT INTO rate_limits(bucket,window,count,expires_at) VALUES(?,?,1,?) ON CONFLICT(bucket,window) DO UPDATE SET count=count+1').run(bucket, window, window + windowMs * 2);
  };
  const requestRate = db.transaction(ipHash => {
    useRate('global', config.globalRateLimit, config.globalWindowMs);
    useRate('ip/' + ipHash, config.ipRateLimit, config.ipWindowMs);
  });
  const accept = db.transaction((data, { requestId, payloadHash, emailHash }) => {
    const existing = checkDuplicate(requestId, payloadHash);
    if (existing) return existing;
    const pending = db.prepare("SELECT count(*) AS n FROM email_jobs WHERE status IN ('queued','processing')").get().n;
    if (pending + 2 > config.maxQueuedEmails) throw new StoreError('queue_full', 503, 60);
    useRate('recipient/' + emailHash, config.emailRateLimit, config.emailWindowMs);
    const id = randomUUID(), timestamp = now();
    const reference = 'COS-' + new Date(timestamp).toISOString().slice(0, 10).replaceAll('-', '') + '-' + id.replaceAll('-', '').slice(0, 12).toUpperCase();
    const payload = { ...data, reference, consent_version: '2026-11-05' };
    db.prepare('INSERT INTO leads(id,request_id,payload_hash,reference,payload,created_at) VALUES(?,?,?,?,?,?)').run(id, requestId, payloadHash, reference, JSON.stringify(payload), timestamp);
    for (const kind of ['team', 'ack']) {
      const snapshot = buildEmail({ leadId: id, kind, payload }, { from: config.resendFrom, teamEmail: config.teamEmail });
      db.prepare('INSERT INTO email_jobs(id,lead_id,kind,payload,created_at,next_attempt_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), id, kind, JSON.stringify(snapshot), timestamp, timestamp);
    }
    return { id, reference, duplicate: false };
  });
  const claim = db.transaction(({ leaseMs }) => {
    const timestamp = now();
    const row = db.prepare("SELECT * FROM email_jobs WHERE (status='queued' AND next_attempt_at<=?) OR (status='processing' AND lease_until<=?) ORDER BY created_at,kind DESC LIMIT 1").get(timestamp, timestamp);
    if (!row) return null;
    const leaseToken = randomUUID();
    db.prepare("UPDATE email_jobs SET status='processing',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),lease_token=?,lease_until=? WHERE id=?").run(timestamp, leaseToken, timestamp + leaseMs, row.id);
    const lead = db.prepare('SELECT payload FROM leads WHERE id=?').get(row.lead_id);
    return { id: row.id, leadId: row.lead_id, kind: row.kind, attempts: row.attempts + 1,
      createdAt: new Date(row.created_at), firstAttemptAt: new Date(row.first_attempt_at ?? timestamp),
      payload: JSON.parse(lead.payload), emailPayload: JSON.parse(row.payload), leaseToken };
  });
  const updateJob = (job, sql, params) => db.prepare(sql + " WHERE id=? AND status='processing' AND lease_token=?").run(...params, job.id, job.leaseToken).changes === 1;
  const slot = db.transaction(({ intervalMs }) => {
    const timestamp = now(), state = db.prepare('SELECT * FROM email_control WHERE id=1').get();
    const next = Math.max(state.next_slot, state.paused_until);
    if (next > timestamp) return { allowed: false, nextAttemptAt: new Date(next) };
    db.prepare('UPDATE email_control SET next_slot=? WHERE id=1').run(timestamp + intervalMs);
    return { allowed: true, nextAttemptAt: new Date(timestamp + intervalMs) };
  });
  const markSent = db.transaction((job, { providerId }) => {
    const events = db.prepare('SELECT state FROM delivery_events WHERE provider_id=?').all(providerId);
    const state = events.map(event => event.state).reduce((best, value) => deliveryRank[value] > deliveryRank[best] ? value : best, 'accepted');
    return updateJob(job, "UPDATE email_jobs SET status='sent',provider_id=?,delivery_state=?,lease_token=NULL,lease_until=NULL,last_error=NULL", [providerId, state]);
  });
  return {
    db, filename,
    ping() { db.prepare('SELECT 1').get(); return true; },
    findRequest(requestId, payloadHash) { return checkDuplicate(requestId, payloadHash); },
    checkRequestRate(ipHash) { return requestRate.immediate(ipHash); },
    acceptLead(data, metadata) { return accept.immediate(data, metadata); },
    claimJob(options) { return claim.immediate(options); },
    reserveEmailSlot(options) { return slot.immediate(options); },
    pauseEmailSending({ until, errorCode }) { db.prepare('UPDATE email_control SET paused_until=MAX(paused_until,?),reason=? WHERE id=1').run(new Date(until).getTime(), errorCode); },
    resumeEmailSending() { db.prepare('UPDATE email_control SET paused_until=0,next_slot=0,reason=NULL WHERE id=1').run(); },
    markSent(job, result) { return markSent.immediate(job, result); },
    retryJob(job, { nextAttemptAt, errorCode }) { return updateJob(job, "UPDATE email_jobs SET status='queued',next_attempt_at=?,last_error=?,lease_token=NULL,lease_until=NULL", [new Date(nextAttemptAt).getTime(), errorCode]); },
    deferJob(job, options) { return this.retryJob(job, options); },
    failJob(job, { errorCode }) { return updateJob(job, "UPDATE email_jobs SET status='failed',last_error=?,lease_token=NULL,lease_until=NULL", [errorCode]); },
    heartbeatJob(job, { leaseMs }) { return updateJob(job, 'UPDATE email_jobs SET lease_until=?', [now() + leaseMs]); },
    recordDelivery({ id, providerId, type }) {
      const state = DELIVERY_EVENTS[type];
      if (!state) return false;
      return db.transaction(() => {
        const inserted = db.prepare('INSERT OR IGNORE INTO delivery_events(id,provider_id,state,created_at) VALUES(?,?,?,?)').run(id, providerId, state, now()).changes;
        if (!inserted) return false;
        const row = db.prepare('SELECT id,delivery_state FROM email_jobs WHERE provider_id=?').get(providerId);
        if (row && deliveryRank[state] > deliveryRank[row.delivery_state]) db.prepare('UPDATE email_jobs SET delivery_state=? WHERE id=?').run(state, row.id);
        return true;
      }).immediate();
    },
    stats() {
      const counts = { queued: 0, processing: 0, sent: 0, failed: 0 };
      for (const row of db.prepare('SELECT status,count(*) AS n FROM email_jobs GROUP BY status').all()) counts[row.status] = row.n;
      const oldest = db.prepare("SELECT MIN(created_at) AS age FROM email_jobs WHERE status IN ('queued','processing')").get().age;
      const deliveries = Object.fromEntries(db.prepare('SELECT delivery_state,count(*) AS n FROM email_jobs GROUP BY delivery_state').all().map(row => [row.delivery_state, row.n]));
      const control = db.prepare('SELECT paused_until AS pausedUntil,reason FROM email_control WHERE id=1').get();
      let diskFreeBytes = null, databaseBytes = 0, backupBytes = 0;
      try {
        const disk = fs.statfsSync(path.dirname(filename));
        diskFreeBytes = disk.bavail * disk.bsize;
        for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(filename + suffix)) databaseBytes += fs.statSync(filename + suffix).size;
        const backups = path.join(path.dirname(filename), 'backups');
        if (fs.existsSync(backups)) for (const name of fs.readdirSync(backups)) {
          const file = path.join(backups, name);
          if (fs.statSync(file).isFile()) backupBytes += fs.statSync(file).size;
        }
      } catch { /* Operational metrics can omit filesystem details if unavailable. */ }
      return { leads: db.prepare('SELECT count(*) AS n FROM leads').get().n, jobs: counts, deliveries, diskFreeBytes, databaseBytes, backupBytes, oldestPendingAgeMs: oldest === null ? 0 : Math.max(0, now() - oldest), ...control };
    },
    cleanup() {
      const timestamp = now(), before = timestamp - config.retentionDays * 86400000;
      return db.transaction(() => {
        db.prepare('DELETE FROM rate_limits WHERE expires_at<?').run(timestamp);
        db.prepare('DELETE FROM delivery_events WHERE created_at<?').run(timestamp - 30 * 86400000);
        return db.prepare("DELETE FROM leads WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM email_jobs WHERE lead_id=leads.id AND status IN ('queued','processing'))").run(before).changes;
      }).immediate();
    },
    async backup(destination) {
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      const target = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
      if (target === publicDirectory || target.startsWith(publicDirectory + path.sep) || fs.existsSync(target)) throw new Error('Use a new backup filename outside public dist/');
      const temporary = path.join(path.dirname(target), '.backup-tmp-' + randomUUID());
      try {
        await db.backup(temporary);
        fs.chmodSync(temporary, 0o600);
        // A hard link publishes the completed file atomically without replacing a
        // destination created while the SQLite backup was running.
        fs.linkSync(temporary, target);
        fs.unlinkSync(temporary);
        return target;
      } catch (error) {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        throw error;
      }
    },
    close() { if (db.open) { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } },
  };
}
