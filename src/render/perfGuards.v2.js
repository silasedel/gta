// Port Solana V2: run-time allocation guards (playtest-fixes track).
// The game produced about 1 GB of short-lived garbage every 20 s of play, so Chrome ran a major GC of a
// 2-3 GB heap every minute or so (the 1-2 s freezes) and peaked near the tab's memory limit (the crash).
// The two largest sources are fixed here without touching their owners' files:
//   1. game.interiors.list was a getter that built a new concatenated array on every read. The minimap
//      reads it every frame and keys its cache on the array identity, so its cache never hit and it
//      rebuilt every shop icon every frame. The getter now returns a cached array that only changes when
//      one of the two source lists changes.
//   2. Facade batches (FBatch) stored 16 floats per vertex in a growing JS array of doubles. They now
//      write into a growing Float32Array (half the bytes, no boxed growth copies).
// The owners (interiors-engine, city-look) should adopt these natively; see docs/v2/reports/playtest-fixes.md.
import { FBatch } from '../world/city/facade.js';
import { Batch } from '../world/city/geo.js';

export const order = 4;

function guardInteriorsList(game) {
  const it = game.interiors;
  if (!it) {
    return false;
  }
  const desc = Object.getOwnPropertyDescriptor(it, 'list');
  if (!desc || typeof desc.get !== 'function' || !desc.configurable) {
    return false;
  }
  const cache = {
    a: null,
    b: null,
    na: -1,
    nb: -1,
    out: [],
  };
  Object.defineProperty(it, 'list', {
    configurable: true,
    enumerable: desc.enumerable,
    get() {
      const a = it.v2?.list || null;
      const b = it.legacy?.list || null;
      const na = a ? a.length : 0;
      const nb = b ? b.length : 0;
      if (a !== cache.a || b !== cache.b || na !== cache.na || nb !== cache.nb) {
        cache.a = a;
        cache.b = b;
        cache.na = na;
        cache.nb = nb;
        cache.out = [];
        if (a) {
          for (let i = 0; i < na; i++) {
            cache.out.push(a[i]);
          }
        }
        if (b) {
          for (let i = 0; i < nb; i++) {
            cache.out.push(b[i]);
          }
        }
      }
      return cache.out;
    },
  });
  return true;
}

let fbatchPatched = false;
function guardFacadeBatch() {
  if (fbatchPatched || !FBatch?.prototype || !Batch?.prototype) {
    return false;
  }
  fbatchPatched = true;
  const baseVert = Batch.prototype.vert;
  FBatch.prototype.vert = function vert(x, y, z, nx, ny, nz, u, v, col) {
    baseVert.call(this, x, y, z, nx, ny, nz, u, v, col);
    let a = this._fxa;
    const n = this._fxn || 0;
    if (!a || n + 16 > a.length) {
      const grown = new Float32Array(Math.max(1024, a ? a.length * 2 : 0, n + 16));
      if (a) {
        grown.set(a.subarray(0, n));
      }
      a = grown;
      this._fxa = a;
    }
    const s = this.s;
    for (let i = 0; i < 16; i++) {
      a[n + i] = s[i];
    }
    this._fxn = n + 16;
  };
  const origAttach = FBatch.prototype.attach;
  FBatch.prototype.attach = function attach(g) {
    if (!this._fxa) {
      return origAttach.call(this, g);
    }
    // hand the exact-length data to the original attach (it copies arrays into a new Float32Array)
    this.fx = this._fxa.subarray(0, this._fxn);
    this._fxa = null;
    this._fxn = 0;
    return origAttach.call(this, g);
  };
  return true;
}

export async function initV2(game) {
  const done = {
    interiorsList: false,
    facadeBatch: false,
  };
  try {
    done.facadeBatch = guardFacadeBatch();
  } catch (e) {
    console.warn('[perfGuards] facade batch', e);
  }
  try {
    done.interiorsList = guardInteriorsList(game);
  } catch (e) {
    console.warn('[perfGuards] interiors list', e);
  }
  game.perfGuards = done;
}
