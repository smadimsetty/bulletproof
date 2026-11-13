# Total Mobility (`total_mobility`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `toe_touch_reach` | 0 | 2 | — (not symmetry) | target_description "0 cm" | DEFAULT — clinical judgment |
| `deep_squat_hold` | 60 | 5 | — (not symmetry) | target_description "60 seconds" | DEFAULT — clinical judgment |
| `back_scratch_reach` | 0 | 2 | — (not symmetry) | target_description "0 cm on both sides" | DEFAULT — clinical judgment |
| `post_training_feel` | 8 | 2 | — (not symmetry) | DEFAULT — clinical judgment (target_description: "higher than when you started") | DEFAULT — clinical judgment (about the usual 2-point change that matters on a 0–10 rating) |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `tm-hip-flow` | hips | yes | deep_squat_hold (1), toe_touch_reach (0.5), post_training_feel (0.5) |
| `tm-upper-back` | thoracic_spine | yes | back_scratch_reach (1.5) |
| `tm-squat-ankles` | ankles | yes | deep_squat_hold (2) |
| `tm-hamstring` | hamstrings | yes | toe_touch_reach (2) |
| `tm-hip-flexor-quad` | hips | yes | deep_squat_hold (0.5), post_training_feel (1) |
| `tm-chest-shoulder` | shoulders | yes | back_scratch_reach (2) |
| `tm-glute-activation` | hips | no | post_training_feel (1) |
| `tm-wrist-forearm` | wrists | yes | post_training_feel (1) |
| `tm-recovery-breathing` | lower_back | yes | post_training_feel (1.5), toe_touch_reach (0.5) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise volume: sets, reps or hold time. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `tm-hip-flow` | 1 | World's Greatest Stretch | Basic | 1×5 reps → 2×5 reps → 2×6 reps | Pool rows: world's greatest stretch, 90/90 switch, 90/90 stretch (hold capped well under 240 s). |
|  |  | 90/90 Hip Switch | Basic | 1×8 reps → 2×8 reps → 2×10 reps |  |
|  |  | 90/90 hip stretch | Basic | 1×60s → 1×90s → 2×90s |  |
| `tm-hip-flow` | 2 | Full Body: 90/90 Back-Leg Lift-Off *(new)* | Basic | 1×5 reps → 2×5 reps → 2×8 reps | Active end range: 90/90 lift-offs, or pigeon pose on a mat. |
|  |  | Pigeon Pose | Int/Adv | 1×60s → 2×60s |  |
| `tm-upper-back` | 1 | Mobility: Open Book Thoracic Rotation | Basic | 1×8 reps → 2×8 reps → 2×10 reps | Pool rows: open book, thread the needle, rotation over a foam roller. |
|  |  | Thread the Needle | Basic | 1×6 reps → 2×6 reps → 2×8 reps |  |
|  |  | Thoracic Rotation on Foam Roller | Int/Adv | 1×8 reps → 2×8 reps → 2×10 reps |  |
| `tm-upper-back` | 2 | Neck: Thoracic Extension Over Chair Back | Basic | 1×10 reps → 2×10 reps → 3×10 reps | Extension over a fulcrum: chair back, or foam roller. |
|  |  | Shoulder: Thoracic Extension Over Foam Roller | Int/Adv | 1×10 reps → 2×10 reps → 3×10 reps |  |
| `tm-squat-ankles` | 1 | Deep squat hold | Basic | 2×30s → 2×45s → 2×60s | Pool rows: deep squat hold, Cossack squat, half-kneeling ankle mobilization. |
|  |  | Mobility: Cossack Squat Flow | Basic | 1×6 reps → 2×6 reps → 2×8 reps |  |
|  |  | Half-Kneeling Ankle Mobilization | Basic | 1×12 reps → 2×12 reps → 2×15 reps |  |
| `tm-squat-ankles` | 2 | Ankle: Standing Knee-to-Wall Rock with Hold *(new)* | Basic | 2×10 reps → 3×10 reps | Full body weight on the ankle with an end-range hold, or a light plate. |
|  |  | Weighted Ankle Dorsiflexion Mobilization | Int/Adv | 2×10 reps → 3×10 reps |  |
| `tm-hamstring` | 1 | Standing Hamstring Stretch | Basic | 1×45s → 2×45s → 2×60s | Pool rows: standing hamstring stretch and toe touch with reach-through. |
|  |  | Standing Toe Touch with Reach-Through | Basic | 1×8 reps → 2×8 reps → 2×10 reps |  |
| `tm-hamstring` | 2 | PNF hamstring stretch | Int/Adv | 1×3 reps → 2×3 reps | Pool row PNF (needs a strap), or the bodyweight Jefferson curl: contract-relax and loaded end range. |
|  |  | Full Body: Bodyweight Jefferson Curl *(new)* | Basic | 1×6 reps → 2×6 reps → 2×8 reps |  |
| `tm-hip-flexor-quad` | 1 | Couch stretch | Basic | 1×60s → 2×60s → 2×90s | Pool rows: couch stretch, half-kneeling hip flexor stretch, standing quad stretch. |
|  |  | Half-Kneeling Hip Flexor Stretch with Reach | Basic | 1×45s → 2×45s → 2×60s |  |
|  |  | Standing Quad Stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `tm-hip-flexor-quad` | 2 | APT: Front-Foot-Elevated Split Squat *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Loaded lengthening: front-foot-elevated split squat, or reverse Nordic. |
|  |  | Reverse Nordic Curl | Basic | 2×5 reps → 3×5 reps → 3×6 reps |  |
| `tm-chest-shoulder` | 1 | Doorway Pec Stretch | Basic | 1×45s → 2×45s → 2×60s | Pool rows: doorway pec stretch, shoulder CARs, towel behind-back stretch. |
|  |  | Shoulder CARs | Basic | 1×5 reps → 2×5 reps → 2×6 reps |  |
|  |  | Towel Behind-Back Shoulder Stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `tm-chest-shoulder` | 2 | Shoulder: Wall-Facing Overhead Lift-Off *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Active overhead range: wall-facing lift-off, or band pass-throughs. |
|  |  | Resistance Band Shoulder Pass-Through | Int/Adv | 1×10 reps → 2×10 reps → 2×12 reps |  |
| `tm-glute-activation` | 1 | Fire Hydrant | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Pool rows: fire hydrant and single-leg glute bridge. |
|  |  | APT: Single-Leg Glute Bridge | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `tm-glute-activation` | 2 | APT: Single-Leg Glute Bridge, Foot on Step *(new)* | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Longer range on a step, or the banded lateral walk. |
|  |  | Lateral Band Walk | Int/Adv | 2×10m → 3×10m |  |
| `tm-wrist-forearm` | 1 | Wrist Mobility Flow (flexion/extension/circles) | Basic | 1×45s → 2×45s → 2×60s | Pool rows: wrist mobility flow and the prayer stretch. |
|  |  | Mobility: Wrist Prayer Stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `tm-wrist-forearm` | 2 | Mobility: Quadruped Wrist Rocks *(new)* | Basic | 1×10 reps → 2×10 reps → 2×15 reps | Loaded wrist range: quadruped rocks, or dumbbell reverse wrist curls. |
|  |  | Reverse Wrist Curl | Int/Adv | 2×12 reps → 3×12 reps → 3×15 reps |  |
| `tm-recovery-breathing` | 1 | Mobility: Diaphragmatic Breathing, Legs Elevated | Basic | 1×120s → 1×180s → 1×240s | Pool rows: legs-up breathing (time builds to the 240 s cap) and knee-to-chest. |
|  |  | Knee-to-Chest Stretch | Basic | 1×45s → 2×45s → 2×60s |  |
| `tm-recovery-breathing` | 2 | Cat-Cow | Basic | 1×10 reps → 2×10 reps → 2×12 reps | Spinal movement: cat-cow, or child's pose on a mat. |
|  |  | Childs Pose | Int/Adv | 1×60s → 1×90s → 2×90s |  |

## New exercises used here

- **Full Body: 90/90 Back-Leg Lift-Off** (mobility_stretch, grade C, no equipment): Lifting the back shin off the floor from the 90/90 position works the hip rotators at end range, turning passive 90/90 range into range you can control.
- **Ankle: Standing Knee-to-Wall Rock with Hold** (mobility_stretch, grade B, wall): Full-bodyweight version of the knee-to-wall mobilization. A 5-second end-range pause under load builds on the half-kneeling drill, and weight-bearing dorsiflexion is exactly what the knee-to-wall test measures.
- **Full Body: Bodyweight Jefferson Curl** (mobility_stretch, grade C, step): A slow roll-down from a step loads the hamstrings and spine at end range with body weight only. Loaded end-range work is the step after static holds once stretch time plateaus.
- **APT: Front-Foot-Elevated Split Squat** (strength, grade B, step): Raising the front foot lets the back knee sink lower, which takes the rear hip into a deeper loaded stretch of the hip flexors. Loaded lengthening builds range and strength together.
- **Shoulder: Wall-Facing Overhead Lift-Off** (strength, grade B, wall): Holding full overhead reach with no support turns passive range from hangs and stretches into active range, which the overhead reach test needs.
- **APT: Single-Leg Glute Bridge, Foot on Step** (strength, grade B, step): Putting the working heel on a step lengthens the range so the glutes work harder at full hip extension, the next step after the floor single-leg bridge.
- **Mobility: Quadruped Wrist Rocks** (mobility_stretch, grade C, no equipment): Rocking body weight over the hands loads the wrists at end-range extension, the active step after unloaded wrist flows and prayer stretches.
