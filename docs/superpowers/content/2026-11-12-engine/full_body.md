# Full Body (`full_body`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `toe_touch_reach` | 0 | 2 | — (not symmetry) | target_description "0 cm" | DEFAULT — clinical judgment |
| `deep_squat_hold` | 60 | 5 | — (not symmetry) | target_description "60 seconds" | DEFAULT — clinical judgment |
| `wall_angel` | 10 | 2 | — (not symmetry) | target_description "10 reps" | DEFAULT — clinical judgment |
| `overall_stiffness` | 3 | 2 | — (not symmetry) | DEFAULT — clinical judgment (target_description: "lower than when you started") | DEFAULT — clinical judgment (about the usual 2-point change that matters on a 0–10 rating) |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `fb-spine-mobility` | thoracic_spine | yes | wall_angel (1.5), toe_touch_reach (0.5), overall_stiffness (1) |
| `fb-hip-opener` | hips | yes | deep_squat_hold (1), overall_stiffness (1) |
| `fb-chest-shoulder-opener` | shoulders | yes | wall_angel (2) |
| `fb-hamstring-calf` | hamstrings | yes | toe_touch_reach (2) |
| `fb-squat-hold` | hips | yes | deep_squat_hold (2) |
| `fb-neck-release` | neck | yes | wall_angel (0.5), overall_stiffness (1) |
| `fb-glute-wakeup` | hips | no | overall_stiffness (1) |
| `fb-full-body-flow` | hips | yes | toe_touch_reach (1), overall_stiffness (1) |
| `fb-ankle-wrist` | ankles | yes | deep_squat_hold (1) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise volume: sets, reps or hold time. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `fb-spine-mobility` | 1 | Cat-Cow | Basic | 1×10 reps → 2×10 reps → 2×12 reps | Pool rows: cat-cow, thread the needle, thoracic extension over a chair. |
|  |  | Thread the Needle | Basic | 1×6 reps → 2×6 reps → 2×8 reps |  |
|  |  | Neck: Thoracic Extension Over Chair Back | Basic | 1×10 reps → 2×10 reps → 3×10 reps |  |
| `fb-spine-mobility` | 2 | Mobility: Open Book Thoracic Rotation | Basic | 1×8 reps → 2×8 reps → 2×10 reps | Bigger rotation: open book, or rotation over a foam roller. |
|  |  | Thoracic Rotation on Foam Roller | Int/Adv | 1×8 reps → 2×8 reps → 2×10 reps |  |
| `fb-hip-opener` | 1 | 90/90 Hip Switch | Basic | 1×8 reps → 2×8 reps → 2×10 reps | Pool rows: 90/90 switch, half-kneeling hip flexor stretch, couch stretch. |
|  |  | Half-Kneeling Hip Flexor Stretch with Reach | Basic | 1×45s → 2×45s → 2×60s |  |
|  |  | Couch stretch | Basic | 1×45s → 2×45s → 2×60s |  |
| `fb-hip-opener` | 2 | Full Body: 90/90 Back-Leg Lift-Off *(new)* | Basic | 1×5 reps → 2×5 reps → 2×8 reps | Active hip rotation at end range: 90/90 lift-offs. |
| `fb-chest-shoulder-opener` | 1 | Scapular Wall Slides | Basic | 1×10 reps → 2×10 reps → 2×12 reps | Pool rows: scapular wall slides, doorway pec stretch, shoulder CARs. |
|  |  | Doorway Pec Stretch | Basic | 1×45s → 2×45s → 2×60s |  |
|  |  | Shoulder CARs | Basic | 1×5 reps → 2×5 reps → 2×6 reps |  |
| `fb-chest-shoulder-opener` | 2 | Shoulder: Wall Slide with Lift-Off *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Active overhead control: wall slides with lift-off, or band pass-throughs. |
|  |  | Resistance Band Shoulder Pass-Through | Int/Adv | 1×10 reps → 2×10 reps → 2×12 reps |  |
| `fb-hamstring-calf` | 1 | Standing Hamstring Stretch | Basic | 1×45s → 2×45s → 2×60s | Pool rows: standing hamstring stretch, toe touch with reach-through, wall hip hinge. |
|  |  | Standing Toe Touch with Reach-Through | Basic | 1×8 reps → 2×8 reps → 2×10 reps |  |
|  |  | Full Body: Wall Hip Hinge | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `fb-hamstring-calf` | 2 | Full Body: Bodyweight Jefferson Curl *(new)* | Basic | 1×6 reps → 2×6 reps → 2×8 reps | Loaded end range: Jefferson curl off a step, or with a light dumbbell. |
|  |  | Jefferson curl | Int/Adv | 1×6 reps → 2×6 reps → 2×8 reps |  |
| `fb-squat-hold` | 1 | Deep squat hold | Basic | 2×30s → 2×45s → 2×60s | Pool rows: deep squat hold and Asian squat hold, building toward the 60-second test. |
|  |  | Asian Squat Hold | Basic | 2×30s → 2×45s → 2×60s |  |
| `fb-squat-hold` | 2 | Mobility: Cossack Squat Flow | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Cossack squat: moving through the deep squat range side to side. |
| `fb-neck-release` | 1 | Chin tucks | Basic | 1×10 reps → 2×10 reps → 3×10 reps | Pool rows: chin tucks, levator stretch, neck rotation stretch. |
|  |  | Levator scapulae stretch | Basic | 1×30s → 2×30s → 2×45s |  |
|  |  | Neck Rotation Stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `fb-neck-release` | 2 | Wall-Supported Chin Tuck | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Chin tucks against a wall, or prone retraction with extension (against gravity). |
|  |  | Prone Neck Retraction with Extension | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `fb-glute-wakeup` | 1 | Full Body: Glute Bridge | Basic | 2×12 reps → 3×12 reps → 3×15 reps | Pool rows: glute bridge and fire hydrant. |
|  |  | Fire Hydrant | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `fb-glute-wakeup` | 2 | APT: Single-Leg Glute Bridge | Basic | 2×10 reps → 3×10 reps → 3×12 reps | One leg at a time, or banded clamshells. |
|  |  | Clamshell | Int/Adv | 2×12 reps → 3×12 reps → 3×15 reps |  |
| `fb-full-body-flow` | 1 | World's Greatest Stretch | Basic | 1×5 reps → 2×5 reps → 2×6 reps | Pool rows: world's greatest stretch, standing side bend reach, leg swings. |
|  |  | Full Body: Standing Side Bend Reach | Basic | 1×8 reps → 2×8 reps → 2×10 reps |  |
|  |  | Leg Swings | Basic | 1×10 reps → 2×10 reps → 2×12 reps |  |
| `fb-full-body-flow` | 2 | Full Body: Inchworm *(new)* | Basic | 1×5 reps → 2×5 reps → 2×6 reps | Inchworm: hamstring stretch under load plus a plank. |
| `fb-ankle-wrist` | 1 | Ankle Circles | Basic | 1×10 reps → 2×10 reps → 2×12 reps | Pool rows: ankle circles and the wrist mobility flow. |
|  |  | Wrist Mobility Flow (flexion/extension/circles) | Basic | 1×45s → 2×45s → 2×60s |  |
| `fb-ankle-wrist` | 2 | Half-Kneeling Ankle Mobilization | Basic | 1×10 reps → 2×10 reps → 2×12 reps | Weight-bearing range: half-kneeling ankle mobilization, or the wrist prayer stretch. |
|  |  | Mobility: Wrist Prayer Stretch | Basic | 1×30s → 2×30s → 2×45s |  |

## New exercises used here

- **Full Body: 90/90 Back-Leg Lift-Off** (mobility_stretch, grade C, no equipment): Lifting the back shin off the floor from the 90/90 position works the hip rotators at end range, turning passive 90/90 range into range you can control.
- **Shoulder: Wall Slide with Lift-Off** (strength, grade B, wall): Lifting the hands off the wall at the top of the slide makes the lower trapezius work at full elevation, the active end-range step after plain wall slides.
- **Full Body: Bodyweight Jefferson Curl** (mobility_stretch, grade C, step): A slow roll-down from a step loads the hamstrings and spine at end range with body weight only. Loaded end-range work is the step after static holds once stretch time plateaus.
- **Full Body: Inchworm** (mobility_stretch, grade C, no equipment): Walking the hands out to a plank and back stretches the hamstrings under load and moves the shoulders and trunk in one flow, a step up from standing whole-body stretches.
