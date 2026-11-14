// Shared helpers for the scripted police scenarios (full game through the V2 test browser).
import { withBrowser, GAME_READY } from '../../../../tools/v2/browser.mjs';
export const URL = 'http://127.0.0.1:5200/?mute';
export const SHOTS = 'docs/v2/shots/police/';
export async function run(name, fn, o = {}) {
  let fails = 0; const out = [];
  await withBrowser({ width: o.w || 1280, height: o.h || 720, maxSeconds: o.max || 230 }, async (b) => {
    await b.goto(o.url || URL); await b.waitFor(GAME_READY, 150);
    await b.key('Enter'); await b.key('Enter', false); await b.sleep(900);
    await b.eval(`(() => { window.__t = {
      W: game.wanted, G: game.gameplay.G, P: game.player,
      snap() { const s = game.wanted.snapshot(); return { level: game.wanted.level, phase: game.wanted.phase, seen: game.wanted.seen, facts: s.facts.map(f => f.key), outdated: s.outdated.map(f => f.key), pending: s.sources.pending.map(p => p.id + (p.hold ? ':held' : '')), cameras: s.sources.cameras.length, witnesses: s.sources.witnesses.length, desc: game.wanted.description(), units: game.police.units.filter(u => u.active && !u.dead).length, cars: game.police.cars.length, hud: window.__evidenceHud ? window.__evidenceHud.state() : null }; },
      wait(ms) { return new Promise(r => setTimeout(r, ms)); },
      async until(f, ms = 20000) { const t = performance.now(); while (performance.now() - t < ms) { if (f()) return true; await new Promise(r => setTimeout(r, 100)); } return false; },
    }; return true; })()`);
    const api = {
      b, ev: (js, ms) => b.eval(js, ms), snap: async () => JSON.parse(await b.eval('JSON.stringify(__t.snap())')),
      ok(c, m, extra) { if (!c) fails++; const line = `${c ? 'ok  ' : 'FAIL'} ${m}${extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`; out.push(line); console.log(line); },
      shot: (n) => b.screenshot(SHOTS + n + '.png'),
    };
    await fn(api);
    const errs = [...new Set(b.errors)].filter((e) => !/favicon/.test(e));
    if (errs.length) console.log('CONSOLE ERRORS', errs.slice(0, 12));
    const warns = b.logs.filter((l) => /^warning: \[gameplay\]/.test(l)); if (warns.length) console.log('GAMEPLAY WARNINGS', [...new Set(warns)].slice(0, 12));
  });
  console.log(`${name}: ${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  return { fails, out };
}
