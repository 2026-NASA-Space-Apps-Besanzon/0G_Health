// Live raw-signal sketches, one per sensor. Simulated.
import { f, pts, path, line, circle, wob } from './motion';
import type { Sensor } from '../data/sensors';

export function rawSignal(kind: Sensor['signal'], x0: number, x1: number, cy: number, H: number, t: number) {
  const trace = (fn: (x: number) => number, cls = 's', extra = '') => { const p: [number, number][] = []; for (let x = x0; x <= x1; x += 4) p.push([x, fn(x)]); return path(pts(p), cls, extra); };
  let s = '';
  if (kind === 'eeg') for (let k = 0; k < 4; k++) s += trace((x) => cy + (k - 1.5) * (H / 2.2) + (wob(x * 0.06 - t * 5, k * 3.1) + wob(x * 0.15 - t * 9, k * 1.7) * 0.6) * H * 0.16, 's', `opacity="${f(0.5 + 0.15 * k)}"`);
  else if (kind === 'slow') s += trace((x) => cy - H * 0.2 + wob(x * 0.01 - t * 0.5) * H * 0.55, 's') + trace((x) => cy + H * 0.25 - wob(x * 0.01 - t * 0.5) * H * 0.3, 's-dim');
  else if (kind === 'pulse') s += trace((x) => { const u = (((x / 120 - t * 0.9) % 1) + 1) % 1; return cy + H * 0.7 - (Math.exp(-(((u - 0.18) / 0.075) ** 2)) + 0.42 * Math.exp(-(((u - 0.45) / 0.11) ** 2))) * H * 1.3; }, 's', 'stroke-width="1.75"');
  else if (kind === 'imu') ['s', 's-dim', 's-hair'].forEach((cls, k) => { s += trace((x) => cy + (k - 1) * H * 0.55 + wob(x * 0.025 - t * (1.4 + k * 0.5), k * 5) * H * 0.3 * Math.max(0.15, wob(t * 0.3 + k) + 0.6), cls); });
  else if (kind === 'flat') { const Y = (x: number) => cy + H * 0.3 - ((x - x0) / (x1 - x0)) * H * 0.6 + wob(x * 0.012 - t * 0.2) * H * 0.1; s += line(x0, cy + H * 0.8, x1, cy + H * 0.8, 's-hair', 'stroke-dasharray="2 6"') + trace(Y, 's'); for (let x = x0 + 16; x < x1; x += 40) s += circle(x, Y(x), 2.2, 'f-fg'); }
  else for (let x = x0 + 2; x <= x1; x += 6) { const a = Math.abs(wob(x * 0.04 - t * 2.2)) * Math.max(0, wob(x * 0.008 - t * 0.5) + 0.35) * H; s += line(x, cy - a, x, cy + a, 's', 'stroke-width="2"'); }
  return s;
}
