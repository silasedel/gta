// r2-physics lab, page side (evaluated by tools/v2/physics/lab.mjs). Defines window.__lab:
//   __lab.findSpot(x, z)            -> a straight road stretch near (x, z): { x, z, y, h, len, width, kind }
//   __lab.build(kind, opts)         -> lab obstacle on the stretch at distance s: 'curb' (15 cm block, both wheels, drive up
//                                     and off its far edge), 'rock' (half-buried rock under the left wheels), 'pothole' (a relief
//                                     pothole drawn as a decal-like dark bowl under the right wheels), 'bump' (speed hump)
//   __lab.run({ key, kmh, s0, sEnd }) -> starts a recorded drive (cruise control + lane hold), resolves when done
//   __lab.rec                       -> per-tick samples { t, s, kmh, pitch, roll, ay, tr: [4], ft: [4], c: [4], y }
//   __lab.replay(i)                 -> poses the car exactly as recorded at sample i (for screenshot strips)
//   __lab.cam(mode)                 -> camera framing: 'side' (low side-on), 'rear3q', 'wheel'
(() => {
  const g = window.game,
    T = g.THREE || window.THREE,
    R = g.RAPIER,
    W = g.world;
  const L = (window.__lab = { spot: null, obst: [], rec: [], v: null, done: false });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  L.findSpot = (x, z, minLen = 140) => {
    const G = g.city.roadGraph;
    let best = null;
    for (const e of G.edges) {
      if (!/residential|tertiary|secondary|unclassified|primary/.test(e.kind || '') || e.bridge)
        continue;
      const p = e.pts;
      if (!p || p.length < 2) continue;
      for (let i = 0; i < p.length - 1; i++) {
        // straight run from point i: extend while the direction stays within 1.5 deg
        const dx0 = p[i + 1][0] - p[i][0],
          dz0 = p[i + 1][1] - p[i][1],
          h0 = Math.atan2(dx0, dz0);
        let len = 0,
          j = i;
        while (j < p.length - 1) {
          const dx = p[j + 1][0] - p[j][0],
            dz = p[j + 1][1] - p[j][1];
          let dh = Math.atan2(dx, dz) - h0;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          if (Math.abs(dh) > 0.026) break;
          len += Math.hypot(dx, dz);
          j++;
        }
        if (len < minLen) continue;
        const ys = e.y ? [e.y[i] || 0, e.y[j] || 0] : [0, 0];
        if (Math.abs(ys[1] - ys[0]) > 0.6) continue;
        const d = Math.hypot(p[i][0] - x, p[i][1] - z);
        if (!best || d < best.d)
          best = {
            d,
            x: p[i][0],
            z: p[i][1],
            y: ys[0],
            h: h0,
            len,
            width: e.width || 7,
            kind: e.kind,
            edge: e.id,
          };
      }
    }
    if (!best) return null;
    // start 12 m into the stretch, in the right lane
    const fx = Math.sin(best.h),
      fz = Math.cos(best.h),
      rx = -fz,
      rz = fx; // right of travel (car space +X is the car's left)
    const lane = best.width / 4;
    best.x0 = best.x + fx * 12 + rx * lane;
    best.z0 = best.z + fz * 12 + rz * lane;
    best.fx = fx;
    best.fz = fz;
    best.rx = rx;
    best.rz = rz;
    L.spot = best;
    return best;
  };
  const at = (s, lat = 0) => {
    const S = L.spot;
    return { x: S.x0 + S.fx * s + S.rx * lat, z: S.z0 + S.fz * s + S.rz * lat };
  };
  const groundY = (x, z) => {
    const y0 = (L.spot?.y ?? 0) + 3;
    const h = W.castRay(
      new R.Ray({ x, y: y0, z }, { x: 0, y: -1, z: 0 }),
      8,
      true,
      R.QueryFilterFlags.EXCLUDE_DYNAMIC |
        R.QueryFilterFlags.EXCLUDE_KINEMATIC |
        R.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    return h ? y0 - (h.timeOfImpact ?? h.toi) : (L.spot?.y ?? 0);
  };
  L.groundY = groundY;
  const concrete = new T.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.92 });
  const rockMat = new T.MeshStandardMaterial({
    color: 0x77706a,
    roughness: 0.95,
    flatShading: true,
  });
  L.clear = () => {
    try {
      g.breakables?.removeOwner?.('r2lab');
    } catch (e) {
      /* */
    }
    for (const o of L.obst) {
      try {
        if (o.col) W.removeCollider(o.col, true);
      } catch (e) {
        /* */
      }
      if (o.mesh) g.scene.remove(o.mesh);
    }
    L.obst = [];
  };
  L.build = (kind, o = {}) => {
    const S = L.spot,
      s = o.s ?? 45,
      hd = S.h;
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), hd + (o.yaw || 0)); // o.yaw: obstacle turned against the lane (angled curb hit)
    if (kind === 'curb') {
      // 15 cm high block across both wheel paths, 7 m long: curb up, then the drop off its far edge
      const H = o.h ?? 0.15,
        len = o.len ?? 7,
        wid = o.wid ?? 3.2,
        c = at(s + len / 2, o.lat ?? 0),
        y = groundY(c.x, c.z);
      const col = W.createCollider(
        R.ColliderDesc.cuboid(wid / 2, H / 2, len / 2)
          .setTranslation(c.x, y + H / 2, c.z)
          .setRotation(q),
      );
      const mesh = new T.Mesh(new T.BoxGeometry(wid, H, len), concrete);
      mesh.position.set(c.x, y + H / 2, c.z);
      mesh.quaternion.copy(q);
      mesh.castShadow = mesh.receiveShadow = true;
      g.scene.add(mesh);
      L.obst.push({ kind, col, mesh, s, len, H });
    } else if (kind === 'rock') {
      // a half-buried limestone rock under the left wheel path, sticking up o.h (12 cm)
      const H = o.h ?? 0.12,
        c = at(s, o.lat ?? -0.78),
        y = groundY(c.x, c.z);
      const geo = new T.IcosahedronGeometry(1, 1);
      const P = geo.attributes.position;
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < P.count; i++) {
        const k = 0.82 + rnd() * 0.3;
        P.setXYZ(i, P.getX(i) * 0.34 * k, P.getY(i) * 0.24 * k, P.getZ(i) * 0.28 * k);
      }
      geo.computeVertexNormals();
      const mesh = new T.Mesh(geo, rockMat);
      mesh.position.set(c.x, y + H - 0.24, c.z);
      mesh.quaternion.copy(q);
      mesh.castShadow = mesh.receiveShadow = true;
      g.scene.add(mesh);
      const pts = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        pts[i * 3] = P.getX(i);
        pts[i * 3 + 1] = P.getY(i);
        pts[i * 3 + 2] = P.getZ(i);
      }
      const col = W.createCollider(
        R.ColliderDesc.convexHull(pts)
          .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
          .setRotation(q),
      );
      L.obst.push({ kind, col, mesh, s, H });
    } else if (kind === 'prop') {
      // any breakable kind (bush, fence, hydrant, signPost...) as a simple box, a little off center
      const c = at(s, o.lat ?? 0.45),
        y = groundY(c.x, c.z),
        hx = o.hx ?? 0.15,
        hy = o.hy ?? 0.5,
        hz = o.hz ?? 0.15;
      const mesh = new T.Mesh(
        new T.BoxGeometry(hx * 2, hy * 2, hz * 2),
        new T.MeshStandardMaterial({ color: o.color ?? 0x888888, roughness: 0.7 }),
      );
      mesh.position.set(c.x, y + hy, c.z);
      mesh.quaternion.copy(q);
      g.scene.add(mesh);
      const rec = g.breakables
        ? g.breakables.add({
            x: c.x,
            y,
            z: c.z,
            hx,
            hy,
            hz,
            ry: hd,
            kind: o.kind || 'signPost',
            owner: 'r2lab',
            hide: () => {
              mesh.visible = false;
            },
          })
        : null;
      L.obst.push({ kind, mesh, s, len: 0.2, rec });
    } else if (kind === 'wall') {
      // a concrete wall across the lane (full stop)
      const c = at(s + 0.3, o.lat ?? 0),
        y = groundY(c.x, c.z);
      const col = W.createCollider(
        R.ColliderDesc.cuboid(2.5, 0.75, 0.3)
          .setTranslation(c.x, y + 0.75, c.z)
          .setRotation(q),
      );
      const mesh = new T.Mesh(new T.BoxGeometry(5, 1.5, 0.6), concrete);
      mesh.position.set(c.x, y + 0.75, c.z);
      mesh.quaternion.copy(q);
      g.scene.add(mesh);
      L.obst.push({ kind, col, mesh, s, len: 0.6 });
    } else if (kind === 'sign') {
      // a breakable street sign (U-channel post + plate) a little off the car's centerline (yaw on impact)
      const c = at(s, o.lat ?? 0.45),
        y = groundY(c.x, c.z),
        grp = new T.Group();
      const post = new T.Mesh(
        new T.BoxGeometry(0.07, 2.3, 0.07),
        new T.MeshStandardMaterial({ color: 0x8b9196, roughness: 0.45, metalness: 0.7 }),
      );
      post.position.y = 1.15;
      const plate = new T.Mesh(
        new T.BoxGeometry(0.62, 0.62, 0.02),
        new T.MeshStandardMaterial({ color: 0xb8231c, roughness: 0.5, metalness: 0.2 }),
      );
      plate.position.set(0, 2.05, -0.04);
      plate.rotation.z = Math.PI / 8;
      grp.add(post, plate);
      grp.position.set(c.x, y, c.z);
      grp.rotation.y = hd;
      grp.traverse((m) => {
        if (m.isMesh) m.castShadow = true;
      });
      g.scene.add(grp);
      const added = g.breakables
        ? g.breakables.add({
            x: c.x,
            y,
            z: c.z,
            hx: 0.05,
            hy: 1.15,
            hz: 0.05,
            ry: hd,
            kind: 'signPost',
            owner: 'r2lab',
            hide: () => {
              grp.visible = false;
            },
          })
        : null;
      L.obst.push({ kind, mesh: grp, s, len: 0.2, rec: added });
    } else if (kind === 'pothole' || kind === 'bump') {
      // relief record + a visual: dark bowl decal (pothole) / asphalt hump (bump)
      const lat = o.lat ?? (kind === 'pothole' ? 0.78 : 0),
        c = at(s, lat),
        y = groundY(c.x, c.z),
        len = o.len ?? (kind === 'bump' ? 0.9 : 1.3),
        wid = o.wid ?? (kind === 'bump' ? 3.4 : 1.2);
      g.physics.addRelief({
        kind,
        x: c.x,
        z: c.z,
        ax: S.fx,
        az: S.fz,
        len,
        wid,
        D: o.D ?? (kind === 'bump' ? 0.075 : 0.065),
      });
      // visual: a mesh following the relief function (so screenshots show the hole the tire feels)
      const N = 40,
        geo = new T.PlaneGeometry(wid, len, N, N);
      geo.rotateX(-Math.PI / 2);
      const P = geo.attributes.position;
      const cols = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        const lx = P.getX(i),
          lz = P.getZ(i);
        const wx = c.x + S.rx * lx + S.fx * -lz,
          wz = c.z + S.rz * lx + S.fz * -lz;
        const d = g.physics.reliefDip(wx, wz);
        P.setY(i, -d + 0.004);
        const k = kind === 'pothole' ? clamp(1 - (d / 0.07) * 0.7, 0.25, 1) : 1;
        cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k;
      }
      geo.setAttribute('color', new T.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      const mat = new T.MeshStandardMaterial({
        color: kind === 'pothole' ? 0x3d3b39 : 0x55524f,
        roughness: 0.95,
        vertexColors: true,
        transparent: kind === 'pothole',
        opacity: 1,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set(c.x, y, c.z);
      mesh.quaternion.copy(q);
      mesh.receiveShadow = true;
      g.scene.add(mesh);
      L.obst.push({ kind, mesh, s, len });
    }
  };
  // body pitch / roll relative to the car's heading frame (deg): pitch > 0 = nose up, roll > 0 = leaning right
  const _q = new T.Quaternion(),
    _e = new T.Euler();
  function attitude(v) {
    const r = v.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _e.setFromQuaternion(_q, 'YXZ');
    return { pitch: -_e.x * 57.2958, roll: _e.z * 57.2958, yaw: _e.y };
  }
  L.attitude = attitude;
  L.spawn = async (key = 'sedan3', s0 = 0) => {
    if (L.v) {
      try {
        L.endReplay();
        L.v.playerDriven = false;
        g.vehicles.remove(L.v);
      } catch (e) {
        /* */
      }
      L.v = null;
    }
    // nothing else on the test lane (parked / traffic cars that wandered in)
    for (const o of [...(g.vehicles.list || [])]) {
      try {
        const t = o.body.translation(),
          dx = t.x - L.spot.x0,
          dz = t.z - L.spot.z0,
          s = dx * L.spot.fx + dz * L.spot.fz,
          lat = dx * L.spot.rx + dz * L.spot.rz;
        if (s > -10 && s < 90 && Math.abs(lat) < 4) {
          o.playerDriven = false;
          g.vehicles.remove(o);
        }
      } catch (e) {
        /* */
      }
    }
    const c = at(s0);
    const y = groundY(c.x, c.z);
    const v = g.vehicles.spawn(key, new T.Vector3(c.x, y, c.z), L.spot.h, {
      snap: false,
      locked: false,
    });
    v.playerDriven = true;
    v.everDriven = true;
    v.engineOn = true;
    L.v = v;
    await new Promise((r) => setTimeout(r, 1500));
    return { key: v.typeKey, params: v.vc?.params || null, mode: v.vc?.isShapeVehicle ? 2 : 1 };
  };
  L.run = (o = {}) =>
    new Promise((resolve) => {
      const v = L.v,
        S = L.spot,
        target = (o.kmh ?? 20) / 3.6,
        sEnd = o.sEnd ?? 70;
      L.rec = [];
      L.done = false;
      let t = 0,
        prevVy = 0,
        lastS = -1;
      const hook = (dt) => {
        if (L.done || !v.body) return;
        const p = v.body.translation(),
          dx = p.x - S.x0,
          dz = p.z - S.z0,
          s = dx * S.fx + dz * S.fz,
          lat = dx * S.rx + dz * S.rz;
        // cruise + lane hold (bang-free P control; no throttle change inside the obstacle zone so the plot shows the suspension)
        const sp = v.speed,
          err = target - sp,
          inObs = L.obst.some((ob) => s > ob.s - 6 && s < ob.s + (ob.len || 2) + 6);
        const thr = inObs && o.coast ? 0 : clamp(err * 0.9 + (0.15 * target) / 10, -1, 1);
        const a = attitude(v);
        let dh = a.yaw - S.h;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const steer = clamp(-dh * 2.2 + lat * 0.25, -0.4, 0.4); // + steer = left (+X); car right of the line (lat > 0) -> steer left
        v.setControls({
          throttle: thr > 0 ? thr : 0,
          brake: thr < -0.2 && !inObs ? -thr * 0.5 : 0,
          steer,
          handbrake: false,
        });
        t += dt;
        const lv = v.body.linvel(),
          ay = (lv.y - prevVy) / dt;
        prevVy = lv.y;
        const ws = v.vc?.wheelState ? [0, 1, 2, 3].map((i) => v.vc.wheelState(i)) : null;
        const r = v.body.rotation();
        L.rec.push({
          t: +t.toFixed(4),
          s: +s.toFixed(3),
          lat: +lat.toFixed(3),
          kmh: +(sp * 3.6).toFixed(2),
          pitch: +a.pitch.toFixed(3),
          roll: +a.roll.toFixed(3),
          ay: +ay.toFixed(2),
          y: +p.y.toFixed(4),
          tr: ws
            ? ws.map((w) => +w.travel.toFixed(4))
            : [0, 1, 2, 3].map(
                (i) =>
                  +(
                    v.restLen -
                    9.81 / (4 * v.stiff) -
                    (v.vc?.wheelSuspensionLength(i) ?? 0)
                  ).toFixed(4),
              ),
          ft: ws ? ws.map((w) => Math.round(w.ft)) : null,
          c: [0, 1, 2, 3].map((i) => (v.vc?.wheelIsInContact(i) ? 1 : 0)),
          pose: [p.x, p.y, p.z, r.x, r.y, r.z, r.w],
          wl: [0, 1, 2, 3].map((i) => v.vc?.wheelSuspensionLength(i) ?? 0),
          ws: [0, 1, 2, 3].map((i) => v.vc?.wheelSteering(i) || 0),
          wr: [0, 1, 2, 3].map((i) => v.vc?.wheelRotation(i) || 0),
        });
        if (s > sEnd || t > (o.maxT ?? 30)) {
          L.done = true;
          v.setControls({ throttle: 0, brake: 1, steer: 0 });
          const i = g.fixedHooks.indexOf(hook);
          if (i >= 0) g.fixedHooks.splice(i, 1);
          resolve({ n: L.rec.length, t, s });
        }
        void lastS;
      };
      g.fixedHooks.push(hook);
      // never hang the driver script: resolve after 75 s real time whatever happened (physics halted, car stuck)
      setTimeout(() => {
        if (L.done) return;
        L.done = true;
        const i = g.fixedHooks.indexOf(hook);
        if (i >= 0) g.fixedHooks.splice(i, 1);
        resolve({ timeout: true, n: L.rec.length, t, physicsDead: g.physicsDead || null });
      }, 75000);
    });
  // replay: pose the car exactly as recorded (body kinematic-frozen, wheels from the sample)
  L.replay = (i) => {
    const v = L.v,
      smp = L.rec[i];
    if (!v || !smp) return false;
    if (!L.realVc) {
      L.realVc = v.vc;
      v.frozen = true;
      try {
        v.body.setEnabled(false);
      } catch (e) {
        /* */
      }
    }
    v.vc = {
      wheelSuspensionLength: (k) => smp.wl[k],
      wheelSteering: (k) => smp.ws[k],
      wheelRotation: (k) => smp.wr[k],
      wheelIsInContact: (k) => !!smp.c[k],
      wheelContactPoint: () => null,
      isShapeVehicle: true,
      debugWheels: () => null,
    };
    const [x, y, z, qx, qy, qz, qw] = smp.pose;
    v.body.setTranslation({ x, y, z }, false);
    v.body.setRotation({ x: qx, y: qy, z: qz, w: qw }, false);
    v.speed = 0;
    v.bodySway = null;
    v.car.shell.rotation.set(0, 0, 0);
    return true;
  };
  L.endReplay = () => {
    const v = L.v;
    if (v && L.realVc) {
      v.vc = L.realVc;
      L.realVc = null;
      v.frozen = false;
      try {
        v.body.setEnabled(true);
      } catch (e) {
        /* */
      }
    }
  };
  L.camMode = 'side';
  L.cam = (mode = 'side', o = {}) => {
    L.camMode = mode;
    g.cameraOverride = (dt, cam) => {
      const v = L.v;
      if (!v) return false;
      const p = v.mesh.position,
        S = L.spot;
      const fx = S.fx,
        fz = S.fz,
        rx = S.rx,
        rz = S.rz;
      if (mode === 'side') {
        const d = o.d ?? 6.2;
        cam.position.set(
          p.x + rx * d + fx * (o.ahead ?? 0.3),
          p.y + (o.up ?? 0.15),
          p.z + rz * d + fz * (o.ahead ?? 0.3),
        );
        cam.lookAt(p.x + fx * (o.ahead ?? 0.3), p.y - 0.25, p.z + fz * (o.ahead ?? 0.3));
      } else if (mode === 'leftside') {
        const d = o.d ?? 6.2;
        cam.position.set(p.x - rx * d, p.y + (o.up ?? 0.15), p.z - rz * d);
        cam.lookAt(p.x, p.y - 0.25, p.z);
      } else if (mode === 'rear3q') {
        cam.position.set(p.x - fx * 6.5 + rx * 3.2, p.y + 1.3, p.z - fz * 6.5 + rz * 3.2);
        cam.lookAt(p.x + fx * 1.5, p.y - 0.1, p.z + fz * 1.5);
      } else if (mode === 'front3q') {
        cam.position.set(p.x + fx * 6.8 + rx * 3.4, p.y + 0.9, p.z + fz * 6.8 + rz * 3.4);
        cam.lookAt(p.x, p.y - 0.15, p.z);
      } else if (mode === 'damage') {
        // close-up of the recorded contact point (shell space, game.physics.impactLog) or the front corner
        const sh = v.car.shell;
        sh.updateMatrixWorld(true);
        const at = o.at || [(o.side ?? 1) * (v.spec.W / 2 - 0.2), 0.5, v.spec.L / 2 - 0.1];
        const cp = new T.Vector3(at[0], at[1], at[2]).applyMatrix4(sh.matrixWorld),
          out = new T.Vector3(at[0] * 0.6, 0, Math.sign(at[2] || 1) * 1)
            .normalize()
            .transformDirection(sh.matrixWorld);
        cam.position
          .copy(cp)
          .addScaledVector(out, 1.25)
          .add(new T.Vector3(0, 0.35, 0));
        cam.lookAt(cp);
        if (cam.fov !== 50) {
          cam.fov = 50;
          cam.updateProjectionMatrix();
        }
      } else if (mode === 'wheel') {
        const w = o.wheel ?? 1,
          wx = v.car.wheels[w];
        const wp = new T.Vector3(wx.x, 0, wx.z).applyQuaternion(v.mesh.quaternion).add(p);
        const sd = wx.x > 0 ? -1 : 1;
        cam.position.set(
          wp.x + rx * sd * 2.4 + fx * 1.2,
          wp.y + 0.05,
          wp.z + rz * sd * 2.4 + fz * 1.2,
        );
        cam.lookAt(wp.x, wp.y - 0.35, wp.z);
      }
      if (o.fov) {
        cam.fov = o.fov;
        cam.updateProjectionMatrix();
      }
      return true;
    };
  };
  return true;
})();
