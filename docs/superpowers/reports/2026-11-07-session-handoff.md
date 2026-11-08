# Session handoff — 2026-11-07 (pick up here)

## 1. Blocker — RESOLVED 2026-11-07

Build 21 was submitted to TestFlight after Sohan renewed the Apple agreement
(it took ~5 min after acceptance for Apple to register it). Original note:
`eas submit` failed with:

> A required Apple agreement is missing or has expired.

1. Accept the pending agreement at https://appstoreconnect.apple.com/business
   (and the Developer Program License Agreement at
   https://developer.apple.com/account if prompted).
2. Then resubmit the existing build (no rebuild needed):
   ```
   cd apps/mobile
   npx eas-cli submit --platform ios --profile preview --id bff0dad8-71cb-420b-9a96-29b66e58edc4 --non-interactive
   ```
   Build 21 = EAS build `bff0dad8-71cb-420b-9a96-29b66e58edc4`, commit `305cecc`.

## 2. What we decided today (the Hevy-style roadmap)

Sohan asked to mimic Hevy (workout logger + social) re-aimed at long-lasting
mobility. Feature set and patterns only — no Hevy branding, naming or look.
Brainstorm decisions:

- **Sprints live inside the logger** — a sprint day is completed by saving that
  day's workout.
- **Social:** small circle of friends first, **opt-in public profiles**; posts
  carry photos/videos and the full workout; **copy someone's workout / save as
  routine** is a core action. Public profiles mean report/block/hide must ship
  with social (App Store rule).
- **Mobility-first but logs everything** — `exercise_type` decides inputs.
- **New clean tables** (`workouts`/`workout_exercises`/`workout_sets`); old
  `sessions`/`exercise_logs` left for the dormant engine.
- Mobility-appropriate metrics: no volume/1RM leaderboards.

Four sub-projects, order is load-bearing:

| | Sub-project | Status |
|---|---|---|
| A | Logger + history | **Done** — merged to master, pushed, build 21 built |
| B | Routines + library (folders, save-as-routine, start-from-routine, exercise browser with demo videos, custom exercises) | Not started |
| C | Progress + stats (ROM/hold trends, L/R symmetry, streaks, PR toasts, monthly recap) | Not started |
| D | Social (profiles, follows, feed, media, likes/comments, copy workout, report/block) | Not started |

Docs:
- Roadmap: `docs/superpowers/specs/2026-11-07-mobility-logger-roadmap.md`
- A spec: `docs/superpowers/specs/2026-11-07-logger-history-design.md`
- A plan: `docs/superpowers/plans/2026-11-07-logger-history.md`
- Final review of A: `docs/superpowers/reports/2026-11-07-logger-history-final-review.md`

## 3. What shipped in A

- Tabs: Workout · History · Trends · Settings. Sprint flow moved to `/sprint`.
- Logger `/workout/[id]`: inputs per exercise type (weight×reps / reps / hold /
  duration), one-sided exercises log Left first, hold/switch-sides/rest timers,
  previous-values prefill with "prev" hint, optional ROM, save-as-you-go,
  Live Activity revived.
- History tab + detail `/workout-summary/[id]` (edit title/notes, delete).
- Migrations live: `20261107120000_create_workouts.sql`,
  `20261107130000_workouts_parent_ownership_checks.sql`.
- Verified: 207/207 jest, clean tsc, clean `expo export` (iOS), live query
  shapes, live two-user RLS smoke test 18/18.

## 4. Things found along the way

- **Supabase project had auto-paused** (free tier, ~7 weeks idle; CLI error
  "login role status 544 ... connection timeout"). Restored via
  `POST https://api.supabase.com/v1/projects/<ref>/restore`. Check this first
  if the app/CLI can't connect after a quiet stretch.
- **RLS hole:** FK checks bypass RLS, so user B could attach rows to user A's
  workout or claim A's sprint day. Fixed by the parent-ownership migration.
  Re-run the test with `supabase/tests/rls_smoke_workouts.py` (reads
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` from env;
  creates two throwaway users and deletes them). Every new table B–D adds that
  references a parent row needs the same check + this test.

## 5. Rulings made without asking (and their cost if wrong)

- No per-task reviewer subagent; controller verified each task, one Opus
  whole-branch review at the end — a task-level bug could survive to the final
  review (none did).
- Feature branch in the main checkout, not a worktree.
- All live steps (migrations, smoke test, builds) done by the controller,
  never by subagents (real `.env` creds).
- Fix wave covered all 6 Important findings + minors 7–10, 12–14, 16, 17, 19–21.

## 6. Parked items (known, deliberately not fixed)

- **M11** ROM unit stored per set row, not per exercise — minor UX inconsistency.
- **M15** Sprint start makes sequential requests — ~1–2 s start.
- **M18** Finish fails mid-way then Discard → sprint day stays marked done.
- **M22** History offset paging can skip/duplicate a row if a workout finishes
  while scrolling — fixes on refresh.
- Generation guard (`app/workout/[workoutId].tsx` ~line 195) can occasionally
  skip a rest bar after a set.
- `uncompleteRow` ignores `inFlightRef` — un-ticking within ~200 ms of ticking
  can leave the set ticked; tap again fixes it.

## 7. On-device checklist for build 21 (Sohan)

1. One-sided stretch hold: left → automatic "switch sides" → right → rest bar.
2. Tap ✓ while a hold is running: timer stops, set completes once.
3. Edit a completed set, then Finish: the edit is saved.
4. Keyboard doesn't cover the bottom sets.
5. Start today's sprint routine from the Workout tab, save it: sprint card shows
   "Day N logged ✓".
6. Live Activity shows on the lock screen during a workout, disappears after save.
7. History lists the workout; detail view opens; title edit + delete work.

## 8. Next session, in order

1. ~~Submit build 21~~ (done).
2. Ask Sohan how the on-device walkthrough went; fix anything found first.
3. Start **sub-project B (routines + library)**: brainstorm → spec → plan →
   build, same workflow (cheap models for transcription tasks, Opus final
   review, controller does all live steps). Read the roadmap spec first; B adds
   `routine_folders`, `routines`, `routine_exercises`, `workouts.routine_id`,
   and nullable `exercises.owner_id` for custom exercises (RLS "global OR
   mine" — remember the parent-ownership checks).
