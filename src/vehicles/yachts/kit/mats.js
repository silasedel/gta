// Southline V2 yachts: per-yacht material set. A yacht passes its palette (hull paint, gelcoat, teak tone,
// upholstery, interior woods and stones); material keys used by the kit resolve against it. Textures come from the
// shared procedural lab (tex.js). Emissive light-fixture materials are grouped so the runtime can switch them.
import * as THREE from 'three';
import { tex, TEX } from './tex.js';

const TEAK_TONES = { golden: 0xb9834c, honey: 0xc79a5e, silver: 0xa9a394, dark: 0x8a5a34, blond: 0xd2b181, synthetic: 0xbf9566 };
export const DEFAULT_PALETTE = {
  hull: 0xf4f5f3, hullMetal: 0, hull2: 0x1c2733, boot: 0x1b2a44, antifoul: 0x1d2b3a,
  gel: 0xf6f6f2, gel2: 0x2a2f36, nonskid: 0xeeeeea,
  teak: 'golden', glassTint: 0x070c10, glassOpacity: 0.68,
  cushion: 0xf1ede2, cushion2: 0x1f3a5c, canvas: 0x1c2a3a, pillows: [0x1f3a5c, 0xd9a441, 0xf1ede2, 0x7fb3c8],
  woodA: 0x8a5a36, woodB: 0x3a2618, woodFloor: 0xb08a5e, stone: 0xf2f0ea, stone2: 0x2b2d30,
  leather: 0xe9e2d2, leather2: 0x6b4a32, fabric: 0xd9d4c6, fabric2: 0x53616d, carpet: 0xd6cfbf,
  wallPanel: 0xefe9dc, ceiling: 0xf7f5ef, lacquer: 0xfafaf7, linen: 0xffffff, towel: 0xffffff,
  metal: 'ss', accent: 0xc8a35a,
};

function setRepeat(set, name) { const t = 1 / (TEX[name].tile || 1); for (const k of ['map', 'normalMap', 'roughnessMap']) set[k].repeat.set(t, t); return set; }

/**
 * @param {object} palette  overrides for DEFAULT_PALETTE
 * @returns {{ get(key): THREE.Material, emissive: Map<string, THREE.Material[]>, atlas, screen, palette, dispose() }}
 */
export function createMats(palette = {}, opts = {}) {
  const P = { ...DEFAULT_PALETTE, ...palette };
  const M = new Map(), emissive = new Map();
  const T = (name) => setRepeat(tex(name), name);
  const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const textured = (name, color, o = {}) => { const t = T(name); return std({ color, map: o.noMap ? null : t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(o.n ?? 1, o.n ?? 1), ...o.extra }); };
  const teakColor = typeof P.teak === 'number' ? P.teak : TEAK_TONES[P.teak] ?? TEAK_TONES.golden;
  const metalBase = P.metal === 'brass' ? 0xd8b45a : P.metal === 'bronze' ? 0xa87a4a : P.metal === 'black' ? 0x1b1c1e : 0xe2e6e9;
  const paint = (color, metal = 0) => { const t = T('peel'); return phys({ color, metalness: metal ? 0.55 : 0.0, roughness: metal ? 0.32 : 0.2, clearcoat: 1, clearcoatRoughness: 0.035, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.15 }); };
  const F = {
    // ---- exterior shell
    hull: () => paint(P.hull, P.hullMetal), hull2: () => paint(P.hull2, P.hull2Metal), boot: () => paint(P.boot),
    antifoul: () => std({ color: P.antifoul, roughness: 0.82 }),
    gel: () => paint(P.gel), gel2: () => paint(P.gel2, P.gel2Metal), gelMatte: () => std({ color: P.gel, roughness: 0.6 }),
    nonskid: () => textured('nonskid', P.nonskid),
    teak: () => textured('teak', teakColor, { n: 1 }), teakMargin: () => textured('teakSolid', new THREE.Color(teakColor).multiplyScalar(0.9)),
    teakCap: () => { const t = T('teakSolid'); return phys({ color: new THREE.Color(teakColor).multiplyScalar(0.82), map: t.map, normalMap: t.normalMap, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12 }); }, // varnished
    eva: () => textured('eva', P.eva ?? 0x9a9a98),
    glass: () => phys({ color: P.glassTint, roughness: 0.03, metalness: 0, transparent: true, opacity: P.glassOpacity, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.9, specularIntensity: 1 }),
    hullGlass: () => phys({ color: 0x05080b, roughness: 0.03, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8 }),
    glassClear: () => phys({ color: 0xcfe3e6, roughness: 0.02, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4 }),
    glassSmoke: () => phys({ color: 0x1a2226, roughness: 0.04, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4 }),
    glassFrost: () => phys({ color: 0xe8f0f0, roughness: 0.55, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    mirror: () => std({ color: 0xf2f6f7, metalness: 1, roughness: 0.02, envMapIntensity: 1.5 }),
    ss: () => std({ color: 0xe2e6e9, metalness: 1, roughness: 0.09, envMapIntensity: 1.3 }),
    ssBrushed: () => { const t = T('brushed'); return std({ color: 0xcfd4d8, metalness: 1, roughness: 1, roughnessMap: t.roughnessMap, normalMap: t.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }); },
    chrome: () => std({ color: 0xffffff, metalness: 1, roughness: 0.03 }),
    metal: () => std({ color: metalBase, metalness: 1, roughness: P.metal === 'black' ? 0.35 : 0.14 }),
    accent: () => std({ color: P.accent, metalness: 1, roughness: 0.22 }),
    alu: () => std({ color: 0xb9bfc5, metalness: 0.9, roughness: 0.42 }),
    galv: () => std({ color: 0x9aa0a3, metalness: 0.8, roughness: 0.6 }),
    bronze: () => std({ color: 0xa87a4a, metalness: 1, roughness: 0.3 }),
    black: () => std({ color: 0x121315, roughness: 0.55, metalness: 0.1 }), blackGloss: () => phys({ color: 0x08090a, roughness: 0.08, clearcoat: 1 }),
    rubber: () => std({ color: 0x1a1b1c, roughness: 0.92 }), plasticW: () => std({ color: 0xf1f1ee, roughness: 0.45 }), plasticG: () => std({ color: 0x6f757a, roughness: 0.5 }),
    carbon: () => { const t = T('carbon'); return phys({ color: 0x8a8f96, map: t.map, normalMap: t.normalMap, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }); },
    canvas: () => textured('canvas', P.canvas), sail: () => { const m = textured('sail', P.sail ?? 0xf3f1ea); m.side = THREE.DoubleSide; return m; },
    rope: () => textured('rope', P.rope ?? 0xe9e4d4), ropeNavy: () => textured('rope', 0x1f2b44), chain: () => std({ color: 0x8d9296, metalness: 0.9, roughness: 0.5 }),
    fender: () => std({ color: P.fender ?? 0x14181d, roughness: 0.65 }),
    // ---- upholstery and soft goods
    cushion: () => textured('vinyl', P.cushion), cushion2: () => textured('vinyl', P.cushion2), cushionQuilt: () => textured('quilt', P.cushion),
    cushionFabric: () => textured('weave', P.cushion), terry: () => textured('terry', P.towel), towel2: () => textured('terry', P.cushion2),
    leather: () => textured('leather', P.leather), leather2: () => textured('leather', P.leather2), leatherQuilt: () => textured('quilt', P.leather),
    fabric: () => textured('weave', P.fabric), fabric2: () => textured('weave', P.fabric2), linen: () => textured('linen', P.linen), linen2: () => textured('linen', P.fabric2),
    carpet: () => textured('carpet', P.carpet), carpet2: () => textured('carpet', P.fabric2), sisal: () => textured('sisal', P.sisal ?? 0xcbb48a),
    // ---- joinery, stone, panels
    woodA: () => textured('veneer', P.woodA), woodB: () => textured('veneer', P.woodB), burl: () => textured('burl', P.woodA),
    woodGloss: () => { const t = T('veneer'); return phys({ color: P.woodA, map: t.map, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }); },
    woodFloor: () => textured('planks', P.woodFloor),
    stone: () => { const t = T('marble'); return phys({ color: P.stone, map: t.map, roughnessMap: t.roughnessMap, roughness: 1, clearcoat: 0.6, clearcoatRoughness: 0.08 }); },
    stone2: () => { const t = T('terrazzo'); return phys({ color: P.stone2, map: t.map, roughness: 0.2, clearcoat: 0.5 }); },
    mosaic: () => textured('mosaic', P.mosaic ?? 0x4fb3c4), tile: () => textured('mosaic', P.tile ?? 0xf0efe9),
    lacquer: () => phys({ color: P.lacquer, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }),
    wallPanel: () => textured('linen', P.wallPanel, { n: 0.4 }), ceiling: () => textured('vinyl', P.ceiling, { n: 0.3 }),
    wallLeather: () => textured('leather', P.wallPanel, { n: 0.6 }),
    enginePaint: () => textured('enamel', P.enginePaint ?? 0xe9e9e4, { extra: { metalness: 0.3 } }), engineGray: () => textured('enamel', 0x7c8388, { extra: { metalness: 0.4 } }),
    bilge: () => std({ color: 0xdfe2e0, roughness: 0.5 }), copper: () => std({ color: 0xc27b4f, metalness: 1, roughness: 0.3 }), hose: () => std({ color: 0x22262b, roughness: 0.6 }),
    // ---- catch-all vertex-colored materials for small props (one draw call for all of them)
    vc: () => std({ vertexColors: true, roughness: 0.6 }), vcGloss: () => phys({ vertexColors: true, roughness: 0.12, clearcoat: 0.8 }), vcMetal: () => std({ vertexColors: true, metalness: 1, roughness: 0.2 }),
    vcGlass: () => phys({ vertexColors: true, roughness: 0.03, transparent: true, opacity: 0.45, depthWrite: false, envMapIntensity: 1.5 }), vcSoft: () => textured('weave', 0xffffff, { noMap: true, extra: { vertexColors: true } }),
    vcEmit: () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: () => phys({ color: P.water ?? 0x5fd0de, roughness: 0.04, transparent: true, opacity: 0.72, depthWrite: false, envMapIntensity: 1.2 }),
  };
  // static label / art atlas and dynamic screen atlas (canvas textures)
  function makeAtlas(size, dynamic) {
    let cv = null, cx = null, texture = null, sx = 2, sy = 2, rowH = 0;
    const ensure = () => { if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = size; cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, size, size); texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; } };
    return {
      /** Reserve w x h pixels, draw into them, get back [u0, v0, u1, v1]. draw(ctx2d, x, y, w, h) */
      add(w, h, draw) { ensure(); if (sx + w + 2 > size) { sx = 2; sy += rowH + 2; rowH = 0; } if (sy + h + 2 > size) { console.warn('[yachts] atlas full'); sx = 2; sy = 2; } const x = sx, y = sy; sx += w + 2; rowH = Math.max(rowH, h); cx.save(); cx.beginPath(); cx.rect(x, y, w, h); cx.clip(); draw(cx, x, y, w, h); cx.restore(); texture.needsUpdate = true; const rect = [x / size, 1 - (y + h) / size, (x + w) / size, 1 - y / size]; rect.px = { x, y, w, h }; return rect; },
      redraw(rect, draw) { const p = rect.px; cx.save(); cx.beginPath(); cx.rect(p.x, p.y, p.w, p.h); cx.clip(); draw(cx, p.x, p.y, p.w, p.h); cx.restore(); texture.needsUpdate = true; },
      get texture() { ensure(); return texture; }, get canvas() { ensure(); return cv; }, get used() { return !!cv; }, dynamic,
    };
  }
  const atlas = makeAtlas(opts.atlasSize ?? 2048, false), screen = makeAtlas(1024, true);
  F.atlas = () => std({ map: atlas.texture, roughness: 0.55, transparent: true, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  F.atlasGloss = () => phys({ map: atlas.texture, roughness: 0.15, clearcoat: 0.6 });
  F.screen = () => new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });

  function get(key) {
    let m = M.get(key); if (m) return m;
    if (F[key]) m = F[key]();
    else if (key.startsWith('emit:')) { // emit:<group>:<hex>
      const [, group, hex] = key.split(':'), c = parseInt(hex, 16);
      m = std({ color: 0x1a1a1a, emissive: c, emissiveIntensity: 0, roughness: 0.3 }); m.userData.group = group; m.userData.baseColor = c;
      if (!emissive.has(group)) emissive.set(group, []); emissive.get(group).push(m);
    } else if (key[0] === '#') { // '#rrggbb' + optional '/r0.4' '/m1' '/e2' (emissive) '/c' (clearcoat) '/o0.5' (opacity)
      const parts = key.split('/'), o = { color: parseInt(parts[0].slice(1), 16), roughness: 0.55 }; let cc = false;
      for (const p of parts.slice(1)) { if (p[0] === 'r') o.roughness = +p.slice(1); else if (p[0] === 'm') o.metalness = +p.slice(1); else if (p[0] === 'e') { o.emissive = o.color; o.emissiveIntensity = +p.slice(1); } else if (p[0] === 'c') cc = true; else if (p[0] === 'o') { o.transparent = true; o.opacity = +p.slice(1); o.depthWrite = false; } }
      m = cc ? phys({ ...o, clearcoat: 1, clearcoatRoughness: 0.05 }) : std(o);
    } else { console.warn('[yachts] unknown material key', key); m = std({ color: 0xff00ff }); }
    m.name = key; M.set(key, m); return m;
  }
  /** Switch a light group: intensity 0 = off. Fixture materials glow; real lights are handled by the runtime. */
  function setGroup(group, intensity) { for (const m of emissive.get(group) || []) m.emissiveIntensity = intensity; }
  function dispose() { for (const m of M.values()) m.dispose(); M.clear(); if (atlas.used) atlas.texture.dispose(); if (screen.used) screen.texture.dispose(); }
  return { get, emissive, setGroup, atlas, screen, palette: P, dispose, all: M };
}
