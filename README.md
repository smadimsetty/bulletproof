# Bulletproof

A personal, data-driven dynamic training system. Every morning it pulls recovery
data (Oura) and recent training history, then recommends today's optimal
session — gym upper/lower, pickleball, run, mobility, or rest — with demo-video
links for complex movements and target rep ranges.

Built for one user (Sohan) first; the data model is designed so multi-user is
a later *addition*, not a rewrite.

## Project layout

- `apps/mobile/` — Expo/React Native app: the primary, authenticated
  interface (HealthKit sync, today's/yesterday's recommendation)
- `apps/web/` — Next.js app: a public, read-only, no-login dashboard showing
  the same two recommendation outputs, deployed to GitHub Pages
- `engine/` — Python: Oura ingestion + deterministic scoring engine, run
  daily via GitHub Actions
- `supabase/` — database schema, managed as versioned SQL migrations
- `prototyping/weight-tuning/` — Python scripts + notebook used to pull real
  Oura/Strong history and sanity-check scoring weights before the engine was
  productionized
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans
- `docs/superpowers/reports/autonomous-build-log.md` — plain-language log of
  what's shipped, phase by phase

## Status

Engine productionization, the daily GitHub Actions cron, HealthKit sync, the
mobile app's recommendation/summary UI, and the public web dashboard are all
complete. The public dashboard is live at
https://smadimsetty.github.io/bulletproof/. See
`docs/superpowers/reports/autonomous-build-log.md` for the full phase-by-phase
history and `CLAUDE.md` for full product context.
