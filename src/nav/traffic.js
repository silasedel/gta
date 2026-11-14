// PORT SOLANA V2 navigation: live traffic model.
// Gives every arc a congestion factor >= 1 (1 = free flow) from the time of day, the district it is in, its road class and
// its direction relative to the business core (inbound in the morning, outbound in the evening), plus incidents
// (crashes, police roadblocks, closures) and optional measured speeds reported by the traffic simulation.
// The router multiplies free-flow time by this factor; because it never drops below 1, landmark bounds stay valid.

import { K, AF, ZONES, edgesNear, edgePointAt } from './graph.js';

const Z = Object.fromEntries(ZONES.map((z, i) => [z, i]));
const gauss = (h, mu, sig) => { let d = Math.abs(h - mu); if (d > 12) d = 24 - d; return Math.exp(-(d * d) / (2 * sig * sig)); };
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; };

// how much a road class can slow down at full congestion (added share of free-flow time)
const SUSC = new Float32Array(17);
SUSC[K.motorway] = 1.5; SUSC[K.trunk] = 1.3; SUSC[K.primary] = 1.15; SUSC[K.secondary] = 0.95; SUSC[K.tertiary] = 0.65; SUSC[K.unclassified] = 0.35;
SUSC[K.residential] = 0.25; SUSC[K.living_street] = 0.1; SUSC[K.service] = 0.08; SUSC[K.alley] = 0.05; SUSC[K.track] = 0.02;
SUSC[K.motorway_link] = 1.1; SUSC[K.trunk_link] = 1.0; SUSC[K.primary_link] = 0.9; SUSC[K.secondary_link] = 0.7; SUSC[K.tertiary_link] = 0.5; SUSC[K.road] = 0.35;

/** Demand level 0..~1.2 for a zone at an hour. dirIn: +1 heading toward the core, -1 away. */
export function zoneDemand(zone, hour, dirIn = 0, weekend = false) {
  const am = gauss(hour, 8.1, 1.05), pm = gauss(hour, 17.4, 1.35), mid = gauss(hour, 12.8, 2.6), eve = gauss(hour, 20.5, 1.6), late = gauss(hour, 23.6, 1.7);
  const commute = weekend ? 0.25 * mid + 0.15 * pm : am * (1 + 0.45 * dirIn) + pm * (1 - 0.45 * dirIn) + 0.3 * mid;
  const leisure = (weekend ? 1.0 : 0.7) * mid + 0.55 * eve;
  switch (zone) {
    case Z.downtown: case Z.business: return 0.95 * commute + 0.15 * eve;
    case Z.commercial: return 0.7 * commute + 0.3 * leisure;
    case Z.causeway: return 0.9 * commute + 0.35 * leisure;
    case Z.residential: return 0.42 * commute + 0.08 * mid;
    case Z.industrial: return 0.5 * commute + 0.25 * gauss(hour, 11, 3);
    case Z.port: return 0.35 * commute + 0.6 * gauss(hour, 10.5, 3.2);
    case Z.beach: return 0.3 * commute + 0.95 * leisure + 0.35 * late;
    case Z.nightlife: return 0.3 * commute + 0.6 * leisure + 1.0 * late + 0.5 * eve;
    case Z.park: return 0.15 * commute + 0.4 * leisure;
    case Z.airport: return 0.25 + 0.5 * commute + 0.2 * leisure;
    case Z.keys: return 0.1 * commute + (weekend ? 0.8 : 0.4) * leisure;
    case Z.rural: return 0.12 * commute;
    default: return 0.5 * commute + 0.1 * leisure;
  }
}

export class TrafficModel {
  /** opts: { core: {x, z} business core (default: centroid of downtown/business arcs) } */
  constructor(G, opts = {}) {
    this.G = G;
    const nA = G.nA;
    this.mult = new Float32Array(nA).fill(1);
    this.base = new Float32Array(nA).fill(1); // time-of-day part only
    this.block = new Uint8Array(nA);
    this.dirIn = new Float32Array(nA);
    this.seed = new Float32Array(nA);
    this.probe = null; // measured speed factor per arc (EMA), allocated on first report
    this.incidents = new Map(); this._id = 0;
    this.version = 0; this.hour = -1; this.day = 0; this.rain = 0;
    let cx = 0, cz = 0, cn = 0;
    if (opts.core) { cx = opts.core.x; cz = opts.core.z; cn = 1; }
    else { for (let a = 0; a < nA; a++) if (G.aZone[a] === Z.downtown || G.aZone[a] === Z.business) { cx += G.nx[G.aFrom[a]]; cz += G.nz[G.aFrom[a]]; cn++; } if (cn) { cx /= cn; cz /= cn; } }
    this.core = { x: cx, z: cz };
    for (let a = 0; a < nA; a++) {
      const fx = G.nx[G.aFrom[a]], fz = G.nz[G.aFrom[a]], tx = G.nx[G.aTo[a]], tz = G.nz[G.aTo[a]];
      const dx = tx - fx, dz = tz - fz, l = Math.hypot(dx, dz) || 1, vx = cx - fx, vz = cz - fz, vl = Math.hypot(vx, vz);
      this.dirIn[a] = cn && vl > 400 ? (dx * vx + dz * vz) / (l * vl) : 0;
      // corridor-level variation: arcs of the same named road share most of it, so a whole avenue is slow, not random pieces
      const name = G.eName[G.aEdge[a]];
      this.seed[a] = 0.7 * hash((name >= 0 ? name : G.aEdge[a]) * 2 + (G.aDir[a] > 0 ? 1 : 0)) + 0.3 * hash(G.aEdge[a] + 7919);
    }
  }

  /** Recompute the time-of-day congestion. hour 0..24 (fractional), day = day counter (weekends are days 5 and 6 of each 7). */
  setTime(hour, day = 0, rain = 0) {
    const G = this.G, nA = G.nA, base = this.base;
    const weekend = ((day % 7) + 7) % 7 >= 5;
    const dayWob = 0.85 + 0.3 * hash(day * 131 + 17); // some days are just worse
    for (let a = 0; a < nA; a++) {
      const kind = G.aKind[a];
      const s = SUSC[kind];
      if (s < 0.06) { base[a] = 1; continue; }
      const wob = 0.72 + 0.56 * ((this.seed[a] + hash(day * 977 + (G.eName[G.aEdge[a]] + 3) * 31) * 0.5) % 1); // differs by corridor and by day
      let lvl = zoneDemand(G.aZone[a], hour, this.dirIn[a], weekend) * wob * dayWob;
      if (lvl > 1.25) lvl = 1.25;
      // congestion grows faster than demand (queues): convex response
      base[a] = 1 + s * lvl * lvl * (0.55 + 0.45 * lvl) + rain * 0.14;
    }
    this.hour = hour; this.day = day; this.rain = rain;
    this._compose();
    return this.version;
  }

  _compose() {
    const G = this.G, nA = G.nA, mult = this.mult, base = this.base, probe = this.probe;
    this.block.fill(0);
    if (probe) for (let a = 0; a < nA; a++) mult[a] = Math.max(base[a], probe[a] || 1);
    else mult.set(base);
    for (const inc of this.incidents.values()) for (let i = 0; i < inc.arcs.length; i++) {
      const a = inc.arcs[i];
      mult[a] = Math.max(1, mult[a] * inc.factors[i]);
      if (inc.hard) this.block[a] = 1;
    }
    this.version++;
  }

  /**
   * Crash, roadblock, closure or event that slows or closes roads around a point.
   * { x, z, radius = 45, kind: 'crash'|'roadblock'|'closure'|'event'|'drawbridge', factor?, ttl? (s), hard? (true = impassable), edgeId?, heading? }
   * returns the incident id
   */
  addIncident(o) {
    const G = this.G;
    const kind = o.kind || 'crash';
    const factor = o.factor ?? (kind === 'crash' ? 3.2 : kind === 'roadblock' ? 14 : kind === 'closure' ? 40 : kind === 'drawbridge' ? 6 : 2);
    const radius = o.radius ?? (kind === 'roadblock' ? 30 : 45);
    const arcs = [], factors = [];
    const hx = o.heading !== undefined ? Math.sin(o.heading) : 0, hz = o.heading !== undefined ? Math.cos(o.heading) : 0;
    const pt = {};
    edgesNear(G, o.x, o.z, radius, (k) => {
      if (o.y !== undefined && G.ptsY) { edgePointAt(G, k, G.eLen[k] / 2, pt); if (Math.abs(pt.y - o.y) > 5) return; } // not the deck above / the street below
      for (const a of [G.eArcF[k], G.eArcB[k]]) {
        if (a < 0) continue;
        if (o.heading !== undefined && kind === 'crash') { // a crash mostly blocks its own direction; the other side slows to look
          const dx = G.nx[G.aTo[a]] - G.nx[G.aFrom[a]], dz = G.nz[G.aTo[a]] - G.nz[G.aFrom[a]], l = Math.hypot(dx, dz) || 1;
          const same = (dx * hx + dz * hz) / l > 0;
          arcs.push(a); factors.push(same ? factor : 1 + (factor - 1) * 0.3);
        } else { arcs.push(a); factors.push(factor); }
      }
    });
    // the queue behind it: upstream arcs slow down too, fading with distance
    if (kind === 'crash' || kind === 'roadblock') {
      const seen = new Set(arcs), frontier = arcs.slice();
      let depth = 0;
      while (frontier.length && depth < 3) {
        const nextF = [];
        for (const a of frontier) for (let i = G.rStart[a]; i < G.rStart[a + 1]; i++) {
          const p = G.rFrom[i]; if (seen.has(p) || (G.tType[G.rT[i]] & 7) === 7) continue;
          seen.add(p); arcs.push(p); factors.push(1 + (factor - 1) * (kind === 'roadblock' ? 0.25 : 0.4) / (depth + 1)); nextF.push(p);
        }
        frontier.length = 0; frontier.push(...nextF); depth++;
      }
    }
    const id = o.id ?? `inc${++this._id}`;
    this.incidents.set(id, { id, kind, x: o.x, z: o.z, radius, factor, hard: !!o.hard, ttl: o.ttl ?? (kind === 'crash' ? 150 : kind === 'roadblock' ? 240 : Infinity), arcs: Int32Array.from(arcs), factors: Float32Array.from(factors) });
    this._compose();
    return id;
  }
  removeIncident(id) { if (this.incidents.delete(id)) { this._compose(); return true; } return false; }
  /** removes incidents within r of a point (e.g. the police track clears a roadblock without keeping its id) */
  removeIncidentsNear(x, z, r = 40, kind = null) { let n = 0; for (const inc of [...this.incidents.values()]) if ((!kind || inc.kind === kind) && Math.hypot(inc.x - x, inc.z - z) <= r) { this.incidents.delete(inc.id); n++; } if (n) this._compose(); return n; }
  /** advance incident timers (real seconds); returns true when something expired */
  tick(dt) {
    let changed = false;
    for (const inc of this.incidents.values()) { if (inc.ttl === Infinity) continue; inc.ttl -= dt; if (inc.ttl <= 0) { this.incidents.delete(inc.id); changed = true; } }
    if (changed) this._compose();
    return changed;
  }
  /** Measured speed from the traffic simulation: blends into the model so the GPS sees real jams. */
  reportSpeed(edgeIdx, dir, speed) {
    const G = this.G, a = dir >= 0 ? G.eArcF[edgeIdx] : G.eArcB[edgeIdx];
    if (a === undefined || a < 0) return;
    if (!this.probe) this.probe = new Float32Array(G.nA);
    const free = G.aLen[a] / G.aTime[a], f = Math.min(8, Math.max(1, free / Math.max(0.8, speed)));
    this.probe[a] = this.probe[a] ? this.probe[a] * 0.8 + f * 0.2 : f;
    this._dirty = true;
  }
  flushProbes() { if (this._dirty) { this._dirty = false; this._compose(); return true; } return false; }
  decayProbes(k = 0.9) { if (!this.probe) return; for (let a = 0; a < this.probe.length; a++) if (this.probe[a]) { this.probe[a] = 1 + (this.probe[a] - 1) * k; if (this.probe[a] < 1.03) this.probe[a] = 0; } this._dirty = true; }

  /** 0 free, 1 moderate, 2 heavy, 3 stopped: for coloring the route line */
  level(arc) { const m = this.mult[arc]; return this.block[arc] ? 3 : m < 1.25 ? 0 : m < 1.7 ? 1 : m < 2.6 ? 2 : 3; }
  snapshot() { return { mult: this.mult.slice(), block: this.block.slice(), version: this.version }; }
}
