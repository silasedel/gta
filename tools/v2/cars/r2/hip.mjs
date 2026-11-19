export default [
  {
    sleep: 10000,
    log: 'hip',
    eval: `(() => {
    const T = window.THREE || game.THREE; const out = {};
    const v = game.vehicles.list.find((x) => x.driverChar) || game.vehicles.list[0];
    const ch = v?.driverChar; if (!ch) return 'no driver ' + game.vehicles.list.length;
    const root = ch.root; root.updateWorldMatrix(true, true);
    const names = []; root.traverse((o) => { if (o.isBone && /hips$|upleg$|^mixamorigleftleg$|head$|foot$/i.test(o.name)) names.push(o.name); });
    for (const n of names.slice(0, 12)) { const b = ch.getBone?.(n) || root.getObjectByName(n); if (!b) continue; const p = b.getWorldPosition(new T.Vector3()); root.worldToLocal(p); out[n] = p.toArray().map((x) => +x.toFixed(3)); }
    out.key = v.typeKey; out.anchor = v.seatAnchor?.(0)?.hip?.toArray?.(); out.rootPos = root.position.toArray().map((x) => +x.toFixed(3)); out.scale = root.scale.x;
    return JSON.stringify(out); })()`,
  },
];
