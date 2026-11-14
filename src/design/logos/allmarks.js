// Loads every part of the mark library and re-exports the registry.
import { MARKS, drawMark, markNames, def } from './marks.js';
import './marks_fauna.js';
import './marks_objects.js';
import './marks_abstract.js';
export { MARKS, drawMark, markNames, def };
