# Recommendation/Summary UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile app's bare `Signed in as <uuid>` placeholder
with a real screen showing the two outputs CLAUDE.md describes: a measured
summary of yesterday's recommendation and today's recommendation
(`top_pick` + `runner_up`, friendly names, plus the engine's
`public_rationale` sentence) — reading only `recommendations_public`, never
the private `internal_rationale`/`score_breakdown` fields.

**Architecture:** One new `apps/mobile/lib/recommendations.ts` module
(typed query + date-matching, following the existing `lib/supabase.ts` /
`lib/healthkitSync.ts` one-module-per-concern convention) plus edits to
`apps/mobile/App.tsx` to fetch on session-ready/foreground (mirroring the
existing HealthKit sync `useEffect` pattern) and render the result. No new
screens, no navigation library, no schema change, no new npm dependency.

**Tech Stack:** TypeScript, React Native (Expo SDK 56), `@supabase/supabase-js`
(already installed), Jest + ts-jest (already configured in
`apps/mobile/package.json`).

## Global Constraints

- Read only `recommendations_public` (`date`, `top_pick`, `runner_up`,
  `public_rationale`, `generated_at`) — never query the base
  `recommendations` table from the app, even though the `authenticated`
  role technically has a read grant on it (`authenticated_read_recommendations`).
  `internal_rationale` and `score_breakdown` must never reach the phone
  app's JS runtime, per CLAUDE.md's public/private split. This is enforced
  structurally by only ever calling `.select('date, top_pick, runner_up,
  public_rationale, generated_at')` against `recommendations_public` and by
  the `RecommendationPublicRow` TypeScript type never declaring the other
  two fields.
- No new Supabase migration. The `recommendations_public` view and its
  `anon, authenticated` grant already exist
  (`supabase/migrations/20260622001542_create_recommendations.sql`,
  `supabase/migrations/20260622002432_fix_view_security_and_updated_at_triggers.sql`).
- No new npm dependency. `@supabase/supabase-js` is already installed and
  authenticated via `apps/mobile/lib/supabase.ts`.
- No navigation library, no second screen. `App.tsx` keeps its existing
  `session`-based branch; only the signed-in branch's rendering changes.
- "Today" and "yesterday" are computed from the device's local
  `new Date()`, formatted as `YYYY-MM-DD` (matching the `date` column's
  Postgres `date` type, which `supabase-js` returns/accepts as a plain ISO
  date string with no time component).
- All new test files use plain Jest (`describe`/`test`/`expect`), matching
  the `jest`/`ts-jest` setup already declared in `apps/mobile/package.json`
  (no test files exist yet in `apps/mobile/`, so this plan establishes the
  first ones — no existing convention to break).
- Demo-video links and target rep ranges are explicitly out of scope this
  phase (see design spec Decision 4) — `recommendations` has no
  exercise-level data for the engine to have populated, and inventing a
  client-side guess would duplicate program-content judgment that belongs
  in the engine, not the UI.

---

### Task 1: `lib/recommendations.ts` — typed fetch against `recommendations_public`

**Files:**
- Create: `apps/mobile/lib/recommendations.ts`
- Test: `apps/mobile/lib/recommendations.test.ts`

**Interfaces:**
- Consumes: `supabase` from `apps/mobile/lib/supabase.ts` (already exists).
- Produces: `RecommendationPublicRow` (type), `SessionType` (type),
  `fetchRecommendations(today: Date): Promise<RecommendationsResult>` where
  `RecommendationsResult = { today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null }`. Task 2 imports both types
  and `fetchRecommendations` into `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/lib/recommendations.test.ts`:

```ts
// apps/mobile/lib/recommendations.test.ts
import { fetchRecommendations } from './recommendations';

// `supabase-js`'s query builder is chainable (.from().select().in()), so the
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

Run (from `apps/mobile/`): `npx jest lib/recommendations.test.ts`
Expected: fails with a module-not-found error for `./recommendations`
(the module doesn't exist yet) — confirms the test is actually exercising
real code once it exists, not passing vacuously.

- [ ] **Step 3: Create `lib/recommendations.ts`**

```ts
// apps/mobile/lib/recommendations.ts
//
// Fetches today's and yesterday's rows from the recommendations_public
// view -- never the base recommendations table, which also carries
// internal_rationale/score_breakdown (private biometric-derived fields,
// per CLAUDE.md's public/private split). See
// docs/superpowers/specs/2026-06-22-recommendation-ui-design.md Decision 1.
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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetches the recommendations_public rows for `today` and the day before
 * it in a single query (see design spec Decision 7), then splits the
 * result by exact date match (see design spec Decision 6 -- "today" means
 * date = today, not "most recent row", so a late/missing cron run shows an
 * explicit not-yet-generated state instead of silently relabeling an older
 * row as today's).
 */
export async function fetchRecommendations(today: Date): Promise<RecommendationsResult> {
  const todayIso = toIsoDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = toIsoDate(yesterday);

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

Run (from `apps/mobile/`): `npx jest lib/recommendations.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Type-check**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/recommendations.ts apps/mobile/lib/recommendations.test.ts
git commit -m "feat: add typed fetch against recommendations_public view"
```

---

### Task 2: Friendly session-type labels

**Files:**
- Create: `apps/mobile/lib/sessionTypeLabels.ts`
- Test: `apps/mobile/lib/sessionTypeLabels.test.ts`

**Interfaces:**
- Consumes: `SessionType` from `apps/mobile/lib/recommendations.ts` (Task 1).
- Produces: `SESSION_TYPE_LABELS` (a `Record<SessionType, string>`),
  `labelForSessionType(type: SessionType): string`. Task 3 imports
  `labelForSessionType` into `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/lib/sessionTypeLabels.test.ts`:

```ts
// apps/mobile/lib/sessionTypeLabels.test.ts
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
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run (from `apps/mobile/`): `npx jest lib/sessionTypeLabels.test.ts`
Expected: fails with a module-not-found error for `./sessionTypeLabels`.

- [ ] **Step 3: Create `lib/sessionTypeLabels.ts`**

```ts
// apps/mobile/lib/sessionTypeLabels.ts
//
// Friendly display names for the session_type enum. Deliberately a small
// static lookup separate from engine/rationale.py's own casual in-sentence
// "upper_a" -> "upper a" replacement -- this is the screen's headline
// label, not the rationale sentence. See design spec Decision 3.
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

export function labelForSessionType(type: SessionType): string {
  return SESSION_TYPE_LABELS[type];
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run (from `apps/mobile/`): `npx jest lib/sessionTypeLabels.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Type-check**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/sessionTypeLabels.ts apps/mobile/lib/sessionTypeLabels.test.ts
git commit -m "feat: add friendly session_type display labels"
```

---

### Task 3: Render the recommendation screen in `App.tsx`

**Files:**
- Modify: `apps/mobile/App.tsx`

**Interfaces:**
- Consumes: `fetchRecommendations`, `RecommendationPublicRow` from
  `apps/mobile/lib/recommendations.ts` (Task 1); `labelForSessionType` from
  `apps/mobile/lib/sessionTypeLabels.ts` (Task 2); existing `supabase`,
  `syncHealthKitWorkouts`, and the existing `session`/`AppState` wiring
  already in `App.tsx`.
- Produces: the app's signed-in screen now renders today's and yesterday's
  recommendations instead of `Signed in as <uuid>`. No other module
  consumes this file's exports (it's the app's root component).

- [ ] **Step 1: Replace `App.tsx`**

```tsx
// apps/mobile/App.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { syncHealthKitWorkouts } from './lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from './lib/recommendations';
import { labelForSessionType } from './lib/sessionTypeLabels';

type RecommendationsState = {
  today: RecommendationPublicRow | null;
  yesterday: RecommendationPublicRow | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_RECOMMENDATIONS_STATE: RecommendationsState = {
  today: null,
  yesterday: null,
  loading: true,
  error: null,
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('not signed in');
  const [recommendations, setRecommendations] = useState<RecommendationsState>(
    INITIAL_RECOMMENDATIONS_STATE
  );
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadRecommendations = useCallback(async () => {
    try {
      const result = await fetchRecommendations(new Date());
      setRecommendations({
        today: result.today,
        yesterday: result.yesterday,
        loading: false,
        error: null,
      });
    } catch (err: any) {
      setRecommendations((prev) => ({
        ...prev,
        loading: false,
        error: err.message ?? 'Failed to load recommendations',
      }));
    }
  }, []);

  useEffect(() => {
    if (!session) {
      // No authenticated session yet: skip HealthKit and the
      // recommendations fetch entirely. HealthKit shouldn't burn its
      // one-shot iOS permission prompt before RLS would allow a write to
      // persist; the recommendations fetch has nothing useful to show
      // before sign-in either, since recommendations_public still requires
      // an authenticated (or anon) request through this same client.
      return;
    }

    syncHealthKitWorkouts().catch((err) => {
      console.warn('HealthKit sync failed on launch:', err);
    });
    loadRecommendations();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        syncHealthKitWorkouts().catch((err) => {
          console.warn('HealthKit sync failed on foreground:', err);
        });
        loadRecommendations();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session, loadRecommendations]);

  async function handleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
    } catch (err: any) {
      setStatus(`sign-in error: ${err.message}`);
    }
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <Text>{status}</Text>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={5}
          style={styles.button}
          onPress={handleSignIn}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      {recommendations.loading && <Text>Loading today's recommendation...</Text>}

      {recommendations.error && (
        <Text style={styles.error}>Couldn't load recommendations: {recommendations.error}</Text>
      )}

      {!recommendations.loading && !recommendations.error && (
        <>
          {recommendations.yesterday && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Yesterday</Text>
              <Text style={styles.headline}>
                {labelForSessionType(recommendations.yesterday.top_pick)}
              </Text>
              <Text style={styles.rationale}>{recommendations.yesterday.public_rationale}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Today</Text>
            {recommendations.today ? (
              <>
                <Text style={styles.headline}>
                  {labelForSessionType(recommendations.today.top_pick)}
                </Text>
                {recommendations.today.runner_up && (
                  <Text style={styles.runnerUp}>
                    Runner-up: {labelForSessionType(recommendations.today.runner_up)}
                  </Text>
                )}
                <Text style={styles.rationale}>{recommendations.today.public_rationale}</Text>
              </>
            ) : (
              <Text style={styles.rationale}>
                Today's recommendation hasn't generated yet -- check back this morning.
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  button: { width: 200, height: 44 },
  card: { gap: 6, padding: 16, borderRadius: 8, backgroundColor: '#F2F2F7' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#6E6E73', textTransform: 'uppercase' },
  headline: { fontSize: 24, fontWeight: '700' },
  runnerUp: { fontSize: 15, color: '#3A3A3C' },
  rationale: { fontSize: 15, color: '#3A3A3C', marginTop: 4 },
  error: { fontSize: 14, color: '#B00020' },
});
```

- [ ] **Step 2: Type-check**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Bundle-build check**

Run (from `apps/mobile/`): `npx expo export --platform ios`
Expected: completes without a bundler/import error (confirms the new
imports resolve and there's no syntax error this far) — same verification
already used in the HealthKit sync phase for catching issues without a
physical device.

- [ ] **Step 4: Manual verification (requires the TestFlight build, device-only)**

Cannot be automated — open the installed TestFlight build (or a fresh
`eas build --profile preview` once this lands, per the existing EAS
workflow from the mobile bootstrap plan), sign in with Apple, and confirm:
- The screen no longer shows `Signed in as <uuid>`.
- A "Today" card renders with a real friendly session name (e.g. "Mobility")
  and the engine's `public_rationale` sentence underneath, sourced from the
  live `recommendations_public` row already produced by the daily cron.
- If a "Yesterday" card is present, it shows yesterday's pick the same way.
- If checked before that day's 11:00 UTC cron run, the "Today" card instead
  shows the not-yet-generated placeholder text, and reopening the app after
  11:00 UTC (foreground re-fetch) replaces it with the real pick without
  needing a manual app restart.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx
git commit -m "feat: render today's and yesterday's recommendations on the home screen"
```

---

**End state after this plan:** the mobile app's signed-in screen shows
CLAUDE.md's two daily outputs for the first time -- a measured summary of
yesterday's recommendation and today's recommendation (top pick, runner-up,
and the engine's evidence-based rationale sentence) -- reading exclusively
through the `recommendations_public` view, with an honest placeholder when
today's cron run hasn't landed yet. Demo-video links and rep ranges remain
unimplemented, deliberately, because the engine has no exercise-level data
yet for this screen to render (design spec Decision 4) -- the next phase
that wants to add them needs to start in `engine/`, not here.
