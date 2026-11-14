// Highways probe: loads the live world through the game's loader (like tools/osm/audit.mjs) and prints facts.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const GAME = path.resolve(HERE, '../..');
const ROOT = path.join(GAME, 'public/assets/miami');
globalThis.fetch = async (url) => { const rel = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/assets\/miami\//, ''); const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => { throw new Error('404') }, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(f); return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; };
const { loadMiamiData } = await import(pathToFileURL(path.join(GAME, 'src/world/miami/data.js')).href);
export const data = await loadMiamiData(null);
