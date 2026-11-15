// Chapters 00–04: the problem and the proof.
import { scene, Spring, SPRING, reduced, clamp, lerp, seg, easeOut, easeInOut, f, pts, path, line, circle, text, pad, wob, dot, rng, scrollToProgress } from '../lib/motion';
import { dial, angleAt, angleDelta } from '../lib/dial';
import { story, series, analyse, reading, LEARN, EVA_DAY, type Status } from '../lib/sim';
import { Watch, WATCH, type Src, type CallView } from '../lib/watch';

// 00 · Nobody notices a slow change.
export function c00(sec: HTMLElement) {
  const bow = new Spring(0, ...SPRING.loose), bx = new Spring(0, ...SPRING.soft);
  let drift = 0;
  const head = sec.querySelector<HTMLElement>('.ch__head')!, team = sec.querySelector<HTMLElement>('.team');
  scene(sec, {
    draw(c) {
      // the line starts under the text (headline, team, challenge), never through it
      const hb = Math.max(head.getBoundingClientRect().bottom, team?.getBoundingClientRect().bottom ?? 0) - c.stage.getBoundingClientRect().top;
      const y0 = Math.min(c.h - 70, Math.max(c.h * (c.w < 720 ? 0.7 : 0.66), hb + 36)), max = Math.max(24, Math.min(c.h * 0.2, 130, c.h - y0 - 40));
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
// One scroll, three beats: the wide range for everyone → fourteen days of listening squeeze it to your normal → a drift that is fine for everyone but not for you.
export function c03(sec: HTMLElement) {
  const r = rng(11), vals = Array.from({ length: 14 }, () => (r() + r() + r() - 1.5) * 0.9);
  // the days after the lock come from the same distribution, so day 15 looks exactly like day 14 did
  const r2 = rng(23), more = Array.from({ length: 60 }, () => (r2() + r2() + r2() - 1.5) * 0.9);
  const gap = new Spring(1, ...SPRING.snap), lockS = new Spring(0, 260, 14);
  let was = false;
  scene(sec, {
    draw(c) {
      const small = c.w < 720;
      const dF = 1 + seg(c.p, 0.05, 0.4) * 13, day = Math.floor(dF + 0.001), locked = c.p > 0.44;
      if (locked !== was) { gap.kick(locked ? -6 : 0); was = locked; }
      gap.set(locked ? 0 : 1 - (day / 14) * 0.72); gap.step(c.dt); lockS.set(locked ? 1 : 0); lockS.step(c.dt);
      const cy = c.h / 2 - 12, wide = Math.min(c.h * 0.34, 190), tight = clamp(c.h * 0.1, 18, 40), H = lerp(tight, wide, gap.v);
      const x0 = 0, x1 = c.w, xs = lerp(x0, x1, small ? 0.5 : 0.4);
      const X = (d: number) => lerp(x0 + 16, xs - 10, (d - 1) / 13);
      // keep the same day spacing after the lock as before it
      const step = (X(14) - X(1)) / 13, POST = clamp(Math.round((x1 - 12 - X(14)) / step), 14, 44);
      const dPost = 14 + seg(c.p, 0.5, 0.9) * POST;
      const XP = (d: number) => X(14) + (d - 14) * step;
      const Y = (v: number) => cy - v * tight * 0.62;
      const rise = (d: number) => easeInOut(seg((d - 14) / POST, 0.42, 0.92)) * Math.min(tight * 2.1, wide * 0.55);
      const YP = (d: number) => (d <= 14 ? Y(vals[13]) : Y(more[d - 15]) - rise(d));
      let s = '';
      // everyone: the wide medical range
      s += line(x0, cy - wide, x1, cy - wide, 's-hair', 'stroke-dasharray="6 6"') + line(x0, cy + wide, x1, cy + wide, 's-hair', 'stroke-dasharray="6 6"');
      s += text(x0, cy - wide - 10, 'Healthy range · everyone', 't-label');
      // you: the band closes in like calipers while it listens
      const cls = locked ? 's-you' : 's';
      if (lockS.v > 0.02) s += `<rect class="band" x="${f(x0)}" y="${f(cy - H)}" width="${f(x1 - x0)}" height="${f(2 * H)}" opacity="${f(clamp(lockS.v))}"/>`;
      for (const sg of [-1, 1]) s += line(x0, cy + sg * H, x1, cy + sg * H, cls, 'stroke-width="1.25"');
      // day ticks for the learning fortnight
      for (let d = 1; d <= 14; d++) s += line(X(d), cy + wide + 14, X(d), cy + wide + (d % 7 === 0 ? 24 : 19), d <= day ? 's-dim' : 's-hair');
      s += text(X(1), cy + wide + 40, 'Days 1–14 · listening', 't-label');
      // the learning dots
      const p: [number, number][] = [];
      for (let d = 1; d <= day; d++) {
        p.push([X(d), Y(vals[d - 1])]);
        const fresh = d === day && !locked ? clamp((dF - day) * 4 + 0.4) : 1;
        s += circle(X(d), Y(vals[d - 1]), 3 * fresh + (d === day && !locked ? 2 * (1 - fresh) : 0), locked ? 'f-you' : 'f-fg');
      }
      if (p.length > 1) s += path(pts(p), locked ? 's-you' : 's-dim');
      // after the lock: the same daily readings keep coming, then drift out of your band while staying inside everyone's
      let ex = X(14), ey = Y(vals[13]), out = false, yTop = ey;
      if (dPost > 14.02) {
        const top = cy - H, bot = cy + H, isOut = (y: number) => y < top || y > bot;
        const segs: { out: boolean; pts: [number, number][] }[] = [{ out: false, pts: [[X(14), Y(vals[13])]] }];
        const dots: [number, number][] = [];
        let prev: [number, number] = [X(14), Y(vals[13])];
        const last = Math.floor(dPost), frac = dPost - last;
        const stops: [number, number][] = [];
        for (let d = 15; d <= last; d++) stops.push([XP(d), YP(d)]);
        if (frac > 0.001 && last < 14 + POST) stops.push([lerp(XP(last), XP(last + 1), frac), lerp(YP(last), YP(last + 1), frac)]);
        stops.forEach((q, i) => {
          const cur = segs[segs.length - 1];
          if (isOut(q[1]) !== cur.out) {
            // split at the exact crossing of the band edge
            const edge = q[1] < top || prev[1] < top ? top : bot, t = (edge - prev[1]) / (q[1] - prev[1]);
            const xc: [number, number] = [lerp(prev[0], q[0], t), edge];
            cur.pts.push(xc); segs.push({ out: !cur.out, pts: [xc] });
          }
          segs[segs.length - 1].pts.push(q); prev = q; yTop = Math.min(yTop, q[1]);
          if (i < last - 14) dots.push(q);
        });
        for (const g of segs) if (g.pts.length > 1) s += path(pts(g.pts), g.out ? 's-drift' : 's-you');
        for (const q of dots) s += circle(q[0], q[1], 2.4, isOut(q[1]) ? 'f-drift' : 'f-you');
        [ex, ey] = prev; out = isOut(ey);
        s += dot(ex, ey, out ? 'drift' : 'ok', 5);
      }
      if (out && rise(dPost) > tight * 1.4) {
        s += text(ex, yTop - 12, 'Fine for everyone', 't-label', 'text-anchor="end"');
        s += text(ex, yTop - 28, 'Not normal for you', 't-label t-drift', 'text-anchor="end"');
      }
      // status line
      s += text(x1, cy - wide - 10, !locked ? `Day ${pad(day)} / 14 · learning you` : dPost > 14.02 ? `Day ${pad(Math.floor(dPost))} · watching` : 'Day 14 / 14', 't-label t-fg', 'text-anchor="end"');
      if (lockS.v > 0.02) {
        const k = clamp(lockS.v, 0, 1.3), tw = 178, tx = Math.max(x0, xs - tw), ty = cy + H + 14;
        s += `<g transform="translate(${f(tx + tw)} ${f(ty + 12)}) scale(${f(k)}) translate(${f(-(tx + tw))} ${f(-(ty + 12))})"><rect x="${f(tx)}" y="${f(ty)}" width="${tw}" height="24" rx="2" class="f-bg" stroke="var(--you)" stroke-width="1.5"/>${text(tx + 10, ty + 16, 'Locked · your normal', 't-label t-you')}</g>`;
      } else s += text(x0 + 4, cy + H - 12, 'No alerts yet. It is still measuring you.', 't-label');
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

// Hold to call. Or it calls for you.  Two ways to reach the crew medical officer on board:
//   01 hold the lower watch button for a second (a finger comes in from the side and holds it), any time;
//   02 when a reading hits its limit, the watch asks first: press the crown, or after 10 s it calls for you.
// Click the watch during the countdown to answer it yourself. From Mamadou's watch prototype (0G Health).
export function ccall(sec: HTMLElement) {
  const src: Src = Object.fromEntries(WATCH.map((w) => { const rr = reading(w.id), v = series(w.id, 'mission'); return [w.id, { r: rr, vals: v, a: analyse(v, rr, 5) }]; }));
  const watch = new Watch(src);
  const head = sec.querySelector<HTMLElement>('.ch__head')!, stageEl = sec.querySelector<HTMLElement>('.stage')!;
  const ROWS: { g: number; lab: string; desc: string }[] = [
    { g: 0, lab: 'Lower button', desc: 'Hold the lower button for 1 s' },
    { g: 0, lab: 'On board', desc: 'The doctor answers · no signal delay' },
    { g: 1, lab: 'Limit', desc: 'A reading hits its limit · three long buzzes' },
    { g: 1, lab: 'Crown', desc: 'Press the crown · no call, you act' },
    { g: 1, lab: '10 s', desc: 'No answer · the watch calls the doctor' },
  ];
  const GROUPS = ['01 · Call any time', '02 · Or it prompts you'];
  // scroll map: part one (hold) .06 to .42, part two (limit) .46 to 1
  const P = { in: [0.06, 0.13], hold: [0.14, 0.26], ring: 0.26, on: 0.32, end: 0.39, out: [0.39, 0.45], lim: 0.47, cd: [0.53, 0.8], ring2: 0.8, on2: 0.88 };
  let was = false, answered = false, count = 0, lastP = 0, geo = { cx: 0, cy: 0, r: 1 };

  /**
   * A pointing hand seen from the thumb side: the index finger straight out to the lower button,
   * the other fingers curled under it, the thumb resting along them. Fingertip at (0, 0), hand to the right.
   * It fades out towards the wrist, so it never ends in a hard edge.
   */
  const HAND = {
    // back of the hand, knuckle, index finger out to the rounded tip, then the three curled fingers stepping back, then the palm edge
    out: 'M540 -96C420 -84 300 -66 236 -50C214 -42 196 -34 170 -32C130 -30 80 -28 30 -26A26 26 0 0 0 30 26C70 29 110 31 150 32'
      + 'C136 36 126 46 124 62C122 76 130 90 144 96C140 108 150 120 166 126C164 140 178 150 206 160C236 176 290 200 340 220L540 240',
    // the thumb lying along the curled fingers, and the folds between them
    inner: 'M520 12C420 22 300 34 214 42C184 44 168 50 168 60C168 72 184 76 212 74C300 68 420 64 520 66'
      + 'M144 96C170 96 196 102 222 112M166 126C186 128 206 136 224 146',
    nail: 'M8 -16C14 -22 26 -24 40 -24H54C58 -24 60 -21 58 -18',
    thumbNail: 'M176 50C184 46 198 45 210 46',
    creases: 'M76 -28q5 7 0 13M136 -31q5 7 0 13M64 28q-4 -6 0 -11M118 31q-4 -6 0 -11',
  };
  const finger = (slide: number, press: number, hold: number) => {
    const x0 = slide * 520 - press * 3;
    let s = `<g transform="translate(302 199) rotate(20)">`;
    if (hold > 0) s += `<circle r="34" fill="none" stroke="var(--line)" stroke-width="2"/><circle r="34" fill="none" stroke="var(--you)" stroke-width="3" pathLength="100" stroke-dasharray="${f(hold * 100)} 100" transform="rotate(-110)"/>`;
    s += `<defs><linearGradient id="callFade" gradientUnits="userSpaceOnUse" x1="300" x2="500" y1="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`
      + `<mask id="callMask" maskUnits="userSpaceOnUse" x="-40" y="-200" width="640" height="480"><rect x="-40" y="-200" width="640" height="480" fill="url(#callFade)"/></mask></defs>`;
    s += `<g transform="translate(${f(x0)} 0)" mask="url(#callMask)">`;
    s += `<path d="${HAND.out}Z" fill="var(--ink)"/>`;
    s += `<path d="${HAND.inner}" fill="none" stroke="var(--bone)" stroke-width="1.3" opacity="0.6" stroke-linecap="round"/>`;
    s += `<path d="${HAND.out}" fill="none" stroke="var(--bone)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<path d="${HAND.nail}${HAND.thumbNail}" class="s-dim"/><path d="${HAND.creases}" class="s-hair"/>`;
    return s + '</g></g>';
  };

  scene(sec, {
    draw(c) {
      const p = (lastP = c.p), partB = p >= P.lim, sr = stageEl.getBoundingClientRect(), hr = head.getBoundingClientRect();
      const headBottom = hr.bottom - sr.top, headLeft = hr.left - sr.left, headRight = Math.max(...[...head.children].map((el) => el.getBoundingClientRect().right)) - sr.left;
      if (!partB) answered = false;
      if (partB && !was) { watch.buzz('limit'); watch.bezel.kick(-500); }
      if (!partB && was) watch.hap.kind = '';
      was = partB;

      // part one: the finger comes in, holds, the call rings and connects, then the finger lets go
      const slide = 1 - easeOut(seg(p, P.in[0], P.in[1])) + easeInOut(seg(p, P.out[0], P.out[1]));
      const holding = p >= P.hold[0] && p < P.ring, hold = holding ? seg(p, P.hold[0], P.hold[1]) : 0, press = p >= P.hold[0] && p < P.end ? 1 : 0;
      // part two: the limit, ten seconds to answer, then the call
      count = partB && !answered ? 10 * (1 - seg(p, P.cd[0], P.cd[1])) : 0;
      let phase: CallView['phase'] = '';
      if (!partB) phase = p >= P.end && p < P.out[1] ? 'end' : p >= P.on ? 'on' : p >= P.ring ? 'ring' : '';
      else if (!answered) phase = p >= P.on2 ? 'on' : p >= P.ring2 ? 'ring' : '';
      watch.hap.ack = answered || phase !== '';
      const at = !partB ? (p < P.in[0] ? -1 : p < P.on ? 0 : 1) : answered ? 3 : p < P.cd[0] ? 2 : p < P.ring2 ? 3 : 4;

      // layout: the watch in the open space right of the text, centred on the screen; on a phone, under the text
      const wide = c.w >= 820 && c.w > c.h * 1.1;
      let k: number, wx: number, wy: number;
      if (wide) {
        // never over the text: the watch and the hand beside it fit in the space right of the headline
        k = clamp(Math.min((c.h * 0.6) / 320, (c.w * 0.36) / 320, (c.w - headRight - 100) / 400), 0.5, 1.35);
        wx = clamp(c.w * 0.6, headRight + 50 + 160 * k, c.w - 200 * k); wy = c.h * 0.5;
      } else {
        k = clamp(Math.min((c.h - headBottom - 150) / 330, (c.w - 40) / 330), 0.45, 1);
        wx = c.w / 2 - 20 * k; wy = headBottom + 24 + 160 * k;
      }
      geo = { cx: wx, cy: wy, r: 136 * k };
      const day = partB ? EVA_DAY : EVA_DAY - 1;
      let s = `<g transform="translate(${f(wx - 160 * k)} ${f(wy - 160 * k)}) scale(${f(k)})">`;
      s += watch.draw({ day, dt: c.dt, now: c.t, msg: partB ? 'Limit · Skin temp' : 'In your normal', st: partB ? 'limit' : 'ok', bezelDeg: day * 6, call: { phase, count, hold, still: true, auto: partB, secs: phase !== 'on' ? 0 : partB ? seg(p, P.on2, 1) * 30 : seg(p, P.on, P.end) * 40 } });
      if (!partB && slide < 1) s += finger(slide, press, hold);
      s += '</g>';

      // under the watch: what is happening now
      const note = !partB
        ? (holding ? `Keep holding · ${Math.max(0.1, 1 - hold).toFixed(1)} s` : phase === 'ring' ? 'Calling the crew medical officer' : phase === 'on' ? 'Doctor on the line · on board' : phase === 'end' ? 'Call ended' : 'Any time · one finger, one button')
        : count > 0 && p >= P.cd[0] ? `Calls the doctor in ${Math.ceil(count)} s` : phase === 'ring' ? 'No answer · calling the crew medical officer' : phase === 'on' ? 'Doctor on the line · on board' : answered ? 'You answered · no call' : 'Three long buzzes';
      const nc = partB && !answered && !phase ? 't-limit' : phase || holding || answered ? 't-you' : 't-fg';
      const ny = wy + 150 * k + 30;
      s += text(wx, ny, note, `t-label ${nc}`, 'text-anchor="middle"');
      if (partB && count > 0 && p >= P.cd[0]) s += text(wx, ny + 18, 'Tap the watch to answer', 't-label', 'text-anchor="middle" opacity="0.7"');

      if (wide) {
        // two ways, five steps; the current one lights
        const y0 = Math.max(headBottom + 56, 40), rh = clamp((c.h - y0 - 70) / 6.6, 34, 58), gap = rh * 0.8;
        const Y = (i: number) => y0 + gap * (ROWS[i].g + 1) + i * rh - 6;
        ROWS.forEach((r, i) => {
          if (i === 0 || i === 2) s += text(headLeft, Y(i) - gap * 0.75, GROUPS[r.g], `t-label ${r.g === (partB ? 1 : 0) && at >= 0 ? 't-fg' : ''}`);
          const y = Y(i), on = i === at, past = at > i && !(answered && i === 4) && (r.g === (partB ? 1 : 0) || (partB && r.g === 0));
          const col = on ? (r.g === 1 && !answered && i !== 3 ? 'limit' : 'you') : '';
          const lx = headLeft + 8;
          if (i === 1 || i === 3 || i === 4) s += line(lx, Y(i - 1) + 8, lx, y - 8, 's-hair');
          s += circle(lx, y, on ? 6 : 4.5, on ? `f-${col}` : past ? 'f-fg' : 'f-bg', on || past ? '' : 'stroke="var(--line)" stroke-width="1.5"');
          s += `<g opacity="${answered && i === 4 ? 0.28 : on || past ? 1 : 0.5}">` + text(lx + 22, y - 4, r.lab, `t-label${col ? ' t-' + col : ''}`) + text(lx + 22, y + 16, r.desc, on ? 't-fg' : 't-label', `style="font-size:${on ? 17 : 15}px;font-family:var(--sans);letter-spacing:0;text-transform:none"`) + '</g>';
        });
      } else if (at >= 0) {
        s += text(c.w / 2, ny + 44, GROUPS[ROWS[at].g], 't-label', 'text-anchor="middle"') + text(c.w / 2, ny + 62, ROWS[at].desc, 't-label t-fg', 'text-anchor="middle"');
      }
      c.section.dataset.hap = watch.active;
      return s;
    },
    onDown(c) { return Math.hypot(c.mx - geo.cx, c.my - geo.cy) <= geo.r * 1.15; },
    onUp() { if (count > 0 && !answered && lastP >= P.cd[0]) { answered = true; watch.acknowledge(); } },
  });
}
