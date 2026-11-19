// Automated checks for the design system. Run: node src/design/check.mjs   (exit code 1 on any failure)
// Data-only (no canvas): unique names and ids, banned names, categories, every product has a brand and a builder.
import { brands, brandErrors, CATEGORIES } from './brands/index.js';
import { MARKS } from './logos/allmarks.js';
import { CATALOG } from './products/data.js';
import fs from 'node:fs';
const BANNED = [
  'vice city',
  'leonida',
  'grassrivers',
  'kalaga',
  'port gellhorn',
  'ambrosia',
  'watson bay',
  'key lento',
  'hamlet',
  'rusty anchor',
  'wonder whale',
  'dinka',
  'vapid',
  'schafter',
  'sprunk',
  'ecola',
  'cluckin',
  'burger shot',
  'ammu-nation',
  'binco',
  'pisswasser',
  'logger',
  'los santos',
  'liberty city',
  'rockstar',
  'pfister',
  'grotti',
  'bravado',
  'benefactor',
  'ubermacht',
  'karin',
  'declasse',
  'pegassi',
  'truffade',
  'maibatsu',
  'whiz',
  'badger',
  'fruit computers',
  'ifruit',
  'lifeinvader',
  'weazel',
  'up-n-atom',
  'bean machine',
  '24/7',
  'ltd gasoline',
  'ron oil',
  'xero',
  'globe oil',
  'redwood',
  'debonaire',
  'suburban',
  'ponsonbys',
  'didier sachs',
  'heat',
  'prolaps',
  'eris',
  'rearwall',
  'meteorite',
  'ego chaser',
  'phat chips',
];
const REAL = [
  'coca',
  'pepsi',
  'mcdonald',
  'starbucks',
  'nike',
  'adidas',
  'apple',
  'samsung',
  'shell',
  'chevron',
  'exxon',
  'publix',
  'walgreens',
  'cvs',
  'bacardi',
  'marlboro',
  'gucci',
  'louis vuitton',
  'chanel',
  'rolex',
  'ferrari',
  'lamborghini',
  'bugatti',
  'toyota',
  'ford',
  'honda',
  'budweiser',
  'corona',
  'heineken',
  'red bull',
  'monster',
  'doritos',
  'lays',
  'goya',
  'bustelo',
  'pilon',
  'versailles',
  'walmart',
  'target',
  'costco',
  'verizon',
  'uber',
  'lyft',
  'fedex',
  'ups',
  'yamaha',
  'mercury',
];
const fail = [];
const names = new Map(),
  ids = new Set();
for (const e of brandErrors) fail.push(e);
for (const b of brands) {
  const n = b.name.toLowerCase();
  if (names.has(n)) fail.push(`duplicate brand name: ${b.name}`);
  names.set(n, b.id);
  if (ids.has(b.id)) fail.push(`duplicate brand id: ${b.id}`);
  ids.add(b.id);
  if (!CATEGORIES[b.category]) fail.push(`${b.id}: bad category ${b.category}`);
  for (const w of BANNED)
    if (new RegExp('(^|[^a-z])' + w.replace(/[-/]/g, '.') + '([^a-z]|$)').test(n))
      fail.push(`${b.id}: banned name "${w}"`);
  for (const w of REAL)
    if (new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(n))
      fail.push(`${b.id}: real brand word "${w}"`);
  if (
    !b.logo ||
    (!b.logo.word && typeof b.logo.mark !== 'function' && typeof b.logo.draw !== 'function')
  )
    fail.push(`${b.id}: no logo`);
  if (b.logo.markSpec && !MARKS[b.logo.markSpec[0]])
    fail.push(`${b.id}: unknown mark ${b.logo.markSpec[0]}`);
  if (!b.tagline || !b.story) fail.push(`${b.id}: missing tagline or story`);
}
const src = fs.readFileSync(new URL('./products/index.js', import.meta.url), 'utf8');
const builders = new Set([...src.matchAll(/^\s{2}([a-z]+)\(THREE, p/gm)].map((m) => m[1]));
const pids = new Set();
for (const p of CATALOG) {
  if (pids.has(p.id)) fail.push(`duplicate product id: ${p.id}`);
  pids.add(p.id);
  if (!ids.has(p.brand)) fail.push(`${p.id}: unknown brand ${p.brand}`);
  if (!builders.has(p.model)) fail.push(`${p.id}: no model builder "${p.model}"`);
  if (!(p.price > 0)) fail.push(`${p.id}: no price`);
  if (p.category === 'food' && !(p.nutrition && p.nutrition.kcal))
    fail.push(`${p.id}: food without calories`);
}
const cats = {};
for (const b of brands) cats[b.category] = (cats[b.category] || 0) + 1;
console.log(
  JSON.stringify(
    {
      brands: brands.length,
      categoriesCovered: Object.keys(cats).length,
      categoriesTotal: Object.keys(CATEGORIES).length,
      missingCategories: Object.keys(CATEGORIES).filter((c) => !cats[c]),
      marks: Object.keys(MARKS).length,
      products: CATALOG.length,
      builders: [...builders],
      failures: fail,
    },
    null,
    1,
  ),
);
process.exit(fail.length ? 1 : 0);
