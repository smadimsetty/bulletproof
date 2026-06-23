# engine

Python package: pulls today's recovery data from Oura, reads recent
session history from Supabase, runs the deterministic scoring engine, and
writes one row to `recommendations` -- the production home for the logic
prototyped in `prototyping/weight-tuning/scoring.py` (Phase 2). See
`docs/superpowers/specs/2026-06-22-engine-productionization-design.md`.

## Running it

From the repo root, with `.env` populated (`OURA_PERSONAL_ACCESS_TOKEN`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`):

```bash
cd engine
python run_daily.py
```

(Or `python -m engine.run_daily` from the repo root, once `engine` is on
`sys.path` as a package -- the GitHub Actions workflow that runs this each
morning, added in a later phase, uses this form.)

This always means "today" (`datetime.date.today()`) -- there is no
historical-backfill or `--date` mode in this package; that already
happened once in `prototyping/weight-tuning/oura_pull.py`.

## Tests

```bash
cd engine
pip install -e ".[test]"
pytest
```

## Modules

- `env_loader.py` / `oura_client.py` / `supabase_client.py` -- HTTP
  plumbing, ported from `prototyping/weight-tuning/` (same functions/
  signatures).
- `scoring.py` -- the deterministic recommendation algorithm, ported
  verbatim from `prototyping/weight-tuning/scoring.py`. Tune `WEIGHTS`
  here going forward, not in the prototype copy.
- `sessions_repo.py` -- reads the last 60 days of `sessions` history (60
  matches `scoring.days_since()`'s internal lookback cap).
- `recovery_repo.py` -- pulls today's Oura readiness (+ matching sleep)
  and upserts it into `recovery`.
- `rationale.py` -- deterministic (no LLM) `internal_rationale` /
  `public_rationale` text generation from the score breakdown. Per
  `CLAUDE.md`'s "no LLM layer in v1" decision, `public_rationale` never
  includes raw biometric numbers; `internal_rationale` does.
- `run_daily.py` -- the entrypoint. Orchestrates pull -> read -> score ->
  rationale -> write. No interactive input; non-zero exit on failure.
