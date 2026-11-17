// r2-perf: minimal GLB read / decode / write for the offline LOD tools (no gltf-transform dependency).
//   readGlb(file) -> { json, bin }
//   decodePrim(g, prim) -> { attrs: { NAME: { data: Float32Array, n } }, idx: Uint32Array, count }   (Draco or plain)
//   writeGlb(file, srcGlb, prims) : copies every image / texture / sampler / material / node / scene of the source and
//     replaces each mesh primitive with the given plain (uncompressed) attributes + indices. prims: Map 'm:p' -> decoded
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const draco3d = require('draco3d');
let D = null;
export async function initDraco() { if (!D) D = await draco3d.createDecoderModule({}); return D; }

export function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
export const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAccessor(g, idx) {
  const acc = g.json.accessors[idx], bv = g.json.bufferViews[acc.bufferView];
  const T = CT[acc.componentType], n = NC[acc.type], es = T.BYTES_PER_ELEMENT;
  const stride = bv.byteStride || n * es, base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const rd = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[acc.componentType];
  const norm = acc.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[acc.componentType] || 1 : 1;
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = dv[rd](base + i * stride + c * es, true) / norm;
  return { data: out, n, count: acc.count };
}
export function decodePrim(g, prim) {
  const ext = prim.extensions?.KHR_draco_mesh_compression;
  if (!ext) {
    const attrs = {};
    for (const [k, ai] of Object.entries(prim.attributes)) attrs[k] = readAccessor(g, ai);
    const count = attrs.POSITION.count;
    let idx;
    if (prim.indices !== undefined) { const a = readAccessor(g, prim.indices); idx = Uint32Array.from(a.data); } else idx = Uint32Array.from({ length: count }, (_, i) => i);
    return { attrs, idx, count };
  }
  const bv = g.json.bufferViews[ext.bufferView];
  const data = new Int8Array(g.bin.buffer, g.bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
  const dec = new D.Decoder(), buf = new D.DecoderBuffer();
  buf.Init(data, data.byteLength);
  const mesh = new D.Mesh();
  const st = dec.DecodeBufferToMesh(buf, mesh);
  if (!st.ok() || mesh.ptr === 0) throw new Error('draco decode failed');
  const np = mesh.num_points(), nf = mesh.num_faces();
  const attrs = {};
  for (const [name, uid] of Object.entries(ext.attributes)) {
    const n = NC[g.json.accessors[prim.attributes[name]]?.type] || 3;
    const at = dec.GetAttributeByUniqueId(mesh, uid);
    const bytes = np * n * 4, ptr = D._malloc(bytes);
    dec.GetAttributeDataArrayForAllPoints(mesh, at, D.DT_FLOAT32, bytes, ptr);
    attrs[name] = { data: new Float32Array(D.HEAPF32.buffer, ptr, np * n).slice(), n, count: np };
    D._free(ptr);
  }
  const ib = nf * 3 * 4, ip = D._malloc(ib);
  dec.GetTrianglesUInt32Array(mesh, ib, ip);
  const idx = new Uint32Array(D.HEAPU32.buffer, ip, nf * 3).slice();
  D._free(ip); D.destroy(mesh); D.destroy(buf); D.destroy(dec);
  return { attrs, idx, count: np };
}

const TYPE = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' };
export function writeGlb(file, g, prims) {
  const J = JSON.parse(JSON.stringify(g.json));
  const chunks = []; let off = 0;
  const views = [], accs = [];
  const pushView = (buf, target) => { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } chunks.push(buf); views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); off += buf.length; return views.length - 1; };
  // images first (keep their bytes and mime type)
  const imgMap = new Map();
  for (const im of J.images || []) {
    if (im.bufferView === undefined) continue;
    const bv = g.json.bufferViews[im.bufferView];
    if (!imgMap.has(im.bufferView)) imgMap.set(im.bufferView, pushView(Buffer.from(g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength))));
    im.bufferView = imgMap.get(im.bufferView);
  }
  J.meshes.forEach((m, mi) => m.primitives.forEach((p, pi) => {
    const d = prims.get(mi + ':' + pi); if (!d) throw new Error('missing primitive ' + mi + ':' + pi);
    const attributes = {};
    for (const [k, a] of Object.entries(d.attrs)) {
      const arr = Float32Array.from(a.data);
      const v = pushView(Buffer.from(arr.buffer), 34962);
      const acc = { bufferView: v, componentType: 5126, count: a.data.length / a.n, type: TYPE[a.n] };
      if (k === 'POSITION') { const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30]; for (let i = 0; i < arr.length; i += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], arr[i + c]); mx[c] = Math.max(mx[c], arr[i + c]); } acc.min = mn; acc.max = mx; }
      accs.push(acc); attributes[k] = accs.length - 1;
    }
    const ia = d.count < 65536 ? Uint16Array.from(d.idx) : Uint32Array.from(d.idx);
    const iv = pushView(Buffer.from(ia.buffer, ia.byteOffset, ia.byteLength), 34963);
    accs.push({ bufferView: iv, componentType: ia instanceof Uint16Array ? 5123 : 5125, count: ia.length, type: 'SCALAR' });
    const np = { attributes, indices: accs.length - 1, mode: 4 };
    if (p.material !== undefined) np.material = p.material;
    m.primitives[pi] = np;
  }));
  if (J.skins?.length || J.animations?.length) throw new Error('skins / animations not supported by writeGlb');
  J.accessors = accs; J.bufferViews = views;
  const binBuf = Buffer.concat(chunks); const binPad = Buffer.alloc((4 - (binBuf.length % 4)) % 4);
  J.buffers = [{ byteLength: binBuf.length + binPad.length }];
  J.extensionsUsed = (J.extensionsUsed || []).filter((e) => e !== 'KHR_draco_mesh_compression');
  J.extensionsRequired = (J.extensionsRequired || []).filter((e) => e !== 'KHR_draco_mesh_compression');
  if (!J.extensionsUsed.length) delete J.extensionsUsed; if (!J.extensionsRequired.length) delete J.extensionsRequired;
  J.asset = { ...(J.asset || {}), generator: 'r2-perf glbio' };
  const js = Buffer.from(JSON.stringify(J)); const jsPad = Buffer.alloc((4 - (js.length % 4)) % 4, 0x20);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  const total = 12 + 8 + js.length + jsPad.length + 8 + binBuf.length + binPad.length; head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length + jsPad.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length + binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, jh, js, jsPad, bh, binBuf, binPad]));
}
