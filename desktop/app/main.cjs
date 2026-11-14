// Port Solana desktop app (Electron main process).
// Loads the production web build from local files over app://game/, on the high-performance GPU,
// with no background throttling, a large V8 heap, a crash guard and logs in the user data folder.
// Developer switches (all optional):
//   --ps-web-root=<dir>    serve this build instead of the bundled one
//   --ps-query=<query>     append a query string to the start URL (for example mute)
//   --ps-size=<W>x<H>      start with this content size, windowed (for measurements)
//   --ps-windowed          start windowed even if the last session ended in fullscreen
//   --ps-fullscreen        start in native fullscreen
//   --ps-test-profile      use the separate "Port Solana Test" profile (implied by --ps-size)
const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  screen,
  session,
  shell,
  crashReporter,
} = require('electron');
const log = require('./log.cjs');
const protocolMod = require('./protocol.cjs');
const crashGuard = require('./crashGuard.cjs');

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) {
    return null;
  }
  return hit.slice(prefix.length);
}

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

// ---------- Chromium switches (must be set before 'ready') ----------
const sw = app.commandLine;
// Discrete / high-performance GPU on dual-GPU Macs and Windows laptops.
sw.appendSwitch('force_high_performance_gpu');
// Use the GPU even where Chromium's blocklist would fall back to software.
sw.appendSwitch('ignore-gpu-blocklist');
sw.appendSwitch('enable-gpu-rasterization');
sw.appendSwitch('enable-zero-copy');
// WebGPU on every platform (on by default on macOS; this also unlocks Windows/Linux adapters).
sw.appendSwitch('enable-unsafe-webgpu');
// Never throttle timers or rAF, even when the window is hidden or covered.
sw.appendSwitch('disable-background-timer-throttling');
sw.appendSwitch('disable-renderer-backgrounding');
sw.appendSwitch('disable-backgrounding-occluded-windows');
sw.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// No autoplay gate for game audio.
sw.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Large V8 heap for the renderer (the browser tab caps lower).
sw.appendSwitch('js-flags', '--max-old-space-size=8192');
if (process.platform === 'darwin') {
  // ANGLE on Metal: Chromium's fastest WebGL path on Apple silicon.
  sw.appendSwitch('use-angle', 'metal');
}

app.setName('Port Solana');
// Measurement runs (--ps-size) use their own profile, so they never share the single-instance lock,
// window state, saves or logs with the player's copy of the app.
const testProfile = !!argValue('ps-size') || hasArg('ps-test-profile');
if (testProfile) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Port Solana Test'));
}
protocolMod.registerSchemes();

// Local minidumps only (never uploaded): <userData>/Crashpad/.
crashReporter.start({
  uploadToServer: false,
  compress: true,
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function webRoot() {
  const override = argValue('ps-web-root') || process.env.PS_WEB_ROOT;
  if (override) {
    return path.resolve(override);
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'web');
  }
  return path.resolve(__dirname, '..', 'dist', 'web');
}

function startUrl() {
  const q = argValue('ps-query');
  const base = `${protocolMod.ORIGIN}/index.html`;
  if (!q) {
    return base;
  }
  return `${base}?${q}`;
}

// ---------- window state ----------
function statePath() {
  return path.join(app.getPath('userData'), 'window.json');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (e) {
    return {};
  }
}

// Measurement runs never overwrite the player's window state.
let saveDisabled = testProfile;

function saveState() {
  if (saveDisabled || !win || win.isDestroyed()) {
    return;
  }
  const fullscreen = win.isFullScreen();
  const state = {
    fullscreen,
    bounds: fullscreen ? readState().bounds : win.getBounds(),
  };
  try {
    fs.writeFileSync(statePath(), JSON.stringify(state));
  } catch (e) {
    // not fatal
  }
}

// Saved windowed bounds are reused only when they still sit on a display and are a sensible size.
function usableBounds(b) {
  if (!b || !(b.width >= 960) || !(b.height >= 540)) {
    return null;
  }
  const display = screen.getDisplayMatching(b);
  const area = display.workArea;
  const insideX = b.x >= area.x - 40 && b.x + b.width <= area.x + area.width + 40;
  const insideY = b.y >= area.y - 40 && b.y + b.height <= area.y + area.height + 40;
  if (!insideX || !insideY) {
    return null;
  }
  return b;
}

function toggleFullscreen() {
  if (!win || win.isDestroyed()) {
    return;
  }
  win.setFullScreen(!win.isFullScreen());
}

// ---------- menu: app essentials only ----------
function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: 'Port Solana',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Open Log Folder',
          click: () => shell.openPath(log.dir()),
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Cmd+F',
          click: toggleFullscreen,
        },
        {
          label: 'Reload Game',
          accelerator: 'Cmd+Shift+R',
          click: () => win && win.webContents.loadURL(startUrl()),
        },
        {
          label: 'Developer Tools',
          accelerator: 'Alt+Cmd+I',
          click: () => win && win.webContents.toggleDevTools(),
        },
      ],
    },
    {
      role: 'windowMenu',
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- lockdown: this process shows the game and nothing else ----------
function lockDown(ses) {
  const allowed = new Set([
    'pointerLock',
    'fullscreen',
    'clipboard-sanitized-write',
    'persistent-storage',
  ]);
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((wc, permission) => allowed.has(permission));
  // Only the game's own files may load. The one exception is the game's web fonts (index.html links
  // Google Fonts); Chromium's HTTP cache keeps them, so later launches work offline too.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    const font = details.method === 'GET'
      && (u.startsWith('https://fonts.googleapis.com/') || u.startsWith('https://fonts.gstatic.com/'));
    const ok = u.startsWith(protocolMod.ORIGIN + '/')
      || font
      || u.startsWith('devtools:')
      || u.startsWith('data:')
      || u.startsWith('blob:')
      || u.startsWith('ws://') || u.startsWith('wss://');   // multiplayer server (?mp=)
    if (!ok) {
      log.info('blocked request ' + u.slice(0, 200));
    }
    cb({ cancel: !ok });
  });
}

function createWindow() {
  const state = readState();
  const area = screen.getPrimaryDisplay().workArea;
  const sizeArg = argValue('ps-size');
  // Default: the whole screen. The game then goes native fullscreen unless the player left it windowed.
  let bounds = {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
  };
  const saved = usableBounds(state.bounds);
  if (saved && !sizeArg) {
    bounds = saved;
  }
  // Only measurement runs ask for an exact content size.
  let useContentSize = false;
  if (sizeArg) {
    const [w, h] = sizeArg.split('x').map(Number);
    bounds = {
      x: area.x + 40,
      y: area.y + 40,
      width: w,
      height: h,
    };
    useContentSize = true;
    saveDisabled = true;
  }
  let startFullscreen = state.fullscreen !== false;
  if (sizeArg || hasArg('ps-windowed')) {
    startFullscreen = false;
  }
  if (hasArg('ps-fullscreen')) {
    startFullscreen = true;
  }

  win = new BrowserWindow({
    ...bounds,
    useContentSize,
    minWidth: 960,
    minHeight: 540,
    show: false,
    backgroundColor: '#000000',
    title: 'Port Solana',
    fullscreenable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
      enableWebSQL: false,
      v8CacheOptions: 'bypassHeatCheck',
      zoomFactor: 1.0,
    },
  });

  const wc = win.webContents;
  crashGuard.attach(win, startUrl());

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    if (startFullscreen) {
      win.setFullScreen(true);
    }
  });

  // Page zoom stays at exactly 1 (no Cmd+/- zoom, no pinch zoom), so the canvas maps 1:1 to the window.
  wc.on('did-finish-load', () => {
    wc.setZoomFactor(1);
    wc.setVisualZoomLevelLimits(1, 1).catch(() => {});
  });
  wc.on('zoom-changed', () => {
    wc.setZoomFactor(1);
  });

  // Chromium already fires 'resize' in the page; an extra one after the fullscreen animation settles
  // makes sure the game re-reads the final size.
  let resizeTimer = null;
  const nudgeResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) {
        return;
      }
      wc.executeJavaScript('dispatchEvent(new Event("resize")); 1').catch(() => {});
    }, 250);
  };
  win.on('resize', nudgeResize);
  win.on('enter-full-screen', nudgeResize);
  win.on('leave-full-screen', nudgeResize);
  const logSize = (what) => {
    const [w, h] = win.getContentSize();
    const d = screen.getDisplayMatching(win.getBounds());
    log.info(`${what}: content ${w}x${h}, display ${d.size.width}x${d.size.height} @${d.scaleFactor}x ${d.displayFrequency}Hz`);
  };
  win.on('enter-full-screen', () => logSize('fullscreen on'));
  win.on('leave-full-screen', () => logSize('fullscreen off'));
  win.once('show', () => logSize('shown'));

  // F11 toggles native fullscreen everywhere (Cmd+Ctrl+F also works on macOS via the menu).
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      toggleFullscreen();
    }
  });

  // No popups, no navigation away from the game.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    if (!url.startsWith(protocolMod.ORIGIN + '/')) {
      event.preventDefault();
    }
  });

  wc.on('console-message', (...args) => {
    const e = args[0];
    const level = e && e.level !== undefined ? e.level : args[1];
    const message = e && e.message !== undefined ? e.message : args[2];
    if (level === 'error' || level === 3) {
      log.info('console error: ' + String(message).slice(0, 600));
    }
  });

  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('enter-full-screen', saveState);
  win.on('leave-full-screen', saveState);
  win.on('close', saveState);
  win.on('closed', () => {
    win = null;
  });

  wc.loadURL(startUrl());
}

function startMemorySampler() {
  setInterval(() => {
    try {
      const metrics = app.getAppMetrics();
      const parts = metrics.map((m) => `${m.type}:${Math.round(m.memory.workingSetSize / 1024)}MB`);
      log.info('memory ' + parts.join(' '));
    } catch (e) {
      // ignore
    }
  }, 60 * 1000).unref();
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  }
});

app.whenReady().then(async () => {
  log.init(app.getPath('userData'));
  const root = webRoot();
  log.info(`start v${app.getVersion()} electron ${process.versions.electron} chrome ${process.versions.chrome} packaged=${app.isPackaged} webRoot=${root}`);
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    log.crash('missing web build at ' + root);
  }
  protocolMod.handle(root);
  lockDown(session.defaultSession);
  buildMenu();
  createWindow();
  startMemorySampler();
  // GPU feature status is only meaningful once the GPU process has reported in.
  setTimeout(async () => {
    try {
      const gpu = await app.getGPUInfo('basic');
      const devices = (gpu.gpuDevice || []).map((d) => `${d.vendorId}:${d.deviceId}${d.active ? '*' : ''}`);
      log.info('gpu ' + JSON.stringify(app.getGPUFeatureStatus()) + ' devices ' + devices.join(','));
    } catch (e) {
      log.info('gpu info unavailable');
    }
  }, 15000).unref();
});

// Saves live in this profile (<userData>/IndexedDB and Local Storage). Flush them to disk before quitting
// so the last autosave is never lost, and every few minutes in case the app is force-quit.
app.on('before-quit', () => {
  try {
    session.defaultSession.flushStorageData();
  } catch (e) {
    // ignore
  }
});
setInterval(() => {
  try {
    session.defaultSession.flushStorageData();
  } catch (e) {
    // ignore
  }
}, 2 * 60 * 1000).unref();

app.on('window-all-closed', () => {
  app.quit();
});
