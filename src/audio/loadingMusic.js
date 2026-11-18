// Loading-screen music (user, Nov 18): "Sleepwalking (Instrumental)" by Mindme (Epidemic Sound, licensed by the project
// owner for the web build). Only the section from the first drop to where that intensity ends plays, looped seamlessly:
// loading_loop.flac is that exact cut of loading_mindme_sleepwalking.mp3 (25.4904 s .. 49.7942 s = 16 bars at 158 BPM,
// measured from the file: the drop's first sample and the downbeat 64 beats later). Lossless, so the loop has no codec
// padding gap; an AudioBufferSourceNode loops it sample-accurately.
//   start(game)  fade in (no-op when muted, already playing or the music setting is off)
//   stop(game)   fade out and free the buffer
const URL_ = '/assets/audio/music/theme/loading_loop.flac';
let buf = null, pending = null, src = null, g = null, token = 0, own = null, who = null;
// the first loading screen runs before game.audio exists: use a private AudioContext until then (and keep using the one that started the loop)
const getCtx = (game) => game?.audio?.ctx || own || (own = new (window.AudioContext || window.webkitAudioContext)());
let usedCtx = null;
const vol = (game, st) => { const s = st || game.settings; const get = (k, d) => { try { const v = s?.get?.(k); return typeof v === 'number' ? v : d; } catch (e) { return d; } }; return get('volMaster', 0.9) * get('volMusic', 0.8); };
function preload(ctx) { if (buf) return Promise.resolve(buf); if (!pending) pending = fetch(URL_).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => (buf = b)).catch((e) => { console.warn('[loadingMusic]', e); pending = null; return null; }); return pending; }
export async function start(game, { gain = 1.1, settings = null, owner = 'front' } = {}) {
  if (src) { who = owner; return; } // already playing (the boot screen's loop carries on into the next loading screen)
  let ctx; try { ctx = getCtx(game); } catch (e) { return; } if (!ctx) return;
  if (typeof location !== 'undefined' && /[?&]mute=1\b/.test(location.search)) return;
  try { if ((settings || game.settings)?.get?.('menuMusic') === false) return; } catch (e) { /* */ }
  const my = ++token; await preload(ctx); if (!buf || my !== token || src) return;
  usedCtx = ctx; who = owner;
  try { if (ctx.state === 'suspended') await ctx.resume(); } catch (e) { /* */ }
  g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
  src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = buf.duration; src.connect(g);
  src.start(); g.gain.setTargetAtTime(gain * vol(game, settings), ctx.currentTime, 0.12);
}
export function stop(game, fade = 1.2, only = null) {
  if (only && who !== only) return; // the boot screen only stops its own loop
  token++; const ctx = usedCtx || game?.audio?.ctx; if (!src || !ctx) return;
  const s = src, gg = g; src = null; g = null; const t = ctx.currentTime;
  try { gg.gain.cancelScheduledValues(t); gg.gain.setValueAtTime(gg.gain.value, t); gg.gain.linearRampToValueAtTime(0, t + fade); s.stop(t + fade + 0.05); } catch (e) { /* */ }
  s.onended = () => { try { s.disconnect(); gg.disconnect(); } catch (e) { /* */ } };
}
export function playing() { return !!src; }
