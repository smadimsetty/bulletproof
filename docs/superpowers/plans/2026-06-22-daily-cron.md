# Daily Cron (GitHub Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.github/workflows/daily-cron.yml`, a GitHub Actions workflow
that runs the already-built, already-tested `python -m engine.run_daily`
entrypoint on a daily UTC cron schedule plus a `workflow_dispatch` manual
trigger, using the repository secrets `OURA_PERSONAL_ACCESS_TOKEN`,
`SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_URL` (already set on the repo
via `gh secret set`, prior to this plan). Then verify it actually works by
triggering a real run against the live Oura/Supabase APIs and confirming a
new `recommendations` row lands for today's date.

**Architecture:** One workflow file, one job, no matrix. No engine code
changes — see
`docs/superpowers/specs/2026-06-22-daily-cron-design.md` for the full
reasoning, including why the workflow must write a `.env` file from
secrets (rather than relying on `env:`-only injection) to satisfy
`engine/env_loader.py`'s actual contract.

**Tech Stack:** GitHub Actions YAML (`schedule` + `workflow_dispatch`
triggers, `actions/checkout@v4`, `actions/setup-python@v5`), Python 3.11
(stdlib only — no install step, per the design spec's Decision 5).

## Global Constraints

- No changes to any file under `engine/` in this plan. The engine's logic,
  schema, and tests are already complete and out of scope for this phase
  (see `docs/superpowers/specs/2026-06-22-daily-cron-design.md`
  Non-goals).
- The three secrets (`OURA_PERSONAL_ACCESS_TOKEN`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`) already exist on the GitHub
  repo — this plan only references them via `${{ secrets.* }}`, it never
  sets or modifies them.
- `engine/env_loader.py` unconditionally reads a literal `.env` file at
  the repo root and raises `FileNotFoundError` if absent — it does not
  fall back to already-exported process environment variables. Every task
  that runs the engine in CI must write that file from secrets first.
  Never commit this `.env` file — it must only be written to the
  ephemeral runner's filesystem at job-run time (the repo's `.gitignore`
  already excludes `.env`, and no step in this plan stages or commits it).
- Cron schedule: `0 11 * * *` (11:00 UTC, daily) — see the design spec's
  Decision 2 for the full reasoning (pre-morning for US timezones, buffer
  for Oura sync lag, absorbs GitHub Actions' own scheduling slack).
- Python version: `3.11`, matching `engine/pyproject.toml`'s
  `requires-python = ">=3.11"` floor exactly.
- No `pip install` step — `engine/pyproject.toml` declares zero runtime
  dependencies; the workflow invokes `python -m engine.run_daily` directly
  after checkout.
- This is CI/YAML configuration, not application code with unit tests.
  The verification cycle for each task is therefore: write/change the
  workflow file -> trigger it via `gh workflow run` -> watch the run via
  `gh run watch` -> confirm the actual stated outcome (success/failure,
  and for the final task, a real new `recommendations` row) — not a
  pytest red/green cycle, since there is no application logic here to
  unit-test that isn't already covered by `engine/tests/`.
- All `gh` commands in this plan assume the current branch
  (`pipeline/daily-cron`) is pushed to `origin` first, since
  `workflow_dispatch` and `schedule` triggers only fire for workflow files
  that exist on a ref GitHub can see (a purely local commit is invisible
  to `gh workflow run --ref <branch>`).

---

### Task 1: Write the workflow file

**Files:**
- Create: `.github/workflows/daily-cron.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces: a GitHub Actions workflow named `daily-cron.yml`, registered
  under the workflow display name `Daily Cron`, triggerable by
  `gh workflow run "Daily Cron" --ref <branch>` or
  `gh workflow run daily-cron.yml --ref <branch>` once pushed. Task 2
  pushes this file and triggers it; Task 3 reads its run result.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/daily-cron.yml`:

```yaml
name: Daily Cron

on:
  schedule:
    # 11:00 UTC daily -- see docs/superpowers/specs/2026-06-22-daily-cron-design.md
    # Decision 2 for the full reasoning (pre-morning for US timezones,
    # buffer for Oura sync lag, absorbs GitHub Actions' own scheduling slack).
    - cron: "0 11 * * *"
  workflow_dispatch: {}

jobs:
  run-engine:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Write .env from repository secrets
        # engine/env_loader.py unconditionally reads a literal .env file at
        # the repo root -- it does not fall back to already-exported
        # process environment variables. This step materializes that file
        # on the ephemeral runner's filesystem only; it is never committed
        # (the repo's .gitignore already excludes .env) and is discarded
        # when the job ends.
        run: |
          cat <<EOF > "$GITHUB_WORKSPACE/.env"
          OURA_PERSONAL_ACCESS_TOKEN=${{ secrets.OURA_PERSONAL_ACCESS_TOKEN }}
          SUPABASE_URL=${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY=${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          EOF

      - name: Run the engine
        run: python -m engine.run_daily
```

- [ ] **Step 2: Sanity-check the YAML locally**

Run: `python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/daily-cron.yml'))" `

(If `pyyaml` isn't installed locally, this step is optional — GitHub
itself will reject genuinely malformed YAML at push/run time, caught in
Task 2's verification. Don't add a `pyyaml` dependency anywhere just for
this check.)

Expected: no exception (or skip if `pyyaml` unavailable; rely on Task 2's
live trigger to surface YAML errors instead).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily-cron.yml
git commit -m "feat: add daily cron workflow to run the engine"
```

---

### Task 2: Push the branch and trigger a real run

**Files:**
- None created or modified (this task only pushes and triggers).

**Interfaces:**
- Consumes: `.github/workflows/daily-cron.yml` from Task 1, which must be
  present on the remote branch for `gh workflow run` to find it.
- Produces: a real, live GitHub Actions run ID, which Task 3 inspects.

- [ ] **Step 1: Push the branch**

Run: `git push -u origin pipeline/daily-cron`

Expected: push succeeds; the branch (and the workflow file on it) is now
visible to GitHub.

- [ ] **Step 2: Confirm GitHub has registered the workflow**

Run: `gh workflow list --ref pipeline/daily-cron`

Expected: `Daily Cron` appears in the list (may take a few seconds after
push to register — if it doesn't appear immediately, retry once after a
short pause rather than assuming failure).

- [ ] **Step 3: Trigger a manual run**

Run: `gh workflow run "Daily Cron" --ref pipeline/daily-cron`

Expected: command exits 0 with a confirmation message (e.g. "Created
workflow_dispatch event"). This does not yet confirm the run succeeded —
only that it was queued.

- [ ] **Step 4: Identify the run**

Run: `gh run list --workflow "Daily Cron" --branch pipeline/daily-cron --limit 1`

Expected: one row showing a run with status `queued` or `in_progress`.
Note the run ID (first column) for Task 3.

---

### Task 3: Watch the run and verify the actual outcome

**Files:**
- None created or modified (verification-only task).

**Interfaces:**
- Consumes: the run ID identified in Task 2, Step 4.
- Produces: a pass/fail verdict for this entire plan. If this task's
  checks fail, the plan is not done — fix the workflow (new commit, no
  amending) and repeat Task 2 and this task until they pass, per this
  plan's CI-appropriate verification cycle (see Global Constraints).

- [ ] **Step 1: Watch the run to completion**

Run: `gh run watch <run-id> --exit-status`

(Substitute the actual run ID from Task 2, Step 4. If the run ID isn't
known, `gh run list --workflow "Daily Cron" --branch pipeline/daily-cron --limit 1`
again to fetch it.)

Expected: streams live log output, then exits 0 when the run completes
successfully. If it exits non-zero, proceed to Step 2 below instead of
treating this as done.

- [ ] **Step 2 (only if Step 1 failed): Pull the failure logs**

Run: `gh run view <run-id> --log-failed`

Read the actual error. Two failure classes are plausible and have
different fixes:
- A `FileNotFoundError` or similar from `env_loader.load_env()` — means
  the `.env`-writing step in Task 1 has a bug (e.g. a typo in the heredoc,
  wrong secret name). Fix `.github/workflows/daily-cron.yml`, commit, push,
  and re-run Task 2 Steps 3-4 and this task from Step 1.
- A genuine Oura/Supabase API error (auth failure, network issue, schema
  mismatch) — means the secrets themselves or the live `recommendations`
  schema have a real problem unrelated to this workflow's YAML. This is
  outside this plan's scope to fix (the secrets were set by the
  orchestrating session before this plan started, and engine logic is
  out of scope per Global Constraints) — report the exact error text
  rather than guessing at a YAML-side fix that wouldn't address it.

- [ ] **Step 3: Confirm the success log line**

Run: `gh run view <run-id> --log` and look for a line matching
`Wrote recommendation for <today's date>: top_pick=..., runner_up=...`
(this exact line is printed by `engine/run_daily.py`'s `main()` on
success — see `engine/run_daily.py` line 65).

Expected: the line is present, with today's actual date and a real
`top_pick` value (one of `upper_a`, `lower_a`, `pickleball`, `run`,
`rest`, `mobility` per `engine/scoring.py`'s `CANDIDATES`).

- [ ] **Step 4: Confirm the row landed in Supabase**

Run (substituting the real `SUPABASE_URL` and a valid
`SUPABASE_SERVICE_ROLE_KEY` from the local `.env`, and today's date in
`YYYY-MM-DD` form):

```bash
curl -s "$SUPABASE_URL/rest/v1/recommendations?date=eq.$(date +%Y-%m-%d)" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: a JSON array with exactly one object, `date` matching today,
non-null `top_pick`, `internal_rationale`, and `public_rationale` fields.

- [ ] **Step 5: Re-run once more to confirm idempotency (optional but recommended)**

Run: `gh workflow run "Daily Cron" --ref pipeline/daily-cron`, wait for it
via `gh run watch <new-run-id> --exit-status`, then repeat Step 4's `curl`.

Expected: still exactly one row for today (not two) — confirms the
engine's existing upsert-on-`date` behavior (already tested in
`engine/tests/test_run_daily.py` and `test_recovery_repo.py`, but worth
seeing live once) holds when invoked twice in the same day via this
workflow, which matters because both the daily schedule and ad hoc manual
triggers will realistically both fire on the same calendar day sometimes.

---

**End state after this plan:** `.github/workflows/daily-cron.yml` exists
on `pipeline/daily-cron` (pushed to `origin`), fires automatically at
11:00 UTC daily via `schedule` and on demand via `workflow_dispatch`, and
has been proven — via a real triggered run watched end-to-end — to
successfully write one upserted row to `recommendations` (and one to
`recovery`) using the already-configured repository secrets, with no
changes to `engine/` itself.
