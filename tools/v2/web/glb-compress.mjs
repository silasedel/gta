#!/usr/bin/env node
// r2-web: Draco geometry compression for the web build (never run on public/: the build folder's files are hard links,
// every rewrite here unlinks first). GitHub Pages does not gzip .glb, so uncompressed vertex data goes over the wire as is.
//   node tools/v2/web/glb-compress.mjs --dir ../pages-gta6 [--min 65536] [--dry] [--only models/vegetation]
// Needs tools/v2/web/.deps:  (cd tools/v2/web/.deps && npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf)
// - Only files without Draco / meshopt, with >= --min bytes of geometry, no morph targets, no skins, no unknown extensions.
// - Quantization is set high on purpose (visually lossless): positions 16 bit (1 mm on a 60 m building), normals 12,
//   UVs 14 (a quarter texel on a 4K map), colors 10, other attributes 14. Textures are kept byte for byte.
// - A file is replaced only when the result is >= 10 % smaller. The game reads it through src/web/gltfDecoders.js.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2),
  o = {};
for (let i = 0; i < a.length; i++)
  if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
  }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(o.dir || '');
if (!o.dir || !fs.existsSync(path.join(DIR, 'index.html'))) {
  console.error('glb-compress: --dir must be a build folder');
  process.exit(2);
}
if (/[/\\]public[/\\]?$/.test(DIR)) {
  console.error('glb-compress: refusing to touch public/');
  process.exit(2);
}
const req = createRequire(path.join(HERE, '.deps/package.json'));
let core, ext, fns, draco3d;
try {
  core = await import(req.resolve('@gltf-transform/core'));
  ext = await import(req.resolve('@gltf-transform/extensions'));
  fns = await import(req.resolve('@gltf-transform/functions'));
  draco3d = req('draco3dgltf');
} catch (e) {
  console.error('glb-compress: missing tools/v2/web/.deps (see the header for the install line)');
  process.exit(2);
}
const { NodeIO } = core;
const io = new NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const KNOWN = new Set(ext.ALL_EXTENSIONS.map((E) => E.EXTENSION_NAME));
const MIN = +(o.min || 65536);

function header(f) {
  const fd = fs.openSync(f, 'r');
  const h = Buffer.alloc(20);
  fs.readSync(fd, h, 0, 20, 0);
  const jl = h.readUInt32LE(12);
  const j = Buffer.alloc(jl);
  fs.readSync(fd, j, 0, jl, 20);
  fs.closeSync(fd);
  return JSON.parse(j.toString('utf8'));
}
function* walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.glb')) yield p;
  }
}

let before = 0,
  after = 0,
  done = 0,
  skipped = {};
const skip = (why) => {
  skipped[why] = (skipped[why] || 0) + 1;
};
const t0 = Date.now();
for (const f of walk(DIR)) {
  const rel = path.relative(DIR, f);
  if (o.only && !rel.includes(o.only)) continue;
  let j;
  try {
    j = header(f);
  } catch (e) {
    skip('unreadable');
    continue;
  }
  const used = j.extensionsUsed || [];
  if (used.includes('KHR_draco_mesh_compression') || used.includes('EXT_meshopt_compression')) {
    skip('already compressed');
    continue;
  }
  if (used.some((x) => !KNOWN.has(x))) {
    skip('unknown extension');
    continue;
  }
  if ((j.meshes || []).some((m) => (m.primitives || []).some((p) => p.targets?.length))) {
    skip('morph targets');
    continue;
  }
  // skinned characters / garments: code may match vertices by index (outfits on the body); leave them as authored
  if ((j.skins || []).length) {
    skip('skinned');
    continue;
  }
  const bv = j.bufferViews || [];
  const imgBytes = (j.images || []).reduce(
    (s, im) => s + (im.bufferView != null ? bv[im.bufferView]?.byteLength || 0 : 0),
    0,
  );
  const size = fs.statSync(f).size;
  if (size - imgBytes < MIN) {
    skip('small geometry');
    continue;
  }
  try {
    const doc = await io.read(f);
    await doc.transform(
      fns.draco({
        method: 'edgebreaker',
        encodeSpeed: 5,
        decodeSpeed: 5,
        quantizePosition: 16,
        quantizeNormal: 12,
        quantizeTexcoord: 14,
        quantizeColor: 10,
        quantizeGeneric: 14,
      }),
    );
    const out = await io.writeBinary(doc);
    if (out.byteLength > size * 0.9) {
      skip('gain < 10 %');
      continue;
    }
    before += size;
    after += out.byteLength;
    done++;
    if (!o.dry) {
      const tmp = f + '.tmp-web';
      fs.writeFileSync(tmp, out);
      fs.unlinkSync(f);
      fs.renameSync(tmp, f);
    }
    if (o.verbose)
      console.log(
        `  ${(size / 1048576).toFixed(2)} -> ${(out.byteLength / 1048576).toFixed(2)} MiB  ${rel}`,
      );
  } catch (e) {
    skip('error');
    console.warn('  skip (error)', rel, String(e.message || e).slice(0, 120));
  }
}
console.log(
  `  glb-compress: ${done} files ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MiB (saved ${((before - after) / 1048576).toFixed(1)} MiB) in ${((Date.now() - t0) / 1000).toFixed(0)} s; skipped ${JSON.stringify(skipped)}${o.dry ? ' (dry run)' : ''}`,
);
