# MoveMaxx

A mobility-first workout app for iPhone. Pick one pain point (ankles, rounded
shoulders, nerd neck, anterior pelvic tilt, knees, full body or total
mobility). Then take a short baseline test, train it with 14 days of short
daily routines, and retest to see the before and after.

Around the sprints is a full workout logger built for mobility work, with:
- hold, switch-sides and rest timers
- left-side-first unilateral sets
- a lock-screen Live Activity
- routines and a mobility exercise library
- progress stats
- a friends-first social layer

The project was called **Bulletproof** until 2026-11-10. Older docs under
`docs/superpowers/` keep that name as a historical record. The iOS bundle ID
(`com.sohan.bulletproof`), the App Store Connect record, the Sign in with Apple
service ID and the Supabase/EAS projects also keep it on purpose. Changing them
would create a new App Store app and drop TestFlight history, and users never
see them.

## Project layout

- `apps/mobile/`: the Expo/React Native iPhone app (the product).
- `apps/web/`: a Next.js static site deployed to GitHub Pages. It has the
  landing page, the privacy/terms/support pages linked from the app, and the
  original Oura engine dashboard at `/dashboard`.
- `supabase/`: the schema as versioned SQL migrations, Edge Functions, and live
  RLS smoke tests (`supabase/tests/`). Migrations are **not** auto-applied; see
  `CLAUDE.md`.
- `engine/`: the original Python Oura ingestion and recommendation engine. It
  has been dormant since the 2026-09-17 mobility pivot.
- `docs/superpowers/`: design specs, implementation plans and build reports.

## Status

v1.2.0 (build 23) is on TestFlight. The site is live at
https://smadimsetty.github.io/movemaxx/. See `CLAUDE.md` for full product
context and `docs/BACKLOG.md` for what's next.
