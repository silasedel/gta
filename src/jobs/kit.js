// Shared gameplay kit for gangs, businesses and side jobs (v2.1): world markers, a small DOM panel, help-text
// ownership, hostile peds dressed in a kit, and enemy gunfire through the combat track's own tracer and damage.
import * as THREE from 'three';
import { applyLook } from '../npc/look.js';
import { createMarker } from '../gameplay/markers.js';

export const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- markers
// r2: the shared subtle GTA-style marker (../gameplay/markers.js): soft ground ring, knee-high glow, small floating
// chevron. No light pillar. opts.r scales the ring like before; userData.ring.material.color still recolors it.
export function makeMarker(game, pos, color = 0xffd25a, opts = {}) {
  const g = createMarker(THREE, { color, radius: opts.radius ?? 1.8 * (opts.r || 1), icon: opts.icon, iconY: opts.iconY });
  const y = pos.y ?? groundY(game, pos.x, pos.z);
  g.position.set(pos.x, y + 0.03, pos.z);
  game.scene.add(g);
  return g;
}
export function removeMarker(game, m) {
  if (m) game.scene.remove(m);
}
export function groundY(game, x, z) {
  try {
    const y = game.city?.groundHeightAt?.(x, z);
    return Number.isFinite(y) ? y : 0;
  } catch (e) {
    return 0;
  }
}

// ---------------------------------------------------------------- help text with an owner (never clobber others)
const helpOwner = { who: null };
export function help(game, who, html) {
  if (html) {
    helpOwner.who = who;
    game.hud?.help?.(html);
  } else if (helpOwner.who === who) {
    helpOwner.who = null;
    game.hud?.help?.(null);
  }
}
export const notify = (game, text, ms = 3200) => {
  try {
    game.hud?.notify?.(text, ms);
  } catch (e) {
    /* */
  }
};
export const canAct = (game) => {
  const ui = game.ui || {};
  return !ui.paused && !ui.phoneOpen && !ui.dead && !ui.arrested && !ui.weaponWheel && !game.v21Panel?.open;
};

// ---------------------------------------------------------------- panel (one shared DOM panel for the v2.1 menus)
const CSS = `
.v21-panel{position:fixed;right:28px;top:50%;transform:translateY(-50%);width:400px;max-height:80vh;overflow:auto;z-index:60;
  background:rgba(10,13,20,.9);border:1px solid rgba(255,255,255,.12);border-radius:14px;color:#eef2f6;
  font:14px/1.4 Inter,system-ui,sans-serif;padding:18px 20px;box-shadow:0 18px 50px rgba(0,0,0,.5);display:none}
.v21-panel h2{margin:0 0 2px;font:800 24px "Archivo Black",sans-serif;letter-spacing:.5px;text-transform:uppercase}
.v21-panel .sub{color:#9fb0c2;font-size:12px;margin-bottom:12px}
.v21-panel .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.v21-panel .big{font:800 30px "Archivo Black",sans-serif;color:#7dffb0}
.v21-panel button{display:block;width:100%;margin:6px 0 0;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.07);color:#fff;font:600 13px Inter,system-ui,sans-serif;text-align:left;cursor:pointer}
.v21-panel button:hover{background:rgba(47,224,208,.18)}
.v21-panel button[disabled]{opacity:.4;cursor:default}
.v21-panel button b{float:right;color:#ffd25a}
.v21-panel .key{display:inline-block;min-width:16px;padding:0 4px;margin-right:6px;border-radius:4px;background:#2fe0d0;color:#081014;font-weight:800;text-align:center}
.v21-panel .tag{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:700}
.v21-panel h3{margin:14px 0 4px;font:700 13px Inter,system-ui,sans-serif;color:#9fb0c2;text-transform:uppercase;letter-spacing:.8px}
.v21-panel .foot{margin-top:12px;color:#7f8fa0;font-size:12px}`;
export function getPanel(game) {
  if (game.v21Panel) return game.v21Panel;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.className = 'v21-panel';
  document.body.appendChild(el);
  const P = {
    el,
    open: false,
    owner: null,
    actions: [],
    show(owner, html, actions = []) {
      P.owner = owner;
      P.actions = actions;
      el.innerHTML = html + actions.map((a, i) => `<button data-i="${i}" ${a.disabled ? 'disabled' : ''}><span class="key">${i + 1}</span>${a.label}${a.price ? `<b>${a.price}</b>` : ''}</button>`).join('') + '<div class="foot">Number keys or click · Esc to close</div>';
      el.style.display = 'block';
      if (!P.open) {
        P.open = true;
        try {
          document.exitPointerLock?.();
        } catch (e) {
          /* */
        }
        game.combat?.claimPlayer?.('v21panel', { lock: true, fixed() {} });
      }
    },
    hide() {
      if (!P.open) return;
      P.open = false;
      P.owner = null;
      el.style.display = 'none';
      game.combat?.releasePlayer?.('v21panel');
    },
    run(i) {
      const a = P.actions[i];
      if (!a || a.disabled) return;
      try {
        a.fn();
      } catch (e) {
        console.error('[v21 panel]', e);
      }
    },
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) P.run(Number(b.dataset.i));
  });
  addEventListener('keydown', (e) => {
    if (!P.open) return;
    if (e.code === 'Escape') {
      e.stopPropagation();
      P.hide();
      return;
    }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) {
      e.preventDefault();
      P.run(Number(m[1]) - 1);
    }
  }, true);
  game.v21Panel = P;
  return P;
}

// ---------------------------------------------------------------- peds in a kit
// kit: { top: [hex], bottom: [hex], shoes: [hex], hats: ['cap', ...] | null, chain: 0..1 }
export function applyKit(game, ped, kit, seed = 1) {
  const L = ped?.look;
  if (!L || !ped.char) return false;
  const pick = (a, k) => a[(seed * 7 + k) % a.length];
  const acc = L.acc.filter((a) => a.slot !== 'head' && a.slot !== 'handL' && a.slot !== 'chest');
  if (kit.hats?.length && seed % 3 !== 0) acc.push({ slot: 'head', kind: 'hat', arg: pick(kit.hats, 1), seed: 1000 + seed });
  if ((kit.chain || 0) > 0 && (seed % 10) / 10 < kit.chain && !acc.some((a) => a.slot === 'neck')) acc.push({ slot: 'neck', kind: 'chain', seed: 2000 + seed });
  const L2 = {
    ...L,
    cls: 'street',
    top: pick(kit.top, 0),
    bottom: pick(kit.bottom, 2),
    shoes: pick(kit.shoes, 3),
    hatKind: acc.some((a) => a.kind === 'hat') ? 1 : 0,
    acc,
    carry: 'none',
  };
  try {
    game.people?.undress?.(ped.char);
    ped.applied = applyLook(ped.char, L2);
    ped.look = L2;
  } catch (e) {
    console.warn('[kit] applyLook', e);
  }
  ped.root.position.copy(ped.pos);
  ped.root.rotation.y = ped.heading;
  return true;
}

// Spawn one person (through the ped system) at pos, dressed in a kit, standing in a group.
export function spawnKitPed(game, pos, kit, seed, opts = {}) {
  const peds = game.peds;
  if (!peds?.spawnAt) return null;
  const p = peds.spawnAt(new THREE.Vector3(pos.x, pos.y ?? groundY(game, pos.x, pos.z), pos.z), {});
  if (!p) return null;
  applyKit(game, p, kit, seed);
  p.pinned = 1e9;
  p.health = opts.health ?? 100;
  p.v21 = opts.tag || true;
  if (opts.group) {
    p.state = 'talk';
    p.act = 'talk';
    p.nav = null;
    p.group = opts.group;
    opts.group.members.push(p);
    p.stateT = 1e9;
    p.styleT = Math.random() * 3;
  }
  return p;
}
export const pedOut = (p) => !p || !p.active || p.dead || p.state === 'dead' || (p.health ?? 100) <= 0;
export function release(p) {
  if (!p) return;
  p.pinned = 0;
  p.v21 = null;
  if (p.active && !p.dead && (p.state === 'talk' || p.state === 'fight')) {
    p.state = 'walk';
    p.act = 'walk';
    p.stateT = 0;
  }
}
// keep a ped attacking the player (the ped system drops 'fight' after its timer)
export function keepFighting(p) {
  if (pedOut(p) || p.state === 'down' || p.state === 'gettingUp' || p.rag) return;
  if (p.state !== 'fight') {
    p.state = 'fight';
    p.hitCd = 0.8;
    p.guard = true;
    p.idleStyle = null;
    p.group = null;
  }
  p.stateT = 30;
}

// Enemy gunfire at the player through the combat track (tracer, near-miss, armor-aware damage).
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
export function fireAtPlayer(game, from, accuracy = 0.3, damage = 7) {
  const P = game.player;
  const G = game.gameplay?.G;
  _a.set(from.x, (from.y || 0) + 1.35, from.z);
  const hit = Math.random() < accuracy;
  const miss = hit ? 0 : 1.2 + Math.random() * 1.5;
  _b.set(P.position.x + (Math.random() - 0.5) * miss * 2, P.position.y + 1.2 + (Math.random() - 0.5) * miss, P.position.z + (Math.random() - 0.5) * miss * 2);
  try {
    if (G?.tracer) G.tracer(_a.clone(), _b.clone(), { speed: 380 });
    else game.combat?.gfx?.tracer?.(_a.clone(), _b.clone(), { speed: 380 });
  } catch (e) {
    /* */
  }
  try {
    game.audio?.play?.('pistol', { position: { x: _a.x, y: _a.y, z: _a.z }, volume: 0.8 });
  } catch (e) {
    /* */
  }
  if (hit) {
    if (G?.damagePlayer) G.damagePlayer(damage, { kind: 'bullet', gang: true });
    else P.health = Math.max(0, P.health - damage);
  }
  return hit;
}
