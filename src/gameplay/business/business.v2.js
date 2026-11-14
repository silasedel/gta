// Businesses you can buy (v2.1): a nightclub, a car wash and a convenience store at real storefronts. Walk into the
// green marker and press E to buy or manage. The simulation (income per game hour, staff, upgrades, raids) is
// src/systems/business.js; this module places them, runs the events (robberies you defend, inspections, supply
// runs) and the management panel. Exposes game.club.open for the club music.
import { fmt, dist2, help, notify, canAct, getPanel, makeMarker, spawnKitPed, pedOut, release, keepFighting, fireAtPlayer } from '../../jobs/kit.js';

export const order = 125;

const SITES = [
  { id: 'biz_club', type: 'nightclub', name: 'Velvet Undertow', kinds: ['nightclub'], districts: ['South Beach'], prefer: 39, price: 650000 },
  { id: 'biz_wash', type: 'car_wash', name: 'Bayside Suds Car Wash', kinds: ['car_repair', 'car', 'tyres'], districts: ['South Beach', 'Bayshore', 'Edgewater'], prefer: 682, price: 95000 },
  { id: 'biz_store', type: 'convenience', name: 'Night Owl Mart', kinds: ['convenience'], districts: ['Downtown', 'Overtown'], prefer: 72, price: 60000 },
];
const ROBBER_KIT = {
  top: [0x2b2b2b, 0x3a3f45, 0x1c1c1c],
  bottom: [0x1c1c1c, 0x2a2f3a],
  shoes: [0x111111],
  hats: ['beanie'],
  chain: 0,
};
const LINES = ['staff', 'security', 'decor'];

export async function initV2(game) {
  const B = game.business;
  const sf = game.city?.storefronts || [];
  if (!B || !sf.length) {
    console.warn('[business] needs game.business (systems.v2.js) and storefronts');
    return;
  }
  // ---------------------------------------------------------------- place the sites on real storefronts
  const sites = [];
  for (const s of SITES) {
    let f = sf.find((x) => x.id === s.prefer && s.kinds.includes(x.kind));
    if (!f) f = sf.find((x) => s.kinds.includes(x.kind) && s.districts.includes(x.district));
    if (!f) continue;
    let dx = f.fx - f.x;
    let dz = f.fz - f.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const site = { ...s, x: f.fx + dx * 2.2, z: f.fz + dz * 2.2, street: f.street, district: f.district, front: { dx, dz } };
    sites.push(site);
    B.addListing({ id: s.id, type: s.type, name: s.name, district: f.district, price: s.price, seller: 'Coastline Business Brokers' });
    site.marker = makeMarker(game, site, 0x55e08a, { r: 0.7, h: 0.5 });
    site.marker.userData.ring.material = site.marker.userData.ring.material.clone();
  }
  const SITE = Object.fromEntries(sites.map((s) => [s.id, s]));

  // ---------------------------------------------------------------- events: robberies, inspections, supply runs
  const ev = { robbery: null, supply: null, log: [] };
  const logEvent = (id, text) => {
    ev.log.unshift({ id, text, day: game.time?.day || 1, clock: game.time?.clockText?.() || '' });
    if (ev.log.length > 20) ev.log.length = 20;
  };
  game.on?.('businessRaid', (e) => {
    const s = SITE[e.id];
    if (!s) return;
    ev.robbery = { id: e.id, deadline: e.deadline, n: Math.min(5, e.attackers || 4), started: false, robbers: [] };
    notify(game, `${s.name} is being robbed! Get there to defend it.`, 5000);
    game.waypoint = { x: s.x, z: s.z };
    logEvent(e.id, 'Robbery reported');
  });
  game.on?.('businessRaidResult', (e) => {
    const s = SITE[e.id];
    if (!s) return;
    logEvent(e.id, e.defended ? 'Robbery fought off' : `Robbed: lost ${fmt(e.lost)}`);
    if (!e.defended) notify(game, `${s.name} was robbed. Lost ${fmt(e.lost)} from the safe.`, 4000);
  });
  function robberyTick(dt) {
    const r = ev.robbery;
    const s = SITE[r.id];
    const P = game.player.position;
    if (!B.raid.pending(r.id)) {
      for (const p of r.robbers) release(p);
      ev.robbery = null;
      return;
    }
    if (!r.started && dist2(P, s) < 55) {
      r.started = true;
      game.save?.inhibit?.('robbery');
      for (let i = 0; i < r.n; i++) {
        const p = spawnKitPed(game, { x: s.x + s.front.dx * 4 + (i - r.n / 2) * 1.4, z: s.z + s.front.dz * 4 }, ROBBER_KIT, 900 + i, { tag: { robber: r.id } });
        if (p) {
          p.armed = i === 0;
          r.robbers.push(p);
        }
      }
      game.hud?.setMission?.(`Stop the robbery at ${s.name}`);
    }
    if (!r.started) return;
    const alive = r.robbers.filter((p) => !pedOut(p));
    for (const p of alive) {
      const d = dist2(p.pos, P);
      if (p.armed && d > 4 && d < 30) {
        p.state = 'watch';
        p.stateT = 3;
        p.heading = Math.atan2(P.x - p.pos.x, P.z - p.pos.z);
        p._shot = (p._shot ?? 1) - dt;
        if (p._shot <= 0) {
          p._shot = 1.8 + Math.random();
          fireAtPlayer(game, p.pos, 0.25, 6);
        }
      } else keepFighting(p);
    }
    if (!alive.length) {
      B.raid.resolve(r.id, { defended: true });
      const bonus = 250;
      game.wallet?.earn?.(bonus, { category: 'business', memo: `${s.name}: robbers' dropped cash`, hot: true });
      notify(game, `Robbery stopped. The crew is grateful and the safe is safe. +${fmt(bonus)}`, 4000);
      game.hud?.setMission?.(null);
      game.save?.release?.('robbery');
      for (const p of r.robbers) release(p);
      ev.robbery = null;
    } else if (dist2(P, s) > 160 || game.ui?.dead) {
      // walked away: the crew on shift deals with it
      B.raid.resolve(r.id, {});
      game.hud?.setMission?.(null);
      game.save?.release?.('robbery');
      for (const p of r.robbers) release(p);
      ev.robbery = null;
    }
  }
  // every 8 game hours each owned business may get an event
  game.time?.every?.(480, () => {
    for (const b of B.owned()) {
      const s = SITE[b.id];
      if (!s) continue;
      const sec = B.security(b.id);
      const roll = Math.random();
      if (roll < 0.3 * (1 - sec) && !B.raid.pending(b.id) && !ev.robbery) B.raid.start(b.id, { attackers: 3 + Math.floor(Math.random() * 2), windowMinutes: 120 });
      else if (roll < 0.55) inspection(b);
      if ((b.stock ?? 1) < 0.35) {
        notify(game, `${s.name} is running low on stock. Open its panel for a supply run.`, 4000);
        logEvent(b.id, 'Stock low');
      }
    }
  }, { id: 'biz:events', catchUp: 'last' });
  function inspection(b) {
    const s = SITE[b.id];
    const tiers = Object.keys(b.upgrades).filter((k) => /^(decor|staff)_/.test(k)).length;
    const pass = Math.random() < 0.45 + tiers * 0.13 + (b.reputation - 0.45) * 0.5;
    if (pass) {
      logEvent(b.id, 'Health and safety inspection: passed');
      notify(game, `${s.name} passed its inspection.`, 2600);
    } else {
      const fine = Math.round(b.price * 0.006 / 50) * 50 + 200;
      game.fines?.issue?.({ kind: 'court', amount: fine, note: `${s.name}: code violations` });
      logEvent(b.id, `Inspection failed: ${fmt(fine)} fine (mailed)`);
      notify(game, `${s.name} failed an inspection. ${fmt(fine)} fine in the mail. Upgrades help.`, 3600);
    }
    game.emit?.('businessInspection', { id: b.id, pass });
  }
  // supply run: drive to a wholesaler, pick up the crates, bring them back
  function startSupply(id) {
    const s = SITE[id];
    const P = game.player.position;
    const cands = sf.filter((x) => (x.kind === 'supermarket' || x.kind === 'wholesale' || x.kind === 'hardware') && dist2(x, s) > 300 && dist2(x, s) < 1600);
    const w = cands[Math.floor(Math.random() * cands.length)] || sf.find((x) => dist2(x, s) > 400);
    if (!w) return;
    ev.supply = { id, stage: 0, at: { x: w.fx, z: w.fz }, marker: makeMarker(game, { x: w.fx, z: w.fz }, 0xffd25a), start: game.time?.now || 0 };
    game.waypoint = { x: w.fx, z: w.fz };
    game.hud?.setMission?.(`Supply run for ${s.name}: pick up the order (${w.street || 'wholesaler'})`);
    notify(game, 'Supply run started. Pick up at the yellow marker.', 3000);
    void P;
  }
  function supplyTick() {
    const sp = ev.supply;
    const P = game.player.position;
    const s = SITE[sp.id];
    if (dist2(P, sp.at) < 8) {
      if (sp.stage === 0) {
        sp.stage = 1;
        game.scene.remove(sp.marker);
        sp.at = { x: s.x, z: s.z };
        sp.marker = makeMarker(game, sp.at, 0xffd25a);
        game.waypoint = { x: s.x, z: s.z };
        game.hud?.setMission?.(`Bring the crates back to ${s.name}`);
        notify(game, 'Crates loaded. Back to the business.', 2500);
      } else {
        game.scene.remove(sp.marker);
        B.restock(sp.id);
        const pay = game.wallet?.pay?.(350, { to: 'Wholesaler', category: 'business', memo: `${s.name}: restock`, accepts: ['bank', 'cash'] });
        notify(game, `${s.name} restocked${pay?.ok ? ' (-$350 wholesale)' : ''}. Customers are back.`, 3500);
        logEvent(sp.id, 'Supply run done: fully stocked');
        game.hud?.setMission?.(null);
        game.waypoint = null;
        ev.supply = null;
      }
    }
  }

  // ---------------------------------------------------------------- management panel
  const panel = getPanel(game);
  const T = B.types;
  function estDaily(type) {
    const t = T[type];
    return Math.round(t.customers * t.ticket * (1 - t.cogs) * 8 - t.fixedDaily);
  }
  function openPanel(id) {
    const s = SITE[id];
    const b = B.get(id);
    const t = T[s.type];
    if (!b) {
      const html = `<h2>${s.name}</h2><div class="sub">${t.name} · ${s.street}, ${s.district}</div>
        <div class="row"><span>Asking price</span><b>${fmt(s.price)}</b></div>
        <div class="row"><span>Rough daily profit</span><b>${fmt(estDaily(s.type))}</b></div>
        <div class="row"><span>Your cash / bank</span><b>${fmt(game.wallet.cash)} / ${fmt(game.bank.balance)}</b></div>`;
      panel.show('biz', html, [
        { label: 'Buy it (bank first, then cash)', price: fmt(s.price), fn: () => buy(id) },
        { label: 'Leave', fn: () => panel.hide() },
      ]);
      return;
    }
    const today = b.today || {};
    const last = b.history[b.history.length - 1];
    const ups = [];
    for (const line of LINES) {
      const k1 = line + '_1';
      const k2 = line + '_2';
      const key = !b.upgrades[k1] ? k1 : !b.upgrades[k2] ? k2 : null;
      if (!key) {
        ups.push({ label: `${cap(line)}: maxed`, disabled: true, fn: () => {} });
        continue;
      }
      const u = t.upgrades[key];
      ups.push({ label: `${cap(line)} ${u.tier}: ${u.name}`, price: fmt(B.upgradeCost(id, key)), fn: () => upgrade(id, key) });
    }
    const raid = B.raid.pending(id);
    const html = `<h2>${b.name}</h2><div class="sub">${t.name} · ${s.street} · ${b.open ? '<span class="tag" style="background:#1f7a46">OPEN</span>' : '<span class="tag" style="background:#5b6475">CLOSED</span>'}</div>
      <div class="row"><span>Cash in the safe</span><span class="big">${fmt(b.safe)}</span></div>
      <div class="row"><span>Today so far</span><b>${Math.round(today.customers || 0)} customers · ${fmt(today.revenue || 0)}</b></div>
      ${last ? `<div class="row"><span>Yesterday's profit</span><b>${fmt(last.profit)}</b></div>` : ''}
      <div class="row"><span>Reputation</span><b>${Math.round(b.reputation * 100)}%</b></div>
      <div class="row"><span>Stock</span><b>${Math.round((b.stock ?? 1) * 100)}%</b></div>
      <div class="row"><span>Security</span><b>${Math.round(B.security(id) * 100)}%</b></div>
      <div class="row"><span>Staff</span><b>${b.staff.length}</b></div>
      ${raid ? '<div class="row" style="color:#ff6b5a"><b>Robbery in progress!</b></div>' : ''}
      <h3>Recent</h3>${ev.log.filter((e) => e.id === id).slice(0, 3).map((e) => `<div class="row"><span>${e.text}</span><small>Day ${e.day} ${e.clock}</small></div>`).join('') || '<div class="row"><span>Quiet so far</span></div>'}
      <h3>Actions</h3>`;
    const app = B.applicants(id).sort((a, c) => c.skill - a.skill)[0];
    panel.show('biz', html, [
      { label: 'Collect the safe', price: fmt(Math.max(0, b.safe)), disabled: b.safe < 1, fn: () => { const a = B.collect(id); notify(game, `Collected ${fmt(a)}.`, 2000); openPanel(id); } },
      ...ups,
      { label: app ? `Hire ${app.name} (${app.role.replace(/_/g, ' ')}, skill ${Math.round(app.skill * 100)})` : 'No applicants today', price: app ? `$${app.wage}/h` : '', disabled: !app, fn: () => { B.hire(id, app.id); openPanel(id); } },
      { label: ev.supply ? 'Supply run in progress' : 'Start a supply run (restock)', disabled: !!ev.supply, fn: () => { panel.hide(); startSupply(id); } },
      { label: 'Close', fn: () => panel.hide() },
    ]);
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  function buy(id) {
    const s = SITE[id];
    // big purchases come out of the bank first: move cash across if the bank alone is short
    const r = B.buy(id);
    if (!r.ok) {
      notify(game, r.reason === 'insufficient' || r.reason === 'card_declined' ? `You need ${fmt(s.price)} in the bank or in cash.` : `Could not buy: ${r.reason}`, 3000);
      return;
    }
    notify(game, `You own ${s.name}. It earns every hour it is open.`, 4000);
    s.marker.userData.ring.material.color.setHex(0x2fe0d0);
    game.save?.requestAutosave?.(2);
    clubSync();
    openPanel(id);
  }
  function upgrade(id, key) {
    const r = B.upgrade(id, key);
    if (!r.ok) notify(game, r.reason === 'needs_tier_1' ? 'Build tier 1 first.' : `Not enough money (${fmt(r.cost || 0)}).`, 2500);
    else notify(game, `Upgrade done (-${fmt(r.cost)}).`, 2000);
    openPanel(id);
  }

  // ---------------------------------------------------------------- club state for the audio track
  const clubSite = sites.find((s) => s.type === 'nightclub');
  let clubWas = null;
  game.club = {
    get open() {
      const b = clubSite && B.get(clubSite.id);
      return !!(b && b.open);
    },
    get owned() {
      return !!(clubSite && B.get(clubSite.id));
    },
    id: clubSite?.id || null,
    name: clubSite?.name || null,
    pos: clubSite ? { x: clubSite.x, z: clubSite.z } : null,
  };
  function clubSync() {
    const o = game.club.open;
    if (o !== clubWas) {
      clubWas = o;
      game.emit?.(o ? 'clubOpen' : 'clubClosed', { id: game.club.id, pos: game.club.pos });
    }
  }

  // ---------------------------------------------------------------- frame update
  let syncT = 0;
  game.updaters.push(function businessTick(dt) {
    if (!(dt > 0) || game.ui?.paused) return;
    const P = game.player;
    let prompt = null;
    for (const s of sites) {
      s.marker.userData.ring.rotation.z += dt * 0.8;
      s.marker.children[0].visible = dist2(P.position, s) > 4;
      if (!canAct(game) || P.state?.inVehicle || dist2(P.position, s) > 3.2) continue;
      const b = B.get(s.id);
      prompt = b ? `${s.name} · safe ${fmt(b.safe)} · <b>E</b> manage` : `${s.name} for sale · ${fmt(s.price)} · <b>E</b> view`;
      if (game.input.pressed('KeyE')) openPanel(s.id);
    }
    help(game, 'biz', prompt);
    if (panel.open && panel.owner === 'biz' && !sites.some((s) => dist2(P.position, s) < 6)) panel.hide();
    if (ev.robbery) robberyTick(dt);
    if (ev.supply) supplyTick();
    syncT -= dt;
    if (syncT <= 0) {
      syncT = 2;
      clubSync();
    }
  });
  game.on?.('loaded', () => {
    for (const s of sites) {
      const owned = !!B.get(s.id);
      s.marker.userData.ring.material.color.setHex(owned ? 0x2fe0d0 : 0x55e08a);
    }
    clubSync();
  });

  // map layer: business sites
  game.mapLayers = game.mapLayers || [];
  game.mapLayers.push({
    id: 'business',
    name: 'Businesses',
    enabled: true,
    draw(g, toScreen) {
      for (const s of sites) {
        const [x, y] = toScreen(s.x, s.z);
        const owned = !!B.get(s.id);
        g.fillStyle = owned ? '#2fe0d0' : '#55e08a';
        g.fillRect(x - 7, y - 7, 14, 14);
        g.fillStyle = '#081014';
        g.font = '800 11px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('$', x, y + 4);
      }
    },
    legend: () => [['#55e08a', 'Business for sale'], ['#2fe0d0', 'Your business']],
  });
  game.bizSites = { sites, open: openPanel, events: ev, startSupply, inspection: (id) => inspection(B.get(id)) };
}
