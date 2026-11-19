// node harness: load Miami data like the browser does (ELEVATED agent tools)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const projRoot = path.resolve(here, '../../../../..');
const rd = (u) => {
  for (const p of [path.join(projRoot, 'public', u), path.join(projRoot, u)])
    if (fs.existsSync(p)) return fs.readFileSync(p);
  throw new Error('404 ' + u);
};
globalThis.fetch = async (u) => {
  const b = rd(u);
  return {
    ok: true,
    json: async () => JSON.parse(b.toString('utf8')),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  };
};
globalThis.document ??= {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () =>
      new Proxy(
        {},
        {
          get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })),
          set: (o, k, v) => ((o[k] = v), true),
        },
      ),
  }),
};
export async function loadData() {
  const { loadMiamiData } = await import(path.join(projRoot, 'src/world/miami/data.js'));
  return loadMiamiData(null);
}
