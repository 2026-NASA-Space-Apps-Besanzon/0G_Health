# Plan and design guide

NASA Space Apps 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*

Working name: **Baseline** (the software learns your baseline). Swap freely; nothing below depends on it.

---

## 1. The one sentence

> **Baseline is a two-minute daily self-check that learns each astronaut's normal and flags slow drift weeks before a medical limit.**

Everything on the site either sets up this sentence, proves it, or lets the judge try it. Anything else is cut.

The hierarchy we hold to, in this order:

1. **The software** is the product: the daily check, the personal normal band, the drift flag, the next action.
2. **The cap** is how the data gets in (sensor band inside the CCA comms cap, plus a soft headband for sleep and daily use).
3. **The watch** is a screen and a vibration alert. Nothing more.

## 2. What the challenge asks, and where we answer it

| The brief asks for | Our answer | Where on the site |
|---|---|---|
| A visual tool for astronauts to assess their own health | The daily self-check app, running live with simulated mission data | `/app` and chapter 05 |
| Guidance on treatments and improvements | Every flag carries one plain next action and an escalation ladder: you → crew medical officer → flight surgeon | Chapters 04, 05, `/app` |
| "When might a result warrant attention from crew or flight surgeons?" | Drift outside your personal band, long before the population limit | Chapter 04 (signature moment) |
| Charts that show change over time | The personal normal band on every chart | Chapters 03, 04, 09 |
| Colour coding at a glance | Three states only: in your normal, drifting, at limit | Whole system |
| Clickable human figure | Body map: hover a sensor, the regions it feeds light up; click a region in the app for its status | Chapter 07, `/app` |
| Prompts as part of mission routine | Wear schedule and the 2-minute morning check | Chapter 10 |
| "Do not assume astronauts know everything" | Every reading has a one-line "what this is, why it matters" and a provenance tag | Chapter 08, `/app` |
| Different environments | Transit, spacewalk mode, Mars landing day | Chapters 11, 12 |
| Gamification (optional) | A quiet check-in streak. No points, no badges; this is a medical tool | `/app` only |

Our angle on top of the brief: **the long-term effects are the dangerous ones because they are slow, and slow changes are invisible to the person living them.** That is the story.

## 3. Site map

```
/                 The story. 16 full-screen chapters, one point each.
/sensors/eeg      Six schematic product pages, one per sensor.
/sensors/fnirs
/sensors/ppg
/sensors/imu
/sensors/temp
/sensors/voice
/app              The working self-check prototype (simulated data, labelled as such).
```

The story page sells the idea in about 90 seconds of scrolling. The sensor pages are there for the judge who wants to check our homework. `/app` is the thing the challenge actually asks us to build, so it must work, not be a mock-up.

## 4. The story, chapter by chapter

Rule: **one viewport, one sentence, one moving thing.** If a chapter needs a second sentence to make sense, it becomes two chapters or gets cut. Each headline is at most about ten words. Supporting copy is at most one line.

A single thin signal line, the **thread**, runs through every chapter from hero to footer. It is the reader's own baseline. It bends, drifts, gets a band around it, gets flagged. It is the only decoration the site has.

| # | Headline (the one point) | The one moving thing |
|---|---|---|
| 00 | **Nobody notices a slow change.** | Hero. A flat thread across black. It sags a pixel at a time as you read; a counter shows how far it moved while you weren't watching. |
| 01 | **On Mars, the doctor is up to twenty minutes away. Each way.** | A delay dial. Drag it from Moon to Mars; a message dot crawls the distance in scaled real time. |
| 02 | **The dangerous changes are the slow ones.** | Two days of one reading, overlaid: identical. Scrub the scroll and 120 days stack up; the gap opens. |
| 03 | **Medical limits are built for everyone. Drift is personal.** | A wide population band collapses, with a spring, into a narrow band around *your* thread. |
| 04 | **Flagged on day 96. The limit was day 138.** | **Signature moment**, see §7. The mission dial. |
| 05 | **Two minutes, every morning.** | The check in three beats: wear, check, act. One screen of the app assembles itself. |
| 06 | **One cap, six sensors.** | Exploded view, scroll-scrubbed. See §8. |
| 07 | **Each sensor watches a part of you.** | Hover a sensor; body-map regions light up along drawn leader lines. |
| 08 | **We say how we know.** | Four provenance tags snap onto four readings: sensed, estimated by ML, you measure it, from the ship. |
| 09 | **For fourteen days, it only listens.** | "Learning you": a band grows from nothing, day by day, then locks with a mechanical click. |
| 10 | **Cap for the big moments. Headband for the rest.** | A 24-hour dial. Cap: launch, landing, spacewalks. Headband: sleep and the morning check. |
| 11 | **Days one to three: your head moves, your stomach objects.** | Short-term scenario. Tilt the head with the cursor; IMU trace and a symptom score respond. |
| 12 | **On a spacewalk, three numbers.** | Spacewalk mode: heat, workload, oxygen on one screen. Alert routes to the crew first. |
| 13 | **Raw brainwaves never leave the ship.** | A fat raw waveform hits the hull and is reduced to one number; only the number crosses to Earth. |
| 14 | **What the cap cannot see.** | The page inverts to paper-white. Bone, vision, radiation: logged, eye chart, ship dosimeter. Plainly stated. |
| 15 | **Run your own morning check.** | The thread ends in a button. Opens `/app`. |

Order logic: problem (00 to 03), proof (04), product (05 to 10), scenarios (11, 12), trust (13, 14), action (15). The trust chapters sit late on purpose: judges who have seen a dozen overclaiming health projects will remember the team that listed its own limits.

## 5. Honesty rules (these are copy and design constraints, not footnotes)

- Every reading carries exactly one tag: **Sensed** · **Estimated by ML** · **You measure it** · **From the ship**.
- Tags are told apart by line style, not colour, so they survive colour blindness and print: solid, dashed, dotted, double.
- fNIRS and voice stress are labelled **Future** wherever they appear. All data in the demo is labelled **Simulated**.
- ML estimates (alertness, fatigue, workload) are always drawn with a confidence band, never as a bare number.
- The optical heart sensor is **PPG**. The string "ECG" does not appear anywhere on the site. Add a build check that fails if it does.
- Voice: opt-in, analysed on the device, only a number leaves it, never a recording.
- Raw EEG and voice stay on board. Earth gets the summary.
- The cap does not sense bone loss, vision change or radiation. We say so in a full chapter.
- Sensor weights in the exploded view are **design estimates** and marked "est." until someone on the team sources them.
- Any figure we quote (comm delay, motion sickness prevalence, bone loss rate) gets a source link to NASA HRP or it does not ship. The day 96 and day 138 numbers come from our own simulated scenario and are labelled as such.

## 6. Design system

The feel: a precision instrument's manual. Black, quiet, drawn in thin lines, with one colour that means *you*.

### Colour

Colour carries meaning and is never decorative. Five roles, no more.

| Token | Value | Used for |
|---|---|---|
| `--ink` | `#0B0B0C` | Page background |
| `--ink-2` | `#161617` | Raised surfaces, app panels |
| `--line` | `#2E2E30` | Grid lines, hairlines, inactive strokes |
| `--mute` | `#8A8A8E` | Labels, secondary text |
| `--bone` | `#F4F2EE` | Primary text, active strokes |
| `--you` | `#5EF0C0` | Your thread, your normal band, anything "in your normal" |
| `--drift` | `#FFB238` | Drifting outside your band |
| `--limit` | `#FF4D4D` | Medical limit only. Appears perhaps four times on the whole site |

Chapter 14 inverts to `--bone` background with `--ink` strokes: a blueprint turned over. It is the only light section, which makes it land.

Status is never colour alone: in-normal is a filled dot, drifting is a half dot, at-limit is a ring with a bar.

### Type

- **Barlow** (variable, free, DIN-like engineering grotesque) for headlines and body.
- **Geist Mono** for labels, values, units, tags, part numbers.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Chapter headline | `clamp(40px, 6.2vw, 96px)` | 600 | Line height 1.0, tracking −0.02em, max 14 characters per line on desktop |
| Support line | 20 to 22px | 400 | `--mute`, one line |
| Body (sensor pages) | 17px | 400 | Max 60 characters per line |
| Label | 11 to 12px mono | 500 | Uppercase, tracking +0.08em |
| Data value | 28 to 56px mono | 400 | Tabular figures, unit in `--mute` at half size |

### Grid and space

- 12 columns, 24px gutters, max content width 1280px, 16px side gutter on phones.
- A faint 8px baseline grid is visible in schematic areas only, as drawing paper.
- Spacing scale: 4, 8, 12, 16, 24, 40, 64, 104, 168.
- Every chapter is `100svh`, with the headline in the same position each time so the eye never hunts.
- Chapter counter in the corner, mono: `04 / 15`. A thin vertical tick ruler on the left edge fills as you scroll.

### Drawing language (SVG)

- Stroke only. 1.25px on schematics, 2px on the thread. Round caps and joins. No fills except status dots, no gradients, no shadows, no glass, no glow.
- Isometric projection at 30° for the cap and all parts, so the exploded view and sensor pages share one geometry.
- Leader lines: a dot on the part, a 45° elbow, a horizontal run, a mono label. Always drawn on, never faded in.
- Tick marks, dimension arrows and part numbers (`S-01` to `S-06`) the way a service manual would have them.
- Corner radius: 2px on tags, 10px on app panels. Nothing pill-shaped except the single call-to-action.

### Components

Thread · chapter frame · mono label · provenance tag (4 line styles) · status dot (3 states) · chart with normal band · dial (rotary, with detents) · leader line · sensor chip (`S-01 EEG`) · app panel · one button style.

## 7. Motion system

Motion explains; it never decorates. Three rules:

1. **Scroll scrubs, cursor pushes, springs settle.** Scroll position drives timelines directly. The cursor acts on things with weight. Everything released comes to rest on a spring, never an ease curve.
2. **Things snap.** Dials have detents. Parts seat with a small overshoot. Tags click on. The page should feel like well-machined hardware.
3. **One thing moves per chapter.** Everything else holds still.

Tokens:

| Token | Value | Used for |
|---|---|---|
| `spring.snap` | stiffness 320, damping 26 | Tags, detents, parts seating |
| `spring.soft` | stiffness 120, damping 14 | Thread bending, bands settling |
| `spring.loose` | stiffness 90, damping 8 | Cursor-released objects, the one playful moment in 11 |
| `stagger.parts` | 45ms, from centre | Exploded parts, grid reveals |
| `draw` | 600 to 900ms, `out(3)` | Leader lines, schematic strokes |
| Text reveal | 400ms, 12px rise, per line | Headlines. No per-letter effects |

### The signature moment: the mission dial (chapter 04)

The whole pitch in one interaction. A large rotary dial reads `MISSION DAY`. Above it, one chart with your thread.

- Turn the dial by drag or scroll. It has a detent per day and heavier detents each week.
- Days 1 to 14: the band grows around the thread ("learning you").
- Day 15 on: the band locks. The thread starts to slide, about half a percent a day. In any single day it looks like nothing.
- Far above sits the red medical limit line.
- Day 96: the thread leaves your band. The dial kicks back against your hand, the thread turns amber, a tag snaps on: `DRIFT · 42 DAYS BEFORE LIMIT`.
- Keep turning to day 138 and the thread touches red. The headline resolves.

The judge has now *felt* the product. Simulated scenario, labelled in the corner.

### Other moments worth the effort

- **Hero sag (00):** the thread drops slowly while you read. Move the cursor near and it bows away, then springs back to where it had drifted, not to where it started.
- **Band collapse (03):** population band to personal band on `spring.soft`, with a visible overshoot.
- **Lock click (09):** the band's two edges close like calipers.
- **Hull filter (13):** raw waveform compresses into a single digit as it crosses a line.

Reduced motion: every scrubbed timeline has a designed static end frame; dials become steppers; nothing is lost but the movement. Tested, not assumed.

## 8. Exploded view and sensor pages

### Chapter 06: one cap, six sensors

The cap is drawn in isometric line art, assembled, at rest. As the chapter pins and you scroll:

1. The shell lifts off.
2. Six sensor modules separate along their own axes, staggered from the centre, each seating on `spring.snap`.
3. One leader line per part draws out to a label: part number, name, weight (est.), and **the risk it watches**.
4. Scroll back and it reassembles. Hover any part and the others dim to `--line`.

Click a part to open its page. The part stays on screen and becomes the hero of the next page (shared-element transition), so the judge never loses their place.

### `/sensors/[id]`: schematic product page

Same template for all six, four short screens:

1. **The part.** Large isometric drawing, slowly rotatable by cursor. Name, part number, one line: its job.
2. **Where it sits.** The cap ghosted, this part lit, a dimension line to the scalp or ear.
3. **What it turns into.** Raw signal on the left, drawn live; what the app shows on the right, with its provenance tag. This is the sensor-to-software link.
4. **What it cannot tell you.** One honest line. Then previous and next sensor.

| # | Sensor | Its job in the device | What the tool shows | Tag |
|---|---|---|---|---|
| S-01 | EEG, dry electrodes | Brain electrical activity through the cap lining | Alertness and mental fatigue with confidence band; sleep stages from the headband; seizure confirmation in emergency triage | Estimated by ML |
| S-02 | fNIRS | Light-based brain blood oxygen | Mental workload index; cross-checks EEG with less noise | Estimated · Future |
| S-03 | PPG, forehead or ear | Optical pulse sensing | Resting pulse, heart-rhythm variability (calm or stress), blood oxygen | Sensed |
| S-04 | IMU | Head acceleration and rotation | Space motion sickness in the first 3 days, landing-day fall detection on Mars, exercise minutes | Sensed |
| S-05 | Skin temperature | Temperature at the forehead | Fever trend (immune system), overheating during spacewalks | Sensed |
| S-06 | Cap microphones (existing) | Voice, analysed on the device | Voice stress index, opt-in, number only | Estimated · Future |

## 9. The app (`/app`)

One screen, three zones, built with the same components as the site.

- **Today:** one sentence at the top. "You are in your normal." or "Sleep has drifted for 9 days."
- **Body map:** the clickable figure the brief suggests. Regions carry a status dot. Click one for its readings.
- **Reading detail:** chart with the personal band, provenance tag, one-line explanation, and **one next action** with the escalation ladder.

Controls for the demo: a small mission-day dial (same as chapter 04), a scenario switch (nominal, slow drift, motion sickness, spacewalk), and a "Learning you" state for days 1 to 14. Items the cap cannot sense (bone, vision, radiation) appear as manual log entries tagged **You measure it** or **From the ship**.

The drift logic is real and simple enough to explain in one breath: a rolling personal baseline and band per reading from the first 14 days, then a flag when a smoothed trend stays outside the band for several consecutive days. Runs in the browser on generated data.

## 10. Build

- **Astro**, static output. Multi-page for free, almost no JavaScript by default, view transitions built in for the part-to-page handoff.
- **anime.js v4** for all motion: scroll observer, springs, draggable, SVG drawing, staggering, timelines. It is the library behind the reference site and covers everything in §7 in about 25 KB.
- Hand-authored SVG. No 3D engine, no image assets, no icon library. Isometric line art is sharper, lighter and more on-theme than WebGL.
- TypeScript, plain CSS with custom properties for tokens. No UI framework.
- Deployed as static files.

Budgets: under 200 KB of JavaScript, 60 fps on a mid-range laptop, largest paint under 1.5s, readable at 375px wide, full keyboard path through every interactive piece, contrast at AA or better.

### Order of work

1. Tokens, type, grid, chapter frame, the thread. Get one chapter looking finished before building the second.
2. Chapter 04, the mission dial. If this is not great, nothing else matters; it also yields the chart and dial components everything else reuses.
3. Chapter 06, the exploded cap, and with it the isometric part drawings.
4. Remaining story chapters, in order.
5. Sensor page template, then six pages of content.
6. `/app`.
7. Polish passes: phone layout, reduced motion, keyboard, performance, copy.

### How each piece gets judged before it is called done

Looked at in a real browser at desktop and phone widths, then checked against five questions:

1. Can I say this screen's point in one sentence without reading it aloud from the page?
2. Is exactly one thing moving?
3. Does every released object settle on a spring, and does every snap feel deliberate?
4. Is every claim tagged, sourced or labelled simulated?
5. Would I be embarrassed to show this next to the reference site? If yes, iterate again.

## 11. Open questions for the team

1. **Name.** Is "Baseline" fine, or is there a team or product name already?
2. **Previous version.** This project folder is empty. If there is copy, a logo or a scenario from the earlier site worth keeping, drop it in.
3. **Deadline and demo format.** Live link, recorded video, or both? A video changes which moments get the most polish.
4. **Sensor weights and sourced figures.** Does someone on the team have references, or do they ship as "est."?
