// Southline V2: WebGL context-loss guard (playtest-fixes track).
// When the browser drops the GPU context (memory pressure, GPU reset, too many tabs), the page used to
// stay frozen on a dead canvas. This module:
//   - pauses the simulation and shows a clear message;
//   - asks the browser to restore the context (three.js re-uploads every texture, geometry and program
//     on its own after 'webglcontextrestored');
//   - forces a restore through WEBGL_lose_context if the browser has not restored it after a few seconds;
//   - offers a reload button if the GPU never comes back.
// Diagnostics: game.contextGuard = { losses, restores, lastLossAt }.

export const order = 5;

export async function initV2(game) {
  const renderer = game.renderer;
  const canvas = renderer?.domElement;
  if (!canvas) {
    return;
  }
  const gl = renderer.getContext();
  const loseExt = gl.getExtension('WEBGL_lose_context');

  const state = {
    losses: 0,
    restores: 0,
    lastLossAt: 0,
    lost: false,
  };
  game.contextGuard = state;

  const box = document.createElement('div');
  box.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:100000',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'background:rgba(6,10,16,.82)',
    'color:#eaf6ff',
    'font:600 15px/1.5 Inter,Arial,sans-serif',
    'text-align:center',
  ].join(';');
  const panel = document.createElement('div');
  panel.style.cssText =
    'max-width:440px;padding:22px 26px;border-radius:12px;background:rgba(0,0,0,.45);box-shadow:0 0 0 1px rgba(255,255,255,.12)';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:18px;letter-spacing:.08em;margin-bottom:8px';
  title.textContent = 'GRAPHICS RESET';
  const msg = document.createElement('div');
  msg.style.cssText = 'font-weight:400;opacity:.85';
  const btn = document.createElement('button');
  btn.textContent = 'Reload the game';
  btn.style.cssText =
    'margin-top:14px;display:none;padding:8px 16px;border-radius:8px;border:0;background:#2fd3c6;color:#04201e;font:700 14px Inter,Arial,sans-serif;cursor:pointer';
  btn.addEventListener('click', () => {
    try {
      game.save?.quick?.();
    } catch (e) {
      // saving is best effort
    }
    location.reload();
  });
  panel.append(title, msg, btn);
  box.append(panel);
  document.body.append(box);

  let wasPaused = false;
  let forceTimer = 0;
  let giveUpTimer = 0;

  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      // preventDefault tells the browser we will handle a restore (otherwise it never restores)
      e.preventDefault();
      state.losses++;
      state.lastLossAt = performance.now();
      state.lost = true;
      wasPaused = !!game.ui?.paused;
      if (game.ui) {
        game.ui.paused = true;
      }
      msg.textContent =
        'The graphics chip was reset by the browser. Restoring the picture, one moment...';
      btn.style.display = 'none';
      box.style.display = 'flex';
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      // the browser normally restores on its own; if not, ask it to
      forceTimer = setTimeout(() => {
        if (state.lost && loseExt) {
          try {
            loseExt.restoreContext();
          } catch (err) {
            // restoreContext throws if the context is not lost (already restored)
          }
        }
      }, 3000);
      giveUpTimer = setTimeout(() => {
        if (state.lost) {
          msg.textContent =
            'The graphics chip did not come back. Close a few other tabs, then reload. Your last save is kept.';
          btn.style.display = 'inline-block';
        }
      }, 15000);
    },
    false,
  );

  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      state.restores++;
      state.lost = false;
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      // three.js has re-initialized its GL state; static shadow maps and the env map must be redrawn
      try {
        renderer.shadowMap.needsUpdate = true;
        game.__psSplit?.markStaticDirty?.();
      } catch (err) {
        // not fatal
      }
      try {
        game.post?.setSize?.(innerWidth, innerHeight);
      } catch (err) {
        // not fatal
      }
      msg.textContent = 'Graphics restored.';
      setTimeout(() => {
        box.style.display = 'none';
        if (game.ui && !wasPaused) {
          game.ui.paused = false;
        }
      }, 700);
      try {
        game.emit?.('gpu:restored', { losses: state.losses });
      } catch (err) {
        // listeners must not break the guard
      }
    },
    false,
  );
}
