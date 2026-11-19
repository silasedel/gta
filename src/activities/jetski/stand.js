// Jet ski rental stand: a raised plank deck on the sand with a painted counter, a striped canvas roof with a scalloped
// valance, the stand's sign and price board, a feather flag, a life vest rack, and the user's converted props (beach
// umbrella, coolers, life ring). Local frame: +z = the front (facing inland, where customers walk up), -z = the water.
// Returns { group, colliders: [[x, y, z, hx, hy, hz]] (local), counterTop, attendant: { x, y, z } (local) }.
import * as THREE from 'three';
import { canvasTex, loadGLB, fit, shadows } from '../common.js';

const DECK_Y = 0.2;
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const planks = canvasTex(512, 512, (g, w, h) => {
    const cols = ['#8a6a4c', '#7d5f43', '#94744f', '#86664a'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = cols[i % 4]; g.fillRect(0, i * 64, w, 64);
      for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,25,15' : '200,170,130'},${Math.random() * 0.1})`; g.fillRect(Math.random() * w, i * 64 + Math.random() * 60, 20 + Math.random() * 120, 1 + Math.random() * 2); }
      g.fillStyle = 'rgba(20,12,6,.7)'; g.fillRect(0, i * 64, w, 3);
      for (const x of [Math.random() * w, Math.random() * w]) { g.fillStyle = '#3a3330'; g.beginPath(); g.arc(x, i * 64 + 14, 3, 0, 7); g.arc(x, i * 64 + 50, 3, 0, 7); g.fill(); }
    }
    g.fillStyle = 'rgba(230,220,200,.12)'; for (let k = 0; k < 40; k++) g.fillRect(Math.random() * w, Math.random() * h, 60, 30);   // sun bleach
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  const counter = canvasTex(512, 256, (g, w, h) => {   // vertical teal boards, salt-worn
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#1f8f8a' : '#23999a'; g.fillRect(i * 32, 0, 32, h); g.fillStyle = 'rgba(0,30,30,.55)'; g.fillRect(i * 32, 0, 2, h); }
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(240,240,230,${Math.random() * 0.18})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1 + Math.random() * 3); }
    const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, 'rgba(70,55,30,0)'); gr.addColorStop(1, 'rgba(70,55,30,.45)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const canvas = canvasTex(512, 256, (g, w, h) => {   // roof canvas: teal and white stripes, a little faded
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f1efe6' : '#1aa39d'; g.fillRect(i * 64, 0, 64, h); }
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(255,255,240,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 30, 6); }
  });
  const valance = canvasTex(512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f1efe6' : '#1aa39d'; g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 64, 0); g.lineTo(i * 64 + 64, h * 0.55); g.arc(i * 64 + 32, h * 0.55, 32, 0, Math.PI); g.closePath(); g.fill(); }
  });
  MATS = {
    planks: new THREE.MeshStandardMaterial({ name: 'jsStandPlanks', map: planks, roughness: 0.9 }),
    post: new THREE.MeshStandardMaterial({ name: 'jsStandPost', color: 0x6f5640, roughness: 0.9 }),
    counter: new THREE.MeshStandardMaterial({ name: 'jsStandCounter', map: counter, roughness: 0.8 }),
    top: new THREE.MeshStandardMaterial({ name: 'jsStandTop', color: 0xe9e4d6, roughness: 0.55 }),
    canvas: new THREE.MeshStandardMaterial({ name: 'jsStandCanvas', map: canvas, roughness: 0.85, side: THREE.DoubleSide }),
    valance: new THREE.MeshStandardMaterial({ name: 'jsStandValance', map: valance, roughness: 0.85, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    vest: new THREE.MeshStandardMaterial({ name: 'jsVest', color: 0xff6a1a, roughness: 0.7 }),
    strap: new THREE.MeshStandardMaterial({ name: 'jsStrap', color: 0x15171b, roughness: 0.8 }),
    steel: new THREE.MeshStandardMaterial({ name: 'jsRack', color: 0xc9ccd0, roughness: 0.35, metalness: 0.9 }),
  };
  return MATS;
}
function signTex(name, sub) {
  return canvasTex(1024, 192, (g, w, h) => {
    g.fillStyle = '#f6f1e2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f5f6b'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.font = '900 92px "Archivo Black", Impact, sans-serif'; g.fillStyle = '#ff5a1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, h * 0.42); g.transform(1, 0, -0.18, 1, 0, 0); g.fillText(name.toUpperCase(), 0, 0); g.restore();
    g.font = '800 34px Inter, Arial, sans-serif'; g.fillStyle = '#0f5f6b'; g.fillText(sub.toUpperCase(), w / 2, h * 0.8);
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  });
}
function priceTex(prices) {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#16323a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f6f1e2'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#ffd25a'; g.font = '900 54px "Archivo Black", Impact, sans-serif'; g.textAlign = 'center'; g.fillText('JET SKI', w / 2, 82);
    g.font = '700 38px Inter, Arial, sans-serif'; g.fillStyle = '#f6f1e2';
    prices.forEach((p, i) => { g.textAlign = 'left'; g.fillText(p[0], 44, 160 + i * 62); g.textAlign = 'right'; g.fillText(p[1], w - 44, 160 + i * 62); });
    g.font = '600 26px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#9fd8d6'; g.fillText('+ $50 DEPOSIT · LIFE VEST INCLUDED', w / 2, h - 40);
  });
}
function flagTex(text) {
  return canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#ff5a1f'; g.fillRect(0, 0, w, h); g.fillStyle = '#0f5f6b'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.save(); g.translate(w / 2 + 14, h * 0.45); g.rotate(-Math.PI / 2); g.font = '900 64px "Archivo Black", Impact, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(text, 0, 0); g.restore();
  });
}

export function buildStand(o = {}) {
  const M = mats(), group = new THREE.Group(); group.name = 'jetski-stand';
  const colliders = [];
  const box = (w, h, d, mat, x, y, z, name = 'stand') => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.name = name; m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  const cyl = (r, h, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 10), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  // deck (planks run across; UV repeat by size) on short posts sunk into the sand
  const deck = box(4.4, 0.12, 3.2, M.planks, 0, DECK_Y - 0.06, 0);
  { const uv = deck.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 1.6); }
  group.userData.surface = 'wood';
  for (const x of [-2.05, 0, 2.05]) for (const z of [-1.45, 1.45]) cyl(0.08, 0.5, M.post, x, DECK_Y - 0.3, z);
  colliders.push([0, DECK_Y / 2, 0, 2.2, DECK_Y / 2, 1.6]);
  // counter along the front with a pale top and the price board; a side wing on the left
  box(3.6, 1.0, 0.12, M.counter, 0, DECK_Y + 0.5, 1.2);
  box(0.12, 1.0, 1.0, M.counter, 1.74, DECK_Y + 0.5, 0.75);
  box(3.8, 0.05, 0.5, M.top, 0, DECK_Y + 1.03, 1.12);
  colliders.push([0, DECK_Y + 0.5, 1.2, 1.85, 0.55, 0.12], [1.74, DECK_Y + 0.5, 0.75, 0.08, 0.55, 0.5]);
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.675), new THREE.MeshStandardMaterial({ map: priceTex(o.prices || []), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  pb.position.set(-0.9, DECK_Y + 0.55, 1.27); group.add(pb);
  // roof: four posts, a canvas roof sloping to the back, a scalloped valance and the stand's sign on the front
  for (const [x, z] of [[-2.0, 1.4], [2.0, 1.4], [-2.0, -1.4], [2.0, -1.4]]) { cyl(0.06, 2.55, M.post, x, DECK_Y + 1.27, z); colliders.push([x, DECK_Y + 1.27, z, 0.07, 1.27, 0.07]); }
  const roof = box(4.7, 0.05, 3.5, M.canvas, 0, DECK_Y + 2.6, 0, 'stand-roof'); roof.rotation.x = 0.07;
  { const uv = roof.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i)); }
  const vg = new THREE.PlaneGeometry(4.7, 0.3);
  for (const [x, z, ry, len] of [[0, 1.76, 0, 4.7], [0, -1.76, Math.PI, 4.7], [2.36, 0, Math.PI / 2, 3.5], [-2.36, 0, -Math.PI / 2, 3.5]]) {
    const v = new THREE.Mesh(len === 4.7 ? vg : new THREE.PlaneGeometry(3.5, 0.3), M.valance); v.position.set(x, DECK_Y + 2.47 + (z > 0 ? 0.12 : z < 0 ? -0.12 : 0), z); v.rotation.y = ry; group.add(v);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.62, 0.06), [M.post, M.post, M.post, M.post, new THREE.MeshStandardMaterial({ map: signTex(o.name || 'Riptide', o.sub || 'Jet ski rentals'), roughness: 0.6 }), M.post]);
  sign.position.set(0, DECK_Y + 3.05, 1.55); sign.castShadow = true; group.add(sign);
  cyl(0.04, 0.5, M.post, -1.4, DECK_Y + 2.78, 1.55); cyl(0.04, 0.5, M.post, 1.4, DECK_Y + 2.78, 1.55);
  // life vest rack on the right side, outside the deck
  const rackX = -2.75;
  box(0.04, 1.5, 0.04, M.steel, rackX, 0.75, -0.8); box(0.04, 1.5, 0.04, M.steel, rackX, 0.75, 0.8); box(0.04, 0.04, 1.64, M.steel, rackX, 1.5, 0);
  colliders.push([rackX, 0.75, 0, 0.1, 0.75, 0.85]);
  const vg2 = new THREE.BoxGeometry(0.42, 0.55, 0.12); vg2.translate(0, -0.3, 0);
  for (let i = 0; i < 5; i++) { const v = new THREE.Mesh(vg2, M.vest); v.position.set(rackX, 1.48, -0.6 + i * 0.3); v.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.3; v.rotation.z = (Math.random() - 0.5) * 0.08; v.castShadow = true; group.add(v);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.13), M.strap); s.position.y = -0.38; v.add(s); const s2 = s.clone(); s2.position.y = -0.18; v.add(s2); }
  // feather flag
  const fx = 3.1, fz = 1.9;
  cyl(0.025, 4.2, M.steel, fx, 2.1, fz);
  const fg = new THREE.PlaneGeometry(0.6, 2.4, 1, 8); fg.translate(0.3, 0, 0);
  { const p = fg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); p.setZ(i, Math.sin(x * 3) * 0.12); p.setX(i, x * (0.8 + 0.2 * Math.cos((y / 1.2) * 0.8))); } fg.computeVertexNormals(); }
  const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: flagTex('JET SKI'), roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.set(fx, 2.85, fz); flag.castShadow = true; group.add(flag); group.userData.flag = flag;
  colliders.push([fx, 1.5, fz, 0.06, 1.5, 0.06]);
  // the user's props (converted GLBs), placed when loaded
  loadGLB('assets/models/street/umbrella_beach1.glb').then((m) => { if (!m) return; const u = shadows(fit(m, { height: 2.4 })); u.position.set(3.2, 0, -0.4); u.rotation.y = 0.4; group.add(u); });
  loadGLB('assets/models/keys/coolers.glb').then((m) => { if (!m) return; const u = shadows(fit(m, { height: 0.45 })); u.position.set(1.3, DECK_Y, -0.9); u.rotation.y = 2.6; group.add(u); });
  loadGLB('assets/models/keys/lifebuoy.glb').then((m) => { if (!m) return; const u = shadows(fit(m, { length: 0.62 })); u.rotation.x = Math.PI / 2; u.position.set(2.07, DECK_Y + 1.3, 1.47); group.add(u); });
  loadGLB('assets/models/keys/plastic_chair.glb').then((m) => { if (!m) return; const u = shadows(fit(m, { height: 0.85 })); u.position.set(-1.2, DECK_Y, -0.6); u.rotation.y = 2.9; group.add(u); });
  return { group, colliders, deckY: DECK_Y, attendant: { x: 0.4, y: DECK_Y, z: 0.55 } };
}
export const standMats = () => mats();
