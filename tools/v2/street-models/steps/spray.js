(() => { const h = __findKind('hydrant', game.player.position.x, game.player.position.z, 400)[0]; if (!h) return 'none';
  game.emit('propBreak', { kind: 'hydrant', point: { x: h.x, y: h.y + 0.4, z: h.z } });
  window.__lookAt(h.x, h.y + 1.5, h.z, 9, 2.0, 0.5); return JSON.stringify(h); })()
