// Southline V2: built-in benchmark (perf track). Runs only with ?bench=<label> (the Mac app: --ps-bench=<label>).
// Plays a fixed route with the real game loop: spawn yard (stand), walk, drive through the Keys, drive downtown,
// beach (walk), downtown at night (drive). Records every frame: rAF gap, CPU work, the per-system times of main.js,
// draw calls, triangles, new shader programs, JS heap (a drop of > 8 MB between frames = a GC), GPU ms (when the
// timer extension exists, perfHud.v2.js). After each teleport a settle window (streaming the new place, like a load
// screen) is recorded apart and is not part of the gate. Result: window.__benchReport (JSON), window.__benchDone = true;
// the Mac app writes it to --ps-bench-out (default <userData>/logs/bench-<label>.json) and to the app log.
// Query options: bench=<label>, benchsecs=<scale> (segment length multiplier), benchpreset=<name> (force a preset).
export const order = 990;

const Q =
  typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

const ROUTE = [
  { id: 'spawn', kind: 'stand', secs: 12, tod: 11 },
  { id: 'walk', kind: 'walk', secs: 12, tod: 11 },
  { id: 'keys', kind: 'drive', at: [-836, 5272], secs: 35, tod: 12, speed: 27 },
  { id: 'downtown', kind: 'drive', at: [407, -110], secs: 35, tod: 15, speed: 22 },
  { id: 'beach', kind: 'walk', at: [2745, -660], secs: 15, tod: 13 }, // on the sand (2332, -660 is the district center, inside a store)
  { id: 'night', kind: 'drive', at: [407, -110], secs: 30, tod: 22, speed: 22 },
  { id: 'house', kind: 'walk', house: true, secs: 15, tod: 16 }, // Nico's house and dock (the story start)
];

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function summarize(gaps) {
  const s = Array.from(gaps).sort((a, b) => a - b);
  const n = s.length;
  let sum = 0;
  for (const v of s) sum += v;
  const over = (t) => {
    let c = 0;
    for (const v of s) if (v > t) c++;
    return c;
  };
  return {
    frames: n,
    avgMs: n ? +(sum / n).toFixed(2) : 0,
    p50: +pct(s, 0.5).toFixed(2),
    p95: +pct(s, 0.95).toFixed(2),
    p99: +pct(s, 0.99).toFixed(2),
    max: n ? +s[n - 1].toFixed(1) : 0,
    over16_7: over(17.5), // a 60 Hz frame plus vsync jitter
    over25: over(25),
    over33: over(33.4),
    over50: over(50),
    over100: over(100),
  };
}

export function initV2(game) {
  const label = Q.get('bench');
  if (!label) return;
  const scale = +(Q.get('benchsecs') || 1);
  const B = (game.bench = { label, seg: null, segs: [], frames: [], worst: [], done: false });
  const keys = new Set();
  const key = (code, down) => {
    if (down === keys.has(code)) return;
    if (down) keys.add(code);
    else keys.delete(code);
    dispatchEvent(
      new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }),
    );
  };
  const releaseAll = () => {
    for (const k of [...keys]) key(k, false);
  };
  // console errors during the run (the game must load and play with none)
  const errors = [];
  const ce = console.error.bind(console);
  console.error = (...a) => {
    if (errors.length < 30)
      errors.push(
        a
          .map((x) => String((x && x.message) || x))
          .join(' ')
          .slice(0, 300),
      );
    ce(...a);
  };

  // ---- per-frame recorder (main.js calls game.perf.onFrame after the render)
  let lastHeap = 0;
  let gcCount = 0;
  let gcMB = 0;
  const loaf = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.duration < 50) continue;
        loaf.push({
          t: Math.round(e.startTime),
          dur: Math.round(e.duration),
          scripts: (e.scripts || [])
            .map(
              (x) =>
                `${Math.round(x.duration)} ${(x.sourceFunctionName || x.invoker || '').slice(0, 50)} ${(x.sourceURL || '').split('/').pop()}`,
            )
            .slice(0, 4),
        });
        if (loaf.length > 200) loaf.shift();
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) {
    /* not supported */
  }

  const onFrame = (gap, work, PT, newProg) => {
    const S = B.seg;
    if (!S) return;
    const m = performance.memory;
    const heap = m ? m.usedJSHeapSize / 1048576 : 0;
    let gc = 0;
    if (lastHeap && heap < lastHeap - 8) {
      gc = lastHeap - heap;
      gcCount++;
      gcMB += gc;
      S.gc++;
    }
    lastHeap = heap;
    const ri = game.renderer.info.render;
    S.gaps.push(gap);
    S.work.push(work);
    S.calls += ri.calls;
    S.tris += ri.triangles;
    S.n++;
    if (ri.calls > S.maxCalls) S.maxCalls = ri.calls;
    if (game.gpuFrameMs != null) {
      S.gpu += game.gpuFrameMs;
      S.gpuN++;
    }
    for (const k in PT) S.sys[k] = (S.sys[k] || 0) + PT[k];
    if (gap > 25 || work > 20) {
      const top = [];
      for (const k in PT) if (PT[k] > 1) top.push([k, +PT[k].toFixed(1)]);
      top.sort((a, b) => b[1] - a[1]);
      B.worst.push({
        seg: S.id,
        settle: S.settle,
        t: +((performance.now() - S.t0) / 1000).toFixed(2),
        gap: +gap.toFixed(1),
        work: +work.toFixed(1),
        top: top.slice(0, 6),
        newPrograms: newProg,
        calls: ri.calls,
        gcMB: +gc.toFixed(0),
        heapMB: Math.round(heap),
      });
    }
  };

  // ---- route helpers
  function buildRoute(x, z, len) {
    const G = game.city?.roadGraph || game.city?.data?.roadGraph;
    if (!G?.nearestEdge) return null;
    const rank = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1 };
    const adj = new Map(); // node id -> edges (the runtime graph has no per-node lists)
    for (const f of G.edges) {
      for (const nid of [f.a, f.b]) {
        let l = adj.get(nid);
        if (!l) adj.set(nid, (l = []));
        l.push(f);
      }
    }
    let r = G.nearestEdge(x, z, {}, 2000);
    if (!r) return null;
    let e = r.edge,
      node = e.a;
    const used = new Set(),
      pts = [];
    let L = 0;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    }; // fixed route every run
    for (let guard = 0; guard < 4000 && L < len; guard++) {
      used.add(e.id);
      const fwd = e.a === node;
      const ep = fwd ? e.pts : [...e.pts].reverse();
      const ey = e.y ? (fwd ? [...e.y] : [...e.y].reverse()) : [];
      for (let i = pts.length ? 1 : 0; i < ep.length; i++) {
        pts.push([ep[i][0], ey[i] || 0, ep[i][1]]);
        if (pts.length > 1) {
          const p = pts[pts.length - 2],
            q = pts[pts.length - 1];
          L += Math.sqrt((q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2);
        }
      }
      node = fwd ? e.b : e.a;
      const nEdges = adj.get(node);
      if (!nEdges) break;
      const a2 = ep[ep.length - 2],
        a3 = ep[ep.length - 1];
      const dx = a3[0] - a2[0],
        dz = a3[1] - a2[1],
        dl = Math.sqrt(dx * dx + dz * dz) || 1;
      let best = null;
      for (const f of nEdges) {
        if (used.has(f.id) || (f.oneway && f.a !== node)) continue;
        const fp = f.a === node ? f.pts : [...f.pts].reverse();
        const ex = fp[1][0] - fp[0][0],
          ez = fp[1][1] - fp[0][1],
          el = Math.sqrt(ex * ex + ez * ez) || 1;
        const sc = ((dx * ex + dz * ez) / (dl * el)) * 2 + (rank[f.kind] || 0) * 0.35 + rnd() * 0.6;
        if (!best || sc > best[0]) best = [sc, f];
      }
      if (!best) break;
      e = best[1];
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(
        cum[i - 1] + Math.sqrt((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][2] - pts[i - 1][2]) ** 2),
      );
    return { pts, cum };
  }
  function at(R, s, out) {
    let i = 1;
    while (i < R.cum.length - 1 && R.cum[i] < s) i++;
    const u = Math.min(1, (s - R.cum[i - 1]) / (R.cum[i] - R.cum[i - 1] || 1));
    const p = R.pts[i - 1],
      q = R.pts[i];
    out.x = p[0] + (q[0] - p[0]) * u;
    out.y = p[1] + (q[1] - p[1]) * u;
    out.z = p[2] + (q[2] - p[2]) * u;
    out.h = Math.atan2(q[0] - p[0], q[2] - p[2]);
    return out;
  }

  // ---- driving: the player's car follows the route (body set before every physics sub-step)
  let drive = null;
  const _p = { x: 0, y: 0, z: 0, h: 0 };
  game.fixedHooks.unshift(function benchDrive() {
    if (!drive) return;
    const v = drive.v;
    if (!v?.body?.isValid?.()) return;
    const s = drive.s;
    at(drive.R, s, _p);
    const gy = game.groundHeightAt ? game.groundHeightAt(_p.x, _p.z) : null;
    const y = (Number.isFinite(gy) ? gy : _p.y) + 0.9;
    const half = _p.h / 2;
    // kinematic while the route drives it: a dynamic body teleported every sub-step into curbs and traffic made the solver
    // resolve deep penetrations (a cost a real drive never has); it still pushes traffic and streams like a real car
    const R = game.RAPIER;
    if (!drive.kin && R?.RigidBodyType) {
      try {
        v.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
        drive.kin = true;
      } catch (e) {
        drive.kin = 'no';
      }
    }
    if (drive.kin === true) {
      v.body.setNextKinematicTranslation({ x: _p.x, y, z: _p.z });
      v.body.setNextKinematicRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
      return;
    }
    v.body.setTranslation({ x: _p.x, y, z: _p.z }, true);
    v.body.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }, true);
    v.body.setLinvel(
      { x: Math.sin(_p.h) * drive.speed, y: 0, z: Math.cos(_p.h) * drive.speed },
      true,
    );
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });
  function endDrive() {
    try {
      if (drive.kin === true) {
        drive.v.body.setBodyType(game.RAPIER.RigidBodyType.Dynamic, true);
        drive.v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    } catch (e) {
      /* */
    }
    try {
      if (drive.v) drive.v.benchSpeed = undefined;
    } catch (e) {
      /* */
    }
    try {
      game.exitVehicle?.();
    } catch (e) {
      /* */
    }
    drive = null;
  }
  game.updaters.push(function benchDriveClock(dt) {
    if (drive) {
      drive.s += dt * drive.speed;
      if (drive.v) drive.v.benchSpeed = drive.speed;
    }
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pending = () => {
    try {
      return game.city?.streamer?.pending?.() ?? 99;
    } catch (e) {
      return 0;
    }
  };

  function newSeg(id, settle) {
    if (game.perf) game.perf.onFrame = onFrame; // post.js replaces game.perf at boot: (re)attach every segment
    const S = {
      id,
      settle,
      t0: performance.now(),
      gaps: [],
      work: [],
      sys: {},
      calls: 0,
      tris: 0,
      n: 0,
      maxCalls: 0,
      gpu: 0,
      gpuN: 0,
      gc: 0,
    };
    B.seg = S;
    return S;
  }
  function closeSeg(S) {
    B.seg = null;
    const sum = summarize(S.gaps);
    const ws = summarize(S.work);
    const sys = Object.entries(S.sys)
      .map(([k, v]) => [k, +(v / Math.max(1, S.n)).toFixed(2)])
      .filter((x) => x[1] >= 0.1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);
    const progs = game.renderer.info.programs || [];
    let maxId = 0;
    for (const pr of progs) if (pr.id > maxId) maxId = pr.id;
    const out = {
      id: S.id,
      settle: S.settle,
      programsLive: progs.length,
      programIdMax: maxId,
      textures: game.renderer.info.memory.textures,
      geometries: game.renderer.info.memory.geometries,
      secs: +((performance.now() - S.t0) / 1000).toFixed(1),
      ...sum,
      cpuP50: ws.p50,
      cpuP95: ws.p95,
      cpuP99: ws.p99,
      calls: Math.round(S.calls / Math.max(1, S.n)),
      maxCalls: S.maxCalls,
      tris: Math.round(S.tris / Math.max(1, S.n)),
      gpuMs: S.gpuN ? +(S.gpu / S.gpuN).toFixed(2) : null,
      gc: S.gc,
      sys,
    };
    B.segs.push(out);
    if (!S.settle) B.frames.push(...S.gaps);
    return out;
  }

  async function settleAfterTeleport(id) {
    const S = newSeg(id + ':settle', true);
    const t0 = performance.now();
    await sleep(2500);
    while (pending() > 2 && performance.now() - t0 < 45000) await sleep(250);
    await sleep(2500);
    closeSeg(S);
  }

  async function run() {
    // start: wait for the game, skip the title
    while (!game.ready) await sleep(250);
    const tReady = performance.now();
    for (let i = 0; game.ui?.title && i < 60; i++) {
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }));
      dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }));
      await sleep(1000);
    }
    if (!game.city?.streamer)
      console.warn(
        '[bench] the Miami city did not load (old fallback city): this run does not measure the game',
      );
    const preset = Q.get('benchpreset');
    if (preset && game.quality?.presets?.[preset]) game.quality.set(preset, { manual: false });
    game.timeExternal = true;
    const spawn = {
      x: game.player.position.x,
      z: game.player.position.z,
      h: game.player.heading || 0,
    };
    // initial load settle (not in the gate)
    await settleAfterTeleport('load');
    for (const R of ROUTE) {
      game.timeOfDay = R.tod;
      releaseAll();
      game.cameraOverride = null;
      if (drive) {
        endDrive();
      }
      if (R.house) {
        const A = game.nicoHouse?.anchors || {};
        const a = A.dock || A.front || A.spawn || null; // the dock view (outside); the bedroom spawn as a fallback
        const p = a?.pos;
        if (!p || !Number.isFinite(p.x)) continue;
        game.teleport(p.x, p.y + 0.1, p.z, a.heading ?? 0);
        await settleAfterTeleport(R.id);
      }
      if (R.at) {
        game.teleport(R.at[0], undefined, R.at[1], 0);
        await settleAfterTeleport(R.id);
      }
      if (R.kind === 'drive') {
        const p = game.player.position;
        const route = buildRoute(p.x, p.z, R.secs * scale * R.speed + 400);
        if (route) {
          at(route, 0, _p);
          const v = game.vehicles.spawn
            ? game.vehicles.spawn('sedan', { x: _p.x, y: _p.y + 1, z: _p.z }, _p.h, { snap: false })
            : null;
          if (v) {
            game.enterVehicle(v);
            drive = { v, R: route, s: 0, speed: R.speed };
            await sleep(600);
          } else {
            // no vehicle system: fly the camera along the road at driving speed (streaming and rendering still measured)
            console.warn('[bench] no vehicles: camera drive');
            const cam = { R: route, s: 0, speed: R.speed };
            const q = { x: 0, y: 0, z: 0, h: 0 };
            game.cameraOverride = (dt, c) => {
              cam.s += dt * cam.speed;
              at(cam.R, cam.s, _p);
              at(cam.R, cam.s + 30, q);
              c.position.set(_p.x, _p.y + 1.6, _p.z);
              c.lookAt(q.x, q.y + 1.2, q.z);
              return true;
            };
          }
        }
      }
      const S = newSeg(R.id, false);
      const t0 = performance.now();
      if (R.kind === 'walk') {
        key('KeyW', true);
        key('ShiftLeft', true);
      }
      while (performance.now() - t0 < R.secs * scale * 1000) {
        if (R.kind === 'walk') {
          // turn a little every 3 s so he does not walk into one wall
          const ph = Math.floor((performance.now() - t0) / 3000) % 2;
          key('KeyA', ph === 1);
        }
        await sleep(100);
      }
      releaseAll();
      closeSeg(S);
    }
    if (drive) endDrive();
    game.teleport(spawn.x, undefined, spawn.z, spawn.h);
    finish(tReady);
  }

  function finish(tReady) {
    const gate = summarize(B.frames);
    const gl = game.renderer.getContext();
    const cv = game.renderer.domElement;
    const worst = B.worst
      .filter((w) => !w.settle)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 25);
    const rep = {
      label,
      map: game.mapName,
      consoleErrors: errors,
      when: new Date().toISOString(),
      ua: navigator.userAgent,
      display: {
        dpr: window.devicePixelRatio,
        css: [innerWidth, innerHeight],
        canvas: [cv.width, cv.height],
        hz: game.framePacing?.hz ?? null,
        pacing: game.framePacing?.on ?? null,
      },
      quality: {
        preset: game.quality?.name,
        look: game.quality?.current?.look,
        pr: game.renderer.getPixelRatio(),
        renderScale: game.post?.renderScale ?? game.perf?.resScale ?? null,
        shadow: game.quality?.current?.shadow,
      },
      gpuTimer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
      bootMs: window.__boot?.ready ?? null,
      gate: { ...gate, pass: gate.p99 < 16.7 && gate.over33 === 0 },
      gcCount,
      gcMB: Math.round(gcMB),
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      segments: B.segs,
      worst,
      worstSettle: B.worst
        .filter((w) => w.settle)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 10),
      longFrames: loaf.slice(-40),
      stream: (() => {
        const s = game.city?.streamer?.stats;
        return s
          ? {
              maxStep: s.maxStep,
              longSteps: s.longSteps,
              msByKind: s.msByKind,
              idleMs: s.idleMs && Math.round(s.idleMs),
              longList: (s.longList || []).slice(-20),
            }
          : null;
      })(),
      // anonymous updaters show as upd:anon#<i> / minified names: their first source characters, to find the owner
      updaters: game.updaters.map((u, i) => [i, u.name || '', String(u).slice(0, 140)]),
      tookSecs: Math.round((performance.now() - tReady) / 1000),
    };
    window.__benchReport = JSON.stringify(rep);
    window.__benchDone = true;
    B.done = true;
    console.info(
      '[bench] ' +
        label +
        ' p50 ' +
        gate.p50 +
        ' p95 ' +
        gate.p95 +
        ' p99 ' +
        gate.p99 +
        ' >33ms ' +
        gate.over33 +
        ' pass ' +
        rep.gate.pass,
    );
  }

  run().catch((e) => {
    console.warn('[bench] failed', e);
    window.__benchReport = JSON.stringify({ label, error: String((e && e.stack) || e) });
    window.__benchDone = true;
  });
}
