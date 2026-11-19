// tiny RGB canvas + PNG writer (ELEVATED agent tools)
import fs from 'node:fs';
import zlib from 'node:zlib';
export class Canvas {
  constructor(w, h, bg = [16, 20, 28]) {
    this.w = w;
    this.h = h;
    this.d = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) this.d.set(bg, i * 3);
  }
  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d.set(c, (y * this.w + x) * 3);
  }
  dot(x, y, r, c) {
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r) this.px(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c, r = 0) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const t = k / n,
        x = x0 + (x1 - x0) * t,
        y = y0 + (y1 - y0) * t;
      if (r) this.dot(x, y, r, c);
      else this.px(x, y, c);
    }
  }
  save(file) {
    const { w, h, d } = this,
      raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      d.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
    }
    const T = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      T[n] = c >>> 0;
    }
    const crc = (b) => {
      let x = 0xffffffff;
      for (const v of b) x = T[(x ^ v) & 255] ^ (x >>> 8);
      return (x ^ 0xffffffff) >>> 0;
    };
    const chunk = (t, dd) => {
      const l = Buffer.alloc(4);
      l.writeUInt32BE(dd.length);
      const td = Buffer.concat([Buffer.from(t), dd]);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(td));
      return Buffer.concat([l, td, c]);
    };
    const ih = Buffer.alloc(13);
    ih.writeUInt32BE(w, 0);
    ih.writeUInt32BE(h, 4);
    ih[8] = 8;
    ih[9] = 2;
    fs.writeFileSync(
      file,
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ih),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    );
  }
}
export const heat = (t) => {
  t = Math.max(0, Math.min(1, t));
  return [
    Math.round(255 * Math.min(1, t * 2)),
    Math.round(255 * (t < 0.5 ? t * 2 : 2 - t * 2) * 0.9 + 40),
    Math.round(255 * Math.max(0, 1 - t * 2)),
  ];
};
