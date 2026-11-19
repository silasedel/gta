const KEYS = (process.env.KEYS || 'hatch2,police1,suv7,sedan3').split(',');
const steps = [
  {
    eval: `(() => { game.timeOfDay = 12; game.teleport(407, undefined, -110, 0); return typeof game.npc?.createDriver; })()`,
    sleep: 12000,
  },
];
for (const k of KEYS)
  steps.push({
    log: k,
    eval: `(async () => { const T = window.THREE || game.THREE, V = game.vehicles, pp = game.player.position;
    if (window.__cv) { try { V.remove(window.__cv); } catch (e) {} }
    const v = await V.spawnParked('${k}', { x: pp.x + 6, z: pp.z + 2, heading: 0 }); window.__cv = v; await new Promise((r) => setTimeout(r, 900));
    V.addDriver(v); await new Promise((r) => setTimeout(r, 500)); const ch = v.driverChar, sh = v.car.shell; sh.updateWorldMatrix(true, true);
    const bone = (n) => { let b = null; ch.root.traverse((o) => { if (o.isBone && o.name.endsWith(n)) b = b || o; }); if (!b) return null; const p = b.getWorldPosition(new T.Vector3()); return sh.worldToLocal(p).toArray().map((x) => +x.toFixed(3)); };
    return JSON.stringify({ key: v.typeKey, anchor: v.seatAnchor(0).hip, root: ch.root.position.toArray().map((x) => +x.toFixed(3)), scale: ch.root.scale.toArray(), parentIsShell: ch.root.parent === sh, upleg: bone('LeftUpLeg'), head: bone('Head'), hips: bone('Hips'), ctor: ch.kind || ch.variant || '' }); })()`,
  });
export default steps;
