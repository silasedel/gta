// Wavvy: the city's social feed. Real posts from game.news (channels 'social' and 'phone'), photos you post from the
// Camera, and a few locals. Likes persist in the phone's save slice.
import './apps.css';

const LOCALS = [
  { id: 'l1', user: 'sunsetsally', name: 'Sally', text: 'Golden hour on the causeway never misses.', bg: 'linear-gradient(160deg,#ff9a5a,#ff5f8a 55%,#5a3c8a)', likes: 2481 },
  { id: 'l2', user: 'calleocho_eats', name: 'Calle Ocho Eats', text: 'Late-night croquetas, open till 4. Line around the block.', bg: 'linear-gradient(160deg,#ffb35a,#c2410c 70%,#3b1d0b)', likes: 932 },
  { id: 'l3', user: 'keypaloma_tides', name: 'Key Paloma Tides', text: 'Flats are glassy this morning. Tarpon rolling off the bridge.', bg: 'linear-gradient(170deg,#0e7490,#22d3ee 60%,#e0f2fe)', likes: 517 },
  { id: 'l4', user: 'southline_pd', name: 'Southline PD', text: 'Reminder: the speed limit on the causeway is not a suggestion.', bg: 'linear-gradient(160deg,#1e3a8a,#0f172a)', likes: 17 },
];

export default function wavvyApp(os) {
  const { esc, GLYPH: G, game, data } = os;
  function feed() {
    const out = [];
    for (const p of os.posts || []) out.push({ id: 'me' + p.t, user: 'nico', name: 'Nico', text: 'Out here.', img: p.img, likes: p.likes, t: p.t, me: true });
    try { for (const s of game.news?.feed?.({ channel: 'social', limit: 6 }) || []) out.push({ id: 'n' + (s.id ?? s.headline), user: (game.news?.outlet?.(s.kind) || 'southline_news').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: game.news?.outlet?.(s.kind) || 'Southline News', text: s.headline + (s.body ? ` ${s.body}` : ''), bg: s.kind === 'crime' ? 'linear-gradient(160deg,#7f1d1d,#111827)' : s.kind === 'weather' ? 'linear-gradient(160deg,#1d4ed8,#93c5fd)' : 'linear-gradient(160deg,#334155,#0f172a)', likes: 40 + (String(s.headline).length * 7) % 900, news: true }); } catch (e) { /* */ }
    return out.concat(LOCALS);
  }
  function page(app) {
    const L = data.S.likes;
    return {
      titleHTML: '<span class="wv-logo">wavvy</span>', large: false, back: false, cls: 'wv-page',
      body: `<div class="wv-stories">${['You', 'Sally', 'Eats', 'Tides', 'Marina', 'Wynwood'].map((n, i) => `<span class="wv-story ${i ? '' : 'me'}"><i style="--h:${i * 52}">${i ? n[0] : '+'}</i><small>${n}</small></span>`).join('')}</div>
        ${feed().map((p) => `<article class="wv-post"><header>${p.me ? '<span class="kp-av" style="--s:34px;--h:28">N</span>' : `<span class="kp-av" style="--s:34px;--h:${(p.user.length * 47) % 360}">${esc(p.name[0])}</span>`}<span><b>${esc(p.user)}</b><small>${p.news ? 'News' : p.me ? 'Just now' : 'Southline'}</small></span>${G.dots}</header>
          <div class="wv-img" style="${p.img ? '' : `background:${p.bg}`}">${p.img ? `<img src="${p.img}" alt="">` : p.news ? `<b>${esc(p.text.split('. ')[0])}</b>` : ''}</div>
          <footer><button class="wv-like ${L[p.id] ? 'on' : ''}" data-act="like" data-id="${esc(p.id)}" data-f>${L[p.id] ? G.heart : G.heartLine}</button>${G.message}${G.send}</footer>
          <div class="wv-meta"><b>${(p.likes + (L[p.id] ? 1 : 0)).toLocaleString('en-US')} likes</b><p><b>${esc(p.user)}</b> ${esc(p.text)}</p></div></article>`).join('')}`,
      acts: { like: (el) => { const id = el.dataset.id; L[id] = !L[id]; if (!L[id]) delete L[id]; el.classList.toggle('on', !!L[id]); el.innerHTML = L[id] ? G.heart : G.heartLine; if (L[id]) el.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,1.4,.4,1)' }); const m = el.closest('.wv-post').querySelector('.wv-meta > b'); const n = parseInt(m.textContent.replace(/\D/g, ''), 10) + (L[id] ? 1 : -1); m.textContent = `${n.toLocaleString('en-US')} likes`; os.sound('tick', 0.4); } },
    };
  }
  return { id: 'wavvy', name: 'Wavvy', launch(app) { os.push(page(app), { instant: true, sound: false }); } };
}
