import { loadData } from './env.mjs'; import { buildNetwork } from '../network.js';
const data = await loadData(); const net = buildNetwork(data); const [x, z] = process.argv.slice(2).map(Number);
for (const p of net.piers) if (Math.hypot(p.x - x, p.z - z) < 15) console.log('pier chain', p.chain, net.chains[p.chain].name, 's', p.s.toFixed(1), 'soffit', p.soffit.toFixed(2), 'xz', p.x.toFixed(1), p.z.toFixed(1), 'vL vR', p.vL.toFixed(1), p.vR.toFixed(1));
console.log('heightAt', net.heightAt(x, z, null, 0), JSON.stringify(net.lastQuery));
