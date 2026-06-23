# Engine productionization — design spec

## Background

`CLAUDE.md` and the Phase 2 spec
(`docs/superpowers/specs/2026-06-21-phase2-weight-tuning-design.md`)
established the deterministic scoring algorithm and validated its shape
against ~22 months of real Oura + reconstructed session history in
`prototyping/weight-tuning/scoring.py` (and tuned/sanity-checked in
`weight_tuning.py`). That work was explicitly prototype/throwaway code per
Phase 2's "Code location" decision — `engine/` was reserved from Phase 0/1
as the empty, real package this logic graduates into (see `engine/README.md`
and `engine/pyproject.toml`).

The `recommendations` table (`supabase/migrations/20260622001542_create_recommendations.sql`)
already exists with a `not null` contract on both `internal_rationale` and
`public_rationale`. Per `CLAUDE.md`'s "no LLM layer in v1" decision (the LLM
layer is described as optional, future, language-only — "Language, not
decisions"), this phase cannot defer rationale generation to a model call;
it must produce plain rule-based text for both columns today.

The autonomous build pipeline design
(`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`)
sequences this as backlog item 2, ahead of the GitHub Actions cron (item 3)
that will invoke it — so this phase's deliverable must be a single runnable
command with no interactive input, callable headlessly from CI.

## Goals

- Move the scoring engine from prototype to a real, importable Python
  package at `engine/`, runnable as a single command (`python -m
  engine.run_daily` or equivalent) with zero interactive input.
- Pull **today's** current Oura recovery/readiness data (not a historical
  backfill — that's already done in `recovery` from Phase 2) and upsert it
  into `recovery`, so the engine is self-sufficient each morning rather than
  depending on a separately-run pull script.
- Read recent `sessions` history from Supabase to feed the scoring engine's
  rotation/gating logic (`days_since`, same-pattern-as-yesterday).
- Run the existing scoring logic (ported, not reinvented) to get a top
  pick + runner-up + score breakdown for today.
- Generate plain, rule-based `internal_rationale` and `public_rationale`
  text — no LLM call — and write one row to `recommendations` matching its
  schema exactly (including the `not null` rationale columns).
- Reuse the existing `oura_client.py` / `supabase_client.py` /
  `env_loader.py` HTTP-plumbing patterns from `prototyping/weight-tuning/`,
  ported into `engine/` (not re-imported from `prototyping/`, which stays
  intentionally throwaway/exploratory per the Phase 2 spec's explicit
  phase-boundary decision).
- Be idempotent for a given day: re-running the job for the same date
  upserts (doesn't duplicate) the `recommendations` row, since `date` has a
  unique constraint and CI re-runs / manual re-triggers are plausible.

## Non-goals

- Any LLM-generated language. Explicitly deferred per `CLAUDE.md`'s "no LLM
  layer in v1" decision — both rationale columns get deterministic,
  template-based text from the score breakdown.
- The GitHub Actions cron workflow itself (`.github/workflows/*.yml`,
  scheduling, secrets wiring on the GitHub side). That's roadmap Phase 4 /
  backlog item 3 in the autonomous pipeline spec — out of scope here. This
  phase only needs to produce a command that *such* a workflow can invoke.
- Demo-video links / exercise selection within a session (the `exercises`
  table, `is_complex`, rep ranges). The `recommendations` table has no
  column for this yet — out of scope until that table/feature exists.
- The 10%/week running progression cap and the ~10-day target-ratio
  balancing mentioned in `CLAUDE.md` and flagged as still-missing in
  `weight_tuning.py`'s closing note. These are scoring-logic improvements
  to `scoring.py`'s algorithm itself, not productionization — out of scope
  for this phase, which ports the algorithm as-is. (Tracked as a follow-up;
  see Decisions below.)
- Writing to `sessions` (the engine only reads session history; it does not
  log what was actually done — that remains a separate, human/app-driven
  write path per `CLAUDE.md`'s open "logging model" question).
- Historical backfill of `recovery` — already done in Phase 2 via
  `prototyping/weight-tuning/oura_pull.py`. This phase only pulls *today's*
  record.
- Retry/backoff/observability infrastructure beyond what's needed for a
  single daily cron invocation to fail loudly and visibly in CI logs (no
  new logging service, no alerting integration).

## Decisions

Ambiguities resolved here since no clarifying questions could be asked
mid-build:

1. **"Current Oura recovery data" = today's `daily_readiness` (+ matching
   `sleep`) record**, fetched with `start_date == end_date == today` via the
   same `oura_client.fetch()` used for historical pulls. Rationale: Oura's
   readiness score is the single value the scoring gate (`readiness_gate_threshold`)
   consumes, and "today" is the only sensible reading of "current" for a
   morning cron job that scores *today's* candidate sessions. The fetched
   row is upserted into `recovery` via the existing `upsert(..., conflict_column="date")`
   pattern (idempotent), so the engine is self-sufficient even if Phase 2's
   `oura_pull.py` is never run again. If Oura has no data yet for today
   (e.g. ring not synced), the job proceeds with `readiness=None` —
   `scoring.py` already treats `None` as "no gate applied" (see
   `score_candidate`'s `if readiness is not None` checks) — rather than
   failing the whole run.

2. **"Recent sessions history" lookback = 60 days.** `scoring.py`'s
   `days_since()` searches up to 60 days back before returning the
   not-found sentinel (`999`). Pulling fewer than 60 days of `sessions`
   history would silently produce wrong "overdue" signals for rest/mobility
   (a real session 45 days ago would look like "never happened"). 60 days
   is therefore not an arbitrary choice — it's the window already implied
   by the ported algorithm, so the Supabase query for sessions filters
   `date >= today - 60 days` (a few days of buffer headroom is unnecessary
   since 60 is itself the cap `days_since` checks).

3. **Rationale text: deterministic templates over the score breakdown, not
   free text generation.** Both `internal_rationale` and `public_rationale`
   are built from the same inputs (top pick, runner-up, readiness, and the
   specific gate/bonus signals that fired — e.g. "rest overdue", "same
   pattern as yesterday penalized") but differ in disclosure level:
   - `internal_rationale`: includes raw numbers — today's readiness score,
     exact days-since-rest/mobility/pickleball counts, and which named
     bonuses/penalties fired with their weight values. This is the
     debugging-friendly version Sohan reads when tuning weights later, akin
     to the `weight_tuning.py` comparison table but for a single day.
   - `public_rationale`: a friendlier, biometric-free sentence — names the
     pick and the *reason category* (e.g. "your rest day was overdue", "same
     muscle pattern as yesterday") without exposing readiness scores or
     other raw biometrics. This matches the public/private split already
     encoded in the `recommendations_public` view's column allowlist (no
     `score_breakdown`, no raw signals) and the migration's own comment
     ("score_breakdown and internal_rationale can reference raw
     biometrics").
   - Implementation: a small `engine/rationale.py` module with two pure
     functions, `build_internal_rationale(breakdown)` and
     `build_public_rationale(breakdown)`, each taking the same structured
     breakdown dict and returning a string — testable in isolation with
     pytest, no Supabase/Oura dependency.

4. **`score_breakdown` jsonb shape**: `{"readiness": <int|null>,
   "candidates": [{"type": <str>, "score": <float>}, ...] (sorted
   descending, all non-gated candidates), "signals": {"days_since_rest":
   <int>, "days_since_mobility": <int>, "days_since_pickleball": <int>,
   "yesterday_pattern": <str|null>}}`. This gives the rationale builders
   everything they need without re-querying, and gives Sohan (or a future
   debugging session) the full picture of why a pick won, matching the
   column's evident purpose (it sits next to `internal_rationale` in the
   same not-public part of the schema).

5. **Module layout**: ports the prototype's flat-file style (matches the
   existing `prototyping/weight-tuning/` convention — no premature
   package-internal nesting) directly into `engine/`:
   - `engine/env_loader.py`, `engine/oura_client.py`,
     `engine/supabase_client.py` — ported verbatim (same functions/signatures)
     from `prototyping/weight-tuning/`, since CLAUDE.md and the prompt both
     call for reuse, not reinvention, of this HTTP plumbing. The prototype
     files are left as-is (untouched, still throwaway/Phase-2-scoped) — this
     is a copy/port, not a move, since `prototyping/` is explicitly allowed
     to stay around as the tuning notebook's home.
   - `engine/scoring.py` — ported verbatim from
     `prototyping/weight-tuning/scoring.py` (same `CANDIDATES`, `WEIGHTS`,
     `pattern_of`, `days_since`, `score_candidate`, `recommend`). This
     becomes the canonical copy going forward; future weight tuning happens
     here, not in the prototype copy (the prototype's `weight_tuning.py`
     notebook still imports its own local `scoring.py` for now since
     `weight_tuning.py` is out of scope for this phase to rewire).
   - `engine/rationale.py` — new, per Decision 3.
   - `engine/run_daily.py` — new entrypoint: orchestrates pull → read →
     score → rationale → write, no interactive input, exits non-zero on any
     unrecoverable error (so CI marks the run failed).
   - `engine/tests/` — new, pytest, mirroring
     `prototyping/weight-tuning/test_scoring.py`'s style (plain function
     tests, no fixtures framework beyond pytest's defaults).
   - `engine/pyproject.toml` — updated `dependencies` (currently `[]`) to
     declare nothing new beyond the standard library (the prototype's
     `oura_client.py`/`supabase_client.py` use only `urllib`/`json`/`os` —
     no `requests` dependency to add) and `[project.optional-dependencies]`
     test extra for `pytest`.

6. **Single-command invocation**: `python -m engine.run_daily` (package
   `engine` already has a `pyproject.toml`; adding `engine/__init__.py` makes
   it import-as-a-package correctly). No CLI argument parsing needed — the
   job always means "today" in the sense of `date.today()`, since that's
   the only mode a cron job runs in. (A future `--date` override for
   backfill/debugging is easy to add later but isn't required by this
   phase's "single command, no interactive input" requirement.)

7. **Error handling posture**: fail loudly, not silently. If the Oura pull
   for today returns no data, log a warning and continue with
   `readiness=None` (Decision 1). If the Supabase write fails (network,
   auth, schema mismatch), let the exception propagate and crash the
   process with a non-zero exit code — this is what makes a GitHub Actions
   run show red, which is the correct signal for "today's recommendation
   didn't get written." No partial/silent success state.

8. **The 10%/week run cap and 10-day ratio balancing stay unimplemented**,
   carried over as `scoring.py`'s existing known gap (already flagged in
   `weight_tuning.py`'s closing markdown cell) — ported as-is, not fixed,
   to keep this phase scoped to productionization rather than algorithm
   enhancement. Tracked as a follow-up, not blocking.

## Approach

```
GitHub Actions cron (Phase 4, out of scope here)
        │ invokes
        ▼
python -m engine.run_daily
        │
        ├─▶ engine.oura_client.fetch("daily_readiness", today, today)
        │   engine.oura_client.fetch("sleep", today, today)
        │         │
        │         ▼
        │   engine.supabase_client.upsert("recovery", [today_row], "date")
        │
        ├─▶ engine.supabase_client.get("sessions", {date >= today-60d})
        │         │
        │         ▼
        │   history = {date: type, ...}
        │
        ├─▶ engine.scoring.recommend(today, history, readiness)
        │         │
        │         ▼
        │   top2 = [(candidate, score), (candidate, score)]
        │
        ├─▶ engine.rationale.build_internal_rationale(breakdown)
        │   engine.rationale.build_public_rationale(breakdown)
        │
        └─▶ engine.supabase_client.upsert("recommendations", [row], "date")
```

- **Data flow mirrors `oura_pull.py` + `weight_tuning.py` combined**, but
  scoped to a single day each run instead of a historical range/backfill.
- **No new tables or migrations.** Writes only to `recovery` (idempotent
  upsert on `date`, reusing Phase 2's pattern) and `recommendations`
  (idempotent upsert on `date`, the table's own unique constraint).
- **Reads, never writes, `sessions`.**
- **Service-role key only** (same trust model as the existing prototype
  scripts and the mobile design spec's "service-role key stays server-side
  only... a GitHub Actions secret for the engine job").

## Testing / verification plan

- Unit tests (pytest, no network/Supabase/Oura dependency) for:
  - `engine/scoring.py` — ported copy of `test_scoring.py`'s existing
    assertions (regression safety for the port itself).
  - `engine/rationale.py` — both rationale builders, asserting (a) public
    text never contains raw readiness numbers and (b) internal text does.
  - The row-shaping logic in `run_daily.py` (e.g. a `build_recommendation_row()`
    helper) — given a fixed breakdown, produces a dict matching the
    `recommendations` schema exactly (all required columns present,
    `runner_up` correctly nullable when only one candidate survives
    gating).
- No integration test against live Oura/Supabase in this plan (matches the
  project's existing pattern — Phase 2's scripts were verified manually,
  not via integration tests). Manual verification: run `python -m
  engine.run_daily` once against the real project, confirm one new row
  lands in `recommendations` for today's date, and spot-check both
  rationale columns read sensibly.

## Out of scope

- GitHub Actions workflow file and cron scheduling (Phase 4).
- LLM-authored rationale or exercise-link enrichment (explicitly deferred
  per `CLAUDE.md`).
- `sessions` write path / logging model resolution (open question in
  `CLAUDE.md`, unrelated to this phase).
- Multi-user schema changes (standing non-goal across the project).
- Algorithm changes to `scoring.py` beyond a verbatim port (10%/week cap,
  10-day ratio balancing — tracked, not built here).
