// Isometric line-art comms cap, generated from 3-D geometry so it can be exploded and turned.
import { f, pts, text, line, circle, clamp, easeOutBack } from './motion';
import { SENSORS, type SensorId } from '../data/sensors';

type V = [number, number, number];
const A = 0.8, B = 0.98, C = 0.92; // head ellipsoid radii: side, front-back, up
const D = Math.PI / 180;
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Point on the head. th: azimuth in degrees from the right ear (+x) toward the face (+y). ph: elevation. */
const surf = (th: number, ph: number, k = 1): V => [A * k * Math.cos(ph * D) * Math.cos(th * D), B * k * Math.cos(ph * D) * Math.sin(th * D), C * k * Math.sin(ph * D)];
const nrm = (p: V): V => norm([p[0] / (A * A), p[1] / (B * B), p[2] / (C * C)]);
/** The cap covers the whole head except an oval face opening, down to a hem under the jaw. */
const HEM = -46;
const inFace = (th: number, ph: number) => { let d = ((th % 360) + 360) % 360 - 90; if (d > 180) d -= 360; return (d / 41) ** 2 + ((ph + 9) / 31) ** 2 < 1; };
const covered = (th: number, ph: number) => ph >= HEM && !inFace(th, ph);
const frame = (p: V) => { const n = nrm(p); const u = norm(cross(Math.abs(n[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1], n)); return { n, u, v: cross(n, u) }; };

interface Poly { p: V[]; n?: V[]; closed?: boolean }
const disc = (c: V, r: number, seg = 28): Poly => {
  const { n, u, v } = frame(c); const p: V[] = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * 2 * Math.PI; p.push(add(add(c, u, Math.cos(a) * r), v, Math.sin(a) * r)); }
  return { p, n: p.map(() => n) };
};
const onSurf = (fn: (t: number) => [number, number], n = 40, lift = 1.0): Poly => {
  const p: V[] = [], ns: V[] = [];
  for (let i = 0; i <= n; i++) { const [th, ph] = fn(i / n); const q = surf(th, ph, lift); p.push(q); ns.push(nrm(q)); }
  return { p, n: ns };
};

// ---------- cap shell ----------
function shell(): Poly[] {
  const out: Poly[] = [];
  // face opening and its rolled edge
  for (const k of [1, 1.09]) out.push(onSurf((t) => [90 + 41 * k * Math.cos(t * 2 * Math.PI), -9 + 31 * k * Math.sin(t * 2 * Math.PI)], 72, 1.005));
  // hem under the jaw and around the neck
  out.push(onSurf((t) => [t * 360, HEM], 96));
  // centre strip seams, forehead to nape over the crown
  for (const x0 of [-0.24, 0.24]) {
    const k = Math.sqrt(1 - (x0 * x0) / (A * A)); const p: V[] = [], n: V[] = [];
    for (let i = 0; i <= 90; i++) {
      const t = -10 * D + (i / 90) * 250 * D; const q: V = [x0, B * k * Math.cos(t), C * k * Math.sin(t)];
      const th = Math.atan2(q[1] / B, q[0] / A) / D, ph = Math.asin(clamp(q[2] / C, -1, 1)) / D;
      if (covered(th, ph)) { p.push(q); n.push(nrm(q)); }
    }
    out.push({ p, n });
  }
  // ear cups, with the seam that runs up from each to the centre strip
  for (const th of [0, 180]) {
    const c = surf(th, -10, 1.03); out.push(disc(c, 0.27), disc(c, 0.2), disc(c, 0.07, 14));
    out.push(onSurf((t) => [th, 72 - t * 64], 20));
  }
  return out;
}

// ---------- sensor modules ----------
interface Part { id: SensorId; polys: Poly[]; anchor: V; dir: V; delay: number }
function parts(): Part[] {
  const e: [number, number][] = [[0, 90], [35, 46], [90, 52], [145, 46], [215, 46], [270, 50], [325, 46]];
  const eeg: Poly[] = [];
  e.forEach(([th, ph], i) => {
    const c = surf(th, ph, 1.015); eeg.push(disc(c, 0.075, 20), disc(c, 0.028, 10));
    if (i) eeg.push(onSurf((t) => [th, 90 - t * (90 - ph)], 12, 1.015));
  });
  const fn: Poly[] = [];
  const [t0, t1, p0, p1] = [62, 118, 29, 46];
  fn.push(onSurf((t) => {
    const q = t * 4; // walk the rectangle
    if (q < 1) return [t0 + (t1 - t0) * q, p0]; if (q < 2) return [t1, p0 + (p1 - p0) * (q - 1)];
    if (q < 3) return [t1 - (t1 - t0) * (q - 2), p1]; return [t0, p1 - (p1 - p0) * (q - 3)];
  }, 64, 1.02));
  for (const th of [71, 84, 96, 109]) fn.push(disc(surf(th, 37.5, 1.02), 0.04, 12));
  const ppgC = surf(36, 8, 1.02);
  const ppg: Poly[] = [disc(ppgC, 0.1, 22), disc(ppgC, 0.055, 14), disc(ppgC, 0.018, 8)];
  const tC = surf(50, 24, 1.02);
  const temp: Poly[] = [disc(tC, 0.06, 16), disc(tC, 0.022, 8)];
  // IMU: a small chip standing off the rear crown
  const ic = surf(205, 60, 1.03), fr = frame(ic); const imu: Poly[] = [];
  const corner = (a: number, b: number, h: number): V => add(add(add(ic, fr.u, a * 0.1), fr.v, b * 0.075), fr.n, h * 0.05);
  for (const h of [0, 1]) imu.push({ p: [corner(-1, -1, h), corner(1, -1, h), corner(1, 1, h), corner(-1, 1, h), corner(-1, -1, h)] });
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) imu.push({ p: [corner(a, b, 0), corner(a, b, 1)] });
  imu.push({ p: [corner(-0.4, 0, 1), corner(0.4, 0, 1)] }, { p: [corner(0, -0.4, 1), corner(0, 0.4, 1)] });
  // microphone booms
  const voice: Poly[] = []; let mic: V = [0, 0, 0];
  for (const sx of [1, -1]) {
    const b: V[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20; const a = t * 0.5 * Math.PI;
      b.push([sx * (0.86 - 0.68 * (1 - Math.cos(a))), 0.12 + 0.96 * Math.sin(a), -0.2 - 0.34 * t]);
    }
    voice.push({ p: b });
    const end = b[b.length - 1]; if (sx === 1) mic = end;
    const cap: V[] = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * 2 * Math.PI; cap.push([end[0] - sx * 0.02 + Math.cos(a) * 0.07, end[1], end[2] + Math.sin(a) * 0.045]); }
    voice.push({ p: cap });
  }
  return [
    { id: 'eeg', polys: eeg, anchor: surf(35, 46, 1.02), dir: [0.3, -0.3, 0.8], delay: 0 },
    { id: 'fnirs', polys: fn, anchor: surf(104, 37.5, 1.02), dir: [-0.25, 1.0, 0.25], delay: 0.1 },
    { id: 'ppg', polys: ppg, anchor: ppgC, dir: [1.15, -0.1, 0.1], delay: 0.2 },
    { id: 'imu', polys: imu, anchor: corner(0, 0, 1), dir: [-0.8, -0.35, 0.5], delay: 0.3 },
    { id: 'temp', polys: temp, anchor: tC, dir: [0.9, 0.55, -0.15], delay: 0.4 },
    { id: 'voice', polys: voice, anchor: mic, dir: [-0.1, 0.75, -0.65], delay: 0.5 },
  ];
}

const SHELL = shell();
const PARTS = parts();

export interface CapOpts {
  cx: number; cy: number; scale: number; yaw?: number;
  /** 0 assembled .. 1 fully exploded */ explode?: number;
  hover?: SensorId | null; only?: SensorId | null; labels?: 'full' | 'short' | 'none';
  /** dim the shell further (sensor pages) */ ghost?: boolean; w?: number; forceLabels?: boolean; labelOpacity?: number;
  /** per-part lift 0..1; when given it replaces the all-at-once explode */ lift?: Partial<Record<SensorId, number>>;
  /** opacity of the shell and of unlit parts while one part is in focus */ shellOpacity?: number; fade?: number;
  /** camera elevation in degrees for a true orthographic view; omit for the isometric drawing view */ el?: number;
}
export interface CapOut { svg: string; anchors: { id: SensorId; x: number; y: number }[] }

export function renderCap(o: CapOpts): CapOut {
  const yaw = (o.yaw ?? 0) * D, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const ortho = o.el !== undefined, HX = ortho ? Math.SQRT1_2 : 0.866, HY = ortho ? Math.SQRT1_2 * Math.sin(o.el! * D) : 0.5, HZ = ortho ? Math.cos(o.el! * D) : 1, T = (2 * HY) / HZ;
  const rot = (v: V): V => [v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs, v[2]];
  const P = (v: V, off?: V): [number, number] => {
    const r = rot(off ? add(v, off) : v);
    return [o.cx + (r[0] - r[1]) * HX * o.scale, o.cy + ((r[0] + r[1]) * HY - r[2] * HZ) * o.scale];
  };
  const facing = (n: V) => { const r = rot(n); return r[0] + r[1] + T * r[2] > -0.05; };
  const draw = (pl: Poly, front: string, back: string | null, off?: V) => {
    let out = '', run: [number, number][] = [], cur = true;
    const flush = () => { if (run.length > 1) { const cls = cur ? front : back; if (cls) out += `<path class="${cls}" d="${pts(run)}"/>`; } run = []; };
    pl.p.forEach((q, i) => {
      const vis = pl.n ? facing(pl.n[i]) : true; const s = P(q, off);
      if (i && vis !== cur) { run.push(s); flush(); }
      cur = vis; run.push(s);
    });
    flush(); return out;
  };
  let svg = '';
  const dimAll = !!o.hover || !!o.only || o.ghost;
  svg += `<g opacity="${dimAll ? (o.shellOpacity ?? 0.45) : 1}">`;
  // the wearer, faint: nose, neck and shoulders, so the cap reads as worn
  {
    const nose: V[] = [[0, 0.975, 0.04], [0, 1.13, -0.17], [0, 0.99, -0.22]];
    if (facing([0, 1, 0])) svg += `<path class="s-hair" d="${pts(nose.map((q) => P(q)))}"/>`;
    const k = HX * Math.SQRT2 * o.scale, a = P([0, 0, -0.78]), b = P([0, 0, -1.22]), nr = 0.4 * k, sh = 1.05 * k;
    for (const sg of [-1, 1]) svg += `<path class="s-hair" d="M${f(a[0] + sg * nr)} ${f(a[1])}L${f(b[0] + sg * nr)} ${f(b[1])}Q${f(b[0] + sg * nr * 1.05)} ${f(b[1] + o.scale * 0.2)} ${f(b[0] + sg * sh)} ${f(b[1] + o.scale * 0.34)}"/>`;
  }
  for (const pl of SHELL) svg += draw(pl, o.ghost ? 's-dim' : 's', 's-hair');
  // silhouette of the head: the part under the cap is drawn solid, the bare face and jaw faint
  {
    const m = norm([(cs + sn) / A, (cs - sn) / B, T / C]), u = norm(cross(m, [0, 0, 1])), v = cross(m, u);
    let run: [number, number][] = [], cur = true, out = '';
    const flush = () => { if (run.length > 1) out += `<path class="${cur ? (o.ghost ? 's-dim' : 's') : 's-hair'}" d="${pts(run)}"/>`; run = []; };
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * 2 * Math.PI, q: V = [Math.cos(t) * u[0] + Math.sin(t) * v[0], Math.cos(t) * u[1] + Math.sin(t) * v[1], Math.cos(t) * u[2] + Math.sin(t) * v[2]];
      const inCap = covered(Math.atan2(q[1], q[0]) / D, Math.asin(clamp(q[2], -1, 1)) / D), sp = P([q[0] * A, q[1] * B, q[2] * C]);
      if (i && inCap !== cur) { run.push(sp); flush(); }
      cur = inCap; run.push(sp);
    }
    flush(); svg += out;
  }
  svg += '</g>';
  const anchors: CapOut['anchors'] = [];
  const ex = o.explode ?? 0;
  for (const part of PARTS) {
    if (o.only && o.only !== part.id && !o.ghost) continue;
    const pp = o.lift ? (o.lift[part.id] ?? 0) : easeOutBack(clamp((ex - part.delay * 0.9) / 0.5));
    const off: V = [part.dir[0] * pp, part.dir[1] * pp, part.dir[2] * pp];
    const lit = o.hover === part.id || o.only === part.id;
    const faded = (o.hover && !lit) || (o.only && !lit);
    svg += `<g opacity="${faded ? (o.fade ?? 0.22) : 1}">`;
    for (const pl of part.polys) svg += draw(pl, lit ? 's-you' : 's', faded || (lit && o.lift) ? null : 's-hair', off);
    // travel line back to where the part seats
    if (pp > 0.05 && !faded) { const a = P(part.anchor), b = P(part.anchor, off); svg += line(a[0], a[1], b[0], b[1], 's-hair', 'stroke-dasharray="2 5"'); }
    svg += '</g>';
    const [ax, ay] = P(part.anchor, off);
    anchors.push({ id: part.id, x: ax, y: ay });
    const lp = o.forceLabels ? (o.only === part.id ? 1 : 0) : clamp((ex - part.delay * 0.9 - 0.3) / 0.25);
    if (o.labels && o.labels !== 'none' && lp > 0 && !faded) {
      const s = SENSORS.find((x) => x.id === part.id)!;
      const right = ax >= o.cx; const sg = right ? 1 : -1;
      const short = o.labels === 'short';
      const run = (short ? 14 : 46) * lp, ex1 = ax + sg * 14 * Math.min(1, lp * 2), ey1 = ay - 14 * Math.min(1, lp * 2);
      const ex2 = ex1 + sg * run; const tx = ex2 + sg * 8; const anc = right ? 'start' : 'end';
      const cls = lit ? 's-you' : 's-dim';
      svg += `<g opacity="${f(o.labelOpacity ?? 1)}">`;
      svg += circle(ax, ay, 2.5, lit ? 'f-you' : 'f-fg') + `<path class="${cls}" d="M${f(ax)} ${f(ay)}L${f(ex1)} ${f(ey1)}L${f(ex2)} ${f(ey1)}"/>`;
      if (lp > 0.6) {
        const op = `opacity="${f((lp - 0.6) / 0.4)}" text-anchor="${anc}"`;
        svg += text(tx, ey1 - 4, `${s.no}${short ? '' : ' · ' + s.name}`, lit ? 't-label t-you' : 't-label t-fg', op);
        svg += text(tx, ey1 + 11, short ? s.short : `${s.grams ? s.grams + ' g est.' : 'Existing part'} · ${s.watches}`, 't-label', op);
      }
      svg += '</g>';
    }
  }
  return { svg, anchors };
}

/** Screen position of one part's anchor when assembled, for zooming sensor pages. */
export function partCentre(id: SensorId): V { return PARTS.find((p) => p.id === id)!.anchor; }
export function projectPoint(v: V, cx: number, cy: number, scale: number, yawDeg = 0): [number, number] {
  const y = yawDeg * D, c = Math.cos(y), s = Math.sin(y); const r: V = [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  return [cx + (r[0] - r[1]) * 0.866 * scale, cy + ((r[0] + r[1]) * 0.5 - r[2]) * scale];
}
