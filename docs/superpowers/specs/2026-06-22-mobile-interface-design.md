# Mobile interface pivot — design spec

## Background

Phase 2 (weight-tuning) surfaced a data-ingestion bug report: Apple Watch
workouts are not appearing in the `activity` table. Root-cause investigation
(see below) found this is not a bug in our pipeline — it's an Oura platform
limitation. That finding motivated a broader architecture decision: build a
phone app that reads Apple Health (HealthKit) directly, sidestepping Oura's
API for workout data, and make that phone app the primary interface instead
of the web app originally planned in `CLAUDE.md`.

### Root cause of the missing-workouts bug

- Queried the live `activity` table: every workout row in the last 3 weeks
  has `source: "confirmed"` or `source: "workout_heart_rate"` — both are
  Oura-ring auto-detections. Zero rows from any other source.
- Queried Oura's `/v2/usercollection/workout` API directly (bypassing our
  ingestion code entirely) for the same window — identical result. This
  rules out a bug in `oura_pull.py` / `oura_client.py`: the data simply
  isn't present in Oura's API response.
- Confirmed with the user that the missing Apple Watch workouts **are**
  visible in the Oura iPhone app's timeline, but **none** of them appear via
  the public API. So the gap is specifically: Oura's public API does not
  expose Apple Health-imported workouts, even though the Oura app itself
  has them.
- Oura's own support docs say the Apple Health import requires both apps to
  be opened before midnight on the day of the workout (a one-shot, same-day
  pull, not a backfill) — but since the user confirmed the workouts already
  show in the Oura app, that's not the limiting factor here; the limiting
  factor is the public API not surfacing Apple Health-sourced workout
  records the way it surfaces ring-detected ones.

**Conclusion:** this cannot be fixed by changing our ingestion code. The fix
is to stop depending on Oura's API for workout data and read HealthKit
directly instead.

## Goals

- Get accurate Apple Watch workout data into the system, read directly from
  HealthKit instead of via Oura's API.
- Make a phone app the primary interface: it shows yesterday's summary and
  today's recommendation, the same job the web app was originally planned to
  do.
- Keep a public, read-only web presence for sharing/portfolio purposes,
  built on top of the same backend data — not a from-scratch second product.
- Do this in phases: phone app first, web dashboard second.
- Claude Code (via agents) writes all the code. No personal Swift authorship,
  no local Xcode/Mac use for development or building.

## Non-goals (explicitly out of scope for this spec / Phase A)

- The web dashboard build itself (Phase B — a later spec).
- Historical HealthKit backfill (filling 2024–2025 gaps where Oura missed
  Apple Watch workouts). Possible later, not blocking.
- Android support — single iPhone user, no current need.
- Multi-user support — schema stays single-user-shaped per the existing
  `CLAUDE.md` principle ("design for multi-user later, don't build it yet").

## Approach

### Phone app stack: React Native + Expo, cloud-built

Considered three approaches:

1. **React Native + Expo (chosen)** — TypeScript app, built via Expo
   Application Services (EAS) in Expo's cloud (no Mac/Xcode touches the
   user's machine), using a community HealthKit module (e.g.
   `react-native-health`) to read workouts. Distributed via TestFlight.
   Fastest to iterate on with an agent; HealthKit workout reads are a
   well-trodden case for this ecosystem.
2. **Capacitor (web tech) + GitHub Actions macOS CI** — same shape, web-tech
   shell instead of React Native, CI runs `xcodebuild`. More CI plumbing to
   stand up before the first build succeeds, and Capacitor's HealthKit
   plugins are less maintained than the RN ones. No real advantage over (1)
   for this use case.
3. **Native SwiftUI, agent-written, CI-built** — most direct HealthKit
   access (no wrapper), but slower to iterate on with an agent than a single
   TypeScript app, and the signing/CI setup is the same complexity as (2).

Rejected (2) and (3) — no upside over (1) given the constraints, and (1)
keeps the codebase in one language Claude Code is fastest in.

The user has agreed to enroll in Apple's Developer Program ($99/yr), which
is required regardless of toolchain choice to get a HealthKit entitlement
approved and to install a custom app on the phone via TestFlight.

### Architecture

```
Apple Watch ──▶ Apple Health (HealthKit)
                      │
                      ▼
        ┌─────────────────────────┐
        │   Phone app (Expo/RN)   │◀── Supabase Auth (Apple Sign-In)
        │  - reads HealthKit      │
        │  - pushes workouts      │
        │  - shows summary +      │
        │    today's rec          │
        └───────────┬─────────────┘
                     │ (authenticated, RLS-scoped)
                     ▼
              Supabase (Postgres)
         recovery / activity / sessions
         recommendations / user_profile
                     ▲
                     │ (service-role key, trusted server job)
        ┌────────────┴─────────────┐
        │  Python engine (cron)    │── pulls Oura + reads sessions,
        │  scoring.py → engine/    │   writes today's recommendation
        └──────────────────────────┘
                     │
                     ▼
        Web dashboard (Phase B) — reads `recommendations_public`
        view only, public/portfolio-facing, no write access
```

### Components & data flow

- **Phone app (Expo/React Native)**: on launch/background refresh, reads new
  HealthKit workout samples since the last sync and upserts them into
  `activity`/`sessions`. Renders the latest row from `recommendations` (the
  full row, not the public view — the app is the private/authenticated
  surface) plus a summary of yesterday.
- **Engine**: stays Python, stays a scheduled job, but now needs a concrete
  host instead of the vague "runs each morning" from the original
  `CLAUDE.md` plan. Recommended: a **GitHub Actions scheduled workflow**
  (free, no new infra account) running the existing `engine/` code each
  morning — pulls Oura, reads `sessions`, writes one row to `recommendations`
  using the service-role key. This job is server-side and trusted; the key
  never leaves GitHub's runner.
- **Web dashboard (Phase B)**: a lightweight site reading only
  `recommendations_public` — no auth, no write path. Matches the "public +
  portfolio piece" goal from the original `CLAUDE.md` plan without touching
  biometrics. The view already exists from Phase 0/1; no schema change
  needed for this part.

### Security model change (new work, in scope for Phase A)

Current state: all existing scripts (`oura_pull.py`,
`build_session_candidates.py`, etc.) use the Supabase **service-role key**,
which fully bypasses RLS. That's acceptable for trusted server-side scripts
that never leave the developer's machine or a CI secret store. It is **not**
acceptable to embed in a phone app binary distributed via TestFlight —
anyone who decompiles it gets full read/write access to the entire database.

Changes required:

- Add Supabase Auth (Apple Sign-In — no extra login UI needed, fits an
  iOS-only single-user app) as the phone app's identity.
- Add RLS policies granting the `authenticated` role read/write on
  `recovery`, `activity`, `sessions`, and read on `recommendations`.
  Single-user for now: no per-row `owner_id` column needed yet, consistent
  with the existing "design the schema for multi-user later, don't build it
  yet" principle — there's still only one real account.
- The service-role key stays server-side only (a GitHub Actions secret for
  the engine job) — it never ships in the app bundle.
- `recommendations_public`'s existing grant to `anon, authenticated` stays
  as-is for the future web dashboard; it doesn't need the new RLS policies
  above since it's a view with its own column allowlist already audited in
  Phase 0/1.

## Testing / verification plan

- Unit tests for the HealthKit → Supabase row-mapping logic, mirroring the
  existing `to_activity_row` / `to_recovery_row` pattern from the Python
  prototype (`prototyping/weight-tuning/oura_pull.py`).
- Manual verification via a TestFlight build: log a workout on Apple Watch,
  confirm it lands in `activity` within the app's sync window, and confirm
  this works with Oura entirely out of the loop (e.g. airplane-mode the
  Oura app, or just check the row's source/provenance field).
- Engine job verified by checking GitHub Actions run logs and confirming a
  new row appears in `recommendations` each morning.

## Open questions for the implementation plan (not blocking this spec)

- Exact HealthKit query scope/permissions to request (workouts only, or
  also active-energy/heart-rate for richer activity rows).
- Background sync mechanism on iOS (background app refresh has OS-level
  limits) vs. foreground-triggered sync — needs investigation during
  implementation, not a design-level blocker.
- Whether the phone app talks to Supabase directly via `supabase-js`, or
  through a thin Edge Function — default to direct `supabase-js` (matches
  the existing "engine is disposable, data model is permanent" philosophy
  and avoids adding a server component that isn't otherwise needed).
