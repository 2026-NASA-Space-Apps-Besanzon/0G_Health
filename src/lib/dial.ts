import { f, line, circle, text } from './motion';

export interface DialOpts {
  cx: number; cy: number; r: number; /** rotation in degrees */ angle: number;
  /** ticks around the rim */ n: number; /** every k-th tick is heavy */ heavy?: number;
  big?: string; label?: string; sub?: string; subCls?: string; grabbed?: boolean;
}

/** A machined rotary dial: fixed pointer on top, knurled rim that turns. */
export function dial(o: DialOpts) {
  const { cx, cy, r } = o; let s = '';
  s += circle(cx, cy, r, 's') + circle(cx, cy, r * 0.74, 's-hair');
  s += `<g transform="rotate(${f(o.angle)} ${f(cx)} ${f(cy)})">`;
  for (let i = 0; i < o.n; i++) {
    const a = (i / o.n) * 2 * Math.PI - Math.PI / 2, hv = o.heavy ? i % o.heavy === 0 : false;
    const r1 = r * (hv ? 0.8 : 0.9), r2 = r * 0.97;
    s += line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, hv ? 's' : 's-dim');
  }
  // grip notch so the rotation is readable
  s += circle(cx, cy - r * 0.685, r * 0.035, o.grabbed ? 'f-you' : 'f-fg');
  s += '</g>';
  // fixed pointer
  s += `<path class="f-you" d="M${f(cx)} ${f(cy - r - 4)}l-6 -10h12z"/>`;
  if (o.label) s += text(cx, cy - r * 0.22, o.label, 't-label', 'text-anchor="middle"');
  if (o.big) s += text(cx, cy + r * 0.16, o.big, 't-num', `text-anchor="middle" font-size="${f(Math.max(18, r * 0.38))}"`);
  if (o.sub) s += text(cx, cy + r * 0.42, o.sub, o.subCls ?? 't-label', 'text-anchor="middle"');
  return s;
}

/** Angle of a point around a centre, degrees. */
export const angleAt = (cx: number, cy: number, x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
export const angleDelta = (a: number, b: number) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
