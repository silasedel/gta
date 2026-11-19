// Camera: the phone screen becomes a viewfinder onto the game behind it (the screen turns see-through). The shutter
// grabs the next rendered frame from the game canvas, cropped to the viewfinder, into the camera roll for this session
// (posts to Wavvy). "Photo mode" hands over to the HUD's existing photo mode (HUD hidden).
import './apps.css';

export default function cameraApp(os) {
  const { esc, GLYPH: G, game, hooks } = os;
  const roll = (os.roll ||= []);
  /** One frame from the game canvas right after it is rendered (no preserveDrawingBuffer needed). */
  function grab(rect) {
    return new Promise((res) => {
      const R = game.renderer;
      if (!R?.render || !R.domElement) {
        res(null);
        return;
      }
      const orig = R.render;
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        R.render = orig;
        res(v);
      };
      R.render = function (...a) {
        orig.apply(this, a);
        if (done || (this.getRenderTarget && this.getRenderTarget() !== null)) return;
        try {
          const src = this.domElement,
            sw = src.width,
            sh = src.height,
            cw = src.clientWidth || sw,
            ch = src.clientHeight || sh,
            kx = sw / cw,
            ky = sh / ch;
          const sx = Math.max(0, rect.left * kx),
            sy = Math.max(0, rect.top * ky),
            w = Math.min(sw - sx, rect.width * kx),
            h = Math.min(sh - sy, rect.height * ky);
          const c = document.createElement('canvas'),
            out = 420;
          c.width = out;
          c.height = Math.round((out * h) / Math.max(1, w));
          c.getContext('2d').drawImage(src, sx, sy, w, h, 0, 0, c.width, c.height);
          finish(c.toDataURL('image/jpeg', 0.86));
        } catch (e) {
          finish(null);
        }
      };
      setTimeout(() => finish(null), 700);
    });
  }
  function camPage(app) {
    return {
      nav: false,
      cls: 'cm-page',
      status: 'light',
      body: `<div class="cm-vf"><i class="cm-grid"></i><span class="cm-zoom">1×</span></div>`,
      footer: `<div class="cm-top"><span class="cm-flash">${G.sparkle}</span><span class="cm-live">LIVE</span></div>
        <div class="cm-modes"><span>VIDEO</span><b>PHOTO</b><span>PORTRAIT</span></div>
        <div class="cm-bar"><button class="cm-thumb" data-act="roll" data-f>${roll[0] ? `<img src="${roll[0]}" alt="">` : ''}</button>
          <button class="cm-shutter" data-act="shoot" data-f data-autofocus><i></i></button>
          <button class="cm-flip" data-act="photo" data-f title="Photo mode">${G.flip}</button></div>`,
      acts: {
        shoot: async () => {
          const r = os.app.el.getBoundingClientRect(),
            cv = game.renderer?.domElement?.getBoundingClientRect?.() || { left: 0, top: 0 };
          os.flash();
          os.sound('select', 0.7);
          const url = await grab({
            left: r.left - cv.left,
            top: r.top - cv.top,
            width: r.width,
            height: r.height,
          });
          if (!url) {
            os.toast('Could not take the photo');
            return;
          }
          roll.unshift(url);
          if (roll.length > 12) roll.pop();
          const t = os.app?.stack?.[0]?.querySelector?.('.cm-thumb');
          if (t) {
            t.innerHTML = `<img src="${url}" alt="">`;
            t.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], {
              duration: 300,
              easing: 'cubic-bezier(.2,1.3,.4,1)',
            });
          }
        },
        roll: () => {
          if (roll.length) os.push(rollPage(app));
        },
        photo: () => {
          os.close();
          try {
            hooks.setPhoto?.(true);
          } catch (e) {
            /* */
          }
        },
      },
    };
  }
  function rollPage(app, i = 0) {
    return {
      title: `Photo ${i + 1} of ${roll.length}`,
      back: 'Camera',
      cls: 'cm-roll',
      status: 'light',
      body: `<div class="cm-photo"><img src="${roll[i]}" alt=""></div>
        <div class="cm-strip">${roll.map((u, j) => `<button class="${j === i ? 'on' : ''}" data-act="pick" data-i="${j}" data-f><img src="${u}" alt=""></button>`).join('')}</div>
        <div class="kp-btns"><button class="kp-btn" data-act="post" data-f>${G.share}Post to Wavvy</button><button class="kp-btn danger" data-act="del" data-f>Delete</button></div>`,
      acts: {
        pick: (el) => os.replaceTop(rollPage(app, Number(el.dataset.i))),
        post: () => {
          (os.posts ||= []).unshift({ img: roll[i], t: os.data.now(), likes: 0 });
          os.toast('Posted to Wavvy', 'good');
          os.sound('confirm', 0.5);
        },
        del: () => {
          roll.splice(i, 1);
          if (!roll.length) {
            os.pop();
            return;
          }
          os.replaceTop(rollPage(app, Math.min(i, roll.length - 1)));
        },
      },
    };
  }
  return {
    id: 'camera',
    name: 'Camera',
    launch(app) {
      app.el.classList.add('cm-app');
      os.push(camPage(app), { instant: true, sound: false });
      app.el.closest('.kp-screen')?.classList.add('cam');
    },
    onClose(app) {
      app.el.closest('.kp-screen')?.classList.remove('cam');
    },
  };
}
