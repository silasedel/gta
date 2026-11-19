// Stage 1 performance: opaque draw order grouped by shader program.
// three.js sorts opaque draws by material id. Most of the ~1000 programs in a city frame are shared by many materials,
// but materials of the same program get scattered ids, so almost every draw switched program. A program switch is the
// expensive case in WebGLRenderer.setProgram: besides useProgram it re-uploads every light uniform of the shader
// (16 point + 4 spot + 3 directional light structs, ~150 uniform writes checked one by one in JavaScript). Sorting by
// program first (then material, then front to back) keeps the same set of draws with far fewer switches.
// The order only differs between draws with different materials; renderOrder / groupOrder still come first, so layered
// decals keep their explicit order. Transparent sorting is unchanged (back to front).
// API: game.drawOrder = { on, stats: { switches } }   (on = false restores three.js's own order)
export const order = 5;

export async function initV2(game) {
  const r = game.renderer;
  const props = r.properties;
  const cfg = (game.drawOrder = { on: true, stats: { switches: 0 } });
  // program id per material: the lowest id among its programs. A material can own several programs (the city tile
  // batches draw a shared material through its USE_BATCHING variant, src/world/miami/tileBatch.js); keying on the
  // program it was last drawn with would move the material in the order whenever a newer variant draws, and coplanar
  // ground layers of different materials resolve their ties by draw order.
  let minId = 0;
  function takeMin(p) {
    if (minId === 0 || p.id < minId) minId = p.id;
  }
  function progOf(m) {
    const mp = props.get(m);
    const progs = mp.programs;
    if (!progs || progs.size === 0) {
      const p = mp.currentProgram;
      return p ? p.id : 0;
    }
    if (m.__pidN !== progs.size) {
      minId = 0;
      progs.forEach(takeMin);
      m.__pidN = progs.size;
      m.__pidMin = minId;
    }
    return m.__pidMin;
  }
  function byProgram(a, b) {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.material !== b.material) {
      const pa = a.material.__pid,
        pb = b.material.__pid;
      if (pa !== pb) return pa - pb;
      return a.material.id - b.material.id;
    }
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  }
  function painterSortStable(a, b) {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.material.id !== b.material.id) return a.material.id - b.material.id;
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  }
  // the sort function only sees render items: stamp each material's program id once per sort (cheap: one WeakMap
  // lookup per opaque item instead of one per comparison)
  r.setOpaqueSort(function sortOpaque(a, b) {
    return cfg.on ? byProgram(a, b) : painterSortStable(a, b);
  });
  const rl = r.renderLists;
  const get = rl.get.bind(rl);
  rl.get = (scene, depth) => {
    const list = get(scene, depth);
    if (!list.__pidPatched) {
      list.__pidPatched = true;
      const sort = list.sort.bind(list);
      list.sort = (o, t) => {
        if (cfg.on) {
          const op = list.opaque;
          for (let i = 0; i < op.length; i++) {
            const m = op[i].material;
            m.__pid = progOf(m);
          }
        }
        return sort(o, t);
      };
    }
    return list;
  };
}
