# Bulletproof v2 Autonomous Build Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to run this plan task-by-task in the current session. Do NOT use subagent-driven-development for the top-level tasks below — the orchestrator must hold continuous context across all phases (it dispatches its own Developer/Tester/Critic subagents *within* each task per the procedure doc). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the full Bulletproof v2 roadmap (schema v2 → exercise DB
seed → engine v2 → mobile nav bootstrap → Settings/HealthKit → Home →
Logger → Trends → web contract check) to completion in one continuous run,
using the same planner/developer/tester/critic/reporter dispatch pattern as
the v1 pipeline, with no per-step human input except a hard stop before
anything that could cost money or requires interactive human action (App
Store/Apple portal flows, browser-based OAuth).

**Architecture:** Identical mechanics to the v1 pipeline. Each task below
creates a dedicated git worktree, dispatches a Planner subagent against the
design spec, loops Developer→Tester→Critic dispatches per generated task
(capped at 3 revision rounds, skip-and-continue on exhaustion), runs a
whole-branch Critic pass, merges to master, and dispatches a Reporter. The
exact dispatch prompts and git mechanics live in
`docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md` — every
task below references it rather than repeating it. The full design (schema
columns, engine architecture, UI wireframes, Claude integration, cost
estimate) lives in
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md` — every
Planner dispatch below reads that file first instead of re-deriving the
design.

**Tech Stack:** Agent tool (subagent_type: general-purpose for all
dispatches per the v1 pipeline's lesson — `Plan` is read-only and cannot
write/commit), git worktrees, the existing `.superpowers/sdd/` reporting
convention.

## Global Constraints

- Read `docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md` and
  `docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md`
  before starting any task below — they are not repeated here.
- No human checkpoint for: local commits, push/merge to master, ordinary
  Claude API test calls during development (cents-level cost, already
  approved as part of this plan's own cost estimate).
- Hard stop and ask the user before: any new paid service enrollment (e.g.
  a weather API requiring a paid tier), an EAS build/submit beyond the free
  tier, a Supabase plan change, or anything else that could incur or
  increase a recurring cost.
- Hard stop and ask the user before: any step that requires interactive
  human action in a browser (Apple Developer portal config, App Store
  Connect UI clicks) that a subagent cannot complete itself — treat this the
  same as the money-spend gate.
- Revision loop cap: 3 rounds per task. On exhaustion: discard the task's
  changes (procedure doc, "Skip mechanics"), record it, move on. Never
  block the pipeline on a stuck task.
- Every dispatched subagent is told explicitly it cannot pause to ask the
  user a question — it must make the most reasonable call itself,
  consistent with the design spec's resolved decisions, and document the
  assumption.
- Each phase runs in its own git worktree on its own `pipeline/<slug>`
  branch; the main checkout at `c:\Dev\Bulletproof` stays on `master`
  throughout and is never checked out to another branch mid-phase.
- **`session_type` enum rename, the `pains`/`injury_constraints` rename, and
  any other migration that changes an existing column's name or type must
  preserve the existing single Sohan row and 17-row exercise seed** — every
  schema task's Tester must explicitly verify this, not just check the new
  schema in isolation.

---

### Task 1: Execute Phase 0 — schema v2 migration

**Files:** new migrations under `supabase/migrations/`, determined by the
Planner/Developer dispatches.

**Interfaces:**
- Consumes: the existing schema (`user_profile`, `exercises`,
  `session_type`, `recommendations`, `sessions` migrations listed in the
  design spec's "Critical files").
- Produces: every table described in the design spec's "Schema v2" section
  — `split_taxonomy`, `activity_taxonomy`, `goal_taxonomy`,
  `body_part_taxonomy`, expanded `user_profile`/`exercises`, the simplified
  `session_type` enum, `recommendation_blocks`/`recommendation_block_exercises`,
  `exercise_logs`, `daily_feedback`, the `sessions` additions, and
  multi-user RLS on every per-user table. Every later phase depends on this
  schema existing exactly as specified.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-schema-v2 -b pipeline/schema-v2 master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch" in the procedure doc. Phase goal to paste into the
prompt: "Implement the full Schema v2 migration described in the 'Schema
v2 (Phase 0 — full detail)' section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`. Write one or
more new timestamped migration files under `supabase/migrations/` (follow
the existing naming/structure convention in that directory). Every new
column must be nullable or defaulted so the existing single Sohan
`user_profile` row and 17-row `exercises` seed survive unmodified. The
`session_type` enum rename requires the standard Postgres create-new-type /
CASE-map / drop-old-type / rename dance — do not attempt `ALTER TYPE ...
RENAME VALUE` tricks that don't actually exist for dropping values. Add
RLS policies for every new/modified per-user table mirroring the existing
service-role-bypass pattern already used for the daily cron job. Do not add
public views for the new block tables — `recommendations_public` keeps its
exact current shape."

- [ ] **Step 3: Run the per-task loop**

Follow "Per-task loop" in the procedure doc for every task in the Planner's
plan. Testers for this phase must run the migration against a real local/
staging Supabase instance (not just lint the SQL) and confirm: the existing
Sohan row and exercise seed survive, new columns default correctly, the new
lookup tables are seeded, and RLS actually blocks cross-`owner_id` reads
(create a second test auth user and confirm it cannot read the first user's
rows).

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc. The Critic must specifically check for any
migration that could fail against existing data (non-nullable column with
no default, a CASE-map that misses a value, an RLS policy that locks out
the service role used by the daily cron).

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/schema-v2 -m "merge: schema v2 migration"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-schema-v2
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Schema v2 migration".

---

### Task 2: Execute Phase 1 — exercise DB seed

**Files:** `supabase/seed/exercise-catalog-v2-draft.csv` (reviewable draft),
a new migration `supabase/migrations/<ts>_seed_exercises_v2.sql`.

**Interfaces:**
- Consumes: Task 1's `exercises`/`goal_taxonomy`/`body_part_taxonomy`/
  `activity_taxonomy` schema.
- Produces: ~100-200 tagged exercise rows (plus the original 17 backfilled
  with the new columns). Phase 2 (engine v2) depends on this catalog
  existing and being well-tagged — Claude can't select from an
  empty/untagged DB.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-exercise-seed -b pipeline/exercise-seed master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Implement the Phase 1 exercise DB
seed described in `docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`.
This is a one-time, AI-assisted, *offline* research pass, not a runtime
pipeline: research and tag 100-200 exercises (equipment variants as
separate rows — 'Incline Dumbbell Press' / 'Incline Barbell Press' /
'Incline Smith Machine Press' are three rows, not one), covering every
`movement_pattern` x `exercise_type` combination, with real demo video URLs
sourced wherever findable, and at least 3-5 `is_corrective = true` exercises
per pain-relevant body part (neck, ankle, hips/hamstrings, shoulders) per
CLAUDE.md's existing non-negotiables (banded ankle distraction, chin tucks,
Nordic curl become the first corrective entries). Write the draft to
`supabase/seed/exercise-catalog-v2-draft.csv` first for review, then a real
migration that also back-fills the original 17 exercises' new columns —
don't leave them under-tagged. You will not get to ask Sohan for spot-check
approval interactively in this pipeline run; instead, write a validation
script (SQL or Python, under `engine/tests/` or similar) asserting every
`goal_taxonomy`/`body_part_taxonomy` id has at least N tagged exercises, and
treat that script passing as the acceptance gate in place of a manual
review."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/exercise-seed -m "merge: exercise DB v2 seed"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-exercise-seed
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Exercise database v2 seed". Explicitly flag in the report that
Sohan should spot-check a sample of the seeded rows for tone/accuracy even
though the validation script passed — the script checks coverage, not
quality.

---

### Task 3: Execute Phase 2 — engine v2 (Claude exercise-selection module)

**Files:** `engine/program_builder.py` (new), modifications to
`engine/scoring.py` and `engine/run_daily.py`.

**Interfaces:**
- Consumes: Task 1's schema, Task 2's tagged exercise catalog, the existing
  `recovery`/`sessions`/`daily_feedback` tables.
- Produces: a daily program-builder call writing full multi-block programs
  to `recommendations`/`recommendation_blocks`/`recommendation_block_exercises`,
  plus the on-demand `build_program_for_activity` entry point. Phase 5
  (Home screen) depends on this producing real data to render.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-engine-v2 -b pipeline/engine-v2 master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Implement the Engine v2 architecture
described in the 'Engine v2 architecture (Phase 2 — full detail)' section
of `docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`: update
`engine/scoring.py` for the simplified 6-value `session_type` and the new
`gate_today()` wrapper (parameterize pattern-rotation by the user's
`preferred_split`), add a weather-gate precondition for pickleball (if no
weather API key secret exists yet, treat that as a pause-and-ask exactly
like a missing GitHub Actions secret in the v1 pipeline — do not silently
skip weather gating forever, surface it), and write the new
`engine/program_builder.py` module exactly per the spec's structured-output
contract, anti-hallucination enum constraint on `exercise_id`, fallback
path, leak mitigation (categorical labels only, never raw biometrics), and
persona-guardrail system prompt (four voices: longevity coach, hypertrophy/
physique, evidence-based programming, physical-therapist/rehab — never
naming the grounding experts in `rationale_public`). Update
`engine/run_daily.py` to call it. Use `client.messages.parse()` with
`output_config.format`, model `claude-sonnet-4-6`, per the claude-api
skill's current guidance — verify the exact API shape against that skill
rather than assuming a remembered pattern, since API surfaces drift. Build
the on-demand `build_program_for_activity` entry point as a plain Python
function first (callable from a script/test); a Supabase Edge Function or
API route wrapping it for the mobile app is in scope for this phase only if
time allows — if not, document it as a one-task gap for the Reporter to
flag, since Phase 5/6 need a way to call it even if just via a temporary
direct-Python-call test harness."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc. Testers must run `engine/run_daily.py` against
real recent history in a non-production-affecting way (e.g. a test
Supabase project, or by reading-only against staging and writing to a
test-scoped date) and inspect actual generated programs for: no
hallucinated exercise IDs, no biometric numbers or named-expert mentions in
`rationale_public`, and that the fallback path actually engages when the
Claude call is forced to fail.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc. The Critic must specifically check the leak
mitigation (grep the prompt-assembly code for any path that could pass a
raw `recovery.hrv`/`subjective_readiness` number into the Claude call) and
that `engine/scoring.py`'s safety gating cannot be influenced by anything
Claude returns.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/engine-v2 -m "merge: engine v2 (Claude exercise selection)"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-engine-v2
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Engine v2 — Claude exercise selection". Flag the
`build_program_for_activity` endpoint's actual deployment status (plain
function vs. real Edge Function) explicitly, since Phase 6 depends on it.

---

### Task 4: Execute Phase 3 — mobile navigation bootstrap

**Files:** `apps/mobile/app/` (new directory structure), removal of the
single-screen `App.tsx` model.

**Interfaces:**
- Consumes: the existing working `apps/mobile/` Apple Sign-In flow
  (`App.tsx`'s current `handleSignIn`) and Supabase client.
- Produces: an Expo Router screen tree (`app/_layout.tsx`,
  `app/(tabs)/_layout.tsx`, placeholder `index.tsx`/`trends.tsx`/
  `settings.tsx`, and a placeholder `app/logger/[blockId].tsx`) with the
  existing sign-in flow preserved. Phases 4-7 below all build their actual
  screen content into the placeholders this phase creates.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-mobile-nav -b pipeline/mobile-nav master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Add Expo Router to `apps/mobile/`
per the 'Phase 3 — navigation' section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`. Read
`apps/mobile/AGENTS.md` first — it explicitly says Expo has changed and to
read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before
writing any code; do the same here, do not rely on a remembered Expo Router
API. Migrate the existing sign-in/signed-out conditional logic from
`App.tsx` into `app/_layout.tsx` exactly as-is (don't redesign auth in this
phase), add the bottom-tab layout, and stub `index.tsx`/`trends.tsx`/
`settings.tsx`/`logger/[blockId].tsx` with placeholder content (Phases 4-7
fill these in). This phase's acceptance bar is: the app still builds, still
signs in with Apple exactly as before, and now shows a tab bar with 3 tabs
plus a reachable (even if placeholder) logger route."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/mobile-nav -m "merge: mobile navigation bootstrap (Expo Router)"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-mobile-nav
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Mobile navigation bootstrap". Note in the report that this is
a real migration of the existing working sign-in flow and should get a
real on-device TestFlight check before too much new screen logic is built
on top — flag this as a recommended checkpoint even though the pipeline
itself won't pause for it.

---

### Task 5: Execute Phase 4 — Settings screen + full HealthKit sync

**Files:** `apps/mobile/app/(tabs)/settings.tsx`,
`apps/mobile/lib/healthkitSync.ts`/`healthkitMapping.ts`.

**Interfaces:**
- Consumes: Task 1's `user_profile` v2 columns and taxonomy tables, Task
  4's tab-bar placeholder.
- Produces: a working Settings screen editing every new profile field, and
  HealthKit reading sleep/HR/calories/steps in addition to workouts. Phase 5
  (Home) doesn't strictly depend on this, but benefits from real profile
  data existing.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-settings-healthkit -b pipeline/settings-healthkit master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Build the Settings screen and
HealthKit expansion described in the 'Phase 4 — Settings' and HealthKit
sections of `docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`:
dropdown-to-add sections for preferred split, activities (grouped Strength/
Cardio/Recovery, Walking pre-added by default), pains (dropdown over
`body_part_taxonomy` including an 'Other' free-text path, each entry
expanding into a severity slider + note), goals (dropdown, capped at 3 with
an inline warning), training frequency (manual/auto), diet, weight/birth
date, location, and a HealthKit section (sync toggle + 'what we read'
disclosure, explicitly read-only). Expand `READ_PERMISSIONS` in
`apps/mobile/lib/healthkitSync.ts` to include
`HKCategoryTypeIdentifierSleepAnalysis` and heart-rate types, and actually
query the `ActiveEnergyBurned`/`DistanceWalkingRunning`/`StepCount` types
already requested but unused. Apply the calm/minimal Oura-inspired visual
direction from the spec to this screen's styling."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/settings-healthkit -m "merge: settings screen and full HealthKit sync"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-settings-healthkit
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Settings screen and HealthKit expansion". Flag that the new
HealthKit permission prompt (sleep/heart rate) needs an on-device TestFlight
retest, same caution as v1's HealthKit rollout.

---

### Task 6: Execute Phase 5 — Home screen (full-program rendering)

**Files:** `apps/mobile/app/(tabs)/index.tsx`.

**Interfaces:**
- Consumes: Task 3's `program_builder.py` output shape (full multi-block
  programs in `recommendations`/`recommendation_blocks`/
  `recommendation_block_exercises`), Task 4's nav tree.
- Produces: the Home screen rendering yesterday's AI summary, today's full
  program, the swap-activity picker, and the daily-feedback box. Phase 6
  (Logger) depends on tapping a block here to navigate correctly.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-home-screen -b pipeline/home-screen master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Build the Home screen described in
the 'Phase 5 — Home' section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`:
`YesterdaySummaryCard` (Haiku-generated blurb, model `claude-haiku-4-5` per
the claude-api skill — verify exact API shape there, don't assume) and
`TodayProgramCard` rendering 1-N blocks from `recommendation_blocks`/
`recommendation_block_exercises` in order, each tappable into
`logger/[blockId]`. Add the swap-activity picker (grouped Strength/Cardio/
Recovery, Strength listing the preferred split's day labels, one-line
preview shown only for the currently highlighted option) calling Task 3's
`build_program_for_activity`. Add the free-text daily-feedback box writing
to `daily_feedback`. If `recommendations` has no row for today, show a
clear 'not generated yet' state, not a crash or stale data. Apply the
Oura-inspired visual direction."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/home-screen -m "merge: home screen full-program rendering"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-home-screen
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Home screen".

---

### Task 7: Execute Phase 6 — Logger screen

**Files:** `apps/mobile/app/logger/[blockId].tsx`, `apps/mobile/app/_layout.tsx`
(persistent banner).

**Interfaces:**
- Consumes: Task 6's block-tap navigation, Task 1's `exercise_logs`/
  `sessions` columns.
- Produces: full per-set logging, exercise swap/remove/add, Start/End
  workout flow with a global banner, haptics, and mid-session feedback.
  Nothing later in this plan depends on it.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-logger -b pipeline/logger master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Build the Logger screen described
in the 'Phase 6 — Logger' section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`:
`MobilityChecklistRow`/`StrengthSetRow` with incremental per-row saves to
`exercise_logs`; swap (⇄, pre-filtered to same movement_pattern/body_parts/
target_goals)/remove (✕) on every exercise plus a global '+ Add an
exercise'; explicit Start Workout / End Workout buttons writing
`sessions.started_at`/`ended_at`; a persistent banner in
`app/_layout.tsx` shown app-wide while a session is active; a haptic tick
(`expo-haptics`) on every set/checkbox completion; a mid-session 'How did
that feel?' control writing `sessions.felt_rating`; a completion
celebration on End Workout. The single-active-session rule is enforced at
the DB level by Task 1's partial unique index — handle the constraint
violation gracefully in the UI (prompt to finish/discard the existing
session) rather than letting it surface as a raw error."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc. Testers must verify the DB-level single-session
constraint actually blocks a second concurrent `sessions` insert, not just
that the UI happens to prevent it.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/logger -m "merge: logger screen"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-logger
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Logger screen".

---

### Task 8: Execute Phase 7 — Trends screen

**Files:** `apps/mobile/app/(tabs)/trends.tsx`.

**Interfaces:**
- Consumes: `exercise_logs`, `recovery`, `sessions` history; Task 4's nav
  tree.
- Produces: the trends/analytics view. Nothing later depends on it.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-trends -b pipeline/trends master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Build the Trends screen described
in the 'Phase 7 — Trends' section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`: time-range
selector (week/month/6mo/year, default past month), an AI summary (Haiku,
computed on open/timeframe-change, not a daily cron artifact) at the top,
a sleep-line-overlaid-with-training-type-strip chart, and a weekly-volume
bar chart grouped by muscle group (`exercises.body_parts`) with a tap-to-
drill-down list ranked by best lift (heaviest weight, or an Epley-estimated
1RM for compounds) and a 'show more'. Research current Expo-SDK-compatible
charting library options (e.g. `victory-native`, `react-native-gifted-charts`)
before picking one — verify against the pinned SDK version in
`apps/mobile/AGENTS.md`'s instruction to check current Expo docs, don't
assume compatibility. Apply the Oura-inspired visual direction."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/trends -m "merge: trends screen"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-trends
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Trends screen".

---

### Task 9: Execute Phase 8 — public web dashboard contract check

**Files:** `apps/web/lib/recommendations.ts`/`sessionTypeLabels.ts` (or
equivalent), as needed.

**Interfaces:**
- Consumes: the renamed `session_type` enum and unchanged
  `recommendations_public` view from Task 1.
- Produces: confirmation (and a fix, if needed) that the public dashboard
  still works. Last phase — nothing depends on it.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-web-contract -b pipeline/web-contract master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Verify `apps/web/`'s ported
recommendation-fetching code still works correctly against the simplified
6-value `session_type` enum and the unchanged `recommendations_public` view
shape (per the 'Phase 8' section of
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`). Fix any label
mapping that referenced the now-removed `upper_a`/`upper_b`/`lower_a`/
`lower_b` values. No new features — this app's scope stays frozen at the
two existing public outputs."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/web-contract -m "merge: web dashboard contract check for schema v2"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-web-contract
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Web dashboard contract check".

---

### Task 10: Final cross-phase report

**Files:**
- Modify: `docs/superpowers/reports/autonomous-build-log.md`, `CLAUDE.md`.

**Interfaces:**
- Consumes: every per-phase entry already appended to the build log by
  Tasks 1-9's Reporter dispatches.
- Produces: nothing further consumes this — it's the end of the run.

- [ ] **Step 1: Dispatch a final Reporter**

```
You are the Reporting agent writing the final summary for the entire
Bulletproof v2 autonomous build pipeline run (all 9 phases: schema v2,
exercise DB seed, engine v2, mobile nav bootstrap, settings/HealthKit, home
screen, logger screen, trends screen, web dashboard contract check).

Read docs/superpowers/reports/autonomous-build-log.md in full (all 9
per-phase entries should already be there). Read CLAUDE.md and
docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md.

Write a final section to the build log (## YYYY-MM-DD — v2 run complete)
summarizing, for Sohan: what the whole system can now do end to end that it
couldn't before this run started, a consolidated list of anything skipped/
stuck across all phases that still needs his attention (especially anything
that needed a real on-device TestFlight check, or the on-demand swap
endpoint's actual deployment status from Phase 2), and update CLAUDE.md's
"Status" section, "Open decisions" section (the logging-model and
rotation-granularity decisions are now resolved — say so), and the data
model section to reflect the v2 schema. Make these edits directly and say
so in your reply.

Keep the build-log section under 400 words. Commit both files.
```

- [ ] **Step 2: Post the final summary to the user in chat**

Don't just leave it in the file — this is the message the user actually
reads at the end of a run they weren't watching step-by-step.
