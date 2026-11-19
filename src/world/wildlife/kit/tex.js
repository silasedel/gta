// Wildlife kit: procedural skin painting (albedo + height -> normal + roughness, painted together).
// Pure 2D-canvas code with no DOM or three.js dependency, so `paint()` functions can run on the main thread or in a
// worker (OffscreenCanvas). Coordinates are 0..1 across the canvas, x right, y DOWN.
//
// Layout convention for lofted bodies (see loft.js): x = along the body (nose at the left edge of the region, tail tip
// at the right), y = around the body, dorsal midline at the TOP of the region and ventral midline at the BOTTOM. Both
// flanks share the same pixels (mirrored), so you paint the animal as a flattened side view.

export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function makeCanvas(w, h = w) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

// ---- colors ---------------------------------------------------------------------------------------------------
export function rgb(c) {
  // '#rgb' | '#rrggbb' | [r,g,b] 0..255 -> [r,g,b]
  if (Array.isArray(c)) return c;
  let s = c.replace('#', '');
  if (s.length === 3)
    s = s
      .split('')
      .map((x) => x + x)
      .join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function css(c, a = 1) {
  const [r, g, b] = rgb(c);
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
export function mix(c1, c2, t) {
  const a = rgb(c1),
    b = rgb(c2);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
export function shade(c, k) {
  const a = rgb(c);
  return [clamp(a[0] * k, 0, 255), clamp(a[1] * k, 0, 255), clamp(a[2] * k, 0, 255)];
}
export function ramp(stops, t) {
  // stops: [[t, color], ...] ascending
  if (t <= stops[0][0]) return rgb(stops[0][1]);
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i][0])
      return mix(
        stops[i - 1][1],
        stops[i][1],
        (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1),
      );
  return rgb(stops[stops.length - 1][1]);
}
const gray = (v, a = 1) => {
  const g = (clamp(v) * 255) | 0;
  return `rgba(${g},${g},${g},${a})`;
};

// ---- noise ----------------------------------------------------------------------------------------------------
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, seed = 0, period = 0) {
  // value noise; `period` > 0 makes it tile
  const xi = Math.floor(x),
    yi = Math.floor(y),
    xf = x - xi,
    yf = y - yi,
    u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const w = (n) => (period ? ((n % period) + period) % period : n);
  const a = hash2(w(xi), w(yi), seed),
    b = hash2(w(xi + 1), w(yi), seed),
    c = hash2(w(xi), w(yi + 1), seed),
    d = hash2(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4, seed = 0, period = 0) {
  let s = 0,
    a = 0.5,
    n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y, seed + i * 17, period);
    n += a;
    x *= 2;
    y *= 2;
    a *= 0.5;
    if (period) period *= 2;
  }
  return s / n;
}
const _noiseTiles = new Map();
export function noiseTile(size = 256, cells = 8, oct = 4, seed = 0) {
  // tileable grayscale fbm canvas (cached)
  const k = `${size}|${cells}|${oct}|${seed}`;
  let c = _noiseTiles.get(k);
  if (c) return c;
  c = makeCanvas(size);
  const ctx = c.getContext('2d'),
    im = ctx.createImageData(size, size),
    d = im.data;
  for (let y = 0, i = 0; y < size; y++)
    for (let x = 0; x < size; x++, i += 4) {
      const v = fbm((x / size) * cells, (y / size) * cells, oct, seed, cells) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  ctx.putImageData(im, 0, 0);
  _noiseTiles.set(k, c);
  return c;
}

// height canvas (grayscale, 0.5 = flat) -> tangent-space normal map canvas
export function normalFromHeight(hc, strength = 2, wrap = false) {
  const w = hc.width,
    h = hc.height,
    src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h),
    octx = out.getContext('2d'),
    im = octx.createImageData(w, h),
    d = im.data;
  const H = (x, y) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + h) % h;
    } else {
      x = x < 0 ? 0 : x >= w ? w - 1 : x;
      y = y < 0 ? 0 : y >= h ? h - 1 : y;
    }
    return src[(y * w + x) * 4];
  };
  const k = (strength / 255) * (w / 256);
  for (let y = 0, i = 0; y < h; y++)
    for (let x = 0; x < w; x++, i += 4) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * k,
        dy = (H(x, y + 1) - H(x, y - 1)) * k,
        l = 1 / Math.hypot(dx, dy, 1);
      d[i] = (-dx * l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy * l * 0.5 + 0.5) * 255;
      d[i + 2] = (l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  octx.putImageData(im, 0, 0);
  return out;
}

// ---- Skin: three aligned canvases painted together --------------------------------------------------------------
// a = albedo (alpha channel is kept: transparent pixels are cut out by alphaTest), h = height, r = roughness.
// Region arguments are [x0, y0, x1, y1] in 0..1 canvas coordinates. Colors are '#hex' or [r,g,b].
export class Skin {
  constructor(
    size = 512,
    { base = '#808080', rough = 0.8, height = 0.5, seed = 1, transparent = false } = {},
  ) {
    this.size = size;
    this.seed = seed;
    this.rand = rng(seed);
    this.ca = makeCanvas(size);
    this.ch = makeCanvas(size);
    this.cr = makeCanvas(size);
    this.a = this.ca.getContext('2d');
    this.h = this.ch.getContext('2d');
    this.r = this.cr.getContext('2d');
    if (!transparent) {
      this.a.fillStyle = css(base);
      this.a.fillRect(0, 0, size, size);
    }
    this.h.fillStyle = gray(height);
    this.h.fillRect(0, 0, size, size);
    this.r.fillStyle = gray(rough);
    this.r.fillRect(0, 0, size, size);
  }
  _R(reg = [0, 0, 1, 1]) {
    const s = this.size;
    return [reg[0] * s, reg[1] * s, (reg[2] - reg[0]) * s, (reg[3] - reg[1]) * s];
  }
  // run `fn(ctx, which)` clipped to a region on the chosen canvases ('a', 'h', 'r')
  on(which, reg, fn) {
    for (const k of which) {
      const ctx = this[k],
        [x, y, w, h] = this._R(reg);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      fn(ctx, k, x, y, w, h);
      ctx.restore();
    }
    return this;
  }
  fill(reg, color, { rough, height, alpha = 1 } = {}) {
    this.on('a', reg, (c, k, x, y, w, h) => {
      c.fillStyle = css(color, alpha);
      c.fillRect(x, y, w, h);
    });
    if (rough !== undefined)
      this.on('r', reg, (c, k, x, y, w, h) => {
        c.fillStyle = gray(rough);
        c.fillRect(x, y, w, h);
      });
    if (height !== undefined)
      this.on('h', reg, (c, k, x, y, w, h) => {
        c.fillStyle = gray(height);
        c.fillRect(x, y, w, h);
      });
    return this;
  }
  clear(reg) {
    const [x, y, w, h] = this._R(reg);
    this.a.clearRect(x, y, w, h);
    return this;
  } // make a region transparent (cut-outs)
  // linear gradient; dir 'v' (top->bottom: dorsal->ventral) or 'h' (left->right: nose->tail). stops [[t, color, alpha?], ...]
  gradient(reg, dir, stops, { target = 'a', alpha = 1, blend = 'source-over' } = {}) {
    return this.on(target, reg, (c, k, x, y, w, h) => {
      const g =
        dir === 'v'
          ? c.createLinearGradient(0, y, 0, y + h)
          : c.createLinearGradient(x, 0, x + w, 0);
      for (const s of stops)
        g.addColorStop(
          clamp(s[0]),
          k === 'a'
            ? css(s[1], (s[2] ?? 1) * alpha)
            : gray(typeof s[1] === 'number' ? s[1] : 0.5, (s[2] ?? 1) * alpha),
        );
      c.globalCompositeOperation = blend;
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
    });
  }
  // fbm mottling. On albedo it darkens/lightens ('overlay'/'multiply'/'soft-light'); on height it adds grain.
  noise(
    reg,
    {
      cells = 8,
      amount = 0.35,
      seed = 0,
      blend = 'overlay',
      target = 'a',
      oct = 4,
      stretch = [1, 1],
    } = {},
  ) {
    const tile = noiseTile(256, cells, oct, seed + this.seed);
    return this.on(target, reg, (c, k, x, y, w, h) => {
      c.globalAlpha = amount;
      c.globalCompositeOperation = k === 'a' ? blend : 'overlay';
      const tw = 256 * stretch[0] * (this.size / 512),
        th = 256 * stretch[1] * (this.size / 512);
      for (let yy = y; yy < y + h; yy += th)
        for (let xx = x; xx < x + w; xx += tw) c.drawImage(tile, xx, yy, tw, th);
    });
  }
  // Overlapping scales in staggered rows. color(u, v, rand) -> color for the scale at region-relative (u, v).
  // color = null (default) keeps what is already painted underneath and only adds the scale structure (edges, a
  // random light/dark `tint` per scale, highlights, height), so paint gradients/bands/spots first and scales last.
  // shape: 'round' (lizard/fish, overlapping toward the tail), 'bead' (granular, no overlap), 'plate' (rectangular belly/gator scutes), 'keel' (ridged)
  scales(
    reg,
    {
      cols = 40,
      rows = 24,
      color = null,
      tint = 0.14,
      edge = 0.35,
      bump = 0.5,
      shape = 'round',
      jitter = 0.15,
      rough = null,
      sizeFn = null,
      seed = 7,
    } = {},
  ) {
    const R = rng(seed + this.seed),
      [X, Y, W, H] = this._R(reg),
      cw = W / cols,
      rh = H / rows;
    const A = this.a,
      Hc = this.h,
      Rc = this.r;
    for (const c of [A, Hc, Rc]) {
      c.save();
      c.beginPath();
      c.rect(X, Y, W, H);
      c.clip();
    }
    for (let j = -1; j <= rows; j++)
      for (let i = cols; i >= -1; i--) {
        // tailward scales first so headward ones overlap them
        const u = (i + (j & 1 ? 0.5 : 0) + 0.5) / cols,
          v = (j + 0.5) / rows;
        const sz = sizeFn ? sizeFn(u, v) : 1;
        if (sz <= 0) continue;
        const cx = X + u * W + (R() - 0.5) * cw * jitter,
          cy = Y + v * H + (R() - 0.5) * rh * jitter;
        const rx = cw * 0.62 * sz,
          ry = rh * 0.62 * sz,
          col = color ? color(clamp(u), clamp(v), R) : null;
        const path = (c) => {
          c.beginPath();
          if (shape === 'plate')
            c.rect(cx - cw * 0.48 * sz, cy - rh * 0.48 * sz, cw * 0.96 * sz, rh * 0.96 * sz);
          else if (shape === 'bead') c.ellipse(cx, cy, rx * 0.72, ry * 0.72, 0, 0, 6.2832);
          else {
            c.moveTo(cx - rx, cy - ry);
            c.quadraticCurveTo(cx + rx * 0.2, cy - ry, cx + rx, cy);
            c.quadraticCurveTo(cx + rx * 0.2, cy + ry, cx - rx, cy + ry);
            c.closePath();
          }
        };
        path(A);
        if (col) {
          A.fillStyle = css(col);
          A.fill();
        } else if (tint > 0) {
          const k = R() - 0.5;
          A.fillStyle =
            k > 0 ? `rgba(255,255,255,${k * 2 * tint})` : `rgba(0,0,0,${-k * 2 * tint})`;
          A.fill();
        }
        if (edge > 0) {
          A.strokeStyle = col ? css(shade(col, 1 - edge), 0.9) : `rgba(0,0,0,${edge})`;
          A.lineWidth = Math.max(0.6, Math.min(cw, rh) * 0.1);
          A.stroke();
        }
        // highlight on the exposed (tailward) half
        const g = A.createRadialGradient(
          cx + rx * 0.25,
          cy - ry * 0.2,
          0,
          cx,
          cy,
          Math.max(rx, ry),
        );
        g.addColorStop(0, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(0,0,0,0.10)');
        A.fillStyle = g;
        path(A);
        A.fill();
        // height: dome (or ridge), raised toward the free edge
        const hg = Hc.createRadialGradient(
          cx + (shape === 'round' ? rx * 0.3 : 0),
          cy,
          0,
          cx,
          cy,
          Math.max(rx, ry),
        );
        hg.addColorStop(0, gray(0.5 + bump * 0.5));
        hg.addColorStop(0.75, gray(0.5 + bump * 0.2));
        hg.addColorStop(1, gray(0.5 - bump * 0.4));
        path(Hc);
        Hc.fillStyle = hg;
        Hc.fill();
        if (shape === 'keel') {
          Hc.strokeStyle = gray(0.5 + bump * 0.5);
          Hc.lineWidth = Math.max(1, rh * 0.18);
          Hc.beginPath();
          Hc.moveTo(cx - rx * 0.7, cy);
          Hc.lineTo(cx + rx * 0.8, cy);
          Hc.stroke();
        }
        if (rough !== null) {
          path(Rc);
          Rc.fillStyle = gray(typeof rough === 'function' ? rough(u, v, R) : rough);
          Rc.fill();
        }
      }
    for (const c of [A, Hc, Rc]) c.restore();
    return this;
  }
  // Body feathers: rows of overlapping scalloped feathers pointing tailward (+x), each with a shaft and barbs.
  // color(u, v, rand) -> feather color; tip(u, v) optional lighter/darker fringe color. color = null (default) keeps
  // the plumage pattern already painted underneath and only adds the feather structure on top.
  feathers(
    reg,
    {
      cols = 30,
      rows = 18,
      color = null,
      tint = 0.12,
      edge = 1,
      tip = null,
      shaft = 0.25,
      bump = 0.45,
      jitter = 0.25,
      lengthK = 1.6,
      rough = 0.78,
      seed = 3,
      sizeFn = null,
    } = {},
  ) {
    const R = rng(seed + this.seed),
      [X, Y, W, H] = this._R(reg),
      cw = W / cols,
      rh = H / rows;
    const A = this.a,
      Hc = this.h,
      Rc = this.r;
    for (const c of [A, Hc, Rc]) {
      c.save();
      c.beginPath();
      c.rect(X, Y, W, H);
      c.clip();
    }
    Rc.fillStyle = gray(rough);
    Rc.fillRect(X, Y, W, H);
    for (let i = cols; i >= -1; i--)
      for (let j = -1; j <= rows; j++) {
        const u = (i + 0.5) / cols,
          v = (j + (i & 1 ? 0.5 : 0) + 0.5) / rows,
          sz = sizeFn ? sizeFn(u, v) : 1;
        if (sz <= 0) continue;
        const cx = X + u * W + (R() - 0.5) * cw * jitter,
          cy = Y + v * H + (R() - 0.5) * rh * jitter;
        const L = cw * lengthK * sz,
          hw = rh * 0.62 * sz,
          over = !color,
          kk = over ? R() - 0.5 : 0,
          col = color ? color(clamp(u), clamp(v), R) : kk > 0 ? '#ffffff' : '#000000',
          oa = over ? Math.abs(kk) * 2 * tint : 1;
        const path = (c) => {
          c.beginPath();
          c.moveTo(cx - L * 0.5, cy);
          c.bezierCurveTo(cx - L * 0.2, cy - hw * 1.1, cx + L * 0.35, cy - hw, cx + L * 0.5, cy);
          c.bezierCurveTo(cx + L * 0.35, cy + hw, cx - L * 0.2, cy + hw * 1.1, cx - L * 0.5, cy);
          c.closePath();
        };
        path(A);
        const g = A.createLinearGradient(cx - L * 0.5, 0, cx + L * 0.5, 0);
        if (over) {
          g.addColorStop(0, `rgba(0,0,0,${0.22 * edge})`);
          g.addColorStop(0.55, css(col, oa));
          g.addColorStop(1, tip ? css(tip(u, v, R), 0.9) : `rgba(255,255,255,${0.2 * edge})`);
        } else {
          g.addColorStop(0, css(shade(col, 0.82)));
          g.addColorStop(0.7, css(col));
          g.addColorStop(1, css(tip ? tip(u, v, R) : shade(col, 1.12)));
        }
        A.fillStyle = g;
        A.fill();
        A.strokeStyle = over ? `rgba(0,0,0,${0.3 * edge})` : css(shade(col, 0.6), 0.55);
        A.lineWidth = Math.max(0.5, rh * 0.05);
        A.stroke();
        if (shaft > 0) {
          A.strokeStyle = over ? `rgba(255,255,255,${shaft * 0.6})` : css(shade(col, 1.25), shaft);
          A.lineWidth = Math.max(0.5, rh * 0.06);
          A.beginPath();
          A.moveTo(cx - L * 0.45, cy);
          A.lineTo(cx + L * 0.42, cy);
          A.stroke();
          A.strokeStyle = over ? 'rgba(0,0,0,0.12)' : css(shade(col, 0.7), 0.22);
          A.lineWidth = 0.5; // barbs
          for (let b = -3; b <= 4; b++) {
            const bx = cx + b * L * 0.1;
            A.beginPath();
            A.moveTo(bx, cy);
            A.lineTo(bx + L * 0.09, cy - hw * 0.7);
            A.moveTo(bx, cy);
            A.lineTo(bx + L * 0.09, cy + hw * 0.7);
            A.stroke();
          }
        }
        const hg = Hc.createLinearGradient(cx - L * 0.5, 0, cx + L * 0.5, 0);
        hg.addColorStop(0, gray(0.5 - bump * 0.3));
        hg.addColorStop(0.8, gray(0.5 + bump * 0.45));
        hg.addColorStop(1, gray(0.5 + bump * 0.1));
        path(Hc);
        Hc.fillStyle = hg;
        Hc.fill();
        Hc.strokeStyle = gray(0.5 + bump * 0.5, 0.8);
        Hc.lineWidth = Math.max(0.6, rh * 0.07);
        Hc.beginPath();
        Hc.moveTo(cx - L * 0.45, cy);
        Hc.lineTo(cx + L * 0.42, cy);
        Hc.stroke();
      }
    for (const c of [A, Hc, Rc]) c.restore();
    return this;
  }
  // Fur / hair strokes. angle(u, v) -> stroke direction in radians (0 = toward the tail, +PI/2 = toward the belly).
  // color(u, v, rand) -> hair color. Dense short strokes read as a coat; long ones as shag.
  fur(
    reg,
    {
      n = 9000,
      len = 0.03,
      width = 1.2,
      angle = () => 0.25,
      color,
      bump = 0.35,
      alpha = 0.85,
      curl = 0.3,
      seed = 5,
      mask = null,
    } = {},
  ) {
    const R = rng(seed + this.seed),
      [X, Y, W, H] = this._R(reg),
      A = this.a,
      Hc = this.h,
      S = this.size;
    for (const c of [A, Hc]) {
      c.save();
      c.beginPath();
      c.rect(X, Y, W, H);
      c.clip();
      c.lineCap = 'round';
    }
    for (let i = 0; i < n; i++) {
      const u = R(),
        v = R();
      if (mask && R() > mask(u, v)) continue;
      const x = X + u * W,
        y = Y + v * H,
        a = angle(u, v) + (R() - 0.5) * curl * 2,
        L = len * S * (0.6 + R() * 0.8);
      const x2 = x + Math.cos(a) * L,
        y2 = y + Math.sin(a) * L,
        mx = (x + x2) / 2 + (R() - 0.5) * L * curl,
        my = (y + y2) / 2 + (R() - 0.5) * L * curl;
      const col = color ? color(u, v, R) : '#806040';
      A.strokeStyle = css(col, alpha);
      A.lineWidth = (width * (0.6 + R() * 0.8) * S) / 512;
      A.beginPath();
      A.moveTo(x, y);
      A.quadraticCurveTo(mx, my, x2, y2);
      A.stroke();
      const hv = 0.5 + (R() - 0.35) * bump;
      Hc.strokeStyle = gray(hv, 0.7);
      Hc.lineWidth = (width * S) / 512;
      Hc.beginPath();
      Hc.moveTo(x, y);
      Hc.quadraticCurveTo(mx, my, x2, y2);
      Hc.stroke();
    }
    for (const c of [A, Hc]) c.restore();
    return this;
  }
  // soft or hard blotches. at(rand) optional -> [u, v]; otherwise uniform in the region.
  spots(
    reg,
    {
      n = 40,
      r = [0.01, 0.03],
      color = '#000',
      alpha = 0.8,
      soft = 0.5,
      squash = 1,
      seed = 11,
      at = null,
      height = null,
      rough = null,
      ring = null,
    } = {},
  ) {
    const R = rng(seed + this.seed),
      [X, Y, W, H] = this._R(reg),
      S = this.size;
    const draw = (c, style, x, y, rr, soften) => {
      const g = c.createRadialGradient(x, y, rr * (1 - soften), x, y, rr);
      g.addColorStop(0, style(1));
      g.addColorStop(1, style(0));
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, rr, rr * squash, 0, 0, 6.2832);
      c.fill();
    };
    for (const c of [this.a, this.h, this.r]) {
      c.save();
      c.beginPath();
      c.rect(X, Y, W, H);
      c.clip();
    }
    for (let i = 0; i < n; i++) {
      const p = at ? at(R) : [R(), R()],
        x = X + p[0] * W,
        y = Y + p[1] * H,
        rr = lerp(r[0], r[1], R()) * S,
        col = typeof color === 'function' ? color(p[0], p[1], R) : color;
      if (ring) draw(this.a, (k) => css(ring, alpha * k), x, y, rr * 1.35, soft);
      draw(this.a, (k) => css(col, alpha * k), x, y, rr, soft);
      if (height !== null) draw(this.h, (k) => gray(height, k), x, y, rr, 0.8);
      if (rough !== null) draw(this.r, (k) => gray(rough, k), x, y, rr, 0.5);
    }
    for (const c of [this.a, this.h, this.r]) c.restore();
    return this;
  }
  // bands across the body (dir 'v': vertical bars at given u positions) or along it (dir 'h': stripes at given v).
  bands(
    reg,
    {
      at = [0.3, 0.5, 0.7],
      width = 0.04,
      dir = 'v',
      color = '#000',
      alpha = 0.7,
      wobble = 0.3,
      soft = 0.5,
      seed = 13,
    } = {},
  ) {
    const R = rng(seed + this.seed);
    return this.on('a', reg, (c, k, x, y, w, h) => {
      for (const t of at) {
        const wd = Array.isArray(width) ? lerp(width[0], width[1], R()) : width,
          steps = 24,
          ph = R() * 9;
        const g =
          dir === 'v'
            ? c.createLinearGradient(x + (t - wd) * w, 0, x + (t + wd) * w, 0)
            : c.createLinearGradient(0, y + (t - wd) * h, 0, y + (t + wd) * h);
        g.addColorStop(0, css(color, 0));
        g.addColorStop(soft * 0.5, css(color, alpha));
        g.addColorStop(1 - soft * 0.5, css(color, alpha));
        g.addColorStop(1, css(color, 0));
        c.fillStyle = g;
        c.beginPath();
        for (let s = 0; s <= steps; s++) {
          const q = s / steps,
            off = Math.sin(q * 7 + ph) * wobble * wd;
          const px = dir === 'v' ? x + (t - wd + off) * w : x + q * w,
            py = dir === 'v' ? y + q * h : y + (t - wd + off) * h;
          s ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        for (let s = steps; s >= 0; s--) {
          const q = s / steps,
            off = Math.sin(q * 7 + ph) * wobble * wd;
          const px = dir === 'v' ? x + (t + wd + off) * w : x + q * w,
            py = dir === 'v' ? y + q * h : y + (t + wd + off) * h;
          c.lineTo(px, py);
        }
        c.closePath();
        c.fill();
      }
    });
  }
  // polyline / curve stroke on all three canvases: mouth lines, creases, nostrils, shell seams.
  line(
    pts,
    {
      color = '#000',
      alpha = 0.8,
      width = 0.004,
      height = 0.3,
      rough = null,
      close = false,
      fill = null,
    } = {},
  ) {
    const S = this.size,
      path = (c) => {
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p[0] * S, p[1] * S) : c.moveTo(p[0] * S, p[1] * S)));
        if (close) c.closePath();
      };
    const A = this.a;
    A.save();
    A.lineJoin = A.lineCap = 'round';
    path(A);
    if (fill) {
      A.fillStyle = css(fill, alpha);
      A.fill();
    }
    A.strokeStyle = css(color, alpha);
    A.lineWidth = width * S;
    A.stroke();
    A.restore();
    if (height !== null) {
      const c = this.h;
      c.save();
      c.lineJoin = c.lineCap = 'round';
      path(c);
      c.strokeStyle = gray(height);
      c.lineWidth = width * S;
      c.stroke();
      c.restore();
    }
    if (rough !== null) {
      const c = this.r;
      c.save();
      path(c);
      if (fill) {
        c.fillStyle = gray(rough);
        c.fill();
      }
      c.strokeStyle = gray(rough);
      c.lineWidth = width * S;
      c.stroke();
      c.restore();
    }
    return this;
  }
  // An eyeball tile (map the eye sphere's UVs onto it; the pupil is at the tile center). pupil: 'round' | 'slit' | 'bar'
  eye(
    reg,
    {
      iris = '#a06a1c',
      iris2 = null,
      pupil = 'round',
      pupilSize = 0.42,
      sclera = '#1a1410',
      ring = '#000',
      wet = 0.08,
    } = {},
  ) {
    const [x, y, w, h] = this._R(reg),
      cx = x + w / 2,
      cy = y + h / 2,
      r = Math.min(w, h) / 2,
      A = this.a,
      R = rng(this.seed + 99);
    this.fill(reg, sclera, { rough: wet, height: 0.5 });
    const g = A.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.78);
    g.addColorStop(0, css(iris2 || shade(iris, 1.25)));
    g.addColorStop(0.8, css(iris));
    g.addColorStop(1, css(shade(iris, 0.45)));
    A.fillStyle = g;
    A.beginPath();
    A.arc(cx, cy, r * 0.78, 0, 6.2832);
    A.fill();
    A.strokeStyle = css(shade(iris, 0.6), 0.5);
    A.lineWidth = Math.max(0.5, r * 0.02); // iris fibers
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 6.2832 + R() * 0.1;
      A.beginPath();
      A.moveTo(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25);
      A.lineTo(cx + Math.cos(a) * r * 0.76, cy + Math.sin(a) * r * 0.76);
      A.stroke();
    }
    A.strokeStyle = css(ring);
    A.lineWidth = r * 0.08;
    A.beginPath();
    A.arc(cx, cy, r * 0.78, 0, 6.2832);
    A.stroke();
    A.fillStyle = '#020202';
    A.beginPath();
    if (pupil === 'slit') A.ellipse(cx, cy, r * pupilSize * 0.3, r * pupilSize * 1.5, 0, 0, 6.2832);
    else if (pupil === 'bar')
      A.ellipse(cx, cy, r * pupilSize * 1.5, r * pupilSize * 0.45, 0, 0, 6.2832);
    else A.arc(cx, cy, r * pupilSize, 0, 6.2832);
    A.fill();
    return this;
  }
  // Wrinkles / folds: many faint lines mostly on the height map (elephant-like skin of manatees, turtle necks, dewlaps)
  wrinkles(
    reg,
    {
      n = 60,
      dir = 'v',
      len = [0.2, 0.6],
      depth = 0.25,
      color = '#000',
      alpha = 0.18,
      seed = 21,
      wobble = 0.02,
    } = {},
  ) {
    const R = rng(seed + this.seed);
    return this.on('ah', reg, (c, k, x, y, w, h) => {
      c.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const u = R(),
          v = R(),
          L = lerp(len[0], len[1], R()),
          steps = 8;
        c.strokeStyle = k === 'a' ? css(color, alpha) : gray(0.5 - depth, 0.8);
        c.lineWidth = (((k === 'a' ? 1 : 1.6) * this.size) / 512) * (0.6 + R());
        c.beginPath();
        for (let s = 0; s <= steps; s++) {
          const q = s / steps,
            o = (R() - 0.5) * wobble;
          const px = dir === 'v' ? x + (u + o) * w : x + (u + q * L) * w,
            py = dir === 'v' ? y + (v + q * L) * h : y + (v + o) * h;
          s ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.stroke();
      }
    });
  }
  // free painting on the albedo with region-relative coordinates: fn(ctx, x, y, w, h)
  paint(reg, fn, target = 'a') {
    return this.on(target, reg, (c, k, x, y, w, h) => fn(c, x, y, w, h, k));
  }
  // result canvases (the normal map is derived from the height canvas)
  canvases({ normal = 2.2 } = {}) {
    return { map: this.ca, normalMap: normalFromHeight(this.ch, normal), roughnessMap: this.cr };
  }
}

// canvases -> three textures (main thread). `set` = { map, normalMap, roughnessMap } canvases or ImageBitmaps.
export function toTextures(THREE, set, { aniso = 8, repeat = false } = {}) {
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return {
    map: mk(set.map, true),
    normalMap: mk(set.normalMap, false),
    roughnessMap: mk(set.roughnessMap, false),
  };
}
const _skinCache = new Map();
// Cached species skin: key -> textures. paint() -> Skin. Shared by every individual of that species/variant.
export function skinTextures(THREE, key, paint, opts = {}) {
  let e = _skinCache.get(key);
  if (!e) {
    const s = paint();
    e = { tex: toTextures(THREE, s.canvases(opts), opts), refs: 0 };
    _skinCache.set(key, e);
  }
  e.refs++;
  return e.tex;
}
export function releaseSkin(key) {
  const e = _skinCache.get(key);
  if (e && --e.refs <= 0) {
    for (const t of Object.values(e.tex)) t.dispose();
    _skinCache.delete(key);
  }
}
