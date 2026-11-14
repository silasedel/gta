// Port Solana multiplayer entry (MULTIPLAYER track). Costs nothing offline: without `?mp=` in the URL this
// module returns at once and loads no network code.
//   ?mp=ws://host:port&room=CODE&name=Nico      join (or create) a room
//   &mpLag=100&mpJitter=30&mpLoss=2             optional link simulation (ms, ms, percent) for testing
export const order = 200;

export async function initV2(game) {
  const q = new URLSearchParams(location.search);
  const url = q.get('mp');
  if (!url) {
    return;
  }
  const { startSession } = await import('./session.js');
  game.net = await startSession(game, {
    url,
    room: q.get('room') || '',
    name: q.get('name') || 'Player',
    link: {
      lag: Number(q.get('mpLag')) || 0,
      jitter: Number(q.get('mpJitter')) || 0,
      loss: (Number(q.get('mpLoss')) || 0) / 100,
    },
  });
}
