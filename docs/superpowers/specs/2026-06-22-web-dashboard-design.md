# Web dashboard — design spec

## Background

`CLAUDE.md`'s "Build stack" section calls for "Public web app on Sohan's
personal site = the renderer (and a shareable portfolio piece)," with an
explicit public/private split: "publish the program + the reasoning; keep
raw biometrics (HRV etc.) private or aggregated." That line predates the
mobile pivot. The mobile interface design spec
(`docs/superpowers/specs/2026-06-22-mobile-interface-design.md`, "Phase B"
in its own framing) revised the plan: a phone app became the *primary*,
authenticated interface (it now owns HealthKit sync and renders the two
daily outputs first), and the web dashboard was explicitly deferred to a
second, later phase with a narrower job — "a lightweight site reading only
`recommendations_public` — no auth, no write path... Matches the 'public +
portfolio piece' goal from the original `CLAUDE.md` plan without touching
biometrics. The view already exists from Phase 0/1; no schema change needed
for this part."

The autonomous build pipeline design
(`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`)
lists this as backlog item 6, the last phase: "Web dashboard... public,
read-only, built on the existing `recommendations_public` view." The
recommendation-ui phase (item 5, complete) already built and shipped the
exact rendering logic this phase needs — `apps/mobile/lib/recommendations.ts`
(typed fetch + today/yesterday date-split against `recommendations_public`)
and `apps/mobile/lib/sessionTypeLabels.ts` (friendly enum labels) — against
the same view this phase reads. This phase's job is to port that proven
logic to a public web surface, not to re-derive it.

### What already exists to build on

- **`recommendations_public` view** (`supabase/migrations/20260622001542_create_recommendations.sql`,
  security model finalized in `20260622002432_fix_view_security_and_updated_at_triggers.sql`):
  `select date, top_pick, runner_up, public_rationale, generated_at from
  recommendations`, `security_invoker = false` (definer/owner privileges, so
  it reads through the RLS-protected base table while only ever exposing
  these four columns plus `date`). **`grant select on recommendations_public
  to anon, authenticated`** — the `anon` grant is the load-bearing fact for
  this phase: a request with no Supabase session at all, using only the
  public anon key, can already read this view today. No new migration, no
  new grant, no RLS change needed.
- **`apps/mobile/lib/supabase.ts`**: creates a `supabase-js` client from
  `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the
  **anon** key, not the service-role key, configured with `AsyncStorage`session
  persistence for the phone app's Apple Sign-In flow. Confirms the project's
  existing convention: client-side code (mobile or web) always uses the
  anon key; the service-role key is reserved for trusted server-side
  contexts only (`engine/`, the daily cron's GitHub Actions secret). A
  public web page reading `recommendations_public` needs neither
  `AsyncStorage` nor any auth call — it can call `createClient(url, anonKey)`
  and query the view directly, exactly as an unauthenticated `anon`-role
  Postgres request.
- **`apps/mobile/lib/recommendations.ts`**: `fetchRecommendations(today:
  Date): Promise<{ today: RecommendationPublicRow | null; yesterday:
  RecommendationPublicRow | null }>` — one combined query
  (`.in('date', [todayIso, yesterdayIso])`), split client-side by exact date
  match. This is the same query shape and the same "explicit not-yet-
  generated state, never silently show a stale day" decision this phase
  needs (see `docs/superpowers/specs/2026-06-22-recommendation-ui-design.md`
  Decisions 6–7) — ported verbatim, not redesigned.
- **`apps/mobile/lib/sessionTypeLabels.ts`**: `SESSION_TYPE_LABELS` (the
  8-entry `session_type` → friendly-name map) and `labelForSessionType` —
  ported verbatim for the same reason (Decision 3 of that same spec: a
  small static lookup, separate from the engine's own casual in-sentence
  string replacement inside `public_rationale`).
- **`apps/web/README.md`** (currently a one-line placeholder): "Next.js
  app — the public renderer for this project, deployed on Netlify. Not yet
  built. Scaffolded in Phase 5..." — written during the original
  (pre-mobile-pivot) architecture design. This phase revisits both the
  framework choice and the "deployed on Netlify" claim from scratch (see
  Decisions 1 and 5) rather than treating that placeholder as binding;
  it predates the mobile pivot and the pipeline's "decide yourself, document
  it" mandate for this exact phase.
- **Root `.gitignore`** already has `node_modules/`, `.next/`, and `out/`
  entries — evidence Next.js was anticipated by the original scaffolding,
  though not binding (see Decision 1, which independently re-confirms
  Next.js is still the right call for an unrelated set of reasons).
- **`.github/workflows/daily-cron.yml`**: the only existing GitHub Actions
  workflow in the repo, establishing the project's CI conventions
  (`actions/checkout@v4`, secrets referenced via `${{ secrets.* }}`, no
  `permissions:` block needed when the job doesn't touch the GitHub API).
  This phase's deploy workflow follows the same shape, plus a `permissions:`
  block where one is in fact needed (GitHub Pages deploys do call the
  GitHub API via official Pages actions — see Decision 5).
- **Repo is public on GitHub** (`smadimsetty/bulletproof`, confirmed via
  `gh repo view`), and `gh` CLI is available in this environment. This is
  the fact that makes Decision 5 (a genuinely automatable free deploy)
  possible rather than just aspirational.

## Goals

- A minimal public web page showing the same two outputs as the mobile
  app's signed-in screen: yesterday's recommendation (framed as what was
  recommended, not what was done — same honesty framing as
  `recommendation-ui-design.md` Decision 2) and today's recommendation
  (`top_pick`, `runner_up`, `public_rationale`), or an honest "hasn't
  generated yet" placeholder if today's cron hasn't run.
- No login, no auth, no session — a logged-out visitor on the public
  internet sees real data immediately, using only the Supabase anon key
  embedded in client-side code (safe to embed; see Decision 2).
- Reuse, not reinvent, the mobile app's data-access and label logic
  (`fetchRecommendations`, `SESSION_TYPE_LABELS`) — ports of the existing
  TypeScript modules, adapted only where the runtime differs (no
  `AsyncStorage`, no React Native primitives), not independent
  reimplementations that could drift from the mobile app's already-reviewed
  decisions.
- Deploy as a static or near-static site requiring no app server to run
  continuously — this is one read-only page with a once-daily data
  refresh ceiling (`recommendations` gets at most one new row per day),
  not an application that needs a persistent backend process.
- Decide a concrete place in the repo (`apps/web/`, already scaffolded as a
  placeholder) and a concrete tech stack, and document the reasoning, since
  `CLAUDE.md` deliberately leaves the web layer's stack undecided ("CLAUDE.md
  doesn't mandate one for the web layer specifically").
- Decide how far this phase can carry actual deployment, given the
  pipeline's money-spend gate (no new paid services/accounts without
  pausing for the user) — and ship the most automation that's genuinely
  achievable with tools already available in this environment, rather than
  reflexively deferring deployment as "needs an account" without checking.

## Non-goals

- Any UI beyond a single page. No routing, no multiple views, no
  historical/trend charts, no rendering of `score_breakdown` or
  `internal_rationale` (both private — same boundary as the mobile app's
  Decision 1 in the recommendation-ui spec).
- Any auth, login screen, or session management. This is the one surface
  in the whole project that is intentionally, permanently logged-out.
- Any new Supabase migration, RLS policy, or grant. `recommendations_public`
  already grants `select` to `anon` — exactly what this phase needs, already
  shipped, already audited in the recommendation-ui phase's final review.
- Demo-video links and target rep ranges. Same reasoning as
  `recommendation-ui-design.md` Decision 4 — `recommendations` has no
  exercise-level data for either app to render; out of scope until a future
  engine phase adds it.
- A "what Sohan actually did yesterday" summary sourced from `sessions`.
  Same reasoning as that spec's Decision 2 — the engine has no such summary
  to read yet; this phase renders yesterday's *recommendation*, not an
  invented outcome summary.
- Writing any data. This page never calls `.insert()`/`.update()`/`.upsert()`
  against Supabase — read-only by construction, matching the "no write
  path" framing from the mobile-interface-design spec's Phase B description.
- A custom domain, real "personal site" integration, or final placement
  under Sohan's actual personal-site URL structure. This phase ships a
  deployable static site and (per Decision 5) an automated free deploy to a
  GitHub Pages URL; wiring that content under Sohan's actual personal
  domain (DNS, custom domain config) is explicitly a manual step outside
  this pipeline's reach (no DNS/domain credentials available here).
- Android, multi-user. Standing non-goals across this entire pipeline.

## Decisions

Ambiguities resolved here since no clarifying questions could be asked
mid-build, per the autonomous pipeline's "no mid-run questions" rule:

### 1. Tech stack: Next.js (App Router, static export), TypeScript, no UI framework dependency

Considered:

- **Next.js with `output: 'export'` (chosen)** — produces a fully static
  HTML/CSS/JS bundle (`next export`-equivalent via the App Router's
  `output: 'export'` config) with zero Node server required at runtime.
  Single React component tree, same language (TypeScript) and same
  `@supabase/supabase-js` client library already used in `apps/mobile/` —
  the `fetchRecommendations`/`SESSION_TYPE_LABELS` ports are near-literal
  copies, not rewrites in a different language or against a different
  Supabase SDK. Already anticipated by the existing `apps/web/README.md`
  placeholder and the root `.gitignore`'s `.next/`/`out/` entries, so this
  decision also resolves a pre-existing ambiguity in the repo rather than
  introducing a new one.
- **Plain static HTML + a `<script type="module">` fetch (rejected)** —
  marginally less tooling, but throws away TypeScript's compile-time
  protection on the exact boundary
  (`recommendations-ui-design.md`'s comment that "TypeScript's structural
  typing on the declared `RecommendationPublicRow` type is the enforcement
  mechanism" for keeping private fields out of the client) that the mobile
  app's design explicitly leans on. Reusing that same type-safety story for
  the public-facing surface is strictly better given the private/public
  split is the one thing this phase must not get wrong, and Next.js's
  static export costs nothing extra in deploy complexity once chosen (still
  ships as plain static files).
- **Vite + plain React (rejected)** — comparable to Next.js for a
  single-page static site, but Next.js was already the implied choice in
  the repo (placeholder README, `.gitignore`) and is a more recognizable
  name for the "portfolio piece" framing in `CLAUDE.md` (a hiring
  manager skimming the repo sees a standard, well-known framework choice).
  No technical advantage to Vite here strong enough to override that.
- **Astro (rejected)** — good fit for mostly-static content, but adds a
  second framework to the codebase's vocabulary (mobile is React
  Native/Expo, the engine is Python) for no capability this single page
  needs that Next.js's static export doesn't already provide equally well.

No UI component library (no Tailwind, no Chakra, no shadcn) — one page,
two cards, inline styles or a single CSS module is sufficient and avoids
a dependency whose main value (a large reusable component system) doesn't
pay off for a page this small. Plain CSS keeps the bundle minimal, which
also matters for a portfolio piece meant to load instantly with no
visible framework weight.

### 2. Supabase client: anon key only, no auth, embedded directly in client-side env vars

The anon key is Supabase's intentionally public credential — it identifies
requests as the `anon` Postgres role, which can only do what RLS/grants
explicitly allow that role to do. `recommendations_public`'s grant to
`anon` (Decision-relevant fact established in the recommendation-ui phase,
confirmed again by reading the migration directly: `grant select on
recommendations_public to anon, authenticated`) means an anon-keyed,
logged-out request can already read exactly the four public columns this
page needs, and nothing else — the base `recommendations` table has no
`anon` policy at all, so `internal_rationale`/`score_breakdown` remain
unreachable through this key regardless of what the client code does. This
is structurally identical to the safety property the recommendation-ui
spec relies on for the *authenticated* mobile case (Decision 1 there: query
the view, never the base table) — here it's even simpler, because there is
no session to manage at all.

Concretely: `apps/web/` gets its own `createClient(supabaseUrl, anonKey)`
call (mirroring `apps/mobile/lib/supabase.ts`'s shape, minus the
`AsyncStorage`/session-persistence options that only make sense for an
authenticated mobile session) reading `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — Next.js's convention for
build-time-inlined public env vars (the `NEXT_PUBLIC_` prefix is required
for a static export to embed the value into the shipped JS bundle; without
it the variable would be undefined at runtime since there is no server to
read a non-prefixed var from). The service-role key never appears in
`apps/web/` — it stays exactly where it already lives (the engine's
server-side `.env`, the daily cron's GitHub Actions secret).

### 3. Port, don't share via a workspace package: separate copies of `fetchRecommendations` and `SESSION_TYPE_LABELS` in `apps/web/`

Considered extracting both modules into a shared package (e.g.
`packages/shared/`) importable by both `apps/mobile/` and `apps/web/`, to
avoid duplication. Rejected for this phase:

- The two apps have incompatible module systems and build tooling today —
  `apps/mobile/` is a bare Expo/Metro project (no monorepo tool like Turborepo
  or pnpm workspaces configured anywhere in the repo; the root
  `package.json` has no `workspaces` field), and `apps/web/` will be a
  Next.js static export. Wiring a real shared package across both would
  mean introducing monorepo tooling (pnpm/Yarn workspaces or Turborepo) as
  net-new infrastructure for a project whose `CLAUDE.md` explicitly treats
  "engine and interface are disposable" — adding a shared-package layer is
  exactly the kind of structural investment that should wait until there's
  a second consumer *and* a demonstrated pain point from duplication, not
  be front-loaded the first time two small files happen to be useful in
  two places.
- The actual logic is small (two files, under 30 lines of real logic
  combined) and already closed/stable — `session_type` is an 8-value enum
  unchanged since Phase 0/1, and the query shape is dictated entirely by
  the view's fixed 5-column contract. The risk this decision is usually
  guarding against (the two copies silently drifting apart) is low given
  how little surface area there is to drift, and the recommendation-ui
  spec's own Decision 3 already established the precedent that *exact*
  duplication of formatting isn't even a goal across surfaces (mobile's
  friendly label and the engine's in-sentence casual text are deliberately
  different) — these two apps are allowed to have their own copies that
  happen to start out identical.
- Practically: a direct port (copy the file, adapt only the import paths
  and remove the React Native-specific `localDateString` re-export
  indirection in favor of a local equivalent) is lower-risk and faster to
  land correctly than building cross-package tooling in the same phase that
  also has to ship the actual page — and per the phase brief, a real deploy
  target (or the lack of one) is a more important decision to get right
  here than DRY-ing up 30 lines of TypeScript.

If a third consumer of this logic ever appears, that's the trigger to
revisit a shared package — not before.

### 4. Single combined page, server-rendered at build time is unnecessary — fetch client-side on page load

Two shapes were considered for *when* the Supabase query runs against a
static-exported site:

- **Build-time fetch (Next.js `generateStaticParams`/server component data
  fetching, baked into the exported HTML)** — would require rebuilding and
  redeploying the static site every time `recommendations` gets a new row
  (once a day) to keep the page current, since a static export has no
  server to re-fetch on each request. That means coupling content
  freshness to a deploy pipeline trigger that doesn't exist yet (nothing
  currently rebuilds `apps/web/` on a schedule) — solvable, but real
  additional CI surface for a phase whose actual deploy story is already
  the harder open question (see Decision 5).
- **Client-side fetch on page load (chosen)** — the exported HTML ships an
  empty shell plus a small JS bundle; on load, the browser calls Supabase
  directly with the anon key (Decision 2) and renders the result, exactly
  mirroring the mobile app's `useEffect`-on-mount pattern
  (`recommendation-ui-design.md` Decision 5: "fetch on mount and on
  foreground, no polling, no realtime"). A static export with a
  client-rendered data fetch is a fully supported, common Next.js pattern
  (a `"use client"` component calling `supabase-js` in a `useEffect`) and
  needs no rebuild for the page to show fresh data — every page load is
  already "fresh" because the fetch happens in the visitor's browser, at
  visit time, against the live database. This sidesteps the entire
  rebuild-on-data-change problem: the static export only needs to be
  rebuilt when the *code* changes, not when `recommendations` gets a new
  row.

No polling/realtime once loaded (same reasoning as the mobile app's
Decision 5 — a once-daily data source doesn't justify either), and no
pull-to-refresh equivalent needed for a page meant to be visited fresh
each time rather than kept open continuously.

### 5. Deployment: GitHub Pages via a GitHub Actions workflow — genuinely automatable, no new account or paid service

The phase brief asks for an honest read on whether a *real* deploy is
achievable without new credentials, or whether this phase should stop at
"builds and runs locally." Checked directly in this environment: `gh` CLI
is present and already authenticated against this exact repo (confirmed
via `gh repo view`), and the repo (`smadimsetty/bulletproof`) is **public**.
GitHub Pages is free for public repositories, requires no new account
(it's a feature of the GitHub account/repo that already exists), and is
fully automatable through a GitHub Actions workflow using GitHub's own
`actions/configure-pages`, `actions/upload-pages-artifact`, and
`actions/deploy-pages` actions — no Netlify/Vercel CLI or account needed
(confirmed neither is installed in this environment, and standing up either
would require creating a new external account, which the pipeline's
money-spend/new-account gate requires pausing for). This means a real,
live, publicly-reachable deploy **is** in scope for this phase, just not
to Netlify (the stale `apps/web/README.md` placeholder's assumption) or to
Sohan's actual personal-site domain (Non-goals — no DNS/domain access
here).

Mechanism:

- A new workflow, `.github/workflows/deploy-web.yml`, triggered on push to
  `master`/`main` (paths-filtered to `apps/web/**` so unrelated changes
  elsewhere in the repo don't trigger a redundant rebuild) and on
  `workflow_dispatch` for manual verification — mirroring
  `daily-cron.yml`'s existing dual-trigger convention.
- Steps: checkout, `actions/setup-node@v4`, `npm ci`/`npm run build` inside
  `apps/web/` (producing the static `out/` directory via `output: 'export'`),
  then the three official Pages actions in sequence
  (`actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` pointed
  at `apps/web/out`, `actions/deploy-pages@v4`).
  This needs a `permissions: { pages: write, id-token: write }` block —
  the one place this phase's CI config differs from `daily-cron.yml`'s
  "no `permissions:` block needed," because this job *does* call a
  GitHub-native deployment API, unlike the engine's job which only talks
  to third-party HTTPS APIs.
- The two public env vars (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are passed as repository secrets/vars
  into the build step exactly like `daily-cron.yml` passes its secrets —
  except these are not sensitive (the anon key is meant to be public, per
  Decision 2), so plain repository **variables** (`vars.*`, visible in the
  repo's Settings but not masked in logs) are the more honest mechanism
  than `secrets.*`, which exists specifically for values that must stay
  hidden. Using `secrets.*` for a deliberately-public value would
  misrepresent its sensitivity to anyone reading the workflow later.
- Enabling GitHub Pages itself on the repo (Settings → Pages → "Build and
  deployment" → "GitHub Actions" as the source) is a one-time repo setting
  this pipeline **can** flip via `gh api` (it's a repo configuration
  change, not a new account or a money-spend decision — Pages is free for
  public repos) — the implementation plan's last task does this via `gh
  api repos/{owner}/{repo}/pages -X POST` (or confirms it's already
  configured) and then verifies the live URL actually serves the page.
- What remains a genuinely manual, deferred step: pointing Sohan's actual
  personal-site domain at this content (custom domain DNS configuration),
  since that requires access to domain/DNS infrastructure this pipeline has
  no credentials for. The GitHub Pages URL
  (`https://smadimsetty.github.io/bulletproof/` or similar, exact path
  depends on whether this becomes a project page under the existing repo)
  is the real, live, deployed artifact this phase produces; wiring a
  custom domain on top of it is a follow-up someone with DNS access does
  later, documented as an explicit manual step in this phase's plan rather
  than silently left undone.

### 6. `apps/web/` keeps its existing location; `next.config` sets `basePath`/`assetPrefix` for the Pages project-page URL shape

Since this deploys as a GitHub Pages *project* page (not a user/org root
page — those require a special `<username>.github.io` repo name, which
this repo is not), the site is served under a `/bulletproof/` subpath, not
the domain root. Next.js's static export needs `basePath: '/bulletproof'`
and `output: 'export'` set in `next.config` for internal links/asset
references to resolve correctly under that subpath — a detail that's easy
to get wrong (assets 404 under a subpath without it) and is therefore
called out explicitly here rather than left for the implementation plan to
discover by trial and error.

### 7. No automated tests beyond a build/type-check gate; verification is "does the live URL render real data"

Mirrors the daily-cron phase's own precedent (`daily-cron.md`'s Global
Constraints: "This is CI/YAML configuration, not application code with
unit tests... the verification cycle is... trigger it... confirm the
actual stated outcome"). This phase does have a little real application
logic (the ported `fetchRecommendations`/`SESSION_TYPE_LABELS`), which
*does* get the same unit-test treatment the mobile app gave it originally
(same test doubles, same cases — both files are near-identical ports, so
their tests port the same way). But there is no component-level/DOM test
added for the page itself (no React Testing Library, no Playwright) —
considered and rejected as disproportionate tooling for a single static
page whose actual acceptance criterion is binary and easiest to check by
just loading the deployed URL: does it show real `top_pick`/`runner_up`/
`public_rationale` text, or the not-yet-generated placeholder. `npx tsc
--noEmit` and `npm run build` (the static export itself succeeding) are
the automated gates; the deployed URL's real content is checked manually
in the plan's final task, the same class of "cannot be automated, device/
environment-dependent" limitation already accepted for the mobile app's
TestFlight verification step.

## Approach

```
Browser (logged-out visitor)
        │
        ▼
GET https://smadimsetty.github.io/bulletproof/
        │  (static HTML + JS shipped from GitHub Pages, no server)
        ▼
React client component mounts, useEffect fires
        │
        ▼
fetchRecommendations(new Date())   (apps/web/lib/recommendations.ts -- ported)
        │
        ├─▶ createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
        │      .from('recommendations_public')
        │      .select('date, top_pick, runner_up, public_rationale, generated_at')
        │      .in('date', [todayIso, yesterdayIso])
        │   (anon role, no session, no auth call -- RLS/grants already allow this)
        ▼
{ today: Row | null, yesterday: Row | null }
        │
        ▼
Page renders:
  ┌─────────────────────────────────────┐
  │ Bulletproof                          │  ← title/header, portfolio framing
  │ Yesterday                            │  ← omitted entirely if null
  │ Lower Body A                         │  ← SESSION_TYPE_LABELS[top_pick]
  │ "Today's pick is lower a -- ..."      │  ← public_rationale, verbatim
  ├─────────────────────────────────────┤
  │ Today                                │
  │ Mobility                             │
  │ Runner-up: Upper Body A              │
  │ "Today's pick is mobility -- ..."     │
  └─────────────────────────────────────┘
  (or, if no row for today yet, the same
   honest placeholder text as the mobile app)

Deploy path:
  push to master (apps/web/** changed)
        │
        ▼
.github/workflows/deploy-web.yml
        │
        ├─ npm ci && npm run build  (apps/web/, output: 'export' → apps/web/out/)
        ├─ actions/configure-pages@v5
        ├─ actions/upload-pages-artifact@v3  (path: apps/web/out)
        └─ actions/deploy-pages@v4
        │
        ▼
Live at https://smadimsetty.github.io/bulletproof/
```

## Testing / verification plan

- Unit tests for the ported `apps/web/lib/recommendations.ts` — same cases
  as `apps/mobile/lib/recommendations.test.ts` (both rows present, only
  today, only yesterday, neither, query-shape assertion, error-throws),
  adapted to mock `apps/web/lib/supabase.ts` instead of the mobile module.
- Unit tests for the ported `apps/web/lib/sessionTypeLabels.ts` — same
  cases as the mobile version (all 8 enum values present, spot-check
  friendly names).
- `npx tsc --noEmit` inside `apps/web/` — type-checks the page and both
  ported lib modules.
- `npm run build` inside `apps/web/` — confirms the static export succeeds
  and produces `apps/web/out/index.html` (or the Pages-subpath-adjusted
  equivalent) with no server-only API (e.g. no accidental use of
  `getServerSideProps`/dynamic server functions incompatible with
  `output: 'export'`).
- Local verification: `npx serve apps/web/out` (or equivalent static file
  server) and confirm the page renders real data against the live Supabase
  project using a local `.env.local` with the anon key — catches
  client-side fetch/render bugs before deploying.
- CI verification: trigger `.github/workflows/deploy-web.yml` via
  `gh workflow run deploy-web.yml --ref pipeline/web-dashboard` (or push),
  watch via `gh run watch`, and confirm the run succeeds.
- Live verification: `curl`/fetch the deployed GitHub Pages URL and confirm
  the response contains the expected static shell, then a manual/browser
  check that the client-side fetch renders real `top_pick`/`runner_up`/
  `public_rationale` text (or the honest placeholder) from the live
  `recommendations_public` view — same class of "cannot be fully automated
  away, needs an actual page load" limitation already accepted for the
  mobile app's TestFlight check.

## Out of scope

- A shared package between `apps/mobile/` and `apps/web/` (Decision 3) —
  revisit only if a third consumer appears.
- Build-time/SSR data fetching (Decision 4) — client-side fetch is
  sufficient and avoids coupling content freshness to a rebuild trigger.
- Custom domain / Sohan's actual personal-site integration (Decision 5) —
  deferred as an explicit manual step requiring DNS access this pipeline
  doesn't have.
- Any schema, RLS, or engine change — this phase is entirely
  `apps/web/` + one new CI workflow, reading data that already exists.
- Demo-video links, rep ranges, a true "what Sohan did yesterday" summary
  — same deferrals as the recommendation-ui phase, for the same reasons
  (no underlying data yet).
- Component/DOM-level or end-to-end browser tests (Decision 7) — a
  build/type-check gate plus manual live-URL verification is the
  proportionate bar for one static page.
- Android, multi-user — standing non-goals across this pipeline.
