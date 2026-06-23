# Recommendation/summary UI (mobile app) — design spec

## Background

`CLAUDE.md` describes the core product as two daily outputs: a summary of
yesterday, and a recommendation for today's optimal session. Everything
shipped so far in this pipeline (engine productionization, the daily cron,
HealthKit sync) has been building the data pipeline that feeds those two
outputs — none of it has been visible to Sohan yet. The mobile app
(`apps/mobile/`) currently renders nothing but a bare
`Signed in as <uuid>` string after Apple Sign-In succeeds
(`apps/mobile/App.tsx`), or an Apple Sign-In button before that. There is no
screen that shows either output.

The autonomous build pipeline design
(`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`)
sequences this as backlog item 5 ("Recommendation/summary UI in the mobile
app... now has real data from steps 2–3 to render against"), after the
engine (item 2) and daily cron (item 3) are both live and HealthKit sync
(item 4) is wired. The daily cron has been running since 2026-06-23 and has
already produced real rows in `recommendations` (per
`docs/superpowers/reports/autonomous-build-log.md`'s entries: a real
`top_pick = mobility` / `runner_up = upper_a` recommendation generated live
on 2026-06-22, and two further live-verified runs on 2026-06-23). This phase
finally surfaces that data to the one person it's for.

### What already exists to build on

- **`recommendations` table** (`supabase/migrations/20260622001542_create_recommendations.sql`):
  `id`, `date` (unique), `top_pick` (`session_type` enum, not null),
  `runner_up` (`session_type`, nullable), `score_breakdown` (jsonb),
  `internal_rationale` (text, not null), `public_rationale` (text, not
  null), `generated_at` (timestamptz). RLS is enabled on the base table with
  **no anon/authenticated policy** of its own — deliberately, per that
  migration's comment: `score_breakdown` and `internal_rationale` can
  reference raw biometrics.
- **`recommendations_public` view** (created in the same migration, security
  model made explicit in `20260622002432_fix_view_security_and_updated_at_triggers.sql`):
  `select date, top_pick, runner_up, public_rationale, generated_at from
  recommendations`, running with definer (owner) privileges so it can read
  through the base table's RLS while exposing only those four columns.
  Granted `select` to both `anon` and `authenticated`.
- **A separate, additional grant**: `20260622130000_rename_authenticated_rls_policies.sql`
  also grants the `authenticated` role direct `select` on the base
  `recommendations` table (policy `authenticated_read_recommendations`).
  This means the signed-in mobile app *could* read `internal_rationale` and
  `score_breakdown` directly — but doing so would defeat the entire point of
  the public/private split CLAUDE.md establishes ("publish the program +
  the reasoning; keep raw biometrics... private"). This spec's Decision 1
  below settles that the app queries the view, not the base table, even
  though both are technically reachable.
- **`session_type` enum** (`supabase/migrations/20260622000805_enable_extensions_and_types.sql`):
  `upper_a`, `upper_b`, `lower_a`, `lower_b`, `pickleball`, `run`, `rest`,
  `mobility` — exactly 8 values, closed set, used for both `top_pick` and
  `runner_up`.
- **`public_rationale` text** (`engine/rationale.py`'s `build_public_rationale`):
  already a complete, friendly sentence, e.g. `"Today's pick is mobility --
  a mobility session was overdue. Runner-up: upper a."` — note it already
  lowercases and underscore-splits the type name itself (`top_type.replace("_",
  "_", " ")`-equivalent), so the raw enum value leaks through inside the
  sentence in a slightly different (less polished) form than this phase's
  own friendly-name mapping will produce for the headline. That's expected
  and harmless — see Decision 3.
- **`apps/mobile/lib/supabase.ts`**: an authenticated `supabase-js` client
  already used by `App.tsx` and `lib/healthkitSync.ts`. This phase reuses it
  as-is — no new client, no new auth.
- **No yesterday "summary" data source yet.** `CLAUDE.md`'s first output
  ("a summary of yesterday") has no engine-side equivalent shipped — there
  is no `summary` table or field; `engine/run_daily.py` only ever writes
  `recovery` and `recommendations` rows for *today*. See Decision 2 for how
  this phase handles that gap without inventing new engine scope.

## Goals

- Add a single new screen to `apps/mobile/App.tsx` that replaces the bare
  `Signed in as <uuid>` text with a real rendering of today's
  recommendation: `top_pick` and `runner_up` in friendly readable form
  (`upper_a` → "Upper Body A"), plus the `public_rationale` sentence.
- Decide and implement which row to fetch (most recent vs. strictly
  today's date) and what the screen shows when today's cron hasn't run yet.
- Keep the voice consistent with CLAUDE.md's Bryan Johnson/Blueprint frame
  — measured, evidence-based, not hype-y — in whatever UI copy this phase
  adds around the engine's own already-measured `public_rationale` text.
- Keep the change minimal and single-screen: no navigation library, no new
  screens beyond this one, no new global state management.

## Non-goals

- A "summary of yesterday" data source. The engine does not generate or
  store one yet (see Background) — inventing one is out of scope for a UI
  phase; that's engine scope for a future phase. See Decision 2 for what
  this phase does instead within its actual boundaries.
- Exercise demo-video links and target rep ranges. `CLAUDE.md` mentions
  these for complex movements, but neither `engine/` nor any migration
  populates a per-recommendation exercise list today — `recommendations`
  has no `exercises` column, and the `exercises` table's `demo_video_url`
  column (from Phase 0/1) is never joined or referenced anywhere in
  `engine/`. Out of scope for this phase; see Decision 4.
- Historical/trend views (e.g. "your last 7 days"), score breakdown
  visualization, or any rendering of `score_breakdown`/`internal_rationale`
  — both are explicitly private (Background) and neither is part of the
  "two outputs" this phase targets.
- Push notifications, widgets, or any surface besides the existing app's
  single screen.
- Pull-to-refresh, polling, or realtime subscriptions. A simple fetch on
  mount/foreground (mirroring the existing HealthKit sync's trigger
  pattern) is sufficient for a once-a-day data source — see Decision 5.
- Android. Standing non-goal across every spec in this pipeline.
- Any change to `engine/`, the daily cron, or the database schema. This
  phase is read-only UI work against data that already exists.

## Decisions

Ambiguities resolved here since no clarifying questions could be asked
mid-build (per the autonomous pipeline's "no mid-run questions" rule):

### 1. Query the `recommendations_public` view, not the base table

Even though the `authenticated` role can technically read the base
`recommendations` table directly (per
`authenticated_read_recommendations`), this phase queries
`recommendations_public` instead. Reasons:

- It is simpler: the view already does exactly the column allowlist this
  screen needs (`date`, `top_pick`, `runner_up`, `public_rationale`,
  `generated_at`) — no client-side filtering of which fields to display or
  discipline required to remember "never render `internal_rationale`."
  Querying the view makes the privacy boundary structural (enforced by
  Postgres's column list) rather than a convention the client code has to
  honor correctly every time it's touched.
- It matches the stated architecture intent: the mobile-interface-design
  spec's data-flow diagram already labels the web dashboard as reading
  `recommendations_public`, and CLAUDE.md's public/private split exists
  precisely so any *renderer* — phone app or future web dashboard — gets a
  safe view rather than re-deriving the split itself. The phone app being
  authenticated doesn't change what it should be allowed to put on screen;
  Sohan is also the audience for the eventual public portfolio piece, and
  there's no reason the private screen needs `internal_rationale` or
  `score_breakdown` to do its job — both are debugging detail, not part of
  either of CLAUDE.md's two stated outputs.
- It costs nothing extra: the view is already granted to `authenticated`,
  already exists, already audited (per the Phase 0/1 critic review
  referenced in this task's own brief). No new RLS, no new migration.

### 2. "Summary of yesterday": render yesterday's `recommendations_public` row, framed as what was recommended — not an invented activity summary

The engine has no concept of "what Sohan actually did yesterday" beyond
what's in `sessions` (which this phase does not query — see Non-goals: that
table's true ground-truth is a separate, already-flagged-as-imperfect
concern per CLAUDE.md's "Known ground-truth limitations" note, and reading
it correctly for a polished summary is real scope this phase doesn't have
time to absorb correctly). What *does* exist for "yesterday" is yesterday's
`recommendations_public` row — the recommendation the engine made for
yesterday, which is the closest faithful thing to "a summary of yesterday"
available without inventing new engine work.

Decision: this screen shows two cards —

1. **"Yesterday"** — yesterday's row from `recommendations_public`
   (`date = today - 1`), labeled clearly as *what was recommended*, not "what
   you did" (the app cannot know what Sohan actually did without `sessions`
   data the engine doesn't expose through this view, and asserting
   otherwise would be a measured-and-evidence-based product lying about its
   own certainty — directly against the Blueprint voice CLAUDE.md asks for).
   If no row exists for that date (e.g. the cron hasn't been running long
   enough, or a day was skipped), the card is omitted entirely rather than
   shown empty or with a placeholder — silence is more honest than a fake
   "no data" card competing for attention with the live recommendation.
2. **"Today"** — today's row, the actual second deliverable from CLAUDE.md
   ("a recommendation for today's optimal session"), and the screen's
   primary content.

This is a deliberate, documented narrowing of "summary of yesterday" to
"yesterday's recommendation, not yesterday's outcome" — the honest version
of that output given what data actually exists right now. A future engine
phase that joins `sessions` to produce a true done-vs-recommended summary
can replace this card's content without changing this screen's structure.

### 3. Friendly-name mapping is a small static lookup, separate from the engine's own `public_rationale` string-replace

`session_type`'s 8 values map to display names via a local TypeScript
object, not by reusing or parsing the engine's `top_type.replace("_", "
")`-style logic embedded in `public_rationale`'s sentence:

```ts
const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  upper_a: 'Upper Body A',
  upper_b: 'Upper Body B',
  lower_a: 'Lower Body A',
  lower_b: 'Lower Body B',
  pickleball: 'Pickleball',
  run: 'Run',
  rest: 'Rest',
  mobility: 'Mobility',
};
```

Reasons: the engine's in-sentence replacement (`"upper_a"` → `"upper a"`,
lowercase, single space) is intentionally plain because it's embedded
mid-sentence in prose generated for a different purpose (the rationale
text) and was never meant to be the UI's headline label. This screen wants
a properly capitalized, scannable headline (`"Upper Body A"`) distinct from
the rationale sentence's own casual in-line phrasing — the two appear
together on screen (headline + sentence below it), and having both follow
identical casing/spacing rules isn't a requirement and isn't worth coupling
the UI's display strings to the exact string-formatting choice inside
`engine/rationale.py`, which could change independently (it's Python
template text, disposable by CLAUDE.md's own "engine is disposable"
principle) without this screen needing to change. The lookup table is a
closed, 8-entry mapping over a Postgres enum that has not changed since
Phase 0/1 — low risk of drift, and a single place to fix if a value is ever
added.

### 4. Demo-video links and rep ranges: explicitly out of scope this phase, not stubbed

CLAUDE.md's "two outputs" line mentions "demo-video links for complex
movements and target rep ranges" as part of the recommendation output. This
phase does not add either, for a concrete reason: **the data doesn't exist
to add them correctly.** `recommendations` has no exercise-level structure
at all (it stores a `session_type`, not a list of exercises) and
`engine/rationale.py` never reads the `exercises` table's
`demo_video_url`/`is_complex` columns. Building a client-side guess (e.g.
hardcoding "if top_pick is upper_a, show these 4 exercise links") would
mean inventing a second, UI-side source of program truth that duplicates
and could drift from whatever program logic eventually lives in the
engine — directly against CLAUDE.md's "data model permanent, engine
disposable" principle, which implies program content decisions belong in
the engine/data layer, not hardcoded into a render function. This was
considered for a "trivial static lookup" shortcut (a hardcoded
`session_type → exercise list` map duplicating the *idea* of `exercises`
without using the real table) and rejected — it isn't actually trivial to
do *correctly* (it requires picking which exercises represent each session
type, which is genuine programming-content judgment, not a mechanical
lookup) and would ship something that looks finished but encodes guesses
nobody asked this phase to make. Deferred to a future engine phase that
actually joins `recommendations`/`session_type` to specific exercises server-side; this phase ships the two outputs CLAUDE.md actually has data
for today.

### 5. Fetch on mount and on foreground, no polling, no realtime

Mirrors the existing HealthKit sync's trigger pattern exactly
(`apps/mobile/lib/healthkitSync.ts` / `App.tsx`'s `AppState` listener):
fetch happens once when the signed-in session becomes available, and again
on every foreground transition. No `setInterval` polling and no Supabase
realtime subscription — `recommendations` gets at most one new row per day
(the cron runs once at 11:00 UTC), so polling or realtime would add
complexity (a new dependency surface, subscription lifecycle management)
for a data source that changes on a once-daily cadence. Re-fetching on
foreground already covers the realistic case (opening the app the next
morning) without any of that.

### 6. Which row counts as "today": query by `date = today`, not "most recent row", and render an explicit not-yet-generated state rather than silently showing a stale day

Two options were considered: always show the most recent row regardless of
its date (simpler query, never shows an empty state), or specifically query
`date = today` and handle the case where that row doesn't exist yet.
Decision: **query for `date = today` explicitly.**

Reasoning: "most recent row" silently degrades into showing yesterday's
(or older) recommendation under today's "Today" heading whenever the cron
is late, fails, or simply hasn't fired yet that day (per the daily cron
spec's own documented behavior: the job runs at 11:00 UTC and gives no
guarantee of exact timing — GitHub's own docs note scheduled workflows can
run late under platform load — and `recovery_repo`/the engine itself
already tolerate `readiness = None` if Oura hasn't synced, meaning the
written row can exist with degraded confidence even when it does land on
time). Mislabeling yesterday's pick as today's would be exactly the kind of
unmeasured, overconfident claim the Blueprint voice CLAUDE.md asks for is
not — "evidence-based" includes being honest about absent evidence.

Concretely:

- **Before the cron has run for today** (e.g. it's 6am Pacific / 13:00 UTC
  on a day the 11:00 UTC run hasn't landed yet, or — more commonly during
  initial rollout — simply any time before 11:00 UTC): no row exists for
  `date = today`. The screen shows a measured, honest placeholder under the
  "Today" heading: `"Today's recommendation hasn't generated yet — check
  back this morning."` No spinner-forever, no fake data, no auto-retry
  loop; the next foreground/launch re-fetch picks it up once the cron has
  run, per Decision 5.
- **The readiness-not-yet-available case is already handled upstream, not
  duplicated here.** Per `docs/superpowers/reports/autonomous-build-log.md`'s
  2026-06-23 cron entry, the engine and `recovery_repo` already tolerate
  `readiness = None` and still write a complete `recommendations` row (using
  whatever scoring the readiness gate allows without a reading). That means
  by the time any row exists for `date = today`, it is always a complete,
  renderable row — `public_rationale` is `not null` in the schema and the
  engine always populates it, readiness or not. This screen therefore has
  exactly two states to handle (row exists / row doesn't exist yet), not a
  third "row exists but is incomplete" state — there's nothing for the UI
  to special-case there; the "Today's pick is rest -- your recovery signals
  were low today" vs. an ordinary pick is already just different text in
  the same `public_rationale` field, not a different shape.
- This also naturally explains the empty "Yesterday" card case in Decision
  2 the same way: if yesterday's cron run failed entirely or skipped (rare,
  but the daily cron spec's Non-goals explicitly accept "no backfill for a
  missed day" as possible), querying `date = yesterday` simply returns no
  row, and the card is omitted — consistent behavior, one code path, two
  call sites (today's date, yesterday's date) rather than two different
  fetch strategies.

### 7. One combined query for both rows, not two round-trips

Both the "yesterday" and "today" rows come from the same view and the same
two known dates. Rather than issuing two separate `supabase-js` calls, the
screen issues one query (`.in('date', [todayIso, yesterdayIso])`) and
splits the (at most 2-row) result client-side by comparing each row's
`date` field. Simpler network behavior (one request, one loading state) for
a screen that has nothing meaningfully different to show while "only one of
the two" has resolved — both cards become visible together once data
arrives, which matches how a once-daily data source is naturally consumed
(there's no value in streaming "yesterday" in half a second before
"today").

### 8. No navigation library; this is a state swap inside the existing single `App.tsx`

Per the phase brief and the existing codebase: `apps/mobile/` has no
navigation library installed (`package.json` confirms — only
`@supabase/supabase-js`, HealthKit, and Apple Auth packages) and one screen
does not justify adding `react-navigation`/`expo-router`. The existing
`App.tsx` already branches between "show sign-in button" and "show signed-in
content" via a single `session` state check; this phase extends the
signed-in branch's rendering (replacing the bare `Text` with the new
recommendation view) rather than introducing a routing concept for what is
still, after this phase, a one-screen app.

### 9. New module: `apps/mobile/lib/recommendations.ts`, following the existing `lib/` convention

Matches the established one-module-per-concern pattern
(`lib/supabase.ts`, `lib/healthkitSync.ts`, `lib/healthkitMapping.ts`).
Exports a single typed function,
`fetchRecommendations(today: Date): Promise<{ today: RecommendationPublicRow | null; yesterday: RecommendationPublicRow | null }>`,
that performs the Decision 7 combined query and the Decision 6 date-match
split, returning a small typed result the component renders directly — no
business logic (date math, friendly-name mapping) lives inside `App.tsx`'s
component body beyond simple JSX conditionals.

## Approach

```
App launch / session ready / foreground transition
        │
        ▼
fetchRecommendations(new Date())     (apps/mobile/lib/recommendations.ts)
        │
        ├─▶ supabase.from('recommendations_public')
        │      .select('date, top_pick, runner_up, public_rationale, generated_at')
        │      .in('date', [todayIso, yesterdayIso])
        │
        ▼
  rows: RecommendationPublicRow[]  (0, 1, or 2 rows)
        │
        ├─▶ split by row.date === todayIso / === yesterdayIso
        │
        ▼
  { today: Row | null, yesterday: Row | null }
        │
        ▼
App.tsx renders:
  ┌─────────────────────────────────────┐
  │ Yesterday                            │  ← omitted entirely if null
  │ Lower Body A                         │
  │ "Today's pick is lower a -- ..."      │
  ├─────────────────────────────────────┤
  │ Today                                │
  │ Mobility                             │  ← SESSION_TYPE_LABELS[top_pick]
  │ Runner-up: Upper Body A              │  ← SESSION_TYPE_LABELS[runner_up]
  │ "Today's pick is mobility -- a       │  ← public_rationale, verbatim
  │  mobility session was overdue.       │
  │  Runner-up: upper a."                │
  └─────────────────────────────────────┘
  (or, if no row for today yet:)
  ┌─────────────────────────────────────┐
  │ Today                                │
  │ Today's recommendation hasn't        │
  │ generated yet -- check back this     │
  │ morning.                             │
  └─────────────────────────────────────┘
```

- No new Supabase migration — Decision 1 reuses the existing
  `recommendations_public` view and its existing grants verbatim.
- No new npm dependency — `@supabase/supabase-js` is already installed and
  already authenticated.
- `App.tsx`'s existing sign-in branch and HealthKit `useEffect` are
  untouched; only the signed-in render branch changes, plus one new
  `useEffect` (mirroring the HealthKit sync `useEffect`'s shape: fires when
  `session` becomes truthy, plus on every foreground transition) that calls
  `fetchRecommendations` and stores the result in local component state.

## Testing / verification plan

- Unit tests for `lib/recommendations.ts`'s date-splitting logic
  (`fetchRecommendations`), using a mocked `supabase` client (the same
  approach this phase's plan documents in detail — no real network call),
  covering: both rows present, only today present, only yesterday present,
  neither present, and confirming the function never reads/returns a field
  outside the view's four columns plus `date` (i.e. the function's return
  type structurally cannot carry `internal_rationale`/`score_breakdown`
  even if a test double accidentally included them — TypeScript's
  structural typing on the declared `RecommendationPublicRow` type is the
  enforcement mechanism here, not a runtime check).
- Unit tests for the friendly-name lookup (`SESSION_TYPE_LABELS`) — all 8
  enum values present, no `undefined` results.
- `npx tsc --noEmit` inside `apps/mobile/` — confirms the new module and
  `App.tsx`'s edits type-check against the installed `@supabase/supabase-js`
  types.
- `npx expo export --platform ios` — confirms the JS bundle builds with the
  new code, mirroring the verification pattern already used in the
  HealthKit sync phase for catching bundler/import errors without a device.
- Manual/device verification (cannot be automated, same class of limitation
  already documented in the HealthKit sync spec): open the TestFlight build
  signed in, confirm the screen renders a real `top_pick`/`runner_up`/
  `public_rationale` from the live `recommendations_public` view (data
  already exists there from the live cron runs on 2026-06-22/23), and
  confirm the not-yet-generated placeholder appears correctly if checked
  before 11:00 UTC on a day that hasn't run yet.

## Out of scope

- A true "what Sohan actually did yesterday" summary sourced from
  `sessions` (Decision 2) — deferred to a future engine phase.
- Demo-video links and target rep ranges (Decision 4) — deferred to a
  future engine phase that adds exercise-level structure to
  `recommendations` or joins `exercises` server-side.
- Navigation library, multiple screens, push notifications, polling/realtime
  (Decisions 5, 8).
- Any schema or engine change — this phase is mobile-app-only, read-only
  against existing data.
- Android (standing non-goal across this whole pipeline).
