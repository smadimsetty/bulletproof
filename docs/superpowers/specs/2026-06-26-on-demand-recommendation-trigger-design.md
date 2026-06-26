# On-demand recommendation trigger — design spec

## Background

Today's program is only generated once a day, by `daily-cron.yml` firing
`python -m engine.run_daily` at a fixed `11:00 UTC`
(`docs/superpowers/specs/2026-06-22-daily-cron-design.md`). That time was
chosen as "comfortably past a typical US wake time, with buffer for Oura
sync lag" — a guess, not a measurement. In practice Sohan often syncs Oura
(sleep, HRV, readiness) and wants to see today's program well before
11:00 UTC, and the fixed schedule means there's no way to see it sooner
without manually running the workflow.

Two adjacent ideas were considered and rejected during brainstorming:

- **Reading recovery data from Apple HealthKit instead of Oura's API.**
  Rejected: Oura's proprietary readiness score — the actual gating signal
  `engine/scoring.py` depends on — never syncs to Apple Health, only its
  raw inputs (HRV, resting heart rate, sleep stages) do. Re-deriving our
  own readiness score from those raw values would mean replacing a
  validated algorithm with a guess, for a safety-relevant gate (it's also
  the injury guardrail for the neck/ankle history in `CLAUDE.md`). Out of
  scope here.
- **True Oura webhooks.** Rejected for now: requires migrating off the
  personal access token (reportedly deprecated for new integrations as of
  Dec 2025) to a full OAuth2 app registration, plus a public HTTPS
  receiver that validates Oura's webhook signature. Real infra lift for a
  personal project; revisit only if polling/on-demand proves insufficient.

This spec also surfaced a second, separate gap — "yesterday's summary" is
actually just yesterday's *recommendation* (the forecast made that
morning) redisplayed, not a real look back at what happened (logged sets,
felt rating, actual sleep). That's being deliberately deferred to its own
follow-up design; this spec is scoped to *when* today's recommendation
gets computed, not what data backs the "yesterday" text.

## Goals

- See today's program within roughly a minute of opening the mobile app
  after syncing Oura, instead of waiting for the 11:00 UTC cron — without
  needing OAuth2/webhook infra.
- Keep the engine's actual logic (Oura pull, scoring, Claude program
  generation, fallback template) completely unchanged — this is a trigger
  problem, not a logic problem.
- Make cron and on-demand triggers safely coexist: whichever fires first
  for a given day does the real work; any later trigger for the same day
  is a cheap no-op, never a duplicate Claude API call or a silently
  different program overwriting one the user already saw.
- Mobile app only. The public, no-login web dashboard
  (`https://smadimsetty.github.io/bulletproof/`) keeps reading
  passively — it must not be able to trigger a GitHub Actions run or
  spend Anthropic API budget from an unauthenticated request.

## Non-goals

- Any change to `engine/scoring.py`, `program_builder.py`, or how
  readiness is computed — only `run_daily.py`'s entrypoint gets a new
  early-exit guard.
- Multi-provider recovery ingestion (Whoop, Apple Watch/HealthKit as a
  readiness source for other users). Explicitly split off as its own
  future design per the brainstorming conversation.
- An outcomes-based "yesterday" summary (logged sets, felt rating, actual
  sleep vs. forecasted). Also split off as its own future design.
- True Oura webhooks / OAuth2 migration (see Background).
- Any change to the web dashboard (`apps/web/`) or its deploy workflow.
- Retiring the 11:00 UTC cron. It stays as the backstop for days the app
  is never opened before then.

## Approach

```
Mobile app: Home screen mounts, or app comes to foreground
        │
        ▼
homeProgram.fetchHomeData() -- already-existing authenticated read of
the `recommendations` table (RLS-scoped to the owner), now also
selecting `score_breakdown`
        │
        ▼
today row missing, OR today.score_breakdown.readiness is null?
        │
   ┌────┴────┐
   no         yes  ("provisional" -- either nothing generated yet, or an
   │           │    earlier run today only got a null-readiness fallback
   │           │    because Oura hadn't synced yet)
   ▼           ▼
render it   show "Building today's program…", call
            supabase.functions.invoke('trigger-daily-engine'),
            subscribe to Realtime on `recommendations` filtered to
            today's date, re-run fetchHomeData() when a row event
            arrives (90s timeout -> "still working on it, pull to
            refresh")
                  │
                  ▼
            Edge Function `trigger-daily-engine` (requires a signed-in
            session -- rejects unauthenticated calls):
            POST https://api.github.com/repos/smadimsetty/bulletproof/
                 actions/workflows/daily-cron.yml/dispatches
            using a GitHub PAT held only as an Edge Function secret
                  │
                  ▼
            GitHub Actions runs engine/run_daily.py exactly as the cron
            does today. New first step: query `recommendations` for
            today; if a row already exists with non-null
            score_breakdown.readiness, log and exit 0 immediately --
            otherwise proceed with the existing Oura pull / scoring /
            Claude call / upsert, unchanged.
```

### Components

1. **`engine/run_daily.py`** — one new guard at the top of `main()`: a
   single `supabase_client.get("recommendations", ...)` call for today's
   `score_breakdown`; if it exists and `readiness` is non-null, print and
   return before touching Oura or Claude. This is what makes cron and
   on-demand safe to coexist regardless of which fires first or how many
   times either fires.

2. **New Supabase Edge Function `supabase/functions/trigger-daily-engine/`**
   — a thin relay, not a reimplementation. Requires the default Supabase
   JWT verification (signed-in session only — this is what keeps it
   mobile-app-only; the web dashboard never calls it). Reads `GITHUB_PAT`
   from its own environment (set via `supabase secrets set`, never shipped
   to any client) and fires a `workflow_dispatch` REST call against the
   existing `daily-cron.yml` workflow (already supports `workflow_dispatch`
   — no workflow YAML changes needed). Fire-and-forget: returns as soon as
   GitHub accepts the dispatch, does not wait for the run to finish.

3. **`apps/mobile/lib/homeProgram.ts`** — `fetchRecommendationRow` adds
   `score_breakdown` to its select; `TodayProgram` gains
   `isProvisional: boolean` (`score_breakdown.readiness == null`). No
   database migration needed — this is the existing owner-scoped
   authenticated read of the base table, which already carries
   `score_breakdown`; `recommendations_public` (the anon-readable view)
   is untouched.

4. **New `apps/mobile/lib/engineTrigger.ts`** — `triggerDailyEngine()`
   wraps `supabase.functions.invoke('trigger-daily-engine')`, swallowing
   and logging errors the same way `healthkitSync.ts`'s calls already do
   (non-fatal — a failed trigger just means the user sees the existing
   "hasn't generated yet" state and can pull-to-refresh).

5. **`apps/mobile/app/(tabs)/index.tsx`** — after `load()`, if
   `!homeData.today || homeData.today.isProvisional`:
   - call `triggerDailyEngine()` once per "provisional" state (a ref guard
     prevents re-firing while a trigger is already in flight or already
     fired for this provisional state),
   - subscribe to a Realtime channel on `recommendations` filtered to
     today's date, calling `load()` again on any insert/update and then
     unsubscribing,
   - add a 90s timeout that stops waiting and surfaces a "still working on
     it — pull to refresh" affordance instead of spinning indefinitely,
   - add an `AppState` foreground listener that re-runs `load()` (mirrors
     the existing pattern already in `app/_layout.tsx` for HealthKit sync)
     so reopening the app after syncing Oura re-checks without restarting
     it.
   While waiting, the "Today's Program" card shows "Building today's
   program…" instead of "Today's program hasn't generated yet."

### What stays exactly the same

- `daily-cron.yml`'s schedule and steps — unchanged, still the backstop.
- All engine logic downstream of the new guard — Oura pull, scoring,
  Claude call, fallback template, upsert shape.
- The web dashboard and `recommendations_public` — no changes, no new
  trigger capability, no new columns.
- `apps/mobile/lib/recommendations.ts` / `app/_layout.tsx`'s existing
  (currently unused) recommendations fetch — noticed as dead code during
  this work (fetched, stored, never rendered by any screen) but left
  alone; out of scope for this change, flagged here for visibility rather
  than bundled in.

## Error handling & edge cases

- **GitHub API dispatch fails** (bad/expired PAT, rate limit, network):
  Edge Function returns an error; app falls back to its existing
  "hasn't generated yet" / pull-to-refresh state — never worse than
  today's behavior.
- **Oura still has no data when the triggered run fires** (opened the app
  before syncing): engine writes today's existing `readiness=None`
  fallback row, exactly as it does today. Because the guard's condition is
  "non-null readiness," this row is still "provisional" — the next
  foreground/open after actually syncing Oura will trigger again.
- **Rapid repeated foreground/open while a trigger is in flight**: a
  client-side ref flag (not just the engine's own guard) avoids firing a
  second Edge Function call while one is already pending for the current
  provisional state, keeping it to at most one GitHub Actions run + one
  Claude call per real state transition.
- **Realtime subscription never fires** (connection drop, backgrounded
  too long): 90s timeout surfaces a manual retry affordance rather than an
  indefinite spinner.
- **Claude call fails inside the triggered run**: unchanged existing
  behavior — `program_builder.py` already falls back to the deterministic
  template; the on-demand path degrades exactly like the cron always has.

## Manual steps (need Sohan)

- Generate a fine-grained GitHub PAT scoped to `actions:write` on
  `smadimsetty/bulletproof` only, and set it as a Supabase Edge Function
  secret (`supabase secrets set GITHUB_PAT=...`). Cannot be done
  non-interactively — requires his GitHub account.

## Testing

- `engine/tests/test_run_daily.py`: new test(s) for the guard — given an
  existing today row with non-null `score_breakdown.readiness`, `main()`
  exits without calling Oura/program_builder; given a missing row or a
  null-readiness row, it proceeds as today.
- Mobile: unit tests for `homeProgram.ts`'s new `isProvisional` derivation
  and `engineTrigger.ts`'s error-swallowing, following existing test
  patterns in `apps/mobile/lib/*.test.ts`.
- The Edge Function itself is verified operationally (per this project's
  established pattern for CI/infra-level changes) — manually invoke it
  against a real signed-in session and confirm a real GitHub Actions run
  starts, rather than unit-testing Deno code in isolation.
