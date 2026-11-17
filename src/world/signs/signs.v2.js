// KEYS-SIGN track: US-style highway guide signs on gantries and Miami-style street-name blades, placed from
// game.city.roadGraph (pure function of the graph: see plan.js) and streamed around the camera.
// game.signs = { plan, verify(), stats }.  Not yet here (see docs/v2/reports/keys-sign.md): regulatory and warning
// signs, mile markers, billboards, bend-on-hit posts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planSigns, verifyGuides } from './plan.js';
import { drawGuidePanel, drawBlade } from './draw.js';
import { makeCanvas, rng, hashStr, vnoise } from './util.js';
export const order = 60;

export async function initV2(game) {
  const G = game.city?.roadGraph; if (!G?.edges?.length) return;
  const { scene, camera, world, RAPIER } = game, city = game.city;
  const plan = planSigns(G, { armBlades: !!city.streetKit, placeAt: (x, z) => { try { return city.districtAt?.(x, z) || null; } catch { return null; } } });
  const root = new THREE.Group(); root.name = 'v2-signs'; scene.add(root);
  // shared materials
  const steelTex = (() => { const c = makeCanvas(128), x = c.getContext('2d'), id = x.createImageData(128, 128); for (let i = 0; i < 128 * 128; i++) { const v = 150 + vnoise((i % 128) * 0.35, (i / 128 | 0) * 0.35, 3) * 60 + vnoise((i % 128) * 0.04, (i / 128 | 0) * 0.5, 9) * 30; id.data[i * 4] = v * 0.96; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v * 1.02; id.data[i * 4 + 3] = 255; } x.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  // r2-art (ART_STYLE.md): bare galvanized steel is metal (1), the painted / oxidized sign backs are dielectric (0); no in-between
  const steel = new THREE.MeshStandardMaterial({ map: steelTex, roughness: 0.5, metalness: 1, name: 'sign:galvanized' });
  const concrete = new THREE.MeshStandardMaterial({ map: steelTex, color: 0xcfcabb, roughness: 0.9 });
  const backTex = (() => { const c = makeCanvas(256, 256), x = c.getContext('2d'), R = rng(3); x.fillStyle = '#9fa5a6'; x.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) { x.fillStyle = 'rgba(40,44,46,0.35)'; x.fillRect(0, y, 256, 2); x.fillStyle = 'rgba(255,255,255,0.2)'; x.fillRect(0, y + 2, 256, 1.5); } for (let i = 0; i < 14; i++) { const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(60,50,40,0.25)'); g.addColorStop(1, 'rgba(60,50,40,0)'); x.fillStyle = g; x.fillRect(R() * 256, 0, 4 + R() * 10, 256); }
    // stickers and a tag, as found on the backs of real signs
    x.fillStyle = '#e8e2d0'; x.fillRect(150, 170, 34, 22); x.fillStyle = '#c23b2e'; x.fillRect(196, 186, 22, 22); x.strokeStyle = 'rgba(20,20,30,0.75)'; x.lineWidth = 3; x.beginPath(); x.moveTo(30, 210); x.bezierCurveTo(50, 170, 60, 230, 80, 190); x.bezierCurveTo(90, 170, 100, 220, 120, 200); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.58, metalness: 0, name: 'sign:back' });
  const faceMats = new Set();
  const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1))); return g; };
  const tube = (r, len, x, y, z, rz = 0) => { const g = new THREE.CylinderGeometry(r, r, len, 12).toNonIndexed(); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1))); return g; };

  // ------------------------------------------------ gantries
  function buildGantry(g) {
    const grp = new THREE.Group(); grp.position.set(g.x, g.y, g.z); grp.rotation.y = Math.atan2(-g.dx, -g.dz);
    const onDeck = g.y > 0.5, hw = g.width / 2 + (onDeck ? 0.9 : 1.3), span = hw * 2, H = 7.9, parts = [], conc = [];
    const faces = g.panels.map((p, i) => drawGuidePanel(p, { seed: hashStr(g.id) + i }));
    let total = faces.reduce((a, f) => a + f.w, 0) + 0.3 * (faces.length - 1); const k = Math.min(1, (span - 0.6) / total); total *= k;
    const maxH = Math.max(...faces.map((f) => f.h * k)), cy = 6.2 + maxH / 2 - 0.3, beamY = Math.max(6.6, cy);
    for (const s of [-1, 1]) {
      conc.push(box(1.0, onDeck ? 1.1 : 0.7, 1.0, s * hw, onDeck ? 0.55 : 0.35, 0));
      if (g.type === 'truss') { for (const dz of [-0.55, 0.55]) parts.push(box(0.28, H, 0.28, s * hw, H / 2, dz)); for (let y = 1.2; y < H - 0.4; y += 1.3) parts.push(box(0.08, 0.08, 1.35, s * hw, y, 0, (y / 1.3 | 0) % 2 ? 0.75 : -0.75)); parts.push(box(0.6, 0.05, 1.5, s * hw, 0.72 + (onDeck ? 0.4 : 0), 0)); }
      else { parts.push(tube(0.26, H, s * hw, H / 2, 0)); parts.push(tube(0.42, 0.06, s * hw, 0.74 + (onDeck ? 0.4 : 0), 0)); }
    }
    if (g.type === 'truss') {
      const y0 = beamY - 0.8, y1 = beamY + 0.8;
      for (const y of [y0, y1]) for (const dz of [-0.55, 0.55]) parts.push(box(span + 0.3, 0.14, 0.14, 0, y, dz));
      const n = Math.max(3, Math.round(span / 1.7));
      for (let i = 0; i <= n; i++) { const x = -hw + span * i / n; for (const dz of [-0.55, 0.55]) parts.push(box(0.07, 1.6, 0.07, x, beamY, dz)); parts.push(box(0.06, 0.06, 1.1, x, y0, 0), box(0.06, 0.06, 1.1, x, y1, 0)); if (i < n) { const L = Math.hypot(span / n, 1.6), a = Math.atan2(1.6, span / n) * (i % 2 ? 1 : -1); for (const dz of [-0.55, 0.55]) parts.push(box(L, 0.06, 0.06, x + span / n / 2, beamY, dz, 0, 0, a)); } }
    } else { parts.push(tube(0.24, span + 0.5, 0, H - 0.3, 0, Math.PI / 2), tube(0.2, span + 0.5, 0, H - 2.0, 0, Math.PI / 2)); }
    // catwalk with handrail, and luminaires under the panels
    const pz = g.type === 'truss' ? 0.72 : 0.36, cwY = cy - maxH / 2 - 0.42;
    parts.push(box(total + 0.4, 0.05, 0.7, 0, cwY, pz + 0.45), box(total + 0.4, 0.04, 0.04, 0, cwY + 1.0, pz + 0.8), box(total + 0.4, 0.03, 0.03, 0, cwY + 0.5, pz + 0.8));
    for (let x = -total / 2; x <= total / 2 + 0.01; x += Math.max(1.2, total / 8)) { parts.push(box(0.04, 1.0, 0.04, x, cwY + 0.5, pz + 0.8), box(0.05, 0.05, 0.9, x, cwY - 0.04, pz + 0.3)); }
    let x = -total / 2;
    faces.forEach((f, i) => {
      const w = f.w * k, h = f.h * k, t = new THREE.CanvasTexture(f.canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.1, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0 }); faceMats.add(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x + w / 2, cy, pz); grp.add(m);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat); b.position.set(x + w / 2, cy, pz - 0.05); b.rotation.y = Math.PI; grp.add(b);
      parts.push(box(w, h, 0.045, x + w / 2, cy, pz - 0.025), box(0.08, h + 0.5, 0.1, x + w * 0.25, cy, pz - 0.1), box(0.08, h + 0.5, 0.1, x + w * 0.75, cy, pz - 0.1));
      for (const lx of [0.28, 0.72]) parts.push(box(0.04, 0.04, 1.0, x + w * lx, cy - h / 2 - 0.25, pz + 0.5), box(0.3, 0.12, 0.2, x + w * lx, cy - h / 2 - 0.22, pz + 1.0, 0.5));
      if (f.tab) { const tw = f.tab.w * k, th = f.tab.h * k, tt = new THREE.CanvasTexture(f.tab.canvas); tt.colorSpace = THREE.SRGBColorSpace; const tm = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.42, emissiveMap: tt, emissive: 0xffffff, emissiveIntensity: 0 }); faceMats.add(tm); const side = g.panels[i].exitSide === 'left' ? x + tw / 2 : x + w - tw / 2; const tmesh = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), tm); tmesh.position.set(side, cy + h / 2 + th / 2 + 0.02, pz); grp.add(tmesh); parts.push(box(tw, th, 0.04, side, cy + h / 2 + th / 2 + 0.02, pz - 0.025)); }
      x += w + 0.3 * k;
    });
    const sm = new THREE.Mesh(mergeGeometries(parts), steel); sm.castShadow = true; sm.receiveShadow = true; grp.add(sm);
    const cm = new THREE.Mesh(mergeGeometries(conc), concrete); cm.receiveShadow = true; grp.add(cm);
    for (const p of [...parts, ...conc]) p.dispose();
    grp.updateMatrixWorld(true); root.add(grp);
    const cols = [];
    try { for (const s of [-1, 1]) { const w = new THREE.Vector3(s * hw, H / 2, 0).applyMatrix4(grp.matrixWorld), qy = new THREE.Quaternion().setFromEuler(grp.rotation); cols.push(world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, H / 2, 0.75).setTranslation(w.x, w.y, w.z).setRotation({ x: qy.x, y: qy.y, z: qy.z, w: qy.w }))); } } catch (e) { /* visual only */ }
    return { grp, cols };
  }
  function drop(o) { root.remove(o.grp); o.grp.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); if (m.material !== steel && m.material !== concrete && m.material !== backMat) { faceMats.delete(m.material); m.material.map?.dispose(); m.material.dispose(); } } }); for (const c of o.cols || []) { try { world.removeCollider(c, false); } catch (e) { /* */ } } }

  // ------------------------------------------------ street-name blades, in 160 m cells
  const CELL = 160, cells = new Map();
  for (const b of plan.blades) { const k = Math.floor(b.x / CELL) + ',' + Math.floor(b.z / CELL); let c = cells.get(k); if (!c) cells.set(k, c = { key: k, cx: (Math.floor(b.x / CELL) + 0.5) * CELL, cz: (Math.floor(b.z / CELL) + 0.5) * CELL, posts: [], live: null }); c.posts.push(b); }
  function buildCell(c) {
    const labels = new Map(); for (const p of c.posts) for (const s of p.signs) { const k = s.name + '|' + (s.block ?? ''); if (!labels.has(k)) labels.set(k, { s, i: labels.size }); }
    const cols = 4, rows = Math.ceil(labels.size / cols), CW = 256, CH = 64, cv = makeCanvas(cols * CW, Math.max(1, rows) * CH), x = cv.getContext('2d');
    for (const { s, i } of labels.values()) drawBlade(x, s, (i % cols) * CW, (i / cols | 0) * CH, CW, CH);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const posts = [], P = [], U = [], N = [];
    for (const p of c.posts) {
      let gy = 0; try { gy = city.groundHeightAt(p.x, p.z) ?? 0; } catch (e) { /* */ }
      if (city.isWater?.(p.x, p.z)) continue;
      const pg = new THREE.CylinderGeometry(0.035, 0.04, 3.35, 8).toNonIndexed(); pg.translate(p.x, gy + 1.675, p.z); posts.push(pg);
      const cap = new THREE.SphereGeometry(0.05, 8, 6).toNonIndexed(); cap.translate(p.x, gy + 3.37, p.z); posts.push(cap);
      p.signs.forEach((s, j) => {
        const { i } = labels.get(s.name + '|' + (s.block ?? '')), u0 = (i % cols) / cols, u1 = u0 + 1 / cols, v1 = 1 - (i / cols | 0) / rows, v0 = v1 - 1 / rows, y0 = gy + 2.74 + j * 0.27, y1 = y0 + 0.23, hl = 0.46;
        for (const f of [1, -1]) { const ax = p.x - s.dx * hl * f, az = p.z - s.dz * hl * f, bx = p.x + s.dx * hl * f, bz = p.z + s.dz * hl * f, nx = -s.dz * f, nz = s.dx * f, o = 0.012;
          const q = [[ax, y0, az, u0, v0], [bx, y0, bz, u1, v0], [bx, y1, bz, u1, v1], [ax, y0, az, u0, v0], [bx, y1, bz, u1, v1], [ax, y1, az, u0, v1]];
          for (const t of q) { P.push(t[0] + nx * o, t[1], t[2] + nz * o); U.push(t[3], t[4]); N.push(nx, 0, nz); } }
      });
    }
    const grp = new THREE.Group();
    if (posts.length) { const pm = new THREE.Mesh(mergeGeometries(posts), steel); pm.castShadow = true; grp.add(pm); for (const g of posts) g.dispose(); }
    if (P.length) { const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, side: THREE.DoubleSide, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0 }); faceMats.add(mat); grp.add(new THREE.Mesh(bg, mat)); }
    root.add(grp); return { grp };
  }

  // ------------------------------------------------ streaming
  const live = new Map(); let tick = 0, night = -1;
  const stats = { gantries: plan.guides.length, bladePosts: plan.blades.length, liveGantries: 0, liveCells: 0 };
  function stream(dt) {
    tick -= dt; if (tick > 0) return; tick = 0.2;
    const cx = camera.position.x, cz = camera.position.z; let built = 0;
    for (const g of plan.guides) { const d2 = (g.x - cx) ** 2 + (g.z - cz) ** 2, o = live.get(g.id); if (!o && d2 < 760 * 760 && built < 1) { try { live.set(g.id, buildGantry(g)); } catch (e) { console.warn('[signs] gantry', g.id, e); live.set(g.id, { grp: new THREE.Group(), cols: [] }); } built++; } else if (o && d2 > 900 * 900) { drop(o); live.delete(g.id); } }
    const i0 = Math.floor(cx / CELL), j0 = Math.floor(cz / CELL); let lc = 0;
    for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = i0 - 2; i <= i0 + 2; i++) { const c = cells.get(i + ',' + j); if (c && !c.live && built < 2 && (c.cx - cx) ** 2 + (c.cz - cz) ** 2 < 260 * 260) { try { c.live = buildCell(c); } catch (e) { console.warn('[signs] blades', e); c.live = { grp: new THREE.Group() }; } built++; } }
    for (const c of cells.values()) if (c.live) { if ((c.cx - cx) ** 2 + (c.cz - cz) ** 2 > 380 * 380) { drop(c.live); c.live = null; } else lc++; }
    stats.liveGantries = live.size; stats.liveCells = lc;
    const nf = Math.round((game.env?.nightFactor ?? 0) * 20) / 20; if (nf !== night) { night = nf; } for (const m of faceMats) m.emissiveIntensity = 0.3 * night; // retroreflective sheeting reads at night
  }
  game.updaters.push(stream);
  game.signs = { plan, verify: () => verifyGuides(G, plan), stats, root };
}
