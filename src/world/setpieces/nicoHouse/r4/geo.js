// r4 geometry helpers (street frame). Everything here is a closed solid: no single planes or cards.
// hexa: a convex hexahedron from 8 corners (bottom quad a0..a3, top quad b0..b3, same winding), flat-shaded faces with
// hard edges and meter UVs, appended to a kit batch. Used for sloped-top gable boards, stair stringers, rafter tails.
export function makeGeo(THREE, kit) {
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const hexa = (B, m, c, o = {}) => {
    // c: [a0, a1, a2, a3, b0, b1, b2, b3] (a = bottom ring, b = top ring, a_i below b_i)
    const S = o.uvS ?? m.userData.uvScale ?? 1,
      pos = [],
      nor = [],
      uv = [],
      idx = [];
    const faces = [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    const P = c.map(V),
      ctr = P.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / 8);
    for (const f of faces) {
      const p = f.map((i) => P[i]),
        n = new THREE.Vector3()
          .subVectors(p[1], p[0])
          .cross(new THREE.Vector3().subVectors(p[2], p[0]));
      if (n.lengthSq() < 1e-12)
        n.subVectors(p[2], p[1]).cross(new THREE.Vector3().subVectors(p[3], p[1]));
      n.normalize();
      const fc = p.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(0.25);
      let flip = n.dot(new THREE.Vector3().subVectors(fc, ctr)) < 0;
      if (flip) n.negate();
      // uv: project on the face's dominant plane (meters / S), grain along o.grain axis when given
      const ax =
        Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z)
          ? 0
          : Math.abs(n.y) > Math.abs(n.z)
            ? 1
            : 2;
      const ua = ax === 0 ? 2 : 0,
        va = ax === 1 ? 2 : 1,
        base = pos.length / 3;
      for (const q of p) {
        pos.push(q.x, q.y, q.z);
        nor.push(n.x, n.y, n.z);
        const a = [q.x, q.y, q.z];
        uv.push(a[ua] / S + (o.uo || 0), a[va] / S);
      }
      if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    B.geo(m, g, null, { color: o.color, wear: o.wear ?? 0.3 });
    g.dispose();
  };
  // subtract intervals [a, b] from [lo, hi] -> list of remaining [a, b] (length > eps)
  const subtract = (lo, hi, cuts, eps = 0.01) => {
    let out = [[lo, hi]];
    for (const [a, b] of cuts) {
      const nx = [];
      for (const [p, q] of out) {
        if (b <= p || a >= q) {
          nx.push([p, q]);
          continue;
        }
        if (a > p) nx.push([p, a]);
        if (b < q) nx.push([b, q]);
      }
      out = nx;
    }
    return out.filter(([p, q]) => q - p > eps);
  };
  // lathe solid (smooth normals) for round things: profile [[r, y], ...] from bottom to top
  const lathe = (B, m, prof, m4, o = {}) => {
    const g = new THREE.LatheGeometry(
      prof.map(([r, y]) => new THREE.Vector2(r, y)),
      o.seg ?? 24,
    );
    B.geo(m, g, m4, o);
    g.dispose();
  };
  return { hexa, subtract, lathe };
}
