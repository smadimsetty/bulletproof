# engine

Python package: pulls recovery data from Oura, runs the deterministic scoring
engine, and writes the day's recommendation to Supabase.

Scoring logic is built in Phase 3 of the roadmap, after weights are sanity
checked against real history in `prototyping/weight-tuning/` (Phase 2). See
`docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md`.
