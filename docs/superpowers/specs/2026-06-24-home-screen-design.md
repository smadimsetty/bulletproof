# Home screen (Phase 5) — design spec

This is the design reference for Phase 5 of the v2 autonomous build pipeline
(`docs/superpowers/plans/2026-06-23-bulletproof-v2-pipeline.md`). It refines
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s "Phase 5 —
Home" subsection against the actual schema and code that exist today, and
documents two deliberate departures from that spec's literal wording (no
client-side Claude call; the swap picker has no real backend yet).

## Background

`apps/mobile/app/(tabs)/index.tsx` is still the Phase 3 placeholder — a
static "coming in Phase 5" label and a demo link into the logger route, just
enough to prove navigation works. Phase 2 (engine v2) now runs a real daily
job that writes `recommendations` + `recommendation_blocks` +
`recommendation_block_exercises` rows; Phase 4 (Settings) established the
shared `lib/theme.ts` style constants and a `components/` directory
convention this phase reuses. This phase makes the Home tab show that real
program for the first time on the phone.

## What the live data actually looks like (queried 2026-06-24)

Queried production Supabase directly with the service-role key
(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from the repo-root `.env`)
against `recommendations`, `recommendation_blocks`,
`recommendation_block_exercises`, and `exercises` for `date = 2026-06-24`:

- `recommendations` row: `top_pick: "mobility"`, `runner_up: "upper"`,
  `program_generated_by: "fallback_template"` (Claude was not used for this
  particular run — readiness or another precondition routed to the
  deterministic fallback path), `public_rationale: "Today's program covers:
  mobility."`.
- Exactly **one** `recommendation_blocks` row (`block_order: 0, block_type:
  "mobility", split_day_label: null, title: "Mobility", estimated_minutes:
  null`). `estimated_minutes` is null in this real row — the UI must not
  assume it's populated.
- Five `recommendation_block_exercises` rows under that block, ordered
  `exercise_order: 0..4`, all `is_unilateral_left_first: true`,
  `prescribed_sets` populated (2 or 3), `prescribed_reps` as free text in
  **inconsistent formats** across rows in the same block — `"10 reps/side"`,
  `"8-10 reps/side"`, `"30-45s hold"` — so the UI renders this column
  verbatim as a label, never parses or reformats it.
- Joining to `exercises`: `demo_video_url` is **null for 2 of the 3** rows
  checked. The UI must render a clear "no demo video" state, not assume a
  link always exists.
- Yesterday (`2026-06-23`) also has a real row: `top_pick: "mobility"`,
  `program_generated_by: null` (this predates the
  `program_generated_by`/`claude_model` columns being populated by the
  current engine code — another reminder to treat these as nullable),
  `public_rationale: "Today's pick is mobility -- a mobility session was
  overdue. Runner-up: upper a."` — note this sentence is grammatically
  stale (references "today" and the now-dropped `upper a` label) because it
  was written before the `session_type` simplification migration. This
  phase renders `public_rationale` as opaque text either way — it doesn't
  try to detect or fix old phrasing.
- No multi-block (e.g. upper + mobility-cooldown) row exists in production
  yet — every row queried so far is single-block. The renderer must still
  handle N blocks per the schema design (`block_order`-sorted list,
  contracted to render 1 by current real data, not hardcoded to 1).

## RLS confirmation (read, not assumed)

Read `supabase/migrations/20260623145500_multi_user_rls.sql` directly
rather than assuming the transitive policy shape:

- `recommendation_blocks`: `for select to authenticated using (exists (select
  1 from recommendations r where r.id = recommendation_blocks.recommendation_id
  and r.owner_id = auth.uid()))`.
- `recommendation_block_exercises`: `for select to authenticated using
  (exists (select 1 from recommendation_blocks b join recommendations r on
  r.id = b.recommendation_id where b.id =
  recommendation_block_exercises.block_id and r.owner_id = auth.uid()))`.

Both are `select`-only for `authenticated` (no service-role bypass needed),
and both correctly chain back to `recommendations.owner_id`. The mobile
app's anon-key client, once signed in, can read its own rows through these
joins with no additional grant or view needed. Confirmed by reading the
migration directly — not re-verified with a live authenticated client call
in this Planning phase, since the policy text itself is unambiguous; the
Developer's Task 2 acceptance step is a live read against these tables as
the signed-in test user, which doubles as runtime confirmation.

## A pre-existing bug this phase must fix

`apps/mobile/lib/recommendations.ts`'s `SessionType` union and
`apps/mobile/lib/sessionTypeLabels.ts`'s `SESSION_TYPE_LABELS` map both
still list `upper_a | upper_b | lower_a | lower_b` — the v1 enum values.
The schema v2 migration
(`supabase/migrations/20260623143000_simplify_session_type_enum.sql`)
dropped those four values in favor of `upper | lower | pickleball | run |
rest | mobility` weeks before this code was last touched (Phase 3/4 land
the mobile nav and Settings work, neither of which touched this enum).
Today, `top_pick`/`runner_up` from `recommendations_public` are typed as a
union that no longer matches what the database can return, and
`sessionTypeLabels.ts`'s lookup silently falls through to its `'Unknown'`
fallback for every real value the engine writes today (`'mobility'` isn't
in the stale map either — wait, `mobility` *is* still in both old and new
enum, but `upper`/`lower`/`pickleball`/`run`/`rest` collide with nothing in
the stale map's keys since the map only has `upper_a`/`upper_b`/`lower_a`/
`lower_b`, not bare `upper`/`lower`). This phase fixes both files as part of
its work (Task 1), since Home is the first screen to actually render
`top_pick`/`runner_up` as a label.

## Goals

- Replace the Home tab stub with: a "Yesterday" summary card reading
  `public_rationale` from yesterday's already-generated `recommendations`
  row (no new Claude call); a "Today's program" card rendering every
  `recommendation_blocks` row in `block_order`, each with its
  `recommendation_block_exercises` (name, sets, reps text, demo-video
  affordance), tappable into `app/logger/[blockId]`; a "Swap activity" entry
  point that opens a real grouped picker UI (Strength/Cardio/Recovery, per
  `activity_taxonomy.category`) but cannot actually perform a swap yet; a
  free-text daily-feedback box that upserts into `daily_feedback`.
- Fix the stale `SessionType`/`SESSION_TYPE_LABELS` v1 enum values as part
  of this phase's touch on those files (see above).
- Match the calm/minimal Oura-inspired visual language already established
  in `lib/theme.ts` and used by `settings.tsx`/the three Phase 4 components.

## Non-goals (explicitly out of scope for this phase)

- **Any client-side Claude/Anthropic API call of any kind.** No
  `ANTHROPIC_API_KEY` (or any secret enabling a Claude call) is ever
  embedded in the mobile bundle. The original v2 design spec's
  "YesterdaySummaryCard (Haiku-generated blurb)" wording is reinterpreted:
  the blurb is `recommendations.public_rationale`, already written
  server-side by the nightly engine (Claude or fallback) for every day
  including yesterday. This phase only reads that column. There is no
  server-side on-demand-Claude API route/Edge Function in this codebase to
  call even if it wanted to.
- **A working swap-activity backend.** `build_program_for_activity` was
  explicitly deferred out of the just-completed engine v2 phase (see
  `docs/superpowers/specs/2026-06-24-engine-v2-design.md`'s Non-goals and
  Decision 12, and the matching autonomous-build-log entry) — no Supabase
  Edge Function or API route exists to call. This phase builds the picker's
  UI shell (grouped list, Strength sub-grouped by the user's
  `preferred_split`'s `day_labels`) as a real, visible, tappable affordance,
  but selecting any option shows a "Swapping isn't available yet" message
  instead of performing a swap. This is a documented, deliberate phase-5
  gap, not a bug — flagged explicitly for the Reporter.
- Start/End workout flow, active-session banner, haptics — Phase 6
  (Logger)'s job; Home only navigates into the logger route, it doesn't own
  session lifecycle.
- Editing/swapping/removing individual exercises within a block — Phase 6.
- Trends screen, AI summary there — Phase 7.
- Any new Supabase migration. Every table/column this phase reads or
  writes (`recommendations`, `recommendation_blocks`,
  `recommendation_block_exercises`, `exercises`, `daily_feedback`,
  `activity_taxonomy`, `split_taxonomy`, `user_profile.preferred_split`)
  already exists and is already RLS-protected.

## Decisions

1. **Root layout's `fetchRecommendations`/`recommendations` state is
   replaced, not extended, by a new Home-owned fetch.** `app/_layout.tsx`
   currently fetches only `recommendations_public` (date, top_pick,
   runner_up, public_rationale, generated_at) — it has no path to blocks or
   exercises, and `recommendations_public` deliberately excludes
   `id`/`owner_id` (the public/private split), so it cannot be joined to
   `recommendation_blocks` (`recommendation_id` is the base
   `recommendations.id`, not exposed in the public view). Home needs the
   blocks/exercises join, which requires querying the base
   `recommendations` table (RLS-gated to the signed-in owner — safe for an
   authenticated screen, unlike the public view's anon-readable contract).
   Decision: add a new `apps/mobile/lib/homeProgram.ts` module with its own
   fetch (`fetchTodayProgram`/`fetchYesterdaySummary`) querying the base
   `recommendations` + child tables directly, and stop using
   `app/_layout.tsx`'s `recommendations` state for the Home screen's
   render. Leave `app/_layout.tsx`'s existing `fetchRecommendations`
   call and state exactly as-is (don't delete it) — it's harmless dead
   state today, but removing the HealthKit-sync-adjacent effect plumbing
   around it is out of scope for this phase and risks an unrelated
   regression for zero benefit. A future cleanup phase can remove the now-
   doubly-fetched public-view call once nothing references it; flagging
   that as a small follow-up, not blocking this phase.
2. **One screen-level fetch, not three.** `homeProgram.ts` exposes a single
   `fetchHomeData(today: Date)` that internally runs, in parallel: (a) the
   base `recommendations` row for today (`select
   id,date,top_pick,runner_up,public_rationale` — intentionally omitting
   `internal_rationale`/`score_breakdown`/`claude_usage` even though RLS
   would allow the owner to read them, since Home has no use for them and
   keeping the screen's query minimal matches the public/private
   discipline in spirit), its blocks, and each block's exercises joined to
   `exercises` for display fields; (b) yesterday's `recommendations` row,
   `public_rationale` only. Returns one typed result object. This mirrors
   `fetchRecommendations`'s existing "one function, two dates, one shape"
   pattern rather than introducing a different convention for no reason.
3. **Exercise display fields are fetched via a Supabase nested select**
   (`recommendation_block_exercises` → `exercises:exercise_id(name,
   demo_video_url, exercise_type)`), not a second round-trip per block.
   Supabase-js supports embedded resource selects on a foreign-key
   relationship; this keeps the query count constant regardless of block/
   exercise count.
4. **Today with zero blocks (recommendation row exists but
   `program_generated_by` is null/blocks haven't landed yet, or no row at
   all) renders an explicit "Today's program hasn't generated yet" empty
   state**, not a blank screen or a crash — mirrors the existing not-yet-
   generated handling precedent in the Phase 3-era `recommendations.ts`
   contract (today/yesterday can each independently be null).
5. **`prescribed_reps` (and `prescribed_weight_note` when present) render
   as opaque label text, never parsed.** Confirmed by the live data
   (mixed `"N reps/side"` and `"Ns hold"` formats in the same block) that
   any attempt to parse/normalize this column is guessing at a format the
   engine doesn't guarantee. Compose a single display line per exercise:
   `"{sets} x {reps}"` when both are present, falling back gracefully
   (sets-only, reps-only, or just the exercise name) when either is null —
   `prescribed_sets` is nullable in the schema even though every real row
   queried today has it populated.
6. **Tapping a block row navigates to `/logger/[blockId]` using the
   `recommendation_blocks.id`** (not the recommendation id or an index) —
   matches the existing route param name and the Phase 3 stub's contract
   (`useLocalSearchParams<{ blockId: string }>()`), and is the natural key
   Phase 6's logger needs to look up that block's exercises.
7. **No demo-video inline player.** A block exercise row with a non-null
   `demo_video_url` shows a small "Watch demo" link that opens the URL via
   `Linking.openURL` (React Native's built-in module, already implicitly
   available, no new dependency) in the system browser/YouTube app. A null
   `demo_video_url` renders no link at all (not a disabled placeholder —
   confirmed from real data that null is the common case, not an edge
   case, so a permanently-greyed-out link on most rows would look broken).
8. **Swap-activity picker UI shell**: a "Swap activity" `Pressable` under
   the program card's header opens the same bottom-sheet `Modal` pattern as
   `DropdownAddSection` (reusing its established look, not its component
   directly — `DropdownAddSection` is wired for multi/single-select-with-
   persistence semantics that don't fit a one-shot action picker). Options
   are grouped exactly like `settings.tsx`'s activity dropdown
   (`activity_taxonomy.category`, Strength/Cardio/Recovery, capitalized),
   with Strength's options being the signed-in user's `preferred_split`'s
   `split_taxonomy.day_labels` (read from `user_profile.preferred_split` ->
   `split_taxonomy`, one extra parallel fetch) rather than the literal
   string "Strength Training". Tapping any option closes nothing and
   performs nothing except setting a one-line inline message: "Swapping
   isn't available yet — this is coming in a future update." directly in
   the sheet (not a native `Alert`, which would be harder for the Tester to
   verify via static reasoning and is a heavier interaction than the
   message warrants). This satisfies "a real, visible affordance" while
   making the gap impossible to miss.
9. **Daily feedback box is a single multiline `TextInput` + explicit "Save"
   button**, matching `settings.tsx`'s established explicit-save pattern
   for free-text fields (Decision 4 in the settings-healthkit spec) rather
   than the dropdown-sections' autosave-on-change pattern — feedback text
   is exactly the kind of field a user edits over several seconds/drafts
   before being ready to commit, unlike a single-tap toggle or chip add.
   Writes an **insert** to `daily_feedback` scoped to today's date, not an
   upsert-by-date — the schema has no unique constraint on
   `(owner_id, date)` for `daily_feedback` (confirmed by reading
   `20260623144500_create_exercise_logs_and_daily_feedback.sql`: plain
   `id uuid primary key default gen_random_uuid()`, no unique index on
   `date`), so multiple feedback entries per day are a valid, intended
   shape (e.g. a morning note and an evening note) — not a bug to work
   around with upsert logic that isn't backed by a real constraint.
   Resetting the input to empty after a successful save (not re-fetching
   and displaying prior entries — a "show today's feedback history" list is
   a reasonable future enhancement but isn't in the original spec's Phase 5
   bullet and would expand this phase's scope).
10. **Loading/error states follow `settings.tsx`'s existing pattern**
    exactly: a top-level `loading` boolean short-circuits to a single
    centered "Loading…" `Text`, and a top-level `loadError` string
    short-circuits to a single centered error `Text` — no per-card skeleton
    loaders, no retry button (none of the existing screens have one
    either; introducing one here would be inconsistent, not an
    improvement).
11. **No new components extracted into `apps/mobile/components/` for this
    phase's single-use pieces** (the yesterday card, the program card, the
    feedback box) — they're rendered as local JSX blocks inside
    `index.tsx`, same granularity as how `settings.tsx` inlines its Diet/
    Weight/Location cards directly rather than extracting one-off
    sub-components. The swap-picker sheet *is* visually reusable (same
    shape as `DropdownAddSection`'s sheet) but is single-action, not
    multi-select-with-persistence, so it gets its own small local
    component, `SwapActivitySheet`, kept in the same file rather than a new
    `components/` file, since nothing else in the app needs it yet —
    extracting it to `components/` preemptively would be exactly the
    speculative abstraction CLAUDE.md's conventions warn against. If a
    later phase needs this exact pattern again, that's when it moves.
12. **TypeScript types for the new tables are hand-written interfaces in
    `homeProgram.ts`**, matching every other lib file's existing approach
    (no generated Supabase types anywhere in this repo) — `RecommendationRow`,
    `RecommendationBlockRow`, `BlockExerciseRow`, composed into one
    `HomeProgramResult`.
13. **`SessionType`/`SESSION_TYPE_LABELS` are corrected in place** (Task 1)
    to the live `upper | lower | pickleball | run | rest | mobility` enum,
    since Home is the first real consumer of `labelForSessionType` for
    block-type-derived labels (a block's `block_type` column is also
    `session_type`, reusing the same label map rather than inventing a
    second one).

## Verification bar

Same as the last two mobile phases — there is no RN component-render test
harness in this repo:
- Jest unit tests for every new pure function (`homeProgram.ts`'s fetch
  composition logic via mocked Supabase client, following
  `recommendations.test.ts`'s existing mocking pattern; any small display-
  formatting helper, e.g. the `"{sets} x {reps}"` composer, gets its own
  pure-function test).
- `npx tsc --noEmit` from `apps/mobile/` — clean compile, including the
  `SessionType` fix not breaking any existing reference.
- `npm test --prefix apps/mobile` — full existing suite stays green.
- `npx expo export --platform ios` — a real bundle smoke test, same bar as
  the nav and settings phases.
- Manual/visual verification of the actual screen is out of scope for
  automated checks (no harness exists) — the Tester's job is reading the
  component code against the task's stated behavior and the real schema,
  same precedent as `settings.tsx`'s review.

## Critical files

- `apps/mobile/app/(tabs)/index.tsx` — the file being replaced.
- `apps/mobile/app/_layout.tsx` — read for the existing
  `fetchRecommendations` pattern; left untouched per Decision 1.
- `apps/mobile/lib/recommendations.ts`, `apps/mobile/lib/sessionTypeLabels.ts`
  — the stale-enum bug fixed in Task 1.
- `apps/mobile/lib/theme.ts` — reused, not extended, for all new styling.
- `apps/mobile/components/DropdownAddSection.tsx` — the bottom-sheet visual
  pattern the new `SwapActivitySheet` borrows from (not imports).
- `supabase/migrations/20260623144000_create_recommendation_blocks.sql`,
  `20260623144500_create_exercise_logs_and_daily_feedback.sql`,
  `20260623145500_multi_user_rls.sql` — the live schema/RLS this phase
  reads against.
- `apps/mobile/app/logger/[blockId].tsx` — the existing stub navigation
  target; this phase's `router.push` call must match its `blockId` param
  contract exactly.
