// Aircraft kit, cockpit: instrument panels with working gauges or glass displays, flight controls, seats, cabin fittings.
// buildCockpit() positions everything from the fleet seat hip points, so it fits any airframe built around those points.
import { THREE, Builder, MAT, loft, sec, tubeBetween, DEG, clamp, lerp, rng, detailMaps } from './core.js';
import { M4 } from './parts.js';

const KT = 1.9438, FT = 3.2808;
export const COCKPIT_STYLE = {
  plane_trainer: 'steam', plane_banner: 'vintage', plane_biplane: 'vintage', plane_tourer: 'glass', plane_twin: 'steam', plane_duster: 'steam', seaplane: 'steam', bizjet: 'glass',
  heli_piston: 'heli', heli_light: 'heli', heli_police: 'heliglass', heli_twin: 'heliglass', heli_rescue: 'heliglass', blimp: 'steam',
};
const AVIONICS = ['Corvina Avionics', 'Bluewater Instruments', 'Keysline Aerotronics'];

// ---------------------------------------------------------------------------------------------- dial faces (canvas atlas)
function dial(c, cx, cy, r, d) {
  c.save(); c.translate(cx, cy);
  c.fillStyle = '#0c0d0f'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
  const a0 = (d.a0 ?? -150) * DEG, a1 = (d.a1 ?? 150) * DEG, ang = (v) => a0 + (v - d.min) / (d.max - d.min) * (a1 - a0) - Math.PI / 2;
  for (const arc of d.arcs || []) { c.strokeStyle = arc[2]; c.lineWidth = r * (arc[3] || 0.07); c.beginPath(); c.arc(0, 0, r * (arc[4] || 0.9), ang(arc[0]), ang(arc[1])); c.stroke(); }
  c.strokeStyle = '#f2f2ee'; c.fillStyle = '#f2f2ee'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const nMin = Math.round((d.max - d.min) / d.minor);
  for (let i = 0; i <= nMin; i++) { const v = d.min + i * d.minor, a = ang(v), major = Math.abs(v / d.major - Math.round(v / d.major)) < 1e-6; c.lineWidth = r * (major ? 0.03 : 0.015); c.beginPath(); c.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); c.lineTo(Math.cos(a) * r * (major ? 0.8 : 0.87), Math.sin(a) * r * (major ? 0.8 : 0.87)); c.stroke();
    if (major && (!d.skip || !d.skip(v))) { c.font = `600 ${r * 0.17}px "Helvetica Neue", Arial`; c.fillText(String(Math.round(v * (d.numK || 1))), Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64); } }
  c.font = `600 ${r * 0.13}px "Helvetica Neue", Arial`; c.fillStyle = '#c9c9c4'; c.fillText(d.label, 0, -r * 0.3); if (d.unit) { c.font = `500 ${r * 0.1}px "Helvetica Neue", Arial`; c.fillText(d.unit, 0, r * 0.34); }
  if (d.redline != null) { const a = ang(d.redline); c.strokeStyle = '#ff2a1a'; c.lineWidth = r * 0.04; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); c.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); c.stroke(); }
  c.restore();
}
const needleAngle = (d, v) => -((d.a0 ?? -150) + (clamp(v, d.min, d.max) - d.min) / (d.max - d.min) * ((d.a1 ?? 150) - (d.a0 ?? -150))) * DEG;

function attitudeTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#2f7fd6'; x.fillRect(0, 0, 512, 256); x.fillStyle = '#7a4a22'; x.fillRect(0, 256, 512, 256); x.fillStyle = '#fff'; x.fillRect(0, 254, 512, 4);
  x.font = '600 16px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let p = -80; p <= 80; p += 5) { if (!p) continue; const y = 256 - p / 180 * 512, w = p % 10 ? 22 : 46; for (let k = 0; k < 4; k++) { const cx = 128 * k + 64; x.fillRect(cx - w / 2, y - 1, w, 2); if (p % 10 === 0) x.fillText(String(Math.abs(p)), cx + w / 2 + 14, y); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
function compassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#0c0d0f'; x.beginPath(); x.arc(128, 128, 128, 0, 7); x.fill(); x.translate(128, 128); x.fillStyle = x.strokeStyle = '#f2f2ee'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) { x.save(); x.rotate(d * DEG); x.lineWidth = d % 10 ? 1.5 : 3; x.beginPath(); x.moveTo(0, -122); x.lineTo(0, d % 10 ? -112 : -104); x.stroke(); if (d % 30 === 0) { x.font = '700 24px "Helvetica Neue", Arial'; x.fillText(d % 90 === 0 ? 'NESW'[d / 90] : String(d / 10), 0, -84); } x.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let attTex = null, cmpTex = null;

// ---------------------------------------------------------------------------------------------- glass displays
function drawPFD(c, W, H, s, maker) {
  c.save(); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  // attitude
  c.save(); c.beginPath(); c.rect(0, 0, W, H * 0.8); c.clip(); c.translate(W / 2, H * 0.4); c.rotate(-s.rollAtt); const ppd = H / 55; c.translate(0, s.pitchAtt / DEG * ppd);
  c.fillStyle = '#2f7fd6'; c.fillRect(-W * 2, -H * 3, W * 4, H * 3); c.fillStyle = '#80501f'; c.fillRect(-W * 2, 0, W * 4, H * 3); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-W * 2, 0); c.lineTo(W * 2, 0); c.stroke();
  c.fillStyle = '#fff'; c.font = `600 ${H * 0.035}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let p = -60; p <= 60; p += 5) { if (!p) continue; const y = -p * ppd, w = p % 10 ? W * 0.06 : W * 0.13; c.fillRect(-w / 2, y - 1, w, 2); if (p % 10 === 0) { c.fillText(String(Math.abs(p)), -w / 2 - H * 0.04, y); c.fillText(String(Math.abs(p)), w / 2 + H * 0.04, y); } }
  c.restore();
  c.strokeStyle = '#ffd400'; c.lineWidth = 4; c.beginPath(); c.moveTo(W * 0.36, H * 0.4); c.lineTo(W * 0.45, H * 0.4); c.lineTo(W * 0.45, H * 0.43); c.moveTo(W * 0.64, H * 0.4); c.lineTo(W * 0.55, H * 0.4); c.lineTo(W * 0.55, H * 0.43); c.stroke(); c.fillStyle = '#ffd400'; c.fillRect(W / 2 - 3, H * 0.4 - 3, 6, 6);
  // tapes
  const tape = (x, w, val, step, ppu, fmt, unit) => {
    c.fillStyle = 'rgba(20,24,30,0.72)'; c.fillRect(x, H * 0.06, w, H * 0.68); c.save(); c.beginPath(); c.rect(x, H * 0.06, w, H * 0.68); c.clip(); c.fillStyle = '#fff'; c.font = `600 ${H * 0.04}px Arial`; c.textAlign = 'right'; c.textBaseline = 'middle';
    const v0 = Math.floor(val / step) * step; for (let v = v0 - step * 5; v <= v0 + step * 6; v += step) { if (v < 0 && unit === 'KT') continue; const y = H * 0.4 - (v - val) * ppu; c.fillRect(x + (x < W / 2 ? w - 10 : 0), y - 1, 10, 2); c.fillText(fmt(v), x + w - 14, y); }
    c.restore(); c.fillStyle = '#000'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.fillRect(x - 2, H * 0.4 - H * 0.04, w + 4, H * 0.08); c.strokeRect(x - 2, H * 0.4 - H * 0.04, w + 4, H * 0.08);
    c.fillStyle = '#7dff8a'; c.font = `700 ${H * 0.055}px Arial`; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(fmt(val), x + w - 6, H * 0.4); c.fillStyle = '#9fb2c4'; c.font = `600 ${H * 0.03}px Arial`; c.fillText(unit, x + w - 6, H * 0.035);
  };
  tape(W * 0.03, W * 0.15, s.ias * KT, 10, H * 0.011, (v) => String(Math.round(v)), 'KT');
  tape(W * 0.8, W * 0.17, s.alt * FT, 100, H * 0.0011, (v) => String(Math.round(v / 10) * 10), 'FT');
  // vertical speed
  const fpm = s.vs * 196.85; c.fillStyle = 'rgba(20,24,30,0.72)'; c.fillRect(W * 0.975, H * 0.2, W * 0.025, H * 0.4); c.fillStyle = '#7dff8a'; c.fillRect(W * 0.975, H * 0.4, W * 0.025, -clamp(fpm / 2000, -1, 1) * H * 0.2);
  // heading tape
  const hdg = ((180 - s.heading / DEG) % 360 + 360) % 360; c.fillStyle = 'rgba(20,24,30,0.9)'; c.fillRect(0, H * 0.8, W, H * 0.2); c.fillStyle = '#fff'; c.font = `600 ${H * 0.045}px Arial`; c.textAlign = 'center';
  for (let d = Math.floor(hdg / 10) * 10 - 40; d <= hdg + 50; d += 10) { const x = W / 2 + (d - hdg) * W / 90, dd = ((d % 360) + 360) % 360; c.fillRect(x - 1, H * 0.8, 2, H * 0.03); c.fillText(dd % 90 === 0 ? 'NESW'[dd / 90] : String(dd / 10), x, H * 0.88); }
  c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(W / 2, H * 0.8); c.lineTo(W / 2 - 8, H * 0.775); c.lineTo(W / 2 + 8, H * 0.775); c.fill();
  c.fillStyle = '#7dff8a'; c.font = `700 ${H * 0.05}px Arial`; c.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', W / 2, H * 0.955);
  c.fillStyle = '#9fb2c4'; c.font = `600 ${H * 0.028}px Arial`; c.textAlign = 'left'; c.fillText(maker.toUpperCase(), 8, H * 0.975);
  if (s.stall > 0.5) { c.fillStyle = '#ff2a1a'; c.font = `800 ${H * 0.07}px Arial`; c.textAlign = 'center'; c.fillText('STALL', W / 2, H * 0.16); }
  c.restore();
}
function drawMFD(c, W, H, s, heli, def) {
  c.fillStyle = '#05070a'; c.fillRect(0, 0, W, H);
  const arc = (cx, cy, r, frac, label, txt, warn) => { c.lineWidth = r * 0.16; c.strokeStyle = '#2a3340'; c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); c.stroke(); c.strokeStyle = warn ? '#ff4a2a' : '#7dff8a'; c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * clamp(frac, 0, 1.05))); c.stroke(); c.fillStyle = '#fff'; c.font = `700 ${r * 0.5}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, cx, cy); c.fillStyle = '#9fb2c4'; c.font = `600 ${r * 0.3}px Arial`; c.fillText(label, cx, cy + r * 0.95); };
  const n = s.engines.length;
  for (let i = 0; i < n; i++) { const cx = W * (n === 1 ? 0.2 : 0.14 + i * 0.22); arc(cx, H * 0.2, H * 0.11, s.engines[i], heli ? 'N1 %' : def.engine.type === 'piston' ? 'RPM %' : 'N1 %', (s.engines[i] * 100).toFixed(0)); arc(cx, H * 0.52, H * 0.09, s.power[i] ?? 0, heli ? 'TQ %' : 'PWR %', ((s.power[i] ?? 0) * 100).toFixed(0), (s.power[i] ?? 0) > 1); }
  if (heli) arc(W * 0.14, H * 0.82, H * 0.09, s.rotorRpm, 'NR %', (s.rotorRpm * 100).toFixed(0), s.rotorRpm < 0.9 && s.engineOn);
  else { c.fillStyle = '#9fb2c4'; c.font = `600 ${H * 0.04}px Arial`; c.textAlign = 'left'; c.fillText(`FLAPS ${(s.flaps * 100).toFixed(0)}%   GEAR ${s.gear > 0.98 ? 'DOWN' : s.gear < 0.02 ? 'UP' : '----'}`, W * 0.04, H * 0.8); }
  c.fillStyle = '#9fb2c4'; c.font = `600 ${H * 0.04}px Arial`; c.textAlign = 'left'; c.fillText(`FUEL ${(s.fuel * 100).toFixed(0)}%`, W * 0.04, H * 0.93);
  // compass rose map
  const cx = W * 0.72, cy = H * 0.5, r = H * 0.38, hdg = Math.PI - s.heading; c.save(); c.translate(cx, cy); c.strokeStyle = '#2a3340'; c.lineWidth = 2; for (const k of [0.5, 1]) { c.beginPath(); c.arc(0, 0, r * k, 0, 7); c.stroke(); }
  c.rotate(-hdg); c.fillStyle = '#fff'; c.font = `700 ${r * 0.14}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; for (let d = 0; d < 360; d += 30) { c.save(); c.rotate(d * DEG); c.fillRect(-1, -r, 2, r * 0.07); c.fillText(d % 90 === 0 ? 'NESW'[d / 90] : String(d / 10), 0, -r * 0.83); c.restore(); } c.restore();
  c.fillStyle = '#ffd400'; c.beginPath(); c.moveTo(cx, cy - 12); c.lineTo(cx - 9, cy + 10); c.lineTo(cx, cy + 5); c.lineTo(cx + 9, cy + 10); c.fill();
  c.fillStyle = '#7dff8a'; c.font = `600 ${H * 0.04}px Arial`; c.textAlign = 'right'; c.fillText(`GS ${(s.gs * KT).toFixed(0)} KT   AGL ${(s.agl * FT).toFixed(0)} FT`, W * 0.98, H * 0.05);
}

// ---------------------------------------------------------------------------------------------- seats
export function seatGeos(kind = 'crew') {
  const w = kind === 'bench' ? 0.5 : kind === 'exec' ? 0.27 : 0.23, out = { cushion: [], frame: [], belt: [] };
  const cush = loft([sec(-0.24, w * 0.9, 0.05, 0.05, 0, 4), sec(-0.2, w, 0.06, 0.06, 0, 5), sec(0.2, w, 0.065, 0.06, 0, 5), sec(0.25, w * 0.92, 0.04, 0.05, 0, 4)], { ring: 16, stations: 6, capA: true, capB: true });
  for (const k in cush.geos) out.cushion.push(cush.geos[k].clone().translate(0, -0.08, 0.02));
  const back = loft([sec(0, w * 0.96, 0.05, 0.05, 0, 5), sec(0.3, w, 0.06, 0.06, 0, 5), sec(0.58, w * 0.9, 0.05, 0.05, 0, 4.5), sec(0.66, w * 0.7, 0.03, 0.04, 0, 4)], { ring: 16, stations: 8, capA: true, capB: true });
  const bm = new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.2).setPosition(0, -0.1, -0.24);
  for (const k in back.geos) out.cushion.push(back.geos[k].clone().applyMatrix4(bm));
  if (kind !== 'bench') out.cushion.push(new THREE.SphereGeometry(0.11, 12, 8).scale(1, 0.75, 0.42).translate(0, 0.66, -0.36));
  out.frame.push(new THREE.BoxGeometry(w * 1.7, 0.05, 0.42).translate(0, -0.17, 0), new THREE.BoxGeometry(0.04, 0.16, 0.36).translate(w * 0.75, -0.26, 0), new THREE.BoxGeometry(0.04, 0.16, 0.36).translate(-w * 0.75, -0.26, 0));
  out.belt.push(new THREE.BoxGeometry(0.045, 0.56, 0.006).applyMatrix4(M4([w * 0.45, 0.2, -0.2], [0.2, 0, 0.08])), new THREE.BoxGeometry(0.045, 0.56, 0.006).applyMatrix4(M4([-w * 0.45, 0.2, -0.2], [0.2, 0, -0.08])), new THREE.BoxGeometry(w * 1.9, 0.045, 0.006).translate(0, -0.02, 0.12).rotateX(-0.2));
  if (kind === 'exec') for (const sx of [1, -1]) out.cushion.push(new THREE.BoxGeometry(0.07, 0.06, 0.34).translate(sx * (w + 0.04), 0.1, -0.02));
  return out;
}

// ---------------------------------------------------------------------------------------------- cockpit
export function buildCockpit({ key, def, seed = 1, registration = 'N000PS', operatorName = '', traffic = false }) {
  const R = rng(seed * 31 + key.length), style = COCKPIT_STYLE[key] || 'steam', heli = def.category === 'heli', B = new Builder(), group = B.root;
  const H = def.seats[0].hip, cabW = def.dims.cabinW || def.dims.gondola?.w || 1.1, tandem = Math.abs(H[0]) < 0.05;
  const panelZ = H[2] + (style === 'heli' ? 0.7 : 0.66), panelY = H[1] + (heli ? 0.38 : 0.5), halfW = style === 'heli' ? 0.2 : (cabW / 2 - 0.05), panelH = style === 'vintage' ? 0.26 : heli ? 0.3 : 0.34;
  const eye = [H[0], H[1] + 0.76, H[2] + 0.05];
  const palette = R.pick([{ panel: 0x2b2d31, seat: 0x6b4a32, stitch: 0xc9b38a, trim: 0x3a3d42 }, { panel: 0x1c1d20, seat: 0x23262b, stitch: 0xb33a2a, trim: 0x2a2c30 }, { panel: 0x4a4d52, seat: 0x7d7566, stitch: 0x3a3a3a, trim: 0x55585e }, { panel: 0x23272c, seat: 0x8a3b2b, stitch: 0xe8e2d0, trim: 0x33373d }, { panel: 0x2f2a25, seat: 0xb9a07a, stitch: 0x5a4632, trim: 0x403a33 }]);
  const mPanel = MAT.plastic(palette.panel, 0.62), mTrim = MAT.plastic(palette.trim, 0.55), mSeat = style === 'vintage' || key === 'plane_duster' ? MAT.fabric(palette.seat) : MAT.leather(palette.seat), mBelt = MAT.fabric(0x2a2c30), mMetal = MAT.metal(0x9a9da2, 0.4), mDark = MAT.dark(), mCarpet = MAT.carpet(0x34373c), mKnob = MAT.plastic(0x101113, 0.35);
  const dyn = { needles: [], levers: [] };
  // ---- seats (all fleet seats)
  def.seats.forEach((s, i) => {
    const kind = i < (def.crew || 1) || i < 2 ? 'crew' : key === 'bizjet' || key === 'heli_twin' ? 'exec' : 'crew', sg = seatGeos(kind), m = M4([s.hip[0], s.hip[1] + 0.08, s.hip[2]], [0, s.yaw || 0, 0]);
    if (traffic && i > 1) return;
    for (const g of sg.cushion) B.add(g, mSeat, m); for (const g of sg.frame) B.add(g, mMetal, m); for (const g of sg.belt) B.add(g, mBelt, m);
  });
  // ---- floor (carpet under the seats; the airframe's liner closes the sides)
  const zs = def.seats.map((s) => s.hip[2]), z0 = Math.min(...zs) - 0.45, z1 = panelZ + 0.3, floorY = H[1] - 0.33;
  B.add(new THREE.BoxGeometry(cabW - 0.06, 0.02, z1 - z0), mCarpet, M4([0, floorY - 0.01, (z0 + z1) / 2]));
  // ---- panel body + glare shield
  const px = style === 'heli' ? 0 : tandem ? 0 : 0;
  if (style === 'heli') { // central pod on a pedestal
    const pod = loft([sec(-0.02, 0.19, 0.17, 0.17, 0, 4), sec(0.1, 0.2, 0.18, 0.18, 0, 4), sec(0.3, 0.12, 0.1, 0.12, -0.02, 3)], { ring: 16, stations: 6, capA: true, capB: true });
    for (const k in pod.geos) B.add(pod.geos[k], mPanel, M4([0, panelY, panelZ]));
    B.add(new THREE.BoxGeometry(0.22, panelY - floorY - 0.12, 0.26), mPanel, M4([0, (panelY - 0.14 + floorY) / 2, panelZ + 0.12]));
    B.add(new THREE.BoxGeometry(0.4, 0.015, 0.14), mTrim, M4([0, panelY + 0.185, panelZ + 0.02], [-0.25, 0, 0]));
  } else {
    B.add(new THREE.BoxGeometry(halfW * 2, panelH, 0.05), mPanel, M4([px, panelY, panelZ + 0.025]));
    const gs = loft([sec(-0.1, halfW * 1.0, 0.012, 0.02, 0, 6), sec(0.0, halfW * 1.01, 0.02, 0.03, 0, 6), sec(0.3, halfW * 0.96, 0.02, 0.05, -0.03, 5)], { ring: 14, stations: 5, capA: true, capB: true });
    for (const k in gs.geos) B.add(gs.geos[k], MAT.leather(0x15161a), M4([px, panelY + panelH / 2 + 0.02, panelZ]));
    B.add(new THREE.BoxGeometry(halfW * 2, 0.26, 0.03), mTrim, M4([px, panelY - panelH / 2 - 0.13, panelZ + 0.1], [0.5, 0, 0]));   // kick panel
    if (!tandem && style !== 'vintage') B.add(new THREE.BoxGeometry(0.2, 0.2, 0.5), mTrim, M4([0, floorY + 0.12, panelZ - 0.22]));     // center pedestal
  }
  // ---- gauges
  const perf = def.perf || {}, vne = (perf.vne || perf.vMax || 60) * KT, asiMax = Math.ceil(vne * 1.12 / 20) * 20;
  const D = {
    asi: { label: 'AIRSPEED', unit: 'KNOTS', min: 0, max: asiMax, major: asiMax > 220 ? 40 : 20, minor: asiMax > 220 ? 10 : 5, a0: -160, a1: 160, redline: vne,
      arcs: heli ? [[0, perf.vCruise * KT, '#22c55e']] : [[(perf.vStallFlaps || 20) * KT, (perf.vStall || 25) * KT * 1.6, '#f4f4f0', 0.05, 0.84], [(perf.vStall || 25) * KT, (perf.vCruise || 50) * KT, '#22c55e'], [(perf.vCruise || 50) * KT, vne, '#facc15']] },
    alt: { label: 'ALT', unit: 'x100 FT', min: 0, max: 10, major: 1, minor: 0.2, a0: 0, a1: 360, skip: (v) => v === 10 },
    vsi: { label: 'VERT SPEED', unit: 'x100 FPM', min: -20, max: 20, major: 5, minor: 1, a0: -260, a1: 80, numK: 1 },
    tach: { label: heli ? 'ENGINE' : def.engine.type === 'piston' ? 'RPM' : 'N1', unit: '% x10', min: 0, max: 11, major: 1, minor: 0.5, arcs: [[heli ? 9.7 : 5, heli ? 10.4 : 10, '#22c55e']], redline: 10.5 },
    nr: { label: 'ROTOR', unit: '% x10', min: 0, max: 12, major: 2, minor: 0.5, arcs: [[9, 10.6, '#22c55e'], [8, 9, '#facc15']], redline: 11 },
    tq: { label: heli ? 'TORQUE' : 'MANIFOLD', unit: '%', min: 0, max: 110, major: 20, minor: 5, arcs: [[0, 90, '#22c55e'], [90, 100, '#facc15']], redline: 100 },
    fuel: { label: 'FUEL', unit: 'QTY', min: 0, max: 1, major: 0.25, minor: 0.125, a0: -60, a1: 60, numK: 4, arcs: [[0, 0.12, '#ff2a1a']] },
    oil: { label: 'OIL', unit: 'TEMP', min: 0, max: 10, major: 2, minor: 1, a0: -60, a1: 60, arcs: [[3, 8, '#22c55e']], redline: 9 },
    gm: { label: 'G', unit: 'LOAD', min: -4, max: 8, major: 2, minor: 1, a0: -200, a1: 100 },
    hop: { label: 'HOPPER', unit: 'x100 L', min: 0, max: 20, major: 5, minor: 1, a0: -120, a1: 120 },
    flap: { label: 'FLAPS', unit: '', min: 0, max: 1, major: 0.5, minor: 0.25, a0: -50, a1: 50, numK: 100 },
  };
  const atlasN = 1024, cell = 256, ac = document.createElement('canvas'); ac.width = ac.height = atlasN; const actx = ac.getContext('2d'); actx.fillStyle = '#0c0d0f'; actx.fillRect(0, 0, atlasN, atlasN);
  const atlas = new THREE.CanvasTexture(ac); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
  const faceMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.02 });
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.5 }), glassMat = MAT.glass(0xffffff, 0.12);
  let nCell = 0;
  const faceZ = style === 'heli' ? panelZ - 0.021 : panelZ - 0.001;
  function gauge(type, x, y, r, opt = {}) {
    const ci = nCell++, cx = (ci % 4) * cell + cell / 2, cy = Math.floor(ci / 4) * cell + cell / 2, d = D[type];
    const g = new THREE.CircleGeometry(r, 28), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + (uv.getX(i) - 0.5) * cell * 0.98) / atlasN, 1 - (cy - (uv.getY(i) - 0.5) * cell * 0.98) / atlasN);
    g.rotateY(Math.PI); B.add(g, faceMat, M4([x, y, faceZ]));
    B.add(new THREE.TorusGeometry(r * 1.04, r * 0.09, 6, 28), mDark, M4([x, y, faceZ - 0.002]));
    B.add(new THREE.CircleGeometry(r, 20).rotateY(Math.PI), glassMat, M4([x, y, faceZ - 0.006]));
    for (let i = 0; i < 4; i++) B.add(new THREE.CylinderGeometry(r * 0.06, r * 0.06, 0.004, 6).rotateX(Math.PI / 2), mMetal, M4([x + Math.cos(i * Math.PI / 2 + 0.785) * r * 1.22, y + Math.sin(i * Math.PI / 2 + 0.785) * r * 1.22, faceZ - 0.001]));
    if (d) { dial(actx, cx, cy, cell * 0.49, d);
      const mk = (len, wid, get) => { const n = new THREE.Mesh(new THREE.BoxGeometry(r * wid, r * len, 0.0015).translate(0, r * len * 0.36, 0), needleMat); n.position.set(x, y, faceZ - 0.003); group.add(n); dyn.needles.push({ n, d, get }); };
      if (type === 'alt') { mk(0.5, 0.09, (s) => (s.alt * FT / 1000) % 10); mk(0.85, 0.05, (s) => (s.alt * FT / 100) % 10); }
      else if (type === 'nr') { mk(0.82, 0.05, (s) => s.rotorRpm * 10); mk(0.6, 0.07, (s) => s.engines[0] * 10); }
      else mk(0.84, 0.055, opt.get);
      B.add(new THREE.CylinderGeometry(r * 0.09, r * 0.09, 0.004, 10).rotateX(Math.PI / 2), mDark, M4([x, y, faceZ - 0.004])); }
    return { cx, cy };
  }
  attTex ||= attitudeTexture(); cmpTex ||= compassTexture();
  let attBall = null, hsiCard = null, slipBall = null, tcPlane = null;
  function attitude(x, y, r) { nCell++; attBall = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 24, 16), new THREE.MeshStandardMaterial({ map: attTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: attTex, emissiveIntensity: 0.02 })); attBall.position.set(x, y, faceZ + r * 1.28); attBall.rotation.order = 'ZXY'; group.add(attBall);
    B.add(new THREE.RingGeometry(r * 0.97, r * 1.35, 28).rotateY(Math.PI), mDark, M4([x, y, faceZ - 0.003])); B.add(new THREE.BoxGeometry(r * 0.5, r * 0.035, 0.002), new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xffa000, emissiveIntensity: 0.3 }), M4([x - r * 0.5, y, faceZ - 0.006])); B.add(new THREE.BoxGeometry(r * 0.5, r * 0.035, 0.002), needleMat, M4([x + r * 0.5, y, faceZ - 0.006])); B.add(new THREE.CircleGeometry(r, 20).rotateY(Math.PI), glassMat, M4([x, y, faceZ - 0.008])); }
  function hsi(x, y, r) { nCell++; hsiCard = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateY(Math.PI), new THREE.MeshStandardMaterial({ map: cmpTex, roughness: 0.6, emissive: 0xffffff, emissiveMap: cmpTex, emissiveIntensity: 0.02 })); hsiCard.position.set(x, y, faceZ - 0.001); group.add(hsiCard);
    B.add(new THREE.TorusGeometry(r * 1.04, r * 0.09, 6, 28), mDark, M4([x, y, faceZ - 0.002])); B.add(new THREE.BoxGeometry(r * 0.05, r * 0.5, 0.002), new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xffa000, emissiveIntensity: 0.3 }), M4([x, y + r * 0.1, faceZ - 0.004])); B.add(new THREE.BoxGeometry(r * 0.4, r * 0.05, 0.002), new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xffa000, emissiveIntensity: 0.3 }), M4([x, y, faceZ - 0.004])); B.add(new THREE.CircleGeometry(r, 20).rotateY(Math.PI), glassMat, M4([x, y, faceZ - 0.007])); }
  function turnCoord(x, y, r) { const { cx, cy } = gauge(null, x, y, r); actx.save(); actx.translate(cx, cy); actx.fillStyle = '#c9c9c4'; actx.font = '600 15px Arial'; actx.textAlign = 'center'; actx.fillText('TURN COORDINATOR', 0, -66); actx.fillText('2 MIN', 0, 100); actx.strokeStyle = '#f2f2ee'; actx.lineWidth = 5; for (const a of [-1, 1]) { actx.beginPath(); actx.moveTo(a * 92, 0); actx.lineTo(a * 116, 0); actx.moveTo(a * 88, 30); actx.lineTo(a * 110, 40); actx.stroke(); } actx.fillStyle = '#e8e6da'; actx.fillRect(-56, 56, 112, 22); actx.fillStyle = '#0c0d0f'; actx.fillRect(-13, 54, 2, 26); actx.fillRect(11, 54, 2, 26); actx.restore();
    tcPlane = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, r * 0.07, 0.002), needleMat); tcPlane.position.set(x, y, faceZ - 0.003); group.add(tcPlane);
    slipBall = new THREE.Mesh(new THREE.SphereGeometry(r * 0.075, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 })); slipBall.position.set(x, y - r * 0.52, faceZ - 0.004); slipBall.userData = { x, r }; group.add(slipBall); }
  // layout
  const gx = style === 'heli' ? 0 : tandem ? 0 : H[0], top = panelY + panelH * 0.22, bot = panelY - panelH * 0.2, r6 = style === 'heli' ? 0.037 : Math.min(0.041, halfW / (tandem ? 3.6 : 7.4)), sp = r6 * 2.5;
  const screens = [];
  function screen(x, y, w, h, kind) { const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); m.position.set(x, y, faceZ - 0.004); group.add(m);
    B.add(new THREE.BoxGeometry(w + 0.024, h + 0.024, 0.012), mDark, M4([x, y, faceZ + 0.003])); for (let i = 0; i < 6; i++) B.add(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8).rotateX(Math.PI / 2), mKnob, M4([x - w / 2 + (i + 0.5) * w / 6, y - h / 2 - 0.02, faceZ - 0.006]));
    screens.push({ c, ctx: c.getContext('2d'), t, kind, m }); }
  const pw = { asi: (s) => s.ias * KT, vsi: (s) => clamp(s.vs * 1.9685, -20, 20), tach: (s) => s.engines[0] * 10, tach2: (s) => (s.engines[1] ?? 0) * 10, tq: (s) => (s.power[0] ?? 0) * 100 * (heli ? 1 : 1), tq2: (s) => (s.power[1] ?? 0) * 100, fuel: (s) => s.fuel, oil: (s) => 2 + 4 * Math.min(1, s.t / 60) * (s.engineOn ? 1 : 0.3), gm: (s) => s.g, hop: (s) => 19 * (1 - (s.sprayed || 0)), flap: (s) => s.flaps };
  if (style === 'glass' || style === 'heliglass') {
    const sw = Math.min(0.26, halfW * 0.62), sh = sw * 0.75, x0 = style === 'heliglass' && !tandem ? H[0] : gx;
    screen(x0, panelY + 0.01, sw, sh, 'pfd'); screen(x0 + (H[0] > 0 ? -1 : 1) * (sw + 0.035), panelY + 0.01, sw, sh, 'mfd');
    if (halfW > 0.6) screen(-x0, panelY + 0.01, sw, sh, 'pfd');
    const bx = x0 + (H[0] > 0 ? 1 : -1) * (sw / 2 + 0.05); gauge('asi', bx, top - 0.01, 0.027, { get: pw.asi }); attitude(bx, panelY - 0.02, 0.025); gauge('alt', bx, bot - 0.03, 0.027);   // standby instruments
  } else if (style === 'vintage') {
    gauge('asi', gx - sp, panelY + 0.02, r6, { get: pw.asi }); gauge('alt', gx, panelY + 0.02, r6); gauge('tach', gx + sp, panelY + 0.02, r6, { get: pw.tach });
    turnCoord(gx - sp * 0.5, panelY - sp * 0.82, r6 * 0.8); gauge(key === 'plane_biplane' ? 'gm' : 'vsi', gx + sp * 0.5, panelY - sp * 0.82, r6 * 0.8, { get: key === 'plane_biplane' ? pw.gm : pw.vsi }); gauge('oil', gx + sp * 1.5, panelY - sp * 0.82, r6 * 0.62, { get: pw.oil }); gauge('fuel', gx - sp * 1.5, panelY - sp * 0.82, r6 * 0.62, { get: pw.fuel });
  } else if (style === 'heli') {
    gauge('asi', -sp * 0.52, top - 0.01, r6, { get: pw.asi }); attitude(sp * 0.52, top - 0.01, r6 * 0.92); gauge('alt', -sp * 0.52, top - 0.01 - sp, r6); hsi(sp * 0.52, top - 0.01 - sp, r6 * 0.95);
    gauge('nr', -sp * 0.52, top - 0.01 - sp * 2, r6); gauge('tq', sp * 0.52, top - 0.01 - sp * 2, r6, { get: pw.tq }); gauge('vsi', -sp * 0.52, top - 0.01 - sp * 3, r6 * 0.8, { get: pw.vsi }); gauge('fuel', sp * 0.3, top - 0.01 - sp * 2.95, r6 * 0.6, { get: pw.fuel }); gauge('oil', sp * 0.95, top - 0.01 - sp * 2.95, r6 * 0.6, { get: pw.oil });
  } else { // six pack + engine cluster
    gauge('asi', gx - sp, top, r6, { get: pw.asi }); attitude(gx, top, r6 * 0.94); gauge('alt', gx + sp, top, r6);
    turnCoord(gx - sp, bot, r6); hsi(gx, bot, r6 * 0.96); gauge('vsi', gx + sp, bot, r6, { get: pw.vsi });
    const ex = tandem ? gx : gx - Math.sign(H[0] || 1) * sp * 2.2, er = r6 * 0.74, s2 = er * 2.5, twin = (def.engine.count || 1) > 1;
    if (tandem) { gauge('tach', gx - sp * 2, top, er, { get: pw.tach }); gauge('tq', gx - sp * 2, bot, er, { get: pw.tq }); gauge('fuel', gx + sp * 2, top, er * 0.8, { get: pw.fuel }); gauge(key === 'plane_duster' ? 'hop' : 'oil', gx + sp * 2, bot, er, { get: key === 'plane_duster' ? pw.hop : pw.oil }); }
    else { gauge('tach', ex, top, er, { get: pw.tach }); gauge('tq', ex, bot, er, { get: pw.tq }); if (twin) { gauge('tach', ex - Math.sign(H[0] || 1) * s2, top, er, { get: pw.tach2 }); gauge('tq', ex - Math.sign(H[0] || 1) * s2, bot, er, { get: pw.tq2 }); }
      const fx = ex - Math.sign(H[0] || 1) * s2 * (twin ? 2 : 1); gauge('fuel', fx, top, er * 0.8, { get: pw.fuel }); gauge('oil', fx, bot, er * 0.8, { get: pw.oil }); gauge('flap', fx - Math.sign(H[0] || 1) * s2 * 0.9, bot, er * 0.7, { get: pw.flap }); }
  }
  // ---- radio stack / placards / switches / annunciators (one extra canvas strip)
  const pc = document.createElement('canvas'); pc.width = 512; pc.height = 256; const p = pc.getContext('2d'), maker = AVIONICS[seed % AVIONICS.length];
  p.fillStyle = '#101114'; p.fillRect(0, 0, 512, 256); p.font = '700 26px "Courier New", monospace'; p.fillStyle = '#ff9a2e';
  for (let i = 0; i < 4; i++) { p.fillStyle = '#060607'; p.fillRect(8, 8 + i * 44, 300, 36); p.fillStyle = i < 2 ? '#ff9a2e' : '#7dff8a'; p.fillText(i < 2 ? `${(118 + R() * 18).toFixed(3)}  ${(118 + R() * 18).toFixed(3)}` : i === 2 ? `${(108 + R() * 9).toFixed(2)}   ${(108 + R() * 9).toFixed(2)}` : `XPDR ${R.int(1000, 7777)}  ALT`, 16, 34 + i * 44); }
  p.fillStyle = '#c9c9c4'; p.font = '600 13px Arial'; p.fillText(maker.toUpperCase(), 16, 198);
  p.fillStyle = '#e8e6da'; p.fillRect(320, 8, 184, 80); p.fillStyle = '#111'; p.font = '700 22px Arial'; p.fillText(registration, 330, 36); p.font = '600 11px Arial'; p.fillText((def.maker + ' ' + def.name).toUpperCase().slice(0, 28), 330, 54); p.fillText(operatorName ? operatorName.toUpperCase().slice(0, 28) : 'NORMAL CATEGORY', 330, 70); p.fillText(`VNE ${Math.round(vne)} KT`, 330, 84);
  const ann = ['STALL', heli ? 'LOW RPM' : 'GEAR', 'ENG OUT', 'FIRE', 'LOW FUEL', 'DOOR'];
  ann.forEach((a, i) => { p.fillStyle = '#1a1b1e'; p.fillRect(320 + (i % 3) * 62, 100 + Math.floor(i / 3) * 34, 58, 30); p.fillStyle = i === 3 || i === 0 || i === 2 ? '#ff5a3a' : '#ffc23a'; p.font = '700 11px Arial'; p.textAlign = 'center'; p.fillText(a, 349 + (i % 3) * 62, 119 + Math.floor(i / 3) * 34); p.textAlign = 'left'; });
  p.fillStyle = '#c9c9c4'; p.font = '600 10px Arial'; ['MASTER', 'AVIONICS', 'FUEL PUMP', 'BCN', 'LAND', 'NAV', 'STROBE', 'PITOT'].forEach((s, i) => p.fillText(s, 10 + i * 62, 246));
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace; ptex.anisotropy = 8;
  const pMat = new THREE.MeshStandardMaterial({ map: ptex, emissive: 0xffffff, emissiveMap: ptex, emissiveIntensity: 0.25, roughness: 0.5 });
  const uvRect = (g, u0, v0, u1, v1) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), 1 - lerp(v0, v1, 1 - uv.getY(i))); return g; };
  const annMats = [];
  if (style !== 'heli') {
    const rx = tandem ? gx : style === 'glass' || style === 'heliglass' ? 0 : -H[0] * 0.2 - Math.sign(H[0] || 1) * 0.0, rxx = tandem ? 0 : (style.includes('glass') ? -H[0] : rx);
    if (!tandem && halfW > 0.42) { B.add(uvRect(new THREE.PlaneGeometry(0.15, 0.1).rotateY(Math.PI), 8 / 512, 4 / 256, 310 / 512, 180 / 256), pMat, M4([style.includes('glass') ? -H[0] * 0.0 : 0, style.includes('glass') ? panelY - panelH * 0.33 - 0.0 : panelY + 0.02, faceZ - 0.002 - (style.includes('glass') ? 0.0 : 0)]));
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) B.add(new THREE.CylinderGeometry(0.008, 0.009, 0.014, 10).rotateX(Math.PI / 2), mKnob, M4([sx * 0.085, panelY + 0.055 - i * 0.027 - (style.includes('glass') ? panelH * 0.33 + 0.02 : 0), faceZ - 0.008])); }
    B.add(uvRect(new THREE.PlaneGeometry(0.11, 0.048).rotateY(Math.PI), 320 / 512, 8 / 256, 504 / 512, 88 / 256), pMat, M4([-gx || halfW * 0.6, panelY + panelH * 0.36, faceZ - 0.002]));
    ann.forEach((a, i) => { const m = new THREE.MeshStandardMaterial({ map: ptex, emissive: 0xffffff, emissiveMap: ptex, emissiveIntensity: 0.05, roughness: 0.5 }); annMats.push(m); const g = uvRect(new THREE.PlaneGeometry(0.03, 0.015).rotateY(Math.PI), (320 + (i % 3) * 62) / 512, (100 + Math.floor(i / 3) * 34) / 256, (378 + (i % 3) * 62) / 512, (130 + Math.floor(i / 3) * 34) / 256); const mm = new THREE.Mesh(g, m); mm.position.set(gx + (1 - (i % 3)) * 0.033, panelY + panelH * 0.44 - Math.floor(i / 3) * 0.018, faceZ - 0.002); group.add(mm); });
    // switch row with labels + breakers
    const sy = panelY - panelH * 0.42; B.add(uvRect(new THREE.PlaneGeometry(Math.min(0.5, halfW * 1.2), 0.012).rotateY(Math.PI), 4 / 512, 236 / 256, 500 / 512, 250 / 256), pMat, M4([gx, sy - 0.018, faceZ - 0.002]));
    for (let i = 0; i < 8; i++) { const x = gx + (3.5 - i) * Math.min(0.5, halfW * 1.2) / 8; B.add(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8).rotateX(Math.PI / 2), mMetal, M4([x, sy, faceZ - 0.003])); B.add(new THREE.BoxGeometry(0.005, 0.02, 0.005), mMetal, M4([x, sy + (R.chance(0.6) ? 0.006 : -0.006), faceZ - 0.012], [R.chance(0.6) ? 0.5 : -0.5, 0, 0])); }
    if (!tandem) for (let i = 0; i < 14; i++) B.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 8).rotateX(Math.PI / 2), mKnob, M4([-gx * 1.0 - 0.14 + (i % 7) * 0.02 + (gx === 0 ? halfW * 0.6 : 0), panelY - panelH * 0.25 - Math.floor(i / 7) * 0.022, faceZ - 0.006]));
  } else { ann.forEach(() => annMats.push(new THREE.MeshStandardMaterial())); B.add(uvRect(new THREE.PlaneGeometry(0.13, 0.086).rotateY(Math.PI), 8 / 512, 4 / 256, 310 / 512, 180 / 256), pMat, M4([0, floorY + 0.36, panelZ - 0.012], [0.9, 0, 0])); }
  // compass on the glare shield, registration placard, checklist, extinguisher, headset
  B.add(new THREE.SphereGeometry(0.028, 14, 10), new THREE.MeshStandardMaterial({ map: cmpTex, roughness: 0.3 }), M4([0, panelY + panelH / 2 + (style === 'heli' ? 0.07 : 0.075), panelZ - 0.03]));
  B.add(new THREE.BoxGeometry(0.07, 0.065, 0.06), mDark, M4([0, panelY + panelH / 2 + (style === 'heli' ? 0.07 : 0.075), panelZ - 0.01]));
  if (!traffic) { B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.35 }), M4([tandem ? cabW / 2 - 0.1 : 0, floorY + 0.14, H[2] - 0.18])); B.add(new THREE.CylinderGeometry(0.012, 0.02, 0.05, 8), mDark, M4([tandem ? cabW / 2 - 0.1 : 0, floorY + 0.295, H[2] - 0.18])); }
  // ---- flight controls
  const controls = {};
  const seatsWithControls = def.seats.slice(0, tandem ? 1 : 2).filter((s, i) => i === 0 || !['plane_duster'].includes(key));
  const ctrlKind = heli ? 'cyclic' : style === 'vintage' || key === 'plane_duster' ? 'stick' : 'yoke';
  controls.sticks = []; controls.pedals = []; controls.collectives = [];
  for (const s of seatsWithControls) {
    const hx = s.hip[0], hy = s.hip[1], hz = s.hip[2];
    if (ctrlKind === 'yoke') {
      const y = new THREE.Group(); y.position.set(hx, panelY - panelH * 0.52, panelZ - 0.02); group.add(y);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, -0.12), mMetal);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.15, 0.1, -0.27), new THREE.Vector3(0.165, 0.02, -0.27), new THREE.Vector3(0.1, -0.03, -0.27), new THREE.Vector3(0, -0.02, -0.27), new THREE.Vector3(-0.1, -0.03, -0.27), new THREE.Vector3(-0.165, 0.02, -0.27), new THREE.Vector3(-0.15, 0.1, -0.27)]);
      const wheelG = new THREE.Group(); wheelG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 8), mKnob), new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02).translate(0, 0, -0.27), mKnob));
      y.add(shaft, wheelG); controls.sticks.push({ type: 'yoke', node: y, wheel: wheelG, z0: y.position.z });
    } else {
      const st = new THREE.Group(); st.position.set(hx, floorY + 0.02, hz + 0.3); group.add(st);
      const curve = ctrlKind === 'cyclic' ? new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0.12, 0.08), new THREE.Vector3(0, 0.3, -0.02), new THREE.Vector3(0, 0.42, -0.04)]) : new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(0, 0.44, -0.015)]);
      st.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 8), mMetal)); const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.09, 4, 10), mKnob); grip.position.set(0, 0.49, ctrlKind === 'cyclic' ? -0.045 : -0.018); grip.rotation.x = -0.2; st.add(grip);
      const boot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 10), MAT.leather(0x111214)); boot.position.y = 0.03; st.add(boot);
      controls.sticks.push({ type: 'stick', node: st });
    }
    for (const sx of [1, -1]) { const pd = new THREE.Group(); pd.position.set(hx + sx * 0.11, floorY + 0.16, hz + 0.86); pd.add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.012), MAT.tread()), new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6).translate(0, -0.1, 0.02), mMetal)); pd.rotation.x = -0.35; group.add(pd); controls.pedals.push({ node: pd, sx, z0: pd.position.z }); }
    if (heli) { const col = new THREE.Group(); col.position.set(hx + 0.24, floorY + 0.1, hz - 0.2); col.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.25), mMetal), new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5), mKnob), new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.06).translate(0, 0.01, 0.59), mDark)); group.add(col); controls.collectives.push(col); }
  }
  // throttle(s)
  if (!heli) { const n = (def.engine.count || 1) > 1 ? 2 : 1, quad = key === 'bizjet' || key === 'plane_twin' || key === 'seaplane' || key === 'plane_tourer' || key === 'blimp';
    for (let i = 0; i < n; i++) { const t = new THREE.Group(), tx = tandem ? -cabW / 2 + 0.07 : (i - (n - 1) / 2) * 0.04, col = [0x101113, 0x1c4fb0, 0xb3261e][0];
      if (quad && !tandem) { t.position.set(tx, floorY + 0.22, panelZ - 0.3); t.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012).translate(0, 0.08, 0), mMetal), new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.034, 10).rotateZ(Math.PI / 2).translate(0, 0.17, 0), MAT.plastic(col, 0.35))); dyn.levers.push({ node: t, type: 'quad', i }); }
      else if (tandem) { t.position.set(tx, H[1] + 0.22, H[2] + 0.3); t.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.14).translate(0, 0, 0), mMetal), new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8).translate(0, 0.02, 0.07), mKnob)); dyn.levers.push({ node: t, type: 'slide', i, z0: t.position.z }); }
      else { t.position.set(tx, panelY - panelH * 0.5 - 0.03, panelZ - 0.01); t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, -0.05), mMetal), new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, -0.14), mKnob)); dyn.levers.push({ node: t, type: 'plunger', i, z0: t.position.z }); }
      group.add(t); }
    if (quad && !tandem) B.add(new THREE.BoxGeometry(0.16, 0.05, 0.2), mPanel, M4([0, floorY + 0.235, panelZ - 0.3])); }
  B.finish({ shadows: false });
  atlas.needsUpdate = true;
  // ---- update
  let night = 0, tDraw = 0, sm = null;
  const api = {
    group, eye, style, bounds: { panelZ, panelHalfW: halfW, panelTopY: panelY + panelH / 2 + 0.06, panelBottomY: panelY - panelH / 2, floorY, seatBackZ: z0 },
    setNight(k) { night = k; faceMat.emissiveIntensity = 0.02 + k * 0.55; needleMat.emissiveIntensity = 0.05 + k * 0.7; if (attBall) attBall.material.emissiveIntensity = 0.02 + k * 0.45; if (hsiCard) hsiCard.material.emissiveIntensity = 0.02 + k * 0.5; pMat.emissiveIntensity = 0.25 + k * 0.5; },
    update(s, dt) {
      if (!sm) sm = { ias: s.ias, alt: s.alt, vs: s.vs };
      const k = 1 - Math.exp(-dt * 8);
      for (const q of dyn.needles) { const v = q.get(s), cur = q.n.userData.v ?? v, nv = cur + (v - cur) * (q.d.label === 'ALT' ? 1 : k); q.n.userData.v = nv; q.n.rotation.z = needleAngle(q.d, q.d.label === 'ALT' ? v : nv) + (q.d.label === 'ALT' ? 0 : 0); if (q.d.label === 'ALT') q.n.rotation.z = -(v / 10) * Math.PI * 2; }
      if (attBall) { attBall.rotation.z = s.rollAtt; attBall.rotation.x = -s.pitchAtt; }
      if (hsiCard) hsiCard.rotation.z = -(Math.PI - s.heading);
      if (tcPlane) tcPlane.rotation.z = clamp(-s.rollAtt * 0.55, -0.6, 0.6);
      if (slipBall) slipBall.position.x = slipBall.userData.x + clamp(s.slip * 2.2, -1, 1) * slipBall.userData.r * 0.5;
      for (const c of controls.sticks) { if (c.type === 'yoke') { c.node.position.z = c.z0 - s.pitch * 0.05; c.wheel.rotation.z = -s.roll * 1.1; } else { c.node.rotation.x = -s.pitch * 0.22; c.node.rotation.z = -s.roll * 0.22; } }
      for (const pd of controls.pedals) pd.node.position.z = pd.z0 + pd.sx * s.yaw * 0.05;
      for (const c of controls.collectives) c.rotation.x = -s.collective * 0.42;
      for (const l of dyn.levers) { const th = s.throttle; if (l.type === 'quad') l.node.rotation.x = lerp(-0.55, 0.55, th); else l.node.position.z = l.z0 + (l.type === 'slide' ? th * 0.1 : -0.02 + th * 0.07); }
      const flags = [s.stall > 0.5, heli ? (s.engineOn && s.rotorRpm < 0.9) : (s.gear < 0.98), !s.engineOn || s.engines.some((e) => e < 0.05), s.fire > 0.05, s.fuel < 0.12, Object.values(s.doors).some((d) => d > 0.1)];
      for (let i = 0; i < annMats.length; i++) annMats[i].emissiveIntensity = flags[i] ? ((i === 0 || i === 3) && (s.t * 3 % 1) < 0.5 ? 0.3 : 1.6) : 0.04 + night * 0.05;
      tDraw -= dt; if (tDraw <= 0 && screens.length) { tDraw = 0.09; for (const sc of screens) { if (sc.kind === 'pfd') drawPFD(sc.ctx, sc.c.width, sc.c.height, s, maker); else drawMFD(sc.ctx, sc.c.width, sc.c.height, s, heli, def); sc.t.needsUpdate = true; } }
    },
    dispose() { atlas.dispose(); ptex.dispose(); for (const sc of screens) sc.t.dispose(); },
  };
  // draw once so parked aircraft show live-looking panels
  return api;
}
