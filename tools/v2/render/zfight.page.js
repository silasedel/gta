// Z-fight detector page hook: the scanner lives in the game (src/render/zfightScan.js, game.zfight). Installed with eval.
(() => {
  if (window.__zf) return 'already';
  window.__zf = (o) => game.zfight(o);
  return 'ok';
})();
