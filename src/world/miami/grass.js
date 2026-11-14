// Miami city: near-camera lawn grass. Rebuilt by the vegetation track: GPU-generated blades over a soil/thatch ground driven by a
// height field (mowed / long / worn / weedy), shared wind, trampling, and a mowing schedule. See src/world/vegetation/lawn.js.
// createGrassField({ M, root, data, lawnAt, lawnTester }) -> { mesh, update(camera), dispose(), api }; also sets game.grass.
import { createLawn } from '../vegetation/lawn.js';

export function createGrassField(opts) { return createLawn(opts); }
