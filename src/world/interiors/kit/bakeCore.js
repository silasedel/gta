// Interiors engine kit: light bake (pure math, no three.js; runs in a Worker or sliced on the main thread).
// For every vertex: direct light from every fixture with box-occluder shadows, a per-room bounce term, and short-range
// ambient occlusion. Output: three linear-RGB irradiance channels (main lights, accent lights, daylight).
//
// input = { pos, nor: Float32Array(n*3), count, gain?: Float32Array(n),
//   lights: [{ p:[x,y,z], c:[r,g,b], ch:0|1|2, type:'omni'|'area'|'spot', d:[x,y,z], cone:cos(outer), soft:m }],
//   occ: Float32Array(k*6) boxes x0,y0,z0,x1,y1,z1,  rooms: [{ x0,x1,z0,z1,y0,y1 }],  bounce: 0.5, ao: 0.8 }

function segBox(px, py, pz, dx, dy, dz, o, i) { // does the segment p -> p+d cross box i? (start points inside the box ignore it)
  let t0 = 0.0, t1 = 1.0;
  const x0 = o[i], y0 = o[i + 1], z0 = o[i + 2], x1 = o[i + 3], y1 = o[i + 4], z1 = o[i + 5];
  if (px > x0 && px < x1 && py > y0 && py < y1 && pz > z0 && pz < z1) return 2;
  if (dx > 1e-9 || dx < -1e-9) { let a = (x0 - px) / dx, b = (x1 - px) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; } else if (px < x0 || px > x1) return 2;
  if (dy > 1e-9 || dy < -1e-9) { let a = (y0 - py) / dy, b = (y1 - py) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; } else if (py < y0 || py > y1) return 2;
  if (dz > 1e-9 || dz < -1e-9) { let a = (z0 - pz) / dz, b = (z1 - pz) / dz; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; } else if (pz < z0 || pz > z1) return 2;
  return t0; // entry fraction 0..1
}
const AO_DIRS = (() => { const d = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + 0.3; d.push([Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.57]); } d.push([0, 0, 1]); return d; })();

export function* bakeGen(input, slice = 4000) {
  const { pos, nor, count, lights, occ, rooms } = input, gain = input.gain || null, nOcc = occ.length / 6;
  const bounce = input.bounce ?? 0.5, aoK = input.ao ?? 0.8;
  const out = [new Float32Array(count * 3), new Float32Array(count * 3), new Float32Array(count * 3)];
  // per-room ambient from the lights inside it
  const roomOf = (x, y, z) => { for (let i = 0; i < rooms.length; i++) { const r = rooms[i]; if (x >= r.x0 - 0.02 && x <= r.x1 + 0.02 && z >= r.z0 - 0.02 && z <= r.z1 + 0.02 && y >= r.y0 - 0.3 && y <= r.y1 + 0.3) return i; } return -1; };
  const amb = rooms.map(() => [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  for (const L of lights) {
    let ri = roomOf(L.p[0], L.p[1], L.p[2]); if (ri < 0 && L.d) ri = roomOf(L.p[0] + L.d[0] * 0.4, L.p[1] + L.d[1] * 0.4, L.p[2] + L.d[2] * 0.4); if (ri < 0) continue;
    const r = rooms[ri], w = r.x1 - r.x0, d = r.z1 - r.z0, h = r.y1 - r.y0, A = 2 * (w * d + w * h + d * h);
    const flux = (L.type === 'omni' ? 12.57 : L.type === 'area' ? 3.14 : 6.28 * (1 - (L.cone || 0.7))) * bounce * (L.amb ?? 1) / A;
    const a = amb[ri][L.ch]; a[0] += L.c[0] * flux; a[1] += L.c[1] * flux; a[2] += L.c[2] * flux;
  }
  // light bounds for a cheap reject
  const LR = lights.map((L) => { const m = Math.max(L.c[0], L.c[1], L.c[2]); return L.range || Math.sqrt(m / 0.03); });
  for (let v = 0; v < count; v++) {
    if (v % slice === 0 && v) yield v / count;
    const i3 = v * 3, px = pos[i3], py = pos[i3 + 1], pz = pos[i3 + 2], nx = nor[i3], ny = nor[i3 + 1], nz = nor[i3 + 2];
    const sx = px + nx * 0.035, sy = py + ny * 0.035, sz = pz + nz * 0.035;
    const ri = roomOf(sx, sy, sz), room = ri >= 0 ? rooms[ri] : null;
    // ---- ambient occlusion (tangent frame around the normal)
    let ao = 1;
    if (aoK > 0) {
      let tx, ty, tz; if (Math.abs(ny) < 0.9) { const l = Math.hypot(nz, nx) || 1; tx = nz / l; ty = 0; tz = -nx / l; } else { tx = 1; ty = 0; tz = 0; }
      const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx; let occl = 0; const R = 0.55;
      for (let k = 0; k < 7; k++) { const a = AO_DIRS[k], dx = (tx * a[0] + bx * a[1] + nx * a[2]) * R, dy = (ty * a[0] + by * a[1] + ny * a[2]) * R, dz = (tz * a[0] + bz * a[1] + nz * a[2]) * R; let t = 2;
        if (room) { if (dy < 0 && sy + dy < room.y0) t = Math.min(t, (room.y0 - sy) / dy); if (dy > 0 && sy + dy > room.y1) t = Math.min(t, (room.y1 - sy) / dy); }
        for (let o = 0; o < nOcc && t > 0.05; o++) { const h = segBox(sx, sy, sz, dx, dy, dz, occ, o * 6); if (h < t) t = h; }
        if (t <= 1) occl += 1 - t * 0.85; }
      ao = 1 - aoK * Math.min(1, occl / 5.5);
    }
    const g = gain ? gain[v] : 1, dk = (0.72 + 0.28 * ao) * g, ak = ao * ao * g;
    if (!room) { const o = out[2]; o[i3] = o[i3 + 1] = o[i3 + 2] = 1.5 * ak; } // outside the rooms (street face of the storefront): open sky
    if (room) { const a = amb[ri]; for (let c = 0; c < 3; c++) { const o = out[c]; o[i3] = a[c][0] * ak; o[i3 + 1] = a[c][1] * ak; o[i3 + 2] = a[c][2] * ak; } }
    // ---- direct light
    for (let li = 0; li < lights.length; li++) {
      const L = lights[li], lx = L.p[0] - sx, ly = L.p[1] - sy, lz = L.p[2] - sz, d2 = lx * lx + ly * ly + lz * lz, r = LR[li]; if (d2 > r * r) continue;
      const d = Math.sqrt(d2) || 1e-4; let cosr = (nx * lx + ny * ly + nz * lz) / d; if (L.wrap) cosr = (cosr + L.wrap) / (1 + L.wrap); if (cosr <= 0.001) continue;
      let e = 1;
      if (L.type === 'area') { e = -(L.d[0] * lx + L.d[1] * ly + L.d[2] * lz) / d; if (e <= 0.001) continue; }
      else if (L.type === 'spot') { const cs = -(L.d[0] * lx + L.d[1] * ly + L.d[2] * lz) / d, c0 = L.cone || 0.7, c1 = c0 + (1 - c0) * 0.45; if (cs <= c0) continue; e = cs >= c1 ? 1 : (cs - c0) / (c1 - c0); e *= e; }
      const soft = L.soft || 0.25, f = e * cosr / (d2 + soft * soft); if (f * Math.max(L.c[0], L.c[1], L.c[2]) < 0.004) continue;
      let blocked = false; for (let o = 0; o < nOcc; o++) { if (segBox(sx, sy, sz, lx, ly, lz, occ, o * 6) < 0.995) { blocked = true; break; } } if (blocked) continue;
      const o = out[L.ch], k = f * dk; o[i3] += L.c[0] * k; o[i3 + 1] += L.c[1] * k; o[i3 + 2] += L.c[2] * k;
    }
  }
  return out;
}
export function bakeSync(input) { const it = bakeGen(input, 1e9); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
