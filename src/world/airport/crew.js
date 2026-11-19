// Miami International flight crews (people intake, Nov 19): the user's pilots walk short beats on the aprons.
// The airline captain (p184) walks the terminal face between two gates; the rural pilot (p183), the seaplane pilot
// (p182) and the woman pilot (p174) walk between the GA stands and the hangars. They are staged people
// (game.npc.spawnPosed) that exist only while the player is within CREW_R of the airport, so elsewhere they cost
// nothing; close up they are ordinary people (same LODs and clips as the crowd).
//   createCrew(game, ap) -> { update(dt, pp), remove(), walkers }
const CREW_R = 400; // m from the airport centre; beyond it the walkers are removed
const SPEED = 1.25; // m/s, an unhurried walk
const PAUSE = 4; // s standing at each end of the beat

// Walk lines for the walkers: [person id, from, to] in world meters.
function beats(ap) {
  const out = [];
  const gates = (ap.stands || []).filter((s) => s.kind === 'gate' && s.door);
  if (gates.length >= 2) {
    // 8 m out from the terminal face, between the first two gate doors
    const out8 = (s) => {
      const dx = s.x - s.door[0];
      const dz = s.z - s.door[1];
      const d = Math.hypot(dx, dz) || 1;
      return { x: s.door[0] + (dx / d) * 8, z: s.door[1] + (dz / d) * 8 };
    };
    out.push(['p184', out8(gates[0]), out8(gates[1])]);
  }
  const ga = ap.gaStands || [];
  const hangars = ap.hangars || [];
  const gaPilots = ['p183', 'p182', 'p174'];
  for (let i = 0; i < gaPilots.length && i * 2 < ga.length; i++) {
    const s = ga[i * 2];
    // beside the parked plane's wing, then 30 m toward the nearest hangar
    const h = nearest(hangars, s) || { x: s.x, z: s.z };
    const dx = h.x - s.x;
    const dz = h.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    const a = { x: s.x - (dz / d) * 7, z: s.z + (dx / d) * 7 };
    out.push([gaPilots[i], a, { x: a.x + (dx / d) * 30, z: a.z + (dz / d) * 30 }]);
  }
  return out;
}

function nearest(list, p) {
  let best = null;
  let bd = Infinity;
  for (const q of list) {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

export function createCrew(game, ap, cx, cz) {
  const ground = (x, z) => game.city?.groundHeightAt?.(x, z) ?? 0;
  const walkers = beats(ap).map(([id, a, b], i) => ({
    id,
    a,
    b,
    t: (i * 0.37) % 1, // spread along the beat so they do not all turn at once
    dir: 1,
    wait: 0,
    h: null,
  }));
  const len = (w) => Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) || 1;
  let asked = false;

  // a walker appears once the cast has loaded its person (asked for when the player first comes near)
  function spawn(w) {
    const cast = game.npc?.cast;
    if (!cast?.get?.(w.id)) return;
    const x = w.a.x + (w.b.x - w.a.x) * w.t;
    const z = w.a.z + (w.b.z - w.a.z) * w.t;
    w.h = game.npc.spawnPosed({ person: w.id, pos: { x, y: ground(x, z), z }, rot: 0 }) || null;
    // a stand-in from the street crowd is no pilot: drop it and wait for the real person
    if (w.h && w.h.id !== w.id) {
      w.h.remove();
      w.h = null;
    }
  }

  function step(w, dt) {
    const h = w.h;
    if (w.wait > 0) {
      w.wait -= dt;
      h.speed = 0;
      return;
    }
    w.t += (w.dir * SPEED * dt) / len(w);
    if (w.t >= 1 || w.t <= 0) {
      w.t = Math.min(1, Math.max(0, w.t));
      w.dir = -w.dir;
      w.wait = PAUSE;
    }
    const x = w.a.x + (w.b.x - w.a.x) * w.t;
    const z = w.a.z + (w.b.z - w.a.z) * w.t;
    h.root.position.set(x, ground(x, z), z);
    h.root.rotation.y = Math.atan2((w.b.x - w.a.x) * w.dir, (w.b.z - w.a.z) * w.dir);
    h.speed = w.wait > 0 ? 0 : SPEED;
  }

  function remove() {
    for (const w of walkers) {
      w.h?.remove();
      w.h = null;
    }
    asked = false; // the cast may unload them while we are away: ask again on the way back
  }

  function update(dt, pp) {
    if (!walkers.length || !pp) return;
    if (Math.hypot(pp.x - cx, pp.z - cz) > CREW_R + 1200) {
      remove();
      return;
    }
    // the airport is big: the crew counts as near when the player is within CREW_R of any walker's beat
    const near = walkers.some((w) => Math.hypot(pp.x - w.a.x, pp.z - w.a.z) < CREW_R);
    if (!near) {
      remove();
      return;
    }
    if (!asked) {
      game.npc?.cast?.want?.(walkers.map((w) => w.id));
      asked = true;
    }
    for (const w of walkers) {
      if (!w.h) spawn(w);
      if (w.h) step(w, dt);
    }
  }

  return { update, remove, walkers };
}
