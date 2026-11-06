import dotenv from 'dotenv';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { readConfig } from './config.js';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { createLogger } from './logger.js';
import { createEmailClient } from './email.js';
import { createOutboxWorker } from './worker.js';
import { assertRenderDisk } from './runtime.js';

dotenv.config({ quiet: true });
process.umask(0o077);
const logger = createLogger();

async function start() {
  const config = readConfig();
  assertRenderDisk(config);
  if (!fs.existsSync(path.join(config.distDir, 'index.html'))) throw new Error('Build dist/ before starting the service');
  const store = createStore({ filename: config.dbPath, config });
  let worker;
  if (config.formsAvailable && config.emailWorkerEnabled) {
    const emailClient = createEmailClient({ apiKey: config.resendApiKey, from: config.resendFrom, teamEmail: config.teamEmail, timeoutMs: config.providerTimeoutMs });
    worker = createOutboxWorker({ store, emailClient, concurrency: config.workerConcurrency, sendIntervalMs: config.sendIntervalMs, logger });
  }
  const app = createApp({ config, store, logger, wakeWorker: () => worker?.wake() });
  const server = http.createServer(app);
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  server.setTimeout(20000, socket => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
  worker?.start();
  logger('server_started', { code: config.formsAvailable ? 'forms_enabled' : 'preview_forms_unconfigured' });
  if (!config.production) process.stdout.write(`Cosmonet: http://localhost:${config.port}/\n`);
  const cleanTimer = setInterval(() => {
    try { store.cleanup(); } catch { logger('maintenance_error', { code: 'cleanup_failed' }); }
  }, 3600000);
  cleanTimer.unref();
  let backupActive = false;
  const backup = async () => {
    if (backupActive) return;
    backupActive = true;
    try {
      const directory = path.join(config.dataDir, 'backups');
      const destination = path.join(directory, 'enquiries-' + new Date().toISOString().slice(0, 10) + '.sqlite');
      if (!fs.existsSync(destination)) await store.backup(destination);
      const backups = fs.readdirSync(directory).filter(name => /^enquiries-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).sort();
      for (const name of backups.slice(0, -7)) fs.unlinkSync(path.join(directory, name));
    } catch { logger('backup_error', { code: 'backup_failed' }); }
    finally { backupActive = false; }
  };
  const backupTimer = setInterval(backup, 86400000);
  backupTimer.unref();
  let stopping = false;
  const shutdown = async reason => {
    if (stopping) return;
    stopping = true;
    logger('shutdown_started', { code: reason });
    app.locals.beginShutdown();
    clearInterval(cleanTimer); clearInterval(backupTimer);
    const hardStop = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 25000);
    const closed = new Promise(resolve => server.close(resolve));
    server.closeIdleConnections();
    try {
      const [, drained] = await Promise.all([closed, worker?.stop({ timeoutMs: 20000 }), app.locals.drainPending()]);
      if (drained?.active > 0 || drained?.settled === false) { logger('shutdown_forced', { code: 'sender_did_not_drain' }); process.exit(1); }
      while (backupActive) await new Promise(resolve => setTimeout(resolve, 25));
      store.close();
      clearTimeout(hardStop);
      logger('shutdown_complete');
      process.exitCode = reason === 'fatal' ? 1 : 0;
    } catch { clearTimeout(hardStop); process.exitCode = 1; }
  };
  process.on('SIGTERM', () => { void shutdown('sigterm'); });
  process.on('SIGINT', () => { void shutdown('sigint'); });
  process.on('uncaughtException', () => { logger('fatal_error', { code: 'uncaught_exception' }); void shutdown('fatal'); });
  process.on('unhandledRejection', () => { logger('fatal_error', { code: 'unhandled_rejection' }); void shutdown('fatal'); });
  if (config.production) void backup();
}

start().catch(() => { logger('startup_failed', { code: 'check_server_configuration_build_and_storage' }); process.exitCode = 1; });
