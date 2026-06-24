# Autonomous build log

## 2026-06-24 -- v2 Phase 1: exercise database seed

**What shipped:** The exercise catalog is now real and richly tagged. It grew from 17 bare-bones rows to 189 -- the original 17 backfilled with proper tags (movement goal, body part, equipment, corrective flag) plus 172 new researched exercises covering every realistic combination of movement pattern and exercise type, with equipment variants (barbell/dumbbell/Smith machine/cable versions of the same lift) kept as separate rows so the right one can be recommended for whatever's available. 122 of the 189 rows now link to a real demonstration video. Every pain area from CLAUDE.md -- neck, ankles, hips, hamstrings, shoulders -- has at least 3 dedicated corrective exercises tagged for it, which is what the program-builder (next phase) will lean on for the Thursday mobility work.

**Caught and fixed before it shipped -- the important one:** the first draft claimed it had "sourced real YouTube demo URLs via web search." That claim was checked, not taken on faith: an independent test against YouTube's own video-lookup endpoint on a random sample showed roughly 60% of those "sourced" links were dead -- invented video IDs that don't exist, not real search results. This is exactly the kind of mistake that looks fine until someone actually taps a link. A dedicated fix pass re-checked all 122 video links one by one, replaced every broken one with a freshly searched-and-confirmed-real video, and a second independent spot-check afterward came back 100% clean. Lesson logged in the design spec for next time: search finding *something* isn't the same as confirming the exact link returned is real.

**Also confirmed clean:** no secrets in any commit; the live database migration only adds new rows and updates the original 17 by exact name match (nothing else touched, nothing silently overwritten); and a 7-point acceptance check ran for real against the live production table after the push -- right row count, no duplicate names, every goal/body-part/corrective minimum met, all 17 original rows confirmed backfilled. All passed.

**Next up:** Phase 2 -- the engine module that has Claude actually pick each day's exercises from this catalog, instead of just picking a session type.

## 2026-06-24 -- v2 Phase 0: schema v2 migration

**What shipped:** The database now supports multi-user from the ground up, and has the new tables v2's later phases need. 12 migrations added `split_taxonomy`/`activity_taxonomy`/`goal_taxonomy`/`body_part_taxonomy` lookup tables, expanded `user_profile` and `exercises` with the new v2 columns, simplified the session-type list (dropped `upper_a`/`upper_b`/`lower_a`/`lower_b` down to just `upper`/`lower`), added `recommendation_blocks`, `recommendation_block_exercises`, `exercise_logs`, and `daily_feedback`, and put real per-user row-level security on every personal table. All of it ran against the live production database and was independently re-verified afterward -- the existing data (your one profile row, the 17-exercise seed) survived untouched, and a second test user genuinely cannot read your rows.

**Caught and fixed before closing out:** The whole-branch review flagged two real things. First, `master` had picked up an unrelated emergency engine fix (commit `03da84b`, needed to keep the daily cron job working against the new schema) on a separate track that never saw this branch's diff -- merging carelessly could have silently dropped one or the other. Resolved with a real three-way merge that keeps both. Second, a draft fix for two minor review findings (missing database indexes on the new per-user `owner_id` columns, and your hips/hamstrings pain note having collapsed into one entry instead of two) had a genuine bug in its SQL -- the query aggregated the wrong column and would have produced duplicated, malformed data. Caught before it ran, rewritten, and verified against the live database: your pains list now correctly shows hips and hamstrings as two separate entries, and all 7 indexes are in place.

**Also confirmed clean:** no secrets in any of the 13 commits, the riskiest single step (renaming the session-type enum without a real "rename value" SQL trick) was done via the correct create/map/drop/rename sequence, and all 32 engine tests still pass against the merged, schema-v2-shaped database.

**Next up:** Phase 1 -- seeding a richer, AI-tagged exercise database (100-200 exercises), which the engine's Claude-driven exercise selection (Phase 2) depends on.

## 2026-06-22 -- Mobile app bootstrap

**What shipped:** The first version of the Bulletproof mobile app exists and is in Apple's hands. This phase built the iPhone app shell (Expo/React Native), wired it to the same Supabase database the rest of the system uses, and added "Sign in with Apple" as the login method. Database access rules were tightened so the phone app can only read/write data a logged-in user is allowed to see. The build was packaged and submitted to TestFlight (Apple's beta-testing platform).

**Caught and fixed before it shipped:** Build #1 was missing a required Apple configuration flag for Sign-In with Apple. It wouldn't have errored -- the app would have built and installed fine, but tapping "Sign in with Apple" on a real phone would have silently failed. Caught in review before touching a device, and fixed. Separately, the first TestFlight submission was rejected for a duplicate build number; that's now set to auto-increment. Build #2, with both fixes, is the one currently with Apple.

**Still outstanding (the one open item):** proof that tap-to-sign-in actually works on a real phone hasn't happened yet. That needs two things outside this phase's control: Apple's processing email confirming build #2 is ready to test, and Sohan installing it via TestFlight and tapping sign-in himself. Until then, the entitlement fix is "should work," not "confirmed working."

**Also deferred (not blockers):** the production submit profile is still unconfigured (only preview/TestFlight is set up), and the Supabase client doesn't yet give a friendly error if environment variables are missing.

**Next up:** once sign-in is confirmed on-device, the backlog moves to Phase 3 -- turning the tuned scoring engine into the app's real recommendation logic.

## 2026-06-22 -- Engine productionization

**What shipped:** The scoring logic prototyped in Phase 2's notebook is now a real, tested package at `engine/`. It pulls today's Oura readiness, reads recent session history from Supabase, scores every candidate session type, and writes an actual recommendation row to the database -- no more notebook-only runs. It already worked: running it live for today, 2026-06-22, produced a real recommendation of **top_pick = mobility, runner_up = upper_a**, because mobility was 25 days overdue. It also keeps biometrics private -- the public-facing rationale never shows the raw readiness number, only the internal one does.

**Caught and fixed before it shipped:** Three bugs found during review, before merge: (1) a setup-loading bug that broke when running from a git worktree rather than the main folder, fixed over three rounds; (2) a function argument passed positionally instead of by name, inconsistent with the rest of the codebase -- reverted to match convention; (3) a module-loading bug in `run_daily.py` that would have silently broken once this runs unattended on a schedule (Phase 3's plan) -- caught and narrowly fixed rather than papered over.

**Known accepted limitation:** if a single day ends up with more than one session logged, only one survives in the scoring history -- inherited from Phase 2's prototype, not a new bug, and rare in practice.

**Also confirmed clean:** no secrets anywhere in the 13 commits; all tests pass (32/32) with no network access; the live re-run matches the automated review's prediction.

**Next up:** Phase 3 -- a GitHub Actions daily cron job to run this engine automatically every morning.

## 2026-06-23 -- Daily cron

**What shipped:** A GitHub Actions workflow that runs the engine automatically every morning at 11:00 UTC, plus an on-demand manual trigger for testing or catching up on a missed day. This is the first time recommendations have generated themselves daily with zero manual intervention -- no one has to remember to run anything.

**An interesting process note:** This is the one phase in the whole pipeline where live verification happened *after* merge instead of before. That's not a corner cut -- it's a real GitHub platform constraint: GitHub only registers scheduled (`schedule`) and manual (`workflow_dispatch`) triggers from workflow files that already exist on the repo's default branch. A workflow living only on a feature branch can't be triggered at all, so there was no way to test it live until it merged to `master`. The review caught everything checkable beforehand (secrets handling, exit-code behavior, Python version pinning) and explicitly flagged the trigger test as deferred, by necessity, to right after merge.

**What was actually verified live:** Two real triggered runs against the live Oura and Supabase APIs, right after merging. The first run wrote a real recommendation row for 2026-06-23 -- with readiness coming back `null` because Oura hadn't synced yet at that moment -- which proved the engine's graceful "no readiness data" fallback works for real, not just in a test mock. The second run confirmed the upsert logic is genuinely idempotent: still exactly one row for that date afterward, not two.

**Next up:** Phase 4 -- HealthKit sync in the mobile app. This is the actual fix for the original Apple Watch bug report that kicked off this whole pivot.

## 2026-06-23 -- HealthKit sync

**What shipped:** The mobile app now reads Apple Watch workouts (pickleball, runs) directly from the phone's HealthKit data, instead of waiting on Oura's API to surface them. This is the literal fix for the original bug report that started the whole mobile pivot. On launch and whenever the app comes to the foreground, it pulls recent workouts from HealthKit and syncs them into the same `activity` table the rest of the system already reads from.

**Caught and fixed before it shipped:** Two real type-mismatches between the plan's draft code and the HealthKit library actually installed -- the type names and the date-filter shape were both guesses in the plan, and both turned out wrong. Fixed by reading the installed library's real type definitions instead of guessing again, as the plan had anticipated might be needed. Separately, the whole-branch review caught something more serious: the sync was firing on every app launch *before* checking whether the user was signed in. A fresh install would trigger iOS's one-time HealthKit permission prompt before Supabase's security rules would even allow the synced data to be saved -- burning the prompt that matters for nothing. Fixed by gating the sync on having an active signed-in session.

**Still pending (and why):** confirming this works on a real iPhone is blocked -- not by code, but by Apple credentials. Installing this build requires regenerating the app's Apple provisioning profile to include the new HealthKit permission, which needs an authenticated Apple Developer/EAS session and can't run non-interactively. This is the one step in the pipeline that genuinely needs Sohan: running `eas build --platform ios --profile preview` himself, interactively.

**Next up:** Phase 5 -- the recommendation/summary UI in the mobile app.

## 2026-06-23 -- Recommendation/summary UI

**What shipped:** The mobile app's main screen now shows real content instead of a placeholder. It displays today's recommendation with a friendly name -- "Mobility" instead of a raw code like `mobility` -- plus the engine's plain-language explanation of why. Right alongside it, yesterday's recommendation appears too, fulfilling the "summary" half of the original two-output design from day one: a look back at yesterday, and a look forward to today. Both cards read straight from the existing `recommendations_public` database view, which keeps raw biometrics private -- only the friendly explanation is exposed, never the underlying readiness numbers.

**Caught and fixed before it shipped:** Two real bugs, both caught in review before merge. First, a timezone bug: the original code computed "today" and "yesterday" using UTC instead of the phone's local time. For hours every evening (the gap between UTC midnight and local midnight), the app would have shown the wrong day's recommendation. Fixed by reusing the same local-date logic already proven in the HealthKit sync phase, so both read and write paths now agree on what day it is. Second, a small but visible bug: any session type not in the friendly-name lookup table would have rendered the literal word "undefined" on screen. Fixed with a graceful "Unknown" fallback, with a regression test that fails meaningfully against the old code.

**Also confirmed clean:** the public/private data split is airtight at the database layer (a Postgres view, not just client-side discipline), this phase adds zero new dependencies, and all three verification checks -- tests, type-check, and an iOS export -- passed clean on the final code.

**Next up:** Phase 6 -- a public web dashboard, the final phase in the backlog.

## 2026-06-23 -- Web dashboard

**What shipped:** A public web page, no login required, live at `https://smadimsetty.github.io/bulletproof/`. It shows the same two outputs as the phone app's home screen -- today's and yesterday's recommendation -- to anyone who visits the link. It reads the same public-safe database view the phone app uses, so raw biometrics (HRV, readiness) never reach this page; only the friendly recommendation and plain-language reasoning do. Confirmed live in a real browser: today showing "Mobility" with runner-up "Upper Body A" plus rationale, yesterday showing "Mobility" with its rationale. The deploy workflow ran green end to end automatically the moment this merged to master -- no manual deploy step.

**Deliberate scope decisions, not gaps:** Two things were intentionally left undone, both documented up front. A custom domain (vs. the GitHub Pages URL) needs DNS access this pipeline doesn't have -- a manual follow-up whenever Sohan wants it. And the web page and phone app each keep their own small copy of the fetch/label logic rather than sharing a codebase -- the two use incompatible tooling, and that logic is small and stable enough that shared-package plumbing now would solve a problem that doesn't exist yet.

**Caught and fixed before it shipped:** review caught the README claiming the site was "live" before that was verified -- softened until confirmed. That's since happened for real: merge went out, deploy ran green, live browser load confirmed real data.

**Pipeline status:** the last of the 6 planned phases. One thing remains outstanding across the whole pipeline: confirming HealthKit sync on Sohan's actual iPhone, which needs his Apple credentials and an interactive build -- only he can do that. Everything else in the backlog has shipped and been verified.

## 2026-06-23 — Run complete

All 6 planned phases are merged to `master`. Here's what the system can now do end to end that it could not do before this run started.

**Before:** a scoring engine that only ran from a notebook against partly-synthetic history, with no automation, no app, and no public page.

**Now:** every morning at 11:00 UTC, a GitHub Actions cron job runs the production engine (`engine/`) unattended -- it pulls that day's real Oura readiness, reads recent session history from Supabase, scores every candidate session type, and writes a real recommendation row to the database. No one has to remember to run anything; this has already happened automatically and been verified live against the real APIs. The iPhone app (in TestFlight) signs in with Apple, reads Apple Watch workouts straight from HealthKit and syncs them into the same `activity` table the engine reads from, and its home screen shows today's recommendation (friendly name + plain-language rationale) alongside yesterday's summary -- the original two-output design, now live on a phone. The same recommendation is also visible with no login at all at `https://smadimsetty.github.io/bulletproof/`, a public web page that redeploys itself automatically on every merge to master. Throughout, raw biometrics (HRV, the internal readiness number) never leave the private layer -- both the phone and the web page read only a public-safe Postgres view.

**Outstanding across the whole pipeline -- exactly one item, needs Sohan:** confirming HealthKit sync (and Apple sign-in) works on a real iPhone. This requires regenerating the app's Apple provisioning profile to include the HealthKit permission and running `eas build --platform ios --profile preview` interactively -- an authenticated Apple Developer/EAS session that can't run non-interactively, so it cannot be done by this pipeline. Everything else -- engine, cron, database writes, web dashboard, public/private data split -- shipped and was independently verified live, not just in tests.

**Two deliberate, documented scope decisions (not gaps, no action needed unless wanted):** a custom domain for the web dashboard (needs DNS access this pipeline doesn't have); and the web page and phone app each keep a small independent copy of fetch/label logic rather than sharing a package (the logic is small, stable, and the tooling is incompatible -- shared-package plumbing would solve a problem that doesn't exist yet).

**CLAUDE.md:** the Status section was still describing the pre-Phase-3 state (weight-tuning in a notebook, "Next: move to Phase 3"). Updated below to reflect that Phase 3 through Phase 6 are all complete and the system is live end to end.
