# HealthKit → Supabase Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HealthKit workout reading to the existing `apps/mobile/`
Expo app. On launch and on every foreground transition, request HealthKit
workout-read permission, fetch workout samples since the last sync (a
timestamp tracked in `AsyncStorage`), map them into the `activity` table's
shape, and upsert via the already-authenticated Supabase client. This is
the actual fix for the Apple Watch workout gap that started the mobile
interface pivot (see
`docs/superpowers/specs/2026-06-22-mobile-interface-design.md`).

**Architecture:** One new module, `apps/mobile/lib/healthkitSync.ts`,
exporting a single `syncHealthKitWorkouts()` function, wired into the
existing `apps/mobile/App.tsx` via a new `useEffect` (launch) and an
`AppState` listener (foreground). Uses `@kingstinct/react-native-healthkit`
(chosen and researched in
`docs/superpowers/specs/2026-06-22-healthkit-sync-design.md` Decision 1)
for the native HealthKit bindings, `@react-native-async-storage/async-storage`
(already a dependency) for the last-synced timestamp, and the existing
`supabase` client from `apps/mobile/lib/supabase.ts` for the upsert. No new
Supabase migration — the RLS policies needed already exist.

**Tech Stack:** Expo SDK 56, React Native 0.85.3, React 19.2.3, TypeScript
(`apps/mobile/tsconfig.json`'s `strict: true`), `@kingstinct/react-native-healthkit`
v14.x (+ its peer dependency `react-native-nitro-modules`), Jest for the
one pure-function unit test, EAS Build for the Custom Dev Client this
feature requires.

## Global Constraints

- **This requires a Custom Dev Client, never Expo Go.** HealthKit bindings
  are native (Swift) code compiled via `react-native-nitro-modules` — Expo
  Go's sandboxed runtime does not include either. Every task below that
  touches `apps/mobile/lib/healthkitSync.ts` or `App.tsx` is verified by
  TypeScript compilation, `expo-doctor`, and `expo export` bundling — never
  by "run it in Expo Go and look." The one task that needs a real device
  (Task 6) says so explicitly and is the only task gated on physical
  hardware.
- **No Supabase migration in this plan.** RLS already grants the
  `authenticated` role full read/write on `activity`
  (`authenticated_read_write_activity`, live since
  `supabase/migrations/20260622130000_rename_authenticated_rls_policies.sql`).
  If any task seems to need a new policy, that's a signal something is
  wrong with the plan, not a reason to add one.
- **`activity`, never `sessions`.** HealthKit-sourced workouts are
  auto-detected activity data, the same category Oura's workout
  auto-detection already populates in `activity`
  (`supabase/migrations/20260622022456_create_activity.sql`). `sessions`
  is confirmed training history with its own enum and a
  `recommendation_id` foreign key the engine manages — this plan never
  writes to it.
- **Row mapping mirrors `to_activity_row`'s shape exactly** (see
  `prototyping/weight-tuning/oura_pull.py`), per
  `docs/superpowers/specs/2026-06-22-healthkit-sync-design.md` Decision 5:
  same `activity`-table columns, same inner `workouts` jsonb dict shape
  (`activity`, `intensity`, `calories`, `distance`, `start_datetime`,
  `end_datetime`, `source`) — only the source-specific field values differ.
  `source` is the literal string `"healthkit"` for every row this plan
  writes.
- **AsyncStorage key name:** `@bulletproof/healthkit-last-synced`, storing
  an ISO-8601 string. Never reuse or collide with Supabase's own
  AsyncStorage keys (it manages `sb-<project-ref>-auth-token`-style keys
  itself — distinct in shape, no actual collision risk, but never read or
  write those keys from this plan's code either).
- **First-ever sync looks back 30 days**, not all of HealthKit history —
  per the design spec's Decision 5/Approach. This is a sync-correctness
  default, not a historical-backfill feature (backfill stays out of
  scope).
- **HealthKit permission types requested:** `WorkoutTypeIdentifier` (the
  only type actually queried this plan) plus three quantity types
  requested defensively for forward compatibility but not queried this
  plan — `activeEnergyBurned`, `distanceWalkingRunning`, `stepCount` (see
  design spec Decision 2). Never request `sleep` or `heartRate` types —
  those belong to `recovery`, which stays Oura-sourced.
- **Permission requests must always precede queries.** The chosen
  module's own documentation states that querying before
  `requestAuthorization` resolves crashes the app. Every code path that
  calls `queryWorkoutSamples` must be downstream of an `await
  requestAuthorization(...)` call in the same function, no exceptions.
- This repo is public — never commit secrets. This plan adds no new
  secrets; it only adds a new native dependency and application code.
- `apps/mobile/AGENTS.md` instructs reading the versioned Expo SDK 56 docs
  (`https://docs.expo.dev/versions/v56.0.0/`) before writing Expo-specific
  config — this plan's `app.json` edit (Task 2) and EAS build step (Task
  6) should be cross-checked against those docs if anything in this plan's
  config looks stale by the time it's executed.

---

### Task 1: Install `@kingstinct/react-native-healthkit` and its peer dependency

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/package-lock.json`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: the `@kingstinct/react-native-healthkit` and
  `react-native-nitro-modules` packages installed in
  `apps/mobile/node_modules`, importable by Task 3's
  `lib/healthkitSync.ts` as `import HealthKit, { WorkoutActivityType,
  WorkoutTypeIdentifier, QuantityTypeIdentifier } from
  '@kingstinct/react-native-healthkit'`.

- [ ] **Step 1: Install via `npx expo install`**

Run (from `apps/mobile/`):
```bash
npx expo install @kingstinct/react-native-healthkit react-native-nitro-modules
```
Expected: both packages added to `apps/mobile/package.json`'s
`dependencies`, `apps/mobile/package-lock.json` updated, command exits 0
with no peer-dependency warnings (`expo install` resolves Expo-SDK-compatible
versions automatically, the same mechanism already used for
`@supabase/supabase-js` etc. in the bootstrap plan's Task 4).

- [ ] **Step 2: Verify the install resolved cleanly**

Run: `cat apps/mobile/package.json` and confirm both new packages appear
under `dependencies` with version ranges (not `"latest"` or a git URL —
`expo install` always pins to a real published version compatible with
the installed Expo SDK).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat: install HealthKit bindings for mobile app"
```

---

### Task 2: Add the Expo config plugin and HealthKit entitlement to `app.json`

**Files:**
- Modify: `apps/mobile/app.json`

**Interfaces:**
- Consumes: nothing from earlier tasks except the installed package from
  Task 1 (the config plugin `npx expo install` just added must be
  registered before any build picks it up).
- Produces: an `app.json` that, when built via EAS (Task 6), generates the
  native HealthKit capability/entitlement and `Info.plist` usage-description
  strings automatically — Task 6's build step depends on this being
  correct first.

- [ ] **Step 1: Add the plugin entry**

Open `apps/mobile/app.json`. It currently ends with the `extra`/`owner`
keys inside the `expo` object (no `plugins` array exists yet). Add a
`plugins` array as a new top-level key inside `"expo"`:

```json
{
  "expo": {
    "name": "mobile",
    "slug": "mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "ios": {
      "bundleIdentifier": "com.sohan.bulletproof",
      "supportsTablet": true,
      "usesAppleSignIn": true,
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      [
        "@kingstinct/react-native-healthkit",
        {
          "NSHealthShareUsageDescription": "Bulletproof reads your workouts from Apple Health to track pickleball, running, and gym sessions for your daily training recommendation.",
          "NSHealthUpdateUsageDescription": "Bulletproof does not write any data to Apple Health.",
          "background": false
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "e33508b8-cbaf-4e38-a565-25125d749a0e"
      }
    },
    "owner": "smadimsetty"
  }
}
```

Notes on the values chosen:
- `NSHealthShareUsageDescription` is the read-permission prompt text shown
  to the user — written in plain language describing exactly what this
  plan does (reads workouts, feeds the recommendation), not generic
  boilerplate.
- `NSHealthUpdateUsageDescription` is required by the plugin even though
  this plan never writes to HealthKit (`toShare` is never used) — stated
  honestly as "does not write," which is accurate and avoids implying a
  write feature that doesn't exist.
- `background: false` — matches the design spec's Decision 3
  (foreground-only sync, no `enableBackgroundDelivery` entitlement
  requested). Leaving this `false` means the plugin does not add the
  `com.apple.developer.healthkit.background-delivery` entitlement, keeping
  the app's capability surface no larger than what this plan actually
  uses.

- [ ] **Step 2: Verify the JSON is valid and the plugin is registered**

Run: `npx expo config --json --type public` (from `apps/mobile/`) and
confirm the output's `plugins` array includes an entry for
`@kingstinct/react-native-healthkit` (Expo resolves plugin config into the
generated native project config — this command surfaces parse errors in
`app.json` immediately if the JSON is malformed, without needing a full
build).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app.json
git commit -m "feat: configure HealthKit Expo plugin and usage descriptions"
```

---

### Task 3: Write the row-mapping logic and its unit test

**Files:**
- Create: `apps/mobile/lib/healthkitMapping.ts`
- Create: `apps/mobile/lib/__tests__/healthkitMapping.test.ts`
- Modify: `apps/mobile/package.json` (add `jest`, `@types/jest`,
  `ts-jest` devDependencies and a `test` script)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure functions, no native module
  import — deliberately kept separate from `lib/healthkitSync.ts` so the
  mapping logic is testable without mocking `@kingstinct/react-native-healthkit`
  or Supabase).
- Produces: `groupWorkoutsByLocalDate(samples)` and
  `toActivityRows(groupedByDate)` — Task 4's `lib/healthkitSync.ts` imports
  both and chains them between the HealthKit query and the Supabase
  upsert.

- [ ] **Step 1: Install Jest**

Run (from `apps/mobile/`):
```bash
npm install --save-dev jest @types/jest ts-jest
```

- [ ] **Step 2: Add the Jest config and test script to `package.json`**

The current `apps/mobile/package.json` has no `test` script and no
`devDependencies` beyond `@types/react`/`typescript`. Update it to:

```json
{
  "name": "mobile",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "@supabase/supabase-js": "^2.108.2",
    "expo": "~56.0.12",
    "expo-apple-authentication": "~56.0.4",
    "expo-status-bar": "~56.0.4",
    "react": "19.2.3",
    "react-native": "0.85.3",
    "react-native-url-polyfill": "^3.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/react": "~19.2.2",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "~6.0.3"
  },
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testPathIgnorePatterns": ["/node_modules/"]
  },
  "private": true
}
```

(Leave `@kingstinct/react-native-healthkit` and `react-native-nitro-modules`
under `dependencies` exactly as Task 1's `expo install` placed them — this
step only adds the `devDependencies`/`scripts`/`jest` keys around them.)

- [ ] **Step 3: Write the mapping module**

Create `apps/mobile/lib/healthkitMapping.ts`:

```ts
// apps/mobile/lib/healthkitMapping.ts
//
// Pure row-mapping logic from HealthKit workout samples to the `activity`
// table's shape. Mirrors prototyping/weight-tuning/oura_pull.py's
// to_activity_row field-for-field (same `workouts` jsonb inner shape),
// with HealthKit's fields substituted for Oura's. See
// docs/superpowers/specs/2026-06-22-healthkit-sync-design.md Decision 5
// for the full field-mapping rationale.

export interface MinimalWorkoutSample {
  readonly uuid: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly workoutActivityTypeName: string;
  readonly totalEnergyBurnedKcal: number | null;
  readonly totalDistanceMeters: number | null;
}

export interface ActivityWorkoutEntry {
  activity: string;
  intensity: null;
  calories: number | null;
  distance: number | null;
  start_datetime: string;
  end_datetime: string;
  source: 'healthkit';
}

export interface ActivityRow {
  date: string;
  activity_score: null;
  total_calories: null;
  active_calories: null;
  steps: null;
  high_activity_time: null;
  medium_activity_time: null;
  low_activity_time: null;
  sedentary_time: null;
  workout_count: number;
  workouts: ActivityWorkoutEntry[];
}

/**
 * Local calendar date (YYYY-MM-DD) a workout's start time falls on, in the
 * device's current timezone -- matches Postgres `date` column semantics
 * (a single day, not a UTC-anchored instant).
 */
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Groups workout samples by the local calendar date of their start time.
 */
export function groupWorkoutsByLocalDate(
  samples: readonly MinimalWorkoutSample[]
): Map<string, MinimalWorkoutSample[]> {
  const grouped = new Map<string, MinimalWorkoutSample[]>();
  for (const sample of samples) {
    const day = localDateString(sample.startDate);
    const existing = grouped.get(day);
    if (existing) {
      existing.push(sample);
    } else {
      grouped.set(day, [sample]);
    }
  }
  return grouped;
}

/**
 * Maps a single workout sample to the `workouts` jsonb array's inner shape.
 */
function toWorkoutEntry(sample: MinimalWorkoutSample): ActivityWorkoutEntry {
  return {
    activity: sample.workoutActivityTypeName,
    intensity: null,
    calories: sample.totalEnergyBurnedKcal,
    distance: sample.totalDistanceMeters,
    start_datetime: sample.startDate.toISOString(),
    end_datetime: sample.endDate.toISOString(),
    source: 'healthkit',
  };
}

/**
 * Maps grouped-by-date workout samples into `activity`-table-shaped rows,
 * one per date. Day-level aggregate columns (activity_score,
 * total_calories, steps, etc.) are null -- this phase only queries
 * workout samples, not the day-level quantity types (see design spec
 * Decision 2).
 */
export function toActivityRows(
  groupedByDate: Map<string, MinimalWorkoutSample[]>
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const [date, samples] of groupedByDate) {
    rows.push({
      date,
      activity_score: null,
      total_calories: null,
      active_calories: null,
      steps: null,
      high_activity_time: null,
      medium_activity_time: null,
      low_activity_time: null,
      sedentary_time: null,
      workout_count: samples.length,
      workouts: samples.map(toWorkoutEntry),
    });
  }
  return rows;
}
```

- [ ] **Step 4: Write the unit test**

Create `apps/mobile/lib/__tests__/healthkitMapping.test.ts`:

```ts
// apps/mobile/lib/__tests__/healthkitMapping.test.ts
import {
  groupWorkoutsByLocalDate,
  localDateString,
  toActivityRows,
  type MinimalWorkoutSample,
} from '../healthkitMapping';

function sample(overrides: Partial<MinimalWorkoutSample>): MinimalWorkoutSample {
  return {
    uuid: 'test-uuid',
    startDate: new Date('2026-06-20T22:00:00.000Z'),
    endDate: new Date('2026-06-20T23:30:00.000Z'),
    workoutActivityTypeName: 'pickleball',
    totalEnergyBurnedKcal: 450,
    totalDistanceMeters: null,
    ...overrides,
  };
}

describe('localDateString', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(localDateString(new Date(2026, 5, 20, 14, 30))).toBe('2026-06-20');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateString(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});

describe('groupWorkoutsByLocalDate', () => {
  it('groups multiple samples on the same local date together', () => {
    const morning = sample({
      startDate: new Date(2026, 5, 20, 7, 0),
      endDate: new Date(2026, 5, 20, 7, 30),
      workoutActivityTypeName: 'running',
    });
    const evening = sample({
      startDate: new Date(2026, 5, 20, 18, 0),
      endDate: new Date(2026, 5, 20, 19, 30),
      workoutActivityTypeName: 'pickleball',
    });

    const grouped = groupWorkoutsByLocalDate([morning, evening]);

    expect(grouped.size).toBe(1);
    expect(grouped.get('2026-06-20')).toHaveLength(2);
  });

  it('keeps separate dates in separate groups', () => {
    const day1 = sample({ startDate: new Date(2026, 5, 20, 7, 0) });
    const day2 = sample({ startDate: new Date(2026, 5, 21, 7, 0) });

    const grouped = groupWorkoutsByLocalDate([day1, day2]);

    expect(grouped.size).toBe(2);
    expect(grouped.has('2026-06-20')).toBe(true);
    expect(grouped.has('2026-06-21')).toBe(true);
  });

  it('returns an empty map for no samples', () => {
    expect(groupWorkoutsByLocalDate([]).size).toBe(0);
  });
});

describe('toActivityRows', () => {
  it('maps a single day with one workout to one activity row', () => {
    const grouped = groupWorkoutsByLocalDate([
      sample({
        startDate: new Date(2026, 5, 20, 18, 0),
        endDate: new Date(2026, 5, 20, 19, 30),
        workoutActivityTypeName: 'pickleball',
        totalEnergyBurnedKcal: 520,
        totalDistanceMeters: null,
      }),
    ]);

    const rows = toActivityRows(grouped);

    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-06-20');
    expect(rows[0].workout_count).toBe(1);
    expect(rows[0].activity_score).toBeNull();
    expect(rows[0].workouts).toEqual([
      {
        activity: 'pickleball',
        intensity: null,
        calories: 520,
        distance: null,
        start_datetime: new Date(2026, 5, 20, 18, 0).toISOString(),
        end_datetime: new Date(2026, 5, 20, 19, 30).toISOString(),
        source: 'healthkit',
      },
    ]);
  });

  it('sets workout_count to the number of samples on that day', () => {
    const grouped = groupWorkoutsByLocalDate([
      sample({ startDate: new Date(2026, 5, 20, 7, 0), workoutActivityTypeName: 'running' }),
      sample({ startDate: new Date(2026, 5, 20, 18, 0), workoutActivityTypeName: 'pickleball' }),
    ]);

    const rows = toActivityRows(grouped);

    expect(rows).toHaveLength(1);
    expect(rows[0].workout_count).toBe(2);
    expect(rows[0].workouts.map((w) => w.activity)).toEqual(['running', 'pickleball']);
  });

  it('passes through a null totalDistance as null distance', () => {
    const grouped = groupWorkoutsByLocalDate([
      sample({ totalDistanceMeters: null }),
    ]);

    const rows = toActivityRows(grouped);

    expect(rows[0].workouts[0].distance).toBeNull();
  });

  it('returns an empty array for an empty grouping', () => {
    expect(toActivityRows(new Map())).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the tests**

Run (from `apps/mobile/`): `npm test`
Expected: all tests pass (9 tests across 3 describe blocks). This is a
pure-TypeScript test suite with zero native-module or network
dependencies, so it runs identically in this sandboxed environment and
later in CI — no device or Dev Client needed for this task.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/healthkitMapping.ts apps/mobile/lib/__tests__/healthkitMapping.test.ts apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat: add HealthKit-to-activity row mapping with unit tests"
```

---

### Task 4: Write the sync orchestration module

**Files:**
- Create: `apps/mobile/lib/healthkitSync.ts`

**Interfaces:**
- Consumes: `groupWorkoutsByLocalDate`, `toActivityRows`, and the
  `MinimalWorkoutSample` type from `apps/mobile/lib/healthkitMapping.ts`
  (Task 3); the `supabase` client from `apps/mobile/lib/supabase.ts`
  (pre-existing); `@kingstinct/react-native-healthkit`'s
  `requestAuthorization`, `isHealthDataAvailable`, `queryWorkoutSamples`,
  `WorkoutTypeIdentifier`, `WorkoutActivityType`, `QuantityTypeIdentifier`
  (Task 1's install).
- Produces: an exported `syncHealthKitWorkouts()` async function — Task 5's
  `App.tsx` edit imports and calls it from a `useEffect` and an `AppState`
  listener.

- [ ] **Step 1: Write the module**

Create `apps/mobile/lib/healthkitSync.ts`:

```ts
// apps/mobile/lib/healthkitSync.ts
//
// Reads HealthKit workout samples since the last sync and upserts them
// into the `activity` table. See
// docs/superpowers/specs/2026-06-22-healthkit-sync-design.md for the full
// design (Decisions 2-6 cover permission scope, sync trigger, the
// AsyncStorage timestamp key, row mapping, and permission-before-query
// ordering respectively).
import AsyncStorage from '@react-native-async-storage/async-storage';
import HealthKit, {
  QuantityTypeIdentifier,
  WorkoutActivityType,
  WorkoutTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import type { WorkoutProxyTyped } from '@kingstinct/react-native-healthkit';
import { supabase } from './supabase';
import {
  groupWorkoutsByLocalDate,
  toActivityRows,
  type MinimalWorkoutSample,
} from './healthkitMapping';

export const LAST_SYNCED_STORAGE_KEY = '@bulletproof/healthkit-last-synced';

/** First-ever sync (no stored timestamp yet) looks back this many days. */
const FIRST_SYNC_LOOKBACK_DAYS = 30;

/**
 * HealthKit read permissions this app requests. Only `WorkoutTypeIdentifier`
 * is actually queried this phase -- the three quantity types are requested
 * now, once, for forward compatibility (see design spec Decision 2) so a
 * future feature querying them doesn't need a second permission prompt.
 */
const READ_PERMISSIONS = [
  WorkoutTypeIdentifier,
  QuantityTypeIdentifier.activeEnergyBurned,
  QuantityTypeIdentifier.distanceWalkingRunning,
  QuantityTypeIdentifier.stepCount,
];

function toMinimalSample(workout: WorkoutProxyTyped): MinimalWorkoutSample {
  return {
    uuid: workout.uuid,
    startDate: workout.startDate,
    endDate: workout.endDate,
    workoutActivityTypeName:
      WorkoutActivityType[workout.workoutActivityType] ?? 'other',
    totalEnergyBurnedKcal: workout.totalEnergyBurned?.quantity ?? null,
    totalDistanceMeters: workout.totalDistance?.quantity ?? null,
  };
}

async function getSinceDate(): Promise<Date> {
  const stored = await AsyncStorage.getItem(LAST_SYNCED_STORAGE_KEY);
  if (stored) {
    return new Date(stored);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - FIRST_SYNC_LOOKBACK_DAYS);
  return fallback;
}

/**
 * Reads HealthKit workout samples since the last sync and upserts them
 * into the `activity` table. Safe to call repeatedly (idempotent upsert
 * keyed on `date`) and safe to call when HealthKit is unavailable or
 * permission is denied -- both cases skip silently rather than throwing,
 * since this is a read-augmentation feature that must never block the
 * rest of the app from working.
 */
export async function syncHealthKitWorkouts(): Promise<void> {
  const available = await HealthKit.isHealthDataAvailable();
  if (!available) {
    return;
  }

  try {
    await HealthKit.requestAuthorization({ toRead: READ_PERMISSIONS });
  } catch (err) {
    console.warn('HealthKit authorization request failed or was denied:', err);
    return;
  }

  const since = await getSinceDate();
  const now = new Date();

  let workouts: readonly WorkoutProxyTyped[];
  try {
    workouts = await HealthKit.queryWorkoutSamples({
      filter: {
        startDate: { predicateOperator: 'GREATERTHAN_OR_EQUALTO', date: since },
      },
      limit: 0,
      ascending: true,
    });
  } catch (err) {
    console.warn('HealthKit workout query failed:', err);
    return;
  }

  if (workouts.length > 0) {
    const minimalSamples = workouts.map(toMinimalSample);
    const grouped = groupWorkoutsByLocalDate(minimalSamples);
    const rows = toActivityRows(grouped);

    const { error } = await supabase.from('activity').upsert(rows, { onConflict: 'date' });
    if (error) {
      console.warn('Failed to upsert HealthKit workouts into activity:', error.message);
      return;
    }
  }

  await AsyncStorage.setItem(LAST_SYNCED_STORAGE_KEY, now.toISOString());
}
```

- [ ] **Step 2: Type-check the new module**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: exits 0, no type errors. This is the load-bearing check for this
task — it confirms `WorkoutProxyTyped`'s actual fields (`uuid`,
`startDate`, `endDate`, `workoutActivityType`, `totalEnergyBurned`,
`totalDistance`), `WorkoutActivityType`'s reverse string-lookup behavior
(TypeScript numeric enums support `EnumName[value]` to get the member
name back), and the `queryWorkoutSamples` filter shape all line up with
what Task 1 actually installed, without needing a native build to find
out.

If this fails with a type error on the `filter.startDate` predicate shape
specifically (the date-comparison filter syntax is the part of this
module least directly confirmed against the installed package version,
since it was reconstructed from the library's general `FilterForSamplesBase`
pattern rather than a workout-specific code example) -- check the
installed version's actual type at
`apps/mobile/node_modules/@kingstinct/react-native-healthkit/lib/typescript/src/types/QueryOptions.d.ts`
and adjust the predicate shape in `healthkitSync.ts` to match exactly
before proceeding. Do not loosen the surrounding code with an `as any` to
silence the error.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/healthkitSync.ts
git commit -m "feat: add HealthKit sync orchestration"
```

---

### Task 5: Wire the sync into `App.tsx` (launch + foreground triggers)

**Files:**
- Modify: `apps/mobile/App.tsx`

**Interfaces:**
- Consumes: `syncHealthKitWorkouts` from `apps/mobile/lib/healthkitSync.ts`
  (Task 4).
- Produces: a running app that calls the sync on launch and on every
  foreground transition. Nothing downstream in this plan consumes this
  task's output directly -- it is the user-facing wiring, verified in Task
  6.

- [ ] **Step 1: Add the sync calls**

Replace `apps/mobile/App.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { syncHealthKitWorkouts } from './lib/healthkitSync';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState('not signed in');
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    syncHealthKitWorkouts().catch((err) => {
      console.warn('HealthKit sync failed on launch:', err);
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current !== 'active' && nextState === 'active') {
        syncHealthKitWorkouts().catch((err) => {
          console.warn('HealthKit sync failed on foreground:', err);
        });
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);

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

  return (
    <View style={styles.container}>
      <Text>{session ? `Signed in as ${session.user.id}` : status}</Text>
      {!session && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={5}
          style={styles.button}
          onPress={handleSignIn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { width: 200, height: 44 },
});
```

Note: the sync runs regardless of sign-in state in this plan (it's HealthKit
read + Supabase write, not gated on the Apple Sign-In UI flow shown above).
Since RLS requires an `authenticated` Supabase session for the `activity`
upsert to succeed, an unauthenticated launch will have `syncHealthKitWorkouts`
attempt the HealthKit read successfully but the Supabase upsert will fail
RLS and `console.warn` -- this is acceptable for this plan (no silent data
loss, no crash) and matches the existing app's behavior of not gating any
other functionality on sign-in state either. A future task could add a
session check before syncing; not needed for this plan's scope.

- [ ] **Step 2: Type-check**

Run (from `apps/mobile/`): `npx tsc --noEmit`
Expected: exits 0. Confirms `AppState`'s import from `react-native` and
the ref-based previous-state tracking pattern type-check correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.tsx
git commit -m "feat: trigger HealthKit sync on launch and foreground"
```

---

### Task 6: Verify what's checkable without a device, then build and verify on the physical iPhone

**Files:** None (verification only).

**Interfaces:**
- Consumes: the complete feature from Tasks 1-5.
- Produces: a working, TestFlight/Dev-Client-installed build with real
  HealthKit data flowing into `activity` -- the actual deliverable this
  whole plan was building toward.

This task has two halves with a hard line between them, per
`docs/superpowers/specs/2026-06-22-healthkit-sync-design.md`'s Testing
section: everything in Step 1 runs in this sandboxed environment with no
device; everything in Step 2 requires the user's physical iPhone and
cannot be completed by an agent.

- [ ] **Step 1: Run every device-independent check (agent-executable)**

Run all of the following from `apps/mobile/` and confirm each passes
before moving to Step 2:

```bash
npx tsc --noEmit
```
Expected: exits 0 (re-confirms Tasks 4-5's type-checks against the full
project, not just the files touched in isolation).

```bash
npx expo-doctor
```
Expected: no errors related to `@kingstinct/react-native-healthkit` or
`react-native-nitro-modules` (an "untested on New Architecture" warning
for an unrelated package, if one appears, is not a failure condition for
this task -- only warnings/errors naming this plan's own new dependencies
block progress here).

```bash
npx expo export --platform ios
```
Expected: completes with a built bundle in `apps/mobile/dist/`, no
bundler/resolution errors. This confirms the JS side of the new sync code
is import-clean and syntactically sound, independent of any native build.

```bash
npm test
```
Expected: the Task 3 unit tests still pass (re-run here as a final gate
before the device-only half of this task, catching any accidental
regression from Tasks 4-5's edits to files Task 3's tests don't directly
cover).

If any of these four commands fail, fix the issue and re-run all four
before proceeding -- do not proceed to Step 2 with a known failing check.

- [ ] **Step 2: Device-only verification (human-only, cannot be automated)**

This step cannot be completed by an agent in this pipeline -- it requires
the user's physical iPhone, a real HealthKit permission prompt, and real
Apple Watch workout data. None of this exists in any simulator (the iOS
Simulator has no HealthKit store at all) or in Expo Go (which cannot load
this native module).

1. **Build a Dev Client.** Run: `eas build --platform ios --profile
   development` (from `apps/mobile/`). This reuses the existing EAS project
   configuration from the bootstrap plan's Task 8 (`apps/mobile/eas.json`'s
   `development` profile, `developmentClient: true`); it does not need new
   EAS configuration, only a new build to pick up the native dependency
   added in Task 1. Expected: build succeeds (watch via `eas build:list` or
   the provided URL) and produces an installable `.ipa`.

2. **Install on the phone.** Install the resulting Dev Client build (via
   the QR code/link EAS provides, or TestFlight if submitted via the
   `preview` profile instead). Open it.

3. **Confirm the permission prompt appears.** On first launch after this
   build, expect the system HealthKit permission sheet to appear, listing
   "Workouts" (and the three quantity types from this plan's
   `READ_PERMISSIONS`) as requested read categories. Tap **Allow All** (or
   selectively allow at minimum Workouts -- a partial grant should not
   crash the app, since `requestAuthorization`'s rejection path in
   `healthkitSync.ts` is wrapped in a `try`/`catch`).

4. **Confirm a real workout syncs.** If there's an existing Apple Watch
   workout (pickleball, running, or a gym session) within the last 30 days,
   confirm it appears as a new row in the `activity` table (check via the
   Supabase dashboard's table editor or `supabase db remote` SQL) with
   `source: "healthkit"` inside that date's `workouts` jsonb array. This is
   the literal regression test for the bug that started this whole pivot
   (see `docs/superpowers/specs/2026-06-22-mobile-interface-design.md`'s
   Background section) -- the workout must show up via this path even with
   Oura's API contributing nothing for that date.

5. **Confirm idempotency.** Force-quit and reopen the app a second time
   without logging any new workout. Confirm no duplicate `activity` rows
   appear (the `date` unique constraint plus the upsert's `onConflict:
   'date'` should make this a no-op write, not an error) and confirm
   `AsyncStorage`'s stored timestamp under the
   `@bulletproof/healthkit-last-synced` key has advanced (inspectable via
   React Native DevTools/Flipper if available, or by adding a temporary
   debug `console.log` and checking Metro's log output over a USB-connected
   session).

6. **Confirm a real new workout syncs going forward.** Log a new workout
   on the Apple Watch (or manually add one in the Health app for a faster
   test loop), background and reopen the app, and confirm that specific
   workout's row appears in `activity` without needing a fresh app
   install or a cleared AsyncStorage.

No commit for this step -- it is verification against a live build and a
live database, not a code change. If any of these checks fail, the
specific failure (permission denial behavior, query filter shape, upsert
RLS error, etc.) should be diagnosed by editing the relevant file from
Tasks 3-5 and re-running Step 1's device-independent checks before
attempting another device build, rather than iterating directly on-device
build-by-build.

---

**End state after this plan:** the mobile app reads real Apple Watch
workout data directly from HealthKit on every launch and foreground
transition, maps it into the `activity` table's existing shape, and
upserts it through the already-authenticated, RLS-secured Supabase client
-- with Oura's API entirely out of the loop for this data path. This is
the literal fix for the bug that motivated the mobile interface pivot. The
next phase (recommendation/summary UI, backlog item 5 in
`docs/superpowers/specs/2026-06-22-autonomous-build-pipeline-design.md`)
can now render against real `activity` data sourced independently of
Oura's API gap.
