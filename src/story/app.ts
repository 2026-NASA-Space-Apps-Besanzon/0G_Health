// The tool: one simulated crew member flying 180 days to Mars. A mission track, their watch, and what the tool tells them.
import { Spring, SPRING, reduced, clamp, lerp, f, pts, path, line, circle, text, pad, dot } from '../lib/motion';
import { READINGS, series, analyse, model, fmt, STATUS_TEXT, DAYS, LEARN, EVA_DAY, type Status, type Reading } from '../lib/sim';
import { TAGS } from '../data/sensors';
import { Watch, HUE, SHORT, type HapKind, type CallView } from '../lib/watch';
import { renderWeek, summary } from './week';
import { mountCheck } from './check';

const $ = <T extends Element = HTMLElement>(q: string) => document.querySelector<T>(q)!;
const RANK: Record<Status, number> = { ok: 0, learn: 1, drift: 2, limit: 3 };
// the first five days were space sickness the crew member reported, so they are left out of learning their normal
const D = Object.fromEntries(READINGS.map((r) => { const vals = series(r.id, 'mission'); return [r.id, { r, vals, a: analyse(vals, r, 5) }]; }));
const st = (id: string, day: number): Status => D[id].a.status(day);


// ---------- signal delay: grows as the ship leaves Earth (simulated, 0 to 20 minutes one way) ----------
const delay = (day: number) => 20 * Math.pow((day - 1) / (DAYS - 1), 1.15);
const clock = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(Math.floor(min % 60))}`;
const CHECK = 6 * 60 + 32; // the morning check ends at 06:32
const stamps = (day: number) => { const d = delay(day); return { sent: clock(CHECK), earth: clock(CHECK + d), reply: clock(CHECK + d + 15 + d), one: d }; };

/** When several readings change on one day, which one leads the message. */
const LEAD = ['motion', 'temp', 'sleep', 'spo2', 'pulse', 'hrv', 'alert', 'muscle', 'bone', 'density', 'vision', 'rad', 'load', 'voice'];
const lead = (a: Reading, b: Reading) => LEAD.indexOf(a.id) - LEAD.indexOf(b.id);

// ---------- the mission's events, worked out from the data ----------
interface Ev { day: number; kind: 'limit' | 'alert' | 'clear' | 'info'; title: string; id: string | null; more: number }
const events: Ev[] = [];
for (let d = 1; d <= DAYS; d++) {
  const found: Ev[] = [];
  if (d === LEARN + 1) found.push({ day: d, kind: 'info', title: 'Learning complete. Your normal is set.', id: null, more: 0 });
  for (const r of [...READINGS].sort(lead)) {
    const now = st(r.id, d), was: Status = d === 1 ? 'learn' : st(r.id, d - 1);
    if (now === was) continue;
    if (now === 'limit') found.push({ day: d, kind: 'limit', title: r.say?.limit ?? `${r.label} is at its limit`, id: r.id, more: 0 });
    else if (now === 'drift' && was !== 'limit') found.push({ day: d, kind: 'alert', title: r.say?.drift ?? (D[r.id].a.daysOut(d) >= 5 ? `${r.label} has been drifting for 5 days` : `${r.label} is outside your normal`), id: r.id, more: 0 });
    else if ((now === 'ok' && (was === 'drift' || was === 'limit')) || (now === 'learn' && was === 'limit')) found.push({ day: d, kind: 'clear', title: `${r.label} is back in range`, id: r.id, more: 0 });
  }
  if (found.length) { const first = found.find((e) => e.kind === 'limit') ?? found.find((e) => e.kind === 'alert') ?? found[0]; first.more = found.filter((e) => e !== first && (e.kind === first.kind || (first.kind === 'limit' && e.kind === 'alert'))).length; events.push(first); }
}
const sleepFlag = events.find((e) => e.id === 'sleep' && e.kind === 'alert')?.day ?? 96;
const testDay = events.find((e) => e.id === 'muscle' && e.kind === 'limit')?.day ?? 126;
const NAMES: Record<number, string> = { [LEARN + 1]: 'Normal set', [EVA_DAY]: 'Spacewalk · limit', [sleepFlag]: 'Sleep drift', [testDay]: 'Strength test' };

// ---------- state ----------
const state = { dayF: 1, day: 0, playing: !reduced, hold: 0, holdMax: 1, reading: 'sleep', picked: false, /** counting down to the automatic call */ count: false };
const worstOf = (day: number) => [...READINGS].sort((a, b) => RANK[st(b.id, day)] - RANK[st(a.id, day)] || lead(a, b))[0];
function sentence(day: number): [string, Status, Reading] {
  const r = worstOf(day), s = st(r.id, day), n = D[r.id].a.daysOut(day);
  if (s === 'limit') return [`${r.say?.limit ?? `${r.label} is at its limit`}.`, s, r];
  if (s === 'drift') return [r.say ? `${r.say.drift}.` : n >= 5 ? `${r.label} has drifted for ${n} days.` : `${r.label} is outside your normal today.`, s, r];
  if (s === 'learn') return [`Learning you. Day ${day} of ${LEARN}.`, s, r];
  return ['You are in your normal.', s, r];
}

// ---------- mission track ----------
const trackEl = $('.trk'), trackSvg = $<SVGSVGElement>('.trk svg');
let tw = 1, th = 1, dragging = false;
const TX = (d: number) => lerp(56, tw - 56, (d - 1) / (DAYS - 1));
function drawTrack(t: number) {
  const y = th * 0.52, x = TX(state.dayF), day = state.day;
  let s = line(TX(1), y, TX(DAYS), y, 's-hair', 'stroke-dasharray="1 7"');
  for (let d = 30; d < DAYS; d += 30) s += line(TX(d), y + 6, TX(d), y + 12, 's-hair') + (tw > 560 ? text(TX(d), y + 28, `Day ${d}`, 't-label', 'text-anchor="middle" opacity="0.6"') : '');
  // learning bracket
  s += path(`M${f(TX(1))} ${f(y + 14)}v6H${f(TX(LEARN))}v-6`, 's-dim') + (tw > 560 ? text(TX(1), y + 42, 'Learning you', 't-label') : '');
  s += circle(TX(1) - 26, y, 11, 's') + circle(TX(1) - 26, y, 3.5, 'f-fg') + text(TX(1) - 26, y - 20, 'Earth', 't-label t-fg', 'text-anchor="middle"');
  s += circle(TX(DAYS) + 26, y, 9, 's') + text(TX(DAYS) + 26, y - 20, 'Mars', 't-label t-fg', 'text-anchor="middle"');
  s += line(TX(1), y, x, y, 's-you');
  for (const e of events) {
    const ex = TX(e.day), past = e.day <= day, c = e.kind === 'limit' ? 'limit' : e.kind === 'alert' ? 'drift' : e.kind === 'clear' ? 'you' : 'fg', k = e.kind === 'limit' ? 8 : 6;
    if (e.kind === 'limit' && e.day === day) { const u = (t * 1.2) % 1; s += circle(ex, y, 9 + u * 16, 's-limit', `opacity="${f(1 - u)}"`); }
    s += `<path d="M${f(ex)} ${f(y - k)}l${k} ${k}l${-k} ${k}l${-k} ${-k}z" class="${past ? 'f-' + c : 'f-bg'}" stroke="var(--${c === 'fg' ? 'bone' : c})" stroke-width="1.25"/>`;
    if (NAMES[e.day] && tw > 560) s += text(ex, y - 16, NAMES[e.day], `t-label${e.kind === 'limit' ? ' t-limit' : ''}`, `text-anchor="${e.day < 5 ? 'start' : 'middle'}"`);
  }
  // the ship
  const fl = reduced ? 8 : 7 + Math.sin(t * 30) * 3;
  s += `<g transform="translate(${f(x)} ${f(y)})"><path class="s-you" d="M-13 0h${f(-fl)}M-13 -3h${f(-fl * 0.5)}M-13 3h${f(-fl * 0.5)}" stroke-width="1.25"/><path class="f-bg" stroke="var(--bone)" stroke-width="1.5" stroke-linejoin="round" d="M-12 -5.5H4Q15 0 4 5.5H-12ZM-12 -5.5l-5 -4v19l5 -4"/></g>`;
  const narrow = tw < 560, anchor = narrow ? 'middle' : x < 170 ? 'start' : x > tw - 170 ? 'end' : 'middle';
  s += text(narrow ? tw / 2 : x, narrow ? y + 44 : y - 34, `Day ${pad(day, 3)} · signal ${delay(day).toFixed(1)} min each way`, 't-label t-fg', `text-anchor="${anchor}"`);
  trackSvg.innerHTML = s;
}
const seek = (ev: PointerEvent) => { const r = trackEl.getBoundingClientRect(); state.dayF = clamp(1 + ((ev.clientX - r.left - 56) / (r.width - 112)) * (DAYS - 1), 1, DAYS); state.playing = false; state.hold = 0; state.count = false; };
trackEl.addEventListener('pointerdown', (ev) => { dragging = true; trackEl.setPointerCapture(ev.pointerId); seek(ev); });
trackEl.addEventListener('pointermove', (ev) => { if (dragging) seek(ev); });
const drop = () => (dragging = false);
trackEl.addEventListener('pointerup', drop); trackEl.addEventListener('pointercancel', drop);
const range = $<HTMLInputElement>('#day'), playBtn = $<HTMLButtonElement>('.play');
range.addEventListener('input', () => { state.dayF = +range.value; state.playing = false; state.count = false; });
const playNote = $('.play__note');
/** Play or pause the whole mission. Pausing also stops the watch vibrating and the link animation. */
const toggle = () => { state.playing = !state.playing; state.hold = 0; if (state.playing && state.dayF >= DAYS) { state.dayF = 1; state.picked = false; } };
playBtn.addEventListener('click', toggle);
// Space toggles too, unless a control has focus
addEventListener('keydown', (ev) => { const t = ev.target as HTMLElement; if (ev.key === ' ' && !t.closest('button, input, textarea, select, a, [tabindex]')) { ev.preventDefault(); toggle(); } });
let btnState = '';
function drawPlay() {
  const k = !state.playing ? 'pause' : state.hold > 0 ? 'hold' : 'play';
  if (k !== btnState) {
    btnState = k; playBtn.dataset.state = k;
    playBtn.querySelector('.play__t')!.textContent = state.playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', state.playing ? 'Pause the mission' : 'Play the mission');
  }
  // while it stops to let you read a notification, the button shows how long until it moves on
  playBtn.style.setProperty('--hold', k === 'hold' ? f(1 - state.hold / state.holdMax) : '0');
  const note = k === 'hold' ? `Reading time · moves on in ${Math.ceil(state.hold)} s` : k === 'pause' ? 'Paused · Space to play' : '';
  if (playNote.textContent !== note) playNote.textContent = note;
}
$('.evs').addEventListener('click', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-day]'); if (b) { state.dayF = +b.dataset.day!; state.playing = false; state.count = false; } });

// ---------- watch (shared with the story page) ----------
const watchEl = $('.watch'), watchSvg = $<SVGSVGElement>('.watch svg'), ackBtn = $<HTMLButtonElement>('.ack'), phoneBtn = $<HTMLButtonElement>('.hap__phone');
const watch = new Watch(D);
const hapStart = (kind: HapKind, day: number) => watch.buzz(kind, day);
if ('vibrate' in navigator) { phoneBtn.hidden = false; phoneBtn.addEventListener('click', () => { watch.hap.phone = !watch.hap.phone; phoneBtn.setAttribute('aria-pressed', String(watch.hap.phone)); if (watch.hap.phone) navigator.vibrate(60); }); }
/** Pressing the crown answers the limit, which also stops the countdown to the automatic call. */
const ack = () => { if (watch.acknowledge() && state.count) { state.count = false; state.hold = Math.min(state.hold, 2.5); } };
ackBtn.addEventListener('click', ack);
watchSvg.addEventListener('click', (ev) => { if (!(ev.target as Element).closest('[data-k="call"]')) ack(); });

// ---------- calling the crew medical officer on board ----------
// The lower watch button: hold for one second to call, press again to hang up.
// At a limit, if the crown is not pressed within 10 s, the watch calls by itself.
const AUTO_S = 10;
const call = { phase: '' as CallView['phase'], t: 0, why: 'you' as 'auto' | 'you', holdT: -1 };
const calls: { day: number; why: 'auto' | 'you' }[] = [];
const live = () => call.phase === 'ring' || call.phase === 'on';
function startCall(why: 'auto' | 'you') {
  if (live()) return;
  Object.assign(call, { phase: 'ring', t: 0, why, holdT: -1 });
  if (!calls.some((c) => c.day === state.day && c.why === why)) calls.push({ day: state.day, why });
  if (why === 'auto') { watch.hap.ack = true; navigator.vibrate?.(0); }
  renderLog(state.day, state.day);
}
const hangUp = () => { if (live()) { call.phase = 'end'; call.t = 0; } };
watchSvg.addEventListener('pointerdown', (ev) => { if (!(ev.target as Element).closest('[data-k="call"]')) return; ev.preventDefault(); if (live()) hangUp(); else call.holdT = 0; });
const letGo = () => (call.holdT = -1);
addEventListener('pointerup', letGo); addEventListener('pointercancel', letGo);
$('.call__kb').addEventListener('click', () => (live() ? hangUp() : startCall('you')));
const callEl = $('.call');
function stepCall(dt: number) {
  if (call.holdT >= 0 && !live()) { call.holdT += dt; if (call.holdT >= 1) startCall('you'); }
  if (!call.phase) return;
  call.t += dt;
  if (call.phase === 'ring' && call.t > 3) { call.phase = 'on'; call.t = 0; }
  else if (call.phase === 'on' && call.t > 9) { call.phase = 'end'; call.t = 0; }
  else if (call.phase === 'end' && call.t > 2.5) call.phase = '';
}
function callText() {
  if (call.phase === 'ring') return call.why === 'auto' ? 'No response to the limit · calling the crew medical officer' : 'Calling the crew medical officer';
  if (call.phase === 'on') return 'Crew medical officer on the line · on board, no signal delay';
  if (call.phase === 'end') return 'Call ended · logged with the notifications';
  if (state.count && watch.pending && state.playing) return `No response · the watch calls the medical officer in ${Math.ceil(state.hold)} s`;
  return '';
}

function drawWatch(dt: number, now: number) {
  const day = state.day, [, s0, wr] = sentence(day), name = SHORT[wr.id] ?? wr.label;
  const msg = s0 === 'learn' ? `Learning you ${pad(day)}/${LEARN}` : s0 === 'ok' ? 'In your normal' : s0 === 'limit' ? `Limit · ${name}` : D[wr.id].a.daysOut(day) >= 5 ? `${name} drifting` : `${name} out of range`;
  stepCall(dt);
  const cv: CallView = { phase: call.phase, count: state.count && watch.pending ? state.hold : 0, hold: call.holdT > 0 ? Math.min(1, call.holdT) : 0, secs: call.phase === 'on' ? call.t : 0, auto: call.why === 'auto' };
  watchSvg.innerHTML = watch.draw({ day, dt, now, msg, st: s0, bezelDeg: day * 6, still: !state.playing, call: cv });
  watchEl.dataset.st = s0; watchEl.dataset.hap = watch.active;
  ackBtn.hidden = !(s0 === 'limit' && watch.pending);
  const ct = callText(); if (callEl.textContent !== ct) callEl.textContent = ct;
  callEl.dataset.phase = call.phase || (ct ? 'count' : '');
  document.querySelectorAll<HTMLElement>('.hap__k').forEach((el) => el.classList.toggle('on', el.dataset.k === watch.active || (el.dataset.k === 'call' && (live() || call.holdT > 0))));
}

// ---------- live pulse and SpO2 from the PPG ----------
const ppgSvg = $<SVGSVGElement>('.ppg svg'), ppgV = $('.ppg__v');
let ppgT = 0;
function drawPpg(dt: number) {
  const day = state.day, bpm = D.pulse.vals[day - 1], o2 = D.spo2.vals[day - 1];
  if (state.playing && !reduced) ppgT += dt;
  const beat = 60 / bpm, p: [number, number][] = [];
  for (let k = 0; k <= 80; k++) {
    const u = (((ppgT - (80 - k) * (3 / 80)) / beat) % 1 + 1) % 1;
    p.push([k * 2, 24 - 18 * (Math.exp(-(((u - 0.16) / 0.07) ** 2)) + 0.38 * Math.exp(-(((u - 0.42) / 0.09) ** 2)))]);
  }
  ppgSvg.innerHTML = path(pts(p), '', `fill="none" stroke="${HUE.pulse}" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"`);
  const t = `Pulse ${Math.round(bpm)} bpm · SpO2 ${Math.round(o2)} %`;
  if (ppgV.textContent !== t) ppgV.textContent = t;
}

// ---------- link to Earth ----------
const linkSvg = $<SVGSVGElement>('.link svg');
let linkPhase = 0;
function drawLink(dt: number) {
  const w = 300, y = 26, one = delay(state.day), period = clamp(0.5 + one * 0.22, 0.5, 5);
  linkPhase = reduced ? 0.5 : (linkPhase + dt / period) % 2;
  const out = linkPhase < 1, u = out ? linkPhase : 2 - linkPhase, x = lerp(22, w - 22, u);
  let s = line(22, y, w - 22, y, 's-hair', 'stroke-dasharray="1 6"') + circle(12, y, 6, 's') + circle(w - 12, y, 6, 's') + circle(w - 12, y, 2, 'f-fg');
  s += circle(x, y, 3.5, 'f-you') + text(x, y - 10, out ? 'Summary' : 'Reply', 't-label t-you', `text-anchor="middle" font-size="9"`);
  s += text(0, y + 24, 'Ship', 't-label', 'font-size="9"') + text(w, y + 24, 'Earth', 't-label', 'text-anchor="end" font-size="9"');
  linkSvg.innerHTML = s;
}

// ---------- chart ----------
function chart(r: Reading) {
  const el = $('.chart'), svg = $<SVGSVGElement>('.chart svg'), w = el.clientWidth, h = el.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const { vals, a } = D[r.id], d = state.day, seen = vals.slice(0, d), learning = d <= LEARN;
  if (r.id === 'muscle') seen.push(...model('mission').tests.filter((x) => x.day <= d).map((x) => x.v));
  let lo = Math.min(a.lo, ...seen), hi = Math.max(a.hi, ...seen); const span = hi - lo;
  const showLimit = r.limit.dir === 'lo' ? r.limit.v > lo - span * 1.2 : r.limit.v < hi + span * 1.2;
  if (showLimit) { lo = Math.min(lo, r.limit.v); hi = Math.max(hi, r.limit.v); }
  const padY = (hi - lo) * 0.14; lo -= padY; hi += padY;
  const top = 8, bot = h - 22, X = (k: number) => lerp(0, w, (k - 1) / (DAYS - 1)), Y = (v: number) => lerp(bot, top, (v - lo) / (hi - lo));
  let s = line(0, bot, w, bot, 's-hair');
  for (let k = 1; k <= DAYS; k += 30) s += line(X(k), bot, X(k), bot + 5, 's-hair') + text(X(k) + 3, bot + 17, `Day ${k - 1 || 1}`, 't-label', 'opacity="0.7"');
  if (showLimit) s += line(0, Y(r.limit.v), w, Y(r.limit.v), 's-limit', 'stroke-dasharray="8 6"') + text(w, Y(r.limit.v) + (r.limit.dir === 'lo' ? 14 : -6), `Limit ${fmt(r.limit.v, r)}`, 't-label t-limit', 'text-anchor="end"');
  if (r.model) {
    // a model reading: the expected path, the warning level, and the weekly strength tests
    const warn = r.model.warn, tests = r.id === 'muscle' ? model('mission').tests.filter((x) => x.day <= d) : [];
    s += line(0, Y(warn), w, Y(warn), 's-drift', 'stroke-dasharray="3 5"') + text(w, Y(warn) - 6, `Warning ${warn} %`, 't-label t-drift', 'text-anchor="end"');
    if (learning) s += line(X(LEARN), top, X(LEARN), bot, 's-hair', 'stroke-dasharray="2 5"') + text(X(LEARN) + 8, top + 12, `Calibrating · ${d} / ${LEARN}`, 't-label t-fg');
    const p: [number, number][] = []; for (let k = 1; k <= d; k++) p.push([X(k), Y(vals[k - 1])]);
    if (p.length > 1) s += path(pts(p), '', 'fill="none" stroke="var(--bone)" stroke-width="2" stroke-linejoin="round"');
    for (const x of tests) { const g = x.v - vals[x.day - 1], c = g <= -4 ? 'var(--limit)' : g <= -2 ? 'var(--drift)' : 'var(--bone)'; s += line(X(x.day), Y(vals[x.day - 1]), X(x.day), Y(x.v), '', `stroke="${c}" stroke-width="1" opacity="0.6"`) + circle(X(x.day), Y(x.v), 3.5, '', `fill="var(--ink-2)" stroke="${c}" stroke-width="1.5"`); }
    if (tests.length) s += text(6, top + 12, 'Line: model · circles: weekly strength test', 't-label');
    const cur = a.status(d);
    s += circle(X(d), Y(vals[d - 1]), 8, 'f-bg') + dot(X(d), Y(vals[d - 1]), cur, 5.5);
    svg.innerHTML = s;
    return;
  }
  if (!learning) s += `<rect class="band" x="0" y="${f(Y(a.hi))}" width="${f(w)}" height="${f(Y(a.lo) - Y(a.hi))}"/>` + line(0, Y(a.hi), w, Y(a.hi), 's-you', 'stroke-width="1"') + line(0, Y(a.lo), w, Y(a.lo), 's-you', 'stroke-width="1"') + text(w, Y(a.hi) - 6, 'Your normal', 't-label t-you', 'text-anchor="end"');
  else s += line(X(LEARN), top, X(LEARN), bot, 's-hair', 'stroke-dasharray="2 5"') + text(X(LEARN) + 8, top + 12, `Learning you · ${d} / ${LEARN}`, 't-label t-fg');
  if (r.conf) { const up: [number, number][] = [], dn: [number, number][] = []; for (let k = 1; k <= d; k++) { up.push([X(k), Y(a.trend[k - 1] + r.conf)]); dn.unshift([X(k), Y(a.trend[k - 1] - r.conf)]); } if (up.length > 1) s += `<path d="${pts([...up, ...dn])}Z" fill="var(--bone)" fill-opacity="0.07"/>`; }
  for (let k = 1; k <= d; k++) s += circle(X(k), Y(vals[k - 1]), 1.2, 'f-dim', 'opacity="0.55"');
  const p: [number, number][] = []; for (let k = 1; k <= d; k++) p.push([X(k), Y(a.trend[k - 1])]);
  if (p.length > 1) s += path(pts(p), '', `fill="none" stroke="${HUE[r.id] ?? 'var(--bone)'}" stroke-width="2" stroke-linejoin="round"`);
  const cur = a.status(d);
  s += circle(X(d), Y(vals[d - 1]), 8, 'f-bg') + dot(X(d), Y(vals[d - 1]), cur, 5.5);
  svg.innerHTML = s;
}

// ---------- table view: every reading against yesterday, last week and your normal ----------
/** Signed number with unit; a change that rounds to zero is just "0", never "+0" or "−0". */
function signed(d: number, r: Reading) {
  const unit = r.unit.startsWith('/') ? '' : ` ${r.unit}`, t = Math.abs(d).toFixed(r.dec);
  return +t === 0 ? `0${unit}` : `${d > 0 ? '+' : '−'}${t}${unit}`;
}
/** Red when a change heads toward the limit, green when away, grey when it is inside day-to-day noise. */
function change(id: string, now: number, then: number | undefined): [string, string] {
  if (then === undefined) return ['—', 'd-flat'];
  const { r, a } = D[id], d = now - then;
  if (Math.abs(d) < r.sd || +Math.abs(d).toFixed(r.dec) === 0) return [signed(d, r), 'd-flat'];
  return [`${d > 0 ? '▲' : '▼'} ${signed(d, r)}`, Math.sign(d) === Math.sign(r.limit.v - a.mean) ? 'd-up' : 'd-dn'];
}
// rows are built once and then updated in place, so colours fade instead of flashing
const tbody = $('.tbl tbody');
tbody.innerHTML = READINGS.map((r) => `<tr data-r="${r.id}" tabindex="0"><td><span class="nm"><i class="dot"></i>${r.label}${HUE[r.id] ? `<i class="hue" style="--h:${HUE[r.id]}" title="Colour on the watch"></i>` : ''}</span></td><td class="td-now"><b></b><small>${r.unit}</small></td><td></td><td></td><td></td><td></td><td></td><td class="td-src">${TAGS[r.tag]}${r.future ? ' · future' : ''}</td></tr>`).join('');
function renderTable(day: number) {
  READINGS.forEach((r, i) => {
    const row = tbody.children[i] as HTMLTableRowElement, c = row.cells, { vals, a } = D[r.id], v = vals[day - 1], s0 = st(r.id, day), learning = day <= LEARN;
    row.dataset.st = s0; row.setAttribute('aria-selected', String(r.id === state.reading));
    (c[0].querySelector('.dot') as HTMLElement).className = `dot dot--${s0}`;
    c[1].querySelector('b')!.textContent = fmt(v, r);
    c[2].textContent = day > 1 ? fmt(vals[day - 2], r) : '—';
    c[3].textContent = day > 7 ? fmt(vals[day - 8], r) : '—';
    c[4].textContent = learning ? '—' : r.model ? `warning ${r.model.warn}` : `${fmt(a.lo, r)} to ${fmt(a.hi, r)}`;
    const [t1, k1] = change(r.id, v, day > 1 ? vals[day - 2] : undefined); c[5].textContent = t1; c[5].className = k1;
    c[6].textContent = learning ? 'learning' : signed(v - a.mean, r); c[6].className = learning ? 'd-flat' : `d-st-${s0}`;
  });
}
const pick = (id: string) => { state.reading = id; state.picked = true; renderDay(state.day); };
$('.tbl tbody').addEventListener('click', (ev) => { const tr = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (tr) pick(tr.dataset.r!); });
$('.tbl tbody').addEventListener('keydown', (ev) => { const tr = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); pick(tr.dataset.r!); (document.querySelector<HTMLElement>(`.tbl tr[data-r="${tr.dataset.r}"]`))?.focus(); } });
// tiles or table; remembered in this browser only
const setView = (v: string) => {
  $('.tiles').hidden = v !== 'tiles'; $('.tbl').hidden = v !== 'table'; $('.wk').hidden = v !== 'week';
  document.querySelectorAll<HTMLElement>('.seg [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  try { localStorage.setItem('baseline-view', v); } catch { /* storage may be blocked */ }
};
document.querySelectorAll<HTMLElement>('.seg [data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view!)));
try { const v = localStorage.getItem('baseline-view'); if (v === 'table' || v === 'week') setView(v); } catch { /* ignore */ }
// weekly report: pick a row to see its history; download the summary the ship sends to Earth
const wkEl = $('.wk');
wkEl.querySelector('tbody')!.addEventListener('click', (ev) => { const tr = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (tr) pick(tr.dataset.r!); });
wkEl.querySelector('tbody')!.addEventListener('keydown', (ev) => { const tr = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (tr && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); const id = tr.dataset.r!; pick(id); wkEl.querySelector<HTMLElement>(`tr[data-r="${id}"]`)?.focus(); } });
$('.wk__dl').addEventListener('click', () => {
  const txt = summary(D, state.day, { events, calls, delay: delay(state.day) });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = `baseline-day-${state.day}-summary.txt`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- notifications so far, with any calls to the medical officer ----------
function renderLog(day: number, prev: number) {
  type Row = { day: number; html: (fresh: boolean) => string };
  const rows: Row[] = events.filter((e) => e.day <= day).map((e) => ({ day: e.day, html: (fresh) => { const q = stamps(e.day); return `<button class="ev ev--${e.kind}${fresh ? ' ev--new' : ''}" data-day="${e.day}"><span class="label">Day ${e.day} · ${q.sent}</span><b>${e.title}${e.more ? ` <small>+${e.more} more</small>` : ''}</b><span class="ev__t">Crew ${q.sent} · Earth ${q.earth} · reply ${q.reply}</span></button>`; } }));
  calls.filter((c) => c.day <= day).forEach((c) => rows.push({ day: c.day + 0.5, html: (fresh) => `<button class="ev ev--call${fresh ? ' ev--new' : ''}" data-day="${c.day}"><span class="label">Day ${c.day} · on board</span><b>${c.why === 'auto' ? 'No response · the watch called the medical officer' : 'You called the medical officer'}</b><span class="ev__t">Crew medical officer · no signal delay</span></button>` }));
  rows.sort((a, b) => b.day - a.day);
  $('.evs').innerHTML = rows.length ? rows.slice(0, 5).map((r, i) => r.html(i === 0 && Math.floor(r.day) === day && prev <= day && (prev < day || r.day % 1 > 0))).join('') : '<p class="evs__none">No notifications yet.</p>';
}

// ---------- panels that change once a day ----------
function renderDay(prev: number) {
  const day = state.day, [say, s0, wr] = sentence(day), t = stamps(day);
  range.value = String(day);
  const sayEl = $('.now__say'); sayEl.textContent = say; sayEl.dataset.st = s0; $('.now').dataset.st = s0;
  const bad = s0 === 'drift' || s0 === 'limit';
  $('.now__do').innerHTML = bad
    ? `<li><span class="label">You</span><span>${wr.action.you}</span><span class="mono">${t.sent}</span></li><li><span class="label">Crew</span><span>${wr.action.crew}</span><span class="mono">${t.sent}</span></li><li><span class="label">Earth</span><span>${wr.action.ground}${s0 === 'limit' ? ' <em class="prio">Priority</em>' : ''}</span><span class="mono">${t.earth}</span></li>`
    : `<li class="calm"><span class="label">You</span><span>${s0 === 'learn' ? 'Nothing to do. The tool is still measuring what normal looks like for you, so it stays quiet.' : 'Nothing to do. See you tomorrow morning.'}</span><span></span></li>`;
  $('.now__h').textContent = s0 === 'limit' ? 'Limit reached · act now · who hears when' : bad ? 'What to do, and who hears when' : 'Today';
  // link
  $('.link__one').textContent = `${t.one.toFixed(1)} min`;
  $('.link__t').innerHTML = `<span>Sent <b class="mono">${t.sent}</b></span><span>Reaches Earth <b class="mono">${t.earth}</b></span><span>Reply back <b class="mono">${t.reply}</b></span>`;
  renderLog(day, prev);
  // a new alert today: the watch vibrates
  const today = events.find((e) => e.day === day);
  if (today && prev !== day && prev < day) { if (today.kind === 'limit') hapStart('limit', day); else if (today.kind === 'alert') hapStart('drift', day); if (today.id && !state.picked) state.reading = today.id; }
  // readings
  $('.tiles').innerHTML = READINGS.map((r) => `<button class="tile" data-r="${r.id}" data-st="${st(r.id, day)}" aria-pressed="${r.id === state.reading}"><span class="tile__top"><i class="dot dot--${st(r.id, day)}"></i><span>${r.label}</span>${HUE[r.id] ? `<i class="hue" style="--h:${HUE[r.id]}" title="Colour on the watch"></i>` : ''}</span><b class="mono">${fmt(D[r.id].vals[day - 1], r)} <small>${r.unit}</small></b><span class="label">${TAGS[r.tag]}${r.future ? ' · future' : ''}</span></button>`).join('');
  renderTable(day); renderWeek(wkEl, D, day, state.reading);
  const r = D[state.reading].r, a = D[r.id].a, rs = st(r.id, day), n = a.daysOut(day);
  $('.d__name').textContent = r.label;
  $('.d__st').innerHTML = `<i class="dot dot--${rs}"></i>${STATUS_TEXT[rs]}${rs === 'drift' && n >= 5 ? ` · ${n} days` : ''}${a.why ? ` · ${a.why(day)}` : day > LEARN ? ` · your normal ${fmt(a.lo, r)} to ${fmt(a.hi, r)} ${r.unit}` : ''}`;
  $('.d__what').textContent = r.what; $('.d__why').textContent = r.why;
  $('.d__src').textContent = `${r.source} · ${TAGS[r.tag]}${r.future ? ' · future' : ''} · simulated`;
  chart(r);
}
$('.tiles').addEventListener('click', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-r]'); if (b) { state.reading = b.dataset.r!; state.picked = true; renderDay(state.day); } });

// ---------- try the morning check ----------
mountCheck($('.chk'), { day: () => state.day || 1, src: D, pause: () => { state.playing = false; state.hold = 0; state.count = false; } });

// ---------- loop ----------
let last = 0;
function frame(now: number) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
  if (state.playing && live()) {
    // the mission waits while the crew member is on a call
  } else if (state.playing) {
    if (state.hold > 0) {
      state.hold -= dt;
      // nobody pressed the crown in time: the watch calls the medical officer
      if (state.hold <= 0 && state.count) { state.count = false; if (watch.pending) startCall('auto'); }
      if (state.hold <= 0 && state.dayF >= DAYS) { state.dayF = 1; state.picked = false; } // loop
    } else {
      const before = Math.floor(state.dayF); state.dayF = Math.min(DAYS, state.dayF + dt * 2.2);
      // stop on every notification long enough to read it, and at arrival
      const hit = events.find((e) => e.day > before && e.day <= Math.floor(state.dayF));
      if (hit) { state.dayF = hit.day; state.hold = state.holdMax = hit.kind === 'limit' ? AUTO_S : hit.kind === 'alert' ? 3.6 : 2.2; state.count = hit.kind === 'limit'; }
      else if (state.dayF >= DAYS) state.hold = state.holdMax = 3;
    }
  }
  const day = clamp(Math.floor(state.dayF + 1e-6), 1, DAYS);
  if (day !== state.day) { const prev = state.day; state.day = day; renderDay(prev); }
  drawPlay();
  drawTrack(now / 1000); drawWatch(dt, now / 1000); drawPpg(dt); drawLink(state.playing ? dt : 0);
  requestAnimationFrame(frame);
}
const size = () => { const r = trackEl.getBoundingClientRect(); tw = Math.max(1, r.width); th = Math.max(1, r.height); trackSvg.setAttribute('viewBox', `0 0 ${tw} ${th}`); if (state.day) chart(D[state.reading].r); };
new ResizeObserver(size).observe(document.body); size();
requestAnimationFrame(frame);
