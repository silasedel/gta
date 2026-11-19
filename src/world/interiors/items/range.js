// r7 product range: the full-store assortment for grocery, liquor, pharmacy, pawn, gun counter and barber shelves (provisional,
// replaced by the design system when it defines the same ids). Products of one department share a few standard pack sizes, so a
// whole aisle of distinct brands is still a handful of instanced draw calls (one per shape and atlas page).
// Export DEPT: department -> product ids, used by the store types' planograms.
import * as THREE from 'three';
import { registerBrands, registerProducts } from './catalog.js';
import { registerForm, uvL, uvS } from './forms.js';

// ---------------------------------------------------------------- extra shapes
// spirits: square-shouldered fifth; params { r, h, neck (share), sq (0 round .. 1 flask-like) }
registerForm('spirit', { aspect: 1.9, px: 140, build(F, p) { const r = p.r || 0.042, h = p.h || 0.29, nk = p.neck ?? 0.3, nr = r * 0.34, b = h * (1 - nk);
  F.lathe([[r * 0.92, 0], [r, 0.01], [r, b], [r * 0.88, b + h * 0.03], [nr * 1.25, b + h * 0.09], [nr, b + h * 0.12], [nr, h - 0.03], [nr * 1.3, h - 0.028], [nr * 1.3, h]], (u, y) => (y > b * 0.28 && y < b * 0.78 ? uvL(u, (y - b * 0.28) / (b * 0.5)) : y > h - 0.03 ? uvS(0) : uvS(1)), p.seg || 14); // label band mid-body: the liquid shows above and below
  if (p.sq) F.box(r * 1.7, b * 0.7, r * 0.2, 0, b * 0.45, 0, 1); return F.done({ hold: 'bottle' }); } });
// wine: punt base, long shoulder, foil capsule (swatch 0)
registerForm('wine', { aspect: 2.0, px: 120, build(F, p) { const r = p.r || 0.038, h = p.h || 0.3, nr = r * 0.4;
  F.lathe([[r * 0.95, 0], [r, 0.01], [r, h * 0.58], [r * 0.7, h * 0.7], [nr, h * 0.8], [nr, h * 0.86], [nr * 1.06, h * 0.87], [nr * 1.06, h]], (u, y) => (y > h * 0.14 && y < h * 0.5 ? uvL(u, (y - h * 0.14) / (h * 0.36) * 0.8) : y > h * 0.86 ? uvS(0) : uvS(1)), 14); return F.done({ hold: 'bottle' }); } });
// produce: a squashed sphere in the label's skin art; params { r, sy, n (stem) }
registerForm('fruit', { aspect: 1, px: 48, build(F, p) { const r = p.r || 0.04; F.sphere(r, 0, r * (p.sy || 0.9), 0, (u, v) => uvL(u, v), 9, [1, p.sy || 0.9, 1]); if (p.stem !== false) F.cyl(0.003, 0.002, 0.012, 0, r * (p.sy || 0.9) * 2 + 0.004, 0, 0, 4); return F.done({ hold: 'hand', food: true }); } });
// barber / beauty: pump bottle (shampoo, tonic) and squat tin (pomade)
registerForm('pump', { aspect: 1.6, px: 110, build(F, p) { const r = p.r || 0.035, h = p.h || 0.19; F.lathe([[r * 0.9, 0], [r, 0.01], [r, h * 0.86], [r * 0.5, h * 0.95], [r * 0.3, h]], (u, y) => (y > h * 0.1 && y < h * 0.82 ? uvL(u, (y - h * 0.1) / (h * 0.72) * 0.8) : uvS(1)), 12);
  F.cyl(0.008, 0.008, 0.04, 0, h + 0.02, 0, 0, 6); F.box(0.012, 0.012, 0.05, 0, h + 0.04, 0.018, 0); return F.done({ hold: 'bottle' }); } });
// ammo / small hard boxes reuse 'box'; a pistol case: flat hard case with handle
registerForm('hardcase', { aspect: 2, px: 90, build(F, p) { const w = p.w || 0.34, h = p.h || 0.08, d = p.d || 0.26; F.geo(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation(0, h / 2, 0), (u, v, pos, n) => (n.y > 0.5 ? uvL(pos.x / w + 0.5, 0.5 - pos.z / d) : uvS(1))); F.box(0.1, 0.02, 0.025, 0, h * 0.6, d / 2 + 0.012, 3); return F.done({ hold: 'hand' }); } });

// ---------------------------------------------------------------- brands
const B = (id, name, primary, secondary, accent, logo = {}, extra = {}) => ({ id, name, palette: { primary, secondary, accent, onPrimary: logo.on }, logo, ...extra });
registerBrands([
  B('sunmill', 'Sunmill', '#f2b01e', '#c8102e', '#ffffff', { font: 'round', shape: 'burst', icon: 'sun', ink: '#c8102e' }), B('cocobay', 'Coco Bay', '#5a2a14', '#ffd21f', '#ffffff', { font: 'script', shape: 'plain', on: '#ffd21f', icon: 'palm' }),
  B('mesa', 'Mesa', '#1554c0', '#ffffff', '#ffd21f', { font: 'serif', shape: 'oval', ink: '#1554c0' }), B('riola', 'Riola', '#f4efe2', '#1f7a3d', '#c8102e', { font: 'slab', shape: 'badge', ink: '#ffffff' }),
  B('nonna', 'Nonna Rita', '#7a0f2a', '#f1e9d6', '#1f7a3d', { font: 'script', shape: 'oval', ink: '#7a0f2a' }), B('oro', 'ORO', '#e8c23a', '#1f4d3a', '#ffffff', { font: 'deco', shape: 'plain', upper: true, on: '#1f4d3a' }),
  B('sweetfield', 'Sweetfield', '#ffffff', '#1c75bc', '#e23b3b', { font: 'serif', shape: 'underline', on: '#1c75bc' }), B('goldcrest', 'Goldcrest', '#1b2a6b', '#e8c23a', '#ffffff', { font: 'serif', shape: 'badge', ink: '#1b2a6b' }),
  B('bahia', 'Café Bahía', '#16181c', '#c9a24a', '#c8102e', { font: 'deco', shape: 'underline', on: '#c9a24a', icon: 'bean' }), B('palmetto', 'Palmetto', '#1fa3a3', '#ffffff', '#ff6f59', { font: 'round', shape: 'slant', ink: '#1fa3a3', icon: 'leaf' }),
  B('brightwave', 'Brightwave', '#35c6f4', '#1554c0', '#ffd21f', { font: 'impact', shape: 'burst', ink: '#ffffff', upper: true, icon: 'wave' }), B('softa', 'Softa', '#e9f6fb', '#7a3fb0', '#ff5fa2', { font: 'round', shape: 'plain', on: '#7a3fb0' }),
  B('happypaws', 'Happy Paws', '#ff8a1f', '#1554c0', '#ffffff', { font: 'round', shape: 'badge', ink: '#ffffff' }), B('kettle', 'Kettle King', '#c8102e', '#f6efe0', '#1b2a6b', { font: 'slab', shape: 'plain', on: '#f6efe0' }),
  B('verde', 'Verde Valle', '#1f7a3d', '#f7e93c', '#ffffff', { font: 'block', shape: 'slant', ink: '#1f7a3d' }), B('lacasa', 'La Casa', '#f2f0e6', '#c8102e', '#1f7a3d', { font: 'slab', shape: 'oval', ink: '#ffffff' }),
  B('crisp', 'CRISPO', '#ff5c1a', '#ffe14d', '#16181c', { font: 'impact', shape: 'burst', upper: true, ink: '#ff5c1a' }), B('mediplus', 'MediPlus', '#ffffff', '#1c75bc', '#19c37d', { font: 'deco', shape: 'plain', on: '#1c75bc', icon: 'drop' }),
  B('dentiq', 'Dentiq', '#e9f6fb', '#12a8e0', '#ffffff', { font: 'round', shape: 'underline', on: '#12a8e0' }), B('nightjar', 'Nightjar', '#0b0f1e', '#9fb8ff', '#ffffff', { font: 'serif', shape: 'plain', on: '#9fb8ff', icon: 'bird' }),
  // spirits and wine
  B('capitan', 'Capitán Rojo', '#7a0f1a', '#e8c23a', '#16181c', { font: 'serif', shape: 'badge', ink: '#7a0f1a' }), B('heron', 'Silver Heron', '#e9eef2', '#1b2a6b', '#9aa0a6', { font: 'deco', shape: 'plain', on: '#1b2a6b', icon: 'bird', upper: true }),
  B('mangrove', 'Old Mangrove', '#2a1a0c', '#e8c23a', '#f1e9d6', { font: 'slab', shape: 'oval', ink: '#2a1a0c' }), B('agaveluna', 'Agave Luna', '#f1e9d6', '#1f4d3a', '#c9a24a', { font: 'script', shape: 'plain', on: '#1f4d3a' }),
  B('marisol', 'Marisol', '#f6efe0', '#7a0f2a', '#c9a24a', { font: 'script', shape: 'underline', on: '#7a0f2a' }), B('brisa', 'Brisa', '#ffffff', '#1fa3a3', '#f2b01e', { font: 'serif', shape: 'plain', on: '#1fa3a3' }),
  B('kingfish', 'Kingfish', '#0d2a4a', '#f2b01e', '#ffffff', { font: 'block', shape: 'plain', on: '#f2b01e', icon: 'fish', upper: true }), B('cocoloco', 'Coco Loco', '#ffffff', '#3a9a3a', '#5a2a14', { font: 'round', shape: 'burst', ink: '#5a2a14', icon: 'palm' }),
  B('bayou', 'Bayou Gold', '#3a2412', '#d9a23a', '#ffffff', { font: 'slab', shape: 'badge', ink: '#3a2412' }), B('hurricane', 'Hurricane Malt', '#16181c', '#ff3b30', '#ffffff', { font: 'impact', shape: 'slant', ink: '#ffffff', upper: true }),
  // sporting / gun counter (gear and ammo, never weapons for sale on the shelf)
  B('ironpine', 'Ironpine', '#2f3a2a', '#e8b81e', '#ffffff', { font: 'block', shape: 'plain', on: '#e8b81e', upper: true }), B('redhawk', 'Redhawk', '#c8102e', '#16181c', '#ffffff', { font: 'impact', shape: 'slant', ink: '#ffffff', upper: true, icon: 'bird' }),
  B('tactix', 'TACTIX', '#16181c', '#8a9a5a', '#ffffff', { font: 'deco', shape: 'plain', on: '#8a9a5a', upper: true }),
  // barber
  B('kingsblade', "King's Blade", '#0b0b0d', '#c9a24a', '#ffffff', { font: 'serif', shape: 'oval', ink: '#0b0b0d' }), B('slickback', 'Slickback', '#1b2a6b', '#e23b3b', '#ffffff', { font: 'script', shape: 'plain', on: '#ffffff' }),
  B('farmfresh', 'Fresh', '#3a9a3a', '#ffffff', '#ffffff', { font: 'round', shape: 'plain' }),
]);

// ---------------------------------------------------------------- products
const list = [], DEPT = {}; const BOXL = { w: 0.19, h: 0.28, d: 0.065 }, BOXM = { w: 0.14, h: 0.2, d: 0.05 }, BOXS = { w: 0.1, h: 0.14, d: 0.04 };
const add = (dept, id, name, brand, form, params, price, art, x = {}) => { list.push({ id, name, brand, form, params, price, art, category: x.category || dept, shelf: 'shelf', ...x }); (DEPT[dept] ||= []).push(id); };
// cereal (one big box size): 8 brands x flavors
[['sunmill', 'Sunmill Honey Rings', '#f2b01e', '#c8102e', 'sun'], ['sunmill', 'Sunmill Frosted Flakes', '#1c75bc', '#ffd21f', 'star'], ['cocobay', 'Coco Bay Puffs', '#5a2a14', '#ffd21f', 'palm'], ['cocobay', 'Coco Bay Crunch', '#c8102e', '#f6efe0', 'palm'],
  ['goldcrest', 'Goldcrest Oats', '#1b2a6b', '#e8c23a', 'leaf'], ['goldcrest', 'Goldcrest Bran', '#7a3b1d', '#f1e9d6', 'leaf'], ['verde', 'Verde Granola', '#1f7a3d', '#f7e93c', 'leaf'], ['sunmill', 'Sunmill Fruit Loops', '#7a3fb0', '#ffd21f', 'citrus']].forEach(([b, n, bg, bg2, ic], i) =>
  add('cereal', 'cereal-' + i, n, b, 'box', BOXL, 4.49 + (i % 3), { style: 'box', bg, bg2, icon: ic, iconC: bg2, flavor: n.split(' ').slice(1).join(' ') }, { category: 'food' }));
// crackers and cookies (medium box)
[['goldcrest', 'Goldcrest Butter Crackers', '#c8102e', '#e8c23a'], ['goldcrest', 'Goldcrest Saltines', '#1c75bc', '#ffffff'], ['crisp', 'Crispo Cheese Bites', '#ff5c1a', '#ffe14d'], ['cocobay', 'Coco Bay Cookies', '#5a2a14', '#ffd21f'], ['lacasa', 'La Casa Galletas', '#f2f0e6', '#c8102e'], ['sunmill', 'Sunmill Wafers', '#ff5fa2', '#ffffff']].forEach(([b, n, bg, bg2], i) =>
  add('cookies', 'cookie-' + i, n, b, 'box', BOXM, 3.29 + (i % 2), { style: 'box', bg, bg2, icon: 'chip', iconC: bg2, flavor: n.split(' ').slice(-1)[0] }, { category: 'food' }));
// pasta + rice (bags), beans and veg (tins), sauces (jars)
['Spaghetti', 'Penne', 'Rotini', 'Elbows'].forEach((f, i) => add('pasta', 'pasta-' + i, 'Mesa ' + f, 'mesa', 'box', { w: 0.16, h: 0.24, d: 0.05 }, 1.79, { style: 'box', bg: '#1554c0', bg2: '#ffffff', flavor: f }, { category: 'food' }));
['Long Grain', 'Jasmine', 'Yellow Rice'].forEach((f, i) => add('pasta', 'rice-' + i, 'Riola ' + f, 'riola', 'bag', { w: 0.17, h: 0.25, d: 0.06 }, 2.99, { style: 'bag', bg: ['#f4efe2', '#e9f6fb', '#f2c81e'][i], bg2: '#1f7a3d', flavor: f, burst: false }, { category: 'food' }));
[['abuela', 'Black Beans', '#1a1a1a'], ['abuela', 'Red Kidney', '#8a1a1a'], ['verde', 'Sweet Corn', '#f2c81e'], ['verde', 'Cut Green Beans', '#3a9a3a'], ['kettle', 'Tomato Soup', '#c8102e'], ['kettle', 'Clam Chowder', '#e9e1cc'], ['lacasa', 'Garbanzos', '#d9b26a'], ['verde', 'Diced Tomatoes', '#d8432e']].forEach(([b, n, c], i) =>
  add('canned', 'can-' + i, n, b, 'tin', {}, 1.29 + (i % 3) * 0.4, { style: 'wrap', bg2: c, flavor: n, icon: 'bean', iconC: c }, { category: 'food' }));
[['nonna', 'Marinara', '#c8102e'], ['nonna', 'Tomato Basil', '#3a9a3a'], ['nonna', 'Vodka Sauce', '#ff7a6a'], ['lacasa', 'Salsa Roja', '#c8102e'], ['lacasa', 'Mojo Criollo', '#f2c81e'], ['oro', 'Peanut Butter', '#c9772b']].forEach(([b, n, c], i) =>
  add('sauce', 'jar-' + i, n, b, 'jar', { r: 0.043, h: 0.15 }, 3.49, { style: 'wrap', bg2: c, flavor: n }, { category: 'food' }));
[['oro', 'Vegetable Oil', '#e8c23a'], ['oro', 'Olive Oil', '#5a7a2a'], ['lacasa', 'Hot Sauce', '#c8102e'], ['kettle', 'Ketchup', '#b8101e']].forEach(([b, n, c], i) =>
  add('sauce', 'oil-' + i, n, b, 'bottle', { r: 0.038, h: 0.26, l0: 0.3, l1: 0.7 }, 3.99, { style: 'wrap', bg2: c, flavor: n }, { category: 'food', swatch: [c, c, '#ffffff', '#ccc'] }));
['Sugar', 'Flour', 'Cornmeal'].forEach((f, i) => add('baking', 'bake-' + i, 'Sweetfield ' + f, 'sweetfield', 'bag', { w: 0.2, h: 0.28, d: 0.09 }, 3.49, { style: 'bag', bg: '#ffffff', bg2: ['#1c75bc', '#c8102e', '#f2b01e'][i], flavor: f, burst: false }, { category: 'food' }));
['Dark Roast', 'Espresso', 'Café con Leche'].forEach((f, i) => add('baking', 'coffee-bag-' + i, 'Café Bahía ' + f, 'bahia', 'bag', { w: 0.13, h: 0.22, d: 0.07 }, 6.99, { style: 'bag', bg: ['#16181c', '#7a0f1a', '#c9772b'][i], bg2: '#c9a24a', flavor: f, burst: false }, { category: 'food' }));
// household: detergent jugs, cleaner bottles, paper rolls, dish soap
['Ocean Fresh', 'Free & Clear', 'Tropical'].forEach((f, i) => add('household', 'det-' + i, 'Brightwave ' + f, 'brightwave', 'jug', { w: 0.17, h: 0.29 }, 11.99, { style: 'plain', bg: ['#35c6f4', '#f4f4f4', '#ff8a1f'][i], bg2: '#1554c0', flavor: f }, { category: 'household', swatch: ['#1554c0', ['#35c6f4', '#f4f4f4', '#ff8a1f'][i], '#fff', '#ccc'] }));
['Lemon', 'Lavender', 'Bleach'].forEach((f, i) => add('household', 'clean-' + i, 'Palmetto ' + f, 'palmetto', 'bottle', { r: 0.04, h: 0.27, l0: 0.25, l1: 0.75 }, 4.29, { style: 'wrap', bg: ['#f7e93c', '#b89adf', '#ffffff'][i], bg2: '#1fa3a3', flavor: f }, { category: 'household', swatch: ['#ffffff', ['#f7e93c', '#b89adf', '#e9f6fb'][i], '#1fa3a3', '#ccc'] }));
['Paper Towels', 'Bath Tissue'].forEach((f, i) => add('paper', 'paper-' + i, 'Softa ' + f, 'softa', 'roll', { r: 0.062, h: i ? 0.11 : 0.27 }, i ? 1.29 : 2.49, { style: 'wrap', bg: '#e9f6fb', bg2: '#7a3fb0', flavor: f }, { category: 'household' }));
// pet food (big bags) and cans
['Chicken', 'Beef', 'Salmon'].forEach((f, i) => add('pet', 'pet-' + i, 'Happy Paws ' + f, 'happypaws', 'bag', { w: 0.26, h: 0.31, d: 0.1 }, 14.99, { style: 'bag', bg: ['#ff8a1f', '#8a1a1a', '#ff7a6a'][i], bg2: '#1554c0', flavor: f, icon: 'star' }, { category: 'household' }));
// health and beauty (small boxes, pump bottles)
[['mediplus', 'Allergy Relief', '#1c75bc'], ['mediplus', 'Cold & Flu', '#c8102e'], ['mediplus', 'Antacid', '#19c37d'], ['nightjar', 'Sleep Aid', '#0b0f1e'], ['mediplus', 'Vitamin C', '#ff8a1f'], ['mediplus', 'Bandages', '#e23b3b']].forEach(([b, n, c], i) =>
  add('health', 'med-' + i, n, b, 'box', BOXS, 5.99 + i, { style: 'box', bg: '#ffffff', bg2: c, flavor: n, burst: false }, { category: 'health' }));
[['dentiq', 'Toothpaste', '#12a8e0'], ['dentiq', 'Mouthwash', '#19c37d'], ['palmetto', 'Body Wash', '#1fa3a3'], ['softa', 'Shampoo', '#7a3fb0'], ['softa', 'Conditioner', '#ff5fa2'], ['palmetto', 'Lotion', '#f1e9d6']].forEach(([b, n, c], i) =>
  add('beauty', 'hb-' + i, n, b, i === 0 ? 'box' : 'pump', i === 0 ? { w: 0.19, h: 0.05, d: 0.045 } : { r: 0.034, h: 0.2 }, 4.99 + i, { style: i ? 'wrap' : 'box', bg: '#ffffff', bg2: c, flavor: n }, { category: 'health', swatch: ['#ffffff', c, '#ffffff', '#ccc'] }));
// dairy and fridge (cooler shelves): milk jugs exist; yogurt tubs, cheese, juice cartons, eggs (box)
['Strawberry', 'Vanilla', 'Mango', 'Plain'].forEach((f, i) => add('dairy', 'yog-' + i, 'Vaca Feliz Yogurt ' + f, 'vacafeliz', 'tub', { r: 0.048, h: 0.1 }, 3.49, { style: 'wrap', bg: '#ffffff', bg2: ['#ff5fa2', '#f1e2c2', '#ffb21f', '#1c75bc'][i], flavor: f }, { category: 'food' }));
['Orange Juice', 'Apple Juice', 'Guava Nectar'].forEach((f, i) => add('dairy', 'juice-' + i, 'Sunmill ' + f, 'sunmill', 'carton', { w: 0.095, h: 0.25 }, 3.99, { style: 'box', bg: ['#ff9a1f', '#d9e84a', '#ff7a8a'][i], bg2: '#1f7a3d', flavor: f, icon: 'citrus', iconC: '#ffd21f' }, { category: 'food' }));
add('dairy', 'eggs', 'Fresh Large Eggs', 'farmfresh', 'box', { w: 0.3, h: 0.07, d: 0.11 }, 4.29, { style: 'box', bg: '#f1e9d6', bg2: '#3a9a3a', flavor: '12 Large', burst: false }, { category: 'food' });
// frozen (boxes in the freezer doors)
['Pepperoni Pizza', 'Cheese Pizza', 'Chicken Nuggets', 'Ice Cream Vanilla', 'Ice Cream Chocolate', 'Mixed Veg'].forEach((f, i) => add('frozen', 'frz-' + i, f, ['nonna', 'nonna', 'kettle', 'cocobay', 'cocobay', 'verde'][i], i > 2 && i < 5 ? 'tub' : 'box', i > 2 && i < 5 ? { r: 0.07, h: 0.13 } : i < 2 ? { w: 0.27, h: 0.27, d: 0.05 } : BOXM, 5.99, { style: i > 2 && i < 5 ? 'wrap' : 'box', bg: ['#c8102e', '#f2c81e', '#ff8a1f', '#f1e2c2', '#5a2a14', '#3a9a3a'][i], bg2: '#ffffff', flavor: f }, { category: 'food' }));
// produce (loose, in bins)
[['Red Apple', [190, 30, 40], 0.038, 0.9], ['Green Apple', [130, 190, 60], 0.037, 0.9], ['Orange', [240, 140, 30], 0.04, 0.95], ['Lemon', [240, 220, 60], 0.03, 0.8], ['Lime', [90, 170, 50], 0.026, 0.9], ['Tomato', [210, 40, 30], 0.035, 0.8], ['Onion', [190, 140, 80], 0.04, 0.85], ['Avocado', [50, 70, 30], 0.042, 1.25], ['Mango', [240, 170, 40], 0.045, 1.2], ['Potato', [170, 130, 80], 0.04, 0.75]].forEach(([n, c, r, sy], i) =>
  add('produce', 'fruit-' + i, n, 'farmfresh', 'fruit', { r, sy, stem: i < 3 }, 0.79, { style: 'skin', bg: c }, { category: 'food', swatch: ['#4a3a1a', '#3a6b2a', '#3a6b2a', '#ccc'] }));
// spirits, wine, mixers
const SP = [['capitan', 'Capitán Rojo Gold Rum', '#c97a1a', 0.3], ['capitan', 'Capitán Rojo Spiced', '#8a3a12', 0.3], ['heron', 'Silver Heron Vodka', '#b8c6cc', 0.26], ['heron', 'Silver Heron Citrus', '#c6cca0', 0.26], ['mangrove', 'Old Mangrove Bourbon', '#9a4a12', 0.36], ['mangrove', 'Old Mangrove Rye', '#7a3a10', 0.36],
  ['agaveluna', 'Agave Luna Blanco', '#bcc6bc', 0.32], ['agaveluna', 'Agave Luna Reposado', '#d9a23a', 0.32], ['kingfish', 'Kingfish Gin', '#9cc4c0', 0.28], ['cocoloco', 'Coco Loco Coconut Rum', '#d8d8d0', 0.3], ['bayou', 'Bayou Gold Whiskey', '#b8641a', 0.34], ['capitan', 'Capitán Añejo', '#6a2a0c', 0.3]];
SP.forEach(([b, n, liq, nk], i) => add('spirits', 'sp-' + i, n, b, 'spirit', { r: [0.041, 0.041, 0.038, 0.038, 0.043, 0.043, 0.04, 0.04, 0.039, 0.04, 0.042, 0.041][i], h: 0.29, neck: nk }, 14.99 + (i % 4) * 6, { style: 'wrap', flavor: n.split(' ').slice(-1)[0], burst: false }, { category: 'drink', age: 21, swatch: ['#16181c', liq, '#ffffff', '#ccc'], effects: [{ type: 'drunk', amount: 2, seconds: 200 }] }));
SP.slice(0, 8).forEach(([b, n, liq], i) => add('minis', 'mini-' + i, n + ' 50 ml', b, 'spirit', { r: 0.014, h: 0.1, neck: 0.3, seg: 8 }, 2.49, { style: 'wrap', flavor: 'Mini', burst: false }, { category: 'drink', age: 21, shelf: 'counter', swatch: ['#16181c', liq, '#ffffff', '#ccc'] }));
[['marisol', 'Marisol Cabernet', '#3a0a14', '#7a0f2a'], ['marisol', 'Marisol Merlot', '#3a0a14', '#9a1a3a'], ['brisa', 'Brisa Pinot Grigio', '#c9d68a', '#1fa3a3'], ['brisa', 'Brisa Rosé', '#f2a0a0', '#ff5fa2'], ['marisol', 'Marisol Chardonnay', '#d9c46a', '#c9a24a'], ['brisa', 'Brisa Moscato', '#e8e08a', '#f2b01e']].forEach(([b, n, glass, foil], i) =>
  add('wine', 'wine-' + i, n, b, 'wine', {}, 9.99 + i * 2, { style: 'wrap', bg: '#f6efe0', bg2: foil, flavor: n.split(' ').slice(-1)[0], burst: false }, { category: 'drink', age: 21, swatch: [foil, glass, '#ffffff', '#ccc'] }));
[['hurricane', 'Hurricane Malt 40', '#3a1a0a'], ['bayou', 'Bayou Lager 24 oz', '#5a3a10']].forEach(([b, n, glass], i) => add('beer', 'tall-' + i, n, b, 'glassbottle', { r: 0.036, h: 0.3 }, 3.49, { style: 'wrap', flavor: i ? 'Lager' : 'Malt Liquor' }, { category: 'drink', age: 21, swatch: ['#c9a24a', glass, '#ffffff', '#ccc'] }));
// gun counter gear: ammo boxes, targets, cleaning kits, cases, ear muffs (boxes); no firearms as shelf items
[['ironpine', '9mm FMJ 50 rd', '#e8b81e'], ['ironpine', '.45 ACP 50 rd', '#c8102e'], ['redhawk', '12 GA Buckshot', '#c8102e'], ['redhawk', '.223 REM 20 rd', '#16181c'], ['tactix', '.38 SPL 50 rd', '#8a9a5a'], ['ironpine', '.22 LR 500 rd', '#1c75bc']].forEach(([b, n, c], i) =>
  add('ammo', 'ammo-' + i, n, b, 'box', i === 5 ? { w: 0.15, h: 0.08, d: 0.1 } : { w: 0.11, h: 0.07, d: 0.07 }, 18.99 + i * 3, { style: 'box', bg: c, bg2: '#ffffff', flavor: n, burst: false }, { category: 'ammo', age: 21 }));
[['tactix', 'Gun Cleaning Kit', '#16181c'], ['ironpine', 'Paper Targets', '#f1e9d6'], ['tactix', 'Shooting Glasses', '#8a9a5a'], ['redhawk', 'Ear Protection', '#c8102e']].forEach(([b, n, c], i) =>
  add('gear', 'gear-' + i, n, b, 'blister', { w: 0.13, h: 0.2 }, 12.99 + i * 5, { style: 'card', bg: c, bg2: '#ffffff', flavor: n, burst: false }, { category: 'gear', shelf: 'peg' }));
add('gear', 'case-0', 'Hard Pistol Case', 'tactix', 'hardcase', {}, 39.99, { style: 'plain', bg: '#16181c' }, { category: 'gear', swatch: ['#16181c', '#222428', '#8a9a5a', '#888'] });
// barber retail
[['kingsblade', 'Matte Pomade', '#0b0b0d'], ['kingsblade', 'Shine Pomade', '#c9a24a'], ['slickback', 'Hold Wax', '#1b2a6b'], ['slickback', 'Fiber Paste', '#e23b3b']].forEach(([b, n, c], i) => add('barber', 'pomade-' + i, n, b, 'tub', { r: 0.042, h: 0.045 }, 16, { style: 'wrap', bg: c, bg2: '#ffffff', flavor: n }, { category: 'beauty' }));
[['kingsblade', 'Beard Oil', '#0b0b0d'], ['kingsblade', 'Hair Tonic', '#1f7a3d'], ['slickback', 'Shampoo', '#1b2a6b'], ['slickback', 'Aftershave', '#7ad0e8']].forEach(([b, n, c], i) => add('barber', 'tonic-' + i, n, b, 'pump', { r: 0.03, h: 0.17 }, 18, { style: 'wrap', bg: '#f6efe0', bg2: c, flavor: n }, { category: 'beauty', swatch: ['#0b0b0d', c, '#ffffff', '#ccc'] }));
// magazines (lay flat or stand in a rack)
['Ride', 'Island Living', 'Gossip!', 'Hoops', 'Rides & Rims', 'Fish Florida', 'Moda', 'Tech Now'].forEach((f, i) => add('mags', 'mag-' + i, f, ['sunmill', 'palmetto', 'softa', 'redhawk', 'hurricane', 'kingfish', 'marisol', 'brightwave'][i], 'flat', { w: 0.21, h: 0.275, t: 0.006 }, 5.99, { style: 'card', bg: ['#c8102e', '#1fa3a3', '#ff5fa2', '#ff8a1f', '#16181c', '#1554c0', '#16181c', '#35c6f4'][i], bg2: '#ffffff', flavor: f, burst: true }, { category: 'news', shelf: 'rack' }));
registerProducts(list);
export { DEPT };
