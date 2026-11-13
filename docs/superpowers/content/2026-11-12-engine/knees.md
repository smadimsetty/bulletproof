# Knees (`knees`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `single_leg_sit_to_stand` | 12 | 2 | — (not symmetry) | target_description "12 or more reps" | DEFAULT — clinical judgment |
| `knee_to_wall` | 10 | 1.5 | higher | target_description "about 9 to 12 cm" → 10 | [Physiopedia WBLT](https://www.physio-pedia.com/Weight-bearing_Lunge_Test); [PMC3362988](https://pmc.ncbi.nlm.nih.gov/articles/PMC3362988) (MDC ~1.4–1.9 cm) |
| `wall_sit` | 60 | 10 | — (not symmetry) | target_description "60 seconds or more" | DEFAULT — clinical judgment |
| `stair_knee_pain` | 2 | 2 | — (not symmetry) | target_description "0 to 2"; [JOSPT pain-monitoring model](https://www.scribd.com/document/718543943/jospt-2016-6908-1) (0–2 safe) | DEFAULT — clinical judgment (about the usual 2-point change that matters on a 0–10 rating) |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `knees-ankle-dorsiflexion` | ankles | yes | knee_to_wall (2) |
| `knees-quad-capacity` | knees | no | single_leg_sit_to_stand (1.5), wall_sit (2), stair_knee_pain (1) |
| `knees-hip-strength` | hips | no | single_leg_sit_to_stand (1), stair_knee_pain (1) |
| `knees-split-squat` | knees | no | single_leg_sit_to_stand (2), wall_sit (0.5) |
| `knees-single-leg-control` | knees | no | single_leg_sit_to_stand (1), stair_knee_pain (1) |
| `knees-hamstring` | hamstrings | no | stair_knee_pain (1) |
| `knees-calf-tibialis` | ankles | no | knee_to_wall (1) |
| `knees-quad-length` | knees | yes | wall_sit (0.5), stair_knee_pain (0.5) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise volume: sets, reps or hold time. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `knees-ankle-dorsiflexion` | 1 | Half-Kneeling Ankle Mobilization | Basic | 1×12 reps → 2×12 reps → 2×15 reps | Pool rows: half-kneeling and banded ankle mobilizations. |
|  |  | Ankle: Banded Knee-to-Wall Mobilization | Int/Adv | 1×15 reps → 2×15 reps → 2×20 reps |  |
| `knees-ankle-dorsiflexion` | 2 | Ankle: Standing Knee-to-Wall Rock with Hold *(new)* | Basic | 2×10 reps → 3×10 reps | Full body weight on the ankle with an end-range hold, or a light plate. |
|  |  | Weighted Ankle Dorsiflexion Mobilization | Int/Adv | 2×10 reps → 3×10 reps |  |
| `knees-quad-capacity` | 1 | Knees: Slow Eccentric Step-Down | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Pool rows: eccentric step-down and wall sit. |
|  |  | Knees: Wall Sit | Basic | 2×30s → 3×30s → 3×45s |  |
| `knees-quad-capacity` | 2 | Reverse Nordic Curl | Basic | 2×5 reps → 3×5 reps → 3×6 reps | Pool row reverse Nordic: the quads at long length, the hardest of the three. |
| `knees-hip-strength` | 1 | Ankle: Side-Lying Hip Abduction | Basic | 2×12 reps → 3×12 reps → 3×15 reps | Pool rows: side-lying abduction, lateral band walk, fire hydrant. |
|  |  | Lateral Band Walk | Int/Adv | 2×10m → 3×10m → 3×15m |  |
|  |  | Fire Hydrant | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `knees-hip-strength` | 2 | Ankle: Side Plank with Leg Lift *(new)* | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Abduction in a side plank, or the monster walk. |
|  |  | Monster Walk | Int/Adv | 2×10m → 3×10m |  |
| `knees-split-squat` | 1 | Knees: Tempo Split Squat | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Pool row: tempo split squat. |
| `knees-split-squat` | 2 | Knees: Single-Leg Sit-to-Stand | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Pool row single-leg sit-to-stand (the test movement), or the front-foot-elevated split squat. |
|  |  | APT: Front-Foot-Elevated Split Squat *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `knees-single-leg-control` | 1 | Knees: Single-Leg Mini Squat | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Pool rows: single-leg mini squat and Y-balance reach. |
|  |  | Y-Balance Reach | Basic | 2×3 reps → 2×5 reps → 3×5 reps |  |
| `knees-single-leg-control` | 2 | Single-Leg Deadlift Reach to Cone | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Pool row: the reach to a cone (a deeper hinge on one leg), or loaded with a dumbbell. |
|  |  | Single-Leg Romanian Deadlift Balance Reach | Int/Adv | 2×8 reps → 3×8 reps |  |
| `knees-hamstring` | 1 | Knees: Slider Hamstring Curl | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Pool row: slider hamstring curl (the easier of the pool's two). |
| `knees-hamstring` | 2 | Nordic hamstring curl | Int/Adv | 2×3 reps → 3×3 reps → 3×5 reps | Pool row Nordic curl (needs a bench or partner), or the single-leg slider curl. |
|  |  | Knees: Single-Leg Slider Hamstring Curl *(new)* | Basic | 2×5 reps → 3×5 reps → 3×6 reps |  |
| `knees-calf-tibialis` | 1 | Ankle: Single-Leg Heel Raises | Basic | 2×12 reps → 2×15 reps → 3×15 reps | Pool rows: single-leg heel raise, eccentric heel drop, wall tibialis raise. |
|  |  | Eccentric Heel Drop | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
|  |  | Ankle: Wall Tibialis Raise | Basic | 2×15 reps → 2×20 reps → 3×20 reps |  |
| `knees-calf-tibialis` | 2 | Ankle: Slow Single-Leg Calf Raise on Step | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Full range off a step, or the single-leg tibialis raise. |
|  |  | Ankle: Single-Leg Wall Tibialis Raise *(new)* | Basic | 2×10 reps → 3×10 reps |  |
| `knees-quad-length` | 1 | Standing Quad Stretch | Basic | 1×30s → 2×30s → 2×45s | Pool rows: standing quad stretch and couch stretch. |
|  |  | Couch stretch | Basic | 1×45s → 2×45s → 2×60s |  |
| `knees-quad-length` | 2 | Knees: Kneeling Quad Lean-Back *(new)* | Basic | 1×6 reps → 2×6 reps → 2×8 reps | Active length under body weight: kneeling lean-back, or rolling on a foam roller. |
|  |  | Foam Roll Quads | Int/Adv | 1×60s → 2×60s |  |

## New exercises used here

- **Ankle: Standing Knee-to-Wall Rock with Hold** (mobility_stretch, grade B, wall): Full-bodyweight version of the knee-to-wall mobilization. A 5-second end-range pause under load builds on the half-kneeling drill, and weight-bearing dorsiflexion is exactly what the knee-to-wall test measures.
- **Ankle: Side Plank with Leg Lift** (strength, grade B, no equipment): Lifting the top leg in a side plank loads the hip abductors at body weight with the trunk braced, a step up from side-lying abduction. Hip strength ranks second only to balance work in ankle-instability rehab.
- **APT: Front-Foot-Elevated Split Squat** (strength, grade B, step): Raising the front foot lets the back knee sink lower, which takes the rear hip into a deeper loaded stretch of the hip flexors. Loaded lengthening builds range and strength together.
- **Knees: Single-Leg Slider Hamstring Curl** (strength, grade B, towel): Doing the slider curl on one leg roughly doubles the eccentric hamstring load, a no-equipment bridge toward Nordic-curl intensity.
- **Ankle: Single-Leg Wall Tibialis Raise** (strength, grade B, wall): Doing the wall tibialis raise on one leg doubles the load on the muscle at the front of the shin, the progression once the two-leg version passes 20 easy reps.
- **Knees: Kneeling Quad Lean-Back** (mobility_stretch, grade C, no equipment): Leaning back from tall kneeling lengthens the quads under body weight, an active version of the quad stretch and a regression of the reverse Nordic.
