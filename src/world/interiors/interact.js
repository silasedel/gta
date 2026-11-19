// Player interaction inside V2 interiors: look at an item -> E takes it (the arm reaches with two-bone IK, the item leaves the shelf
// and the gap stays) -> it is carried; G pockets it (concealed), F eats or drinks it, E at the register pays (cash) / R pays by card.
// Walking out with unpaid goods is shoplifting: clerk and cameras produce evidence events for the police track.
import * as THREE from 'three';
import { ItemField } from './items/field.js';
import { getProduct } from './items/catalog.js';
import { receiptCanvas } from './prints.js';
import { posScreen } from './fixtures/retail.js';
import { money } from './kit/util.js';

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _t = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _ax = new THREE.Vector3();
// analytic two-bone IK in world space (upper, lower, hand bones), blended by weight w
export function reachIK(upper, lower, hand, target, w) {
  if (!upper || !lower || !hand || w <= 0) return;
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  hand.getWorldPosition(_c);
  const lab = _a.distanceTo(_b),
    lcb = _b.distanceTo(_c),
    lat = Math.min(lab + lcb - 0.01, Math.max(0.05, _a.distanceTo(target)));
  const ang = (p, q, r) =>
    Math.acos(
      THREE.MathUtils.clamp(
        _t.copy(q).sub(p).normalize().dot(_ax.copy(r).sub(p).normalize()),
        -1,
        1,
      ),
    );
  const a0 = ang(_a, _c, _b),
    b0 = ang(_b, _a, _c),
    a1 = Math.acos(
      THREE.MathUtils.clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1),
    ),
    b1 = Math.acos(
      THREE.MathUtils.clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1),
    );
  const axis = _t.copy(_c).sub(_a).cross(_ax.copy(_b).sub(_a));
  if (axis.lengthSq() < 1e-8) axis.set(0, 0, 1);
  axis.normalize();
  const rot = (bone, q) => {
    const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion()),
      bw = bone.getWorldQuaternion(new THREE.Quaternion());
    const tgt = pw.invert().multiply(q.multiply(bw));
    bone.quaternion.slerp(tgt, w);
    bone.updateMatrixWorld(true);
  };
  rot(upper, _q.setFromAxisAngle(axis, a1 - a0));
  rot(lower, _q.setFromAxisAngle(axis, b1 - b0));
  hand.getWorldPosition(_c);
  rot(
    upper,
    _q2.setFromUnitVectors(_t.copy(_c).sub(_a).normalize(), _ax.copy(target).sub(_a).normalize()),
  );
}

export function createInteraction(game, engine) {
  const carry = []; // { pid, mesh, store, concealed, slot }
  let grab = null,
    helpShown = null,
    held = null;
  const notify = (t, ms = 2600) => {
    try {
      game.hud?.notify?.(t, ms);
    } catch (e) {
      /* */
    }
  };
  const help = (t) => {
    if (t === helpShown) return;
    helpShown = t;
    try {
      game.hud?.help?.(t);
    } catch (e) {
      /* */
    }
  };
  const bone = (n) => {
    try {
      return game.playerCharacter?.getBone?.(n) || null;
    } catch (e) {
      return null;
    }
  };
  const unpaid = (s) => carry.filter((c) => c.store === s && !c.paid);
  const seen = (s, pp) => {
    const b = s.built,
      l = s.toLocal(pp.x, pp.z, {});
    const clerk =
      (b.people || []).find(
        (p) =>
          p.staff &&
          !p.hidden &&
          Math.hypot(p.x - l.x, p.z - l.z) < 12 &&
          Math.sin(p.heading) * (l.x - p.x) + Math.cos(p.heading) * (l.z - p.z) > 0,
      ) || null;
    const cam =
      s.state.dvr !== false &&
      (b.ctx.cameras || []).some((c) => Math.hypot(c.x - l.x, c.z - l.z) < c.range);
    return { clerk, cam };
  };
  function attach(mesh) {
    const h = bone('RightHand');
    held = mesh;
    if (h) {
      h.attach(mesh);
      mesh.position.set(0, 0.06, 0.03);
      mesh.rotation.set(0, 0, 0);
      const s = 1 / (h.getWorldScale(_t).x || 1);
      mesh.scale.setScalar(s);
    } else {
      game.scene.add(mesh);
    }
  }
  function drop(c) {
    if (c.mesh) {
      c.mesh.removeFromParent();
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
  }
  function consume(c) {
    const p = getProduct(c.pid);
    notify(
      `${p.category === 'drink' ? 'Drank' : 'Ate'} ${p.name}${p.nutrition?.kcal != null ? ' · ' + p.nutrition.kcal + ' kcal' : ''}`,
    );
    try {
      game.emit?.('consume', { productId: c.pid, product: p, stolen: !c.paid, store: c.store });
    } catch (e) {
      /* */
    }
    if (!game.needs && p.nutrition)
      game.player.health = Math.min(
        100,
        (game.player.health || 0) + Math.min(25, p.nutrition.kcal / 20),
      );
    drop(c);
    carry.splice(carry.indexOf(c), 1);
    if (held === c.mesh) held = null;
  }
  function pay(s, method) {
    const items = unpaid(s).filter((c) => !c.concealed);
    if (!items.length) {
      notify(unpaid(s).length ? 'Clerk: "Anything else?"' : 'Nothing to pay for');
      return;
    }
    const P = game.player,
      lines = items.map((c) => ({ name: getProduct(c.pid).name, qty: 1, price: s.priceOf(c.pid) })),
      rc = receiptCanvas(s, lines, {
        hour: game.timeOfDay,
        method,
        day: game.day,
        cashier: (s.built.people.find((p) => p.staff)?.name || s.profile.owner).split(' ')[0],
      });
    const wallet = method === 'card' ? (P.bank ?? P.money ?? 0) : (P.money ?? 0);
    if (wallet < rc.total) {
      notify(method === 'card' ? 'Card declined' : 'Not enough cash');
      return;
    }
    if (method === 'card' && P.bank != null) P.bank -= rc.total;
    else P.money = Math.round((P.money - rc.total) * 100) / 100;
    for (const c of items) {
      c.paid = true;
      try {
        game.inventory?.add?.(c.pid, { store: s.key });
      } catch (e) {
        /* */
      }
    }
    notify(`Paid ${money(rc.total)} (${method}) at ${s.name}`);
    try {
      game.audio?.play?.('cash', { position: s.center });
    } catch (e) {
      /* */
    }
    try {
      const reg = s.built.uses.find((u) => u.kind === 'register');
      reg.lastReceipt = rc;
      s.built.ctx && s.built.uses.find((u) => u.kind === 'register') && (s.lastReceipt = rc);
      const scr = s.built.prints.local.cells.get('scr:pos');
      if (scr)
        s.built.prints.local.redraw(scr, (g, w, h) =>
          posScreen(
            g,
            w,
            h,
            s,
            lines.map((l) => [l.name, l.price.toFixed(2)]),
            rc.total,
            'PAID · THANK YOU',
          ),
        );
    } catch (e) {
      /* */
    }
    try {
      game.emit?.('purchase', {
        store: s,
        items: items.map((c) => c.pid),
        total: rc.total,
        method,
        receipt: rc.canvas,
      });
    } catch (e) {
      /* */
    }
  }
  function theft(s, list, how) {
    const P = game.player,
      w = seen(s, P.position),
      value = list.reduce((a, c) => a + s.priceOf(c.pid), 0);
    for (const c of list) {
      c.paid = true;
      c.stolen = true;
      try {
        game.inventory?.add?.(c.pid, { stolen: true, store: s.key });
      } catch (e) {
        /* */
      }
    }
    const witnessed = !!(w.clerk || w.cam);
    try {
      game.emit?.('crime', {
        type: 'shoplift',
        position: P.position.clone(),
        severity: value > 50 ? 2 : 1,
        witnessed,
        store: s,
        value,
      });
      if (w.clerk)
        game.emit?.('evidence', {
          kind: 'witness',
          source: 'clerk',
          store: s.key,
          position: s.center.clone(),
          describes: ['face', 'outfit'],
          crime: 'shoplift',
          value,
        });
      if (w.cam)
        game.emit?.('evidence', {
          kind: 'camera',
          source: 'cctv',
          store: s.key,
          position: s.center.clone(),
          describes: ['face', 'outfit'],
          crime: 'shoplift',
          recorder: s.key,
          value,
        });
    } catch (e) {
      /* */
    }
    notify(
      witnessed
        ? w.clerk
          ? 'Clerk: "Hey! You did not pay for that!"'
          : 'The camera caught you walking out'
        : `Walked out with ${list.length} unpaid item${list.length > 1 ? 's' : ''} (${how})`,
      3200,
    );
  }
  function useThing(s, u) {
    const P = game.player;
    if (u.kind === 'register') return;
    if (u.kind === 'switch') {
      s.state.lights = s.state.lights === false;
      notify(s.state.lights ? 'Lights on' : 'Lights off');
      return;
    }
    if (u.kind === 'dvr') {
      if (s.state.dvr === false) return notify('The recorder is already dead');
      s.state.dvr = false;
      notify('Recorder destroyed: no camera evidence from this store', 3200);
      try {
        game.emit?.('evidence-destroyed', { kind: 'camera', store: s.key });
        game.audio?.play?.('glass', { position: s.center });
      } catch (e) {
        /* */
      }
      return;
    }
    if (u.kind === 'pour' && u.gives) {
      const m = ItemField.mesh(u.gives);
      carry.push({ pid: u.gives, mesh: m, store: s, concealed: false });
      if (held) held.visible = false;
      attach(m);
      notify(`${getProduct(u.gives).name} · pay at the register`);
      return;
    }
    if (u.kind === 'lotto') {
      const pid = u.pids[Math.floor(Math.random() * u.pids.length)],
        p = getProduct(pid);
      if ((P.money || 0) < p.price) return notify('Not enough cash');
      P.money -= p.price;
      const r = Math.random(),
        win =
          r < 0.0004
            ? p.scratch.top / 100
            : r < 0.01
              ? p.price * 20
              : r < 0.06
                ? p.price * 4
                : r < 0.24
                  ? p.price
                  : 0;
      P.money += win;
      notify(win ? `${p.name}: you won ${money(win)}!` : `${p.name}: not a winner`, 3200);
      try {
        game.emit?.('lottery', { productId: pid, win, store: s });
      } catch (e) {
        /* */
      }
      return;
    }
    if (u.kind === 'atm') {
      try {
        if (game.emit?.('atm', { store: s }) !== false && !game.bank)
          notify('ATM: insert card (banking arrives with the phone app)');
      } catch (e) {
        /* */
      }
      return;
    }
    if (u.kind === 'safe') {
      try {
        game.emit?.('safe', { store: s, safe: u });
      } catch (e) {
        /* */
      }
      notify(u.locked ? 'Safe: time lock engaged' : 'Safe is open');
      return;
    }
    try {
      u.onUse?.({ game, store: s, use: u, notify });
    } catch (e) {
      console.error(e);
    }
  }
  function update(dt, s) {
    const P = game.player,
      inp = game.input;
    if (!P) return;
    // finish a running grab: reach (0..0.35 s) -> grip -> lift (to 0.8 s); IK runs after the character animation
    if (grab) {
      grab.t += dt;
      const k = grab.t < 0.35 ? grab.t / 0.35 : Math.max(0, 1 - (grab.t - 0.42) / 0.38),
        w = k * k * (3 - 2 * k);
      reachIK(
        bone('RightArm'),
        bone('RightForeArm'),
        bone('RightHand'),
        grab.target,
        Math.min(1, w),
      );
      if (grab.t >= 0.38 && !grab.taken) {
        grab.taken = true;
        const m = grab.store.built.items.take(grab.slot);
        if (m) {
          carry.push({
            pid: grab.slot.pid,
            mesh: m,
            store: grab.store,
            concealed: false,
            slot: grab.slot,
          });
          if (held) held.visible = false;
          attach(m);
        }
      }
      if (grab.t > 0.8) {
        if (grab.host) grab.host.t = 0.8;
        if (P.script === grab.script) P.script = null;
        grab = null;
      }
      return;
    }
    if (!s || !s.built?.visible) {
      help(null);
      return;
    }
    const b = s.built,
      pp = P.position,
      l = s.toLocal(pp.x, pp.z, {}),
      yaw = game.cameraYaw != null ? game.cameraYaw + Math.PI : P.heading,
      wy = yaw - s.facing,
      dx = Math.sin(wy),
      dz = Math.cos(wy),
      py = pp.y - s.baseY + 1.35;
    const slot = b.items.nearest(l.x, py, l.z, dx, dz, 1.2),
      cur = carry[carry.length - 1],
      near = b.uses
        .filter((u) => Math.hypot(u.x - l.x, u.z - l.z) < u.r)
        .sort((p, q) => Math.hypot(p.x - l.x, p.z - l.z) - Math.hypot(q.x - l.x, q.z - l.z))[0];
    const mine = unpaid(s),
      open = mine.filter((c) => !c.concealed);
    let h = '';
    if (near?.kind === 'register' && open.length)
      h = `E  Pay cash ${money(open.reduce((a, c) => a + s.priceOf(c.pid), 0) * 1.07)}   ·   R  Pay by card`;
    else if (near && near.kind !== 'register')
      h = `E  ${near.label || { switch: 'Light switch', dvr: s.state.dvr === false ? 'Recorder (destroyed)' : 'Smash the camera recorder', lotto: 'Buy a scratch-off', atm: 'Use ATM', safe: 'Safe', pour: 'Pour' }[near.kind] || 'Use'}`;
    else if (slot) {
      const p = getProduct(slot.pid);
      h = `E  Take ${p.name} ${money(s.priceOf(slot.pid))}`;
    }
    if (cur && cur.store === s && !cur.paid && !cur.concealed)
      h += `${h ? '   ·   ' : ''}G  Pocket   ·   F  ${getProduct(cur.pid).category === 'drink' ? 'Drink' : getProduct(cur.pid).category === 'food' ? 'Eat' : 'Use'}   ·   X  Put back`;
    help(h || null);
    if (inp?.pressed?.('KeyE')) {
      if (near?.kind === 'register' && open.length) pay(s, 'cash');
      else if (near && near.kind !== 'register') useThing(s, near);
      else if (slot) {
        const w = s.toWorld(slot.x, slot.z, new THREE.Vector3());
        w.y = s.baseY + slot.y + 0.06;
        P.heading = Math.atan2(w.x - pp.x, w.z - pp.z);
        const script = { lock: true, fixed() {}, anim: { speed: 0, grounded: true } };
        P.script = script;
        if (slot.host) {
          slot.host.want = 1;
          slot.host.t = 9;
        }
        grab = {
          t: slot.host && slot.host.open < 0.5 ? -0.3 : 0,
          slot,
          store: s,
          target: w,
          host: slot.host,
          script,
        };
      }
    } else if (inp?.pressed?.('KeyR') && near?.kind === 'register') pay(s, 'card');
    else if (cur && cur.store === s && !cur.paid) {
      if (inp?.pressed?.('KeyG') && !cur.concealed) {
        cur.concealed = true;
        drop(cur);
        held = null;
        const w = seen(s, pp);
        notify(
          `Pocketed ${getProduct(cur.pid).name}${w.clerk ? ' · the clerk is watching you' : ''}`,
        );
        if (w.clerk) {
          s.suspicion = (s.suspicion || 0) + 1;
          try {
            game.emit?.('suspicion', { store: s, by: w.clerk, reason: 'concealed' });
          } catch (e) {
            /* */
          }
        }
      } else if (inp?.pressed?.('KeyF') && !cur.concealed) consume(cur);
      else if (inp?.pressed?.('KeyX') && !cur.concealed && cur.slot) {
        b.items.putBack(cur.slot);
        drop(cur);
        held = null;
        carry.pop();
      }
    }
  }
  return {
    update,
    carry,
    entered(s) {
      if (s.state.banned) notify(`${s.name}: "You are not welcome here."`);
      else notify(`${s.name}${s.open ? '' : ' (closed)'}`, 2200);
    },
    left(s) {
      const u = unpaid(s);
      if (u.length) theft(s, u, u.every((c) => c.concealed) ? 'concealed' : 'in plain sight');
      for (const c of carry.filter((x) => x.store === s && x.paid && !x.mesh))
        carry.splice(carry.indexOf(c), 1);
    },
    forget() {},
    pay,
    unpaid,
  };
}
