// r7: products made from the user's library packs (Models/Products: Product Set 1-3, relabeled with our made-up brands by
// tools/v2/interiors/relabel.py, split per product by tools/v2/interiors/split_products.py into ../models/products/).
// Each mesh becomes a product FORM whose label cell is the part of the model's texture it actually uses (cropped into the
// shared atlas), so library products are instanced, takeable, priced and baked exactly like the code-built ones.
// Loaded with the other library models (kit/models.js preloadModels); planograms may list these ids before they load
// (shelfRun skips unknown products).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { registerProducts } from './catalog.js';
import { registerForm, uvL, uvS } from './forms.js';

const U = (f) => new URL('../models/products/' + f, import.meta.url).href;
const P = (id, name, price, category, x = {}) => ({ id, name, price, category, ...x });
// file -> products (pack files list the node name of each product)
const SINGLE = [
  P('mp-cereal', "Spunky Unkey's Gooey Milk-O's", 4.79, 'food'), P('mp-granola', 'G4 Granola Bars', 3.99, 'food'), P('mp-jam', "Devil's Jam", 3.49, 'food'),
  P('mp-ketchup', 'Fancy Tomato Ketchup', 2.99, 'food'), P('mp-mustard', 'Yellow Mustard', 2.49, 'food'), P('mp-schlorp', 'Schlorp Sauce', 2.79, 'food'), P('mp-mayo', "Her Mayonnaise", 3.99, 'food'),
  P('mp-milkchoc', 'Chocolate Milk Carton', 2.49, 'drink', { shelf: 'cooler' }), P('mp-milkstraw', 'Strawberry Milk Carton', 2.49, 'drink', { shelf: 'cooler' }), P('mp-milkdrink', 'YYY Milk Drink', 1.99, 'drink', { shelf: 'cooler' }),
  P('mp-milkjug', 'Char Siu Milk Jug', 4.29, 'drink', { shelf: 'cooler' }), P('mp-powder', 'Powdered Drink Mix', 5.49, 'food'), P('mp-soup', 'Chicken Soup', 1.79, 'food'), P('mp-wine', 'WfB Table Red', 8.99, 'drink', { age: 21 }),
  P('mp-tuna', 'Tuna in Oil', 1.59, 'food'), P('mp-beans', 'Baked Beans', 1.69, 'food'), P('mp-choco', 'Cocoa Tin', 4.99, 'food'), P('mp-coffee', 'Cafecio Ground Coffee', 7.49, 'food'), P('mp-sauce', 'Glass Jar Sauce', 3.29, 'food'), P('mp-tea', 'Herbal Tea Box', 3.99, 'food'),
];
const CHIPS = Array.from({ length: 29 }, (_, i) => P('mp-chips' + i, ['Crunchero', 'Quesitos', 'Don Pepe', 'Crispo'][i % 4] + ' Snack Bag', 1.99 + (i % 3) * 0.5, 'food', { junk: true, bites: 4 }));
export const MODEL_IDS = { dry: ['mp-cereal', 'mp-granola', 'mp-tea', 'mp-coffee', 'mp-choco', 'mp-powder'], sauce: ['mp-ketchup', 'mp-mustard', 'mp-schlorp', 'mp-mayo', 'mp-jam', 'mp-sauce'],
  canned: ['mp-soup', 'mp-tuna', 'mp-beans'], cooler: ['mp-milkchoc', 'mp-milkstraw', 'mp-milkdrink', 'mp-milkjug'], wine: ['mp-wine'], chips: CHIPS.map((p) => p.id) };

let started = null;
export function loadModelProducts() {
  if (started) return started; if (/[?&]nomp=1\b/.test(globalThis.location?.search || '')) return (started = Promise.resolve()); const gl = new GLTFLoader();
  const one = async (url, list) => { let scene; try { scene = (await gl.loadAsync(url)).scene; } catch (e) { console.warn('[interiors] model product missing', url, e?.message); return; } scene.updateMatrixWorld(true);
    for (const p of list) { let mesh = null; scene.traverse((o) => { if (o.isMesh && !mesh && (list.length === 1 || o.name === p.id || o.parent?.name === p.id)) mesh = o; }); if (!mesh) continue; try { make(p, mesh); } catch (e) { console.warn('[interiors] model product', p.id, e); } } };
  started = Promise.all([...SINGLE.map((p) => one(U(p.id + '.glb'), [p])), one(U('mp-chips.glb'), CHIPS)]);
  return started;
}
function make(p, mesh) {
  const g0 = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); g0.applyMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).setPosition(0, 0, 0));
  g0.computeBoundingBox(); const b = g0.boundingBox; g0.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); // base on the floor, centered
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, img = mat?.map?.image, uv = g0.attributes.uv;
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0; if (uv) for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  if (!(u1 > u0) || !(v1 > v0)) { u0 = v0 = 0; u1 = v1 = 1; }
  // crop of the model's own texture: the label cell of this product
  let crop = null, color = '#' + (mat?.color?.getHexString?.() || 'cccccc');
  if (img && img.width) { const W = img.width, H = img.height, sx = u0 * W, sy = v0 * H, sw = Math.max(2, (u1 - u0) * W), sh = Math.max(2, (v1 - v0) * H), k = Math.min(1, 256 / Math.max(sw, sh));
    crop = document.createElement('canvas'); crop.width = Math.max(4, Math.round(sw * k)); crop.height = Math.max(4, Math.round(sh * k)); crop.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, crop.width, crop.height); }
  const n = g0.attributes.position.count, out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { if (!uv || !crop) { const s = uvS(1); out[i * 2] = s[0]; out[i * 2 + 1] = s[1]; continue; } const r = uvL((uv.getX(i) - u0) / (u1 - u0), 1 - (uv.getY(i) - v0) / (v1 - v0)); out[i * 2] = r[0]; out[i * 2 + 1] = r[1]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', g0.attributes.position); g.setAttribute('normal', g0.attributes.normal || (g0.computeVertexNormals(), g0.attributes.normal)); g.setAttribute('uv', new THREE.Float32BufferAttribute(out, 2));
  g.computeBoundingBox(); const bb = g.boundingBox; g.userData = { size: { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z }, shared: true, hold: 'hand' };
  const aspect = crop ? Math.min(3, Math.max(0.4, crop.width / crop.height)) : 1;
  registerForm('m:' + p.id, { aspect, px: 192, build: () => g });
  registerProducts([{ brand: 'generic', shelf: 'shelf', ...p, form: 'm:' + p.id, params: {}, art: crop ? { style: 'image', img: crop } : { style: 'plain', bg: color }, swatch: ['#c8ccd0', color, '#ffffff', '#9aa0a6'] }]);
}
