// Port Solana desktop: keeps the window alive when the renderer or GPU process dies or hangs.
// - Renderer crash / OOM / kill: log it, reload the game, show a short notice.
// - GPU process crash: log it, reload the game (the page's WebGL context is gone).
// - Renderer hang: after HANG_SECONDS without a response, crash it on purpose and reload.
// - Crash loop (CRASH_LOOP_COUNT crashes inside CRASH_LOOP_WINDOW_MS): stop reloading, ask the user.
const { app, dialog } = require('electron');
const log = require('./log.cjs');

const HANG_SECONDS = 45;
const CRASH_LOOP_COUNT = 4;
const CRASH_LOOP_WINDOW_MS = 3 * 60 * 1000;
const RELOAD_DELAY_MS = 800;

function noticeScript(text) {
  const msg = JSON.stringify(text);
  return `(() => {
    const show = () => {
      const el = document.createElement('div');
      el.id = 'ps-desktop-notice';
      el.textContent = ${msg};
      el.style.cssText = [
        'position:fixed',
        'left:50%',
        'top:24px',
        'transform:translateX(-50%)',
        'z-index:2147483647',
        'padding:10px 18px',
        'border-radius:10px',
        'background:rgba(12,16,24,0.88)',
        'color:#fff',
        'font:500 14px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        'box-shadow:0 6px 24px rgba(0,0,0,0.35)',
        'pointer-events:none',
        'transition:opacity 0.6s',
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
      }, 7000);
      setTimeout(() => {
        el.remove();
      }, 8000);
    };
    if (document.body) {
      show();
    } else {
      addEventListener('DOMContentLoaded', show);
    }
  })();`;
}

function attach(win, startUrl) {
  const wc = win.webContents;
  const crashTimes = [];
  let pendingNotice = null;
  let hangTimer = null;
  let reloading = false;
  let halted = false;
  let killedForHang = false;

  const recordCrash = () => {
    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes.length && now - crashTimes[0] > CRASH_LOOP_WINDOW_MS) {
      crashTimes.shift();
    }
    return crashTimes.length >= CRASH_LOOP_COUNT;
  };

  const askAfterLoop = async () => {
    halted = true;
    log.crash(`crash loop: ${crashTimes.length} crashes in ${CRASH_LOOP_WINDOW_MS / 1000}s, waiting for the user`);
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Try again', 'Open log folder', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      message: 'Port Solana keeps crashing',
      detail: 'The game crashed several times in a row. The reasons are in crash.log in the log folder.',
    });
    if (r.response === 0) {
      crashTimes.length = 0;
      halted = false;
      reload('Restarted after repeated crashes.');
    } else if (r.response === 1) {
      require('electron').shell.openPath(log.dir());
      halted = false;
      crashTimes.length = 0;
      reload('Restarted after repeated crashes.');
    } else {
      app.quit();
    }
  };

  const reload = (notice) => {
    if (win.isDestroyed() || reloading) {
      return;
    }
    reloading = true;
    pendingNotice = notice;
    setTimeout(() => {
      reloading = false;
      if (win.isDestroyed()) {
        return;
      }
      log.crash(`reloading ${startUrl}`);
      wc.loadURL(startUrl).catch((e) => {
        log.crash('reload failed: ' + (e && e.message));
      });
    }, RELOAD_DELAY_MS);
  };

  const onCrash = (what, notice) => {
    log.crash(what);
    if (halted) {
      return;
    }
    if (recordCrash()) {
      askAfterLoop();
      return;
    }
    reload(notice);
  };

  wc.on('render-process-gone', (event, details) => {
    const memory = process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : null;
    const free = memory ? ` systemFreeMB=${Math.round(memory.free / 1024)}` : '';
    const what = `renderer gone: reason=${details.reason} exitCode=${details.exitCode}${free}`;
    if (details.reason === 'clean-exit') {
      log.info(what);
      return;
    }
    let notice = 'The game crashed and was restarted.';
    if (killedForHang) {
      killedForHang = false;
      notice = 'The game froze and was restarted.';
    } else if (details.reason === 'oom') {
      notice = 'The game ran out of memory and was restarted.';
    }
    onCrash(what, notice);
  });

  app.on('child-process-gone', (event, details) => {
    const what = `child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name || ''}`;
    if (details.type !== 'GPU') {
      log.info(what);
      return;
    }
    if (details.reason === 'clean-exit') {
      log.info(what);
      return;
    }
    onCrash(what, 'The graphics process crashed and the game was restarted.');
  });

  wc.on('unresponsive', () => {
    log.crash(`renderer unresponsive; will restart if still hung after ${HANG_SECONDS}s`);
    clearTimeout(hangTimer);
    hangTimer = setTimeout(() => {
      if (win.isDestroyed()) {
        return;
      }
      log.crash(`renderer hung for ${HANG_SECONDS}s, restarting it`);
      killedForHang = true;
      wc.forcefullyCrashRenderer();
    }, HANG_SECONDS * 1000);
  });

  wc.on('responsive', () => {
    if (hangTimer) {
      clearTimeout(hangTimer);
      hangTimer = null;
      log.crash('renderer responsive again');
    }
  });

  wc.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      log.crash(`load failed: ${code} ${desc} ${url}`);
    }
  });

  wc.on('did-finish-load', () => {
    if (!pendingNotice) {
      return;
    }
    const text = pendingNotice;
    pendingNotice = null;
    wc.executeJavaScript(noticeScript(text)).catch(() => {});
  });
}

module.exports = {
  attach,
};
