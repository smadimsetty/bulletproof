# Scaffolding & Schema (Phase 0 + 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the repo (folders, tooling, GitHub) and the Supabase schema (5 tables + RLS + a public-safe view) that every later phase builds on.

**Architecture:** A monorepo with disposable `apps/web` and `engine/` folders around a permanent `supabase/migrations/` schema. No local Docker/Postgres sandbox — migrations are written, pushed straight to the real (pre-production, no live users yet) Supabase project, and verified against its live PostgREST API with `curl`, since that's the same interface the web app and engine will use later.

**Tech Stack:** Git, GitHub CLI (`gh`), Supabase CLI (via npm, run with `npx`), Supabase Postgres, curl for verification. No Next.js/Python code yet — those are scaffolded in their own later phases (5 and 3 respectively).

## Global Constraints

- Engine will require Python >= 3.11 (set now in `engine/pyproject.toml` even though no engine code exists yet)
- Supabase CLI must be installed via npm devDependency (`npx supabase ...`), not winget/Scoop — no winget package exists for it on this machine
- No Docker / no local Supabase dev stack for v1 — all migrations are pushed directly to the real cloud project and verified there
- GitHub repo must be public (portfolio piece)
- No authentication system in v1 — every table's RLS policy set must assume only two callers exist: `anon` (the public web page) and the service role (server-only code, used directly via its key, bypasses RLS)
- Spec deviation to apply consistently: CLAUDE.md/the architecture spec call the profile table `user`; it is implemented as `user_profile` because `user` collides with Postgres's reserved `CURRENT_USER`/role semantics and is a discouraged table name. Every later phase that references "the user table" means `user_profile`.

---

### Task 1: Install CLI tooling

**Files:**
- Create: `package.json`

**Interfaces:**
- Produces: a working `gh` command on PATH, and `npx supabase` runnable from the repo root for every later task

- [ ] **Step 1: Install GitHub CLI via winget**

Run: `winget install --id GitHub.cli -e --source winget`
Expected: installer completes; `winget` reports the package installed (or "already installed" if re-run)

- [ ] **Step 2: Verify `gh` is on PATH**

Run: `gh --version`
Expected: prints a version like `gh version 2.x.x`. If "command not found," open a new terminal/shell session (PATH was just updated) and retry.

- [ ] **Step 3: Authenticate `gh` (you run this — it opens a browser)**

Run: `gh auth login` and follow the prompts (choose GitHub.com, HTTPS, browser login).
Expected: `gh auth status` afterward shows you logged in.

- [ ] **Step 4: Create the root `package.json`**

```json
{
  "name": "bulletproof",
  "private": true,
  "version": "0.1.0"
}
```

- [ ] **Step 5: Install the Supabase CLI as a dev dependency**

Run: `npm install --save-dev supabase`
Expected: `package.json` now has a `devDependencies.supabase` entry with a resolved version; `package-lock.json` and `node_modules/` are created.

- [ ] **Step 6: Verify the Supabase CLI runs**

Run: `npx supabase --version`
Expected: prints a version number, e.g. `2.x.x`

---

### Task 2: Scaffold the repo and publish it to GitHub

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`
- Create: `.gitignore`
- Create: `apps/web/README.md`
- Create: `engine/README.md`
- Create: `engine/pyproject.toml`
- Create: `prototyping/weight-tuning/README.md`

**Interfaces:**
- Consumes: `gh` from Task 1
- Produces: a git repo with an `origin` remote pointing at a public GitHub repo named `bulletproof`, which every later task's commits push to

- [ ] **Step 1: Write `CLAUDE.md`** (the existing product-context doc the project was started from — write it verbatim to disk; it has not existed as a real file until now)

```markdown
# CLAUDE.md — Bulletproof Training App

Project context for building Sohan's personal dynamic training system. Read this first.

## What this is
A personal, data-driven dynamic training system. Every morning it ingests recovery data + recent training history and produces **two outputs**: (1) a summary of yesterday, and (2) a recommendation for today's optimal session (gym upper/lower, pickleball, run, mobility, or rest) — with demo-video links for complex movements and target rep ranges. Built for Sohan first, but the data model is designed so multi-user is a later *addition*, not a rewrite. Philosophy/voice: Bryan Johnson / Blueprint — measured, optimal, evidence-based, "bulletproof" total-body health. Secondary purpose: it's a public portfolio piece that doubles as SE/FDE job-search proof ("built an Oura-integrated training engine").

## The athlete (Sohan)
- **Core goal:** "bulletproof" body — move and lift pain-free; total-body resilience; strong AND mobile AND lean; visible abs = his personal aesthetic bar.
- **Activities/passions:** strength training; pickleball (~2x/week, 2–3 hrs, his most strenuous activity); running (currently ~1x/week ~30 min, wants more). Gym ~4x/week, upper/lower split, ~1 hr/session incl. warmup + core.
- **Schedule:** one flexible rest day/week (flexes with pickleball or running). Prefers evening lifting.
- **Training preferences:** science-backed, compound-based, max results in minimum time; whole-body (wrists, lower back, knees — not just core/legs/chest); plyometrics included; mobility/flexibility emphasized heavily.
- **Injuries / pain points (these drive the mobility programming):**
  1. **Neck** — chronic stiffness/tightness, "always hurting." Root cause treated as **thoracic spine**, not the neck itself.
  2. **Ankles** — both injured over ~1.5 yrs; pain returns under high volume. Highest reinjury risk (lateral pickleball movement).
  3. **Hips & hamstrings** — wants better mobility: deep squat, down dog, flexibility poses.
  4. **Right-side dominance** — right arm stronger + tighter/less mobile than left.
- **Physique status:** already lean. Goal = slight recomposition + fill out shoulders/upper back + sharpen abs (not a bulk).

## The v1 program (knowledge base — the engine selects/serves from this)
**Weekly skeleton (flexible, readiness-modulated):** Mon/Wed/Fri gym (upper/lower, optimal ~5:30–7pm), Thursday run + dedicated mobility, pickleball ~2x, one flexible rest day.

**Non-negotiables (the high-leverage core):**
- **Thursday deep mobility session (~35–40 min)** — where the specific issues actually get fixed (everything else maintains/builds; Thursday fixes). Four blocks: **Neck** (chin tucks; thoracic extension on foam roller; levator scapulae stretch), **Ankle** (banded ankle distraction; wall ankle test — track knee-to-wall weekly; single-leg balance eyes closed), **Hips/Hamstrings** (90/90 ~3 min/side; PNF hamstring stretch; couch stretch; deep squat hold ~5 min), **Down dog + right shoulder** (down dog progression; sleeper stretch right; shoulder CARs). Long holds (60–120s) + PNF — restorative, distinct in intent/depth from the pre-lift warmup.
- **Nordic hamstring curl** — every lower day; strongest evidence base for hamstring injury prevention.
- **ATG split squat** — every lower day; ankle resilience.
- **Unilateral work starting with the LEFT side** — closes right-arm dominance over ~8–12 weeks if consistent.
- **5-min ankle warmup before EVERY pickleball session** — single highest-leverage injury-prevention habit given ankle history.
- Also flagged: Copenhagen plank (adductors/groin), Jefferson curl (spine/hamstrings), plyometrics.

**Diet (supports recomposition + recovery):** ~175g protein / ~200g carbs / ~70g fat / ~2,100 cal, timed around evening lifting (sample schedule 7:30am–9pm with per-meal macros). Pickleball days: +carbs (don't undereat the 600–800 cal burn). Rest days: ↓carbs, hold protein. South Asian angle: dal and cheela as anti-inflammatory, high-protein staples.

## System architecture (decided)
Two layers: **the data model is permanent; the engine and interface are disposable.** Design the schema right once, then rebuild UI / swap logic (rules → AI) without migrating data.

### Data model (get this right once)
- `sessions` — date, type (`upper_a`/`upper_b`/`lower_a`/`lower_b`/`pickleball`/`run`/`rest`/`mobility`), duration, optional exercises+sets+reps+weight, notes
- `recovery` — date, sleep_hrs, hrv, resting_hr, subjective_readiness (1–10), soreness_flags (neck/ankle/hips/shoulders/legs)
- `exercises` — name, pattern, demo_video_url, is_complex (static lookup, built once)
- `user` — profile + injury constraints (a table even though it's just Sohan, so multi-user = adding rows, not a rewrite)

### Engine (deterministic scoring — NOT an LLM freestyle)
For each candidate in [upper, lower, pickleball, run, rest, mobility]:
- base score from program rotation
- readiness ≤ 3 — force rest/mobility (gate everything else)
- no rest day in last 7 — heavy weight to rest
- no mobility session in last 4 days — weight to mobility (protects the specific issues)
- same pattern as yesterday — heavy penalty (the upper↔lower rule)
- pickleball requires: weather_good AND days_since_pickleball ≥ 2 AND readiness ≥ 6
- run AND pickleball was yesterday — +weight (legs worked, aerobic fits)
- run — respect 10%/week progression cap
- balance against ~10-day target ratios (~4 lift / 2 pickleball / 1–2 run / 1 rest)
- pick highest score, return top 2 (show the runner-up)

Weights are **tunable variables / opinions** — tune them against real last-30-days history before investing in UI. The **LLM layer is optional and sits on top**: it writes the natural-language summary + recommendation rationale and pulls exercise links. Language, not decisions. Cache aggressively (per-user cost matters at multi-user).

### Key unlock: Oura
Oura auto-delivers the entire `recovery` table every morning (sleep, HRV, resting HR, readiness) with **zero friction** — the hardest, most decision-relevant data is solved automatically. Pickleball/runs may auto-detect as Oura workouts. Only **gym training** still needs manual logging.

### Build stack (decided this session)
- **Python engine** (Oura pull + readiness scoring + program generation), runs each morning.
- **Public web app on Sohan's personal site** = the renderer (and a shareable portfolio piece).
- **Public/private split:** publish the program + the reasoning; keep raw biometrics (HRV etc.) private or aggregated.
- **Storage:** lean toward managed **Postgres (Supabase) with row-level security from day one** (multi-user-ready, no throwaway work) vs. a lighter SQLite/JSON start (faster, migrate later).
- **Recommended sequence:** prototype the scoring logic in a Sheet against last-30-days history to tune the weights (cheap way to learn whether "optimal" feels optimal), THEN build the app. Don't build UI around untuned logic.

## Open decisions (NOT yet settled — resolve before/while building)
1. **Logging model:** recommend-only (keep logging gym work in Strong/Hevy) vs. **app-becomes-the-logger** (owns history — enables rep/weight progressive-overload suggestions, removes Strong-API dependency). Current lean: eventually the logger; could start recommend-only to ship faster. **Sub-question that drives the design:** how much does Sohan want to log in-the-moment — full sets/reps/weight, or just "did upper, felt 7/10"?
2. **Storage/runtime:** Supabase + RLS once (no throwaway) vs. SQLite/JSON quick start.
3. **Rotation granularity:** maintain `upper_a`/`upper_b` + `lower_a`/`lower_b` variants so identical sessions don't repeat.

## Principles / guardrails
- **Friction-first:** if daily data-in takes >~20s, it dies. Optimize data-in before intelligence. (Oura largely solves recovery.)
- Data model permanent; engine + UI disposable/rebuildable.
- **Rules-based engine first** — transparent, debuggable, free, tunable (Sohan is a data analyst). ML only after months of logged data.
- The **readiness gate doubles as the injury guardrail** (neck/ankle history) — when readiness tanks, it forces rest/mobility.
- Multi-user is a later addition: design the schema for it (user table, RLS) but don't build it yet. Health data — even friends' sleep/HRV — is sensitive; RLS from the start, not bolted on.
- **"High-impact only":** cap junk volume; compound-based; science-backed exercise selection.

## To verify at build time (do NOT assert as current fact)
- **Strong/Hevy write API:** last known = Strong has no public write API (CSV export only). Verify when reaching the logging/integration phase.
- **Oura API specifics** (endpoints, auth, token scopes) — confirm at build time.

## Status
Architecture settled; open decisions above largely resolved in `docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md` (Next.js+Netlify, Supabase, recommend-only v1, no auth v1). When building: **lock the data schema + scoring function first** (the permanent layer), and prototype the weights against last-30-days history before any UI.
```

- [ ] **Step 2: Write the root `README.md`**

```markdown
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
```

- [ ] **Step 3: Write `.gitignore`**

```
# Node / Next.js
node_modules/
.next/
out/

# Python
__pycache__/
*.pyc
.venv/

# Environment & secrets
.env
.env.local
.env.*.local

# Supabase CLI
supabase/.branches
supabase/.temp

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 4: Write `apps/web/README.md`**

```markdown
# apps/web

Next.js app — the public renderer for this project, deployed on Netlify.

Not yet built. Scaffolded in Phase 5 of the roadmap (see
`docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md`).
```

- [ ] **Step 5: Write `engine/README.md`**

```markdown
# engine

Python package: pulls recovery data from Oura, runs the deterministic scoring
engine, and writes the day's recommendation to Supabase.

Scoring logic is built in Phase 3 of the roadmap, after weights are sanity
checked against real history in `prototyping/weight-tuning/` (Phase 2). See
`docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md`.
```

- [ ] **Step 6: Write `engine/pyproject.toml`**

```toml
[project]
name = "bulletproof-engine"
version = "0.1.0"
description = "Oura ingestion and deterministic training-recommendation engine for the Bulletproof project"
requires-python = ">=3.11"
dependencies = []

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

- [ ] **Step 7: Write `prototyping/weight-tuning/README.md`**

```markdown
# prototyping/weight-tuning

Spreadsheet/notebook used in Phase 2 of the roadmap to sanity-check scoring
weights against ~30 days of real historical recovery + training data, before
any engine code is written. See
`docs/superpowers/specs/2026-06-20-bulletproof-architecture-design.md`.
```

- [ ] **Step 8: Initialize git and make the first commit**

```bash
git init
git add .gitignore README.md CLAUDE.md package.json package-lock.json apps engine prototyping docs
git commit -m "chore: scaffold repo structure and project docs"
```

Expected: `git log --oneline` shows one commit.

- [ ] **Step 9: Create the public GitHub repo and push**

Run: `gh repo create bulletproof --public --source=. --remote=origin --push`
Expected: command prints the new repo URL (e.g. `https://github.com/<you>/bulletproof`) and pushes the initial commit. If the name `bulletproof` is already taken under your account, re-run with a different name, e.g. `bulletproof-training`.

---

### Task 3: Create and link the Supabase project

**Files:**
- Create: `supabase/config.toml` (generated by the CLI)
- Create: `.env` (gitignored — holds project URL + keys for your own local use; never committed)

**Interfaces:**
- Consumes: `npx supabase` from Task 1
- Produces: a linked Supabase project that Tasks 4–9 push migrations to, and three env values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) every later task's verification commands depend on

- [ ] **Step 1: Create the Supabase project (you do this — dashboard only)**

Go to https://supabase.com/dashboard, create a new project (suggested name: `bulletproof`, pick the region closest to you, set a strong DB password and save it somewhere durable like a password manager).

- [ ] **Step 2: Authenticate the CLI (you run this — it opens a browser)**

Run: `npx supabase login`
Expected: browser opens, you approve, CLI confirms you're logged in.

- [ ] **Step 3: Initialize the Supabase CLI project files**

Run: `npx supabase init`
Expected: creates `supabase/config.toml` and `supabase/migrations/` (empty so far). Accept defaults when prompted.

- [ ] **Step 4: Link to the cloud project**

Find your project ref in the dashboard URL (`https://supabase.com/dashboard/project/<project-ref>`) or under Project Settings → General.

Run: `npx supabase link --project-ref <project-ref>`
Expected: prompts for the DB password you set in Step 1, then confirms linking succeeded.

- [ ] **Step 5: Capture API credentials into `.env`**

From the dashboard: Project Settings → API. Copy the Project URL, `anon` `public` key, and `service_role` `secret` key into a new `.env` file at the repo root:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret-key>
```

`.env` is already covered by `.gitignore` from Task 2 — confirm with `git status` that it does **not** show up as untracked-and-about-to-be-added.

- [ ] **Step 6: Commit the Supabase CLI scaffolding**

```bash
git add supabase/config.toml
git commit -m "chore: link Supabase project"
```

---

### Task 4: Migration — extensions, session_type enum, exercises table + seed data

**Files:**
- Create: `supabase/migrations/<timestamp>_enable_extensions_and_types.sql`
- Create: `supabase/migrations/<timestamp>_create_exercises.sql`
- Create: `supabase/migrations/<timestamp>_seed_exercises.sql`

**Interfaces:**
- Produces: Postgres enum type `session_type` (values: `upper_a`, `upper_b`, `lower_a`, `lower_b`, `pickleball`, `run`, `rest`, `mobility`) used by `recommendations.top_pick`/`runner_up` (Task 7) and `sessions.type` (Task 8); table `exercises(id, name, movement_pattern, demo_video_url, is_complex, created_at)`, publicly readable

- [ ] **Step 1: Generate the extensions/types migration file**

Run: `npx supabase migration new enable_extensions_and_types`
Expected: creates `supabase/migrations/<timestamp>_enable_extensions_and_types.sql` (timestamp will differ on your machine). Open that file and replace its contents with:

```sql
-- Enable pgcrypto so we can use gen_random_uuid() as a primary key default.
create extension if not exists pgcrypto;

-- Canonical set of session/recommendation types used across the schema.
create type session_type as enum (
  'upper_a',
  'upper_b',
  'lower_a',
  'lower_b',
  'pickleball',
  'run',
  'rest',
  'mobility'
);
```

- [ ] **Step 2: Generate the exercises table migration**

Run: `npx supabase migration new create_exercises`
Replace the new file's contents with:

```sql
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  movement_pattern text not null check (
    movement_pattern in ('squat', 'hinge', 'push', 'pull', 'core', 'mobility', 'balance')
  ),
  demo_video_url text,
  is_complex boolean not null default false,
  created_at timestamptz not null default now()
);

alter table exercises enable row level security;

-- Exercises are not sensitive: the public recommendation view links to them
-- directly, so anonymous readers need select access.
create policy "anon_can_read_exercises"
  on exercises
  for select
  to anon
  using (true);
```

- [ ] **Step 3: Generate the seed-data migration**

Run: `npx supabase migration new seed_exercises`
Replace the new file's contents with:

```sql
insert into exercises (name, movement_pattern, is_complex) values
  ('Chin tucks', 'mobility', false),
  ('Thoracic extension on foam roller', 'mobility', false),
  ('Levator scapulae stretch', 'mobility', false),
  ('Banded ankle distraction', 'mobility', true),
  ('Wall ankle test (knee-to-wall)', 'mobility', false),
  ('Single-leg balance, eyes closed', 'balance', false),
  ('90/90 hip stretch', 'mobility', false),
  ('PNF hamstring stretch', 'mobility', true),
  ('Couch stretch', 'mobility', false),
  ('Deep squat hold', 'mobility', false),
  ('Down dog progression', 'mobility', false),
  ('Sleeper stretch (right)', 'mobility', false),
  ('Shoulder CARs', 'mobility', false),
  ('Nordic hamstring curl', 'hinge', true),
  ('ATG split squat', 'squat', true),
  ('Copenhagen plank', 'core', true),
  ('Jefferson curl', 'hinge', true);
```

- [ ] **Step 4: Push the migrations**

Run: `npx supabase db push`
Expected: CLI lists the three new migrations and applies them; ends with a success message.

- [ ] **Step 5: Verify anonymous read access works and returns 17 rows**

Run (replace `$SUPABASE_URL`/`$SUPABASE_ANON_KEY` with the values from your `.env`):

```bash
curl -s "$SUPABASE_URL/rest/v1/exercises?select=name,movement_pattern,is_complex" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: a JSON array of 17 objects, e.g. starting `[{"name":"Chin tucks","movement_pattern":"mobility","is_complex":false},...]`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add session_type enum and exercises table with seed data"
```

---

### Task 5: Migration — user_profile table + seed Sohan's profile

**Files:**
- Create: `supabase/migrations/<timestamp>_create_user_profile.sql`
- Create: `supabase/migrations/<timestamp>_seed_user_profile.sql`

**Interfaces:**
- Produces: table `user_profile(id, name, goals jsonb, injury_constraints jsonb, created_at, updated_at)`, service-role-only (no anon access)

- [ ] **Step 1: Generate and write the table migration**

Run: `npx supabase migration new create_user_profile`

```sql
create table user_profile (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goals jsonb not null default '{}'::jsonb,
  injury_constraints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profile enable row level security;

-- Deliberately no anon/authenticated policies: goals and injury notes are
-- personal and are only ever read/written server-side via the service role,
-- which bypasses RLS by design.
```

- [ ] **Step 2: Generate and write the seed migration**

Run: `npx supabase migration new seed_user_profile`

```sql
insert into user_profile (name, goals, injury_constraints) values (
  'Sohan',
  '{
    "core_goal": "bulletproof: move and lift pain-free, total-body resilience, strong and mobile and lean, visible abs",
    "target_ratios_per_10_days": {"lift": 4, "pickleball": 2, "run": 1.5, "rest": 1},
    "focus": "slight recomposition, fill out shoulders and upper back, sharpen abs"
  }'::jsonb,
  '{
    "neck": {"active": true, "note": "chronic stiffness, root cause treated as thoracic spine"},
    "ankles": {"active": true, "note": "both injured over ~1.5yrs, highest reinjury risk under high volume / lateral pickleball movement"},
    "hips_hamstrings": {"active": true, "note": "wants better mobility: deep squat, down dog, flexibility poses"},
    "right_dominance": {"active": true, "note": "right arm stronger and tighter/less mobile than left"}
  }'::jsonb
);
```

- [ ] **Step 3: Push**

Run: `npx supabase db push`
Expected: both migrations applied successfully.

- [ ] **Step 4: Verify service role can read it, anon cannot**

```bash
curl -s "$SUPABASE_URL/rest/v1/user_profile?select=name,goals" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```
Expected: one row, `name` is `"Sohan"`.

```bash
curl -s "$SUPABASE_URL/rest/v1/user_profile?select=name" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `[]` (RLS silently filters out all rows for the `anon` role — this is correct, not an error).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add user_profile table with seeded profile"
```

---

### Task 6: Migration — recovery table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_recovery.sql`

**Interfaces:**
- Produces: table `recovery(id, date unique, source, sleep_hrs, hrv, resting_hr, subjective_readiness, soreness_flags jsonb, created_at, updated_at)`, service-role-only

- [ ] **Step 1: Generate and write the migration**

Run: `npx supabase migration new create_recovery`

```sql
create table recovery (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  source text not null default 'oura' check (source in ('oura', 'manual')),
  sleep_hrs numeric(4, 2),
  hrv numeric(6, 2),
  resting_hr numeric(5, 2),
  subjective_readiness smallint check (subjective_readiness between 1 and 10),
  soreness_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recovery enable row level security;

-- Deliberately no anon/authenticated policies: raw biometrics are exactly
-- the data the public/private split exists to protect.
```

- [ ] **Step 2: Push**

Run: `npx supabase db push`

- [ ] **Step 3: Verify with a service-role insert + select, and confirm anon gets nothing**

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/recovery" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"date":"2026-06-19","source":"manual","sleep_hrs":7.5,"hrv":52.0,"resting_hr":58,"subjective_readiness":7,"soreness_flags":{"neck":true}}'
```
Expected: returns the inserted row as JSON.

```bash
curl -s "$SUPABASE_URL/rest/v1/recovery?select=date" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `[]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add recovery table"
```

---

### Task 7: Migration — recommendations table + public-safe view

**Files:**
- Create: `supabase/migrations/<timestamp>_create_recommendations.sql`

**Interfaces:**
- Consumes: `session_type` enum from Task 4
- Produces: table `recommendations(id, date unique, top_pick session_type, runner_up session_type, score_breakdown jsonb, internal_rationale, public_rationale, generated_at)` (service-role-only) and view `recommendations_public(date, top_pick, runner_up, public_rationale, generated_at)` (anon-readable). Task 8's `sessions.recommendation_id` references `recommendations(id)`.

- [ ] **Step 1: Generate and write the migration**

Run: `npx supabase migration new create_recommendations`

```sql
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  top_pick session_type not null,
  runner_up session_type,
  score_breakdown jsonb not null default '{}'::jsonb,
  internal_rationale text not null,
  public_rationale text not null,
  generated_at timestamptz not null default now()
);

alter table recommendations enable row level security;

-- Deliberately no anon/authenticated policies on the base table:
-- score_breakdown and internal_rationale can reference raw biometrics.
-- Public access goes through the view below instead.

-- Views in Postgres run with the privileges of their owner (the migration
-- role, which bypasses RLS), not the querying role. That means this view
-- can read the protected base table while only ever exposing the four
-- columns listed here — the base table's RLS still blocks any other path.
create view recommendations_public as
  select date, top_pick, runner_up, public_rationale, generated_at
  from recommendations;

grant select on recommendations_public to anon, authenticated;
```

- [ ] **Step 2: Push**

Run: `npx supabase db push`

- [ ] **Step 3: Verify with a service-role insert, then check both the base table and the view as anon**

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/recommendations" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"date":"2026-06-20","top_pick":"lower_a","runner_up":"mobility","score_breakdown":{"lower_a":8.4,"mobility":7.9},"internal_rationale":"HRV 52ms, readiness 7/10, no lower session in 3 days","public_rationale":"Your recovery looks solid today, so it is a good day for a lower-body session."}'
```
Expected: returns the inserted row.

```bash
curl -s "$SUPABASE_URL/rest/v1/recommendations?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `[]` (base table stays private)

```bash
curl -s "$SUPABASE_URL/rest/v1/recommendations_public?select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: one row, containing only `date`, `top_pick`, `runner_up`, `public_rationale`, `generated_at` — no `score_breakdown` or `internal_rationale` keys present at all.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add recommendations table and recommendations_public view"
```

---

### Task 8: Migration — sessions table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_sessions.sql`

**Interfaces:**
- Consumes: `session_type` enum (Task 4), `recommendations(id)` (Task 7)
- Produces: table `sessions(id, date, type session_type, recommendation_id, duration_minutes, notes, created_at)`, service-role-only

- [ ] **Step 1: Generate and write the migration**

Run: `npx supabase migration new create_sessions`

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type session_type not null,
  recommendation_id uuid references recommendations(id) on delete set null,
  duration_minutes integer,
  notes text,
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;

-- Deliberately no anon/authenticated policies: this is your confirmed
-- training history, part of the private dashboard only.
```

- [ ] **Step 2: Push**

Run: `npx supabase db push`

- [ ] **Step 3: Verify with a service-role insert linked to the recommendation from Task 7, and confirm anon gets nothing**

First, find the recommendation's id:

```bash
curl -s "$SUPABASE_URL/rest/v1/recommendations?select=id&date=eq.2026-06-20" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Use the returned `id` (call it `<rec-id>`) in:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/sessions" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"date":"2026-06-20","type":"lower_a","recommendation_id":"<rec-id>","duration_minutes":55,"notes":"Followed the recommendation, felt strong"}'
```
Expected: returns the inserted row, `recommendation_id` matches `<rec-id>`.

```bash
curl -s "$SUPABASE_URL/rest/v1/sessions?select=date" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `[]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add sessions table linked to recommendations"
```

---

### Task 9: Consolidated schema verification script

**Files:**
- Create: `scripts/verify_schema.sh`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` environment variables (same three values stored in `.env` from Task 3)
- Produces: a repeatable regression check any future phase can re-run after touching the schema

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Verifies the core RLS contract for the Bulletproof schema:
# - exercises and recommendations_public are anon-readable
# - user_profile, recovery, recommendations (base), and sessions are anon-blocked
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY must be set}"

anon_get() {
  curl -s "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY"
}

echo "exercises (expect 17 rows):"
anon_get "exercises?select=name" | python -c "import json,sys; print(len(json.load(sys.stdin)))"

echo "recommendations_public (expect >= 0 rows, no internal columns):"
anon_get "recommendations_public?select=*"

for table in user_profile recovery recommendations sessions; do
  echo "$table (expect []):"
  anon_get "$table?select=*"
done
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x scripts/verify_schema.sh
./scripts/verify_schema.sh
```

Expected: `exercises` prints `17`; `recommendations_public` prints the one seeded row; `user_profile`, `recovery`, `recommendations`, and `sessions` each print `[]`.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify_schema.sh
git commit -m "test: add consolidated schema verification script"
git push
```

Expected: `git push` succeeds against the `origin` remote created in Task 2; all of Phase 0/1's commits are now on GitHub.
