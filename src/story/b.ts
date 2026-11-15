// Chapters 05–06 and 14: the routine, the hardware, the honesty.
import { animate, stagger, createSpring } from 'animejs';
import { scene, Spring, SPRING, reduced, clamp, lerp, seg, f, path, line, circle, text, pad, scrollToProgress } from '../lib/motion';
import { renderCap } from '../lib/iso';
import { rawSignal } from '../lib/signal';
import { SENSORS, type SensorId } from '../data/sensors';

// 05 · Sleep in it. Two minutes when you wake.
// Scrolling turns a 24-hour clock from 21:00 to 21:00. At 06:00 the clock slides aside and the morning check opens next to it.
export function c05(sec: HTMLElement) {
  const steps = [...sec.querySelectorAll<HTMLElement>('[data-step]')];
  const rows = [...sec.querySelectorAll<HTMLElement>('.mc__row')];
  const ring = sec.querySelector<SVGCircleElement>('.mc__ring')!, time = sec.querySelector<HTMLElement>('.mc__time')!;
  const act = sec.querySelector<HTMLElement>('.mc__act')!, panel = sec.querySelector<HTMLElement>('.mc')!, hint = sec.querySelector<HTMLElement>('.mc__hint')!;
  const btns = [...sec.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  const narrowQ = matchMedia('(max-width: 640px)');
  const HINT = [
    'Headpiece still on from the night. It checks that every sensor touches the skin.',
    'Sit still, eyes closed, while it takes your resting pulse and SpO2.',
    'Tap the moment the screen turns green. Three tries.',
    'Each reading against your own normal. One action, and who hears about it.',
  ];
  let mode: 'day' | 'eva' = 'day', lastStep = -1;
  btns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode as 'day' | 'eva'; btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  // 21:00 → 06:00 (night) → 06:00–06:02 (the check, slowed right down) → 21:00 (the day)
  const CHECK = 2 / 60;
  const hourAt = (p: number) =>
    p < 0.3 ? lerp(21, 30, seg(p, 0.05, 0.3)) : p < 0.7 ? 30 + CHECK * seg(p, 0.3, 0.7) : lerp(30 + CHECK, 45, seg(p, 0.7, 0.96));
  const hand = new Spring(21, 120, 22), show = new Spring(0, 140, 17), capArc = new Spring(0, ...SPRING.snap), gymArc = new Spring(1, ...SPRING.snap);
  // the daily workout (about two hours on the ISS); a spacewalk replaces it
  const GYM: [number, number] = [16.5, 18.5];
  const wear = (h: number): [string, string] => {
    if (h >= 22 || h < 6) return ['Headpiece', 'Recording the night'];
    if (h < 6 + CHECK + 0.01) return ['Headpiece', 'Morning check'];
    if (mode === 'eva' && h >= 9 && h < 15.5) return ['Cap', 'Spacewalk'];
    if (mode === 'day' && h >= GYM[0] && h < GYM[1]) return ['Headpiece', 'Workout'];
    return ['Nothing', 'Nothing to wear'];
  };
  scene(sec, {
    draw(c) {
      hand.set(hourAt(c.p)); hand.step(c.dt);
      const open = c.p > 0.285 && c.p < 0.74;
      show.set(open ? 1 : 0); show.step(c.dt);
      capArc.set(mode === 'eva' ? 1 : 0); capArc.step(c.dt); gymArc.set(mode === 'day' ? 1 : 0); gymArc.step(c.dt);
      const sv = clamp(show.v), narrow = narrowQ.matches;

      // the card: opacity and slide follow the same spring that moves the clock
      const cw = panel.offsetWidth, ch = panel.offsetHeight;
      panel.style.opacity = f(sv);
      // centred beside the clock; when the stage is shorter than the card, it sits on the stage floor and rises into the free space beside the headline
      panel.style.top = narrow ? 'auto' : `${f(Math.min((c.h - ch) / 2, c.h - ch))}px`;
      panel.style.transform = narrow ? `translateY(${f((1 - sv) * 20)}px)` : `translateX(${f((1 - sv) * 28)}px)`;
      panel.setAttribute('aria-hidden', String(sv < 0.5));
      const t = seg(c.p, 0.3, 0.7), step = t < 0.2 ? 0 : t < 0.45 ? 1 : t < 0.7 ? 2 : 3;
      ring.style.strokeDashoffset = f(100 - t * 100);
      const secs = Math.round(t * 120); time.textContent = `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
      steps.forEach((el, i) => { el.classList.toggle('on', i === step); el.classList.toggle('done', i < step); });
      // overnight sleep is known first; pulse and SpO2 after sitting still; the reaction time after the taps
      rows.forEach((el, i) => el.classList.toggle('on', t > [0.2, 0.4, 0.64, 0.68][i]));
      act.classList.toggle('on', step === 3);
      if (step !== lastStep) { hint.textContent = HINT[step]; lastStep = step; }

      // the clock: centred, then shifted aside (or up, on a phone) while the card is open
      let cx: number, cy: number, R: number;
      if (narrow) {
        const room = c.h - ch - 16;
        cx = c.w / 2; cy = lerp(c.h * 0.5, room / 2, sv);
        R = lerp(Math.min(c.w * 0.36, c.h * 0.36), Math.min(c.w * 0.36, room * 0.34), sv);
      } else {
        const room = c.w - cw - 32;
        cx = lerp(c.w / 2, room / 2, sv); cy = c.h * 0.5;
        R = lerp(Math.min(c.w * 0.42, c.h * 0.4), Math.min(room * 0.4, c.h * 0.4), sv);
      }
      const hour = ((hand.v % 24) + 24) % 24, [what, why] = wear(hour);
      const pt = (h: number, r: number): [number, number] => { const a = (h / 24) * 2 * Math.PI - Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
      const arc = (h0: number, h1: number, r: number) => { const a = pt(h0, r), b = pt(h1, r); return `M${f(a[0])} ${f(a[1])}A${f(r)} ${f(r)} 0 ${h1 - h0 > 12 ? 1 : 0} 1 ${f(b[0])} ${f(b[1])}`; };
      let s = circle(cx, cy, R, 's-hair') + circle(cx, cy, R * 0.82, 's-hair');
      for (let h = 0; h < 24; h++) { const a = pt(h, R * 1.03), b = pt(h, R * (h % 6 === 0 ? 1.1 : 1.06)); s += line(a[0], a[1], b[0], b[1], h % 6 === 0 ? 's' : 's-dim'); }
      for (const h of [0, 6, 12, 18]) { const side = h === 6 ? 1 : h === 18 ? -1 : 0, a = pt(h, side ? R * 1.15 : R * 1.2); s += text(a[0], a[1] + 4, `${pad(h)}:00`, 't-label', `text-anchor="${side > 0 ? 'start' : side < 0 ? 'end' : 'middle'}"`); }
      // headpiece: the night, then the check (drawn wider than two minutes so it can be seen)
      const checking = what === 'Headpiece' && hour >= 6 && hour < 7;
      s += path(arc(22, 29.9, R * 0.82), 's-you', 'stroke-width="5"');
      s += path(arc(6.05, 6.55, R * 0.82), 's-you', `stroke-width="${checking ? 9 : 5}"`);
      // headpiece again for the workout, on ordinary days
      if (gymArc.v > 0.02) s += path(arc(GYM[0], GYM[0] + (GYM[1] - GYM[0]) * clamp(gymArc.v, 0, 1.05), R * 0.82), 's-you', `stroke-width="${what === 'Headpiece' && hour >= 12 ? 9 : 5}"`);
      // cap: only on a spacewalk day
      if (capArc.v > 0.02) s += path(arc(9, 9 + 6.5 * clamp(capArc.v, 0, 1.05), R), 's', 'stroke-width="5"');
      const tip = pt(hour, R), base = pt(hour, R * 0.88); // a short hand between the two rings: clear of the arcs and the centre text
      const hc = what === 'Nothing' ? 'dim' : what === 'Cap' ? 'fg' : 'you';
      s += line(base[0], base[1], tip[0], tip[1], hc === 'dim' ? 's-dim' : hc === 'fg' ? 's' : 's-you', 'stroke-width="1.5"') + circle(tip[0], tip[1], 4, `f-${hc}`);
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      s += text(cx, cy - 14, `${pad(hh)}:${pad(mm)}`, 't-label', 'text-anchor="middle"');
      s += text(cx, cy + 12, what, 't-num', `text-anchor="middle" style="font-size:${f(Math.max(18, R * 0.15))}px"`);
      // the caption must stay inside the inner ring: squeeze it if a small clock leaves too little room
      const room = 2 * Math.sqrt(Math.max(0, (R * 0.82 - 10) ** 2 - 40 ** 2)), est = why.length * 8.4;
      if (!(narrow && sv > 0.5)) s += text(cx, cy + 34, why, 't-label', `text-anchor="middle"${est > room ? ` textLength="${f(room)}" lengthAdjust="spacingAndGlyphs"` : ''}`);
      return s;
    },
  });
}

// 06 · One cap, six sensors.  A spec sheet: index on the left, the cap in the middle, the data sheet on the right.
export function c06(sec: HTMLElement) {
  const yaw = new Spring(-12, 70, 15), side = new Spring(0, ...SPRING.soft), ring = new Spring(0, ...SPRING.snap);
  const ids = SENSORS.map((s) => s.id);
  /** how far to turn the head so each part faces the viewer */
  const FACE: Record<SensorId, number> = { eeg: -14, fnirs: -44, ppg: 6, imu: -158, temp: -8, voice: -50 };
  const lifts = Object.fromEntries(ids.map((id) => [id, new Spring(0, ...SPRING.snap)])) as Record<SensorId, Spring>;
  const sheets = [...sec.querySelectorAll<HTMLElement>('.sd')], sheetBox = sec.querySelector<HTMLElement>('.sds')!;
  const rail = sec.querySelector<HTMLElement>('.rail')!, tabs = [...rail.querySelectorAll<HTMLButtonElement>('button')];
  const WALK = 0.1; // scroll progress where the walkthrough starts
  let hover: SensorId | null = null, anchors: { id: SensorId; x: number; y: number }[] = [], shown: string | null = '';
  let checkAt = -1; // time the systems check started
  const jump = (id: SensorId) => scrollToProgress(sec, WALK + ((ids.indexOf(id) + 0.5) / 6) * (1 - WALK), true);
  tabs.forEach((b) => b.addEventListener('click', () => jump(b.dataset.id as SensorId)));
  scene(sec, {
    draw(c) {
      const small = c.w < 900, walking = c.p >= WALK;
      side.set(c.p > 0.06 ? 1 : 0); side.step(c.dt);
      const active = walking ? ids[Math.min(5, Math.floor(seg(c.p, WALK, 1) * 6))] : null;
      hover = null;
      if (c.inside) { let best = 40; for (const a of anchors) { const d = Math.hypot(a.x - c.mx, a.y - c.my); if (d < best) { best = d; hover = a.id; } } }
      const focus = walking ? active : hover;
      c.stage.style.cursor = hover && hover !== active ? 'pointer' : '';
      const show = side.v > 0.5 ? active : null;
      if (show !== shown) {
        shown = show; ring.jump(0);
        sheets.forEach((el) => el.classList.toggle('on', el.dataset.id === show));
        tabs.forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === show)));
      }
      sec.classList.toggle('walk', side.v > 0.5);
      // the rail fills one whole step per sensor, never in between
      rail.style.setProperty('--prog', String(show ? (ids.indexOf(show as SensorId) + 1) / 6 : 0));
      // when the chapter arrives, each part lifts and reseats in turn, like a systems check.
      // It runs on a clock, not on scroll, so no part can be left hanging if you stop scrolling.
      if (c.e < 0.5) checkAt = -1; else if (checkAt < 0) checkAt = c.t;
      const since = checkAt < 0 ? -1 : c.t - checkAt;
      const lift: Partial<Record<SensorId, number>> = {};
      ids.forEach((id, i) => {
        const intro = walking || since < 0 || reduced ? 0 : Math.sin(seg(since, 0.25 + i * 0.14, 0.6 + i * 0.14) * Math.PI) * 0.3;
        lifts[id].set(focus === id ? (id === 'voice' ? 0.22 : id === 'fnirs' ? 0.4 : 0.5) : intro); lift[id] = lifts[id].step(c.dt);
      });
      yaw.set((focus ? FACE[focus] : -14) + (c.inside ? (c.mx / c.w - 0.5) * 12 : 0)); yaw.step(c.dt);
      ring.set(show ? 1 : 0); ring.step(c.dt);
      const k = clamp(side.v, 0, 1.04);
      const railW = small ? 0 : rail.offsetWidth + 24, sheetW = small ? 0 : sheetBox.offsetWidth + 24, colW = c.w - railW - sheetW;
      const scale = small ? Math.min(c.w * 0.22, c.h * 0.13) : Math.min(colW * 0.25, c.h * lerp(0.3, 0.25, k));
      const cx = lerp(c.w / 2, small ? c.w / 2 : railW + colW / 2, k), cy = small ? lerp(c.h * 0.45, c.h * 0.17, k) : lerp(c.h * 0.5, c.h * 0.4, k);
      const out = renderCap({ cx, cy, scale, yaw: yaw.v, lift, hover: focus, labels: 'none', shellOpacity: 0.9, fade: 0.5 });
      anchors = out.anchors;
      let s = out.svg;
      const a = anchors.find((q) => q.id === show), sen = SENSORS.find((q) => q.id === show);
      if (a && sen) {
        // target ring on the part
        const r = lerp(34, 20, clamp(ring.v, 0, 1.2));
        s += circle(a.x, a.y, r, 's-you', `stroke-width="1" opacity="${f(clamp(ring.v))}"`);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s += line(a.x + dx * r, a.y + dy * r, a.x + dx * (r + 7), a.y + dy * (r + 7), 's-you', 'stroke-width="1"');
        if (!small) {
          // what the part actually outputs, live
          const x0 = railW + colW * 0.1, x1 = railW + colW * 0.9, sy = c.h * 0.88, sh = c.h * 0.075;
          s += text(x0, sy - sh - 12, sen.rawLabel, 't-label', `opacity="${f(clamp(ring.v))}"`) + text(x1, sy - sh - 12, 'Raw signal', 't-label t-you', `text-anchor="end" opacity="${f(clamp(ring.v))}"`);
          s += `<g opacity="${f(clamp(ring.v))}">` + rawSignal(sen.signal, x0, x1, sy, sh, reduced ? 2 : c.t) + '</g>';
        }
      }
      return s;
    },
    onClick() { if (hover) jump(hover); },
  });
}

// 14 · What the cap cannot see — the four source tags stamp in when the legend arrives.
export function c14(sec: HTMLElement) {
  const tags = sec.querySelectorAll('.say .tag');
  if (reduced || !tags.length) return;
  tags.forEach((t) => ((t as HTMLElement).style.opacity = '0'));
  let done = false;
  new IntersectionObserver((es, io) => {
    if (!es[0].isIntersecting || done) return; done = true; io.disconnect();
    animate(tags, { opacity: [0, 1], scale: [1.8, 1], rotate: [-8, 0], delay: stagger(170, { start: 350 }), ease: createSpring({ stiffness: 320, damping: 16 }) });
  }, { threshold: 0.4 }).observe(sec);
}
