import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
dotenv.config({ quiet: true });
const built = spawnSync('python3', ['build.py'], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status || 1);
await import('./index.js');
