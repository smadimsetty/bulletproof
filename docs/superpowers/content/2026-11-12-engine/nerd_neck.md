# Nerd Neck (`nerd_neck`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `ccf_endurance_hold` | 30 | 5 | — (not symmetry) | DEFAULT — clinical judgment (target_description: most people start "well under 30s") | DEFAULT — clinical judgment |
| `forward_head_wall_gap` | 0 | 1 | — (not symmetry) | DEFAULT — clinical judgment (back of head touching the wall) | DEFAULT — clinical judgment |
| `cervical_rotation_rom` | 80 | 7 | — (not symmetry) | target_description "~80 degrees each side" | DEFAULT — clinical judgment (eyeballed/app angle error ~5–10°) |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `neck-craniocervical-flexion` | neck | yes | ccf_endurance_hold (2), forward_head_wall_gap (1) |
| `neck-rotation-rom` | neck | yes | cervical_rotation_rom (2) |
| `neck-upper-trap-levator-stretch` | neck | yes | cervical_rotation_rom (1.5) |
| `neck-thoracic-extension` | thoracic_spine | yes | forward_head_wall_gap (2), cervical_rotation_rom (0.5) |
| `neck-isometric-holds` | neck | no | ccf_endurance_hold (1), cervical_rotation_rom (0.5) |
| `neck-prone-extension` | neck | no | forward_head_wall_gap (1), ccf_endurance_hold (0.5) |
| `neck-face-pulls-pullaparts` | shoulders | no | forward_head_wall_gap (1) |
| `neck-farmers-carry` | neck | no | forward_head_wall_gap (0.5) |
| `neck-rows` | shoulders | no | forward_head_wall_gap (1) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise volume: sets, reps or hold time. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `neck-craniocervical-flexion` | 1 | Neck: Craniocervical Flexion Hold | Basic | 6×10s → 8×10s → 10×10s | Pool row: low-load craniocervical flexion; steps add holds up to the pool's 10. Wall chin tucks as the alternate. |
|  |  | Wall-Supported Chin Tuck | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `neck-craniocervical-flexion` | 2 | Neck: Chin Tuck Head Lift Hold *(new)* | Basic | 3×10s → 5×10s → 5×15s | Head lifted: the deep neck flexor endurance test position. |
| `neck-rotation-rom` | 1 | Neck: Cervical Rotation, Slow Full Range | Basic | 1×10 reps → 2×10 reps → 3×10 reps | Pool row: slow full-range rotation; rotation stretch as the alternate. |
|  |  | Neck Rotation Stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `neck-rotation-rom` | 2 | Neck: Contract-Relax Rotation Stretch *(new)* | Basic | 1×3 reps → 2×3 reps → 2×5 reps | Contract-relax: active push before each new end range. |
| `neck-upper-trap-levator-stretch` | 1 | Neck: Upper Trapezius and Levator Stretch | Basic | 1×30s → 2×30s → 2×45s | Pool row: upper trap and levator stretch; the library levator stretch as the alternate. Hold capped well under 240 s. |
|  |  | Levator scapulae stretch | Basic | 1×30s → 2×30s → 2×45s |  |
| `neck-upper-trap-levator-stretch` | 2 | Neck: Contract-Relax Upper Trapezius Stretch *(new)* | Basic | 1×3 reps → 2×3 reps → 2×5 reps | Contract-relax version once static hold time stops paying off. |
| `neck-thoracic-extension` | 1 | Neck: Thoracic Extension Over Chair Back | Basic | 1×10 reps → 2×10 reps → 3×10 reps | Pool row: thoracic extension over a chair back; cat-cow as the alternate. |
|  |  | Cat-Cow | Basic | 1×10 reps → 2×10 reps → 2×12 reps |  |
| `neck-thoracic-extension` | 2 | Prone Neck Retraction with Extension | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Extension against gravity with the chin tucked, or over a foam roller. |
|  |  | Thoracic extension on foam roller | Int/Adv | 1×10 reps → 2×10 reps → 3×10 reps |  |
| `neck-isometric-holds` | 1 | Neck: Four-Direction Isometric Neck Hold | Basic | 3×10s → 4×10s → 5×10s | Pool row: four-direction isometric holds. Steps add rounds up to the pool's 5. |
| `neck-isometric-holds` | 2 | Neck: Side-Lying Lateral Neck Raise *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Strength through range: side-lying neck raises. |
| `neck-prone-extension` | 1 | Neck: Prone Neck Extension | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Pool row: prone neck extension. |
| `neck-prone-extension` | 2 | Neck: Prone Cobra with Chin Tuck *(new)* | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Head and chest together: prone cobra with a chin tuck. |
| `neck-face-pulls-pullaparts` | 1 | Shoulder: Face Pull | Int/Adv | 2×15 reps → 3×15 reps → 3×20 reps | Pool rows: face pull, band pull-apart, or the prone retraction hold. |
|  |  | Shoulder: Band Pull-Apart | Int/Adv | 1×20 reps → 2×20 reps → 3×20 reps |  |
|  |  | Shoulder: Prone Scapular Retraction Hold | Basic | 2×10s → 3×10s → 3×15s |  |
| `neck-face-pulls-pullaparts` | 2 | Shoulder: Prone T Raise | Basic | 2×10 reps → 3×10 reps → 3×12 reps | Longer lever: prone T raise, or dumbbell Y-T-W. |
|  |  | Y-T-W Raises | Int/Adv | 2×8 reps → 3×8 reps |  |
| `neck-farmers-carry` | 1 | Neck: Farmer's Carry | Int/Adv | 2×30m → 3×30m → 3×40m | Pool rows: farmer's carry, or the forearm plank pushing the floor away. |
|  |  | Neck: Forearm Plank, Shoulders Pushed Away | Basic | 2×20s → 3×20s → 3×30s |  |
| `neck-farmers-carry` | 2 | Plank with Shoulder Taps | Basic | 2×8 reps → 3×8 reps → 3×10 reps | Single-arm demand: shoulder taps, or the bottoms-up kettlebell carry. |
|  |  | Shoulder: Bottoms-Up Kettlebell Carry | Int/Adv | 2×20s → 3×20s |  |
| `neck-rows` | 1 | Neck: Dumbbell Row | Int/Adv | 2×10 reps → 3×10 reps → 3×12 reps | Pool rows: dumbbell row, or the towel doorway row. |
|  |  | Neck: Towel Doorway Row | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `neck-rows` | 2 | Neck: Single-Arm Towel Doorway Row *(new)* | Basic | 2×8 reps → 3×8 reps → 3×10 reps | One arm at a time on the towel row. |

## New exercises used here

- **Neck: Chin Tuck Head Lift Hold** (strength, grade B, no equipment): Lifting the tucked head just off the floor is the deep neck flexor endurance test position. Holding it is the loaded step after low-load craniocervical flexion.
- **Neck: Contract-Relax Rotation Stretch** (mobility_stretch, grade B, no equipment): Contract-relax (PNF) stretching adds range faster than static holds. A gentle 5-second push into the hand before each new end range is the active step after slow rotations.
- **Neck: Contract-Relax Upper Trapezius Stretch** (mobility_stretch, grade C, no equipment): The same contract-relax method applied to the side-bend stretch. A short push against the hand before each deeper hold is the active step after plain upper trap and levator holds.
- **Neck: Side-Lying Lateral Neck Raise** (strength, grade B, no equipment): Lifting the head against gravity while lying on the side moves four-direction isometric work into strength through range. It belongs to the upper-quarter strengthening family with the best evidence for neck pain.
- **Neck: Prone Cobra with Chin Tuck** (strength, grade B, no equipment): Lifting the head and chest together with the chin tucked loads the neck and upper-back extensors as one chain, the step after head-only prone extension.
- **Neck: Single-Arm Towel Doorway Row** (strength, grade C, towel, doorway): Pulling with one arm doubles the load on each side of the upper back compared with the two-arm towel row, and adds an anti-rotation demand.
