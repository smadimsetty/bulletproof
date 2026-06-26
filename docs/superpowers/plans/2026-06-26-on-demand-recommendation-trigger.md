# On-demand recommendation trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the mobile app generate today's recommendation on demand (within ~1 minute of opening the app after syncing Oura) instead of waiting for the fixed 11:00 UTC cron, while keeping the cron as a backstop and the engine's actual scoring/program logic untouched.

**Architecture:** A new Supabase Edge Function (`trigger-daily-engine`) lets the signed-in mobile app fire the existing `daily-cron.yml` GitHub Actions workflow via `workflow_dispatch`. `engine/run_daily.py` gets one new early-exit guard so cron and on-demand triggers can't double-run the (paid, Claude-calling) pipeline for the same day. The Home screen detects a missing/"provisional" (null-readiness) recommendation, triggers generation, and polls until it lands.

**Tech Stack:** Python 3.11 (engine, pytest), TypeScript/Deno (Supabase Edge Function), TypeScript/React Native/Expo + Jest (mobile app), Supabase (Postgres + PostgREST + Edge Functions), GitHub Actions REST API.

## Global Constraints

- Engine code outside the new guard must not change — same Oura pull, scoring, Claude call, fallback template, upsert shape (spec Goals).
- No change to `apps/web/` or the public `recommendations_public` view (spec Goals/Non-goals).
- The trigger path must require a signed-in Supabase session — never callable from an unauthenticated request (spec Goals).
- No Realtime/database publication changes — use polling, per the spec's simplification (spec Approach).
- `daily-cron.yml`'s schedule/steps stay as-is; it already supports `workflow_dispatch`, so no workflow YAML changes (spec "What stays exactly the same").
- GitHub repo for the dispatch target: `smadimsetty/bulletproof`, workflow file `daily-cron.yml`, branch `master`.

---

### Task 1: Engine guard — skip if today's recommendation is already fresh

**Files:**
- Modify: `engine/run_daily.py`
- Test: `engine/tests/test_run_daily.py`

**Interfaces:**
- Produces: `recommendation_already_fresh(today: date) -> bool` in `run_daily.py`, used by `main()`.

- [ ] **Step 1: Write the failing tests**

Add to `engine/tests/test_run_daily.py` (after the existing imports, which already include `from unittest.mock import patch` and `import pytest`):

```python
def test_recommendation_already_fresh_true_when_readiness_present():
    import run_daily

    with patch("run_daily.supabase_client.get", return_value=[{"score_breakdown": {"readiness": 7}}]):
        assert run_daily.recommendation_already_fresh(date(2026, 6, 26)) is True


def test_recommendation_already_fresh_false_when_no_row():
    import run_daily

    with patch("run_daily.supabase_client.get", return_value=[]):
        assert run_daily.recommendation_already_fresh(date(2026, 6, 26)) is False


def test_recommendation_already_fresh_false_when_readiness_null():
    import run_daily

    with patch("run_daily.supabase_client.get", return_value=[{"score_breakdown": {"readiness": None}}]):
        assert run_daily.recommendation_already_fresh(date(2026, 6, 26)) is False


def test_recommendation_already_fresh_queries_correct_table_and_filter():
    import run_daily

    with patch("run_daily.supabase_client.get", return_value=[]) as mock_get:
        run_daily.recommendation_already_fresh(date(2026, 6, 26))

    mock_get.assert_called_once_with(
        "recommendations", {"select": "score_breakdown", "date": "eq.2026-06-26"}
    )


def test_main_skips_pipeline_when_recommendation_already_fresh():
    import run_daily

    with patch("run_daily.env_loader.load_env"), \
         patch("run_daily.recommendation_already_fresh", return_value=True), \
         patch("run_daily.recovery_repo.pull_and_upsert_today") as mock_pull, \
         patch("run_daily.program_builder.build_daily_program") as mock_build, \
         patch("run_daily.supabase_client.upsert") as mock_upsert:
        run_daily.main()

    mock_pull.assert_not_called()
    mock_build.assert_not_called()
    mock_upsert.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd engine && python -m pytest tests/test_run_daily.py -v`
Expected: the four new tests fail with `AttributeError: module 'run_daily' has no attribute 'recommendation_already_fresh'` (or similar), since the function doesn't exist yet. The pre-existing tests in this file should still pass unchanged.

- [ ] **Step 3: Implement the guard**

In `engine/run_daily.py`, add this new function directly above `def main():`:

```python
def recommendation_already_fresh(today):
    """True if today's recommendations row already reflects real (non-null)
    Oura readiness -- meaning an earlier run today (cron or on-demand)
    already did the real work and this run should be a no-op. A missing
    row, or a row whose score_breakdown.readiness is still null (an
    earlier run before Oura had synced), is not considered fresh."""
    existing = supabase_client.get(
        "recommendations",
        {"select": "score_breakdown", "date": f"eq.{today.isoformat()}"},
    )
    if not existing:
        return False
    return existing[0]["score_breakdown"].get("readiness") is not None
```

Then change the start of `main()` from:

```python
def main():
    env_loader.load_env()
    today = date.today()
    owner_id = os.environ["ENGINE_OWNER_ID"]

    readiness = recovery_repo.pull_and_upsert_today(today)
```

to:

```python
def main():
    env_loader.load_env()
    today = date.today()

    if recommendation_already_fresh(today):
        print(f"Recommendation for {today.isoformat()} already generated with real readiness data -- skipping.")
        return

    owner_id = os.environ["ENGINE_OWNER_ID"]
    readiness = recovery_repo.pull_and_upsert_today(today)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd engine && python -m pytest tests/test_run_daily.py -v`
Expected: all tests in the file pass, including the pre-existing `test_main_calls_gate_today_and_program_builder` (its existing `patch("run_daily.supabase_client.get", return_value=[])` already covers the new guard's call, since an empty list means "not fresh" and the pipeline proceeds exactly as before).

- [ ] **Step 5: Run the full engine test suite**

Run: `cd engine && python -m pytest -v`
Expected: all tests pass (no regressions in other engine modules).

- [ ] **Step 6: Commit**

```bash
git add engine/run_daily.py engine/tests/test_run_daily.py
git commit -m "feat: skip engine pipeline when today's recommendation is already fresh

Lets the upcoming on-demand mobile trigger and the 11:00 UTC cron backstop
safely coexist -- whichever fires first does the real (Oura+Claude) work,
any later trigger for the same day is a cheap no-op."
```

---

### Task 2: Mobile — expose `isProvisional` on today's program

**Files:**
- Modify: `apps/mobile/lib/homeProgram.ts`
- Test: `apps/mobile/lib/homeProgram.test.ts`

**Interfaces:**
- Produces: `TodayProgram.isProvisional: boolean` — `true` when `score_breakdown.readiness` is null (no real Oura data yet); consumed by Task 4's Home screen wiring.

- [ ] **Step 1: Write the failing tests**

In `apps/mobile/lib/homeProgram.test.ts`, first update the shared `todayRecommendationRow` fixture (near the top of the file) to include a fresh readiness value, so existing tests keep exercising the "not provisional" path:

```ts
const todayRecommendationRow = {
  id: 'rec-today-1',
  date: TODAY_ISO,
  top_pick: 'mobility',
  runner_up: 'upper',
  public_rationale: "Today's program covers: mobility.",
  score_breakdown: { readiness: 7 },
};
```

Then add two new tests inside the `describe('fetchHomeData', ...)` block:

```ts
  test('marks today as provisional when score_breakdown.readiness is null', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() =>
            Promise.resolve({
              data: { ...todayRecommendationRow, score_breakdown: { readiness: null } },
              error: null,
            })
          ),
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

    expect(result.today!.isProvisional).toBe(true);
  });

  test('marks today as not provisional when score_breakdown.readiness is present', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'recommendations') {
        const chain: any = {
          select: jest.fn(() => chain),
          eq: jest.fn(() => chain),
          maybeSingle: jest.fn(() => Promise.resolve({ data: todayRecommendationRow, error: null })),
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

    expect(result.today!.isProvisional).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest lib/homeProgram.test.ts`
Expected: the two new tests fail with something like `expect(received).toBe(expected) -- Received: undefined` (since `isProvisional` doesn't exist on the returned object yet).

- [ ] **Step 3: Implement**

In `apps/mobile/lib/homeProgram.ts`, update `RawRecommendationRow`:

```ts
interface RawRecommendationRow {
  id: string;
  date: string;
  top_pick: SessionType;
  runner_up: SessionType | null;
  public_rationale: string;
  score_breakdown: { readiness: number | null } | null;
}
```

Update `TodayProgram`:

```ts
export interface TodayProgram {
  readonly recommendationId: string;
  readonly date: string;
  readonly topPick: SessionType;
  readonly runnerUp: SessionType | null;
  readonly publicRationale: string;
  readonly isProvisional: boolean;
  readonly blocks: readonly ProgramBlock[];
}
```

Update `fetchRecommendationRow`'s select to include the new column:

```ts
async function fetchRecommendationRow(dateIso: string): Promise<RawRecommendationRow | null> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('id, date, top_pick, runner_up, public_rationale, score_breakdown')
    .eq('date', dateIso)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RawRecommendationRow | null) ?? null;
}
```

Update the `today` object built in `fetchHomeData`:

```ts
  return {
    today: {
      recommendationId: todayRow.id,
      date: todayRow.date,
      topPick: todayRow.top_pick,
      runnerUp: todayRow.runner_up,
      publicRationale: todayRow.public_rationale,
      isProvisional: todayRow.score_breakdown?.readiness == null,
      blocks,
    },
    yesterdayRationale: yesterdayRow?.public_rationale ?? null,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest lib/homeProgram.test.ts`
Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/homeProgram.ts apps/mobile/lib/homeProgram.test.ts
git commit -m "feat: expose isProvisional on today's program

Lets the Home screen tell apart a fully-generated recommendation from one
written before Oura had synced (null readiness), so it knows when to
trigger a fresh on-demand generation."
```

---

### Task 3: Mobile — `engineTrigger.ts` (calls the new Edge Function)

**Files:**
- Create: `apps/mobile/lib/engineTrigger.ts`
- Test: `apps/mobile/lib/engineTrigger.test.ts`

**Interfaces:**
- Consumes: `supabase.functions.invoke(name: string)` from `apps/mobile/lib/supabase.ts`'s exported `supabase` client (already used elsewhere for `.from(...)`; `.functions.invoke` is the same client's Edge Functions API).
- Produces: `triggerDailyEngine(): Promise<boolean>` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/lib/engineTrigger.test.ts`:

```ts
// apps/mobile/lib/engineTrigger.test.ts
import { triggerDailyEngine } from './engineTrigger';

jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

import { supabase } from './supabase';

describe('triggerDailyEngine', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns true and calls the Edge Function by name', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { ok: true }, error: null });

    const result = await triggerDailyEngine();

    expect(result).toBe(true);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('trigger-daily-engine');
  });

  test('returns false and warns (does not throw) when the Edge Function call fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const result = await triggerDailyEngine();

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest lib/engineTrigger.test.ts`
Expected: FAIL — `Cannot find module './engineTrigger'`.

- [ ] **Step 3: Implement**

Create `apps/mobile/lib/engineTrigger.ts`:

```ts
// apps/mobile/lib/engineTrigger.ts
//
// Fires the trigger-daily-engine Supabase Edge Function, which dispatches
// the existing daily-cron.yml GitHub Actions workflow on demand. See
// docs/superpowers/specs/2026-06-26-on-demand-recommendation-trigger-design.md.
// Fire-and-forget and fail-soft, same posture as healthkitSync.ts -- a
// failed trigger just means the Home screen keeps its existing
// "hasn't generated yet" state rather than blocking anything.
import { supabase } from './supabase';

export async function triggerDailyEngine(): Promise<boolean> {
  const { error } = await supabase.functions.invoke('trigger-daily-engine');
  if (error) {
    console.warn('Failed to trigger on-demand recommendation generation:', error.message);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest lib/engineTrigger.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/engineTrigger.ts apps/mobile/lib/engineTrigger.test.ts
git commit -m "feat: add engineTrigger.ts to call the on-demand trigger Edge Function"
```

---

### Task 4: Mobile — Home screen triggers and polls for a fresh recommendation

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `HomeData.today.isProvisional` (Task 2), `triggerDailyEngine()` (Task 3), `fetchHomeData` / `HomeData` (already imported).
- No test file for this task — this repo's existing convention is that pure logic in `lib/*.ts` is unit-tested, while screen components under `app/` are verified via `tsc` + manual on-device walkthrough (see e.g. `app/_layout.tsx`'s AppState wiring, which also has no test). This task is screen wiring only; the logic it depends on (`isProvisional`) is already covered by Task 2's tests.

- [ ] **Step 1: Add the new imports**

In `apps/mobile/app/(tabs)/index.tsx`, change the React import line from:

```ts
import { useCallback, useEffect, useState } from 'react';
```

to:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
```

Change the `react-native` import from:

```ts
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
```

to:

```ts
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
```

Add one new import below the existing `lib` imports:

```ts
import { triggerDailyEngine } from '../../lib/engineTrigger';
```

- [ ] **Step 2: Add the polling/trigger state and refs**

Inside the `Home()` component, immediately after the existing `feedbackError` state line (`const [feedbackError, setFeedbackError] = useState<string | null>(null);`), add:

```ts
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const triggerInFlightRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);
```

- [ ] **Step 3: Add a helper to stop any in-flight poll**

Immediately after the refs from Step 2, add:

```ts
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    triggerInFlightRef.current = false;
  }, []);
```

- [ ] **Step 4: Replace `load` with a version that triggers + polls when provisional**

Replace the existing `load` callback:

```ts
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
```

with:

```ts
  const refetchHomeData = useCallback(async (): Promise<HomeData | null> => {
    try {
      const data = await fetchHomeData(new Date());
      setHomeData(data);
      return data;
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load your program.');
      return null;
    }
  }, []);

  const beginWaitingForFreshRecommendation = useCallback(() => {
    if (triggerInFlightRef.current) {
      return;
    }
    triggerInFlightRef.current = true;
    setWaitingMessage('Building today\'s program…');
    triggerDailyEngine();

    pollIntervalRef.current = setInterval(async () => {
      const data = await refetchHomeData();
      if (data?.today && !data.today.isProvisional) {
        stopPolling();
        setWaitingMessage(null);
      }
    }, 4000);

    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setWaitingMessage('Still working on it — pull down to refresh.');
    }, 90000);
  }, [refetchHomeData, stopPolling]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, groups] = await Promise.all([fetchHomeData(new Date()), fetchSwapOptions()]);
      setHomeData(data);
      setSwapGroups(groups);
      if (!data.today || data.today.isProvisional) {
        beginWaitingForFreshRecommendation();
      } else {
        stopPolling();
        setWaitingMessage(null);
      }
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load your program.');
    } finally {
      setLoading(false);
    }
  }, [beginWaitingForFreshRecommendation, stopPolling]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);
```

- [ ] **Step 5: Stop polling on unmount, and re-check on app foreground**

Replace the existing:

```ts
  useEffect(() => {
    load();
  }, [load]);
```

with:

```ts
  useEffect(() => {
    load();
    return () => stopPolling();
  }, [load, stopPolling]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        load();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [load]);
```

- [ ] **Step 6: Wire pull-to-refresh and the waiting message into the JSX**

Change the `ScrollView` opening tag from:

```tsx
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
```

to:

```tsx
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
```

Change the "Today's Program" card's not-yet-generated branch from:

```tsx
        {!today && (
          <Text style={sharedStyles.helperText}>Today's program hasn't generated yet.</Text>
        )}
```

to:

```tsx
        {!today && (
          <Text style={sharedStyles.helperText}>
            {waitingMessage ?? "Today's program hasn't generated yet."}
          </Text>
        )}
```

Then add a line that surfaces the waiting message even when a provisional row already exists (so the message shows above the placeholder program content, not only when there's no row at all). Change:

```tsx
            ))}
          </>
        )}
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>How are you feeling?</Text>
```

to:

```tsx
            ))}
          </>
        )}
        {today?.isProvisional && waitingMessage && (
          <Text style={sharedStyles.helperText}>{waitingMessage}</Text>
        )}
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>How are you feeling?</Text>
```

- [ ] **Step 7: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Run the full mobile test suite**

Run: `cd apps/mobile && npx jest`
Expected: all tests pass (no regressions — this task touched no tested `lib/` files).

- [ ] **Step 9: Commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat: trigger and poll for an on-demand recommendation from the Home screen

When today's program is missing or was generated before Oura synced
(isProvisional), the Home screen now fires the on-demand trigger and polls
every 4s for up to 90s, instead of only ever showing whatever the 11:00
UTC cron already wrote. Falls back to a pull-to-refresh affordance if it
times out."
```

---

### Task 5: Supabase Edge Function `trigger-daily-engine`

**Files:**
- Create: `supabase/functions/trigger-daily-engine/index.ts`

**Interfaces:**
- Consumes: `GITHUB_PAT` from its own environment (an Edge Function secret, never shipped to any client).
- Produces: an HTTP endpoint invoked by the mobile app as `supabase.functions.invoke('trigger-daily-engine')` (Task 3). Requires a valid signed-in Supabase session — Supabase Edge Functions reject unauthenticated calls by default (`verify_jwt` is `true` unless explicitly disabled in `config.toml`, which this function does not do).

- [ ] **Step 1: Create the function**

Create `supabase/functions/trigger-daily-engine/index.ts`:

```ts
// supabase/functions/trigger-daily-engine/index.ts
//
// Thin relay, not a reimplementation of the engine: dispatches the
// existing daily-cron.yml GitHub Actions workflow on demand, so the
// mobile app can get today's recommendation generated within about a
// minute of opening the app instead of waiting for the 11:00 UTC cron.
// See docs/superpowers/specs/2026-06-26-on-demand-recommendation-trigger-design.md.
//
// Requires a signed-in session by default (Supabase Edge Functions
// verify the caller's JWT unless verify_jwt is explicitly disabled in
// supabase/config.toml, which it is not here) -- this is what keeps this
// endpoint mobile-app-only; the public web dashboard never calls it.
const GITHUB_OWNER = "smadimsetty";
const GITHUB_REPO = "bulletproof";
const GITHUB_WORKFLOW_FILE = "daily-cron.yml";
const GITHUB_REF = "master";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const githubPat = Deno.env.get("GITHUB_PAT");
  if (!githubPat) {
    return new Response(JSON.stringify({ error: "GITHUB_PAT is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dispatchUrl =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;

  const githubResponse = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubPat}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "bulletproof-trigger-daily-engine",
    },
    body: JSON.stringify({ ref: GITHUB_REF }),
  });

  if (!githubResponse.ok) {
    const body = await githubResponse.text();
    return new Response(
      JSON.stringify({ error: `GitHub dispatch failed (${githubResponse.status}): ${body}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Verify it locally (if Docker Desktop is available for `supabase start`)**

Run: `npx supabase functions serve trigger-daily-engine --no-verify-jwt --env-file .env`

(Use `--no-verify-jwt` only for this local smoke test, to call it without a real session token; the deployed version keeps JWT verification on.) In another terminal:

```bash
curl -i -X POST http://localhost:54321/functions/v1/trigger-daily-engine
```

Expected: `200 {"ok":true}` if `GITHUB_PAT` is set in the local `.env` and valid, or a `500`/`502` with a clear error message otherwise — either way, no crash/stack trace. If Docker/local Supabase isn't available in this environment, skip this step and rely on Step 4's live deploy verification instead.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/trigger-daily-engine/index.ts
git commit -m "feat: add trigger-daily-engine Edge Function

Thin relay from the mobile app to GitHub's workflow_dispatch API for the
existing daily-cron.yml workflow -- no engine logic duplicated here."
```

- [ ] **Step 4: Deploy and configure the secret (needs Sohan's GitHub PAT)**

This step needs a human action that cannot be done non-interactively: generate a fine-grained GitHub PAT scoped to **Actions: write** on **smadimsetty/bulletproof only**, at https://github.com/settings/personal-access-tokens/new.

Once the PAT exists, run:

```bash
npx supabase login   # if not already linked
npx supabase link --project-ref <ref from SUPABASE_URL>
npx supabase secrets set GITHUB_PAT=<the PAT>
npx supabase functions deploy trigger-daily-engine
```

Verify the deploy by checking the function appears: `npx supabase functions list`.

---

### Task 6: End-to-end verification

**Files:** none (operational verification only — this project's established pattern for CI/infra-level changes, per `docs/superpowers/specs/2026-06-22-daily-cron-design.md`'s own verification approach).

- [ ] **Step 1: Confirm the Edge Function can really dispatch the workflow**

From a signed-in mobile app session (or via `supabase.functions.invoke('trigger-daily-engine')` in a quick authenticated script), invoke the deployed function and confirm a new run appears: `gh run list --workflow=daily-cron.yml --limit 1`.

- [ ] **Step 2: Confirm the guard prevents a duplicate run from doing real work**

With today's `recommendations` row already containing non-null `score_breakdown.readiness` (e.g. after Step 1's run completes), trigger the workflow again (`gh workflow run daily-cron.yml --ref master`) and check its logs print `"...already generated with real readiness data -- skipping."` rather than re-calling Oura/Claude.

- [ ] **Step 3: On-device walkthrough**

On a real device (TestFlight build, per this project's established on-device-verification pattern): clear/avoid today's recommendation (or test on a fresh day), open the app, and confirm the Home screen shows "Building today's program…", then renders the real program within roughly a minute without any manual action. Confirm pull-to-refresh works if you intentionally wait past 90s.

- [ ] **Step 4: Update the build log**

Append an entry to `docs/superpowers/reports/autonomous-build-log.md` describing what shipped (per this project's standing "keep docs updated" convention) and update `CLAUDE.md`'s Status section to reflect that on-demand triggering is live, noting the still-needed GitHub PAT/Edge Function deploy step if it hasn't happened yet by the time this is read.
