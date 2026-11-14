// Port Solana V2 — Nico facial animation (CHARACTER track): blinking, eye tracking with saccades, expressions and lip movement.
// Morph targets are the 34 MakeHuman expression units (CC0) exported by the pipeline; expressions and visemes are our own mixes.
import * as THREE from 'three';

export const EXPRESSIONS = {
  neutral: {},
  smile: { 'mouth-corner-puller': 0.75, 'mouth-elevation': 0.25, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25, 'nose-left-elevation': 0.1, 'nose-right-elevation': 0.1 },
  grin: { 'mouth-corner-puller': 1.0, 'mouth-part-later': 0.5, 'mouth-open': 0.12, 'eye-left-slit': 0.4, 'eye-right-slit': 0.4 },
  smirk: { 'mouth-corner-puller': 0.35, 'mouth-retraction': 0.2, 'eyebrows-left-up': 0.35 },
  angry: { 'eyebrows-left-down': 1, 'eyebrows-right-down': 1, 'nose-compression': 0.5, 'mouth-compression': 0.5, 'mouth-depression': 0.3, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3 },
  surprised: { 'eyebrows-left-up': 0.9, 'eyebrows-right-up': 0.9, 'eye-left-opened-up': 0.9, 'eye-right-opened-up': 0.9, 'mouth-open': 0.3 },
  afraid: { 'eyebrows-left-inner-up': 1, 'eyebrows-right-inner-up': 1, 'eye-left-opened-up': 0.7, 'eye-right-opened-up': 0.7, 'mouth-part-later': 0.5, 'mouth-retraction': 0.4, 'neck-platysma': 0.5 },
  sad: { 'eyebrows-left-inner-up': 0.8, 'eyebrows-right-inner-up': 0.8, 'mouth-depression': 0.6, 'eye-left-slit': 0.2, 'eye-right-slit': 0.2 },
  pain: { 'eyebrows-left-down': 0.8, 'eyebrows-right-down': 0.8, 'eye-left-closure': 0.7, 'eye-right-closure': 0.7, 'mouth-retraction': 0.7, 'mouth-part-later': 0.6, 'nose-compression': 0.7, 'neck-platysma': 0.6 },
  focus: { 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3, 'mouth-compression': 0.2 },
  effort: { 'eyebrows-left-down': 0.5, 'eyebrows-right-down': 0.5, 'mouth-part-later': 0.4, 'mouth-open': 0.18, 'nose-left-dilatation': 0.6, 'nose-right-dilatation': 0.6 },
  suspicious: { 'eyebrows-left-down': 0.65, 'eyebrows-right-up': 0.12, 'eye-left-slit': 0.5, 'eye-right-slit': 0.3, 'mouth-compression': 0.3, 'mouth-corner-puller': 0.08 },
  squint: { 'eye-left-slit': 0.7, 'eye-right-slit': 0.7, 'eyebrows-left-down': 0.3, 'eyebrows-right-down': 0.3 },
};
// mouth shapes for speech (our own mixes of the action units)
export const VISEMES = {
  rest: {}, AA: { 'mouth-open': 0.55 }, EE: { 'mouth-open': 0.16, 'mouth-corner-puller': 0.45, 'mouth-part-later': 0.4 }, IH: { 'mouth-open': 0.25, 'mouth-part-later': 0.3 },
  OH: { 'mouth-open': 0.38, 'mouth-pursing': 0.55 }, OO: { 'mouth-open': 0.14, 'mouth-pursing': 0.8, 'mouth-protusion': 0.6 },
  MBP: { 'mouth-compression': 0.7 }, FV: { 'mouth-open': 0.08, 'mouth-upward-retraction': 0.5, 'mouth-depression-retraction': 0.2 }, L: { 'mouth-open': 0.26, 'mouth-parling': 0.4 },
  S: { 'mouth-open': 0.07, 'mouth-part-later': 0.45, 'mouth-retraction': 0.2 }, W: { 'mouth-open': 0.10, 'mouth-pursing': 0.9 }, TH: { 'mouth-open': 0.18, 'mouth-parling': 0.3 },
};
// Nico's resting face (ref_48): heavy upper lids over deep-set eyes, low brows, a slightly set mouth. Expressions and
// speech add on top of it; the lids still blink fully.
export const REST_FACE = {
  'eye-left-closure': 0.34,
  'eye-right-closure': 0.34,
  'eye-left-slit': 0.22,
  'eye-right-slit': 0.22,
  'eyebrows-left-down': 0.32,
  'eyebrows-right-down': 0.32,
  'mouth-compression': 0.12,
  'mouth-depression': 0.08,
};
const LETTER = { a: 'AA', e: 'EE', i: 'IH', o: 'OH', u: 'OO', m: 'MBP', b: 'MBP', p: 'MBP', f: 'FV', v: 'FV', l: 'L', s: 'S', z: 'S', c: 'S', t: 'S', d: 'S', n: 'L', r: 'OH', w: 'W', q: 'W', y: 'EE', h: 'AA', g: 'IH', k: 'IH', j: 'S', x: 'S' };
export function textToVisemes(text, rate = 13) {            // -> [{ v, t }] at ~13 phonemes per second, pauses on punctuation
  const out = []; let t = 0;
  for (const ch of String(text).toLowerCase()) {
    if (LETTER[ch]) { const v = LETTER[ch]; if (!out.length || out[out.length - 1].v !== v) out.push({ v, t }); t += 1 / rate; }
    else if (ch === ' ') { t += 0.4 / rate; } else if (/[.,;:!?]/.test(ch)) { out.push({ v: 'rest', t }); t += 0.28; }
  }
  out.push({ v: 'rest', t }); return { keys: out, duration: t + 0.15 };
}

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
export function createFace({ model, meta, faceMeshes, eyes, bone, mouth, skin }) {
  const head = bone('Head'), jaw = bone('Jaw'), eb = { L: bone('EyeL'), R: bone('EyeR') };
  model.updateMatrixWorld(true);
  const mInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const Hr = head ? mInv.clone().multiply(head.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Quaternion();
  const Er = {}; for (const s of 'LR') if (eb[s]) Er[s] = mInv.clone().multiply(eb[s].getWorldQuaternion(new THREE.Quaternion()));
  const HrInv = Hr.clone().invert();
  const jawRest = jaw ? jaw.quaternion.clone() : null;
  // jaw hinge = the character's left-right axis expressed in the jaw's parent (head) space
  const jawAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(HrInv).normalize();
  const W = {};                                               // current morph weights
  const st = { blinkT: 1.5 + Math.random() * 2, blink: 0, blinkPhase: 0, yaw: 0, pitch: 0, sacT: 0, sacY: 0, sacP: 0, expr: {}, exprTarget: {}, exprRate: 6, speech: null, speechT: 0, vis: {}, idleT: 0, pupil: 0.30 };
  const setMorph = (name, v) => { for (const m of faceMeshes) { const i = m.morphTargetDictionary?.[name]; if (i !== undefined) m.morphTargetInfluences[i] = v; } };
  const names = meta.morphs.expression;
  const face = {
    lookTarget: null, expressions: Object.keys(EXPRESSIONS), visemes: Object.keys(VISEMES), state: st,
    setExpression(e, rate = 6) { st.exprTarget = typeof e === 'string' ? (EXPRESSIONS[e] || {}) : (e || {}); st.exprRate = rate; face.expression = typeof e === 'string' ? e : 'custom'; },
    blink() { if (st.blinkPhase === 0) st.blinkPhase = 0.0001; },
    // say('Hey, you got a light?') moves the lips for the text; say(seconds) babbles for that long. Returns the duration.
    say(textOrSeconds, opts = {}) {
      const seq = typeof textOrSeconds === 'number' ? textToVisemes('a lo me va so te ni po ra '.repeat(Math.ceil(textOrSeconds / 1.9)).slice(0, Math.round(textOrSeconds * 13))) : textToVisemes(textOrSeconds, opts.rate || 13);
      st.speech = seq; st.speechT = 0; return seq.duration;
    },
    get speaking() { return !!st.speech; },
    update(dt, o = {}) {
      st.idleT += dt;
      // ---- blink (both lids, 60 ms down, 110 ms up; more often when speaking; held shut when dead)
      st.blinkT -= dt;
      if (st.blinkT <= 0 && st.blinkPhase === 0) { st.blinkPhase = 0.0001; st.blinkT = 2.2 + Math.random() * 4.2 - (st.speech ? 1 : 0); if (Math.random() < 0.15) st.blinkT = 0.25; }
      if (st.blinkPhase > 0) { st.blinkPhase += dt; const p = st.blinkPhase; st.blink = p < 0.06 ? p / 0.06 : p < 0.09 ? 1 : Math.max(0, 1 - (p - 0.09) / 0.11); if (p > 0.2) { st.blinkPhase = 0; st.blink = 0; } }
      if (o.dead) st.blink = Math.min(1, st.blink + dt * 3);
      // ---- gaze: eyes lead, clamp, micro-saccades
      let ty = 0, tp = 0;
      const target = o.lookAt;
      if (target && head && !o.dead) {
        head.getWorldPosition(_v); _v.subVectors(target, _v);
        _v.applyQuaternion(_q.copy(head.getWorldQuaternion(_q2)).invert()).applyQuaternion(Hr).normalize();
        ty = THREE.MathUtils.clamp(Math.atan2(_v.x, _v.z), -0.62, 0.62); tp = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1)), -0.45, 0.36);
        if (_v.z < -0.2) { ty = 0; tp = 0; }
      }
      st.sacT -= dt; if (st.sacT <= 0) { st.sacT = 0.35 + Math.random() * 1.6; st.sacY = (Math.random() - 0.5) * (target ? 0.03 : 0.16); st.sacP = (Math.random() - 0.5) * (target ? 0.02 : 0.07); }
      const k = Math.min(1, dt * 22);
      st.yaw += (ty + st.sacY - st.yaw) * k; st.pitch += (tp + st.sacP - st.pitch) * k;
      for (const s of 'LR') {
        if (!eb[s]) continue;
        _e.set(-st.pitch, st.yaw + (s === 'L' ? -0.015 : 0.015), 0, 'YXZ'); _q.setFromEuler(_e);          // slight toe-in
        eb[s].quaternion.copy(HrInv).multiply(_q).multiply(Er[s]);
        const u = eyes[s]?.material?.userData?.u; if (u) { u.uEyeQ.value.set(_q.x, _q.y, _q.z, _q.w); u.uBlink.value = st.blink; u.uPupil.value = st.pupil; }
      }
      // ---- expression + speech -> morph weights
      const tgt = {}; const E = st.exprTarget;
      const restK = o.dead ? 0 : 1;
      for (const n in REST_FACE) tgt[n] = REST_FACE[n] * restK;
      for (const n in E) tgt[n] = Math.max(tgt[n] || 0, E[n]);
      if (o.effort && !Object.keys(E).length) for (const n in EXPRESSIONS.effort) tgt[n] = EXPRESSIONS.effort[n] * o.effort * 0.7;
      if (st.speech) {
        st.speechT += dt; const ks = st.speech.keys; let i = 0; while (i < ks.length - 1 && ks[i + 1].t <= st.speechT) i++;
        const a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)]; const f = b.t > a.t ? THREE.MathUtils.smoothstep((st.speechT - a.t) / (b.t - a.t), 0, 1) : 0;
        const va = VISEMES[a.v] || {}, vb = VISEMES[b.v] || {};
        for (const n in va) tgt[n] = Math.max(tgt[n] || 0, va[n] * (1 - f));
        for (const n in vb) tgt[n] = Math.max(tgt[n] || 0, (tgt[n] || 0), vb[n] * f + (va[n] || 0) * (1 - f));
        if (st.speechT > st.speech.duration) st.speech = null;
      } else if (o.speaking) { face.say(1.6); }
      const lidDown = Math.max(0, -st.pitch) * 0.9;                 // lids follow a downward gaze
      const r = Math.min(1, dt * (st.speech ? 20 : st.exprRate));
      let open = 0;
      for (const n of names) {
        let v = tgt[n] || 0;
        if (n === 'eye-left-closure' || n === 'eye-right-closure') v = Math.min(1, Math.max(v, st.blink, lidDown));
        const c = W[n] || 0; const nv = (n.startsWith('eye-') && n.endsWith('closure')) ? v : c + (v - c) * r;
        if (Math.abs(nv - c) > 1e-4 || (nv === 0 && c !== 0)) { W[n] = nv; setMorph(n, nv); }
        if (n === 'mouth-open') open = nv;
      }
      if (jaw) jaw.quaternion.copy(jawRest).multiply(_q.setFromAxisAngle(jawAxis, open * meta.jaw.openAngle));
      mouth.value = Math.max(open, (W['mouth-part-later'] || 0) * 0.4);
    },
    weights: W,
  };
  return face;
}
