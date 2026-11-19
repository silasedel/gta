#!/usr/bin/env node
// Drop material texture slots whose glTF texture has no image source (Blender exports an empty texture when a linked image
// file is missing; three's GLTFLoader then fails the whole model).  node tools/v2/cars/glb_fixtex.mjs <file.glb>
import fs from 'node:fs';
const f = process.argv[2], b = fs.readFileSync(f);
const jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl).toString());
const bad = new Set((j.textures || []).map((t, i) => (t.source == null && t.extensions?.EXT_texture_webp?.source == null ? i : -1)).filter((i) => i >= 0));
let n = 0;
const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && 'index' in v && /Texture$/.test(k) && bad.has(v.index)) { delete o[k]; n++; } else walk(v); } };
for (const m of j.materials || []) walk(m);
let js = Buffer.from(JSON.stringify(j)); const pad = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
const rest = b.slice(20 + jl), hdr = Buffer.alloc(20);
hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(20 + js.length + rest.length, 8); hdr.writeUInt32LE(js.length, 12); hdr.writeUInt32LE(0x4e4f534a, 16);
fs.writeFileSync(f, Buffer.concat([hdr, js, rest]));
console.log(`${f}: ${bad.size} empty textures, ${n} material slots dropped`);
