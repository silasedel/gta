#!/usr/bin/env node
// Copy the owner's licensed club tracks (Epidemic Sound) from the git-ignored originals folder
// (public/assets/audio/music/club_licensed/originals/) into club_licensed/ under short names,
// then run the DJ analysis on new files.
// Picks up "Club Song <n> - Tag:Tag.mp3" and "ES_<Title> - <Artist>.mp3". Never moves or edits the originals.
// Usage: node tools/v2/sync-club-songs.mjs [--from DIR] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEST = path.join(ROOT, 'public/assets/audio/music/club_licensed');
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const FROM = fromIdx >= 0 ? args[fromIdx + 1] : path.join(DEST, 'originals');
const MATCH = /^(Club Song \d+.*|ES_.+)\.mp3(\.mp3)?$/i;

const slug = (name) => name
  .replace(/(\.mp3)+$/i, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') + '.mp3';

fs.mkdirSync(DEST, { recursive: true });
const srcMapPath = path.join(DEST, 'sources.json');
const srcMap = fs.existsSync(srcMapPath) ? JSON.parse(fs.readFileSync(srcMapPath, 'utf8')) : {};
let copied = 0;
for (const fn of fs.readdirSync(FROM)) {
  if (!MATCH.test(fn)) continue;
  const from = path.join(FROM, fn);
  const to = path.join(DEST, slug(fn));
  const st = fs.statSync(from);
  if (fs.existsSync(to) && fs.statSync(to).size === st.size) {
    srcMap[slug(fn)] = fn;
    continue;
  }
  fs.copyFileSync(from, to);
  srcMap[slug(fn)] = fn;
  copied++;
  console.log('copied', fn, '->', path.relative(ROOT, to));
}
fs.writeFileSync(srcMapPath, JSON.stringify(srcMap, null, 1));
console.log(`${copied} new file(s); ${Object.keys(srcMap).length} in the club library`);

const py = process.env.PYTHON || 'python3';
const r = spawnSync(py, [path.join(ROOT, 'tools/v2/club_analyze.py'), DEST, ...(args.includes('--force') ? ['--force'] : [])], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('analysis failed (needs python3 with numpy + scipy, and ffmpeg)');
  process.exit(1);
}
