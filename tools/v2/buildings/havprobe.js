(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const msgs = [];
  const ow = console.warn,
    oe = console.error;
  console.warn = (...a) => {
    msgs.push(
      'W ' +
        a
          .map((x) => (x && x.stack ? x.stack.slice(0, 400) : String(x)))
          .join(' ')
          .slice(0, 600),
    );
    ow.apply(console, a);
  };
  console.error = (...a) => {
    msgs.push(
      'E ' +
        a
          .map((x) => (x && x.stack ? x.stack.slice(0, 400) : String(x)))
          .join(' ')
          .slice(0, 600),
    );
    oe.apply(console, a);
  };
  window.addEventListener('error', (e) =>
    msgs.push('X ' + ((e.error && e.error.stack) || e.message).slice(0, 600)),
  );
  window.addEventListener('unhandledrejection', (e) =>
    msgs.push('R ' + String((e.reason && e.reason.stack) || e.reason).slice(0, 600)),
  );
  game.teleport(-707, undefined, -149, 0);
  await sleep(35000);
  const root = game.city.root;
  let near = 0,
    mid = 0;
  root.traverse((o) => {
    if (/^tile-near/.test(o.name)) near++;
    if (/^tile-mid|chunk/.test(o.name)) mid++;
  });
  return {
    pending: game.city.streamer?.pending?.(),
    nearTiles: near,
    midish: mid,
    msgs: msgs.slice(0, 25),
  };
})();
