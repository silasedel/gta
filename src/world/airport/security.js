// W6 Miami International security (airports agent, Nov 19): guards at the vehicle gates, patrols on the GA and terminal
// aprons and cameras at the gates and over the aprons. Harder to get into than open ground, easier than the base:
// shorter view ranges, slower noticing, two stars (three if seen again on the alert). Config for src/gameplay/stealth/zone.js.
// Guards: the user's Security Guard In Black Uniform (people library p123); cameras: Security Camera 1 heads.
import { pip } from './geom.js';

export function airportZoneConfig(ap, F) {
  const inside = (x, z) => pip(ap.airside, x, z);
  const guards = [],
    cams = [];
  for (const g of ap.fenceGates || []) {
    const n = F?.nearest?.(g.x, g.z, 20);
    const nx = n ? -n.nx : 0,
      nz = n ? -n.nz : 0; // inward
    const px = g.x + nx * 7 + 4 * nz,
      pz = g.z + nz * 7 - 4 * nx;
    if (inside(px, pz))
      guards.push({ x: px, z: pz, heading: Math.atan2(-nx, -nz) + Math.PI, range: 34, fov: 1.7 });
    const cx = g.x + nx * 10 - 6 * nz,
      cz = g.z + nz * 10 + 6 * nx;
    if (inside(cx, cz))
      cams.push({
        x: cx,
        z: cz,
        yaw: Math.atan2(-nx, -nz) + Math.PI,
        sweep: 0.7,
        period: 10,
        range: 30,
        fov: 0.8,
      });
  }
  for (const a of ap.aprons || []) {
    const c = a.poly.reduce(
      (s, p) => [s[0] + p[0] / a.poly.length, s[1] + p[1] / a.poly.length],
      [0, 0],
    );
    const r = a.poly
      .map(([x, z]) => [x + (c[0] - x) * 0.2, z + (c[1] - z) * 0.2])
      .filter(([x, z]) => inside(x, z));
    if (r.length >= 3) {
      guards.push({ route: r, range: 34, speed: 1.3 });
      if (a.kind === 'terminal')
        guards.push({ route: r.slice(2).concat(r.slice(0, 2)), range: 34, speed: 1.3 });
    }
    for (const k of [0, 2]) {
      const [x, z] = a.poly[k],
        px = x + (c[0] - x) * 0.08,
        pz = z + (c[1] - z) * 0.08;
      if (inside(px, pz))
        cams.push({
          x: px,
          z: pz,
          yaw: Math.atan2(c[0] - px, c[1] - pz),
          sweep: 0.9,
          period: 14,
          range: 36,
          fov: 0.8,
        });
    }
  }
  // the user's security guard (p123, black uniform) on the near guards; instanced far figures in the same black
  const look = {
    uniform: 0x1d1f22,
    dark: 0x111214,
    skin: 0x8a6448,
    vest: 0x24262a,
    helmet: 0x1a1b1d,
  };
  return { guards, cams, person: { id: 'p123' }, camModel: 'airport/sec_cam', look };
}
