// Port Solana V2 — wardrobe core (CHARACTER track): the piece catalog and the per-character outfit (garment meshes skinned to
// the character's skeleton, body cover masks so skin never pokes through, body-change morphs, wetness, plain-language description).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeClothMaterial, makeButtonMaterial } from '../nico/materials.js';
import { createShirtCloth } from './clothSim.js';

const DIR = '/assets/characters/wardrobe/';
const P = (n) => DIR + 'prints/tropical_' + n + '.webp';
// slot order = layering order. `cut` = mesh in garments.glb, `cover` = body mask, colorName/patternName feed describe().
export const SLOTS = ['under', 'top', 'bottom', 'shoes', 'watch', 'chain'];
export const CATALOG = [
  // ---- undershirt
  {
    id: 'tee_white',
    slot: 'under',
    cut: 'tee',
    name: 'White crew-neck tee',
    colorName: 'white',
    noun: 'tee',
    price: 0,
    mat: { color: 0xeeeae2, roughness: 0.92, specular: 0.4, sheen: 0.3, sheenColor: 0xffffff, weaveScale: 3800, fold: 0.5, flutter: 0.2 },
  },
  // ---- tops: Nico's signature faded palm-print camp shirt worn open, the plain teal button-up, prints and solids
  {
    id: 'shirt_palm_open',
    slot: 'top',
    cut: 'camp_shirt_open',
    name: 'Faded palm camp shirt (open)',
    colorName: 'teal',
    patternName: 'palm print',
    noun: 'shirt',
    price: 0,
    signature: true,
    mat: { print: DIR + 'prints/palm_teal.webp', color: 0xd6dede, repeatM: 0.52, roughness: 0.92, specular: 0.35, sheen: 0.25, sheenRoughness: 0.5, sheenColor: 0x4f8f88 },
    buttons: 0xe9e4d8,
    thread: 0x2f7f7c,
  },
  {
    id: 'shirt_camp_teal',
    slot: 'top',
    cut: 'camp_shirt',
    name: 'Teal linen camp shirt',
    colorName: 'teal',
    noun: 'shirt',
    price: 0,
    mat: {
      color: 0x0f5856,
      roughness: 0.9,
      specular: 0.45,
      sheen: 0.4,
      sheenRoughness: 0.45,
      sheenColor: 0x5aa8a0,
    },
    buttons: 0xf1ece2,
    thread: 0x2b8784,
  },
  { id: 'shirt_tropical_lagoon', slot: 'top', cut: 'camp_shirt', name: 'Lagoon tropical camp shirt', colorName: 'teal', patternName: 'tropical', noun: 'shirt', price: 0, mat: { print: P('lagoon'), repeatM: 0.6, roughness: 0.78, weaveScale: 2600 }, buttons: 0xf1ead8 },
  { id: 'shirt_tropical_sunset', slot: 'top', cut: 'camp_shirt', name: 'Sunset tropical camp shirt', colorName: 'coral', patternName: 'tropical', noun: 'shirt', price: 64, mat: { print: P('sunset'), repeatM: 0.6, roughness: 0.78 }, buttons: 0x2a2f52 },
  { id: 'shirt_tropical_midnight', slot: 'top', cut: 'camp_shirt', name: 'Midnight tropical camp shirt', colorName: 'navy', patternName: 'tropical', noun: 'shirt', price: 78, mat: { print: P('midnight'), repeatM: 0.6, roughness: 0.72, sheen: 0.5 }, buttons: 0x0d1020 },
  { id: 'shirt_tropical_bone', slot: 'top', cut: 'camp_shirt', name: 'Bone botanical camp shirt', colorName: 'off-white', patternName: 'tropical', noun: 'shirt', price: 58, mat: { print: P('bone'), repeatM: 0.6, roughness: 0.85 }, buttons: 0x7a7455 },
  { id: 'shirt_linen_white', slot: 'top', cut: 'camp_shirt', name: 'White linen camp shirt', colorName: 'white', noun: 'shirt', price: 42, mat: { color: 0xf2efe6, roughness: 0.88, weaveScale: 1700 }, buttons: 0xd8d2c0 },
  { id: 'shirt_black', slot: 'top', cut: 'camp_shirt', name: 'Black camp shirt', colorName: 'black', noun: 'shirt', price: 40, mat: { color: 0x17181b, roughness: 0.8 }, buttons: 0x2a2a2e },
  { id: 'shirt_stripe_blue', slot: 'top', cut: 'camp_shirt', name: 'Blue striped camp shirt', colorName: 'blue', patternName: 'striped', noun: 'shirt', price: 46, mat: { color: 0xf0efe9, color2: 0x3b6ea5, pattern: 2, roughness: 0.84 }, buttons: 0xf0efe9 },
  { id: 'shirt_gingham_red', slot: 'top', cut: 'camp_shirt', name: 'Red gingham camp shirt', colorName: 'red', patternName: 'checked', noun: 'shirt', price: 44, mat: { color: 0xf3efe8, color2: 0xb5352e, pattern: 3, roughness: 0.85 }, buttons: 0xf3efe8 },
  { id: 'uniform_security_shirt', slot: 'top', cut: 'camp_shirt', name: 'Security uniform shirt', colorName: 'dark blue', noun: 'uniform shirt', price: 0, disguise: 'security', mat: { color: 0x1c2740, roughness: 0.7, weaveScale: 3000 }, buttons: 0x9aa0a8 },
  { id: 'uniform_delivery_shirt', slot: 'top', cut: 'camp_shirt', name: 'Delivery uniform shirt', colorName: 'brown', noun: 'uniform shirt', price: 0, disguise: 'delivery', mat: { color: 0x5a3d26, roughness: 0.8 }, buttons: 0x3a2716 },
  { id: 'uniform_lifeguard_shirt', slot: 'top', cut: 'camp_shirt', name: 'Lifeguard shirt', colorName: 'red', noun: 'uniform shirt', price: 0, disguise: 'lifeguard', mat: { color: 0xc8261e, roughness: 0.8 }, buttons: 0xf2efe6 },
  { id: 'uniform_paramedic_shirt', slot: 'top', cut: 'camp_shirt', name: 'Paramedic uniform shirt', colorName: 'navy', noun: 'uniform shirt', price: 0, disguise: 'paramedic', mat: { color: 0x14203a, roughness: 0.72 }, buttons: 0xd0d4da },
  { id: 'uniform_valet_shirt', slot: 'top', cut: 'camp_shirt', name: 'Valet shirt', colorName: 'burgundy', noun: 'uniform shirt', price: 0, disguise: 'valet', mat: { color: 0x5e1a24, roughness: 0.7, sheen: 0.5 }, buttons: 0xc8a850 },
  // ---- bottoms
  { id: 'shorts_khaki', slot: 'bottom', cut: 'shorts', name: 'Khaki chino shorts', colorName: 'khaki', noun: 'shorts', price: 0, mat: { color: 0xb9a57e, roughness: 0.88, weaveScale: 2000, pattern: 5 } },
  { id: 'shorts_navy', slot: 'bottom', cut: 'shorts', name: 'Navy chino shorts', colorName: 'navy', noun: 'shorts', price: 36, mat: { color: 0x1d2740, roughness: 0.88, pattern: 5 } },
  { id: 'shorts_olive', slot: 'bottom', cut: 'shorts', name: 'Olive cargo shorts', colorName: 'olive', noun: 'shorts', price: 38, mat: { color: 0x565c3c, roughness: 0.9, pattern: 5 } },
  { id: 'shorts_denim', slot: 'bottom', cut: 'shorts', name: 'Washed denim shorts', colorName: 'blue denim', noun: 'shorts', price: 44, mat: { color: 0x4a6a94, roughness: 0.9, weaveScale: 1500, pattern: 5 } },
  { id: 'shorts_black', slot: 'bottom', cut: 'shorts', name: 'Black shorts', colorName: 'black', noun: 'shorts', price: 30, mat: { color: 0x151619, roughness: 0.85 } },
  { id: 'shorts_camo', slot: 'bottom', cut: 'shorts', name: 'Camo shorts', colorName: 'green', patternName: 'camo', noun: 'shorts', price: 40, mat: { color: 0x6b7350, color2: 0x3c4630, pattern: 4, roughness: 0.9 } },
  { id: 'swim_trunks_coral', slot: 'bottom', cut: 'shorts', name: 'Coral swim trunks', colorName: 'coral', noun: 'swim trunks', price: 28, swim: true, mat: { color: 0xee6f5e, roughness: 0.55, weaveScale: 3400, fold: 0.6 } },
  { id: 'swim_trunks_tropical', slot: 'bottom', cut: 'shorts', name: 'Tropical swim trunks', colorName: 'navy', patternName: 'tropical', noun: 'swim trunks', price: 34, swim: true, mat: { print: P('midnight'), repeatM: 0.45, roughness: 0.55, fold: 0.6 } },
  { id: 'uniform_lifeguard_shorts', slot: 'bottom', cut: 'shorts', name: 'Lifeguard shorts', colorName: 'red', noun: 'shorts', price: 0, disguise: 'lifeguard', mat: { color: 0xc8261e, roughness: 0.6 } },
  {
    id: 'pants_cargo_khaki',
    slot: 'bottom',
    cut: 'cargo_pants',
    name: 'Khaki cargo pants',
    colorName: 'khaki',
    noun: 'cargo pants',
    price: 0,
    mat: { color: 0x94714a, roughness: 0.92, specular: 0.35, sheen: 0.12, sheenColor: 0xc8a878, weaveScale: 2200, fold: 0.35, flutter: 0.3 },
  },
  // ---- shoes
  {
    id: 'sneakers_leather_offwhite',
    slot: 'shoes',
    cut: 'sneakers',
    name: 'Off-white leather sneakers',
    colorName: 'off-white',
    noun: 'sneakers',
    price: 0,
    leather: true,
    mat: { color: 0xe4dfd2, roughness: 0.55, specular: 0.6, weave: 0, fold: 0.1, flutter: 0, sheen: 0 },
  },
  { id: 'sneakers_white', slot: 'shoes', cut: 'sneakers', name: 'White low sneakers', colorName: 'white', noun: 'sneakers', price: 0, mat: { color: 0xf1f0ec, roughness: 0.6, weave: 0.4, fold: 0.15, flutter: 0 }, sole: 0xe6e2d6 },
  { id: 'sneakers_black', slot: 'shoes', cut: 'sneakers', name: 'Black low sneakers', colorName: 'black', noun: 'sneakers', price: 70, mat: { color: 0x18181a, roughness: 0.55, weave: 0.4, fold: 0.15, flutter: 0 } },
  { id: 'sneakers_red', slot: 'shoes', cut: 'sneakers', name: 'Red runners', colorName: 'red', noun: 'sneakers', price: 95, mat: { color: 0xc22a22, roughness: 0.5, weave: 0.8, fold: 0.15, flutter: 0 } },
  { id: 'boots_tan', slot: 'shoes', cut: 'sneakers', name: 'Tan work shoes', colorName: 'tan', noun: 'work shoes', price: 120, mat: { color: 0x9a6b3c, roughness: 0.7, weave: 0, fold: 0.3, flutter: 0, sheen: 0.1 } },
  { id: 'shoes_dress_black', slot: 'shoes', cut: 'sneakers', name: 'Black dress shoes', colorName: 'black', noun: 'dress shoes', price: 180, mat: { color: 0x0e0e10, roughness: 0.22, weave: 0, fold: 0.1, flutter: 0, sheen: 0 } },
  // ---- watch and chain (built in code)
  { id: 'watch_diver_steel', slot: 'watch', name: 'Steel dive watch', colorName: 'steel', noun: 'watch', price: 0, build: 'watch', opt: { caseC: 0xb8bcc2, dial: 0x0f2f3a, band: 0x2a2c30, metalBand: false } },
  { id: 'watch_gold', slot: 'watch', name: 'Gold dress watch', colorName: 'gold', noun: 'watch', price: 2400, build: 'watch', opt: { caseC: 0xd4a94e, dial: 0xf4efe0, band: 0xd4a94e, metalBand: true } },
  { id: 'chain_gold_thin', slot: 'chain', name: 'Thin gold chain', colorName: 'gold', noun: 'chain', price: 0, build: 'chain', opt: { color: 0xd9ad52, r: 0.0014 } },
  { id: 'chain_silver_thin', slot: 'chain', name: 'Thin silver chain', colorName: 'silver', noun: 'chain', price: 0, build: 'chain', opt: { color: 0xc9cdd2, r: 0.0013 } },
  { id: 'chain_silver', slot: 'chain', name: 'Silver curb chain', colorName: 'silver', noun: 'chain', price: 320, build: 'chain', opt: { color: 0xc4c8cc, r: 0.0022 } },
];
export const DEFAULT_OUTFIT = ['tee_white', 'shirt_palm_open', 'pants_cargo_khaki', 'sneakers_leather_offwhite', 'watch_diver_steel', 'chain_silver_thin'];
const byId = new Map(CATALOG.map((p) => [p.id, p]));
export const getPiece = (id) => byId.get(id);

let LIB = null;
export function preloadWardrobe() {
  if (LIB) return LIB;
  LIB = (async () => {
    const gltf = await new GLTFLoader().loadAsync(DIR + 'garments.glb');
    const cuts = {}; gltf.scene.traverse((o) => { if (o.isSkinnedMesh) cuts[o.name.replace(/[._]?\d+$/, '')] = o; });
    const covers = {};
    await Promise.all(['camp_shirt', 'camp_shirt_open', 'tee', 'shorts', 'cargo_pants', 'sneakers'].map((n) => new Promise((res) => { const im = new Image(); im.onload = () => { covers[n] = im; res(); }; im.onerror = () => res(); im.src = DIR + 'covers/' + n + '.png'; })));
    return { cuts, covers };
  })();
  return LIB;
}
let _lib = null; preloadWardrobe().then((l) => { _lib = l; }).catch(() => {});

function buildWatch(o) {
  const g = new THREE.Group(); const metal = new THREE.MeshStandardMaterial({ color: o.caseC, metalness: 1, roughness: 0.25 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0315, 0.0042, 10, 40), o.metalBand ? metal : new THREE.MeshStandardMaterial({ color: o.band, roughness: 0.7 })); band.scale.set(1, 0.84, 2.6); g.add(band);
  const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0215, 0.011, 36), metal); cs.rotation.x = Math.PI / 2; cs.position.z = 0; cs.position.y = 0.0285; cs.rotation.set(0, 0, 0); g.add(cs);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.0022, 8, 36), metal); bezel.rotation.x = Math.PI / 2; bezel.position.y = 0.034; g.add(bezel);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#' + new THREE.Color(o.dial).getHexString(); x.beginPath(); x.arc(128, 128, 128, 0, 7); x.fill();
  x.strokeStyle = o.metalBand ? '#3a3020' : '#e8f0f0'; x.fillStyle = x.strokeStyle;
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r0 = i % 5 ? 112 : 98; x.lineWidth = i % 5 ? 2 : 6; x.beginPath(); x.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); x.lineTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120); x.stroke(); }
  x.lineWidth = 7; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 46, 128 - 34); x.stroke(); x.lineWidth = 5; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 - 20, 128 - 88); x.stroke();
  x.beginPath(); x.arc(128, 128, 8, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.0188, 36), new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 })); dial.rotation.x = -Math.PI / 2; dial.position.y = 0.0343; g.add(dial);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.005, 12), metal); crown.rotation.z = Math.PI / 2; crown.position.set(0.0225, 0.0285, 0); g.add(crown);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
export function createOutfit({ character, model, bone, skin, meta, game }) {
  const time = { value: 0 }, wind = { value: new THREE.Vector3(0.3, 0, 0.15) }, wet = { value: 0 }, wetLine = { value: 3.0 };
  // cloth swing: one damped spring (model space) driven by the body's acceleration and the air moving past it
  const swing = { value: new THREE.Vector3() };
  let cloth = null;                                  // multi-point shirt cloth (clothSim.js)
  const sim = {
    x: new THREE.Vector3(),
    v: new THREE.Vector3(),
    prevP: null,
    vel: new THREE.Vector3(),
    acc: new THREE.Vector3(),
    gustT: Math.random() * 100,
    tread: new THREE.Vector3(),
  };
  const _p = new THREE.Vector3(), _w = new THREE.Vector3(), _rel = new THREE.Vector3(), _qi = new THREE.Quaternion(), _tg = new THREE.Vector3();
  // game.wind may be a vector { x, z } (m/s) or { dir | angle, speed, gust }; otherwise a mild shifting breeze
  function readWind(out, t) {
    const gw = game?.wind;
    if (gw && typeof gw.x === 'number' && typeof gw.z === 'number') return out.set(gw.x, 0, gw.z).multiplyScalar(1 + (gw.gust || 0) * Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3)));
    if (gw && typeof gw.speed === 'number') {
      const a = typeof gw.angle === 'number' ? gw.angle : 0;
      const d = gw.dir || gw.direction;
      if (d && typeof d.x === 'number') out.set(d.x, 0, d.z ?? d.y ?? 0).normalize(); else out.set(Math.sin(a), 0, Math.cos(a));
      const g = 1 + (gw.gust || 0) * Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3)) * 1.5;
      return out.multiplyScalar(gw.speed * g);
    }
    const a = 0.6 + Math.sin(t * 0.05) * 0.8;
    return out.set(Math.sin(a), 0, Math.cos(a)).multiplyScalar(1.6 + 1.2 * Math.max(0, Math.sin(t * 0.7) * Math.sin(t * 1.9)));
  }
  const worn = {};                      // slot -> { piece, objects: [Object3D] }
  let bodyW = { fat: 0, thin: 0, muscle: 0 };
  const skinned = () => { let s = null; model.traverse((o) => { if (!s && o.isSkinnedMesh && /LOD1/.test(o.name + (o.parent?.name || ''))) s = o; }); return s; };
  const cover = document.createElement('canvas'); cover.width = cover.height = 512; const cx = cover.getContext('2d');
  const coverTex = new THREE.CanvasTexture(cover); coverTex.flipY = false; coverTex.magFilter = THREE.NearestFilter; coverTex.minFilter = THREE.NearestFilter; coverTex.generateMipmaps = false;
  skin.uCover.value = coverTex;
  function refreshCover() {
    cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#000'; cx.fillRect(0, 0, 512, 512); cx.globalCompositeOperation = 'lighter';
    let any = false; for (const s in worn) { const im = _lib?.covers[worn[s].piece.cut]; if (im) { cx.drawImage(im, 0, 0, 512, 512); any = true; } }
    coverTex.needsUpdate = true; skin.uCoverOn.value = any ? 1 : 0;
  }
  function attachCut(name, material) {
    const src = _lib?.cuts[name]; const ref = skinned(); if (!src || !ref) return null;
    const bones = src.skeleton.bones.map((b) => model.getObjectByName(b.name) || ref.skeleton.bones[0]);
    const m = new THREE.SkinnedMesh(src.geometry, material); m.name = 'garment_' + name;
    m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
    m.morphTargetDictionary = src.morphTargetDictionary; m.morphTargetInfluences = (src.morphTargetInfluences || []).map(() => 0);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; ref.parent.add(m); return m;
  }
  function applyBody(m) { if (!m.morphTargetDictionary) return; for (const k in bodyW) { const i = m.morphTargetDictionary[k]; if (i !== undefined) m.morphTargetInfluences[i] = bodyW[k]; } }
  function remove(slot) { const w = worn[slot]; if (!w) return; for (const o of w.objects) { o.parent?.remove(o); o.material?.dispose?.(); } delete worn[slot]; }
  const outfit = {
    worn,
    wear(id, silent) {
      const p = byId.get(id); if (!p) return false;
      remove(p.slot); const objects = [];
      if (p.cut) {
        const isShirt = p.cut === 'camp_shirt' || p.cut === 'camp_shirt_open';
        const mat = makeClothMaterial({
          ...p.mat,
          construct: isShirt,
          clothSim: isShirt,
          shoe: p.cut === 'sneakers' && !p.noSole,
          leather: !!p.leather,
          cargo: p.cut === 'cargo_pants',
          openShirt: p.cut === 'camp_shirt_open',
          shorts: p.cut === 'shorts' && !p.swim,
          time,
          wind,
          wet,
          wetLine,
          swing: isShirt ? { value: new THREE.Vector3() } : swing,
        });
        const m = attachCut(p.cut, mat); if (!m) return false; applyBody(m); objects.push(m);
        if (isShirt) {
          try {
            cloth = createShirtCloth({ mesh: m, model, bone, game, open: p.cut === 'camp_shirt_open' });
            mat.userData.u.uCP = cloth.uCP;
          } catch (e) {
            cloth = null;
            console.warn('[wardrobe] shirt cloth unavailable', e);
          }
        }
        if (isShirt) {
          const bm = makeButtonMaterial({
            color: p.buttons ?? 0xf0ead8,
            thread: p.thread ?? p.mat.color ?? p.buttons ?? 0xf0ead8,
          });
          const b = attachCut(p.cut + '_buttons', bm);
          if (b) objects.push(b);
        }
      } else if (p.build === 'watch') {
        const w = buildWatch(p.opt); const fr = bone('LeftForeArmRoll') || bone('LeftForeArm'), h = bone('LeftHand');
        if (fr && h) { model.updateMatrixWorld(true); h.getWorldPosition(_a); bone('LeftForeArm').getWorldPosition(_b); const dir = _v.subVectors(_a, _b).normalize();
          w.position.copy(fr.worldToLocal(_a.clone().addScaledVector(dir, -0.028)));
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
          const wantUp = new THREE.Vector3(0, 0.35, -1).normalize(); wantUp.addScaledVector(dir, -wantUp.dot(dir)).normalize();          // dial on the back of the wrist
          const tw = new THREE.Quaternion().setFromUnitVectors(up, wantUp); q.premultiply(tw);
          w.quaternion.copy(fr.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); w.scale.setScalar(1 / fr.getWorldScale(new THREE.Vector3()).x * model.getWorldScale(_v).x); fr.add(w); objects.push(w); }
      } else if (p.build === 'chain') {
        const sp = bone('Spine2'), nk = bone('Neck');
        if (sp && nk) { model.updateMatrixWorld(true); const c0 = nk.getWorldPosition(new THREE.Vector3()); const pts = [];
          const fwd = model.getWorldDirection(new THREE.Vector3()), right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd);
          for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; const s = Math.sin(a), c = Math.cos(a); const drop = Math.max(0, c);
            pts.push(c0.clone().addScaledVector(right, s * 0.062).addScaledVector(fwd, 0.012 + c * 0.066 + drop * 0.022).add(new THREE.Vector3(0, -0.045 - drop * drop * 0.085 + (1 - drop) * 0.03 * (c < 0 ? 1 : 0), 0))); }
          const local = pts.map((q) => sp.worldToLocal(q)); const ch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(local, true), 160, p.opt.r, 6, true), new THREE.MeshStandardMaterial({ color: p.opt.color, metalness: 1, roughness: 0.28 }));
          ch.castShadow = false; sp.add(ch); objects.push(ch); }
      }
      worn[p.slot] = { piece: p, objects }; refreshCover();
      if (!silent) try { game?.emit?.('outfit:changed', { character, slot: p.slot, id, description: outfit.describe(), disguise: outfit.disguise() }); } catch (e) { /* ignore */ }
      return true;
    },
    remove(slot, silent) { remove(slot); refreshCover(); if (!silent) try { game?.emit?.('outfit:changed', { character, slot, id: null, description: outfit.describe(), disguise: outfit.disguise() }); } catch (e) { /* ignore */ } },
    set(ids) { for (const s of Object.keys(worn)) remove(s); for (const id of ids) outfit.wear(id, true); refreshCover(); try { game?.emit?.('outfit:changed', { character, description: outfit.describe(), disguise: outfit.disguise() }); } catch (e) { /* ignore */ } },
    current() { const o = {}; for (const s in worn) o[s] = worn[s].piece.id; return o; },
    ids() { return Object.values(worn).map((w) => w.piece.id); },
    // plain-language description for the police / witness system: "male, teal tropical shirt, khaki shorts, white sneakers"
    describe() {
      const parts = ['male'];
      for (const s of ['top', 'bottom', 'shoes']) {
        const p = worn[s]?.piece;
        const u = s === 'top' ? worn.under?.piece : null;
        if (p) parts.push([p.colorName, p.patternName, p.noun].filter(Boolean).join(' ') + (u ? ' over a ' + [u.colorName, u.noun].join(' ') : ''));
        else if (s === 'top') parts.push(u ? [u.colorName, u.noun].join(' ') : 'shirtless');
        else if (s === 'shoes') parts.push('barefoot');
      }
      return parts.join(', ');
    },
    disguise() { const t = worn.top?.piece?.disguise; return t || null; },
    setBody(w) { bodyW = w; for (const s in worn) for (const o of worn[s].objects) if (o.isSkinnedMesh) applyBody(o); },
    setWet(v, line) { wet.value = v; if (line !== undefined) wetLine.value = line; }, setLOD() {},
    update(dt, anim) {
      time.value += dt;

      const h = Math.min(0.05, Math.max(1e-3, dt));
      model.getWorldPosition(_p);
      if (sim.prevP) {
        const nv = _w.subVectors(_p, sim.prevP).divideScalar(h);
        if (nv.lengthSq() > 900) nv.set(0, 0, 0);                    // teleports
        sim.acc.lerp(_tg.subVectors(nv, sim.vel).divideScalar(h), 0.3);
        sim.vel.copy(nv);
      }
      sim.prevP = (sim.prevP || new THREE.Vector3()).copy(_p);
      const aspd = anim?.swimming ? 0 : (anim?.speed || 0);
      sim.tread.set(0, 0, 0);
      if (aspd > 0.3 && sim.vel.length() < aspd * 0.2) {                       // in place (viewer, treadmill): use the gait speed
        model.getWorldDirection(_w).setY(0).normalize();
        sim.tread.copy(_w).multiplyScalar(aspd);
        sim.vel.lerp(sim.tread, 0.2);
      }
      if (cloth && /^camp_shirt/.test(worn.top?.piece?.cut || '')) {
        try { cloth.update(dt, sim.tread, wet.value * (wetLine.value > 0.9 ? 1 : 0.4)); } catch (e) { cloth = null; }
      }
      model.getWorldQuaternion(_qi).invert();
      readWind(_rel, time.value).sub(sim.vel).applyQuaternion(_qi);          // air moving past the body, model space
      const air = _rel.length();
      // drag pushes the loose cloth downwind (more at speed), a little lift when running; inertia from acceleration
      _tg.copy(_rel).multiplyScalar(0.0075 * Math.min(1, 0.35 + air * 0.12));
      _tg.y = Math.min(0.012, air * 0.0018);
      const accL = _w.copy(sim.acc).applyQuaternion(_qi).clampLength(0, 30);
      const k = 70, c = 5.5;
      sim.v.addScaledVector(_w.subVectors(_tg, sim.x).multiplyScalar(k).addScaledVector(sim.v, -c).addScaledVector(accL, -0.35), h);
      sim.x.addScaledVector(sim.v, h).clampLength(0, 0.06);
      // walking / running bob: the hem keeps bouncing a little behind the stride
      const sp = anim?.speed || 0;
      const bob = Math.sin(time.value * (5.5 + sp * 1.2)) * Math.min(0.006, sp * 0.0016);
      swing.value.set(sim.x.x, sim.x.y + bob, sim.x.z);
      wind.value.copy(_rel).multiplyScalar(0.12).clampLength(0, 1.2);
    },
  };
  if (_lib) outfit.set(DEFAULT_OUTFIT); else preloadWardrobe().then(() => outfit.set(DEFAULT_OUTFIT));
  return outfit;
}
