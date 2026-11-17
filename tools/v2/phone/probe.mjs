// r2-phone: evaluate expressions on the phone preview page. Usage: node tools/v2/phone/probe.mjs '<query>' '<js expr>'...
import { withBrowser } from '../browser.mjs';
await withBrowser({ width: 1600, height: 900, maxSeconds: 90 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/src/ui/phone/preview.html?mute&' + (process.argv[2] || ''));
  await b.waitFor('window.ready === true', 60); await b.sleep(1500);
  for (const e of process.argv.slice(3)) { try { console.log('>', JSON.stringify(await b.eval(`(async () => { ${e} })()`)).slice(0, 3000)); } catch (x) { console.log('ERR', x.message.slice(0, 500)); } }
  if (b.errors.length) console.log('CONSOLE ERRORS\n' + b.errors.filter((x) => !/favicon/.test(x)).join('\n'));
});
