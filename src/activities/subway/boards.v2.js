// SUBWAY WAYFINDING (activities, on top of src/world/metro): next-train boards hung over the platform (amber LED dot
// matrix: platform number, line color, destination, minutes / ARRIVING / BOARDING / DOORS CLOSING, a scrolling notice),
// "Platform 1" and direction signs, and the station PA as subtitles (arriving, doors closing, welcome on arrival).
// Reads game.metro (kit.station, T, here, mode, stations) and never changes it. Built once, when the metro kit is.
import * as THREE from 'three';
import { say } from '../common.js';

export const order = 187;
const AMBER = '#ffb23a',
  LINE = '#ff6b5a';

export async function initV2(game) {
  if (/[?&]subwaylife=0\b/.test(location.search)) return;
  let built = null,
    lastKey = '',
    annT = 0,
    lastPhase = '',
    lastHere = -1,
    scroll = 0;
  const M = () => game.metro;
  function dest() {
    const m = M();
    const n = m.stations.length;
    const i = m.here;
    return i < n - 1 ? m.stations[n - 1].name : m.stations[0].name;
  }
  function boardCanvas() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 192;
    return c;
  }
  function drawBoard(c, l1, l2, l3) {
    const g = c.getContext('2d'),
      w = c.width,
      h = c.height;
    g.fillStyle = '#060606';
    g.fillRect(0, 0, w, h);
    // LED dot grid
    g.fillStyle = 'rgba(255,178,58,0.05)';
    for (let y = 6; y < h; y += 8) for (let x = 6; x < w; x += 8) g.fillRect(x, y, 3, 3);
    g.shadowColor = AMBER;
    g.shadowBlur = 10;
    g.fillStyle = AMBER;
    g.textBaseline = 'middle';
    // platform number roundel + line color
    g.save();
    g.shadowBlur = 0;
    g.fillStyle = LINE;
    g.beginPath();
    g.arc(52, 52, 34, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '900 44px Inter, Arial';
    g.textAlign = 'center';
    g.fillText('1', 52, 54);
    g.restore();
    g.font = '700 54px "Courier New", monospace';
    g.textAlign = 'left';
    g.fillText(l1, 104, 54);
    g.textAlign = 'right';
    g.fillText(l2, w - 28, 54);
    g.font = '700 38px "Courier New", monospace';
    g.textAlign = 'left';
    g.save();
    g.beginPath();
    g.rect(20, 110, w - 40, 70);
    g.clip();
    const tw = g.measureText(l3).width;
    const x = 28 + (w - 40 - ((scroll * 90) % (tw + w)));
    g.fillText(l3, x, 146);
    g.restore();
  }
  function build() {
    const K = M()?.kit;
    if (!K?.station) return null;
    const st = K.station,
      boards = [];
    const frame = new THREE.MeshBasicMaterial({ color: 0x1a1b1e }),
      rodM = new THREE.MeshBasicMaterial({ color: 0x55585e });
    for (const x of [-30, 6, 38]) {
      const c = boardCanvas(),
        tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const g = new THREE.Group();
      g.position.set(x, 3.45, 4.6);
      g.name = 'metro-board';
      const box = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.72, 0.16), frame);
      g.add(box);
      const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      for (const s of [1, -1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(3.12, 0.585), face);
        p.position.z = s * 0.085;
        p.rotation.y = s > 0 ? 0 : Math.PI;
        g.add(p);
      }
      for (const sx of [-1.2, 1.2]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), rodM);
        r.position.set(sx, 0.83, 0);
        g.add(r);
      }
      st.add(g);
      boards.push({ c, tex });
    }
    // Platform 1 / direction signs on the track-side columns line (porcelain enamel, line color stripe)
    const signTex = (txt, sub) => {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#101820';
      g.fillRect(0, 0, 1024, 256);
      g.fillStyle = LINE;
      g.fillRect(0, 0, 1024, 18);
      g.fillStyle = LINE;
      g.beginPath();
      g.arc(120, 136, 70, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '900 92px Inter, Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('1', 120, 140);
      g.textAlign = 'left';
      g.font = '800 70px Inter, Arial';
      g.fillText(txt, 230, 112);
      g.font = '600 44px Inter, Arial';
      g.fillStyle = '#c8d2dc';
      g.fillText(sub, 232, 190);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const dirMat = new THREE.MeshBasicMaterial({ map: null });
    const dirs = [];
    for (const x of [-12, 24]) {
      const m = dirMat.clone();
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), m);
      p.position.set(x, 3.0, 16.07);
      p.rotation.y = Math.PI;
      st.add(p);
      dirs.push(p);
    }
    return { boards, dirs, signTex };
  }
  function relabel() {
    const m = M();
    if (!built) return;
    const d = dest(),
      t = built.signTex('Platform 1', `Southline trains to ${d}`);
    for (const p of built.dirs) {
      p.material.map?.dispose();
      p.material.map = t;
      p.material.needsUpdate = true;
    }
  }
  game.updaters.push(function metroBoardsTick(dt) {
    const m = M();
    if (!m || m.mode === 'street' || !m.kit) {
      lastHere = -1;
      return;
    }
    if (!built) {
      built = build();
      if (!built) return;
    }
    if (m.here !== lastHere) {
      lastHere = m.here;
      relabel();
      if (m.mode === 'platform')
        say(
          game,
          'Station PA',
          `Welcome to ${m.stations[m.here].name}. Please mind the gap and keep your belongings with you.`,
          3600,
          LINE,
        );
    }
    if (m.mode !== 'platform') return;
    const T = m.T;
    scroll += dt;
    let right = '';
    if (T.phase === 'away') {
      const eta = Math.max(0, (T.wait || 0) - T.t) + 16;
      right = eta > 45 ? `${Math.ceil(eta / 60)} min` : 'DUE';
    } else if (T.phase === 'arriving') right = 'ARRIVING';
    else if (T.phase === 'stopped') right = 'BOARDING';
    else if (T.phase === 'closing') right = 'DOORS CLOSING';
    else right = 'DEPARTED';
    const l3 = `Stand behind the yellow line  ·  Fare $2.75 cash or card  ·  See something, say something  ·  Next stop ${m.stations[Math.min(m.stations.length - 1, m.here + (m.here < m.stations.length - 1 ? 1 : -1))]?.name || ''}  ·  `;
    if ((annT -= dt) <= 0 || right !== lastKey.split('|')[1]) {
      annT = 0.25;
      const key = dest() + '|' + right + '|' + Math.floor(scroll * 4);
      if (key !== lastKey) {
        lastKey = key;
        for (const b of built.boards) {
          drawBoard(b.c, dest().toUpperCase(), right, l3);
          b.tex.needsUpdate = true;
        }
      }
    }
    if (T.phase !== lastPhase) {
      if (T.phase === 'arriving')
        say(
          game,
          'Station PA',
          `The next Southline train to ${dest()} is now arriving. Please stand behind the yellow line.`,
          3800,
          LINE,
        );
      if (T.phase === 'closing')
        say(game, 'Station PA', 'Stand clear of the closing doors, please.', 2600, LINE);
      lastPhase = T.phase;
    }
  });
}
