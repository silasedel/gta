// Southline — character switch presentation (Phase F2): the sky cut and the hold-key character wheel.
//   skyCut(game, { from, swap, to }): the camera rises from the current character to the sky, `swap()` runs up there
//     (it may teleport the player and stream the other place in), the camera cuts to the sky above the other
//     character and comes down behind them. Resolves when the normal camera has control again.
//   createWheel(game, { key, list, onPick }): hold the key to show the characters; arrows / mouse pick, release switches.
import * as THREE from 'three';

const RISE_S = 0.85;
const HOLD_MIN_S = 0.45;
const HOLD_MAX_S = 12;
const FALL_S = 1.0;
const SKY = 150; // meters above the character

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function skyCut(game, { from, swap, to }) {
  return new Promise((resolve) => {
    const cam = game.camera;
    const start = cam.position.clone();
    const startLook = from.clone().add(new THREE.Vector3(0, 1.4, 0));
    const top = from.clone().add(new THREE.Vector3(0, SKY, 30));
    const look = new THREE.Vector3();
    let phase = 'rise';
    let t = 0;
    let swapped = false;
    let target = null;
    const prev = game.cameraOverride;

    function behind(p) {
      const yaw = game.cameraYaw || 0;
      return new THREE.Vector3(p.x + Math.sin(yaw) * 4.6, p.y + 1.9, p.z + Math.cos(yaw) * 4.6);
    }

    async function doSwap() {
      try {
        await swap();
      } catch (e) {
        console.error('[switch] swap failed', e);
      }
      swapped = true;
    }

    game.cameraOverride = (dt) => {
      t += dt;
      if (phase === 'rise') {
        const k = ease(Math.min(1, t / RISE_S));
        cam.position.lerpVectors(start, top, k);
        look.lerpVectors(startLook, from, k);
        cam.lookAt(look);
        if (t >= RISE_S) {
          phase = 'hold';
          t = 0;
          doSwap();
        }
        return true;
      }
      if (phase === 'hold') {
        target = to();
        cam.position.set(target.x, target.y + SKY, target.z + 30);
        cam.lookAt(target);
        const ready = swapped && !game.teleportHolding;
        if ((ready && t >= HOLD_MIN_S) || t >= HOLD_MAX_S) {
          phase = 'fall';
          t = 0;
        }
        return true;
      }
      target = to();
      const k = ease(Math.min(1, t / FALL_S));
      const high = new THREE.Vector3(target.x, target.y + SKY, target.z + 30);
      cam.position.lerpVectors(high, behind(target), k);
      look.copy(target).y += 1.4 * k;
      cam.lookAt(look);
      if (t >= FALL_S) {
        game.cameraOverride = prev && prev !== game.cameraOverride ? prev : null;
        resolve();
        return false;
      }
      return true;
    };
  });
}

// ---------------------------------------------------------------- hold-key wheel
export function createWheel(game, { key, list, onPick }) {
  let el = null;
  let heldT = 0;
  let pick = 0;
  let items = [];

  function show() {
    items = list();
    pick = Math.max(
      0,
      items.findIndex((c) => !c.active),
    );
    el = document.createElement('div');
    el.id = 'sl-char-wheel';
    el.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:28px;' +
      'z-index:60;pointer-events:none;font:600 15px system-ui,sans-serif;color:#fff';
    document.body.appendChild(el);
    paint();
  }

  function paint() {
    if (!el) return;
    el.innerHTML = items
      .map((c, i) => {
        const on = i === pick;
        const ring = on ? '#3fd1c4' : 'rgba(255,255,255,.35)';
        const tag = c.active ? 'playing' : c.follow ? 'with you' : c.place || '';
        return `<div style="width:128px;height:128px;border-radius:50%;background:rgba(10,14,20,.72);
          border:3px solid ${ring};display:flex;flex-direction:column;align-items:center;justify-content:center;
          transform:scale(${on ? 1.08 : 1});transition:transform .12s">
          <span style="font-size:20px">${c.name}</span>
          <small style="opacity:.75;font-weight:500">${tag}</small></div>`;
      })
      .join('');
  }

  function hide() {
    el?.remove();
    el = null;
  }

  // per frame: hold the key 0.2 s to open; arrows / A D / mouse wheel move the pick; release switches
  function update(dt) {
    const inp = game.input;
    const down = !!inp?.down?.(key);
    if (down) {
      heldT += dt;
      if (!el && heldT > 0.2 && !game.ui?.paused) show();
      if (el) {
        const left = inp.pressed?.('ArrowLeft') || inp.pressed?.('KeyA');
        const right = inp.pressed?.('ArrowRight') || inp.pressed?.('KeyD');
        if (left || right) {
          pick = (pick + (right ? 1 : items.length - 1)) % items.length;
          paint();
        }
      }
      return;
    }
    if (el) {
      const c = items[pick];
      hide();
      if (c && !c.active) onPick(c.id);
    }
    heldT = 0;
  }

  return {
    update,
    get open() {
      return !!el;
    },
  };
}
