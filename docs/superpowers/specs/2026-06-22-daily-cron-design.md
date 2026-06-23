# Daily cron (GitHub Actions) — design spec

## Background

Engine productionization (`docs/superpowers/specs/2026-06-22-engine-productionization-design.md`)
shipped a real, importable `engine/` package with a single no-input
entrypoint: `python -m engine.run_daily`. That command pulls today's Oura
readiness, upserts it into `recovery`, reads the last 60 days of
`sessions`, scores today's candidates, generates deterministic rationale
text, and upserts one row into `recommendations`. It is fully built and
tested (`engine/tests/`), but nothing invokes it automatically — it only
runs when someone manually runs `python -m engine.run_daily` from a
checkout with a populated `.env`.

The autonomous build pipeline design
(`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`)
sequences this as backlog item 3 ("GitHub Actions daily cron... runs the
engine each morning, writes to `recommendations`"), immediately after
engine productionization (item 2, now complete) and before the
HealthKit/UI phases that will eventually read `recommendations` to render
something for Sohan. This phase's job is narrow: wire the existing,
already-correct command into a scheduled CI job. No engine logic changes.

The three secrets this job needs — `OURA_PERSONAL_ACCESS_TOKEN`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` — have already been set on the
GitHub repo via `gh secret set` ahead of this phase, per the orchestrating
session's instructions. This spec assumes their presence and does not
re-derive or re-validate them; it only documents how the workflow
references them.

One load-bearing detail discovered while reading `engine/env_loader.py`:
`load_env()` does not read already-exported process environment
variables — it unconditionally opens a literal `.env` file at the repo
root (located by walking up from `engine/`'s own directory until it finds
a `.git` entry) and raises `FileNotFoundError` if that file doesn't exist.
GitHub Actions' `env:`/`secrets:` mechanism only ever injects process
environment variables, never a `.env` file on disk. Left unhandled, the
job would crash on `load_env()` before ever reaching the Oura/Supabase
calls, regardless of whether the secrets are correctly configured. The
workflow must therefore materialize a `.env` file from the secrets as an
explicit step before invoking the engine — see Decisions below.

## Goals

- Add a GitHub Actions workflow that runs `python -m engine.run_daily` on
  a daily UTC cron schedule, with no human action required for it to fire.
- Also trigger on `workflow_dispatch`, so the orchestrating session (or
  Sohan) can run it on demand via `gh workflow run <name> --ref <branch>`
  to verify it end-to-end against the live Oura/Supabase APIs, independent
  of waiting for the scheduled time.
- Wire `OURA_PERSONAL_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `SUPABASE_URL` from repository secrets into the job in the one shape
  `engine/env_loader.py` actually expects (a `.env` file at repo root) —
  not just dropped into `env:` and assumed to work.
- Make a failed run loud and visible: non-zero exit from `run_daily.py`
  (already guaranteed by the engine's existing "fail loudly" posture, per
  the engine productionization spec's Decision 7) must show as a failed
  GitHub Actions run, with no separate alerting needed for this phase.
- Pick and document a specific cron time, with reasoning, rather than
  copying the spec prompt's example time unexamined.

## Non-goals

- Any change to `engine/`'s logic, schema, or tests. This phase only adds
  CI wiring around the existing, already-verified command.
- Retry/backoff logic beyond what GitHub Actions provides natively (a
  single `workflow_dispatch` re-run is the retry mechanism, exactly as
  manual re-runs already are for the engine's own idempotent
  upsert-on-`date` behavior — re-running the same day is always safe).
- Alerting/notification integrations (Slack, email, etc.) on failure.
  GitHub's own UI (red X on the workflow run, repo Actions tab) is the
  failure signal for this phase; notification-on-failure is a plausible
  future addition, not required now.
- A status badge in the root `README.md`. Considered and explicitly
  rejected — see Decisions.
- Multi-environment / staging vs. production workflow variants. There is
  one Supabase project and one Oura account (Sohan's); one workflow
  targeting them is sufficient, matching the single-user scope the rest of
  the project already commits to.
- Caching pip dependencies between runs. `engine/pyproject.toml` declares
  zero runtime dependencies (stdlib only) and only `pytest` as a test
  extra that this workflow doesn't even need to install — there is nothing
  expensive enough to cache.

## Decisions

Ambiguities resolved here since no clarifying questions could be asked
mid-build:

1. **Workflow file name and location**: `.github/workflows/daily-cron.yml`.
   This is the first workflow in the repo (confirmed: no `.github/`
   directory exists yet), so there's no existing naming convention to
   match. `daily-cron.yml` was chosen over an `engine`-scoped name (e.g.
   `engine-daily-run.yml`) because the *trigger* (a daily cron) is the
   defining characteristic from the repo's perspective — there is only one
   thing in this repo that runs daily, so naming the file after the
   schedule rather than the invoked package reads clearly in the Actions
   tab and leaves room for a differently-scoped second cron later without
   implying this one is "the" engine workflow.

2. **Cron time: `11:00 UTC` (`0 11 * * *`).** Reasoning, not just copying
   the prompt's example:
   - Sohan's `.env`/profile context and the rest of this project assume
     no specific timezone has been pinned yet (`user` table /
     `CLAUDE.md` don't record one), so the only anchor available is
     "before Sohan's typical morning," matching the prompt's own framing
     of the job as a thing that should have already run by the time he
     checks it.
   - Common US timezones in summer (when this phase ships — current date
     2026-06-22, so DST applies): 11:00 UTC = 7:00am Eastern / 4:00am
     Pacific. Either reads as comfortably pre-morning-routine for a
     working adult, without being so early (e.g. 05:00 UTC / midnight
     Pacific) that an Oura ring is unlikely to have finished syncing last
     night's sleep data yet. Oura's own day boundary and typical sync
     timing (ring syncs to phone on wake, app syncs to cloud shortly
     after) means readiness scores are usually available a few hours
     after a typical wake time, not at the instant of waking — 11:00 UTC
     gives meaningful buffer past even a late-ish 6am wake time in any
     plausible US timezone, which matters because `recovery_repo.py`
     treats a missing readiness reading as "proceed with `readiness=None`"
     rather than retrying, so an overly-early run risks silently losing
     the readiness gate for that day instead of failing loudly.
   - GitHub Actions cron jobs are also known to run late under platform
     load (GitHub's own docs note scheduled workflows are not guaranteed
     to run at the exact specified time, especially during high-load
     periods); padding past the earliest plausible "morning" time, rather
     than targeting it exactly, absorbs that slack without needing a
     second fallback trigger.
   - This is a single cron line in YAML, trivially changed later once
     Sohan reports an actual preferred wake-check time — not a decision
     that locks in anything costly to reverse.

3. **`.env` materialization step, not `env:`-only secret injection.** Per
   the Background section's `env_loader.load_env()` finding, the workflow
   adds an explicit step that writes
   `OURA_PERSONAL_ACCESS_TOKEN=...` / `SUPABASE_URL=...` /
   `SUPABASE_SERVICE_ROLE_KEY=...` lines to a `.env` file at the checkout
   root (`$GITHUB_WORKSPACE/.env`) using a heredoc fed from
   `${{ secrets.* }}` expansions, immediately before the run step. This is
   the minimal-surface-area way to satisfy `load_env()`'s actual contract
   without touching engine code in this phase (touching `env_loader.py` to
   add an "already in os.environ" fallback was considered and rejected —
   see point 7). The repo's root `.gitignore` already excludes `.env`, so
   nothing about this step risks committing secrets; the file is written
   into the ephemeral runner's filesystem only and discarded when the job
   ends, exactly like any other CI secrets-to-file pattern.

4. **Python version: `3.11`**, matching `engine/pyproject.toml`'s
   `requires-python = ">=3.11"` floor exactly rather than tracking
   `"3.x"`/latest. Pinning to the package's stated minimum (rather than
   floating to whatever `actions/setup-python`'s `3.x` alias resolves to
   on a given day) keeps the CI environment deterministic and matches
   what a developer running this locally on the documented minimum would
   see — avoids a class of "works in CI, not locally" or "broke when
   GitHub bumped the latest 3.x patch" surprises for a job that has no
   test coverage of its own to catch a version-specific regression.

5. **No dependency-installation step beyond Python itself.**
   `engine/pyproject.toml`'s `dependencies = []` — the package only uses
   `urllib`/`json`/`os`/`datetime` from the standard library. The
   workflow does not run `pip install` at all (not even
   `pip install -e .`); it invokes `python -m engine.run_daily` directly
   from the checkout. This is the simplest correct option given zero
   runtime dependencies — adding an install step would be dead weight
   that implies a dependency surface that doesn't exist, and would be the
   first thing to silently go stale if `pyproject.toml` changes without
   someone remembering to update the workflow too.

6. **No status badge added to `README.md`.** Considered (the prompt
   listed it as a representative ambiguous decision) and rejected: this
   project's `README.md` Status section is prose, hand-maintained per
   phase per the user's standing "keep docs updated" instruction, not a
   CI dashboard. A badge would show pass/fail for the *workflow trigger
   succeeding*, which is a weaker and more confusing signal than what
   actually matters here (did today's `recommendations` row get written
   with sensible values) — that question is answered by looking at the
   Supabase table itself or a future dashboard UI (backlog item 6), not a
   green/red README badge. Revisit once the public web dashboard exists
   and "is the system currently working" becomes a question worth
   answering at a glance from the README.

7. **`engine/env_loader.py` is not modified.** An alternative considered:
   add an `os.environ.get(...)`-based fallback so `load_env()` tolerates a
   missing `.env` file when the required keys are already present in the
   environment (which is exactly GitHub Actions' native secret-injection
   shape). Rejected for this phase: it would touch engine code that this
   phase's own design spec (engine productionization) explicitly scoped
   as "ported verbatim" and already shipped/tested/merged; reopening it
   here to serve a CI convenience is exactly the kind of scope bleed the
   autonomous pipeline's phase boundaries are meant to prevent. The `.env`
   materialization step (Decision 3) achieves the same outcome with zero
   engine-code risk, at the cost of one extra YAML step — the right
   trade for a CI-only concern.

8. **Concurrency**: no `concurrency:` group added. A daily cron firing
   once, plus occasional manual `workflow_dispatch` runs for verification,
   has negligible chance of two runs overlapping; the engine's own
   upsert-on-`date` behavior in `recommendations`/`recovery` already makes
   even an accidental double-run harmless (last writer wins on the same
   row, not a duplicate). Adding concurrency controls would be solving a
   problem that doesn't exist yet.

9. **Permissions**: the workflow does not declare a `permissions:` block.
   It never touches the GitHub API (no PR comments, no contents writes,
   no releases) — it only calls external Oura/Supabase APIs over HTTPS
   using repo secrets as bearer tokens for those third-party services, not
   a `GITHUB_TOKEN` scope. The repository/organization's default
   `GITHUB_TOKEN` permissions apply and are irrelevant to this job's
   actual behavior, so there's nothing to narrow.

## Approach

```
GitHub Actions: .github/workflows/daily-cron.yml
        │
        ├─ trigger: schedule (cron "0 11 * * *", UTC)
        ├─ trigger: workflow_dispatch (manual verification)
        │
        ▼
job: run-engine
        │
        ├─ actions/checkout@v4
        ├─ actions/setup-python@v5 (python-version: "3.11")
        ├─ write .env at repo root from
        │     secrets.OURA_PERSONAL_ACCESS_TOKEN
        │     secrets.SUPABASE_URL
        │     secrets.SUPABASE_SERVICE_ROLE_KEY
        │
        └─ run: python -m engine.run_daily
              │
              ├─ success → exit 0 → green run; one row upserted
              │   into recovery, one row upserted into recommendations
              │
              └─ failure (any uncaught exception) → exit non-zero
                  → red run in the Actions tab (no separate alerting)
```

- Single job, single step sequence, no matrix, no parallelism — there is
  exactly one thing to run.
- The `.env` file is written, used, and discarded entirely within the
  ephemeral GitHub-hosted runner's filesystem for that one job run; it
  never persists or gets uploaded as an artifact.
- Verification of this phase itself (not the engine's own logic, already
  covered by `engine/tests/`) is operational, not unit-tested: trigger via
  `gh workflow run daily-cron.yml --ref pipeline/daily-cron`, watch via
  `gh run watch`, and confirm a real new row appears in `recommendations`
  for today's date — see the implementation plan's task breakdown for the
  exact commands.

## Out of scope

- Changes to `engine/` itself (no logic, schema, or test changes — see
  Non-goals).
- Notification/alerting integrations on failure.
- A status badge in `README.md` (see Decision 6).
- Multi-environment workflow variants (staging/prod, multiple Supabase
  projects).
- Backfill or catch-up logic for missed scheduled runs (e.g. if the
  runner is down for a day, this phase does not add logic to detect and
  fill the gap — `recovery`/`recommendations` simply have no row for that
  date, consistent with the engine's existing "today only, no `--date`
  override" scope from the productionization phase).
- HealthKit sync, recommendation UI, and the web dashboard — later backlog
  items (4, 5, 6) in the autonomous build pipeline design, unaffected by
  and not blocking this phase.
