#!/usr/bin/env node
// One-command desktop build:  npm run desktop:build
//   1. fresh vite production build into desktop/dist/web
//   2. electron-builder packs desktop/dist/mac-*/Port Solana.app and a .dmg (unsigned)
//   3. copies the .app to ~/Desktop/Port Solana.app when the Desktop folder exists
// Flags: --skip-web (reuse desktop/dist/web), --no-dmg (app folder only, faster), --no-copy
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));

function run(cmd, cmdArgs) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  });
  if (r.status !== 0) {
    console.error(`failed: ${cmd} ${cmdArgs.join(' ')}`);
    process.exit(r.status || 1);
  }
}

if (!args.has('--skip-web')) {
  run('nice', [
    '-n',
    '10',
    'npx',
    'vite',
    'build',
    '--outDir',
    'desktop/dist/web',
    '--emptyOutDir',
  ]);
}

const platformFlag = process.platform === 'darwin' ? '--mac' : process.platform === 'win32' ? '--win' : '--linux';
const builderArgs = [
  '-n',
  '10',
  'npx',
  'electron-builder',
  '--config',
  'desktop/electron-builder.config.cjs',
  platformFlag,
];
if (args.has('--no-dmg') && process.platform === 'darwin') {
  builderArgs.push('dir');
}
run('nice', builderArgs);

if (process.platform !== 'darwin') {
  process.exit(0);
}

const dist = path.join(ROOT, 'desktop/dist');
const macDir = fs.readdirSync(dist).find((d) => /^mac/.test(d) && fs.existsSync(path.join(dist, d, 'Port Solana.app')));
if (!macDir) {
  console.error('no Port Solana.app found in desktop/dist');
  process.exit(1);
}
const built = path.join(dist, macDir, 'Port Solana.app');
console.log(`\nBuilt: ${built}`);
for (const f of fs.readdirSync(dist)) {
  if (f.endsWith('.dmg')) {
    console.log(`DMG:   ${path.join(dist, f)}`);
  }
}

if (args.has('--no-copy')) {
  process.exit(0);
}
const desktop = path.join(os.homedir(), 'Desktop');
if (!fs.existsSync(desktop)) {
  console.log('No ~/Desktop folder; open the app from the path above.');
  process.exit(0);
}
const target = path.join(desktop, 'Port Solana.app');
fs.rmSync(target, {
  recursive: true,
  force: true,
});
// ditto keeps the bundle's symlinks, permissions and extended attributes intact.
run('ditto', [
  built,
  target,
]);
console.log(`Copied to ${target}`);
