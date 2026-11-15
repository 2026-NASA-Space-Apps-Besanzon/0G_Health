// The wrist display, shared by the story page and the tool. Six vitals, each with its own colour:
// colour says which vital, the green ring is your normal, the red dashed line is the medical limit.
// Haptics: drifting = two short taps; limit = three long buzzes, repeating until the crown is pressed.
import { Spring, SPRING, reduced, clamp, f, path, line, circle, text } from './motion';
import { LEARN, type Status, type Reading, type Analysis } from './sim';

export const WATCH = [
  { id: 'sleep', k: 'Sleep', c: '#a08cff' }, { id: 'pulse', k: 'Pulse', c: '#ff6fae' }, { id: 'spo2', k: 'Oxygen', c: '#5a9bff' },
  { id: 'hrv', k: 'HRV', c: '#4cd4f0' }, { id: 'temp', k: 'Temp', c: '#ffa27a' }, { id: 'motion', k: 'Motion', c: '#dce35c' },
];
export const HUE: Record<string, string> = Object.fromEntries(WATCH.map((w) => [w.id, w.c]));
export const UNIT: Record<string, string> = { sleep: 'h', pulse: 'bpm', spo2: '%', hrv: 'ms', temp: '°C', motion: '/10' };
export const SHORT: Record<string, string> = { hrv: 'Heart rhythm', motion: 'Motion sickness', temp: 'Skin temp', spo2: 'Oxygen', pulse: 'Pulse', bone: 'Exercise', load: 'Workload' };

export type Src = Record<string, { r: Reading; a: Analysis; vals: number[] }>;
export type HapKind = 'drift' | 'limit';

/** Size of the drawing in its own units: centre (160, 160), case radius 136, 320 × 320. */
export const WATCH_BOX = { cx: 160, cy: 160, w: 320, h: 320 };

const AX = WATCH.map((_, i) => ((-120 + 60 * i) * Math.PI) / 180);
const PAT = {
  drift: { on: [[0, 0.09], [0.2, 0.09]], period: 0, phone: [90, 110, 90] },
  limit: { on: [[0, 0.32], [0.5, 0.32], [1, 0.32]], period: 2.2, phone: [320, 180, 320, 180, 320] },
} as const;
const arcD = (x: number, y: number, r: number, a0: number, a1: number) =>
  `M${f(x + Math.cos(a0) * r)} ${f(y + Math.sin(a0) * r)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(x + Math.cos(a1) * r)} ${f(y + Math.sin(a1) * r)}`;
const hexD = (x: number, y: number, ks: number[]) => ks.map((k, i) => `${i ? 'L' : 'M'}${f(x + Math.cos(AX[i]) * k)} ${f(y + Math.sin(AX[i]) * k)}`).join('') + 'Z';

export class Watch {
  radii = WATCH.map(() => new Spring(0.48, ...SPRING.soft));
  bezel = new Spring(0, ...SPRING.snap);
  hap = { kind: '' as '' | HapKind, t: 0, day: 0, ack: false, was: 0, cycle: -1, phone: false };
  ripple = { t: 9, kind: 'drift' as HapKind };
  /** current vibration, 0 or 1 */ level = 0;
  constructor(public src: Src) {}

  st(id: string, day: number): Status { return this.src[id].a.status(day); }

  /** Where a value sits on its axis: 0.38 to 0.58 is your normal, 1.0 is the medical limit. */
  place(id: string, day: number) {
    const { r, a, vals } = this.src[id], v = vals[day - 1], s = this.st(id, day), sgn = Math.sign(r.limit.v - a.mean);
    const z = ((v - a.mean) / a.hw) * sgn, L = Math.abs(r.limit.v - a.mean) / a.hw;
    let k = z > 1 ? 0.58 + (0.42 * (z - 1)) / (L - 1) : z < -1 ? 0.38 - 0.1 * (-z - 1) : 0.48 + 0.1 * z;
    // the face never contradicts the tool: in-normal sits inside the ring, drifting outside it, a limit on the red line
    if (s === 'ok') k = clamp(k, 0.39, 0.57);
    if (s === 'drift') { const tz = ((a.trend[day - 1] - a.mean) / a.hw) * sgn; k = tz >= 0 ? Math.max(k, 0.63) : Math.min(k, 0.33); }
    if (s === 'limit') k = Math.max(k, 1.02);
    return clamp(k, 0.14, 1.14);
  }

  /** Start a haptic pattern. With a day, it stops when the day changes; with 0 it plays out. */
  buzz(kind: HapKind, day = 0) { Object.assign(this.hap, { kind, t: 0, day, ack: false, was: 0, cycle: -1 }); }
  acknowledge() { if (this.hap.kind === 'limit' && !this.hap.ack) { this.hap.ack = true; navigator.vibrate?.(0); return true; } return false; }
  get pending() { return this.hap.kind === 'limit' && !this.hap.ack; }
  get active(): '' | HapKind { return this.level ? this.hap.kind : ''; }

  private hapLevel() {
    const h = this.hap;
    if (!h.kind || h.ack) return 0;
    const p = PAT[h.kind]; let t = h.t;
    const phone = () => { if (h.phone) navigator.vibrate?.(p.phone as unknown as number[]); };
    if (p.period) { if (t > p.period * 4) return 0; const c = Math.floor(t / p.period); if (c !== h.cycle) { h.cycle = c; phone(); } t %= p.period; }
    else { if (t > 0.6) return 0; if (h.cycle < 0) { h.cycle = 0; phone(); } }
    for (const [s, d] of p.on) if (t >= s && t < s + d) return 1;
    return 0;
  }

  /**
   * Draw the face in its own units (see WATCH_BOX).
   * msg: the one status line. st: overall status. bezelDeg: where the bezel should turn to.
   */
  draw(o: { day: number; dt: number; now: number; msg: string; st: Status; bezelDeg: number; time?: string; /** paused: no vibration */ still?: boolean }) {
    const { day, dt, now } = o, cx = 160, cy = 160, R = 132, learning = day <= LEARN, h = this.hap;
    this.bezel.set(o.bezelDeg); this.bezel.step(dt); this.ripple.t += dt;
    if (h.kind && h.day > 0 && h.day !== day) h.kind = ''; // day 0: the buzz is not tied to one day
    if (!o.still) h.t += dt;
    const lvl = (this.level = o.still ? 0 : this.hapLevel()), rising = lvl && !h.was; h.was = lvl;
    if (rising && h.kind) { this.ripple.t = 0; this.ripple.kind = h.kind; }
    const crit = o.st === 'limit', pending = crit && this.pending;
    const pulse = 0.5 + 0.5 * Math.sin(now * 7), amp = reduced ? 0 : lvl * (h.kind === 'limit' ? 2.6 : 1.8);
    const jx = Math.sin(now * 2 * Math.PI * 47) * amp, jy = Math.cos(now * 2 * Math.PI * 31) * amp * 0.35;

    let s = '';
    // haptic marks either side of the case, and a ring on each buzz
    if (lvl || (reduced && !o.still && h.kind && h.t < 1.5)) {
      const c = h.kind === 'limit' ? 's-limit' : 's-drift';
      for (const side of [0, Math.PI]) for (let k = 0; k < 3; k++) s += path(arcD(cx, cy, R + 14 + k * 8, side - 0.2 + k * 0.03, side + 0.2 - k * 0.03), c, `stroke-width="2" opacity="${f(1 - k * 0.28)}"`);
    }
    if (this.ripple.t < 0.9) { const u = this.ripple.t / 0.9; s += circle(cx, cy, R + 6 + u * 30, this.ripple.kind === 'limit' ? 's-limit' : 's-drift', `stroke-width="1.5" opacity="${f(1 - u)}"`); }

    s += `<g transform="translate(${f(jx)} ${f(jy)})">`;
    // case and crown
    s += `<rect x="${cx + R + 3}" y="${cy - 11}" width="8" height="22" rx="2" class="${pending ? 'f-limit' : 's-dim'}" ${pending ? `opacity="${f(0.5 + pulse * 0.5)}"` : ''}/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="var(--ink-2)" stroke="${crit ? 'var(--limit)' : 'var(--line)'}" stroke-width="${crit ? f(1.5 + pulse * 1.5) : 1.5}"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${R - 16}" fill="#0f0f10"/>`;

    // colour ring: one segment per vital, on the rim, centred on its axis
    const RS = R - 6;
    WATCH.forEach((w, i) => {
      const ws = this.st(w.id, day), a0 = AX[i] - 0.5, a1 = AX[i] + 0.5;
      if (ws === 'limit') s += path(arcD(cx, cy, RS, a0, a1), '', `fill="none" stroke="var(--limit)" stroke-width="${f(8 + pulse * 3)}"`);
      else s += path(arcD(cx, cy, RS, a0, a1), '', `fill="none" stroke="${w.c}" stroke-width="8" opacity="${learning ? 0.3 : 0.9}"`);
      if (ws === 'drift') s += path(arcD(cx, cy, RS - 9, a0 + 0.12, a1 - 0.12), 's-drift', 'stroke-width="2"');
    });
    // fine tick ring, turns one notch a day
    s += `<g transform="rotate(${f(this.bezel.v)} ${cx} ${cy})" opacity="0.7">`;
    for (let i = 0; i < 120; i++) { const a = (i / 120) * 2 * Math.PI, r0 = R - 22, r1 = R - (i % 10 === 0 ? 16 : 19); s += line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, i % 10 === 0 ? 's-dim' : 's-hair'); }
    s += '</g>';

    // radar: green band = your normal, red dashed line = the limit, white shape = today
    const RR = 62, ks = this.radii.map((sp, i) => sp.set(this.place(WATCH[i].id, day)).step(dt));
    const six = (k: number) => hexD(cx, cy, WATCH.map(() => k * RR));
    WATCH.forEach((_, i) => { s += line(cx, cy, cx + Math.cos(AX[i]) * RR * 1.12, cy + Math.sin(AX[i]) * RR * 1.12, 's-hair'); });
    if (learning) s += path(six(0.48), 's-dim', 'stroke-dasharray="2 4"');
    else s += `<path d="${six(0.58)}${six(0.38)}" fill="var(--you)" fill-opacity="0.14" fill-rule="evenodd"/>`;
    s += path(six(1), 's-limit', `stroke-dasharray="3 4" stroke-width="1" opacity="${crit ? f(0.6 + pulse * 0.4) : 0.45}"`);
    s += `<path d="${hexD(cx, cy, ks.map((k) => k * RR))}" fill="var(--bone)" fill-opacity="0.08" stroke="${crit ? 'var(--limit)' : 'var(--bone)'}" stroke-width="1.5" stroke-linejoin="round"/>`;
    WATCH.forEach((w, i) => {
      const ws = this.st(w.id, day), px = cx + Math.cos(AX[i]) * ks[i] * RR, py = cy + Math.sin(AX[i]) * ks[i] * RR;
      if (ws === 'limit') s += circle(px, py, 6 + pulse * 4, 's-limit', `stroke-width="1.5" opacity="${f(1 - pulse * 0.6)}"`) + circle(px, py, 4, 'f-limit');
      else { if (ws === 'drift') s += circle(px, py, 7.5, 's-drift', 'stroke-width="1.5"'); s += circle(px, py, 3.6, '', `fill="${w.c}" stroke="var(--bone)" stroke-width="1.25"`); }
      // label only, in the vital's colour
      const lx = cx + Math.cos(AX[i]) * (RR + 14), ly = cy + Math.sin(AX[i]) * (RR + 14) + (Math.sin(AX[i]) > 0.3 ? 7 : Math.sin(AX[i]) < -0.3 ? -3 : 3);
      const anc = Math.cos(AX[i]) > 0.9 ? 'start' : Math.cos(AX[i]) < -0.9 ? 'end' : 'middle';
      s += text(lx, ly, w.k, 't-label', `text-anchor="${anc}" style="font-size:8px;fill:${ws === 'limit' ? 'var(--limit)' : w.c}"`);
    });

    // one status line at the bottom; a red pill at the limit
    const inNormal = WATCH.filter((w) => this.st(w.id, day) === 'ok').length;
    const msg = o.st === 'ok' ? `${inNormal}/${WATCH.length} in your normal` : o.msg, fy = cy + 91;
    if (crit) { const bw = msg.length * 6.2 + 22; s += `<rect x="${f(cx - bw / 2)}" y="${fy - 12}" width="${f(bw)}" height="17" rx="8.5" class="f-limit"/>` + text(cx, fy, msg, 't-label', 'text-anchor="middle" style="font-size:8.5px;fill:var(--ink);font-weight:600"'); }
    else s += text(cx, fy, msg, `t-label ${o.st === 'ok' ? 't-you' : o.st === 'drift' ? 't-drift' : 't-fg'}`, 'text-anchor="middle" style="font-size:8.5px"');
    if (crit) s += text(cx, fy + 13, pending ? 'Press crown' : h.ack ? 'Acknowledged' : 'Tell your crew', 't-label t-limit', `text-anchor="middle" style="font-size:7.5px" ${pending ? `opacity="${f(0.55 + pulse * 0.45)}"` : ''}`);
    s += '</g>';
    return s;
  }
}
