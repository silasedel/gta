// SAND-WEAR track: real footprints in sand, for the player and nearby pedestrians.
// Each step leaves a shoe-shaped depression with a raised rim, left and right feet, deeper when running, eroding and fading
// over a few minutes. Prints are instanced decals shaded against the sun (2x multiply blending), so they sit correctly on
// any sand color or material; one draw call for up to 640 prints.
//   createFootprints(THREE, { max, life }) -> { mesh, add(x, y, z, yaw, { left, depth, scale }), update(time, camPos, sunDir, day), count }
//   game.footprints = that object + { stats() }.   Sand is detected with game.sand.query (lots, beaches) or the footstep surface.
import * as THREE from 'three';
export const order = 110;

// height map of one right shoe print: 128 = undisturbed sand, darker = pressed in, brighter = pushed-up rim; toe toward the top
function soleHeight() {
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, W, H);
  const sole = (grow) => { g.beginPath(); g.moveTo(64, 30 - grow); g.bezierCurveTo(98 + grow, 30 - grow, 104 + grow, 96, 92 + grow, 132); g.bezierCurveTo(86 + grow, 160, 92 + grow, 186, 90 + grow, 206); g.bezierCurveTo(88 + grow, 234 + grow, 46 - grow, 234 + grow, 44 - grow, 206); g.bezierCurveTo(42 - grow, 180, 40 - grow, 150, 34 - grow, 124); g.bezierCurveTo(22 - grow, 80, 34 - grow, 30 - grow, 64, 30 - grow); g.closePath(); };
  g.filter = 'blur(7px)'; g.fillStyle = 'rgb(176,176,176)'; sole(13); g.fill();                       // displaced rim
  g.filter = 'blur(3px)'; g.fillStyle = 'rgb(52,52,52)'; sole(0); g.fill();                              // sole depression
  g.filter = 'blur(5px)'; g.fillStyle = 'rgb(28,28,28)'; g.beginPath(); g.ellipse(67, 208, 20, 22, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(66, 74, 26, 34, 0, 0, 6.283); g.fill();   // heel strike and ball of the foot dig deeper
  g.filter = 'blur(4px)'; g.fillStyle = 'rgb(84,84,84)'; g.beginPath(); g.ellipse(60, 150, 16, 22, 0, 0, 6.283); g.fill();   // arch presses less
  g.filter = 'blur(1.2px)'; g.save(); sole(-3); g.clip(); g.strokeStyle = 'rgba(120,120,120,.75)'; g.lineWidth = 5;                // tread bars stand proud inside the print
  for (let y = 40; y < 128; y += 13) { g.beginPath(); g.moveTo(30, y + 6); g.lineTo(64, y); g.lineTo(100, y + 6); g.stroke(); } for (let y = 184; y < 232; y += 12) { g.beginPath(); g.moveTo(40, y); g.lineTo(96, y); g.stroke(); }
  g.restore(); g.filter = 'blur(6px)'; g.fillStyle = 'rgb(186,186,186)'; g.beginPath(); g.ellipse(64, 18, 22, 7, 0, 0, 6.283); g.fill();   // toe-off mound
  g.filter = 'none'; return c;
}

export function createFootprints(T, opts = {}) {
  const MAX = opts.max ?? 640, LIFE = opts.life ?? 210;
  const base = new T.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
  const geo = new T.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const iPos = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), iPar = new T.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  for (let i = 0; i < MAX; i++) iPar.setXYZW(i, 1, 0, -1e6, 1);
  iPos.setUsage(T.DynamicDrawUsage); iPar.setUsage(T.DynamicDrawUsage); geo.setAttribute('iPos', iPos); geo.setAttribute('iPar', iPar); geo.instanceCount = MAX;
  const tex = new T.CanvasTexture(soleHeight()); tex.colorSpace = T.NoColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  const mat = new T.ShaderMaterial({
    uniforms: { hMap: { value: tex }, uTime: { value: 0 }, uLife: { value: LIFE }, uSun: { value: new T.Vector3(0.4, 0.8, 0.3) }, uDay: { value: 1 }, uCam: { value: new T.Vector3() } },
    vertexShader: /* glsl */`
      attribute vec4 iPos; attribute vec4 iPar; uniform float uTime, uLife; uniform vec3 uCam;
      varying vec2 vUv; varying vec4 vP; varying float vYaw;
      void main() {
        float age = (uTime - iPar.z) / uLife, s = iPar.w, c = cos(iPos.w), sn = sin(iPos.w);
        vec3 p = vec3(position.x * .30 * s, 0., -position.z * .46 * s);          // quad: 30 x 46 cm, toe toward local +Z
        vec3 w = vec3(p.x * c + p.z * sn, 0., -p.x * sn + p.z * c) + iPos.xyz;
        float fade = (1. - smoothstep(.55, 1., age)) * (1. - smoothstep(38., 62., distance(w, uCam)));
        if (age < 0. || age > 1.) w = vec3(0., -9999., 0.);
        vUv = vec2(iPar.x > 0. ? uv.x : 1. - uv.x, uv.y); vP = vec4(iPar.x, iPar.y, age, fade); vYaw = iPos.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D hMap; uniform vec3 uSun; uniform float uDay; varying vec2 vUv; varying vec4 vP; varying float vYaw;
      void main() {
        float age = vP.z, soft = 1. + age * 3.5; vec2 e = vec2(1. / 128., 1. / 256.) * 1.6 * soft;
        float h = texture2D(hMap, vUv, age * 2.).r, depth = vP.y * (1. - .55 * age);
        vec2 gl = vec2(texture2D(hMap, vUv + vec2(e.x, 0.), age * 2.).r - texture2D(hMap, vUv - vec2(e.x, 0.), age * 2.).r, texture2D(hMap, vUv + vec2(0., e.y), age * 2.).r - texture2D(hMap, vUv - vec2(0., e.y), age * 2.).r) / soft;
        gl.x *= vP.x;                                                         // mirrored left foot
        vec2 gp = vec2(gl.x / .30, gl.y * 2. / .46) * depth * .055 / (1.6 / 128.) * .5;     // slope: 5.5 cm of relief over the map's range
        float c = cos(vYaw), s = sin(vYaw); vec3 n = normalize(vec3(-(gp.x * c + gp.y * s), 1., -(-gp.x * s + gp.y * c)));
        float l0 = max(uSun.y, .12), rel = clamp(max(dot(n, normalize(uSun)), 0.) / l0, .3, 1.42);
        float occ = 1. - depth * .34 * smoothstep(.5, .16, h) + depth * .03 * smoothstep(.52, .72, h);       // packed, slightly damp sand in the print; pale dry rim
        float shade = mix(1., rel, .2 + .62 * uDay) * occ;
        vec2 b = smoothstep(vec2(0.), vec2(.08), vUv) * smoothstep(vec2(0.), vec2(.08), 1. - vUv);
        shade = mix(1., shade, vP.w * b.x * b.y);
        gl_FragColor = vec4(vec3(shade * .5), 1.);
      }`,
    side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.DstColorFactor, blendDst: T.SrcColorFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, fog: false,
  });
  const mesh = new T.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'footprints';
  let head = 0, count = 0, time = 0;
  return {
    mesh, get count() { return Math.min(count, MAX); }, max: MAX, life: LIFE,
    add(x, y, z, yaw, o = {}) { iPos.setXYZW(head, x, y, z, yaw); iPar.setXYZW(head, o.left ? -1 : 1, o.depth ?? 0.7, time, o.scale ?? 1); head = (head + 1) % MAX; count++; iPos.needsUpdate = true; iPar.needsUpdate = true; },
    update(t, cam, sun, day) { time = t; mat.uniforms.uTime.value = t; if (cam) mat.uniforms.uCam.value.copy(cam); if (sun) mat.uniforms.uSun.value.copy(sun).setY(Math.max(0.1, sun.y)); if (day != null) mat.uniforms.uDay.value = day; },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}

export async function initV2(game) {
  const fp = createFootprints(THREE, {}); game.scene.add(fp.mesh);
  const LIFT = 0.014, walkers = new Map(); let side = false, last = null, t = 0, made = 0;
  const groundY = (x, z, q, fallback) => (q?.y != null ? q.y : (game.city?.groundHeightAt?.(x, z) ?? fallback ?? 0)) + LIFT;
  const sandAt = (x, z, surface) => { try { const q = game.sand?.query?.(x, z); if (q) return q; } catch (e) { /* */ } return surface && /^(sand|dune|beach|damp|shell)$/.test(surface) ? { y: null } : null; };
  function step(x, yRef, z, yaw, left, run, scale, puff) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw), off = left ? -0.105 : 0.105, px = x + rx * off, pz = z + rz * off;     // right-hand vector of heading yaw
    const q = sandAt(px, pz, null); if (!q) return false;
    fp.add(px, groundY(px, pz, q, yRef), pz, yaw + (left ? 0.1 : -0.1) + (Math.random() - 0.5) * 0.08, { left, depth: run ? 1 : 0.62 + Math.random() * 0.12, scale }); made++;
    if (puff && (run || Math.random() < 0.3)) { try { game.fx?.dust?.(new THREE.Vector3(px, groundY(px, pz, q, yRef) + 0.03, pz), new THREE.Color(0.8, 0.74, 0.6)); } catch (e) { /* */ } }
    return true;
  }
  // the player: one print per real foot plant (the character model emits 'footstep' at each plant)
  game.on?.('footstep', (e) => {
    try {
      const p = e?.position; if (!p || e.surface === 'water' || game.player?.inVehicle || game.player?.vehicle) return;
      let yaw = game.player?.heading ?? game.player?.rotation?.y ?? 0;
      if (last && t - last.t < 1.5) { const dx = p.x - last.x, dz = p.z - last.z, d = Math.hypot(dx, dz); if (d > 0.25 && d < 2.6) yaw = Math.atan2(dx, dz); }
      last = { x: p.x, z: p.z, t }; side = !side;
      if (!sandAt(p.x, p.z, e.surface)) return;
      step(p.x, p.y, p.z, yaw, side, !!e.run, 1, e.surface !== 'sand');     // the fx module already puffs on 'sand' surfaces
    } catch (err) { /* never break the footstep bus */ }
  });
  // pedestrians near the player: a print every stride
  game.updaters.push((dt) => {
    t += dt; const P = game.player?.position, cam = game.camera?.position;
    fp.update(t, cam || P, game.env?.sunDir, game.env?.dayFactor ?? 1);
    const list = game.peds?.list; if (!P || !list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const ped = list[i], pos = ped?.pos || ped?.root?.position; if (!pos || ped.dead || ped.inVehicle) continue;
      const dx = pos.x - P.x, dz = pos.z - P.z; if (dx * dx + dz * dz > 45 * 45) { if (ped.id != null) walkers.delete(ped.id); continue; }
      const key = ped.id ?? ped; let w = walkers.get(key); if (!w) { w = { x: pos.x, z: pos.z, acc: Math.random() * 0.6, left: Math.random() < 0.5, scale: 0.88 + ((ped.id ?? 0) * 0.37 % 1) * 0.2 }; walkers.set(key, w); continue; }
      const mx = pos.x - w.x, mz = pos.z - w.z, d = Math.hypot(mx, mz); w.x = pos.x; w.z = pos.z; if (d < 1e-4 || d > 1.5) continue;
      w.acc += d; const run = d / Math.max(dt, 1e-3) > 3, stride = run ? 1.05 : 0.68;
      if (w.acc >= stride) { w.acc -= stride; w.left = !w.left; step(pos.x, pos.y, pos.z, Math.atan2(mx, mz), w.left, run, w.scale, true); }
    }
    if (walkers.size > 400) walkers.clear();
  });
  game.footprints = Object.assign(fp, { stats: () => ({ made, live: fp.count, max: fp.max, lifeSeconds: fp.life }) });
}
