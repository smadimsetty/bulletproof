# prototyping/weight-tuning

Phase 2 of the roadmap: pulls Sohan's full Oura history via the API into
Supabase (`recovery` + `activity` tables), reconstructs session history from
the Strong export + Oura's auto-detected workouts, and prototypes the
`CLAUDE.md` scoring weights against that real data before any engine code is
written. See `docs/superpowers/specs/2026-06-21-phase2-weight-tuning-design.md`.

## Scripts (run in this order for a fresh backfill)

1. `oura_explore.py` — dumps sample Oura API responses (read-only, no writes)
2. `oura_pull.py` — backfills `recovery` and `activity` from full Oura history
3. `build_session_candidates.py` — proposes `session_candidates.csv` from the
   Strong export + Oura workout data; review and save as
   `session_candidates_final.csv` before the next step
4. `load_sessions.py` — loads the reviewed candidates into `sessions`

## Notebook

`weight_tuning.py` — open in VS Code (Python extension's `# %%` cell support)
or run directly with `python weight_tuning.py`. Compares the scoring engine
in `scoring.py` against real history. Tune `scoring.WEIGHTS` and re-run.

`scoring.py` / `test_scoring.py` — the scoring engine and its unit tests
(`pytest test_scoring.py`).

Personal data files (`strong_workouts.csv`, `session_candidates*.csv`) are
gitignored — this repo is public.
