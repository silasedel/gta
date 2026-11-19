// Short-hair volume shell built from the head mesh (same skin weights), matching the painted hairline
// in characterMaterials.makeSkinMaterial so the silhouette has real hair volume.
import * as THREE from 'three';

const sstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function addHairShell(headMesh) {
  const g = headMesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2,
    cz = (bb.min.z + bb.max.z) / 2,
    top = bb.max.y;
  const pos = g.attributes.position,
    nrm = g.attributes.normal;
  if (!nrm) return null;
  const n = pos.count;
  const keep = new Uint8Array(n);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const dx = x - cx,
      dz = z - cz;
    const fwd = dz / Math.max(Math.hypot(dx, dz), 1e-4);
    const hl =
      top - (0.098 + (0.066 - 0.098) * sstep(0.25, 0.92, fwd)) - 0.075 * sstep(-0.15, -0.85, fwd);
    if (y > hl + 0.003) keep[i] = 1;
    const th =
      0.002 +
      0.0105 * sstep(hl, hl + 0.04, y) +
      0.003 * sstep(0.3, 0.9, fwd) * sstep(hl, hl + 0.02, y);
    out[i * 3] = x + nrm.getX(i) * th;
    out[i * 3 + 1] = y + nrm.getY(i) * th;
    out[i * 3 + 2] = z + nrm.getZ(i) * th;
  }
  const idx = g.index ? g.index.array : [...Array(n).keys()];
  const tris = [];
  for (let t = 0; t < idx.length; t += 3)
    if (keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]])
      tris.push(idx[t], idx[t + 1], idx[t + 2]);
  if (tris.length < 30) return null;
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(out, 3));
  hg.setAttribute('normal', nrm.clone());
  hg.setAttribute('skinIndex', g.attributes.skinIndex.clone());
  hg.setAttribute('skinWeight', g.attributes.skinWeight.clone());
  hg.setIndex(tris);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1410,
    roughness: 0.78,
    metalness: 0,
    name: 'CharHair',
  });
  const hair = new THREE.SkinnedMesh(hg, mat);
  hair.name = 'CharHairShell';
  hair.bind(headMesh.skeleton, headMesh.bindMatrix);
  hair.position.copy(headMesh.position);
  hair.quaternion.copy(headMesh.quaternion);
  hair.scale.copy(headMesh.scale);
  headMesh.parent.add(hair);
  return hair;
}

export function makeHairMaterial(hex) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex).multiplyScalar(1.15),
    roughness: 0.72,
    metalness: 0,
    name: 'CharHair',
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vHairP;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vHairP = position;',
      );
    shader.fragmentShader =
      'varying vec3 vHairP;\nfloat hh(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= 0.7 + 0.45 * hh(floor(vHairP * vec3(1400.0, 500.0, 1400.0))) + 0.15 * hh(floor(vHairP * 220.0));',
      );
  };
  m.customProgramCacheKey = () => 'charHair';
  return m;
}
