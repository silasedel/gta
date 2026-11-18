// Southline — fail-safe wardrobe for the user's scanned Nico (one baked mesh: palm shirt over a white tank, cargo pants,
// white sneakers, watch). The pipeline Nico's garment meshes were cut for a different body, so on this body:
// - every piece is tracked exactly as before (game.wardrobe API, saved outfits, police description, disguises, events);
// - the signature pieces show the baked clothes as they are;
// - other tops / bottoms / shoes RECOLOR the baked shirt / pants / shoes through a region mask (regions.webp, built by
//   tools/v2/player/regions.py): color and disguise read correctly, the cut stays the baked one (shorts show as pants);
// - watch and chain are logical only (the baked watch stays).
// Same interface as wardrobe/outfit.js createOutfit(), so nothing else changes. Nothing here can throw into the game.
import * as THREE from 'three';
import { getPiece, DEFAULT_OUTFIT } from '../wardrobe/outfit.js';

const REGION = { top: 0, bottom: 1, shoes: 2 };
// pieces that ARE the baked look (no tint)
const BAKED = new Set(['shirt_palm_open', 'pants_cargo_khaki', 'sneakers_leather_offwhite', 'sneakers_white', 'tee_white', 'watch_diver_steel']);
// prints without a flat color: a representative cloth color by name
const BY_NAME = { teal: 0x1f7a78, coral: 0xd8705a, navy: 0x1d2a48, 'off-white': 0xe6e0d0, white: 0xeeece6, black: 0x1a1b1e, blue: 0x3b6ea5, red: 0xb5352e,
  green: 0x56603e, khaki: 0xb39a6c, olive: 0x565c3c, 'blue denim': 0x4a6a94, tan: 0x9a6b3c, brown: 0x5a3d26, burgundy: 0x5e1a24, 'dark blue': 0x1c2740 };

// the lagoon print is the same teal as the baked shirt, so a name tint changed nothing: give it a clearly different aqua
const TINT_ID = { shirt_tropical_lagoon: 0x3fc4bd, shirt_tropical_bone: 0xe4dcc4 };

export function createBakedOutfit({ character, game, material }) {
  const worn = {};
  const u = material?.userData?.u;
  const col = new THREE.Color();
  const paint = (slot) => {
    const r = REGION[slot]; if (r === undefined || !u) return;
    const p = worn[slot];
    const t = u.uTint.value[r];
    if (!p || BAKED.has(p.id)) { t.w = 0; return; }
    const c = TINT_ID[p.id] ?? p.mat?.color ?? BY_NAME[p.colorName] ?? 0x808080;
    col.setHex(c).convertSRGBToLinear();                   // the shader works on linear albedo
    t.set(col.r, col.g, col.b, 0.92);
  };
  const emit = (extra) => { try { game?.emit?.('outfit:changed', Object.assign({ character, description: outfit.describe(), disguise: outfit.disguise() }, extra)); } catch (e) { /* ignore */ } };
  const outfit = {
    baked: true,
    wear(id, silent) {
      const p = getPiece(id); if (!p) return false;
      worn[p.slot] = p; paint(p.slot);
      if (!silent) emit({ slot: p.slot, id });
      return true;
    },
    remove(slot, silent) {
      // the baked body cannot take clothes off: removing a piece goes back to the signature piece of that slot
      delete worn[slot];
      const d = DEFAULT_OUTFIT.map(getPiece).find((p) => p && p.slot === slot);
      if (d && slot !== 'chain' && slot !== 'watch') worn[slot] = d;
      paint(slot);
      if (!silent) emit({ slot, id: worn[slot]?.id || null });
    },
    set(ids) { for (const s of Object.keys(worn)) delete worn[s]; for (const id of ids || []) outfit.wear(id, true); for (const s in REGION) paint(s); emit({}); },
    current() { const o = {}; for (const s in worn) o[s] = worn[s].id; return o; },
    ids() { return Object.values(worn).map((p) => p.id); },
    describe() {
      const parts = ['male'];
      for (const s of ['top', 'bottom', 'shoes']) {
        const p = worn[s]; const un = s === 'top' ? worn.under : null;
        if (p) parts.push([p.colorName, p.patternName, p.noun].filter(Boolean).join(' ') + (un ? ' over a ' + [un.colorName, un.noun].join(' ') : ''));
        else if (s === 'top') parts.push(un ? [un.colorName, un.noun].join(' ') : 'shirtless');
        else if (s === 'shoes') parts.push('barefoot');
      }
      return parts.join(', ');
    },
    disguise() { return worn.top?.disguise || null; },
    setBody() {}, refreshCover() {}, setWet() {}, setLOD() {}, update() {},
    onCover: null,
  };
  outfit.set(DEFAULT_OUTFIT);
  return outfit;
}
