# Bulletproof Training App — Architecture & Roadmap Design (v1)

## Context

Sohan is building a personal, data-driven dynamic training system (see `CLAUDE.md` for full product context: athlete profile, injury history, program philosophy, deterministic scoring engine). The project directory was empty at the start of this design pass — this is a from-scratch build. The goal here is to lock in technical architecture, repo structure, and build sequence before any code is written, so the permanent layer (data model) is designed right once, while the engine and UI stay disposable/rebuildable. This is also a public portfolio piece (SE/FDE job-search proof), which shapes some choices below (public GitHub repo, clean readable code, public-facing recommendation view).

This design is intentionally high-level / architectural. Each numbered phase in section D is its own future spec + implementation plan, starting with Phase 0/1.

## Resolved decisions

- **Web app:** Next.js + TypeScript, deployed on **Netlify**
- **Database:** Supabase (Postgres + RLS). New project, created by Sohan via the Supabase dashboard (account/project creation is outside Claude's reach), then connected via shared project ref/keys. Schema managed via versioned SQL migration files in-repo using the Supabase CLI — `supabase/migrations/` is the source of truth for schema
- **Engine:** Python, deterministic scoring (no LLM in v1)
- **Oura integration:** Sohan has the ring; Personal Access Token not yet generated — generated when we reach Phase 3
- **Automation:** GitHub Actions cron runs the engine every morning, writes results to Supabase (Python reused as-is, no rewrite to Deno/Edge Functions)
- **Repo:** new **public** GitHub repo (portfolio value)
- **Logging model:** recommend-only for v1 — Strong/Hevy remain the workout logger; this app does not capture sets/reps/weight
- **Auth:** none in v1. Single-user app. The "private" dashboard route (raw biometrics, full history) is unauthenticated/unlinked for now. Optional zero-code gate flagged for later consideration: Netlify's built-in password/visitor-access protection — not required for v1
- **Public/private split:** built from day one as two route groups — public (today's recommendation + plain-language reasoning, no raw biometric numbers) and private (full recovery history, raw HRV/sleep/etc.)
- **Build sequence:** prototype scoring weights in a spreadsheet/notebook against ~30 days of real historical data before writing the engine (per CLAUDE.md's own recommendation). Sohan can export this history now (Oura + Strong/Hevy exports), so this is doable immediately rather than blocked on weeks of fresh logging.
- **User inputs (v1 scope):** confirm what session was actually done (including overriding the day's recommendation entirely), manual soreness/pain flags (for days Oura doesn't surface them), and editable goals/targets (current focus area, target session ratios) via a settings area. Out of scope for v1: manual readiness override, pickleball weather/availability input.

## A. Tech stack & architecture

- **Web app:** Next.js (App Router) + TypeScript → Netlify
- **Database:** Supabase (Postgres), RLS enabled from day one even though single-user (matches CLAUDE.md's "schema designed for multi-user, not built yet" principle)
- **Engine:** Python — Oura ingestion + deterministic scoring (the "permanent logic," tunable weights as config, not hardcoded magic numbers)
- **Scheduling:** GitHub Actions daily cron workflow invokes the Python engine, which writes its output to Supabase; the web app only ever *reads* — it never computes recommendations itself
- **No LLM layer in v1** — natural-language rationale generation deferred to Phase 6 (optional)

## B. Repo / folder structure (monorepo)

```
bulletproof/
├── apps/web/                  # Next.js app — public + private route groups
├── engine/                    # Python: Oura client + scoring engine
│   ├── bulletproof_engine/
│   │   ├── oura.py
│   │   ├── scoring.py
│   │   ├── models.py
│   │   └── run_daily.py       # entrypoint invoked by GitHub Actions
│   ├── tests/
│   └── pyproject.toml
├── supabase/
│   ├── migrations/            # versioned SQL — source of truth for schema
│   └── config.toml
├── prototyping/weight-tuning/ # spreadsheet/notebook + exported historical CSVs
├── docs/superpowers/specs/    # design docs (this one, and future per-phase specs)
├── .github/workflows/         # daily cron workflow (morning-engine.yml)
├── CLAUDE.md
└── README.md
```

## C. Data model (resolved, supersedes/extends CLAUDE.md draft)

- **`user`** — profile, injury constraints, editable goals/targets (e.g. current focus, target session ratios). Single row for v1, but a table so multi-user later = adding rows, not a rewrite.
- **`recovery`** — date, sleep_hrs, hrv, resting_hr, subjective_readiness, soreness_flags. Oura-sourced where possible, manually editable for soreness flags Oura can't detect.
- **`recommendations`** *(new table)* — date, top pick, runner-up, score breakdown/rationale, generated_at. The engine's daily output; the app renders directly from this and never recomputes.
- **`sessions`** — ground truth of what Sohan actually did (date, type, duration, notes), confirmed via the app — may match the day's recommendation or be a deliberate override. This table, not `recommendations`, feeds tomorrow's scoring, since rotation history must reflect reality.
- **`exercises`** — static lookup (name, pattern, demo_video_url, is_complex), unchanged from CLAUDE.md draft.

## D. Phased roadmap (each phase gets its own spec + plan before implementation)

0. **Scaffolding** — repo init, folder structure above, public GitHub repo, Supabase project creation walkthrough (Sohan does account/project creation; Claude handles CLI install/link, migration tooling, `.env` conventions, secrets never committed)
1. **Schema** — migrations for `user` / `recovery` / `recommendations` / `sessions` / `exercises` + RLS policies + seed `exercises` lookup data
2. **Weight-tuning prototype** — export Oura + Strong/Hevy history, build a spreadsheet/notebook version of the scoring engine, sanity-check weights against ~30 real days before any engine code is written
3. **Python engine** — productionize the tuned scoring logic + Oura API client (generate PAT, ingest recovery data), unit tests, writes to `recovery` + `recommendations`
4. **Automation** — GitHub Actions workflow running the engine daily, secrets management (Oura token, Supabase service key) via repo secrets
5. **Web app v1** — Next.js app on Netlify: public route (today's recommendation + plain-language reasoning, no raw biometric numbers) + private/unlinked route (full recovery history, raw numbers) + input forms (confirm/override today's session, soreness flags, editable goals/targets)
6. **Polish / optional** — LLM narrative rationale layer, demo-video link wiring, deploy/privacy hardening (e.g. Netlify access protection for the private route)

## Verification approach (once implementation starts)

- **Phase 0/1:** `supabase db push` applies cleanly against the new project; query each table via Supabase CLI/SQL editor and confirm RLS policies block cross-row access as expected
- **Phase 2:** spreadsheet/notebook output reviewed by Sohan against his own memory of those ~30 days — "does this look like what I should have done?"
- **Phase 3:** unit tests on scoring functions with fixture recovery/session histories; manual run of `run_daily.py` against a real (or sandboxed) Oura token, inspect the row it writes to `recommendations`
- **Phase 4:** trigger the GitHub Actions workflow manually once, confirm it runs end-to-end and a new `recommendations` row appears
- **Phase 5:** run the Next.js app locally against the Supabase project, confirm both route groups render real data; deploy to Netlify and smoke-test the live URL

## Next step

Once this spec is reviewed, the next concrete step is Phase 0 + Phase 1 combined (scaffolding + schema) as one implementation cycle — small enough to plan together in one pass, since the schema is the most permanent decision in the whole project and deserves a focused pass before any app code is written.
