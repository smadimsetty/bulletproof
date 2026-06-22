# Autonomous Build Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to run this plan task-by-task in the current session. Do NOT use subagent-driven-development for the top-level tasks below — the orchestrator must hold continuous context across all phases (it dispatches its own Developer/Tester/Critic subagents *within* each task per the procedure doc). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the rest of the Bulletproof roadmap (mobile bootstrap
completion → engine productionization → daily cron → HealthKit sync →
recommendation UI → web dashboard) to completion in one continuous run,
using a planner/developer/tester/critic/reporter dispatch pattern, with no
per-step human input except a hard stop before anything that could cost
money.

**Architecture:** The orchestrating session executes one task per backlog
phase. Each task: creates a dedicated git worktree, dispatches a Planner
subagent (if the phase has no spec/plan yet), loops Developer→Tester→Critic
dispatches per generated task (capped at 3 revision rounds, skip-and-continue
on exhaustion), runs a whole-branch Critic pass, merges to master, and
dispatches a Reporter. The exact dispatch prompts and git mechanics live in
`docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md` — every
task below references it rather than repeating it.

**Tech Stack:** Agent tool (subagent_type: Plan / general-purpose), git
worktrees, the existing `.superpowers/sdd/` reporting convention.

## Global Constraints

- Read `docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`
  and `docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md`
  before starting any task below — they are not repeated here.
- No human checkpoint for: local commits, push/merge to master, TestFlight/
  App Store Connect submissions.
- Hard stop and ask the user before: anything that could incur or increase
  a cost.
- Revision loop cap: 3 rounds per task. On exhaustion: discard the task's
  changes (procedure doc, "Skip mechanics"), record it, move on. Never
  block the pipeline on a stuck task.
- Every dispatched subagent is told explicitly it cannot pause to ask the
  user a question — it must make the most reasonable call itself and
  document the assumption.
- Each phase runs in its own git worktree on its own `pipeline/<slug>`
  branch; the main checkout at `c:\Dev\Bulletproof` stays on `master`
  throughout and is never checked out to another branch mid-phase.

---

### Task 1: Pipeline procedure reference (already written)

**Files:**
- Create: `docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md`

**Interfaces:**
- Produces: the exact Developer/Tester/Critic/Planner/Reporter dispatch
  prompt templates and git worktree/merge/skip commands that every later
  task in this plan invokes by reference.

- [x] **Step 1: Write the procedure file**

Already written in this same session — see the file above. Contains
sections "Create the worktree", "Planner dispatch", "Per-task loop",
"Skip mechanics", "Whole-branch Critic pass", "Merge", "Reporter dispatch",
"Money-spend gate".

- [x] **Step 2: Verify it has every required section**

Run: `grep -c "^### " "docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md"`
Expected: `7` (the 7 numbered subsections listed in Step 1, "Money-spend
gate" is a top-level `##` not counted here).

- [ ] **Step 3: Commit**

```bash
cd c:\Dev\Bulletproof
git add docs/superpowers/plans/2026-06-22-autonomous-pipeline-procedure.md
git commit -m "docs: add autonomous pipeline procedure reference"
```

---

### Task 2: Execute Phase 1 — finish mobile bootstrap

**Files:** determined by the Developer dispatches; the plan already exists
at `docs/superpowers/plans/2026-06-22-mobile-app-bootstrap.md`, Tasks 2-8
(Task 1, Apple enrollment, is already done by the user).

**Interfaces:**
- Consumes: nothing from this plan (the bootstrap plan is self-contained).
- Produces: a TestFlight-installed Expo app with Apple Sign-In and a
  verified Supabase connection. Phase 4 (HealthKit sync) and Phase 5
  (recommendation UI) below both build on `apps/mobile/` existing and
  working.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-mobile-bootstrap -b pipeline/mobile-bootstrap master
```

- [ ] **Step 2: Run the per-task loop for Tasks 2-8**

Follow "Per-task loop" in the procedure doc for each of Tasks 2, 3, 4, 5,
6, 7, 8 from `2026-06-22-mobile-app-bootstrap.md`, in order, working in
`../bulletproof-mobile-bootstrap`. Skip the Planner dispatch step entirely
for this phase — the plan already exists. Note: Tasks 1, 5, 6, and 8 of the
bootstrap plan are partly/fully manual (Apple portal config, EAS account
setup) — the Developer dispatch for those should still document exactly
what manual action it took or determined the user needs to take, since a
subagent may not have interactive access to web-based OAuth/portal flows.
If a Developer subagent reports it cannot complete a step because it
requires interactive human action in a browser (e.g. clicking through
Apple's Sign In with Apple key creation UI), treat that specific step as a
hard stop — this is a process limitation, not a money-spend gate, but
warrants the same treatment: pause and tell the user exactly what manual
action is needed, then resume the loop once they confirm it's done.

- [ ] **Step 3: Whole-branch Critic pass**

Follow "Whole-branch Critic pass" in the procedure doc.

- [ ] **Step 4: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/mobile-bootstrap -m "merge: mobile app bootstrap"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-mobile-bootstrap
```

- [ ] **Step 5: Reporter dispatch**

Follow "Reporter dispatch" in the procedure doc, phase name "Mobile app
bootstrap".

---

### Task 3: Execute Phase 2 — engine productionization

**Files:** determined by the Planner/Developer dispatches (new spec at
`docs/superpowers/specs/2026-06-22-engine-productionization-design.md`,
new plan at `docs/superpowers/plans/2026-06-22-engine-productionization.md`,
implementation under `engine/`).

**Interfaces:**
- Consumes: `prototyping/weight-tuning/scoring.py`'s `recommend()` function
  (signature: `recommend(day, history, readiness) -> list[tuple[str, float]]`)
  and the existing `recovery`/`sessions`/`recommendations` Supabase tables.
- Produces: a runnable `engine/run_daily.py` (or equivalent entry point)
  that writes one row to `recommendations` per day. Phase 3 (the cron)
  below invokes whatever entry point this phase produces — the Planner
  dispatch for Phase 2 must state the exact entry point command in its
  spec/plan so Phase 3's Planner can reference it.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-engine-productionization -b pipeline/engine-productionization master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch" in the procedure doc. Phase goal to paste into
the prompt: "Productionize the scoring engine prototyped in
`prototyping/weight-tuning/scoring.py` into `engine/` as the real,
runnable daily job: pull current Oura recovery data, read recent
`sessions` history from Supabase, run the scoring logic, and write one row
to `recommendations` (matching the existing `recommendations` table schema
in `supabase/migrations/20260622001542_create_recommendations.sql` — note
its `internal_rationale` and `public_rationale` are both `not null`, so the
engine must generate plain rule-based text for both, no LLM layer per
CLAUDE.md's 'no LLM layer in v1' decision). Reuse the existing
`oura_client.py`/`supabase_client.py` patterns from `prototyping/weight-tuning/`
rather than reinventing HTTP plumbing — port them into `engine/` since
`engine/` is meant to be the productionized home for this logic, not the
prototype. Must be runnable as a single command with no interactive input,
since Phase 3 will invoke it from a GitHub Actions cron job."

- [ ] **Step 3: Run the per-task loop**

Follow "Per-task loop" for every task in the plan the Planner produced.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/engine-productionization -m "merge: engine productionization"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-engine-productionization
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Engine productionization".

---

### Task 4: Execute Phase 3 — GitHub Actions daily cron

**Files:** determined by the Planner/Developer dispatches (new spec/plan,
implementation under `.github/workflows/`).

**Interfaces:**
- Consumes: the entry point command Phase 2 documented (e.g.
  `python engine/run_daily.py`) and its required environment variables
  (Oura PAT, Supabase service-role key).
- Produces: a scheduled workflow that runs daily and writes to
  `recommendations`. Phase 5 (recommendation UI) below depends on this
  actually running so there's real data — note in that phase's Planner
  dispatch that this dependency exists.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-daily-cron -b pipeline/daily-cron master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Add a GitHub Actions workflow
(`.github/workflows/daily-recommendation.yml` or similar) that runs the
entry point Phase 2 produced (read
`docs/superpowers/plans/2026-06-22-engine-productionization.md` for the
exact command) on a daily cron schedule, e.g. `cron: '0 11 * * *'` (11:00
UTC, before Sohan's typical morning), using repository secrets for the
Oura PAT and Supabase service-role key (this orchestrating session cannot
set repository secrets itself — it has no GitHub UI access — so if no such
secrets exist yet, treat that as the same kind of pause as the money-spend
gate: stop and ask the user to add
`OURA_PERSONAL_ACCESS_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` as
repo secrets via GitHub's web UI before continuing). Include a
`workflow_dispatch` trigger too, so it can be run manually once to verify."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc. Note: verifying a GitHub Actions workflow
actually runs correctly requires either pushing it and triggering
`workflow_dispatch` via `gh workflow run`, or asking the user to confirm —
since triggering a real workflow run that hits the live Oura API and
writes to the live `recommendations` table is exactly the kind of
real-world side effect Testing should actually exercise, not mock. Use
`gh workflow run <workflow-name> --ref pipeline/daily-cron` and `gh run
watch` to verify directly rather than guessing.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/daily-cron -m "merge: daily recommendation cron"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-daily-cron
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Daily recommendation cron".

---

### Task 5: Execute Phase 4 — HealthKit → Supabase sync

**Files:** determined by the Planner/Developer dispatches, under
`apps/mobile/`.

**Interfaces:**
- Consumes: the working `apps/mobile/` app and Supabase Auth session from
  Phase 1 (Task 2 above), and the `activity`/`sessions` table schemas
  (`supabase/migrations/20260622022456_create_activity.sql` and
  `20260622001745_create_sessions.sql`).
- Produces: workouts read from HealthKit, written into `activity`/
  `sessions` via the authenticated Supabase client from
  `apps/mobile/lib/supabase.ts`. Phase 5 (recommendation UI) doesn't
  depend on this directly, but this is the actual fix for the bug that
  started the whole mobile pivot — its Reporter summary should say so
  explicitly.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-healthkit-sync -b pipeline/healthkit-sync master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Add HealthKit workout reading to
the `apps/mobile/` Expo app (built in Phase 1) using a community module
such as `react-native-health` or `@kingstinct/react-native-healthkit` —
research current Expo SDK compatibility before picking one, since this
moves quickly. On app launch/foreground, request HealthKit workout-read
permission, fetch workout samples since the last sync (track a
last-synced timestamp in AsyncStorage), map them into the `activity` table
shape (see `to_activity_row` in
`prototyping/weight-tuning/oura_pull.py` for the existing
Oura-to-row mapping pattern this should mirror, adapted for HealthKit's
fields) and upsert via the authenticated `supabase` client from
`apps/mobile/lib/supabase.ts` (relies on the RLS policies from the
bootstrap plan's Task 2). This requires a Custom Dev Client / EAS build,
not Expo Go, since HealthKit modules are native code Expo Go's sandbox
doesn't include — say so explicitly in the plan's testing section."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/healthkit-sync -m "merge: HealthKit to Supabase sync"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-healthkit-sync
```

- [ ] **Step 6: Reporter dispatch**

Phase name "HealthKit sync". Explicitly mention this closes the original
Apple Watch workout bug report.

---

### Task 6: Execute Phase 5 — recommendation/summary UI

**Files:** determined by the Planner/Developer dispatches, under
`apps/mobile/`.

**Interfaces:**
- Consumes: the `recommendations` table (now populated daily by Phase 3),
  read via the `authenticated` RLS policy from Phase 1's Task 2 (full row,
  not the `recommendations_public` view — this is the private/authenticated
  surface).
- Produces: a screen in `apps/mobile/` rendering today's top pick/runner-up
  and a summary of yesterday. Nothing later in this plan depends on it.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-recommendation-ui -b pipeline/recommendation-ui master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Add a screen to `apps/mobile/`
(replacing the placeholder sign-in screen's post-login state from Phase 1)
that reads the latest row from `recommendations` via the authenticated
Supabase client and renders: today's `top_pick` and `runner_up`, the
`public_rationale` text, and a one-line summary of yesterday's actual
logged session from `sessions` if one exists. If `recommendations` has no
row for today (e.g. the Phase 3 cron hasn't run yet that day), show a
clear 'not generated yet' state rather than crashing or showing stale data
silently."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/recommendation-ui -m "merge: recommendation and summary UI"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-recommendation-ui
```

- [ ] **Step 6: Reporter dispatch**

Phase name "Recommendation and summary UI".

---

### Task 7: Execute Phase 6 — web dashboard

**Files:** determined by the Planner/Developer dispatches, under
`apps/web/` (already scaffolded as a placeholder per
`apps/web/README.md` — "Next.js app — the public renderer... Not yet
built").

**Interfaces:**
- Consumes: the `recommendations_public` view only (read-only, anon-safe —
  see `supabase/migrations/20260622002432_fix_view_security_and_updated_at_triggers.sql`).
  No write path, no auth.
- Produces: a deployed, public, read-only site. Nothing later in this plan
  depends on it — this is the last phase.

- [ ] **Step 1: Create the worktree**

```bash
git -C c:\Dev\Bulletproof worktree add ../bulletproof-web-dashboard -b pipeline/web-dashboard master
```

- [ ] **Step 2: Planner dispatch**

Follow "Planner dispatch". Phase goal: "Build the Next.js app in
`apps/web/` (per its README) as a thin, public, read-only dashboard:
fetch `recommendations_public` (anon key only, no service-role key in this
codebase at all) and render the last N days. Deploy to Netlify (per
`apps/web/README.md`'s stated plan). This is explicitly NOT the private
interface — no biometrics, no auth, no write path; the mobile app from
Phases 1/5 is the private surface."

- [ ] **Step 3: Run the per-task loop**

Follow the procedure doc.

- [ ] **Step 4: Whole-branch Critic pass**

Follow the procedure doc.

- [ ] **Step 5: Merge**

```bash
git -C c:\Dev\Bulletproof merge --no-ff pipeline/web-dashboard -m "merge: public web dashboard"
git -C c:\Dev\Bulletproof push origin master
git -C c:\Dev\Bulletproof worktree remove ../bulletproof-web-dashboard
```

Note: actually deploying to Netlify may itself require account setup
(similar in kind to Task 1 of the bootstrap plan) — if no Netlify account/
site exists yet, treat first-time account creation as a pause-and-ask,
same as the GitHub Actions secrets note in Task 4. Connecting an
already-existing Netlify account to this repo for continuous deployment is
not a money-spend (Netlify's free tier covers this use case) and can
proceed without asking.

- [ ] **Step 6: Reporter dispatch**

Phase name "Public web dashboard".

---

### Task 8: Final cross-phase report

**Files:**
- Modify: `docs/superpowers/reports/autonomous-build-log.md`

**Interfaces:**
- Consumes: every per-phase entry already appended to that file by Tasks
  2-7's Reporter dispatches.
- Produces: nothing further consumes this — it's the end of the run.

- [ ] **Step 1: Dispatch a final Reporter**

```
You are the Reporting agent writing the final summary for the entire
autonomous build pipeline run (all 6 phases: mobile bootstrap, engine
productionization, daily cron, HealthKit sync, recommendation UI, web
dashboard).

Read docs/superpowers/reports/autonomous-build-log.md in full (all 6
per-phase entries should already be there). Read CLAUDE.md.

Write a final section to that same file (## YYYY-MM-DD — Run complete)
summarizing, for Sohan: what the whole system can now do end to end that
it couldn't before this run started, a consolidated list of anything
skipped/stuck across all phases that still needs his attention, and
whether CLAUDE.md's "Status" section needs updating to reflect the new
state (if so, update it directly and say so in your reply).

Keep it under 400 words. Commit the file (and CLAUDE.md if you updated
it).
```

- [ ] **Step 2: Post the final summary to the user in chat**

Don't just leave it in the file — this is the message the user actually
reads at the end of a run they weren't watching step-by-step.
