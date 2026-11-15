// Small immediate-mode scene runner. Scroll scrubs, cursor pushes, springs settle.

export const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progress of v inside [a,b], clamped 0..1. */
export const seg = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

export const SPRING = { snap: [320, 26], soft: [120, 14], loose: [90, 8] } as const;

export class Spring {
  v: number; t: number; vel = 0;
  constructor(v = 0, public k: number = 120, public c: number = 14) { this.v = v; this.t = v; }
  set(t: number) { this.t = t; return this; }
  jump(v: number) { this.v = this.t = v; this.vel = 0; return this; }
  kick(vel: number) { if (!reduced) this.vel += vel; }
  step(dt: number) {
    if (reduced) { this.v = this.t; this.vel = 0; return this.v; }
    // sub-step for stability on long frames
    let left = Math.min(dt, 0.064);
    while (left > 0) {
      const h = Math.min(left, 0.008);
      this.vel += (-this.k * (this.v - this.t) - this.c * this.vel) * h;
      this.v += this.vel * h;
      left -= h;
    }
    return this.v;
  }
}

export interface Ctx {
  w: number; h: number;
  /** scrub progress through a pinned chapter, 0..1 */ p: number;
  /** entrance progress, 0 when the chapter top hits the viewport bottom, 1 when it reaches the top */ e: number;
  /** seconds since scene became visible (accumulated) */ t: number; dt: number;
  /** pointer in stage pixels */ mx: number; my: number; inside: boolean; down: boolean;
  section: HTMLElement; stage: HTMLElement;
}

export interface SceneOpts {
  draw: (c: Ctx) => string | void;
  /** called on pointerdown inside the stage; return true to capture drag */
  onDown?: (c: Ctx, ev: PointerEvent) => boolean | void;
  onDrag?: (c: Ctx, ev: PointerEvent) => void;
  onUp?: (c: Ctx, ev: PointerEvent) => void;
  onClick?: (c: Ctx, ev: MouseEvent) => void;
}

/** Runs draw() every frame while the section is on screen and writes the returned markup into the stage's <svg>. */
export function scene(section: HTMLElement, opts: SceneOpts) {
  const stage = section.querySelector<HTMLElement>('.stage')!;
  let svg = stage.querySelector<SVGSVGElement>(':scope > svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    stage.prepend(svg);
  }
  const c: Ctx = { w: 0, h: 0, p: 0, e: 0, t: 0, dt: 0, mx: -9999, my: -9999, inside: false, down: false, section, stage };
  let visible = false, raf = 0, last = 0, prev = '';

  const measure = () => {
    const r = stage.getBoundingClientRect();
    c.w = Math.max(1, r.width); c.h = Math.max(1, r.height);
    svg!.setAttribute('viewBox', `0 0 ${c.w} ${c.h}`);
  };
  new ResizeObserver(measure).observe(stage);
  measure();

  const frame = (now: number) => {
    raf = 0;
    if (!visible) return;
    c.dt = last ? Math.min(0.064, (now - last) / 1000) : 0.016;
    last = now; c.t += c.dt;
    const r = section.getBoundingClientRect();
    const vh = innerHeight;
    c.e = clamp((vh - r.top) / vh);
    c.p = r.height > vh + 1 ? clamp(-r.top / (r.height - vh)) : clamp(-r.top / vh + 0.0);
    const out = opts.draw(c);
    if (typeof out === 'string' && out !== prev) { svg!.innerHTML = out; prev = out; }
    raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }, { rootMargin: '10% 0px' }).observe(section);

  const pos = (ev: PointerEvent | MouseEvent) => {
    const r = stage.getBoundingClientRect();
    c.mx = ev.clientX - r.left; c.my = ev.clientY - r.top;
  };
  section.addEventListener('pointermove', (ev) => { pos(ev); c.inside = true; if (c.down) opts.onDrag?.(c, ev); });
  section.addEventListener('pointerleave', () => { c.inside = false; });
  stage.addEventListener('pointerdown', (ev) => {
    pos(ev); c.inside = true;
    if (opts.onDown?.(c, ev)) { c.down = true; stage.setPointerCapture(ev.pointerId); ev.preventDefault(); }
  });
  const up = (ev: PointerEvent) => { if (c.down) { c.down = false; opts.onUp?.(c, ev); } if (ev.pointerType !== 'mouse') c.inside = false; };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  if (opts.onClick) stage.addEventListener('click', (ev) => { pos(ev); opts.onClick!(c, ev); });
  return c;
}

/** Scroll the page so that a pinned section sits at progress p. */
export function scrollToProgress(section: HTMLElement, p: number, smooth = false) {
  const top = section.getBoundingClientRect().top + scrollY;
  const y = top + clamp(p) * (section.offsetHeight - innerHeight);
  scrollTo({ top: y, behavior: smooth && !reduced ? 'smooth' : 'instant' as ScrollBehavior });
}

// ---------- tiny svg string helpers ----------
export const f = (n: number) => (Math.round(n * 10) / 10).toString();
export const pts = (a: ArrayLike<readonly [number, number] | number[]>) => {
  let d = '';
  for (let i = 0; i < a.length; i++) d += (i ? 'L' : 'M') + f(a[i][0]) + ' ' + f(a[i][1]);
  return d;
};
export const path = (d: string, cls = 's', extra = '') => `<path class="${cls}" d="${d}" ${extra}/>`;
export const line = (x1: number, y1: number, x2: number, y2: number, cls = 's', extra = '') =>
  `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${extra}/>`;
export const circle = (x: number, y: number, r: number, cls = 's', extra = '') =>
  `<circle class="${cls}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${extra}/>`;
export const text = (x: number, y: number, s: string, cls = 't-label', extra = '') =>
  `<text class="${cls}" x="${f(x)}" y="${f(y)}" ${extra}>${s}</text>`;
export const pad = (n: number, w = 2) => String(Math.round(n)).padStart(w, '0');

/** Deterministic pseudo-random in 0..1. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth 1-D value noise, roughly -1..1. */
export const wob = (x: number, s = 0) =>
  (Math.sin(x * 1.7 + s) + Math.sin(x * 2.9 + s * 2.3 + 1.3) * 0.6 + Math.sin(x * 5.3 + s * 0.7 + 4.1) * 0.3) / 1.9;

/** Status dot as svg: ok = filled, drift = half, limit = ring with bar, learn = grey ring. */
export function dot(x: number, y: number, st: string, r = 5) {
  if (st === 'ok') return circle(x, y, r, 'f-you');
  if (st === 'drift') return circle(x, y, r - 0.75, 's-drift', 'stroke-width="1.5"') + `<path class="f-drift" d="M${f(x)} ${f(y - r)}a${r} ${r} 0 0 0 0 ${2 * r}z"/>`;
  if (st === 'limit') return circle(x, y, r - 0.75, 's-limit') + line(x - r + 2, y, x + r - 2, y, 's-limit', 'stroke-width="2"');
  return circle(x, y, r - 0.75, 's-dim');
}

/** Reveal headlines when a chapter enters; drives the chapter counter and ruler. */
export function chrome() {
  const chs = [...document.querySelectorAll<HTMLElement>('.ch')];
  const counter = document.querySelector<HTMLElement>('.counter');
  const ruler = document.querySelector<HTMLElement>('.ruler');
  const ticks: HTMLElement[] = [];
  if (ruler) chs.forEach((_, i) => {
    const el = document.createElement('i');
    el.style.top = `${(i / Math.max(1, chs.length - 1)) * 100}%`;
    ruler.append(el); ticks.push(el);
  });
  const io = new IntersectionObserver((es) => {
    for (const en of es) if (en.isIntersecting) en.target.classList.add('in');
  }, { threshold: 0, rootMargin: '0px 0px -25% 0px' });
  chs.forEach((c) => io.observe(c));
  const update = () => {
    let cur = 0;
    chs.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight * 0.5) cur = i; });
    if (counter) counter.textContent = `${pad(cur)} / ${pad(chs.length - 1)}`;
    ticks.forEach((t, i) => t.classList.toggle('on', i <= cur));
  };
  addEventListener('scroll', update, { passive: true });
  update();
}
