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
- `prototyping/weight-tuning/` — spreadsheet/notebook used to sanity-check
  scoring weights against real historical data before the engine was written
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans

## Status

Architecture and schema are being built first (the permanent layer). See
`docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md` for the
full design and phased roadmap, and `CLAUDE.md` for full product context.
