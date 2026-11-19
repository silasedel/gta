// Interior art kit: neon sign generator. Script or block lettering plus an optional icon (palm, cocktail, star, wave, moon),
// drawn as glass tubes on a canvas: a soft halo, the colored tube and a hot white core. Rendered additively on the wall, follows the
// accent circuit (stays on after hours), and registers baked lights so the wall and floor around it take the color.
//   neonSign(ctx, x, y, z, ry, { lines: ['Velvet', 'Undertow'], icon: 'palm', color: '#ff3fd2', h: 1.1, font: 'script' })
import * as THREE from 'three';
import { addLight } from '../lighting.js';
import { lin, hexNum } from './util.js';

export const NEON_FONTS = {
  script:
    '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Lucida Handwriting", "Apple Chancery", cursive',
  casual: '"Marker Felt", "Segoe Print", "Comic Sans MS", cursive',
  block: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif',
  deco: '"Futura", "Century Gothic", "Avenir Next", Arial, sans-serif',
  serif: '"Didot", "Bodoni 72", Georgia, serif',
};

// icon paths in a unit box (0..1, y down), drawn as tube strokes
function drawIcon(g, kind, x, y, s) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = (fn) => {
    g.beginPath();
    fn();
    g.stroke();
  };
  if (kind === 'palm') {
    // leaning trunk with ring scars, a crown of six arching leaf outlines
    const cx = 0.44,
      cy = 0.3;
    path(() => {
      g.moveTo(0.6, 1.0);
      g.bezierCurveTo(0.6, 0.78, 0.5, 0.55, cx, cy + 0.02);
    });
    path(() => {
      g.moveTo(0.67, 1.0);
      g.bezierCurveTo(0.66, 0.78, 0.56, 0.55, cx + 0.05, cy + 0.04);
    });
    for (let i = 0; i < 6; i++) {
      const t = 0.2 + i * 0.13,
        x = 0.6 + (cx - 0.6) * t * 1.05 + 0.035,
        y = 1.0 - (1.0 - cy) * t;
      path(() => {
        g.moveTo(x - 0.035, y);
        g.lineTo(x + 0.035, y - 0.012);
      });
    }
    const leaves = [
      [-0.44, 0.2, 0.42],
      [-0.36, -0.1, 0.36],
      [-0.08, -0.26, 0.3],
      [0.22, -0.2, 0.32],
      [0.44, 0.0, 0.38],
      [0.42, 0.26, 0.36],
    ];
    for (const [dx, dy, wd] of leaves)
      path(() => {
        const tx = cx + dx,
          ty = cy + dy + 0.12,
          mx = cx + dx * 0.5,
          my = cy + dy - 0.06,
          nx = -(ty - cy),
          ny = tx - cx,
          nl = Math.hypot(nx, ny) || 1,
          w = wd * 0.34;
        g.moveTo(cx, cy);
        g.quadraticCurveTo(mx + (nx / nl) * w, my + (ny / nl) * w, tx, ty);
        g.quadraticCurveTo(mx - (nx / nl) * w * 0.4, my - (ny / nl) * w * 0.4 + 0.05, cx, cy);
      });
  } else if (kind === 'cocktail') {
    path(() => {
      g.moveTo(0.15, 0.15);
      g.lineTo(0.85, 0.15);
      g.lineTo(0.5, 0.55);
      g.closePath();
    });
    path(() => {
      g.moveTo(0.5, 0.55);
      g.lineTo(0.5, 0.92);
      g.moveTo(0.3, 0.92);
      g.lineTo(0.7, 0.92);
    });
    path(() => {
      g.arc(0.68, 0.12, 0.09, 0, 7);
    });
  } else if (kind === 'star') {
    path(() => {
      for (let k = 0; k < 11; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5,
          r = k % 2 ? 0.2 : 0.48;
        g.lineTo(0.5 + Math.cos(a) * r, 0.52 + Math.sin(a) * r);
      }
    });
  } else if (kind === 'wave') {
    for (let j = 0; j < 3; j++)
      path(() => {
        for (let k = 0; k <= 20; k++) {
          const t = k / 20;
          g.lineTo(0.05 + t * 0.9, 0.35 + j * 0.2 + Math.sin(t * Math.PI * 2.5 + j) * 0.07);
        }
      });
  } else if (kind === 'moon') {
    path(() => {
      g.arc(0.5, 0.5, 0.4, 0.6, 5.7);
      g.arc(0.66, 0.42, 0.3, 5.3, 1.0, true);
    });
  }
  g.restore();
}

// draw the sign into a canvas. Returns { canvas, aspect }
export function neonCanvas(o = {}) {
  const lines = o.lines || ['Open'],
    color = o.color || '#ff3fd2',
    font = NEON_FONTS[o.font || 'script'] || o.font,
    H = 512,
    W = o.icon ? 1280 : 1024,
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const textW = o.icon ? W * 0.66 : W * 0.92,
    n = lines.length,
    lh = (H * 0.86) / n;
  const pass = (stroke, width, blur, alpha) => {
    g.save();
    g.globalAlpha = alpha;
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.strokeStyle = stroke;
    g.fillStyle = stroke;
    g.lineWidth = width;
    lines.forEach((t, i) => {
      let fs = lh * (o.font === 'block' || o.font === 'deco' ? 0.78 : 0.95);
      g.font = `${o.weight || (o.font === 'script' ? '600' : '700')} ${fs}px ${font}`;
      while (g.measureText(t).width > textW && fs > 20) {
        fs -= 4;
        g.font = `${o.weight || '600'} ${fs}px ${font}`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const x =
          (o.icon ? textW / 2 + W * 0.02 : W / 2) + (n > 1 ? (i - (n - 1) / 2) * lh * 0.32 : 0),
        y = H * 0.07 + lh * (i + 0.55);
      if (o.font === 'block' || o.font === 'deco') g.strokeText(t, x, y);
      else {
        g.lineWidth = width * 0.5;
        g.strokeText(t, x, y);
        g.fillText(t, x, y);
      }
    });
    if (o.icon) {
      const sc = 420 * (H / 512);
      g.lineWidth = (width * 1.4) / sc;
      drawIcon(g, o.icon, W * 0.7, H * 0.06, sc);
    }
    g.restore();
  };
  pass(color, 22, 60, 0.35);
  pass(color, 12, 24, 0.9);
  pass(color, 7, 6, 1);
  pass('#ffffff', 2.5, 4, 0.85);
  return { canvas: c, aspect: W / H };
}

// mount a neon sign on a wall at (x, y = center, z) facing ry in the current G frame. h = sign height in meters.
export function neonSign(ctx, x, y, z, ry, o = {}) {
  const { canvas, aspect } = neonCanvas(o),
    h = o.h || 1,
    w = h * aspect,
    k = o.k ?? 3.2,
    tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    color: new THREE.Color(k, k, k),
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  mat.userData.order = 4;
  ctx.M.glows.push({ m: mat, base: new THREE.Color(k, k, k), ch: o.ch ?? 1, flicker: !!o.flicker });
  ctx.M.owned.push(mat);
  ctx.disposables.push(tex);
  ctx.G.at(
    x,
    z,
    ry,
    () => {
      ctx.G.plane(mat, 0, 0, 0.03, w, h);
      // the light it throws on the wall, the floor and people: a row of soft omni lights just off the wall
      const c = lin(o.color || '#ff3fd2'),
        n = Math.max(2, Math.round(w / 0.7)),
        p = ((o.light ?? 1) * 2.4 * w) / n;
      for (let i = 0; i < n; i++)
        addLight(ctx, {
          p: [(i + 0.5 - n / 2) * (w / n) * 0.85, 0, 0.22],
          c: [c[0] * p, c[1] * p, c[2] * p],
          ch: o.ch ?? 1,
          type: 'omni',
          soft: 0.35,
          wrap: 0.2,
          amb: 0.9,
          noPool: i !== Math.floor(n / 2),
        });
    },
    y,
  );
  return { w, h, mat, tex, color: hexNum(o.color || '#ff3fd2') };
}
