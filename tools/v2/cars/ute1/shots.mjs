// Nico's ute (ute1) in game: parked in his drive (mock-up views: high front-left 3/4, high rear, profile, cab), then entered
// and driven a few seconds (chase view).   TAG=u1a node tools/v2/cars/r2.mjs tools/v2/cars/ute1/shots.mjs
//   -> docs/v2/shots/cars/ute1/<TAG>_<view>.png
const TAG = process.env.TAG || 'u1';
const D = 'docs/v2/shots/cars/ute1';
const FIND = `(game.vehicles.nicoCars || []).find((c) => c && c.typeKey === 'ute1')`;
const SHOTS = [['side34', [3.6, 3.3, 4.2]], ['rear34', [-2.6, 3.4, -6.4]], ['rear', [0.0, 3.6, -7.2]], ['profile', [6.4, 1.2, 0.0]], ['front34', [-3.4, 1.4, 5.2]], ['cab', [2.0, 1.75, 0.6]], ['wheel', [2.6, 0.6, 3.6]]];
const cam = (off, look = 0.8) => `(() => { const T = window.THREE || game.THREE; const v = ${FIND}; if (!v) return 'missing'; window.__cv = v;
  const off = new T.Vector3(${off.join(',')});
  game.cameraOverride = (dt, c) => { const m = window.__cv.mesh; c.position.copy(off.clone().applyQuaternion(m.quaternion).add(m.position)); c.lookAt(m.position.x, m.position.y + ${look}, m.position.z); if (c.fov !== 45) { c.fov = 45; c.updateProjectionMatrix(); } return true; }; return 1; })()`;
const steps = [{ eval: `(() => { game.timeOfDay = 16.5; game.teleport(-866.1, undefined, 4836.4, 2.6); return 1; })()`, sleep: 20000 },
  { log: 'ute', eval: `(() => { const v = ${FIND}; if (!v) return 'missing: ' + (game.vehicles.nicoCars || []).map((c) => c && c.typeKey).join(',');
    const P = v.car.paint; const tri = (() => { let n = 0; v.car.shell.traverse((o) => { if (o.isMesh && o.geometry?.index) n += o.geometry.index.count / 3; }); return n; })();
    const NH = game.nicoHouse, a = NH?.house?.anchors?.truckR4, aw = a && NH.toWorld(a.pos.clone().setY(0));
    return JSON.stringify({ anchor: aw && [+aw.x.toFixed(2), +aw.z.toFixed(2), +(a.heading + (NH.spot?.heading || 0)).toFixed(3)], rotY: +v.mesh.rotation.y.toFixed(3), pos: v.mesh.position.toArray().map((x) => +x.toFixed(2)), color: P.color.getHexString(), cc: P.clearcoat, stripe: v.look?.stripe, spec: { mass: v.spec?.mass, t100: v.spec?.t100, drive: v.spec?.drive, label: v.spec?.label }, tri }); })()` },
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [vn, off] of SHOTS) { if (ONLY && !ONLY.includes(vn)) continue; steps.push({ eval: cam(off, vn === 'wheel' ? 0.35 : 0.8), sleep: 1800 }); steps.push({ shot: `${D}/${TAG}_${vn}.png` }); }
// enter and drive: W held 4 s, chase camera behind (NODRIVE=1 skips)
if (!process.env.NODRIVE) {
steps.push({ eval: `(() => { game.cameraOverride = null; const v = ${FIND}; window.__u = v; const t = v.mesh.position; game.teleport(t.x + 2.2, undefined, t.z, 0); return 1; })()`, sleep: 6000 });
steps.push({ log: 'enter', eval: `(() => { game.enterVehicle(window.__u); return String(!!game.player?.vehicle || game.player?.inVehicle); })()`, sleep: 3000 });
steps.push({ eval: `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true })); return 1; })()`, sleep: 3500 });
steps.push({ eval: cam([1.8, 2.2, -6.5], 0.7), sleep: 600 });
steps.push({ shot: `${D}/${TAG}_drive.png` });
steps.push({ log: 'drive', eval: `(() => { document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true })); const v = window.__u; const lv = v.body?.linvel?.(); return JSON.stringify({ kmh: lv ? +(Math.hypot(lv.x, lv.z) * 3.6).toFixed(1) : null, pos: v.mesh.position.toArray().map((x) => +x.toFixed(1)) }); })()`, sleep: 500 });
steps.push({ eval: cam([-3.2, 1.6, 4.6], 0.7), sleep: 1200 });
steps.push({ shot: `${D}/${TAG}_driven34.png` });
}
export default steps;
