// Simulated mission data and the drift logic. Everything here is generated; nothing is a real crew record.
import type { Region, SensorId, TagKind } from '../data/sensors';

export const DAYS = 180;
export const LEARN = 14;
export type Scenario = 'nominal' | 'drift' | 'sick' | 'eva' | 'mission';
/** In the full-mission scenario the crew member acts on the day-96 flag, and the drift reverses. */
export const ACT_DAY = 96;
export const EVA_DAY = 60;
export type Status = 'learn' | 'ok' | 'drift' | 'limit';

export interface Reading {
  id: string; label: string; unit: string; dec: number;
  sensor: SensorId | null; source: string; tag: TagKind; future?: boolean; region: Region;
  mean: number; sd: number; limit: { dir: 'lo' | 'hi'; v: number };
  /** half-width of the model's confidence band, for ML estimates */ conf?: number;
  what: string; why: string;
  action: { you: string; crew: string; ground: string };
}

export const READINGS: Reading[] = [
  { id: 'sleep', label: 'Sleep', unit: 'h', dec: 1, sensor: 'eeg', source: 'EEG headband', tag: 'ml', region: 'brain', mean: 7.1, sd: 0.2, limit: { dir: 'lo', v: 6.0 }, conf: 0.25,
    what: 'Hours actually asleep, staged from brain activity overnight.',
    why: 'With no sunrise and a noisy cabin, sleep erodes slowly. Short sleep feeds errors, low mood and a weaker immune system.',
    action: { you: 'Tonight: dim the cabin lights and screens 30 minutes earlier. Keep the same wake time.', crew: 'If it keeps drifting for 5 more days, ask the crew medical officer to review your schedule.', ground: 'Summary goes to the flight surgeon in the weekly report.' } },
  { id: 'alert', label: 'Alertness', unit: '/100', dec: 0, sensor: 'eeg', source: 'EEG', tag: 'ml', region: 'brain', mean: 74, sd: 3.2, limit: { dir: 'lo', v: 55 }, conf: 6,
    what: 'An estimate of how alert you are during the morning check, from brain rhythms.',
    why: 'Fatigue builds without you feeling it. Low alertness before a critical task is worth knowing in advance.',
    action: { you: 'Move complex tasks to later today. Take the 20-minute rest block.', crew: 'Tell the commander before any spacewalk or docking task.', ground: 'Trend is included in the weekly summary.' } },
  { id: 'load', label: 'Mental workload', unit: 'index', dec: 2, sensor: 'fnirs', source: 'fNIRS', tag: 'ml', future: true, region: 'brain', mean: 0.4, sd: 0.04, limit: { dir: 'hi', v: 0.8 }, conf: 0.07,
    what: 'How hard your brain is working, estimated from blood oxygen in the forehead.',
    why: 'Sustained overload leads to mistakes. It cross-checks the EEG estimate with a slower signal.',
    action: { you: 'Hand one task to a crewmate or the checklist. Pause for two minutes.', crew: 'Your partner sees this first on a spacewalk.', ground: 'Used to rebalance tomorrow\'s plan.' } },
  { id: 'pulse', label: 'Resting pulse', unit: 'bpm', dec: 0, sensor: 'ppg', source: 'PPG', tag: 'sensed', region: 'heart', mean: 54, sd: 1.8, limit: { dir: 'hi', v: 100 },
    what: 'Heartbeats per minute while you sit still for the morning check.',
    why: 'In weightlessness the heart works differently and can lose condition. A resting pulse that creeps up is an early sign.',
    action: { you: 'Do not skip today\'s cardio session. Drink 500 ml of water this morning.', crew: 'Repeat the reading with the crew medical officer if it stays high for 3 days.', ground: 'Flight surgeon reviews the trend.' } },
  { id: 'hrv', label: 'Heart-rhythm variability', unit: 'ms', dec: 0, sensor: 'ppg', source: 'PPG', tag: 'sensed', region: 'heart', mean: 68, sd: 4, limit: { dir: 'lo', v: 35 },
    what: 'How much the gap between heartbeats varies. Higher means calmer and better recovered.',
    why: 'It falls under stress, poor sleep and illness, often before you notice any of them.',
    action: { you: 'Five minutes of slow breathing after the check. Protect tonight\'s sleep.', crew: 'Mention it at the private medical conference if it keeps falling.', ground: 'Shared as a weekly trend only.' } },
  { id: 'spo2', label: 'Blood oxygen', unit: '%', dec: 0, sensor: 'ppg', source: 'PPG', tag: 'sensed', region: 'lungs', mean: 97.4, sd: 0.5, limit: { dir: 'lo', v: 92 },
    what: 'How much oxygen your blood is carrying.',
    why: 'It should be steady. A drop during a spacewalk or after a cabin air problem needs action now, not later.',
    action: { you: 'Stop, breathe slowly, check your suit or cabin air readout.', crew: 'Alert goes to your crewmates immediately.', ground: 'Earth hears after the crew, because of the delay.' } },
  { id: 'temp', label: 'Skin temperature', unit: '°C', dec: 1, sensor: 'temp', source: 'Thermistor', tag: 'sensed', region: 'skin', mean: 34.6, sd: 0.18, limit: { dir: 'hi', v: 37.0 },
    what: 'Temperature of the skin on your forehead, followed through the day.',
    why: 'The immune system changes in space. A slow rise can be the first sign of infection; a fast rise in the suit means overheating.',
    action: { you: 'Take a proper reading with the ship\'s thermometer. Drink water.', crew: 'If the thermometer confirms a fever, tell the crew medical officer today.', ground: 'Flight surgeon is told with the next downlink.' } },
  { id: 'motion', label: 'Motion sickness risk', unit: '/10', dec: 1, sensor: 'imu', source: 'IMU + your report', tag: 'sensed', region: 'ear', mean: 1.0, sd: 0.3, limit: { dir: 'hi', v: 6 },
    what: 'Head movement set against the symptoms you report.',
    why: 'In the first days without gravity, the inner ear and the eyes disagree. Fast head turns make it worse.',
    action: { you: 'Turn your whole body, not just your head. Keep a fixed "up". Eat small.', crew: 'Medication is in the kit; ask the crew medical officer.', ground: 'Usually passes in a few days as you adapt. Logged for the surgeon.' } },
  { id: 'voice', label: 'Voice stress', unit: 'index', dec: 2, sensor: 'voice', source: 'Cap microphones', tag: 'ml', future: true, region: 'brain', mean: 0.22, sd: 0.03, limit: { dir: 'hi', v: 0.7 }, conf: 0.06,
    what: 'A stress estimate from the tone of your voice. Opt-in, worked out on the device.',
    why: 'Isolation and confinement wear on mood slowly. Only this number is kept, never a recording.',
    action: { you: 'Book your next private family call. Take the full off-duty block.', crew: 'Talk to a crewmate you trust.', ground: 'Shared only if you choose to.' } },
  { id: 'bone', label: 'Loading exercise', unit: 'min', dec: 0, sensor: null, source: 'Your log', tag: 'you', region: 'bones', mean: 112, sd: 7, limit: { dir: 'lo', v: 60 },
    what: 'Minutes of resistance and impact exercise you logged today.',
    why: 'Without gravity, bone and muscle are lost month after month. The cap cannot sense this. Exercise is the countermeasure, so it is what we track.',
    action: { you: 'Make up the missed session within 48 hours.', crew: 'Swap exercise slots with a crewmate if the plan is full.', ground: 'Bone density itself is scanned before and after the mission.' } },
  { id: 'vision', label: 'Eye chart', unit: 'lines', dec: 0, sensor: null, source: 'Weekly eye chart', tag: 'you', region: 'eyes', mean: 10, sd: 0.25, limit: { dir: 'lo', v: 8 },
    what: 'The smallest line you can read on the on-screen chart, each eye.',
    why: 'Fluid shifts toward the head in weightlessness and can change vision over months. The cap cannot sense this.',
    action: { you: 'Repeat the chart tomorrow, same light, same distance.', crew: 'Ask the crew medical officer for the eye imaging session.', ground: 'Images go to the flight surgeon.' } },
  { id: 'rad', label: 'Radiation dose', unit: 'mSv/day', dec: 2, sensor: null, source: 'Ship dosimeter', tag: 'ship', region: 'skin', mean: 0.62, sd: 0.04, limit: { dir: 'hi', v: 2.0 },
    what: 'Today\'s dose, read from the ship\'s dosimeter.',
    why: 'Radiation cannot be felt. The cap cannot sense it. The ship measures it and the tool keeps your running total.',
    action: { you: 'Nothing to do today.', crew: 'During a solar storm warning, move to the shelter.', ground: 'Mission control tracks career totals.' } },
];
export const reading = (id: string) => READINGS.find((r) => r.id === id)!;

function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function mulberry(a: number) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(1 - r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

/** Per-day drift in sd units for the slow-drift scenario. */
const DRIFT: Record<string, number> = { hrv: -0.024, alert: -0.02, voice: 0.03, pulse: 0.012 };

/** Seed picked so the story scenario flags on day 96 and reaches the limit on day 138. */
export const SALT: Record<string, number> = { sleep: 475 };
export const TUNE = { k: 1.15 };
/** Daily values, index 0 = mission day 1. */
export function series(id: string, sc: Scenario): number[] {
  const r = reading(id), rnd = mulberry(hash(id) ^ (SALT[id] ?? 0x51ed)), out: number[] = [];
  for (let d = 1; d <= DAYS; d++) {
    let v = r.mean + gauss(rnd) * r.sd;
    const full = sc === 'mission';
    // after acting on the flag, the slide stops and decays away
    const dd = full ? Math.min(d, ACT_DAY) : d, heal = full && d > ACT_DAY ? Math.exp(-(d - ACT_DAY) / 12) : 1;
    if ((sc === 'drift' || full) && DRIFT[id] && d > LEARN && !(full && id === 'voice')) v += DRIFT[id] * (full ? 0.55 : 1) * r.sd * (dd - LEARN) * heal;
    // sleep slides slowly at first, then faster: the shape of a problem nobody caught
    if ((sc === 'drift' || full) && id === 'sleep' && d > LEARN) v -= TUNE.k * ((dd - LEARN) / 124) ** 2 * heal;
    if (sc === 'sick' || full) {
      const k = [1, 0.85, 0.55, 0.22, 0.06][d - 1] ?? 0;
      if (id === 'motion') v += 6.8 * k; if (id === 'pulse') v += 9 * k; if (id === 'alert') v -= 12 * k; if (id === 'hrv') v -= 14 * k;
    }
    if ((sc === 'eva' || full) && d === EVA_DAY) {
      // in the full mission the suit's cooling struggles: skin temperature crosses its limit
      if (id === 'temp') v += full ? 2.7 : 1.5; if (id === 'load') v += 0.3; if (id === 'spo2') v -= 2.6; if (id === 'pulse') v += 16;
    }
    out.push(v);
  }
  return out;
}

export interface Analysis {
  mean: number; hw: number; lo: number; hi: number; trend: number[];
  /** first day the 7-day trend has been outside the band 5 days running */ flagDay: number | null;
  /** first day the trend crosses the limit */ limitDay: number | null;
  status: (day: number) => Status; daysOut: (day: number) => number;
}

/** The whole method: learn a personal band from the first 14 days, then watch a 7-day trend against it. */
/** unwell: days at the start the crew member reported feeling sick; they do not count toward "normal". */
export function analyse(vals: number[], r: Reading, unwell = 0): Analysis {
  const base = vals.slice(unwell, LEARN), n = base.length;
  const mean = base.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const hw = 2.2 * sd, lo = mean - hw, hi = mean + hw;
  const trend = vals.map((_, i) => { const a = vals.slice(Math.max(0, i - 6), i + 1); return a.reduce((x, y) => x + y, 0) / a.length; });
  const beyond = (v: number) => (r.limit.dir === 'lo' ? v <= r.limit.v : v >= r.limit.v);
  const out = (v: number) => v < lo || v > hi;
  const runs: number[] = []; let run = 0, flagDay: number | null = null, limitDay: number | null = null;
  vals.forEach((_, i) => {
    run = i >= LEARN && out(trend[i]) ? run + 1 : 0; runs.push(run);
    if (flagDay === null && run >= 5) flagDay = i + 1;
    if (limitDay === null && i >= LEARN && beyond(trend[i])) limitDay = i + 1;
  });
  const status = (day: number): Status => {
    const i = day - 1, v = vals[i];
    if (beyond(v) || (i >= LEARN && beyond(trend[i]))) return 'limit';
    if (i < LEARN) return 'learn';
    if (runs[i] >= 5 || Math.abs(v - mean) > hw * 1.9) return 'drift';
    return 'ok';
  };
  return { mean, hw, lo, hi, trend, flagDay, limitDay, status, daysOut: (day) => runs[day - 1] };
}

export const fmt = (v: number, r: Reading) => v.toFixed(r.dec);
export const STATUS_TEXT: Record<Status, string> = { learn: 'Learning you', ok: 'In your normal', drift: 'Drifting', limit: 'At limit' };

/** The scenario used on the story page: sleep, slow drift. */
export function story() {
  const r = reading('sleep'); const vals = series('sleep', 'drift'); const a = analyse(vals, r);
  return { r, vals, a, flagDay: a.flagDay ?? 96, limitDay: a.limitDay ?? 138 };
}
