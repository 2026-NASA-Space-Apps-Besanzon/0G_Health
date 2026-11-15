// Honesty rule from PLAN.md §5: the optical heart sensor is PPG. "ECG" must never ship.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const bad = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|js)$/.test(f) && /\bECG\b|electrocardiogram/i.test(readFileSync(p, 'utf8'))) bad.push(p); } };
walk('dist');
if (bad.length) { console.error('Copy check failed: "ECG" found in', bad); process.exit(1); }
console.log('Copy check passed: no "ECG" in built output.');
