// The bone and muscle page: run Nourchene's models (0G Health) with your own plan,
// and see what the tool would tell the crew member, and when.
import { bmSim, analyseModel, reading, GROUPS, FAIL, HIDDEN_DAY, DAYS, LEARN, BM_MISSION, BM_NOMINAL, type BMParams, type Food, type Status, type Analysis, type Reading } from '../lib/sim';
import { f, pts, path, line, circle, text, clamp } from '../lib/motion';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];

const CRISIS: [number, number] = [90, 104];
const PRESETS: Record<string, BMParams> = {
  mission: BM_MISSION,
  nominal: BM_NOMINAL,
  stress: { dose: 1, food: 'full', fail: [FAIL[0], FAIL[1]], crisis: CRISIS, hidden: HIDDEN_DAY },
};
const WORD: Record<Status, string> = { learn: 'Learning', ok: 'Normal', drift: 'Keep an eye', limit: 'Act now' };
const COL: Record<Status, string> = { learn: 'var(--mute)', ok: 'var(--bone)', drift: 'var(--drift)', limit: 'var(--limit)' };
const GC = ['#7fd1ff', '#c3a6ff', '#ff9a7a', '#d7e36a'];
const RB = reading('density'), RM = reading('muscle');

let p: BMParams = { ...BM_MISSION }, day = DAYS;
let run = bmSim(p), aB: Analysis, aM: Analysis;
type Entry = { day: number; k: 'info' | Status; t: string; s: string };
let log: Entry[] = [];

/** One line of advice per alert, from the advice table in Nourchene's muscle model. */
function advice(r: Reading, a: Analysis, d: number): string {
  const s = a.status(d), why = a.why ? a.why(d) : '';
  const gap = why.startsWith('Strength test');
  if (s === 'ok') return 'Back on the expected path.';
  if (r.id === 'muscle') {
    if (s === 'limit') return gap ? 'See the medical officer: the test shows a loss the logs do not explain, such as an injury.' : 'Strength test and a new plan with the medical officer.';
    if (gap) return 'Find what changed in the last days: training, meals, health.';
    if (why.startsWith('Lost')) return 'Add resistance work, check protein and energy intake.';
    return 'Review the exercise and meal plan with the medical officer.';
  }
  if (s === 'limit') return 'See the medical officer for a new exercise and meal plan.';
  return 'More loading exercise: squats and the treadmill harness. Check calcium and vitamin D.';
}

function buildLog() {
  const out: Entry[] = [];
  if (p.fail) out.push({ day: p.fail[0], k: 'info', t: 'Resistance machine down for 10 days', s: 'No squats, deadlifts or calf raises until it is fixed. Cardio continues.' });
  if (p.crisis) out.push({ day: p.crisis[0], k: 'info', t: 'Food runs short for 15 days', s: 'Shortage menu, no supplements. Protect protein, calcium and vitamin D first.' });
  if (p.hidden) out.push({ day: p.hidden, k: 'info', t: 'Hidden injury · the model does not know', s: 'Same workouts, same meals in the logs. Only the strength test can catch it.' });
  for (const [r, a, vals] of [[RB, aB, run.density], [RM, aM, run.muscle]] as const) {
    let prev: Status = 'learn', warned = false;
    for (let d = 1; d <= DAYS; d++) {
      const s = a.status(d);
      if (s !== prev && s !== 'learn' && !(prev === 'learn' && s === 'ok')) out.push({ day: d, k: s, t: `${r.label} · ${WORD[s].toLowerCase()}`, s: s === 'ok' ? `${a.why?.(d) ?? ''}.` : `${a.why?.(d) ?? ''}. ${advice(r, a, d)}` });
      prev = s;
      // projection: at the last 30 days' rate, the limit comes before the end of the mission
      if (!warned && s === 'ok' && d >= 30) {
        const rate = (vals[d - 31] - vals[d - 1]) / 30, left = (vals[d - 1] - r.limit.v) / Math.max(rate, 1e-9);
        if (rate > 0 && d + left < DAYS) { warned = true; out.push({ day: d, k: 'drift', t: `${r.label} would reach the limit by day ${Math.ceil(d + left)}`, s: 'At this rate the limit comes before Mars. Change the plan now, while there is time.' }); }
      }
    }
  }
  // imbalance between muscle groups, 6 points or more
  for (let d = LEARN + 1; d <= DAYS; d++) {
    const v = run.groups.map((g) => g[d - 1]), lo = v.indexOf(Math.min(...v)), hi = v.indexOf(Math.max(...v));
    if (v[hi] - v[lo] >= 6) { out.push({ day: d, k: 'drift', t: `${GROUPS[lo].name} 6 points behind ${GROUPS[hi].name.toLowerCase()}`, s: `Muscle groups out of balance. Shift training towards the ${GROUPS[lo].name.toLowerCase()}: more ${GROUPS[lo].ex}.` }); break; }
  }
  return out.sort((a, b) => a.day - b.day || (a.k === 'info' ? -1 : 1));
}

function compute() {
  run = bmSim(p);
  aB = analyseModel(run.density, RB, []);
  aM = analyseModel(run.muscle, RM, run.tests);
  log = buildLog();
}

/** One chart: the model line coloured by what the tool says, the warning and limit levels, events, and the weekly tests. */
function chart(id: 'density' | 'muscle') {
  const fig = $(`.bm__chart[data-id="${id}"]`), svg = $('svg', fig), plot = $('.bm__plot', fig);
  const w = plot.clientWidth, h = plot.clientHeight, pl = 34, pr = 10, pt = 8, pb = 22;
  const r = id === 'muscle' ? RM : RB, a = id === 'muscle' ? aM : aB, vals = id === 'muscle' ? run.muscle : run.density;
  const all = id === 'muscle' ? [...run.groups.flat(), ...run.tests.map((t) => t.v)] : vals;
  const y0 = Math.min(id === 'muscle' ? 76 : 94, Math.floor(Math.min(...all) - 1)), y1 = 100.6;
  const X = (d: number) => pl + ((d - 1) / (DAYS - 1)) * (w - pl - pr), Y = (v: number) => pt + ((y1 - v) / (y1 - y0)) * (h - pt - pb);
  let s = '';
  // events
  const band = (wnd: [number, number], c: string, lab: string) => { s += `<rect x="${f(X(wnd[0]))}" y="${pt}" width="${f(X(wnd[1]) - X(wnd[0]))}" height="${h - pt - pb}" fill="${c}" opacity="0.13"/>` + text(X(wnd[0]) + 4, pt + 11, lab, 't-label t-drift', 'style="font-size:9px"'); };
  if (p.fail) band(p.fail, 'var(--drift)', 'Machine down');
  if (p.crisis) band(p.crisis, 'var(--drift)', 'Food short');
  if (p.hidden && id === 'muscle') s += line(X(p.hidden), pt, X(p.hidden), h - pb, 's-limit', 'stroke-dasharray="2 3"') + text(X(p.hidden) + 4, pt + 11, 'Injury', 't-label t-limit', 'style="font-size:9px"');
  // axes
  for (const d of w < 520 ? [1, 60, 120, 180] : [1, 30, 60, 90, 120, 150, 180]) s += text(X(d), h - 6, d === 1 ? 'Day 1' : String(d), 't-label', `text-anchor="${d === 1 ? 'start' : d === 180 ? 'end' : 'middle'}" style="font-size:9px"`);
  const ticks = id === 'muscle' ? [80, 85, 90, 95, 100] : [95, 97, 100];
  for (const v of ticks) if (v >= y0) s += line(pl, Y(v), w - pr, Y(v), 's-hair', 'opacity="0.5"') + text(pl - 6, Y(v) + 3, String(v), 't-label', 'text-anchor="end" style="font-size:9px"');
  s += line(pl, Y(r.model!.warn), w - pr, Y(r.model!.warn), '', 'stroke="var(--drift)" stroke-dasharray="4 4" stroke-width="1"');
  s += line(pl, Y(r.limit.v), w - pr, Y(r.limit.v), '', 'stroke="var(--limit)" stroke-dasharray="4 4" stroke-width="1.2"');
  s += text(w - pr, Y(r.limit.v) - 5, 'NASA limit', 't-label t-limit', 'text-anchor="end" style="font-size:9px"');
  // learning
  s += `<rect x="${pl}" y="${pt}" width="${f(X(LEARN) - pl)}" height="${h - pt - pb}" fill="var(--mute)" opacity="0.06"/>`;
  // muscle groups
  if (id === 'muscle') run.groups.forEach((g, i) => { s += path(pts(g.map((v, j): [number, number] => [X(j + 1), Y(v)])), '', `fill="none" stroke="${GC[i]}" stroke-width="1" opacity="0.35"`); });
  // the model, coloured by status
  let i0 = 0;
  for (let d = 2; d <= DAYS + 1; d++) {
    const st = a.status(i0 + 1);
    if (d > DAYS || a.status(d) !== st) { s += path(pts(vals.slice(i0, d).map((v, j): [number, number] => [X(i0 + j + 1), Y(v)])), '', `fill="none" stroke="${COL[st]}" stroke-width="${st === 'drift' || st === 'limit' ? 3.5 : 2.2}" stroke-linejoin="round" stroke-linecap="round"`); i0 = d - 1; }
  }
  // weekly tests, coloured by the gap to the model
  if (id === 'muscle') for (const t of run.tests) { const g = t.v - vals[t.day - 1], c = g <= -4 ? 'var(--limit)' : g <= -2 ? 'var(--drift)' : 'var(--bone)'; s += circle(X(t.day), Y(t.v), 3.4, '', `fill="var(--ink-2)" stroke="${c}" stroke-width="1.6"`); }
  // cursor
  const v = vals[day - 1], st = a.status(day);
  s += line(X(day), pt, X(day), h - pb, '', 'stroke="var(--bone)" stroke-width="1" opacity="0.5"') + circle(X(day), Y(v), 5, '', `fill="${COL[st]}" stroke="var(--ink-2)" stroke-width="2"`);
  svg.innerHTML = s;
  const vEl = $('.bm__v', fig);
  vEl.innerHTML = `${v.toFixed(1)} % · <span style="color:${COL[st]}">${WORD[st]}</span>`;
}

function side() {
  $('.bm__day b').textContent = String(day);
  const v = run.groups.map((g) => g[day - 1]), lo = v.indexOf(Math.min(...v));
  $('.bm__groups').innerHTML = GROUPS.map((g, i) => {
    const x = v[i], c = x <= RM.limit.v ? 'var(--limit)' : x <= RM.model!.warn ? 'var(--drift)' : GC[i];
    return `<div class="bm__g"${i === lo ? ' data-low' : ''}><span>${g.name}</span><i style="--w:${f(clamp((x - 70) / 30) * 100)}%;--c:${c}"></i><b>${x.toFixed(1)}</b></div>`;
  }).join('');
  $('.bm__log').innerHTML = log.length
    ? log.map((e) => `<li data-k="${e.k}" data-d="${e.day}"${e.day > day ? ' data-future' : ''}><span class="mono">Day ${e.day}</span><b>${e.t}</b><small>${e.s}</small></li>`).join('')
    : '<li data-k="ok"><b>Nothing to report</b><small>Both readings stay on the expected path to Mars.</small></li>';
  // keep the latest alert up to the cursor in view
  const el = $('.bm__log'), past = $$<HTMLElement>('li:not([data-future])', el).pop();
  if (past) el.scrollTop = Math.max(0, past.offsetTop - el.offsetTop - el.clientHeight + past.offsetHeight + 8);
}

function draw() { chart('density'); chart('muscle'); side(); ($('#bmDay') as HTMLInputElement).value = String(day); }
function update() { compute(); syncControls(); draw(); }

function syncControls() {
  ($('#dose') as HTMLInputElement).value = String(Math.round(p.dose * 100));
  $('#doseOut').textContent = `${Math.round(p.dose * 100)} %`;
  $$('[data-food]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.food === p.food)));
  $$('[data-ev]').forEach((b) => b.setAttribute('aria-pressed', String(!!p[b.dataset.ev as 'fail' | 'crisis' | 'hidden'])));
  const same = (a: BMParams, b: BMParams) => JSON.stringify(a) === JSON.stringify(b);
  $$('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(same(PRESETS[b.dataset.preset!], p))));
}

// controls
$('#dose').addEventListener('input', (e) => { p = { ...p, dose: +(e.target as HTMLInputElement).value / 100 }; update(); });
$$('[data-food]').forEach((b) => b.addEventListener('click', () => { p = { ...p, food: b.dataset.food as Food }; update(); }));
$$('[data-ev]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.ev as 'fail' | 'crisis' | 'hidden';
  const on: BMParams = { ...p, fail: k === 'fail' ? (p.fail ? null : [FAIL[0], FAIL[1]]) : p.fail, crisis: k === 'crisis' ? (p.crisis ? null : CRISIS) : p.crisis, hidden: k === 'hidden' ? (p.hidden ? null : HIDDEN_DAY) : p.hidden };
  p = on; update();
}));
$$('[data-preset]').forEach((b) => b.addEventListener('click', () => { p = { ...PRESETS[b.dataset.preset!] }; update(); }));
$('#bmDay').addEventListener('input', (e) => { day = +(e.target as HTMLInputElement).value; draw(); });
$('.bm__log').addEventListener('click', (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-d]'); if (li) { day = +li.dataset.d!; draw(); } });

// drag across a chart to move through the mission
$$('.bm__plot').forEach((el) => {
  const at = (ev: PointerEvent) => { const r = el.getBoundingClientRect(); day = Math.round(clamp((ev.clientX - r.left - 34) / (r.width - 44)) * (DAYS - 1)) + 1; draw(); };
  let down = false;
  el.addEventListener('pointerdown', (ev) => { down = true; el.setPointerCapture(ev.pointerId); at(ev); });
  el.addEventListener('pointermove', (ev) => { if (down || ev.pointerType === 'mouse') at(ev); });
  el.addEventListener('pointerup', () => { down = false; });
  el.addEventListener('pointercancel', () => { down = false; });
});
new ResizeObserver(() => draw()).observe($('.bm__charts'));
update();
