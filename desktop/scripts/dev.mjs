#!/usr/bin/env node
// npm run desktop:dev  ->  fresh vite production build into desktop/dist/web, then run Electron on it (unpackaged).
// Extra arguments go to the app, for example:  npm run desktop:dev -- --ps-query=mute --ps-windowed
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appArgs = process.argv.slice(2);

const build = spawnSync(
  'nice',
  ['-n', '10', 'npx', 'vite', 'build', '--outDir', 'desktop/dist/web', '--emptyOutDir'],
  {
    cwd: ROOT,
    stdio: 'inherit',
  },
);
if (build.status !== 0) {
  process.exit(build.status || 1);
}

const r = spawnSync('npx', ['electron', 'desktop/app', ...appArgs], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(r.status || 0);
