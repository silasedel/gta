// r2-art: per-material runtime calibration to the shared style ranges (docs/v2/briefs/ART_STYLE.md, ./ranges.json).
// Library models arrive with every exporter's idea of PBR: metalness 1 on stucco, roughness 0 on asphalt, 98% white
// "marble", 0.5 gray glass at roughness 1. calibrate(m) classifies a material by its name (+ texture name + a hint such as
// the model file), measures its texture means once (32 px canvas), and moves only what is OUTSIDE its class range back to
// the nearest edge: albedo gain on .color (luminance and saturation), effective roughness and metalness (scalar x map mean),
// normalScale cap, envMapIntensity, and glass made dielectric. Values inside the range are the artist's: untouched.
//   calibrate(m, { hint, cls, fallback, vc, lift })  hint: source tag (userData.src); cls: force a class; fallback: class when
//                                                   the name says nothing; lift: false = never brighten (dark glass facades)
//  -> m.userData.artCal = { cls, gain, rough: [before, after], metal: [...], L: [...] }
// Off with ?artcal=0 (A/B).
import * as THREE from 'three';
import RANGES from './ranges.json';

const OFF = typeof location !== 'undefined' && /[?&]artcal=0\b/.test(location.search);
const CLS = RANGES.classify.map(([c, re]) => [c, new RegExp(re, 'i')]);
const METALLIC = /chrome|steel|iron|metal(?!.*paint)|alumin|copper|bronze|brass|zinc|galvan|tin\b|silver|gold(?!en)|nickel|corrugat/i;
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const satOf = (c) => { const s = c.map((v) => l2s(Math.max(0, v))); const mx = Math.max(...s), mn = Math.min(...s); return mx > 1e-4 ? (mx - mn) / mx : 0; };

const GEN = new Set(['generic', 'building']); // classes known only by their source (the name says nothing)
let cx = null; const texMean = new WeakMap();
// [linear mean rgb (sRGB-decoded for color maps), raw mean rgb] of the opaque texels, or null when unreadable
export function textureMean(t) {
  if (!t || !t.image) return null;
  if (texMean.has(t)) return texMean.get(t);
  let out = null;
  try {
    const im = t.image, w = im.width || 0, h = im.height || 0;
    if (w && h) {
      let d;
      if (im.data) d = im.data;
      else {
        if (!cx) { const cv = document.createElement('canvas'); cv.width = cv.height = 32; cx = cv.getContext('2d', { willReadFrequently: true }); }
        cx.clearRect(0, 0, 32, 32); cx.drawImage(im, 0, 0, 32, 32); d = cx.getImageData(0, 0, 32, 32).data;
      }
      const sc = d instanceof Uint8Array || d instanceof Uint8ClampedArray ? 255 : 1, n = d.length / 4, st = Math.max(1, Math.floor(n / 2048));
      const lin = [0, 0, 0], raw = [0, 0, 0]; let k = 0;
      for (let i = 0; i < n; i += st) {
        if (d[i * 4 + 3] / sc < 0.4) continue;
        for (let c = 0; c < 3; c++) { const v = d[i * 4 + c] / sc; raw[c] += v; lin[c] += s2l(v); }
        k++;
      }
      if (k) out = { lin: lin.map((v) => v / k), raw: raw.map((v) => v / k), srgb: t.colorSpace === THREE.SRGBColorSpace, w, h };
    }
  } catch (e) { out = null; }
  texMean.set(t, out); return out;
}
export function classify(text) {
  for (const [c, re] of CLS) if (re.test(text)) return c;
  return 'generic';
}
export function calibrate(m, { hint = '', cls = null, fallback = 'generic', vc = null, keepEnv = false, lift = true } = {}) {
  if (!m || OFF || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return m;
  if (m.userData.artCal) return m;
  const name = `${m.name || ''} ${m.map?.name || ''}`;
  let c = cls || (classify(name) !== 'generic' ? classify(name) : fallback);
  if (c === 'glass' && m.map) { const tm = textureMean(m.map); if (tm && lum(tm.srgb ? tm.lin : tm.raw) * Math.max(m.color?.r ?? 1, m.color?.g ?? 1, m.color?.b ?? 1) > 0.25) c = 'paintedWood'; } // a "Window" atlas of frames + panes
  if (hint && !m.userData.src) m.userData.src = hint;
  let R = RANGES.classes[c] || RANGES.classes.generic;
  const rep = { cls: c };
  m.userData.artCal = rep;
  const snap = () => ({ color: m.color ? m.color.clone() : null, roughness: m.roughness, metalness: m.metalness, env: m.envMapIntensity, ns: m.normalScale ? m.normalScale.clone() : null, roughnessMap: m.roughnessMap || null });
  const orig = snap();
  if (R.skip || m.emissiveMap || (m.emissive && Math.max(m.emissive.r, m.emissive.g, m.emissive.b) * (m.emissiveIntensity ?? 1) > 0.3)) return m;
  const std = m.isMeshStandardMaterial;
  const metalLike = METALLIC.test(name);
  // ---- metalness: 0 or 1 (dielectric unless the class / name says bare metal) ----
  if (std) {
    const mm = m.metalnessMap ? textureMean(m.metalnessMap) : null, mMean = mm ? mm.raw[2] : 1;
    const eff = m.metalness * mMean, before = eff;
    if (c === 'glass') m.metalness = Math.min(m.metalness, 0.05 / Math.max(mMean, 0.05));
    else if (R.metal[1] <= 0.4 && !(GEN.has(c) && metalLike)) {
      if (eff > R.metal[1]) m.metalness = m.metalnessMap && mMean <= 0.5 ? m.metalness : 0; // a full-white metal mask on stucco is an exporter default, not a mask
    } else if (GEN.has(c) && !metalLike && !m.metalnessMap && (eff > 0.15 && (eff < 0.85 || m.roughness * 1 >= 0.6))) m.metalness = 0; // in-between, or "metal" at roughness 0.6+ with no mask: an exporter default
    else if ((c === 'galvanized' || c === 'chrome') && eff < 0.5) c = 'metalPainted'; // named metal but authored dielectric: painted metal
    rep.metal = [+before.toFixed(2), +(m.metalness * mMean).toFixed(2)];
    // what stays bare metal follows the bare-metal rows (a 0.1 "chrome" or roughness-1 aluminum reads as black plastic)
    if (GEN.has(c) && m.metalness * mMean >= 0.5) c = 'galvanized';
  }
  R = RANGES.classes[c] || RANGES.classes.generic; rep.cls = c;
  // ---- roughness (effective) into the class range ----
  if (std) {
    const rm = m.roughnessMap ? textureMean(m.roughnessMap) : null, rMean = rm ? Math.max(rm.raw[1], 0.02) : 1;
    let lo = R.rough[0], hi = R.rough[1];
    if (c === 'glass') { m.roughnessMap = null; m.roughness = Math.min(Math.max(m.roughness, 0.05), 0.1); rep.rough = [null, m.roughness]; }
    else {
      const eff = m.roughness * rMean, t = Math.min(hi, Math.max(lo, eff));
      if (Math.abs(t - eff) > 0.02) m.roughness = Math.min(t / rMean, 1.6);
      rep.rough = [+eff.toFixed(2), +(m.roughness * rMean).toFixed(2)];
    }
  }
  // ---- albedo: luminance into range, saturation under the cap (gain on .color; texture untouched) ----
  const tm0 = m.map ? textureMean(m.map) : null;
  if (m.map && !tm0) rep.noTex = true; // map not decoded yet (or unreadable): albedo left alone rather than guessed
  if (m.color && !(m.map && !tm0)) {
    const tm = tm0;
    const t = tm ? (tm.srgb ? tm.lin : tm.raw) : [1, 1, 1];
    const v = vc || [1, 1, 1];
    const mean = [0, 1, 2].map((i) => m.color.toArray()[i] * t[i] * v[i]);
    let L = lum(mean); const L0 = L;
    if (c === 'glass') {
      // exterior windows: dark base (the env reflection does the rest); keep the hue
      if (L > 0.07) { const g = 0.05 / L; m.color.multiplyScalar(g); }
      if (std && !keepEnv) m.envMapIntensity = Math.min(Math.max(m.envMapIntensity ?? 1, 1.1), 1.4);
      rep.L = [+L0.toFixed(3), +lum(mean.map((x) => x * Math.min(1, 0.05 / Math.max(L, 1e-4)))).toFixed(3)];
    } else if (L > 1e-4) {
      let gain = [1, 1, 1];
      const sat = satOf(mean);
      if (sat > R.sat + 0.02) { // pull the mean toward its own gray until the cap holds
        let k = 1; for (let it = 0; it < 12; it++) { k *= 0.9; const q = mean.map((x) => L + (x - L) * k); if (satOf(q) <= R.sat) break; }
        const q = mean.map((x) => Math.max(1e-4, L + (x - L) * k)); gain = gain.map((g, i) => g * q[i] / Math.max(mean[i], 1e-4));
      }
      const target = Math.min(R.lum[1], Math.max(lift ? R.lum[0] : 0, L));
      if (Math.abs(Math.log(target / L)) > 0.04) { const g = Math.min(2.4, Math.max(0.3, target / L)); gain = gain.map((x) => x * g); }
      if (gain.some((g) => Math.abs(g - 1) > 0.01)) {
        m.color.setRGB(m.color.r * gain[0], m.color.g * gain[1], m.color.b * gain[2]);
        rep.gain = gain.map((g) => +g.toFixed(2));
      }
      rep.L = [+L0.toFixed(3), +lum(mean.map((x, i) => x * gain[i])).toFixed(3)];
    }
  }
  // ---- normal strength cap, env reflection range ----
  if (m.normalMap && m.normalScale && m.normalScale.x > R.normal[1] * 1.1) { const k = R.normal[1] / m.normalScale.x; m.normalScale.multiplyScalar(k); rep.normal = +m.normalScale.x.toFixed(2); }
  if (std && !keepEnv && c !== 'glass' && R.env) {
    const e = m.envMapIntensity ?? 1, t = Math.min(R.env[1], Math.max(R.env[0], e));
    if (Math.abs(t - e) > 0.02) m.envMapIntensity = t;
  }
  m.needsUpdate = true;
  STATE.set(m, { orig, cal: snap() }); ALL.add(new WeakRef(m));
  return m;
}
// in-session A/B (tools/v2/art): globalThis.__artCal(false) restores every calibrated material's original values, true re-applies
const STATE = new WeakMap(), ALL = new Set();
function apply(m, v) {
  if (v.color && m.color) m.color.copy(v.color);
  if (v.roughness !== undefined) m.roughness = v.roughness;
  if (v.metalness !== undefined) m.metalness = v.metalness;
  if (v.env !== undefined) m.envMapIntensity = v.env;
  if (v.ns && m.normalScale) m.normalScale.copy(v.ns);
  if (m.roughnessMap !== v.roughnessMap) { m.roughnessMap = v.roughnessMap; m.needsUpdate = true; }
}
export function setArtCal(on) {
  let n = 0;
  for (const r of ALL) { const m = r.deref(); if (!m) { ALL.delete(r); continue; } const st = STATE.get(m); if (!st) continue; apply(m, on ? st.cal : st.orig); n++; }
  return n;
}
if (typeof globalThis !== 'undefined') globalThis.__artCal = setArtCal;
// one-line summary of every calibrated material under root (debug: game.artCal(root))
export function calReport(root) {
  const out = []; const seen = new Set();
  root.traverse((o) => { for (const m of [].concat(o.material || [])) { if (!m || seen.has(m) || !m.userData?.artCal) continue; seen.add(m); out.push({ name: m.name, src: m.userData.src || '', ...m.userData.artCal }); } });
  return out;
}
// a clone of a calibrated material (per-variant copies) follows the same A/B switch
export function trackClone(clone, src) { const st = STATE.get(src); if (st && clone !== src) { STATE.set(clone, st); ALL.add(new WeakRef(clone)); clone.userData.artCal = src.userData.artCal; } return clone; }
