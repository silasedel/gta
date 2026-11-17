// SOUTHLINE V2 navigation: the message handler that runs inside the nav Web Worker (and, as a fallback, on the main
// thread through the same interface). Heavy work lives here: landmark tables, the walk graph, first-route searches and the
// reverse tree used for instant re-routes.
import { Router, computeLandmarks } from './engine.js';
import { setControls } from './graph.js';
import { buildWalkGraph, walkRoute } from './walk.js';
import { boatRoute } from './boat.js';

export function createWorkerCore(post) {
  let G = null, router = null, Wg = null, grid = null;
  const strip = (o, keys) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };
  return function onMessage(m) {
    try {
      switch (m.type) {
        case 'init': {
          G = m.G; router = new Router(G);
          post({ type: 'ready', stats: G.stats });
          const lm = computeLandmarks(G, m.landmarks || 16);
          router.setLandmarks(lm);
          post({ type: 'landmarks', lm });
          break;
        }
        case 'traffic': if (router) router.setTraffic(m.mult, m.block, m.version); break;
        case 'controls': if (G) { setControls(G, m.signals, m.stops); router.graphChanged(); } break;
        case 'walkInit': {
          grid = m.grid || grid;
          Wg = buildWalkGraph({ paths: m.paths, sidewalks: m.sidewalks, areas: m.areas, water: m.water, G });
          post({ type: 'walk', W: Wg });
          break;
        }
        case 'grid': grid = m.grid; break;
        case 'route': post({ type: 'result', id: m.id, raw: router ? router.route(m.from, m.to, m.opts || {}) : null }); break;
        case 'plan': { // first answer fast, then the tree for instant re-routes
          const raw = router ? router.route(m.from, m.to, m.opts || {}) : null;
          post({ type: 'planRoute', id: m.id, raw });
          const tree = router ? router.tree(m.to, m.opts || {}) : null;
          if (tree) post({ type: 'planTree', id: m.id, tree }, [tree.D.buffer, tree.next.buffer]); else post({ type: 'planTree', id: m.id, tree: null });
          break;
        }
        case 'walkRoute': post({ type: 'result', id: m.id, raw: Wg ? walkRoute(Wg, m.from, m.to, m.opts || {}) : null }); break;
        case 'boatRoute': { const raw = grid ? boatRoute(grid, m.from, m.to, m.opts || {}) : null; post({ type: 'result', id: m.id, raw }); break; }
        case 'ping': post({ type: 'pong', id: m.id, t: m.t }); break;
        default: break;
      }
    } catch (err) {
      post({ type: 'error', id: m.id, message: String(err && err.stack || err) });
    }
    void strip;
  };
}
