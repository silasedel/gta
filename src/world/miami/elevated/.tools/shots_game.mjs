// ELEVATED in-game screenshots (production preview, isolated muted headless Chrome): for each cluster a car is parked on the
// deck so the city streams that area, then 4 orbit views + a driver's deck view are rendered with a free camera.
// usage: node shots_game.mjs [url] [outDir] [tag e.g. after]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const SP =
  '/private/tmp/claude-501/-Users-silasedel-Library-Application-Support-Claude-scratch-workspaces-a2432c3f-704a-48a2-8201-54e53d82f100-f0a1068f-9464-4c58-b7e3-43eb8e799611-scratch-2026-11-13-bc1c0d/42cfdac0-6074-4282-b955-0e440358873b/scratchpad/';
const require = createRequire(SP + 'hl/node_modules/');
const puppeteer = require('puppeteer-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const [
  URL0 = 'http://127.0.0.1:5197/?map=miami',
  OUT = path.resolve(here, '../../../../../docs/showcase/elevated'),
  TAG = 'after',
  ONLY = '',
] = process.argv.slice(2);
// cluster: centre chain + arc length (deck view starts there), orbit centre computed from it
const CLUSTERS = [
  ['macarthur_west', 'MacArthur Causeway', 700],
  ['macarthur_east', 'MacArthur Causeway', 2500],
  ['i395_dolphin', 'Dolphin Expressway', 1450],
  ['i95_stack', 'I 95;US 1', 2140],
  ['fifth_street', '5th Street', 400],
  ['port_blvd', 'Port Boulevard', 500],
  ['venetian', 'Venetian Way', 250],
  ['south_miami_ave', 'South Miami Avenue', 150],
  ['brickell', 'Brickell Avenue', 150],
  ['us1_ramps', 'US 1;SR 970', 400],
  // ELEVATED-2 override clusters
  ['e2A_i95_us1_merge', 'US 1;SR 970', 960],
  ['e2A_sw1st', 'Southwest 1st Street', 270],
  ['e2B_terminal_island', '5th Street', 850],
  ['e2C_smiami', 'South Miami Avenue', 140],
  ['e2C_sw2nd', 'Southwest 2nd Avenue', 150],
  ['e2C_brickell', 'Brickell Avenue', 160],
];
fs.mkdirSync(OUT, { recursive: true });
const { loadData } = await import('./env.mjs');
const { buildNetwork } = await import('../network.js');
const NET = buildNetwork(await loadData());
const infoOf = (chainName, s) => {
  const cands = NET.chains.filter((c) => c.name === chainName).sort((a, b) => b.length - a.length);
  if (!cands.length) return null;
  const c = cands[0],
    F = NET.framesAt(c, Math.min(c.length - 5, s));
  return { x: F.x, y: F.y, z: F.z, tx: F.tx, tz: F.tz };
};
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  pipe: true,
  protocolTimeout: 0,
  userDataDir: fs.mkdtempSync(SP + 'chrome-shots-'),
  args: [
    '--mute-audio',
    '--window-size=1280,720',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(URL0, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(
    'window.game && game.vehicles && game.city && game.city.collidersReadyAt',
    { timeout: 300000, polling: 1000 },
  );
  await page.evaluate(() => {
    document.querySelector('#start, #play, .start, button')?.click?.();
    game.timeOfDay = 11.5;
  });
  for (const [name, chainName, s] of CLUSTERS) {
    if (ONLY && !name.includes(ONLY)) continue;
    const info = infoOf(chainName, s);
    if (!info) {
      console.log('skip', name);
      continue;
    }
    await page.evaluate(async (F) => {
      const g = window.game,
        frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const pos = g.player.position.clone();
      pos.set(F.x, F.y + 0.6, F.z);
      const anchor = { x: F.x, z: F.z };
      g.city.registerAnchor(anchor, 200);
      for (let i = 0; i < 900 && !g.city.collidersReadyAt(F.x, F.z); i++) await frame();
      if (!window.__shotCar) {
        window.__shotCar = g.vehicles.spawn('sedan', pos, Math.atan2(F.tx, F.tz), { snap: false });
        g.enterVehicle(window.__shotCar);
      } else {
        const b = window.__shotCar.body;
        b.setTranslation({ x: F.x, y: F.y + 1.2, z: F.z }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      g.timeOfDay = 11.5;
      for (let i = 0; i < 240; i++) await frame();
    }, info);
    if (!info) {
      console.log('skip', name);
      continue;
    }
    const { x, y, z, tx, tz } = info,
      nx = -tz,
      nz = tx;
    const views = {
      a1: [x + nx * 70 - tx * 60, y + 35, z + nz * 70 - tz * 60, x, y, z],
      a2: [x - nx * 70 + tx * 60, y + 35, z - nz * 70 + tz * 60, x, y, z],
      a3: [x + nx * 45 + tx * 40, Math.max(2, y * 0.3), z + nz * 45 + tz * 40, x, y * 0.7, z],
      a4: [x - nx * 30 - tx * 30, 1.8, z - nz * 30 - tz * 30, x, y, z],
      deck: [
        x - tx * 12 + nx * 1.8,
        y + 1.55,
        z - tz * 12 + nz * 1.8,
        x + tx * 60 + nx * 1.8,
        y + 1.0,
        z + tz * 60 + nz * 1.8,
      ],
    };
    for (const [vn, cam] of Object.entries(views)) {
      const url = await page.evaluate(async (cam) => {
        const g = window.game,
          THREE = g.THREE,
          cam0 = g.camera;
        const c = cam0.clone();
        c.fov = 60;
        c.near = 0.3;
        c.far = 3000;
        c.aspect = innerWidth / innerHeight;
        c.position.set(cam[0], cam[1], cam[2]);
        c.lookAt(cam[3], cam[4], cam[5]);
        c.updateProjectionMatrix();
        c.updateMatrixWorld();
        await new Promise((r) => requestAnimationFrame(() => r()));
        g.renderer.render(g.scene, c);
        return g.renderer.domElement.toDataURL('image/jpeg', 0.86);
      }, cam);
      fs.writeFileSync(
        path.join(OUT, `${name}_${vn}_${TAG}.jpg`),
        Buffer.from(url.split(',')[1], 'base64'),
      );
    }
    console.log('shot', name);
  }
} catch (e) {
  console.error('FAILED', e);
} finally {
  await browser.close();
}
