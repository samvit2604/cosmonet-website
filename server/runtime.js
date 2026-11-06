import fs from 'node:fs';
import path from 'node:path';

export function assertRenderDisk(config, env = process.env, mountInfo) {
  if (!config.production || env.RENDER !== 'true') return;
  const expected = path.resolve(env.PERSISTENT_MOUNT_PATH || '/var/data');
  if (config.dataDir !== expected && !config.dataDir.startsWith(expected + path.sep)) throw new Error('DATA_DIR must be on the configured persistent disk');
  const info = mountInfo ?? fs.readFileSync('/proc/self/mountinfo', 'utf8');
  const mounted = info.split('\n').some(line => {
    const [left, right] = line.split(' - ');
    const mount = left?.split(' ')[4], filesystem = right?.split(' ')[0];
    return mount === expected && !['tmpfs', 'ramfs', 'overlay'].includes(filesystem);
  });
  if (!mounted) throw new Error('Configured persistent disk is not mounted');
}
