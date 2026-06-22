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

## Known limitations in the reconstructed history

Two human-judgment calls from session-history reconstruction materially affect
the match-rate output in the notebook:

- **Pre-tracking period (~220 days from 2024-08-21 to 2025-04-14):** These days
  have no tracking signal at all (before Strong export tracking began) and were
  bulk-defaulted to `rest`. Match-rate performance on this stretch reflects the
  default classification, not a real test of the recommendation engine.
- **Workout variants A vs B:** All 107 real gym days are tagged as
  `upper_a`/`lower_a` — never `_b` — because the Strong export and `CLAUDE.md`
  provide no way to distinguish an "A" workout from a "B" workout in this
  program. As a result, the engine's `_b` recommendations are never validated
  against real history in this phase.
