# Engine v2 (Phase 2) — design spec

## Background

Phase 0 (schema v2) and Phase 1 (exercise catalog v2) are merged to `master`.
The `exercises` table now has 189 rows (17 v1 + 172 new), each tagged with
`exercise_type`, `target_goals`, `body_parts`, `evidence_rationale`,
`equipment_needed`, `default_sets`, `default_rep_range`, `unilateral`,
`is_corrective`. `session_type` was simplified from
`upper_a/upper_b/lower_a/lower_b/pickleball/run/rest/mobility` to a flat
6-value enum (`upper, lower, pickleball, run, rest, mobility`) in
`20260623143000_simplify_session_type_enum.sql`. `user_profile` gained
`preferred_split` (FK to a new `split_taxonomy` table), `activities`,
`current_goals`, `pains` (jsonb array of `{body_part, severity, note,
since}`), `location` (`{lat, lon, label, timezone}` jsonb), and more. New
child tables `recommendation_blocks` / `recommendation_block_exercises` exist
but nothing writes to them yet. `engine/run_daily.py`'s hotfix commit
(`03da84b`) already adapted `scoring.py`/`rationale.py` to the new 6-value
enum as a production patch — this phase is the *planned*, fuller version of
that adaptation plus the net-new LLM exercise-selection layer described in
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s "Engine v2
architecture (Phase 2 — full detail)" section (the canonical source this
spec elaborates, not duplicates).

The v2 pipeline design's Decision 1 explicitly overrides CLAUDE.md's original
"rules-based engine first, ML only after months of logged data" stance:
Claude now reasons about *which exercises* to prescribe each day, grounded in
a four-voice persona system prompt (longevity coach / hypertrophy-physique /
evidence-based programming / physical-therapist-rehab), while the *day-type*
decision (upper vs. lower vs. pickleball vs. rest, etc.) and every
safety-critical gate stay 100% deterministic in `scoring.py`. This spec
documents that boundary precisely, since it is the one invariant the rest of
the pipeline depends on staying intact.

## Goals

- Update `engine/scoring.py`: confirm/finish the 6-value `CANDIDATES` adapted
  in the production hotfix; add a `gate_today(...)` wrapper around
  `recommend()` that can legitimately return more than one gated block type
  for a single day (e.g. `[pickleball, mobility]` when a warmup/cooldown
  bracket is warranted) without changing `recommend()`'s own scoring
  contract; parameterize the same-pattern-penalty / pattern-rotation logic by
  the user's `preferred_split`'s `split_taxonomy.day_labels` instead of a
  hardcoded upper/lower binary; add a deterministic weather-gate
  precondition for `pickleball` that degrades open (skip the check, don't
  block pickleball) if the weather API is unreachable.
- Add `engine/weather_client.py`: a small, dependency-free Open-Meteo client
  mirroring the existing `oura_client.py`/`supabase_client.py` raw-`urllib`
  style, answering one question — "is it currently/imminently raining or
  otherwise unsuitable for outdoor pickleball at this lat/lon" — from
  `user_profile.location`.
- Add `engine/program_builder.py`: the new LLM exercise-selection layer.
  Assembles a stable→volatile prompt (persona system prompt → catalog
  excerpt → profile slice → recent-history/feedback summary → today's gate),
  calls Claude via `client.messages.parse()` with a structured-output schema
  whose `exercise_id` field is constrained to an enum of the actual UUIDs in
  that day's catalog excerpt (anti-hallucination), validates the response
  against the same invariants a second time at runtime, falls back to a
  deterministic template program on any failure, never leaks raw biometrics
  into the prompt, and forbids naming the four grounding experts/voices in
  any user-facing text. Persists into `recommendations` +
  `recommendation_blocks` + `recommendation_block_exercises`.
- Update `engine/run_daily.py` to call `gate_today()` then
  `program_builder.build_daily_program(...)` in place of the current direct
  `recommend()` → `rationale.py` flow, while keeping `rationale.py`'s
  deterministic `internal_rationale`/`public_rationale` text generation
  (still written from the score breakdown, now describing the gated block
  list rather than a single top pick/runner-up pair).

## Non-goals (out of scope for this phase)

- `build_program_for_activity(...)` (the on-demand swap entry point) and any
  Supabase Edge Function / API route to invoke it on-demand from the mobile
  app. The v2 pipeline design lists this as `program_builder.py`'s "second
  entry point" but it is a user-initiated, request/response surface with no
  cron caller — wiring the daily batch path (`run_daily.py` → nightly cron)
  is this phase's job; the on-demand HTTP entry point is mobile/API-surface
  work for a later phase. This spec's plan stubs `build_program_for_activity`
  only if doing so is free; otherwise it is explicitly deferred, not built.
- Any mobile/app code (Phases 3, 5–7 per the v2 pipeline design).
- Changing `recommendations_public`'s column contract (`date, top_pick,
  runner_up, public_rationale, generated_at` stays exactly as-is — no view
  changes in this phase).
- A real secrets/API-key provisioning step for the weather check — Open-Meteo
  needs no key (see Decisions below), so there is nothing to provision.
- Tuning `WEIGHTS` values themselves (rest/mobility-overdue thresholds,
  same-pattern penalty magnitude, etc.) — this phase parameterizes *which*
  patterns participate in the rotation, not the numeric weights.
- The 10%/week running progression cap and 10-day target-ratio balancing —
  still-tracked, still out of scope, unrelated to this phase's LLM layer.
- Building out `body_part_taxonomy`/`goal_taxonomy`/`activity_taxonomy`
  further — they're already seeded (Phase 0) and consumed read-only here.
- Real prompt-cache *measurement* (no live Claude account access during this
  build) — the code is structured for the two-breakpoint caching strategy
  the v2 design specifies, but cache-hit verification happens at runtime,
  not in this phase's automated tests.

## Decisions

Ambiguities resolved here since this phase runs autonomously with no
interactive Sohan review:

1. **Weather gate implementation: Open-Meteo, no API key.** Per the explicit
   instruction already resolved before this dispatch — Open-Meteo
   (`https://api.ouraring.com`-style plain HTTPS GET, no auth, no signup, no
   paid tier) is used for "is it currently/imminently bad for outdoor
   pickleball at this lat/lon." Concretely: `GET
   https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=precipitation,weather_code&forecast_days=1&hourly=precipitation_probability` —
   bad-weather is `current.precipitation > 0` OR `current.weather_code` in
   Open-Meteo's WMO rain/storm/snow code set (51-99 inclusive covers
   drizzle/rain/snow/thunderstorm; see implementation) OR the next-3-hours
   max `hourly.precipitation_probability` exceeds 60%. This is conservative
   (errs toward "skip pickleball, recommend something else") but never
   *blocks* — see Decision 2. `user_profile.location` already has `lat`/`lon`
   (Phase 0 schema), so no new column is needed. If `location` is null for
   the profile (never filled in), the weather gate is skipped entirely (same
   open-degrade posture as an API failure) rather than treated as an error.

2. **Weather-gate failure mode: open, not closed.** Mirroring the existing
   `readiness is None` posture in `scoring.py` (a missing signal doesn't
   crash the engine, it just doesn't apply that gate), any exception from
   `weather_client.is_bad_for_pickleball(...)` — network failure, malformed
   response, missing `location` — is caught in `scoring.py`'s call site and
   treated as `False` (not bad weather), with a one-line stderr warning. The
   v2 design spec is explicit on this ("if the weather API is down, don't
   block pickleball, just skip the check that day") — this is a literal
   implementation of that sentence, not a new judgment call.

3. **`gate_today()`'s contract.** `gate_today(day, history, readiness,
   pains, weather_bad) -> list[str]` wraps `recommend()` (which still
   returns the top-2 scored pairs the existing rationale builder consumes)
   and additionally decides whether a second, bracketing block belongs
   alongside the top pick — currently the only bracketing case in scope is
   pickleball's mandatory 5-minute ankle warmup (CLAUDE.md's "single
   highest-leverage injury-prevention habit"), expressed by returning
   `["pickleball", "mobility"]` instead of just `["pickleball"]` when
   `top_pick == "pickleball"`. `run_daily.py` calls `gate_today()` once;
   `program_builder.py` receives the gated list directly. `recommend()`'s
   own signature and return shape are untouched — `gate_today()` is an
   additive wrapper, not a rewrite, so `rationale.py`'s existing breakdown
   construction keeps working off `recommend()`'s top2 pairs for the
   "why this was picked" text, while `gate_today()`'s output is the
   block-type list `program_builder.py` actually builds exercises for.

4. **Pattern-rotation parameterization.** `pattern_of(session_type)` and the
   same-pattern-penalty in `score_candidate()` currently hardcode
   `upper`/`lower` as the only two "patterns" that penalize repetition.
   Per the v2 design's instruction to parameterize by
   `preferred_split.split_taxonomy.day_labels`, `pattern_of` becomes
   `pattern_of(session_type, day_labels)`: if `session_type` is a strength
   day (`session_type in ("upper", "lower")` for the legacy default, or more
   generally any value also present in `day_labels`), it passes through
   unchanged; non-strength types (`pickleball`, `run`, `rest`, `mobility`)
   pass through unchanged too, exactly as today. This keeps `upper_lower`'s
   existing behavior identical (its `day_labels = ["upper", "lower"]` is
   already what `CANDIDATES` produces) while making `push_pull_legs` /
   `arnold` / `full_body` splits meaningful once the engine ever recommends
   those day labels — which it does not yet, since `CANDIDATES` itself stays
   the 6 simplified session types per the v2 design ("day-to-day variety
   comes from Claude's per-day exercise selection and the
   preferred_split/split_taxonomy rotation, not enum variants"). Concretely
   this phase: (a) makes `pattern_of`/`days_since`/`score_candidate`/
   `recommend` accept an optional `day_labels` parameter defaulting to
   `["upper", "lower"]` (so every existing call site and test keeps working
   unchanged), and (b) has `run_daily.py` pass the caller's real
   `preferred_split.day_labels` (looked up from `user_profile` +
   `split_taxonomy` via a new tiny repo function) instead of the default.
   `CANDIDATES` itself is not changed to include non-`upper_lower` day
   labels — that is explicitly deferred (see Non-goals): this phase makes
   the *plumbing* split-aware without yet acting on a different split, since
   doing the latter would require teaching `program_builder.py` to map
   `split_day_label` to a real Claude-selected exercise block, which is
   already in scope (block 3, `split_day_label` field) but the rotation
   logic driving which day label is "next" for a 3-or-more-day split is a
   genuinely separate algorithm (which Push/Pull/Legs day comes after
   today's) that CLAUDE.md never specified and the v2 design spec does not
   resolve either — tracked as a documented follow-up, not silently
   skipped.

5. **Claude API surface — verified via the claude-api skill this session,
   not assumed.** Structured output: `client.messages.parse(model=...,
   max_tokens=..., system=[...], messages=[...], output_config={"format":
   {"type": "json_schema", "schema": SCHEMA}})` — `.parse()` validates the
   response against the schema automatically and exposes `.parsed_output`.
   The plain `messages.create(..., output_config={"format": {...}})` shape
   also works but `.parse()` is the documented recommended path. Model IDs:
   `claude-sonnet-4-6` (daily program-builder + on-demand swap, per the v2
   design's cost table) and `claude-haiku-4-5` (yesterday's-summary blurb —
   out of scope this phase, tracked for Phase 5/7). Neither model accepts
   `budget_tokens`; this phase does not request extended thinking at all
   (the program-builder task is bounded structured extraction over a fixed
   catalog excerpt, not open-ended reasoning that benefits from a thinking
   budget) — `thinking` is omitted entirely, matching Sonnet 4.6's "thinking
   off unless requested" default. Prompt caching: `cache_control: {"type":
   "ephemeral"}` on (a) the last block of the persona system prompt and (b)
   the last block of the catalog-excerpt portion of the first user turn,
   exactly as the v2 design's "Claude API integration & cost" section
   specifies — max 4 breakpoints allowed, this phase uses exactly 2.
   `anthropic` becomes a new runtime dependency of `engine/` (currently
   `dependencies = []` in `pyproject.toml`); pinned to `>=0.70` (first
   version with `.parse()` support) rather than unpinned, since `engine/`
   has no other external dependency to pin against for precedent.

6. **Anti-hallucination enum + runtime invariant check are two distinct,
   redundant layers, both implemented.** The `output_config.format` JSON
   schema's `exercise_id` field is a per-request `enum` of the literal
   exercise UUIDs included in that day's catalog excerpt (typically 15-40
   rows, filtered by the day's block types' relevant `movement_pattern`/
   `target_goals`/`body_parts`, well under any schema-size concern). This
   makes a hallucinated ID a schema-validation failure inside `.parse()`
   itself (raises, caught by the same try/except that triggers the
   fallback path) rather than a silent bad write. Additionally, *after* a
   successful parse, `program_builder.py` re-checks every returned
   `exercise_id` against the same excerpt's id set and that each exercise's
   `target_goals`/`body_parts` are not actively contraindicated by a
   `severity >= 8` pain entry the catalog excerpt's own filtering already
   tried to exclude (defense in depth — the filtering happens twice,
   independently, so a bug in one layer doesn't silently ship an unsafe
   exercise). Any invariant violation triggers the same fallback path as a
   parse failure.

7. **Catalog excerpt selection (what subset of 189 exercises goes in the
   prompt).** Built deterministically in Python before the Claude call, not
   left to a separate retrieval step: for each gated block type, filter
   `exercises` by `movement_pattern` (strength blocks: `squat`/`hinge`/
   `push`/`pull`/`core`; mobility blocks: `mobility`/`balance`) AND
   (`target_goals` intersects `user_profile.current_goals` OR
   `body_parts` intersects the user's active `pains` body parts OR
   `is_corrective = true` for a pain-relevant body part) — capped at 40
   rows per block type, ordered by `is_corrective DESC, default_sets NULLS
   LAST` for determinism. This keeps the prompt's stable catalog-excerpt
   portion reasonably sized (well inside the v2 design's ~6,800-stable-token
   budget) without making Claude do retrieval. The excerpt is rendered as a
   compact pipe-delimited table (id, name, movement_pattern, body_parts,
   target_goals, default_sets, default_rep_range, unilateral,
   is_corrective) rather than full JSON, to keep token cost down — matching
   the project's existing preference for compact, debuggable text formats
   (`rationale.py`'s plain-sentence style) over verbose structured dumps
   where a human or the model only needs to scan, not round-trip, the data.

8. **Leak mitigation: reuse `rationale.py`'s existing categorical-label
   pattern, do not invent a second one.** `rationale.py` already solves
   "describe today's signals without raw biometrics" for `public_rationale`
   (`_SIGNAL_LABELS`-style categorical phrases, never a raw readiness
   score). `program_builder.py`'s profile-slice prompt section reuses the
   identical posture: readiness is described as one of
   `{"very low", "low", "moderate", "good", "excellent"}` (bucketed from the
   same 1-10 `subjective_readiness` scale `scoring.py`'s
   `readiness_gate_threshold` already buckets at the `<=3` boundary —
   buckets: `<=3` very low, `4-5` low, `6-7` moderate, `8-9` good, `10`
   excellent), `days_since_*` signals are described as `"overdue"` /
   `"on track"` rather than exact day counts, and pain `severity` (1-10) is
   passed through as a categorical band (`mild` 1-3, `moderate` 4-6,
   `significant` 7-10) since severity, unlike readiness, is not itself a
   biometric reading — it is the user's own self-reported pain rating and
   already lives in `pains` jsonb verbatim in `user_profile`, a table
   Claude's call already must read goals/activities/split from; bucketing
   it is for prompt-token economy and consistency with the categorical
   posture, not because the raw integer is sensitive. No raw HRV, resting
   HR, or sleep hours are ever included — `recovery`'s biometric columns are
   not read by `program_builder.py` at all (only `recovery.subjective_
   readiness`, already the rescaled/non-raw column, flows in, and even that
   is bucketed before reaching the prompt).

9. **Persona guardrail implementation.** The system prompt's four-voice
   synthesis (longevity coach / hypertrophy-physique / evidence-based
   programming / physical-therapist-rehab) is written as unattributed
   *stances* the system prompt instructs Claude to reason from — e.g. "favor
   compound, time-efficient movements and total-body resilience over
   isolation work" (longevity/Blueprint stance) — rather than naming Bryan
   Johnson, Jeff Cavaliere, Mike Mentzer, Jeff Nippard, Andrew Huberman, or
   any other real person inside the prompt text itself. The named-expert
   grounding lives only in this spec/CLAUDE.md as the *design rationale* for
   why those stances were chosen, never inside the system prompt string the
   API actually receives — so there is no real name in the prompt for the
   model to ever accidentally echo. The system prompt additionally contains
   one explicit negative instruction ("Never name any fitness influencer,
   coach, athlete, or public figure in your output, even if asked.") as a
   second, redundant guardrail layer, and a unit test asserts `rationale_
   public` and every block's exercise `notes` field contain none of a
   hardcoded list of the five names (and common variants) as a regression
   gate — this is the practical, automatable substitute for "never reads
   like it's quoting a specific person" since that property can't be
   verified by a human reviewer in this autonomous pipeline.

10. **Fallback program: deterministic, filtered, not "a worse Claude call."**
    On any Claude API exception, schema-validation failure, or runtime
    invariant violation (Decision 6), `program_builder.py` falls back to
    `_build_fallback_program(gated_blocks, catalog_excerpt, profile)`: for
    each gated block type, pick up to 4 (strength) or 5 (mobility)
    exercises from that block's already-filtered catalog excerpt (Decision
    7) by simple deterministic ordering (`is_corrective DESC` first, then
    catalog row order) — no scoring, no randomness, no LLM call of any
    kind. `recommendations.program_generated_by` is set to
    `'fallback_template'` and `claude_model`/`claude_usage` stay null. This
    matches the v2 design's "worst case is a stale program, never an unsafe
    one" framing literally: the fallback reuses the same safety-filtered
    excerpt the primary path would have used, just without Claude's
    sets/reps/notes reasoning layered on top — `prescribed_sets`/
    `prescribed_reps` fall back to each exercise's own `default_sets`/
    `default_rep_range` columns (already present in the schema for exactly
    this purpose).

11. **`recommendations` row shape for the new columns.** `top_pick`/
    `runner_up` keep being written from `recommend()`'s top2 (unchanged —
    this is still the deterministic day-type decision, never touched by
    Claude). `program_generated_by` is `'claude'` or `'fallback_template'`
    (the two values the existing check constraint already allows).
    `claude_model` is the literal model ID string used (`'claude-sonnet-4-6'`)
    when `program_generated_by = 'claude'`, else null. `claude_usage` is the
    raw `{"input_tokens": ..., "output_tokens": ...,
    "cache_creation_input_tokens": ..., "cache_read_input_tokens": ...}`
    dict from the API response's `usage` object when Claude was called,
    else null — these are exactly the fields the v2 design's cost table is
    derived from, so persisting them is what makes future cost analysis
    possible without re-deriving it from logs.

12. **`build_program_for_activity` stub posture.** Per Non-goals, the
    on-demand swap entry point is out of scope for the dispatch boundary
    (no HTTP surface to call it from yet), but `program_builder.py`'s
    internals (catalog excerpt building, prompt assembly, Claude call,
    fallback, persistence) are written as small composable functions
    specifically so that a future `build_program_for_activity(...)` is a
    thin wrapper reusing them, not a parallel implementation. This phase
    does not add the function itself — adding an unused, untested public
    entry point with no caller would violate the "no speculative
    abstraction" convention this codebase otherwise follows strictly (see
    every existing module's docstrings). The plan's Task breakdown notes
    exactly which functions are designed for that reuse.

13. **Test strategy mirrors the existing engine convention: pure functions,
    mocked network, no live Claude/Supabase/Open-Meteo calls in the
    automated test suite.** Exactly like `test_scoring.py`/`test_rationale.py`/
    `test_run_daily.py`, every new test in `engine/tests/` is a pytest
    function asserting against in-memory fixtures, with `anthropic`'s
    client and `weather_client`'s `urllib` call mocked via
    `unittest.mock.patch` — never a real API key requirement to run the
    suite. There is no live-data acceptance-gate script analogous to
    `test_exercise_catalog.py`'s `main()` in this phase, since there is no
    new table to seed-and-verify; manual verification of the real Claude
    call happens once, by a human or a later dispatch, against the live
    Supabase project with a real `ANTHROPIC_API_KEY`, documented as a
    Task step but not part of the automated suite.

## Out of scope

Restated from Non-goals for plan-writing clarity — these are explicitly
*not* part of this phase's Task breakdown:

- `build_program_for_activity` itself (only its internals are reusable).
- Any Supabase Edge Function, API route, or mobile-facing endpoint.
- Mobile app changes of any kind.
- `recommendations_public` view changes.
- Weather-API secret/key provisioning (none needed).
- `WEIGHTS` value tuning.
- The 10%/week run cap, 10-day ratio balancing.
- New `goal_taxonomy`/`body_part_taxonomy`/`activity_taxonomy`/
  `split_taxonomy` rows or columns.
- Live prompt-cache hit-rate measurement.
- Non-`upper_lower` split rotation logic (which Push day follows which) —
  the plumbing is split-aware (Decision 4) but `CANDIDATES` and the
  rotation algorithm itself stay `upper_lower`-only this phase.
