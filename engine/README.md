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
- `weather_client.py` -- a small, dependency-free Open-Meteo client (no
  API key needed) answering "is it currently/imminently bad for outdoor
  pickleball at this lat/lon", consumed by `scoring.py`'s pickleball gate.
- `scoring.py` -- the deterministic recommendation algorithm, ported
  verbatim from `prototyping/weight-tuning/scoring.py`. Tune `WEIGHTS`
  here going forward, not in the prototype copy. Also exposes
  `gate_today()`, a wrapper around `recommend()` that resolves today's
  full list of gated session blocks (e.g. brackets a pickleball day with
  a mobility/ankle-warmup block), and accepts an optional `day_labels`/
  `location` for split-aware pattern rotation and the pickleball weather
  gate.
- `sessions_repo.py` -- reads the last 60 days of `sessions` history (60
  matches `scoring.days_since()`'s internal lookback cap).
- `recovery_repo.py` -- pulls today's Oura readiness (+ matching sleep)
  and upserts it into `recovery`.
- `profile_repo.py` -- reads the one `user_profile` row for `owner_id`,
  combined with its `preferred_split`'s `split_taxonomy.day_labels`.
- `exercise_catalog_repo.py` -- builds a filtered, capped, deterministically
  sorted excerpt of the `exercises` table per gated block type, used as the
  Claude prompt's catalog excerpt (and the deterministic fallback's source).
- `daily_feedback_repo.py` -- reads the last few days of
  `daily_feedback.feedback_text`, fed into `program_builder.py`'s prompt.
- `program_prompt.py` -- the four-voice persona system prompt (longevity /
  hypertrophy-physique / evidence-based / physical-therapist-rehab,
  unattributed -- never names the real grounding experts) plus bucketed
  (never-raw-biometric) profile/signal/catalog rendering helpers.
- `program_builder.py` -- the Claude (Sonnet 4.6) exercise-selection layer.
  Calls `client.messages.parse()` with a structured-output schema whose
  `exercise_id` is constrained to that day's real catalog excerpt
  (anti-hallucination), re-validates the result at runtime, and falls back
  to a deterministic template program on any failure -- Claude can never
  crash the nightly run or write an unsafe program.
- `rationale.py` -- deterministic (no LLM) `internal_rationale` /
  `public_rationale` text generation from the score breakdown. Per
  `CLAUDE.md`'s "no LLM layer in v1" decision, `public_rationale` never
  includes raw biometric numbers; `internal_rationale` does.
- `run_daily.py` -- the entrypoint. Orchestrates pull -> read ->
  `scoring.gate_today()` -> `program_builder.build_daily_program()` ->
  write `recommendations` + `recommendation_blocks` +
  `recommendation_block_exercises`. No interactive input; non-zero exit on
  failure.
