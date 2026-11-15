// The weekly report: every reading over the last 7 days, why it has its colour, and what to do.
// Colours always come from the crew member's own normal (or the model's levels), never from population ranges.
// Built on the "Bilan" prototype by Nourchene and Mamadou (0G Health).
import { READINGS, LEARN, fmt, type Status, type Reading, type Analysis } from '../lib/sim';
import { TAGS } from '../data/sensors';
import { HUE } from '../lib/watch';
import { f, pts } from '../lib/motion';

type Src = Record<string, { r: Reading; a: Analysis; vals: number[] }>;
export interface WeekCtx { events: { day: number; title: string; kind: string }[]; calls: { day: number; why: 'auto' | 'you' }[]; delay: number }

export const WORD: Record<Status, string> = { learn: 'Learning', ok: 'Normal', drift: 'Keep an eye', limit: 'Act now' };
const RANK: Record<Status, number> = { ok: 0, learn: 1, drift: 2, limit: 3 };

/** One line on why a reading has today's colour. */
export function why(src: Src, id: string, day: number) {
  const { r, a, vals } = src[id], s = a.status(day), v = vals[day - 1];
  if (a.why) return a.why(day);
  if (s === 'learn') return `Learning your normal · day ${day} of ${LEARN}`;
  const band = `${fmt(a.lo, r)} to ${fmt(a.hi, r)} ${r.unit}`;
  if (s === 'limit') return `Past the medical limit of ${fmt(r.limit.v, r)} ${r.unit}`;
  if (s === 'drift') { const n = a.daysOut(day); return n >= 5 ? `7-day average outside your normal (${band}) for ${n} days` : `Today is far outside your normal, ${band}`; }
  return `${v >= a.lo && v <= a.hi ? 'Inside' : 'Close to'} your normal, ${band}`;
}

/** The headline for the week. */
export function verdict(src: Src, day: number): [string, Status] {
  const by = (s: Status) => READINGS.filter((r) => src[r.id].a.status(day) === s);
  const lim = by('limit'), dr = by('drift');
  if (lim.length) return [`Act now · ${lim.map((r) => r.label.toLowerCase()).join(', ')} past the limit`, 'limit'];
  if (dr.length) return [`Keep an eye · ${dr.length === 1 ? `${dr[0].label.toLowerCase()} is` : `${dr.length} readings are`} drifting, nothing urgent`, 'drift'];
  if (day <= LEARN) return [`Learning your normal · day ${day} of ${LEARN}`, 'learn'];
  return [`All ${READINGS.length} readings in your normal this week`, 'ok'];
}

/** Last 7 days as a small line, with the personal band behind it. */
function spark(src: Src, id: string, day: number) {
  const { r, a, vals } = src[id], d0 = Math.max(1, day - 6), v = vals.slice(d0 - 1, day), learning = day <= LEARN;
  const w = 92, h = 26, showBand = !learning && !r.model;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (showBand) { lo = Math.min(lo, a.lo); hi = Math.max(hi, a.hi); }
  if (r.model) { lo = Math.min(lo, r.model.warn); hi = Math.max(hi, 100); }
  const pad = (hi - lo) * 0.12 || 1, Y = (x: number) => h - 3 - ((x - lo + pad) / (hi - lo + 2 * pad)) * (h - 6), X = (i: number) => (v.length < 2 ? w / 2 : (i / 6) * w);
  let s = '';
  if (showBand) s += `<rect x="0" y="${f(Y(a.hi))}" width="${w}" height="${f(Y(a.lo) - Y(a.hi))}" fill="var(--you)" fill-opacity="0.13"/>`;
  if (r.model) s += `<line x1="0" x2="${w}" y1="${f(Y(r.model.warn))}" y2="${f(Y(r.model.warn))}" stroke="var(--drift)" stroke-dasharray="2 3" stroke-width="1"/>`;
  if (v.length > 1) s += `<path d="${pts(v.map((x, i): [number, number] => [X(i), Y(x)]))}" fill="none" stroke="${HUE[id] ?? 'var(--bone)'}" stroke-width="1.5" stroke-linejoin="round"/>`;
  const st = a.status(day), c = st === 'limit' ? 'var(--limit)' : st === 'drift' ? 'var(--drift)' : st === 'ok' ? 'var(--you)' : 'var(--mute)';
  s += `<circle cx="${f(X(v.length - 1))}" cy="${f(Y(v[v.length - 1]))}" r="3" fill="${c}"/>`;
  return `<svg class="wk__sp" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${s}</svg>`;
}

export function renderWeek(el: HTMLElement, src: Src, day: number, picked: string) {
  const [say, vs] = verdict(src, day), vEl = el.querySelector<HTMLElement>('.wk__verdict')!;
  vEl.textContent = say; vEl.dataset.st = vs;
  el.querySelector('.wk__span')!.textContent = `Days ${Math.max(1, day - 6)} to ${day}`;
  const rows = [...READINGS].sort((a, b) => RANK[src[b.id].a.status(day)] - RANK[src[a.id].a.status(day)]);
  el.querySelector('tbody')!.innerHTML = rows.map((r) => {
    const { a, vals } = src[r.id], s = a.status(day);
    return `<tr data-r="${r.id}" data-st="${s}" tabindex="0" aria-selected="${r.id === picked}"><td><span class="nm">${r.label}</span><small>${TAGS[r.tag]}${r.future ? ' · future' : ''}</small></td><td>${spark(src, r.id, day)}</td><td class="wk__v mono">${fmt(vals[day - 1], r)} <small>${r.unit}</small></td><td><span class="wk__st"><i class="dot dot--${s}"></i>${WORD[s]}</span></td><td class="wk__why">${why(src, r.id, day)}</td><td class="wk__do">${s === 'drift' || s === 'limit' ? r.action.you : '—'}</td></tr>`;
  }).join('');
}

/** Plain-text summary the ship sends to the flight surgeon. Numbers only: no brainwaves, no voice. */
export function summary(src: Src, day: number, ctx: WeekCtx) {
  const [say] = verdict(src, day), d0 = Math.max(1, day - 6), out: string[] = [];
  out.push('Baseline · weekly summary for the flight surgeon', `Mission day ${day} of 180 · days ${d0} to ${day} · signal delay ${ctx.delay.toFixed(1)} min one way`, `Overall: ${say}`, '', 'Readings (today · status · why)');
  for (const r of READINGS) { const { a, vals } = src[r.id], s = a.status(day); out.push(`- ${r.label}: ${fmt(vals[day - 1], r)} ${r.unit} · ${WORD[s]} · ${why(src, r.id, day)} [${TAGS[r.tag]}]`); }
  out.push('', 'This week');
  const wk = [
    ...ctx.events.filter((e) => e.day >= d0 && e.day <= day).map((e) => ({ day: e.day, t: e.title })),
    ...ctx.calls.filter((c) => c.day >= d0 && c.day <= day).map((c) => ({ day: c.day, t: c.why === 'auto' ? 'No response to a limit · the watch called the crew medical officer' : 'Crew member called the crew medical officer' })),
  ].sort((a, b) => a.day - b.day);
  out.push(...(wk.length ? wk.map((e) => `- Day ${e.day}: ${e.t}`) : ['- No notifications']));
  out.push('', 'Not included: raw brainwaves and voice recordings. They stay on board.', 'All data simulated. Prototype by team 0G Health, not a medical device.');
  return out.join('\n');
}
