// Try the morning check: fit the headpiece, check sensor contact, sit still, then a reaction test you do yourself.
// The readings come from the simulated mission day; the reaction times are yours.
// Built on Mamadou's test prototype (0G Health): fitting guide, contact check, two-minute rest reading, reaction test.
import { STATUS_TEXT, fmt, type Status, type Reading, type Analysis } from '../lib/sim';

type Src = Record<string, { r: Reading; a: Analysis; vals: number[] }>;
interface Ctx { day: () => number; src: Src; pause: () => void }

const CH = [
  { id: 'eeg', where: 'Scalp pads', what: 'EEG · brain rhythm' },
  { id: 'ppg', where: 'Forehead pad', what: 'PPG · pulse and SpO2' },
  { id: 'temp', where: 'Forehead pad', what: 'Skin temperature' },
  { id: 'imu', where: 'Motion sensor', what: 'IMU · keeps the reading still' },
];
const READ_S = 12; // two minutes, sped up
const KEY = 'baseline-reaction';

export function mountCheck(root: HTMLElement, ctx: Ctx) {
  const stage = root.querySelector<HTMLElement>('.chk__stage')!, steps = [...root.querySelectorAll<HTMLElement>('.chk__steps li')], dayEl = root.querySelector('.chk__day')!;
  const st = { step: 0, day: 0, pass: 0, ch: [] as ('wait' | 'ok' | 'weak')[], t: 0, rt: [] as number[], rState: 'idle' as 'idle' | 'wait' | 'go' | 'early', t0: 0 };
  let timer = 0, raf = 0, timers: number[] = [];
  const clear = () => { clearTimeout(timer); timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); };
  const day = () => st.day || ctx.day();
  const val = (id: string) => { const { r, vals } = ctx.src[id]; return fmt(vals[day() - 1], r); };

  function go(n: number) { clear(); st.step = n; render(); }

  function render() {
    steps.forEach((li, i) => { li.classList.toggle('on', i === st.step); li.classList.toggle('done', i < st.step); });
    dayEl.textContent = String(day());
    if (st.step === 0) {
      stage.innerHTML = `<h3>Check the fit</h3><p class="chk__p">The headpiece is still on from the night. Before the check:</p>
        <ol class="chk__list"><li>Forehead pad flat on the skin, just above the eyebrows, no hair under it. It carries the PPG and the skin temperature sensor.</li>
        <li>Scalp pads touching the scalp: part the hair at the back and on top. They carry the EEG.</li>
        <li>Snug enough that it does not slide when you shake your head gently.</li></ol>
        <button class="chip chk__go" data-act="fit">It's on · check contact</button>`;
    } else if (st.step === 1) {
      const done = st.ch.every((c) => c !== 'wait'), weak = st.ch.includes('weak');
      stage.innerHTML = `<h3>Sensor contact</h3><ul class="chk__ch">${CH.map((c, i) => `<li data-s="${st.ch[i]}"><span>${c.where}<small>${c.what}</small></span><b class="mono">${st.ch[i] === 'wait' ? 'Checking…' : st.ch[i] === 'ok' ? 'Good' : 'Weak'}</b></li>`).join('')}</ul>
        ${done && weak ? '<p class="chk__p chk__warn">Weak contact on the scalp pads. Part the hair under them and press the headpiece down lightly.</p><button class="chip chk__go" data-act="recheck">Done · check again</button>' : ''}
        ${done && !weak ? '<p class="chk__p">All four sensors are reading well.</p><button class="chip chk__go" data-act="sit">Start the reading</button>' : ''}`;
    } else if (st.step === 2) {
      const left = Math.max(0, 120 - Math.floor((st.t / READ_S) * 120));
      stage.innerHTML = `<h3>Sit still, eyes closed</h3><p class="chk__p">Two minutes, sped up here to ${READ_S} seconds.</p>
        <p class="chk__big mono">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</p><div class="chk__bar"><i style="width:${(Math.min(1, st.t / READ_S) * 100).toFixed(1)}%"></i></div>
        <p class="label">Pulse ${val('pulse')} bpm · SpO2 ${val('spo2')} % · skin ${val('temp')} °C</p>`;
    } else if (st.step === 3) {
      const msg = st.rState === 'wait' ? 'Wait for green…' : st.rState === 'go' ? 'Tap!' : st.rState === 'early' ? 'Too early · wait for green' : 'Tap to start';
      stage.innerHTML = `<h3>Reaction test</h3><p class="chk__p">Tap the box the moment it turns green. Three tries.</p>
        <button class="chk__tile" data-r="${st.rState}" data-act="tap">${msg}</button>
        <p class="label chk__tries">${[0, 1, 2].map((i) => `Try ${i + 1}: ${st.rt[i] ? `${st.rt[i]} ms` : '—'}`).join(' · ')}</p>`;
    } else {
      stage.innerHTML = result();
    }
  }

  function result() {
    const rows: string[] = [], todo: string[] = [];
    for (const id of ['pulse', 'spo2', 'hrv', 'temp']) {
      const { r, a } = ctx.src[id], s: Status = a.status(day());
      rows.push(`<li><span>${r.label}</span><b class="mono">${val(id)} <small>${r.unit}</small></b><span class="chk__st"><i class="dot dot--${s}"></i>${STATUS_TEXT[s]}</span></li>`);
      if (s === 'drift' || s === 'limit') todo.push(r.action.you);
    }
    const alpha = 10.1 + Math.sin(day() * 1.7) * 0.4;
    rows.push(`<li><span>Alpha rhythm, eyes closed</span><b class="mono">${alpha.toFixed(1)} <small>Hz</small></b><span class="chk__st"><i class="dot dot--ok"></i>Normal is 8 to 12</span></li>`);
    const ms = Math.round(st.rt.reduce((x, y) => x + y, 0) / st.rt.length), slow = ms > 350;
    let last: number | null = null;
    try { const v = localStorage.getItem(KEY); last = v ? +v : null; localStorage.setItem(KEY, String(ms)); } catch { /* storage may be blocked */ }
    rows.push(`<li><span>Reaction, average of 3</span><b class="mono">${ms} <small>ms</small></b><span class="chk__st"><i class="dot dot--${slow ? 'drift' : 'ok'}"></i>${slow ? 'Slower than 350' : 'Normal is 200 to 350'}${last ? ` · last time ${last}` : ''}</span></li>`);
    if (slow) todo.push('Check last night\'s sleep, take five minutes away from screens, then test again. Three slow results in a row go to the crew medical officer.');
    return `<h3>Result · day ${day()}</h3><ul class="chk__res">${rows.join('')}</ul>
      <p class="chk__p">${todo.length ? '<b>What to do</b>' : 'Nothing to do today.'}</p>${todo.length ? `<ol class="chk__list">${todo.map((t) => `<li>${t}</li>`).join('')}</ol>` : ''}
      <p class="label">This is what feeds the tool each morning. One reading is never a diagnosis.</p>
      <button class="chip chk__go" data-act="again">Run it again</button>`;
  }

  function contact() {
    clear(); st.ch = CH.map(() => 'wait'); render();
    CH.forEach((_, i) => { timers[i] = window.setTimeout(() => { st.ch[i] = i === 0 && st.pass === 0 ? 'weak' : 'ok'; if (st.step === 1) render(); if (i === CH.length - 1) st.pass++; }, 380 * (i + 1)); });
  }
  function sit() {
    go(2); st.t = 0; let last = performance.now();
    const tick = (now: number) => { st.t += (now - last) / 1000; last = now; if (st.t >= READ_S) { st.rt = []; st.rState = 'idle'; go(3); return; } render(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }
  function arm() { st.rState = 'wait'; render(); clearTimeout(timer); timer = window.setTimeout(() => { st.rState = 'go'; st.t0 = performance.now(); render(); stage.querySelector<HTMLElement>('.chk__tile')?.focus(); }, 1000 + Math.random() * 2000); }
  function tap() {
    if (st.rState === 'idle' || st.rState === 'early') return arm();
    if (st.rState === 'wait') { clearTimeout(timer); st.rState = 'early'; render(); stage.querySelector<HTMLElement>('.chk__tile')?.focus(); return; }
    st.rt.push(Math.round(performance.now() - st.t0));
    if (st.rt.length >= 3) return go(4);
    arm(); stage.querySelector<HTMLElement>('.chk__tile')?.focus();
  }

  // pointerdown for the tile, so the time is not delayed by the click; clicks for the rest
  stage.addEventListener('pointerdown', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-act="tap"]'); if (b) { ev.preventDefault(); tap(); } });
  stage.addEventListener('keydown', (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-act="tap"]'); if (b && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); if (!ev.repeat) tap(); } });
  stage.addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'fit') { ctx.pause(); st.day = ctx.day(); st.pass = 0; go(1); contact(); }
    else if (act === 'recheck') contact();
    else if (act === 'sit') sit();
    else if (act === 'again') { st.day = 0; go(0); }
  });
  render();
  return { refresh: () => { if (st.step === 0) render(); } };
}
