// Chapters 11–15: scenarios, trust, action.
import { scene, Spring, SPRING, reduced, clamp, lerp, seg, f, pts, path, line, circle, text, pad, wob, dot } from '../lib/motion';
import { renderCap } from '../lib/iso';

// 11 · Days one to three: your head moves, your stomach objects.
export function c11(sec: HTMLElement) {
  const yaw = new Spring(0, ...SPRING.loose);
  const buf: number[] = new Array(160).fill(0);
  let score = 0, acc = 0;
  scene(sec, {
    draw(c) {
      const small = c.w < 720;
      const auto = !c.inside || reduced;
      // the face turns toward the cursor (negative yaw turns it to the viewer's right)
      yaw.set(auto ? Math.sin(c.t * 0.7) * 22 : -(c.mx / c.w - 0.5) * 130);
      const before = yaw.v; yaw.step(c.dt);
      const rate = c.dt > 0 ? Math.abs(yaw.v - before) / c.dt : 0;
      acc += c.dt; if (acc > 0.033) { acc = 0; buf.push(-(yaw.v - before) / Math.max(c.dt, 0.001)); buf.shift(); } // up = turning toward the right, like the cursor
      score = clamp(score + (rate > 60 ? (rate - 60) * 0.006 : -1.1) * c.dt, 0.8, 10);
      const cx = small ? c.w / 2 : c.w * 0.26, cy = small ? c.h * 0.3 : c.h * 0.52, scale = Math.min(c.w * (small ? 0.3 : 0.18), c.h * (small ? 0.22 : 0.34));
      // seen from the front, at eye level: the face opening points at you and the head shakes left and right
      let s = renderCap({ cx, cy, scale, yaw: yaw.v - 45, only: 'imu', labels: 'none', el: 14, shellOpacity: 0.85 }).svg;
      // yaw axis
      s += line(cx, cy - scale * 1.55, cx, cy - scale * 1.2, 's-dim', 'stroke-dasharray="2 4"') + path(`M${f(cx - 16)} ${f(cy - scale * 1.5)}a16 6 0 1 0 32 0`, 's-dim') + path(`M${f(cx + 16)} ${f(cy - scale * 1.5)}l-1 -7M${f(cx + 16)} ${f(cy - scale * 1.5)}l-7 1`, 's-dim');
      // trace
      const x0 = small ? 0 : c.w * 0.5, x1 = c.w, ty = small ? c.h * 0.7 : c.h * 0.4, amp = small ? c.h * 0.12 : c.h * 0.2;
      s += line(x0, ty, x1, ty, 's-hair');
      const p: [number, number][] = buf.map((v, i) => [lerp(x0, x1, i / (buf.length - 1)), ty - clamp(v / 420, -1, 1) * amp]);
      const st = score > 6 ? 'limit' : score > 3.2 ? 'drift' : 'ok';
      s += path(pts(p), st === 'ok' ? 's-you' : st === 'drift' ? 's-drift' : 's-limit', 'stroke-width="2"');
      s += text(x0, ty - amp - 14, `Head turn rate  ${pad(rate, 3)} °/s`, 't-label t-fg') + text(x1, ty - amp - 14, 'IMU · sensed', 't-label', 'text-anchor="end"');
      // risk bar
      const by = ty + amp + (small ? 26 : 44), bw = x1 - x0;
      s += line(x0, by, x1, by, 's-hair', 'stroke-width="6"') + line(x0, by, x0 + bw * (score / 10), by, st === 'ok' ? 's-you' : st === 'drift' ? 's-drift' : 's-limit', 'stroke-width="6" stroke-linecap="butt"');
      s += line(x0 + bw * 0.6, by - 9, x0 + bw * 0.6, by + 9, 's-limit');
      s += dot(x0 + 6, by + 30, st) + text(x0 + 20, by + 34, `Motion sickness risk  ${score.toFixed(1)} / 10`, 't-label t-fg');
      s += text(x0 + 20, by + 54, st === 'limit' ? 'Slow down. Turn your whole body.' : st === 'drift' ? 'Easy. Your inner ear is still adapting.' : c.inside ? 'Now shake your head, fast' : 'Move your cursor to turn the head', `t-label ${st === 'limit' ? 't-limit' : st === 'drift' ? 't-drift' : ''}`);
      return s;
    },
  });
}

// 12 · On a spacewalk, three numbers.
export function c12(sec: HTMLElement) {
  scene(sec, {
    draw(c) {
      const t = seg(c.p, 0.05, 0.92), mins = t * 390, small = c.w < 720;
      const heat = (t < 0.42 ? 34.6 + 1.42 * (t / 0.42) : 36.02 + 0.9 * seg(t, 0.42, 1)) + wob(t * 9) * 0.015, load = 0.4 + 0.28 * t + wob(t * 14, 3) * 0.03, ox = 97.4 - 1.7 * Math.pow(t, 2) + wob(t * 11, 5) * 0.15;
      const hot = t >= 0.42;
      const n = 3, gw = c.w / n, R = Math.min(gw * 0.36, c.h * 0.24), gy = c.h * (small ? 0.36 : 0.4);
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
      // who hears first
      const ry = c.h - 34, nodes = ['You', 'Partner', 'Habitat', small ? 'Earth' : 'Earth · 20 min later'], x0 = small ? 16 : c.w * 0.12, x1 = c.w - (small ? 16 : c.w * 0.12);
      // the alert walks the chain with the scroll: one stop at a time
      const prog = seg(t, 0.42, 0.96) * 3.4, at = !hot ? -1 : prog >= 3.3 ? 4 : prog > 2.05 ? 3 : Math.min(2, Math.floor(prog / 0.8 + 0.01));
      s += line(x0, ry, x1, ry, 's-hair', 'stroke-dasharray="2 6"');
      // the line reaches each stop exactly as it lights; the last leg to Earth crawls
      const reach = prog < 1.6 ? prog / 2.4 : 2 / 3 + seg(prog, 1.6, 3.3) / 3;
      if (hot) s += line(x0, ry, lerp(x0, x1, reach), ry, 's-drift', 'stroke-width="1.5"');
      nodes.forEach((nm, i) => {
        const x = lerp(x0, x1, i / 3), on = i === 3 ? prog >= 3.3 : prog > i * 0.8 - 0.01 && hot;
        // the wearer feels it first: the watch taps twice, every 1.4 s, while the alert is still theirs
        if (i === 0 && on && at === 0) {
          const tt = c.t % 1.4, buzz = tt < 0.09 || (tt > 0.2 && tt < 0.29), jx = buzz && !reduced ? Math.sin(c.t * 290) * 1.6 : 0;
          if (buzz || reduced) for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) { const rr = 12 + k * 6; s += path(`M${f(x + sd * rr * 0.6 + jx)} ${f(ry - rr * 0.8)}Q${f(x + sd * rr + jx)} ${f(ry)} ${f(x + sd * rr * 0.6 + jx)} ${f(ry + rr * 0.8)}`, 's-drift', `stroke-width="1.5" opacity="${1 - k * 0.35}"`); }
        }
        s += circle(x, ry, 7, 'f-bg') + circle(x, ry, on ? 6 : 5, on ? 's-drift' : 's-hair', 'stroke-width="1.5"') + (on ? circle(x, ry, 2.5, 'f-drift') : '');
        s += text(x, ry - 16, nm, `t-label ${on ? 't-drift' : ''}`, `text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}"`);
      });
      const msg = ['Heat has left your normal · you feel the watch vibrate', 'Your spacewalk partner is told next', 'Then the crew inside the habitat', 'The message is still on its way to Earth', 'Earth hears last, 20 minutes later'][at] ?? 'All three inside your normal';
      s += text(c.w / 2, ry + 26, small && at >= 0 ? msg.split(' · ').pop()! : msg, `t-label ${hot ? 't-drift' : 't-you'}`, 'text-anchor="middle"');
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
