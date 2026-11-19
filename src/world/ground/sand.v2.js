// SAND-WEAR track: game.sand = shared sand services.
//   game.sand.makeMaterial(opts)      fine-detail sand material (see sandMaterial.js) for any ground mesh
//   game.sand.addArea({ x, z, heading, rx, rz, y, cz })   register a sandy lot (ellipse in its own frame; cz = local z offset of its center)
//   game.sand.query(x, z) -> { y, area } | { y: null } | null     is this spot sand? (areas first, then game.surfaceAt)
//   game.sand.isSand(x, z) -> boolean
import * as THREE from 'three';
import { makeSandMaterial } from './sandMaterial.js';
export const order = 60;
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const SANDY = new Set(['sand', 'dune', 'beach', 'damp', 'shell', 'island', 'sandbar']);

export async function initV2(game) {
  const areas = [],
    loader = new THREE.TextureLoader();
  const sand = {
    areas,
    surfaces: SANDY,
    makeMaterial: (opts = {}) =>
      makeSandMaterial(THREE, {
        base: BASE,
        loader,
        anisotropy: game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8,
        ...opts,
      }),
    addArea(a) {
      if (a && Number.isFinite(a.x) && Number.isFinite(a.z)) {
        areas.push({ heading: 0, rx: 10, rz: 10, cz: 0, y: null, ...a });
      }
      return a;
    },
    query(x, z) {
      for (const a of areas) {
        const dx = x - a.x,
          dz = z - a.z,
          c = Math.cos(a.heading),
          s = Math.sin(a.heading),
          lx = dx * c - dz * s,
          lr = dx * s + dz * c,
          lz = lr - a.cz,
          ex = a.exclude;
        if (ex && lx > ex[0] && lx < ex[1] && lr > ex[2] && lr < ex[3]) return null;
        if ((lx * lx) / (a.rx * a.rx) + (lz * lz) / (a.rz * a.rz) <= 1) return { y: a.y, area: a };
      }
      try {
        const k = game.surfaceAt?.(x, z) ?? game.city?.surfaceAt?.(x, z);
        if (k && SANDY.has(k)) return { y: null, area: null };
      } catch (e) {
        /* no surface data here */
      }
      return null;
    },
    isSand(x, z) {
      return !!sand.query(x, z);
    },
  };
  game.sand = sand;
}
