// DEV ONLY: a mock `game` object for UI test pages (never imported by the game).
//   const game = await createMockGame({ world: 'grid' | 'miami' | 'florida', systems: true, hour: 18.2 });
//   world 'grid'    tiny v1-style grid city (fast)
//   world 'miami'   the real OSM Miami data through src/world/miami/data.js (no 3D)
//   world 'florida' the full-size synthetic test world from src/ui/dev/mockWorld.js (optionally with real Miami inside)
// URL params are read by the pages, not here. The returned game has on/emit, input, player, clock, a fake camera,
// and `game.tick(dt)` to advance the mock simulation. Call installMockSystems (opts.systems) for wallet, bank, time, ...
import * as THREE from 'three';
import { installMockSystems } from './mockSystems.js';

export async function createMockGame(opts = {}) {
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 100);
  const _ev = {};
  const held = new Set(),
    just = new Set();
  const input = {
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    mouseClicked: false,
    down: (c) => held.has(c),
    pressed: (c) => just.has(c),
    endFrame() {
      just.clear();
      input.mouseDX = 0;
      input.mouseDY = 0;
      input.mouseClicked = false;
    },
  };
  addEventListener('keydown', (e) => {
    if (!held.has(e.code)) just.add(e.code);
    held.add(e.code);
    (input.log ||= []).push('d:' + e.code);
    if (input.log.length > 200) input.log.shift();
  });
  addEventListener('keyup', (e) => {
    held.delete(e.code);
    (input.log ||= []).push('u:' + e.code);
  });
  addEventListener('mousedown', (e) => {
    (input.log ||= []).push('md:' + e.button);
    if (e.button === 0) input.mouseDown = true;
  });
  addEventListener('mouseup', (e) => {
    (input.log ||= []).push('mu:' + e.button);
    if (e.button === 0) input.mouseDown = false;
  });
  const game = {
    THREE,
    camera,
    renderer: {
      domElement: document.getElementById('game') || document.body,
      getPixelRatio: () => 1,
      setPixelRatio() {},
      setSize() {},
    },
    timeOfDay: opts.hour ?? 18.2,
    clock: { dt: 0.016, elapsed: 0 },
    input,
    settings: { mouseSens: 1, quality: 'high', fov: 62, dayMinutes: 144 },
    ui: { phoneOpen: false, paused: false },
    fixedHooks: [],
    updaters: [],
    cameraYaw: 0,
    cameraPitch: 0.2,
    mock: true,
    player: {
      position: new THREE.Vector3(30, 0, 40),
      heading: 0.6,
      velocity: new THREE.Vector3(),
      state: { speed: 0, grounded: true, inVehicle: false, vehicle: null },
      health: 100,
      armor: 50,
      money: 2450,
      wanted: 0,
      weapon: 'fist',
      breath: 100,
    },
    vehicles: { list: [], nearest: () => null },
    peds: { list: [] },
    interiors: { list: [] },
    on: (n, f) => ((_ev[n] ||= []).push(f), f),
    emit: (n, d) => {
      let veto = false;
      for (const f of _ev[n] || []) {
        try {
          if (f(d) === false) veto = true;
        } catch (e) {
          console.error(e);
        }
      }
      return !veto;
    },
    teleport(x, y, z, h) {
      game.player.position.set(x, y ?? 0, z);
      if (typeof h === 'number') game.player.heading = h;
    },
  };
  const world = opts.world || 'grid';
  if (world === 'miami' || world === 'florida') {
    let miami = null;
    if (world === 'miami' || opts.realMiami !== false) {
      try {
        const { loadMiamiData } = await import(/* @vite-ignore */ '/src/world/miami/data.js');
        miami = await loadMiamiData(null, { bundle: false });
      } catch (e) {
        console.warn('[mockGame] real Miami data not loaded', e);
      }
    }
    if (world === 'miami' && miami) game.city = miami;
    else {
      const { makeSyntheticWorld } = await import(
        /* @vite-ignore */ new URL('./mockWorld.js', import.meta.url).href
      );
      game.city = makeSyntheticWorld({ miami });
    }
    const sp = game.city.playerSpawn;
    if (sp) game.player.position.set(sp.x, 0, sp.z);
  } else {
    const xs = [];
    for (let v = -450; v <= 450; v += 90) xs.push(v);
    const roads = [
      ...xs.map((x) => ({ x1: x, z1: -500, x2: x, z2: 500, width: 16 })),
      ...xs.map((z) => ({ x1: -500, z1: z, x2: 500, z2: z, width: 16 })),
    ];
    const edges = roads.map((r, i) => ({
      id: i,
      a: i * 2,
      b: i * 2 + 1,
      pts: [
        [r.x1, r.z1],
        [r.x2, r.z2],
      ],
      width: 14,
      kind: i % 4 === 0 ? 'primary' : 'residential',
      name: (r.x1 === r.x2 ? 'Avenue ' : 'Street ') + ((i % 11) + 1),
      lanesFwd: 1,
      lanesBack: 1,
    }));
    const buildingPolys = [];
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < xs.length - 1; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2,
          cz = (xs[j] + xs[j + 1]) / 2;
        for (let k = 0; k < 4; k++) {
          const x = cx + (k % 2 ? 18 : -18),
            z = cz + (k > 1 ? 18 : -18);
          const p = [
            [x - 14, z - 14],
            [x + 14, z - 14],
            [x + 14, z + 14],
            [x - 14, z + 14],
          ];
          p.h = 10 + ((i * 7 + j * 13 + k * 5) % 12) * 10;
          buildingPolys.push(p);
        }
      }
    game.city = {
      bounds: { minX: -560, maxX: 760, minZ: -560, maxZ: 560 },
      roads,
      buildings: [],
      mapLayers: {
        land: [
          [
            [-520, -520],
            [520, -520],
            [520, 520],
            [-520, 520],
          ],
        ],
        water: [],
        beach: [
          [
            [440, -520],
            [520, -520],
            [520, 520],
            [440, 520],
          ],
        ],
        park: [
          [
            [-260, -80],
            [-100, -80],
            [-100, 80],
            [-260, 80],
          ],
        ],
        buildingPolys,
        roadEdges: edges,
      },
      roadGraph: {
        nodes: edges.flatMap((e) => [
          { id: e.a, x: e.pts[0][0], z: e.pts[0][1] },
          { id: e.b, x: e.pts[1][0], z: e.pts[1][1] },
        ]),
        edges,
      },
      districtAt: (x, z) =>
        x > 380
          ? 'Coral Beach'
          : Math.abs(x) < 150 && Math.abs(z) < 150
            ? 'Downtown'
            : z < 0
              ? 'Palmetto Heights'
              : 'Harbor District',
      streetNameAt: (x, z) => {
        const i = Math.round((x + 450) / 90),
          j = Math.round((z + 450) / 90);
        return Math.abs(x - (i * 90 - 450)) < Math.abs(z - (j * 90 - 450))
          ? 'Avenue ' + (i + 1)
          : 'Street ' + (j + 1);
      },
      isWater: (x) => x > 520,
      playerSpawn: new THREE.Vector3(30, 0, 40),
    };
  }
  if (opts.systems) installMockSystems(game, opts);
  game.tick = (dt) => {
    game.clock.dt = dt;
    game.clock.elapsed += dt;
    for (const u of game.updaters) {
      try {
        u(dt);
      } catch (e) {
        console.error(e);
      }
    }
    camera.rotation.set(0, game.cameraYaw, 0, 'YXZ');
    camera.updateMatrixWorld();
  };
  window.game = game;
  return game;
}
/** Standard loop for test pages: advances the mock and calls each(dt). */
export function runLoop(game, each) {
  let last = performance.now();
  const f = (now) => {
    requestAnimationFrame(f);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.tick(dt);
    try {
      each?.(dt);
    } catch (e) {
      console.error(e);
    }
    game.input.endFrame();
  };
  requestAnimationFrame(f);
}
/** A fake standard gamepad for controller tests: const pad = fakeGamepad(); pad.press('A'); pad.release('A'); pad.axis(0, 1); */
export function fakeGamepad() {
  const names = [
    'A',
    'B',
    'X',
    'Y',
    'LB',
    'RB',
    'LT',
    'RT',
    'BACK',
    'START',
    'L3',
    'R3',
    'UP',
    'DOWN',
    'LEFT',
    'RIGHT',
    'HOME',
  ];
  const gp = {
    id: 'Test pad (standard)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: names.map(() => ({ pressed: false, value: 0 })),
    timestamp: 0,
  };
  navigator.getGamepads = () => [gp];
  return {
    gp,
    press(n) {
      const b = gp.buttons[names.indexOf(n)];
      b.pressed = true;
      b.value = 1;
    },
    release(n) {
      const b = gp.buttons[names.indexOf(n)];
      b.pressed = false;
      b.value = 0;
    },
    async tap(n, ms = 60) {
      this.press(n);
      await new Promise((r) => setTimeout(r, ms));
      this.release(n);
      await new Promise((r) => setTimeout(r, 40));
    },
    axis(i, v) {
      gp.axes[i] = v;
    },
    disconnect() {
      navigator.getGamepads = () => [];
    },
  };
}
