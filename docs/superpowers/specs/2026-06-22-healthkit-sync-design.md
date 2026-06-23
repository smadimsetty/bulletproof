# HealthKit → Supabase sync — design spec

## Background

The mobile interface pivot
(`docs/superpowers/specs/2026-06-22-mobile-interface-design.md`) exists
because Oura's public API does not surface Apple Health-imported workouts
the way it surfaces ring-detected ones — Apple Watch workouts (pickleball,
running) were silently missing from the `activity` table. The fix decided
there was to stop depending on Oura's API for workout data and read
HealthKit directly from a phone app instead.

The mobile app bootstrap plan
(`docs/superpowers/plans/2026-06-22-mobile-app-bootstrap.md`) shipped the
skeleton this phase builds on: a TestFlight-distributed Expo (SDK 56,
React Native 0.85.3, React 19.2.3) app at `apps/mobile/`, with Apple
Sign-In wired to Supabase Auth (`apps/mobile/App.tsx`,
`apps/mobile/lib/supabase.ts`), `AsyncStorage` already a dependency
(`@react-native-async-storage/async-storage`, used today for the Supabase
auth session), and RLS policies already live granting the `authenticated`
role full read/write on `recovery`/`activity`/`sessions`
(`supabase/migrations/20260622120000_add_authenticated_rls_policies.sql`,
renamed to snake_case in `20260622130000_rename_authenticated_rls_policies.sql`).
That work has already been submitted to TestFlight twice — this phase adds
a real feature on top of a verified-working app, not a fresh scaffold.

The autonomous build pipeline design
(`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`)
sequences this as backlog item 4 ("HealthKit → Supabase sync... the actual
fix for the Apple Watch workout gap that started this whole pivot"), after
the engine and daily cron (items 2–3, both already shipped) and before the
recommendation/summary UI (item 5) that will eventually share screen space
with this sync.

This phase researches and confirms a community HealthKit module compatible
with Expo SDK 56 (the app's actual installed version, per
`apps/mobile/package.json`: `"expo": "~56.0.12"`), then adds the
read-workouts-and-upsert-to-`activity` flow.

## Goals

- Read HealthKit workout samples (type, start/end time, energy burned,
  distance) from the phone, on app launch and on every foreground
  transition.
- Track a per-device "last synced" timestamp so each sync only fetches
  workouts since the previous run, not the device's entire HealthKit
  history every time.
- Map fetched workout samples into the shape of the existing `activity`
  table (`supabase/migrations/20260622022456_create_activity.sql`),
  mirroring the field-by-field mapping pattern already established in
  `prototyping/weight-tuning/oura_pull.py`'s `to_activity_row` (adapted for
  HealthKit's fields instead of Oura's).
- Upsert those rows into `activity` via the existing authenticated
  Supabase client (`apps/mobile/lib/supabase.ts`), relying on the RLS
  policies already live from the bootstrap plan's Task 2 — no new RLS
  work needed in this phase.
- Request only the HealthKit permissions this feature actually needs
  (workouts, plus a small number of workout-adjacent quantity types — see
  Decisions) — not a broad, unscoped permission grab.
- Make the testing section explicit about the hard boundary: anything
  involving a real HealthKit permission prompt or real workout data
  requires a physical iPhone with a Custom Dev Client / EAS build, full
  stop. Design verification around what's actually checkable without one
  (TypeScript compilation, `expo-doctor`, `expo export` bundling — the same
  pattern already used in the bootstrap plan's Tasks 3 and 7 for "no
  physical device available" gracefully).

## Non-goals

- Historical HealthKit backfill (pulling years of past workouts). Out of
  scope per the mobile interface design spec's own non-goals — this phase
  only syncs forward from first launch.
- Reading or writing `sessions` from the phone app. HealthKit workouts map
  to `activity` (auto-detected activity data), exactly the same table Oura
  workouts already write into — not `sessions`, which is confirmed
  training history with its own `session_type` enum and a
  `recommendation_id` foreign key the engine manages. Mixing the two would
  blur a distinction the schema already draws cleanly.
- Background (non-foreground) sync via iOS Background App Refresh,
  HealthKit background delivery, or silent push. Out of scope for this
  phase — see Decisions for why foreground-triggered sync is sufficient
  for now and what's deferred.
- Android / Health Connect. Single iPhone user, no current need, consistent
  with the mobile interface design spec's standing non-goal.
- Any change to the `activity` table schema. The existing columns
  (`activity_score`, `total_calories`, `active_calories`, `steps`,
  `*_activity_time`, `sedentary_time`, `workout_count`, `workouts` jsonb)
  are reused as-is; HealthKit-sourced rows populate a subset of them (see
  Decisions for exactly which).
- Conflict resolution between an Oura-sourced `activity` row and a
  HealthKit-sourced one for the same date beyond a simple upsert-wins
  strategy (see Decisions) — reconciling/merging both sources' data for a
  single day is a future refinement, not blocking this phase.
- The recommendation/summary UI that will eventually render this data
  (backlog item 5 — a separate, later spec/plan).

## Decisions

Ambiguities resolved here since no clarifying questions could be asked
mid-build (per the autonomous pipeline's "no mid-run questions" rule):

### 1. Module choice: `@kingstinct/react-native-healthkit`

Researched three candidates against the app's actual Expo SDK 56 / RN
0.85.3 / React 19.2.3 / New Architecture-always-on baseline (confirmed via
`apps/mobile/package.json` and Expo's own SDK 55+ release notes — the New
Architecture is mandatory and cannot be disabled from SDK 55 onward):

- **`@kingstinct/react-native-healthkit` (chosen, v14.0.2 as of this
  writing, released June 2026)** — TypeScript-first, actively maintained
  (latest release is days old relative to this phase), ships an Expo
  config plugin (`app.plugin.js`) so no manual Xcode/`Info.plist` editing
  is needed beyond what the plugin's `app.json` config generates, and its
  peer dependency `react-native-nitro-modules` requires the New
  Architecture — which is a non-issue here since Expo SDK 55+ runs on the
  New Architecture unconditionally. Confirmed via the package's actual
  published source (`src/healthkit.ios.ts`, `src/types/Workouts.ts`,
  `src/types/Auth.ts`, `src/generated/healthkit.generated.ts`) that it
  exports exactly what this feature needs: `requestAuthorization({ toRead:
  [...] })`, `queryWorkoutSamples(options)`, `isHealthDataAvailable()`, a
  `WorkoutSample` type with `startDate`/`endDate`/`uuid`/
  `workoutActivityType`/`duration`/`totalEnergyBurned`/`totalDistance`
  fields, and a complete numeric `WorkoutActivityType` enum (`running =
  37`, `pickleball = 79`, `traditionalStrengthTraining = 50`,
  `functionalStrengthTraining = 20`, `crossTraining = 11`, `walking = 52`,
  `yoga = 57`, `flexibility = 62`, `hiking = 24`, etc. — 75+ values,
  `other = 3000` as the catch-all).
- **`EvanBacon/apple-health` (rejected)** — also Expo-native (config
  plugin, `npx expo install`), but its maintenance cadence and release
  history are much less certain from public signals than Kingstinct's
  versioned, dated npm releases. No clear advantage over the chosen
  package for this use case, and choosing the less-certain option adds
  risk for no benefit.
- **`react-native-health` (agencyenterprise) (rejected)** — the
  older/more established library by reputation, but it predates the
  TypeScript-first, Nitro-modules-based rewrite ecosystem and its Expo
  config-plugin story is less first-class (historically required more
  manual `Info.plist`/Xcode steps per its own `docs/Expo.md`). Since the
  app is already on SDK 56 + New Architecture, there's no reason to take on
  a less Expo-native integration path.

**Consequence:** this requires a Custom Dev Client (EAS build), never
Expo Go — `react-native-nitro-modules` and the HealthKit native module it
binds are compiled native code, and Expo Go's sandboxed runtime only
includes the fixed set of modules Expo ships with it. This is stated
explicitly in Testing below and is not a surprise this phase discovers
later; it's true of every native-module addition the bootstrap plan's
Task 8 already anticipated when setting up EAS/TestFlight in the first
place.

### 2. HealthKit data types requested: workouts plus three workout-adjacent quantity types

`requestAuthorization` is called once, at the point in Decision 6, with:

```ts
toRead: [
  WorkoutTypeIdentifier,                          // 'HKWorkoutTypeIdentifier'
  QuantityTypeIdentifier.activeEnergyBurned,
  QuantityTypeIdentifier.distanceWalkingRunning,
  QuantityTypeIdentifier.stepCount,
]
```

Rationale: the feature's job is to populate `activity` rows shaped like
`to_activity_row`'s existing Oura mapping, which already has columns for
`total_calories`, `active_calories`, `steps`, and per-workout `calories`/
`distance`. `WorkoutSample.totalEnergyBurned` and
`WorkoutSample.totalDistance` (both already embedded on the workout object
itself, no separate quantity query needed) cover the per-workout
`calories`/`distance` fields directly. The three extra quantity-type read
permissions are requested defensively for forward compatibility (a future
phase may want `activity_score`/`steps`/day-level `total_calories` sourced
from HealthKit too) but **this phase does not query them** — only
`workout` samples are actually fetched and written. Requesting unused
permissions up front, once, avoids a second permission-prompt interruption
later without doing speculative query/mapping work now. Sleep and heart
rate are deliberately not requested — those belong to `recovery`, which
stays Oura-sourced per the existing architecture; this phase is scoped to
`activity` only.

### 3. Sync trigger mechanism: foreground-only, no background delivery

iOS Background App Refresh is opportunistic and OS-scheduled (no
guaranteed cadence, and historically unreliable for apps used
infrequently), and HealthKit's own background-delivery API
(`enableBackgroundDelivery`, present in the chosen module) requires the
`com.apple.developer.healthkit.background-delivery` entitlement and a
background mode capability — meaningfully more setup (entitlements,
`AppDelegate`-level background task registration) for a single-user app
that's already opened daily anyway (it is, after all, the screen that's
going to show "today's recommendation," per the mobile interface design's
stated goal). Decision: sync fires on two triggers only —

- App launch (`useEffect` with an empty dependency array, same lifecycle
  point the existing `App.tsx` already uses for `supabase.auth.getSession()`).
- Every foreground transition, via React Native's `AppState` API listening
  for `'active'`.

This means: if the user never opens the app on a given day, that day's
workouts simply sync the next time they do — acceptable for a
recommend-and-review tool whose own primary screen requires opening the
app anyway. Background delivery is left as a clearly-flagged future
enhancement, not built here.

### 4. Last-synced timestamp: AsyncStorage, ISO-8601 string, per-device (not per-account)

Key name: `@bulletproof/healthkit-last-synced` (namespaced with the `@`
prefix convention already implicit in the npm scope naming used elsewhere
in this repo, and explicit enough to never collide with Supabase's own
AsyncStorage keys, which it manages itself for the auth session under
`sb-<project-ref>-auth-token`-style keys — confirmed there's no
collision risk since that key is entirely different in shape).

Stored as an ISO-8601 string (`new Date().toISOString()`), not a raw
epoch number — directly compatible with `queryWorkoutSamples`'s filter
predicate shape (`startDate`-style `Date` comparisons) without a parse step
on write, and human-readable if ever inspected via Flipper/React Native
DevTools during debugging.

This is intentionally **device-local, not account-synced**: it lives in
AsyncStorage, not in a Supabase table. For a single-user, single-device
app this is simplest and sufficient. A second device (e.g. a second
iPhone, or a reinstall) would naively re-fetch the device's full HealthKit
workout history on first sync — acceptable because the upsert into
`activity` is keyed on `date` (the table's existing `unique` constraint),
so a redundant re-fetch produces redundant-but-harmless upserts, not
duplicate rows or errors. This is the same idempotency property
`engine/run_daily.py` already relies on for its own `recovery`/
`recommendations` upserts.

### 5. Mapping HealthKit workouts onto `activity`'s shape: one row per day, `workouts` jsonb array, source `"healthkit"`

Mirrors `to_activity_row`'s shape field-for-field, with HealthKit's fields
substituted for Oura's:

| `activity` column | Oura source (`to_activity_row`) | HealthKit source (this phase) |
|---|---|---|
| `date` | `activity_rec["day"]` | the local calendar date of the workout's `startDate` |
| `activity_score` | `activity_rec["score"]` | `null` (HealthKit has no equivalent single score) |
| `total_calories` | `activity_rec["total_calories"]` | `null` (not queried this phase — see Decision 2) |
| `active_calories` | `activity_rec["active_calories"]` | `null` (not queried this phase) |
| `steps` | `activity_rec["steps"]` | `null` (not queried this phase) |
| `high_activity_time` / `medium_activity_time` / `low_activity_time` / `sedentary_time` | Oura daily activity breakdown | `null` (HealthKit has no direct equivalent without a separate, unrequested computation) |
| `workout_count` | `len(day_workouts)` | count of HealthKit workout samples on that date |
| `workouts` | list of `{activity, intensity, calories, distance, start_datetime, end_datetime, source}` | list of `{activity, intensity, calories, distance, start_datetime, end_datetime, source}` — same shape, populated per-field below |

Per-workout field mapping (inside the `workouts` jsonb array, matching
`to_activity_row`'s inner dict shape exactly so existing/future readers of
this column don't need a source-specific branch):

- `activity`: `WorkoutActivityType[sample.workoutActivityType]` (the enum
  member's string name, e.g. `"pickleball"`, `"running"`,
  `"traditionalStrengthTraining"`) — chosen over the raw numeric code
  because it's self-describing in the jsonb without a lookup table, and
  matches Oura's `activity` field already being a human-readable string
  (e.g. `"pickleball"`, `"running"` — confirmed these are exactly the
  string forms Oura's auto-detection already uses, per `CLAUDE.md`'s "Oura
  genuinely auto-detects `pickleball` and `running` as named workout
  activities" note, so this phase's strings are consistent with the
  existing data already in the column for past dates).
- `intensity`: `null`. Oura's `intensity` field comes from its own
  proprietary scoring; HealthKit's `WorkoutSample` has no equivalent
  field, and inventing one (e.g. deriving it from energy burned per
  minute) is explicitly out of scope — a future enhancement, not a gap
  this phase needs to paper over with a guess.
- `calories`: `sample.totalEnergyBurned?.quantity ?? null` (the
  `Quantity` type is `{ unit: string, quantity: number }`; `unit` is not
  stored, matching Oura's `calories` field which is also a bare number with
  an implicit kcal unit).
- `distance`: `sample.totalDistance?.quantity ?? null`.
- `start_datetime` / `end_datetime`: `sample.startDate.toISOString()` /
  `sample.endDate.toISOString()`.
- `source`: the literal string `"healthkit"` — distinct from Oura's
  existing `"confirmed"` / `"workout_heart_rate"` source values, so any
  future reconciliation logic (explicitly out of scope here, per
  Non-goals) can tell HealthKit-sourced entries apart from Oura-sourced
  ones within the same `workouts` array.

**Same-day conflict handling:** the upsert is a plain
`conflict_column: "date"` upsert exactly like `oura_pull.py`'s existing
pattern (`supabase_client.upsert("activity", rows, conflict_column="date")`)
— **whichever source writes last for a given date wins the whole row**,
it does not merge the two sources' `workouts` arrays. Since this app is
now the only thing reading real Apple Watch workout data (the entire
reason for this pivot) and Oura's pull script
(`prototyping/weight-tuning/oura_pull.py`) is not on an automatic
schedule (it's the Phase 2 prototype, run manually), in practice this
phase's writes are expected to be the freshest and most complete for any
date going forward. True multi-source merging is flagged as a Non-goal,
not solved here.

### 6. Permission request timing and crash-avoidance: request before first query, every launch, idempotently

The chosen module's own README is explicit that calling a query function
before `requestAuthorization` has resolved **crashes the app** — not a
soft error. The sync flow is therefore structured as: on every app launch
and foreground transition, first call `requestAuthorization({ toRead: [...]
})` (an idempotent operation — iOS only shows the system permission sheet
the first time per data type; subsequent calls resolve immediately with
the already-granted status), `await` its resolution, and only then proceed
to `queryWorkoutSamples`. If `requestAuthorization` itself throws (e.g. the
user denies in the system sheet) or `isHealthDataAvailable()` returns
`false` (e.g. running on an iPad, where some HealthKit data classes are
restricted), the sync is skipped silently for that app session — this is a
read-augmentation feature, not a blocking gate on app usability, so a
denial should not crash or block the rest of the app (the Apple Sign-In
flow, and eventually the recommendation UI) from working.

### 7. Where the sync logic lives: a new `apps/mobile/lib/healthkitSync.ts`, called from `App.tsx`

Matches the existing `apps/mobile/lib/supabase.ts` convention (one
focused module per concern under `lib/`). `App.tsx` gets a new `useEffect`
that calls a single exported `syncHealthKitWorkouts()` function — no new
UI is added in this phase (no progress spinner, no error banner); this is
intentionally invisible plumbing, consistent with the "engine and UI are
disposable, get the data flowing first" philosophy in `CLAUDE.md`. A
minimal `status` string update (already present in `App.tsx` for the
sign-in flow) is reused to surface sync errors for now, not a new
component.

## Approach

```
App launch / AppState → 'active'
        │
        ▼
syncHealthKitWorkouts()  (apps/mobile/lib/healthkitSync.ts)
        │
        ├─▶ isHealthDataAvailable() ──false──▶ skip, return
        │         │ true
        │         ▼
        ├─▶ requestAuthorization({ toRead: [WorkoutTypeIdentifier, ...] })
        │         │ (no-op if already granted; throws/rejects on denial → skip, return)
        │         ▼
        ├─▶ AsyncStorage.getItem('@bulletproof/healthkit-last-synced')
        │         │
        │         ▼
        │   sinceDate = stored value, or a 30-day lookback default on first-ever run
        │         │
        ├─▶ queryWorkoutSamples({ filter: { startDate: { from: sinceDate } }, limit: 0, ascending: true })
        │         │
        │         ▼
        │   WorkoutSample[]  (uuid, startDate, endDate, workoutActivityType, totalEnergyBurned, totalDistance)
        │
        ├─▶ groupByLocalDate(samples) → Map<dateString, WorkoutSample[]>
        │         │
        │         ▼
        ├─▶ toActivityRows(grouped) → activity-table-shaped rows (per Decision 5)
        │         │
        │         ▼
        ├─▶ supabase.from('activity').upsert(rows, { onConflict: 'date' })
        │         │ (RLS already permits this — authenticated_read_write_activity policy)
        │         ▼
        └─▶ AsyncStorage.setItem('@bulletproof/healthkit-last-synced', now.toISOString())
```

- **First-ever sync default lookback: 30 days.** There is no prior
  "last synced" value on first launch after this feature ships. 30 days
  is a deliberate middle ground: long enough to populate a meaningful
  initial activity history for whoever opens the app first (useful for a
  portfolio demo, and immediately gives the engine's `days_since_pickleball`
  /`days_since_run` signals real recent data to work with), short enough
  to avoid querying years of HealthKit history on a cold start. This is
  separate from (and much smaller than) the explicitly out-of-scope
  "historical backfill" — 30 days is a sync-correctness default, not a
  backfill feature.
- **No new Supabase migration.** RLS for `activity` already grants the
  `authenticated` role full read/write
  (`authenticated_read_write_activity`, live since the bootstrap plan's
  Task 2) — this phase only writes application code.
- **No new npm workspace/package.** Everything lives inside the existing
  `apps/mobile/` Expo project.

## Testing / verification plan

This phase's central constraint: **HealthKit is native code. Expo Go's
sandbox does not include it.** Every check that needs the actual
HealthKit native module — the permission prompt, real workout data, the
Dev Client build itself — requires a Custom Dev Client (an EAS build with
the new native dependency baked in) installed on a physical iPhone. There
is no simulator-only or Expo-Go-only path around this; HealthKit data does
not exist on the iOS Simulator either (Apple's Simulator has no HealthKit
store), so even a Mac with Xcode could not substitute for a real device
here.

**Checkable without a physical device (this phase's actual CI-style
verification, mirroring the bootstrap plan's pattern for Tasks 3/7's "no
device available" cases):**
- `npx tsc --noEmit` inside `apps/mobile/` — confirms
  `lib/healthkitSync.ts`'s types check against the installed
  `@kingstinct/react-native-healthkit` and `@supabase/supabase-js` type
  definitions, and that `App.tsx`'s new `useEffect` wiring compiles.
- `npx expo-doctor` — confirms the new native dependency
  (`@kingstinct/react-native-healthkit` + its `react-native-nitro-modules`
  peer) and its config plugin are correctly declared in `app.json`/
  `package.json` with no version-mismatch warnings against the installed
  Expo SDK 56.
- `npx expo export --platform ios` — confirms the JS bundle (including the
  new sync module) actually builds without a runtime/bundler error. This
  does not exercise any native code path, but it does catch import errors,
  syntax errors, and bundler-level resolution failures before they'd
  otherwise only surface inside a slow EAS cloud build.
- Pure unit tests (no native module, no Supabase, no network) for the
  row-mapping function described in Decision 5 — given a fixed array of
  mock `WorkoutSample`-shaped objects, asserts the function returns
  `activity`-table-shaped rows with the right `date` grouping, `workout_count`,
  and per-workout field mapping (activity name, calories, distance,
  source `"healthkit"`). This is the same spirit as
  `prototyping/weight-tuning/oura_pull.py`'s `to_activity_row` having no
  dedicated test file itself, but the mapping logic here is new
  TypeScript, not a port — so it gets a real test this time, following
  this repo's general "tests first" convention from `CLAUDE.md`/the
  pipeline design's Developer-role description.

**Genuinely requires the user's physical iPhone (cannot be automated or
substituted by an agent in this pipeline):**
- A new EAS Dev Client build (`eas build --profile development --platform
  ios`) installed on the phone — required because Expo Go cannot load this
  native module at all.
- The actual iOS HealthKit permission sheet appearing and being
  granted/denied — this is a system UI surface with no programmatic
  override, by Apple's design (the same reason `expo-apple-authentication`
  in the bootstrap plan's Task 7 also flagged Expo Go as insufficient for
  its entitlement-backed flow).
- Confirming a real Apple Watch workout (logged via the Watch, synced to
  the Health app) appears as a new row in `activity` with `source:
  "healthkit"` inside the configured sync window, and that re-opening the
  app a second time does not duplicate or re-fetch already-synced
  workouts (verifies the AsyncStorage timestamp is actually advancing).
- Confirming this works with Oura entirely out of the loop, per the
  original interface design spec's testing plan (e.g. checking a recent
  pickleball session's row shows `source: "healthkit"` rather than Oura's
  `"confirmed"`/`"workout_heart_rate"`) — this is the actual regression
  test for the bug that motivated this whole pivot.

The implementation plan's task list places every device-only step in its
own clearly labeled task (mirroring the bootstrap plan's Task 1's
"manual, human-only task" framing) so the rest of the plan's
agent-executable tasks are not blocked waiting on physical-device access
mid-task.

## Out of scope

- iOS Background App Refresh / HealthKit background delivery (Decision 3
  — foreground-only for this phase).
- Historical backfill beyond the 30-day first-sync default (Decision 5's
  approach section) — a true backfill (months/years) stays a distinct,
  separately-scoped feature per the mobile interface design spec's
  existing non-goals.
- Multi-source (`Oura` + `HealthKit`) merge/reconciliation logic for the
  same date's `activity` row (Decision 5) — last-write-wins for now.
- Any UI surfacing of sync status beyond reusing the existing `status`
  text element already in `App.tsx` (Decision 7) — a real
  loading/error/success UI is part of the later recommendation-UI phase,
  not this one.
- Android / Health Connect (standing non-goal, consistent with the mobile
  interface design spec and `CLAUDE.md`'s multi-platform stance).
- Any change to `engine/`, the daily cron, or `recommendations` — this
  phase only adds a new write path into `activity` from the phone; nothing
  downstream changes.
