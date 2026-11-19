// KEYS-SIGN track: where signs go and what they say, as a pure function of the road graph (no three.js, runs in Node).
// planSigns(graph, { placeAt }) -> { guides: [gantry], blades: [post] };  verifyGuides(graph, plan) -> { ok, bad: [...] }
// graph: { nodes: [{ id, x, z, edges: [edgeId] }], edges: [{ id, a, b, pts, cum, length, y, width, oneway, name, kind }] }
const MAJOR = new Set(['motorway', 'trunk', 'motorway_link', 'trunk_link']);
const isLink = (e) => /_link$/.test(e.kind);
// real designations of named Miami roads (public infrastructure), used when the graph name carries no number
const REAL = {
  'MacArthur Causeway': 'SR A1A',
  'Dolphin Expressway': 'SR 836',
  'Julia Tuttle Causeway': 'I 195',
  'Biscayne Boulevard': 'US 1',
  'Brickell Avenue': 'US 1',
  'Southwest 8th Street': 'US 41',
  'Southwest 7th Street': 'US 41',
  'Collins Avenue': 'SR A1A',
  'Alton Road': 'SR 907',
  'Port Miami Tunnel': 'SR 887',
  'Overseas Highway': 'US 1',
};
export function routesOf(name) {
  const out = [];
  if (!name) return out;
  for (const tok of String(REAL[name] ? name + ';' + REAL[name] : name).split(';')) {
    const m = tok.trim().match(/^(I|US|SR|CR)[ -]?([0-9A-Z]+)$/);
    if (m && !out.some((r) => r.type === m[1] && r.num === m[2]))
      out.push({ type: m[1], num: m[2] });
  }
  return out;
}
const ABBR = [
  [/\bNortheast\b/, 'NE'],
  [/\bNorthwest\b/, 'NW'],
  [/\bSoutheast\b/, 'SE'],
  [/\bSouthwest\b/, 'SW'],
  [/\bNorth\b/, 'N'],
  [/\bSouth\b/, 'S'],
  [/\bEast\b/, 'E'],
  [/\bWest\b/, 'W'],
  [/\bBoulevard\b/, 'Blvd'],
  [/\bAvenue\b/, 'Ave'],
  [/\bStreet\b/, 'St'],
  [/\bCauseway\b/, 'Cswy'],
  [/\bExpressway\b/, 'Expwy'],
  [/\bDrive\b/, 'Dr'],
  [/\bRoad\b/, 'Rd'],
  [/\bCourt\b/, 'Ct'],
  [/\bTerrace\b/, 'Ter'],
  [/\bPlace\b/, 'Pl'],
  [/\bHighway\b/, 'Hwy'],
  [/\bParkway\b/, 'Pkwy'],
  [/\bLane\b/, 'Ln'],
  [/\bTunnel\b/, 'Tunnel'],
];
export function shortName(name) {
  let s = String(name || '');
  if (/^(I|US|SR|CR) /.test(s)) return s.split(';')[0].replace(' ', '-');
  for (const [re, r] of ABBR) s = s.replace(re, r);
  return s;
}
// Miami-Dade blade style: quadrant prefix, bare number, short suffix ("NE 2 AV"); named streets keep their name
export function bladeLabel(name) {
  const m =
    String(name || '').match(
      /^(?:(Northeast|Northwest|Southeast|Southwest|North|South|East|West) )?(.+?)(?: (Street|Avenue|Boulevard|Road|Drive|Court|Terrace|Place|Lane|Way|Causeway|Circle|Trail|Plaza|Parkway|Alley))?$/,
    ) || [];
  const pre =
    {
      Northeast: 'NE',
      Northwest: 'NW',
      Southeast: 'SE',
      Southwest: 'SW',
      North: 'N',
      South: 'S',
      East: 'E',
      West: 'W',
    }[m[1]] || '';
  const suf =
    {
      Street: 'ST',
      Avenue: 'AV',
      Boulevard: 'BLVD',
      Road: 'RD',
      Drive: 'DR',
      Court: 'CT',
      Terrace: 'TER',
      Place: 'PL',
      Lane: 'LN',
      Way: 'WAY',
      Causeway: 'CSWY',
      Circle: 'CIR',
      Trail: 'TRL',
      Plaza: 'PLZ',
      Parkway: 'PKWY',
      Alley: 'ALY',
    }[m[3]] || '';
  let main = m[2] || name || '',
    num = null;
  const o = main.match(/^(\d+)(?:st|nd|rd|th)$/);
  if (o) {
    main = o[1];
    num = +o[1];
  }
  return { pre, main, suf, num };
}
function pointAt(e, s) {
  const c = e.cum,
    n = c.length;
  s = Math.max(0, Math.min(e.length, s));
  let i = 1;
  while (i < n - 1 && c[i] < s) i++;
  const L = c[i] - c[i - 1] || 1,
    u = (s - c[i - 1]) / L,
    a = e.pts[i - 1],
    b = e.pts[i],
    dx = b[0] - a[0],
    dz = b[1] - a[1],
    dl = Math.hypot(dx, dz) || 1;
  return {
    x: a[0] + dx * u,
    z: a[1] + dz * u,
    y: (e.y ? e.y[i - 1] + (e.y[i] - e.y[i - 1]) * u : 0) || 0,
    dx: dx / dl,
    dz: dz / dl,
  };
}
const outsOf = (G, n, from) =>
  G.nodes[n].edges
    .map((k) => G.edges[k])
    .filter((e) => e !== from && (e.a === n || (!e.oneway && e.b === n)));
const farEnd = (e, n) => (e.a === n ? e.b : e.a);
const dirFrom = (e, n, d = 30) => {
  const fwd = e.a === n,
    p0 = pointAt(e, fwd ? 0 : e.length),
    p1 = pointAt(e, fwd ? Math.min(d, e.length) : Math.max(0, e.length - d)),
    l = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
  return [(p1.x - p0.x) / l, (p1.z - p0.z) / l];
};

// follow a branch downstream: returns the first named non-link road it delivers you to, and where you are after maxLen
function follow(G, first, node, maxLen = 2600) {
  let e = first,
    n = node,
    len = 0,
    road = null,
    guard = 0;
  const via = [first.id];
  for (;;) {
    if (!road && !isLink(e) && e.name) road = e;
    len += e.length;
    n = farEnd(e, n);
    if (len > maxLen || ++guard > 80) break;
    const outs = outsOf(G, n, e);
    if (!outs.length) break;
    const score = (o) =>
      (o.name && o.name === e.name ? 8 : 0) +
      (isLink(e) && !isLink(o) ? 3 : 0) +
      (o.kind === e.kind ? 2 : 0) +
      (MAJOR.has(o.kind) ? 1 : 0) +
      (road && !isLink(road) && isLink(o) ? -6 : 0);
    outs.sort((p, q) => score(q) - score(p));
    e = outs[0];
    via.push(e.id);
  }
  const end = G.nodes[n];
  return { road: road || e, last: e, end: { x: end.x, z: end.z }, len, via };
}
const cardinal = (dx, dz, ew) => (ew ? (dx > 0 ? 'EAST' : 'WEST') : dz < 0 ? 'NORTH' : 'SOUTH');
const EW = /^(I[ -]395|I[ -]195|SR[ -]836|Dolphin|MacArthur|SR[ -]887|Port Miami|Julia|US[ -]41)/;

export function planSigns(G, opts = {}) {
  const { placeAt = () => null } = opts;
  const guides = [],
    seq = {};
  const cand = [];
  for (const node of G.nodes) {
    const es = node.edges.map((k) => G.edges[k]);
    const ins = es.filter(
      (e) => MAJOR.has(e.kind) && e.oneway && e.b === node.id && e.a !== node.id,
    );
    if (ins.length !== 1) continue;
    const inc = ins[0],
      outs = outsOf(G, node.id, inc).filter((e) => MAJOR.has(e.kind) && e.oneway);
    if (outs.length < 2 || inc.length < 25) continue;
    cand.push({ node, inc, outs });
  }
  // exit numbers run along each route (west to east, south to north), like mile-based numbering
  const routeKey = (c) =>
    (c.inc.name || c.outs.find((o) => !isLink(o))?.name || 'ramp').split(';')[0];
  cand.sort((p, q) =>
    routeKey(p) < routeKey(q)
      ? -1
      : routeKey(p) > routeKey(q)
        ? 1
        : EW.test(routeKey(p))
          ? p.node.x - q.node.x
          : q.node.z - p.node.z,
  );
  for (const c of cand) {
    const { node, inc, outs } = c,
      key = routeKey(c),
      back = Math.min(95, inc.length * 0.8),
      at = pointAt(inc, inc.length - back);
    const inDir = [at.dx, at.dz];
    const br = outs.map((o) => {
      const d = dirFrom(o, node.id, 45),
        f = follow(G, o, node.id);
      return {
        e: o,
        d,
        side: inDir[0] * d[1] - inDir[1] * d[0],
        f,
        through: !isLink(o) && (o.name === inc.name || !isLink(inc)),
      };
    });
    br.sort((p, q) => p.side - q.side); // left to right as the driver sees them
    if (!br.some((b) => b.through))
      br.reduce((p, q) => (Math.abs(q.side) < Math.abs(p.side) ? q : p)).through = true;
    const nThrough = br.filter((b) => b.through).length;
    const panels = br.map((b, i) => {
      const road = b.f.road,
        routes = routesOf(road.name),
        place = placeAt(b.f.end.x, b.f.end.z),
        lines = [];
      const sn = shortName(road.name);
      if (sn && !(routes.length && /^(I|US|SR)-/.test(sn))) lines.push(sn);
      if (place && place !== sn && lines.length < 2 && !/water|bay/i.test(place)) lines.push(place);
      if (!lines.length) lines.push(place || sn || 'Ramp');
      const through = b.through && nThrough === 1;
      const p = {
        routes,
        lines,
        cardinal:
          routes.length && !isLink(road)
            ? cardinal(b.d[0], b.d[1], EW.test(road.name || ''))
            : null,
        arrow: through ? 'down' : b.side < 0 ? 'upleft' : 'upright',
        exitOnly: !b.through && i !== br.length >> 1 && outs.length > 2,
        target: road.id,
        first: b.e.id,
        exit: null,
      };
      if (!b.through) {
        seq[key] = (seq[key] || 0) + 1;
        p.exit = String(seq[key]);
        p.exitSide = b.side < 0 ? 'left' : 'right';
      }
      return p;
    });
    guides.push({
      id: 'g' + node.id,
      node: node.id,
      edge: inc.id,
      x: at.x,
      y: at.y,
      z: at.z,
      dx: at.dx,
      dz: at.dz,
      width: inc.width,
      kind: inc.kind,
      route: key,
      panels,
      type: inc.kind === 'motorway' ? 'truss' : 'monotube',
    });
  }
  // street-name blades: one post per junction of two differently named surface streets
  const blades = [];
  for (const node of G.nodes) {
    if (node.edges.length < 3) continue;
    if (opts.armBlades && (node.signal || node.control === 'signal')) continue; // signalized: the blades hang on the mast arms (src/world/miami/signals.js)
    const named = [];
    for (const k of node.edges) {
      const e = G.edges[k];
      if (
        !e.name ||
        MAJOR.has(e.kind) ||
        e.kind === 'service' ||
        e.elevated ||
        (e.y && (e.y[0] > 0.3 || e.y[e.y.length - 1] > 0.3)) ||
        named.some((m) => m.e.name === e.name)
      )
        continue;
      named.push({ e, d: dirFrom(e, node.id, 20) });
    }
    if (named.length < 2) continue;
    const [A, B] = named;
    let cx = A.d[0] + B.d[0],
      cz = A.d[1] + B.d[1];
    const cl = Math.hypot(cx, cz);
    if (cl < 0.3) continue;
    cx /= cl;
    cz /= cl;
    const w = Math.max(A.e.width, B.e.width),
      r = (w / 2 + 2.2) * 1.25;
    const la = bladeLabel(A.e.name),
      lb = bladeLabel(B.e.name);
    blades.push({
      node: node.id,
      x: node.x - cx * r,
      z: node.z - cz * r,
      signs: [
        {
          name: A.e.name,
          label: la,
          block: lb.num != null ? lb.num * 100 : null,
          dx: A.d[0],
          dz: A.d[1],
        },
        {
          name: B.e.name,
          label: lb,
          block: la.num != null ? la.num * 100 : null,
          dx: B.d[0],
          dz: B.d[1],
        },
      ],
    });
  }
  return { guides, blades };
}

// Independent check: from each gantry, a legal (one-way respecting) drive that starts down the signed branch reaches the
// road the panel names. Returns { total, ok, bad: [{ gantry, panel, why }] }.
export function verifyGuides(G, plan, maxLen = 9000) {
  const bad = [];
  let total = 0;
  for (const g of plan.guides)
    for (const p of g.panels) {
      total++;
      const first = G.edges[p.first];
      if (!first || first.a !== g.node) {
        bad.push({
          gantry: g.id,
          panel: p.lines.join(' / '),
          why: 'branch does not leave the signed junction',
        });
        continue;
      }
      const seen = new Set([first.id]),
        queue = [[first, first.b, first.length]];
      let hit = first.id === p.target;
      while (queue.length && !hit) {
        const [e, n, len] = queue.shift();
        for (const o of outsOf(G, n, e)) {
          if (seen.has(o.id) || len + o.length > maxLen) continue;
          seen.add(o.id);
          if (o.id === p.target) {
            hit = true;
            break;
          }
          queue.push([o, farEnd(o, n), len + o.length]);
        }
      }
      if (!hit)
        bad.push({
          gantry: g.id,
          panel: p.lines.join(' / '),
          why: 'named road not reachable down this branch',
        });
    }
  return { total, ok: total - bad.length, bad };
}
