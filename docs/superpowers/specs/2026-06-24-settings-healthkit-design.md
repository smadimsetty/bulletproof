# Settings screen + HealthKit expansion (Phase 4) — design spec

## Background

`apps/mobile/app/(tabs)/settings.tsx` is currently the Phase 3 navigation
stub: a centered `Text` reading "Settings — coming in Phase 4," added by
the mobile-nav phase
(`docs/superpowers/specs/2026-06-24-mobile-nav-design.md`) purely to make
the tab reachable. This phase fills it in for real.

The v2 design
(`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`, "Phase 4 —
Settings" subsection) specifies: "dropdown-to-add per section (not static
checkbox lists): preferred split, activities (grouped
Strength/Cardio/Recovery, Walking pre-added), pains (dropdown over
`body_part_taxonomy` incl. 'Other,' each entry expands into a severity
slider + free-text note), goals (dropdown, capped at 3 with an inline
warning), training frequency (manual/auto), diet, weight/birth date,
location, HealthKit (sync toggle + 'what we read' disclosure, read-only)."
The same spec's "Visual direction" calls for "calm, minimal, Oura-inspired"
styling applied as each screen is built, and its "Critical files" section
flags `apps/mobile/lib/healthkitSync.ts`/`healthkitMapping.ts` as
"workouts-only HealthKit code extended to sleep/HR/calories/steps" in this
phase.

The schema this screen reads/writes is already live in production
(`supabase/migrations/20260623142000_expand_user_profile.sql` plus the four
new taxonomy tables: `20260623140000_create_split_taxonomy.sql`,
`20260623140500_create_activity_taxonomy.sql`,
`20260623141000_create_goal_taxonomy.sql`,
`20260623141500_create_body_part_taxonomy.sql`). Specifically, on
`user_profile`: `activities jsonb default '[]'`, `preferred_split text
references split_taxonomy(id) default 'upper_lower'`, `current_goals jsonb
default '[]'`, `training_frequency_mode text check in ('manual','auto')
default 'auto'`, `training_frequency_manual jsonb`, `diet_preference text`,
`weight_kg numeric(5,2)`, `birth_date date`, `location jsonb`,
`healthkit_sync_enabled boolean default false`, and `pains jsonb default
'[]'` (renamed from `injury_constraints`, reshaped to an array of `{
body_part, severity (1-10), note, since }`). The four taxonomy tables are
global, read-only-to-authenticated, RLS-protected lookup tables seeded with
exactly the rows shown in their migration files (4 splits, 7 activities
across 3 categories, 6 goals, 12 body parts including `other`).

The existing `apps/mobile/lib/healthkitSync.ts` was built in the
HealthKit-sync phase
(`docs/superpowers/specs/2026-06-22-healthkit-sync-design.md`) to satisfy
only the "sync Apple Watch workouts into `activity`" goal. Reading the file
as it exists today confirms the v2 design's claim precisely:
`READ_PERMISSIONS` already lists `WorkoutTypeIdentifier`,
`'HKQuantityTypeIdentifierActiveEnergyBurned'`,
`'HKQuantityTypeIdentifierDistanceWalkingRunning'`, and
`'HKQuantityTypeIdentifierStepCount'` — but `syncHealthKitWorkouts()` only
ever calls `HealthKit.queryWorkoutSamples(...)`. The three quantity-type
permissions are requested and never queried, exactly as the original
design spec's Decision 2 stated outright ("this phase does not query
them... requested defensively for forward compatibility"). No sleep or
heart-rate permission is requested at all today. This phase is that
deferred forward-compatibility work landing for real, plus the two new
data types (sleep, heart rate) the original phase explicitly scoped out
("Sleep and heart rate are deliberately not requested — those belong to
`recovery`, which stays Oura-sourced").

`apps/mobile/AGENTS.md` instructs checking current docs for
Expo/HealthKit library APIs rather than relying on training-data memory.
For the HealthKit library specifically
(`@kingstinct/react-native-healthkit@^14.0.2`, confirmed installed in
`apps/mobile/package.json`), the package's actual published source on npm
(`app.unpkg.com/@kingstinct/react-native-healthkit@14.0.2/files/src/...`)
was read directly this session — see Decision 1 below for the exact API
shape confirmed live, not assumed.

## Goals

- Replace the Settings stub with a real form covering every section the
  v2 design lists: preferred split, activities, pains, goals, training
  frequency, diet, weight/birth date, location, and HealthKit.
- Each "dropdown-to-add" section (split, activities, pains, goals) lets the
  user pick from the relevant taxonomy table and adds a removable entry —
  not a static pre-rendered checkbox list of every taxonomy row.
- Activities are grouped by `category` (Strength/Cardio/Recovery) in the
  add-dropdown's display, and a new profile defaults to `activities`
  containing the `walking` taxonomy row pre-added (opt-out, matching the
  schema-v2 design's "pre-added to every new profile's activities by
  default (opt-out, not opt-in)").
- Pains: dropdown over `body_part_taxonomy` (including `other`, which opens
  a free-text label capture instead of using the taxonomy label directly).
  Each added pain entry expands inline into a severity slider (1-10) and a
  free-text note field, matching the live `pains` jsonb shape exactly
  (`{body_part, severity, note, since}`).
  - Goals: dropdown over `goal_taxonomy`, hard-capped at 3 selected entries
  with an inline warning shown when the user tries to exceed the cap.
- Training frequency: a manual/auto mode toggle; manual mode reveals a
  small per-week-target editor backing `training_frequency_manual jsonb`.
- Diet, weight, birth date, location: plain editable fields backing
  `diet_preference`, `weight_kg`, `birth_date`, `location` respectively.
- HealthKit section: a sync-enable toggle bound to
  `user_profile.healthkit_sync_enabled`, plus a static "what we read"
  disclosure list, explicit that this is read-only (the app never writes
  to HealthKit).
- Expand `READ_PERMISSIONS` in `healthkitSync.ts` to add
  `HKCategoryTypeIdentifierSleepAnalysis` and the two heart-rate quantity
  types (`HKQuantityTypeIdentifierHeartRate`,
  `HKQuantityTypeIdentifierRestingHeartRate`), and actually query the three
  quantity types already requested but unused
  (`ActiveEnergyBurned`/`DistanceWalkingRunning`/`StepCount`) plus the two
  newly requested categories — wiring real queries, not just permission
  requests, so the forward-compatibility debt the original phase
  explicitly deferred is paid off here.
- Apply the calm/minimal Oura-inspired visual direction (soft rounded
  cards, generous whitespace, muted palette, high-contrast typography) to
  this screen's styling, consistent with the v2 design's "apply this as
  each screen is rebuilt" instruction.
- All reads/writes go through the existing `apps/mobile/lib/supabase.ts`
  client, relying on the already-live RLS policies (per-owner on
  `user_profile`, read-only-to-authenticated on the four taxonomy tables) —
  no new migration in this phase.

## Non-goals (explicitly out of scope for this build)

- Any new Supabase migration. The schema is already live and frozen for
  this phase; Settings is a pure read/write client against the existing
  shape.
- Writing the actual day-level HealthKit data (sleep, heart rate, calories,
  steps, distance) into `recovery` or `activity` tables. This phase only
  expands the permission/query plumbing in `healthkitSync.ts` to fetch the
  data and exposes a settings-level summary of *what is read*; persisting
  the newly-queried samples into a table is explicitly deferred (see
  Decisions for what "actually query" means scoped to this phase).
- Any engine-side consumption of the new HealthKit data (`engine/` is
  untouched).
- HealthKit write access of any kind — the app has never requested
  `toShare`/write permissions and this phase does not add any; the
  Settings copy explicitly states "read-only."
- A body-part-taxonomy admin UI for adding new rows beyond "Other" — the
  service-role review path mentioned in the schema-v2 design for
  graduating "Other" entries into real taxonomy rows is out of scope here.
- Editing `exercises`, `split_taxonomy`, `activity_taxonomy`,
  `goal_taxonomy`, or `body_part_taxonomy` rows from the app — those are
  global, read-only-to-authenticated lookup tables; Settings only reads
  them to populate dropdowns.
- Multi-profile/multi-user switching UI — `owner_id` already scopes every
  read/write to `auth.uid()` via RLS; there is exactly one row per signed-in
  user and this screen edits that row only.
- A component-level RN render-test harness. Per the dispatch's explicit
  framing and the just-completed mobile-nav phase's precedent, this repo
  has no RN UI-rendering test framework; verification stays at
  `npx tsc --noEmit` plus Jest unit tests for new pure helper logic.
- Background HealthKit delivery, historical backfill beyond the existing
  30-day first-sync default, and Android/Health Connect — all standing
  non-goals already established in
  `docs/superpowers/specs/2026-06-22-healthkit-sync-design.md` and
  unchanged by this phase.
- A location picker/map UI or geocoding integration. `location jsonb`
  (`{lat, lon, label, timezone}`) is captured this phase via plain text
  inputs for `label` and a device-permission-based one-tap "use current
  location" action populating `lat`/`lon`/`timezone` — not a full map
  picker.

## Decisions

Ambiguities resolved here since this phase runs autonomously with no
interactive Sohan review.

### 1. HealthKit library API verified live against the actual published v14.0.2 source, not assumed

Read directly from `app.unpkg.com/@kingstinct/react-native-healthkit@14.0.2/files/src/...`
this session (not training-data memory, per `apps/mobile/AGENTS.md`'s
explicit instruction):

- **Category-type query**: `queryCategorySamples` is a real exported
  function (`src/healthkit.ios.ts`: `export const queryCategorySamples =
  CategoryTypes.queryCategorySamples.bind(CategoryTypes)`), taking a
  `CategoryTypeIdentifier` and a `QueryOptionsWithSortOrder`-shaped options
  object (`{ filter?, limit, ascending? }`), returning samples typed as
  `CategorySample extends BaseSample { categoryType, value }` where
  `BaseSample` carries `startDate: Date`, `endDate: Date`, `uuid`, and
  other shared fields (`src/types/Shared.ts`, `src/types/CategoryType.ts`).
- **Sleep analysis identifier and value enum**: confirmed in
  `src/generated/healthkit.generated.ts`:
  `HKCategoryTypeIdentifierSleepAnalysis` maps to `CategoryValueSleepAnalysis`,
  an enum `{ inBed = 0, asleepUnspecified = 1, asleep = 1, awake = 2,
  asleepCore = 3, asleepDeep = 4, asleepREM = 5 }`. (`asleepUnspecified`
  and `asleep` share value `1` — both map to a single "asleep" bucket when
  this phase needs a human label.)
- **Heart-rate identifiers**: confirmed in the same generated file's
  `QuantityTypeIdentifierWriteable` union:
  `'HKQuantityTypeIdentifierHeartRate'` and
  `'HKQuantityTypeIdentifierRestingHeartRate'` are both real, current
  string identifiers.
- **Quantity-type query**: `queryQuantitySamples` is the real exported
  function (`src/healthkit.ios.ts`, same binding pattern as
  `queryCategorySamples`), taking a `QuantityTypeIdentifier` and a
  `QueryOptionsWithSortOrderAndUnit`-shaped options object (`{ filter?,
  limit, ascending?, unit? }`), returning samples typed as `QuantitySample
  extends BaseSample { quantityType, quantity: number, unit: string }`.
  This is the same function shape `healthkitSync.ts` would need for
  `ActiveEnergyBurned`/`DistanceWalkingRunning`/`StepCount` — i.e. the
  three permissions already requested but unused can be satisfied with the
  exact same `queryQuantitySamples` call already imported for workouts'
  sibling APIs, just a different type identifier and options shape.
  `queryWorkoutSamples` (already used today) is a distinct, separately
  bound function specific to `WorkoutTypeIdentifier` — it is not reused for
  quantity/category queries.
- **Net new import**: `queryQuantitySamples` and `queryCategorySamples`
  both need to be added to `healthkitSync.ts`'s import from
  `@kingstinct/react-native-healthkit` (today it only imports the default
  `HealthKit` object, `WorkoutActivityType`, and `WorkoutTypeIdentifier`).

### 2. Scope of "actually query" for this phase: fetch + map into a settings-readable summary, not a new persisted table

The dispatch's instruction is "actually query the
ActiveEnergyBurned/DistanceWalkingRunning/StepCount types already requested
but unused" plus add sleep/heart-rate. Per the schema-v2 design's frozen
scope (no new migration in this phase) and the v2 design spec's "Critical
files" framing ("workouts-only HealthKit code extended to sleep/HR/
calories/steps" — extended, not "given a new destination table"), this
phase's query work lands as:

- `healthkitSync.ts` gains a second exported function,
  `syncHealthKitDailyMetrics()`, called alongside (not replacing)
  `syncHealthKitWorkouts()`, sharing the same `isHealthDataAvailable`/
  `requestAuthorization`/since-timestamp plumbing.
- It queries `HKQuantityTypeIdentifierActiveEnergyBurned`,
  `HKQuantityTypeIdentifierDistanceWalkingRunning`,
  `HKQuantityTypeIdentifierStepCount` (summed per local day),
  `HKCategoryTypeIdentifierSleepAnalysis` (total asleep duration per local
  day, bucketing `asleep`/`asleepUnspecified`/`asleepCore`/`asleepDeep`/
  `asleepREM` together, excluding `inBed`/`awake`), and
  `HKQuantityTypeIdentifierHeartRate` +
  `HKQuantityTypeIdentifierRestingHeartRate` (most recent sample's value
  per local day) since the same last-synced timestamp
  `syncHealthKitWorkouts()` already tracks.
- The mapped result upserts into the *existing* `activity` table's
  already-defined-but-currently-always-null columns where it fits the
  table's existing contract exactly: `total_calories` ←
  ActiveEnergyBurned-summed kcal for the day, `steps` ← StepCount summed
  for the day. `total_calories`/`steps` were null from every
  HealthKit-sourced row before this phase (per the original sync design's
  Decision 5 table) — this phase fills them in for real, which is the
  literal "extended to calories/steps" the v2 design names.
  `active_calories`/`*_activity_time`/`sedentary_time`/`activity_score`
  remain null (no direct HealthKit equivalent, same rationale as the
  original phase).
- Distance has no existing per-day `activity` column (only the per-workout
  `workouts[].distance` field already populated by
  `syncHealthKitWorkouts()`) — `DistanceWalkingRunning`'s day-level sum is
  therefore not persisted to a column this phase; it is queried (proving
  the previously-dead permission now does real work) and discarded after
  being summed only for the Settings "what we read" disclosure to display
  as an example of real data the app can see, not stored. This is the one
  point where "actually query" stops short of "actually persist," and it's
  deliberate: adding a new `activity.distance_meters`-style column is a
  schema change, explicitly out of scope (Non-goals) for this phase.
- Sleep and heart-rate are **not** written to `recovery` or any other
  table this phase. `recovery` stays exclusively Oura-sourced per
  `CLAUDE.md`'s existing architecture and the original HealthKit-sync
  phase's explicit non-goal ("Sleep and heart rate are deliberately not
  requested — those belong to `recovery`"). This phase only proves the
  query plumbing works (permission granted, samples fetched, summarized)
  so wiring it into `recovery` is a future, separately-scoped decision
  about reconciling two recovery-data sources — not silently done here as
  a side effect of expanding permissions.
- Net effect: `total_calories`/`steps` go from "always null" to "real,"
  `workouts[].distance` is unchanged (already populated),
  `DistanceWalkingRunning`/sleep/heart-rate are fetched and summarized for
  the Settings disclosure's benefit but not persisted anywhere durable
  this phase.

### 3. `healthkitMapping.ts` gains pure mapping functions for the new query results, tested the same way as the existing workout mapping

`groupWorkoutsByLocalDate`/`toActivityRows` already establish the pattern:
pure, side-effect-free functions taking minimal plain-object inputs (not
the native `WorkoutProxyTyped` directly) and returning table-shaped rows,
unit-tested with mock data. This phase adds, to the same file:

- `sumQuantityByLocalDate(samples: MinimalQuantitySample[]): Map<string, number>`
  — generic day-bucketed sum, used for calories, steps, and (for the
  Settings disclosure only) distance.
- `sumSleepMinutesByLocalDate(samples: MinimalSleepSample[]): Map<string, number>`
  — sums `(endDate - startDate)` in minutes per local day for samples
  whose `value` is in the "asleep" bucket (excludes `inBed`/`awake`).
- `mergeDailyMetricsIntoActivityRows(existingDateKeys: Set<string>, calories: Map<string, number>, steps: Map<string, number>): Partial<ActivityRow>[]`
  — produces `{date, total_calories, steps}` partial rows ready for a
  second, narrower upsert (`onConflict: 'date'`, only those two columns
  plus `date` — Postgres `upsert` with a column subset does not null out
  unlisted columns on conflict, it only updates the listed ones, which is
  exactly the desired behavior of layering the daily-metrics sync on top
  of whatever `syncHealthKitWorkouts()` already wrote for that date).

These are pure functions, fully unit-testable without any native module or
network call, following the existing `healthkitMapping.test.ts`
convention exactly (`apps/mobile/lib/__tests__/healthkitMapping.test.ts`
gains new `describe` blocks, not a new file, since they map onto the same
`activity` table this file has always been about).

### 4. Settings screen state shape: one local form state object, loaded once, saved via explicit "Save" actions per section

Rather than a single giant "Save" button for the whole screen (any
unrelated section's bad input would block saving fields the user actually
finished editing) or autosave-on-every-keystroke (chatty, and
`weight_kg`/`diet_preference` text fields would otherwise fire a network
write per character), each section gets its own bounded save action:

- **Dropdown-to-add sections** (split, activities, pains, goals): every
  add/remove is its own immediate Supabase update (a single round-trip
  array/jsonb replace on `user_profile`), mirroring how a dropdown-add
  interaction reads as "did the thing" the instant you pick it — no
  separate "Save" button for these sections. This matches the
  v1-established "friction-first" principle in `CLAUDE.md` (data-in must
  be fast) and avoids a confusing state where you've "added" a pain in the
  UI but it silently isn't persisted until some later unrelated save.
- **Free-text/numeric fields** (diet, weight, birth date, location label,
  training-frequency-manual targets): a per-section "Save" button,
  debounced-free (explicit tap, not autosave), so a half-typed weight value
  never round-trips mid-keystroke. Each section's Save button is disabled
  while that section's local state matches the last-saved value (no-op
  guard), and shows a brief inline "Saved" confirmation on success — no new
  toast/snackbar component introduced; reuse a small inline `Text` per
  section, consistent with the calm/minimal visual direction (no modal
  interruptions for a routine save).
- **HealthKit toggle**: immediate Supabase update on toggle (same pattern
  as dropdown-add sections), since a toggle is itself a complete,
  unambiguous action with no draft state to protect against.
- The whole screen loads `user_profile`'s row plus all four taxonomy
  tables in parallel on mount (`Promise.all`), shows a single loading state
  for the initial fetch, and a single inline error state if any of those
  five queries fails (consistent severity — without a usable profile row
  or taxonomy, none of the screen's sections can render meaningfully).

### 5. Pains UI: severity slider range and "Other" capture

`pains` entries are `{body_part: string, severity: number (1-10), note:
string, since: string | null}`. This phase:

- Renders the severity control as React Native's built-in `Slider`
  (`@react-native-community/slider` is not currently a dependency — adding
  a new native module for a single slider control is avoided in favor of a
  **stepped row of 10 tappable numbered buttons (1-10)**, a pure-JS/RN
  `View`+`Pressable` composition requiring no new native dependency and no
  EAS rebuild, consistent with this phase shipping pure-JS/TS screen code
  only, no native module changes — the only the native-module work is the
  already-installed HealthKit library's expanded permission set).
- `since` is set to `null` on creation (no date-of-onset picker added this
  phase — the live schema already defaults every Sohan-seeded row's
  `since` to `null`, and the v2 design's Settings section list doesn't
  call out a "since" date control explicitly; adding one would be a
  speculative addition beyond the spec's literal list).
- `body_part` dropdown lists every `body_part_taxonomy` row by `label`
  except `other`'s special-cased: picking `other` does not add a pain
  keyed `"other"` directly — it reveals a free-text input for a custom
  label, and the resulting entry is stored with `body_part: "other"` plus
  the user's free text appended into `note` as a prefixed line (e.g.
  `"Custom area: <user text>\n<user's actual note, if any>"`), since the
  live `pains` jsonb shape has no separate "custom label" field and adding
  one is a schema change (out of scope). This keeps `body_part` a closed
  enum matching the taxonomy table (consistent for any future
  engine-side reasoning keyed on `body_part`) while still letting "Other"
  capture a real description, exactly as the v2 design's "Other
  (describe)" taxonomy row name implies.
- Each pain entry, once added, renders expanded inline (slider/button-row +
  note `TextInput`) rather than collapsed-then-expand-on-tap — the spec
  says "each entry expanding into a severity slider + note," read here as
  "is always shown expanded once added" (there are at most ~12 possible
  pains, never enough to need a collapse-by-default list-density
  optimization).

### 6. Goals cap: client-side enforcement at exactly 3, inline warning text, no Supabase check constraint

`current_goals jsonb` has no DB-level cap (confirmed: the migration only
adds `current_goals jsonb not null default '[]'::jsonb`, no `check`
clause) — the cap is "app-enforced" per the v2 design spec's schema section
verbatim ("`current_goals jsonb` (app-enforced max 3 selected)"). This
phase enforces it purely client-side: the add-dropdown's options are still
all 6 `goal_taxonomy` rows regardless of current count, but selecting a
4th when 3 are already present is rejected before the Supabase call fires,
with an inline `Text` warning ("You can select up to 3 goals — remove one
to add another.") shown in place of performing the add. This is
consistent with the rules-based, transparent-over-clever posture in
CLAUDE.md — no silent truncation, no toast that disappears before being
read.

### 7. Training frequency manual-mode shape

`training_frequency_manual jsonb` has no schema-enforced inner shape
(plain `jsonb`, nullable). This phase defines and writes a shape of
`{ targets: Record<SplitDayLabelOrActivityId, number> }` — one integer
per-week target per entry the user has actually added to either
`preferred_split`'s `day_labels` or `activities`, e.g. `{"targets":
{"upper": 2, "lower": 2, "pickleball": 2, "running": 1}}`. This mirrors
CLAUDE.md's existing v1 "~10-day target ratios" concept (now per-week,
generalized past the old hardcoded upper/lower/pickleball/run/rest list to
whatever the user's current split/activities actually are) without
inventing a new taxonomy table — it's a free-shape jsonb blob exactly as
the column's own type allows, keyed off entries already chosen elsewhere
on the same screen. Switching `training_frequency_mode` to `'auto'` does
not clear `training_frequency_manual` (so flipping back to manual restores
the user's last-entered numbers rather than starting blank) — matches the
v2 design's "Auto" decision #5 framing ("drop the user's manual weekly
targets, fall back to the engine's...logic"), read as the *engine*
ignoring the manual column in auto mode, not the column being deleted.

### 8. Location capture: text label + on-device "use current location," no map UI

`location jsonb` is `{lat, lon, label, timezone}`. This phase:

- A free-text `label` input (e.g. "Austin, TX") saved directly.
- A "Use current location" button using `expo-location`’s
  `getCurrentPositionAsync` (a new dependency — confirmed not currently
  installed in `apps/mobile/package.json`; added via `npx expo install
  expo-location`, the same SDK-version-correct install pattern the mobile-
  nav phase established for every other new Expo package) to populate
  `lat`/`lon`, and `Intl.DateTimeFormat().resolvedOptions().timeZone` (pure
  JS, already available in the Hermes/RN runtime, no new dependency) for
  `timezone`. If location permission is denied, the button shows an inline
  error and the user can still save just the `label` text field — location
  capture degrades gracefully exactly like HealthKit sync does elsewhere
  in this app, never blocking the rest of the section.
- No interactive map, no geocoding API call to turn the label into
  lat/lon or vice versa — out of scope per Non-goals.

### 9. Visual direction implementation: a small shared style module, not a new design-system package

"Calm, minimal, Oura-inspired" (soft rounded cards, generous whitespace,
muted palette, high-contrast typography) is applied via a new
`apps/mobile/lib/theme.ts` exporting plain constants (`COLORS`, `SPACING`,
`RADII`, `TYPE`) and a few reusable `StyleSheet` fragments (`card`,
`sectionTitle`, `label`), imported by `settings.tsx`. This is deliberately
not a new npm dependency (no styled-components/restyle/tamagui) — RN's
built-in `StyleSheet.create` is what every existing screen in this repo
already uses (`sign-in.tsx`, the tab stubs), and CLAUDE.md's "no
over-engineering" / "small focused files" convention favors a plain
constants module over introducing a styling library for one screen. Future
phases (5-7, Home/Logger/Trends) can import the same `theme.ts` to keep the
four screens visually consistent, which is a natural byproduct of putting
it in `lib/` now rather than inlining it in `settings.tsx`.

Concrete palette (soft, muted, Oura-like — confirmed against no specific
Oura brand asset, just the verbal direction already approved in the v2
design's Decision 13, kept intentionally simple): a warm off-white
background (`#F7F5F2`), card surfaces in white with a soft shadow and
16px corner radius, ink-dark text (`#1C1B1A`) for primary content, a muted
warm gray (`#8A8580`) for secondary/help text, and a single accent
(`#3A6B5C`, a muted forest green — calm, not saturated) for active toggles,
selected dropdown rows, and the "Save"/add affordances.

### 10. Component decomposition

`settings.tsx` itself stays the screen-level container (data loading, the
five Supabase queries, top-level error/loading state) and delegates each
section to its own component file under a new `apps/mobile/components/`
directory (first use of that directory in this repo — `lib/` has been the
only shared-code directory so far, but components are a different
concern: presentational, not data/business logic, and `CLAUDE.md`'s "small
focused files" convention argues against one 600+ line `settings.tsx`):

- `apps/mobile/components/DropdownAddSection.tsx` — generic reusable
  "pick from a list of `{id, label}` options not already selected, tap to
  add, tap an added entry's ✕ to remove" control, parameterized by
  `options`, `selectedIds`, `onAdd`, `onRemove`, and an optional
  `groupBy`/`renderGroupLabel` pair (used by Activities' Strength/Cardio/
  Recovery grouping, unused — `groupBy` omitted — by Split/Goals/Pains).
  This is the one real abstraction this phase introduces, justified
  because four sections (split, activities, goals, pains-picker-only, not
  the pain detail editor) share the exact same "dropdown to add, chip list
  with ✕ to remove" interaction.
- `apps/mobile/components/PainEntryRow.tsx` — one added pain's expanded
  editor (severity buttons + note `TextInput` + remove), used in a list by
  the Pains section.
- `apps/mobile/components/HealthKitSection.tsx` — the sync toggle + static
  "what we read" disclosure list.
- Everything else (split single-select, goals-cap warning, training
  frequency manual-targets editor, diet/weight/birth-date/location plain
  fields) stays inline in `settings.tsx` — small enough each that
  extracting a component would be the over-engineering CLAUDE.md
  explicitly warns against (a single `TextInput` + label is not a
  candidate for its own file).

## Approach

```
Settings screen mount
  │
  ├─▶ Promise.all([
  │     supabase.from('user_profile').select('*').single(),
  │     supabase.from('split_taxonomy').select('*'),
  │     supabase.from('activity_taxonomy').select('*'),
  │     supabase.from('goal_taxonomy').select('*'),
  │     supabase.from('body_part_taxonomy').select('*'),
  │   ])
  │         │
  │         ▼
  │   local form state initialized from user_profile row
  │         │
  ▼
Section renders (each backed by the same `profile` state + its own save path):
  ├─ Preferred Split        → single-select dropdown, immediate save
  ├─ Activities             → DropdownAddSection (grouped), immediate save
  ├─ Pains                  → DropdownAddSection (picker) + PainEntryRow list, immediate save per add/remove/edit
  ├─ Goals                  → DropdownAddSection capped at 3, inline warning, immediate save
  ├─ Training Frequency     → manual/auto switch + manual targets editor, per-section Save button
  ├─ Diet / Weight / Birth Date / Location → plain fields, per-section Save button
  └─ HealthKit              → HealthKitSection: sync toggle (immediate save) + read-only disclosure list

HealthKit sync toggle ON
  │
  ▼
app/_layout.tsx's existing sync effect (unchanged trigger points: launch + foreground)
  │
  ├─▶ syncHealthKitWorkouts()        (existing, unchanged this phase)
  └─▶ syncHealthKitDailyMetrics()    (new this phase)
        │
        ├─▶ requestAuthorization({ toRead: [...existing 4, SleepAnalysis, HeartRate, RestingHeartRate] })
        ├─▶ queryQuantitySamples(ActiveEnergyBurned, {filter: since}) ─┐
        ├─▶ queryQuantitySamples(DistanceWalkingRunning, {filter: since}) ─┤
        ├─▶ queryQuantitySamples(StepCount, {filter: since}) ───────────┼─▶ healthkitMapping.ts pure functions
        ├─▶ queryCategorySamples(SleepAnalysis, {filter: since}) ──────┤      (sum/group by local date)
        └─▶ queryQuantitySamples(HeartRate / RestingHeartRate, {filter: since}) ─┘
              │
              ▼
        supabase.from('activity').upsert({date, total_calories, steps}, {onConflict: 'date'})
        (distance/sleep/heart-rate summarized for Settings disclosure copy only, not persisted)
```

- **No new Supabase migration.** Every column/table this phase reads or
  writes already exists and is already RLS-protected for the
  `authenticated` role (per-owner on `user_profile`, read-only on the four
  taxonomy tables).
- **One new npm dependency**: `expo-location` (Decision 8), installed via
  `npx expo install expo-location` for SDK-56-correct version resolution,
  consistent with the mobile-nav phase's established installation
  convention. No other new dependency — `@kingstinct/react-native-
  healthkit` already covers the expanded HealthKit surface; the severity
  control and theme module are pure RN/TS, no new package.
- **`app.json` gains an `NSLocationWhenInUseUsageDescription` entry** under
  `ios.infoPlist`, required by `expo-location`'s config plugin/Apple's own
  permission-prompt requirement, parallel to the existing
  `NSHealthShareUsageDescription` entry already present for HealthKit.

## Out of scope

Restated from Non-goals for plan-writing clarity:

- New Supabase migrations of any kind.
- Persisting sleep, heart-rate, or day-level distance into any table
  (queried and summarized for the Settings disclosure only; calories/steps
  are the only newly-persisted daily metrics, into `activity`'s existing
  null columns).
- Any engine-side (`engine/`) consumption of new HealthKit data.
- HealthKit write/share permissions.
- A body-part-taxonomy admin/review UI for "Other" entries.
- Editing any of the four taxonomy tables from the app.
- Multi-profile/multi-user UI.
- An RN component-render test harness.
- HealthKit background delivery, historical backfill beyond 30 days,
  Android/Health Connect.
- A map-based location picker or geocoding integration.
