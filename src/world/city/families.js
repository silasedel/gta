// city-look: building "families". Every building gets a facade recipe from an invented architect / builder family that fits
// its district and era, then varies inside that family (wall material, colors, window type and proportions, trim features,
// glass, roof). Same-family buildings read as one hand; no two adjacent buildings may share a signature (see neighborFix).
import * as THREE from 'three';
import { WL, WIN, BIT, PROFILE, GLASS } from './facade.js';

export const FAMILIES = {
  decoStream: { maker: 'Marrero & Finch, Architects', era: '1934-1941 Streamline Deco', where: 'Ocean Drive, Collins' },
  decoMed: { maker: 'Aldama Brothers Studio', era: '1924-1932 Mediterranean Deco', where: 'South Beach side streets' },
  mimo: { maker: 'Okun Partners', era: '1950s Miami Modern', where: 'Collins, Biscayne, mid-rise hotels and apartments' },
  medHouse: { maker: 'Casa Verano Builders', era: '1920s Mediterranean Revival', where: 'bay islands, residential streets' },
  villa: { maker: 'Tidewater Modern', era: '2000s modern villa', where: 'bay islands waterfront' },
  cottage: { maker: 'Conch Carpenters Co.', era: 'frame vernacular', where: 'older residential streets, the Keys' },
  cwHalvor: { maker: 'Halvorsen Curtainwall', era: '2000s unitized glass', where: 'Brickell, Downtown towers' },
  cwBrisa: { maker: 'Brisa Glazing Works', era: '1990s spandrel glass', where: 'Brickell, Downtown towers' },
  cwMeridian: { maker: 'Meridian Systems', era: '1980s bronze glass', where: 'Downtown towers' },
  cwAtlas: { maker: 'Atlas Unitized', era: '2010s low-iron glass', where: 'Edgewater, Brickell towers' },
  condo: { maker: 'Bayline Residential Group', era: '2000s condo tower', where: 'Edgewater, Brickell, South of Fifth' },
  precast: { maker: 'Stanton Precast', era: '1970s precast grid office', where: 'Downtown' },
  ribbonOffice: { maker: 'Kessler-Dade Engineers', era: '1960s ribbon-window office', where: 'Downtown, Biscayne' },
  brickRow: { maker: 'Flagler Masonry Co.', era: '1920s brick commercial', where: 'Downtown, Overtown' },
  stoneBank: { maker: 'Everett Loring, Architect', era: '1920s stone-front bank and civic', where: 'Downtown' },
  calleRow: { maker: 'Ocho Storefront Row Builders', era: '1940s-60s low-rise shops', where: 'Little Havana, Overtown, Edgewater' },
  steelShed: { maker: 'Dodge Island Steel Buildings', era: 'pre-engineered metal', where: 'PortMiami, industrial' },
  tiltUp: { maker: 'Gulfstream Tilt-Up', era: 'concrete tilt-up warehouse', where: 'port, industrial' },
  artLoft: { maker: 'Second Avenue Lofts', era: 'painted masonry warehouse', where: 'Wynwood' },
  parkade: { maker: 'ParkRite Structures', era: 'precast parking deck', where: 'everywhere' },
};

// r2-art: sun-faded Miami palettes (real stucco paint after years of sun: pale coral / aqua / butter only on deco, saturation
// capped, value varies more than hue); the old candy pastels and vivid primaries read as a cartoon
const PASTEL = [0xf1cfc2, 0xc4e2da, 0xf3e4bc, 0xdcd3e2, 0xf1d6bc, 0xd3e3c8, 0xcadde6, 0xecccc6, 0xf6efe4, 0xfbf1da, 0xe9d5dc, 0xcde4df, 0xf2dcc4, 0xd9e3ea];
const WARM = [0xf4e4c8, 0xf2d6b0, 0xfbefe0, 0xe8cca8, 0xfbf0d8, 0xe9c4a4, 0xdcb094, 0xf0dca0, 0xead2c0, 0xd9b99a];
const CONDO = [0xf2efe8, 0xe9e4da, 0xe4d8c4, 0xd9cbb4, 0xcfc6b8, 0xdedad2, 0xc9c2b4, 0xeae2d0];
const WHITES = [0xf6f4ee, 0xeeeae0, 0xe6e8ea, 0xf2efe6, 0xdfe3e6, 0xf8f6f0];
const OFFICE = [0xf2ece2, 0xe8d2b4, 0xd8cfc0, 0xcfdce6, 0xefe0c8, 0xd9c4b4, 0xc9c4ba, 0xe6b8a0, 0xc8d8c8, 0xbfc6cc, 0xd8c8e0, 0xb9b2a6];
const VIVID = [0xd8a670, 0x6a9f99, 0xcf8f80, 0xdcc680, 0x86a2bf, 0xa3bf92, 0xc493a8, 0xd6a08a, 0x84b5c2, 0xab9bbe, 0xd6bc92, 0x92b8a8]; // weathered Caribbean colors, not primaries
const METAL = [0xb8c4c8, 0xd8d4c8, 0x9fb0b8, 0xc8b89a, 0xa8b8a0, 0xd0d0d0, 0x8fa8c0, 0xc4a890];
const ACCENT = [0xffffff, 0x4f8a86, 0xc98e98, 0x6aa6a2, 0xd6b870, 0x46566e, 0xb06c5c, 0x6e6482, 0x416e5e, 0x2b2d33, 0xe8e2d4, 0x9a6c42];
const DOORS = [0x7a2e2a, 0x1f4e5a, 0x2d5a34, 0x3a3f5c, 0x6b4a2a, 0xe8e2d4, 0x1e1e20, 0xb5892a];

const hash = (n) => { let x = Math.imul(n | 0, 2654435761) ^ (n >>> 13); x = Math.imul(x ^ (x >>> 16), 2246822507); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
const pickI = (arr, r) => Math.min(arr.length - 1, (r * arr.length) | 0);
const _c = new THREE.Color();

// b: building record; ctx: { zone, district, style (tilebuild's styleFor result), h, area }; salt re-rolls the variant
export function buildingStyle(b, ctx, salt = 0) {
  const seed = ((b.id | 0) % 2147483647) + salt * 7919, R = (k) => hash(seed * 31 + k * 977 + 5);
  const { zone, district = '', style, h } = ctx, tower = h > 45, small = (b.area || 200) < 260;
  let fam;
  if (style === 'warehouse') fam = /Wynwood|Midtown|Design/.test(district) ? 'artLoft' : R(1) < 0.55 ? 'steelShed' : 'tiltUp';
  else if (b.style === 'garage' || /parking|garage/.test(b.kind || '')) fam = 'parkade';
  else if (style === 'glass') fam = ['cwHalvor', 'cwBrisa', 'cwMeridian', 'cwAtlas'][pickI([0, 1, 2, 3], R(1))];
  else if (style === 'band') fam = tower && /residential|business|beach|nightlife/.test(zone) ? 'condo' : /beach|nightlife|residential/.test(zone) ? 'mimo' : R(1) < 0.5 ? 'ribbonOffice' : 'mimo';
  else if (style === 'office') fam = zone === 'residential' ? (tower ? 'condo' : R(1) < 0.5 ? 'mimo' : 'calleRow') : tower ? (R(1) < 0.5 ? 'precast' : 'ribbonOffice') : ['precast', 'ribbonOffice', 'brickRow', 'stoneBank', 'calleRow'][pickI([0, 1, 2, 3, 4], R(1))];
  else if (style === 'deco') fam = /beach|nightlife/.test(zone) ? (R(1) < 0.68 ? 'decoStream' : R(1) < 0.86 ? 'decoMed' : 'mimo') : R(1) < 0.4 ? 'calleRow' : R(1) < 0.7 ? 'brickRow' : R(1) < 0.85 ? 'decoStream' : 'mimo';
  else fam = /Star|Palm|Hibiscus|Fisher|Sunset|Venetian|Lido|Rivo|Marino|Marco|Biscayne Island|Belle/.test(district) ? (R(1) < 0.45 ? 'villa' : R(1) < 0.85 ? 'medHouse' : 'cottage') : R(1) < 0.4 ? 'medHouse' : R(1) < 0.7 ? 'cottage' : 'villa';
  const S = { fam, seed: hash(seed + 17), profile: PROFILE.residential, glass: GLASS.clear, reflect: 0.14, bits: BIT.sill, type: WIN.punched, bayW: 3.2, floorH: 3.3, winW: 0.5, winH: 0.5, sill: 0.28,
    roof: WL.roofGravel, roofTint: 0xffffff, parapet: 'flat', ledges: false, neon: false, hip: false, door: null, gfType: null };
  let pal = OFFICE, ti, ai = pickI(ACCENT, R(4));
  const one = (opts, k) => opts[pickI(opts, R(k))];
  switch (fam) {
    case 'decoStream': pal = PASTEL; S.layer = one([WL.stucco, WL.stucco, WL.plaster, WL.plaster], 2); S.bayW = 2.9 + R(5) * 0.9; S.floorH = 3.1 + R(6) * 0.4; S.winW = 0.4 + R(7) * 0.22; S.winH = 0.44 + R(8) * 0.12; S.sill = 0.3;
      S.bits |= one([BIT.cross, BIT.vsplit, BIT.jalousie, BIT.awningWin], 9) | (R(10) < 0.62 ? BIT.stripes : 0) | (R(11) < 0.35 ? BIT.ac : 0) | (R(12) < 0.3 ? BIT.pilaster : 0) | (R(13) < 0.25 ? BIT.surround : 0);
      if (R(14) < 0.1 && small) { S.type = WIN.porthole; S.winW = 0.3; S.winH = 0.3; S.sill = 0.38; S.bits |= BIT.surround; }
      S.profile = /beach|nightlife/.test(zone) ? PROFILE.hotel : PROFILE.residential; S.glass = one([GLASS.clear, GLASS.teal, GLASS.gray, GLASS.green], 15); S.ledges = R(16) < 0.7; S.parapet = R(17) < 0.6 ? 'zig' : 'flat'; S.neon = R(18) < 0.55; S.roof = one([WL.roofCoat, WL.roofGravel], 19); break;
    case 'decoMed': pal = WARM; S.layer = one([WL.plaster, WL.stucco, WL.coral], 2); S.bayW = 3.0 + R(5) * 0.8; S.floorH = 3.3 + R(6) * 0.4; S.type = R(7) < 0.5 ? WIN.arched : WIN.punched; S.winW = 0.36 + R(8) * 0.14; S.winH = 0.52 + R(9) * 0.12; S.sill = 0.24;
      S.bits |= BIT.surround | (R(10) < 0.6 ? BIT.cross : BIT.vsplit) | (R(11) < 0.4 ? BIT.belt : 0) | (R(12) < 0.4 ? BIT.shutters : 0); S.profile = PROFILE.hotel; S.parapet = 'tile'; S.roof = WL.roofGravel; ai = pickI(ACCENT, R(4) * 0.4 + (R(4) < 0.5 ? 0 : 0.85)); break;
    case 'mimo': pal = R(3) < 0.6 ? WHITES : PASTEL; S.layer = one([WL.stucco, WL.plaster, WL.facadeTile, WL.tile], 2); S.bayW = 3.4 + R(5) * 1.2; S.floorH = 3.0 + R(6) * 0.3;
      if (R(7) < 0.5) { S.type = WIN.ribbon; S.winW = 1; S.winH = 0.42 + R(8) * 0.14; S.sill = 0.3; } else { S.winW = 0.62 + R(8) * 0.2; S.winH = 0.5 + R(9) * 0.1; S.sill = 0.26; S.bits |= one([BIT.jalousie, BIT.vsplit, BIT.awningWin], 10); }
      S.bits |= (R(11) < 0.6 ? BIT.spandrel : 0) | (R(12) < 0.35 ? BIT.pilaster : 0) | (R(13) < 0.3 ? BIT.ac : 0); S.glass = one([GLASS.green, GLASS.gray, GLASS.clear, GLASS.bronze], 14); S.reflect = 0.25; S.ledges = R(15) < 0.6; S.roof = WL.roofCoat;
      S.profile = /beach|nightlife/.test(zone) ? PROFILE.hotel : zone === 'residential' ? PROFILE.residential : PROFILE.office; break;
    case 'medHouse': pal = WARM; S.layer = one([WL.stucco, WL.stucco, WL.plaster], 2); S.bayW = 3.2 + R(5) * 1.0; S.floorH = 3.1 + R(6) * 0.5; S.type = R(7) < 0.45 ? WIN.arched : WIN.punched; S.winW = 0.34 + R(8) * 0.14; S.winH = 0.5 + R(9) * 0.1; S.sill = 0.26;
      S.bits |= BIT.cross | (R(10) < 0.55 ? BIT.shutters : BIT.surround); S.roof = WL.roofTile; S.hip = true; S.parapet = 'none'; S.door = { solid: R(11) < 0.7 }; ai = pickI(ACCENT, R(4)); break;
    case 'villa': pal = WHITES; S.layer = one([WL.stucco, WL.plaster, WL.concrete], 2); S.bayW = 4.0 + R(5) * 1.5; S.floorH = 3.4 + R(6) * 0.5; S.winW = 0.7 + R(7) * 0.22; S.winH = 0.66 + R(8) * 0.14; S.sill = 0.08;
      S.bits = BIT.darkFrame | BIT.vsplit | (R(9) < 0.3 ? BIT.spandrel : 0); S.glass = one([GLASS.gray, GLASS.blue, GLASS.clear, GLASS.dark], 10); S.reflect = 0.3; S.roof = WL.roofCoat; S.parapet = 'flat'; S.door = { solid: R(11) < 0.3 }; break;
    case 'cottage': pal = PASTEL; S.layer = WL.siding; S.bayW = 3.0 + R(5) * 0.8; S.floorH = 3.0 + R(6) * 0.3; S.winW = 0.34 + R(7) * 0.1; S.winH = 0.48 + R(8) * 0.08; S.sill = 0.3;
      S.bits |= BIT.vsplit | BIT.surround | (R(9) < 0.6 ? BIT.shutters : 0) | (R(10) < 0.4 ? BIT.ac : 0); S.roof = WL.roofMetal; S.hip = true; S.parapet = 'none'; S.door = { solid: true }; ai = R(4) < 0.6 ? 0 : pickI(ACCENT, R(12)); break;
    case 'cwHalvor': pal = METAL; S.layer = WL.cladding; S.type = WIN.curtain; S.bayW = 1.4 + R(5) * 0.3; S.floorH = 3.8 + R(6) * 0.3; S.sill = 0.2 + R(7) * 0.06; S.bits = BIT.darkFrame | BIT.fins; S.glass = one([GLASS.blue, GLASS.silver, GLASS.teal], 8); S.reflect = 0.62 + R(9) * 0.2; S.profile = PROFILE.office; S.roof = WL.roofGravel; break;
    case 'cwBrisa': pal = METAL; S.layer = WL.cladding; S.type = WIN.curtain; S.bayW = 1.2 + R(5) * 0.7; S.floorH = 4.0 + R(6) * 0.3; S.sill = 0.28 + R(7) * 0.06; S.bits = BIT.spandrel | (R(10) < 0.5 ? BIT.darkFrame : 0); S.glass = one([GLASS.green, GLASS.teal, GLASS.blue], 8); S.reflect = 0.5 + R(9) * 0.2; S.profile = PROFILE.office; ai = pickI(METAL, R(4)); break;
    case 'cwMeridian': pal = METAL; S.layer = WL.granite; S.type = WIN.curtain; S.bayW = 2.8 + R(5) * 0.6; S.floorH = 3.5 + R(6) * 0.3; S.sill = 0.16 + R(7) * 0.06; S.bits = BIT.vsplit | BIT.darkFrame; S.glass = one([GLASS.bronze, GLASS.gray, GLASS.dark], 8); S.reflect = 0.55 + R(9) * 0.15; S.profile = PROFILE.office; break;
    case 'cwAtlas': pal = WHITES; S.layer = WL.cladding; S.type = WIN.curtain; S.bayW = 1.9 + R(5) * 0.4; S.floorH = 3.2 + R(6) * 0.3; S.sill = 0.1 + R(7) * 0.05; S.bits = R(10) < 0.5 ? BIT.fins : 0; S.glass = one([GLASS.silver, GLASS.clear, GLASS.blue, GLASS.teal], 8); S.reflect = 0.7 + R(9) * 0.2; S.profile = zone === 'residential' ? PROFILE.residential : PROFILE.office; break;
    case 'condo': pal = CONDO; S.layer = one([WL.stucco, WL.concrete, WL.plaster], 2); S.bayW = 3.6 + R(5) * 1.2; S.floorH = 3.05 + R(6) * 0.25; S.winW = 0.76 + R(7) * 0.16; S.winH = 0.7 + R(8) * 0.1; S.sill = 0.05;
      S.bits = BIT.vsplit | (R(9) < 0.6 ? BIT.darkFrame : 0) | (R(10) < 0.3 ? BIT.spandrel : 0); S.glass = one([GLASS.blue, GLASS.green, GLASS.gray, GLASS.teal, GLASS.clear], 11); S.reflect = 0.3 + R(12) * 0.2; S.roof = WL.roofGravel; break;
    case 'precast': S.layer = one([WL.precast, WL.concrete, WL.precast], 2); S.bayW = 2.6 + R(5) * 1.0; S.floorH = 3.5 + R(6) * 0.3; S.winW = 0.52 + R(7) * 0.2; S.winH = 0.5 + R(8) * 0.14; S.sill = 0.26;
      S.bits = BIT.pilaster | BIT.darkFrame | (R(9) < 0.4 ? BIT.belt : 0) | BIT.grime; S.glass = one([GLASS.bronze, GLASS.gray, GLASS.dark], 10); S.reflect = 0.4; S.profile = PROFILE.office; break;
    case 'ribbonOffice': S.layer = one([WL.concrete, WL.precast, WL.tile, WL.stucco], 2); /* r2-art: the loud rectangular facade-tile scan retired from offices */ S.type = WIN.ribbon; S.bayW = 3.0 + R(5) * 1.4; S.floorH = 3.4 + R(6) * 0.4; S.winW = 1; S.winH = 0.4 + R(7) * 0.18; S.sill = 0.28;
      S.bits = (R(8) < 0.6 ? BIT.darkFrame : 0) | (R(9) < 0.3 ? BIT.grime : 0); S.glass = one([GLASS.gray, GLASS.green, GLASS.bronze, GLASS.blue], 10); S.reflect = 0.45; S.profile = PROFILE.office; break;
    case 'brickRow': pal = WHITES; S.layer = one([WL.brick, WL.brickPaint, WL.brick], 2); if (S.layer === WL.brickPaint) pal = VIVID; S.bayW = 2.8 + R(5) * 0.8; S.floorH = 3.5 + R(6) * 0.5; S.winW = 0.4 + R(7) * 0.14; S.winH = 0.54 + R(8) * 0.1; S.sill = 0.24;
      S.bits |= BIT.cross | BIT.belt | (R(9) < 0.5 ? BIT.surround : 0) | (R(10) < 0.4 ? BIT.ac : 0) | BIT.grime; S.profile = R(11) < 0.5 ? PROFILE.office : PROFILE.residential; S.parapet = 'cornice'; break;
    case 'stoneBank': pal = WHITES; S.layer = one([WL.marble, WL.coral, WL.concrete], 2); S.bayW = 3.4 + R(5) * 0.8; S.floorH = 4.0 + R(6) * 0.6; S.type = R(7) < 0.4 ? WIN.arched : WIN.punched; S.winW = 0.4 + R(8) * 0.1; S.winH = 0.62 + R(9) * 0.1; S.sill = 0.18;
      S.bits |= BIT.pilaster | BIT.belt | BIT.cross | BIT.darkFrame; S.profile = PROFILE.office; S.parapet = 'cornice'; S.glass = GLASS.gray; break;
    case 'calleRow': pal = VIVID; S.layer = one([WL.plaster, WL.stucco, WL.stuccoRough, WL.plasterWorn, WL.cmu], 2); S.bayW = 3.0 + R(5) * 1.0; S.floorH = 3.2 + R(6) * 0.4; S.winW = 0.4 + R(7) * 0.2; S.winH = 0.42 + R(8) * 0.12; S.sill = 0.3;
      S.bits |= one([BIT.vsplit, BIT.jalousie, BIT.cross], 9) | (R(10) < 0.55 ? BIT.ac : 0) | (R(11) < 0.5 ? BIT.grime : 0) | (R(12) < 0.3 ? BIT.surround : 0) | (R(13) < 0.25 ? BIT.shutters : 0); S.parapet = R(14) < 0.5 ? 'flat' : 'cornice'; break;
    case 'steelShed': pal = METAL; S.layer = WL.corrugated; S.bayW = 6 + R(5) * 2; S.floorH = 5.5 + R(6) * 2; S.type = R(7) < 0.75 ? WIN.punched : WIN.blank; S.winW = 0.3 + R(8) * 0.2; S.winH = 0.14 + R(9) * 0.08; S.sill = 0.68; S.bits = BIT.grime | BIT.darkFrame; S.profile = PROFILE.industrial; S.roof = WL.roofMetal; S.parapet = 'none'; S.gfType = WIN.roller; break;
    case 'tiltUp': S.layer = one([WL.precast, WL.cmu, WL.concrete], 2); S.bayW = 7 + R(5) * 2; S.floorH = 6 + R(6) * 2; S.winW = 0.4; S.winH = 0.12 + R(8) * 0.08; S.sill = 0.72; S.bits = BIT.grime | BIT.darkFrame | (R(9) < 0.5 ? BIT.stripes : 0); S.profile = PROFILE.industrial; S.roof = WL.roofGravel; S.gfType = WIN.roller; break;
    case 'artLoft': pal = VIVID; S.layer = one([WL.brickPaint, WL.cmu, WL.plaster], 2); S.bayW = 4.5 + R(5) * 2; S.floorH = 4.5 + R(6) * 1.5; S.winW = 0.5 + R(7) * 0.2; S.winH = 0.3 + R(8) * 0.2; S.sill = 0.5; S.bits = BIT.darkFrame | BIT.jalousie | (R(9) < 0.5 ? BIT.grime : 0); S.profile = PROFILE.retail; S.roof = WL.roofGravel; S.gfType = WIN.roller; break;
    default: S.layer = WL.precast; S.type = WIN.garage; S.bayW = 5.5 + R(5) * 1.5; S.floorH = 3.0 + R(6) * 0.2; S.winW = 0.9 + R(7) * 0.08; S.winH = 0.56 + R(8) * 0.08; S.sill = 0.36; S.bits = R(9) < 0.5 ? BIT.grime : 0; S.profile = PROFILE.garage; S.roof = WL.roofConcrete; break;
  }
  ti = pickI(pal, R(3));
  S.tint = new THREE.Color(b.colour && fam !== 'brickRow' && S.type !== WIN.curtain ? _c.set(pal[ti]).lerp(safeColor(b.colour, pal[ti]), 0.5).getHex() : pal[ti]);
  { // weathered, sun-bleached paint: keep the hue, pull the saturation down (South Beach deco keeps the most color)
    const hsl = {};
    S.tint.getHSL(hsl);
    const keep = fam === 'decoStream' || fam === 'decoMed' ? 0.6 : fam === 'calleRow' || fam === 'artLoft' || fam === 'cottage' ? 0.52 : 0.42;
    S.tint.setHSL(hsl.h, hsl.s * keep, Math.min(hsl.l, 0.86));
  }
  S.accent = new THREE.Color(ACCENT[ai] ?? METAL[ai % METAL.length]);
  if (S.accent.getHex() === S.tint.getHex()) S.accent.offsetHSL(0.5, 0, S.accent.getHSL({}).l > 0.6 ? -0.3 : 0.25);
  if (S.door) S.door.color = new THREE.Color(DOORS[pickI(DOORS, R(21))]);
  S.roofTint = [0xffffff, 0xe8e4dc, 0xd8d8d8, 0xf2ede2][pickI([0, 1, 2, 3], R(22))];
  if (S.roof === WL.roofTile) S.roofTint = [0xffffff, 0xe6cfc0, 0xd2bfb0, 0xf0d8c4, 0xbca89a, 0xdcc8bc, 0xc8b4a4][pickI([0, 1, 2, 3, 4, 5, 6], R(23))]; // sun-faded, weathered and newer clay tile
  // the rough side of town (Overtown, Liberty City: CONVENTIONS "Rough district"): worn paint and block walls, grime, window AC
  // units, security bars, roll-down shutters on the ground floor, rusty metal roofs; abandoned buildings are boarded up and dark.
  // Same condition rule as bldmodels.js (hash of the id + 6101 < 0.18 = abandoned)
  if (/Overtown|Liberty City/.test(district) && !tower && S.type !== WIN.curtain) {
    const cond = hash(((b.id | 0) % 2147483647) + 6101) < 0.18 ? 'abandoned' : 'rundown'; S.cond = cond;
    S.layer = one([WL.plasterWorn, WL.stuccoRough, WL.cmu, WL.brickPaint, WL.plasterWorn, WL.paintPeel, WL.concrete], 31);
    S.bits = (S.bits & ~(BIT.stripes | BIT.awningWin)) | BIT.grime | BIT.sill | (R(32) < 0.6 ? BIT.ac : 0) | (cond === 'abandoned' ? BIT.boarded : R(33) < 0.5 ? BIT.bars : 0);
    if (S.type === WIN.ribbon || S.type === WIN.porthole) { S.type = WIN.punched; S.winW = 0.42; S.winH = 0.5; S.sill = 0.28; }
    if (R(34) < (cond === 'abandoned' ? 0.9 : 0.5)) S.gfType = WIN.roller;
    const hsl = {}; S.tint.getHSL(hsl); S.tint.setHSL(hsl.h, hsl.s * 0.75, hsl.l * (cond === 'abandoned' ? 0.72 : 0.84));
    S.accent = new THREE.Color([0x8a8f92, 0x6f6a62, 0x9a7a5a, 0x5a6066, 0x7d6f60][pickI([0, 1, 2, 3, 4], R(35))]); // galvanized / rusty shutters and trim
    S.roof = S.hip ? WL.roofMetal : WL.roofGravel; S.roofTint = S.hip ? [0xc4a088, 0x9c9c9a, 0xb4a690, 0x8e877c, 0xa89078][pickI([0, 1, 2, 3, 4], R(36))] : 0xb8b2a8; // rusty, galvanized, faded metal S.neon = false; S.profile = PROFILE.residential; S.glass = GLASS.gray; S.reflect = 0.1;
  }
  if (S.bits & BIT.ac) { S.bits &= ~BIT.ac; S.acUnits = true; } // window AC units are real geometry now (tilebuild), not painted
  S.sig = `${fam}|L${S.layer}|t${ti}|w${S.type}|b${S.bits}|g${S.glass}|a${ai}|p${S.parapet}${S.cond || ''}`;
  return S;
}
function safeColor(c, fb) { try { return new THREE.Color(c); } catch (e) { return new THREE.Color(fb); } }

// Podium of a tower: parking decks, or retail / office floors in a contrasting but related skin.
export function podiumStyle(S, b, zone) {
  const seed = ((b.id | 0) % 2147483647), R = (k) => hash(seed * 53 + k * 331 + 9), P = { ...S, door: null, hip: false };
  if (R(1) < 0.45) { P.type = WIN.garage; P.layer = [WL.precast, WL.concrete][R(2) < 0.5 ? 0 : 1]; P.bayW = 5.5 + R(3); P.floorH = 3.1; P.winW = 0.92; P.winH = 0.56; P.sill = 0.36; P.bits = 0; P.profile = PROFILE.garage; P.tint = new THREE.Color(OFFICE[pickI(OFFICE, R(4))]); }
  else { P.type = R(2) < 0.5 ? WIN.ribbon : WIN.punched; P.layer = [WL.precast, WL.marble, WL.granite, WL.concrete, WL.concrete][pickI([0, 1, 2, 3, 4], R(3))]; P.bayW = 3.6 + R(4) * 1.5; P.floorH = 3.8; P.winW = P.type === WIN.ribbon ? 1 : 0.62; P.winH = 0.52; P.sill = 0.26; P.bits = BIT.darkFrame | (R(5) < 0.5 ? BIT.pilaster : 0); P.profile = zone === 'residential' ? PROFILE.residential : PROFILE.office; P.tint = new THREE.Color(P.layer === WL.marble || P.layer === WL.granite ? 0xffffff : OFFICE[pickI(OFFICE, R(6))]); }
  P.sig = S.sig + '|pod' + P.type + P.layer; P.seed = hash(seed + 91);
  return P;
}

// Ground-floor recipe for a building without real shop lots.
export function groundStyle(S, shops, tower) {
  const G = { ...S };
  if (S.gfType === WIN.roller) { G.type = WIN.roller; G.winW = 0.62; G.winH = 0.78; G.sill = 0.02; G.bayW = Math.max(5, S.bayW); }
  else if (shops) { G.type = WIN.storefront; G.winW = 0.9; G.winH = 0.8; G.sill = 0.02; G.bayW = 4.2 + (S.seed * 2.2); G.profile = PROFILE.retail; G.reflect = 0.1; G.glass = GLASS.clear; G.bits = S.bits & BIT.darkFrame; G.accent = S.tint.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x2b2d33), 0.45); }
  else if (tower || S.type === WIN.curtain) { G.type = WIN.storefront; G.winW = 0.94; G.winH = 0.86; G.sill = 0.02; G.bayW = 3.2; G.profile = PROFILE.lobby; G.reflect = 0.2; G.bits = BIT.darkFrame; G.accent = new THREE.Color(0x2b2d33); }
  else return null;
  return G;
}
