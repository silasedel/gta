// Activities test driver: boots the game once in the shared test browser and then runs commands dropped into a folder.
//   node tools/v2/activities/repl.mjs [--dir /tmp/actrepl] [--q "&foo=1"] [--seconds 3000]
// Each command is a file <dir>/cmd-<n>.json: { js } (page expression, awaited) | { shot: 'path.png' } | { key: 'KeyE', hold?: ms }
// | { reload: true } | { sleep: ms } | { quit: true }. The result lands in <dir>/res-<n>.json; console errors since the last
// command are included. tools/v2/activities/do.mjs is the client.
import { withBrowser, startGame } from '../browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2), o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1];
const DIR = o.dir || (process.env.ACT_REPL || '/tmp/actrepl');
fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { force: true });
const URL = 'http://127.0.0.1:5200/?mute' + (o.q || '');
await withBrowser({ width: +(o.w || 1280), height: +(o.h || 720), maxSeconds: +(o.seconds || 3000) }, async (b) => {
  const boot = async () => { await b.goto(URL); await startGame(b); await b.sleep(1500); };
  await boot();
  fs.writeFileSync(path.join(DIR, 'ready'), '1');
  console.log('[repl] ready');
  let seen = 0;
  for (;;) {
    const files = fs.readdirSync(DIR).filter((f) => /^cmd-\d+\.json$/.test(f)).sort((x, y) => +x.match(/\d+/)[0] - +y.match(/\d+/)[0]);
    if (!files.length) { await b.sleep(150); continue; }
    for (const f of files) {
      const n = f.match(/\d+/)[0];
      let c; try { c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { await b.sleep(50); continue; }
      fs.rmSync(path.join(DIR, f), { force: true });
      const out = { ok: true };
      try {
        if (c.quit) { fs.writeFileSync(path.join(DIR, `res-${n}.json`), '{"ok":true}'); return; }
        if (c.reload) await boot();
        if (c.sleep) await b.sleep(c.sleep);
        if (c.key) { await b.key(c.key, true, c.char || ''); await b.sleep(c.hold || 90); await b.key(c.key, false, c.char || ''); }
        if (c.js) out.value = await b.eval(c.js, c.timeout || 120000);
        if (c.shot) { await b.screenshot(c.shot); out.shot = c.shot; }
      } catch (e) { out.ok = false; out.error = String(e.message || e).slice(0, 2000); }
      out.errors = b.errors.slice(seen); seen = b.errors.length;
      fs.writeFileSync(path.join(DIR, `res-${n}.json`), JSON.stringify(out));
    }
  }
});
