# Anterior Pelvic Tilt (`anterior_pelvic_tilt`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `thomas_test` | 0 | 5 | — (not symmetry) | target_description "at or below horizontal" → 0 | DEFAULT — clinical judgment (eyeballed angle) |
| `standing_pelvic_tilt` | 12 | 3 | — (not symmetry) | DEFAULT — clinical judgment (inside the 7–15° range target_description cites) | DEFAULT — clinical judgment |
| `anterior_core_endurance` | 60 | 10 | — (not symmetry) | DEFAULT — clinical judgment (target_description: "no universal norm") | DEFAULT — clinical judgment |
| `glute_bridge_hold` | 30 | 5 | — (not symmetry) | target_description "30s each side" | DEFAULT — clinical judgment |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `apt-hip-flexor-stretch` | hips | yes | thomas_test (2), standing_pelvic_tilt (1) |
| `apt-glute-bridge` | hips | no | glute_bridge_hold (2), standing_pelvic_tilt (1), thomas_test (1) |
| `apt-deep-squat-hold` | hips | yes | thomas_test (0.5) |
| `apt-anterior-core` | lower_back | no | anterior_core_endurance (2), standing_pelvic_tilt (1.5) |
| `apt-loaded-hip-hinge` | hamstrings | no | glute_bridge_hold (1), standing_pelvic_tilt (0.5) |
| `apt-split-squat` | hips | no | thomas_test (1), glute_bridge_hold (0.5) |
| `apt-loaded-carry` | lower_back | no | anterior_core_endurance (1) |
| `apt-mcgill-big-three` | lower_back | no | anterior_core_endurance (1.5), standing_pelvic_tilt (1) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise sets first, then reps or hold. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `apt-hip-flexor-stretch` | 1 | APT: Couch Stretch | Basic | 1×60s → 2×60s → 2×90s | Pool row: couch stretch; half-kneeling hip flexor stretch as the alternate. Hold capped well under 240 s. |
|  |  | Half-Kneeling Hip Flexor Stretch with Reach | Basic | 1×45s → 2×45s → 2×60s |  |
| `apt-hip-flexor-stretch` | 2 | World's Greatest Stretch | Basic | 1×5 reps → 2×5 reps → 2×6 reps | Active, moving end range once static hold time plateaus. |
| `apt-glute-bridge` | 1 | APT: Single-Leg Glute Bridge | Basic | 1×12 reps → 2×12 reps → 3×12 reps | Pool row: single-leg glute bridge. |
| `apt-glute-bridge` | 2 | APT: Single-Leg Glute Bridge, Foot on Step *(new)* | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Heel on a step: longer range at full hip extension. |
| `apt-deep-squat-hold` | 1 | Ankle: Deep Squat Hold | Basic | 2×45s → 2×60s → 3×60s | Pool row: deep squat hold. |
| `apt-deep-squat-hold` | 2 | Mobility: Cossack Squat Flow | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Cossack squat: active deep hip range. |
| `apt-anterior-core` | 1 | APT: Dead Bug | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Pool rows: dead bug and the modified curl-up (8-second holds). |
|  |  | APT: Modified Curl-Up | Basic | 3×8s → 4×8s → 5×10s |  |
| `apt-anterior-core` | 2 | APT: Posterior-Tilt Plank *(new)* | Basic | 2×20s → 3×20s → 3×30s | Posterior-tilt plank: the endurance test position with the tuck this sprint trains. |
| `apt-loaded-hip-hinge` | 1 | APT: Romanian Deadlift | Int/Adv | 2×8 reps → 3×8 reps → 3×10 reps | Pool rows: Romanian deadlift, or the single-leg reach to a cone. |
|  |  | Single-Leg Deadlift Reach to Cone | Basic | 2×6 reps → 3×6 reps → 3×8 reps |  |
| `apt-loaded-hip-hinge` | 2 | Single-Leg Romanian Deadlift Balance Reach | Int/Adv | 2×8 reps → 3×8 reps → 3×10 reps | Single-leg loaded hinge, or the slider hamstring curl at home. |
|  |  | Knees: Slider Hamstring Curl | Basic | 2×6 reps → 3×6 reps → 3×8 reps |  |
| `apt-split-squat` | 1 | APT: Bulgarian Split Squat | Int/Adv | 2×8 reps → 3×8 reps → 3×10 reps | Pool rows: Bulgarian split squat, or the tempo split squat. |
|  |  | Knees: Tempo Split Squat | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `apt-split-squat` | 2 | APT: Front-Foot-Elevated Split Squat *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Front foot raised: a deeper loaded stretch of the back hip's flexors. |
| `apt-loaded-carry` | 1 | Neck: Farmer's Carry | Int/Adv | 2×30m → 3×30m → 3×40m | Pool rows: farmer's carry, or shoulder taps in a plank. |
|  |  | Plank with Shoulder Taps | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `apt-loaded-carry` | 2 | APT: Bear Crawl *(new)* | Basic | 2×10m → 3×10m → 3×15m | Bear crawl: a braced trunk while the limbs move. |
| `apt-mcgill-big-three` | 1 | APT: Side Plank | Basic | 2×20s → 3×20s → 3×30s | Pool rows: side plank and bird dog. |
|  |  | APT: Bird Dog | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `apt-mcgill-big-three` | 2 | Ankle: Side Plank with Leg Lift *(new)* | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Side plank with a top-leg lift. |

## New exercises used here

- **APT: Single-Leg Glute Bridge, Foot on Step** (strength, grade B, step): Putting the working heel on a step lengthens the range so the glutes work harder at full hip extension, the next step after the floor single-leg bridge.
- **APT: Posterior-Tilt Plank** (strength, grade B, no equipment): A front plank with the pelvis tucked under and the glutes squeezed is harder on the abdominals than a normal plank and trains the posterior tilt this sprint is after.
- **APT: Front-Foot-Elevated Split Squat** (strength, grade B, step): Raising the front foot lets the back knee sink lower, which takes the rear hip into a deeper loaded stretch of the hip flexors. Loaded lengthening builds range and strength together.
- **APT: Bear Crawl** (strength, grade C, no equipment): Crawling with the knees just off the floor keeps the trunk braced against movement. It is a no-equipment substitute for a loaded carry that trains anti-extension core endurance.
- **Ankle: Side Plank with Leg Lift** (strength, grade B, no equipment): Lifting the top leg in a side plank loads the hip abductors at body weight with the trunk braced, a step up from side-lying abduction. Hip strength ranks second only to balance work in ankle-instability rehab.
