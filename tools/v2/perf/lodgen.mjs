#!/usr/bin/env node
// r2-perf: offline LOD chains for library GLBs (buildings, trees, cars, props, people) with meshoptimizer.
// Output is an index-only sidecar next to the GLB: <name>.lod.bin. Each LOD level is a new index buffer over the SAME
// vertices the game already decodes (Draco or plain), so far levels cost no extra vertex memory, keep every UV seam,
// normal, skin weight and material exactly, and need no new texture. The runtime (src/render/lod/lodChain.js) checks a
// hash of the decoded positions before using a sidecar, so a re-exported GLB can never pick up a stale LOD.
// Levels: ~40 % and ~12 % of the triangles (per primitive), simplified with attribute weights (normals, UVs) and the
// border locked (open edges and material boundaries stay put, so parts never crack apart). Each level records its
// geometric error in model units; the runtime switches a level only where that error projects below ~1 px.
//   node tools/v2/perf/lodgen.mjs [--dir public/assets/models/vegetation] [--files a.glb,b.glb] [--levels 0.4,0.12]
//        [--min-tris 800] [--force] [--dry]
// Never reads or writes Models/ (library sources); only public/assets/**.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { MeshoptSimplifier } = await import('meshoptimizer');
const draco3d = require('draco3d');

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const LEVELS = String(o.levels || '0.4,0.12')
  .split(',')
  .map(Number);
const MIN_TRIS = +(o['min-tris'] || 600);
// --lock 0: let open borders move (buildings made of loose panels barely simplify with locked borders; the error
// metric still counts border moves, and the pop test decides)
const FLAGS = o.lock === '0' ? [] : ['LockBorder'];
const MAXERR = +(o.maxerr || 0.05);
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true; // simplifyWithAttributes
const decoderModule = await draco3d.createDecoderModule({});

// ---------- GLB read
function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12,
    json = null,
    bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off),
      type = b.readUInt32LE(off + 4);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}
const CT = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAccessor(g, idx) {
  const acc = g.json.accessors[idx],
    bv = g.json.bufferViews[acc.bufferView];
  const T = CT[acc.componentType],
    n = NC[acc.type],
    es = T.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || n * es,
    base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const rd = {
    5120: 'getInt8',
    5121: 'getUint8',
    5122: 'getInt16',
    5123: 'getUint16',
    5125: 'getUint32',
    5126: 'getFloat32',
  }[acc.componentType];
  const norm = acc.normalized
    ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[acc.componentType] || 1
    : 1;
  for (let i = 0; i < acc.count; i++)
    for (let c = 0; c < n; c++) out[i * n + c] = dv[rd](base + i * stride + c * es, true) / norm;
  return { data: out, n, count: acc.count };
}
function readIndices(g, idx) {
  const acc = g.json.accessors[idx],
    bv = g.json.bufferViews[acc.bufferView];
  const T = CT[acc.componentType];
  const src = new T(
    g.bin.buffer.slice(
      g.bin.byteOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0),
      g.bin.byteOffset +
        (bv.byteOffset || 0) +
        (acc.byteOffset || 0) +
        acc.count * T.BYTES_PER_ELEMENT,
    ),
  );
  return Uint32Array.from(src);
}
// Draco: same decoder as three's DRACOLoader, so point order matches what the game gets
function decodeDraco(g, prim) {
  const ext = prim.extensions.KHR_draco_mesh_compression;
  const bv = g.json.bufferViews[ext.bufferView];
  const data = new Int8Array(g.bin.buffer, g.bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  const D = decoderModule,
    dec = new D.Decoder(),
    buf = new D.DecoderBuffer();
  buf.Init(data, data.byteLength);
  const mesh = new D.Mesh();
  const st = dec.DecodeBufferToMesh(buf, mesh);
  if (!st.ok() || mesh.ptr === 0) throw new Error('draco decode failed');
  const np = mesh.num_points(),
    nf = mesh.num_faces();
  const attr = (uid, n) => {
    if (uid === undefined) return null;
    const at = dec.GetAttributeByUniqueId(mesh, uid);
    const bytes = np * n * 4,
      ptr = D._malloc(bytes);
    dec.GetAttributeDataArrayForAllPoints(mesh, at, D.DT_FLOAT32, bytes, ptr);
    const out = new Float32Array(D.HEAPF32.buffer, ptr, np * n).slice();
    D._free(ptr);
    return { data: out, n, count: np };
  };
  const ia = ext.attributes;
  const res = { pos: attr(ia.POSITION, 3), nrm: attr(ia.NORMAL, 3), uv: attr(ia.TEXCOORD_0, 2) };
  const ib = nf * 3 * 4,
    ip = D._malloc(ib);
  dec.GetTrianglesUInt32Array(mesh, ib, ip);
  res.idx = new Uint32Array(D.HEAPU32.buffer, ip, nf * 3).slice();
  D._free(ip);
  D.destroy(mesh);
  D.destroy(buf);
  D.destroy(dec);
  return res;
}
function primData(g, prim) {
  if (prim.extensions?.KHR_draco_mesh_compression) return decodeDraco(g, prim);
  const A = prim.attributes;
  const pos = readAccessor(g, A.POSITION);
  return {
    pos,
    nrm: A.NORMAL !== undefined ? readAccessor(g, A.NORMAL) : null,
    uv: A.TEXCOORD_0 !== undefined ? readAccessor(g, A.TEXCOORD_0) : null,
    idx:
      prim.indices !== undefined
        ? readIndices(g, prim.indices)
        : Uint32Array.from({ length: pos.count }, (_, i) => i),
  };
}
// position hash: the runtime computes the same from the decoded BufferAttribute (count + sampled, quantized values)
export function posHash(arr, count) {
  let h = 2166136261 >>> 0;
  const step = Math.max(1, Math.floor(count / 512));
  for (let i = 0; i < count; i += step)
    for (let c = 0; c < 3; c++) {
      h ^= Math.round(arr[i * 3 + c] * 1000) & 0xffffffff;
      h = Math.imul(h, 16777619) >>> 0;
    }
  h ^= count;
  h = Math.imul(h, 16777619) >>> 0;
  return h >>> 0;
}

function simplifyPrim(d) {
  const tris = d.idx.length / 3;
  const pos = d.pos.data,
    nv = d.pos.count;
  // bounding radius (model units) for the error scale
  let mn = [1e30, 1e30, 1e30],
    mx = [-1e30, -1e30, -1e30];
  for (let i = 0; i < nv; i++)
    for (let c = 0; c < 3; c++) {
      const v = pos[i * 3 + c];
      if (v < mn[c]) mn[c] = v;
      if (v > mx[c]) mx[c] = v;
    }
  const ext = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  // attributes for the quadric: normals (weight 0.5) and UVs (weight 1, seams stay because split vertices are kept apart)
  const an = (d.nrm ? 3 : 0) + (d.uv ? 2 : 0);
  let attrs = null,
    weights = [];
  if (an) {
    attrs = new Float32Array(nv * an);
    for (let i = 0; i < nv; i++) {
      let k = 0;
      if (d.nrm) for (let c = 0; c < 3; c++) attrs[i * an + k++] = d.nrm.data[i * 3 + c];
      if (d.uv) for (let c = 0; c < 2; c++) attrs[i * an + k++] = d.uv.data[i * 2 + c];
    }
    if (d.nrm) weights.push(0.5, 0.5, 0.5);
    if (d.uv) weights.push(1, 1);
  }
  const levels = [];
  let src = d.idx;
  for (const r of LEVELS) {
    const target = Math.max(3, Math.floor((d.idx.length * r) / 3) * 3);
    const [out, err] = attrs
      ? MeshoptSimplifier.simplifyWithAttributes(
          src,
          pos,
          3,
          attrs,
          an,
          weights,
          null,
          target,
          MAXERR,
          FLAGS,
        )
      : MeshoptSimplifier.simplify(src, pos, 3, target, MAXERR, FLAGS);
    // relative error -> model units (meshopt reports error relative to the mesh extent)
    const errAbs = err * ext;
    if (out.length >= src.length * 0.92) break; // the simplifier could not go meaningfully lower (locked borders)
    levels.push({
      ratio: +(out.length / d.idx.length).toFixed(3),
      tris: out.length / 3,
      err: +errAbs.toFixed(5),
      idx: out,
    });
    src = out;
  }
  return { tris, nv, ext: +ext.toFixed(3), levels };
}

function processFile(file) {
  const g = readGlb(file);
  const prims = [];
  let tris0 = 0,
    trisL = LEVELS.map(() => 0);
  (g.json.meshes || []).forEach((m, mi) =>
    m.primitives.forEach((p, pi) => {
      if (p.mode !== undefined && p.mode !== 4) return;
      const d = primData(g, p);
      tris0 += d.idx.length / 3;
      if (d.idx.length / 3 < MIN_TRIS / 4) {
        prims.push({
          m: mi,
          p: pi,
          nv: d.pos.count,
          h: posHash(d.pos.data, d.pos.count),
          levels: [],
        });
        return;
      }
      const s = simplifyPrim(d);
      s.levels.forEach((l, i) => {
        trisL[i] += l.tris;
      });
      for (let i = s.levels.length; i < LEVELS.length; i++)
        trisL[i] += s.levels[s.levels.length - 1]?.tris ?? s.tris;
      prims.push({
        m: mi,
        p: pi,
        nv: d.pos.count,
        h: posHash(d.pos.data, d.pos.count),
        ext: s.ext,
        levels: s.levels,
      });
    }),
  );
  return { prims, tris0, trisL };
}
function writeSidecar(file, r) {
  const chunks = [];
  let off = 0;
  const meta = {
    v: 1,
    gen: 'r2-perf lodgen meshoptimizer ' + require('meshoptimizer/package.json').version,
    levels: LEVELS,
    tris: r.tris0,
    prims: [],
  };
  for (const p of r.prims) {
    const mp = { m: p.m, p: p.p, nv: p.nv, h: p.h, ext: p.ext, levels: [] };
    for (const l of p.levels) {
      const u16 = p.nv < 65536;
      const arr = u16 ? Uint16Array.from(l.idx) : Uint32Array.from(l.idx);
      const pad = (4 - (off % 4)) % 4;
      if (pad) {
        chunks.push(Buffer.alloc(pad));
        off += pad;
      }
      chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
      mp.levels.push({ o: off, n: arr.length, w: u16 ? 2 : 4, err: l.err, tris: l.tris });
      off += arr.byteLength;
    }
    meta.prims.push(mp);
  }
  const js = Buffer.from(JSON.stringify(meta));
  const jpad = Buffer.alloc((4 - ((js.length + 8) % 4)) % 4, 0x20);
  const head = Buffer.alloc(8);
  head.write('SLOD', 0);
  head.writeUInt32LE(js.length + jpad.length, 4);
  const outFile = file.replace(/\.glb$/i, '.lod.bin');
  if (!o.dry) fs.writeFileSync(outFile, Buffer.concat([head, js, jpad, ...chunks]));
  return outFile;
}

let files = [];
if (o.files) files = String(o.files).split(',');
else {
  const dir = path.resolve(ROOT, o.dir || 'public/assets/models/vegetation');
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n);
      if (fs.statSync(f).isDirectory()) walk(f);
      else if (/\.glb$/i.test(n) && !/_lod\d|_col\b|_col\.glb/i.test(n)) files.push(f);
    }
  };
  walk(dir);
}
const sum = { files: 0, skipped: 0, tris0: 0, trisL: LEVELS.map(() => 0), bytes: 0 };
for (const f0 of files) {
  const f = path.resolve(ROOT, f0);
  if (!f.startsWith(path.join(ROOT, 'public')) || f.includes(`${path.sep}Models${path.sep}`)) {
    console.log('skip (outside public/assets)', f0);
    continue;
  }
  const side = f.replace(/\.glb$/i, '.lod.bin');
  if (!o.force && fs.existsSync(side) && fs.statSync(side).mtimeMs > fs.statSync(f).mtimeMs) {
    sum.skipped++;
    continue;
  }
  try {
    const t = Date.now();
    const r = processFile(f);
    if (r.tris0 < MIN_TRIS) {
      sum.skipped++;
      continue;
    }
    const out = writeSidecar(f, r);
    const bytes = o.dry ? 0 : fs.statSync(out).size;
    sum.files++;
    sum.tris0 += r.tris0;
    r.trisL.forEach((v, i) => {
      sum.trisL[i] += v;
    });
    sum.bytes += bytes;
    console.log(
      path.relative(ROOT, f).padEnd(70),
      String(Math.round(r.tris0)).padStart(7),
      '->',
      r.trisL.map((v) => Math.round(v)).join(' / '),
      `${(bytes / 1024).toFixed(0)} KB`,
      `${Date.now() - t} ms`,
    );
  } catch (e) {
    console.log('FAIL', f0, e.message);
  }
}
console.log(
  `done: ${sum.files} files (${sum.skipped} skipped), tris ${Math.round(sum.tris0)} -> ${sum.trisL.map((v) => Math.round(v)).join(' / ')}, sidecars ${(sum.bytes / 1048576).toFixed(1)} MB`,
);
