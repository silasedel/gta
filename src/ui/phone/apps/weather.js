// Weather: the game's live weather (game.weather: kind, rain, cloud, fog, forecast), clock, sun, tide and moon
// (game.time). Temperatures follow a South Florida day curve shaped by the current weather.
import './apps.css';

const NAMES = { clear: 'Clear', sunny: 'Sunny', partly: 'Partly Cloudy', cloudy: 'Cloudy', overcast: 'Overcast', rain: 'Rain', showers: 'Showers', storm: 'Thunderstorms', thunder: 'Thunderstorms', fog: 'Fog', haze: 'Hazy', drizzle: 'Drizzle', wind: 'Windy' };
const icon = (k, night) => (/storm|thunder/.test(k) ? 'storm' : /rain|shower|drizzle/.test(k) ? 'rain' : /fog|haze|mist/.test(k) ? 'fog' : /cloud|overcast/.test(k) ? 'cloud' : /partly/.test(k) ? (night ? 'moonSmall' : 'cloud') : night ? 'moon' : 'sun');

export default function weatherApp(os) {
  const { esc, GLYPH: G, game } = os;
  const hour = () => Number(game.time?.hour ?? game.timeOfDay ?? 12);
  const kind = () => String(game.weather?.kind || 'clear');
  const sun = () => game.time?.sun || { rise: 6.7, set: 19.9 };
  const isNight = (h) => { const s = sun(); return h < s.rise || h > s.set; };
  function tempAt(h, k = kind()) {
    const day = game.time?.day || 1, base = 81 + Math.sin(day * 1.7) * 2;
    let t = base + 6 * Math.cos(((h - 15) / 24) * Math.PI * 2);
    if (/rain|shower|storm|thunder/.test(k)) t -= 6; else if (/cloud|overcast|fog/.test(k)) t -= 2;
    return Math.round(t);
  }
  function kindAt(h) {
    const f = game.weather?.forecast?.[0];
    if (!f) return kind();
    const now = hour(), d = ((h - now) + 24) % 24, df = ((f.hour - now) + 24) % 24;
    return d >= df ? f.kind : kind();
  }
  function hourly() {
    const now = hour(), out = [];
    for (let i = 0; i < 12; i++) { const h = (Math.floor(now) + i) % 24, k = i ? kindAt(h) : kind(); out.push({ h, k, t: i ? tempAt(h, k) : tempAt(now), night: isNight(h + 0.5) }); }
    return out;
  }
  function sky(k = kind(), h = hour()) {
    const n = isNight(h), dusk = Math.abs(h - sun().set) < 1 || Math.abs(h - sun().rise) < 0.8;
    if (/storm|thunder/.test(k)) return 'linear-gradient(175deg,#2a3140,#3d4658 50%,#596173)';
    if (/rain|shower|drizzle/.test(k)) return n ? 'linear-gradient(175deg,#141b2a,#26324a)' : 'linear-gradient(175deg,#4d5d75,#7b8ca3)';
    if (/fog|haze/.test(k)) return n ? 'linear-gradient(175deg,#1d2230,#3a4152)' : 'linear-gradient(175deg,#9aa7b5,#c9d0d6)';
    if (dusk) return 'linear-gradient(175deg,#3b3f8f 0%,#b45a8c 55%,#f39a6b 100%)';
    if (n) return 'linear-gradient(175deg,#0b1430 0%,#1c2a55 60%,#2d3b6b 100%)';
    if (/cloud|overcast/.test(k)) return 'linear-gradient(175deg,#5a83b5,#9ab6d4)';
    return 'linear-gradient(175deg,#2f7be0 0%,#5ea6f2 55%,#9ccdfa 100%)';
  }
  const place = () => { const p = game.player?.position; try { const d = game.city?.districtAt?.(p.x, p.z); if (d) return String(d); } catch (e) { /* */ } return 'Southline'; };
  function page() {
    const k = kind(), h = hour(), hs = hourly(), temps = hs.map((x) => x.t), hi = Math.max(...temps, tempAt(15)), lo = Math.min(...temps, tempAt(5));
    const T = game.time, tide = T?.tide, moon = T?.moon, s = sun(), humid = Math.round(62 + (/rain|storm|fog/.test(k) ? 26 : 10) + Math.sin(h / 3) * 4);
    const wind = Math.round(6 + (/storm/.test(k) ? 16 : /rain/.test(k) ? 8 : 3) + Math.cos(h / 4) * 3);
    const hh = (x) => os.clock(x).replace(':00', '');
    return {
      nav: false, cls: 'wx-page', status: 'light',
      body: `<div class="wx-bg" style="background:${sky(k, h)}"></div>${/rain|shower|storm|drizzle/.test(k) ? '<div class="wx-rain"></div>' : ''}
        <div class="wx-now"><small>My location</small><b class="wx-place">${esc(place())}</b><div class="wx-t">${tempAt(h)}°</div><div class="wx-k">${esc(NAMES[k] || k)}</div><div class="wx-hl">H:${hi}°  L:${lo}°</div></div>
        <div class="wx-card"><div class="wx-cap">${G.clock}HOURLY FORECAST</div><div class="wx-hours">${hs.map((x, i) => `<div><small>${i ? esc(hh(x.h)) : 'Now'}</small><span>${G[icon(x.k, x.night)]}</span><b>${x.t}°</b></div>`).join('')}</div></div>
        <div class="wx-grid">
          <div class="wx-card"><div class="wx-cap">${G.sun}SUNSET</div><b class="wx-big">${esc(os.clock(s.set))}</b><small>Sunrise ${esc(os.clock(s.rise))}</small></div>
          <div class="wx-card"><div class="wx-cap">${G.wave}TIDE</div><b class="wx-big">${tide ? (tide.rising ? 'Rising' : 'Falling') : '—'}</b><small>${tide ? `${(tide.meters * 3.28).toFixed(1)} ft · ${tide.rising ? 'high' : 'low'} in ${Math.round((tide.rising ? tide.nextHighIn : tide.nextLowIn) / 60)} h` : 'No data'}</small></div>
          <div class="wx-card"><div class="wx-cap">${G.drop}HUMIDITY</div><b class="wx-big">${humid}%</b><small>Dew point ${Math.round(tempAt(h) - (100 - humid) / 5)}°</small></div>
          <div class="wx-card"><div class="wx-cap">${G.wind}WIND</div><b class="wx-big">${wind} mph</b><small>From the ${['east', 'southeast', 'east', 'northeast'][Math.floor(h / 6) % 4]}</small></div>
          <div class="wx-card"><div class="wx-cap">${G.moon}MOON</div><b class="wx-big">${esc(moon?.name || '—')}</b><small>${moon ? `${Math.round(moon.illumination * 100)}% lit` : ''}</small></div>
          <div class="wx-card"><div class="wx-cap">${G.sun}FEELS LIKE</div><b class="wx-big">${tempAt(h) + Math.round((humid - 60) / 6)}°</b><small>Humidity makes it feel warmer.</small></div>
        </div>`,
      tick: (dt, el) => { el._t = (el._t || 0) + dt; if (el._t > 6) { el._t = 0; const sc = el.querySelector('.kp-scroll').scrollTop; const n = os.replaceTop(page()); n.querySelector('.kp-scroll').scrollTop = sc; } },
    };
  }
  return {
    id: 'weather', name: 'Weather',
    launch(app) { os.push(page(), { instant: true, sound: false }); },
    widget: () => { const k = kind(), h = hour(), hs = hourly(), t = hs.map((x) => x.t); return `<div class="wx-wg" style="background:${sky(k, h)}"><b>${esc(place())}</b><div class="wx-wg-t">${tempAt(h)}°</div><span class="wx-wg-i">${G[icon(k, isNight(h))]}</span><small>${esc(NAMES[k] || k)}</small><small>H:${Math.max(...t, tempAt(15))}° L:${Math.min(...t, tempAt(5))}°</small></div>`; },
  };
}
