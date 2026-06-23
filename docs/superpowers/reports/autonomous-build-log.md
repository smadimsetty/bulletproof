# Autonomous build log

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
