// Southline — what the feet actually stand on (footstep sound / prints / dust).
// The map's surfaceAt(x, z) only knows the 2D cell: on Nico's dock it says 'water' (the deck sits over the canal), on a
// porch it says 'sand'. This resolver looks at the real floor under the feet:
//   1. tagged structures: any Object3D with userData.surface = 'wood' | 'metal' | 'tile' | ... (world / setpiece agents
//      tag decks, docks, stairs). Found by a slow incremental scene scan (a few hundred nodes a frame, no hitch), kept
//      with a world-space box; a step inside the box near its top uses that tag. Owners may also call
//      game.footSurface.tag(obj, surface) or game.footSurface.tagCollider(collider, surface) directly.
//   2. a static Rapier ray under the feet: the floor height. Feet clearly above the terrain / the sea = a built structure:
//      wood over water / sand / grass / dirt (docks, decks, boardwalks), the map's paved surface otherwise.
//   3. 'water' only when the feet are actually in the water (wading: floor below the sea line, or the player's own
//      waterDepth probe says so).
// API: game.footSurfaceAt(x, y, z) -> surface string;  game.footSurface = { tag, tagCollider, stats }
import * as THREE from 'three';
import { seaLevel } from './controller/surface.js';

export const order = 63; // after ground/beach.v2.js (62) wraps game.surfaceAt
const SOFT = new Set([
  'sand',
  'sand_dry',
  'sand_wet',
  'beach',
  'dune',
  'damp',
  'shell',
  'grass',
  'grass_short',
  'grass_long',
  'dirt',
  'gravel',
  'mud',
  'water',
]);
const SCAN_PER_FRAME = 400;

export async function initV2(game) {
  const R = game.RAPIER,
    W = game.world;
  const QF = R?.QueryFilterFlags;
  const FLAGS = QF ? QF.EXCLUDE_SENSORS | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_DYNAMIC : 0;
  const ray = R ? new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }) : null;
  const stats = { tagged: 0, scans: 0, last: null, src: null };

  // ---- tagged structures (boxes) ----
  const tagged = []; // { obj, box, surface }
  const known = new WeakSet();
  const colliderTags = new Map(); // collider handle -> surface
  function tag(obj, surface) {
    if (!obj) return;
    if (surface) obj.userData.surface = surface;
    if (known.has(obj)) {
      const t = tagged.find((e) => e.obj === obj);
      if (t) {
        t.box.setFromObject(obj);
        t.surface = obj.userData.surface;
      }
      return;
    }
    known.add(obj);
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    tagged.push({ obj, box, surface: String(obj.userData.surface) });
    stats.tagged = tagged.length;
  }
  function tagCollider(col, surface) {
    if (col != null) colliderTags.set(typeof col === 'number' ? col : col.handle, surface);
  }

  // incremental scan: an explicit stack walks the scene graph a few hundred nodes a frame, then starts over
  const stack = [];
  function scanStep() {
    const scene = game.scene;
    if (!scene) return;
    if (!stack.length) {
      stack.push(scene);
      stats.scans++;
    }
    for (let n = 0; n < SCAN_PER_FRAME && stack.length; n++) {
      const o = stack.pop();
      if (o.userData && o.userData.surface && !known.has(o)) {
        try {
          tag(o);
        } catch (e) {
          known.add(o);
        }
        continue;
      } // children inherit
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) stack.push(ch[i]);
    }
  }
  game.updaters?.push(function footSurfaceScan() {
    scanStep();
  });

  function tagAt(x, y, z) {
    let best = null,
      bestD = 9;
    for (let i = 0; i < tagged.length; i++) {
      const t = tagged[i],
        b = t.box;
      if (x < b.min.x - 0.15 || x > b.max.x + 0.15 || z < b.min.z - 0.15 || z > b.max.z + 0.15)
        continue;
      if (!t.obj.parent) continue; // removed from the scene
      const d = Math.abs(b.max.y - y); // the feet stand near the top of the structure
      if (y < b.min.y - 0.3 || y > b.max.y + 0.5) continue;
      if (d < bestD) {
        bestD = d;
        best = t.surface;
      }
    }
    return best;
  }

  function floorAt(x, y, z) {
    if (!ray || !W) return null;
    ray.origin.x = x;
    ray.origin.y = y + 0.9;
    ray.origin.z = z;
    let hit = null;
    try {
      hit = W.castRay(ray, 2.4, true, FLAGS, undefined, game.player?.collider || undefined);
    } catch (e) {
      hit = null;
    }
    if (!hit) return null;
    const ct = colliderTags.size ? colliderTags.get(hit.collider?.handle) : undefined;
    return { y: y + 0.9 - hit.timeOfImpact, tag: ct || null };
  }

  function footSurfaceAt(x, y, z) {
    let base0 = 'concrete';
    try {
      base0 = game.surfaceAt?.(x, z, y) || 'concrete';
    } catch (e) {
      /* */
    }
    if (!Number.isFinite(y)) return base0;
    const t = tagAt(x, y, z);
    if (t) {
      stats.src = 'tag';
      return (stats.last = t);
    }
    const f = floorAt(x, y, z);
    if (f?.tag) {
      stats.src = 'collider';
      return (stats.last = f.tag);
    }
    const floorY = f ? f.y : y;
    const sea = seaLevel(game);
    const P = game.player;
    const nearPlayer =
      P?.position && Math.abs(P.position.x - x) < 1.5 && Math.abs(P.position.z - z) < 1.5;
    // in the water: the floor (or the feet) under the sea line over a water cell, or the player's own probe
    let mapWater = false;
    try {
      mapWater = !!game.city?.isWater?.(x, z);
    } catch (e) {
      /* */
    }
    if (
      (nearPlayer && (P.waterDepth || 0) > 0.12 && floorY < sea + 0.05) ||
      (mapWater && floorY < sea + 0.02)
    ) {
      stats.src = 'wade';
      return (stats.last = 'water');
    }
    // raised above the terrain (or above the water): a built structure
    let g = null;
    try {
      g = game.city?.groundHeightAt?.(x, z);
    } catch (e) {
      g = null;
    }
    const raised = (mapWater && floorY > sea + 0.05) || (Number.isFinite(g) && floorY > g + 0.18);
    if (raised) {
      stats.src = 'raised';
      if (base0 === 'water' || SOFT.has(base0)) return (stats.last = 'wood');
      return (stats.last = base0);
    }
    stats.src = 'map';
    return (stats.last = base0 === 'water' ? 'concrete' : base0); // a dry step on a "water" cell: a seawall / quay edge
  }

  game.footSurfaceAt = footSurfaceAt;
  game.footSurface = { tag, tagCollider, stats, at: footSurfaceAt };
}
