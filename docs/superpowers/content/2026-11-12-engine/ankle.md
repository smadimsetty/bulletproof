# Ankle (`ankle`) — engine content

Generated from `gen_engine_content.mjs` (edit the data there, then re-run). Migration: `supabase/migrations/20261112130000_adaptive_engine_content.sql`.
Every number without a source is marked **DEFAULT — clinical judgment**. Stretch steps stay at or under 240 s of hold per side ([Ingram et al., Sports Med](https://pubmed.ncbi.nlm.nih.gov/39614059/)).

## Tests

| Test | Target | Noise | Raw direction | Target source | Noise source |
|---|---|---|---|---|---|
| `knee_to_wall` | 10 | 1.5 | higher | target_description "9-12 cm" → 10 | target_description "~1.5 cm"; [Physiopedia WBLT](https://www.physio-pedia.com/Weight-bearing_Lunge_Test); [PMC3362988](https://pmc.ncbi.nlm.nih.gov/articles/PMC3362988) (MDC ~1.4–1.9 cm) |
| `heel_raise_capacity` | 25 | 3 | — (not symmetry) | target_description "25+ reps" | DEFAULT — clinical judgment |
| `balance_eyes_closed` | 30 | 5 | — (not symmetry) | target_description "30s" | DEFAULT — clinical judgment |
| `y_balance_anterior` | 60 | 4 | higher | DEFAULT — clinical judgment (typical adult anterior reach) | target_description "asymmetry beyond ~4 cm" |
| `side_hop` | 10 | 1 | lower | DEFAULT — clinical judgment (same value the engine plan uses) | DEFAULT — clinical judgment |
| `hop_for_distance` | 120 | 10 | higher | DEFAULT — clinical judgment (typical adult single-leg hop) | DEFAULT — clinical judgment |

## Slots and links

| Slot | Area | Stretch | Linked tests (weight) |
|---|---|---|---|
| `ankle-mobilization` | ankles | yes | knee_to_wall (2), y_balance_anterior (1) |
| `ankle-balance` | ankles | no | balance_eyes_closed (2) |
| `ankle-calf-endurance` | ankles | no | heel_raise_capacity (2) |
| `ankle-eversion-strength` | ankles | no | side_hop (1.5) |
| `ankle-inversion-dorsiflexion-strength` | ankles | no | side_hop (1) |
| `ankle-calf-strength-loaded` | ankles | no | heel_raise_capacity (1.5), knee_to_wall (0.5), side_hop (1), hop_for_distance (1) |
| `ankle-tibialis-strength` | ankles | no | heel_raise_capacity (0.5) |
| `ankle-balance-unstable` | ankles | no | balance_eyes_closed (1), y_balance_anterior (1.5), hop_for_distance (0.5) |
| `ankle-hip-strength` | hips | no | y_balance_anterior (1), hop_for_distance (1) |
| `ankle-squat-hold` | ankles | yes | knee_to_wall (1) |

Link weights are **DEFAULT — clinical judgment**: 2 = the slot trains what the test measures directly, 1 = a main contributor, 0.5 = a minor contributor.

## Ladders

Steps raise sets first, then reps or hold. Step and dose numbers are **DEFAULT — clinical judgment** unless the level note says they come from the pool. Alternates at a level are listed in alt_rank order.

| Slot | Lvl | Exercise | Tier | Steps | Why this level |
|---|---|---|---|---|---|
| `ankle-mobilization` | 1 | Ankle: Banded Knee-to-Wall Mobilization | Int/Adv | 1×20 reps → 2×20 reps → 3×20 reps | Existing pool rows: the banded and half-kneeling mobilizations. Steps add sets. |
|  |  | Half-Kneeling Ankle Mobilization | Basic | 1×15 reps → 2×15 reps → 3×15 reps |  |
| `ankle-mobilization` | 2 | Ankle: Standing Knee-to-Wall Rock with Hold *(new)* | Basic | 2×10 reps → 3×10 reps | Full body weight on the ankle with an end-range hold, then a light plate for load. |
|  |  | Weighted Ankle Dorsiflexion Mobilization | Int/Adv | 2×10 reps → 3×10 reps |  |
| `ankle-balance` | 1 | Ankle: Single-Leg Balance, Eyes Closed (Floor) | Basic | 2×30s → 3×30s → 3×45s | Floor, eyes closed (pool rank 1). Sets, then hold time. |
| `ankle-balance` | 2 | Ankle: Single-Leg Balance, Eyes Closed (Foam Pad) | Int/Adv | 2×30s → 3×30s → 3×45s | Unstable surface: foam pad and head turns from the pool, a folded towel when there is no pad. |
|  |  | Ankle: Single-Leg Balance with Head Turns | Int/Adv | 2×30s → 3×30s |  |
|  |  | Ankle: Single-Leg Balance on Folded Towel, Eyes Closed *(new)* | Basic | 2×30s → 3×30s → 3×45s |  |
| `ankle-calf-endurance` | 1 | Ankle: Single-Leg Heel Raises | Basic | 2×12 reps → 2×15 reps → 3×15 reps | Pool rows. Heel-raise reps climb toward the 25-rep target. |
|  |  | Ankle: Toe and Heel Walks | Basic | 1×20m → 2×20m → 3×20m |  |
| `ankle-calf-endurance` | 2 | Calf Raise on Step (eyes closed) | Basic | 2×10 reps → 3×10 reps → 3×15 reps | Full range off a step with eyes closed: more range and a balance demand on the same muscle. |
| `ankle-eversion-strength` | 1 | Ankle: Banded Eversion | Int/Adv | 2×15 reps → 3×15 reps → 3×20 reps | Pool rows: banded eversion and the outer-edge walk. |
|  |  | Ankle: Outer-Edge Foot Walk | Basic | 2×10m → 3×10m → 3×15m |  |
| `ankle-eversion-strength` | 2 | Ankle: Lateral Hop to Stick *(new)* | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Reactive eversion: hop and stick, the fast version of the same job. |
| `ankle-inversion-dorsiflexion-strength` | 1 | Ankle: Banded Inversion and Dorsiflexion | Int/Adv | 2×15 reps → 3×15 reps → 3×20 reps | Pool rows: banded inversion/dorsiflexion and toe-and-heel walks. |
|  |  | Ankle: Toe and Heel Walks | Basic | 1×20m → 2×20m → 3×20m |  |
| `ankle-inversion-dorsiflexion-strength` | 2 | Ankle: Heel Walk, Toes Turned In *(new)* | Basic | 2×20m → 3×20m → 3×30m | Heel walk with toes in: body-weight load on the same shin muscles for longer. |
| `ankle-calf-strength-loaded` | 1 | Ankle: Weighted Single-Leg Calf Raise (Straight-Knee) | Int/Adv | 3×8 reps → 4×8 reps → 4×12 reps | Pool rows: weighted straight- and bent-knee raises, and the slow bodyweight raise on a step. |
|  |  | Ankle: Weighted Single-Leg Calf Raise (Bent-Knee) | Int/Adv | 3×8 reps → 4×8 reps → 4×12 reps |  |
|  |  | Ankle: Slow Single-Leg Calf Raise on Step | Basic | 2×10 reps → 3×10 reps → 3×12 reps |  |
| `ankle-calf-strength-loaded` | 2 | Ankle: Single-Leg Pogo Hops *(new)* | Basic | 2×10 reps → 3×10 reps → 3×15 reps | Strength to spring: single-leg pogo hops. |
| `ankle-tibialis-strength` | 1 | Ankle: Wall Tibialis Raise | Basic | 2×15 reps → 3×15 reps → 3×20 reps | Pool row: two-leg wall tibialis raise. |
| `ankle-tibialis-strength` | 2 | Ankle: Single-Leg Wall Tibialis Raise *(new)* | Basic | 2×10 reps → 3×10 reps → 3×15 reps | One leg at a time doubles the load. |
| `ankle-balance-unstable` | 1 | Ankle: Wobble Board Balance | Int/Adv | 2×30s → 3×30s → 3×45s | Pool rows: wobble board and the single-leg reach to a cone. |
|  |  | Single-Leg Deadlift Reach to Cone | Basic | 2×6 reps → 3×6 reps → 3×8 reps |  |
| `ankle-balance-unstable` | 2 | Y-Balance Reach | Basic | 2×3 reps → 3×3 reps → 3×5 reps | Multi-direction reaching (the Y-balance pattern itself), or a loaded reach. |
|  |  | Single-Leg Romanian Deadlift Balance Reach | Int/Adv | 2×8 reps → 3×8 reps → 3×10 reps |  |
| `ankle-hip-strength` | 1 | Ankle: Side-Lying Hip Abduction | Basic | 2×12 reps → 3×12 reps → 3×15 reps | Pool rows: side-lying abduction and the banded lateral walk. |
|  |  | Ankle: Banded Lateral Walk | Int/Adv | 2×10m → 3×10m → 3×15m |  |
| `ankle-hip-strength` | 2 | Ankle: Side Plank with Leg Lift *(new)* | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Abduction in a side plank (body weight), or the monster walk with a band. |
|  |  | Monster Walk | Int/Adv | 2×10m → 3×10m |  |
| `ankle-squat-hold` | 1 | Ankle: Deep Squat Hold | Basic | 2×45s → 2×60s → 3×60s | Pool row: deep squat hold. Steps add sets then time, capped well under 240 s. |
| `ankle-squat-hold` | 2 | Mobility: Cossack Squat Flow | Basic | 2×6 reps → 3×6 reps → 3×8 reps | Active end range: the Cossack squat moves through the same deep ankle and hip angles. |

## New exercises used here

- **Ankle: Standing Knee-to-Wall Rock with Hold** (mobility_stretch, grade B, wall): Full-bodyweight version of the knee-to-wall mobilization. A 5-second end-range pause under load builds on the half-kneeling drill, and weight-bearing dorsiflexion is exactly what the knee-to-wall test measures.
- **Ankle: Single-Leg Balance on Folded Towel, Eyes Closed** (balance, grade A, towel): A thickly folded towel gives an unstable surface like a foam pad, so the eyes-closed progression needs no equipment. Balance training is the best-supported treatment for chronic ankle instability.
- **Ankle: Lateral Hop to Stick** (plyometric, grade B, no equipment): Hop-to-stabilization drills train the fast outer-ankle response that resists the inversion sprain, and they carry over directly to the side hop test.
- **Ankle: Heel Walk, Toes Turned In** (strength, grade C, no equipment): Walking on the heels with the toes turned in loads the muscles at the front and inside of the shin together, the inversion and dorsiflexion strength the banded drill trains, with no equipment.
- **Ankle: Single-Leg Pogo Hops** (plyometric, grade B, no equipment): Short, stiff-ankle hops train the calf and Achilles spring. Reactive work is the usual next step after slow heavy calf strength and is the quality the hop tests depend on.
- **Ankle: Single-Leg Wall Tibialis Raise** (strength, grade B, wall): Doing the wall tibialis raise on one leg doubles the load on the muscle at the front of the shin, the progression once the two-leg version passes 20 easy reps.
- **Ankle: Side Plank with Leg Lift** (strength, grade B, no equipment): Lifting the top leg in a side plank loads the hip abductors at body weight with the trunk braced, a step up from side-lying abduction. Hip strength ranks second only to balance work in ankle-instability rehab.
