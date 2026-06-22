# Bulletproof

A personal, data-driven dynamic training system. Every morning it pulls recovery
data (Oura) and recent training history, then recommends today's optimal
session — gym upper/lower, pickleball, run, mobility, or rest — with demo-video
links for complex movements and target rep ranges.

Built for one user (Sohan) first; the data model is designed so multi-user is
a later *addition*, not a rewrite.

## Project layout

- `apps/web/` — Next.js app (the renderer), deployed on Netlify
- `engine/` — Python: Oura ingestion + deterministic scoring engine
- `supabase/` — database schema, managed as versioned SQL migrations
- `prototyping/weight-tuning/` — Python scripts + notebook used to pull real
  Oura/Strong history and sanity-check scoring weights before the engine is
  productionized
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans

## Status

Phase 0/1 (repo scaffolding + Supabase schema) and Phase 2 (weight-tuning
prototype against real historical data) are complete. Next up: Phase 3,
productionizing the tuned scoring logic into `engine/`. See
`docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md` for the
full design and phased roadmap, and `CLAUDE.md` for full product context.
