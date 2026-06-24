# Bulletproof v2 — Generalized Multi-User Training App (design spec)

This is the canonical design reference for the v2 autonomous build pipeline
(`docs/superpowers/plans/2026-06-23-bulletproof-v2-pipeline.md`). Every
Planner dispatch for every phase reads this file first. It is the repo copy
of the plan approved interactively with Sohan in Plan Mode — see
`docs/superpowers/reports/autonomous-build-log.md` for how it was derived if
that context is ever needed.

## Background

Bulletproof v1 shipped end-to-end: a deterministic Python scoring engine, a
Supabase/Postgres schema, an Expo mobile app (Apple Sign-In, HealthKit
workout sync, single-screen recommendation view), and a public read-only web
dashboard — all narrowly built for one person (Sohan) with one fixed
program. v2 evolves this into a tool "anybody and any user can use," while
remaining Sohan's personal driver first.

## Goals

- User-editable profile inputs (activities, preferred training split,
  chronic pains with severity/notes, goals, training frequency, diet,
  weight/age/location) instead of hardcoded constants.
- An engine that reasons about *which exercises* to prescribe (Claude), not
  just *which session type* (deterministic rules) — with the safety-critical
  gating staying 100% deterministic and un-overridable by the LLM layer.
- A richer, AI-curated exercise database with equipment-variant granularity,
  goal/body-part/corrective tagging, and demo videos.
- A real multi-user data model: `owner_id` + per-user RLS on every table,
  added now, not deferred.
- A 4-screen mobile UI (Home, Logger, Trends, Settings) showing and letting
  the user log a complete day's program — full sets/reps/weight, swappable
  activities/exercises, a Start/End workout flow, free-text daily feedback,
  and a calm/minimal Oura-inspired visual style across all four screens.

## Non-goals (explicitly out of scope for this build)

- An automated, self-updating exercise-research pipeline (the exercise DB
  seed is a one-time, reviewed, AI-assisted pass — Phase 1 only).
- Any auth provider beyond Apple Sign-In.
- New features on the public web dashboard (`apps/web/`) beyond keeping its
  existing contract working against the renamed `session_type` enum.
- Claude making the day's safety-critical gating decision (readiness gate,
  pickleball eligibility, rest/mobility-overdue logic) — that stays
  deterministic in `engine/scoring.py` regardless of how good the LLM
  reasoning gets elsewhere.

## Decisions (resolved interactively with Sohan — do not reopen these)

1. **Exercise selection is an LLM-reasoning layer.** Claude picks the actual
   exercises/sets/reps each day via a structured-output call, grounded in a
   persona system prompt synthesizing four voices: a longevity coach (Bryan
   Johnson/Blueprint), a hypertrophy/physique specialist (Jeff
   Cavaliere/Mike Mentzer), an evidence-based programming voice (Jeff
   Nippard/Andrew Huberman), and a physical-therapist/rehab lens reasoning
   over each `pains` entry's severity/note detail. Named experts are
   internal stylistic grounding only — never name them in user-facing text.
   This is a deliberate override of CLAUDE.md's original "rules first, ML
   later" stance; document it as a v2 addendum in CLAUDE.md, don't silently
   overwrite the v1 rationale.
2. **The deterministic gate can never be bypassed.** `engine/scoring.py`
   keeps the readiness gate, pickleball cooldown/weather/readiness
   eligibility, and rest/mobility-overdue bonuses 100% rules-based. On any
   Claude API failure, fall back to a deterministic minimal program — worst
   case is a stale program, never an unsafe one.
3. **Exercise DB v1 is a curated one-time seed** (~100-200 rows, equipment
   variants as separate rows, demo videos actively sourced, corrective
   coverage for every pain area), reviewed by Sohan before going live as a
   real migration. Not a runtime/scheduled pipeline.
4. **Multi-user data isolation goes in now**: `owner_id` + per-user RLS on
   every per-user table, in the Phase 0 migration itself.
5. **"Auto" training-frequency mode** = drop the user's manual weekly
   targets, fall back to the engine's existing adaptive logic (overdue
   bonuses, pattern rotation, readiness gate). Fully deterministic.
6. **`upper_a`/`upper_b`/`lower_a`/`lower_b` are dropped.** `session_type`
   simplifies to `upper, lower, pickleball, run, rest, mobility`. Day-to-day
   variety comes from Claude's per-day exercise selection and the
   `preferred_split`/`split_taxonomy` rotation, not enum variants.
7. **Full sets/reps/weight logging**, integrated with the day's
   recommendation (the app becomes the logger, not recommend-only).
8. **Preferred training split feeds the engine directly.** A new
   `split_taxonomy` table (upper/lower, push/pull/legs, Arnold, full body,
   user-extensible) drives `recommendation_blocks.split_day_label` and the
   Home screen's swap picker — swapping a split day (e.g. Push → Legs) is
   "an equally optimal workout," not a downgrade, and reruns the
   recommendation for that specific choice via an on-demand Claude call.
9. **User-initiated activity/split-day swap** is a first-class on-demand
   capability (`engine/program_builder.py`'s `build_program_for_activity`),
   separate from the nightly cron path, with a short one-line preview shown
   per option before confirming.
10. **Exercises are editable in the Logger**, not fixed once recommended:
    swap (pre-filtered to the same movement_pattern/body_parts/target_goals)
    or remove any recommended exercise, or add one ad hoc from the catalog.
11. **Explicit Start/End workout flow**: a persistent app-wide banner while
    a session is active, a DB-enforced single-active-session rule, haptic
    feedback on set/checkbox completion, and a completion celebration.
12. **Free-text daily feedback** on the Home screen (separate from the
    Logger's per-session emoji rating) feeds directly into the next day's
    Claude program-builder call and the Trends AI summary.
13. **Visual design direction**: calm, minimal, Oura-inspired across all 4
    screens — soft rounded cards, generous whitespace, muted palette,
    high-contrast legible typography. "Clean and trusting," not loud.
14. **Claude model assignment**: Sonnet 4.6 for the daily program-builder
    call and on-demand swaps (highest-stakes reasoning); Haiku 4.5 for the
    yesterday's-summary blurb and the Trends AI summary (cheap narrative
    compression). See the Cost section below.

## Schema v2 (Phase 0 — full detail)

- **`user_profile`**: add `owner_id`, `activities jsonb`,
  `preferred_split text references split_taxonomy default 'upper_lower'`,
  `current_goals jsonb` (app-enforced max 3 selected), `training_frequency_mode
  text check in ('manual','auto') default 'auto'`, `training_frequency_manual
  jsonb`, `diet_preference text`, `weight_kg numeric(5,2)`, `birth_date date`,
  `location jsonb` (`{lat,lon,label,timezone}`), `healthkit_sync_enabled
  boolean default false`. Rename `injury_constraints` → `pains`, and change
  its shape to a `jsonb` array of `{body_part, severity (1-10), note, since}`
  — not a flat checkbox flag.
- **New `split_taxonomy`**: `id text PK, label text, day_labels text[]
  ordered`. Seed: `upper_lower` (`{upper,lower}`), `push_pull_legs`
  (`{push,pull,legs}`), `arnold` (`{chest_back,shoulders_arms,legs}`),
  `full_body` (`{full_body}`).
- **New `activity_taxonomy`**: `id text PK, label text, category text check
  in ('strength','cardio','recovery'), warmup_focus_body_parts text[]`. Seed
  with Sohan's current activities (`strength_training`→strength;
  `pickleball`,`tennis`,`running`→cardio; `yoga`,`mobility`→recovery) plus
  `walking`→recovery, pre-added to every new profile's activities by default
  (opt-out, not opt-in).
- **New `goal_taxonomy`**: `id text PK, label text, description text`. Seed
  broader than just Sohan's 3 goals (aesthetic physique, mobility/
  flexibility, total-body resilience, strength/power, endurance, longevity/
  recovery) since Settings now presents this as an open dropdown.
- **New `body_part_taxonomy`**: broader than the original 4 pain areas —
  neck, thoracic spine, shoulders, elbows, wrists, lower back, hips,
  hamstrings, knees, ankles, feet. Includes an "Other (describe)" capture
  path for body parts not yet in the taxonomy (service-role review later).
- **`exercises`**: add `exercise_type text check in
  ('strength','mobility_stretch','plyometric','balance','cardio')`,
  `target_goals text[]`, `body_parts text[]`, `evidence_rationale text`,
  `equipment_needed text[]`, `default_sets smallint`, `default_rep_range
  text`, `unilateral boolean default false`, `is_corrective boolean default
  false`. Equipment variants of the same movement (DB/barbell/Smith machine
  press) are separate rows, not one row with an equipment array.
- **`session_type` enum**: simplify to `upper, lower, pickleball, run, rest,
  mobility` (standard Postgres enum-rename migration: create
  `session_type_v2`, `CASE`-map old values, drop old type, rename). Update
  `sessions.type`, `recommendations.top_pick`/`runner_up`, and the
  `recommendations_public` view.
- **`recommendations`**: add `program_generated_by text` ('claude' /
  'fallback_template'), `claude_model text`, `claude_usage jsonb` (all
  service-role-only). New child tables:
  - `recommendation_blocks`: `id, recommendation_id FK, block_order,
    block_type session_type, split_day_label text (nullable), title,
    estimated_minutes`.
  - `recommendation_block_exercises`: `id, block_id FK, exercise_id FK,
    exercise_order, prescribed_sets, prescribed_reps text,
    prescribed_weight_note text, is_unilateral_left_first, notes,
    swapped_from_exercise_id FK->exercises (nullable, audit trail)`.
  Do **not** add public views for the new block tables — the
  `recommendations_public` contract stays exactly `date, top_pick,
  runner_up, public_rationale, generated_at`.
- **New `exercise_logs`**: one row per logged set (strength) or per checkbox
  item (mobility/stretch). Columns: `date, recommendation_block_exercise_id
  (nullable FK), exercise_id FK, block_type session_type, completed,
  set_number, reps_completed, weight_kg, rpe smallint (1-10), logged_at,
  notes`. This becomes the engine's primary recent-history signal.
- **New `daily_feedback`**: `id, owner_id, date, feedback_text, created_at`
  — the Home screen's free-text box, read by the program-builder's volatile
  prompt context.
- **`sessions`**: add `started_at timestamptz`, `ended_at timestamptz`,
  `felt_rating smallint check (felt_rating between 1 and 10)`. Add a partial
  unique index enforcing at most one row per `owner_id` with `ended_at IS
  NULL` at a time (single active session, DB-enforced).
- **Multi-user RLS**: `owner_id uuid references auth.users not null default
  auth.uid()` on every per-user table (`user_profile`, `recovery`,
  `activity`, `sessions`, `recommendations`, `exercise_logs`,
  `daily_feedback`), with real `owner_id = auth.uid()` policies replacing
  today's single-implicit-user policies. `exercises`/`activity_taxonomy`/
  `goal_taxonomy`/`body_part_taxonomy`/`split_taxonomy` stay global/shared
  (read-only to all authenticated users, write via service role only).
- Every new column nullable or defaulted — the existing single Sohan row and
  17-row exercise seed must survive the migration with zero backfill
  blocking deploy.

## Engine v2 architecture (Phase 2 — full detail)

**Stays in `engine/scoring.py`** (deterministic): `CANDIDATES` shrinks to
the 6 simplified types; `WEIGHTS`/`score_candidate()`/`days_since()`/
`recommend()` keep their exact responsibilities, plus a new weather-gate
precondition for pickleball (new external dependency/secret; if the weather
API is down, don't block pickleball, just skip the check that day). Add
`gate_today(...) -> list[session_type]` so a day can legitimately gate more
than one block. Pattern-rotation/same-pattern-penalty logic becomes
parameterized by the user's `preferred_split`'s `split_taxonomy.day_labels`
instead of a hardcoded upper/lower binary.

**New `engine/program_builder.py`**:
1. Assemble the prompt in stable→volatile order (persona system prompt →
   catalog excerpt → profile slice → recent-history summary + last 1-3 days
   of `daily_feedback` → today's gate). See Caching below.
2. Call Claude via `client.messages.parse()` with `output_config.format`:
   `{blocks: [{block_type, title, estimated_minutes, exercises: [{exercise_id,
   sets, reps, weight_note, unilateral_left_first, notes}]}], rationale_internal,
   rationale_public}`. `exercise_id` is constrained to an enum of the actual
   UUIDs offered in that day's catalog excerpt (anti-hallucination).
3. Runtime invariant check: every returned exercise exists and its
   `target_goals`/`body_parts` are consistent with the profile.
4. On any failure: deterministic fallback program filtered by
   `movement_pattern`/`target_goals`, no Claude, `program_generated_by =
   'fallback_template'`.
5. **Leak mitigation**: never give Claude raw biometric numbers — feed it
   `rationale.py`'s existing `_SIGNAL_LABELS`-style categorical labels only.
6. **Persona guardrail**: system prompt explicitly forbids naming the
   grounding experts in any user-facing (`rationale_public`) text.
7. Persist into `recommendations` + `recommendation_blocks` +
   `recommendation_block_exercises`.
8. Second entry point: `build_program_for_activity(activity_id_or_split_day,
   profile, history)` for on-demand swaps (needs a real on-demand endpoint —
   Supabase Edge Function or small API route — not just the nightly cron).
   For a non-strength activity, look up
   `activity_taxonomy.warmup_focus_body_parts` and build a warmup+cooldown
   bracketing it. For a different strength day, rebuild against that
   `split_day_label`. Every swap option returns a one-line preview.

`engine/run_daily.py` calls `program_builder.py` after `gate_today()`,
replacing the direct `recommend()`→`rationale.py` flow.

## Mobile UI (Phases 3, 5-7 — full detail)

**Phase 3 — navigation**: add Expo Router (file-based, first-party with the
pinned Expo SDK). Restructure `App.tsx` into `app/_layout.tsx` (root: auth
gate + global persistent active-session banner), `app/(tabs)/_layout.tsx`
(bottom tabs: Home/Trends/Settings), `app/(tabs)/index.tsx`,
`app/(tabs)/trends.tsx`, `app/(tabs)/settings.tsx`,
`app/logger/[blockId].tsx` (modal, not a tab).

**Phase 5 — Home**: `YesterdaySummaryCard` (Haiku blurb) +
`TodayProgramCard` (rendering 1-N blocks in order). Swap-activity action
opens a picker grouped Strength/Cardio/Recovery; Strength lists the
preferred split's day labels; every option shows a one-line preview *only
for the currently highlighted option*, not all expanded. Below the program
card: a free-text daily-feedback box writing to `daily_feedback`.

**Phase 6 — Logger**: `app/logger/[blockId].tsx`, pre-populated from
`recommendation_block_exercises`. `MobilityChecklistRow` (checkbox) /
`StrengthSetRow` (reps+weight, "+ add set"). Every exercise gets a swap (⇄,
pre-filtered to same movement_pattern/body_parts/target_goals) and remove
(✕); a global "+ Add an exercise" pulls from the catalog ad hoc. Explicit
Start Workout / End Workout buttons (`sessions.started_at`/`ended_at`); a
persistent app-wide banner while active; haptic tick (`expo-haptics`) on
every completion; a mid-screen "How did that feel?" control writing
`sessions.felt_rating`; a completion celebration on End Workout. DB-enforced
single active session.

**Phase 7 — Trends**: time-range selector (week/month/6mo/year, default
past month). AI summary (Haiku) at top, computed on open/timeframe-change.
Sleep line overlaid with a training-type strip (calories-overlay is a
later experiment, not committed now). Weekly volume bar chart grouped by
**muscle group** (`exercises.body_parts`), each bar tappable into a
drill-down list ranked by best lift (heaviest weight or Epley-estimated
1RM for compounds) with a "show more."

**Phase 4 — Settings**: dropdown-to-add per section (not static checkbox
lists): preferred split, activities (grouped Strength/Cardio/Recovery,
Walking pre-added), pains (dropdown over `body_part_taxonomy` incl. "Other,"
each entry expands into a severity slider + free-text note), goals
(dropdown, capped at 3 with an inline warning), training frequency
(manual/auto), diet, weight/birth date, location, HealthKit
(sync toggle + "what we read" disclosure, read-only).

**Visual direction**: calm, minimal, Oura-inspired across all 4 screens —
soft rounded cards, generous whitespace, muted palette, high-contrast
typography. Apply this as each screen is rebuilt, not as a separate retrofit
pass.

## Claude API integration & cost (Phase 2)

| Surface | Model | Why |
|---|---|---|
| Daily program-builder | Sonnet 4.6 ($3/$15 per MTok) | Highest-stakes reasoning (injury-relevant constraints, progression). |
| Yesterday's-summary blurb | Haiku 4.5 ($1/$5 per MTok) | Pure narrative compression, cheap, easy template fallback. |
| Trends AI summary | Haiku 4.5 ($1/$5 per MTok) | Same, wider window, read-driven not daily-cron. |
| On-demand swap | Sonnet 4.6 ($3/$15 per MTok) | Same reasoning task as the daily call, user-triggered. |

Use `client.messages.parse()` with `output_config.format` for both
production surfaces. Cache two breakpoints on the program-builder call: end
of the static persona system prompt, and end of the catalog excerpt in the
first user turn. Everything after (profile slice, recent history +
feedback, today's gate) stays uncached. This is a once-daily batch job —
don't try to keep the cache warm across days; the first user processed each
run pays the cache-write, subsequent users in the same run read the cache.

Rough cost (≈6,800 stable input tokens, ≈900 volatile, ≈800 output): first
user of the day ≈ $0.040, each subsequent user ≈ $0.017, Haiku blurb ≈
$0.0012/user/day (negligible). Illustrative monthly: 1 user ≈ $1.23, 10
users ≈ $6, 100 users ≈ $55. Swap calls add ≈ $0.02-0.04 per swap, only when
a user actually taps it. Not a blocking cost concern at this scale.

## Critical files

- `supabase/migrations/20260622000805_enable_extensions_and_types.sql` —
  `session_type` definition; the enum-rename migration follows this pattern.
- `supabase/migrations/20260622000809_create_exercises.sql`,
  `20260622000812_seed_exercises.sql` — base for the exercises v2 expansion
  and reseed.
- `supabase/migrations/20260622001055_create_user_profile.sql` — base for
  user_profile v2 expansion + owner_id/RLS.
- `engine/scoring.py`, `engine/rationale.py`, `engine/run_daily.py` —
  existing pattern `engine/program_builder.py` extends/replaces.
- `apps/mobile/App.tsx`, `apps/mobile/lib/recommendations.ts` —
  single-screen/no-nav code restructured into the Expo Router tree.
- `apps/mobile/lib/healthkitSync.ts`, `healthkitMapping.ts` — workouts-only
  HealthKit code extended to sleep/HR/calories/steps.
- `apps/mobile/eas.json`, EAS env vars — every new build needs the same
  env-var/Apple-Sign-In-audience checks documented in the autonomous build
  log's post-merge production-issues section before declaring an on-device
  rollout done.
- `CLAUDE.md` — needs a v2 addendum documenting the rules-vs-LLM philosophy
  change, the dropped a/b variants, and the resolved logging-model decision.

## Phase dependency order

**0 → 1 → 2 → (3 parallel with 1/2) → 4 → 5 → 6 → 7 → 8.** Schema (0) is
foundational. The nav library (3) must land before any second mobile screen
exists. 1 (exercise seed) blocks 2 (Claude can't select from an
empty/untagged DB). 2 blocks 5 (Home can't render "a complete program"
until the engine produces one). 4 and 5 can build in parallel once 0+3 are
done. 8 is last and lowest-risk (a contract-compatibility check on an
already-shipped, frozen-scope app).
