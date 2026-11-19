// Client for repl.mjs: node tools/v2/activities/do.mjs '<js expression>' | --shot file.png [--js '...'] | --key KeyE | --reload | --quit
//   [--dir /tmp/actrepl] [--sleep ms] [--timeout s]
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2),
  o = {};
const rest = [];
for (let i = 0; i < a.length; i++) {
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    const v = a[i + 1];
    if (v === undefined || v.startsWith('--')) o[k] = true;
    else {
      o[k] = v;
      i++;
    }
  } else rest.push(a[i]);
}
const DIR = o.dir || process.env.ACT_REPL || '/tmp/actrepl';
const cmd = {};
if (rest.length) cmd.js = rest.join(' ');
if (o.js) cmd.js = o.js;
if (o.file) cmd.js = fs.readFileSync(o.file, 'utf8');
if (o.shot) cmd.shot = o.shot;
if (o.key) {
  cmd.key = o.key;
  if (o.hold) cmd.hold = +o.hold;
}
if (o.reload) cmd.reload = true;
if (o.quit) cmd.quit = true;
if (o.sleep) cmd.sleep = +o.sleep;
if (o.timeout) cmd.timeout = +o.timeout * 1000;
const n = Date.now() * 1000 + Math.floor(Math.random() * 1000);
fs.writeFileSync(path.join(DIR, `cmd-${n}.json.tmp`), JSON.stringify(cmd));
fs.renameSync(path.join(DIR, `cmd-${n}.json.tmp`), path.join(DIR, `cmd-${n}.json`));
const t0 = Date.now(),
  lim = +(o.timeout || 200) * 1000 + 30000;
for (;;) {
  const f = path.join(DIR, `res-${n}.json`);
  if (fs.existsSync(f)) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    fs.rmSync(f);
    const v = r.value;
    if (!r.ok) console.log('ERROR', r.error);
    else if (v !== undefined) console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 0));
    if (r.shot) console.log('shot', r.shot);
    if (r.errors?.length) console.log('CONSOLE ERRORS:', r.errors.slice(0, 8).join('\n'));
    break;
  }
  if (Date.now() - t0 > lim) {
    console.log('TIMEOUT');
    break;
  }
  await new Promise((r) => setTimeout(r, 120));
}
