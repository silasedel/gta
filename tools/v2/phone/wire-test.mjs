// r2-phone: the bank app's money path against the REAL core systems (src/systems), in Node with memory storage.
//   1. a wire to a contact moves money out of checking (ledger entry, category 'wire', party = contact)
//   2. it survives save -> load into a fresh game (balance, ledger, the phone slice's daily limit usage and threads)
//   3. an amount over the balance fails cleanly: nothing moves, a readable reason comes back
//   4. a wire to an account number charges its fee; daily limits hold; the Hush Line lowers a wanted star
// Usage: node tools/v2/phone/wire-test.mjs   (exit code 1 on any failure)
import { createSystems } from '../../../src/systems/index.js';
import { createMemoryStorage } from '../../../src/systems/storage.js';
import { createPhoneData } from '../../../src/ui/phone/data.js';
import { createWire } from '../../../src/ui/phone/wire.js';

let fails = 0;
const ok = (c, msg) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`); if (!c) fails++; };
const near = (a, b) => Math.abs(a - b) < 0.005;

function boot(storage) {
  const host = { player: { position: { x: 0, y: 0, z: 0 } }, settings: {}, ui: {} };
  const sys = createSystems(host, { storage, syncLocal: null, seed: 7 });
  sys.attach();
  const data = createPhoneData(host);
  const wire = createWire(host, data);
  return { host, sys, data, wire };
}

const storage = createMemoryStorage();
const A = boot(storage);
await A.sys.save.newGame({ slot: 'slot1' });
A.host.bank.deposit(100, { teller: true });                     // start money: cash 120, checking 680 -> 780
const c0 = A.host.bank.balance;
ok(near(c0, 780), `checking starts at $780 (got ${c0})`);
const rafa = A.data.contact('rafa');
ok(!!rafa && rafa.kind === 'family', 'contact Tío Rafa exists');

// 1. wire
const r = A.wire.send(rafa, 250, 'Cooler money');
ok(r.ok, `send $250 to ${rafa.name} ok (${r.reasonText || r.confirmation})`);
ok(near(A.host.bank.balance, c0 - 250), `checking ${c0} -> ${A.host.bank.balance} (-250)`);
const e = A.host.bank.ledger[A.host.bank.ledger.length - 1];
ok(e.category === 'wire' && e.party === rafa.name && near(e.amount, -250) && e.memo === 'Cooler money', 'ledger entry: wire, party, amount, memo');
ok(A.data.S.wires.instant === 250, 'daily instant usage recorded');
ok(A.data.thread('rafa').some((m) => m.kind === 'money' && m.from === 'me'), 'money bubble in the Messages thread');
ok(!!r.reply, `contact replies: "${r.reply}"`);

// 3. over balance
const before = A.host.bank.balance, ledN = A.host.bank.ledger.length;
const bad = A.wire.send(rafa, before + 1);
ok(!bad.ok && bad.reason === 'insufficient', `over-balance send fails (${bad.reason}: ${bad.reasonText})`);
ok(near(A.host.bank.balance, before) && A.host.bank.ledger.length === ledN, 'nothing moved on the failed send');
const q = A.wire.quote(rafa, 0);
ok(!q.ok && q.reason === 'bad_amount', 'zero amount refused');

// 4. limits and fees
A.host.bank.transfer(0, 'checking', 'savings');
A.host.wallet.earn(60000, { method: 'deposit', category: 'income', memo: 'test' });
const big = A.wire.quote(rafa, 6000);
ok(!big.ok && big.reason === 'per_transfer', `instant $6,000 over the per-transfer limit (${big.reason})`);
const id = A.data.addPayee({ name: 'Gulf Marine Supply', routing: '063100277', accountNo: '4410098812' });
const payee = A.data.contact(id);
const b2 = A.host.bank.balance;
const w = A.wire.send(payee, 1000, 'Outboard parts');
ok(w.ok && w.fee === 15 && near(A.host.bank.balance, b2 - 1015), `account wire charges the $15 fee (${b2} -> ${A.host.bank.balance})`);
// Hush Line: one star for $400 x level while evading
A.host.wanted = { level: 2, evading: true, heat: 5, clearT: 0, clear() { this.level = 0; } };
const hush = A.data.contact('hush');
const h = A.wire.send(hush, 800);
ok(h.ok && A.host.wanted.level === 1 && h.effect, `Hush Line wire lowers wanted 2 -> ${A.host.wanted.level}`);
A.host.wanted = null;

ok(A.wire.send(rafa, 5000).ok && A.wire.send(rafa, 3950).ok, 'instant sends up to the daily limit');
const over = A.wire.quote(rafa, 1);
ok(!over.ok && over.reason === 'daily', `daily instant limit reached (${over.reason})`);

// 2. save -> load
const balSaved = A.host.bank.balance, ledSaved = A.host.bank.ledger.length, usageSaved = { ...A.data.S.wires };
const sv = await A.sys.save.save({ kind: 'manual' });
ok(sv.ok, 'saved');
const B = boot(storage);
const ld = await B.sys.save.load('slot1', 'manual');
ok(ld.ok, 'loaded into a fresh game');
ok(near(B.host.bank.balance, balSaved), `balance after load ${B.host.bank.balance} == ${balSaved}`);
ok(B.host.bank.ledger.length === ledSaved && B.host.bank.ledger.some((x) => x.category === 'wire' && x.memo === 'Cooler money'), 'ledger (with the wire) survives');
ok(B.data.S.wires.instant === usageSaved.instant && B.data.S.wires.day === usageSaved.day, 'daily limit usage survives');
ok(B.data.thread('rafa').some((m) => m.kind === 'money'), 'Messages thread survives');
const still = B.wire.quote(B.data.contact('rafa'), 1);
ok(!still.ok && still.reason === 'daily', 'daily limit still enforced after load');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
