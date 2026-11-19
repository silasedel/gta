// r7e: the user's adapted library props (public/assets/models/keys/*.glb, made by tools/v2/keys/r7/convert_prop.py from Models/_Inbox
// downloads): one load per file, a clone per use, shadows, no raycasts, the interior's indirect-light hook, and a per-material tweak so
// every use can recolor / age / darken the model (the user's rule: adapt every model, never drop it in as shipped).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const cache = new Map();
export function glb(kit, file, o = {}) {
  if (!cache.has(file))
    cache.set(
      file,
      new GLTFLoader()
        .loadAsync((import.meta.env?.BASE_URL ?? '/') + 'assets/models/keys/' + file)
        .then((g) => g.scene)
        .catch((e) => {
          console.warn('[nicoHouse] model', file, e?.message || e);
          return null;
        }),
    );
  return cache.get(file).then((s) => {
    if (!s) return null;
    const c = s.clone(true);
    c.traverse((n) => {
      if (!n.isMesh) return;
      n.raycast = () => {};
      n.castShadow = o.cast ?? true;
      n.receiveShadow = true;
      let m = n.material.clone();
      if (o.interior && kit.setIndirect) m = kit.setIndirect(m);
      m.envMapIntensity = Math.min(m.envMapIntensity ?? 1, o.env ?? 0.45);
      if (o.mat) o.mat(m, n);
      n.material = m;
    });
    if (o.pos) c.position.set(...o.pos);
    if (o.ry) c.rotation.y = o.ry;
    if (o.rx) c.rotation.x = o.rx;
    if (o.scale) c.scale.set(...(Array.isArray(o.scale) ? o.scale : [o.scale, o.scale, o.scale]));
    if (o.parent) o.parent.add(c);
    return c;
  });
}
