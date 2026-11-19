// Logo engine: every brand logo is drawn in code from the brand's own data (mark function + wordmark spec + lockup),
// at any resolution. Nothing is rasterized ahead of time, so a logo is as crisp at 2048 px as at 64 px.
//
// brand.logo = {
//   lockup: 'horizontal' | 'stacked' | 'wordmark' | 'roundel' | 'emblem' | 'custom',
//   mark(g, s, P, brand) {...}      // draws the symbol inside a 0..s square (optional)
//   markAspect: 1,                  // width / height of the mark box (default 1)
//   markScale: 1,                   // mark height relative to the word block height
//   word: { text | parts | lines, font, case, tracking, fill, outline, shadow, skew, arch, underline, scale },
//   sub:  { text, font, case, tracking, fill, scale }        // small second line (descriptor)
//   container: { shape, fill, stroke, strokeWidth, inner, pad, radius }   // plate behind the lockup
//   ring: { top, bottom, font, fill, tracking }              // roundel lockup: text on the ring
//   draw(g, w, h, P, brand) {...}   // lockup 'custom': draws the whole logo in a w x h box; set aspect too
//   aspect: 2.4,                    // only for 'custom'
// }
import {
  makeCanvas,
  ctx2d,
  drawSpaced,
  measureSpaced,
  roundRect,
  polygon,
  star,
  inkOn,
  contrast,
} from '../util.js';
import { font as cssFont } from '../fonts.js';

const U = 100; // layout unit: the main word line is laid out at 100 px, then everything is scaled to fit
let scratch = null;
const mctx = () => scratch || (scratch = ctx2d(makeCanvas(8, 8)));

export function col(P, key, fallback = '#111111') {
  if (!key) return fallback;
  if (Array.isArray(key)) return key.map((k) => col(P, k, fallback));
  if (typeof key === 'string' && (key[0] === '#' || key.startsWith('rgb') || key.startsWith('hsl')))
    return key;
  return P[key] || fallback;
}
function fillStyle(g, P, key, x0, y0, x1, y1) {
  const c = col(P, key);
  if (Array.isArray(c)) {
    const gr = g.createLinearGradient(x0, y0, x1 ?? x0, y1 ?? y0);
    c.forEach((cc, i) => gr.addColorStop(c.length === 1 ? 0 : i / (c.length - 1), cc));
    return gr;
  }
  return c;
}
const applyCase = (t, c) => (c === 'upper' ? t.toUpperCase() : c === 'lower' ? t.toLowerCase() : t);

// ---- a single line of text made of parts; returns metrics in layout units for size `px`
function lineParts(word) {
  const base = {
    font: word.font || 'grotesk',
    weight: word.weight,
    italic: word.italic,
    case: word.case,
    tracking: word.tracking || 0,
    fill: word.fill || 'ink',
  };
  const parts = word.parts
    ? word.parts.map((p) => ({ ...base, ...p }))
    : [{ ...base, text: word.text }];
  return parts.map((p) => ({ ...p, text: applyCase(String(p.text ?? ''), p.case) }));
}
const partFont = (p, px) =>
  cssFont(p.font, px * (p.scale || 1), {
    ...(p.weight ? { weight: p.weight } : {}),
    ...(p.italic != null ? { italic: p.italic } : {}),
  });
function measureLine(word, px) {
  const g = mctx();
  let w = 0,
    asc = 0,
    desc = 0;
  const parts = lineParts(word);
  parts.forEach((p, i) => {
    g.font = partFont(p, px);
    const m = g.measureText(p.text);
    const pw =
      measureSpaced(g, p.text, p.tracking) +
      (i < parts.length - 1 ? (p.gap ?? p.tracking) * px : 0);
    p._w = pw;
    w += pw;
    const upper = p.text === p.text.toUpperCase();
    const a = m.actualBoundingBoxAscent || px * 0.72,
      d = m.actualBoundingBoxDescent || 0;
    asc = Math.max(asc, a + (p.rise || 0) * px);
    desc = Math.max(desc, upper ? Math.min(d, px * 0.04) : d);
  });
  const skewPad = Math.abs(word.skew || 0) * (asc + desc);
  return { parts, w: w + skewPad, asc, desc, h: asc + desc, skewPad };
}
function drawLine(g, P, word, x, baseline, px) {
  const m = measureLine(word, px);
  g.save();
  g.translate(x + (word.skew > 0 ? 0 : m.skewPad), baseline);
  if (word.skew) g.transform(1, 0, -word.skew, 1, 0, 0);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  const pass = (fn) => {
    let cx = 0;
    for (const p of m.parts) {
      g.font = partFont(p, px);
      fn(p, cx);
      cx += p._w;
    }
  };
  if (word.shadow) {
    const s = word.shadow;
    g.fillStyle = col(P, s.color, '#000');
    pass((p, cx) => {
      for (let k = 1; k <= (s.steps || 1); k++)
        drawSpaced(
          g,
          p.text,
          cx + ((s.dx ?? 0.04) * px * k) / (s.steps || 1),
          -(p.rise || 0) * px + ((s.dy ?? 0.04) * px * k) / (s.steps || 1),
          p.tracking,
        );
    });
  }
  if (word.outline2) {
    g.strokeStyle = col(P, word.outline2.color, '#fff');
    g.lineWidth = (word.outline2.width || 0.12) * px;
    pass((p, cx) => drawSpaced(g, p.text, cx, -(p.rise || 0) * px, p.tracking, true));
  }
  if (word.outline) {
    g.strokeStyle = col(P, word.outline.color, '#000');
    g.lineWidth = (word.outline.width || 0.06) * px;
    pass((p, cx) => drawSpaced(g, p.text, cx, -(p.rise || 0) * px, p.tracking, true));
  }
  pass((p, cx) => {
    g.fillStyle = fillStyle(g, P, p.fill, 0, -m.asc, 0, m.desc);
    if (p.hollow) {
      g.strokeStyle = g.fillStyle;
      g.lineWidth = (p.hollow === true ? 0.035 : p.hollow) * px;
      drawSpaced(g, p.text, cx, -(p.rise || 0) * px, p.tracking, true);
    } else drawSpaced(g, p.text, cx, -(p.rise || 0) * px, p.tracking);
  });
  if (word.inlineStripe) {
    // thin highlight line through the letters (deco inline)
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = col(P, word.inlineStripe.color, '#fff');
    const t = (word.inlineStripe.width || 0.05) * px;
    g.fillRect(0, -m.asc * (word.inlineStripe.at ?? 0.5) - t / 2, m.w, t);
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
  if (word.underline) {
    const u = word.underline,
      c = col(P, u.color || 'accent'),
      y = baseline + (u.offset ?? 0.14) * px,
      t = (u.width || 0.07) * px;
    g.save();
    g.strokeStyle = c;
    g.fillStyle = c;
    g.lineWidth = t;
    g.lineCap = 'round';
    if (u.type === 'swoosh') {
      g.beginPath();
      g.moveTo(x - px * 0.02, y + t);
      g.quadraticCurveTo(x + m.w * 0.55, y - t * 2.2, x + m.w * 1.02, y - t * 0.2);
      g.quadraticCurveTo(x + m.w * 0.55, y - t * 0.4, x - px * 0.02, y + t);
      g.fill();
    } else if (u.type === 'wave') {
      g.beginPath();
      const n = Math.max(3, Math.round(m.w / (px * 0.5)));
      for (let i = 0; i <= n * 8; i++) {
        const xx = x + (i / (n * 8)) * m.w,
          yy = y + Math.sin((i / 8) * Math.PI * 2) * t * 0.9;
        i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      g.stroke();
    } else if (u.type === 'double') {
      g.lineWidth = t * 0.45;
      for (const dy of [0, t * 1.1]) {
        g.beginPath();
        g.moveTo(x, y + dy);
        g.lineTo(x + m.w, y + dy);
        g.stroke();
      }
    } else if (u.type === 'taper') {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + m.w, y - t * 0.5);
      g.lineTo(x + m.w, y + t * 0.5);
      g.closePath();
      g.fill();
    } else {
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + m.w, y);
      g.stroke();
    }
    g.restore();
  }
  return m;
}
// Text along a circle arc, centered on angle `mid` (radians, 0 = right, -PI/2 = top). `inside` flips for the bottom of a ring.
export function arcText(g, text, cx, cy, r, mid, cssF, tracking = 0, bottom = false) {
  g.save();
  g.font = cssF;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(cssF)?.[1] || 16);
  const widths = [...text].map((ch) => g.measureText(ch).width + tracking * px);
  const total = widths.reduce((a, b) => a + b, 0) - tracking * px;
  let a = mid + ((bottom ? 1 : -1) * (total / 2)) / r;
  [...text].forEach((ch, i) => {
    const half = (widths[i] - tracking * px) / 2 / r;
    a += (bottom ? -1 : 1) * half;
    g.save();
    g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2));
    g.fillText(ch, 0, 0);
    g.restore();
    a += (bottom ? -1 : 1) * (half + (tracking * px) / r);
  });
  g.restore();
  return total;
}
function archLine(g, P, word, cx, baseline, px) {
  // a word bent over an arc (word.arch = sagitta as a fraction of width)
  const m = measureLine({ ...word, skew: 0 }, px);
  const sag = Math.abs(word.arch) * m.w;
  const r = ((m.w * m.w) / 4 + sag * sag) / (2 * sag);
  const up = word.arch > 0;
  const cy = up ? baseline + r - sag : baseline - r + sag - m.asc;
  const p0 = lineParts(word)[0];
  g.fillStyle = fillStyle(g, P, p0.fill, 0, baseline - m.asc, 0, baseline);
  const text = lineParts(word)
    .map((p) => p.text)
    .join('');
  const draw = () =>
    arcText(
      g,
      text,
      cx,
      cy,
      up ? r - m.asc / 2 + sag * 0 : r - m.asc / 2,
      up ? -Math.PI / 2 : Math.PI / 2,
      partFont(p0, px),
      p0.tracking,
      !up,
    );
  if (word.outline) {
    g.save();
    g.strokeStyle = col(P, word.outline.color);
    g.lineWidth = (word.outline.width || 0.06) * px;
    const ft = g.fillText.bind(g);
    g.fillText = (...a) => g.strokeText(...a);
    draw();
    g.fillText = ft;
    g.restore();
  }
  draw();
  return { w: m.w, h: m.asc + sag, asc: m.asc + sag, desc: 0 };
}

// ---- containers
export function containerPath(g, shape, x, y, w, h, radius = 0.2) {
  const r = Math.min(w, h) * radius;
  switch (shape) {
    case 'pill':
      roundRect(g, x, y, w, h, h / 2);
      break;
    case 'round':
    case 'rounded':
      roundRect(g, x, y, w, h, r);
      break;
    case 'circle':
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      g.closePath();
      break;
    case 'oval':
      g.beginPath();
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.closePath();
      break;
    case 'hex':
      g.beginPath();
      {
        const k = Math.min(h * 0.29, w * 0.25);
        g.moveTo(x + k, y);
        g.lineTo(x + w - k, y);
        g.lineTo(x + w, y + h / 2);
        g.lineTo(x + w - k, y + h);
        g.lineTo(x + k, y + h);
        g.lineTo(x, y + h / 2);
        g.closePath();
      }
      break;
    case 'diamond':
      g.beginPath();
      g.moveTo(x + w / 2, y);
      g.lineTo(x + w, y + h / 2);
      g.lineTo(x + w / 2, y + h);
      g.lineTo(x, y + h / 2);
      g.closePath();
      break;
    case 'shield':
      g.beginPath();
      g.moveTo(x, y + h * 0.04);
      g.quadraticCurveTo(x + w / 2, y - h * 0.06, x + w, y + h * 0.04);
      g.lineTo(x + w, y + h * 0.5);
      g.quadraticCurveTo(x + w * 0.98, y + h * 0.84, x + w / 2, y + h);
      g.quadraticCurveTo(x + w * 0.02, y + h * 0.84, x, y + h * 0.5);
      g.closePath();
      break;
    case 'crest':
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, y);
      g.lineTo(x + w, y + h * 0.62);
      g.quadraticCurveTo(x + w, y + h * 0.9, x + w / 2, y + h);
      g.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.62);
      g.closePath();
      break;
    case 'arch':
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x, y + w / 2);
      g.arc(x + w / 2, y + Math.min(w / 2, h), w / 2, Math.PI, 0);
      g.lineTo(x + w, y + h);
      g.closePath();
      break;
    case 'tag':
      g.beginPath();
      {
        const k = h * 0.32;
        g.moveTo(x + k, y);
        g.lineTo(x + w, y);
        g.lineTo(x + w, y + h);
        g.lineTo(x + k, y + h);
        g.lineTo(x, y + h / 2);
        g.closePath();
      }
      break;
    case 'banner':
      g.beginPath();
      {
        const k = h * 0.3;
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.lineTo(x + w - k, y + h / 2);
        g.lineTo(x + w, y + h);
        g.lineTo(x, y + h);
        g.lineTo(x + k, y + h / 2);
        g.closePath();
      }
      break;
    case 'slant':
      g.beginPath();
      {
        const k = h * 0.28;
        g.moveTo(x + k, y);
        g.lineTo(x + w, y);
        g.lineTo(x + w - k, y + h);
        g.lineTo(x, y + h);
        g.closePath();
      }
      break;
    case 'ticket':
      {
        const k = h * 0.14;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.lineTo(x + w, y + h / 2 - k);
        g.arc(x + w, y + h / 2, k, -Math.PI / 2, Math.PI / 2, true);
        g.lineTo(x + w, y + h);
        g.lineTo(x, y + h);
        g.lineTo(x, y + h / 2 + k);
        g.arc(x, y + h / 2, k, Math.PI / 2, -Math.PI / 2, true);
        g.closePath();
      }
      break;
    case 'burst':
      {
        const n = 18,
          cx = x + w / 2,
          cy = y + h / 2;
        g.beginPath();
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * Math.PI * 2,
            k = i % 2 ? 0.86 : 1;
          const px = cx + Math.cos(a) * (w / 2) * k,
            py = cy + Math.sin(a) * (h / 2) * k;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
      }
      break;
    case 'scallop':
      {
        const n = 14,
          cx = x + w / 2,
          cy = y + h / 2;
        g.beginPath();
        for (let i = 0; i <= n * 12; i++) {
          const a = (i / (n * 12)) * Math.PI * 2,
            k = 0.94 + 0.06 * Math.abs(Math.cos((a * n) / 2));
          const px = cx + Math.cos(a) * (w / 2) * k,
            py = cy + Math.sin(a) * (h / 2) * k;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
      }
      break;
    case 'octagon':
      {
        const k = Math.min(w, h) * 0.29;
        g.beginPath();
        g.moveTo(x + k, y);
        g.lineTo(x + w - k, y);
        g.lineTo(x + w, y + k);
        g.lineTo(x + w, y + h - k);
        g.lineTo(x + w - k, y + h);
        g.lineTo(x + k, y + h);
        g.lineTo(x, y + h - k);
        g.lineTo(x, y + k);
        g.closePath();
      }
      break;
    case 'deco':
      {
        const k = Math.min(w, h) * 0.16;
        g.beginPath();
        g.moveTo(x + k, y);
        g.lineTo(x + w - k, y);
        g.lineTo(x + w - k, y + k);
        g.lineTo(x + w, y + k);
        g.lineTo(x + w, y + h - k);
        g.lineTo(x + w - k, y + h - k);
        g.lineTo(x + w - k, y + h);
        g.lineTo(x + k, y + h);
        g.lineTo(x + k, y + h - k);
        g.lineTo(x, y + h - k);
        g.lineTo(x, y + k);
        g.lineTo(x + k, y + k);
        g.closePath();
      }
      break;
    default:
      g.beginPath();
      g.rect(x, y, w, h);
      g.closePath();
  }
}
function drawContainer(g, P, c, x, y, w, h) {
  containerPath(g, c.shape, x, y, w, h, c.radius);
  if (c.fill) {
    g.fillStyle = fillStyle(g, P, c.fill, 0, y, 0, y + h);
    g.fill();
  }
  if (c.stroke) {
    g.strokeStyle = col(P, c.stroke);
    g.lineWidth = (c.strokeWidth || 0.035) * h;
    g.lineJoin = 'round';
    g.stroke();
  }
  if (c.inner) {
    const k = (c.innerGap || 0.06) * h;
    containerPath(g, c.shape, x + k, y + k, w - 2 * k, h - 2 * k, c.radius);
    g.strokeStyle = col(P, c.inner);
    g.lineWidth = (c.innerWidth || 0.014) * h;
    g.stroke();
  }
}

// ---- layout
function wordBlock(logo) {
  // returns { w, h, draw(g, P, x, y) } for the word (possibly several lines) plus sub line, at unit scale
  const lines = [];
  const word = logo.word;
  if (word) {
    if (word.lines)
      word.lines.forEach((l) =>
        lines.push({ kind: 'word', spec: { ...word, lines: undefined, ...l } }),
      );
    else lines.push({ kind: 'word', spec: word });
  }
  if (logo.sub && logo.sub.text)
    lines.push({
      kind: 'sub',
      spec: { font: 'din', tracking: 0.18, case: 'upper', fill: 'ink', scale: 0.24, ...logo.sub },
    });
  if (logo.over && logo.over.text)
    lines.unshift({
      kind: 'sub',
      spec: { font: 'din', tracking: 0.18, case: 'upper', fill: 'ink', scale: 0.22, ...logo.over },
    });
  const align = (word && word.align) || 'center';
  const gap = (word && word.lineGap != null ? word.lineGap : 0.14) * U;
  let w = 0,
    h = 0;
  const ms = lines.map((l) => {
    const px = U * (l.spec.scale || 1) * (l.kind === 'sub' ? 1 : 1);
    const spec =
      l.kind === 'sub' ? { ...l.spec, scale: undefined } : { ...l.spec, scale: undefined };
    let m;
    if (spec.arch) {
      const mm = measureLine({ ...spec, skew: 0 }, px);
      const sag = Math.abs(spec.arch) * mm.w;
      m = { w: mm.w, asc: mm.asc + sag, desc: mm.desc, h: mm.asc + sag + mm.desc, arch: true };
    } else m = measureLine(spec, px);
    if (spec.underline)
      m = {
        ...m,
        desc: Math.max(
          m.desc,
          ((spec.underline.offset ?? 0.14) + (spec.underline.width || 0.07) * 1.6) * px,
        ),
        h: 0,
      };
    m.h = m.asc + m.desc;
    w = Math.max(w, m.w);
    return { ...l, spec, px, m };
  });
  ms.forEach((l, i) => {
    l.y = h + l.m.asc;
    h +=
      l.m.h +
      (i < ms.length - 1 ? gap * (l.kind === 'sub' || ms[i + 1].kind === 'sub' ? 1.15 : 1) : 0);
  });
  if (word && word.justify)
    ms.forEach((l) => {
      if (l.kind === 'word' && l.m.w < w && !l.spec.arch) {
        const k = w / l.m.w;
        l.px *= k;
        const m2 = measureLine(l.spec, l.px);
        l.m = { ...m2, h: m2.asc + m2.desc };
      }
    });
  if (word && word.justify) {
    h = 0;
    ms.forEach((l, i) => {
      l.y = h + l.m.asc;
      h += l.m.h + (i < ms.length - 1 ? gap : 0);
    });
    w = Math.max(...ms.map((l) => l.m.w));
  }
  return {
    w,
    h,
    draw(g, P, x, y) {
      for (const l of ms) {
        const lx = align === 'left' ? x : align === 'right' ? x + w - l.m.w : x + (w - l.m.w) / 2;
        if (l.spec.arch) archLine(g, P, l.spec, x + w / 2, y + l.y, l.px);
        else if (l.kind === 'sub' && l.spec.rule) {
          // sub line flanked by thin rules
          drawLine(g, P, l.spec, lx, y + l.y, l.px);
          g.strokeStyle = col(P, l.spec.fill);
          g.lineWidth = l.px * 0.06;
          const yy = y + l.y - l.m.asc * 0.45;
          g.beginPath();
          g.moveTo(x, yy);
          g.lineTo(lx - l.px * 0.5, yy);
          g.moveTo(lx + l.m.w + l.px * 0.5, yy);
          g.lineTo(x + w, yy);
          g.stroke();
        } else drawLine(g, P, l.spec, lx, y + l.y, l.px);
      }
    },
  };
}

function buildLayout(brand, variant, P = brand.palette) {
  const logo = brand.logo || {};
  const hasMark = typeof logo.mark === 'function' && variant !== 'word';
  const wantWord = variant !== 'mark' && (logo.word || logo.sub);
  let lockup = logo.lockup || (hasMark ? 'horizontal' : 'wordmark');
  if (lockup === 'custom' && typeof logo.draw === 'function' && variant === 'full') {
    const a = logo.aspect || 2;
    return { w: U * a, h: U, draw: (g) => logo.draw(g, U * a, U, P, brand) };
  }
  if (lockup === 'custom') lockup = hasMark ? 'horizontal' : 'wordmark';
  if (variant === 'mark' && hasMark) {
    const a = logo.markAspect || 1;
    return {
      w: U * a,
      h: U,
      draw: (g) => {
        g.save();
        logo.mark(g, U, P, brand);
        g.restore();
      },
    };
  }
  if (variant === 'mark' && lockup === 'roundel') variant = 'full';
  if (lockup === 'roundel' && variant === 'full') {
    const ring = logo.ring || {};
    const S = U * 3;
    return {
      w: S,
      h: S,
      draw(g) {
        const c = logo.container || { fill: 'primary', stroke: 'ink' };
        const cx = S / 2,
          cy = S / 2;
        g.beginPath();
        g.arc(cx, cy, S * 0.49, 0, Math.PI * 2);
        if (c.fill) {
          g.fillStyle = fillStyle(g, P, c.fill, 0, 0, 0, S);
          g.fill();
        }
        if (c.stroke) {
          g.strokeStyle = col(P, c.stroke);
          g.lineWidth = S * (c.strokeWidth || 0.018);
          g.stroke();
        }
        const rIn = S * (ring.inner || 0.33);
        g.beginPath();
        g.arc(cx, cy, rIn, 0, Math.PI * 2);
        if (ring.core) {
          g.fillStyle = col(P, ring.core);
          g.fill();
        }
        if (c.inner || c.stroke) {
          g.strokeStyle = col(P, c.inner || c.stroke);
          g.lineWidth = S * 0.008;
          g.stroke();
        }
        const rt = (S * 0.49 + rIn) / 2,
          px = (S * 0.49 - rIn) * (ring.scale || 0.56);
        const f = cssFont(ring.font || 'geoBold', px, ring.weight ? { weight: ring.weight } : {});
        g.fillStyle = col(P, ring.fill || 'paper');
        if (ring.top)
          arcText(
            g,
            applyCase(ring.top, ring.case || 'upper'),
            cx,
            cy,
            rt,
            -Math.PI / 2,
            f,
            ring.tracking ?? 0.08,
          );
        if (ring.bottom)
          arcText(
            g,
            applyCase(ring.bottom, ring.case || 'upper'),
            cx,
            cy,
            rt,
            Math.PI / 2,
            cssFont(ring.bottomFont || ring.font || 'geoBold', px * (ring.bottomScale || 0.8)),
            ring.tracking ?? 0.08,
            true,
          );
        if (ring.dots !== false && ring.top && ring.bottom) {
          for (const a of [0, Math.PI]) {
            g.beginPath();
            g.arc(cx + Math.cos(a) * rt, cy + Math.sin(a) * rt, px * 0.14, 0, Math.PI * 2);
            g.fill();
          }
        }
        if (hasMark) {
          const ms = rIn * 2 * (logo.markScale || 0.74),
            a = logo.markAspect || 1;
          g.save();
          g.translate(cx - (ms * a) / 2, cy - ms / 2);
          logo.mark(g, ms, P, brand);
          g.restore();
        } else if (logo.word) {
          const wb = wordBlock({ word: logo.word });
          const k = Math.min((rIn * 1.7) / wb.w, (rIn * 1.2) / wb.h);
          g.save();
          g.translate(cx - (wb.w * k) / 2, cy - (wb.h * k) / 2);
          g.scale(k, k);
          wb.draw(g, P, 0, 0);
          g.restore();
        }
      },
    };
  }
  const wb = wantWord ? wordBlock(logo) : null;
  const a = logo.markAspect || 1;
  let w = 0,
    h = 0,
    parts;
  if (hasMark && wb && lockup === 'stacked') {
    const ms = Math.max(U * 0.9, wb.h * 0.9) * (logo.markScale || 1.25),
      gap = U * (logo.gap ?? 0.16);
    w = Math.max(wb.w, ms * a);
    h = ms + gap + wb.h;
    parts = (g) => {
      g.save();
      g.translate((w - ms * a) / 2, 0);
      logo.mark(g, ms, P, brand);
      g.restore();
      wb.draw(g, P, (w - wb.w) / 2, ms + gap);
    };
  } else if (hasMark && wb && lockup === 'emblem') {
    // small mark above the word, sized by the container
    const ms = U * 0.62 * (logo.markScale || 1),
      gap = U * (logo.gap ?? 0.1);
    w = Math.max(wb.w, ms * a);
    h = ms + gap + wb.h;
    parts = (g) => {
      g.save();
      g.translate((w - ms * a) / 2, 0);
      logo.mark(g, ms, P, brand);
      g.restore();
      wb.draw(g, P, (w - wb.w) / 2, ms + gap);
    };
  } else if (hasMark && wb) {
    // horizontal (mark left or right)
    const ms = Math.max(wb.h, U * 0.8) * (logo.markScale || 1.12),
      gap = U * (logo.gap ?? 0.22);
    w = ms * a + gap + wb.w;
    h = Math.max(ms, wb.h);
    const right = logo.markSide === 'right';
    parts = (g) => {
      g.save();
      g.translate(right ? wb.w + gap : 0, (h - ms) / 2);
      logo.mark(g, ms, P, brand);
      g.restore();
      wb.draw(g, P, right ? 0 : ms * a + gap, (h - wb.h) / 2 + (logo.wordShift || 0) * U);
    };
  } else if (wb) {
    w = wb.w;
    h = wb.h;
    parts = (g) => wb.draw(g, P, 0, 0);
  } else if (hasMark) {
    w = U * a;
    h = U;
    parts = (g) => logo.mark(g, U, P, brand);
  } else {
    w = U;
    h = U;
    parts = () => {};
  }
  const c = logo.container && variant === 'full' ? logo.container : null;
  if (!c) return { w, h, draw: parts };
  const padX = (c.padX ?? c.pad ?? 0.3) * U,
    padY = (c.padY ?? c.pad ?? 0.3) * U;
  let W = w + padX * 2,
    H = h + padY * 2;
  if (c.shape === 'circle') {
    const d = Math.hypot(w, h) + padX;
    W = H = d;
  }
  if (c.shape === 'diamond') {
    W = w * 1.9 + padX;
    H = h * 2.4 + padY;
  }
  if (c.shape === 'shield' || c.shape === 'crest') {
    H = h + padY * 2.6;
  }
  if (c.minAspect && W / H < c.minAspect) W = H * c.minAspect;
  if (c.maxAspect && W / H > c.maxAspect) H = W / c.maxAspect;
  const oy =
    c.shape === 'shield' || c.shape === 'crest'
      ? -padY * 0.25
      : c.shape === 'arch'
        ? padY * 0.2
        : 0;
  return {
    w: W,
    h: H,
    draw(g) {
      drawContainer(g, P, c, 0, 0, W, H);
      g.save();
      g.translate((W - w) / 2, (H - h) / 2 + oy);
      parts(g);
      g.restore();
    },
  };
}

export function logoAspect(brand, opts = {}) {
  const L = buildLayout(brand, opts.variant || 'full');
  return L.w / L.h;
}

// The palette a logo uses on its own brand color or on dark surfaces: brand.logo.reverse maps palette keys to other
// keys or hex colors, e.g. { primary: 'paper', ink: 'paper' }.
export function reversePalette(brand) {
  const P = brand.palette,
    r = brand.logo?.reverse;
  if (!r) return null;
  const out = { ...P };
  for (const k of Object.keys(r)) out[k] = P[r[k]] || r[k];
  return out;
}

// Draw a brand's logo fitted and centered inside the box (x, y, w, h).
// opts: { variant: 'full' | 'mark' | 'word', mono: '#fff' (single-color knockout), align: 'center' | 'left' | 'right', valign }
export function drawLogo(g, brand, x, y, w, h, opts = {}) {
  const L = buildLayout(brand, opts.variant || 'full', opts.palette || brand.palette);
  const k = Math.min(w / L.w, h / L.h);
  const dw = L.w * k,
    dh = L.h * k;
  const ox = opts.align === 'left' ? x : opts.align === 'right' ? x + w - dw : x + (w - dw) / 2;
  const oy = opts.valign === 'top' ? y : opts.valign === 'bottom' ? y + h - dh : y + (h - dh) / 2;
  if (opts.mono) {
    const pad = 4;
    const c = makeCanvas(Math.ceil(dw) + pad * 2, Math.ceil(dh) + pad * 2),
      cg = ctx2d(c);
    cg.translate(pad, pad);
    cg.scale(k, k);
    L.draw(cg);
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.globalCompositeOperation = 'source-in';
    cg.fillStyle = opts.mono;
    cg.fillRect(0, 0, c.width, c.height);
    g.drawImage(c, ox - pad, oy - pad);
  } else {
    g.save();
    g.translate(ox, oy);
    g.scale(k, k);
    L.draw(g);
    g.restore();
  }
  return { x: ox, y: oy, w: dw, h: dh };
}

// A canvas holding the logo. size = the longer side in px. opts: { variant, mono, bg, pad (fraction), square }
export function logoCanvas(brand, size = 1024, opts = {}) {
  const a = logoAspect(brand, opts);
  const pad = opts.pad ?? 0.06;
  let w, h;
  if (opts.square) w = h = size;
  else if (a >= 1) {
    w = size;
    h = Math.max(8, Math.round((size * (1 - 2 * pad)) / a + size * 2 * pad));
  } else {
    h = size;
    w = Math.max(8, Math.round(size * (1 - 2 * pad) * a + size * 2 * pad));
  }
  const c = makeCanvas(w, h),
    g = ctx2d(c);
  if (opts.bg) {
    g.fillStyle = col(brand.palette, opts.bg);
    g.fillRect(0, 0, w, h);
  }
  const p = size * pad;
  drawLogo(g, brand, p, p, w - 2 * p, h - 2 * p, opts);
  return c;
}

// Draw the logo so it reads on a background color. Full color when the contrast holds; otherwise the brand's reverse
// palette (logo.reverse), or the full-color logo on a paper plate, the way real brands handle a clashing background.
// opts.treatment forces one: 'full' | 'reverse' | 'plate' | 'mono'.
function keyColors(brand, variant) {
  const P = brand.palette,
    logo = brand.logo || {},
    out = [];
  if (logo.container?.fill && variant !== 'mark' && variant !== 'word') {
    const c = col(P, logo.container.fill);
    return [Array.isArray(c) ? c[0] : c];
  }
  if (variant !== 'mark' && logo.word) {
    const w = logo.word;
    for (const l of w.lines || [w])
      for (const p of l.parts || [l]) {
        const c = col(P, p.fill || l.fill || w.fill || 'ink');
        out.push(Array.isArray(c) ? c[0] : c);
      }
  }
  if (!out.length) out.push(P.primary);
  return out;
}
export function logoOn(g, brand, bg, x, y, w, h, opts = {}) {
  const P = brand.palette;
  const variant = opts.variant || 'full';
  let t = opts.treatment;
  if (!t) {
    const clash = keyColors(brand, variant).some((c) => contrast(c, bg) < 3.0);
    t = !clash ? 'full' : reversePalette(brand) ? 'reverse' : 'plate';
  }
  if (t === 'reverse') {
    const rp = reversePalette(brand);
    if (rp) return drawLogo(g, brand, x, y, w, h, { ...opts, palette: rp });
    t = 'plate';
  }
  if (t === 'mono')
    return drawLogo(g, brand, x, y, w, h, {
      ...opts,
      mono: opts.mono || inkOn(bg, P.paper || '#ffffff', P.ink || '#111111'),
    });
  if (t === 'plate') {
    const a = logoAspect(brand, opts);
    const k = Math.min(w / (a + 0.36), h / 1.36);
    const pw = (a + 0.36) * k,
      ph = 1.36 * k,
      px = x + (w - pw) / 2,
      py = y + (h - ph) / 2;
    g.fillStyle = contrast(P.paper, bg) > 1.25 ? P.paper : '#ffffff';
    roundRect(g, px, py, pw, ph, ph * (opts.plateRadius ?? 0.14));
    g.fill();
    return drawLogo(g, brand, px + 0.18 * k, py + 0.18 * k, pw - 0.36 * k, ph - 0.36 * k, opts);
  }
  return drawLogo(g, brand, x, y, w, h, opts);
}

export { polygon, star, roundRect };
