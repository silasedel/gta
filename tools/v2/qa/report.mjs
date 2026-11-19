#!/usr/bin/env node
// r2-qa: turns docs/v2/reports/qa-r2[-tag].json (tools/v2/qa/tour.mjs) into the bug table docs/v2/reports/qa-r2.md
// and docs/v2/reports/qa-r2-owners.json (bugs grouped by owner).   node tools/v2/qa/report.mjs [--tag r1]
import fs from 'node:fs';
const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const TAG = o.tag ? '-' + o.tag : '';
const R = JSON.parse(fs.readFileSync(`docs/v2/reports/qa-r2${TAG}.json`, 'utf8'));
const bugs = [];
let id = 0;
const SEV = { high: 0, medium: 1, low: 2 };
const add = (b) => bugs.push({ id: 0, ...b });
const fmt = (x, z, y) => (x == null ? '' : `${x}, ${y != null ? y + ', ' : ''}${z}`);
const ownerOfFile = (u) => {
  if (/vegetation|flora|palm/.test(u)) return 'r2-veg';
  if (/vehicles\/physics|physics/.test(u)) return 'r2-physics';
  if (/boats|ocean|water|swim/.test(u)) return 'r2-water';
  if (/vehicles/.test(u)) return 'r2-cars';
  if (/npc|people|player\/nico|seat/.test(u)) return 'r2-people';
  if (/houses|nicoHouse|keys/.test(u)) return 'r2-keys';
  if (/terrain|ground|seabed/.test(u)) return 'r2-ground';
  if (/roads?\b|road|curb/.test(u)) return 'r2-roads';
  if (/metro|subway/.test(u)) return 'r2-metro';
  if (/render|post|shadow|grade/.test(u)) return 'r2-render';
  if (/look|light|env\//.test(u)) return 'r2-look';
  if (/ui\/|hud|map/.test(u)) return 'r2-mapui';
  if (/miami|city|facade|build/.test(u)) return 'r2-art';
  return 'main';
};
for (const [area, A] of Object.entries(R.areas || {})) {
  const sh = A.shots || {};
  const grp = (list, key) => {
    const m = {};
    for (const f of list || []) (m[f[key]] ||= []).push(f);
    return m;
  };
  // hitboxes (capsule cast)
  const SHRUB = /hibiscus|bougainvillea|croton|ixora|shrub|bush|fern|straps/i;
  for (const f of A.hitbox || []) {
    if (SHRUB.test(f.label)) f.kind = 'shrub';
    else if (/countryside/.test(f.label)) f.kind = 'countryside veg';
    else if (/npc|people/.test(f.label)) f.kind = 'npc';
  }
  for (const f of A.float || []) {
    if (SHRUB.test(f.label)) f.kind = 'shrub';
    else if (/countryside/.test(f.label)) f.kind = 'countryside veg';
  }
  for (const f of A.sink || []) {
    if (SHRUB.test(f.label)) f.kind = 'shrub';
    else if (/countryside/.test(f.label)) f.kind = 'countryside veg';
  }
  A.hitbox = (A.hitbox || []).filter(
    (f) => f.kind !== 'npc' && !/weapon|sniper|pickup/i.test(f.label),
  );
  A.float = (A.float || []).filter(
    (f) => !/weapon|sniper|pickup|npc/i.test(f.label) && f.ground < 2.5,
  );
  A.sink = (A.sink || []).filter(
    (f) => !/weapon|sniper|pickup|npc/i.test(f.label) && f.ground < 2.5,
  );
  for (const [kind, L] of Object.entries(grp(A.hitbox, 'kind'))) {
    L.sort((p, q) => q.pen - p.pen);
    const w = L[0],
      through = L.filter((f) => f.through).length;
    const labels = [...new Set(L.map((f) => f.label.split('|')[0]))].slice(0, 4).join(', ');
    add({
      area,
      cat: 'hitbox',
      sev: kind === 'shrub' ? 'low' : through ? 'high' : w.pen > 0.3 ? 'medium' : 'low',
      what: `${kind}${kind === 'shrub' ? ' (walk-through may be intended; flagged for the big ones)' : kind === 'countryside veg' ? " (the 'countryside' instanced layer: trees and shrubs drawn near the player with no colliders)" : ''}: ${L.length}${A.tested?.[kind] ? '/' + A.tested[kind] : ''} tested objects let the player capsule into the visual mesh (${through} fully through, worst ${w.pen} m past the surface; meshes: ${labels})`,
      at: fmt(w.x, w.z, w.y),
      shot:
        sh['hit_' + kind] ||
        (kind === 'countryside veg' ? sh.hit_other : kind === 'shrub' ? sh.hit_tree : null),
      owner: /tree|shrub|countryside/.test(kind)
        ? 'r2-veg'
        : kind === 'deck' && area === 'spawn'
          ? 'r2-keys'
          : kind === 'wall'
            ? 'r2-physics'
            : 'r2-physics',
      ex: L.slice(0, 5).map((f) => `${f.label.split('|')[0]} @ ${f.x},${f.z} pen ${f.pen}`),
    });
  }
  if (A.carHitbox?.length) {
    const w = [...A.carHitbox].sort((p, q) => q.pen - p.pen)[0];
    add({
      area,
      cat: 'hitbox',
      sev: A.carHitbox.some((f) => f.through) ? 'high' : 'medium',
      what: `parked cars: ${A.carHitbox.length}/${A.carsTested} let the capsule into the body (worst ${w.car} ${w.pen} m)`,
      at: fmt(w.x, w.z),
      shot: sh.hit_car,
      owner: 'r2-physics',
      ex: A.carHitbox.slice(0, 5).map((f) => `${f.car} @ ${f.x},${f.z} pen ${f.pen}`),
    });
  }
  // real walks
  for (const w of (A.walks || []).filter(
    (w) => w.pen > 0.15 && w.maxLat !== undefined && !/npc|people/i.test(w.label),
  ))
    add({
      area,
      cat: 'hitbox (walk)',
      sev: SHRUB.test(w.label)
        ? 'low'
        : /lot-props|TrashCan|Mailbox|Bin|sign/i.test(w.label)
          ? 'medium'
          : w.pen > 0.4
            ? 'high'
            : 'medium',
      what: `${/lot-props|TrashCan|Mailbox|Bin|sign/i.test(w.label) && !w.flaggedByCast ? '(breakable? the cast found a collider, so it was probably knocked over; check) ' : ''}sprinting into a ${SHRUB.test(w.label) ? 'shrub' : /countryside/.test(w.label) ? 'countryside veg' : w.kind} (${w.label.split('|')[0]}) the player's capsule ends ${w.pen} m inside the visual mesh${w.flaggedByCast ? ' (also flagged by the cast)' : ''}`,
      at: fmt(w.x, w.z),
      shot: sh['walk_' + w.kind],
      owner:
        /tree/.test(w.kind) || SHRUB.test(w.label) || /countryside/.test(w.label)
          ? 'r2-veg'
          : 'r2-physics',
    });
  const noMove = (A.walks || []).filter((w) => w.travelled < 0.3);
  if (A.walks?.length && noMove.length === A.walks.length)
    add({
      area,
      cat: 'qa',
      sev: 'low',
      what: 'real walks did not move the player (input not taken): walk results inconclusive',
      at: '',
      owner: 'r2-qa',
    });
  for (const w of (A.carWalks || []).filter((w) => w.carMovedMm > 1))
    add({
      area,
      cat: 'push',
      sev: w.carMovedMm > 20 ? 'high' : 'medium',
      what: `walking into a parked ${w.key} moved it ${w.carMovedMm} mm / ${w.carTurnDeg} deg (drift before contact ${w.driftMm} mm)`,
      at: fmt(w.x, w.z),
      shot: sh.pushedCar,
      owner: 'r2-physics',
    });
  // floating / sinking
  for (const [kind, L] of Object.entries(grp(A.float, 'kind'))) {
    L.sort((p, q) => q.gap - p.gap);
    const w = L[0];
    add({
      area,
      cat: 'floating',
      sev: w.gap > 0.25 ? 'medium' : 'low',
      what: `${L.length} ${kind} object(s) float above the ground with nothing under them (worst ${w.gap} m: ${w.label.split('|')[0]})`,
      at: fmt(w.x, w.z, w.base),
      shot:
        sh['float_' + kind] ||
        (kind === 'countryside veg' ? sh.float_other : kind === 'shrub' ? sh.float_tree : null),
      owner: /tree|shrub|countryside/.test(kind)
        ? 'r2-veg'
        : area === 'spawn'
          ? 'r2-keys'
          : 'r2-ground',
      ex: L.slice(0, 5).map((f) => `${f.label.split('|')[0]} @ ${f.x},${f.z} gap ${f.gap}`),
    });
  }
  for (const [kind, L] of Object.entries(grp(A.sink, 'kind'))) {
    L.sort((p, q) => p.sunk - q.sunk);
    const w = L[0];
    add({
      area,
      cat: 'sinking',
      sev: w.sunk < -0.6 ? 'medium' : 'low',
      what: `${L.length} ${kind} object(s) sunk > 30 cm into the ground (worst ${w.sunk} m: ${w.label.split('|')[0]}, ${w.h} m tall)`,
      at: fmt(w.x, w.z, w.base),
      shot: sh['sink_' + kind],
      owner: /tree|shrub|countryside/.test(kind) ? 'r2-veg' : 'r2-ground',
      ex: L.slice(0, 5).map((f) => `${f.label.split('|')[0]} @ ${f.x},${f.z} sunk ${f.sunk}`),
    });
  }
  if (A.plantsInCars?.length)
    add({
      area,
      cat: 'clipping',
      sev: 'medium',
      what: `plants grow inside ${A.plantsInCars.length} parked car(s) (${A.plantsInCars
        .slice(0, 3)
        .map((p) => p.car + ': ' + p.label.split('|')[0])
        .join('; ')})`,
      at: fmt(A.plantsInCars[0].x, A.plantsInCars[0].z),
      shot: sh.plantInCar,
      owner: 'r2-veg',
    });
  // ground
  const G = A.ground;
  if (G) {
    const _miss = () =>
      G.missing?.length &&
      add({
        area,
        cat: 'ground',
        sev: 'high',
        what: `${G.missing.length}/${G.n} points have no physics floor under the rendered surface (meshes: ${[...new Set(G.missing.map((m) => m.mesh))].slice(0, 4).join(', ')})`,
        at: fmt(G.missing[0].x, G.missing[0].z, G.missing[0].render),
        shot: sh.noCollider,
        owner: 'r2-ground',
        ex: G.missing
          .slice(0, 5)
          .map((m) => `${m.x},${m.z} render ${m.render} phys ${m.phys} (${m.mesh})`),
      });
    if (G.waterMissing?.length)
      add({
        area,
        cat: 'ground',
        sev: 'high',
        what: `${G.waterMissing.length} shallow-water points (< 1.5 m) have no seabed collider`,
        at: fmt(G.waterMissing[0].x, G.waterMissing[0].z, G.waterMissing[0].render),
        shot: sh.noCollider,
        owner: 'r2-ground',
      });
    const ROOF =
      /houses|tin|chunk-mid|chunk-far|npc|ext:|facade|miami-city|library|lib-|countryside|veg|plants/i;
    const roofs = (G.mismatch || []).concat(G.missing || []).filter((m) => ROOF.test(m.mesh));
    if (roofs.length)
      add({
        area,
        cat: 'ground',
        sev: 'low',
        what: `${roofs.length} points where a roof / building / vegetation top has a collider > 5 cm off the drawn surface or none (meshes: ${[...new Set(roofs.map((m) => m.mesh))].slice(0, 5).join(', ')})`,
        at: fmt(roofs[0].x, roofs[0].z, roofs[0].render),
        owner: /veg|plants|countryside/.test(roofs[0].mesh)
          ? 'r2-veg'
          : /houses/.test(roofs[0].mesh)
            ? 'r2-keys'
            : 'r2-art',
        ex: roofs
          .slice(0, 5)
          .map((m) => `${m.x},${m.z} render ${m.render} phys ${m.phys} (${m.mesh})`),
      });
    G.missing = (G.missing || []).filter((m) => !ROOF.test(m.mesh));
    _miss();
    const lb = (G.mismatch || []).filter(
      (m) => /land-base/.test(m.mesh) && Math.abs(m.diff) <= 0.15,
    );
    if (lb.length)
      add({
        area,
        cat: 'ground',
        sev: 'low',
        what: `${lb.length}/${G.n} points: the drawn land base (miami-land-base) sits ${lb[0].diff > 0 ? 'below' : 'above'} the physics floor by 5-${Math.max(...lb.map((m) => Math.abs(m.diff))).toFixed(2)} m (feet hover / sink that much)`,
        at: fmt(lb[0].x, lb[0].z, lb[0].render),
        owner: 'r2-ground',
      });
    const mm = (G.mismatch || []).filter(
      (m) =>
        !m.water && !ROOF.test(m.mesh) && !(/land-base/.test(m.mesh) && Math.abs(m.diff) <= 0.15),
    );
    if (mm.length) {
      const big = mm.filter((m) => Math.abs(m.diff) > 0.15);
      const byMesh = {};
      for (const m of mm) byMesh[m.mesh] = (byMesh[m.mesh] || 0) + 1;
      add({
        area,
        cat: 'ground',
        sev: big.length > 5 ? 'medium' : 'low',
        what: `${mm.length}/${G.n} points: physics floor differs from the rendered surface by > 5 cm (${big.length} by > 15 cm; worst ${mm[0].diff} m on ${mm[0].mesh}; by mesh: ${Object.entries(
          byMesh,
        )
          .sort((p, q) => q[1] - p[1])
          .slice(0, 4)
          .map(([k, v]) => k + ' ' + v)
          .join(', ')})`,
        at: fmt(mm[0].x, mm[0].z, mm[0].render),
        shot: sh.groundMismatch,
        owner: /road|curb|sidewalk|lane/i.test(mm[0].mesh) ? 'r2-roads' : 'r2-ground',
        ex: mm
          .slice(0, 5)
          .map((m) => `${m.x},${m.z} render ${m.render} phys ${m.phys} (${m.mesh}, ${m.src})`),
      });
    }
    const wm = (G.mismatch || []).filter((m) => m.water);
    if (wm.length)
      add({
        area,
        cat: 'ground',
        sev: 'low',
        what: `${wm.length} water points: seabed collider differs from the drawn seabed by > 5 cm (worst ${wm[0].diff})`,
        at: fmt(wm[0].x, wm[0].z, wm[0].render),
        owner: 'r2-ground',
      });
  }
  if (A.ready?.timedOut)
    add({
      area,
      cat: 'streaming',
      sev: 'medium',
      what: `area not ready (colliders / near tiles) within 40 s of teleport`,
      at: fmt(A.center[0], A.center[1]),
      owner: 'r2-ground',
    });
  if (typeof A.labels?.zoneLabel === 'string' && !A.labels.zoneLabel)
    add({
      area,
      cat: 'ui',
      sev: 'medium',
      what: `minimap zone label empty (district ${A.labels.district || '?'}, zone ${A.labels.zone || '?'})`,
      at: fmt(A.center[0], A.center[1]),
      owner: 'r2-mapui',
    });
}
for (const V of R.vehicles || []) {
  if (V.err) {
    add({
      area: 'vehicles',
      cat: 'vehicle',
      sev: 'high',
      what: `${V.key}: ${V.err}`,
      at: '',
      owner: 'r2-cars',
    });
    continue;
  }
  for (const f of V.fails || []) {
    const head = /head/.test(f.what),
      exit = /exit|player/.test(f.what);
    add({
      area: 'vehicles',
      cat: 'vehicle',
      sev: /NaN|rolled|through|launched|head|inside/.test(f.what) ? 'high' : 'medium',
      what: `${V.key}: ${f.what}${f.label ? ' (' + f.label + ')' : ''}${f.kmh != null ? ` at ${f.kmh} km/h, up ${f.up}` : ''}${head ? ` (head ${f.head}, skull top ${f.skullTop}, roof outer ${f.roofOuter} on ${f.roofMesh})` : ''}${f.wheelSink != null ? `, wheel sink ${f.wheelSink}` : ''}`,
      at: f.at ? f.at.join(', ') : '',
      shot: head ? V.headShot : V.shot,
      owner: head ? 'r2-cars' : exit ? 'r2-physics' : 'r2-physics',
    });
  }
}
for (const V of R.vehicles || []) {
  const h = V.head;
  if (h && h.roofOuter != null && !h.clip && h.roofOuter - h.skullTop < 0.06)
    add({
      area: 'vehicles',
      cat: 'vehicle',
      sev: 'medium',
      what: `${V.key}: Nico's skull top (head bone + 0.20 m = ${h.skullTop}) is only ${(h.roofOuter - h.skullTop).toFixed(2)} m under the OUTER roof (${h.roofOuter}); with a 4-6 cm roof shell the head pokes through the headliner`,
      at: '',
      shot: V.headShot,
      owner: 'r2-cars',
    });
}
for (const c of R.console || []) {
  const m = /fell below ground, restored at (-?[0-9.]+) (-?[0-9.]+)/.exec(c.text);
  if (m)
    add({
      area: c.phase,
      cat: 'ground',
      sev: 'high',
      what: `player fell below the ground right after a teleport (${c.phase}); the anti-fall guard restored him (${c.text})`,
      at: `${m[1]}, ${m[2]}`,
      owner: 'r2-ground',
    });
}
const W = R.water || {};
for (const k of ['drive_truck9', 'drive_sedan3']) {
  const d = W[k];
  if (d && d.bedPhys != null && d.bedDrawn != null && Math.abs(d.bedPhys - d.bedDrawn) > 0.1)
    add({
      area: 'water',
      cat: 'water',
      sev: 'medium',
      what: `shallow water: physics floor ${d.bedPhys.toFixed(2)} vs drawn seabed ${d.bedDrawn.toFixed(2)} where the ${d.key} stopped: the car rides ${(d.bedPhys - d.bedDrawn).toFixed(2)} m above the drawn sand (invisible floor)`,
      at: d.end.join(', '),
      owner: 'r2-ground',
    });
}
if (
  W.swim &&
  W.swim.s2 &&
  !W.swim.s2.headUnder &&
  W.swim.s2.breath >= 99.5 &&
  W.swim.s2.barOpacity &&
  +W.swim.s2.barOpacity > 0.5
)
  add({
    area: 'water',
    cat: 'water',
    sev: 'low',
    what: 'breath bar visible at 100 % breath with the head above water',
    at: '',
    owner: 'r2-water',
  });
for (const k of ['drive_truck9', 'drive_sedan3']) {
  const d = W[k];
  if (!d) continue;
  if (d.err) {
    add({
      area: 'water',
      cat: 'water',
      sev: 'medium',
      what: `${k}: ${d.err}`,
      at: '',
      owner: 'r2-water',
    });
    continue;
  }
  if (d.fellThrough || d.carAboveBed === null || d.carAboveBed < 0)
    add({
      area: 'water',
      cat: 'water',
      sev: 'high',
      what: `${d.key} driven into ${W.spots?.shallow?.depth} m water: car below the seabed / no seabed collider (car y ${d.end[1]}, seabed phys ${d.bedPhys}, drawn ${d.bedDrawn})`,
      at: d.end.join(', '),
      shot: `docs/v2/shots/qa/water_drive_${d.key}.jpg`,
      owner: 'r2-ground',
    });
  if (d.playerAboveBed !== null && d.playerAboveBed < -0.2)
    add({
      area: 'water',
      cat: 'water',
      sev: 'high',
      what: `after exiting the ${d.key} in shallow water the player is ${d.playerAboveBed} m below the seabed`,
      at: d.playerFeet.join(', '),
      owner: 'r2-water',
    });
  for (const j of d.judge || [])
    add({
      area: 'water',
      cat: 'water',
      sev: 'medium',
      what: `${d.key} water drive: ${j.what}`,
      at: j.at.join(', '),
      owner: 'r2-physics',
    });
}
if (W.wade?.nBelow)
  add({
    area: 'water',
    cat: 'water',
    sev: 'high',
    what: `wading in: player feet below the seabed in ${W.wade.nBelow}/${W.wade.samples} samples`,
    at: (W.wade.below[0] || []).slice(0, 3).join(', '),
    shot: 'docs/v2/shots/qa/water_wade_below_bed.jpg',
    owner: 'r2-water',
  });
if (W.swim) {
  const s = W.swim;
  if (!s.s1.swimming)
    add({
      area: 'water',
      cat: 'water',
      sev: 'high',
      what: `teleported into ${W.spots?.deep?.depth} m deep water: not swimming (y ${s.s1.y})`,
      at: fmt(W.spots.deep.x, W.spots.deep.z),
      owner: 'r2-water',
    });
  if (s.s2.breath < 95 && !s.s2.headUnder)
    add({
      area: 'water',
      cat: 'water',
      sev: 'medium',
      what: `breath bar stuck at ${s.s2.breath} while swimming at the surface`,
      at: fmt(W.spots.deep.x, W.spots.deep.z),
      shot: 'docs/v2/shots/qa/water_swim.jpg',
      owner: 'r2-water',
    });
}
if (W.spots && !W.spots.shallow)
  add({
    area: 'water',
    cat: 'qa',
    sev: 'low',
    what: 'no 20-50 cm shallow water found near the Keys beach: shallow drive/wade not run',
    at: '',
    owner: 'r2-qa',
  });
const U = R.ui || {};
const mm = U.spawn?.minimap;
if (
  U.spawn &&
  (!mm?.found || !mm.visible || (mm.colors != null && (mm.colors < 6 || mm.lumStd < 6)))
)
  add({
    area: 'spawn',
    cat: 'ui',
    sev: 'high',
    what: `minimap looks blank at the spawn (${JSON.stringify(mm).slice(0, 200)})`,
    at: U.spawn.pos?.join(', '),
    shot: 'docs/v2/shots/qa/ui_minimap_spawn.jpg',
    owner: 'r2-mapui',
  });
if (U.spawn && !U.spawn.zoneLabel)
  add({
    area: 'spawn',
    cat: 'ui',
    sev: 'medium',
    what: `zone label empty at the spawn (district ${U.spawn.district}, zone ${U.spawn.zone})`,
    at: U.spawn.pos?.join(', '),
    owner: 'r2-mapui',
  });
if (U.phoneOpen === false)
  add({
    area: 'ui',
    cat: 'ui',
    sev: 'high',
    what: 'P did not open the phone',
    at: '',
    owner: 'r2-mapui',
  });
if (U.phoneOpen && U.phoneClosed === false)
  add({
    area: 'ui',
    cat: 'ui',
    sev: 'medium',
    what: 'phone did not close with P / Esc',
    at: '',
    owner: 'r2-mapui',
  });
if (U.pauseOpen === false)
  add({ area: 'ui', cat: 'ui', sev: 'high', what: 'Esc did not pause', at: '', owner: 'r2-mapui' });
if (U.pauseOpen && U.devOn === false)
  add({
    area: 'ui',
    cat: 'ui',
    sev: 'medium',
    what: 'code 6969 did not turn dev mode on (pause, game.dev.openCodes(), keys Digit6 Digit9 Digit6 Digit9 Enter via CDP); please confirm by hand, it may be the scripted input',
    at: '',
    owner: 'r2-mapui',
  });
if (U.unpaused === false)
  add({
    area: 'ui',
    cat: 'ui',
    sev: 'medium',
    what: 'Esc did not leave the pause menu after the codes panel',
    at: '',
    owner: 'r2-mapui',
  });
if (
  U.devTeleport &&
  (U.devTeleport.dist > 60 ||
    (U.devTeleport.feetAboveGround != null && Math.abs(U.devTeleport.feetAboveGround) > 0.3))
)
  add({
    area: 'ui',
    cat: 'ui',
    sev: 'medium',
    what: `dev teleport to 407,-110 landed ${U.devTeleport.dist} m away, feet ${U.devTeleport.feetAboveGround} m above ground`,
    at: U.devTeleport.pos.join(', '),
    owner: 'r2-mapui',
  });
if (U.loading?.nBack)
  add({
    area: 'boot',
    cat: 'ui',
    sev: 'medium',
    what: `loading bar went backwards ${U.loading.nBack} times (${JSON.stringify(U.loading.backwards.slice(0, 3))})`,
    at: '',
    owner: 'main',
  });
if (U.loading && !U.loading.samples)
  add({
    area: 'boot',
    cat: 'qa',
    sev: 'low',
    what: 'no loading-bar trace (window.__loadProgress.samples empty): monotonic check not done',
    at: '',
    owner: 'r2-qa',
  });
for (const c of R.console || []) {
  if (/fell below ground/.test(c.text)) continue;
  const err = c.lvl !== 'warning' && c.lvl !== 'log-warning';
  if (!err && c.n < 2 && !/THREE|WebGL|shader/i.test(c.text)) continue;
  add({
    area: 'console',
    cat: err ? 'console error' : 'console warning',
    sev: err
      ? c.lvl === 'exception'
        ? 'high'
        : 'medium'
      : /TypeError|ReferenceError/.test(c.text)
        ? 'medium'
        : 'low',
    what: `[${c.lvl} x${c.n}, ${c.phase}] ${c.text.replace(/\s+/g, ' ').slice(0, 220)}`,
    at: c.url,
    owner: ownerOfFile(c.url + ' ' + c.text),
  });
}
for (const e of R.extraBugs || []) add(e);
bugs.sort((p, q) => SEV[p.sev] - SEV[q.sev]);
bugs.forEach((b, i) => {
  b.id = 'QA-' + String(i + 1).padStart(3, '0');
});
const esc = (s) =>
  String(s ?? '')
    .replace(/\|/g, '/')
    .replace(/\n/g, ' ');
let md = `# r2-qa playtest report (${R.when})\n\nScript: \`node tools/v2/qa/tour.mjs\` (raw: docs/v2/reports/qa-r2${TAG}.json). Boot ${R.bootS} s. Areas: ${Object.entries(
  R.areas || {},
)
  .map(([k, A]) => `${k} (${A.center.join(', ')}, ${A.labels?.district || A.labels?.zone || ''})`)
  .join('; ')}.\n\n`;
md += `Method: hitboxes = player capsule shape-cast from 4 sides at every object (nearest 30 per kind) vs the rendered mesh at 0.5 / 1.1 m, plus real sprints (keyboard) into 2 per kind and 4 parked cars; ground = rendered-surface raycast vs physics raycast at 280 points per area; floating = object base vs ground collider, confirmed by a rendered-surface ray; vehicles = 20 s scripted drive, curb at 30 km/h, pole/sign at ~40 km/h, enter/exit; water = shallow drive (truck9, sedan3), wade, swim.\n\n`;
md += `Counts: ${bugs.filter((b) => b.sev === 'high').length} high, ${bugs.filter((b) => b.sev === 'medium').length} medium, ${bugs.filter((b) => b.sev === 'low').length} low.\n\n`;
md += `| id | area | category | severity | bug | repro (x, [y,] z) | screenshot | suspected owner |\n|---|---|---|---|---|---|---|---|\n`;
for (const b of bugs)
  md += `| ${b.id} | ${b.area} | ${b.cat} | ${b.sev} | ${esc(b.what)}${b.ex ? '<br><sub>' + esc(b.ex.join('; ')) + '</sub>' : ''} | ${esc(b.at)} | ${b.shot ? b.shot : ''} | ${b.owner} |\n`;
md += `\n## Per-area counts\n\n| area | objects by kind | hitbox tested | parked cars | ground points | walks |\n|---|---|---|---|---|---|\n`;
for (const [k, A] of Object.entries(R.areas || {}))
  md += `| ${k} | ${esc(JSON.stringify(A.counts))} | ${esc(JSON.stringify(A.tested))} | ${A.carsTested ?? 0} | ${A.ground?.n ?? 0} | ${(A.walks || []).length} + ${(A.carWalks || []).length} cars |\n`;
md += `\n## Vehicles\n\n| car | drive max km/h | min up | curb | sign | exit | fails |\n|---|---|---|---|---|---|---|\n`;
for (const V of R.vehicles || [])
  md += `| ${V.key} | ${V.drive?.maxKmh?.toFixed?.(0) ?? ''} | ${V.drive?.minUp ?? ''} | ${esc(JSON.stringify(V.curb))} | ${esc(JSON.stringify(V.sign && { kmh: V.sign.maxKmh, up: V.sign.minUp, vy: V.sign.maxVy }))} | ${esc(JSON.stringify(V.exit))} | ${(V.fails || []).length} |\n`;
md += `\n## Coverage gaps in this run\n\n- South Beach: the preset coordinate (3478, -77) is open ocean, so no South Beach objects were tested (fixed in the script: it now searches districtAt for South Beach).\n- Everglades: the preset (-2386, 2660) resolves to Homestead / rural; only the 'countryside' layer stood there.\n- Real sprint walks in r1 slid around round objects, so their penetration numbers were not trusted (fixed: lateral slide > 25 cm is now ignored). Hitbox bugs above come from the capsule cast. Parked-car push test: 0-0.1 mm on 4 cars per area (pass).\n- Vehicles: six cars (sedan3, suv12, truck9, super4, hatch2, van3) drove 20 s, hit a curb at 30 km/h and a sign post at 20-60 km/h with no roll-over, NaN or launch; enter and exit were clean.\n`;
md += `\n## Not covered automatically\n\nWhite triangles in car windows and wires ending in mid-air are visual-only and not measured by this script (screenshots in docs/v2/shots/qa/ show the areas).\n`;
fs.writeFileSync(o.out || 'docs/v2/reports/qa-r2.md', md);
for (const b of bugs)
  b.key = `${b.area}|${b.cat}|${b.what
    .replace(/-?\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 70)}`;
fs.writeFileSync(`docs/v2/reports/qa-r2${TAG}-bugs.json`, JSON.stringify(bugs, null, 1));
const byOwner = {};
for (const b of bugs) (byOwner[b.owner] ||= []).push(b);
if (!o.out) fs.writeFileSync('docs/v2/reports/qa-r2-owners.json', JSON.stringify(byOwner, null, 1));
console.log(
  bugs.length,
  'bugs;',
  Object.entries(byOwner)
    .map(([k, v]) => `${k}:${v.length}`)
    .join(' '),
);
