// Chapters 05–10: the product.
import { animate, stagger, createSpring } from 'animejs';
import { scene, Spring, SPRING, reduced, clamp, lerp, seg, f, pts, path, line, circle, text, pad, dot, rng, scrollToProgress } from '../lib/motion';
import { renderCap } from '../lib/iso';
import { rawSignal } from '../lib/signal';
import { SENSORS, type SensorId } from '../data/sensors';
import { angleAt } from '../lib/dial';

// 05 · Two minutes, every morning.
export function c05(sec: HTMLElement) {
  const steps = [...sec.querySelectorAll<HTMLElement>('[data-step]')];
  const rows = [...sec.querySelectorAll<HTMLElement>('.mc__row')];
  const ring = sec.querySelector<SVGCircleElement>('.mc__ring')!, time = sec.querySelector<HTMLElement>('.mc__time')!;
  const act = sec.querySelector<HTMLElement>('.mc__act')!, panel = sec.querySelector<HTMLElement>('.mc')!;
  scene(sec, {
    draw(c) {
      const t = seg(c.p, 0.04, 0.42), step = c.p < 0.42 ? 0 : c.p < 0.72 ? 1 : 2;
      ring.style.strokeDashoffset = String(100 - t * 100);
      const secs = Math.round(t * 120); time.textContent = `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
      steps.forEach((el, i) => el.classList.toggle('on', i === step));
      rows.forEach((el, i) => el.classList.toggle('on', c.p > 0.42 + i * 0.06));
      act.classList.toggle('on', step === 2); panel.dataset.s = String(step);
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
      rail.style.setProperty('--prog', String(seg(c.p, WALK, 1)));
      // before the walkthrough each part lifts and reseats in turn, like a systems check
      const lift: Partial<Record<SensorId, number>> = {};
      ids.forEach((id, i) => {
        const intro = walking ? 0 : Math.sin(seg(c.p, 0.005 + i * 0.008, 0.035 + i * 0.008) * Math.PI) * 0.3;
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

// 08 · We say how we know.
export function c08(sec: HTMLElement) {
  const tags = sec.querySelectorAll('.say__card .tag');
  if (reduced) return;
  tags.forEach((t) => ((t as HTMLElement).style.opacity = '0'));
  let done = false;
  new IntersectionObserver((es, io) => {
    if (!es[0].isIntersecting || done) return; done = true; io.disconnect();
    animate(tags, { opacity: [0, 1], scale: [1.8, 1], rotate: [-8, 0], delay: stagger(170, { start: 250 }), ease: createSpring({ stiffness: 320, damping: 16 }) });
    animate(sec.querySelectorAll('.say__card'), { translateY: [18, 0], opacity: [0, 1], delay: stagger(90), duration: 500, ease: 'out(3)' });
  }, { threshold: 0.3 }).observe(sec);
}

// 09 · For fourteen days, it only listens.
export function c09(sec: HTMLElement) {
  const r = rng(11), vals = Array.from({ length: 14 }, () => (r() + r() + r() - 1.5) * 0.9);
  const gap = new Spring(1, ...SPRING.snap), lockS = new Spring(0, 260, 14);
  let was = false;
  scene(sec, {
    draw(c) {
      const dF = 1 + seg(c.p, 0.06, 0.78) * 13, day = Math.floor(dF + 0.001), locked = c.p > 0.8;
      if (locked !== was) { gap.kick(locked ? -6 : 0); was = locked; }
      gap.set(locked ? 0 : 1 - (day / 14) * 0.72); gap.step(c.dt); lockS.set(locked ? 1 : 0); lockS.step(c.dt);
      const cy = c.h * 0.5, wide = Math.min(c.h * 0.42, 210), tight = Math.min(c.h * 0.14, 62), H = lerp(tight, wide, gap.v);
      const x0 = c.w < 720 ? 28 : 64, x1 = c.w - 12, X = (d: number) => lerp(x0 + 30, x1 - 30, (d - 1) / 13), Y = (v: number) => cy - v * tight * 0.62;
      let s = '';
      for (let d = 1; d <= 14; d++) s += line(X(d), cy + wide + 14, X(d), cy + wide + (d % 7 === 0 ? 24 : 19), d <= day ? 's-dim' : 's-hair');
      const cls = locked ? 's-you' : 's';
      // calipers: a spine and two jaws
      s += line(x0 - 14, cy - wide - 16, x0 - 14, cy + wide + 16, 's-hair') ;
      for (const sg of [-1, 1]) {
        const y = cy + sg * H;
        s += line(x0 - 22, y, x1, y, cls, 'stroke-width="1.25"') + path(`M${f(x0 - 22)} ${f(y - sg * 0)}L${f(x0 - 22)} ${f(y + sg * 12)}L${f(x0 - 6)} ${f(y + sg * 12)}`, cls, 'stroke-width="1.25"');
      }
      if (lockS.v > 0.02) s += `<rect class="band" x="${f(x0 - 22)}" y="${f(cy - H)}" width="${f(x1 - x0 + 22)}" height="${f(2 * H)}" opacity="${f(clamp(lockS.v))}"/>`;
      const p: [number, number][] = [];
      for (let d = 1; d <= day; d++) { p.push([X(d), Y(vals[d - 1])]); const fresh = d === day ? clamp((dF - day) * 4 + 0.4) : 1; s += circle(X(d), Y(vals[d - 1]), 3 * fresh + (d === day ? 2 * (1 - fresh) : 0), locked ? 'f-you' : 'f-fg'); }
      if (p.length > 1) s += path(pts(p), locked ? 's-you' : 's-dim');
      s += text(x1, cy - wide - 22, locked ? 'Day 14 / 14' : `Day ${pad(day)} / 14 · learning you`, 't-label t-fg', 'text-anchor="end"');
      if (lockS.v > 0.02) {
        const k = clamp(lockS.v, 0, 1.3), tw = 178, tx = x1 - tw, ty = cy + H + 14;
        s += `<g transform="translate(${f(x1)} ${f(ty + 12)}) scale(${f(k)}) translate(${f(-x1)} ${f(-(ty + 12))})"><rect x="${f(tx)}" y="${f(ty)}" width="${tw}" height="24" rx="2" class="f-bg" stroke="var(--you)" stroke-width="1.5"/>${text(tx + 10, ty + 16, 'Locked · your normal', 't-label t-you')}</g>`;
      } else s += text(x0 - 6, cy + H + 30, 'No alerts yet. It is still measuring you.', 't-label');
      return s;
    },
  });
}

// 10 · Cap for the big moments. Headband for the rest.
export function c10(sec: HTMLElement) {
  const hand = new Spring(0, ...SPRING.soft);
  let mode: 'day' | 'eva' = 'day', turns = 0, lastA = 0, geo = { cx: 0, cy: 0 };
  const capArc = new Spring(0, ...SPRING.snap);
  const btns = [...sec.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  btns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode as 'day' | 'eva'; btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  const wear = (h: number) => {
    if (h >= 22 || h < 6) return ['Headband', 'Asleep · sleep stages'];
    if (h >= 6.5 && h < 6.75) return ['Headband', 'Two-minute morning check'];
    if (mode === 'eva' && h >= 9 && h < 15.5) return ['Cap', 'Spacewalk'];
    return ['Nothing', 'Bare head. Nothing to wear.'];
  };
  scene(sec, {
    draw(c) {
      const cx = c.w / 2, cy = c.h * 0.5, R = Math.min(c.w * 0.42, c.h * 0.4); geo = { cx, cy };
      let target: number;
      if (c.inside && Math.hypot(c.mx - cx, c.my - cy) < R * 1.6) {
        const a = angleAt(cx, cy, c.mx, c.my) + 90; let d = a - lastA; while (d > 180) d -= 360; while (d < -180) d += 360; turns += d; lastA = a; target = turns;
      } else { target = turns = lerp(20, 380, c.e * 0.5 + c.p * 0.5); lastA = ((turns % 360) + 360) % 360; if (lastA > 180) lastA -= 360; }
      hand.set(target); hand.step(c.dt);
      capArc.set(mode === 'eva' ? 1 : 0); capArc.step(c.dt);
      const ang = ((hand.v % 360) + 360) % 360, hour = (ang / 360) * 24, [what, why] = wear(hour);
      const pt = (h: number, r: number): [number, number] => { const a = (h / 24) * 2 * Math.PI - Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
      const arc = (h0: number, h1: number, r: number) => { const a = pt(h0, r), b = pt(h1, r); return `M${f(a[0])} ${f(a[1])}A${f(r)} ${f(r)} 0 ${h1 - h0 > 12 ? 1 : 0} 1 ${f(b[0])} ${f(b[1])}`; };
      let s = circle(cx, cy, R, 's-hair') + circle(cx, cy, R * 0.82, 's-hair');
      for (let h = 0; h < 24; h++) { const a = pt(h, R * 1.03), b = pt(h, R * (h % 6 === 0 ? 1.1 : 1.06)); s += line(a[0], a[1], b[0], b[1], h % 6 === 0 ? 's' : 's-dim'); }
      for (const h of [0, 6, 12, 18]) { const a = pt(h, R * 1.2); s += text(a[0], a[1] + 4, `${pad(h)}:00`, 't-label', 'text-anchor="middle"'); }
      // headband: sleep and the morning check
      s += path(arc(22, 30, R * 0.82), 's-you', 'stroke-width="5"') + path(arc(6.4, 6.9, R * 0.82), 's-you', 'stroke-width="5"');
      // cap: only on the big days
      if (capArc.v > 0.02) s += path(arc(9, 9 + 6.5 * clamp(capArc.v, 0, 1.05), R), 's', 'stroke-width="5"');
      const tip = pt(hour, R * 1.0), base = pt(hour, R * 0.3);
      s += line(base[0], base[1], tip[0], tip[1], what === 'Nothing' ? 's-dim' : what === 'Cap' ? 's' : 's-you', 'stroke-width="1.5"') + circle(tip[0], tip[1], 4, what === 'Nothing' ? 'f-dim' : what === 'Cap' ? 'f-fg' : 'f-you');
      const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
      s += text(cx, cy - 14, `${pad(hh)}:${pad(mm)}`, 't-label', 'text-anchor="middle"');
      s += text(cx, cy + 12, what, 't-num', `text-anchor="middle" font-size="${f(Math.max(18, R * 0.15))}"`);
      s += text(cx, cy + 34, why, 't-label', 'text-anchor="middle"');
      return s;
    },
  });
  void geo;
}
