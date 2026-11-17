// r2-water: the airboat (fan boat). Visual = the user's Boat 10 (Models/Boats/Boat 10 - Mini Fan Airboat, converted by
// tools/v2/water/airboat_convert.py: brand marks removed, 1.2x to a real 4.3 m boat, rigged 'airprop' / 'rudderL' / 'rudderR').
// This module: load + calibrate the model to the art style, animate prop and rudders, the blurred prop disc at speed, and
// the fan's own sound layer (blade-pass buzz + air roar on top of the engine voice the audio system already plays).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL_ = (import.meta.env?.BASE_URL || '/') + 'assets/vehicles/boats/airboat.glb';
// physics / gameplay spec (boats.js BOAT_TYPES shape). Local frame: +z bow, y = 0 at the design waterline.
export const AIRBOAT_SPEC = {
  brand: 'Sawtooth', name: 'Glade Runner 14', airboat: true, L: 3.64, W: 2.12, draft: 0.12, sheer: 0.36, bowRise: 0.0, mass: 560,
  thrust: 5400, vmax: 82, turn: 1.6, trimDeg: 2.5, engine: 'airboat', engines: 1, colors: [0x23402a], stripe: 0x101214,
  seat: [0, 0.86, -0.88], // driver's seat cushion (local)
  overall: 4.27,           // incl. the cage and rudders (stern overhang -2.45 .. +1.82 in model space)
};

let gltfP = null;
export function loadAirboat() {
  if (!gltfP) gltfP = new GLTFLoader().loadAsync(URL_).then((g) => { prepare(g.scene); return g.scene; }).catch((e) => { gltfP = null; throw e; });
  return gltfP;
}
// art-style calibration (docs/v2/briefs/ART_STYLE.md): painted aluminum hull, no roughness under 0.3, dielectric paint,
// sun-faded and dirty; a mud / tannin waterline band on the hull (object-space height), wire cage alpha-tested
function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material; if (!m || m.userData.r2water) return; m.userData.r2water = true;
    m.envMapIntensity = 0.85;
    if (m.name === 'cage') { m.alphaTest = 0.45; m.transparent = false; m.side = THREE.DoubleSide; m.alphaToCoverage = true; m.envMapIntensity = 0.7; o.castShadow = true; }
    else if (m.name === 'decal') { m.transparent = true; m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; m.roughness = 0.55; o.castShadow = false; }
    else {
      m.roughness = Math.max(m.roughness ?? 1, 0.42); m.color?.multiplyScalar(0.9);
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAbY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAbY = position.y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAbY;')
          .replace('#include <map_fragment>', '#include <map_fragment>\n{ float wl = 1.0 - smoothstep(0.08, 0.26, vAbY); diffuseColor.rgb *= mix(vec3(1.0), vec3(0.58, 0.55, 0.45), wl * 0.85); }');
      };
      m.customProgramCacheKey = () => 'r2water-airboat-hull';
    }
  });
}
// prop motion blur disc (radial, soft)
let discTex = null;
function propDisc(radius) {
  if (!discTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 63);
    gr.addColorStop(0, 'rgba(40,40,40,0.0)'); gr.addColorStop(0.15, 'rgba(60,60,58,0.55)'); gr.addColorStop(0.8, 'rgba(78,78,74,0.42)'); gr.addColorStop(0.93, 'rgba(120,120,112,0.5)'); gr.addColorStop(1, 'rgba(120,120,112,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); discTex = new THREE.CanvasTexture(c); discTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshStandardMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6, opacity: 0 });
  const d = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), m); d.name = 'propDisc'; d.renderOrder = 2; d.castShadow = false;
  return d;
}

// a drivable airboat's visual: returns { root, parts, update(b, dt) , dispose() }
export function buildAirboatVisual(src, spec = AIRBOAT_SPEC) {
  const root = src.clone(true);
  const parts = {}; root.traverse((o) => { if (o.name === 'airprop' || o.name === 'rudderL' || o.name === 'rudderR' || o.name === 'hull') parts[o.name] = o; });
  // blades get their own material copy so they can fade under the blur disc
  if (parts.airprop) {
    const bladeMats = new Map();
    parts.airprop.traverse((o) => { if (o.isMesh) { if (!bladeMats.has(o.material)) { const c = o.material.clone(); c.transparent = true; c.userData.r2water = true; bladeMats.set(o.material, c); } o.material = bladeMats.get(o.material); } });
    parts.bladeMats = [...bladeMats.values()];
    const disc = propDisc(0.9); parts.airprop.add(disc); parts.disc = disc;
  }
  const holder = new THREE.Group(); holder.name = 'airboatVisual';
  root.position.y = -spec.draft; // model keel at y = 0 -> boat frame keel at -draft
  holder.add(root);
  let spin = 0;
  return {
    root: holder, parts,
    update(b, dt) {
      const P = parts, rpm = b.rpm || 0;
      // prop: geared ~0.62 of engine rpm; blur disc fades in above ~600 prop rpm while the blades fade out
      const prpm = rpm * 0.62; spin += prpm / 60 * Math.PI * 2 * dt; if (spin > 1e4) spin -= Math.PI * 2 * 1000;
      if (P.airprop) P.airprop.rotation.z = spin % (Math.PI * 2);
      const blur = THREE.MathUtils.smoothstep(prpm, 500, 1300);
      if (P.disc) { P.disc.material.opacity = blur * 0.85; P.disc.visible = blur > 0.01; }
      if (P.bladeMats) for (const m of P.bladeMats) { m.opacity = 1 - blur * 0.82; m.depthWrite = blur < 0.3; }
      const st = b.steerF || 0, rud = -st * 0.55;
      if (P.rudderL) P.rudderL.rotation.y += (rud - P.rudderL.rotation.y) * Math.min(1, dt * 10);
      if (P.rudderR) P.rudderR.rotation.y += (rud - P.rudderR.rotation.y) * Math.min(1, dt * 10);
    },
    dispose() { if (parts.disc) { parts.disc.geometry.dispose(); parts.disc.material.dispose(); } for (const m of parts.bladeMats || []) m.dispose(); },
  };
}

// the fan's sound layer: blade-pass buzz (3 blades) + broadband air roar, positional for AI boats, muted with the game
export function createFanVoice(game) {
  const A = game.audio; const ctx = A?.ctx; if (!ctx) return null;
  const out = ctx.createGain(); out.gain.value = 0;
  const pan = ctx.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 6; pan.rolloffFactor = 1.1; pan.maxDistance = 600;
  out.connect(pan).connect(ctx.destination);
  const saw = ctx.createOscillator(); saw.type = 'sawtooth'; const sg = ctx.createGain(); sg.gain.value = 0;
  const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  saw.connect(bp).connect(sg).connect(out); saw.start();
  const len = ctx.sampleRate * 2, nb = ctx.createBuffer(1, len, ctx.sampleRate), ch = nb.getChannelData(0); let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = last * 0.92 + w * 0.08; ch[i] = last * 4; }
  const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.value = 0; ns.connect(nf).connect(ng).connect(out); ns.start();
  // the blade pass "chop" (amplitude modulation at the blade frequency)
  const am = ctx.createOscillator(); am.type = 'sine'; const amg = ctx.createGain(); amg.gain.value = 0; am.connect(amg).connect(ng.gain); am.start();
  let dead = false;
  return {
    update(b, isPlayer) {
      if (dead) return; const t = ctx.currentTime;
      const muted = A.muted || game.ui?.paused; const vols = A.busVolumes || {}; const vol = (vols.master ?? 1) * (vols.vehicles ?? 1);
      const prpm = (b.rpm || 0) * 0.62, f = Math.max(5, prpm / 60 * 3), thr = b.throttle || 0;
      saw.frequency.setTargetAtTime(f, t, 0.08); am.frequency.setTargetAtTime(f, t, 0.08);
      bp.frequency.setTargetAtTime(500 + prpm * 0.6, t, 0.1); nf.frequency.setTargetAtTime(300 + prpm * 0.35, t, 0.1);
      const on = b.engineOn ? 1 : 0, lvl = on * (0.18 + 0.82 * Math.min(1, prpm / 1600)) * (0.55 + 0.45 * thr);
      sg.gain.setTargetAtTime(lvl * 0.16, t, 0.1); ng.gain.setTargetAtTime(lvl * 0.5, t, 0.1); amg.gain.setTargetAtTime(lvl * 0.35, t, 0.1);
      out.gain.setTargetAtTime(muted ? 0 : vol * (isPlayer ? 0.55 : 1.0), t, 0.15);
      const p = b.mesh.position;
      if (isPlayer) { pan.positionX.setTargetAtTime(ctx.listener.positionX?.value ?? p.x, t, 0.05); pan.positionY.setTargetAtTime((ctx.listener.positionY?.value ?? p.y) + 1, t, 0.05); pan.positionZ.setTargetAtTime(ctx.listener.positionZ?.value ?? p.z, t, 0.05); }
      else { pan.positionX.setTargetAtTime(p.x, t, 0.05); pan.positionY.setTargetAtTime(p.y + 1.2, t, 0.05); pan.positionZ.setTargetAtTime(p.z, t, 0.05); }
    },
    stop() { if (dead) return; dead = true; try { saw.stop(); ns.stop(); am.stop(); out.disconnect(); } catch (e) { /* */ } },
  };
}
