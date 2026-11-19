// Skiff probe: the moored skiff's heading against its anchor's and the site frame's +X direction
(async () => {
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20 && !game.nicoHouse.skiff; i++) await sl(1000);
  await sl(3000);
  const NH = game.nicoHouse, T = game.THREE, b = NH.skiff, a = NH.anchors.skiff;
  let fg = null;
  NH.group.traverse((o) => { if (o.name === 'r4_ext_site_h') fg = o; });
  const o0 = new T.Vector3(0, 0, 0).applyMatrix4(fg.matrixWorld), o1 = new T.Vector3(1, 0, 0).applyMatrix4(fg.matrixWorld);
  const t = b && b.body.translation();
  return JSON.stringify({ boatH: b && b.heading, anchorH: a.heading, siteX: Math.atan2(o1.x - o0.x, o1.z - o0.z), pos: t && [t.x - a.pos.x, t.z - a.pos.z], q: b && b.body.rotation() });
})()
