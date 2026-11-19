// SOUTHLINE: the wardrobe (main-menu track). Nico on a lit turntable stage, rendered through the game's own post chain
// (bloom, grade, depth of field), dressed with the real outfit system (game.wardrobe, CHARACTER track) so every
// change is the live garment. Drag to turn him, scroll to zoom. Reached from the title menu and the pause menu.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { el, esc } from '../core/dom.js';
import { icon } from '../core/icons.js';

const CATS = [
  { id: 'tops', label: 'Tops', icon: 'shirt', slots: ['top', 'under'], frame: { y: 1.3, d: 2.35 } },
  { id: 'bottoms', label: 'Bottoms', icon: 'layers', slots: ['bottom'], frame: { y: 0.8, d: 2.5 } },
  { id: 'shoes', label: 'Shoes', icon: 'shoe', slots: ['shoes'], frame: { y: 0.28, d: 1.55 } },
  { id: 'acc', label: 'Accessories', icon: 'gem', slots: ['watch', 'chain', 'glasses', 'sunglasses', 'hat', 'hats'], frame: { y: 1.25, d: 1.9 } },
];
const SLOT_LABEL = { top: 'Shirts', under: 'Undershirts', bottom: 'Shorts and pants', shoes: 'Shoes', watch: 'Watches', chain: 'Chains', glasses: 'Sunglasses', sunglasses: 'Sunglasses', hat: 'Hats', hats: 'Hats' };
const FULL = { y: 1.0, d: 3.7 };

let stageCache = null;
function buildStage(renderer) {
  if (stageCache) return stageCache;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a12);
  scene.fog = new THREE.Fog(0x070a12, 7, 16);
  try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; pm.dispose(); } catch (e) { /* no env */ }
  const g = new THREE.Group(); scene.add(g);
  // cyclorama: a curved backdrop with a dusk gradient
  const cyc = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 7, 64, 1, true, Math.PI * 0.15, Math.PI * 1.7), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x0b1020) }, uMid: { value: new THREE.Color(0x3a1838) }, uLow: { value: new THREE.Color(0x0d1a24) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uTop,uMid,uLow; varying vec3 vP; void main(){ float h = clamp((vP.y + 3.5) / 7.0, 0.0, 1.0); vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.42, h)); c = mix(c, uTop, smoothstep(0.42, 0.95, h)); float a = atan(vP.x, vP.z); c *= 0.75 + 0.25 * cos(a); gl_FragColor = vec4(c * 0.55, 1.0); }',
  }));
  cyc.position.y = 3.2; cyc.rotation.y = Math.PI; g.add(cyc);
  // floor: dark glossy disc + a coral neon ring
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 96), new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.28, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.06, 96), new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.45, metalness: 0.35 }));
  plinth.position.y = 0.03; plinth.receiveShadow = true; g.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a4d).multiplyScalar(4), toneMapped: true }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.062; g.add(ring);
  // two neon tubes behind (deco pylons), caught by the bloom
  for (const [x, c] of [[-2.3, 0xff5c9d], [2.3, 0x1fd6c1]]) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(5) }));
    tube.position.set(x, 1.6, -2.4); g.add(tube);
    const glow = new THREE.PointLight(c, 3.5, 6, 2); glow.position.set(x, 1.6, -2.1); g.add(glow);
  }
  // lights: warm key, cool and pink rims, soft fill
  const key = new THREE.SpotLight(0xffe2c4, 55, 14, 0.5, 0.6, 1.6); key.position.set(-2.2, 3.8, 3.0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  g.add(key, key.target);
  const rimL = new THREE.SpotLight(0xff6aa8, 26, 10, 0.55, 0.8, 1.6); rimL.position.set(-2.4, 2.4, -2.6); g.add(rimL, rimL.target);
  const rimR = new THREE.SpotLight(0x5ff0e0, 30, 10, 0.55, 0.8, 1.6); rimR.position.set(2.6, 2.6, -2.2); g.add(rimR, rimR.target);
  const fill = new THREE.HemisphereLight(0x9fb4d8, 0x1a1012, 0.55); g.add(fill);
  for (const s of [key, rimL, rimR]) s.target.position.set(0, 1.0, 0);
  stageCache = { scene, group: g, ring };
  return stageCache;
}

export function openWardrobeStage(game, ctx, cin, o = {}) {
  const W = game.wardrobe, char = game.playerCharacter, B = ctx.bindings, t = ctx.t;
  if (!W || !char?.root) { ctx.notify?.('The wardrobe is not available right now', 2500); o.onClose?.(); return null; }
  const fromPause = o.from === 'pause';
  const leaveUI = fromPause ? B.pushMode('ui') : null;
  const stage = buildStage(game.renderer);
  const root = char.root, prevParent = root.parent, wasVisible = root.visible;
  stage.scene.add(root);
  char.setVisible?.(true); root.visible = true;
  char.setMeshLOD?.(0);
  const shadowsWas = []; root.traverse((m) => { if (m.isMesh) { shadowsWas.push([m, m.castShadow]); m.castShadow = true; } });
  const prevExposure = game.renderer.toneMappingExposure;
  cin.cancelFade?.();
  cin.stage(stage.scene, { exposure: 1.0 });
  // camera: orbit target follows the category; drag spins Nico, wheel zooms
  const view = { yaw: 0.35, yawV: 0, zoom: 1, frame: { ...FULL }, cur: { y: FULL.y, d: FULL.d }, pitch: 0.06 };
  const center = new THREE.Vector3();
  let lastT = performance.now();
  const camPos = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    view.yaw += view.yawV * dt; view.yawV *= Math.exp(-dt * 3.2);
    if (!drag && Math.abs(view.yawV) < 0.02) view.yaw += dt * 0.12;               // slow idle turn
    view.cur.y += (view.frame.y - view.cur.y) * Math.min(1, dt * 4);
    view.cur.d += (view.frame.d * view.zoom - view.cur.d) * Math.min(1, dt * 4);
    center.copy(root.position);
    stage.group.position.copy(center);
    root.rotation.set(0, view.yaw, 0);
    if (game.ui?.paused) { try { char.update(dt, { speed: 0, grounded: true }); } catch (e) { /* */ } }
    return new THREE.Vector3(center.x, center.y + view.cur.y + view.cur.d * view.pitch + 0.08, center.z + view.cur.d);
  };
  const lookAt = () => new THREE.Vector3(center.x, center.y + view.cur.y, center.z);
  const prevShot = cin.state.shot, prevActive = cin.active;
  cin.begin({ letterbox: false, dof: true, flare: false, grain: 1.2, vignette: 0.18, owner: 'wardrobe' });
  cin.shot({ dur: 1e9, fov: 30, aperture: 1.6, maxCoc: 9, handheld: 0.15, from: { pos: camPos, look: lookAt }, focus: lookAt });
  const lookT = setInterval(() => { try { char.lookAt?.(game.camera.position); } catch (e) { /* */ } }, 400);

  // ---- UI
  let cat = o.category || 'tops';
  const ui = el('div', 'pm-ward ps-interactive' + (fromPause ? ' from-pause' : ''));
  ui.innerHTML = `
    <div class="pm-ward-drag" title="Drag to turn, scroll to zoom"></div>
    <header class="pm-ward-head"><span class="pm-kicker">${icon('shirt')} ${esc(t('Wardrobe'))}</span><h2>Nico</h2><p class="pm-ward-desc"></p></header>
    <nav class="pm-ward-cats">${CATS.map((c) => `<button class="pm-ward-cat" data-nav data-cat="${c.id}">${icon(c.icon)}<span>${esc(t(c.label))}</span></button>`).join('')}</nav>
    <section class="pm-ward-panel"><div class="pm-ward-list ps-scroll"></div>
      <div class="pm-ward-act"><button class="ps-btn" data-nav data-act="saveOutfit">${icon('check')} Save as outfit</button><div class="pm-ward-outfits"></div></div></section>
    <footer class="pm-ward-foot ps-hints"></footer>`;
  ctx.layer('modal').appendChild(ui);
  requestAnimationFrame(() => ui.classList.add('in'));
  const list = ui.querySelector('.pm-ward-list'), desc = ui.querySelector('.pm-ward-desc'), outfitsEl = ui.querySelector('.pm-ward-outfits');
  ui.querySelector('.pm-ward-foot').innerHTML = ''; // no control legend (user: minimal, GTA-like)
  const swatch = (p) => {
    const m = p.mat || {};
    if (m.print) return `background-image:url('${m.print}');background-size:220%`;
    const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
    if (m.color2 != null) return `background:repeating-linear-gradient(45deg,${hex(m.color)} 0 5px,${hex(m.color2)} 5px 10px)`;
    if (m.color != null) return `background:${hex(m.color)}`;
    return '';
  };
  function render(focusId) {
    ui.querySelectorAll('.pm-ward-cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
    const C = CATS.find((c) => c.id === cat), cur = W.current();
    const slots = C.slots.filter((s) => W.slots.includes(s));
    view.frame = { ...C.frame };
    let h = '';
    for (const s of slots) {
      const items = W.list(s).filter((p) => !p.disguise || p.owned);
      h += `<h3>${esc(SLOT_LABEL[s] || s)}</h3><div class="pm-ward-grid">`;
      for (const p of items) {
        const full = W.catalog.find((x) => x.id === p.id) || {};
        const on = cur[s] === p.id;
        h += `<button class="pm-wi${on ? ' on' : ''}${p.owned ? '' : ' locked'}" data-nav data-id="${p.id}" data-slot="${s}">
          <i class="pm-wi-sw" style="${swatch(full)}"></i><b>${esc(p.name)}${p.signature ? ' <em>Signature</em>' : ''}</b>
          <span>${on ? 'Wearing' : p.owned ? 'Owned' : '$' + p.price + ' · in stores'}</span></button>`;
      }
      if (s !== 'top' && s !== 'bottom') h += `<button class="pm-wi pm-wi-off${cur[s] ? '' : ' on'}" data-nav data-off="${s}"><i class="pm-wi-sw">${icon('close')}</i><b>None</b><span>${cur[s] ? 'Take off' : 'Not wearing'}</span></button>`;
      h += '</div>';
    }
    if (C.id === 'acc' && !W.slots.some((s) => /glass|hat/.test(s))) h += '<p class="pm-small pm-ward-note">Sunglasses and hats arrive with the next wardrobe drop.</p>';
    list.innerHTML = h;
    desc.textContent = 'Police would see: ' + (W.describe?.() || '');
    const outs = W.outfits?.() || [];
    outfitsEl.innerHTML = outs.slice(-4).map((n) => `<button class="pm-chip" data-nav data-outfit="${esc(n)}">${esc(n)}</button>`).join('');
    scope.refresh(focusId ? `[data-id="${focusId}"], [data-off="${focusId}"]` : null);
  }
  const scope = ctx.nav.push({
    root: ui, wrap: true, onBack: close,
    onTab(d) { const i = CATS.findIndex((c) => c.id === cat); cat = CATS[(i + d + CATS.length) % CATS.length].id; render(); },
    onAction(a) { if (a === 'alt2') view.yawV += 3.5; },
  });
  ui.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; ctx.sfx('tab'); render(); return; }
    const it = e.target.closest('[data-id]');
    if (it) {
      if (!W.owns(it.dataset.id)) { ctx.sfx('deny'); ctx.notify?.('Buy it at a clothing store first', 2200); return; }
      if (W.wear(it.dataset.id)) { ctx.sfx('select'); stage.ring.scale.setScalar(1.12); }
      render(it.dataset.id); return;
    }
    const off = e.target.closest('[data-off]'); if (off) { W.remove(off.dataset.off); ctx.sfx('back'); render(off.dataset.off); return; }
    const of = e.target.closest('[data-outfit]'); if (of) { W.loadOutfit(of.dataset.outfit); ctx.sfx('select'); render(); return; }
    if (e.target.closest('[data-act=saveOutfit]')) { W.saveOutfit(); ctx.sfx('confirm'); ctx.notify?.('Outfit saved', 1800); render(); }
  });
  // drag / zoom on the stage area
  let drag = null;
  const dragEl = ui.querySelector('.pm-ward-drag');
  dragEl.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, t: performance.now() }; dragEl.setPointerCapture?.(e.pointerId); });
  dragEl.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, now = performance.now(); view.yaw += dx * 0.011; view.yawV = (dx * 0.011) / Math.max(0.008, (now - drag.t) / 1000); drag.x = e.clientX; drag.t = now; });
  const endDrag = () => { drag = null; }; dragEl.addEventListener('pointerup', endDrag); dragEl.addEventListener('pointercancel', endDrag);
  ui.addEventListener('wheel', (e) => { if (e.target.closest('.pm-ward-panel')) return; e.preventDefault(); view.zoom = Math.min(1.6, Math.max(0.45, view.zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  const padT = B.on('padaxes', (a) => { if (Math.abs(a.rx) > 0.15) view.yawV = a.rx * 3; if (Math.abs(a.ry) > 0.25) view.zoom = Math.min(1.6, Math.max(0.45, view.zoom * Math.exp(a.ry * a.dt * 1.5))); });
  const ringT = setInterval(() => stage.ring.scale.lerp(new THREE.Vector3(1, 1, 1), 0.25), 33);
  render();

  function close() {
    scope.pop(); padT(); clearInterval(lookT); clearInterval(ringT);
    ui.classList.remove('in'); ui.classList.add('out'); setTimeout(() => ui.remove(), 320);
    cin.stage(null); game.renderer.toneMappingExposure = prevExposure;
    for (const [m, c] of shadowsWas) m.castShadow = c;
    (prevParent || game.scene).add(root); root.visible = wasVisible; char.autoLOD?.(); char.lookAt?.(null);
    root.rotation.set(0, game.player?.heading || 0, 0);
    if (fromPause) { cin.end(); if (prevActive && prevShot) { cin.begin(); cin.shot(prevShot); } }
    else cin.end();
    leaveUI?.();
    try { if (!game.ui?.title) game.save?.requestAutosave?.(1); } catch (e) { /* */ }
    o.onClose?.();
  }
  return { close };
}
