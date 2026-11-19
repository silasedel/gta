// Mark library, part 3: objects (nautical, civic, tools, tech, food and drink, retail). 100 x 100 unit box. See marks.js.
import { def, F, FE, S, O, OS, EL, RR, rep, clipTo, TX, TAU } from './marks.js';

// ---- nautical and travel
def('anchor', (g, c) => {
  OS(g, c.a, 6, 50, 15, 8);
  S(g, c.a, 7, 'M50 24 V88 M32 38 H68');
  S(g, c.a, 7, 'M14 60 C16 80 32 90 50 90 C68 90 84 80 86 60');
  F(g, c.a, 'M4 68 L14 46 L26 64 Z M96 68 L86 46 L74 64 Z');
});
def('helm', (g, c) => {
  rep(g, 8, 50, 50, () => {
    S(g, c.a, 5, 'M50 6 V40', 'butt');
    O(g, c.a, 50, 6, 4.5);
  });
  OS(g, c.a, 8, 50, 50, 29);
  OS(g, c.a, 5, 50, 50, 9);
});
def('compass', (g, c) => {
  OS(g, c.a, 3.5, 50, 50, 45);
  F(g, c.a, 'M50 8 L58 42 L92 50 L58 58 L50 92 L42 58 L8 50 L42 42 Z');
  F(g, c.b, 'M50 8 V50 L42 42 Z M92 50 H50 L58 42 Z M50 92 V50 L58 58 Z M8 50 H50 L42 58 Z');
  O(g, c.paper, 50, 50, 3);
});
def('lighthouse', (g, c) => {
  F(g, c.c, 'M41 22 L4 10 V32 Z M59 22 L96 10 V32 Z');
  const t = 'M40 34 H60 L66 92 H34 Z';
  F(g, c.a, t);
  clipTo(g, t, () => {
    RR(g, c.b, 20, 46, 60, 11);
    RR(g, c.b, 20, 69, 60, 11);
  });
  RR(g, c.b, 42, 20, 16, 13);
  F(g, c.a, 'M38 21 L50 7 L62 21 Z');
  RR(g, c.a, 36, 31, 28, 4.5);
  RR(g, c.a, 26, 91, 48, 6);
});
def('sailboat', (g, c) => {
  F(g, c.a, 'M8 70 H92 L80 87 H22 Z M47 18 L20 63 H47 Z');
  F(g, c.b, 'M53 8 L86 63 H53 Z');
  S(g, c.a, 3, 'M50 6 V70', 'butt');
  S(g, c.b, 3.5, 'M6 96 Q20 90 34 96 T62 96 T94 95');
});
def('speedboat', (g, c) => {
  F(g, c.a, 'M2 56 H70 L98 44 C92 62 78 72 62 72 H14 Z');
  F(g, c.b, 'M34 54 L44 40 H60 L66 54 Z');
  S(g, c.b, 4, 'M4 82 Q18 76 32 82 T60 82 T92 80 M14 93 Q26 88 38 93 T66 93');
});
def('yacht', (g, c) => {
  F(g, c.a, 'M2 62 H98 L88 78 H12 Z M18 60 L26 48 H78 L84 60 Z M34 46 L40 36 H66 L70 46 Z');
  S(g, c.a, 2.5, 'M52 36 V22 M46 26 H60');
  S(g, c.paper, 2.4, 'M30 54 H74', 'butt');
  S(g, c.b, 4, 'M4 90 Q18 84 32 90 T60 90 T94 89');
});
def('propeller', (g, c) => {
  rep(g, 3, 50, 50, () => F(g, c.a, 'M50 50 C34 40 30 14 47 4 C64 10 63 36 50 50 Z'));
  O(g, c.paper, 50, 50, 8);
  O(g, c.a, 50, 50, 4);
});
def('plane', (g, c) => {
  F(
    g,
    c.a,
    'M50 4 C55 4 57 14 57 26 V40 L94 62 V72 L57 62 V80 L68 90 V96 L50 91 L32 96 V90 L43 80 V62 L6 72 V62 L43 40 V26 C43 14 45 4 50 4 Z',
  );
});
def('jet', (g, c) => {
  F(
    g,
    c.a,
    'M4 62 L40 54 L64 18 H74 L62 52 L88 46 L96 36 H100 L96 54 L60 66 L74 84 H66 L44 70 L10 76 Z',
  );
});
def('paperplane', (g, c) => {
  F(g, c.a, 'M4 46 L96 6 L62 94 L46 58 Z');
  F(g, c.b, 'M96 6 L46 58 L50 82 L58 64 Z');
});
def('wings', (g, c) => {
  for (const sx of [1, -1]) {
    g.save();
    if (sx < 0) {
      g.translate(100, 0);
      g.scale(-1, 1);
    }
    F(
      g,
      c.a,
      'M50 44 C34 30 16 26 2 30 C12 34 18 40 22 46 C14 46 10 48 6 50 C16 54 24 56 30 58 C26 60 22 62 20 64 C32 66 44 60 50 52 Z',
    );
    g.restore();
  }
  O(g, c.b, 50, 50, 9);
});
def('balloon', (g, c) => {
  const b = 'M50 4 C74 4 88 22 88 40 C88 56 70 70 60 78 H40 C30 70 12 56 12 40 C12 22 26 4 50 4 Z';
  F(g, c.a, b);
  clipTo(g, b, () => {
    F(g, c.b, 'M38 0 H62 L56 80 H44 Z');
  });
  RR(g, c.a, 42, 84, 16, 12, 2);
  S(g, c.a, 2, 'M41 78 L44 84 M59 78 L56 84');
});
def('suitcase', (g, c) => {
  RR(g, c.a, 14, 28, 72, 60, 8);
  S(g, c.a, 6, 'M38 28 V16 H62 V28');
  S(g, c.paper, 3, 'M30 28 V88 M70 28 V88', 'butt');
});
def('globe', (g, c) => {
  OS(g, c.a, 5, 50, 50, 42);
  S(
    g,
    c.a,
    3.5,
    'M8 50 H92 M50 8 V92 M50 8 C28 28 28 72 50 92 M50 8 C72 28 72 72 50 92 M16 28 Q50 40 84 28 M16 72 Q50 60 84 72',
  );
});
def('pin', (g, c) => {
  FE(
    g,
    c.a,
    'M50 96 C30 66 18 52 18 36 A32 32 0 0 1 82 36 C82 52 70 66 50 96 Z M50 24 A12 12 0 1 0 50 48 A12 12 0 1 0 50 24 Z',
  );
});
def('road', (g, c) => {
  F(g, c.a, 'M36 6 H64 L92 96 H8 Z');
  S(g, c.paper, 4, 'M50 12 V24 M50 36 V52 M50 66 V90', 'butt');
});
def('bridge', (g, c) => {
  S(
    g,
    c.a,
    2,
    'M30 20 L4 62 M30 20 L17 62 M30 20 L43 62 M30 20 L50 54 M70 20 L96 62 M70 20 L83 62 M70 20 L57 62 M70 20 L50 54',
  );
  S(g, c.a, 5.5, 'M2 62 H98 M30 16 V86 M70 16 V86', 'butt');
  S(g, c.b, 4, 'M6 94 Q20 88 34 94 T62 94 T94 93');
});
def('arrow', (g, c) => {
  F(g, c.a, 'M8 40 H58 V16 L96 50 L58 84 V60 H8 Z');
});
def('chevrons', (g, c) => {
  F(g, c.a, 'M8 14 H34 L62 50 L34 86 H8 L36 50 Z');
  F(g, c.b, 'M46 14 H72 L98 50 L72 86 H46 L74 50 Z');
});
def('updown', (g, c) => {
  F(g, c.a, 'M28 44 L50 8 L72 44 Z');
  F(g, c.b, 'M28 56 L50 92 L72 56 Z');
});
// ---- vehicles and machines
def('wheel', (g, c) => {
  OS(g, c.a, 13, 50, 50, 38);
  rep(g, 5, 50, 50, () => S(g, c.a, 6, 'M50 50 V22', 'butt'));
  O(g, c.a, 50, 50, 9);
  O(g, c.paper, 50, 50, 3);
});
def('steering', (g, c) => {
  OS(g, c.a, 9, 50, 50, 40);
  S(g, c.a, 9, 'M12 46 H88 M50 52 V88', 'butt');
  O(g, c.a, 50, 50, 12);
});
def('gear', (g, c, o) => {
  const n = o.n || 10;
  let d = '';
  for (let i = 0; i < n * 4; i++) {
    const a = (i / (n * 4)) * TAU - 0.08,
      rr = i % 4 < 2 ? 46 : 36;
    d +=
      (i ? 'L' : 'M') +
      (50 + Math.cos(a) * rr).toFixed(1) +
      ' ' +
      (50 + Math.sin(a) * rr).toFixed(1);
  }
  FE(g, c.a, d + 'Z M50 34 A16 16 0 1 0 50 66 A16 16 0 1 0 50 34 Z');
});
def('wrench', (g, c) => {
  F(g, c.a, 'M41 96 V46 C28 40 22 24 30 10 L42 24 H58 L70 10 C78 24 72 40 59 46 V96 Z');
});
def('hammer', (g, c) => {
  RR(g, c.b, 44, 28, 12, 68, 4);
  F(g, c.a, 'M16 8 H66 C78 8 86 16 88 30 H16 Z');
});
def('tools', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(0.7);
  g.translate(-50, -50);
  F(g, c.a, 'M43 96 V46 C32 40 28 26 34 12 L44 24 H56 L66 12 C72 26 68 40 57 46 V96 Z');
  g.restore();
  g.save();
  g.translate(50, 50);
  g.rotate(-0.7);
  g.translate(-50, -50);
  RR(g, c.b, 45, 26, 10, 70, 4);
  F(g, c.b, 'M22 8 H66 C76 8 82 16 84 28 H22 Z');
  g.restore();
});
def('piston', (g, c) => {
  RR(g, c.a, 26, 6, 48, 36, 5);
  S(g, c.paper, 3, 'M26 16 H74 M26 24 H74', 'butt');
  F(g, c.a, 'M44 42 H56 L60 78 A12 12 0 1 1 40 78 Z');
  O(g, c.paper, 50, 82, 5);
});
def('gauge', (g, c) => {
  OS(g, c.a, 8, 50, 60, 38, Math.PI, TAU);
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    S(
      g,
      c.a,
      3,
      `M${50 + Math.cos(a) * 24} ${60 + Math.sin(a) * 24} L${50 + Math.cos(a) * 30} ${60 + Math.sin(a) * 30}`,
      'butt',
    );
  }
  S(g, c.b, 5, 'M50 60 L72 32');
  O(g, c.a, 50, 60, 7);
});
def('pump', (g, c) => {
  RR(g, c.a, 14, 14, 44, 80, 6);
  RR(g, c.paper, 22, 22, 28, 22, 3);
  S(g, c.a, 6, 'M58 40 H70 V74 A8 8 0 0 0 86 74 V32 L76 20');
});
def('barrel', (g, c) => {
  RR(g, c.a, 20, 8, 60, 84, 8);
  S(g, c.paper, 3, 'M20 30 H80 M20 70 H80', 'butt');
  F(g, c.b, 'M50 38 C52 46 60 50 60 57 A10 10 0 0 1 40 57 C40 50 48 46 50 38 Z');
});
def('truck', (g, c) => {
  RR(g, c.a, 4, 26, 56, 44, 4);
  F(g, c.b, 'M62 40 H80 L94 54 V70 H62 Z');
  O(g, c.ink, 22, 76, 10);
  O(g, c.ink, 76, 76, 10);
  O(g, c.paper, 22, 76, 4);
  O(g, c.paper, 76, 76, 4);
});
def('car', (g, c) => {
  F(
    g,
    c.a,
    'M4 66 C4 54 10 50 20 48 L32 32 C34 29 38 28 42 28 H66 C72 28 76 30 80 34 L90 48 C96 50 98 56 98 66 V72 H4 Z',
  );
  F(g, c.paper, 'M36 34 H50 V48 H26 Z M56 34 H68 C72 34 74 36 76 38 L82 48 H56 Z');
  O(g, c.ink, 26, 72, 11);
  O(g, c.ink, 76, 72, 11);
  O(g, c.paper, 26, 72, 4.5);
  O(g, c.paper, 76, 72, 4.5);
});
def('bike', (g, c) => {
  OS(g, c.a, 5, 22, 68, 18);
  OS(g, c.a, 5, 78, 68, 18);
  S(g, c.b, 5, 'M22 68 L40 34 H66 L78 68 M40 34 L52 68 L66 34 M34 28 H46 M62 28 L72 24');
});
def('scooter', (g, c) => {
  S(g, c.a, 6, 'M70 14 H58 L66 76 M24 76 H66');
  O(g, c.a, 20, 80, 10);
  O(g, c.a, 74, 80, 10);
  O(g, c.paper, 20, 80, 3.5);
  O(g, c.paper, 74, 80, 3.5);
});
def('cranehook', (g, c) => {
  S(g, c.a, 7, 'M50 4 V30', 'butt');
  RR(g, c.a, 40, 28, 20, 14, 3);
  S(g, c.a, 10, 'M50 42 V58 A17 17 0 1 1 20 66');
});
def('hardhat', (g, c) => {
  F(g, c.a, 'M12 66 C12 36 30 20 50 20 C70 20 88 36 88 66 Z');
  RR(g, c.a, 4, 66, 92, 11, 5);
  RR(g, c.b, 44, 13, 12, 53, 3);
});
def('tcone', (g, c) => {
  const t = 'M42 8 H58 L76 82 H24 Z';
  F(g, c.a, t);
  clipTo(g, t, () => {
    RR(g, c.paper, 0, 32, 100, 10);
    RR(g, c.paper, 0, 56, 100, 10);
  });
  RR(g, c.a, 12, 82, 76, 10, 3);
});
def('roller', (g, c) => {
  RR(g, c.a, 12, 10, 64, 24, 7);
  S(g, c.b, 5, 'M76 22 H90 V46 H50 V60');
  RR(g, c.b, 45, 58, 10, 38, 4);
});
def('brush', (g, c) => {
  RR(g, c.b, 40, 4, 20, 44, 6);
  RR(g, c.ink, 36, 46, 28, 10);
  F(g, c.a, 'M36 56 H64 V82 C64 92 56 97 50 97 C44 97 36 92 36 82 Z');
});
def('faucet', (g, c) => {
  S(g, c.a, 10, 'M20 40 H56 A16 16 0 0 1 72 56 V62', 'butt');
  RR(g, c.a, 12, 28, 12, 24, 2);
  RR(g, c.a, 36, 22, 8, 14);
  RR(g, c.a, 26, 15, 28, 8, 4);
  F(g, c.b, 'M72 70 C74 78 80 82 80 88 A8 8 0 0 1 64 88 C64 82 70 78 72 70 Z');
});
def('bulb', (g, c) => {
  F(g, c.a, 'M50 6 C72 6 84 22 84 40 C84 54 74 60 68 70 H32 C26 60 16 54 16 40 C16 22 28 6 50 6 Z');
  RR(g, c.b, 34, 74, 32, 7, 2);
  RR(g, c.b, 37, 84, 26, 7, 3);
  S(g, c.paper, 3, 'M42 68 L46 44 H54 L58 68');
});
def('plug', (g, c) => {
  S(g, c.a, 8, 'M38 34 V10 M62 34 V10', 'butt');
  RR(g, c.a, 24, 32, 52, 36, 10);
  S(g, c.a, 7, 'M50 68 V78 C50 92 70 90 70 98');
});
def('snow', (g, c) => {
  rep(g, 6, 50, 50, () =>
    S(g, c.a, 5, 'M50 50 V6 M50 18 L40 9 M50 18 L60 9 M50 32 L42 25 M50 32 L58 25'),
  );
});
def('fanblade', (g, c) => {
  rep(g, 4, 50, 50, () => F(g, c.a, 'M50 50 C40 36 44 12 62 6 C72 16 66 40 50 50 Z'));
  O(g, c.b, 50, 50, 8);
});
// ---- civic, money, health
def('key', (g, c) => {
  OS(g, c.a, 8, 27, 50, 17);
  S(g, c.a, 8, 'M44 50 H94 M78 50 V66 M90 50 V62', 'butt');
});
def('lock', (g, c) => {
  S(g, c.a, 9, 'M33 46 V32 A17 17 0 0 1 67 32 V46', 'butt');
  RR(g, c.a, 20, 44, 60, 48, 9);
  O(g, c.paper, 50, 62, 6.5);
  RR(g, c.paper, 47, 64, 6, 15, 2);
});
def('shield', (g, c) => {
  F(g, c.a, 'M50 4 L88 16 V46 C88 72 70 88 50 96 C30 88 12 72 12 46 V16 Z');
  F(g, c.b, 'M50 4 L88 16 V46 C88 72 70 88 50 96 Z');
});
def('crown', (g, c) => {
  F(g, c.a, 'M12 76 L8 28 L30 50 L50 16 L70 50 L92 28 L88 76 Z');
  RR(g, c.b, 12, 80, 76, 9, 2);
  O(g, c.a, 8, 25, 5.5);
  O(g, c.a, 50, 12, 5.5);
  O(g, c.a, 92, 25, 5.5);
});
def('tiara', (g, c) => {
  F(g, c.a, 'M8 70 C10 50 20 40 26 54 C30 36 42 24 50 44 C58 24 70 36 74 54 C80 40 90 50 92 70 Z');
  RR(g, c.b, 8, 74, 84, 7, 3);
  O(g, c.b, 50, 26, 5);
});
def('gem', (g, c) => {
  F(g, c.a, 'M26 14 H74 L94 38 L50 92 L6 38 Z');
  S(
    g,
    c.paper,
    2.4,
    'M6 38 H94 M26 14 L38 38 L50 92 L62 38 L74 14 M50 14 L38 38 M50 14 L62 38',
    'butt',
  );
});
def('ringgem', (g, c) => {
  OS(g, c.a, 8, 50, 64, 28);
  F(g, c.b, 'M36 14 H64 L74 26 L50 46 L26 26 Z');
  S(g, c.paper, 1.6, 'M26 26 H74 M42 14 L50 46 L58 14', 'butt');
});
def('bell', (g, c) => {
  O(g, c.a, 50, 9, 5.5);
  F(
    g,
    c.a,
    'M50 10 C70 10 76 30 76 50 C76 66 82 72 90 78 H10 C18 72 24 66 24 50 C24 30 30 10 50 10 Z',
  );
  O(g, c.b, 50, 87, 8);
});
def('book', (g, c) => {
  F(
    g,
    c.a,
    'M50 22 C38 14 22 14 8 18 V82 C22 78 38 78 50 86 C62 78 78 78 92 82 V18 C78 14 62 14 50 22 Z',
  );
  S(g, c.paper, 3, 'M50 22 V86');
});
def('column', (g, c) => {
  F(g, c.a, 'M8 26 L50 6 L92 26 Z');
  RR(g, c.a, 12, 30, 76, 6);
  for (const x of [18, 36, 54, 72]) RR(g, c.a, x, 40, 10, 38);
  RR(g, c.a, 10, 82, 80, 9);
});
def('scales', (g, c) => {
  S(
    g,
    c.a,
    4.5,
    'M50 10 V86 M30 90 H70 M16 24 H84 M16 24 L5 50 M16 24 L27 50 M84 24 L73 50 M84 24 L95 50',
  );
  F(g, c.a, 'M2 50 H30 A14 11 0 0 1 2 50 Z M70 50 H98 A14 11 0 0 1 70 50 Z');
  O(g, c.b, 50, 10, 5);
});
def('coin', (g, c) => {
  O(g, c.a, 50, 50, 45);
  OS(g, c.paper, 3, 50, 50, 37);
  TX(g, c.paper, '$', 50, 53, 54, 'didone');
});
def('card', (g, c) => {
  RR(g, c.a, 5, 20, 90, 60, 9);
  RR(g, c.b, 5, 32, 90, 11);
  RR(g, c.paper, 14, 56, 24, 13, 3);
});
def('cash', (g, c) => {
  RR(g, c.a, 4, 24, 92, 52, 5);
  O(g, c.paper, 50, 50, 15);
  TX(g, c.a, '$', 50, 52, 24, 'groteskBlack');
  O(g, c.paper, 16, 50, 4);
  O(g, c.paper, 84, 50, 4);
});
def('house', (g, c) => {
  F(g, c.a, 'M50 8 L94 46 H82 V90 H18 V46 H6 Z');
  RR(g, c.paper, 42, 60, 16, 30);
});
def('roof', (g, c) => {
  S(g, c.a, 9, 'M8 56 L50 18 L92 56');
  S(g, c.b, 7, 'M22 78 L50 52 L78 78');
});
def('tower', (g, c) => {
  RR(g, c.b, 18, 42, 18, 54);
  RR(g, c.b, 64, 30, 18, 66);
  RR(g, c.a, 36, 12, 28, 84);
  S(g, c.a, 3, 'M50 12 V2', 'butt');
  for (let y = 20; y < 90; y += 12) {
    RR(g, c.paper, 41, y, 7, 6);
    RR(g, c.paper, 52, y, 7, 6);
  }
});
def('skyline', (g, c) => {
  F(
    g,
    c.a,
    'M4 92 V60 H16 V40 H28 V70 H34 V20 L42 10 L50 20 V56 H58 V34 H72 V64 H80 V48 H92 V92 Z',
  );
});
def('door', (g, c) => {
  RR(g, c.a, 24, 6, 52, 90, 3);
  RR(g, c.paper, 31, 14, 38, 30, 2);
  O(g, c.b, 66, 58, 4.5);
});
def('archwin', (g, c) => {
  F(g, c.a, 'M18 94 V40 A32 32 0 0 1 82 40 V94 Z');
  S(g, c.paper, 3.5, 'M50 8 V94 M18 54 H82 M26 22 L50 54 L74 22', 'butt');
});
def('brick', (g, c) => {
  for (const [x, y, w] of [
    [6, 14, 40],
    [52, 14, 42],
    [6, 40, 20],
    [32, 40, 36],
    [74, 40, 20],
    [6, 66, 40],
    [52, 66, 42],
  ])
    RR(g, c.a, x, y, w, 20, 2);
});
def('plus', (g, c) => {
  F(g, c.a, 'M36 8 H64 V36 H92 V64 H64 V92 H36 V64 H8 V36 H36 Z');
});
def('pill', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.7);
  RR(g, c.a, -42, -18, 84, 36, 18);
  g.beginPath();
  g.rect(0, -20, 44, 40);
  g.clip();
  RR(g, c.b, -42, -18, 84, 36, 18);
  g.restore();
});
def('heart', (g, c) => {
  F(g, c.a, 'M50 90 C10 62 4 36 18 20 C32 6 46 14 50 26 C54 14 68 6 82 20 C96 36 90 62 50 90 Z');
});
def('pulse', (g, c) => {
  F(g, c.a, 'M50 90 C10 62 4 36 18 20 C32 6 46 14 50 26 C54 14 68 6 82 20 C96 36 90 62 50 90 Z');
  S(g, c.paper, 4, 'M14 50 H36 L42 34 L52 66 L58 50 H86');
});
def('tooth', (g, c) => {
  F(
    g,
    c.a,
    'M22 14 C34 6 42 14 50 14 C58 14 66 6 78 14 C92 24 84 50 78 64 C74 78 72 92 66 92 C58 92 60 66 50 66 C40 66 42 92 34 92 C28 92 26 78 22 64 C16 50 8 24 22 14 Z',
  );
});
def('eye', (g, c) => {
  F(g, c.a, 'M4 50 C22 22 78 22 96 50 C78 78 22 78 4 50 Z');
  O(g, c.paper, 50, 50, 17);
  O(g, c.b, 50, 50, 10);
});
def('cross', (g, c) => {
  F(g, c.a, 'M42 4 H58 V30 H84 V46 H58 V96 H42 V46 H16 V30 H42 Z');
});
def('hexagram', (g, c) => {
  S(g, c.a, 7, 'M50 8 L86 70 H14 Z M50 92 L14 30 H86 Z');
});
def('gradcap', (g, c) => {
  F(g, c.a, 'M50 18 L98 40 L50 62 L2 40 Z M24 54 V72 C36 84 64 84 76 72 V54 L50 66 Z');
  S(g, c.b, 3.5, 'M90 44 V68');
  O(g, c.b, 90, 72, 4);
});
def('torch', (g, c) => {
  F(g, c.c, 'M50 2 C62 14 66 24 60 34 C56 38 44 38 40 34 C34 24 42 16 50 2 Z');
  RR(g, c.b, 34, 38, 32, 8, 2);
  F(g, c.a, 'M40 46 H60 L54 96 H46 Z');
});
def('candle', (g, c) => {
  F(g, c.b, 'M50 4 C60 16 62 24 58 30 C54 34 46 34 42 30 C38 24 44 16 50 4 Z');
  S(g, c.ink, 2, 'M50 30 V38');
  RR(g, c.a, 36, 38, 28, 58, 3);
});
def('trophy', (g, c) => {
  F(g, c.a, 'M28 8 H72 V30 C72 48 62 58 50 58 C38 58 28 48 28 30 Z');
  S(g, c.a, 5, 'M28 16 H14 C14 34 20 40 30 40 M72 16 H86 C86 34 80 40 70 40');
  RR(g, c.a, 45, 58, 10, 20);
  RR(g, c.b, 30, 78, 40, 11, 2);
});
def('badge', (g, c) => {
  rep(g, 7, 50, 50, () => {
    F(g, c.a, 'M50 50 L38 22 L50 6 L62 22 Z');
    O(g, c.a, 50, 5, 3.5);
  });
  O(g, c.a, 50, 50, 26);
  OS(g, c.paper, 2.5, 50, 50, 19);
});
// ---- tech and media
def('phone', (g, c) => {
  RR(g, c.a, 28, 4, 44, 92, 10);
  RR(g, c.paper, 33, 13, 34, 68, 3);
  O(g, c.paper, 50, 88, 3);
});
def('signal', (g, c) => {
  for (const r of [20, 36, 52]) OS(g, c.a, 8, 50, 82, r, Math.PI * 1.25, Math.PI * 1.75);
  O(g, c.a, 50, 82, 7);
});
def('cellbars', (g, c) => {
  [
    [10, 70, 22],
    [32, 52, 40],
    [54, 32, 60],
    [76, 10, 82],
  ].forEach(([x, y, h], i) => RR(g, i === 3 ? c.b : c.a, x, y, 16, h, 3));
});
def('antenna', (g, c) => {
  S(g, c.a, 5, 'M50 34 L30 96 M50 34 L70 96 M38 72 H62 M44 54 H56', 'butt');
  O(g, c.a, 50, 30, 7);
  for (const r of [16, 28]) {
    OS(g, c.b, 5, 50, 30, r, -0.9, 0.9);
    OS(g, c.b, 5, 50, 30, r, Math.PI - 0.9, Math.PI + 0.9);
  }
});
def('play', (g, c) => {
  F(g, c.a, 'M26 8 L90 50 L26 92 Z');
});
def('pixels', (g, c) => {
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [3, 1],
    [1, 2],
    [2, 2],
    [3, 2],
    [0, 3],
    [2, 3],
  ].forEach(([x, y], i) => RR(g, i % 3 === 0 ? c.b : c.a, 8 + x * 22, 8 + y * 22, 19, 19, 2));
});
def('chip', (g, c) => {
  S(
    g,
    c.a,
    4,
    'M36 10 V24 M50 10 V24 M64 10 V24 M36 76 V90 M50 76 V90 M64 76 V90 M10 36 H24 M10 50 H24 M10 64 H24 M76 36 H90 M76 50 H90 M76 64 H90',
    'butt',
  );
  RR(g, c.a, 22, 22, 56, 56, 7);
  RR(g, c.paper, 36, 36, 28, 28, 3);
});
def('orbit', (g, c) => {
  for (const r of [0, 1.05, -1.05]) {
    g.save();
    g.translate(50, 50);
    g.rotate(r);
    g.strokeStyle = c.a;
    g.lineWidth = 4.5;
    g.beginPath();
    g.ellipse(0, 0, 44, 17, 0, 0, TAU);
    g.stroke();
    g.restore();
  }
  O(g, c.b, 50, 50, 8);
});
def('lens', (g, c) => {
  O(g, c.a, 50, 50, 45);
  OS(g, c.paper, 3, 50, 50, 34);
  O(g, c.b, 50, 50, 20);
  O(g, c.paper, 42, 42, 5);
});
def('aperture', (g, c) => {
  clipTo(g, 'M50 5 A45 45 0 1 0 50 95 A45 45 0 1 0 50 5 Z', () =>
    rep(g, 6, 50, 50, (i) => F(g, i % 2 ? c.b : c.a, 'M50 34 L4 34 L27 -6 L78 -6 Z')),
  );
  O(g, c.paper, 50, 50, 13);
});
def('note', (g, c) => {
  EL(g, c.a, 27, 78, 14, 10.5, -0.35);
  EL(g, c.a, 73, 68, 14, 10.5, -0.35);
  F(g, c.a, 'M35 20 L87 8 V68 H81 V24 L41 33 V78 H35 Z');
});
def('mic', (g, c) => {
  RR(g, c.a, 36, 6, 28, 50, 14);
  S(g, c.a, 5.5, 'M22 44 A28 28 0 0 0 78 44 M50 72 V92 M34 92 H66');
});
def('vinyl', (g, c) => {
  O(g, c.a, 50, 50, 46);
  for (const r of [38, 32, 26]) OS(g, c.paper, 1.3, 50, 50, r);
  O(g, c.b, 50, 50, 15);
  O(g, c.paper, 50, 50, 3);
});
def('headphones', (g, c) => {
  S(g, c.a, 7, 'M15 62 V50 A35 35 0 0 1 85 50 V62');
  RR(g, c.a, 8, 56, 19, 36, 8);
  RR(g, c.a, 73, 56, 19, 36, 8);
});
def('speaker', (g, c) => {
  RR(g, c.a, 22, 4, 56, 92, 8);
  O(g, c.paper, 50, 28, 10);
  O(g, c.paper, 50, 66, 19);
  O(g, c.b, 50, 66, 9);
});
def('tv', (g, c) => {
  S(g, c.a, 4, 'M36 6 L50 22 L66 4');
  RR(g, c.a, 8, 22, 84, 60, 10);
  RR(g, c.paper, 16, 30, 54, 44, 6);
  O(g, c.b, 80, 40, 4);
  O(g, c.b, 80, 56, 4);
  S(g, c.a, 5, 'M26 90 H74');
});
def('bars', (g, c) => {
  [
    [10, 44],
    [28, 14],
    [46, 30],
    [64, 6],
    [82, 38],
  ].forEach(([x, y], i) => RR(g, i % 2 ? c.b : c.a, x, y, 12, 92 - y, 4));
});
def('camera', (g, c) => {
  F(g, c.a, 'M8 30 H30 L36 18 H64 L70 30 H92 V82 H8 Z');
  O(g, c.paper, 50, 56, 18);
  O(g, c.b, 50, 56, 10);
});
def('film', (g, c) => {
  O(g, c.a, 50, 50, 45);
  rep(g, 5, 50, 50, () => O(g, c.paper, 50, 24, 9.5));
  O(g, c.paper, 50, 50, 5.5);
});
def('gamepad', (g, c) => {
  F(
    g,
    c.a,
    'M26 30 H74 C90 30 96 48 96 62 C96 76 86 80 80 72 L72 62 H28 L20 72 C14 80 4 76 4 62 C4 48 10 30 26 30 Z',
  );
  S(g, c.paper, 4.5, 'M22 46 H38 M30 38 V54', 'butt');
  O(g, c.b, 68, 42, 4.5);
  O(g, c.b, 78, 52, 4.5);
});
def('chat', (g, c) => {
  F(
    g,
    c.a,
    'M10 12 H90 A6 6 0 0 1 96 18 V66 A6 6 0 0 1 90 72 H46 L24 92 V72 H10 A6 6 0 0 1 4 66 V18 A6 6 0 0 1 10 12 Z',
  );
  O(g, c.paper, 30, 42, 5);
  O(g, c.paper, 50, 42, 5);
  O(g, c.paper, 70, 42, 5);
});
def('envelope', (g, c) => {
  RR(g, c.a, 6, 20, 88, 60, 5);
  S(g, c.paper, 4, 'M8 24 L50 56 L92 24');
});
// ---- games and nightlife
def('dice', (g, c) => {
  RR(g, c.a, 10, 10, 80, 80, 15);
  for (const [x, y] of [
    [30, 30],
    [70, 30],
    [50, 50],
    [30, 70],
    [70, 70],
  ])
    O(g, c.paper, x, y, 7);
});
def('domino', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(0.3);
  g.translate(-50, -50);
  RR(g, c.a, 28, 4, 44, 92, 8);
  S(g, c.paper, 2.5, 'M33 50 H67', 'butt');
  for (const [x, y] of [
    [40, 16],
    [50, 27],
    [60, 38],
    [40, 62],
    [60, 62],
    [50, 73],
    [40, 84],
    [60, 84],
  ])
    O(g, c.paper, x, y, 4.2);
  g.restore();
});
def('spade', (g, c) => {
  F(
    g,
    c.a,
    'M50 6 C70 30 92 42 92 60 C92 78 68 82 56 68 C58 80 62 88 68 94 H32 C38 88 42 80 44 68 C32 82 8 78 8 60 C8 42 30 30 50 6 Z',
  );
});
def('martini', (g, c) => {
  F(g, c.a, 'M8 12 H92 L54 56 V86 H72 V93 H28 V86 H46 V56 Z');
  O(g, c.b, 62, 26, 7.5);
  S(g, c.b, 3, 'M62 26 L82 2');
});
def('tiki', (g, c) => {
  RR(g, c.a, 26, 4, 48, 92, 10);
  F(g, c.paper, 'M32 24 L46 30 L32 36 Z M68 24 L54 30 L68 36 Z');
  RR(g, c.paper, 45, 38, 10, 18, 3);
  RR(g, c.paper, 34, 64, 32, 16, 3);
  S(g, c.a, 3, 'M42 64 V80 M50 64 V80 M58 64 V80', 'butt');
  S(g, c.b, 3.5, 'M30 14 H70 M30 88 H70', 'butt');
});
def('maraca', (g, c) => {
  for (const [x, r] of [
    [34, -0.4],
    [66, 0.4],
  ]) {
    g.save();
    g.translate(x, 58);
    g.rotate(r);
    RR(g, c.b, -4, 0, 8, 38, 4);
    EL(g, c.a, 0, -20, 19, 25);
    S(g, c.paper, 3, 'M-18 -22 H18 M-16 -12 H16', 'butt');
    g.restore();
  }
});
def('conga', (g, c) => {
  F(g, c.a, 'M26 14 H74 C82 40 78 70 68 92 H32 C22 70 18 40 26 14 Z');
  EL(g, c.b, 50, 14, 24, 7);
  S(g, c.paper, 3, 'M22 40 H78 M24 68 H76', 'butt');
});
def('guitar', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(0.6);
  g.translate(-50, -50);
  RR(g, c.b, 45, 2, 10, 50, 2);
  F(g, c.a, 'M50 44 C64 44 66 56 60 62 C72 68 74 96 50 96 C26 96 28 68 40 62 C34 56 36 44 50 44 Z');
  O(g, c.paper, 50, 70, 7);
  g.restore();
});
def('disco', (g, c) => {
  S(g, c.a, 2.5, 'M50 2 V14');
  O(g, c.a, 50, 54, 40);
  S(
    g,
    c.paper,
    2,
    'M10 54 H90 M14 36 H86 M14 72 H86 M50 14 V94 M30 19 C22 40 22 68 30 89 M70 19 C78 40 78 68 70 89',
    'butt',
  );
  F(g, c.b, 'M84 10 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z');
});
def('ticket', (g, c) => {
  FE(g, c.a, 'M4 26 H96 V40 A10 10 0 0 0 96 60 V74 H4 V60 A10 10 0 0 0 4 40 Z');
  S(g, c.paper, 2.5, 'M68 30 V70', 'butt');
  F(g, c.paper, 'M38 36 l4 9 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1 Z');
});
def('mask', (g, c) => {
  F(
    g,
    c.a,
    'M4 30 C20 22 38 24 50 34 C62 24 80 22 96 30 C98 54 86 72 70 72 C60 72 54 62 50 56 C46 62 40 72 30 72 C14 72 2 54 4 30 Z',
  );
  F(
    g,
    c.paper,
    'M18 40 C26 36 36 38 42 46 C34 52 24 52 18 40 Z M82 40 C74 36 64 38 58 46 C66 52 76 52 82 40 Z',
  );
});
def('lips', (g, c) => {
  F(
    g,
    c.a,
    'M4 48 C18 30 34 22 42 28 C46 31 50 34 50 34 C50 34 54 31 58 28 C66 22 82 30 96 48 C80 72 60 80 50 80 C40 80 20 72 4 48 Z',
  );
  S(g, c.paper, 3, 'M10 48 C30 44 40 50 50 50 C60 50 70 44 90 48');
});
// ---- sports and beach
def('dumbbell', (g, c) => {
  RR(g, c.a, 4, 30, 14, 40, 4);
  RR(g, c.a, 18, 20, 13, 60, 4);
  RR(g, c.a, 69, 20, 13, 60, 4);
  RR(g, c.a, 82, 30, 14, 40, 4);
  RR(g, c.b, 31, 44, 38, 12);
});
def('glove', (g, c) => {
  F(
    g,
    c.a,
    'M30 86 V58 C16 54 12 36 22 24 C30 12 52 8 66 16 C82 22 86 40 80 54 C78 60 74 62 70 62 V86 Z',
  );
  F(g, c.b, 'M24 54 C10 52 8 34 19 30 C25 35 29 43 31 53 Z');
  RR(g, c.b, 28, 84, 44, 12, 3);
});
def('surfboard', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(0.5);
  g.translate(-50, -50);
  const b = 'M50 0 C68 20 70 72 50 100 C30 72 32 20 50 0 Z';
  F(g, c.a, b);
  clipTo(g, b, () => {
    RR(g, c.b, 20, 40, 60, 10);
    RR(g, c.c, 20, 54, 60, 5);
  });
  S(g, c.paper, 2, 'M50 4 V96');
  g.restore();
});
def('snorkel', (g, c) => {
  S(g, c.b, 7, 'M78 46 H90 V6');
  RR(g, c.a, 8, 26, 66, 42, 17);
  RR(g, c.paper, 17, 35, 48, 24, 10);
});
def('fins', (g, c) => {
  for (const [x, r] of [
    [34, -0.25],
    [66, 0.25],
  ]) {
    g.save();
    g.translate(x, 50);
    g.rotate(r);
    F(g, c.a, 'M-8 -44 H8 L16 30 C16 42 -16 42 -16 30 Z');
    S(g, c.paper, 2, 'M-5 -10 L-8 34 M5 -10 L8 34 M0 -10 V36');
    g.restore();
  }
});
def('hook', (g, c) => {
  OS(g, c.a, 4, 56, 10, 5.5);
  S(g, c.a, 8, 'M56 16 V60 A20 20 0 1 1 16 60');
  F(g, c.a, 'M16 62 L6 44 L28 52 Z');
});
def('lure', (g, c) => {
  F(g, c.a, 'M10 40 C30 22 60 22 78 36 L92 30 L88 44 L92 58 L78 52 C60 64 30 62 10 40 Z');
  O(g, c.paper, 30, 38, 4);
  S(g, c.b, 4, 'M54 56 V72 A9 9 0 1 1 36 72');
  OS(g, c.b, 3, 6, 40, 4);
});
def('rod', (g, c) => {
  S(g, c.a, 4, 'M10 92 C40 70 70 34 92 6');
  S(g, c.b, 2, 'M92 6 C96 30 88 50 78 62');
  F(g, c.b, 'M78 62 C76 70 82 74 84 68 Z');
  O(g, c.a, 26, 78, 7);
  S(g, c.a, 6, 'M6 96 L18 86');
});
def('tent', (g, c) => {
  F(g, c.a, 'M50 12 L94 88 H6 Z');
  F(g, c.paper, 'M50 46 L66 88 H34 Z');
});
def('umbrella', (g, c) => {
  const d = 'M4 52 A46 46 0 0 1 96 52 Z';
  F(g, c.a, d);
  clipTo(g, d, () => {
    F(g, c.b, 'M50 4 L26 54 H4 V20 Z M50 4 L74 54 H50 Z');
  });
  S(g, c.ink, 4, 'M50 4 V96');
});
def('flipflop', (g, c) => {
  F(g, c.a, 'M50 4 C70 4 78 28 72 52 C68 70 72 96 50 96 C28 96 32 70 28 52 C22 28 30 4 50 4 Z');
  S(g, c.b, 6, 'M50 26 L31 54 M50 26 L69 54');
  O(g, c.b, 50, 25, 4.5);
});
def('shades', (g, c) => {
  F(
    g,
    c.a,
    'M4 34 H45 C45 56 37 67 25 67 C12 67 4 56 4 34 Z M55 34 H96 C96 56 88 67 75 67 C63 67 55 56 55 34 Z',
  );
  S(g, c.a, 5, 'M44 40 Q50 33 56 40');
  S(g, c.paper, 3, 'M12 42 L22 56 M63 42 L73 56');
});
def('ball', (g, c) => {
  O(g, c.a, 50, 50, 45);
  S(
    g,
    c.paper,
    3,
    'M5 50 H95 M50 5 V95 M18 19 C36 36 36 64 18 81 M82 19 C64 36 64 64 82 81',
    'butt',
  );
});
def('baseball', (g, c) => {
  O(g, c.a, 50, 50, 45);
  S(g, c.b, 3, 'M22 14 C36 36 36 64 22 86 M78 14 C64 36 64 64 78 86');
  S(
    g,
    c.b,
    2,
    'M26 26 l8 -3 M30 40 l8 -1 M30 60 l8 1 M26 74 l8 3 M74 26 l-8 -3 M70 40 l-8 -1 M70 60 l-8 1 M74 74 l-8 3',
  );
});
def('football', (g, c) => {
  F(g, c.a, 'M4 50 C20 20 80 20 96 50 C80 80 20 80 4 50 Z');
  S(g, c.paper, 3, 'M30 50 H70 M38 43 V57 M46 43 V57 M54 43 V57 M62 43 V57', 'butt');
});
def('soccer', (g, c) => {
  O(g, c.a, 50, 50, 45);
  F(g, c.paper, 'M50 32 L67 44 L60 64 H40 L33 44 Z');
  S(g, c.paper, 3, 'M50 32 V8 M67 44 L90 36 M60 64 L74 86 M40 64 L26 86 M33 44 L10 36', 'butt');
});
def('puck', (g, c) => {
  S(g, c.a, 7, 'M22 8 L50 70 H78', 'butt');
  S(g, c.b, 7, 'M78 8 L50 70 H22', 'butt');
  EL(g, c.a, 50, 88, 14, 6);
});
def('golf', (g, c) => {
  S(g, c.a, 4, 'M40 6 V88');
  F(g, c.b, 'M40 6 L78 20 L40 34 Z');
  EL(g, c.a, 46, 90, 30, 6);
  O(g, c.a, 70, 80, 6);
});
def('bowling', (g, c) => {
  F(
    g,
    c.a,
    'M40 4 C50 4 52 14 50 22 C48 30 58 44 58 62 C58 78 52 94 40 94 C28 94 22 78 22 62 C22 44 32 30 30 22 C28 14 30 4 40 4 Z',
  );
  S(g, c.b, 3, 'M30 24 H50', 'butt');
  O(g, c.b, 76, 74, 20);
  O(g, c.paper, 70, 68, 2.6);
  O(g, c.paper, 78, 66, 2.6);
  O(g, c.paper, 76, 75, 2.6);
});
def('racket', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(0.6);
  g.translate(-50, -50);
  g.strokeStyle = c.a;
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(50, 34, 24, 30, 0, 0, TAU);
  g.stroke();
  S(g, c.a, 1.6, 'M38 10 V58 M50 6 V62 M62 10 V58 M28 24 H72 M27 36 H73 M30 48 H70', 'butt');
  RR(g, c.b, 46, 64, 8, 34, 3);
  g.restore();
});
// ---- food and drink
def('cup', (g, c) => {
  S(g, c.b, 3.5, 'M34 34 C28 26 40 20 34 10 M48 34 C42 26 54 20 48 10 M62 34 C56 26 68 20 62 10');
  F(g, c.a, 'M18 44 H74 C74 66 64 80 46 80 C28 80 18 66 18 44 Z');
  S(g, c.a, 6, 'M74 50 C90 48 90 68 70 68');
  EL(g, c.a, 46, 90, 34, 5);
});
def('togo', (g, c) => {
  F(g, c.a, 'M24 28 H76 L70 96 H30 Z');
  RR(g, c.a, 19, 17, 62, 11, 3);
  RR(g, c.a, 28, 8, 44, 9, 3);
  F(g, c.b, 'M26.5 46 H73.5 L71 74 H29 Z');
});
def('soda', (g, c) => {
  S(g, c.b, 5, 'M56 20 L66 3 H82');
  F(g, c.a, 'M22 28 H78 L72 96 H28 Z');
  RR(g, c.a, 18, 20, 64, 9, 3);
  S(g, c.paper, 3, 'M27 50 H73 M29 68 H71', 'butt');
});
def('can', (g, c) => {
  RR(g, c.a, 26, 8, 48, 86, 9);
  RR(g, c.b, 26, 38, 48, 26);
  S(g, c.paper, 2, 'M26 20 H74 M26 82 H74', 'butt');
});
def('bottle', (g, c) => {
  F(
    g,
    c.a,
    'M42 4 H58 V26 C58 36 68 40 68 52 V92 A4 4 0 0 1 64 96 H36 A4 4 0 0 1 32 92 V52 C32 40 42 36 42 26 Z',
  );
  RR(g, c.paper, 32, 56, 36, 22);
  RR(g, c.b, 41, 4, 18, 7);
});
def('winebottle', (g, c) => {
  F(g, c.a, 'M43 2 H57 V30 C57 40 68 42 68 56 V94 H32 V56 C32 42 43 40 43 30 Z');
  RR(g, c.paper, 34, 58, 32, 24, 2);
  RR(g, c.b, 42, 2, 16, 12);
});
def('mug', (g, c) => {
  S(g, c.a, 8, 'M66 42 H78 A8 8 0 0 1 86 50 V66 A8 8 0 0 1 78 74 H66');
  RR(g, c.a, 18, 26, 48, 68, 6);
  F(
    g,
    c.b,
    'M14 32 A10 10 0 0 1 26 17 A12 12 0 0 1 48 13 A12 12 0 0 1 68 21 A9 9 0 0 1 70 35 H14 Z',
  );
  S(g, c.paper, 3.5, 'M32 48 V82 M50 48 V82');
});
def('wineglass', (g, c) => {
  F(g, c.a, 'M24 6 H76 C78 34 68 50 54 54 V86 H70 V93 H30 V86 H46 V54 C32 50 22 34 24 6 Z');
  F(g, c.b, 'M28 24 H72 C71 38 63 46 50 48 C37 46 29 38 28 24 Z');
});
def('flute', (g, c) => {
  F(g, c.a, 'M36 4 H64 C66 34 60 52 53 58 V88 H66 V94 H34 V88 H47 V58 C40 52 34 34 36 4 Z');
  O(g, c.paper, 46, 30, 2);
  O(g, c.paper, 54, 22, 2);
  O(g, c.paper, 50, 40, 1.6);
});
def('cocktail', (g, c) => {
  F(
    g,
    c.a,
    'M22 20 H78 L70 60 C68 72 58 76 54 76 V88 H68 V94 H32 V88 H46 V76 C42 76 32 72 30 60 Z',
  );
  F(g, c.b, 'M27 34 H73 L69 58 C67 68 58 70 50 70 C42 70 33 68 31 58 Z');
  O(g, c.c, 78, 18, 10);
  S(g, c.a, 3, 'M40 4 L50 60');
});
def('shot', (g, c) => {
  F(g, c.a, 'M24 14 H76 L68 90 H32 Z');
  F(g, c.b, 'M29 38 H71 L66.5 82 H33.5 Z');
});
def('cutlery', (g, c) => {
  S(g, c.a, 5, 'M30 8 V94 M19 8 V30 A11 11 0 0 0 41 30 V8');
  F(g, c.a, 'M62 6 C78 14 80 42 72 56 H68 V96 H62 Z');
});
def('chopsticks', (g, c) => {
  F(g, c.a, 'M6 50 H94 C94 78 74 92 50 92 C26 92 6 78 6 50 Z');
  S(g, c.b, 4, 'M54 46 L88 6 M64 46 L96 14');
  S(g, c.a, 4, 'M22 40 Q30 30 38 40 T54 40');
});
def('chefhat', (g, c) => {
  F(
    g,
    c.a,
    'M26 60 A20 20 0 0 1 22 22 A22 22 0 0 1 50 10 A22 22 0 0 1 78 22 A20 20 0 0 1 74 60 V84 H26 Z',
  );
  S(g, c.paper, 3, 'M26 70 H74', 'butt');
  RR(g, c.a, 26, 84, 48, 9);
});
def('cloche', (g, c) => {
  O(g, c.a, 50, 20, 6);
  F(g, c.a, 'M10 70 A40 40 0 0 1 90 70 Z');
  RR(g, c.b, 4, 74, 92, 8, 4);
  S(g, c.paper, 3.5, 'M24 60 A28 28 0 0 1 40 38');
});
def('burger', (g, c) => {
  F(g, c.a, 'M10 44 C10 14 90 14 90 44 Z');
  for (const [x, y] of [
    [34, 28],
    [50, 24],
    [66, 28],
    [42, 36],
    [58, 36],
  ])
    EL(g, c.paper, x, y, 3.4, 1.8, 0.4);
  S(g, c.b, 7, 'M8 53 Q18 45 28 53 T48 53 T68 53 T92 51');
  RR(g, c.c, 10, 60, 80, 12, 6);
  F(g, c.a, 'M12 76 H88 C88 88 80 91 74 91 H26 C20 91 12 88 12 76 Z');
});
def('hotdog', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.3);
  RR(g, c.a, -42, -6, 84, 30, 15);
  RR(g, c.c, -48, -16, 96, 20, 10);
  S(g, c.b, 4.5, 'M-38 -6 Q-30 -14 -22 -6 T-6 -6 T10 -6 T26 -6 T40 -8');
  g.restore();
});
def('pizza', (g, c) => {
  F(g, c.a, 'M50 96 L10 18 C34 4 66 4 90 18 Z');
  S(g, c.b, 10, 'M12 17 C34 4 66 4 88 17');
  O(g, c.c, 40, 36, 8);
  O(g, c.c, 61, 44, 8);
  O(g, c.c, 49, 64, 7);
});
def('taco', (g, c) => {
  for (const [x, y, r] of [
    [26, 38, 10],
    [40, 27, 11],
    [56, 23, 11],
    [70, 29, 10],
    [80, 41, 8],
  ])
    O(g, c.b, x, y, r);
  O(g, c.c, 48, 24, 6.5);
  O(g, c.c, 66, 30, 5);
  F(g, c.a, 'M6 76 A44 44 0 0 1 94 76 Z');
  S(g, c.paper, 2, 'M30 60 l3 3 M46 52 l3 3 M62 56 l3 3 M54 66 l3 3 M38 68 l3 3 M72 66 l3 3');
});
def('donut', (g, c) => {
  FE(
    g,
    c.a,
    'M50 5 A45 45 0 1 0 50 95 A45 45 0 1 0 50 5 Z M50 36 A14 14 0 1 0 50 64 A14 14 0 1 0 50 36 Z',
  );
  FE(
    g,
    c.b,
    'M50 12 C62 10 74 16 80 26 C90 36 90 50 86 60 C84 72 74 84 62 86 C50 92 36 88 26 80 C14 72 10 58 14 46 C14 32 22 20 34 16 C40 12 44 12 50 12 Z M50 34 A16 16 0 1 0 50 66 A16 16 0 1 0 50 34 Z',
  );
  S(
    g,
    c.c,
    3,
    'M30 30 l5 4 M62 22 l6 -2 M76 44 l2 6 M68 70 l5 -4 M36 74 l6 2 M22 54 l2 -6 M48 20 l-5 3',
  );
});
def('drumstick', (g, c) => {
  S(g, c.b, 9, 'M58 58 L78 80');
  O(g, c.b, 76, 87, 7.5);
  O(g, c.b, 87, 78, 7.5);
  EL(g, c.a, 44, 36, 31, 26, -0.6);
  S(g, c.paper, 3, 'M26 28 A20 16 -0.6 0 1 44 16');
});
def('wing', (g, c) => {
  F(
    g,
    c.a,
    'M8 40 C16 22 40 18 54 30 C66 22 86 28 92 44 C94 54 84 60 76 56 C66 70 44 78 30 70 C14 66 4 54 8 40 Z',
  );
  S(g, c.paper, 3, 'M54 30 C50 40 50 50 54 58');
});
def('cone', (g, c) => {
  const w = 'M28 46 H72 L50 98 Z';
  F(g, c.b, w);
  clipTo(g, w, () => {
    for (let i = -2; i < 8; i++) {
      S(g, c.paper, 1.8, `M${i * 12} 44 L${i * 12 + 34} 100`, 'butt');
      S(g, c.paper, 1.8, `M${i * 12 + 34} 44 L${i * 12} 100`, 'butt');
    }
  });
  F(
    g,
    c.a,
    'M24 46 C16 30 30 10 50 10 C70 10 84 30 76 46 C70 54 62 44 56 50 C52 54 46 44 40 50 C34 54 28 52 24 46 Z',
  );
  O(g, c.c, 50, 8, 6);
});
def('softserve', (g, c) => {
  F(g, c.b, 'M32 60 H68 L60 96 H40 Z');
  F(
    g,
    c.a,
    'M24 60 C22 52 30 48 34 48 C28 42 36 34 42 36 C38 28 46 20 52 22 C50 14 54 8 58 4 C62 14 62 20 58 24 C66 24 70 32 64 38 C72 38 76 46 68 50 C76 50 80 58 76 60 Z',
  );
});
def('popsicle', (g, c) => {
  RR(g, c.b, 45, 62, 10, 34, 4);
  RR(g, c.a, 27, 4, 46, 64, 21);
  S(g, c.paper, 3.5, 'M41 18 V52 M59 18 V52');
});
def('croissant', (g, c) => {
  F(
    g,
    c.a,
    'M8 62 C10 34 34 14 50 14 C66 14 90 34 92 62 C84 54 76 52 70 56 C66 44 58 38 50 38 C42 38 34 44 30 56 C24 52 16 54 8 62 Z',
  );
  S(g, c.paper, 2.5, 'M34 21 L40 43 M50 15 V38 M66 21 L60 43 M20 37 L30 54 M80 37 L70 54', 'butt');
});
def('loaf', (g, c) => {
  F(g, c.a, 'M4 60 C2 40 16 30 50 30 C84 30 98 40 96 60 C94 72 84 76 50 76 C16 76 6 72 4 60 Z');
  S(g, c.paper, 3.5, 'M26 38 L34 52 M44 34 L52 49 M62 34 L70 49 M78 38 L84 50');
});
def('pastelito', (g, c) => {
  F(g, c.a, 'M50 8 L94 78 H6 Z');
  S(g, c.paper, 2.5, 'M50 26 L72 66 M50 26 L28 66 M40 46 H60', 'butt');
  S(g, c.b, 5, 'M10 86 H90');
});
def('cupcake', (g, c) => {
  F(g, c.b, 'M24 54 H76 L68 95 H32 Z');
  S(g, c.paper, 2, 'M36 58 L40 92 M50 58 V93 M64 58 L60 92', 'butt');
  F(g, c.a, 'M18 54 C14 40 26 34 32 34 C30 20 46 12 56 20 C68 14 80 26 74 36 C86 38 86 52 82 54 Z');
  O(g, c.c, 56, 12, 6.5);
});
def('cake', (g, c) => {
  RR(g, c.a, 12, 54, 76, 36, 4);
  RR(g, c.b, 24, 28, 52, 28, 4);
  S(g, c.paper, 3.5, 'M12 68 q9.5 8 19 0 t19 0 t19 0 t19 0');
  S(g, c.c, 3, 'M38 28 V14 M50 28 V14 M62 28 V14', 'butt');
  O(g, c.c, 38, 10, 3);
  O(g, c.c, 50, 10, 3);
  O(g, c.c, 62, 10, 3);
});
def('pie', (g, c) => {
  F(g, c.b, 'M4 58 H96 L86 84 H14 Z');
  F(g, c.a, 'M8 58 C8 34 92 34 92 58 Z');
  S(g, c.paper, 3, 'M30 46 l6 6 M50 40 v8 M70 46 l-6 6');
  S(g, c.a, 4, 'M4 58 q5.75 -7 11.5 0 t11.5 0 t11.5 0 t11.5 0 t11.5 0 t11.5 0 t11.5 0 t11.5 0');
});
def('bowl', (g, c) => {
  S(g, c.b, 3.5, 'M36 34 C30 26 42 20 36 10 M52 34 C46 26 58 20 52 10 M68 34 C62 26 74 20 68 10');
  F(g, c.a, 'M6 46 H94 C94 74 74 88 50 88 C26 88 6 74 6 46 Z');
  RR(g, c.a, 34, 88, 32, 7, 2);
});
def('nigiri', (g, c) => {
  F(g, c.a, 'M12 58 C12 48 88 48 88 58 V76 C88 84 12 84 12 76 Z');
  F(g, c.b, 'M4 52 C20 26 80 26 96 52 C80 62 20 62 4 52 Z');
  S(g, c.paper, 2.6, 'M28 38 L36 57 M46 33 L50 59 M62 34 L66 58 M78 40 L80 54');
});
def('egg', (g, c) => {
  F(g, c.a, 'M10 56 C6 34 24 14 46 16 C62 12 84 20 90 40 C98 58 86 82 62 86 C40 92 14 80 10 56 Z');
  O(g, c.b, 50, 50, 18);
  O(g, c.paper, 43, 43, 4);
});
def('cheese', (g, c) => {
  F(g, c.a, 'M6 62 L78 22 C90 28 94 44 94 62 V86 H6 Z');
  O(g, c.paper, 30, 73, 6);
  O(g, c.paper, 56, 62, 5);
  O(g, c.paper, 75, 76, 7);
  S(g, c.paper, 2.5, 'M6 62 H94', 'butt');
});
def('steak', (g, c) => {
  F(g, c.a, 'M14 44 C10 22 34 10 56 14 C80 16 94 36 88 58 C82 80 60 90 40 86 C22 84 16 66 14 44 Z');
  FE(
    g,
    c.paper,
    'M30 40 C30 28 46 26 50 34 C54 42 44 50 36 48 C32 47 30 44 30 40 Z M36 40 C38 44 44 42 44 38 C42 34 36 36 36 40 Z',
  );
  S(g, c.paper, 3, 'M58 36 C70 40 74 54 66 66');
});
def('cigar', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.42);
  S(g, c.c, 3, 'M44 -8 C52 -18 38 -24 46 -36');
  RR(g, c.a, -46, -8, 78, 17, 8);
  RR(g, c.b, 6, -8, 11, 17);
  RR(g, c.c, 32, -7, 12, 15, 4);
  g.restore();
});
def('pipe', (g, c) => {
  F(g, c.a, 'M52 40 H86 V52 C86 78 60 84 52 62 Z');
  S(g, c.a, 7, 'M56 60 C40 70 24 62 8 40');
  S(g, c.b, 3, 'M64 32 C58 24 72 18 66 8 M76 32 C70 24 84 18 78 8');
});
def('jar', (g, c) => {
  RR(g, c.b, 30, 6, 40, 14, 3);
  F(
    g,
    c.a,
    'M30 20 H70 C80 24 82 34 82 44 V88 A6 6 0 0 1 76 94 H24 A6 6 0 0 1 18 88 V44 C18 34 20 24 30 20 Z',
  );
  RR(g, c.paper, 26, 46, 48, 28, 3);
});
def('basket', (g, c) => {
  S(g, c.a, 5, 'M26 44 C26 10 74 10 74 44');
  F(g, c.a, 'M8 44 H92 L82 92 H18 Z');
  S(
    g,
    c.paper,
    2.4,
    'M26 44 L30 92 M42 44 L44 92 M58 44 L56 92 M74 44 L70 92 M13 60 H87 M16 76 H84',
    'butt',
  );
});
// ---- retail, fashion, beauty
def('cart', (g, c) => {
  S(g, c.a, 6, 'M6 14 H20 L32 62 H80 L90 28 H26');
  O(g, c.a, 38, 80, 7.5);
  O(g, c.a, 72, 80, 7.5);
});
def('bag', (g, c) => {
  S(g, c.a, 5, 'M36 36 V24 A14 14 0 0 1 64 24 V36');
  F(g, c.a, 'M18 34 H82 L88 94 H12 Z');
});
def('tag', (g, c) => {
  FE(g, c.a, 'M6 50 L40 10 H94 V90 H40 Z M40 43 A7 7 0 1 0 40 57 A7 7 0 1 0 40 43 Z');
});
def('box', (g, c) => {
  F(g, c.a, 'M50 6 L92 26 V72 L50 94 L8 72 V26 Z');
  S(g, c.paper, 3, 'M8 26 L50 46 L92 26 M50 46 V94');
  S(g, c.b, 7, 'M29 16 L71 36', 'butt');
});
def('gift', (g, c) => {
  RR(g, c.a, 12, 40, 76, 54, 3);
  RR(g, c.a, 6, 26, 88, 16, 3);
  RR(g, c.b, 44, 26, 12, 68);
  S(g, c.b, 5, 'M50 26 C40 8 22 10 28 20 C32 26 42 26 50 26 C58 26 68 26 72 20 C78 10 60 8 50 26');
});
def('scissors', (g, c) => {
  OS(g, c.a, 6, 26, 74, 13);
  OS(g, c.a, 6, 74, 74, 13);
  S(g, c.a, 7, 'M34 64 L78 8 M66 64 L22 8');
});
def('pole', (g, c) => {
  const p = 'M36 14 H64 V86 H36 Z';
  F(g, c.paper, p);
  clipTo(g, p, () => {
    for (let i = -2; i < 6; i++) {
      F(
        g,
        i % 2 ? c.b : c.a,
        `M36 ${i * 22} L64 ${i * 22 + 14} V${i * 22 + 25} L36 ${i * 22 + 11} Z`,
      );
    }
  });
  RR(g, c.ink, 30, 4, 40, 11, 5);
  RR(g, c.ink, 30, 85, 40, 11, 5);
});
def('razor', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.7);
  RR(g, c.a, -40, -12, 52, 22, 3);
  RR(g, c.b, 8, -6, 36, 12, 6);
  O(g, c.paper, -30, -1, 3);
  g.restore();
});
def('comb', (g, c) => {
  RR(g, c.a, 6, 22, 88, 20, 5);
  for (let x = 10; x < 90; x += 7) RR(g, c.a, x, 40, 3.5, 36, 1.5);
});
def('lipstick', (g, c) => {
  F(g, c.c, 'M40 40 V22 L60 8 V40 Z');
  RR(g, c.b, 38, 40, 24, 16);
  RR(g, c.a, 34, 54, 32, 42, 4);
});
def('perfume', (g, c) => {
  RR(g, c.b, 44, 4, 12, 14, 2);
  RR(g, c.b, 38, 18, 24, 12, 3);
  RR(g, c.a, 22, 30, 56, 64, 9);
  RR(g, c.paper, 33, 52, 34, 22, 2);
});
def('nailpolish', (g, c) => {
  RR(g, c.ink, 40, 4, 20, 42, 5);
  F(
    g,
    c.a,
    'M34 46 H66 C80 50 82 62 82 72 V86 A8 8 0 0 1 74 94 H26 A8 8 0 0 1 18 86 V72 C18 62 20 50 34 46 Z',
  );
});
def('mirror', (g, c) => {
  OS(g, c.a, 7, 50, 36, 30);
  EL(g, c.b, 50, 36, 24, 24);
  S(g, c.paper, 3.5, 'M36 30 A16 16 0 0 1 50 20');
  RR(g, c.a, 45, 66, 10, 30, 4);
});
def('sneaker', (g, c) => {
  F(
    g,
    c.a,
    'M6 70 C8 56 14 44 22 38 L34 48 C40 54 48 56 54 52 L60 44 C70 56 84 60 92 64 C96 68 96 76 92 78 H8 C6 76 6 72 6 70 Z',
  );
  RR(g, c.b, 6, 78, 88, 9, 4);
  S(g, c.paper, 2.6, 'M38 46 L46 55 M44 42 L52 51');
  S(g, c.paper, 3, 'M16 68 C30 62 50 64 70 66');
});
def('heel', (g, c) => {
  F(
    g,
    c.a,
    'M8 30 C22 34 30 46 44 58 C58 70 78 74 92 76 C96 78 94 86 88 86 H56 C44 80 36 70 30 62 L26 92 H20 L16 52 C12 46 8 38 8 30 Z',
  );
});
def('boot', (g, c) => {
  F(g, c.a, 'M28 6 H58 V52 C70 56 86 62 90 74 V84 H24 V52 C26 36 28 20 28 6 Z');
  RR(g, c.b, 22, 84, 70, 9, 3);
  S(g, c.paper, 2.5, 'M28 18 H58', 'butt');
});
def('hanger', (g, c) => {
  S(g, c.a, 5, 'M50 30 C50 20 60 22 58 14 A9 9 0 1 0 42 14');
  S(g, c.a, 6, 'M50 30 L92 62 C96 66 94 72 88 72 H12 C6 72 4 66 8 62 Z');
});
def('shirt', (g, c) => {
  F(g, c.a, 'M32 8 L44 14 H56 L68 8 L94 28 L82 44 L72 38 V92 H28 V38 L18 44 L6 28 Z');
  S(g, c.paper, 2, 'M40 22 V90 M60 22 V90', 'butt');
  F(g, c.b, 'M44 14 L50 26 L56 14 Z');
});
def('dress', (g, c) => {
  F(g, c.a, 'M36 4 L44 18 H56 L64 4 L70 12 L62 38 L86 94 H14 L38 38 L30 12 Z');
  S(g, c.b, 4, 'M38 38 H62', 'butt');
});
def('tie', (g, c) => {
  F(g, c.a, 'M40 4 H60 L56 20 L68 78 L50 96 L32 78 L44 20 Z');
  S(g, c.paper, 2.5, 'M44 20 H56', 'butt');
});
def('hat', (g, c) => {
  F(g, c.a, 'M26 60 C26 30 36 18 50 22 C64 18 74 30 74 60 Z');
  EL(g, c.a, 50, 64, 46, 10);
  RR(g, c.b, 27, 50, 46, 8);
});
def('cap', (g, c) => {
  F(g, c.a, 'M10 62 C10 34 30 18 52 18 C72 18 84 34 84 54 L98 64 C86 68 70 62 58 62 Z');
  O(g, c.b, 50, 18, 4);
  S(g, c.paper, 2.5, 'M50 18 C40 30 36 46 36 62');
});
def('glasses', (g, c) => {
  OS(g, c.a, 6, 26, 54, 18);
  OS(g, c.a, 6, 74, 54, 18);
  S(g, c.a, 5, 'M44 50 Q50 44 56 50 M8 50 L2 40 M92 50 L98 40');
});
def('watch', (g, c) => {
  RR(g, c.b, 36, 2, 28, 24, 4);
  RR(g, c.b, 36, 74, 28, 24, 4);
  O(g, c.a, 50, 50, 29);
  O(g, c.paper, 50, 50, 22);
  S(g, c.a, 3.5, 'M50 50 V34 M50 50 L61 56');
  RR(g, c.a, 78, 46, 6, 8, 2);
});
def('needle', (g, c) => {
  S(g, c.a, 4, 'M90 10 L22 78');
  F(g, c.a, 'M22 78 L8 92 L14 72 Z');
  S(g, c.b, 3, 'M86 14 C96 30 70 40 80 56 C86 66 70 76 60 70');
});
def('tattoo', (g, c) => {
  g.save();
  g.translate(50, 50);
  g.rotate(-0.75);
  RR(g, c.a, -34, -9, 48, 18, 4);
  RR(g, c.b, -44, -14, 14, 28, 4);
  S(g, c.a, 4, 'M14 0 H40', 'butt');
  F(g, c.a, 'M40 -3 L50 0 L40 3 Z');
  RR(g, c.b, -10, -24, 16, 16, 3);
  g.restore();
});
def('skull', (g, c) => {
  F(
    g,
    c.a,
    'M50 6 C76 6 90 24 90 46 C90 60 82 68 74 72 V90 H26 V72 C18 68 10 60 10 46 C10 24 24 6 50 6 Z',
  );
  O(g, c.paper, 34, 46, 10.5);
  O(g, c.paper, 66, 46, 10.5);
  F(g, c.paper, 'M50 58 L44 69 H56 Z');
  S(g, c.paper, 3, 'M38 78 V90 M50 78 V90 M62 78 V90', 'butt');
});
def('washer', (g, c) => {
  RR(g, c.a, 12, 4, 76, 92, 7);
  RR(g, c.paper, 12, 22, 76, 3);
  O(g, c.paper, 24, 13, 3.5);
  O(g, c.paper, 36, 13, 3.5);
  O(g, c.paper, 50, 58, 25);
  O(g, c.b, 50, 58, 18);
  S(g, c.paper, 3, 'M34 60 q8 -8 16 0 t16 0');
});
def('iron', (g, c) => {
  F(g, c.a, 'M6 76 C10 50 30 38 58 38 H84 L92 76 Z');
  S(g, c.b, 7, 'M40 38 C40 18 76 18 78 38');
  S(g, c.paper, 2.5, 'M24 66 H80', 'butt');
});
def('sofa', (g, c) => {
  RR(g, c.a, 18, 26, 64, 36, 9);
  RR(g, c.b, 6, 44, 18, 36, 8);
  RR(g, c.b, 76, 44, 18, 36, 8);
  RR(g, c.a, 18, 56, 64, 24, 4);
  S(g, c.a, 5, 'M22 80 V92 M78 80 V92', 'butt');
});
def('bed', (g, c) => {
  RR(g, c.a, 4, 30, 10, 58, 2);
  RR(g, c.a, 4, 56, 92, 20, 3);
  RR(g, c.b, 18, 44, 28, 14, 6);
  RR(g, c.a, 86, 56, 10, 32, 2);
});
def('lamp', (g, c) => {
  F(g, c.a, 'M32 8 H68 L82 50 H18 Z');
  S(g, c.b, 5, 'M50 50 V86', 'butt');
  RR(g, c.b, 30, 86, 40, 8, 3);
});
def('streetlamp', (g, c) => {
  S(g, c.a, 5, 'M34 96 V26 C34 8 62 8 70 18', 'butt');
  F(g, c.b, 'M58 18 H84 L78 30 H64 Z');
  RR(g, c.a, 26, 90, 16, 7, 2);
  F(g, c.c, 'M64 32 H78 L88 60 H54 Z');
});
def('bench', (g, c) => {
  RR(g, c.a, 6, 24, 88, 9, 3);
  RR(g, c.a, 6, 38, 88, 9, 3);
  RR(g, c.a, 4, 54, 92, 10, 3);
  S(g, c.b, 6, 'M16 20 V86 M84 20 V86 M12 86 H22 M78 86 H88', 'butt');
});
def('elevator', (g, c) => {
  RR(g, c.a, 14, 14, 72, 82, 3);
  RR(g, c.paper, 22, 22, 26, 74);
  RR(g, c.paper, 52, 22, 26, 74);
  F(g, c.b, 'M38 10 L44 2 L50 10 Z M50 4 L56 12 L62 4 Z');
});
def('cctv', (g, c) => {
  RR(g, c.b, 6, 10, 10, 40, 2);
  S(g, c.b, 6, 'M16 30 H34', 'butt');
  g.save();
  g.translate(56, 42);
  g.rotate(0.35);
  RR(g, c.a, -30, -14, 62, 28, 5);
  O(g, c.paper, 22, 0, 8);
  O(g, c.ink, 22, 0, 4);
  g.restore();
  O(g, c.c, 30, 70, 4);
});
def('atm', (g, c) => {
  RR(g, c.a, 14, 4, 72, 92, 6);
  RR(g, c.paper, 24, 14, 52, 30, 3);
  RR(g, c.b, 24, 52, 30, 26, 2);
  RR(g, c.paper, 62, 54, 14, 5, 1);
  RR(g, c.paper, 62, 68, 14, 5, 1);
});
def('cooler', (g, c) => {
  RR(g, c.a, 16, 4, 68, 92, 5);
  RR(g, c.b, 16, 4, 68, 16, 5);
  RR(g, c.paper, 22, 26, 56, 62, 2);
  S(g, c.a, 2.5, 'M22 46 H78 M22 66 H78', 'butt');
  RR(g, c.a, 70, 44, 4, 26, 2);
});
def('ac', (g, c) => {
  RR(g, c.a, 6, 18, 88, 44, 7);
  S(g, c.paper, 3, 'M16 50 H84', 'butt');
  O(g, c.b, 80, 30, 3.5);
  S(g, c.b, 4, 'M28 72 C24 80 30 84 26 92 M50 72 C46 80 52 84 48 92 M72 72 C68 80 74 84 70 92');
});
def('toilet', (g, c) => {
  RR(g, c.a, 22, 6, 30, 44, 5);
  F(g, c.a, 'M22 50 H86 C86 70 72 78 56 78 L60 94 H30 L32 74 C24 68 22 60 22 50 Z');
  RR(g, c.b, 20, 44, 68, 8, 4);
});
def('hydrant', (g, c) => {
  F(g, c.a, 'M36 24 C36 10 64 10 64 24 V30 H70 V38 H64 V84 H72 V94 H28 V84 H36 V38 H30 V30 H36 Z');
  RR(g, c.a, 20, 48, 16, 14, 3);
  RR(g, c.a, 64, 48, 16, 14, 3);
  O(g, c.b, 50, 55, 8);
  RR(g, c.a, 46, 4, 8, 10, 2);
});
def('dock', (g, c) => {
  RR(g, c.a, 4, 36, 92, 10, 2);
  for (const x of [14, 44, 74]) RR(g, c.b, x, 26, 9, 60, 3);
  S(g, c.paper, 2, 'M30 36 V46 M60 36 V46 M88 36 V46', 'butt');
  S(g, c.a, 4, 'M4 78 Q18 72 32 78 T60 78 T94 77 M10 92 Q24 86 38 92 T66 92');
});
def('container', (g, c) => {
  RR(g, c.a, 4, 26, 92, 50, 3);
  S(
    g,
    c.paper,
    2.4,
    'M16 32 V70 M27 32 V70 M38 32 V70 M49 32 V70 M60 32 V70 M71 32 V70 M82 32 V70',
    'butt',
  );
  RR(g, c.b, 4, 20, 92, 7, 2);
  RR(g, c.b, 4, 75, 92, 7, 2);
});
def('ship', (g, c) => {
  F(g, c.a, 'M2 64 H98 L88 86 H14 Z');
  for (const [x, y, k] of [
    [20, 50, 0],
    [34, 50, 1],
    [48, 50, 0],
    [27, 37, 1],
    [41, 37, 0],
  ])
    RR(g, k ? c.b : c.c, x, y, 13, 12, 1);
  RR(g, c.a, 70, 34, 16, 30, 2);
  RR(g, c.paper, 73, 40, 10, 5);
  S(g, c.b, 4, 'M4 96 Q18 90 32 96 T60 96 T94 95');
});
def('cruise', (g, c) => {
  F(g, c.a, 'M2 66 H98 L90 86 H12 Z M14 64 V54 H86 L90 64 Z M24 52 V42 H76 L80 52 Z');
  F(g, c.b, 'M52 40 L56 20 H68 L66 40 Z');
  for (let x = 20; x < 82; x += 8) O(g, c.paper, x, 59, 2);
  S(g, c.b, 4, 'M4 96 Q18 90 32 96 T60 96 T94 95');
});
def('crane', (g, c) => {
  S(g, c.a, 5, 'M30 96 V12 M70 96 V40 M30 40 H70 M6 20 H96 M30 12 L6 20 M30 12 L96 20', 'butt');
  S(g, c.a, 2.5, 'M30 40 L70 96 M70 40 L30 96 M84 20 V44', 'butt');
  RR(g, c.b, 76, 44, 16, 12, 1);
});
