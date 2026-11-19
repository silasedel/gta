#!/usr/bin/env node
// Impostor texture check: node tools/v2/vegetation/imp_alpha.mjs -> per countryside impostor material: alpha coverage of its
// baked texture (share of texels with alpha > 0.5, mean alpha) read back through a plain copy pass
import { withBrowser, GAME_READY } from '../browser.mjs';
await withBrowser({ width: 960, height: 540, maxSeconds: 600 }, async (b) => {
  await b.goto('http://127.0.0.1:5200/?mute');
  await b.waitFor(GAME_READY, 480);
  await b.sleep(5000);
  console.log(
    await b.eval(
      `(() => { const T = game.THREE, r = game.renderer, seen = new Map();
    game.scene.traverse((o) => { const m = o.material; if (o.isMesh && m?.userData?.veg?.family === 'imp' && m.map && !seen.has(m.map)) seen.set(m.map, (o.parent?.name || '') + '/' + (o.name || ''), m); });
    const rt = new T.WebGLRenderTarget(256, 64), sc = new T.Scene(), mat = new T.MeshBasicMaterial({ transparent: false, toneMapped: false }), q = new T.Mesh(new T.PlaneGeometry(2, 2), mat); sc.add(q); q.frustumCulled = false;
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'gl_FragColor = vec4(outgoingLight, diffuseColor.a);'); };
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), buf = new Uint8Array(256 * 64 * 4), out = [], prev = r.getRenderTarget(), cc = r.getClearColor(new T.Color()), ca = r.getClearAlpha();
    let n = 0; for (const [tex, name] of seen) { if (n++ > 40) break; mat.map = tex; mat.needsUpdate = true; r.setRenderTarget(rt); r.setClearColor(0xff00ff, 0.25); r.clear(); r.render(sc, cam); r.readRenderTargetPixels(rt, 0, 0, 256, 64, buf);
      let on = 0, sum = 0, mid = 0; for (let i = 3; i < buf.length; i += 4) { sum += buf[i]; if (buf[i] > 127) on++; if (buf[i] > 20 && buf[i] < 235) mid++; }
      const img = tex.image || {}; out.push(name + ' ' + (img.width || '?') + 'x' + (img.height || '?') + ' on=' + (on / (buf.length / 4)).toFixed(2) + ' mean=' + (sum / (buf.length / 4) / 255).toFixed(2) + ' mid=' + (mid / (buf.length / 4)).toFixed(2) + ' mips=' + tex.generateMipmaps + ' min=' + tex.minFilter); }
    const lm = new T.ShaderMaterial({ uniforms: { map: { value: null }, L: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D map; uniform float L; varying vec2 vUv; void main() { gl_FragColor = textureLod(map, vUv, L); }', depthTest: false, blending: T.NoBlending }); q.material = lm;
    n = 0; for (const [tex, name] of seen) { if (!/countryside/.test(name) || n++ > 3) continue; lm.uniforms.map.value = tex; let row = name + ' lod:'; for (let L = 0; L <= 9; L++) { lm.uniforms.L.value = L; r.setRenderTarget(rt); r.clear(); r.render(sc, cam); r.readRenderTargetPixels(rt, 0, 0, 256, 64, buf); let sum = 0, on = 0; for (let i = 0; i < buf.length; i += 4) { sum += buf[i + 3]; if (buf[i + 3] > 127) on++; } row += ' ' + L + ':a' + (sum / (buf.length / 4) / 255).toFixed(2) + '/c' + (on / (buf.length / 4)).toFixed(2); } out.push(row); }
    r.setRenderTarget(prev); r.setClearColor(cc, ca); return out.join('\\n'); })()`,
      60000,
    ),
  );
  const errs = b.errors.filter((e) => !/favicon/.test(e));
  if (errs.length) console.log('ERRORS', errs.slice(0, 8).join('\n'));
});
