# Home screen (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 3 Home tab stub
(`apps/mobile/app/(tabs)/index.tsx`) with real content per
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s "Phase 5 —
Home" subsection and the fuller detail in
`docs/superpowers/specs/2026-06-24-home-screen-design.md`: a Yesterday
summary card reading the already-generated `public_rationale` column (no
new Claude call of any kind), a Today's Program card rendering every
`recommendation_blocks` row in order with its
`recommendation_block_exercises`, tappable into `app/logger/[blockId]`, a
"Swap activity" UI shell that visibly states swapping isn't available yet
(no real backend exists for it — `build_program_for_activity` was
deliberately deferred out of the engine v2 phase), and a free-text
daily-feedback box writing to `daily_feedback`. Also fixes a pre-existing
bug: `apps/mobile/lib/recommendations.ts`'s `SessionType` union and
`apps/mobile/lib/sessionTypeLabels.ts`'s label map still list the dropped
v1 enum values (`upper_a`/`upper_b`/`lower_a`/`lower_b`) instead of the live
`upper | lower | pickleball | run | rest | mobility` enum.

**Architecture:** A new `apps/mobile/lib/homeProgram.ts` owns a single
`fetchHomeData(today: Date)` that queries the base `recommendations` table
(not the public view — the public view excludes `id`, which
`recommendation_blocks.recommendation_id` needs) plus its blocks and each
block's exercises (joined to `exercises` for display fields) in one
Supabase call via a nested select, alongside a second minimal query for
yesterday's `public_rationale`. `index.tsx` becomes the screen-level
container: loads via `fetchHomeData` plus a small parallel fetch of
`user_profile.preferred_split`/`split_taxonomy`/`activity_taxonomy` for the
swap-picker shell, owns the feedback-box draft state, and renders three
sections (Yesterday card, Today's Program card with a per-block "Swap
activity" affordance, daily feedback box). A small local
`SwapActivitySheet` component (kept in `index.tsx`, not extracted to
`components/` — nothing else needs it yet) renders the grouped picker
modal. `app/_layout.tsx`'s existing `fetchRecommendations`/`recommendations`
state is left untouched (Decision 1 in the design spec) — Home stops
reading it and fetches its own data instead.

**Tech Stack:** Expo SDK ~56, Expo Router, React Native 0.85, TypeScript
(strict mode), Jest (existing `lib/*.test.ts` suite, extended not
replaced), `@supabase/supabase-js` (existing dependency — uses its nested
embedded-resource select syntax, no new package).

## Global Constraints

- **No new Supabase migration.** Every table/column this plan reads or
  writes (`recommendations`, `recommendation_blocks`,
  `recommendation_block_exercises`, `exercises`, `daily_feedback`,
  `user_profile.preferred_split`, `split_taxonomy`, `activity_taxonomy`)
  already exists and is already RLS-protected. Do not write any `.sql`
  file in this plan.
- **No new npm package.** Every import this plan needs
  (`@supabase/supabase-js`'s nested select, React Native's built-in
  `Linking`, `TextInput`, `Modal`) is already available via existing
  dependencies.
- **No client-side Claude/Anthropic call of any kind, anywhere in this
  plan.** Yesterday's summary is `recommendations.public_rationale`, read
  directly — never regenerated, paraphrased, or re-requested from any LLM
  by the mobile app.
- **No real swap-activity backend.** The "Swap activity" picker is a UI
  shell only. Selecting any option must show the inline message
  `"Swapping isn't available yet — this is coming in a future update."`
  and perform no Supabase write, no navigation, and no call to any
  nonexistent endpoint. This is a deliberate, documented phase-5 gap.
- **No new RN component-render test framework.** Verification bar for
  every task: `npx tsc --noEmit` from `apps/mobile/` (clean compile) plus
  `npm test --prefix apps/mobile` (Jest — existing suite stays green, new
  pure-logic tests added for every new pure function). UI/screen
  components get no automated test — manual verification only, same
  precedent as the nav and settings phases.
- **Visual styling uses `apps/mobile/lib/theme.ts`'s exported constants**
  (`COLORS`, `SPACING`, `RADII`, `TYPE`, `sharedStyles`) and plain
  `StyleSheet.create` — no new styling library.
- **`prescribed_reps`/`prescribed_weight_note` render as opaque text,
  never parsed** — confirmed live data has mixed formats
  (`"10 reps/side"`, `"30-45s hold"`) in the same block.
- **A block exercise's `demo_video_url` link only renders when non-null.**
  No disabled/greyed-out placeholder for the null case (confirmed the
  common case in live data, not an edge case).
- **Tapping a block navigates via `router.push('/logger/[blockId]')` using
  `recommendation_blocks.id`** — matches the existing stub's
  `useLocalSearchParams<{ blockId: string }>()` contract exactly.
- **Commit after every task**, matching the existing per-task commit
  convention visible in `git log`.
- **Work happens in the worktree at `C:\Dev\bulletproof-home-screen` on
  branch `pipeline/home-screen`** — do not touch the main checkout at
  `C:\Dev\Bulletproof`.

---

### Task 1: Fix the stale `SessionType` enum in `lib/recommendations.ts` and `lib/sessionTypeLabels.ts`

**Files:**
- Modify: `apps/mobile/lib/recommendations.ts`
- Modify: `apps/mobile/lib/sessionTypeLabels.ts`
- Modify: `apps/mobile/lib/sessionTypeLabels.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks (first task, fixes pre-existing code).
- Produces: a corrected `SessionType` union (`upper | lower | pickleball |
  run | rest | mobility`) and `SESSION_TYPE_LABELS` map, consumed by Task 2
  (`homeProgram.ts`'s `block_type` typing reuses `SessionType`) and Task 3
  (`index.tsx`'s rendering of `top_pick`/`runner_up`/block-type labels via
  `labelForSessionType`).

- [ ] **Step 1: update the failing label-map test first**

Replace the full contents of `apps/mobile/lib/sessionTypeLabels.test.ts`:

```ts
// apps/mobile/lib/sessionTypeLabels.test.ts
import { labelForSessionType } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

describe('labelForSessionType', () => {
  test.each<[SessionType, string]>([
    ['upper', 'Upper Body'],
    ['lower', 'Lower Body'],
    ['pickleball', 'Pickleball'],
    ['run', 'Run'],
    ['rest', 'Rest'],
    ['mobility', 'Mobility'],
  ])('labels %s as %s', (type, expected) => {
    expect(labelForSessionType(type)).toBe(expected);
  });

  test('falls back to Unknown for a value outside the live enum', () => {
    expect(labelForSessionType('upper_a' as SessionType)).toBe('Unknown');
  });
});
```

Run `npm test --prefix apps/mobile -- sessionTypeLabels` from the repo
root. Expected: fails, because `sessionTypeLabels.ts` still maps
`upper_a`/`upper_b`/`lower_a`/`lower_b` and has no `upper`/`lower` keys.

- [ ] **Step 2: fix `apps/mobile/lib/recommendations.ts`'s `SessionType` union**

In `apps/mobile/lib/recommendations.ts`, replace the `SessionType` type
definition:

```ts
export type SessionType =
  | 'upper'
  | 'lower'
  | 'pickleball'
  | 'run'
  | 'rest'
  | 'mobility';
```

(Replaces the existing `upper_a | upper_b | lower_a | lower_b | pickleball
| run | rest | mobility` union. No other line in this file changes — the
query, the `RecommendationPublicRow`/`RecommendationsResult` shapes, and
`fetchRecommendations`'s body are all unaffected by this type-only fix.)

- [ ] **Step 3: fix `apps/mobile/lib/sessionTypeLabels.ts`'s label map**

Replace the full contents of `apps/mobile/lib/sessionTypeLabels.ts`:

```ts
// apps/mobile/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Deliberately a small
// static lookup separate from engine/rationale.py's own casual in-sentence
// "upper_a" -> "upper a" replacement -- this is the screen's headline
// label, not the rationale sentence. See design spec Decision 3.
//
// Corrected 2026-06-24 (Phase 5 / home-screen-design.md): the previous
// version of this map still listed the v1 enum's upper_a/upper_b/lower_a/
// lower_b values, which supabase/migrations/20260623143000_simplify_
// session_type_enum.sql dropped in favor of bare upper/lower weeks earlier.
// Home is the first screen to actually render a label derived from this
// map, which is what surfaced the drift.
import type { SessionType } from './recommendations';

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  upper: 'Upper Body',
  lower: 'Lower Body',
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

- [ ] **Step 4: run the full existing suite and `tsc`**

```bash
npm test --prefix apps/mobile
npx tsc --noEmit -p apps/mobile
```

Expected: all tests pass (including the new `sessionTypeLabels.test.ts`
cases and the still-passing `recommendations.test.ts`, which mocks raw
string literals like `'mobility'`/`'upper_a'` and is unaffected by a
type-only union change since Jest doesn't enforce TS types at runtime —
confirm by reading its test data: it uses `'lower_a'`/`'upper_a'` as mock
*data* values, which remain valid JS strings even though they're no longer
valid `SessionType` values; this is fine, since the test only asserts the
function returns what the mock returned, it doesn't type-check the mock).
Clean `tsc` compile.

- [ ] **Step 5: commit**

```bash
git add apps/mobile/lib/recommendations.ts apps/mobile/lib/sessionTypeLabels.ts apps/mobile/lib/sessionTypeLabels.test.ts
git commit -m "fix: correct SessionType enum and labels to match the live v2 session_type values"
```

---

### Task 2: `lib/homeProgram.ts` — fetch today's full program and yesterday's summary

**Files:**
- Create: `apps/mobile/lib/homeProgram.ts`
- Create: `apps/mobile/lib/homeProgram.test.ts`

**Interfaces:**
- Consumes: `apps/mobile/lib/supabase.ts` (the shared client),
  `apps/mobile/lib/healthkitMapping.ts`'s `localDateString` (existing
  local-date helper, reused exactly as `recommendations.ts` does),
  `SessionType` from Task 1's corrected `recommendations.ts`.
- Produces: `fetchHomeData(today: Date): Promise<HomeData>`, plus exported
  types `RecommendationSummary`, `ProgramBlock`, `BlockExercise`,
  `HomeData`, consumed by Task 3 (`index.tsx`).

- [ ] **Step 1: write the failing test first**

Create `apps/mobile/lib/homeProgram.test.ts`:

```ts
// apps/mobile/lib/homeProgram.test.ts
import { fetchHomeData } from './homeProgram';

// supabase-js's query builder is chainable; this mock provides a minimal
// per-table chain matching exactly the calls fetchHomeData makes, mirroring
// recommendations.test.ts's existing mocking convention.
jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const TODAY = new Date(2026, 5, 24, 12, 0, 0); // 2026-06-24 local noon
const TODAY_ISO = '2026-06-24';
const YESTERDAY_ISO = '2026-06-23';

const todayRecommendationRow = {
  id: 'rec-today-1',
  date: TODAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper',
  public_rationale: "Today's program covers: mobility.",
};

const yesterdayRecommendationRow = {
  id: 'rec-yesterday-1',
  date: YESTERDAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper',
  public_rationale: "Today's pick is mobility -- a mobility session was overdue. Runner-up: upper a.",
};

const blocksWithExercisesRow = [
  {
    id: 'block-1',
    block_order: 0,
    block_type: 'mobility',
    split_day_label: null,
    title: 'Mobility',
    estimated_minutes: null,
    recommendation_block_exercises: [
      {
        id: 'bex-1',
        exercise_order: 0,
        prescribed_sets: 3,
        prescribed_reps: '10 reps/side',
        prescribed_weight_note: null,
        is_unilateral_left_first: true,
        notes: null,
        exercises: {
          id: 'ex-1',
          name: 'Weighted Ankle Dorsiflexion Mobilization',
          demo_video_url: null,
          exercise_type: 'mobility_stretch',
        },
      },
      {
        id: 'bex-2',
        exercise_order: 1,
        prescribed_sets: 3,
        prescribed_reps: '8-10 reps/side',
        prescribed_weight_note: null,
        is_unilateral_left_first: true,
        notes: null,
        exercises: {
          id: 'ex-2',
          name: 'Half-Kneeling Ankle Mobilization',
          demo_video_url: 'https://www.youtube.com/watch?v=Hm_Iu72bJJg',
          exercise_type: 'mobility_stretch',
        },
      },
    ],
  },
];

function mockTable(table: string, response: { data: unknown; error: unknown }) {
  return [table, response] as const;
}

function installSupabaseMock(responses: ReadonlyArray<readonly [string, { data: unknown; error: unknown }]>) {
  const byTable = new Map(responses);
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const response = byTable.get(table) ?? { data: null, error: null };
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      order: jest.fn(() => chain),
      maybeSingle: jest.fn(() => Promise.resolve(response)),
      then: (resolve: any) => Promise.resolve(response).then(resolve),
    };
    return chain;
  });
}

describe('fetchHomeData', () => {
  test('returns today\'s program with blocks/exercises and yesterday\'s rationale', async () => {
    installSupabaseMock([
      mockTable('recommendations', { data: todayRecommendationRow, error: null }),
    ]);
    // Two sequential calls to 'recommendations' (today, then yesterday) and
    // one to 'recommendation_blocks' can't share one static mock keyed only
    // by table name, so this test drives the real call sequence explicitly.
    const fromMock = supabase.from as jest.Mock;
    let recommendationsCallCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        recommendationsCallCount += 1;
        const row = recommendationsCallCount === 1 ? todayRecommendationRow : yesterdayRecommendationRow;
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: row, error: null })),
        };
        return chain;
      }
      if (table === 'recommendation_blocks') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          order: jest.fn(() => Promise.resolve({ data: blocksWithExercisesRow, error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today).not.toBeNull();
    expect(result.today!.recommendationId).toBe('rec-today-1');
    expect(result.today!.topPick).toBe('mobility');
    expect(result.today!.blocks).toHaveLength(1);
    expect(result.today!.blocks[0].title).toBe('Mobility');
    expect(result.today!.blocks[0].exercises).toHaveLength(2);
    expect(result.today!.blocks[0].exercises[0].name).toBe('Weighted Ankle Dorsiflexion Mobilization');
    expect(result.today!.blocks[0].exercises[0].demoVideoUrl).toBeNull();
    expect(result.today!.blocks[0].exercises[1].demoVideoUrl).toBe(
      'https://www.youtube.com/watch?v=Hm_Iu72bJJg'
    );
    expect(result.yesterdayRationale).toBe(yesterdayRecommendationRow.public_rationale);
  });

  test('returns nulls when today has no recommendation row yet', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today).toBeNull();
    expect(result.yesterdayRationale).toBeNull();
  });

  test('today recommendation with zero blocks returns an empty blocks array, not an error', async () => {
    const fromMock = supabase.from as jest.Mock;
    let recommendationsCallCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        recommendationsCallCount += 1;
        const row = recommendationsCallCount === 1 ? todayRecommendationRow : null;
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: row, error: null })),
        };
        return chain;
      }
      if (table === 'recommendation_blocks') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          order: jest.fn(() => Promise.resolve({ data: [], error: null })),
        };
        return chain;
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await fetchHomeData(TODAY);

    expect(result.today).not.toBeNull();
    expect(result.today!.blocks).toEqual([]);
  });

  test('throws if the recommendation query returns an error', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: { message: 'network down' } })),
      };
      return chain;
    });

    await expect(fetchHomeData(TODAY)).rejects.toThrow('network down');
  });
});
```

Run `npm test --prefix apps/mobile -- homeProgram` from the repo root.
Expected: fails with a module-not-found error (`homeProgram.ts` doesn't
exist yet).

- [ ] **Step 2: create `apps/mobile/lib/homeProgram.ts`**

```ts
// apps/mobile/lib/homeProgram.ts
//
// Fetches today's full multi-block program (recommendation_blocks +
// recommendation_block_exercises, joined to exercises for display fields)
// plus yesterday's already-generated public_rationale, for the Home
// screen. Deliberately queries the base `recommendations` table, not
// `recommendations_public` -- the public view excludes `id`, which
// `recommendation_blocks.recommendation_id` needs to join against, and an
// authenticated screen reading its own RLS-scoped row is exactly what the
// base table's `owner_read_recommendations` policy is for. See
// docs/superpowers/specs/2026-06-24-home-screen-design.md Decision 1/2/3.
//
// No client-side Claude call of any kind happens here or anywhere in this
// module -- `yesterdayRationale` is read verbatim from the `recommendations`
// row the nightly engine already wrote.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import type { SessionType } from './recommendations';

export interface BlockExercise {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly prescribedSets: number | null;
  readonly prescribedReps: string | null;
  readonly prescribedWeightNote: string | null;
  readonly isUnilateralLeftFirst: boolean;
  readonly notes: string | null;
  readonly demoVideoUrl: string | null;
}

export interface ProgramBlock {
  readonly id: string;
  readonly order: number;
  readonly blockType: SessionType;
  readonly splitDayLabel: string | null;
  readonly title: string;
  readonly estimatedMinutes: number | null;
  readonly exercises: readonly BlockExercise[];
}

export interface TodayProgram {
  readonly recommendationId: string;
  readonly date: string;
  readonly topPick: SessionType;
  readonly runnerUp: SessionType | null;
  readonly publicRationale: string;
  readonly blocks: readonly ProgramBlock[];
}

export interface HomeData {
  readonly today: TodayProgram | null;
  readonly yesterdayRationale: string | null;
}

interface RawRecommendationRow {
  id: string;
  date: string;
  top_pick: SessionType;
  runner_up: SessionType | null;
  public_rationale: string;
}

interface RawBlockExerciseRow {
  id: string;
  exercise_order: number;
  prescribed_sets: number | null;
  prescribed_reps: string | null;
  prescribed_weight_note: string | null;
  is_unilateral_left_first: boolean;
  notes: string | null;
  exercises: {
    id: string;
    name: string;
    demo_video_url: string | null;
    exercise_type: string | null;
  } | null;
}

interface RawBlockRow {
  id: string;
  block_order: number;
  block_type: SessionType;
  split_day_label: string | null;
  title: string;
  estimated_minutes: number | null;
  recommendation_block_exercises: RawBlockExerciseRow[];
}

async function fetchRecommendationRow(dateIso: string): Promise<RawRecommendationRow | null> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('id, date, top_pick, runner_up, public_rationale')
    .eq('date', dateIso)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RawRecommendationRow | null) ?? null;
}

async function fetchBlocksWithExercises(recommendationId: string): Promise<ProgramBlock[]> {
  const { data, error } = await supabase
    .from('recommendation_blocks')
    .select(
      `id, block_order, block_type, split_day_label, title, estimated_minutes,
       recommendation_block_exercises (
         id, exercise_order, prescribed_sets, prescribed_reps, prescribed_weight_note,
         is_unilateral_left_first, notes,
         exercises:exercise_id ( id, name, demo_video_url, exercise_type )
       )`
    )
    .eq('recommendation_id', recommendationId)
    .order('block_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as RawBlockRow[];

  return rows.map((block) => ({
    id: block.id,
    order: block.block_order,
    blockType: block.block_type,
    splitDayLabel: block.split_day_label,
    title: block.title,
    estimatedMinutes: block.estimated_minutes,
    exercises: [...block.recommendation_block_exercises]
      .sort((a, b) => a.exercise_order - b.exercise_order)
      .map((exercise) => ({
        id: exercise.id,
        order: exercise.exercise_order,
        name: exercise.exercises?.name ?? 'Unknown exercise',
        prescribedSets: exercise.prescribed_sets,
        prescribedReps: exercise.prescribed_reps,
        prescribedWeightNote: exercise.prescribed_weight_note,
        isUnilateralLeftFirst: exercise.is_unilateral_left_first,
        notes: exercise.notes,
        demoVideoUrl: exercise.exercises?.demo_video_url ?? null,
      })),
  }));
}

/**
 * Fetches everything the Home screen needs to render today's program and
 * yesterday's summary, in one call. `today` is resolved to its local
 * calendar date (matching `recommendations.ts`'s existing local-date
 * convention) -- this is a single screen-level fetch, not three independent
 * ones, per design spec Decision 2.
 */
export async function fetchHomeData(today: Date): Promise<HomeData> {
  const todayIso = localDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localDateString(yesterday);

  const todayRow = await fetchRecommendationRow(todayIso);

  if (!todayRow) {
    return { today: null, yesterdayRationale: null };
  }

  const [blocks, yesterdayRow] = await Promise.all([
    fetchBlocksWithExercises(todayRow.id),
    fetchRecommendationRow(yesterdayIso),
  ]);

  return {
    today: {
      recommendationId: todayRow.id,
      date: todayRow.date,
      topPick: todayRow.top_pick,
      runnerUp: todayRow.runner_up,
      publicRationale: todayRow.public_rationale,
      blocks,
    },
    yesterdayRationale: yesterdayRow?.public_rationale ?? null,
  };
}
```

- [ ] **Step 3: run the test, confirm it passes**

```bash
npm test --prefix apps/mobile -- homeProgram
```

Expected: all 4 cases pass.

- [ ] **Step 4: run the full suite and `tsc`**

```bash
npm test --prefix apps/mobile
npx tsc --noEmit -p apps/mobile
```

Expected: full suite green, clean compile.

- [ ] **Step 5: commit**

```bash
git add apps/mobile/lib/homeProgram.ts apps/mobile/lib/homeProgram.test.ts
git commit -m "feat: add homeProgram.ts to fetch today's full program and yesterday's rationale"
```

---

### Task 3: `lib/programDisplay.ts` — pure formatting helpers

**Files:**
- Create: `apps/mobile/lib/programDisplay.ts`
- Create: `apps/mobile/lib/programDisplay.test.ts`

**Interfaces:**
- Consumes: `BlockExercise` type from Task 2's `homeProgram.ts`.
- Produces: `formatSetsReps(exercise: BlockExercise): string`, consumed by
  Task 4 (`index.tsx`'s exercise row rendering).

- [ ] **Step 1: write the failing test first**

Create `apps/mobile/lib/programDisplay.test.ts`:

```ts
// apps/mobile/lib/programDisplay.test.ts
import { formatSetsReps } from './programDisplay';
import type { BlockExercise } from './homeProgram';

function exercise(overrides: Partial<BlockExercise>): BlockExercise {
  return {
    id: 'ex-1',
    order: 0,
    name: 'Test Exercise',
    prescribedSets: null,
    prescribedReps: null,
    prescribedWeightNote: null,
    isUnilateralLeftFirst: false,
    notes: null,
    demoVideoUrl: null,
    ...overrides,
  };
}

describe('formatSetsReps', () => {
  test('renders "{sets} x {reps}" when both are present', () => {
    expect(formatSetsReps(exercise({ prescribedSets: 3, prescribedReps: '10 reps/side' }))).toBe(
      '3 x 10 reps/side'
    );
  });

  test('renders sets-only when reps is null', () => {
    expect(formatSetsReps(exercise({ prescribedSets: 3, prescribedReps: null }))).toBe('3 sets');
  });

  test('renders reps-only when sets is null', () => {
    expect(formatSetsReps(exercise({ prescribedSets: null, prescribedReps: '30-45s hold' }))).toBe(
      '30-45s hold'
    );
  });

  test('renders an empty string when both are null', () => {
    expect(formatSetsReps(exercise({ prescribedSets: null, prescribedReps: null }))).toBe('');
  });

  test('renders mixed real-data formats verbatim, never reformatted', () => {
    expect(formatSetsReps(exercise({ prescribedSets: 2, prescribedReps: '5 reps/side' }))).toBe(
      '2 x 5 reps/side'
    );
    expect(formatSetsReps(exercise({ prescribedSets: 3, prescribedReps: '8-10 reps/side' }))).toBe(
      '3 x 8-10 reps/side'
    );
  });
});
```

Run `npm test --prefix apps/mobile -- programDisplay` from the repo root.
Expected: fails (module doesn't exist).

- [ ] **Step 2: create `apps/mobile/lib/programDisplay.ts`**

```ts
// apps/mobile/lib/programDisplay.ts
//
// Pure display-formatting helpers for a block exercise's prescribed
// sets/reps. `prescribed_reps` is free text written by the engine in
// inconsistent formats across real rows in the same block ("10 reps/side"
// vs "30-45s hold") -- confirmed against live production data -- so this
// composes a single label without ever parsing or normalizing the reps
// string itself. See docs/superpowers/specs/2026-06-24-home-screen-design.md
// Decision 5.
import type { BlockExercise } from './homeProgram';

export function formatSetsReps(exercise: BlockExercise): string {
  const { prescribedSets, prescribedReps } = exercise;

  if (prescribedSets != null && prescribedReps) {
    return `${prescribedSets} x ${prescribedReps}`;
  }
  if (prescribedSets != null) {
    return `${prescribedSets} sets`;
  }
  if (prescribedReps) {
    return prescribedReps;
  }
  return '';
}
```

- [ ] **Step 3: run the test, confirm it passes**

```bash
npm test --prefix apps/mobile -- programDisplay
```

Expected: all 5 cases pass.

- [ ] **Step 4: commit**

```bash
git add apps/mobile/lib/programDisplay.ts apps/mobile/lib/programDisplay.test.ts
git commit -m "feat: add formatSetsReps pure helper for block exercise display"
```

---

### Task 4: `lib/dailyFeedback.ts` — write a feedback entry

**Files:**
- Create: `apps/mobile/lib/dailyFeedback.ts`
- Create: `apps/mobile/lib/dailyFeedback.test.ts`

**Interfaces:**
- Consumes: `apps/mobile/lib/supabase.ts`, `localDateString` from
  `healthkitMapping.ts`.
- Produces: `submitDailyFeedback(today: Date, feedbackText: string):
  Promise<void>`, consumed by Task 5 (`index.tsx`'s feedback box "Save"
  handler).

- [ ] **Step 1: write the failing test first**

Create `apps/mobile/lib/dailyFeedback.test.ts`:

```ts
// apps/mobile/lib/dailyFeedback.test.ts
import { submitDailyFeedback } from './dailyFeedback';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

function mockInsert(response: { error: unknown }) {
  const insertFn = jest.fn().mockResolvedValue(response);
  (supabase.from as jest.Mock).mockReturnValue({ insert: insertFn });
  return insertFn;
}

const TODAY = new Date(2026, 5, 24, 20, 0, 0); // 2026-06-24 local evening
const TODAY_ISO = '2026-06-24';

describe('submitDailyFeedback', () => {
  test('inserts a row with today\'s local date and the trimmed feedback text', async () => {
    const insertFn = mockInsert({ error: null });

    await submitDailyFeedback(TODAY, '  Felt great today, ankles loose.  ');

    expect(supabase.from).toHaveBeenCalledWith('daily_feedback');
    expect(insertFn).toHaveBeenCalledWith({
      date: TODAY_ISO,
      feedback_text: 'Felt great today, ankles loose.',
    });
  });

  test('throws if the insert returns an error', async () => {
    mockInsert({ error: { message: 'network down' } });

    await expect(submitDailyFeedback(TODAY, 'note')).rejects.toThrow('network down');
  });

  test('throws on empty/whitespace-only feedback without calling Supabase', async () => {
    const insertFn = mockInsert({ error: null });

    await expect(submitDailyFeedback(TODAY, '   ')).rejects.toThrow('Feedback cannot be empty');
    expect(insertFn).not.toHaveBeenCalled();
  });
});
```

Run `npm test --prefix apps/mobile -- dailyFeedback` from the repo root.
Expected: fails (module doesn't exist).

- [ ] **Step 2: create `apps/mobile/lib/dailyFeedback.ts`**

```ts
// apps/mobile/lib/dailyFeedback.ts
//
// Writes one daily_feedback row. This is a plain insert, not an upsert --
// daily_feedback has no unique constraint on (owner_id, date) (confirmed
// by reading supabase/migrations/20260623144500_create_exercise_logs_and_
// daily_feedback.sql), so multiple feedback entries per day are a valid,
// intended shape rather than something to dedupe client-side. `owner_id`
// defaults to auth.uid() at the database level, so it's never set here.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';

export async function submitDailyFeedback(today: Date, feedbackText: string): Promise<void> {
  const trimmed = feedbackText.trim();
  if (trimmed === '') {
    throw new Error('Feedback cannot be empty.');
  }

  const { error } = await supabase
    .from('daily_feedback')
    .insert({ date: localDateString(today), feedback_text: trimmed });

  if (error) {
    throw new Error(error.message);
  }
}
```

- [ ] **Step 3: run the test, confirm it passes**

```bash
npm test --prefix apps/mobile -- dailyFeedback
```

Expected: all 3 cases pass.

- [ ] **Step 4: commit**

```bash
git add apps/mobile/lib/dailyFeedback.ts apps/mobile/lib/dailyFeedback.test.ts
git commit -m "feat: add submitDailyFeedback for the Home screen's feedback box"
```

---

### Task 5: `lib/swapOptions.ts` — fetch the swap-picker's grouped option list

**Files:**
- Create: `apps/mobile/lib/swapOptions.ts`
- Create: `apps/mobile/lib/swapOptions.test.ts`

**Interfaces:**
- Consumes: `apps/mobile/lib/supabase.ts`.
- Produces: `fetchSwapOptions(): Promise<SwapOptionGroup[]>`, consumed by
  Task 6 (`index.tsx`'s `SwapActivitySheet`). This function only fetches
  the option list for display — it performs no swap (no backend exists to
  call; see Global Constraints).

- [ ] **Step 1: write the failing test first**

Create `apps/mobile/lib/swapOptions.test.ts`:

```ts
// apps/mobile/lib/swapOptions.test.ts
import { fetchSwapOptions } from './swapOptions';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';

const profileRow = { preferred_split: 'push_pull_legs' };
const splitRows = [
  { id: 'upper_lower', label: 'Upper / Lower', day_labels: ['upper', 'lower'] },
  { id: 'push_pull_legs', label: 'Push / Pull / Legs', day_labels: ['push', 'pull', 'legs'] },
];
const activityRows = [
  { id: 'pickleball', label: 'Pickleball', category: 'cardio' },
  { id: 'running', label: 'Running', category: 'cardio' },
  { id: 'yoga', label: 'Yoga', category: 'recovery' },
  { id: 'mobility', label: 'Mobility', category: 'recovery' },
];

function installMocks() {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'user_profile') {
      return { select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: profileRow, error: null }) }) };
    }
    if (table === 'split_taxonomy') {
      return { select: jest.fn().mockResolvedValue({ data: splitRows, error: null }) };
    }
    if (table === 'activity_taxonomy') {
      return { select: jest.fn().mockResolvedValue({ data: activityRows, error: null }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

describe('fetchSwapOptions', () => {
  test('groups Strength options from the preferred split\'s day_labels, Cardio/Recovery from activity_taxonomy', async () => {
    installMocks();

    const groups = await fetchSwapOptions();

    const strength = groups.find((g) => g.category === 'strength');
    expect(strength?.options.map((o) => o.id)).toEqual(['push', 'pull', 'legs']);

    const cardio = groups.find((g) => g.category === 'cardio');
    expect(cardio?.options.map((o) => o.id)).toEqual(['pickleball', 'running']);

    const recovery = groups.find((g) => g.category === 'recovery');
    expect(recovery?.options.map((o) => o.id)).toEqual(['yoga', 'mobility']);
  });
});
```

Run `npm test --prefix apps/mobile -- swapOptions` from the repo root.
Expected: fails (module doesn't exist).

- [ ] **Step 2: create `apps/mobile/lib/swapOptions.ts`**

```ts
// apps/mobile/lib/swapOptions.ts
//
// Fetches the option list for the Home screen's "Swap activity" picker
// shell. This module has no swap-execution function -- there is no
// real backend for it. build_program_for_activity was explicitly deferred
// out of the engine v2 phase (docs/superpowers/specs/2026-06-24-engine-v2-
// design.md Non-goals / Decision 12), so this picker only ever displays
// options; index.tsx's SwapActivitySheet shows a "not available yet"
// message on selection instead of calling anything. See design spec
// Decision 8.
import { supabase } from './supabase';

export interface SwapOption {
  readonly id: string;
  readonly label: string;
}

export interface SwapOptionGroup {
  readonly category: 'strength' | 'cardio' | 'recovery';
  readonly label: string;
  readonly options: readonly SwapOption[];
}

const CATEGORY_LABELS: Record<SwapOptionGroup['category'], string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  recovery: 'Recovery',
};

function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function fetchSwapOptions(): Promise<SwapOptionGroup[]> {
  const [profileRes, splitsRes, activitiesRes] = await Promise.all([
    supabase.from('user_profile').select('preferred_split').single(),
    supabase.from('split_taxonomy').select('id, label, day_labels'),
    supabase.from('activity_taxonomy').select('id, label, category'),
  ]);

  const firstError = profileRes.error ?? splitsRes.error ?? activitiesRes.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const preferredSplitId = (profileRes.data as { preferred_split: string } | null)?.preferred_split;
  const splits = (splitsRes.data ?? []) as { id: string; label: string; day_labels: string[] }[];
  const activities = (activitiesRes.data ?? []) as { id: string; label: string; category: string }[];

  const preferredSplit = splits.find((s) => s.id === preferredSplitId);
  const strengthOptions: SwapOption[] = (preferredSplit?.day_labels ?? []).map((dayLabel) => ({
    id: dayLabel,
    label: titleCase(dayLabel),
  }));

  const cardioOptions: SwapOption[] = activities
    .filter((a) => a.category === 'cardio')
    .map((a) => ({ id: a.id, label: a.label }));

  const recoveryOptions: SwapOption[] = activities
    .filter((a) => a.category === 'recovery')
    .map((a) => ({ id: a.id, label: a.label }));

  return [
    { category: 'strength', label: CATEGORY_LABELS.strength, options: strengthOptions },
    { category: 'cardio', label: CATEGORY_LABELS.cardio, options: cardioOptions },
    { category: 'recovery', label: CATEGORY_LABELS.recovery, options: recoveryOptions },
  ];
}
```

- [ ] **Step 3: run the test, confirm it passes**

```bash
npm test --prefix apps/mobile -- swapOptions
```

Expected: the test case passes.

- [ ] **Step 4: run the full suite and `tsc`**

```bash
npm test --prefix apps/mobile
npx tsc --noEmit -p apps/mobile
```

Expected: full suite green, clean compile.

- [ ] **Step 5: commit**

```bash
git add apps/mobile/lib/swapOptions.ts apps/mobile/lib/swapOptions.test.ts
git commit -m "feat: add fetchSwapOptions for the Home screen's swap-activity picker shell"
```

---

### Task 6: `app/(tabs)/index.tsx` — the real Home screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `fetchHomeData` (Task 2), `formatSetsReps` (Task 3),
  `submitDailyFeedback` (Task 4), `fetchSwapOptions`/`SwapOptionGroup`
  (Task 5), `labelForSessionType` (Task 1), `COLORS`/`SPACING`/`RADII`/
  `TYPE`/`sharedStyles` (`lib/theme.ts`, unmodified), `useRouter` (Expo
  Router, existing dependency).
- Produces: the rendered Home screen. No other file consumes this one —
  it's a route leaf.

This task has no isolated unit test (it's a screen component, no RN
render harness exists in this repo — see design spec "Verification bar").
Its correctness is verified by Task 7's manual pass plus this task's own
`tsc`/bundle checks.

- [ ] **Step 1: replace `apps/mobile/app/(tabs)/index.tsx`**

```tsx
// apps/mobile/app/(tabs)/index.tsx
//
// Home screen (Phase 5): Yesterday's summary (reading the already-
// generated recommendations.public_rationale column -- no client-side
// Claude call of any kind, see CLAUDE.md and design spec Non-goals),
// Today's full multi-block program (recommendation_blocks +
// recommendation_block_exercises, tappable into the logger), a
// "Swap activity" picker shell that visibly states swapping isn't
// available yet (no real backend exists for it -- build_program_for_
// activity was deferred out of the engine v2 phase), and a free-text
// daily-feedback box. See
// docs/superpowers/specs/2026-06-24-home-screen-design.md for the full
// design rationale and the live-data shape this was built against.
//
// This screen fetches its own data via homeProgram.ts rather than reusing
// app/_layout.tsx's `recommendations` state -- that state comes from
// `recommendations_public`, which excludes `id` and therefore can't join
// to recommendation_blocks. See design spec Decision 1.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { fetchHomeData, type BlockExercise, type HomeData, type ProgramBlock } from '../../lib/homeProgram';
import { formatSetsReps } from '../../lib/programDisplay';
import { submitDailyFeedback } from '../../lib/dailyFeedback';
import { fetchSwapOptions, type SwapOptionGroup } from '../../lib/swapOptions';
import { labelForSessionType } from '../../lib/sessionTypeLabels';

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<HomeData | null>(null);

  const [swapGroups, setSwapGroups] = useState<SwapOptionGroup[]>([]);
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const [swapMessage, setSwapMessage] = useState<string | null>(null);

  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, groups] = await Promise.all([fetchHomeData(new Date()), fetchSwapOptions()]);
      setHomeData(data);
      setSwapGroups(groups);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load your program.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleOpenBlock(block: ProgramBlock) {
    router.push(`/logger/${block.id}`);
  }

  function handleOpenSwapSheet() {
    setSwapMessage(null);
    setSwapSheetOpen(true);
  }

  function handleSelectSwapOption() {
    setSwapMessage("Swapping isn't available yet — this is coming in a future update.");
  }

  async function handleSaveFeedback() {
    setFeedbackStatus('saving');
    setFeedbackError(null);
    try {
      await submitDailyFeedback(new Date(), feedbackDraft);
      setFeedbackDraft('');
      setFeedbackStatus('saved');
    } catch (err: any) {
      setFeedbackStatus('error');
      setFeedbackError(err.message ?? 'Failed to save feedback.');
    }
  }

  function handleOpenDemoVideo(url: string) {
    Linking.openURL(url).catch(() => {
      // Best-effort: if the system can't open the URL, there's no
      // additional in-app recovery available here -- silently ignore
      // rather than surface a disruptive error for a non-critical action.
    });
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={TYPE.body}>Loading your program…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>Couldn't load your program: {loadError}</Text>
      </View>
    );
  }

  const today = homeData?.today ?? null;
  const yesterdayRationale = homeData?.yesterdayRationale ?? null;

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Home</Text>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Yesterday</Text>
        {yesterdayRationale ? (
          <Text style={TYPE.body}>{yesterdayRationale}</Text>
        ) : (
          <Text style={sharedStyles.helperText}>No summary available for yesterday yet.</Text>
        )}
      </View>

      <View style={sharedStyles.card}>
        <View style={styles.programHeaderRow}>
          <Text style={sharedStyles.sectionTitle}>Today's Program</Text>
          <Pressable onPress={handleOpenSwapSheet}>
            <Text style={styles.swapLink}>Swap activity</Text>
          </Pressable>
        </View>

        {!today && (
          <Text style={sharedStyles.helperText}>Today's program hasn't generated yet.</Text>
        )}

        {today && (
          <>
            <Text style={sharedStyles.helperText}>{today.publicRationale}</Text>
            {today.blocks.length === 0 && (
              <Text style={sharedStyles.helperText}>No blocks in today's program yet.</Text>
            )}
            {today.blocks.map((block) => (
              <Pressable
                key={block.id}
                style={styles.blockRow}
                onPress={() => handleOpenBlock(block)}
              >
                <View style={styles.blockHeaderRow}>
                  <Text style={TYPE.label}>
                    {block.title || labelForSessionType(block.blockType)}
                  </Text>
                  {block.estimatedMinutes != null && (
                    <Text style={sharedStyles.helperText}>{block.estimatedMinutes} min</Text>
                  )}
                </View>
                {block.exercises.map((exercise) => (
                  <ExerciseRow key={exercise.id} exercise={exercise} onOpenDemo={handleOpenDemoVideo} />
                ))}
              </Pressable>
            ))}
          </>
        )}
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>How are you feeling?</Text>
        <TextInput
          style={[sharedStyles.textInput, styles.feedbackInput]}
          value={feedbackDraft}
          onChangeText={setFeedbackDraft}
          placeholder="Anything worth noting today?"
          multiline
        />
        <Pressable
          style={sharedStyles.primaryButton}
          onPress={handleSaveFeedback}
          disabled={feedbackStatus === 'saving' || feedbackDraft.trim() === ''}
        >
          <Text style={sharedStyles.primaryButtonText}>
            {feedbackStatus === 'saving' ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
        {feedbackStatus === 'saved' && <Text style={sharedStyles.helperText}>Saved.</Text>}
        {feedbackStatus === 'error' && (
          <Text style={sharedStyles.warningText}>{feedbackError}</Text>
        )}
      </View>

      <SwapActivitySheet
        visible={swapSheetOpen}
        groups={swapGroups}
        message={swapMessage}
        onSelect={handleSelectSwapOption}
        onClose={() => setSwapSheetOpen(false)}
      />
    </ScrollView>
  );
}

function ExerciseRow({
  exercise,
  onOpenDemo,
}: {
  exercise: BlockExercise;
  onOpenDemo: (url: string) => void;
}) {
  const setsReps = formatSetsReps(exercise);
  return (
    <View style={styles.exerciseRow}>
      <Text style={TYPE.body}>{exercise.name}</Text>
      {setsReps !== '' && <Text style={sharedStyles.helperText}>{setsReps}</Text>}
      {exercise.demoVideoUrl && (
        <Pressable onPress={() => onOpenDemo(exercise.demoVideoUrl!)}>
          <Text style={styles.demoLink}>Watch demo</Text>
        </Pressable>
      )}
    </View>
  );
}

function SwapActivitySheet({
  visible,
  groups,
  message,
  onSelect,
  onClose,
}: {
  visible: boolean;
  groups: SwapOptionGroup[];
  message: string | null;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={sharedStyles.sectionTitle}>Swap activity</Text>
          {message && <Text style={sharedStyles.warningText}>{message}</Text>}
          <ScrollView>
            {groups.map((group) => (
              <View key={group.category}>
                {group.options.length > 0 && (
                  <Text style={styles.groupLabel}>{group.label}</Text>
                )}
                {group.options.map((option) => (
                  <Pressable key={option.id} style={styles.optionRow} onPress={onSelect}>
                    <Text style={TYPE.body}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  programHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  swapLink: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  blockRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  blockHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseRow: {
    paddingVertical: SPACING.xs,
    gap: 2,
  },
  demoLink: {
    color: COLORS.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  feedbackInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    maxHeight: '70%',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  groupLabel: {
    color: COLORS.muted,
    fontWeight: '600',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  optionRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
```

- [ ] **Step 2: run `tsc` and the full test suite**

```bash
npx tsc --noEmit -p apps/mobile
npm test --prefix apps/mobile
```

Expected: clean compile (verifies every new import/type lines up across
`homeProgram.ts`/`programDisplay.ts`/`dailyFeedback.ts`/`swapOptions.ts`/
`sessionTypeLabels.ts`), full suite green (no existing test touches
`index.tsx` directly, so none should regress).

- [ ] **Step 3: commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat: replace Home tab stub with Yesterday/Today's Program/swap-shell/feedback"
```

---

### Task 7: Manual verification — Home screen renders against live data, bundle smoke test

**Files:** None (verification only — no source changes).

**Interfaces:**
- Consumes: every file from Tasks 1-6.
- Produces: confidence the full Phase 5 acceptance bar is met — this
  project has no RN component-render test harness, so this manual pass is
  the real verification step for the new screen, matching how the
  settings phase's Task 10 verified its own UI-shell work.

- [ ] **Step 1: full static verification**

From `apps/mobile/`, run:

```bash
npm test
npx tsc --noEmit
```

Expected: Jest suite fully green (including every new test file from
Tasks 1-5), `tsc` clean.

- [ ] **Step 2: bundle check**

```bash
npx expo export --platform ios
```

Expected: the JS bundle builds without a runtime/bundler error — confirms
no import errors across the new `index.tsx` and its four new `lib/*.ts`
modules.

- [ ] **Step 3: start the dev server and manually exercise the Home screen**

```bash
npx expo start --clear
```

Open the app, sign in, land on the Home tab (now the default tab).
Expected, in order:

1. A brief "Loading your program…" state, then the screen renders three
   cards: Yesterday, Today's Program, and the feedback box.
2. The Yesterday card shows the real `public_rationale` text for
   2026-06-23 ("Today's pick is mobility -- a mobility session was
   overdue. Runner-up: upper a.") — confirms the screen reads the
   already-generated column and makes zero network calls to any
   Claude/Anthropic endpoint (confirm via the Metro/network inspector: no
   request to `api.anthropic.com` or any new Edge Function from this
   screen).
3. The Today's Program card shows the real 2026-06-24 row: the single
   "Mobility" block with its 5 exercises, each showing a sets/reps line in
   its original mixed format (e.g. "3 x 10 reps/side", "2 x 5 reps/side"),
   and a "Watch demo" link only on the one exercise
   (`08120a15-88a0-4ec3-ae42-650dbec17076`, Half-Kneeling Ankle
   Mobilization) that has a non-null `demo_video_url` — the other rows
   show no link at all, not a disabled one.
4. Tapping the Mobility block navigates to the existing logger stub
   (`Logger — coming in Phase 6`, showing the real `recommendation_blocks`
   row's `id` as `blockId`) — confirms the navigation contract is correct
   even though Phase 6 hasn't built the destination yet.
5. Tapping "Swap activity" opens a bottom sheet grouped Strength/Cardio/
   Recovery (Strength populated from the signed-in user's preferred
   split's day labels, e.g. Push/Pull/Legs). Tapping any option shows the
   inline message "Swapping isn't available yet — this is coming in a
   future update." and the sheet stays open with no crash, no Supabase
   write, and no network call to any swap endpoint.
6. Typing into the feedback box and tapping "Save" persists a new row
   (confirm via a Supabase table check or a second app reload showing the
   field cleared and a brief "Saved." message) — and tapping "Save" again
   with new text creates a second row for the same date, not an overwrite
   (confirms the insert-not-upsert decision).
7. Force an error path: temporarily break `EXPO_PUBLIC_SUPABASE_URL` (or
   disconnect network) and reload — confirms the top-level error state
   renders instead of a blank screen or crash, then restore the working
   config before continuing.

- [ ] **Step 4: confirm no secret leakage**

```bash
grep -ri "anthropic_api_key" apps/mobile/ || echo "clean"
grep -ri "build_program_for_activity" apps/mobile/ || echo "clean"
```

Expected: both report clean — no Anthropic key anywhere in the mobile app,
and no call to the nonexistent swap-execution function anywhere in the new
code (the swap picker only ever sets a static UI message).

- [ ] **Step 5: no commit** (this task makes no source changes).

---

## Known, deliberate gap to flag for the Reporter

The "Swap activity" affordance is a real, tappable UI shell (grouped
Strength/Cardio/Recovery picker, populated from live taxonomy data) but
cannot actually perform a swap — selecting any option shows "Swapping
isn't available yet." This is not a bug: `build_program_for_activity` was
explicitly deferred out of the just-completed engine v2 phase (no
Supabase Edge Function or API route exists to call), documented in
`docs/superpowers/specs/2026-06-24-engine-v2-design.md`'s Non-goals. Wiring
a real swap requires that backend work first, in a future phase.
