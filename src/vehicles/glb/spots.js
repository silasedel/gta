// Utility vehicles at their hand-picked spots (placements.js UTILITY_SPOTS): Nico's yard, the air station, MIA.
// Nothing is loaded or simulated until the player comes within THINK_R of a spot; then the model streams in and the vehicle
// is parked once through game.vehicles.spawnParked (a pinned parked car: frozen by the traffic manager when far away, never
// recycled). The spot is checked with the shared placement rule (game.placement: solids, bushes, water, other cars) and kept
// off the carriageway; when the anchor is taken it slides up to `r` meters, and the vehicle is skipped if nothing fits.
import * as THREE from 'three';
import { UTILITY_SPOTS } from './placements.js';

const THINK_R = 400;
const RETRY_S = 6; // a failed spot (colliders / house solids not streamed yet) is tried again after this many seconds
const MAX_TRIES = 4;

export function createUtilitySpots(game) {
  const state = UTILITY_SPOTS.map(() => ({ done: false, busy: false, tries: 0, next: 0 }));
  const placed = [];

  // world anchor { x, z, heading } of a spot, or null while Nico's house is not built yet
  function anchorOf(s) {
    if (s.at) return { x: s.at[0], z: s.at[1], heading: s.heading || 0 };
    const NH = game.nicoHouse;
    if (!s.house || !NH?.toWorld) return null;
    const p = NH.toWorld(new THREE.Vector3(s.house[0], 0, s.house[1]));
    return { x: p.x, z: p.z, heading: (s.heading || 0) + (NH.spot?.heading || 0) };
  }

  // nearest free spot around the anchor: the anchor itself first, then rings at r/2 and r (8 directions each)
  function freeSpot(a, L, W, r) {
    const PL = game.placement;
    if (!PL?.clearSpot) return [a.x, a.z];
    const tries = [[0, 0]];
    for (const d of [r / 2, r])
      for (let k = 0; k < 8; k++)
        tries.push([Math.sin((k * Math.PI) / 4) * d, Math.cos((k * Math.PI) / 4) * d]);
    for (const [dx, dz] of tries) {
      const q = PL.clearSpot(a.x + dx, a.z + dz, a.heading, L, W, Math.max(2, r / 2), {
        cars: true,
      });
      if (!q) continue;
      if (Math.hypot(q[0] - a.x, q[1] - a.z) > r * 1.5) continue;
      if (PL.footprintOnRoad?.(q[0], q[1], a.heading, W + 1, L + 1)) continue;
      return q;
    }
    return null;
  }

  async function place(s, st) {
    const V = game.vehicles;
    const a = anchorOf(s);
    const T = V?.types?.[s.key];
    if (!a || !T || !V.spawnParked) return false;
    // the lots' solids (stairs, decks, bins) register with the houses module: wait for it near Nico's
    for (let i = 0; s.house && i < 40 && game.lots?.enabled !== false && !game.houses; i++)
      await new Promise((r) => setTimeout(r, 500));
    const q = freeSpot(a, T.L, T.W, s.r ?? 6);
    if (!q) return false;
    const v = await V.spawnParked(s.key, {
      x: q[0],
      z: q[1],
      heading: a.heading,
      color: s.color,
      locked: false,
      keepSpot: true,
    });
    if (!v) return false;
    v.locked = false;
    v.utilitySpot = s.note || true;
    placed.push(v);
    st.done = true;
    return true;
  }

  // called by the traffic manager (vehicles.js, every 0.5 s) with the player position
  function tick(pp) {
    const now = performance.now() / 1000;
    UTILITY_SPOTS.forEach((s, i) => {
      const st = state[i];
      if (st.done || st.busy || now < st.next) return;
      const a = anchorOf(s);
      if (!a || Math.hypot(pp.x - a.x, pp.z - a.z) > THINK_R) return;
      st.busy = true;
      place(s, st)
        .catch((e) => console.warn('[spots]', s.key, e))
        .finally(() => {
          st.busy = false;
          if (st.done) return;
          st.tries++;
          st.next = now + RETRY_S;
          if (st.tries >= MAX_TRIES) st.done = true; // no free spot: give up on this one
        });
    });
  }

  return { tick, placed, spots: UTILITY_SPOTS, state };
}
