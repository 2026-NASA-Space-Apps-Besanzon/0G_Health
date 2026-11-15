// Chapters 12–15: spacewalk, privacy, the end.
import { scene, reduced, clamp, lerp, seg, f, pts, path, line, circle, text, pad, wob } from '../lib/motion';

// 12 · On a spacewalk, three numbers.
export function c12(sec: HTMLElement) {
  const chainEl = sec.querySelector<HTMLElement>('.chain')!, chainOl = chainEl.querySelector<HTMLElement>('ol')!;
  const steps = [...chainEl.querySelectorAll<HTMLElement>('li')], msgEl = chainEl.querySelector<HTMLElement>('.chain__msg')!;
  const dots = steps.map((li) => li.querySelector<HTMLElement>('i')!), flatQ = matchMedia('(max-width: 1000px)');
  scene(sec, {
    draw(c) {
      const t = seg(c.p, 0.05, 0.92), mins = t * 390, small = c.w < 720;
      const heat = (t < 0.42 ? 34.6 + 1.42 * (t / 0.42) : 36.02 + 0.9 * seg(t, 0.42, 1)) + wob(t * 9) * 0.015, load = 0.4 + 0.28 * t + wob(t * 14, 3) * 0.03, ox = 97.4 - 1.7 * Math.pow(t, 2) + wob(t * 11, 5) * 0.15;
      const hot = t >= 0.42;
      const n = 3, gw = c.w / n, R = Math.min(gw * 0.36, c.h * 0.3), gy = c.h * 0.48;
      const g = (i: number, label: string, tagTxt: string, v: number, lo: number, hi: number, b0: number, b1: number, val: string, st: string) => {
        const cx = gw * (i + 0.5), A0 = -210, A1 = 30, a = (x: number) => ((lerp(A0, A1, clamp((x - lo) / (hi - lo))) * Math.PI) / 180);
        const P = (x: number, r: number) => [cx + Math.cos(a(x)) * r, gy + Math.sin(a(x)) * r];
        const arc = (x0: number, x1: number, r: number) => { const p0 = P(x0, r), p1 = P(x1, r); return `M${f(p0[0])} ${f(p0[1])}A${f(r)} ${f(r)} 0 ${a(x1) - a(x0) > Math.PI ? 1 : 0} 1 ${f(p1[0])} ${f(p1[1])}`; };
        let s = path(arc(lo, hi, R), 's-hair', 'stroke-width="1.25"') + path(arc(b0, b1, R), 's-you', 'stroke-width="5" opacity="0.55"');
        for (let k = 0; k <= 10; k++) { const x = lerp(lo, hi, k / 10), p0 = P(x, R * 1.06), p1 = P(x, R * 1.12); s += line(p0[0], p0[1], p1[0], p1[1], 's-dim'); }
        if (v < b0 || v > b1) st = 'drift'; // the label can never disagree with the needle
        const tip = P(v, R * 0.94), cls = st === 'ok' ? 's' : st === 'drift' ? 's-drift' : 's-limit';
        s += line(cx, gy, tip[0], tip[1], cls, 'stroke-width="2"') + circle(cx, gy, 4, st === 'ok' ? 'f-fg' : st === 'drift' ? 'f-drift' : 'f-limit');
        s += text(cx, gy + R * 0.62, val, 't-num', `text-anchor="middle" font-size="${f(Math.max(17, R * 0.3))}"`);
        s += text(cx, gy + R * 0.62 + 20, label, `t-label ${st === 'drift' ? 't-drift' : 't-fg'}`, 'text-anchor="middle"');
        if (!small) s += text(cx, gy + R * 0.62 + 36, tagTxt, 't-label', 'text-anchor="middle"');
        return s;
      };
      let s = text(0, 10, `Spacewalk elapsed  ${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`, 't-label t-fg') + text(c.w, 10, 'Simulated', 't-label', 'text-anchor="end"');
      s += g(0, 'Heat', 'Skin temp · sensed', heat, 33.5, 37.5, 34.2, 36.0, heat.toFixed(1) + '°', hot ? 'drift' : 'ok');
      s += g(1, 'Workload', 'fNIRS · estimated · future', load, 0, 1, 0.25, 0.75, load.toFixed(2), 'ok');
      s += g(2, 'Oxygen', 'PPG · sensed', ox, 90, 100, 95, 99, ox.toFixed(0) + '%', 'ok');
      // who hears first: the chain lives beside the title; the scroll walks the alert along it.
      // u counts stops: 0 You, 1 Partner, 2 Habitat, 3 Earth. A dot lights the moment the line reaches it.
      const prog = seg(t, 0.42, 0.96), u = !hot ? 0 : prog < 0.5 ? prog / 0.25 : 2 + seg(prog, 0.5, 0.9);
      const at = !hot ? -1 : u >= 3 ? 3 : u > 2.02 ? 2.5 : Math.floor(u + 0.001);
      chainEl.toggleAttribute('data-hot', hot);
      // measure where the dots really are, so the line ends exactly on them
      const across = flatQ.matches, cs = dots.map((d, i) => (across ? steps[i].offsetLeft + d.offsetLeft + d.offsetWidth / 2 : steps[i].offsetTop + d.offsetTop + d.offsetHeight / 2));
      const k = Math.min(2, Math.floor(u)), fill = hot ? lerp(cs[k], cs[k + 1], clamp(u - k)) - cs[0] : 0;
      chainOl.style.setProperty('--a0', `${f(cs[0])}px`); chainOl.style.setProperty('--span', `${f(cs[3] - cs[0])}px`); chainOl.style.setProperty('--fill', `${f(fill)}px`);
      steps.forEach((li, i) => {
        const on = hot && u >= i - 0.001;
        li.classList.toggle('on', on); li.classList.toggle('now', on && at === i); li.classList.toggle('buzz', i === 0 && at === 0);
      });
      const msg = !hot ? 'All three inside your normal' : at === 0 ? 'Heat has left your normal · your watch vibrates' : at === 1 ? 'Not acknowledged · your partner is told' : at === 2 ? 'Then the crew inside the habitat' : at === 2.5 ? 'The message is still on its way to Earth' : 'Earth hears last, 20 minutes later';
      if (msgEl.textContent !== msg) msgEl.textContent = msg;
      return s;
    },
  });
}

// 13 · Raw brainwaves never leave the ship.
export function c13(sec: HTMLElement) {
  scene(sec, {
    draw(c) {
      const small = c.w < 720, hx = c.w * (small ? 0.56 : 0.58), cy = c.h * 0.5, spread = Math.min(c.h * 0.36, 170), tt = reduced ? 3 : c.t;
      let s = '';
      for (let k = 0; k < 7; k++) {
        const p: [number, number][] = [], yk = cy + (k - 3) * (spread / 3.2);
        for (let x = 0; x <= hx; x += 5) {
          const u = x / hx, squeeze = Math.pow(clamp((u - 0.62) / 0.38), 2);
          const raw = (wob(x * 0.05 - tt * 5, k * 3.1) + wob(x * 0.13 - tt * 9, k * 1.7) * 0.6) * 13;
          p.push([x, lerp(yk + raw, cy, squeeze)]);
        }
        s += path(pts(p), 's', `opacity="${f(0.45 + 0.08 * k)}"`);
      }
      // the hull
      s += line(hx, cy - spread - 40, hx, cy + spread + 40, 's', 'stroke-width="2"') + line(hx + 7, cy - spread - 40, hx + 7, cy + spread + 40, 's-dim');
      for (let y = cy - spread - 40; y <= cy + spread + 40; y += 20) s += line(hx + 7, y, hx + 14, y + 7, 's-hair');
      s += circle(hx + 3.5, cy, 9, 'f-bg') + circle(hx + 3.5, cy, 8, 's-you');
      s += text(hx - 12, cy - spread - 22, 'Hull', 't-label', 'text-anchor="end"');
      // to Earth: one number at a time
      const ex = c.w - 4;
      s += line(hx + 16, cy, ex, cy, 's-hair', 'stroke-dasharray="1 7"');
      for (let k = 0; k < 3; k++) {
        const u = ((tt * 0.16 + k / 3) % 1), x = lerp(hx + 16, ex, u), v = [72, 68, 74][k];
        s += `<g opacity="${f(Math.min(1, u * 8, (1 - u) * 6))}">` + circle(x, cy, 3.5, 'f-you') + text(x, cy - 12, String(v), 't-label t-you', 'text-anchor="middle"') + '</g>';
      }
      s += text(0, cy - spread - 22, small ? 'Stays on board' : 'Stays on board · raw EEG · raw voice', 't-label t-fg');
      s += text(ex, cy - spread - 22, small ? 'To Earth' : 'Goes to Earth · the summary', 't-label t-you', 'text-anchor="end"');
      s += text(ex, cy + 28, small ? 'One number' : 'Alertness: one number a day', 't-label', 'text-anchor="end"');
      return s;
    },
  });
}

// 15 · Run your own morning check.
export function c15(sec: HTMLElement) {
  const btn = sec.querySelector<HTMLElement>('.btn')!;
  scene(sec, {
    draw(c) {
      const sr = c.stage.getBoundingClientRect(), br = btn.getBoundingClientRect();
      const bx = br.left - sr.left, by = br.top - sr.top + br.height / 2, p: [number, number][] = [];
      const reach = clamp(c.e * 1.4 - 0.25);
      const xe = Math.max(0, bx - 10) * reach;
      for (let x = 0; x <= xe; x += 6) { const u = bx > 20 ? x / bx : 1; p.push([x, by + wob(x * 0.012 + (reduced ? 0 : c.t * 0.5)) * 16 * Math.pow(1 - u, 1.5)]); }
      return p.length > 1 ? path(pts(p), 's-you') : '';
    },
  });
}
