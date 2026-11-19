// "Mission passed" moment: the custom Southline theme (the old title song) hits on its drop, with a big title card.
// The sting (public/assets/audio/stingers/mission_passed.ogg, 7.2 s) is cut from port_solana_theme.aac at its drop
// (9.60 s .. 16.80 s, 2.2 s fade out), so the hit and the card land together. Radio and venue music duck under it.
//   game.audio.missionPassed()           the sting only (missions call this; returns a promise, true when it played)
//   game.audio.missionPassed({ title, sub })   sting + title card
//   game.passed.play({ title, sub })     same as the line above (also used by the events below)
// Fires on: jobEnd (ok), activityEnd (success), turfFightEnd (won), businessBought.
export const order = 120;
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';
const URL_ = BASE + 'assets/audio/stingers/mission_passed.ogg';
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

export async function initV2(game) {
  let buf = null,
    loading = null,
    busyUntil = 0;
  const load = () =>
    (loading ||= (async () => {
      const ctx = game.audio?.ctx;
      if (!ctx) return null;
      try {
        const ab = await (await fetch(URL_)).arrayBuffer();
        buf = await ctx.decodeAudioData(ab);
      } catch (e) {
        console.warn('[passed] stinger load failed', e);
        loading = null;
      }
      return buf;
    })());

  // ---- title card (own overlay so it never fights the HUD notification queue)
  const css = document.createElement('style');
  css.textContent = `
  .ps-passed{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;z-index:60;opacity:0;transition:opacity .35s}
  .ps-passed.on{opacity:1}
  .ps-passed .band{position:absolute;left:0;right:0;top:50%;height:150px;transform:translateY(-50%) scaleY(.2);background:linear-gradient(90deg,transparent,rgba(8,6,18,.72) 18%,rgba(8,6,18,.72) 82%,transparent);transition:transform .25s cubic-bezier(.2,1.4,.4,1)}
  .ps-passed.on .band{transform:translateY(-50%) scaleY(1)}
  .ps-passed .t{position:relative;font:900 italic 74px/1 var(--ps-cond);letter-spacing:.04em;color:#ffd25a;text-transform:uppercase;
    text-shadow:0 0 18px rgba(255,140,60,.55),0 4px 0 #8a3a12,0 7px 16px rgba(0,0,0,.6);transform:scale(1.5);filter:blur(6px);transition:transform .18s cubic-bezier(.2,1.6,.4,1),filter .18s}
  .ps-passed.on .t{transform:scale(1);filter:none}
  .ps-passed .s{position:relative;margin-top:10px;font:700 26px/1.2 var(--ps-sans);color:#fff;letter-spacing:.08em;text-shadow:0 2px 8px rgba(0,0,0,.7);opacity:0;transform:translateY(8px);transition:opacity .4s .35s,transform .4s .35s}
  .ps-passed.on .s{opacity:1;transform:none}
  .ps-passed .s b{color:#7dffb0}`;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.className = 'ps-passed';
  el.innerHTML = '<div class="band"></div><div class="t"></div><div class="s"></div>';
  document.body.appendChild(el);
  let hideT = 0;

  function card(title, sub) {
    el.querySelector('.t').textContent = title;
    el.querySelector('.s').innerHTML = sub || '';
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(hideT);
    hideT = setTimeout(() => el.classList.remove('on'), 6200);
  }

  async function sting() {
    const now = performance.now();
    if (now < busyUntil) return false; // one sting at a time
    busyUntil = now + 7500;
    const A = game.audio,
      ctx = A?.ctx;
    if (ctx && !A.muted) {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch (e) {
          /* needs a user gesture */
        }
      }
      const b = buf || (await load());
      if (b) {
        const vols = A.busVolumes || {};
        const g = ctx.createGain();
        g.gain.value = 0.9 * (vols.master ?? 1) * (vols.music ?? 1);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(g).connect(ctx.destination);
        // duck radio and venue music under the stinger, then restore (unless the player moved a slider meanwhile)
        const keep = { radio: vols.radio ?? 1, music: vols.music ?? 1 };
        const ducked = { radio: keep.radio * 0.12, music: keep.music * 0.12 };
        A.setBusVolume?.('radio', ducked.radio);
        A.setBusVolume?.('music', ducked.music);
        s.onended = () => {
          const v = A.busVolumes || {};
          for (const k of ['radio', 'music'])
            if (Math.abs((v[k] ?? 0) - ducked[k]) < 1e-3) A.setBusVolume?.(k, keep[k]);
        };
        s.start();
        game.emit?.('passedStinger', {});
        return true;
      }
    }
    return false;
  }
  async function play({ title = 'Mission Passed', sub = '' } = {}) {
    card(title, sub);
    return sting();
  }
  // missions: game.audio.missionPassed() = the sting alone; with a title it also shows the card
  const missionPassed = (o) => (o && o.title ? play(o) : sting());

  game.passed = { play, sting, preload: load };
  const attach = () => {
    if (game.audio) game.audio.missionPassed = missionPassed;
    else setTimeout(attach, 500);
  };
  attach();
  // decode early once audio exists (first user gesture), so the hit is instant
  const warm = () => {
    if (game.audio?.ctx) load();
    else setTimeout(warm, 2000);
  };
  warm();

  game.on?.('jobEnd', (d) => {
    if (d?.ok) play({ title: 'Job Passed', sub: d.pay ? `<b>+${fmt(d.pay)}</b>` : '' });
  });
  game.on?.('activityEnd', (d) => {
    if (d?.success) play({ title: 'Passed' });
  });
  game.on?.('turfFightEnd', (d) => {
    if (d?.won) play({ title: 'Turf Taken', sub: 'The corner is yours' });
  });
  game.on?.('businessBought', (d) =>
    play({ title: 'Business Acquired', sub: d?.price ? `<b>-${fmt(d.price)}</b>` : '' }),
  );
}
