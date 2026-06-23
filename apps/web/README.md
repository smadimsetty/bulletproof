# apps/web

Public, read-only dashboard for the Bulletproof training system. Shows the
same two outputs as the mobile app: yesterday's recommendation and today's
recommendation, sourced from the `recommendations_public` Supabase view
using the public anon key -- no login, no write path. See
`docs/superpowers/specs/2026-06-22-web-dashboard-design.md` for the full
design and `docs/superpowers/plans/2026-06-22-web-dashboard.md` for the
build plan.

## Local development

```bash
cd apps/web
npm install
cp .env.example .env.local   # fill in the real anon key/URL
npm run dev
```

## Build (static export)

```bash
npm run build   # produces apps/web/out/
```

## Deploy

Deployed automatically to GitHub Pages by `.github/workflows/deploy-web.yml`
on every push to `master` that touches `apps/web/**`. Live at
https://smadimsetty.github.io/bulletproof/. Pointing a custom/personal-site
domain at this content is a manual follow-up step (DNS access this pipeline
doesn't have) -- not done yet.
