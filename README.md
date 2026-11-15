# Baseline: Orbital Health Watch and Headgear

**NASA Space Apps Challenge 2026 · Team 0G Health**

- **Challenge:** [Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- **Space Apps team page:** [0G Health](https://www.spaceappschallenge.org/2026/find-a-team/0g-health/?tab=details)
- **Local event:** NASA Space Apps Challenge 2026, Besançon (14–15 Nov 2026)

## Demo

The summary of our work can be viewed in this YouTube video:

https://www.youtube.com/watch?v=5AP9N7kCnkY

## Team

Mikolaj Kurek · Abdelouahab Belarbi · Mamadou Ndiaye · Nourchene Jendoubi · Tresor Athawet · Suzon Gay

## The problem

On a long mission the dangerous health changes are the slow ones: bone and muscle loss, sleep debt, building stress. They are invisible to the person living them, and on the way to Mars a message to the flight surgeon can take up to about 20 minutes each way. The challenge asks for software that lets astronauts assess their own health and know what to do next.

## Our solution

Baseline is a daily self-check that learns each astronaut's own normal and flags slow drift weeks before a reading reaches a medical limit.

- **Headgear:** a sensor headpiece (dry EEG, optical pulse, motion, skin temperature) worn during sleep and a two-minute morning check.
- **Watch:** a screen and a vibration alert. If an alarm is not answered, it calls the crew medical officer.
- **Software:** a personal normal band on every chart, three states only (in your normal, drifting, at limit), one plain next action per flag, and an escalation path: you, crew medical officer, flight surgeon.
- **Bone and muscle:** bone density cannot be measured in flight, so we estimate it from logged exercise and meals. See below.

Every reading is tagged with how we know it (sensed, estimated by ML, estimated by model, self-measured, from the ship). All data in the prototype is simulated. This is not a medical device.

## Bone and muscle loss algorithms

The algorithms developed for bone and muscle loss are in the [`Algorithms/`](Algorithms/) folder, written in C. The web app runs a TypeScript version of the same models ([`src/lib/sim.ts`](src/lib/sim.ts)) and explains them on the `/bone-muscle` page.

| File | What it does |
|---|---|
| [`Algorithms/bone/bone_mission.c`](Algorithms/bone/bone_mission.c) | Integrated bone model, day by day: activity + nutrition + bone index, with alerts |
| [`Algorithms/bone/activity.c`](Algorithms/bone/activity.c) | Exercise dose (0 to 1) from a simulated accelerometer and a session log |
| [`Algorithms/bone/nutrition.c`](Algorithms/bone/nutrition.c) | Daily intake compared with NASA JSC-67378 Rev. 1, giving a nutrition penalty |
| [`Algorithms/bone/bone_daily.csv`](Algorithms/bone/bone_daily.csv) | Output of a 180-day run |
| [`Algorithms/muscle/muscle_mission.c`](Algorithms/muscle/muscle_mission.c) | Integrated muscle model per group (legs, back, calves, upper body) with a 27-check anomaly engine |
| [`Algorithms/muscle/astro_health.c`](Algorithms/muscle/astro_health.c) | Single-file index model: exercise protection, nutrition deficiency, alerts |
| [`Algorithms/muscle/nutrition_compact.c`](Algorithms/muscle/nutrition_compact.c) | Compact bone and muscle nutrition scores |
| [`Algorithms/muscle/muscle_daily.csv`](Algorithms/muscle/muscle_daily.csv) | Output of a 180-day run |

The models:

```
BoneIndex(t)  = BoneIndex_0 - (k_loss × t) + E_exercise - P_nutrition      k_loss = 1.25 % per month
Index_g(t)    = Index_g(t-1) × exp( -k_g × (1 - Prot_g(t)) × (1 + Def(t)) ) per muscle group g
```

Alert levels, score weights and accelerometer thresholds are project hypotheses, marked as such in the code, and still to be calibrated with NASA and ESA data.

## How to run it

Website and app (needs Node.js):

```bash
npm install
npm run dev
```

Then open http://localhost:4321. The self-check prototype is at `/app`, the bone and muscle model at `/bone-muscle`.

Algorithms (any C compiler):

```bash
gcc -O2 -o bone Algorithms/bone/bone_mission.c -lm && ./bone 180 1
gcc -O2 -o muscle Algorithms/muscle/muscle_mission.c -lm && ./muscle 180 3
```

Arguments are mission days and scenario (1 = nominal, 2 = exercise and food degrade after day 60, 3 = muscle stress test).

## NASA data & resources used

- [NASA Human Research Program, 5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/): communication delay; bone loss of 1 to 1.5 % per month ("Gravity Fields")
- [NASA-STD-3001 Vol. 1 Rev. C](https://www.nasa.gov/directorates/esdmd/hhp/human-spaceflight-and-aviation-standards/): muscle strength ≥ 80 % of baseline, hip and spine density ≥ 95 %, private medical communication, cognitive and sleep limits
- [NASA OCHMO Technical Briefs](https://www.nasa.gov/ochmo/hsa-standards/ochmo-technical-briefs/): Bone Loss (OCHMO-MTB-013), Exercise Overview (OCHMO-TB-031), Sleep Accommodations (OCHMO-TB-041)
- [NASA Science, Mars Relay Network](https://science.nasa.gov/mars/mars-relay-network/): one-way Earth to Mars message time of about 3 to 22 minutes
- NASA JSC-67378 Rev. 1, nutrition requirements: energy, calcium, vitamin D and protein needs

## Use of AI tools

<!-- TODO (team): check this is complete and add any other tool anyone used, including for the C algorithms, slides or video. -->
- Claude (Anthropic) was used to help write and refactor the website code and to draft and edit text.
- No AI-generated images, video or audio are used in the website.

## Sources & credits

- Scott et al. 2023, *npj Microgravity*: exercise minutes and loads on the ISS, used as the reference exercise dose
- Canadian Space Agency, "Monitoring radiation for astronaut health": basis for the radiation reading
- [Astro](https://astro.build/) (web framework), [anime.js](https://animejs.com/) (animation)
- Fonts: [Barlow](https://fonts.google.com/specimen/Barlow), [Geist Mono](https://vercel.com/font)
