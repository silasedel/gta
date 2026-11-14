// PORT SOLANA V2 navigation: turn-by-turn maneuvers from an arc sequence, in US units, with lane guidance.
// Pure: needs only the compact graph. Text is original wording in the plain style of road navigation.

import { TG, AF, K, KIND_INFO, wrapPi, str } from './graph.js';

// ------------------------------------------------------------------------------------------------ units and names (US)
export const M_PER_FT = 0.3048, M_PER_MI = 1609.344;

/** 480 m -> { value: '0.3', unit: 'mi', text: '0.3 mi', spoken: 'three tenths of a mile' } ; 90 m -> 300 ft */
export function formatDistance(m) {
  if (!(m >= 0)) return { value: '', unit: '', text: '', spoken: '' };
  const ft = m / M_PER_FT, mi = m / M_PER_MI;
  if (mi >= 0.19) {
    const v = mi >= 10 ? String(Math.round(mi)) : (Math.round(mi * 10) / 10).toFixed(1).replace(/\.0$/, mi >= 0.95 ? '' : '.0');
    const n = parseFloat(v);
    const tenths = { '0.2': 'two tenths of a mile', '0.3': 'three tenths of a mile', '0.4': 'four tenths of a mile', '0.5': 'half a mile', '0.6': 'six tenths of a mile',
      '0.7': 'seven tenths of a mile', '0.8': 'eight tenths of a mile', '0.9': 'nine tenths of a mile' };
    const spoken = tenths[v] || (n === 1 ? '1 mile' : `${v} miles`);
    return { value: v, unit: 'mi', text: `${v} mi`, spoken };
  }
  const step = ft >= 500 ? 100 : ft >= 100 ? 50 : 10;
  const r = Math.max(10, Math.round(ft / step) * step);
  return { value: String(r), unit: 'ft', text: `${r} ft`, spoken: `${r} feet` };
}
export function formatDuration(s) {
  if (!(s >= 0)) return '';
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
/** clock string for an in-game hour (0-24, fractional): 17.5 -> '5:30 PM' */
export function formatClock(hour) {
  let h = ((hour % 24) + 24) % 24, m = Math.round((h - Math.floor(h)) * 60); h = Math.floor(h);
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

const ABBR = [[/\bNortheast\b/g, 'NE'], [/\bNorthwest\b/g, 'NW'], [/\bSoutheast\b/g, 'SE'], [/\bSouthwest\b/g, 'SW'],
  [/\bBoulevard\b/g, 'Blvd'], [/\bAvenue\b/g, 'Ave'], [/\bStreet\b/g, 'St'], [/\bDrive\b/g, 'Dr'], [/\bRoad\b/g, 'Rd'], [/\bCourt\b/g, 'Ct'],
  [/\bPlace\b/g, 'Pl'], [/\bTerrace\b/g, 'Ter'], [/\bLane\b/g, 'Ln'], [/\bHighway\b/g, 'Hwy'], [/\bExpressway\b/g, 'Expy'], [/\bParkway\b/g, 'Pkwy'],
  [/\bCauseway\b/g, 'Cswy'], [/\bNorth\b(?= \w)/g, 'N'], [/\bSouth\b(?= \w)/g, 'S'], [/\bEast\b(?= \w)/g, 'E'], [/\bWest\b(?= \w)/g, 'W']];
/** Short sign-style name: 'Northeast 2nd Avenue' -> 'NE 2nd Ave', 'I 395' -> 'I-395' */
export function shortName(name) {
  if (!name) return name;
  let s = roadLabel(name);
  for (const [re, to] of ABBR) s = s.replace(re, to);
  return s;
}
/** 'I 95' -> 'I-95', 'US 1' -> 'US-1', 'FL 836' / 'SR 836' -> 'SR-836' */
export function roadLabel(name) {
  if (!name) return name;
  return String(name).replace(/^(I|US|SR|FL|CR)[ -]?(\d+[A-Z]?)\b/, (m, p, n) => `${p === 'FL' ? 'SR' : p}-${n}`).split(';')[0].trim();
}
const sameLabel = (a, b) => { if (!a || !b) return false; if (a === b) return true; const pa = a.split(';'); for (const x of b.split(';')) if (pa.includes(x)) return true; return false; };
const isHighwayRef = (s) => /^(I|US|SR|FL|CR)[ -]?\d+/.test(s || '');
const CARD = ['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest'];
/** compass word for a heading (heading 0 faces +Z = south, +X is east) */
export function cardinal(heading, four = false) {
  const a = ((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (four) return ['south', 'east', 'north', 'west'][Math.round(a / (Math.PI / 2)) % 4];
  return CARD[Math.round(a / (Math.PI / 4)) % 8];
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ORD = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][n % 10]}`;

// ------------------------------------------------------------------------------------------------ maneuvers
const SIDE_OF_GEOM = [0, 1, 1, 1, -1, -1, -1, -1]; // +1 right, -1 left
const MOD = ['straight', 'slight right', 'right', 'sharp right', 'slight left', 'left', 'sharp left', 'uturn'];

function transitionType(G, a, b) { for (let t = G.tStart[a]; t < G.tStart[a + 1]; t++) if (G.tTo[t] === b) return G.tType[t]; return -1; }

/**
 * @param G     nav graph
 * @param raw   { arcs, startS, endS } from the router
 * @param opts  { destName?, toPoint?:{x,z} (the real destination, for "on your left/right") }
 * @returns { maneuvers:[...], arcD: Float64Array (route meters at the start of each arc, +1 entry = total), length, junctionSide: Int8Array }
 */
export function buildManeuvers(G, raw, opts = {}) {
  const arcs = raw.arcs, n = arcs.length;
  const { aEdge, aDir, aTo, aFrom, aLen, aKind, aFlags, aLanes, aBearIn, aBearOut, tStart, tTo, tType, eName, eRef, eLen, eDestF, eDestB, eExit, eTurnF, eTurnB, nx, nz } = G;
  // cumulative centerline distance
  const arcD = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = arcs[i], L = eLen[aEdge[a]];
    let f0 = 0, f1 = 1;
    if (i === 0) f0 = aDir[a] > 0 ? raw.startS / L : 1 - raw.startS / L;
    if (i === n - 1) f1 = aDir[a] > 0 ? raw.endS / L : 1 - raw.endS / L;
    arcD[i + 1] = arcD[i] + Math.max(0, f1 - f0) * aLen[a];
  }
  const nameOf = (a) => str(G, eName[aEdge[a]]), refOf = (a) => str(G, eRef[aEdge[a]]);
  const labelOf = (a) => nameOf(a) || refOf(a);
  const isLink = (a) => (aFlags[a] & AF.LINK) !== 0, isRb = (a) => (aFlags[a] & AF.ROUNDABOUT) !== 0;
  const isHwy = (a) => aKind[a] === K.motorway || aKind[a] === K.trunk;
  const isFreewayLink = (a) => aKind[a] === K.motorway_link || aKind[a] === K.trunk_link;
  const destOf = (a) => str(G, aDir[a] > 0 ? eDestF[aEdge[a]] : eDestB[aEdge[a]]);
  // name to show for the road entered at arc index i: its own, or the next named road reached without a decision
  const nameAhead = (i, maxM = 260, skipLinks = false) => {
    let d = 0;
    for (let j = i; j < n && d <= maxM; j++) {
      const a = arcs[j];
      if (!(skipLinks && isLink(a))) { const l = labelOf(a); if (l) return { name: l, arc: a, index: j }; }
      d += aLen[a];
    }
    return null;
  };
  // direction word for freeways: "I-95 North"
  const withDirection = (label, i) => {
    if (!label || !isHighwayRef(label) || /\b(North|South|East|West)\b/i.test(label)) return roadLabel(label);
    let j = i; while (j < n - 1 && labelOf(arcs[j]) !== label && j - i < 6) j++;
    let j2 = j, d = 0; while (j2 < n - 1 && d < 700 && labelOf(arcs[j2 + 1]) === label) { d += aLen[arcs[j2]]; j2++; }
    const x0 = nx[aFrom[arcs[j]]], z0 = nz[aFrom[arcs[j]]], x1 = nx[aTo[arcs[j2]]], z1 = nz[aTo[arcs[j2]]];
    if (Math.hypot(x1 - x0, z1 - z0) < 60) return roadLabel(label);
    return `${roadLabel(label)} ${cap(cardinal(Math.atan2(x1 - x0, z1 - z0), true))}`;
  };

  const out = [];
  const junctionSide = new Int8Array(Math.max(0, n - 1)); // lane hint for the geometry builder: -1 keep left, +1 keep right, 0 none
  const push = (m) => { m.index = out.length; out.push(m); return m; };

  // depart
  {
    const a = arcs[0];
    const h0 = aBearOut[a];
    const nm = nameAhead(0, 120);
    push({ type: 'depart', modifier: 'straight', at: 0, arcIndex: 0, x: raw.snapFrom?.x ?? nx[aFrom[a]], z: raw.snapFrom?.z ?? nz[aFrom[a]], bearing: h0,
      name: nm ? roadLabel(nm.name) : null, text: `Head ${cardinal(h0)}${nm ? ` on ${roadLabel(nm.name)}` : ''}`, short: nm ? shortName(nm.name) : cap(cardinal(h0)), lanes: null, side: 0 });
  }

  let suppressUntil = -1; // junction index before which link -> road merges are already covered by the previous instruction
  for (let j = 0; j < n - 1; j++) {
    const a = arcs[j], b = arcs[j + 1], v = aTo[a];
    const t = transitionType(G, a, b);
    const geom = t < 0 ? TG.STRAIGHT : (t & 7);
    const ang = -wrapPi(aBearOut[b] - aBearIn[a]); // + right
    // alternatives a driver could take here instead (legal, not a U-turn)
    const alts = [];
    for (let q = tStart[a]; q < tStart[a + 1]; q++) { const c = tTo[q]; if (c === b || (tType[q] & 7) === TG.UTURN) continue; alts.push(c); }
    const base = { at: arcD[j + 1], arcIndex: j + 1, x: nx[v], z: nz[v], bearingBefore: aBearIn[a], bearing: aBearOut[b], angle: ang, node: v, signal: (G.nFlags[v] & 1) !== 0 };

    // ---- roundabout: one instruction for the whole circle ----
    if (isRb(b) && !isRb(a)) {
      let exits = 0, k = j + 1;
      while (k < n - 1 && isRb(arcs[k + 1])) {
        const c = arcs[k];
        for (let q = tStart[c]; q < tStart[c + 1]; q++) if (!isRb(tTo[q]) && (tType[q] & 7) !== TG.UTURN) { exits++; break; }
        k++;
      }
      if (k < n - 1) {
        const c = arcs[k];
        // exits passed on the last circle arc before ours do not count; ours is exits + 1
        const nm = nameAhead(k + 1, 200);
        const exitNo = exits + 1;
        const sweep = -wrapPi(aBearOut[arcs[k + 1]] - aBearIn[a]);
        junctionSide[j] = 1;
        push({ ...base, type: 'roundabout', modifier: sweep > 0.6 ? 'right' : sweep < -0.6 ? 'left' : 'straight', exit: exitNo, exitArcIndex: k + 1, exitAt: arcD[k + 1],
          name: nm ? roadLabel(nm.name) : null, text: `At the roundabout, take the ${ORD(exitNo)} exit${nm ? ` onto ${roadLabel(nm.name)}` : ''}`,
          short: nm ? shortName(nm.name) : `${ORD(exitNo)} exit`, lanes: null, side: 1, angle: sweep });
        j = k; // continue after the exit
        void c;
        continue;
      }
      // the route ends inside the circle: fall through to the arrival
      break;
    }
    if (isRb(a) && isRb(b)) continue;

    // ---- U-turn ----
    if (geom === TG.UTURN) {
      const nm = labelOf(b);
      junctionSide[j] = -1;
      push({ ...base, type: 'uturn', modifier: 'uturn', name: nm ? roadLabel(nm) : null, text: `Make a U-turn${nm ? ` on ${roadLabel(nm)}` : ''}`, short: nm ? shortName(nm) : 'U-turn', lanes: laneHint(a, 'left', b, alts), side: -1 });
      continue;
    }

    const la = labelOf(a), lb = labelOf(b);
    const sameRoad = sameLabel(la, lb);
    const side = ang > 0.12 ? 1 : ang < -0.12 ? -1 : 0;
    // how the alternatives sit relative to our choice
    let altStraighter = false, altLeft = false, altRight = false, altSameName = false, altNearParallel = false, altHwy = false, altLinkOnly = alts.length > 0;
    for (const c of alts) {
      const ca = -wrapPi(aBearOut[c] - aBearIn[a]);
      if (Math.abs(ca) < Math.abs(ang) - 0.12) altStraighter = true;
      if (ca < ang - 0.08) altLeft = true; else if (ca > ang + 0.08) altRight = true;
      if (la && sameLabel(labelOf(c), la)) altSameName = true;
      if (Math.abs(ca - ang) < 0.75 && Math.abs(ca) < 0.9) altNearParallel = true;
      if (isHwy(c)) altHwy = true;
      if (!isLink(c)) altLinkOnly = false;
    }
    const forkSide = altLeft && !altRight ? 1 : altRight && !altLeft ? -1 : side; // we are the right branch if every alternative is to our left

    // ---- freeway exits, ramps, merges, forks ----
    if (isLink(b) && !isLink(a)) {
      if (isHwy(a) && isFreewayLink(b)) { // off-ramp
        const ex = str(G, eExit[aEdge[b]]), dest = destOf(b);
        let toward = dest ? roadLabel(dest.split(';')[0]) : null;
        if (!toward) { const nm = nameAhead(j + 1, 1500, true); if (nm && nm.name !== la) toward = withDirection(nm.name, nm.index); }
        const s = forkSide || 1;
        junctionSide[j] = s;
        { const nm2 = nameAhead(j + 1, 1500, true); if (nm2) suppressUntil = nm2.index; }
        push({ ...base, type: 'exit', modifier: s < 0 ? 'slight left' : 'slight right', exit: ex || null, toward, name: toward,
          text: `Take ${ex ? `exit ${ex}` : 'the exit'}${s < 0 ? ' on the left' : ''}${toward ? ` toward ${toward}` : ''}`, short: ex ? `Exit ${ex}` : (toward ? shortName(toward) : 'Exit'),
          lanes: laneHint(a, s < 0 ? 'slight_left' : 'slight_right', b, alts), side: s });
        continue;
      }
      let endIdx = j + 1; while (endIdx < n && isLink(arcs[endIdx])) endIdx++;
      if (endIdx < n && isHwy(arcs[endIdx])) { // on-ramp from a surface street
        const nm = nameAhead(endIdx, 400);
        const target = nm ? withDirection(nm.name, nm.index) : destOf(b);
        const s = side || forkSide || 1;
        junctionSide[j] = s;
        const how = Math.abs(ang) > 0.87 ? `Turn ${s < 0 ? 'left' : 'right'} onto the ramp` : `Take the ramp${s < 0 ? ' on the left' : ''}`;
        push({ ...base, type: 'ramp', modifier: MOD[geom === TG.STRAIGHT ? (s < 0 ? TG.SLIGHT_LEFT : TG.SLIGHT_RIGHT) : geom], name: target || null,
          text: `${how}${target ? ` to ${target}` : ''}`, short: target ? shortName(target) : 'Ramp', lanes: laneHint(a, s < 0 ? 'left' : 'right', b, alts), side: s });
        continue;
      }
      // slip lane / turn lane: one instruction for the road it leads to, judged by the whole movement
      if (endIdx >= n) break;
      const whole = -wrapPi(aBearOut[arcs[endIdx]] - aBearIn[a]), wabs = Math.abs(whole);
      const g2 = wabs < 0.38 ? TG.STRAIGHT : wabs < 0.87 ? (whole > 0 ? TG.SLIGHT_RIGHT : TG.SLIGHT_LEFT) : wabs < 2.27 ? (whole > 0 ? TG.RIGHT : TG.LEFT) : (whole > 0 ? TG.SHARP_RIGHT : TG.SHARP_LEFT);
      const nm = nameAhead(endIdx, 160);
      const s = g2 === TG.STRAIGHT ? 0 : SIDE_OF_GEOM[g2];
      for (let q = j; q < endIdx; q++) junctionSide[q] = s || side;
      if (g2 !== TG.STRAIGHT || (nm && !sameLabel(nm.name, la) && alts.length)) {
        const target = nm ? roadLabel(nm.name) : null;
        push({ ...base, type: g2 === TG.STRAIGHT ? 'continue' : 'turn', modifier: MOD[g2], name: target, angle: whole,
          text: g2 === TG.STRAIGHT ? `Continue onto ${target}` : `${turnPhrase(g2)}${target ? (sameLabel(nm.name, la) ? ` to stay on ${target}` : ` onto ${target}`) : ''}`,
          short: target ? shortName(nm.name) : cap(MOD[g2]), lanes: laneHint(a, s < 0 ? 'left' : s > 0 ? 'right' : 'through', b, alts), side: s });
      }
      j = endIdx - 1;
      continue;
    }
    if (isLink(a) && !isLink(b)) {
      if (isHwy(b)) {
        const target = withDirection(lb, j + 1);
        const s = altLeft && !altRight ? 1 : altRight && !altLeft ? -1 : 0; // traffic we merge into is on that other side
        push({ ...base, type: 'merge', modifier: s > 0 ? 'slight left' : s < 0 ? 'slight right' : 'straight', name: target || null, text: `Merge onto ${target || 'the freeway'}`, short: target ? shortName(target) : 'Merge', lanes: null, side: 0 });
        continue;
      }
      if (j + 1 <= suppressUntil && geom === TG.STRAIGHT) continue;
      if (!alts.length && geom <= TG.SLIGHT_RIGHT) continue;
      if (!alts.length && geom === TG.SLIGHT_LEFT) continue;
      // end of an off-ramp at a surface street
      if (geom === TG.STRAIGHT && (!lb || !alts.length)) continue;
      junctionSide[j] = side;
      const g2 = geom === TG.STRAIGHT ? TG.STRAIGHT : geom;
      const nm = lb ? roadLabel(lb) : null;
      push({ ...base, type: g2 === TG.STRAIGHT ? 'continue' : 'turn', modifier: MOD[g2], name: nm, text: g2 === TG.STRAIGHT ? `Continue onto ${nm}` : `${turnPhrase(g2)}${nm ? ` onto ${nm}` : ''}`,
        short: nm ? shortName(lb) : cap(MOD[g2]), lanes: laneHint(a, side < 0 ? 'left' : side > 0 ? 'right' : 'through', b, alts), side });
      continue;
    }
    if (isLink(a) && isLink(b)) {
      if (!alts.length) continue;
      const dest = destOf(b);
      const nm = nameAhead(j + 1, 2500, true);
      const target = dest ? roadLabel(dest.split(';')[0]) : nm ? withDirection(nm.name, nm.index) : null;
      const s = forkSide || 1;
      junctionSide[j] = s;
      push({ ...base, type: 'fork', modifier: s < 0 ? 'slight left' : 'slight right', name: target, text: `Keep ${s < 0 ? 'left' : 'right'}${target ? ` toward ${target}` : ' at the fork'}`,
        short: target ? shortName(target) : `Keep ${s < 0 ? 'left' : 'right'}`, lanes: laneHint(a, s < 0 ? 'slight_left' : 'slight_right', b, alts), side: s });
      continue;
    }
    if (isHwy(a) && isHwy(b)) {
      // staying on the freeway past an exit needs no instruction; a real split does
      if (!alts.length || altLinkOnly) continue;
      if (sameRoad && !altHwy) continue;
      const s = forkSide || 1;
      const target = withDirection(lb, j + 1);
      junctionSide[j] = s;
      push({ ...base, type: 'fork', modifier: s < 0 ? 'slight left' : 'slight right', name: target || null,
        text: `Keep ${s < 0 ? 'left' : 'right'}${target ? (sameRoad ? ` to stay on ${target}` : ` onto ${target}`) : ' at the fork'}`, short: target ? shortName(target) : `Keep ${s < 0 ? 'left' : 'right'}`,
        lanes: laneHint(a, s < 0 ? 'slight_left' : 'slight_right', b, alts), side: s });
      continue;
    }

    // ---- ordinary streets ----
    if (!alts.length && !(geom >= TG.RIGHT && geom !== TG.SLIGHT_LEFT && lb && !sameRoad)) continue; // the road just bends or changes name
    if (geom === TG.STRAIGHT) {
      if (sameRoad || !lb) continue;
      // going straight where the named road we were on turns away, or where two branches split
      if (altNearParallel && (aFlags[a] & AF.ONEWAY) && !altSameName && Math.abs(ang) > 0.1) {
        const s = forkSide || 1; junctionSide[j] = s;
        push({ ...base, type: 'fork', modifier: s < 0 ? 'slight left' : 'slight right', name: roadLabel(lb), text: `Keep ${s < 0 ? 'left' : 'right'} onto ${roadLabel(lb)}`, short: shortName(lb), lanes: laneHint(a, s < 0 ? 'slight_left' : 'slight_right', b, alts), side: s });
      } else if (altSameName && la) {
        push({ ...base, type: 'continue', modifier: 'straight', name: roadLabel(lb), text: `Continue straight onto ${roadLabel(lb)}`, short: shortName(lb), lanes: laneHint(a, 'through', b, alts), side: 0 });
      }
      continue;
    }
    // a gentle bend with a side street is not a turn; a real choice between two similar branches is a fork
    if ((geom === TG.SLIGHT_LEFT || geom === TG.SLIGHT_RIGHT) && sameRoad && !altStraighter) continue;
    const s = SIDE_OF_GEOM[geom];
    junctionSide[j] = s;
    const nmB = nameAhead(j + 1, 160);
    const target = nmB ? roadLabel(nmB.name) : null;
    const kindWord = !target ? KIND_INFO[aKind[b]].label : null;
    let text;
    if (target && la && target === roadLabel(la)) text = `${turnPhrase(geom)} to stay on ${target}`;
    else text = `${turnPhrase(geom)}${target ? ` onto ${target}` : kindWord && KIND_INFO[aKind[b]].rank >= 7 ? ` onto ${kindWord}` : ''}`;
    push({ ...base, type: 'turn', modifier: MOD[geom], name: target, text, short: target ? shortName(nmB.name) : cap(MOD[geom]), lanes: laneHint(a, s < 0 ? (geom === TG.SLIGHT_LEFT ? 'slight_left' : 'left') : (geom === TG.SLIGHT_RIGHT ? 'slight_right' : 'right'), b, alts), side: s });
  }

  // arrive
  {
    const a = arcs[n - 1], total = arcD[n];
    let sideTxt = '', s = 0;
    const tp = opts.toPoint, sx = raw.snapTo?.x, sz = raw.snapTo?.z;
    if (tp && sx !== undefined) {
      const hb = n > 1 || true ? headingAtEnd(G, a, raw) : 0;
      const dx = tp.x - sx, dz = tp.z - sz, d = Math.hypot(dx, dz);
      if (d > 4) { const cr = Math.sin(hb) * dz - Math.cos(hb) * dx; s = cr > 0 ? 1 : -1; sideTxt = s > 0 ? ' on the right' : ' on the left'; }
    }
    const label = opts.destName || null;
    push({ type: 'arrive', modifier: s > 0 ? 'right' : s < 0 ? 'left' : 'straight', at: total, arcIndex: n - 1, x: sx ?? nx[aTo[a]], z: sz ?? nz[aTo[a]], name: label,
      text: label ? `Arrive at ${label}${sideTxt}` : `Your destination is${sideTxt || ' ahead'}`, short: label || 'Destination', lanes: null, side: s, bearing: aBearIn[a] });
  }
  // distance from each maneuver to the next one
  for (let i = 0; i < out.length; i++) out[i].length = (i + 1 < out.length ? out[i + 1].at : arcD[n]) - out[i].at;
  return { maneuvers: out, arcD, length: arcD[n], junctionSide };

  // ---- lane guidance ----
  // lanes are listed left to right as { arrows:[...], active }. Uses mapped turn lanes when the data has them, else a sound guess.
  function laneHint(a, want, b, alts) {
    const nl = aLanes[a];
    if (nl < 2) return null;
    const k = aEdge[a], tl = str(G, aDir[a] > 0 ? eTurnF[k] : eTurnB[k]);
    const wantSide = /left/.test(want) ? -1 : /right/.test(want) ? 1 : 0;
    if (tl) {
      const lanes = tl.split('|').map((s) => ({ arrows: (s || 'through').split(';').map((x) => x.trim() || 'through'), active: false }));
      const match = (arr) => arr.some((x) => (wantSide < 0 ? /left/.test(x) : wantSide > 0 ? /right/.test(x) : x === 'through' || x === 'none' || x === ''));
      let any = false; for (const l of lanes) { l.active = match(l.arrows); any = any || l.active; }
      if (any) return lanes;
    }
    let hasL = wantSide < 0, hasR = wantSide > 0, hasS = wantSide === 0;
    for (const c of alts) { const ca = -wrapPi(aBearOut[c] - aBearIn[a]); if (ca < -0.5) hasL = true; else if (ca > 0.5) hasR = true; else hasS = true; }
    const lanes = [];
    const take = Math.max(1, Math.min(nl - (hasS || (wantSide < 0 ? hasR : hasL) ? 1 : 0), aLanes[b] || 1, wantSide === 0 ? nl : 2));
    for (let i = 0; i < nl; i++) {
      const arrows = [];
      if (i === 0 && hasL) arrows.push(want === 'slight_left' ? 'slight_left' : 'left');
      if (hasS && !(i === 0 && hasL && nl >= 3 && !/slight/.test(want)) && !(i === nl - 1 && hasR && nl >= 3 && !/slight/.test(want))) arrows.push('through');
      if (i === nl - 1 && hasR) arrows.push(want === 'slight_right' ? 'slight_right' : 'right');
      if (!arrows.length) arrows.push(wantSide < 0 && i < take ? 'left' : wantSide > 0 && i >= nl - take ? 'right' : 'through');
      if (wantSide < 0 && i < take && !arrows.some((x) => /left/.test(x))) arrows.unshift(want === 'slight_left' ? 'slight_left' : 'left');
      if (wantSide > 0 && i >= nl - take && !arrows.some((x) => /right/.test(x))) arrows.push(want === 'slight_right' ? 'slight_right' : 'right');
      const active = wantSide < 0 ? i < take : wantSide > 0 ? i >= nl - take : arrows.includes('through');
      lanes.push({ arrows, active });
    }
    return lanes;
  }
}

function turnPhrase(geom) {
  return ['Continue straight', 'Slight right', 'Turn right', 'Sharp right', 'Slight left', 'Turn left', 'Sharp left', 'Make a U-turn'][geom];
}
function headingAtEnd(G, a, raw) { // travel heading on the last arc at the destination point
  const k = G.aEdge[a], p0 = G.ePtsOff[k], p1 = G.ePtsOff[k + 1] - 1;
  let i = p0; while (i < p1 - 1 && G.cum[i + 1] < raw.endS) i++;
  const dx = G.pts[2 * i + 2] - G.pts[2 * i], dz = G.pts[2 * i + 3] - G.pts[2 * i + 1];
  return G.aDir[a] > 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
}

/** "In 300 ft, turn left onto Biscayne Blvd" for a maneuver and the distance to it (m). */
export function phrase(m, dist, opts = {}) {
  if (!m) return '';
  const lower = (s) => s[0].toLowerCase() + s.slice(1);
  if (m.type === 'arrive') { return dist > 40 ? `In ${formatDistance(dist).text}, ${lower(m.text.replace(/^Arrive at/, 'you will arrive at').replace(/^Your destination is/, 'your destination is'))}` : (m.name ? `You have arrived at ${m.name}` : 'You have arrived'); }
  if (dist === null || dist === undefined || dist < (opts.nowBelow ?? 25)) return m.text;
  return `In ${formatDistance(dist).text}, ${lower(m.text)}`;
}
/** Same for the spoken prompt (full words, no abbreviations). */
export function spoken(m, dist) {
  if (!m) return '';
  const lower = (s) => s[0].toLowerCase() + s.slice(1);
  const t = m.text.replace(/\bI-(\d+)/g, 'I $1').replace(/\bUS-(\d+)/g, 'U.S. $1').replace(/\bSR-(\d+)/g, 'State Road $1');
  if (m.type === 'arrive') return dist > 40 ? `In ${formatDistance(dist).spoken}, ${lower(t.replace(/^Arrive at/, 'you will arrive at'))}` : (m.name ? `You have arrived at ${m.name}` : 'You have arrived at your destination');
  if (dist === null || dist === undefined || dist < 25) return t;
  return `In ${formatDistance(dist).spoken}, ${lower(t)}`;
}
