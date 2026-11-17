// A/B inside one page: frame time and draw calls with the keys-pass objects shown vs hidden (same camera, same moment)
(async () => {
  const keys = []; game.scene.traverse((o) => { const n = (o.name || '') + ' ' + (o.material?.name || ''); if (/keysYard|keysStops|keysDock|keysLots|dockPiles|keys:|kit:pier|planter/.test(n) && (o.isMesh || o.isInstancedMesh || o.isGroup)) keys.push(o); });
  const measure = () => new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (n - t0 < 2500) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); const ri = game.renderer.info.render; res({ avgMs: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2), p50: +ts[ts.length >> 1].toFixed(2), calls: ri.calls, tris: ri.triangles }); } }; requestAnimationFrame(f); });
  const out = { objects: keys.length, rounds: [] };
  for (let i = 0; i < 3; i++) { for (const o of keys) o.visible = true; const on = await measure(); for (const o of keys) o.visible = false; const off = await measure(); out.rounds.push({ on, off }); }
  for (const o of keys) o.visible = true;
  return JSON.stringify(out);
})()
