// Port Solana V2: first-use warm-up behind the loading screen (playtest-fixes, playtest P1).
// The first shot and the first time you got into a car froze the game for half a second to several seconds:
// shaders, effect pools, gun models and car-interior materials were created and compiled on first use.
// This module does all of that once while the loading screen is still up. main.js then compiles the scene and
// renders about 60 warm-up frames (updaters included), which compiles every program these steps created.
//   1. Every gun model is built once (shared materials and geometry) and kept off-screen until the game is ready.
//   2. A real shot is fired (muzzle flash, tracer, impact, casing, decal and audio decode), plus blood, sparks, dust
//      and a fire burst, far below the street where nobody can see them.
//   3. The player sits in the nearest car during the warm-up frames (interior, dashboard and driving camera),
//      then is put back on the spawn point the moment the game is ready.
// The previous weapon, inventory and ammo are restored afterward. Results: game.warmup.

export const order = 950;

export async function initV2(game) {
  const THREE = game.THREE;
  const stats = {
    guns: 0,
    shot: false,
    effects: false,
    car: false,
    restoredAt: 0,
    errors: [],
  };
  game.warmup = stats;
  const P = game.player;
  const note = (what, e) => {
    stats.errors.push(what + ': ' + String(e?.message || e).slice(0, 120));
  };

  // ---- 1. gun models, all at once, parked far below the world
  const park = new THREE.Group();
  park.name = 'warmup-park';
  park.position.set(P.position.x, -600, P.position.z);
  game.scene.add(park);
  const W = game.weapons;
  try {
    for (const k of W?.order || []) {
      const d = W.defs?.[k];
      if (!d || d.melee) {
        continue;
      }
      const m = W.buildModel?.(k);
      const obj = m?.group || m?.root || m;
      if (obj && obj.isObject3D) {
        obj.position.set((stats.guns % 8) * 0.8, 0, Math.floor(stats.guns / 8) * 0.8);
        park.add(obj);
        stats.guns++;
      }
    }
  } catch (e) {
    note('guns', e);
  }

  // ---- 2. a real shot plus every pooled effect
  const saved = {
    weapon: P.weapon,
    inventory: Array.isArray(P.inventory) ? P.inventory.slice() : null,
    ammo: P.ammo ? Object.assign({}, P.ammo) : null,
    clip: P.clip ? Object.assign({}, P.clip) : null,
  };
  try {
    if (W?.give && W?.select && W?.fireNow) {
      W.give('pistol', 12, { silent: true });
      W.select('pistol');
      stats.shot = !!W.fireNow();
    }
  } catch (e) {
    note('shot', e);
  }
  try {
    const gfx = game.gameplay?.G?.gfx;
    const at = new THREE.Vector3(P.position.x, -598, P.position.z);
    const up = new THREE.Vector3(0, 1, 0);
    const calls = [
      () => gfx.impact({ point: at, normal: up, material: 'concrete' }),
      () => gfx.impact({ point: at, normal: up, material: 'metal' }),
      () => gfx.impact({ point: at, normal: up, material: 'wood' }),
      () => gfx.blood(at, up),
      () => gfx.sparks(at, 6, up),
      () => gfx.dust(at, 4),
      () => gfx.decal('bullet', at, up, 0.1, 1),
      () => gfx.decal('blood', at, up, 0.4, 1),
      () => gfx.decal('scorch', at, up, 1, 1),
      () => gfx.shockwave(at, 2),
      () => gfx.tracer(at, at.clone().add(new THREE.Vector3(3, 0, 0))),
      () => gfx.waterSplash(at, 1),
    ];
    if (gfx) {
      for (const c of calls) {
        try {
          c();
        } catch (e) {
          note('effect', e);
        }
      }
    }
    game.fireFx?.burn?.('warmup', at, 0.6);
    game.fireFx?.explode?.(at, 2);
    stats.effects = true;
  } catch (e) {
    note('effects', e);
  }

  // ---- 3. sit in the nearest car during the warm-up frames
  const spawn = {
    x: P.position.x,
    y: P.position.y,
    z: P.position.z,
    heading: P.heading,
    yaw: game.cameraYaw,
    pitch: game.cameraPitch,
  };
  try {
    let best = null;
    let bd = 1e9;
    for (const v of game.vehicles?.list || []) {
      const t = v?.body?.translation?.();
      if (!t || v.isBoat || v.disabled) {
        continue;
      }
      const d = Math.hypot(t.x - spawn.x, t.z - spawn.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    if (best && bd < 400 && game.enterVehicle) {
      game.enterVehicle(best);
      stats.car = !!P.state?.inVehicle;
    }
  } catch (e) {
    note('car', e);
  }

  // ---- put everything back as soon as the game is ready (after main.js has compiled and warmed up)
  const restore = () => {
    try {
      if (P.state?.inVehicle) {
        game.exitVehicle?.();
      }
      game.teleport?.(spawn.x, spawn.y, spawn.z, spawn.heading);
      game.cameraYaw = spawn.yaw;
      game.cameraPitch = spawn.pitch;
    } catch (e) {
      note('restore car', e);
    }
    try {
      if (saved.inventory) {
        P.inventory.length = 0;
        for (const k of saved.inventory) {
          P.inventory.push(k);
        }
      }
      if (saved.ammo) {
        Object.assign(P.ammo, saved.ammo);
      }
      if (saved.clip) {
        Object.assign(P.clip, saved.clip);
      }
      if (saved.weapon && W?.select && P.inventory.includes(saved.weapon)) {
        W.select(saved.weapon);
      } else {
        P.weapon = saved.weapon || 'fist';
      }
    } catch (e) {
      note('restore weapon', e);
    }
    // keep the gun models a few more seconds (their programs are compiled now), then free the park group
    setTimeout(() => {
      try {
        game.scene.remove(park);
      } catch (e) {
        // already gone
      }
    }, 4000);
    stats.restoredAt = performance.now();
  };
  const wait = () => {
    if (game.ready) {
      restore();
    } else {
      setTimeout(wait, 50);
    }
  };
  wait();
}
