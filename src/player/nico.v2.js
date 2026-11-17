// Southline V2 — player character systems (CHARACTER track): game.wardrobe (clothes, saved outfits, police description),
// game.player.body (fat / muscle body change), and the wardrobe panel used by the home, fitting rooms and the main menu.
import { CATALOG, SLOTS, getPiece, DEFAULT_OUTFIT } from './wardrobe/outfit.js';
export const order = 40;
const KEY = 'portsolana.v2.wardrobe';
export async function initV2(game) {
  const ch = () => (game.playerCharacter?.isNico ? game.playerCharacter : null);
  let save = {}; try { save = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { save = {}; }
  save.owned ||= [];
  for (const p of CATALOG) {
    if (!p.price && !p.disguise && !save.owned.includes(p.id)) save.owned.push(p.id);     // free pieces added later (the teal shirt) reach old saves
  }
  save.outfits ||= {}; save.current ||= DEFAULT_OUTFIT.slice();
  // look v3 (Nov 13): Nico's signature outfit changed (open palm shirt over a tee, cargo pants); older saves move to it once
  if ((save.look || 0) < 3) {
    save.current = DEFAULT_OUTFIT.slice();
    delete save.fat;
    delete save.muscle;
    save.look = 3;
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
  }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
  const W = game.wardrobe = {
    slots: SLOTS.slice(), catalog: CATALOG,
    list(slot, o = {}) { return CATALOG.filter((p) => (!slot || p.slot === slot) && (!o.ownedOnly || save.owned.includes(p.id))).map((p) => ({ id: p.id, slot: p.slot, name: p.name, price: p.price, owned: save.owned.includes(p.id), disguise: p.disguise || null, color: p.colorName, signature: !!p.signature })); },
    owns(id) { return save.owned.includes(id); },
    give(id) { if (getPiece(id) && !save.owned.includes(id)) { save.owned.push(id); persist(); } return !!getPiece(id); },     // stores, pickups (dropped uniforms)
    wear(id) { const c = ch(); if (!c || !getPiece(id)) return false; const ok = c.outfit.wear(id); if (ok) { save.current = c.outfit.ids(); persist(); } return ok; },
    remove(slot) { const c = ch(); if (!c) return false; c.outfit.remove(slot); save.current = c.outfit.ids(); persist(); return true; },
    current() { return ch()?.outfit.current() || {}; },
    describe() { return ch()?.outfit.describe() || 'male'; },
    disguise() { return ch()?.outfit.disguise() || null; },
    saveOutfit(name) { const c = ch(); if (!c) return false; save.outfits[name || 'Outfit ' + (Object.keys(save.outfits).length + 1)] = c.outfit.ids(); persist(); return true; },
    loadOutfit(name) { const c = ch(); const ids = save.outfits[name]; if (!c || !ids) return false; c.outfit.set(ids); save.current = ids.slice(); persist(); return true; },
    outfits() { return Object.keys(save.outfits); },
    openUI(o = {}) { return openPanel(game, W, o); }, closeUI() { document.getElementById('ps-wardrobe')?.remove(); game.ui && (game.ui.wardrobeOpen = false); },
  };
  // body change: core-systems drives game.player.body.fat (0..1, 0.5 = Nico's normal build) and .muscle (0..1)
  const body = { _fat: save.fat ?? 0.5, _muscle: save.muscle ?? 0.8 };
  game.player.body = {
    get fat() { return body._fat; }, set fat(v) { body._fat = Math.min(1, Math.max(0, v)); const c = ch(); if (c) c.body.fat = body._fat; },
    get muscle() { return body._muscle; }, set muscle(v) { body._muscle = Math.min(1, Math.max(0, v)); const c = ch(); if (c) c.body.muscle = body._muscle; },
  };
  const apply = () => { const c = ch(); if (!c) return false; const ids = save.current.filter((id) => getPiece(id)); if (ids.length) c.outfit.set(ids); c.body.set({ fat: body._fat, muscle: body._muscle }); return true; };
  if (!apply()) { let n = 0; const t = setInterval(() => { if (apply() || ++n > 40) clearInterval(t); }, 500); }
}
function openPanel(game, W, o) {
  W.closeUI(); if (game.ui) game.ui.wardrobeOpen = true;
  const el = document.createElement('div'); el.id = 'ps-wardrobe';
  el.style.cssText = 'position:fixed;right:24px;top:24px;bottom:24px;width:340px;z-index:60;background:rgba(14,18,24,.88);backdrop-filter:blur(8px);border-radius:14px;color:#f2efe6;font:14px/1.35 "Archivo Black",system-ui,sans-serif;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.5)';
  let slot = o.slot || 'top';
  const draw = () => {
    const cur = W.current();
    el.innerHTML = `<div style="padding:16px 18px 8px;font-size:22px;letter-spacing:.08em;text-transform:uppercase">Wardrobe<span data-x style="float:right;cursor:pointer;opacity:.7">✕</span></div>
      <div style="padding:0 14px 8px;display:flex;gap:6px;flex-wrap:wrap">${W.slots.map((s) => `<span data-slot="${s}" style="cursor:pointer;padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.06em;background:${s === slot ? '#19a6a0' : 'rgba(255,255,255,.08)'}">${s}</span>`).join('')}</div>
      <div style="flex:1;overflow:auto;padding:4px 14px">${W.list(slot, { ownedOnly: !o.store }).map((p) => `<div data-id="${p.id}" style="cursor:pointer;padding:9px 10px;margin:4px 0;border-radius:8px;background:${cur[slot] === p.id ? 'rgba(25,166,160,.35)' : 'rgba(255,255,255,.05)'}">${p.name}${p.signature ? ' ★' : ''}<span style="float:right;opacity:.7">${p.owned ? (cur[slot] === p.id ? 'Wearing' : 'Owned') : '$' + p.price}</span></div>`).join('')}
      <div data-off style="cursor:pointer;padding:9px 10px;margin:4px 0;border-radius:8px;background:rgba(255,255,255,.05)">Take off</div></div>
      <div style="padding:10px 16px 14px;font-size:13px;opacity:.85">Police would see: ${W.describe()}<div data-save style="margin-top:8px;cursor:pointer;text-align:center;padding:8px;border-radius:8px;background:#e9684f;color:#fff;text-transform:uppercase;letter-spacing:.08em">Save outfit</div></div>`;
  };
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-slot],[data-id],[data-off],[data-save],[data-x]'); if (!t) return;
    if (t.dataset.slot) slot = t.dataset.slot; else if (t.dataset.id) { if (W.owns(t.dataset.id) || !o.store) W.wear(t.dataset.id); else if (o.onBuy?.(t.dataset.id)) { W.give(t.dataset.id); W.wear(t.dataset.id); } }
    else if ('off' in t.dataset) W.remove(slot); else if ('save' in t.dataset) W.saveOutfit(); else { W.closeUI(); return; }
    draw();
  });
  draw(); document.body.appendChild(el); return el;
}
