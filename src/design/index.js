// Southline design system: public API. See README.md in this folder.
import {
  brands,
  getBrand,
  brandsFor,
  pickBrand,
  CATEGORIES,
  categories,
  brandErrors,
} from './brands/index.js';
import { DISTRICTS, TIERS, SIGN_TYPES, PACKAGING_STYLES } from './brands/define.js';
import { families, getFamily, familiesFor, pickFamily, familyKinds } from './families.js';
import {
  products,
  getProduct,
  productsFor,
  pickProducts,
  buildProduct,
  productParts,
  labelCanvas,
  disposeProduct,
  productErrors,
} from './products/index.js';
import { materials } from './materials/index.js';
import { signs, print } from './signs/index.js';
import { styleguide } from './styleguide.js';
import { font, fontRoles, loadFonts, FONT_ROLES } from './fonts.js';
import { drawLogo, logoCanvas, logoAspect } from './logos/engine.js';
import { assetBase, setAssetBase } from './config.js';
import * as util from './util.js';

let readyPromise = null;
// Resolves when bundled fonts (if any) are registered. Logos drawn before this may use fallback faces.
export function ready() {
  return readyPromise || (readyPromise = loadFonts(assetBase() + 'fonts/').then(() => true));
}

export {
  brands,
  getBrand,
  brandsFor,
  pickBrand,
  CATEGORIES,
  categories,
  DISTRICTS,
  TIERS,
  SIGN_TYPES,
  PACKAGING_STYLES,
  brandErrors,
  families,
  getFamily,
  familiesFor,
  pickFamily,
  familyKinds,
  products,
  getProduct,
  productsFor,
  pickProducts,
  buildProduct,
  productParts,
  labelCanvas,
  disposeProduct,
  productErrors,
  materials,
  signs,
  print,
  styleguide,
  font,
  fontRoles,
  FONT_ROLES,
  drawLogo,
  logoCanvas,
  logoAspect,
  assetBase,
  setAssetBase,
  util,
};

export const design = {
  ready,
  brands,
  getBrand,
  brandsFor,
  pickBrand,
  CATEGORIES,
  categories,
  DISTRICTS,
  TIERS,
  SIGN_TYPES,
  PACKAGING_STYLES,
  families,
  getFamily,
  familiesFor,
  pickFamily,
  familyKinds,
  products,
  getProduct,
  productsFor,
  pickProducts,
  buildProduct,
  productParts,
  labelCanvas,
  disposeProduct,
  materials,
  signs,
  print,
  styleguide,
  font,
  fontRoles,
  drawLogo,
  logoCanvas,
  logoAspect,
  assetBase,
  setAssetBase,
  util,
  errors: { brands: brandErrors, products: productErrors },
};
export default design;
