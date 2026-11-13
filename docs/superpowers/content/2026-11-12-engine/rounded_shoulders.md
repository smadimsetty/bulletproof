# Rounded Shoulders (`rounded_shoulders`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `wall_overhead_reach` | 1 | 0.5 | — (not symmetry) | pass/fail stored 1/0; target = pass | pass/fail: any change is real |
| `apley_scratch` | 0 | 3 | lower | DEFAULT — clinical judgment (fingertips touching) | target_description "greater than a few centimetres" → 3 |
| `supine_external_rotation` | 90 | 8 | higher | target_description "~90" | DEFAULT — clinical judgment (goniometer error ~5–10°) |
| `sleeper_stretch_ir` | 60 | 10 | higher | DEFAULT — clinical judgment (typical internal rotation at 90°) | DEFAULT — clinical judgment (target_description flags a 20° deficit as clinically relevant) |
| `pushup_plus_control` | 1 | 0.5 | — (not symmetry) | pass/fail stored 1/0; target = pass | pass/fail: any change is real |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `shoulder-thoracic-extension` | thoracic_spine | yes | wall_overhead_reach (2), apley_scratch (0.5) |
| `shoulder-wall-slides` | shoulders | no | wall_overhead_reach (1.5) |
| `shoulder-band-pull-aparts` | shoulders | no | supine_external_rotation (0.5), pushup_plus_control (1) |
| `shoulder-passive-hang` | shoulders | yes | wall_overhead_reach (1.5), apley_scratch (1) |
| `shoulder-overhead-press-full-range` | shoulders | no | wall_overhead_reach (1) |
| `shoulder-scapular-raises` | shoulders | no | pushup_plus_control (1) |
| `shoulder-external-rotation-90` | shoulders | yes | supine_external_rotation (2), apley_scratch (1), sleeper_stretch_ir (1) |
| `shoulder-face-pulls` | shoulders | no | supine_external_rotation (1) |
| `shoulder-bottoms-up-carry-press` | shoulders | no | pushup_plus_control (1), sleeper_stretch_ir (0.5) |
| `shoulder-serratus-wall-slides` | shoulders | yes | pushup_plus_control (2), wall_overhead_reach (1) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise volume: sets, reps or hold time. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `shoulder-thoracic-extension` | 1 | Shoulder: Thoracic Extension Over Foam Roller | Int/Adv | 1×10 reps → 2×10 reps → 3×10 reps | Pool rows: thoracic extension over a foam roller or a chair back. Steps add sets. |
|  |  | Neck: Thoracic Extension Over Chair Back | Basic | 1×10 reps → 2×10 reps → 3×10 reps |  |
| `shoulder-thoracic-extension` | 2 | Mobility: Open Book Thoracic Rotation | Basic | 1×8 reps → 2×8 reps → 2×10 reps | Rotation added to extension: open book and thread the needle. |
|  |  | Thread the Needle | Basic | 1×6 reps → 2×6 reps → 2×8 reps |  |
| `shoulder-wall-slides` | 1 | Shoulder: Wall Slide | Basic | 1×12 reps → 2×12 reps → 3×12 reps | Pool row: wall slide. |
| `shoulder-wall-slides` | 2 | Shoulder: Wall Slide with Lift-Off *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Lift-off at the top: active control at full elevation. |
| `shoulder-band-pull-aparts` | 1 | Shoulder: Band Pull-Apart | Int/Adv | 1×20 reps → 2×20 reps → 3×20 reps | Pool rows: band pull-apart, or the prone retraction hold without a band. |
|  |  | Shoulder: Prone Scapular Retraction Hold | Basic | 2×10s → 3×10s → 3×15s |  |
| `shoulder-band-pull-aparts` | 2 | Shoulder: Prone Swimmer *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Full-arc lower trapezius and cuff work: prone swimmers, or Y-T-W raises with dumbbells. |
|  |  | Y-T-W Raises | Int/Adv | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `shoulder-passive-hang` | 1 | Shoulder: Passive Hang | Int/Adv | 1×30s → 2×30s → 3×30s | Pool rows: passive hang, or the wall stretch without a bar. Hold capped well under 240 s. |
|  |  | Shoulder: Wall Overhead Hip-Hinge Stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `shoulder-passive-hang` | 2 | Shoulder: Active Scapular Hang | Int/Adv | 2×20s → 3×20s → 3×30s | Active overhead range: the active scapular hang (pool rank 2), or the wall-facing lift-off. |
|  |  | Shoulder: Wall-Facing Overhead Lift-Off *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `shoulder-overhead-press-full-range` | 1 | Shoulder: Full-Range Dumbbell Overhead Press | Int/Adv | 2×8 reps → 3×8 reps → 3×10 reps | Pool rows: full-range dumbbell press, or the pike push-up. |
|  |  | Shoulder: Pike Push-Up | Basic | 2×6 reps → 3×6 reps → 3×8 reps |  |
| `shoulder-overhead-press-full-range` | 2 | Shoulder: Elevated Pike Push-Up *(new)* | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Feet raised: more body weight through the overhead line. |
| `shoulder-scapular-raises` | 1 | Shoulder: Prone T Raise | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Pool rows T and W: the shorter-lever raises come first. |
|  |  | Shoulder: Prone W Raise | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `shoulder-scapular-raises` | 2 | Shoulder: Prone Y Raise | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Pool row Y: the longest lever and hardest of the three; dumbbell Y-T-W as the loaded alternate. |
|  |  | Y-T-W Raises | Int/Adv | 2×8 reps → 3×8 reps |  |
| `shoulder-external-rotation-90` | 1 | Shoulder: Banded External Rotation at 90 Abduction | Int/Adv | 2×12 reps → 3×12 reps → 3×15 reps | Pool rows: banded external rotation at 90°, or the wall slide with rotation. |
|  |  | Wall Slide with External Rotation | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `shoulder-external-rotation-90` | 2 | Shoulder: Prone 90/90 External Rotation *(new)* | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Against gravity at 90/90, the test position. |
| `shoulder-face-pulls` | 1 | Shoulder: Face Pull | Int/Adv | 2×15 reps → 3×15 reps → 3×20 reps | Pool rows: band face pull, or the prone W raise. |
|  |  | Shoulder: Prone W Raise | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `shoulder-face-pulls` | 2 | Face Pull | Int/Adv | 2×12 reps → 3×12 reps → 3×15 reps | Heavier pulling: cable face pull in a gym, or the towel doorway row at home. |
|  |  | Neck: Towel Doorway Row | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `shoulder-bottoms-up-carry-press` | 1 | Shoulder: Bottoms-Up Kettlebell Carry | Int/Adv | 2×20s → 3×20s → 3×30s | Pool rows: bottoms-up carry, or shoulder taps in a plank. |
|  |  | Plank with Shoulder Taps | Basic | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `shoulder-bottoms-up-carry-press` | 2 | Shoulder: Bottoms-Up Kettlebell Press | Int/Adv | 2×6 reps → 3×6 reps → 3×8 reps | Pool row: bottoms-up press; push-up to single-arm reach as the bodyweight alternate. |
|  |  | Push-Up to Single-Arm Reach | Basic | 2×5 reps → 3×5 reps → 3×6 reps |  |
| `shoulder-serratus-wall-slides` | 1 | Shoulder: Serratus Wall Slide with Band | Int/Adv | 2×12 reps → 3×12 reps → 3×15 reps | Pool rows: serratus wall slide with a band, or plain scapular wall slides. |
|  |  | Scapular Wall Slides | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `shoulder-serratus-wall-slides` | 2 | Shoulder: Push-Up Plus *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Push-up plus: serratus work under body weight, the test movement itself. |

## New exercises used here

- **Shoulder: Wall Slide with Lift-Off** (strength, grade B, wall): Lifting the hands off the wall at the top of the slide makes the lower trapezius work at full elevation, the active end-range step after plain wall slides.
- **Shoulder: Prone Swimmer** (strength, grade B, no equipment): Sweeping the arms from overhead to the lower back while lying face down works the lower trapezius and rotator cuff through the whole arc, a harder bodyweight step than pull-aparts.
- **Shoulder: Wall-Facing Overhead Lift-Off** (strength, grade B, wall): Holding full overhead reach with no support turns passive range from hangs and stretches into active range, which the overhead reach test needs.
- **Shoulder: Elevated Pike Push-Up** (strength, grade B, step): Raising the feet shifts more body weight onto the shoulders in the overhead pressing line, the standard next step after the floor pike push-up.
- **Shoulder: Prone 90/90 External Rotation** (strength, grade B, no equipment): Rotating the forearm up against gravity with the arm at 90 degrees trains the rotator cuff in the exact position of the external rotation test, with no band.
- **Shoulder: Push-Up Plus** (strength, grade B, no equipment): The extra push at the top of a push-up is one of the strongest serratus anterior activators, and it trains the shoulder-blade control the push-up plus test checks.
