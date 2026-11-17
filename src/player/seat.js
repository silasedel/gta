// Southline — the player visibly sits in the driver's seat of cars (same seat point as the AI drivers in
// src/vehicles/vehicles.js addDriver), playing the 'drive' clip; hidden as before for boats, bikes, aircraft or
// anything without a car seat spec (an AI driver still in the seat is ejected by vehicles.js the next frame). enter() returns false when it did not seat him (the caller hides him then).
export function createPlayerSeat(game) {
  let cur = null;
  return {
    get seated() { return !!cur; },
    enter(ch, v) {
      try {
        const spec = v?.spec, shell = v?.car?.shell;
        if (!ch?.root || !spec || !shell || v.boat || v.isBoat || v.air || spec.bike || spec.boat) return false;
        if (![spec.zA, spec.belt, spec.roofY].every(Number.isFinite)) return false;
        const seatZ = spec.zA - (spec.coupe ? 1.15 : 1.25);
        ch.root.rotation.set(0, 0, 0);
        ch.root.position.set(0.38, Math.min(spec.belt - 0.09, spec.roofY - 0.88), seatZ + 0.2);
        shell.add(ch.root);
        ch.setVisible?.(true); ch.root.visible = true;
        ch.update?.(0.5, { driving: true, speed: 0, grounded: true });
        cur = { v, ch };
        return true;
      } catch (e) { cur = null; return false; }
    },
    update(dt) { if (cur) { try { cur.ch.update(dt, { driving: true, speed: 0, grounded: true }); } catch (e) { /* cosmetic */ } } },
    exit() {
      if (!cur) return;
      try { game.scene.add(cur.ch.root); cur.ch.root.rotation.set(0, 0, 0); } catch (e) { /* ignore */ }
      cur = null;
    },
  };
}
