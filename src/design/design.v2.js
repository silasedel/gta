// V2 module: exposes the design system as game.design before any other V2 module runs (order 10).
import * as THREE from 'three';
import design from './index.js';

export const order = 10;
export async function initV2(game) {
  await design.ready();
  game.design = design;
  // convenience wrappers that already know THREE
  game.design.three = {
    product: (id, opts) => design.buildProduct(THREE, id, opts),
    material: (name, opts) => design.materials.get(THREE, name, opts),
    logo: (brandId, size, opts) => design.getBrand(brandId)?.logoTexture(THREE, size, opts) || null,
    sign: (brandId, opts) => { const b = design.getBrand(brandId); return b ? design.signs.build(THREE, b, opts) : null; },
  };
  game.emit?.('design:ready', { brands: design.brands.length, products: design.products.length, materials: design.materials.names().length });
}
