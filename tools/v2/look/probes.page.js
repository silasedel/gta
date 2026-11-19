// r2-look: calibration probes at (x, z): chrome / glossy white paint / 80% white diffuse / 18% gray / 4% black spheres
// and a Macbeth-like strip. window.__probes(x, z, yawDeg) -> group; window.__probesOff()
window.__probes = (x, z, yaw = 0) => {
  const T = game.THREE;
  window.__probesOff?.();
  const g = new T.Group();
  g.name = 'r2look-probes';
  const mats = [
    new T.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }),
    new T.MeshPhysicalMaterial({
      color: new T.Color().setRGB(0.8, 0.8, 0.8, T.LinearSRGBColorSpace),
      metalness: 0,
      roughness: 0.4,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    new T.MeshStandardMaterial({
      color: new T.Color().setRGB(0.8, 0.8, 0.8, T.LinearSRGBColorSpace),
      metalness: 0,
      roughness: 0.9,
    }),
    new T.MeshStandardMaterial({
      color: new T.Color().setRGB(0.18, 0.18, 0.18, T.LinearSRGBColorSpace),
      metalness: 0,
      roughness: 0.9,
    }),
    new T.MeshStandardMaterial({
      color: new T.Color().setRGB(0.04, 0.04, 0.04, T.LinearSRGBColorSpace),
      metalness: 0,
      roughness: 0.9,
    }),
  ];
  const geo = new T.SphereGeometry(0.45, 48, 24);
  const gy = game.city.groundHeightAt(x, z, 50);
  mats.forEach((m, i) => {
    const s = new T.Mesh(geo, m);
    s.position.set((i - 2) * 1.1, 0.45, 0);
    s.castShadow = s.receiveShadow = true;
    s.userData.noDetailCull = true;
    g.add(s);
  });
  g.position.set(x, gy + 0.02, z);
  g.rotation.y = (yaw * Math.PI) / 180;
  game.scene.add(g);
  window.__probeG = g;
  return g.uuid;
};
window.__probesOff = () => {
  if (window.__probeG) {
    game.scene.remove(window.__probeG);
    window.__probeG = null;
  }
};
