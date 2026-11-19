// Miami city — extra facade/window atlases (punched, ribbon, curtain-wall fins, condo balconies, precast grid).
// Each atlas: colour map (1024), emissive night windows with lit / blinds / curtain variation (512), roughness-metal map (512).
// The window-flicker shader keys on [bays, floors] cells, so lit windows change per building (UV offsets differ per building).
import * as THREE from 'three';
import { rng } from '../city/tex.js';

const LIT = ['#ffe0a8', '#fff1d0', '#e8f2ff', '#ffd08a', '#f4e6c8'];
const CURT = ['#d9644a', '#c9a24a', '#5a7fa8', '#9b6bb0', '#e0c8a0', '#7aa36a'];

export const VARIANTS = {
  // name: [bays, floors, tileW (m), tileH (m)]
  punched: [6, 6, 18, 19.8],
  ribbon: [8, 8, 24, 28],
  curtain: [12, 12, 18, 45],
  condo: [6, 8, 21, 25.6],
  grid: [8, 8, 16, 24],
};

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')];
}
function tex(c, srgb, aniso) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function make(name, seed, aniso) {
  const [bays, floors, tileW, tileH] = VARIANTS[name];
  const S = 1024,
    E = 512,
    r = rng(seed),
    cw = S / bays,
    ch = S / floors,
    k = E / S;
  const [c, x] = canvas(S),
    [e, ex] = canvas(E),
    [m, mx] = canvas(E);
  const wall = {
    punched: '#efe7da',
    ribbon: '#f3f1ec',
    curtain: '#3b4a52',
    condo: '#f1efea',
    grid: '#d4d2cc',
  }[name];
  x.fillStyle = wall;
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`;
    x.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 3);
  }
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, E, E);
  mx.fillStyle = name === 'curtain' ? 'rgb(0,80,160)' : 'rgb(0,225,0)';
  mx.fillRect(0, 0, E, E);
  // window rect inside a cell (fractions)
  const W = {
    punched: [0.29, 0.22, 0.42, 0.52],
    ribbon: [0, 0.3, 1, 0.46],
    curtain: [0, 0.12, 1, 0.88],
    condo: [0.06, 0.08, 0.88, 0.8],
    grid: [0.2, 0.18, 0.6, 0.6],
  }[name];
  for (let fy = 0; fy < floors; fy++) {
    const dens = r() < 0.25 ? 0.85 : 0.15 + r() * 0.45,
      warm = r() < 0.6;
    if (name === 'ribbon') {
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(0, fy * ch + ch * W[1] - 6, S, 6);
    }
    for (let bx = 0; bx < bays; bx++) {
      const X = bx * cw + W[0] * cw,
        Y = fy * ch + W[1] * ch,
        ww = W[2] * cw,
        hh = W[3] * ch;
      // glass
      const g = x.createLinearGradient(X, Y, X + ww * 0.6, Y + hh);
      const tone =
        name === 'curtain'
          ? [
              `hsl(${185 + r() * 20},${22 + r() * 10}%,${26 + r() * 10}%)`,
              `hsl(195,25%,${40 + r() * 12}%)`,
            ]
          : [`hsl(205,${18 + r() * 14}%,${20 + r() * 10}%)`, `hsl(200,20%,${36 + r() * 14}%)`];
      g.addColorStop(0, tone[1]);
      g.addColorStop(0.55, tone[0]);
      g.addColorStop(1, tone[1]);
      x.fillStyle = g;
      x.fillRect(X, Y, ww, hh);
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.fillRect(X + ww * 0.1, Y, ww * 0.1, hh);
      mx.fillStyle = 'rgb(0,25,210)';
      mx.fillRect(X * k, Y * k, ww * k, hh * k);
      // interior hints by day: blinds / curtains read through the glass
      const blind = r(),
        curtain = r() < (name === 'condo' || name === 'punched' ? 0.35 : 0.12),
        cc = CURT[(r() * CURT.length) | 0];
      if (blind < 0.3) {
        x.fillStyle = 'rgba(225,220,205,0.55)';
        const bh = hh * (0.2 + r() * 0.6);
        x.fillRect(X, Y, ww, bh);
        x.fillStyle = 'rgba(0,0,0,0.08)';
        for (let s = Y; s < Y + bh; s += 4) x.fillRect(X, s, ww, 1);
      }
      if (curtain) {
        x.fillStyle = cc;
        x.globalAlpha = 0.55;
        x.fillRect(X, Y, ww * 0.22, hh);
        x.fillRect(X + ww * 0.78, Y, ww * 0.22, hh);
        x.globalAlpha = 1;
      }
      // reveals / frames / mullions per style
      if (name === 'punched' || name === 'grid') {
        x.fillStyle = 'rgba(0,0,0,0.32)';
        x.fillRect(X, Y, ww, name === 'grid' ? 14 : 8);
        x.fillRect(X, Y, name === 'grid' ? 12 : 6, hh);
        x.strokeStyle = name === 'grid' ? '#bdbab3' : '#fbf8f2';
        x.lineWidth = 4;
        x.strokeRect(X, Y, ww, hh);
        x.fillStyle = '#e0dbd0';
        x.fillRect(X + ww / 2 - 2, Y, 4, hh);
        if (name === 'punched') {
          x.fillRect(X, Y + hh * 0.3, ww, 4);
          x.fillStyle = '#d8d1c4';
          x.fillRect(X - 8, Y + hh, ww + 16, 10);
        }
        if (name === 'punched' && r() < 0.18) {
          x.fillStyle = '#c8c8c4';
          x.fillRect(X + ww * 0.2, Y + hh + 12, ww * 0.6, ch * 0.12);
          x.fillStyle = '#9a9a96';
          for (let s = 0; s < 5; s++)
            x.fillRect(X + ww * 0.22 + s * ww * 0.11, Y + hh + 14, 3, ch * 0.1);
        } // window AC unit
      } else if (name === 'ribbon') {
        x.fillStyle = '#c9ced2';
        x.fillRect(X - 2, Y, 4, hh);
        x.fillRect(X + ww / 2 - 1, Y, 2, hh);
      } else if (name === 'curtain') {
        x.fillStyle = '#20282e';
        x.fillRect(X, Y, 3, hh);
        x.fillStyle = '#c8d0d4';
        x.fillRect(X + cw - 7, Y - ch * 0.12, 7, ch);
        mx.fillStyle = 'rgb(0,60,240)';
        mx.fillRect((X + cw - 7) * k, (Y - ch * 0.12) * k, 7 * k, ch * k);
      } // vertical fins
      else if (name === 'condo') {
        x.strokeStyle = '#d8dcdf';
        x.lineWidth = 3;
        x.strokeRect(X, Y, ww, hh);
        x.fillStyle = '#d8dcdf';
        x.fillRect(X + ww / 2 - 1.5, Y, 3, hh);
        // balcony: glass rail + slab edge across the lower third
        x.fillStyle = 'rgba(200,225,230,0.45)';
        x.fillRect(bx * cw, Y + hh * 0.62, cw, hh * 0.38);
        x.fillStyle = '#fafafa';
        x.fillRect(bx * cw, Y + hh * 0.62, cw, 4);
        x.fillRect(bx * cw, Y + hh, cw, ch * (1 - W[1] - W[3]) + 2);
        x.fillStyle = 'rgba(0,0,0,0.18)';
        x.fillRect(bx * cw, Y + hh + 10, cw, 6);
        if (r() < 0.2) {
          x.fillStyle = '#5c6a54';
          x.beginPath();
          x.arc(X + ww * 0.15, Y + hh * 0.8, 10, 0, 7);
          x.fill();
        } // potted plant
      }
      // night: lit / dark / blinds / curtain-filtered light
      if (r() < dens) {
        ex.globalAlpha = 0.55 + r() * 0.45;
        ex.fillStyle = curtain ? cc : warm ? LIT[(r() * 2) | 0] : LIT[2 + ((r() * 3) | 0)];
        if (name === 'ribbon' || name === 'curtain')
          ex.fillRect(X * k + 1, Y * k + 1, ww * k - 2, hh * k - 2);
        else ex.fillRect(X * k + 1, Y * k + 1, ww * k - 2, hh * k - 2);
        if (blind < 0.3) {
          ex.globalAlpha = 0.7;
          ex.fillStyle = '#000';
          for (let s = Y * k; s < (Y + hh * 0.6) * k; s += 2.5) ex.fillRect(X * k, s, ww * k, 1.2);
        }
        ex.globalAlpha = 1;
      }
    }
    if (name === 'grid' || name === 'punched') {
      x.fillStyle = 'rgba(0,0,0,0.08)';
      x.fillRect(0, fy * ch + ch - 4, S, 4);
    }
    if (name === 'curtain') {
      x.fillStyle = '#28323a';
      x.fillRect(0, fy * ch, S, ch * 0.12);
      mx.fillStyle = 'rgb(0,90,150)';
      mx.fillRect(0, fy * ch * k, E, ch * 0.12 * k);
    }
  }
  if (name === 'grid') {
    x.fillStyle = 'rgba(0,0,0,0.1)';
    for (let bx = 0; bx <= bays; bx++) x.fillRect(bx * cw - 3, 0, 6, S);
  }
  return {
    map: tex(c, true, aniso),
    emissive: tex(e, true, aniso),
    rm: tex(m, false, aniso),
    tileW,
    tileH,
    cells: [bays, floors],
  };
}

export function facadeVariants(renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const out = {};
  let s = 101;
  for (const n of Object.keys(VARIANTS)) out[n] = make(n, (s += 17), aniso);
  return out;
}

// per-building wall atlas: base style -> a variant by hash + zone (neighbours rarely match)
export function pickFacade(style, zone, h01) {
  let opts;
  if (style === 'office')
    opts =
      zone === 'residential'
        ? ['punched', 'condo', 'office', 'grid']
        : ['office', 'punched', 'grid', 'ribbon'];
  else if (style === 'band')
    opts =
      zone === 'residential' || zone === 'business'
        ? ['condo', 'band', 'ribbon', 'condo']
        : ['band', 'ribbon', 'grid'];
  else if (style === 'glass') opts = ['glass', 'curtain', 'glass', 'curtain', 'ribbon'];
  else return style;
  return opts[(h01 * opts.length) | 0];
}
