import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { readConfig } from '../server/config.js';
import { createStore } from '../server/store.js';

const lead = () => ({
  name: 'Storage Test', company: 'Example Research', email: 'storage-test@example.com',
  service: 'Software development', interest: 'Startup', message: 'A durable enquiry for recovery tests.',
  campaign: { utm_source: 'storage-test' },
});
const metadata = () => ({ requestId: randomUUID(), payloadHash: randomUUID(), emailHash: randomUUID() });
const digest = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cosmonet-storage-')));
  const config = readConfig({
    NODE_ENV: 'test', DATA_DIR: path.join(directory, 'private'), TURNSTILE_REQUIRED: 'false',
    RESEND_FROM: 'Cosmonet <enquiries@notify.cosmonet.ai>',
  });
  config.distDir = path.join(directory, 'public');
  fs.mkdirSync(config.distDir, { mode: 0o700 });
  const stores = [];
  t.after(() => {
    for (const store of stores) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory, config,
    open(options = {}) {
      const store = createStore({ filename: config.dbPath, config, ...options });
      stores.push(store);
      return store;
    },
  };
}

function inspectBackup(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    return {
      integrity: db.pragma('quick_check', { simple: true }),
      leads: db.prepare('SELECT count(*) AS n FROM leads').get().n,
      jobs: db.prepare('SELECT count(*) AS n FROM email_jobs').get().n,
    };
  } finally { db.close(); }
}

test('committed WAL enquiry and both snapshots survive abrupt process termination', { timeout: 10_000 }, async t => {
  const f = fixture(t), meta = metadata();
  const code = `
    import { createStore } from ${JSON.stringify(new URL('../server/store.js', import.meta.url).href)};
    import { readConfig } from ${JSON.stringify(new URL('../server/config.js', import.meta.url).href)};
    const config = readConfig({ NODE_ENV: 'test', DATA_DIR: process.env.STORAGE_TEST_DIR,
      TURNSTILE_REQUIRED: 'false', RESEND_FROM: 'Cosmonet <enquiries@notify.cosmonet.ai>' });
    const store = createStore({ filename: config.dbPath, config });
    store.acceptLead(${JSON.stringify(lead())}, ${JSON.stringify(meta)});
    process.stdout.write('COMMITTED\\n');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, STORAGE_TEST_DIR: f.config.dataDir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', (exitCode, signal) => resolve({ exitCode, signal })));
  await new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => reject(new Error('Child did not commit before deadline')), 5000);
    const finish = fn => value => { clearTimeout(timer); fn(value); };
    child.once('error', finish(reject));
    child.once('exit', finish(() => reject(new Error(`Child exited before commit: ${stderr}`))));
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.includes('COMMITTED\n')) finish(resolve)();
    });
  });
  assert.equal(child.kill('SIGKILL'), true);
  assert.deepEqual(await exited, { exitCode: null, signal: 'SIGKILL' });
  assert.ok(fs.statSync(f.config.dbPath + '-wal').size > 0, 'WAL must contain the crash recovery state');
  const reopened = f.open();
  assert.equal(reopened.db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(reopened.db.pragma('synchronous', { simple: true }), 2);
  assert.equal(reopened.db.pragma('quick_check', { simple: true }), 'ok');
  assert.equal(reopened.stats().leads, 1);
  assert.equal(reopened.stats().jobs.queued, 2);
  assert.equal(reopened.acceptLead(lead(), meta).duplicate, true);
  assert.equal(reopened.stats().leads, 1);
  const jobs = reopened.db.prepare('SELECT kind,payload FROM email_jobs ORDER BY kind').all();
  assert.deepEqual(jobs.map(row => row.kind), ['ack', 'team']);
  assert.ok(jobs.every(row => JSON.parse(row.payload).text.includes('COS-')));
});

test('independent connections serialize admissions, claims and durable provider pacing', t => {
  const f = fixture(t);
  let clock = Date.UTC(2026, 10, 6);
  const a = f.open({ now: () => clock }), b = f.open({ now: () => clock });
  const meta = metadata(), accepted = a.acceptLead(lead(), meta);
  assert.equal(b.acceptLead(lead(), meta).id, accepted.id);
  assert.throws(() => b.acceptLead(lead(), { ...meta, payloadHash: 'changed' }), { code: 'idempotency_conflict' });
  assert.equal(b.stats().leads, 1);
  const first = a.claimJob({ leaseMs: 60_000 }), second = b.claimJob({ leaseMs: 60_000 });
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.leaseToken, second.leaseToken);
  assert.equal(a.claimJob({ leaseMs: 60_000 }), null);
  assert.equal(a.reserveEmailSlot({ intervalMs: 600 }).allowed, true);
  assert.equal(b.reserveEmailSlot({ intervalMs: 600 }).allowed, false);
  b.pauseEmailSending({ until: new Date(clock + 60_000), errorCode: 'provider_http_429' });
  a.close(); b.close();
  const reopened = f.open({ now: () => clock });
  assert.deepEqual(reopened.reserveEmailSlot({ intervalMs: 600 }), { allowed: false, nextAttemptAt: new Date(clock + 60_000) });
  assert.equal(reopened.stats().reason, 'provider_http_429');
  clock += 60_000;
  assert.equal(reopened.reserveEmailSlot({ intervalMs: 600 }).allowed, true);
});

test('reclaimed leases preserve first attempt and fence every stale mutation', t => {
  const f = fixture(t);
  let clock = 1_000;
  const a = f.open({ now: () => clock }), b = f.open({ now: () => clock });
  a.acceptLead(lead(), metadata());
  const original = a.claimJob({ leaseMs: 100 });
  clock += 101;
  const reclaimed = b.claimJob({ leaseMs: 100 });
  assert.equal(reclaimed.id, original.id);
  assert.notEqual(reclaimed.leaseToken, original.leaseToken);
  assert.equal(reclaimed.attempts, 2);
  assert.equal(reclaimed.firstAttemptAt.getTime(), 1_000);
  assert.equal(a.markSent(original, { providerId: randomUUID() }), false);
  assert.equal(a.retryJob(original, { nextAttemptAt: new Date(clock), errorCode: 'stale' }), false);
  assert.equal(a.failJob(original, { errorCode: 'stale' }), false);
  assert.equal(a.heartbeatJob(original, { leaseMs: 100 }), false);
  assert.equal(b.heartbeatJob(reclaimed, { leaseMs: 200 }), true);
  assert.equal(b.markSent(reclaimed, { providerId: randomUUID() }), true);
  assert.equal(a.markSent(original, { providerId: randomUUID() }), false);
  assert.equal(a.stats().jobs.sent, 1);
});

test('persisted provider snapshots stay immutable across retries and sender changes', t => {
  const f = fixture(t), store = f.open(), data = lead();
  store.acceptLead(data, metadata());
  const expected = Object.fromEntries(store.db.prepare('SELECT kind,payload FROM email_jobs').all().map(row => [row.kind, JSON.parse(row.payload)]));
  data.name = 'Changed visitor data';
  f.config.resendFrom = 'Changed <new@notify.cosmonet.ai>';
  f.config.teamEmail = 'new-team@example.com';
  const first = store.claimJob({ leaseMs: 60_000 });
  assert.deepEqual(first.emailPayload, expected[first.kind]);
  assert.equal(first.payload.name, 'Storage Test');
  first.emailPayload.text = 'Changed claimed copy';
  assert.equal(store.retryJob(first, { nextAttemptAt: new Date(0), errorCode: 'provider_timeout' }), true);
  store.close();
  const reopened = f.open(), retried = reopened.claimJob({ leaseMs: 60_000 });
  assert.equal(retried.id, first.id);
  assert.deepEqual(retried.emailPayload, expected[first.kind]);
  assert.equal(retried.emailPayload.from, 'Cosmonet <enquiries@notify.cosmonet.ai>');
  assert.deepEqual(expected.team.to, ['hello@cosmonet.ai']);
  assert.doesNotMatch(expected.ack.text, /Storage Test|Example Research|storage-test@example/);
});

test('atomic backups are valid and never replace existing or concurrent destinations', async t => {
  const f = fixture(t), store = f.open();
  store.acceptLead(lead(), metadata());
  const destination = path.join(f.config.dataDir, 'backups', 'first.sqlite');
  assert.equal(await store.backup(destination), destination);
  assert.deepEqual(inspectBackup(destination), { integrity: 'ok', leads: 1, jobs: 2 });
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  const before = digest(destination);
  store.acceptLead(lead(), metadata());
  await assert.rejects(store.backup(destination));
  assert.equal(digest(destination), before);
  const concurrent = path.join(f.config.dataDir, 'backups', 'concurrent.sqlite');
  const results = await Promise.allSettled([store.backup(concurrent), store.backup(concurrent)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.deepEqual(inspectBackup(concurrent), { integrity: 'ok', leads: 2, jobs: 4 });
  assert.deepEqual(fs.readdirSync(path.dirname(destination)).filter(name => !/-(wal|shm)$/.test(name)).sort(), ['concurrent.sqlite', 'first.sqlite']);
});

test('failed backup removes partial temporary data and retains the last good backup', async t => {
  const f = fixture(t), store = f.open();
  store.acceptLead(lead(), metadata());
  const good = path.join(f.config.dataDir, 'backups', 'good.sqlite');
  await store.backup(good);
  const before = digest(good), originalBackup = store.db.backup;
  store.db.backup = async temporary => {
    fs.writeFileSync(temporary, 'partial backup');
    throw Object.assign(new Error('Simulated disk exhaustion'), { code: 'ENOSPC' });
  };
  const failed = path.join(f.config.dataDir, 'backups', 'failed.sqlite');
  try { await assert.rejects(store.backup(failed), { code: 'ENOSPC' }); }
  finally { store.db.backup = originalBackup; }
  assert.equal(fs.existsSync(failed), false);
  assert.equal(digest(good), before);
  assert.deepEqual(inspectBackup(good), { integrity: 'ok', leads: 1, jobs: 2 });
  assert.deepEqual(fs.readdirSync(path.dirname(good)).filter(name => !/-(wal|shm)$/.test(name)), ['good.sqlite']);
  assert.equal(store.stats().leads, 1);
});

test('private storage permissions and real paths prevent public or symlink database exposure', async t => {
  const f = fixture(t), store = f.open();
  assert.equal(fs.statSync(f.config.dbPath).mode & 0o777, 0o600);
  assert.equal(fs.statSync(f.config.dataDir).mode & 0o777, 0o700);
  assert.throws(() => f.open({ filename: path.join(f.config.distDir, 'enquiries.sqlite') }), /public dist/);
  const publicAlias = path.join(f.directory, 'public-alias');
  fs.symlinkSync(f.config.distDir, publicAlias, 'dir');
  assert.throws(() => f.open({ filename: path.join(publicAlias, 'nested', 'enquiries.sqlite') }), /public dist/);
  const databaseAlias = path.join(f.config.dataDir, 'alias.sqlite');
  fs.symlinkSync(f.config.dbPath, databaseAlias, 'file');
  assert.throws(() => f.open({ filename: databaseAlias }), /symbolic link/);
  await assert.rejects(store.backup(path.join(f.config.distDir, 'backup.sqlite')), /outside public dist/);
  await assert.rejects(store.backup(path.join(publicAlias, 'backup.sqlite')), /outside public dist/);
  assert.equal(fs.existsSync(path.join(f.config.distDir, 'enquiries.sqlite')), false);
  assert.equal(fs.existsSync(path.join(f.config.distDir, 'backup.sqlite')), false);
});
