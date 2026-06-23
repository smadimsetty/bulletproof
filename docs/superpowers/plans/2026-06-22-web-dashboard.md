# Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/web/`, a minimal public, read-only, no-login Next.js
site that shows the same two outputs as the mobile app's signed-in screen —
yesterday's recommendation and today's recommendation, sourced exclusively
from the `recommendations_public` view via the Supabase **anon** key — and
deploy it for real to a live GitHub Pages URL via a new GitHub Actions
workflow, using only tools/accounts already available in this environment
(no new paid service, no new account).

**Architecture:** A single Next.js (App Router) page, statically exported
(`output: 'export'`), with two ported library modules
(`apps/web/lib/recommendations.ts`, `apps/web/lib/sessionTypeLabels.ts`)
copied from the already-shipped, already-reviewed
`apps/mobile/lib/recommendations.ts` / `apps/mobile/lib/sessionTypeLabels.ts`
and adapted to a non-React-Native Supabase client
(`apps/web/lib/supabase.ts`, anon key only, no `AsyncStorage`, no auth). The
page fetches client-side on mount (`"use client"` + `useEffect`), mirroring
the mobile app's fetch-on-mount pattern. Deployment is a new
`.github/workflows/deploy-web.yml` using GitHub's own Pages actions — see
`docs/superpowers/specs/2026-06-22-web-dashboard-design.md` for the full
reasoning behind every decision below.

**Tech Stack:** Next.js 16 (App Router, `output: 'export'`), React 19,
TypeScript 6, `@supabase/supabase-js` (same version already pinned in
`apps/mobile/package.json`: `^2.108.2`), Jest + ts-jest for the two ported
lib modules' unit tests, GitHub Actions (`actions/checkout@v4`,
`actions/setup-node@v4`, `actions/configure-pages@v5`,
`actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`).

## Global Constraints

- **Read-only, anon-key-only, no auth anywhere in `apps/web/`.** Every
  Supabase call in this app is `.from('recommendations_public').select(...)`
  — never the base `recommendations` table, never `.insert()`/`.update()`/
  `.upsert()`, never a `supabase.auth.*` call. `apps/web/lib/supabase.ts`
  creates its client from `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` only — the service-role key must never
  appear anywhere under `apps/web/`.
- **No new Supabase migration, RLS policy, or grant.**
  `recommendations_public`'s existing `grant select ... to anon,
  authenticated` (from `supabase/migrations/20260622001542_create_recommendations.sql`,
  finalized in `20260622002432_fix_view_security_and_updated_at_triggers.sql`)
  already covers this app's exact access pattern. This plan touches
  nothing under `supabase/migrations/`.
- **Port, don't import across apps.** `apps/web/lib/recommendations.ts` and
  `apps/web/lib/sessionTypeLabels.ts` are adapted copies of the mobile
  versions, not imports from `apps/mobile/` — there is no monorepo
  workspace tooling configured in this repo (root `package.json` has no
  `workspaces` field) and standing one up is explicitly out of scope (see
  design spec Decision 3). The only adaptation: the mobile version's
  `recommendations.ts` imports `localDateString` from
  `./healthkitMapping` (a React-Native-irrelevant HealthKit module); the
  web port inlines an equivalent local date-formatting helper instead of
  pulling in that module.
- **`NEXT_PUBLIC_` prefix is required on both env vars.** Next.js only
  inlines env vars prefixed `NEXT_PUBLIC_` into the client bundle at build
  time; a static export has no server to read an unprefixed var from at
  request time. Using the bare names (`SUPABASE_URL`, etc., as the engine's
  `.env` does) would silently produce `undefined` in the shipped JS.
- **GitHub Pages project-page subpath:** this repo is `smadimsetty/bulletproof`,
  not `smadimsetty.github.io`, so the deployed site lives under
  `https://smadimsetty.github.io/bulletproof/`, not the domain root.
  `next.config.ts` must set `basePath: '/bulletproof'` and `output:
  'export'` together, or asset references will 404 once deployed (see
  design spec Decision 6).
- **No UI framework dependency.** Plain CSS (a single global stylesheet or
  inline styles), no Tailwind/Chakra/shadcn — one page, two cards.
- **No component/DOM/E2E test tooling added** (no React Testing Library, no
  Playwright config beyond what may already exist for other purposes in
  this repo). Automated verification for this plan is unit tests on the two
  ported lib modules plus `tsc --noEmit` and a successful `next build`
  static export; the deployed page's actual rendered content is checked
  manually against the live URL in the final task (see design spec
  Decision 7).
- **Demo-video links, rep ranges, and a true "what Sohan did yesterday"
  summary are out of scope** — same reasoning as the recommendation-ui
  phase's Decisions 2 and 4: no underlying data exists yet for either
  app to render.
- All `gh` commands in later tasks assume the current branch
  (`pipeline/web-dashboard`) is pushed to `origin` first — `workflow_dispatch`
  and Pages deployment both require the workflow file and the app code to
  exist on a ref GitHub can see.

---

### Task 1: Scaffold `apps/web/` as a Next.js App Router project

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/globals.css`
- Modify: `apps/web/README.md` (replace the stale Netlify placeholder)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task in this plan).
- Produces: a buildable, empty Next.js shell (`npm run build` inside
  `apps/web/` succeeds and produces `apps/web/out/`) that Task 2 onward adds
  real content and data-fetching to. `app/layout.tsx` exports the root
  layout `RootLayout` component that Task 4's `app/page.tsx` renders inside.

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.108.2",
    "next": "^16.2.9",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "jest": "^30.4.2",
    "ts-jest": "^29.4.11",
    "typescript": "^6.0.3"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testPathIgnorePatterns": [
      "/node_modules/",
      "/.next/",
      "/out/"
    ]
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 3: Create `apps/web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 4: Create `apps/web/next.config.ts`**

```ts
// apps/web/next.config.ts
//
// Static export (no Node server at runtime -- ships as plain HTML/CSS/JS,
// see design spec Decision 1) under GitHub Pages' project-page subpath
// (this repo is smadimsetty/bulletproof, not smadimsetty.github.io, so the
// site is served at /bulletproof/, not the domain root -- see design spec
// Decision 6). Both settings must travel together: omitting basePath while
// keeping output: 'export' produces a build whose asset references 404
// once deployed under the subpath.
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/bulletproof',
};

export default nextConfig;
```

- [ ] **Step 5: Create `apps/web/app/layout.tsx`**

```tsx
// apps/web/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bulletproof',
  description:
    "Sohan's daily training recommendation -- an Oura-integrated training engine, read-only public dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create `apps/web/app/globals.css`**

```css
/* apps/web/app/globals.css
 *
 * Minimal, framework-free styling -- one page, two cards, no UI library
 * dependency (see design spec Decision 1).
 */
:root {
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    sans-serif;
  background: #fafafa;
  color: #1c1c1e;
}

main {
  max-width: 640px;
  margin: 0 auto;
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}

p.subtitle {
  margin: 4px 0 0;
  color: #6e6e73;
  font-size: 14px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  border-radius: 12px;
  background: #f2f2f7;
}

.card-label {
  font-size: 13px;
  font-weight: 600;
  color: #6e6e73;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.headline {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}

.runner-up {
  font-size: 15px;
  color: #3a3a3c;
}

.rationale {
  font-size: 15px;
  color: #3a3a3c;
  margin-top: 4px;
  line-height: 1.4;
}

.error-text {
  font-size: 14px;
  color: #b00020;
}
```

- [ ] **Step 7: Replace `apps/web/README.md`**

```md
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
```

- [ ] **Step 8: Install dependencies and confirm an empty build succeeds**

Run (from `apps/web/`): `npm install && npm run build`
Expected: completes with no errors, produces `apps/web/out/index.html`
under the `/bulletproof/` `basePath` (the file path itself is still
`out/index.html`; `basePath` affects URL resolution, not the output
directory's file layout).

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/next.config.ts apps/web/next-env.d.ts apps/web/app/layout.tsx apps/web/app/globals.css apps/web/README.md apps/web/package-lock.json
git commit -m "feat: scaffold apps/web as a statically-exported Next.js app"
```

---

### Task 2: `lib/supabase.ts` — anon-key-only client

**Files:**
- Create: `apps/web/lib/supabase.ts`
- Create: `apps/web/.env.example`
- Modify: `apps/web/.gitignore` (create if absent; mirror `apps/mobile/.gitignore`'s env-file exclusions)

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
  the environment (build-time inlined, per Global Constraints).
- Produces: `supabase` (a configured `SupabaseClient`). Task 3 imports this
  into `lib/recommendations.ts`.

- [ ] **Step 1: Create `apps/web/lib/supabase.ts`**

```ts
// apps/web/lib/supabase.ts
//
// Anon-key-only Supabase client -- no auth, no session persistence, no
// AsyncStorage (unlike apps/mobile/lib/supabase.ts, which configures all
// three for its authenticated Apple Sign-In flow). This app never signs
// in; every request is an anonymous `anon`-role request, which is exactly
// what recommendations_public's `grant select ... to anon` already
// allows. See docs/superpowers/specs/2026-06-22-web-dashboard-design.md
// Decision 2.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Create `apps/web/.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

- [ ] **Step 3: Create `apps/web/.gitignore`**

```
# dependencies
node_modules/

# Next.js
.next/
out/

# local env files
.env.local
.env.*.local

# typescript
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 4: Type-check**

Run (from `apps/web/`): `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/supabase.ts apps/web/.env.example apps/web/.gitignore
git commit -m "feat: add anon-key-only Supabase client for apps/web"
```

---

### Task 3: `lib/recommendations.ts` and `lib/sessionTypeLabels.ts` — ported fetch + label logic

**Files:**
- Create: `apps/web/lib/recommendations.ts`
- Create: `apps/web/lib/recommendations.test.ts`
- Create: `apps/web/lib/sessionTypeLabels.ts`
- Create: `apps/web/lib/sessionTypeLabels.test.ts`

**Interfaces:**
- Consumes: `supabase` from `apps/web/lib/supabase.ts` (Task 2).
- Produces: `SessionType`, `RecommendationPublicRow`,
  `fetchRecommendations(today: Date): Promise<{ today:
  RecommendationPublicRow | null; yesterday: RecommendationPublicRow |
  null }>` from `recommendations.ts`; `SESSION_TYPE_LABELS`,
  `labelForSessionType(type: SessionType): string` from
  `sessionTypeLabels.ts`. Task 4 imports all of these into `app/page.tsx`.

- [ ] **Step 1: Write the failing tests for `recommendations.ts`**

Create `apps/web/lib/recommendations.test.ts` (adapted from
`apps/mobile/lib/recommendations.test.ts` -- same cases, same mock shape,
different module path):

```ts
// apps/web/lib/recommendations.test.ts
import { fetchRecommendations } from './recommendations';

// supabase-js's query builder is chainable (.from().select().in()), so the
// mock needs to return an object whose `.in(...)` resolves to the desired
// `{ data, error }` shape -- mirroring how the real client resolves a
// terminal query call.
jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

function mockSupabaseResponse(data: unknown, error: unknown = null) {
  const inFn = jest.fn().mockResolvedValue({ data, error });
  const selectFn = jest.fn().mockReturnValue({ in: inFn });
  (supabase.from as jest.Mock).mockReturnValue({ select: selectFn });
  return { selectFn, inFn };
}

const TODAY = new Date('2026-06-22T12:00:00Z');
const TODAY_ISO = '2026-06-22';
const YESTERDAY_ISO = '2026-06-21';

const todayRow = {
  date: TODAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper_a',
  public_rationale: "Today's pick is mobility -- a mobility session was overdue. Runner-up: upper a.",
  generated_at: '2026-06-22T11:00:05Z',
};

const yesterdayRow = {
  date: YESTERDAY_ISO,
  top_pick: 'lower_a',
  runner_up: null,
  public_rationale: "Today's pick is lower a -- this keeps your training balanced this week.",
  generated_at: '2026-06-21T11:00:04Z',
};

describe('fetchRecommendations', () => {
  test('returns both rows when both exist', async () => {
    mockSupabaseResponse([todayRow, yesterdayRow]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toEqual(todayRow);
    expect(result.yesterday).toEqual(yesterdayRow);
  });

  test('returns only today when yesterday has no row', async () => {
    mockSupabaseResponse([todayRow]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toEqual(todayRow);
    expect(result.yesterday).toBeNull();
  });

  test('returns only yesterday when today has not generated yet', async () => {
    mockSupabaseResponse([yesterdayRow]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toBeNull();
    expect(result.yesterday).toEqual(yesterdayRow);
  });

  test('returns both null when neither row exists', async () => {
    mockSupabaseResponse([]);

    const result = await fetchRecommendations(TODAY);

    expect(result.today).toBeNull();
    expect(result.yesterday).toBeNull();
  });

  test('queries recommendations_public with exactly the public columns and both dates', async () => {
    const { selectFn, inFn } = mockSupabaseResponse([todayRow, yesterdayRow]);

    await fetchRecommendations(TODAY);

    expect(supabase.from).toHaveBeenCalledWith('recommendations_public');
    expect(selectFn).toHaveBeenCalledWith(
      'date, top_pick, runner_up, public_rationale, generated_at'
    );
    expect(inFn).toHaveBeenCalledWith('date', [TODAY_ISO, YESTERDAY_ISO]);
  });

  test('throws if the query returns an error', async () => {
    mockSupabaseResponse(null, { message: 'network down' });

    await expect(fetchRecommendations(TODAY)).rejects.toThrow('network down');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run (from `apps/web/`): `npx jest lib/recommendations.test.ts`
Expected: fails with a module-not-found error for `./recommendations`.

- [ ] **Step 3: Create `apps/web/lib/recommendations.ts`**

```ts
// apps/web/lib/recommendations.ts
//
// Fetches today's and yesterday's rows from the recommendations_public
// view -- never the base recommendations table, which also carries
// internal_rationale/score_breakdown (private biometric-derived fields,
// per CLAUDE.md's public/private split). Ported from
// apps/mobile/lib/recommendations.ts (same query shape, same
// date-matching logic) -- see
// docs/superpowers/specs/2026-06-22-web-dashboard-design.md Decision 3 for
// why this is a port rather than a shared import, and
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decisions
// 6-7 for the original reasoning behind querying by exact date and
// combining both rows into one request.
import { supabase } from './supabase';

export type SessionType =
  | 'upper_a'
  | 'upper_b'
  | 'lower_a'
  | 'lower_b'
  | 'pickleball'
  | 'run'
  | 'rest'
  | 'mobility';

export type RecommendationPublicRow = {
  date: string;
  top_pick: SessionType;
  runner_up: SessionType | null;
  public_rationale: string;
  generated_at: string;
};

export type RecommendationsResult = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
};

/**
 * Local calendar date (YYYY-MM-DD) in the browser's current timezone --
 * matches Postgres `date` column semantics (a single day, not a
 * UTC-anchored instant). Inlined here rather than imported from a shared
 * module: the mobile app's equivalent (`localDateString` in
 * `apps/mobile/lib/healthkitMapping.ts`) lives in a HealthKit-specific
 * file that has no web equivalent and shouldn't be ported wholesale just
 * for this one helper.
 */
function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetches the recommendations_public rows for `today` and the day before
 * it in a single query, then splits the result by exact date match --
 * "today" means date = today, not "most recent row", so a late/missing
 * cron run shows an explicit not-yet-generated state instead of silently
 * relabeling an older row as today's.
 */
export async function fetchRecommendations(today: Date): Promise<RecommendationsResult> {
  const todayIso = localDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localDateString(yesterday);

  const { data, error } = await supabase
    .from('recommendations_public')
    .select('date, top_pick, runner_up, public_rationale, generated_at')
    .in('date', [todayIso, yesterdayIso]);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RecommendationPublicRow[];

  return {
    today: rows.find((row) => row.date === todayIso) ?? null,
    yesterday: rows.find((row) => row.date === yesterdayIso) ?? null,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run (from `apps/web/`): `npx jest lib/recommendations.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Write the failing tests for `sessionTypeLabels.ts`**

Create `apps/web/lib/sessionTypeLabels.test.ts` (identical cases to
`apps/mobile/lib/sessionTypeLabels.test.ts`):

```ts
// apps/web/lib/sessionTypeLabels.test.ts
import { SESSION_TYPE_LABELS, labelForSessionType } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

const ALL_SESSION_TYPES: SessionType[] = [
  'upper_a',
  'upper_b',
  'lower_a',
  'lower_b',
  'pickleball',
  'run',
  'rest',
  'mobility',
];

describe('SESSION_TYPE_LABELS', () => {
  test('has a defined, non-empty label for every session_type enum value', () => {
    for (const type of ALL_SESSION_TYPES) {
      expect(SESSION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  test('produces the expected friendly names', () => {
    expect(SESSION_TYPE_LABELS.upper_a).toBe('Upper Body A');
    expect(SESSION_TYPE_LABELS.upper_b).toBe('Upper Body B');
    expect(SESSION_TYPE_LABELS.lower_a).toBe('Lower Body A');
    expect(SESSION_TYPE_LABELS.lower_b).toBe('Lower Body B');
    expect(SESSION_TYPE_LABELS.pickleball).toBe('Pickleball');
    expect(SESSION_TYPE_LABELS.run).toBe('Run');
    expect(SESSION_TYPE_LABELS.rest).toBe('Rest');
    expect(SESSION_TYPE_LABELS.mobility).toBe('Mobility');
  });
});

describe('labelForSessionType', () => {
  test('returns the mapped label for a known type', () => {
    expect(labelForSessionType('mobility')).toBe('Mobility');
  });

  test('falls back to Unknown for a value outside the known union', () => {
    expect(labelForSessionType('not_a_real_type' as SessionType)).toBe('Unknown');
  });
});
```

- [ ] **Step 6: Run the tests and confirm they fail**

Run (from `apps/web/`): `npx jest lib/sessionTypeLabels.test.ts`
Expected: fails with a module-not-found error for `./sessionTypeLabels`.

- [ ] **Step 7: Create `apps/web/lib/sessionTypeLabels.ts`**

```ts
// apps/web/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Ported verbatim from
// apps/mobile/lib/sessionTypeLabels.ts -- deliberately a small static
// lookup separate from engine/rationale.py's own casual in-sentence
// "upper_a" -> "upper a" replacement, which is the rationale sentence's
// phrasing, not this screen's headline label. See
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decision 3.
import type { SessionType } from './recommendations';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  upper_a: 'Upper Body A',
  upper_b: 'Upper Body B',
  lower_a: 'Lower Body A',
  lower_b: 'Lower Body B',
  pickleball: 'Pickleball',
  run: 'Run',
  rest: 'Rest',
  mobility: 'Mobility',
};

// Falls back to 'Unknown' rather than returning undefined: recommendations.ts
// casts raw Supabase JSON to RecommendationPublicRow with no runtime
// validation, so a session_type value that drifts ahead of the SessionType
// union must still render as real text, not the literal string "undefined".
export function labelForSessionType(type: SessionType): string {
  return SESSION_TYPE_LABELS[type] ?? 'Unknown';
}
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run (from `apps/web/`): `npx jest lib/sessionTypeLabels.test.ts`
Expected: `4 passed`.

- [ ] **Step 9: Type-check**

Run (from `apps/web/`): `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/recommendations.ts apps/web/lib/recommendations.test.ts apps/web/lib/sessionTypeLabels.ts apps/web/lib/sessionTypeLabels.test.ts
git commit -m "feat: port recommendations fetch and session-type labels to apps/web"
```

---

### Task 4: `app/page.tsx` — render the dashboard

**Files:**
- Create: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `fetchRecommendations`, `RecommendationPublicRow` from
  `apps/web/lib/recommendations.ts` (Task 3); `labelForSessionType` from
  `apps/web/lib/sessionTypeLabels.ts` (Task 3); `RootLayout` from
  `apps/web/app/layout.tsx` (Task 1, consumed implicitly by the App Router).
- Produces: the site's only route (`/`), rendering both cards or the
  not-yet-generated placeholder. No other module consumes this file's
  exports (it's the app's root page).

- [ ] **Step 1: Create `apps/web/app/page.tsx`**

```tsx
// apps/web/app/page.tsx
//
// The dashboard's only page: today's and yesterday's recommendations,
// fetched client-side on mount against the public recommendations_public
// view (anon key, no auth -- see
// docs/superpowers/specs/2026-06-22-web-dashboard-design.md). Mirrors the
// mobile app's App.tsx rendering structure and copy (same two-card layout,
// same "hasn't generated yet" placeholder) so the two surfaces present the
// same two outputs consistently.
'use client';

import { useEffect, useState } from 'react';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';
import { labelForSessionType } from '../lib/sessionTypeLabels';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: RecommendationsState = {
  today: null,
  yesterday: null,
  loading: true,
  error: null,
};

export default function Page() {
  const [recommendations, setRecommendations] = useState<RecommendationsState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    fetchRecommendations(new Date())
      .then((result) => {
        if (cancelled) return;
        setRecommendations({
          today: result.today,
          yesterday: result.yesterday,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRecommendations((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load recommendations',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <header>
        <h1>Bulletproof</h1>
        <p className="subtitle">A daily, Oura-integrated training recommendation.</p>
      </header>

      {recommendations.loading && <p>Loading today&rsquo;s recommendation&hellip;</p>}

      {recommendations.error && (
        <p className="error-text">Couldn&rsquo;t load recommendations: {recommendations.error}</p>
      )}

      {!recommendations.loading && !recommendations.error && (
        <>
          {recommendations.yesterday && (
            <section className="card">
              <span className="card-label">Yesterday</span>
              <h2 className="headline">{labelForSessionType(recommendations.yesterday.top_pick)}</h2>
              <p className="rationale">{recommendations.yesterday.public_rationale}</p>
            </section>
          )}

          <section className="card">
            <span className="card-label">Today</span>
            {recommendations.today ? (
              <>
                <h2 className="headline">{labelForSessionType(recommendations.today.top_pick)}</h2>
                {recommendations.today.runner_up && (
                  <p className="runner-up">
                    Runner-up: {labelForSessionType(recommendations.today.runner_up)}
                  </p>
                )}
                <p className="rationale">{recommendations.today.public_rationale}</p>
              </>
            ) : (
              <p className="rationale">
                Today&rsquo;s recommendation hasn&rsquo;t generated yet &mdash; check back this morning.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web/`): `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Static export build**

Run (from `apps/web/`): `npm run build`
Expected: completes with no errors; `apps/web/out/index.html` exists.

- [ ] **Step 4: Local manual verification against the live Supabase project**

Create a local `apps/web/.env.local` (not committed, excluded by Task 2's
`.gitignore`) with the real `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` values (same project the mobile app already
points at). Run (from `apps/web/`): `npm run dev`, open
`http://localhost:3000/bulletproof/` in a browser.
Expected: the page loads, shows either real `top_pick`/`runner_up`/
`public_rationale` text from the live `recommendations_public` view, or the
"hasn't generated yet" placeholder if today's row doesn't exist yet — same
content shape already verified live in the mobile app per
`docs/superpowers/reports/autonomous-build-log.md`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat: render today's and yesterday's recommendations on the web dashboard"
```

---

### Task 5: `.github/workflows/deploy-web.yml` — automated GitHub Pages deploy

**Files:**
- Create: `.github/workflows/deploy-web.yml`

**Interfaces:**
- Consumes: `apps/web/package.json`'s `build` script (Task 1); repository
  variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (set in Task 6, before this workflow can succeed end-to-end).
- Produces: a GitHub Actions workflow named `Deploy Web Dashboard`,
  triggerable by `gh workflow run deploy-web.yml --ref <branch>` or
  automatically on push to `master`/`main` touching `apps/web/**`. Task 6
  triggers and verifies this workflow's actual run.

- [ ] **Step 1: Create `.github/workflows/deploy-web.yml`**

```yaml
name: Deploy Web Dashboard

on:
  push:
    branches: [master, main]
    paths:
      - "apps/web/**"
      - ".github/workflows/deploy-web.yml"
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: apps/web/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build static export
        run: npm run build

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/web/out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Note: `actions/upload-pages-artifact` and `actions/deploy-pages` both
require the artifact upload to happen before the separate `deploy` job
runs; since `upload-pages-artifact` uploads a workflow artifact (not a job
output), splitting into two jobs (`build` uploads, `deploy` consumes via
`needs: build`) matches GitHub's own documented Pages-deploy pattern and
lets the `environment: github-pages` block show the live URL in the GitHub
UI after a successful run.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-web.yml
git commit -m "feat: add GitHub Pages deploy workflow for apps/web"
```

---

### Task 6: Configure repository variables, enable Pages, and verify the live deploy

**Files:** none (repository configuration + verification only).

**Interfaces:**
- Consumes: the workflow from Task 5, the build from Tasks 1-4.
- Produces: a live, publicly reachable URL serving real content. Final
  task in this plan — no downstream consumer.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin pipeline/web-dashboard
```

- [ ] **Step 2: Set the two repository variables (not secrets — see design spec Decision 5: the anon key is intentionally public)**

```bash
gh variable set NEXT_PUBLIC_SUPABASE_URL --body "<the same value already used in apps/mobile/.env.local or EXPO_PUBLIC_SUPABASE_URL>"
gh variable set NEXT_PUBLIC_SUPABASE_ANON_KEY --body "<the same value already used in apps/mobile/.env.local or EXPO_PUBLIC_SUPABASE_ANON_KEY>"
```

Expected: both commands succeed (`gh variable list` shows both names).

- [ ] **Step 3: Enable GitHub Pages with "GitHub Actions" as the build source, if not already enabled**

```bash
gh api repos/smadimsetty/bulletproof/pages -X POST -f build_type=workflow 2>&1 || \
  gh api repos/smadimsetty/bulletproof/pages -X PUT -f build_type=workflow
```

Expected: either call succeeds (`POST` if Pages was never configured on
this repo before, `PUT` to update the existing configuration if `POST`
fails because Pages is already enabled with a different source). Confirm
with: `gh api repos/smadimsetty/bulletproof/pages` and check
`"build_type": "workflow"`.

- [ ] **Step 4: Trigger the deploy workflow**

```bash
gh workflow run deploy-web.yml --ref pipeline/web-dashboard
gh run watch
```

Expected: both the `build` and `deploy` jobs complete successfully (green
run in `gh run watch`'s output).

- [ ] **Step 5: Verify the live URL**

```bash
curl -sL https://smadimsetty.github.io/bulletproof/ | grep -o '<title>[^<]*</title>'
```

Expected: prints `<title>Bulletproof</title>` (or similar — confirms the
static shell is actually being served, not a 404). Then open
`https://smadimsetty.github.io/bulletproof/` in a browser and confirm the
client-side fetch renders real `top_pick`/`runner_up`/`public_rationale`
text (or the honest not-yet-generated placeholder) from the live
`recommendations_public` view — this part cannot be automated via `curl`
alone since the data fetch happens in the browser after the static HTML
loads, the same class of limitation already accepted for the mobile app's
TestFlight verification step.

- [ ] **Step 6: Update root `README.md`'s Status section**

Per the user's standing "keep docs updated" instruction
(`feedback_keep_docs_updated.md`): add a line noting the web dashboard is
live at the GitHub Pages URL, completing backlog item 6 of the autonomous
build pipeline.

- [ ] **Step 7: Commit the README update**

```bash
git add README.md
git commit -m "docs: note web dashboard live at GitHub Pages URL"
git push
```

---

**End state after this plan:** `apps/web/` is a statically-exported
Next.js site, deployed automatically on every push to `apps/web/**` via
`.github/workflows/deploy-web.yml`, live at
`https://smadimsetty.github.io/bulletproof/` — a real, working, publicly
reachable URL requiring no new paid account (GitHub Pages is free for this
already-public repo, configured entirely through `gh`). The page shows
exactly the two outputs CLAUDE.md describes (yesterday's and today's
recommendation), reading only the `recommendations_public` view through
the public anon key, with the same honest "hasn't generated yet" placeholder
behavior already shipped in the mobile app. Pointing a custom/personal-site
domain at this content remains an explicit manual follow-up, deferred
because it requires DNS/domain access this pipeline doesn't have.
