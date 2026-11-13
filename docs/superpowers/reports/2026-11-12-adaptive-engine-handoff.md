# Handoff (2026-11-13): MoveMaxx adaptive sprint engine, v1.4.0

Sprints stopped being a fixed 14-day list. Each day is now built the morning you open it, from your test results, how the last session felt, and your equipment and time. Spec: `docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md`. Plan: `docs/superpowers/plans/2026-11-12-adaptive-sprint-engine.md`.

## What changed for you in the app
- **Every day is built when you open it.** Slots are ranked by how far each test is from target. Each slot climbs a ladder of levels and steps, and the day fits your time range.
- **Your weaker side goes first and gets one extra set** when a test showed a real left/right gap (bigger than the test's noise threshold). The logger orders the sets that way, and the switch-sides timer follows it.
- **The finish sheet asks two things:** how hard it was (Easy / About right / Too hard) and pain from 0 to 10, with nothing preselected. If pain is 3 or more, it also asks where. Those answers drive the next day:
  - pain above 5 steps that slot back, even if you skipped the effort question
  - two "About right" sessions in a row step it up
  - a skipped question holds the slot where it is
- **Swap now stays on your level.** The sheet also has an **Easier version** row that steps that slot back one step.
- **Changing your equipment tier** re-fits today and any already-built day. If a level has nothing your tier allows, the exercise drops to the nearest lower level, never an empty slot.
- **The sprint screen shows why:**
  - a short "why today" line (e.g. "Left side first, plus one extra set: your knee-to-wall gap is 4 cm.")
  - each exercise's level and step, and the weaker side's extra set
  - a one-line plan summary
- **Retest results ignore noise.** A change within a test's noise threshold reads "No clear change". You then get a recommendation:
  - **Stay** for another cycle on the same area. It starts right away: your retest becomes the new baseline and your levels carry over.
  - **Switch** to a new area, with a suggested one marked when the coach has one.

## The AI coach is built but off
`sprint-coach` (a Supabase Edge Function on Claude Haiku 5.5) is deployed and called at three moments:
- after a sprint starts (plan summary, start levels, preferred exercises)
- after a session with pain (a gentler level for the sore slots)
- after a retest (stay or switch, with a reason)

It never blocks the app. Every output is checked against what the rules allow: the coach can't raise a level after pain or invent an exercise.

**It has no API key yet**, so every call is logged as `fallback` and the rules version is used. To turn it on: `npx supabase secrets set ANTHROPIC_API_KEY=<key>`. Haiku 5.5 costs about $0.10 / $0.50 per million tokens. Add a per-user rate limit before a public launch; that's in the open items below.

## On-device checklist (about 10 min, TestFlight build 25)
1. **Start a sprint.** Take the baseline. Day 1 should show a "why today" line, levels on each exercise, and a plan summary under the pain point name.
2. **Weaker side.** If a test showed a left/right gap, that exercise logs the weaker side first and has one extra set on it. Check that the switch-sides timer goes the right way.
3. **Finish with effort and pain.** Pick "Easy" and pain 0, and do every set. Tomorrow that slot should be one step up.
4. **A pain day.** Finish a session with pain 6 or more. The next day those slots should be a step easier.
5. **Easier version.** Open swap on an exercise above level 1 step 1 and tap "Easier version". The dose should go down.
6. **Time range.** Change it in Settings. Tomorrow's day should be longer or shorter. Today's day is already built, so it won't change.
7. **Retest.** At day 15, take the retest and check the "What next" card. Try Stay: it should go straight to an active day 1 with no baseline.

## Where the content defaults live (please review)
All ladder, target and noise numbers are in `docs/superpowers/content/2026-11-12-engine/<pain_point>.md`, one file per sprint. Every number without a source is marked **DEFAULT — clinical judgment**; those are the ones worth your eye.
- To change numbers, edit `gen_engine_content.mjs` in that folder, re-run it, then push a new migration.
- Known content gaps from the build:
  - `fb-ankle-wrist`'s area misses wrist pain.
  - `sleeper_stretch_ir` is linked to external-rotation slots.
  - Elevated Pike Push-Up sits at Rounded Shoulders level 2.

## Verified
- jest 484/484 (6 live checks skipped by default), clean `tsc`, clean `expo export`
- **Live:**
  - `apps/mobile/lib/sprintEngine.live.test.ts` 6/6 as a throwaway user. It covers a lazy build, re-fetch, concurrent builds, a same-level swap, a step-down, pain areas, and all three coach triggers.
  - workouts 82/82, social 73/73, embed 11/11
  - `check_ladder_coverage` and `check_basic_coverage` both return 0 rows
- **Migrations live:** `20261112120000` (schema), `20261112130000` (content), `20261113120000` (`gap_back_applied`, `continue_sprint` carries it)
- **Review:** a whole-branch review found 5 important issues; all are fixed with tests, along with two smaller ones that affected you directly (pain without an effort answer, and a note typed on its own).

## Still open
**Done since (2026-11-13):** email sign-in works. Codes are sent through Gmail SMTP as "MoveMaxx" with 6-digit code templates, and a live test confirmed delivery and verification. This also unblocks a demo account for TestFlight's Beta App Review.

**Needs you:**
- install build 25 and run the checklist above
- decide on `ANTHROPIC_API_KEY`
- review the DEFAULT content numbers

**Deferred, small:**
- The day-build's state update and "progressed" marks aren't one transaction. A failure exactly between them could re-progress older days on retry.
- "Stay" doesn't first apply the old sprint's last day's feedback.
- A test entered with missing values can start a slot one step higher.
- The coach's stay/switch reply is checked once, at 5 s.
- `sprint-coach` needs a per-user rate limit before a public launch.
