// r2-phone: boot checks. 1) the HUD test page with the phone open (fast). 2) with --game: the real game on :5200,
// started like a player; presses P (real key events through the bindings layer), opens the bank, walks with W while
// the phone is up, and prints console errors. Shots go to the scratch dir given by --out (default /tmp).
import { withBrowser, GAME_READY, startGame } from '../browser.mjs';
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '--out=/tmp').slice(6);
const GAME = process.argv.includes('--game');
await withBrowser({ width: 1600, height: 900, maxSeconds: GAME ? 600 : 90 }, async (b) => {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const press = async (code, key) => {
    await b.key(code, true, key);
    await b.sleep(60);
    await b.key(code, false, key);
    await b.sleep(250);
  };
  if (!GAME) {
    await b.goto('http://127.0.0.1:5200/src/ui/hudtest.html?mute&play&demo=phone');
    await b.sleep(3500);
    console.log('hudtest phone open:', await b.eval('!!(game.phone && game.phone.open)'));
    await press('ArrowRight', 'ArrowRight');
    await press('Enter', 'Enter');
    await b.sleep(900);
    console.log('app after Enter:', await b.eval('game.phone.appId'));
    await b.screenshot(`${OUT}/boot_hudtest.png`);
  } else {
    await b.goto('http://127.0.0.1:5200/?mute');
    if (!(await startGame(b, 180))) throw new Error('game did not start');
    await b.sleep(3000);
    const errs0 = b.errors.length;
    await press('KeyP', 'p');
    console.log(
      'P opens phone:',
      await b.eval('game.phone.open'),
      'bindings mode:',
      await b.eval('game.bindings && game.bindings.mode'),
    );
    const p0 = await b.eval('JSON.stringify([game.player.position.x, game.player.position.z])');
    await b.key('KeyW', true, 'w');
    await b.sleep(1500);
    await b.key('KeyW', false, 'w');
    const p1 = await b.eval('JSON.stringify([game.player.position.x, game.player.position.z])');
    console.log('walk with phone up:', p0, '->', p1);
    await b.screenshot(`${OUT}/game_home.png`);
    await b.eval(`game.phone.openApp('bank')`);
    await b.sleep(2200);
    await b.screenshot(`${OUT}/game_bank.png`);
    console.log(
      'bank brand:',
      await b.eval('game.phone.os.brand().name'),
      'balance',
      await b.eval('game.bank.balance'),
      'cash',
      await b.eval('game.wallet.cash'),
    );
    await press('Backspace', 'Backspace');
    await b.sleep(500);
    console.log('back closes app:', await b.eval('game.phone.appId'));
    await press('KeyP', 'p');
    await b.sleep(600);
    console.log(
      'P closes phone:',
      !(await b.eval('game.phone.open')),
      'mode:',
      await b.eval('game.bindings && game.bindings.mode'),
    );
    await press('ArrowUp', 'ArrowUp');
    await b.sleep(600);
    console.log('ArrowUp opens:', await b.eval('game.phone.open'));
    await press('Escape', 'Escape');
    await b.sleep(500);
    console.log(
      'Esc closes phone:',
      !(await b.eval('game.phone.open')),
      'paused:',
      await b.eval('game.ui.paused'),
    );
    await press('Escape', 'Escape');
    await b.sleep(500);
    console.log('Esc pauses:', await b.eval('game.ui.paused'));
    console.log('errors during phone use:', b.errors.slice(errs0).length);
  }
  const errs = b.errors.filter((x) => !/favicon/.test(x));
  console.log(errs.length ? 'CONSOLE ERRORS\n' + errs.join('\n') : 'no console errors');
});
