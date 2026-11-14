// Offline render of one club DJ transition (silent): ?a=<id>&b=<id>&solo=A|B
import { createClubDJ } from './clubdj.js';

const q = new URLSearchParams(location.search);
const SR = 44100;

function toB64(buf) {
  const n = buf.length;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const o = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    o[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
    o[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
  }
  const bytes = new Uint8Array(o.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function run() {
  const lead = 16;
  const probe = new OfflineAudioContext(2, SR, SR);
  const dj0 = createClubDJ(probe);
  await dj0.ready;
  if (!dj0.available) throw new Error('no club library');
  const idx = await (await fetch('/assets/audio/music/club_licensed/index.json')).json();
  const A = idx.tracks.find((t) => t.id === q.get('a'));
  const B = idx.tracks.find((t) => t.id === q.get('b'));
  const beat = A.period;
  const dur = lead + 32 * beat + 8;
  const off = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const dj = createClubDJ(off);
  await dj.ready;
  const [ba, bb] = await Promise.all([dj._load(A), dj._load(B)]);
  const deckA = dj._play(A, ba, 0, A.transStart - lead);
  dj.out.connect(off.destination);
  const plan = dj._transition(B, bb, { now: 0 });
  const solo = q.get('solo');
  if (solo === 'A') plan.deckB.trim.gain.value = 0;
  if (solo === 'B') deckA.trim.gain.value = 0;
  const { deckA: _a, deckB: _b, ...info } = plan;
  const buf = await off.startRendering();
  let pk = 0;
  let clip = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > pk) pk = a;
      if (a >= 0.999) clip++;
    }
  }
  window.result = { a: A.id, b: B.id, plan: info, peakDb: 20 * Math.log10(pk + 1e-9), clip, dur };
  window.wav = toB64(buf);
  window.ready = true;
}
run().catch((e) => {
  window.failed = String(e && e.stack || e);
});
