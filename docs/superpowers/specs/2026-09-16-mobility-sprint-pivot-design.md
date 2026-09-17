# Mobility sprint pivot — design spec

This is the design reference for the product pivot agreed with Sohan on
2026-09-16: from the Oura-driven daily lift/pickleball/run recommender to a
biomechanics/PT-assistant app centered on four pain points (Ankles, Rounded
Shoulders, Nerd Neck, Anterior Pelvic Tilt), each solved via a 2-week,
assessment-bookended "sprint" of short daily mobility routines. Content is
seeded from "The Mobility Bible" PDF Sohan supplied (evidence-graded A–D,
compiled August 2026 for Sohan specifically — chapters on Ankle, Hip,
Hamstring, Lumbar Spine, Shoulder, Cervical Spine), synthesized with standard
PT screening practice where the book has gaps (see §4).

This spec assumes and does not re-litigate the existing v2 architecture
described in `CLAUDE.md` and `docs/superpowers/specs/2026-06-23-schema-v2-design.md`
— multi-user Supabase + RLS, Expo/React Native mobile app with Home/Trends/Settings
tabs, the `exercises` catalog table. It reuses that foundation rather than
starting over.

## Goals

- Let a user pick exactly one of 4 pain points, take a baseline assessment,
  run a 14-calendar-day sprint of ~10-minute daily mobility routines, then
  reassess and see before/after progress.
- Reuse existing infra (Supabase, RLS patterns, auth, the `exercises` table,
  the Expo app shell) rather than rebuilding it.
- Keep the exercise-selection logic simple and deterministic now, in a shape
  that can grow into something smarter later without a data-model rewrite.

## Non-goals (explicitly out of scope for this MVP)

- Gamification/streaks/badges beyond a plain completion log.
- Equipment/location filtering (gym vs. home vs. bands vs. no-equipment).
- Running more than one sprint at a time.
- Wiring sprint data into the Trends tab.
- Tier 3 (reactive/plyometric/sport-specific) content — doesn't fit a fixed
  10-minute daily budget or a first pass, and its book-defined entry criteria
  (pass a test battery first) don't fit a fixed 14-day calendar sprint.
- Touching the old recommendation engine, its cron, or Oura integration.

## 1. Disposition of existing features

| Feature | Disposition |
|---|---|
| Home tab (`apps/mobile/app/(tabs)/index.tsx`) | Fully rebuilt — becomes the pain-point picker / sprint flow. |
| Trends tab | Kept as-is, untouched, not wired to sprint data. |
| Settings tab | Kept as-is, untouched. |
| Logger (`app/logger/[blockId].tsx`, `app/logger/adhoc/[sessionId].tsx`, the active-session banner, "+ New workout" entry points) | **Removed.** Delete the routes and their entry points from Home. Underlying tables (`sessions`, `exercise_logs`, `recommendation_blocks`, etc.) are left in the DB untouched since `engine/` may still write to them. |
| `engine/` (Oura pull, Claude program builder, `scoring.py`, `swap_activity.py`) | **Left running, dormant.** `daily-cron.yml` keeps firing on its existing schedule; nothing in the new app reads its output. Not disabled, not deleted. Revisit later if it's worth retiring outright. |
| Public web dashboard (`apps/web`) | Untouched. Still reads `recommendations_public`, which the dormant engine keeps populating. Out of scope for this pivot. |

## 2. Data model

All new tables follow the existing conventions exactly: personal tables get
`owner_id uuid references auth.users not null default auth.uid()` with real
`owner_id = auth.uid()` RLS policies; global/shared tables get an
**`authenticated_read_*`** policy from day one (the schema-v2 postmortem in
`CLAUDE.md` is explicit that a missing authenticated-read policy on a
global table — not just an `anon` one — is exactly what caused the
"Unknown exercise" production bug; every new global table below must not
repeat that).

### 2.1 Global/shared (read-only to authenticated users)

- **`pain_points`** — `id`, `slug` (`ankle` / `rounded_shoulders` / `nerd_neck`
  / `anterior_pelvic_tilt`), `display_name`, `description`, `sort_order`.
  Same shape as `split_taxonomy`/`activity_taxonomy`. Room to add more pain
  points later without a schema change.
- **`exercises`** — reused as-is, plus one new nullable column:
  `evidence_grade text check (evidence_grade in ('A','B','C','D'))`. The
  existing `body_parts[]`, `exercise_type`, `equipment_needed[]`,
  `evidence_rationale`, `unilateral`, `is_corrective` columns are reused
  unchanged. (Implementation note: check `movement_pattern`'s existing
  constraint — `squat/hinge/push/pull/core/mobility/balance` — covers new
  content fine via `mobility`/`balance`; flag during content authoring if a
  new pattern value turns out to be genuinely needed.)
- **`sprint_exercise_pool`** — the swappable pool: `pain_point_id`,
  `tier` (1 or 2 for this MVP), `slot_key` (e.g. `ankle-balance`,
  `neck-craniocervical-flexion` — see §4 for the concrete slot list per pain
  point), `exercise_id`, `default_rank` (tie-break order used the first time
  a user hits this slot, before any history exists), `prescribed_sets`,
  `prescribed_reps_or_duration` (free text, same "don't parse it" lesson as
  `recommendation_block_exercises.prescribed_reps`).
- **`sprint_day_template`** — the fixed 14-day skeleton per pain point:
  `pain_point_id`, `day_number` (1–14), `slot_key`, `tier`, `order`. Tier-1
  slots appear on all 14 rows for their pain point; Tier-2 slots appear on a
  roughly-every-other-day cadence (see §4) so total daily time stays ~10
  minutes (Tier 1 ~5 min + one Tier 2 item ~5 min).
- **`assessment_definitions`** — the test battery per pain point: `pain_point_id`,
  `test_key`, `name`, `instructions`, `unit`, `target_description`,
  `better_direction` (`lower` / `higher` / `symmetry`), `is_bilateral`
  (left/right vs. single value), `sort_order`, `is_synthesized` (true for the
  Nerd Neck and Anterior Pelvic Tilt tests not sourced directly from the
  book — surfaced honestly in the UI per the decision in §4).

### 2.2 Personal (owner-scoped RLS)

- **`sprints`** — `owner_id`, `pain_point_id`, `cycle_number` (display-only
  counter: how many sprints, of any status, this owner has started for this
  pain point, +1 — not load-bearing for variety, which comes from the LRU
  picker in §3, not from this number), `started_on date`, `status` (
  `pending_baseline` / `active` / `pending_reassessment` / `completed` /
  `abandoned`). A partial unique index enforces **at most one row per
  `owner_id`** with `status in ('pending_baseline','active','pending_reassessment')`
  — i.e. at most one in-flight sprint, mirroring the existing
  one-open-`sessions`-row pattern.
- **`sprint_days`** — `sprint_id`, `day_number` (1–14), `date` (
  `started_on + day_number - 1`, calendar-fixed per §5 decision — a missed
  day is just missed, reassessment still lands on day 15), `completed_at`.
- **`sprint_day_exercises`** — the resolved, per-user instance of a slot for
  that day: `sprint_day_id`, `slot_key`, `tier`, `exercise_id` (the resolved
  choice), `prescribed_sets`, `prescribed_reps_or_duration`, `order`,
  `swapped_from_exercise_id` (nullable, same audit-trail pattern as
  `recommendation_block_exercises`), `completed_at` (per-exercise checkbox).
- **`sprint_day_feedback`** — `sprint_day_id`, `reaction` (`good` / `neutral`
  / `hurt`), `note` (optional free text).
- **`sprint_assessments`** — `sprint_id`, `phase` (`baseline` /
  `reassessment`), `completed_at`.
- **`sprint_assessment_results`** — `sprint_assessment_id`, `test_key`,
  `value_left`, `value_right` (nullable — populated only when
  `assessment_definitions.is_bilateral`), `value_single` (nullable,
  populated only when not bilateral), `notes`.

## 3. Exercise selection & swap logic

For every `slot_key` a day's template calls for: pick the exercise from that
slot's `sprint_exercise_pool` the user has completed **least recently**
(furthest-back `completed_at` across their `sprint_day_exercises` history for
that `exercise_id`, nulls/never-done first), falling back to `default_rank`
the first time through. This is the entire algorithm — no ML, no LLM, ~20
lines, consistent with the project's existing "rules-based engine first"
principle.

This single rule satisfies all three of Sohan's requirements from the
brainstorm:
- **Swappable**: the user can manually pick any other exercise tagged for
  that slot at any time; recorded via `swapped_from_exercise_id`.
- **Sprints differ from each other**: a second "Ankles" sprint naturally
  avoids repeating the first sprint's exercises, because recency is tracked
  per-user across all sprints of that pain point, not reset per-sprint —
  **provided the slot's pool has more than one candidate**. This only holds
  as strongly as the pool is populated: §4's slot design deliberately draws
  on the book's own stated progressions/variants (e.g. the ankle-balance
  slot legitimately holds 3 candidates — floor, folded towel/cushion, added
  head turns or ball-catch — because the book itself describes these as
  interchangeable difficulty steps for the same purpose) so pools have real
  depth where the source material supports it. A handful of slots (mostly
  in the synthesized Nerd Neck/APT content, and any slot where the book
  names exactly one canonical exercise with no stated variant) will have
  only one pool member at MVP launch — for those, a repeat sprint will
  correctly reuse the same exercise, since there's genuinely nothing else to
  rotate to yet. That's an honest content-thinness limitation, not a picker
  bug, and it's a natural place to grow the pool later without touching the
  algorithm.
- **Pivotable to a fancier engine later**: swapping the picker function for
  something smarter doesn't touch the data model — `sprint_exercise_pool` and
  `sprint_day_template` are already the "engine's" inputs.

## 4. Content per pain point

Concrete slot lists to seed `sprint_exercise_pool` and `sprint_day_template`
against, and each pain point's assessment battery. Exact rep/hold dosage per
slot is finalized during content authoring in the implementation plan, using
the book's own Tier 1/Tier 2 prescriptions (§4.6/§5.5/§6.4/§8.5 of the PDF)
as the source for Ankle and Rounded Shoulders. Per §3's caveat, wherever the
book itself describes a progression or interchangeable variant for an
exercise (e.g. single-leg balance progressing floor → unstable surface →
added head turns/ball-catch; Y/T/W raises as three variants of one prone
raise; extended vs. bent-knee calf raise for gastroc vs. soleus bias),
content authoring should seed those as separate pool members under the same
slot rather than collapsing them to one row — that's what gives the §3 LRU
picker something real to rotate between.

**Ankles** (Ch. 4, direct from the book):
- Tier 1 slots: `ankle-mobilization` (banded knee-to-wall), `ankle-balance`
  (single-leg eyes-closed), `ankle-calf-endurance` (single-leg heel raises /
  toe-heel walks).
- Tier 2 slots: `ankle-eversion-strength`, `ankle-inversion-dorsiflexion-strength`,
  `ankle-calf-strength-loaded` (weighted single-leg calf raise),
  `ankle-tibialis-strength`, `ankle-balance-unstable` (wobble board/foam
  pad), `ankle-hip-strength` (hip abduction/ER), `ankle-squat-hold`.
- Assessment (§4.4, all 6, bilateral): weight-bearing lunge (knee-to-wall),
  single-leg heel raise capacity, single-leg balance eyes closed, Y-balance
  anterior reach, side hop test, single-leg hop for distance.

**Rounded Shoulders** (Ch. 8, direct from the book, framed around scapular/
thoracic capacity rather than alignment per the earlier framing decision):
- Tier 1 slots: `shoulder-thoracic-extension` (foam roller),
  `shoulder-wall-slides`, `shoulder-band-pull-aparts`, `shoulder-passive-hang`.
- Tier 2 slots: `shoulder-overhead-press-full-range`,
  `shoulder-scapular-raises` (Y/T/W), `shoulder-external-rotation-90`,
  `shoulder-face-pulls`, `shoulder-bottoms-up-carry-press`,
  `shoulder-serratus-wall-slides`.
- Assessment (§8.3, 5 tests): wall slide/overhead reach, Apley scratch,
  supine external rotation at 90°, sleeper stretch position (internal
  rotation), push-up plus/scapular control.

**Nerd Neck** (Ch. 9 exercises direct; assessment synthesized — flagged
`is_synthesized: true`, surfaced honestly in-app):
- Tier 1 slots: `neck-craniocervical-flexion` (chin tucks/CCF holds),
  `neck-rotation-rom`, `neck-upper-trap-levator-stretch`,
  `neck-thoracic-extension`.
- Tier 2 slots: `neck-isometric-holds` (4-direction), `neck-prone-extension`,
  `neck-face-pulls-pullaparts`, `neck-farmers-carry`, `neck-rows`.
- Assessment (synthesized, standard PT screens): craniocervical flexion
  endurance hold (seconds, single value), forward-head posture screen
  (wall/occiput test — gap in cm, single value), cervical rotation ROM
  (degrees, bilateral).

**Anterior Pelvic Tilt** (Thomas test reused from Ch. 5; other assessment
items synthesized — flagged `is_synthesized: true`; exercises drawn from
Ch. 5 hip work + Ch. 7 anterior-core/hip-hinge work):
- Tier 1 slots: `apt-hip-flexor-stretch` (couch stretch), `apt-glute-bridge`
  (single-leg glute bridge), `apt-deep-squat-hold`, `apt-anterior-core`
  (dead bug / modified curl-up).
- Tier 2 slots: `apt-loaded-hip-hinge` (RDL), `apt-split-squat` (Bulgarian
  split squat), `apt-loaded-carry` (farmer's/suitcase), `apt-mcgill-big-three`
  (side plank, bird dog).
- Assessment: Thomas test (§5.3, bilateral, thigh angle vs. horizontal),
  standing lateral pelvic tilt (synthesized, qualitative/photo-based, single
  value), anterior core endurance (synthesized, hold-time seconds, single
  value), single-leg glute bridge hold (reused from §5.3, bilateral,
  seconds).

## 5. Sprint lifecycle & screens

Home renders exactly one of three states based on the user's current sprint
(or lack of one):

1. **No in-flight sprint** → 4-card pain-point picker → tap a card →
   assessment intro screen (instructions per test) → user enters baseline
   values → on submit, `sprints` row transitions `pending_baseline` → `active`,
   `sprint_days`/`sprint_day_exercises` for all 14 days get generated via the
   §3 picker.
2. **Active sprint** → today's Day N checklist: each exercise from
   `sprint_day_exercises` shown with a checkbox, a swap icon (opens the
   slot's pool minus the current pick), running toward the ~10-minute budget.
   A "Complete Day" button marks the day `completed_at` (checking remaining
   boxes isn't required to finish) and immediately prompts the quick
   reaction (good/neutral/hurt) + optional note, written to
   `sprint_day_feedback`.
3. **Day 14 reached, reassessment pending** (`status = 'pending_reassessment'`)
   → persistent reassessment prompt on Home → same assessment form as
   baseline → on submit, `sprints.status → 'completed'`, show a before/after
   summary screen (per-test baseline vs. reassessment, direction-aware per
   `better_direction`) → back to the 4-card picker, any pain point selectable
   including the one just finished.

The active-sprint screen (state 2) also carries a low-key "Switch pain
point" action (not a primary button — a menu/overflow item, since abandoning
progress shouldn't be one accidental tap away) that sets `sprints.status →
'abandoned'` and returns to the picker immediately, no confirmation-of-loss
screen beyond a plain "you'll lose this sprint's progress" confirm dialog.
This is the only way to reach `abandoned`, and it exists because the partial
unique index otherwise locks a user into one in-flight sprint for the full
14+ days with no way out if they change their mind.

**Sprint pacing is calendar-based**: `sprint_days.date = started_on + day_number - 1`,
fixed regardless of completion. Missing a day just means that day's
`completed_at` stays null; day 15 still triggers reassessment. This was
chosen over completion-based pacing for simplicity — no makeup-day logic, no
open-ended sprint length — and matches how the book itself frames its
protocols in weeks, not sessions.

## 6. Testing approach

Follow the existing convention exactly: pure logic in `apps/mobile/lib/*.ts`
with a co-located `*.test.ts` (see `swapOptions.ts`/`swapOptions.test.ts` for
the closest existing precedent — this is functionally a simpler cousin of
that same LRU-ish ranking idea). New pure functions to unit test:

- The §3 LRU exercise picker.
- Day-template resolution (given day_number + pain_point, return the slot
  list).
- `sprints.status` transition logic (`pending_baseline` → `active` →
  `pending_reassessment` → `completed`, plus `abandoned`).
- `cycle_number` computation.
- Assessment result validation (bilateral vs. single-value shape, per
  `better_direction`).

Any new Supabase migration follows the existing mandatory workflow (`CLAUDE.md`
"Supabase migrations are never auto-applied" section) — `migration list --linked`
before `db push --linked`, never assume the remote is caught up.

## 7. Open items for the implementation plan (not blocking this spec)

- Exact rep/hold dosage per Tier-2 slot for Nerd Neck and APT (synthesized
  content) — reasonable, book-consistent defaults get chosen during content
  authoring.
- Exact day-by-day Tier-2 rotation cadence (which of the ~6 Tier-2 slots per
  pain point lands on which of the 14 days) — a sensible default rotation
  gets authored per pain point, not hashed out here.
- Whether `movement_pattern`'s existing check constraint needs a new value
  for any new exercise row — check during content seeding, extend the
  constraint if genuinely needed.
