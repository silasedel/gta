// r2-look: grab N consecutive rendered frames (crop) right after each game render, as JPEG data URLs.
// window.__grab(n, [x, y, w, h] in CSS px of the canvas, scale) -> Promise<string[]>
window.__grab = (n, crop, scale = 1) => new Promise((res) => {
  const cvs = game.renderer.domElement, out = [];
  const k = cvs.width / cvs.clientWidth;
  const [x, y, w, h] = crop || [0, 0, cvs.clientWidth, cvs.clientHeight];
  const c2 = document.createElement('canvas'); c2.width = Math.round(w * scale); c2.height = Math.round(h * scale);
  const cx = c2.getContext('2d');
  const post = game.post, orig = post.render;
  post.render = function (dt) {
    orig.call(this, dt);
    cx.drawImage(cvs, x * k, y * k, w * k, h * k, 0, 0, c2.width, c2.height);
    out.push(c2.toDataURL('image/jpeg', 0.92));
    if (out.length >= n) { post.render = orig; res(out); }
  };
});
