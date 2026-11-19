// Service trucks in the world (user models, Models/Cars/Trucks 12 + 13, converted by tools/v2/cars/service/build.sh):
//   - every truck12 (Atlas Rollback 440 tow truck) / truck13 (Atlas Packer FL front-load refuse truck) that spawns gets its
//     company livery, grime and chevrons (livery.js) and a compound hitbox fitted to the cab / body / deck (the one convex
//     hull of a rollback spans the empty air over the deck)
//   - garbage trucks: in the morning (5:30-11:00) one or two run slow routes in the streets where household carts stand at
//     the curb; they creep up to each cart pair, stop beside it with the amber flashers going, then move on
//   - tow trucks: parked on the apron of some gas stations and repair shops near the player; a few also drive in traffic
//     (fleet class 'tow', glb/fleet.js zoneMix)
// Far trucks are the vehicle core's ghosts (kinematic lane followers past 95 m, frozen when parked) and are removed past
// ~330 m.  ?svc=0 turns the managers off (the livery still applies).
import * as THREE from 'three';
import { dressService } from './livery.js';

export const order = 190;
const KEYS = new Set(['truck12', 'truck13']);
const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

export function initV2(game) {
  const V = game.vehicles;
  if (!V) return;
  const OFF = typeof location !== 'undefined' && /[?&]svc=0\b/.test(location.search);
  const stats = { dressed: 0, fitted: 0, garbage: 0, tow: 0, stops: 0, errors: 0 };
  const svc = { stats, garbage: [], tow: [], dress: (v) => dress(v) };
  game.service = svc;

  // ------------------------------------------------------------ per car: livery + fitted hitbox
  function dress(v) {
    if (!v?.car || !KEYS.has(v.typeKey) || v._svcDone) return;
    v._svcDone = true;
    try {
      if (dressService(v)) stats.dressed++;
    } catch (e) {
      stats.errors++;
      console.warn('[service] livery', e);
    }
    try {
      if (fitHitbox(v)) stats.fitted++;
    } catch (e) {
      stats.errors++;
      console.warn('[service] hitbox', e);
    }
  }
  game.on?.('vehicle:spawned', (e) => {
    const v = e?.vehicle;
    if (v && KEYS.has(v.typeKey)) queueMicrotask(() => dress(v));
  });
  for (const v of V.list || []) dress(v);

  // compound hitbox: the truck sliced along its length (0.2 m), slices of similar height merged into boxes from the frame
  // rail up to the slice top, each as wide as the body there (mirrors left out).  Replaces the single convex hull.
  const hullCache = new Map();
  function boxesFor(v) {
    if (hullCache.has(v.typeKey)) return hullCache.get(v.typeKey);
    const lv = v.car.lod.levels[1]?.object || v.car.lod.levels[0].object,
      P = [];
    lv.traverse((o) => {
      if (
        o.isMesh &&
        !o.isInstancedMesh &&
        !o.userData.svcDecal &&
        o.geometry?.getAttribute('position')
      ) {
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) P.push(p.getX(i), p.getY(i), p.getZ(i));
      }
    });
    if (P.length < 300) return null;
    const t = v.spec,
      D = 0.2;
    let z0 = Infinity,
      z1 = -Infinity;
    for (let i = 2; i < P.length; i += 3) {
      z0 = Math.min(z0, P[i]);
      z1 = Math.max(z1, P[i]);
    }
    const n = Math.ceil((z1 - z0) / D),
      top = new Float32Array(n),
      wid = new Float32Array(n),
      cnt = new Uint32Array(n);
    const wLow = (t.W || 2.5) / 2 + 0.05; // mirrors / beacons wider than the body: out
    for (let i = 0; i < P.length; i += 3) {
      const x = Math.abs(P[i]),
        y = P[i + 1],
        k = Math.min(n - 1, Math.floor((P[i + 2] - z0) / D));
      if (x > wLow || y < 0.3) continue;
      cnt[k]++;
      if (y > top[k]) top[k] = y;
      if (x > wid[k]) wid[k] = x;
    }
    // smooth isolated spikes (exhaust stacks, beacons, the headache rack's light bar): a slice top may not exceed both
    // neighbours by more than 0.4 m
    for (let k = 1; k < n - 1; k++) {
      const m = Math.max(top[k - 1], top[k + 1]);
      if (top[k] > m + 0.4 && cnt[k] < 400) top[k] = m;
    }
    const boxes = [];
    let cur = null;
    for (let k = 0; k < n; k++) {
      if (cnt[k] < 8 || top[k] < 0.5) {
        if (cur) {
          boxes.push(cur);
          cur = null;
        }
        continue;
      }
      const za = z0 + k * D,
        zb = za + D;
      if (cur && Math.abs(top[k] - cur.top) < 0.35) {
        cur.zb = zb;
        cur.top = Math.max(cur.top, top[k]);
        cur.w = Math.max(cur.w, wid[k]);
        cur.n++;
      } else {
        if (cur) boxes.push(cur);
        cur = { za, zb, top: top[k], w: wid[k], n: 1 };
      }
    }
    if (cur) boxes.push(cur);
    const yb = Math.max(0.32, Math.min(t.yb ?? 0.5, 0.75));
    const out = boxes
      .filter((b) => b.zb - b.za >= 0.35)
      .map((b) => ({
        hx: Math.max(0.3, b.w - 0.04),
        y0: yb,
        y1: b.top - 0.03,
        z0: b.za + 0.02,
        z1: b.zb - 0.02,
      }));
    hullCache.set(v.typeKey, out.length ? out : null);
    return out.length ? out : null;
  }
  function fitHitbox(v) {
    const R = game.RAPIER,
      W = game.world;
    if (!R || !W || !v.body || !v.collider) return false;
    const boxes = boxesFor(v);
    if (!boxes || boxes.length < 2) return false;
    const go = v.groundOff || 0,
      rr = 0.06,
      made = [];
    for (const b of boxes) {
      const hy = (b.y1 - b.y0) / 2,
        hz = (b.z1 - b.z0) / 2;
      if (hy < 0.12) continue;
      const d = R.ColliderDesc.roundCuboid(b.hx - rr, hy - rr, hz - rr, rr)
        .setTranslation(0, (b.y0 + b.y1) / 2 - go, (b.z0 + b.z1) / 2)
        .setDensity(0)
        .setFriction(0.6)
        .setRestitution(0.15);
      made.push(W.createCollider(d, v.body));
    }
    if (made.length < 2) {
      for (const c of made) W.removeCollider(c, false);
      return false;
    }
    try {
      W.removeCollider(v.collider, false);
    } catch (e) {
      /* already gone */
    }
    v.collider = made[0];
    v.svcColliders = made;
    return true;
  }

  if (OFF) return;

  // ------------------------------------------------------------ helpers
  const _fr = new THREE.Frustum(),
    _pm = new THREE.Matrix4(),
    _sp = new THREE.Sphere();
  function inView(x, y, z, r = 8) {
    const cam = game.camera;
    if (!cam) return false;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    _sp.center.set(x, y, z);
    _sp.radius = r;
    return _fr.intersectsSphere(_sp) && Math.hypot(x - cam.position.x, z - cam.position.z) < 600;
  }
  const playerPos = () => game.player?.position || null;
  const inside = () =>
    !!(game.interiors?.inside || game.interior?.active || game.player?.state?.interior);
  const loaded = (k) => !V.fleet || V.fleet.loaded?.(k);
  async function ensure(k) {
    if (loaded(k)) return true;
    try {
      const m = await import('../glb/glbCar.js');
      await m.loadCarModel(k);
    } catch (e) {
      /* */
    }
    return loaded(k);
  }
  const alive = (v) => v && V.list.includes(v) && !v.disabled;
  const pos = (v) => v.body.translation();

  // ------------------------------------------------------------ garbage trucks: morning routes past the curb carts
  const served = new WeakSet();
  let cartCache = [],
    cartT = 0;
  function carts(pp) {
    // every household cart pair near the player (src/world/props/lotProps.v2.js), refreshed every 2 s
    if (cartT > 0) return cartCache;
    cartT = 2;
    cartCache = [];
    const own = game.lotProps?.owners;
    if (!own) return cartCache;
    for (const list of own.values()) {
      let first = null;
      for (const it of list)
        if (it.kindTag === 'carts') {
          if (!first) first = it;
          else if (Math.hypot(it.x - first.x, it.z - first.z) < 1.5) continue;
        }
      if (first && Math.hypot(first.x - pp.x, first.z - pp.z) < 420) cartCache.push(first);
    }
    return cartCache;
  }
  const morning = () => {
    const h = game.timeOfDay ?? 12;
    return h >= 5.5 && h < 11;
  };
  let gT = 1.5,
    spawning = false;
  async function spawnGarbage(pp) {
    const list = carts(pp).filter((c) => {
      const d = Math.hypot(c.x - pp.x, c.z - pp.z);
      return d > 110 && d < 230 && !inView(c.x, c.y || 0, c.z, 12);
    });
    if (!list.length) return;
    const c = list[(Math.random() * list.length) | 0];
    const G = game.miamiData?.roadGraph || game.city?.roadGraph,
      r = G?.nearestEdge?.(c.x, c.z, {}, 40);
    if (
      !r ||
      r.dist > 25 ||
      /footway|path|steps|pedestrian|cycleway/.test(String(r.edge?.kind || ''))
    )
      return;
    if (!(await ensure('truck13'))) return;
    const heading = Math.atan2(r.dir.x, r.dir.z) + (Math.random() < 0.5 ? Math.PI : 0);
    // start 25-40 m short of the cart along the street, so it is seen driving up to it
    const back = 25 + Math.random() * 15,
      x = r.point.x - Math.sin(heading) * back,
      z = r.point.z - Math.cos(heading) * back;
    if (inView(x, 0, z, 10)) return;
    const v = V.spawn('truck13', new THREE.Vector3(x, r.y ?? 0, z), heading, { ai: true });
    if (!v) return;
    v.svcRole = 'garbage';
    v.svc = { stopT: 0, slowT: 0, idleT: 0 };
    svc.garbage.push(v);
    stats.garbage++;
  }
  function driveGarbage(v, dt) {
    const ai = v.ai;
    if (!ai || v.playerDriven || v.chaseTarget) return;
    // a working driver: slow, no phone, no lane hopping, never runs a red
    if (ai.drv && !ai.drv._svc)
      ai.drv = {
        ...ai.drv,
        _svc: true,
        speed: 0.55,
        wander: 0,
        phone: 0,
        redRun: 0,
        lane: 0.15,
        honk: 0.15,
      };
    const S = v.svc,
      t = pos(v);
    if (S.stopT > 0) {
      S.stopT -= dt;
      ai.wanderK = 0;
      v.svcFlash = true;
      if (S.stopT <= 0) {
        ai.wanderK = 1;
        v.svcFlash = false;
      }
      return;
    }
    v.svcFlash = false;
    if (v.ghost) {
      ai.wanderK = 1;
      return;
    }
    // the next unserved cart pair on the curb ahead (within 7 m of the truck's path)
    const h = v.heading,
      fx = Math.sin(h),
      fz = Math.cos(h),
      front = v.spec.L / 2;
    let best = null,
      ba = 99;
    for (const c of cartCache) {
      if (served.has(c)) continue;
      const dx = c.x - t.x,
        dz = c.z - t.z,
        a = dx * fx + dz * fz,
        lat = Math.abs(dx * fz - dz * fx);
      if (lat < 7.5 && a > front - 4.5 && a < front + 24 && a < ba) {
        ba = a;
        best = c;
      }
    }
    if (!best) {
      ai.wanderK = 1;
      return;
    }
    const ahead = ba - (front - 2.2); // the cart beside the cab door: the arms swing out over it
    if (ahead <= 0.6) {
      served.add(best);
      S.stopT = 6 + Math.random() * 4;
      ai.wanderK = 0;
      stats.stops++;
      v.svcFlash = true;
      return;
    }
    ai.wanderK = Math.max(0.18, Math.min(1, ahead / 18));
  }

  // ------------------------------------------------------------ tow trucks parked at gas stations / repair shops
  const towAt = new Map(); // place id -> vehicle | 'pending' | 'none'
  let tT = 3;
  async function parkTows(pp) {
    const P = game.nav?.places;
    if (!P?.nearest) return;
    const cand = [
      ...P.nearest('gas', pp, { limit: 8 }),
      ...P.nearest('garage', pp, { limit: 8 }),
    ].filter((p) => p.distance > 70 && p.distance < 260);
    for (const p of cand) {
      if (towAt.has(p.id)) continue;
      if (hash(p.id) > (p.category === 'garage' ? 0.75 : 0.45) || svc.tow.length >= 3) {
        towAt.set(p.id, 'none');
        continue;
      }
      if (inView(p.x, 0, p.z, 14)) continue;
      towAt.set(p.id, 'pending');
      const v = await parkTowAt(p).catch(() => null);
      if (v) {
        towAt.set(p.id, v);
        svc.tow.push(v);
        stats.tow++;
      } else towAt.set(p.id, 'none');
      return; // one per pass
    }
  }
  async function parkTowAt(p) {
    if (!(await ensure('truck12'))) return null;
    const G = game.miamiData?.roadGraph || game.city?.roadGraph,
      r = G?.nearestEdge?.(p.x, p.z, {}, 60);
    if (!r) return null;
    const heading = Math.atan2(r.dir.x, r.dir.z),
      t = V.types?.truck12 || { L: 9.8, W: 2.5 };
    // on the lot apron between the road and the shop, parallel to the street
    let nx = p.x - r.point.x,
      nz = p.z - r.point.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    for (const off of [
      (r.edge.width || 7) / 2 + 2.6,
      (r.edge.width || 7) / 2 + 4.5,
      (r.edge.width || 7) / 2 + 6.5,
    ]) {
      if (off > nl + 3) break;
      const x = r.point.x + nx * off,
        z = r.point.z + nz * off;
      if (game.placement?.footprintOnRoad?.(x, z, heading, t.W + 0.4, t.L + 0.5)) continue;
      const v = await V.spawnParked('truck12', {
        x,
        z,
        heading: heading + (hash(p.id + 'h') < 0.5 ? Math.PI : 0),
        locked: true,
      });
      if (v) {
        v.svcRole = 'tow';
        v.svcPlace = p.id;
        return v;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ per frame
  game.updaters?.push?.((dt) => {
    const pp = playerPos();
    if (!pp) return;
    cartT -= dt;
    gT -= dt;
    tT -= dt;
    if (cartT <= 0 && svc.garbage.length) carts(pp);
    // garbage: drive / stop; drop the far ones
    for (let i = svc.garbage.length - 1; i >= 0; i--) {
      const v = svc.garbage[i];
      if (!alive(v) || v.playerDriven || !v.ai) {
        if (v) {
          v.svcFlash = false;
          if (v.ai) v.ai.wanderK = 1;
        }
        svc.garbage.splice(i, 1);
        continue;
      }
      try {
        driveGarbage(v, dt);
      } catch (e) {
        stats.errors++;
      }
      const t = pos(v),
        d = Math.hypot(t.x - pp.x, t.z - pp.z);
      if (
        (d > 330 || (!morning() && d > 140) || (v.ai.stuckT || 0) > 20) &&
        !inView(t.x, t.y, t.z, 10)
      ) {
        try {
          V.remove(v);
        } catch (e) {
          /* */
        }
        svc.garbage.splice(i, 1);
      }
    }
    if (gT <= 0) {
      gT = 3;
      const want =
        morning() && !inside() ? (carts(pp).length > 30 ? 2 : carts(pp).length > 4 ? 1 : 0) : 0;
      if (svc.garbage.length < want && !spawning) {
        spawning = true;
        spawnGarbage(pp)
          .catch(() => {})
          .finally(() => {
            spawning = false;
          });
      }
    }
    // tow: park near shops, drop when far
    for (let i = svc.tow.length - 1; i >= 0; i--) {
      const v = svc.tow[i];
      if (!alive(v) || v.playerDriven || v.everDriven) {
        svc.tow.splice(i, 1);
        continue;
      }
      const t = pos(v);
      if (Math.hypot(t.x - pp.x, t.z - pp.z) > 420 && !inView(t.x, t.y, t.z, 10)) {
        towAt.delete(v.svcPlace);
        try {
          V.remove(v);
        } catch (e) {
          /* */
        }
        svc.tow.splice(i, 1);
      }
    }
    for (const [id, s] of towAt) if (s === 'none' && towAt.size > 60) towAt.delete(id);
    if (tT <= 0) {
      tT = 4;
      if (!inside()) parkTows(pp).catch(() => {});
    }
    // amber flashers while a garbage truck works a stop (after the core's own blinker pass)
    const blink = ((game.clock?.elapsed ?? performance.now() / 1000) * 1.6) % 1 < 0.5 ? 6 : 0;
    for (const v of svc.garbage)
      if (v.svcFlash && v.car?.lightMats) {
        const lm = v.car.lightMats;
        if (lm.blinkL) lm.blinkL.emissiveIntensity = blink;
        if (lm.blinkR) lm.blinkR.emissiveIntensity = blink;
      }
  });
}
