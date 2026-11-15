// Chapters 00–04: the problem and the proof.
import { scene, Spring, SPRING, reduced, clamp, lerp, seg, easeOut, easeInOut, f, pts, path, line, circle, text, pad, wob, dot, scrollToProgress } from '../lib/motion';
import { dial, angleAt, angleDelta } from '../lib/dial';
import { story, series, analyse, reading, LEARN, type Status } from '../lib/sim';
import { Watch, WATCH, type Src } from '../lib/watch';

// 00 · Nobody notices a slow change.
export function c00(sec: HTMLElement) {
  const bow = new Spring(0, ...SPRING.loose), bx = new Spring(0, ...SPRING.soft);
  let drift = 0;
  scene(sec, {
    draw(c) {
      const y0 = c.h * (c.w < 720 ? 0.7 : 0.66), max = Math.min(c.h * 0.2, 130);
      drift = reduced ? max * 0.5 : Math.min(max, drift + c.dt * 9);
      const y = y0 + drift;
      const near = c.inside && Math.abs(c.my - y) < 130;
      bow.set(near ? Math.sign(y - c.my || 1) * (130 - Math.abs(c.my - y)) * 0.55 : 0); bow.step(c.dt);
      if (c.inside) bx.set(c.mx); bx.step(c.dt);
      const p: [number, number][] = [];
      for (let x = -4; x <= c.w + 8; x += 8) p.push([x, y + wob(x * 0.006 + c.t * (reduced ? 0 : 0.35)) * 2.5 + bow.v * Math.exp(-(((x - bx.v) / 120) ** 2))]);
      let s = '';
      const a = clamp((drift - 5) / 14);
      if (a > 0) {
        s += line(0, y0, c.w, y0, 's-dim', `stroke-dasharray="2 6" opacity="${f(a)}"`);
        const lx = Math.min(c.w - 16, c.w * 0.86);
        s += text(lx, y0 - 10, 'Where you started', 't-label', `text-anchor="end" opacity="${f(a)}"`);
        s += line(lx + 10, y0 + 3, lx + 10, y - 5, 's-dim', `opacity="${f(a)}"`) + path(`M${f(lx + 6)} ${f(y - 10)}l4 5l4 -5`, 's-dim', `opacity="${f(a)}"`);
        s += text(lx, y + 22, `${pad(drift, 3)} px lower since you arrived`, 't-label t-you', `text-anchor="end" opacity="${f(a)}"`);
      }
      s += path(pts(p), 's-you');
      return s;
    },
  });
}

// 01 · On Mars, the doctor is up to twenty minutes away. Each way.
export function c01(sec: HTMLElement) {
  const stops = [
    { name: 'Space Station', big: '0.0 s', note: 'One way · real time', x: 0.2, period: 0.3 },
    { name: 'Moon', big: '1.3 s', note: 'One way · real time', x: 0.5, period: 1.3 },
    { name: 'Mars', big: '20 min', note: 'One way · shown 100× faster', x: 0.94, period: 12 },
  ];
  const ang = new Spring(0, ...SPRING.snap), pos = new Spring(stops[0].x, ...SPRING.soft);
  let phase = 0, last = 0;
  scene(sec, {
    draw(c) {
      const sFloat = c.p < 0.18 ? 0 : c.p < 0.45 ? seg(c.p, 0.18, 0.45) : c.p < 0.58 ? 1 : c.p < 0.85 ? 1 + seg(c.p, 0.58, 0.85) : 2;
      const i = Math.round(sFloat), st = stops[i];
      if (i !== last) { phase = 0; last = i; }
      ang.set(i * 60); ang.step(c.dt); pos.set(st.x); pos.step(c.dt);
      phase = reduced ? 0.6 : (phase + c.dt / st.period) % 2;
      const small = c.w < 720;
      const ty = c.h * 0.24, x0 = small ? 14 : c.w * 0.04, x1 = x0 + (c.w - x0 * 2) * pos.v;
      let s = '';
      s += line(x0, ty, c.w - x0, ty, 's-hair', 'stroke-dasharray="1 7"');
      stops.forEach((q, k) => { const qx = x0 + (c.w - x0 * 2) * q.x; s += line(qx, ty - 5, qx, ty + 5, 's-hair'); if (k !== i && !small) s += text(qx, ty + 26, q.name, 't-label', 'text-anchor="middle" opacity="0.5"'); });
      s += line(x0, ty, x1, ty, 's-dim');
      s += circle(x0, ty, 9, 's') + circle(x0, ty, 3, 'f-fg') + text(x0 - 9, ty + 30, 'Earth', 't-label t-fg');
      s += circle(x1, ty, 9, 's') + text(x1, ty + 30, st.name, 't-label t-fg', `text-anchor="${pos.v > 0.8 ? 'end' : 'middle'}"`);
      // the message: out, then the answer back
      const out = phase < 1, t = out ? phase : 2 - phase, mx = lerp(x0, x1, t);
      s += circle(mx, ty, 4.5, 'f-you') + line(mx, ty, mx - (out ? 22 : -22) * Math.min(1, st.period), ty, 's-you', 'opacity="0.5"');
      s += text(mx, ty - 16, out ? 'Question' : 'Answer', 't-label t-you', 'text-anchor="middle"');
      const r = Math.min(c.h * 0.2, 88), cy = c.h - r - 26, cx = small ? c.w / 2 : c.w * 0.5;
      s += dial({ cx, cy, r, angle: ang.v, n: 6, heavy: 1, big: st.big, label: 'Signal delay', sub: st.note.split(' · ')[0] });
      if (!small) {
        s += text(cx + r + 40, cy - 6, st.note.split(' · ')[1], 't-label');
        s += text(cx + r + 40, cy + 14, i === 2 ? 'Ask, then wait 40 minutes for a reply' : i === 1 ? 'A conversation still works' : 'Like a phone call', 't-label t-fg');
      } else s += text(cx, cy - r - 26, i === 2 ? 'Shown 100× faster · 40 min for a reply' : st.note.split(' · ')[1], 't-label', 'text-anchor="middle"');
      return s;
    },
  });
}

// 02 · The dangerous changes are the slow ones.
export function c02(sec: HTMLElement) {
  const day = (h: number, d: number) => 0.5 - 0.3 * Math.cos(((h - 3.5) / 24) * 2 * Math.PI) + 0.07 * Math.sin((h / 24) * 6 * Math.PI) + (d - 1) * 0.0034;
  scene(sec, {
    draw(c) {
      const N = Math.round(lerp(2, 120, easeInOut(seg(c.p, 0.1, 0.92))));
      const x0 = 0, x1 = c.w, top = c.h * 0.12, bot = c.h * 0.84;
      const X = (h: number) => lerp(x0, x1, h / 24), Y = (v: number) => lerp(bot, top, (v - 0.1) / 1.25);
      const curve = (d: number) => { const p: [number, number][] = []; for (let h = 0; h <= 24; h += 0.5) p.push([X(h), Y(day(h, d))]); return pts(p); };
      let s = line(x0, bot + 14, x1, bot + 14, 's-hair');
      for (let h = 0; h <= 24; h += 6) s += line(X(h), bot + 10, X(h), bot + 18, 's-hair') + text(X(h) + (h === 24 ? -4 : 4), bot + 32, `${pad(h)}:00`, 't-label', h === 24 ? 'text-anchor="end"' : '');
      for (let d = 8; d < N; d += 8) s += path(curve(d), 's-hair');
      s += path(curve(1), 's-dim');
      s += path(curve(N), 's-you');
      const gx = X(17), ya = Y(day(17, 1)), yb = Y(day(17, N));
      if (ya - yb > 16) s += line(gx, ya - 4, gx, yb + 4, 's') + path(`M${f(gx - 4)} ${f(yb + 9)}l4 -5l4 5M${f(gx - 4)} ${f(ya - 9)}l4 5l4 -5`, 's');
      const total = ((day(17, N) - day(17, 1)) / day(17, 1)) * 100;
      s += text(X(1), Y(day(1, 1)) + 26, 'Day 001', 't-label');
      s += text(X(1), Y(day(1, N)) - 14, `Day ${pad(N, 3)}`, 't-label t-you');
      s += text(c.w, top - 6, `Since yesterday  +0.3 %`, 't-label', 'text-anchor="end"');
      s += text(c.w, top + 12, `Since day 1  +${total.toFixed(0)} %`, 't-label t-fg', 'text-anchor="end"');
      return s;
    },
  });
}

// 03 · Medical limits are built for everyone. Drift is personal.
export function c03(sec: HTMLElement) {
  const hw = new Spring(1, ...SPRING.soft), lift = new Spring(0, ...SPRING.soft);
  scene(sec, {
    draw(c) {
      const mine = c.p > 0.36, drifted = c.p > 0.7;
      hw.set(mine ? 0 : 1); hw.step(c.dt); lift.set(drifted ? 1 : 0); lift.step(c.dt);
      const cy = c.h * 0.52, wide = Math.min(c.h * 0.36, 190), tight = 24, H = lerp(tight, wide, hw.v);
      const p: [number, number][] = [], q: [number, number][] = [];
      const xs = c.w * 0.7;
      for (let x = 0; x <= c.w; x += 6) {
        const up = lift.v * easeOut(seg(x, xs, c.w)) * 62;
        (x <= xs + 3 ? p : q).push([x, cy + wob(x * 0.021, 2) * 13 - up]);
        if (x > xs - 3 && x <= xs + 3) q.push(p[p.length - 1]);
      }
      let s = '';
      s += line(0, cy - wide, c.w, cy - wide, 's-hair', 'stroke-dasharray="6 6"') + line(0, cy + wide, c.w, cy + wide, 's-hair', 'stroke-dasharray="6 6"');
      s += text(0, cy - wide - 10, 'Healthy range · everyone', 't-label');
      s += `<rect class="band" x="0" y="${f(cy - H)}" width="${f(c.w)}" height="${f(2 * H)}" opacity="${f(1 - clamp(hw.v))}"/>`;
      const cls = mine ? 's-you' : 's-dim';
      s += line(0, cy - H, c.w, cy - H, cls, 'stroke-width="1.25"') + line(0, cy + H, c.w, cy + H, cls, 'stroke-width="1.25"');
      if (mine && hw.v < 0.3) s += text(0, cy + H + 20, 'Your normal', 't-label t-you');
      s += path(pts(p), 's-you') + path(pts(q), lift.v > 0.45 ? 's-drift' : 's-you');
      const ex = c.w - 6, ey = q[q.length - 1][1];
      s += dot(ex - 2, ey, lift.v > 0.45 ? 'drift' : 'ok', 6);
      if (lift.v > 0.6) {
        s += text(ex - 16, ey - 18, 'Fine for everyone', 't-label', 'text-anchor="end"');
        s += text(ex - 16, ey - 34, 'Not normal for you', 't-label t-drift', 'text-anchor="end"');
      }
      return s;
    },
  });
}

// 04 · Flagged on day 96. The limit was day 138.  (the mission dial)
export function c04(sec: HTMLElement) {
  const S = story(), LAST = 150;
  const { vals, a, r, flagDay, limitDay } = S;
  const status = (d: number): Status => (d >= limitDay ? 'limit' : d >= flagDay ? 'drift' : d > LEARN ? 'ok' : 'learn');
  // the watch: sleep follows this story; the other five vitals stay quiet
  const src: Src = Object.fromEntries(WATCH.map((w) => { const rr = reading(w.id), v = series(w.id, 'nominal'); return [w.id, { r: rr, vals: v, a: analyse(v, rr) }]; }));
  src.sleep = { r, vals, a: { ...a, status } };
  const watch = new Watch(src);
  const lock = new Spring(0, ...SPRING.soft), pop = new Spring(0, 260, 14), end = new Spring(0, 260, 14);
  const range = sec.querySelector<HTMLInputElement>('input[type=range]');
  const hFlag = sec.querySelector<HTMLElement>('[data-on=flag]'), hLimit = sec.querySelector<HTMLElement>('[data-on=limit]');
  let prevDay = 1, grab = false, lastAng = 0, moved = 0, geo = { cx: 0, cy: 0, r: 1 };
  range?.addEventListener('input', () => scrollToProgress(sec, (+range.value - 1) / (LAST - 1)));

  /** A label that snaps on in a bordered box, with a leader line down to its point. */
  const flag = (c: { w: number }, x: number, y: number, label: string, kind: 'drift' | 'limit', k: number, rise = 52) => {
    const tw = label.length * 7.6 + 20, right = x + tw + 12 < c.w, bx0 = right ? x + 12 : x - 12 - tw, by0 = y - rise;
    let s = line(x, y - 10, x, by0 + 24, `s-${kind}`, 'stroke-width="1.25"');
    s += `<g transform="translate(${f(x)} ${f(by0 + 12)}) scale(${f(k)}) translate(${f(-x)} ${f(-(by0 + 12))})">`;
    s += `<rect x="${f(bx0)}" y="${f(by0)}" width="${f(tw)}" height="24" rx="2" class="f-bg" stroke="var(--${kind})" stroke-width="1.5"/>`;
    return s + text(bx0 + 10, by0 + 16, label, `t-label t-${kind}`) + '</g>';
  };

  scene(sec, {
    draw(c) {
      const dayF = 1 + c.p * (LAST - 1), day = Math.round(dayF), st = status(day);
      if (range && document.activeElement !== range) range.value = String(day);
      // the watch taps when drift is flagged and buzzes at the limit, scrolling forward
      if (prevDay < flagDay && day >= flagDay && day < limitDay) { watch.buzz('drift'); watch.bezel.kick(-520); }
      if (prevDay < limitDay && day >= limitDay) { watch.buzz('limit'); watch.bezel.kick(-700); }
      if (day < limitDay && watch.hap.kind === 'limit') watch.hap.kind = '';
      if (day < flagDay && watch.hap.kind === 'drift') watch.hap.kind = '';
      prevDay = day;
      lock.set(day > LEARN ? 1 : 0); lock.step(c.dt);
      pop.set(day >= flagDay ? 1 : 0); pop.step(c.dt); end.set(day >= limitDay ? 1 : 0); end.step(c.dt);
      hFlag?.classList.toggle('lit', day >= flagDay); hLimit?.classList.toggle('lit', day >= limitDay);

      // layout: watch beside the chart on wide screens, under it on narrow ones
      const wide = c.w >= 640 && c.w > c.h * 1.2, small = c.w < 720;
      const k = wide ? clamp(c.h / 350, 0.6, 1.3) : clamp(Math.min((c.h * 0.46) / 320, (c.w - 8) / 340), 0.45, 1);
      const wx = wide ? c.w - 172 * k : c.w / 2, wy = wide ? c.h / 2 - 8 * k : c.h - 168 * k;
      geo = { cx: wx, cy: wy, r: 136 * k };
      const cw = wide ? c.w - 340 * k - 36 : c.w, top = 14, bot = wide ? c.h - 58 : wy - 168 * k - (small ? 44 : 56);
      const X = (d: number) => lerp(0, cw, (d - 1) / (LAST - 1)), Y = (v: number) => lerp(bot, top, (v - 5.7) / (7.75 - 5.7));
      let s = '';
      // week ticks
      s += line(0, bot + 12, cw, bot + 12, 's-hair');
      for (let d = 1; d <= LAST; d += 7) s += line(X(d), bot + 8, X(d), bot + (d % 28 === 1 ? 20 : 16), 's-hair');
      for (let d = 29; d <= LAST; d += small ? 56 : 28) if (X(d) + 56 <= cw) s += text(X(d) + 4, bot + 28, `Day ${d}`, 't-label', 'opacity="0.7"');
      // the limit, built for everyone
      s += line(0, Y(r.limit.v), cw, Y(r.limit.v), 's-limit', 'stroke-dasharray="8 6"');
      s += text(0, Y(r.limit.v) + 16, small ? 'Limit · 6.0 h' : 'Attention limit · 6.0 h of sleep', 't-label t-limit');
      // your normal: grows for 14 days, then locks and runs ahead
      const grow = Math.pow(clamp((dayF - 1) / (LEARN - 1)), 0.6), bx = day > LEARN ? lerp(X(LEARN), cw, clamp(lock.v, 0, 1.02)) : X(Math.min(dayF, LEARN));
      const half = (Y(a.lo) - Y(a.hi)) / 2 * grow, my = Y(a.mean);
      s += `<rect class="band" x="0" y="${f(my - half)}" width="${f(bx)}" height="${f(half * 2)}"/>`;
      s += line(0, my - half, bx, my - half, 's-you', 'stroke-width="1"') + line(0, my + half, bx, my + half, 's-you', 'stroke-width="1"');
      if (day <= LEARN) s += text(X(LEARN) + 10, my + 4, `Learning you  ${pad(day)} / ${LEARN}`, 't-label t-fg');
      else s += text(cw, my - half - 8, 'Your normal', 't-label t-you', `text-anchor="end" opacity="${f(clamp(lock.v))}"`);
      // nightly readings and the 7-day trend
      for (let d = 1; d <= day; d++) s += circle(X(d), Y(vals[d - 1]), 1.3, 'f-dim', 'opacity="0.6"');
      // the trend changes colour exactly where it crosses: green inside your normal, amber outside it, red past the limit
      const L = r.limit.v, cls = (v: number, d: number) => (d > LEARN && v <= L ? 'limit' : d > LEARN && (v < a.lo || v > a.hi) ? 'drift' : 'you');
      const runs: { k: string; p: [number, number][] }[] = [];
      const put = (k: string, x: number, y: number) => { const last = runs[runs.length - 1]; if (last && last.k === k) last.p.push([x, y]); else runs.push({ k, p: last ? [last.p[last.p.length - 1], [x, y]] : [[x, y]] }); };
      put('you', X(1), Y(a.trend[0]));
      for (let d = 2; d <= day; d++) {
        const v0 = a.trend[d - 2], v1 = a.trend[d - 1];
        // every threshold crossed between these two days, in order along the segment
        const cuts = (d - 1 > LEARN ? [a.lo, a.hi, L] : []).map((th) => (th - v0) / (v1 - v0)).filter((u) => u > 0 && u < 1).sort((m, n) => m - n);
        let u0 = 0;
        for (const u of [...cuts, 1]) { const um = (u0 + u) / 2, vm = v0 + (v1 - v0) * um; put(cls(vm, d - 1 + um), X(d - 1 + u), Y(v0 + (v1 - v0) * u)); u0 = u; }
      }
      for (const rn of runs) if (rn.p.length > 1) s += path(pts(rn.p), rn.k === 'limit' ? 's-limit' : rn.k === 'drift' ? 's-drift' : 's-you', rn.k === 'limit' ? 'stroke-width="2"' : '');
      // where the trend actually crossed the limit line
      const lv0 = a.trend[limitDay - 2], lv1 = a.trend[limitDay - 1], lx = X(limitDay - 1 + clamp((lv0 - L) / (lv0 - lv1))), ly = Y(L);
      // the limit point pulses once reached
      if (end.v > 0.02) { const u = (c.t * 0.9) % 1; s += circle(lx, ly, 6 + u * 18, 's-limit', `opacity="${f((1 - u) * clamp(end.v))}"`); }
      const px = X(day), py = Y(a.trend[day - 1]);
      s += circle(px, py, 9, 'f-bg') + dot(px, py, st, 6);
      // the flags snap on: amber when drift is caught, red when the limit is reached
      if (pop.v > 0.02) s += flag({ w: cw }, X(flagDay), Y(a.trend[flagDay - 1]), small ? `Drift · ${limitDay - flagDay} days early` : `Drift · ${limitDay - flagDay} days before limit`, 'drift', clamp(pop.v, 0, 1.3));
      if (end.v > 0.02) s += flag({ w: cw }, lx, ly, small ? `Limit · day ${limitDay}` : `Limit reached · day ${limitDay}`, 'limit', clamp(end.v, 0, 1.3), 46);

      // readouts
      if (wide) {
        s += text(0, c.h - 6, `Day ${pad(day, 3)} · turn the bezel`, 't-label t-fg');
        s += text(cw, c.h - 6, `Sleep ${vals[day - 1].toFixed(1)} h · 7-night ${a.trend[day - 1].toFixed(2)} h`, 't-label', 'text-anchor="end"');
      }
      // the watch
      const msg = st === 'learn' ? `Learning you ${pad(day)}/${LEARN}` : st === 'ok' ? 'In your normal' : st === 'drift' ? 'Sleep drifting' : 'Limit · Sleep';
      s += `<g transform="translate(${f(wx - 160 * k)} ${f(wy - 160 * k)}) scale(${f(k)})">${watch.draw({ day, dt: c.dt, now: c.t, msg, st, bezelDeg: day * (360 / 28) })}</g>`;
      c.section.dataset.hap = watch.active;
      return s;
    },
    onDown(c) {
      if (Math.hypot(c.mx - geo.cx, c.my - geo.cy) > geo.r * 1.2) return false;
      grab = true; moved = 0; lastAng = angleAt(geo.cx, geo.cy, c.mx, c.my); return true;
    },
    onDrag(c) {
      const now = angleAt(geo.cx, geo.cy, c.mx, c.my), d = angleDelta(lastAng, now); lastAng = now; moved += Math.abs(d);
      scrollToProgress(sec, c.p + d / (360 / 28) / (LAST - 1));
    },
    onUp() { grab = false; if (moved < 3) watch.acknowledge(); },
  });
  sec.querySelector<HTMLElement>('.stage')!.style.cursor = 'grab';
  void grab;
}
