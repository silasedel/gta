// Southline web (r2-web): every GLTFLoader in the game can read compressed models. The game creates ~20 GLTFLoaders
// (vegetation, street kit, buildings, Nico's house, weapons...); only the car / NPC ones had a Draco decoder. The web
// build compresses model geometry (tools/v2/web/glb-compress.mjs: Draco, 16-bit positions), so any loader without a
// decoder gets the shared one here, plus the meshopt decoder. Loaders that already set their own keep it.
// Loaded by src/web/entry.js before the engine (same GLTFLoader module instance as three/addons/...).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let draco = null;
const base = () => new URL('assets/humans/draco/', document.baseURI).href;
const parse = GLTFLoader.prototype.parse;
if (!GLTFLoader.prototype.__slDecoders) {
  GLTFLoader.prototype.__slDecoders = true;
  GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
    try {
      if (!this.dracoLoader) { if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath(base()); } this.setDRACOLoader(draco); }
      if (!this.meshoptDecoder) this.setMeshoptDecoder(MeshoptDecoder);
    } catch (e) { /* decoders are optional: uncompressed models still load */ }
    return parse.call(this, data, path, onLoad, onError);
  };
}
