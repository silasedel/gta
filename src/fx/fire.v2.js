// Southline V2: realistic fire in the game (playtest-fixes track).
// Wires src/fx/fire.js into the game without touching the owners' files:
//   - Burning wrecks: vehicles.js draws car fires as flat orange point sprites. Those sprites are hidden and
//     each burning car gets real flames, embers and a dark smoke column at its engine bay instead.
//   - Car fires are rare, as in real life: a wreck burns when an explosion or the player's own car caused
//     it; an ordinary traffic wreck only smokes, except about one in eight.
//   - Explosions (game.gameplay.G.gfx.explosion): the orange sprite burst is replaced by a billowing
//     fireball that burns down into black smoke; debris, sparks, scorch and shockwave stay.
//   - Molotov wicks (gfx.flame): small real flames.
// API: game.fireFx = { burn(key, pos, size), explode(pos, radius), system }.
import * as THREE from 'three';
import { createFireSystem } from './fire.js';

export const order = 160;

const UP = new THREE.Vector3(0, 1, 0);

function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export async function initV2(game) {
  const sys = createFireSystem(THREE, game.scene, {
    wind: () => game.wind,
    dayLight: () => game.env?.dayFactor ?? 1,
    viewportHeight: () => game.renderer?.domElement?.height || 1080,
  });
  game.fireFx = {
    system: sys,
    burn: (key, pos, size) => sys.burn(key, pos, size),
    explode: (pos, radius) => sys.explode(pos, radius),
  };

  // ---- hide the old flat fire sprites of burning cars (an additive Points cloud colored 0xff7a1a)
  const oldFire = new THREE.Color(0xff7a1a);
  let hideT = 0;
  function hideOldFireSprites() {
    for (const o of game.scene.children) {
      if (!o.isPoints || !o.visible) {
        continue;
      }
      const c = o.material?.uniforms?.color?.value;
      if (c && c.isColor && c.equals(oldFire) && o.material.blending === THREE.AdditiveBlending) {
        o.visible = false;
      }
    }
  }

  // ---- explosions: fireball instead of orange sprites
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const rnd = (a, b) => a + Math.random() * (b - a);
  let gfxPatched = false;
  function patchGunFx() {
    const gfx = game.gameplay?.G?.gfx;
    if (!gfx || gfxPatched) {
      return;
    }
    gfxPatched = true;
    const groundAt = (x, z, y) => {
      try {
        const h = game.city?.groundHeightAt?.(x, z);
        return Number.isFinite(h) ? h : y - 1;
      } catch (e) {
        return y - 1;
      }
    };
    gfx.explosion = function explosion(pos, radius = 7.5, o = {}) {
      const k = radius / 7.5;
      const floor = groundAt(pos.x, pos.z, pos.y + 1);
      sys.explode(pos, radius);
      // white-hot sparks and flying grit
      for (let i = 0; i < 30 * k; i++) {
        gfx.emit(1, pos, { vx: rnd(-16, 16), vy: rnd(2, 18), vz: rnd(-16, 16), life: rnd(0.4, 1.1), s0: 0.07, s1: 0.015, color: 0xffb050, a: 1, drag: 0.8, grav: 9.81, tex: 0, floor });
      }
      // ground-hugging dust ring
      for (let i = 0; i < 16; i++) {
        gfx.emit(0, pos, { vx: rnd(-7, 7), vy: rnd(0.2, 1.2), vz: rnd(-7, 7), life: rnd(0.8, 1.6), s0: 0.5, s1: 2.4, color: 0x9a8e7c, a: 0.38, drag: 2.2, grav: 0, tex: 1 });
      }
      for (let i = 0; i < 34 * k; i++) {
        _v.set(rnd(-9, 9), rnd(3, 13), rnd(-9, 9));
        gfx.chip(_v2.set(pos.x + rnd(-0.5, 0.5), pos.y + 0.2, pos.z + rnd(-0.5, 0.5)), _v, i % 3 ? 0x4a4640 : 0x8a8478, rnd(0.03, 0.08), { floor, life: rnd(7, 12) });
      }
      if (!o.noScorch && pos.y - floor < 1.5) {
        gfx.decal('scorch', _v.set(pos.x, floor, pos.z), UP, radius * 0.75, 110);
      }
      gfx.shockwave(pos, radius);
      if (pos.y < (game.city?.seaLevel ?? -0.12) + 0.6 && game.surfaceAt?.(pos.x, pos.z) === 'water') {
        gfx.waterSplash?.(pos, 3.5);
      }
      // something keeps burning where it went off, for a few seconds
      lingering.push({ key: 'x' + (lingerN++), x: pos.x, y: floor, z: pos.z, size: 0.9 * Math.min(1.6, k), t: rnd(5, 9) });
    };
    gfx.flame = function flame(pos, size = 1) {
      const key = 'f' + Math.round(pos.x * 2) + ',' + Math.round(pos.z * 2);
      sys.burn(key, pos, Math.max(0.12, size) * 1.4);
    };
  }
  const lingering = [];
  let lingerN = 0;

  // explosions mark nearby cars: those wrecks burn
  game.on?.('explosion', (e) => {
    const p = e?.position;
    if (!p) {
      return;
    }
    const r = (e.radius || 7.5) * 1.5;
    for (const v of game.vehicles?.list || []) {
      try {
        const t = v.body?.translation?.();
        if (t && Math.hypot(t.x - p.x, t.z - p.z) < r) {
          v._psBurn = true;
        }
      } catch (err) {
        // vehicle without a body
      }
    }
  });

  const _p = new THREE.Vector3();
  let vehN = 0;
  // charring (playtest X2): a burning wreck's paint, plastic and glass darken to soot over about 12 s.
  // Materials are cloned once per wreck so other cars that share them are untouched.
  const SOOT = new THREE.Color(0x15110e);
  function charWreck(v, k) {
    if (!v._psChar) {
      v._psChar = [];
      v.mesh.traverse((o) => {
        if (!o.isMesh || !o.material || Array.isArray(o.material)) {
          return;
        }
        const src = o.material, m = src.clone();
        // Material.clone() drops custom shader hooks: keep them, or lamp/decal sheets (wheel discs, badges),
        // paint wear and glass fall back to plain materials and show as flat glowing discs on a burning car
        if (Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile')) m.onBeforeCompile = src.onBeforeCompile;
        if (Object.prototype.hasOwnProperty.call(src, 'customProgramCacheKey')) m.customProgramCacheKey = src.customProgramCacheKey;
        if (src.userData) m.userData = { ...src.userData };
        o.material = m;
        v._psChar.push({
          m,
          color: m.color ? m.color.clone() : null,
          rough: m.roughness,
          metal: m.metalness,
          emissive: m.emissive ? m.emissive.clone() : null,
        });
      });
    }
    if (Math.abs((v._psCharK || 0) - k) < 0.02) {
      return;
    }
    v._psCharK = k;
    for (const e of v._psChar) {
      if (e.color) {
        e.m.color.copy(e.color).lerp(SOOT, 0.85 * k);
      }
      if (e.rough !== undefined) {
        e.m.roughness = e.rough + (0.95 - e.rough) * k;
      }
      if (e.metal !== undefined) {
        e.m.metalness = e.metal * (1 - 0.8 * k);
      }
      if (e.emissive) {
        // dead lights: headlights and dash go dark
        e.m.emissive.copy(e.emissive).multiplyScalar(1 - k);
      }
    }
  }
  function update(dt) {
    hideT -= dt;
    if (hideT <= 0) {
      hideT = 2;
      try {
        hideOldFireSprites();
      } catch (e) {
        // not fatal
      }
      patchGunFx();
    }
    const cam = game.camera;
    // burning wrecks
    const list = game.vehicles?.list || [];
    for (const v of list) {
      if (!v || !v.disabled) {
        continue;
      }
      if (v._psId === undefined) {
        v._psId = vehN++;
      }
      if (v._psBurn === undefined) {
        // decided once per wreck: explosions and the player's own crashes burn; ordinary traffic wrecks rarely do
        v._psBurn = !!(v.playerDriven || v.wasPlayerDriven) || hash01(v._psId) < 0.12;
      }
      if (!v._psBurn || !(v.burnT > 0) || !v.mesh || !v.spec) {
        continue;
      }
      try {
        const t = v.body?.translation?.();
        if (t && cam && Math.hypot(t.x - cam.position.x, t.z - cam.position.z) > 220) {
          continue;
        }
        _p.set(0, v.spec.belt - (v.groundOff || 0) - 0.15, v.spec.L / 2 - 1.0);
        v.mesh.localToWorld(_p);
        // the fire grows for a few seconds, then settles as it burns out
        const age = 25 - v.burnT;
        charWreck(v, Math.min(1, age / 12));
        const size = 0.7 + 0.6 * Math.min(1, age / 4) - 0.35 * Math.max(0, (age - 16) / 9);
        sys.burn('v' + v._psId, _p, size);
      } catch (e) {
        // a wreck mid-dispose
      }
    }
    for (let i = lingering.length - 1; i >= 0; i--) {
      const L = lingering[i];
      L.t -= dt;
      if (L.t <= 0) {
        lingering.splice(i, 1);
        continue;
      }
      _p.set(L.x, L.y, L.z);
      sys.burn(L.key, _p, L.size * Math.min(1, L.t / 3));
    }
    sys.update(dt, cam);
  }
  game.updaters.push(update);
}
