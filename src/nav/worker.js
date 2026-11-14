// PORT SOLANA V2 navigation Web Worker entry (module worker). All logic is in workerCore.js.
import { createWorkerCore } from './workerCore.js';
const core = createWorkerCore((msg, transfer) => self.postMessage(msg, transfer || []));
self.onmessage = (e) => core(e.data);
