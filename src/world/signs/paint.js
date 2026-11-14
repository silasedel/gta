// KEYS-SIGN track: a small sign-painter's toolkit on canvas 2D. It paints a color layer and, with the same strokes,
// the carving: three relief masks (art, back, letters) plus a fine detail layer (grooves and ridges). finish() turns
// those into albedo + normal + roughness/metalness maps with real weathering (sun fade, chips, salt, grime).
// Everything is in "design units"; the contexts are pre-scaled, so the same painting renders at 1K or 4K.
import { rng, clamp, lerp, smooth, fbm, vnoise, hexRgb, rgba, jitter, makeCanvas, distanceInside, boxBlur, normalsFromHeight, traceOutline } from './util.js';

export function createPainter({ width, designW, designH, seed = 1 }) {
  const S = width / designW, W = Math.round(width), H = Math.round(designH * S);
  const mk = (fill) => { const c = makeCanvas(W, H), x = c.getContext('2d', { willReadFrequently: true }); if (fill) { x.fillStyle = fill; x.fillRect(0, 0, W, H); } x.scale(S, S); x.lineJoin = 'round'; x.lineCap = 'round'; return x; };
  const P = {
    S, W, H, designW, designH, R: rng(seed), seed,
    c: mk(null),          // color (transparent outside the sign)
    d: mk('#808080'),     // detail height: 128 neutral, darker = groove, lighter = ridge
    art: mk('#000'),      // raised pictorial relief (gray level = height), domed edges
    back: mk('#000'),     // lower relief: border, ribbon, background foliage
    let: mk('#000'),      // letters: R = height level, G = ridge half-width code (design units * 4)
    mat: mk('#000'),      // R = gold leaf, G = bare/unpainted (wood, metal), B = gloss enamel
    sil: mk(null),        // silhouette alpha (what the board is cut to)
  };
  P.all = [P.c, P.d, P.art, P.back, P.let, P.mat, P.sil];
  P.save = () => P.all.forEach((x) => x.save());
  P.restore = () => P.all.forEach((x) => x.restore());
  P.translate = (x, y) => P.all.forEach((c) => c.translate(x, y));
  P.rotate = (a) => P.all.forEach((c) => c.rotate(a));
  P.scale = (sx, sy = sx) => P.all.forEach((c) => c.scale(sx, sy));
  P.clipAll = (path) => P.all.forEach((c) => c.clip(path));
  const scratch = makeCanvas(4, 4).getContext('2d');
  P.inside = (path, x, y) => scratch.isPointInPath(path, x, y);
  const gray = (v) => { const g = Math.round(clamp(v) * 255); return `rgb(${g},${g},${g})`; };

  // ---- relief
  // raise a pictorial shape: cls 'art' | 'back'; margin = dark cut edge kept around it (also part of the silhouette)
  P.raise = (path, { level = 0.8, cls = 'art', margin = 0, edge = '#0c2533', sil = true, flatDetail = true } = {}) => {
    const x = P[cls]; x.fillStyle = gray(level); x.fill(path);
    if (margin) { x.strokeStyle = gray(level * 0.82); x.lineWidth = margin * 2; x.stroke(path); x.fill(path); }
    if (flatDetail) { P.d.fillStyle = '#808080'; P.d.fill(path); if (margin) { P.d.strokeStyle = '#808080'; P.d.lineWidth = margin * 2; P.d.stroke(path); } }
    if (margin) { P.c.strokeStyle = edge; P.c.lineWidth = margin * 2; P.c.stroke(path); P.c.fillStyle = edge; P.c.fill(path); }
    if (sil) { P.sil.fillStyle = '#fff'; P.sil.fill(path); if (margin) { P.sil.strokeStyle = '#fff'; P.sil.lineWidth = margin * 2; P.sil.stroke(path); } }
  };
  // letters: ridge = half width (design units) over which the face climbs to its crest (prismatic carving)
  P.raiseLetters = (path, { level = 0.9, ridge = 10 } = {}) => {
    P.let.fillStyle = `rgb(${Math.round(level * 255)},${Math.round(clamp(ridge * 4, 1, 255))},0)`; P.let.fill(path, 'nonzero');
    P.d.fillStyle = '#808080'; P.d.fill(path, 'nonzero');
  };
  P.material = (path, kind, a = 1) => { P.mat.fillStyle = kind === 'gold' ? `rgba(255,0,0,${a})` : kind === 'bare' ? `rgba(0,255,0,${a})` : kind === 'gloss' ? `rgba(0,0,255,${a})` : `rgba(0,0,0,${a})`; P.mat.fill(path, 'nonzero'); };
  // groove / ridge line in the carving (v < 0 carves, v > 0 raises), w in design units
  P.carve = (path, w, v = -0.5) => { P.d.strokeStyle = v < 0 ? `rgba(0,0,0,${-v})` : `rgba(255,255,255,${v})`; P.d.lineWidth = w; P.d.stroke(path); };
  P.carveFill = (path, v = -0.3) => { P.d.fillStyle = v < 0 ? `rgba(0,0,0,${-v})` : `rgba(255,255,255,${v})`; P.d.fill(path); };

  // ---- color
  P.fill = (path, color, rule = 'nonzero') => { P.c.fillStyle = color; P.c.fill(path, rule); };
  P.stroke = (path, color, w, alpha = 1) => { P.c.save(); P.c.globalAlpha = alpha; P.c.strokeStyle = color; P.c.lineWidth = w; P.c.stroke(path); P.c.restore(); };
  P.grad = (x0, y0, x1, y1, stops) => { const g = P.c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  P.rgrad = (x, y, r0, r1, stops) => { const g = P.c.createRadialGradient(x, y, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  // run fn with the color context clipped to path
  P.within = (path, fn, rule = 'nonzero') => { P.c.save(); P.c.clip(path, rule); fn(P.c); P.c.restore(); };
  // airbrush-soft elliptical blob (use inside P.within)
  P.blob = (x, y, rx, ry, color, alpha = 0.5, rot = 0, comp = 'source-over') => {
    const c = P.c; c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, ry / rx); c.globalCompositeOperation = comp;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.55, rgba(color, alpha * 0.55)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(-rx, -rx, rx * 2, rx * 2); c.restore();
  };
  // visible brush strokes inside a shape. dir: angle (rad) or (x, y) => angle. box: [x0, y0, x1, y1] to scatter in.
  P.bristles = (path, { box, n = 200, len = [20, 60], w = [3, 7], colors, alpha = [0.08, 0.22], dir = 0, curl = 0.25, jit = 0.18, ridge = 0.05, rule = 'nonzero' }) => {
    const c = P.c, d = P.d, R = P.R;
    c.save(); d.save(); if (path) { c.clip(path, rule); d.clip(path, rule); }
    for (let i = 0; i < n; i++) {
      const x = R.range(box[0], box[2]), y = R.range(box[1], box[3]);
      const a = (typeof dir === 'function' ? dir(x, y) : dir) + R.gauss() * jit, L = R.range(len[0], len[1]), ww = R.range(w[0], w[1]);
      const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L, k = R.gauss() * curl * L;
      const mx = (x + ex) / 2 - Math.sin(a) * k, my = (y + ey) / 2 + Math.cos(a) * k;
      const col = jitter(R.pick(colors), R, 3, 0.04, 0.035), al = R.range(alpha[0], alpha[1]);
      c.lineCap = 'round'; c.strokeStyle = rgba(col, al); c.lineWidth = ww;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx, my, ex, ey); c.stroke();
      // bristle striations: a few hairs riding the stroke
      const hairs = 2 + (ww > 4 ? 2 : 0);
      for (let hI = 0; hI < hairs; hI++) {
        const o = (R() - 0.5) * ww * 0.8, ox = -Math.sin(a) * o, oy = Math.cos(a) * o, light = R() < 0.5;
        c.strokeStyle = light ? `rgba(255,255,255,${al * 0.45})` : `rgba(0,0,0,${al * 0.4})`; c.lineWidth = Math.max(0.35, ww * 0.1);
        c.beginPath(); c.moveTo(x + ox, y + oy); c.quadraticCurveTo(mx + ox, my + oy, ex + ox * 0.6, ey + oy * 0.6); c.stroke();
      }
      if (ridge) { d.lineCap = 'round'; d.strokeStyle = `rgba(255,255,255,${ridge})`; d.lineWidth = ww * 0.45; d.beginPath(); d.moveTo(x, y); d.quadraticCurveTo(mx, my, ex, ey); d.stroke(); d.strokeStyle = `rgba(0,0,0,${ridge * 0.8})`; d.lineWidth = Math.max(0.4, ww * 0.12); const o = ww * 0.42; d.beginPath(); d.moveTo(x - Math.sin(a) * o, y + Math.cos(a) * o); d.quadraticCurveTo(mx - Math.sin(a) * o, my + Math.cos(a) * o, ex, ey); d.stroke(); }
    }
    c.restore(); d.restore();
  };
  // sample a Catmull-Rom spline through pts -> dense points
  P.spline = (pts, seg = 14) => {
    const out = [], n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let j = 0; j < seg; j++) { const t = j / seg, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                  0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
    }
    out.push(pts[n - 1]); return out;
  };
  // liner-brush stroke through pts: width goes w0 -> w1, optional taper at both ends; returns the Path2D it filled
  P.linerPath = (pts, w0, w1 = w0, { taper = 0.25, seg = 12 } = {}) => {
    const sp = pts.length > 2 ? P.spline(pts, seg) : pts, n = sp.length, L = [], Rr = [];
    for (let i = 0; i < n; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, t = i / (n - 1);
      let w = lerp(w0, w1, t) / 2; if (taper) w *= Math.min(1, smooth(0, taper, t) * 0.85 + 0.15, smooth(0, taper, 1 - t) * 0.85 + 0.15);
      L.push([sp[i][0] - dy / l * w, sp[i][1] + dx / l * w]); Rr.push([sp[i][0] + dy / l * w, sp[i][1] - dx / l * w]);
    }
    const p = new Path2D(); p.moveTo(L[0][0], L[0][1]); for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]); for (let i = n - 1; i >= 0; i--) p.lineTo(Rr[i][0], Rr[i][1]); p.closePath(); return p;
  };
  P.liner = (pts, w0, w1, color, { alpha = 1, taper = 0.25, groove = 0, seg = 12 } = {}) => {
    const p = P.linerPath(pts, w0, w1, { taper, seg });
    P.c.save(); P.c.globalAlpha = alpha; P.c.fillStyle = color; P.c.fill(p); P.c.restore();
    if (groove) P.carveFill(p, groove);
    return p;
  };
  P.poly = (pts, close = true) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); if (close) p.closePath(); return p; };
  P.smoothPath = (pts, close = false, seg = 10) => P.poly(P.spline(close ? [...pts, pts[0]] : pts, seg), close);
  P.ellipse = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; };

  // ---------------------------------------------------------------- finish: weathering + maps
  // opts: { relief (mm-ish scale of the normal map), fade, chips, grime, salt, grainColor, woodColor, primerColor,
  //         bevelArt, bevelBack (design units), lightDir [x, y] for the painted facet shading, bake (0..1), planks (design units | 0) }
  P.finish = (opts = {}) => {
    const o = { relief: 2.2, fade: 0.5, chips: 0.5, grime: 0.5, salt: 0.5, bevelArt: 11, bevelBack: 5, bake: 0.5, lightDir: [-0.55, -0.83], woodColor: '#8d8273', primerColor: '#d8d2c2', planks: 0, silGrow: 0, ...opts };
    const N = W * H, R = P.R;
    const chan = (x, ch) => { const d = x.getImageData(0, 0, W, H).data, f = new Float32Array(N); for (let i = 0, j = ch; i < N; i++, j += 4) f[i] = d[j] / 255; return f; };
    // silhouette: union of everything painted opaque
    const cd = P.c.getImageData(0, 0, W, H), C = cd.data;
    const silA = chan(P.sil, 3), mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = silA[i] > 0.5 ? 1 : 0;
    const edgeD = distanceInside(mask, W, H, true);
    // relief layers
    const dome = (x, bevelPx, soft) => {
      const lvl = chan(x, 0), m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = lvl[i] > 0.02 ? 1 : 0;
      const dist = distanceInside(m, W, H, true), lv = boxBlur(lvl, W, H, Math.max(1, soft * S), 2), out = new Float32Array(N);
      for (let i = 0; i < N; i++) if (m[i]) { const t = Math.min(1, dist[i] / bevelPx), prof = Math.sin(t * Math.PI / 2); out[i] = lv[i] * (0.25 + 0.75 * prof) + 0.045 * lv[i] * Math.min(1, dist[i] / (bevelPx * 4)); }
      return { h: out, m };
    };
    const A = dome(P.art, o.bevelArt * S, 1.2), B = dome(P.back, o.bevelBack * S, 0.8);
    const letD = P.let.getImageData(0, 0, W, H).data, lm = new Uint8Array(N), lLvl = new Float32Array(N), lRidge = new Float32Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) { lLvl[i] = letD[j] / 255; lRidge[i] = letD[j + 1] / 4 * S; lm[i] = letD[j] > 6 ? 1 : 0; }
    const lDist = distanceInside(lm, W, H, true);
    const det = chan(P.d, 0), matD = P.mat.getImageData(0, 0, W, H).data;
    const hf = new Float32Array(N), BG = 0.3;
    for (let i = 0; i < N; i++) {
      let h = BG;
      if (B.m[i]) h = Math.max(h, BG + B.h[i] * 0.5);
      if (A.m[i]) h = Math.max(h, BG + A.h[i] * 0.62);
      if (lm[i]) { const t = Math.min(1, lDist[i] / Math.max(1.5, lRidge[i])); h = Math.max(h, h * 0.0 + BG + lLvl[i] * (0.36 + 0.3 * t)) ; }
      hf[i] = h + (det[i] - 0.502) * 0.22;
    }
    // weathering fields + color pass
    const wood = hexRgb(o.woodColor), prim = hexRgb(o.primerColor), sd = P.seed;
    const lx = o.lightDir[0], ly = o.lightDir[1];
    const orm = new Uint8ClampedArray(N * 4);
    const hBlur = boxBlur(hf, W, H, 7 * S, 2);
    const inv = 1 / S; // design units per pixel
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, j = i * 4;
      if (!mask[i]) { C[j + 3] = 0; orm[j] = 255; orm[j + 1] = 230; orm[j + 2] = 0; orm[j + 3] = 255; continue; }
      const ux = x * inv, uy = y * inv, e = edgeD[i] * inv; // design units
      let r = C[j], g = C[j + 1], b = C[j + 2];
      const a = C[j + 3] / 255; if (a < 1) { r = lerp(wood[0], r, a); g = lerp(wood[1], g, a); b = lerp(wood[2], b, a); }
      const gold = matD[j] / 255, bare = matD[j + 1] / 255, gloss = matD[j + 2] / 255;
      // baked carving light: cavity darkening + painted facet shading from the height slope
      const hx = (hf[i + (x < W - 1 ? 1 : 0)] - hf[i - (x > 0 ? 1 : 0)]) * S, hy = (hf[i + (y < H - 1 ? W : 0)] - hf[i - (y > 0 ? W : 0)]) * S;
      const facet = clamp(-(hx * lx + hy * ly) * 9, -1, 1);
      const cav = clamp((hBlur[i] - hf[i]) * 3.2, -0.5, 1);
      let sh = 1 + o.bake * (facet * (gold > 0.5 ? 0.3 : 0.14) - Math.max(0, cav) * 0.5 + Math.max(0, -cav) * 0.12);
      // brush-wide streaks in the paint film
      const br = fbm(ux * 0.9, uy * 0.07, 3, sd + 5) - 0.5;
      sh *= 1 + br * 0.07;
      r *= sh; g *= sh; b *= sh;
      // sun fade: strongest high on the board, reds go first
      const fn = fbm(ux * 0.006, uy * 0.008, 3, sd + 11);
      let fd = o.fade * (0.1 + 0.34 * fn + 0.2 * (1 - uy / designH)) * (1 - gold * 0.75);
      const lum = 0.3 * r + 0.59 * g + 0.11 * b, redness = clamp((r - Math.max(g, b)) / 110);
      fd *= 1 + redness * 0.9;
      r = lerp(r, lum * 0.55 + 112, fd); g = lerp(g, lum * 0.55 + 108, fd); b = lerp(b, lum * 0.55 + 98, fd);
      // grime: rain streaks from the top edge and ledges, mildew low on the board
      const st = fbm(ux * 0.11, uy * 0.006, 3, sd + 21), st2 = vnoise(ux * 0.035, uy * 0.004, sd + 23);
      let gr = o.grime * (Math.max(0, st - 0.52) * 1.5 * (0.45 + 0.55 * st2) + 0.3 * smooth(designH * 0.72, designH, uy) * fbm(ux * 0.02, uy * 0.03, 3, sd + 31));
      gr += o.grime * 0.26 * Math.exp(-e / 14) * fbm(ux * 0.03, uy * 0.03, 2, sd + 33);
      gr = clamp(gr, 0, 0.6);
      r = lerp(r, 58, gr); g = lerp(g, 62, gr); b = lerp(b, 50, gr);
      // salt bloom: pale haze in patches
      const sa = o.salt * Math.max(0, fbm(ux * 0.012, uy * 0.016, 4, sd + 41) - 0.56) * 1.6;
      r = lerp(r, 232, sa * 0.5); g = lerp(g, 232, sa * 0.5); b = lerp(b, 226, sa * 0.5);
      // chips: paint flaked to primer and wood, most near edges and seams
      let rough = lerp(0.52, 0.78, clamp(fd * 2.2 + gr + sa)), metal = 0;
      if (gold > 0.4) { rough = 0.32 + 0.2 * fbm(ux * 0.4, uy * 0.4, 2, sd + 51); metal = 0.92; }
      if (gloss > 0.4) rough = Math.min(rough, 0.34 + fd);
      const cn = fbm(ux * 0.05, uy * 0.05, 5, sd + 61), cn2 = fbm(ux * 0.3, uy * 0.3, 2, sd + 63);
      let seam = 0; if (o.planks) { const py = (uy % o.planks) / o.planks; seam = Math.exp(-Math.min(py, 1 - py) * o.planks / 2.2); }
      const edgeBoost = 0.2 * Math.exp(-e / 9) + 0.1 * Math.exp(-e / 34) + 0.1 * seam * vnoise(ux * 0.02, uy * 0.3, sd + 65) + 0.07 * smooth(designH * 0.6, designH, uy);
      const chipV = cn * 0.78 + cn2 * 0.22 + edgeBoost - (1 - o.chips * 0.24);
      if (bare > 0.5) { rough = 0.9; metal = 0; }
      else if (chipV > 0) {
        const deep = smooth(0.0, 0.035, chipV);
        const wg = 0.82 + 0.3 * fbm(ux * 0.02, uy * 1.1, 3, sd + 71);
        const cr = lerp(prim[0], wood[0] * wg, deep), cg = lerp(prim[1], wood[1] * wg, deep), cb = lerp(prim[2], wood[2] * wg, deep);
        const k = smooth(0, 0.006, chipV);
        r = lerp(r, cr, k); g = lerp(g, cg, k); b = lerp(b, cb, k);
        hf[i] -= 0.018 * k + 0.014 * deep; rough = lerp(rough, 0.92, k); metal *= 1 - k;
      } else if (chipV > -0.012) { const k = 1 - chipV / -0.012; r *= 1 - 0.22 * k; g *= 1 - 0.22 * k; b *= 1 - 0.22 * k; hf[i] += 0.006 * k; } // lifted, shadowed lip of the flake
      // fine grain so nothing is flat
      const fg = (vnoise(ux * 2.3, uy * 2.3, sd + 81) - 0.5) * 9;
      C[j] = r + fg; C[j + 1] = g + fg; C[j + 2] = b + fg; C[j + 3] = 255;
      orm[j] = 255 - clamp(Math.max(0, cav) * 150 + gr * 60, 0, 150); orm[j + 1] = clamp(rough) * 255; orm[j + 2] = metal * 255; orm[j + 3] = 255;
    }
    // bleed color a few pixels past the cut edge so mip-maps do not pull in black
    const out = makeCanvas(W, H), ox = out.getContext('2d'); ox.putImageData(cd, 0, 0);
    const bleed = makeCanvas(W, H), bx = bleed.getContext('2d');
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2], [-6, 0], [6, 0], [0, -6], [0, 6]]) bx.drawImage(out, dx, dy);
    bx.drawImage(out, 0, 0);
    // normal map
    const nC = makeCanvas(W, H), nx = nC.getContext('2d'), nd = nx.createImageData(W, H);
    normalsFromHeight(hf, W, H, o.relief * S * 2.4, nd.data, false); nx.putImageData(nd, 0, 0);
    const oC = makeCanvas(W, H), oxx = oC.getContext('2d'); oxx.putImageData(new ImageData(orm, W, H), 0, 0);
    // silhouette polygon in 0..1 UV (v down), grown slightly
    const outline = traceOutline(mask, W, H, Math.max(2, Math.round(W / 700))).map(([px, py]) => [px / W, py / H]);
    return { color: bleed, colorCut: out, normal: nC, orm: oC, outline, width: W, height: H, mask };
  };
  return P;
}
