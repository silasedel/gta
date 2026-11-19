// Marque emblems and lettering, drawn in code (all invented for Southline).
import * as THREE from 'three';
import { canvasTex } from './geo.js';

const cache = new Map();
function chromeGrad(c, y0, y1) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#f6f8fa');
  g.addColorStop(0.45, '#aab2ba');
  g.addColorStop(0.55, '#e9edf0');
  g.addColorStop(1, '#8c949c');
  return g;
}
/** Draw a marque emblem centered in a w x w canvas context. */
export function drawEmblem(c, brand, w, fg) {
  const s = w / 2;
  c.save();
  c.translate(s, s);
  c.lineJoin = 'miter';
  c.strokeStyle = fg || chromeGrad(c, -s, s);
  c.fillStyle = c.strokeStyle;
  if (brand === 'Vireo') {
    // hexagon holding a sharp wing-like V
    c.lineWidth = w * 0.055;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3,
        x = Math.cos(a) * s * 0.86,
        y = Math.sin(a) * s * 0.86;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-s * 0.56, -s * 0.36);
    c.lineTo(-s * 0.3, -s * 0.36);
    c.lineTo(0, s * 0.3);
    c.lineTo(s * 0.3, -s * 0.36);
    c.lineTo(s * 0.56, -s * 0.36);
    c.lineTo(0, s * 0.62);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-s * 0.16, -s * 0.36);
    c.lineTo(s * 0.16, -s * 0.36);
    c.lineTo(0, -s * 0.02);
    c.closePath();
    c.fill();
  } else if (brand === 'Vauclair') {
    // navette (pointed oval) with a center spine and a small star cut
    c.lineWidth = w * 0.05;
    c.beginPath();
    c.moveTo(0, -s * 0.9);
    c.quadraticCurveTo(s * 0.62, 0, 0, s * 0.9);
    c.quadraticCurveTo(-s * 0.62, 0, 0, -s * 0.9);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(0, -s * 0.6);
    c.quadraticCurveTo(s * 0.2, 0, 0, s * 0.6);
    c.quadraticCurveTo(-s * 0.2, 0, 0, -s * 0.6);
    c.fill();
  } else {
    // Merrow: ring with a raptor-wing swoosh
    c.lineWidth = w * 0.05;
    c.beginPath();
    c.arc(0, 0, s * 0.84, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(-s * 0.6, s * 0.18);
    c.quadraticCurveTo(-s * 0.1, -s * 0.62, s * 0.62, -s * 0.3);
    c.quadraticCurveTo(s * 0.05, -s * 0.22, -s * 0.2, s * 0.36);
    c.quadraticCurveTo(-s * 0.36, s * 0.12, -s * 0.6, s * 0.18);
    c.fill();
  }
  c.restore();
}
/** Transparent emblem texture (chrome on clear). */
export function emblemTex(brand, dark = false) {
  const k = 'e|' + brand + dark;
  if (!cache.has(k))
    cache.set(
      k,
      canvasTex(256, 256, (c) => {
        if (dark) {
          c.fillStyle = '#08080a';
          c.beginPath();
          c.arc(128, 128, 126, 0, 7);
          c.fill();
        }
        drawEmblem(c, brand, 256);
      }),
    );
  return cache.get(k);
}
/** Lettering texture: chrome (or colored) capitals on transparent, tight to the text. Returns { tex, aspect }. */
export function wordTex(
  text,
  color,
  font = 'italic 700 96px "Helvetica Neue", Arial, sans-serif',
  spacing = 10,
) {
  const k = 'w|' + text + color + font;
  if (!cache.has(k)) {
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const wd = Math.ceil(m.measureText(text).width + spacing * text.length + 24),
      h = 128;
    const tex = canvasTex(wd, h, (c) => {
      c.font = font;
      c.textBaseline = 'middle';
      c.fillStyle = color || chromeGrad(c, 20, 108);
      let x = 12;
      for (const ch of text) {
        c.fillText(ch, x, h / 2 + 4);
        x += c.measureText(ch).width + spacing;
      }
    });
    cache.set(k, { tex, aspect: wd / h });
  }
  return cache.get(k);
}
const decalMats = new Map();
/** Decal material for an emblem / word texture (drawn just above a surface). */
export function decalMat(tex, opts = {}) {
  const k = tex.uuid + (opts.matte ? 'm' : '');
  if (!decalMats.has(k))
    decalMats.set(
      k,
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.08,
        metalness: opts.matte ? 0.1 : 0.95,
        roughness: opts.matte ? 0.6 : 0.22,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        depthWrite: false,
      }),
    );
  return decalMats.get(k);
}
/** Southline "Southline" license plate texture with a seeded number. */
export function plateTex(seed = 1) {
  let s = seed >>> 0 || 1;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const A = 'ABCDEFGHJKLMNPRSTUVWXYZ',
    l = () => A[(r() * A.length) | 0],
    d = () => (r() * 10) | 0;
  const code = `${l()}${l()}${l()} ${d()}${l()}${d()}`;
  const tex = canvasTex(512, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#fdf8ee');
    g.addColorStop(1, '#f1dcb6');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#1b3f73';
    c.lineWidth = 10;
    c.strokeRect(9, 9, 494, 238);
    c.fillStyle = '#e0602a';
    c.beginPath();
    c.arc(256, 62, 30, Math.PI, 0);
    c.fill();
    c.fillStyle = '#1b3f73';
    c.font = 'bold 40px Arial';
    c.textAlign = 'center';
    c.fillText('SOUTHLINE', 256, 58);
    c.fillStyle = '#122a4c';
    c.font = 'bold 104px "Courier New", monospace';
    c.fillText(code, 256, 180);
    c.font = '24px Arial';
    c.fillText('SUNSHINE COAST', 256, 228);
  });
  return { tex, code };
}
