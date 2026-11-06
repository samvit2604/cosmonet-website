import dotenv from 'dotenv';
import path from 'node:path';
import { readConfig } from '../server/config.js';
import { createStore } from '../server/store.js';
dotenv.config({ quiet: true });
process.umask(0o077);
const config = readConfig(), command = process.argv[2];
const store = createStore({ filename: config.dbPath, config });
try {
  if (command === 'status') console.log(JSON.stringify(store.stats(), null, 2));
  else if (command === 'resume' && process.argv.includes('--confirm')) {
    store.resumeEmailSending(); console.log('Sender pause cleared. Queued jobs keep their original identity and retry limits.');
  } else if (command === 'backup') {
    const destination = process.argv[3];
    if (!destination || !path.isAbsolute(destination) || destination === config.dbPath) throw new Error('Use a distinct absolute backup filename');
    await store.backup(destination); console.log('Consistent SQLite backup created. Store a copy off this service for disaster recovery.');
  } else throw new Error('Use status, resume --confirm, or backup /absolute/file.sqlite');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store.close(); }
