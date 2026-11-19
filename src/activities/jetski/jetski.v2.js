// JET SKI RENTALS (activities): rental stands on the beaches / marina shores with an attendant, three skis bobbing at
// the water's edge, pay at the counter (E), ride with spray and a visible rider, bring it back (deposit refunded) or
// abandon it (deposit kept). Taking a ski without paying is theft (the attendant calls it in).
// Also re-skins every jet ski in game.boatSystem with the code-built PWC (model.js), poses the rider straddling it
// (rider.js) and adds a rooster tail and turn spray through the boats' own spray particles.
// API (game.jetskiRentals): { sites, rental, rent(siteId, planIndex), endRental(returned), skin(boat) }.
import * as THREE from 'three';
import { createMarker } from '../../gameplay/markers.js';
import {
  getHub,
  blip,
  unblip,
  help,
  notify,
  canAct,
  getPanelSafe,
  say,
  earnCash,
  payCash,
  pill,
  clock,
  local,
  groundY,
  fmt,
  sfx,
} from '../common.js';
import { buildJetSki, FLOOR_Y } from './model.js';
import { straddle } from './rider.js';
import { buildStand } from './stand.js';
import { JETSKI_SITES, JETSKI_PLANS, DEPOSIT } from '../sites.data.js';

export const order = 182;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// rider on the PWC (model.js frame): hips on the driver's part of the seat, hands on the grips, heels in the footwells
const RIDER_ANCHOR = () => ({
  id: 'driver',
  i: 0,
  yaw: 0,
  open: true,
  jetski: true,
  recline: 2,
  doorX: 1.5,
  roofY: NaN,
  wheel: null,
  fixed: true,
  hip: V3(0, 0.76, -0.08),
  heel: V3(0, FLOOR_Y, 0.36),
  grips: [
    { side: 'Left', p: V3(0.23, 0.975, 0.56) },
    { side: 'Right', p: V3(-0.23, 0.975, 0.56) },
  ],
});
const ATTENDANT = 'Attendant';

export async function initV2(game) {
  const city = game.city;
  if (!city?.isWater) return;
  if (/[?&]jetski=0\b/.test(location.search)) return;
  const H = getHub(game);
  const SEA = city.seaLevel ?? -0.12;
  const depth = (x, z) => {
    try {
      const d = city.seabedDepthAt?.(x, z);
      if (Number.isFinite(d)) return d;
    } catch (e) {
      /* */
    }
    return SEA - groundY(game, x, z);
  };

  // ---------------------------------------------------------------- site geometry (from the map data, once, lazily)
  function locate(def) {
    let best = null;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2,
        dx = Math.sin(a),
        dz = Math.cos(a);
      let wet = -1;
      for (let r = 0; r < 220; r += 2)
        if (city.isWater(def.x + dx * r, def.z + dz * r)) {
          wet = r;
          break;
        }
      if (wet < 0) continue;
      // open water beyond (not a pond or a canal) and deep enough a few meters out
      let open = true;
      for (let r = wet; r < wet + 60; r += 6)
        if (!city.isWater(def.x + dx * r, def.z + dz * r)) {
          open = false;
          break;
        }
      if (!open || depth(def.x + dx * (wet + 9), def.z + dz * (wet + 9)) < 0.7) continue;
      if (!best || wet < best.wet) best = { wet, dx, dz };
    }
    if (!best) return null;
    const { wet, dx, dz } = best;
    const shore = { x: def.x + dx * (wet - 1), z: def.z + dz * (wet - 1) };
    const heading = Math.atan2(-dx, -dz); // the stand's front faces inland
    const stand = { x: shore.x - dx * 8, z: shore.z - dz * 8, heading };
    const slots = [];
    for (const lat of [-4.2, 0, 4.2]) {
      for (let out = 6; out < 26; out += 1.5) {
        const p = local({ x: shore.x, z: shore.z, heading }, lat, -out);
        if (city.isWater(p.x, p.z) && depth(p.x, p.z) > 0.65) {
          slots.push({ x: p.x, z: p.z, heading: heading + Math.PI });
          break;
        }
      }
    }
    if (slots.length < 2) return null;
    const ret = local({ x: shore.x, z: shore.z, heading }, 0, -10);
    return { stand, slots, ret, out: { x: dx, z: dz } };
  }

  const R = { sites: [], rental: null };
  const B = () => game.boatSystem;
  const P = () => game.player.position;
  const onFoot = () => !game.player.state?.inVehicle;

  // ---------------------------------------------------------------- skin every jet ski with the PWC model
  const skinned = new WeakMap();
  let skinN = 0;
  function skin(b, opts = {}) {
    if (!b || b.disposed || b.typeKey !== 'jetski') return null;
    let v = skinned.get(b);
    if (v && b.visual === v && v.root.parent === b.mesh) return v;
    if (!v) {
      v = buildJetSki({
        num: opts.num ?? (++skinN % 9) + 1,
        accent: opts.accent,
        owner: opts.owner,
      });
      skinned.set(b, v);
    }
    for (const c of [...b.mesh.children])
      if (
        c !== v.root &&
        !/^(npc-|character-)/.test(c.name || '') &&
        !c.isBone &&
        !(c.userData && c.userData.keepOnBoat)
      ) {
        if (c.type === 'Group' && c.children.some((q) => q.isSkinnedMesh)) continue;
        c.visible = false;
      }
    if (v.root.parent !== b.mesh) b.mesh.add(v.root);
    v.root.visible = true;
    b.mesh.visible = true;
    b.visual = v;
    b.name = 'Pico WaveRider';
    if (b.model) {
      b.model.brand = 'Pico';
      b.model.name = 'WaveRider';
    }
    return v;
  }
  let skinT = 0;
  function skinAll(dt) {
    if ((skinT -= dt) > 0) return;
    skinT = 1;
    for (const b of B()?.list || []) if (b.typeKey === 'jetski') skin(b);
  }

  // ---------------------------------------------------------------- spray + rider (the player's ski)
  let sprayT = 0;
  function rideFx(dt) {
    const v = game.player.state?.vehicle;
    if (!v || v.typeKey !== 'jetski') return;
    const vis = skin(v);
    if (!vis) return;
    // handlebar follows the steering (boats.js writes the steer into parts.wheel.rotation.z)
    const st = vis.parts.wheel.rotation.z / 2.4;
    vis.parts.steer.rotation.y = THREE.MathUtils.lerp(
      vis.parts.steer.rotation.y,
      st * 0.45,
      Math.min(1, dt * 12),
    );
    try {
      const ch = game.playerCharacter;
      if (ch?.root?.visible && ch.root.parent === v.mesh) {
        // the generic boat probe takes the deck body for the floor and stands him up: give the seat solver the ski's real seat
        const S = ch._seat;
        if (S && S.anchor && !S.anchor.jetski) {
          S.anchor = RIDER_ANCHOR();
          S.hip = null;
          S.fit = 0;
          S.sink = 0;
          S.extraRecline = 0;
          S.reachLean = 0;
        }
        straddle(ch, v.mesh, FLOOR_Y, st);
      }
    } catch (e) {
      /* cosmetic */
    }
    const W = B()?.wake;
    if (!W) return;
    const sp = Math.abs(v.speed || 0);
    if (sp < 3) return;
    sprayT -= dt;
    if (sprayT > 0) return;
    sprayT = 0.016;
    const t = B().timeNow?.() ?? performance.now() / 1000;
    const tr = v.body.translation(),
      q = v.mesh.quaternion;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q),
      side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const lv = v.body.linvel();
    const k = Math.min(1, sp / 22);
    // rooster tail from the jet nozzle: up and back, taller with speed
    const n = 2 + Math.round(k * 4);
    for (let i = 0; i < n; i++) {
      const sx = tr.x - fwd.x * 1.7,
        sz = tr.z - fwd.z * 1.7;
      W.spray(
        sx + (Math.random() - 0.5) * 0.25,
        SEA + 0.15,
        sz + (Math.random() - 0.5) * 0.25,
        lv.x * 0.35 - fwd.x * (2 + 3 * k) + (Math.random() - 0.5) * 1.2,
        3.2 + 4.5 * k * Math.random(),
        lv.z * 0.35 - fwd.z * (2 + 3 * k) + (Math.random() - 0.5) * 1.2,
        0.09 + 0.12 * k,
        0.7 + 0.5 * k,
        t,
      );
    }
    // bow spray off the chines, and a sheet thrown to the outside of a hard turn
    const turn = Math.abs(st) * k;
    for (const sg of [1, -1]) {
      const amt = 0.4 * k + (Math.sign(st) === -sg ? turn * 2.5 : 0);
      if (Math.random() > amt) continue;
      const bx = tr.x + fwd.x * 0.6 + side.x * sg * 0.62,
        bz = tr.z + fwd.z * 0.6 + side.z * sg * 0.62;
      W.spray(
        bx,
        SEA + 0.1,
        bz,
        side.x * sg * (1.5 + 3 * turn) + lv.x * 0.5,
        1.2 + 1.8 * Math.random() + turn * 2,
        side.z * sg * (1.5 + 3 * turn) + lv.z * 0.5,
        0.07 + 0.08 * k,
        0.5 + 0.4 * Math.random(),
        t,
      );
    }
  }

  // ---------------------------------------------------------------- rental sites
  for (const def of JETSKI_SITES) {
    const S = {
      def,
      geo: undefined,
      root: null,
      body: null,
      skis: [],
      attendant: null,
      blip: null,
      marker: null,
    };
    R.sites.push(S);
    S.blip = blip(game, {
      x: def.x,
      z: def.z,
      kind: 'jetski',
      color: '#ff8a3d',
      label: def.name + ' (jet ski rental)',
      prio: 80,
    });
    const site = H.site({
      id: 'jetski:' + def.id,
      x: def.x,
      z: def.z,
      on: 260,
      off: 340,
      build() {
        buildSite(S);
      },
      drop() {
        dropSite(S);
      },
      tick(dt, s, d) {
        tickSite(S, dt, d);
      },
    });
    S.site = site;
  }
  function buildSite(S) {
    if (S.geo === undefined) {
      S.geo = locate(S.def);
      if (!S.geo) console.warn('[jetski] no shore near', S.def.id);
      else {
        S.blip.x = S.geo.stand.x;
        S.blip.z = S.geo.stand.z;
      }
    }
    const G = S.geo;
    if (!G) return;
    const st = buildStand({
      name: S.def.brand,
      sub: S.def.sub,
      prices: JETSKI_PLANS.map((p) => [p.label, '$' + p.price]),
    });
    const gy = Math.max(SEA + 0.05, groundY(game, G.stand.x, G.stand.z));
    st.group.position.set(G.stand.x, gy, G.stand.z);
    st.group.rotation.y = G.stand.heading;
    game.scene.add(st.group);
    S.root = st.group;
    S.st = st;
    try {
      game.footSurface?.tag?.(st.group, 'wood');
    } catch (e) {
      /* */
    }
    // colliders
    try {
      const { world, RAPIER } = game;
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        G.stand.heading,
      );
      S.body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(G.stand.x, gy, G.stand.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
      for (const [x, y, z, hx, hy, hz] of st.colliders)
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z),
          S.body,
        );
    } catch (e) {
      console.warn('[jetski] colliders', e);
    }
    // attendant behind the counter
    const ap = local(
      { x: G.stand.x, z: G.stand.z, heading: G.stand.heading },
      st.attendant.x,
      st.attendant.z,
    );
    S.attPos = { x: ap.x, y: gy + st.attendant.y, z: ap.z };
    S.talkPos = local({ x: G.stand.x, z: G.stand.z, heading: G.stand.heading }, 0, 2.2);
    spawnAttendant(S);
    // skis at the water's edge
    S.skis = G.slots.map((sl, i) => ({ slot: sl, b: null, num: S.def.num0 + i }));
    for (const k of S.skis) spawnSki(S, k);
  }
  function spawnAttendant(S) {
    if (S.attendant || !game.npc?.spawnPosed) return;
    try {
      S.attendant = game.npc.spawnPosed({
        place: 'lifeguard',
        pos: S.attPos,
        rot: S.geo.stand.heading,
        pose: 'idle',
        seed: S.def.num0 * 31,
      });
    } catch (e) {
      S.attendant = null;
    }
    if (!S.attendant)
      setTimeout(() => {
        if (S.root && !S.attendant) spawnAttendant(S);
      }, 2500);
  }
  function spawnSki(S, k) {
    const b = B()?.spawn?.('jetski', { x: k.slot.x, z: k.slot.z }, k.slot.heading);
    if (!b) return;
    k.b = b;
    b.rentalSite = S.def.id;
    b.rentalNum = k.num;
    skin(b, { num: k.num, owner: S.def.brand });
  }
  function dropSite(S) {
    if (R.rental?.site === S) return; // never while renting from it (site.busy also holds it)
    if (S.root) {
      game.scene.remove(S.root);
      S.root = null;
    }
    if (S.body) {
      try {
        game.world.removeRigidBody(S.body);
      } catch (e) {
        /* */
      }
      S.body = null;
    }
    if (S.attendant) {
      try {
        S.attendant.remove();
      } catch (e) {
        /* */
      }
      S.attendant = null;
    }
    for (const k of S.skis)
      if (k.b && !k.b.disposed && k.b !== game.player.state?.vehicle) {
        try {
          B()?.remove?.(k.b);
        } catch (e) {
          /* */
        }
        k.b = null;
      }
    S.skis = [];
    help(game, 'jetski', null);
  }
  // hold an idle ski on its slot (a soft spring on the velocity, so it still bobs and bumps)
  function holdSki(k, dt) {
    const b = k.b;
    if (!b || b.disposed || b.playerDriven || b === game.player.state?.vehicle) return;
    const t = b.body.translation(),
      dx = k.slot.x - t.x,
      dz = k.slot.z - t.z,
      d = Math.hypot(dx, dz);
    if (d > 40) {
      b.body.setTranslation({ x: k.slot.x, y: SEA + 0.05, z: k.slot.z }, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const lv = b.body.linvel();
    b.body.setLinvel(
      {
        x: lv.x * 0.96 + dx * 0.6 * dt * 10 * 0.1,
        y: lv.y,
        z: lv.z * 0.96 + dz * 0.6 * dt * 10 * 0.1,
      },
      true,
    );
    const yaw = new THREE.Euler().setFromQuaternion(b.mesh.quaternion, 'YXZ').y;
    const da = Math.atan2(Math.sin(k.slot.heading - yaw), Math.cos(k.slot.heading - yaw));
    const av = b.body.angvel();
    b.body.setAngvel({ x: av.x, y: av.y * 0.9 + da * 0.25, z: av.z }, true);
  }
  function tickSite(S, dt, d) {
    if (!S.geo) return;
    if (S.root?.userData.flag)
      S.root.userData.flag.rotation.y = Math.sin(performance.now() / 700) * 0.18;
    for (const k of S.skis) {
      if (k.b?.disposed) k.b = null;
      if (!k.b && d > 60 && !(R.rental?.ski === k)) spawnSki(S, k);
      if (!R.rental || R.rental.ski !== k) holdSki(k, dt);
    }
    if (S.attendant && S.attendant.character) S.attendant.lookAt = d < 12 ? P() : null;
    // counter prompt
    if (!onFoot()) {
      help(game, 'jetski', null);
      return;
    }
    const pd = Math.hypot(P().x - S.talkPos.x, P().z - S.talkPos.z);
    if (pd < 2.2 && Math.abs(P().y - S.attPos.y) < 2) {
      if (R.rental?.site === S)
        help(
          game,
          'jetski',
          `Your ski is <b>#${R.rental.ski.num}</b>. Bring it back here to get your ${fmt(DEPOSIT)} deposit.`,
        );
      else if (R.rental) help(game, 'jetski', 'You already have a ski out.');
      else help(game, 'jetski', `Press <b>E</b> to rent a jet ski`);
      if (!R.rental && canAct(game) && game.input.pressed('KeyE')) openMenu(S);
    } else help(game, 'jetski', null);
  }

  // ---------------------------------------------------------------- menu, rent, ride, return
  function openMenu(S) {
    const panel = getPanelSafe(game);
    if (!panel) return;
    const free = S.skis.filter((k) => k.b && !k.b.disposed && !k.b.playerDriven);
    const cash = game.wallet?.cash ?? game.player.money ?? 0;
    say(
      game,
      ATTENDANT,
      [
        'Hey! Wanna ride? Life vest is on the house.',
        'Best jet skis on the beach, my friend.',
        'Hop on, hop off, bring it back in one piece.',
      ][(Math.random() * 3) | 0],
      2600,
      '#ff8a3d',
    );
    panel.show(
      'jetski',
      `<h2>${S.def.brand}</h2><div class="sub">${S.def.sub} · ${free.length} ski${free.length === 1 ? '' : 's'} ready · you have ${fmt(cash)}</div>` +
        `<div class="row"><span>Deposit (back when you return it)</span><span>${fmt(DEPOSIT)}</span></div><div class="row"><span>Late fee</span><span>$5 per 15 s</span></div>`,
      [
        ...JETSKI_PLANS.map((p, i) => ({
          label: `${p.label} · ${p.blurb}`,
          price: `${fmt(p.price)} + ${fmt(DEPOSIT)}`,
          disabled: !free.length,
          fn: () => {
            panel.hide();
            rent(S.def.id, i);
          },
        })),
        { label: 'No thanks', fn: () => panel.hide() },
      ],
    );
  }
  function rent(siteId, i) {
    const S = R.sites.find((s) => s.def.id === siteId),
      plan = JETSKI_PLANS[i];
    if (!S || !plan || R.rental) return false;
    const k = S.skis
      .filter((q) => q.b && !q.b.disposed && !q.b.playerDriven)
      .sort(
        (a, b) =>
          Math.hypot(a.slot.x - P().x, a.slot.z - P().z) -
          Math.hypot(b.slot.x - P().x, b.slot.z - P().z),
      )[0];
    if (!k) {
      notify(game, 'No skis free right now.');
      return false;
    }
    if (
      !payCash(game, plan.price + DEPOSIT, {
        to: S.def.brand,
        memo: 'Jet ski rental',
        place: S.def.name,
        category: 'leisure',
      })
    ) {
      say(
        game,
        ATTENDANT,
        "Cash or card, my friend. Come back when you've got it.",
        2600,
        '#ff8a3d',
      );
      try {
        game.audio?.ui?.('deny');
      } catch (e) {
        /* */
      }
      return false;
    }
    k.b.rentalPaid = true;
    R.rental = { site: S, ski: k, plan, t: plan.seconds, late: 0, away: 0, mounted: false };
    S.site.busy = true;
    R.rental.blip = blip(game, {
      x: k.slot.x,
      z: k.slot.z,
      kind: 'jetski',
      color: '#2fe0d0',
      label: `Jet ski #${k.num}`,
      prio: 90,
      size: 7,
    });
    R.rental.marker = createMarker(THREE, {
      color: 0x2fe0d0,
      radius: 1.2,
      icon: 'chevron',
      iconY: 2.2,
    });
    game.scene.add(R.rental.marker);
    say(
      game,
      ATTENDANT,
      `Number ${k.num}'s yours. ${plan.label}, the clock starts now. Have fun out there!`,
      3200,
      '#ff8a3d',
    );
    notify(game, `Jet ski #${k.num} rented: ${plan.label}. Press F at the ski to climb on.`, 4200);
    game.emit?.('activity:start', { id: 'jetski', site: S.def.id, plan: plan.id });
    return true;
  }
  function endRental(returned) {
    const r = R.rental;
    if (!r) return;
    R.rental = null;
    r.site.site.busy = false;
    unblip(game, r.blip);
    if (r.marker) game.scene.remove(r.marker);
    if (r.retMarker) game.scene.remove(r.retMarker);
    pill('jetski', null);
    game.waypoint = null;
    if (r.ski.b) r.ski.b.rentalPaid = false;
    if (returned) {
      const fee = Math.min(DEPOSIT, Math.ceil(r.late / 15) * 5),
        back = DEPOSIT - fee;
      if (back > 0) earnCash(game, back, 'Jet ski deposit back', r.site.def.brand, 'refund');
      say(
        game,
        ATTENDANT,
        fee
          ? `Bit late, my friend. ${fmt(fee)} late fee, here's the rest.`
          : [
              'Nice riding! Come back anytime.',
              'Not a scratch. You can come back.',
              'Good ride? Told you.',
            ][(Math.random() * 3) | 0],
        3000,
        '#ff8a3d',
      );
      notify(
        game,
        `Jet ski returned · deposit ${fmt(back)} back${fee ? ` (late fee ${fmt(fee)})` : ''}`,
        3800,
      );
      game.stats?.add?.('jetskiRentals', 1);
    } else {
      notify(
        game,
        `You abandoned jet ski #${r.ski.num}. ${r.site.def.brand} keeps your ${fmt(DEPOSIT)} deposit.`,
        4500,
      );
      r.ski.lost = true;
    }
    game.emit?.('activity:end', { id: 'jetski', ok: !!returned });
  }
  function rentalTick(dt) {
    const r = R.rental;
    if (!r) return;
    if (game.ui?.dead || game.ui?.arrested) {
      endRental(false);
      return;
    }
    const b = r.ski.b;
    if (!b || b.disposed) {
      endRental(false);
      return;
    }
    const t = b.body.translation(),
      onIt = game.player.state?.vehicle === b;
    r.blip.x = t.x;
    r.blip.z = t.z;
    if (r.marker) {
      r.marker.visible = !onIt && !r.mounted;
      r.marker.position.set(t.x, SEA + 0.05, t.z);
    }
    if (onIt) r.mounted = true;
    if (r.mounted) {
      r.t -= dt;
      if (r.t < 0) r.late += dt;
      const retD = Math.hypot(t.x - r.site.geo.ret.x, t.z - r.site.geo.ret.z);
      if (r.t > 0)
        pill(
          'jetski',
          `<span style="color:#2fe0d0">JET SKI #${r.ski.num}</span> &nbsp;${clock(r.t)}`,
          r.t < 20,
        );
      else {
        pill(
          'jetski',
          `<span style="color:#ff6b5a">TIME'S UP</span> &nbsp;bring #${r.ski.num} back · late ${clock(r.late)}`,
          true,
        );
        if (!r.warned) {
          r.warned = true;
          sfx(game, 'whistle', t, 0.8);
          notify(game, `Time's up. Bring the ski back to ${r.site.def.brand}.`, 4000);
          game.waypoint = { x: r.site.geo.ret.x, z: r.site.geo.ret.z };
        }
      }
      if (!r.retMarker && r.wentOut && (r.t < 30 || retD < 80)) {
        r.retMarker = createMarker(THREE, {
          color: 0xffd25a,
          radius: 5,
          icon: 'chevron',
          iconY: 2.4,
        });
        r.retMarker.position.set(r.site.geo.ret.x, SEA + 0.04, r.site.geo.ret.z);
        game.scene.add(r.retMarker);
      }
      if (retD > 40) r.wentOut = true;
      if (onIt && r.wentOut && retD < 9 && Math.abs(b.speedKmh || 0) < 8)
        help(game, 'jetskiRet', 'Press <b>F</b> to hop off and hand the ski back');
      else help(game, 'jetskiRet', null);
      // returned: off the ski, near the stand's water, ski within the return zone
      if (
        !onIt &&
        (r.wentOut || r.plan.seconds - r.t > 20) &&
        retD < 16 &&
        Math.hypot(P().x - r.site.geo.ret.x, P().z - r.site.geo.ret.z) < 30
      ) {
        help(game, 'jetskiRet', null);
        endRental(true);
        return;
      }
      // abandoned: off it and far from it for a while, or far gone after time ran out
      const pd = Math.hypot(P().x - t.x, P().z - t.z);
      if (!onIt && pd > 140) {
        r.away += dt;
        if (r.away > 15) {
          endRental(false);
          return;
        }
      } else r.away = 0;
      if (r.late > 240) {
        endRental(false);
        return;
      }
    } else if ((r.t -= dt * 0.25) <= 0) endRental(false);
  }

  // ---------------------------------------------------------------- theft: climbing on a stand's ski without paying
  try {
    game.on?.('enterVehicle', (e) => {
      const v = e?.vehicle;
      if (!v || !v.rentalSite || v.rentalPaid) return true;
      const S = R.sites.find((s) => s.def.id === v.rentalSite);
      say(
        game,
        ATTENDANT,
        ['Hey! HEY! That is not yours!', 'Get off my ski! Somebody call the cops!'][
          (Math.random() * 2) | 0
        ],
        2600,
        '#ff6b5a',
      );
      if (S?.attendant) {
        try {
          S.attendant.setPose('phone_text');
        } catch (e2) {
          /* */
        }
      }
      try {
        game.emit?.('crime', {
          type: 'vehicle_theft',
          position: game.player.position.clone(),
          severity: 1,
          by: 'witness',
          witnessed: true,
        });
      } catch (e2) {
        /* */
      }
      v.rentalSite = null;
      return true;
    });
  } catch (e) {
    /* */
  }

  game.updaters.push(function jetskiTick(dt) {
    if (!(dt > 0) || game.ui?.paused) return;
    skinAll(dt);
    rideFx(dt);
    rentalTick(dt);
  });
  H.api('jetskiRentals', {
    sites: R.sites,
    get rental() {
      return R.rental;
    },
    rent,
    endRental,
    skin,
    /** test hook: geometry of a site (stand, slots, return point) */
    locate: (id) => {
      const S = R.sites.find((s) => s.def.id === id);
      if (S && S.geo === undefined) S.geo = locate(S.def);
      return S?.geo || null;
    },
  });
}
