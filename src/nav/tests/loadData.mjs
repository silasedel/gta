// Node loader for the real map data (the same loader the game uses, with fetch pointed at public/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNavGraph } from '../graph.js';
import { harvestControls } from '../controls.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let cached = null;
export async function loadWorld() {
  if (cached) return cached;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const f = path.join(ROOT, 'public', String(url).replace(/^https?:\/\/[^/]+/, ''));
    if (!fs.existsSync(f))
      return {
        ok: false,
        status: 404,
        json: async () => {
          throw new Error('404 ' + url);
        },
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    const buf = fs.readFileSync(f);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  };
  const { loadMiamiData } = await import('../../world/miami/data.js');
  const data = await loadMiamiData(null, { base: '/assets/miami/' });
  globalThis.fetch = realFetch;
  const controls = await harvestControls(data);
  const t0 = performance.now();
  const G = buildNavGraph(data.roadGraph, {
    zoneAt: data.zoneAt,
    districtAt: data.districtAt,
    signals: controls.signals,
    stops: controls.stops,
  });
  cached = { data, controls, G, graphMs: performance.now() - t0 };
  return cached;
}

// deterministic random
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
