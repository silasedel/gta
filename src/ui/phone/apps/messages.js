// Messages: threads with the in-world cast, side-job clients, bank alerts and ticket notices (data.js). Money sent from
// the bank app shows as a money bubble; ticket notices link to the bank's ticket page. Quick replies keep it alive.
import './apps.css';

const REPLIES = {
  family: [
    'Love you too. Eat something.',
    'Call me tonight, ok?',
    'Your tío says hi. Bring the cooler.',
  ],
  fixer: ["Don't make me wait, sunshine.", 'Keep your head down.', 'Good. Stay reachable.'],
  garage: ['Bring it by after six.', "Yeah yeah. I'm under a car."],
  friend: ['Ha. Sounds good.', 'For sure. Hit me up later.', 'Bet.'],
  client: ['Noted.', 'We will be in touch.'],
  staff: ['On it, boss.', 'Thanks, boss.'],
};

export default function messagesApp(os) {
  const { esc, GLYPH: G, data } = os;
  function listPage(app, q = '') {
    const th = data
      .threadList()
      .filter(
        (t) => !q || (t.contact.name + ' ' + t.last.text).toLowerCase().includes(q.toLowerCase()),
      );
    return {
      title: 'Messages',
      large: true,
      back: false,
      right: `<button class="kp-nav-btn" data-act="compose" data-f>${G.plus}</button>`,
      body: `<div class="kp-search">${G.search}<input class="kp-input" placeholder="Search" value="${esc(q)}" data-f></div>
        ${
          th.length
            ? `<div class="ms-list">${th
                .map(
                  (t) => `<div class="ms-th" data-act="open" data-id="${esc(t.id)}" data-f>
            <i class="ms-dot ${t.unread ? 'on' : ''}"></i>${os.contactAvatar(t.contact, 52)}
            <span class="ms-th-t"><span class="ms-th-top"><b>${esc(t.contact.name)}</b><small>${esc(os.when(t.last.t))}</small><span class="kp-chev">${G.chevron}</span></span>
            <span class="ms-th-p">${t.last.from === 'me' ? 'You: ' : ''}${esc(t.last.kind === 'money' ? `Sent ${t.last.text}` : t.last.text)}</span></span></div>`,
                )
                .join('')}</div>`
            : `<div class="kp-empty">${G.message}<b>No messages</b>Texts from people you know show up here.</div>`
        }`,
      acts: {
        open: (el) => os.push(threadPage(app, el.dataset.id)),
        compose: () => composeSheet(app),
      },
      mount: (el) => {
        const i = el.querySelector('input');
        i.addEventListener('input', () => {
          clearTimeout(i._t);
          i._t = setTimeout(() => {
            const n = os.replaceTop(listPage(app, i.value));
            const j = n.querySelector('input');
            j.focus();
            j.setSelectionRange(i.value.length, i.value.length);
          }, 180);
        });
      },
      onShow: (el, o) => {
        if (o?.back) {
          const sc = el.querySelector('.kp-scroll').scrollTop;
          const n = os.replaceTop(listPage(app));
          n.querySelector('.kp-scroll').scrollTop = sc;
        }
      },
    };
  }
  function composeSheet(app) {
    const cs = data.contacts().filter((c) => c.kind !== 'payee' && c.kind !== 'hush');
    os.sheet({
      title: 'New message',
      body: os.rowsHTML(
        cs.map((c) => ({
          avatar: os.contactAvatar(c, 36),
          title: esc(c.name),
          sub: esc(c.role || ''),
          act: 'pick',
          data: { id: c.id },
          chevron: false,
        })),
      ),
      acts: {
        pick: (el) => {
          os.closeSheet(true);
          os.push(threadPage(app, el.dataset.id));
        },
      },
    });
  }
  function bubbles(id) {
    const msgs = data.thread(id),
      out = [];
    let lastT = -1e9;
    for (const m of msgs) {
      if (m.t - lastT > 90)
        out.push(
          `<div class="ms-stamp">${esc(os.dayLabel(Math.floor(m.t / 1440) + 1))} ${esc(os.clock((((m.t % 1440) + 1440) % 1440) / 60))}</div>`,
        );
      lastT = m.t;
      if (m.kind === 'money')
        out.push(
          `<div class="ms-b ${m.from === 'me' ? 'me' : 'them'} money"><small>${m.from === 'me' ? 'You sent' : 'Sent you'}</small><b>${esc(m.text)}</b>${m.data?.memo ? `<span>${esc(m.data.memo)}</span>` : ''}<em>${G.check} via ${esc(os.brand().short)}</em></div>`,
        );
      else if (m.kind === 'fine')
        out.push(
          `<div class="ms-b them">${esc(m.text)}<button class="ms-link" data-act="fines" data-f>${G.ticket}Pay in ${esc(os.brand().short)}</button></div>`,
        );
      else out.push(`<div class="ms-b ${m.from === 'me' ? 'me' : 'them'}">${esc(m.text)}</div>`);
    }
    const last = msgs[msgs.length - 1];
    if (last?.from === 'me' && last.kind !== 'money')
      out.push('<div class="ms-read">Delivered</div>');
    return out.join('');
  }
  function threadPage(app, id) {
    const c = data.contact(id) || { id, name: id, initials: '?', hue: 200 };
    const canReply = !['bank', 'city', 'hush'].includes(id) && c.kind !== 'payee';
    const canPay =
      c.kind && !['service', 'payee'].includes(c.kind) && id !== 'bank' && id !== 'city';
    const quick = ['On my way', "Can't talk now", 'Thanks!', 'Call you later'];
    return {
      titleHTML: `<span class="ms-navt">${os.contactAvatar(c, 30)}<b>${esc(c.name)}</b></span>`,
      back: 'Messages',
      cls: 'ms-thread',
      body: `<div class="ms-bubbles">${bubbles(id)}</div><div class="ms-typing" hidden><i></i><i></i><i></i></div>`,
      footer: `<div class="ms-bar">${canReply || canPay ? `<div class="ms-quick">${canPay ? `<button class="kp-chip ms-pay" data-act="pay" data-f>${G.dollar}Send money</button>` : ''}${canReply ? quick.map((q) => `<button class="kp-chip" data-act="say" data-t="${esc(q)}" data-f>${esc(q)}</button>`).join('') : ''}</div>` : `<div class="ms-noreply">${id === 'bank' ? 'Automated alerts. Replies are not monitored.' : 'This number does not take replies.'}</div>`}</div>`,
      acts: {
        say: (el) => {
          data.addMessage(id, el.dataset.t, { from: 'me' });
          os.sound('whoosh', 0.35);
          repaint();
          const pool = REPLIES[c.kind] || REPLIES.friend,
            txt = pool[(data.S.seq + id.length) % pool.length];
          const top = () => os.app?.stack?.[os.app.stack.length - 1];
          setTimeout(() => {
            const t = top();
            if (t?.dataset.thread === id) {
              t.querySelector('.ms-typing').hidden = false;
              scrollEnd(t);
            }
          }, 1200);
          setTimeout(
            () => {
              const t = top();
              if (t?.dataset.thread === id) t.querySelector('.ms-typing').hidden = true;
              data.addMessage(id, txt);
            },
            3200 + Math.random() * 1500,
          );
        },
        pay: () => {
          os.closeApp();
          setTimeout(() => os.openApp('bank', { send: true, to: id }), 80);
        },
        fines: () => {
          os.closeApp();
          setTimeout(() => os.openApp('bank', { fines: true }), 80);
        },
      },
      mount: (el) => {
        el.dataset.thread = id;
        data.markRead(id);
        requestAnimationFrame(() => scrollEnd(el, true));
      },
      onShow: (el) => {
        data.markRead(id);
      },
    };
    function repaint() {
      const t = os.app?.stack?.[os.app.stack.length - 1];
      if (t?.dataset.thread !== id) return;
      t.querySelector('.ms-bubbles').innerHTML = bubbles(id);
      scrollEnd(t);
    }
  }
  function scrollEnd(el, instant) {
    const sc = el.querySelector('.kp-scroll');
    if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
  }

  return {
    id: 'messages',
    name: 'Messages',
    badge: () => data.totalUnread(),
    launch(app, opts = {}) {
      os.push(listPage(app), { instant: true, sound: false });
      if (opts.thread) os.push(threadPage(app, opts.thread), { instant: true });
    },
    deepLink(app, opts = {}) {
      if (opts.thread) {
        while (app.stack.length > 1) os.pop({ instant: true });
        os.push(threadPage(app, opts.thread));
      }
    },
    onData(app, ev) {
      if (ev.kind !== 'message') return;
      const top = app.stack[app.stack.length - 1];
      if (top?.dataset.thread === ev.id) {
        top.querySelector('.ms-bubbles').innerHTML = bubbles(ev.id);
        data.markRead(ev.id);
        scrollEnd(top);
        if (ev.message.from !== 'me') os.sound('tick', 0.5);
      } else if (app.stack.length === 1) {
        const sc = top.querySelector('.kp-scroll').scrollTop;
        const n = os.replaceTop(listPage(app));
        n.querySelector('.kp-scroll').scrollTop = sc;
      }
    },
  };
}
