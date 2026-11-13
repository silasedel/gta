import { smoothConstrained } from '../solve.js';
// step test: pinned zeros then free targets 5
const n = 80, t = new Float64Array(n).fill(5), w = new Float64Array(n).fill(1), eq = new Float64Array(n).fill(NaN), lo = new Float64Array(n).fill(0), hi = new Float64Array(n).fill(Infinity);
for (let i = 0; i < 30; i++) eq[i] = 0;
const y = smoothConstrained(t, w, eq, lo, hi, 3e4, 24, 300);
console.log(Array.from(y).slice(25, 45).map((v) => v.toFixed(2)).join(' '));
