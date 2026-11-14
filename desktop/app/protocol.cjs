// Southline desktop: serves the production web build from local files over app://game/.
// A privileged, standard, secure scheme behaves like https for the page: ES modules, module workers,
// fetch(), WASM and IndexedDB/localStorage all work, and the origin (app://game) is stable across
// launches so saves persist. Paths are confined to the web root; anything outside it is a 404.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { protocol } = require('electron');

const SCHEME = 'app';
const HOST = 'game';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// Must run before app 'ready'.
function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

function notFound() {
  return new Response('not found', {
    status: 404,
    headers: { 'content-type': 'text/plain' },
  });
}

function resolveFile(webRoot, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') {
    rel = '/index.html';
  }
  const file = path.normalize(path.join(webRoot, rel));
  if (file !== webRoot && !file.startsWith(webRoot + path.sep)) {
    return null;
  }
  return file;
}

// Range requests (media elements seek with them).
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m) {
    return null;
  }
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  }
  if (end === null || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) {
    return null;
  }
  return { start, end };
}

function handle(webRoot) {
  const root = path.resolve(webRoot);
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) {
      return notFound();
    }
    const file = resolveFile(root, url);
    if (!file) {
      return notFound();
    }
    let st;
    try {
      st = await fs.promises.stat(file);
    } catch (e) {
      return notFound();
    }
    if (!st.isFile()) {
      return notFound();
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'content-type': type,
      'cache-control': 'no-cache',
      'accept-ranges': 'bytes',
    };
    const range = parseRange(request.headers.get('range'), st.size);
    if (range) {
      const stream = fs.createReadStream(file, {
        start: range.start,
        end: range.end,
      });
      headers['content-range'] = `bytes ${range.start}-${range.end}/${st.size}`;
      headers['content-length'] = String(range.end - range.start + 1);
      return new Response(Readable.toWeb(stream), {
        status: 206,
        headers,
      });
    }
    headers['content-length'] = String(st.size);
    if (request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers,
      });
    }
    const stream = fs.createReadStream(file);
    return new Response(Readable.toWeb(stream), {
      status: 200,
      headers,
    });
  });
}

module.exports = {
  SCHEME,
  HOST,
  ORIGIN: `${SCHEME}://${HOST}`,
  registerSchemes,
  handle,
};
