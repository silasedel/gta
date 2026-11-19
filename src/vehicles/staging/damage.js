// Per-car body denting. Geometry is shared per car type, so we clone on first dent.
import * as THREE from 'three';

export function dentMesh(mesh, p, depth, radius = 0.6) {
  if (!mesh) return;
  if (!mesh.userData.ownGeo) {
    mesh.geometry = mesh.geometry.clone();
    mesh.userData.ownGeo = true;
  }
  const pos = mesh.geometry.attributes.position;
  const cx = 0,
    cy = p.cy ?? 0.8,
    cz = 0;
  const r2 = radius * radius;
  let touched = false;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const dx = x - p.x,
      dy = y - p.y,
      dz = z - p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) continue;
    const f = 1 - Math.sqrt(d2) / radius;
    // push toward the car's center line, a bit noisy for a crumpled look
    let ix = cx - x,
      iy = (cy - y) * 0.3,
      iz = cz - z;
    const l = Math.hypot(ix, iy, iz) || 1;
    const amt = depth * f * f * (0.75 + 0.5 * Math.abs(Math.sin(x * 37.1 + z * 21.7)));
    pos.setXYZ(i, x + (ix / l) * amt, y + (iy / l) * amt, z + (iz / l) * amt);
    touched = true;
  }
  if (touched) {
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
}
