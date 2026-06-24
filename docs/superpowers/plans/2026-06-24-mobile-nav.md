# Mobile navigation (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Expo Router (file-based routing) to `apps/mobile/`, per
`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`'s "Phase 3 —
navigation" subsection and the fuller detail in
`docs/superpowers/specs/2026-06-24-mobile-nav-design.md`. Migrate the
existing sign-in/signed-out conditional from `App.tsx` into `app/_layout.tsx`
exactly as-is, add the 3-tab bottom navigation shell
(Home/Trends/Settings), and stub `app/(tabs)/index.tsx`,
`app/(tabs)/trends.tsx`, `app/(tabs)/settings.tsx`, and
`app/logger/[blockId].tsx` with placeholder content. Acceptance bar: the app
still builds, still signs in with Apple exactly as before, and now shows a
tab bar with 3 tabs plus a reachable (even if placeholder) logger route.

**Architecture:** `expo-router/entry` replaces `index.ts` as the app's
entry point. `app/_layout.tsx` becomes the new root component, carrying
every side effect `App.tsx` ran today (Supabase session subscription,
HealthKit sync trigger, recommendations fetch) and gating its children with
`Stack.Protected` — the current (SDK 56 / Expo Router v6) documented auth
pattern verified live against `https://docs.expo.dev/versions/v56.0.0/` and
its linked router pages (see design spec Decision 1 for the full citation
list). Signed-out renders `app/sign-in.tsx` (the exact JSX/handler
`App.tsx` used for its not-signed-in state); signed-in renders the
`(tabs)` group (`app/(tabs)/_layout.tsx`'s `<Tabs>` with 3 screens) plus the
sibling modal route `app/logger/[blockId].tsx`. `App.tsx`/`index.ts` are
deleted in the same task that adds the router tree — see design spec
Decision 5.

**Tech Stack:** Expo SDK ~56, Expo Router (installed via `expo install` for
SDK-compatible versions), React Native 0.85, TypeScript (strict mode,
already configured), Jest (existing `lib/*.test.ts` suite, untouched by this
plan).

## Global Constraints

- **Auth behavior must not change.** Every Supabase call, every Apple
  Sign-In call, every error-handling branch in `App.tsx` today must appear
  unchanged (same function bodies, same conditions) somewhere in the new
  tree after this plan — `app/_layout.tsx` for the session/effects,
  `app/sign-in.tsx` for the sign-in button/handler. This is a structural
  move, not a rewrite.
- **No icon library.** Tabs use text titles only this phase (design spec
  Decision 6) — do not add `@expo/vector-icons` or any other icon
  dependency.
- **No typed routes, no web target packages.** `experiments.typedRoutes`
  stays off; `react-native-web`/`react-dom` are not added (design spec
  Non-goals).
- **`App.tsx` and `index.ts` are deleted**, not left dead in the tree
  (design spec Decision 5) — done in the same task/commit that lands the
  router tree, so no commit in this plan's history has two competing entry
  points.
- **Every package version is installed via `npx expo install <pkg>`**, not
  hand-typed into `package.json` — this is the only way to get versions
  actually compatible with the pinned `expo@~56.0.12`, and is itself the
  documented installation method (design spec Decision 1).
- **Run `npm test` (the existing Jest suite under `lib/`) after every task
  that touches `apps/mobile/`** to confirm `lib/*.test.ts` still passes —
  none of those files move or change in this plan, so a failure means
  something broke that shouldn't have.
- **Run `npx tsc --noEmit` after every task** to confirm the TypeScript
  build stays clean — this project has no RN component-rendering test
  setup, so a clean strict-mode compile plus a manual `expo start` check
  (Task 6) is this plan's verification bar, matching how the only two
  prior mobile-app plans (`2026-06-22-mobile-app-bootstrap.md`,
  `2026-06-22-recommendation-ui.md`) verified UI-shell work.
- **Commit after every task**, matching the existing per-task commit
  convention visible in `git log`.
- **Work happens in the worktree at `C:\Dev\bulletproof-mobile-nav` on
  branch `pipeline/mobile-nav`** — do not touch the main checkout at
  `C:\Dev\Bulletproof`.

---

### Task 1: Install Expo Router and its peer dependencies

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`, not hand-edited)
- Modify: `apps/mobile/package-lock.json` (auto-updated)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `expo-router`, `react-native-safe-area-context`,
  `react-native-screens`, `expo-linking`, `expo-constants` available as
  dependencies for every later task's imports. `expo-status-bar` is already
  present and is left as-is (the install command is idempotent/no-op for
  packages already satisfied).

- [ ] **Step 1: install the packages**

From `apps/mobile/`, run:

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

This resolves and installs versions compatible with the pinned
`expo@~56.0.12`, updating `package.json`'s `dependencies` and
`package-lock.json` in place. Do not hand-edit version numbers — accept
whatever `expo install` resolves.

- [ ] **Step 2: verify the install**

Run `cat apps/mobile/package.json` (or open it) and confirm `expo-router`,
`react-native-safe-area-context`, `react-native-screens`, `expo-linking`,
`expo-constants` now appear under `dependencies`.

- [ ] **Step 3: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: all existing tests in
`lib/*.test.ts` still pass (this task touches no source files, only
dependencies, so a failure here would indicate an install problem, not a
code problem).

- [ ] **Step 4: commit**

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "chore: install expo-router and its peer dependencies"
```

---

### Task 2: Wire up `app.json` and `package.json` for file-based routing

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Consumes: `expo-router` installed in Task 1.
- Produces: `expo-router/entry` as the app's real entry point and a
  `bulletproof` deep-link scheme — both required before any `app/` route
  file can be loaded (Task 3 onward).

- [ ] **Step 1: change `package.json`'s entry point**

Read `apps/mobile/package.json`'s current `"main"` field
(`"main": "index.ts"`). Edit it to:

```json
  "main": "expo-router/entry",
```

- [ ] **Step 2: add the router plugin and scheme to `app.json`**

Edit `apps/mobile/app.json`. Add a top-level `"scheme": "bulletproof"` field
(placed after `"version"`, matching the existing key ordering style), and
add `"expo-router"` as the first entry in the existing `"plugins"` array
(before the `@kingstinct/react-native-healthkit` entry, since `expo-router`
is the simpler string-form plugin and conventionally listed first). The
full resulting file:

```json
{
  "expo": {
    "name": "mobile",
    "slug": "mobile",
    "version": "1.0.0",
    "scheme": "bulletproof",
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
      "expo-router",
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

- [ ] **Step 3: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: still all passing (no source
files touched yet, only config).

- [ ] **Step 4: commit**

```bash
git add apps/mobile/app.json apps/mobile/package.json
git commit -m "chore: configure expo-router entry point, scheme, and config plugin"
```

---

### Task 3: Add `app/sign-in.tsx` and `app/_layout.tsx` — migrate the auth gate verbatim

**Files:**
- Create: `apps/mobile/app/sign-in.tsx`
- Create: `apps/mobile/app/_layout.tsx`
- Delete: `apps/mobile/App.tsx`
- Delete: `apps/mobile/index.ts`

**Interfaces:**
- Consumes: `apps/mobile/lib/supabase.ts`'s `supabase` client (unchanged),
  `apps/mobile/lib/healthkitSync.ts`'s `syncHealthKitWorkouts` (unchanged),
  `apps/mobile/lib/recommendations.ts`'s `fetchRecommendations` (unchanged).
- Produces: the root `Stack` with `Stack.Protected` auth gating that every
  later task's routes (`(tabs)`, `logger/[blockId]`) render inside. This is
  the task that actually moves `App.tsx`'s logic — every later task only
  adds new leaf screens, it does not touch this file's auth/effect logic
  again.

- [ ] **Step 1: create `apps/mobile/app/sign-in.tsx`**

This carries exactly `App.tsx`'s not-signed-in JSX and `handleSignIn`
function, unchanged:

```tsx
// apps/mobile/app/sign-in.tsx
//
// The signed-out screen. Rendered by app/_layout.tsx's Stack.Protected
// guard when there is no Supabase session. This is App.tsx's original
// not-signed-in JSX and handleSignIn handler, moved verbatim -- see
// docs/superpowers/specs/2026-06-24-mobile-nav-design.md Decision 2.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';

export default function SignIn() {
  const [status, setStatus] = useState('not signed in');

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

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { width: 200, height: 44 },
});
```

- [ ] **Step 2: create `apps/mobile/app/_layout.tsx`**

This carries `App.tsx`'s session-subscription effect and
HealthKit-sync/recommendations-fetch effect, unchanged in behavior, plus the
new `Stack.Protected` auth gate (design spec Decision 1/2):

```tsx
// apps/mobile/app/_layout.tsx
//
// Root layout: owns the Supabase auth session subscription and the
// HealthKit-sync/recommendations-fetch side effects App.tsx used to own,
// then gates its children with Stack.Protected based on session presence
// -- the current documented Expo Router auth pattern (see
// docs/superpowers/specs/2026-06-24-mobile-nav-design.md Decision 1/2).
//
// The recommendations state fetched here isn't rendered by anything yet
// -- app/(tabs)/index.tsx is a placeholder until Phase 5 -- but the fetch
// itself (and the HealthKit sync trigger) must keep firing on sign-in and
// on app-foreground exactly as it did in App.tsx, so the side effects are
// migrated verbatim rather than dropped.
//
// TODO(Phase 6): the v2 design's root-layout responsibility also includes
// a global persistent active-session banner (sessions.started_at/ended_at,
// Start/End workout flow) -- not built yet, intentionally deferred per
// docs/superpowers/specs/2026-06-24-mobile-nav-design.md's Non-goals. It
// will render here, as a sibling to the Stack, once that data exists.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { syncHealthKitWorkouts } from '../lib/healthkitSync';
import { fetchRecommendations, RecommendationPublicRow } from '../lib/recommendations';

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

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
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
      // No authenticated session yet: skip HealthKit and the recommendations
      // fetch entirely. HealthKit shouldn't burn its one-shot iOS permission
      // prompt before the user has signed in and RLS would actually allow
      // the upsert to persist; the recommendations fetch has nothing useful
      // to show before sign-in either, since recommendations_public still
      // requires an authenticated (or anon) request through this same
      // client.
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

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="logger/[blockId]"
          options={{ presentation: 'modal', title: 'Log session' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
```

Note: `recommendations` is computed but intentionally unused by any render
in this task — `(tabs)/index.tsx` (Task 4) is a placeholder. This will
produce a TypeScript "declared but never read"-style situation only if
`noUnusedLocals` were enabled; check `apps/mobile/tsconfig.json` (it
extends `expo/tsconfig.base` with only `strict` and `types` set, no
`noUnusedLocals`), so this compiles clean as-is. If a future Expo
tsconfig default ever turns that on, Phase 5 consuming this state resolves
it naturally — not a concern for this task.

- [ ] **Step 3: delete the old entry-point files**

```bash
git rm apps/mobile/App.tsx apps/mobile/index.ts
```

(Design spec Decision 5 — `expo-router/entry`, set as `main` in Task 2, is
now the sole entry point. Every line of logic from both deleted files is
accounted for: sign-in JSX/handler → `app/sign-in.tsx` above; session/
HealthKit/recommendations effects → `app/_layout.tsx` above;
`App.tsx`'s signed-in recommendation-card JSX/styles are not carried
forward by this task — `(tabs)/index.tsx`, added in Task 4, is a stub: the
real card JSX still exists unchanged in git history at the commit being
removed here, for Phase 5 to lift back out verbatim.)

- [ ] **Step 4: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: `lib/*.test.ts` still pass
(none of those files were touched). Run `npx tsc --noEmit` from
`apps/mobile/`. Expected: this will report errors about missing
`(tabs)` and `logger/[blockId]` route modules referenced by
`Stack.Screen`'s `name` prop only if Expo Router's typed-routes checking is
on — it is not (Non-goals), so `Stack.Screen`'s `name` is a plain string
prop with no compile-time route existence check; expect a clean compile.
If `tsc` does report an error, it is almost certainly an unrelated/
pre-existing one — do not silence it without reading it first.

- [ ] **Step 5: commit**

```bash
git add apps/mobile/app/sign-in.tsx apps/mobile/app/_layout.tsx
git commit -m "feat: migrate auth gate from App.tsx into app/_layout.tsx and app/sign-in.tsx"
```

---

### Task 4: Add the `(tabs)` group — Home, Trends, Settings stubs

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/app/(tabs)/trends.tsx`
- Create: `apps/mobile/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `expo-router`'s `Tabs`/`Tabs.Screen` (Task 1), `expo-router`'s
  `useRouter` (for `index.tsx`'s logger-reachability link, design spec
  Decision 4).
- Produces: the 3-tab bottom navigation the acceptance bar requires,
  rendered as `app/_layout.tsx`'s `(tabs)` route (Task 3 already wired the
  `Stack.Screen name="(tabs)"` entry pointing at this group).

- [ ] **Step 1: create `apps/mobile/app/(tabs)/_layout.tsx`**

```tsx
// apps/mobile/app/(tabs)/_layout.tsx
//
// Bottom tab bar: Home / Trends / Settings, per
// docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md's "Phase 3 --
// navigation" subsection. Text-label tabs only this phase -- no icon
// library added (see docs/superpowers/specs/2026-06-24-mobile-nav-design.md
// Decision 6). Real content for each tab lands in Phases 4/5/7.
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="trends" options={{ title: 'Trends' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: create `apps/mobile/app/(tabs)/index.tsx`**

Includes the one manual nav affordance to the logger stub (design spec
Decision 4), so the acceptance bar's "reachable logger route" is verifiable
in one tap:

```tsx
// apps/mobile/app/(tabs)/index.tsx
//
// Home tab placeholder. Real content (YesterdaySummaryCard +
// TodayProgramCard) lands in Phase 5. The "Open logger (demo)" link exists
// only so this phase's acceptance bar -- a reachable logger route -- is
// manually verifiable from the running app, not just by deep link; Phase 6
// replaces it with the real per-block "Log this" entry point.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home — coming in Phase 5</Text>
      <Pressable onPress={() => router.push('/logger/demo-block')}>
        <Text style={styles.link}>Open logger (demo)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 18, fontWeight: '600' },
  link: { fontSize: 16, color: '#0066CC' },
});
```

- [ ] **Step 3: create `apps/mobile/app/(tabs)/trends.tsx`**

```tsx
// apps/mobile/app/(tabs)/trends.tsx
//
// Trends tab placeholder. Real content (time-range selector, AI summary,
// sleep/training overlay, muscle-group volume chart) lands in Phase 7.
import { StyleSheet, Text, View } from 'react-native';

export default function Trends() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trends — coming in Phase 7</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
```

- [ ] **Step 4: create `apps/mobile/app/(tabs)/settings.tsx`**

```tsx
// apps/mobile/app/(tabs)/settings.tsx
//
// Settings tab placeholder. Real content (preferred split, activities,
// pains, goals, training frequency, diet, weight/birth date, location,
// HealthKit toggle) lands in Phase 4.
import { StyleSheet, Text, View } from 'react-native';

export default function Settings() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings — coming in Phase 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600' },
});
```

- [ ] **Step 5: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: still all passing. Run
`npx tsc --noEmit` from `apps/mobile/`. Expected: clean compile.

- [ ] **Step 6: commit**

```bash
git add "apps/mobile/app/(tabs)"
git commit -m "feat: add bottom-tab layout with Home/Trends/Settings stubs"
```

---

### Task 5: Add `app/logger/[blockId].tsx` — the modal logger stub

**Files:**
- Create: `apps/mobile/app/logger/[blockId].tsx`

**Interfaces:**
- Consumes: `expo-router`'s `useLocalSearchParams` (Task 1). The modal
  presentation itself is already configured by Task 3's
  `Stack.Screen name="logger/[blockId]"` entry in `app/_layout.tsx` — this
  task only adds the route's own component.
- Produces: the reachable placeholder logger route the acceptance bar
  requires, navigable from `(tabs)/index.tsx`'s demo link (Task 4) or any
  future `router.push('/logger/<real-block-id>')` call.

- [ ] **Step 1: create `apps/mobile/app/logger/[blockId].tsx`**

```tsx
// apps/mobile/app/logger/[blockId].tsx
//
// Logger placeholder, presented as a modal (configured in
// app/_layout.tsx's Stack.Screen options). Echoes the blockId route param
// back to prove the dynamic-segment plumbing works end to end -- real
// content (pre-populated exercises, MobilityChecklistRow/StrengthSetRow,
// swap/remove, Start/End workout) lands in Phase 6.
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function Logger() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logger — coming in Phase 6</Text>
      <Text style={styles.subtitle}>blockId: {blockId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  subtitle: { fontSize: 14, color: '#3A3A3C' },
});
```

- [ ] **Step 2: confirm nothing else broke**

Run `npm test --prefix apps/mobile`. Expected: still all passing. Run
`npx tsc --noEmit` from `apps/mobile/`. Expected: clean compile.

- [ ] **Step 3: commit**

```bash
git add "apps/mobile/app/logger"
git commit -m "feat: add placeholder logger modal route at logger/[blockId]"
```

---

### Task 6: Manual verification — app builds, signs in, tab bar and logger route work

**Files:** None (verification only — no source changes).

**Interfaces:**
- Consumes: every file from Tasks 1-5.
- Produces: confidence the acceptance bar is actually met, not just
  compiling — this project has no RN component-render test harness, so
  this manual pass is the real verification step, matching how
  `2026-06-22-mobile-app-bootstrap.md` and `2026-06-22-recommendation-ui.md`
  (the only two prior mobile-app plans) verified UI-shell work.

- [ ] **Step 1: clear the Metro cache and start the dev server**

From `apps/mobile/`, run:

```bash
npx expo start --clear
```

Expected: Metro bundles successfully with no red-screen errors about
missing `expo-router` modules, no "main" entry-point resolution errors, and
the QR code/dev menu appears.

- [ ] **Step 2: load the app on a simulator/device/Expo Go and confirm sign-in**

Open the app. Expected: the not-signed-in screen renders (Apple Sign-In
button, "not signed in" text) — i.e. `app/sign-in.tsx` is reached via the
`Stack.Protected guard={!session}` branch. Tap the Apple Sign-In button and
complete the flow (or, if no Apple Developer session is available in this
environment, confirm via `console.warn`/Metro logs that
`AppleAuthentication.signInAsync` is invoked and reaches the same
`supabase.auth.signInWithIdToken` call `App.tsx` made — full on-device
sign-in completion was already verified for this exact Apple/Supabase
wiring in the v1 mobile-app-bootstrap phase, so this step's bar is
"unchanged code path triggers," not "re-prove Apple Sign-In from scratch."

- [ ] **Step 3: confirm the tab bar appears once signed in**

After a session exists, expected: the `(tabs)` group renders with exactly 3
tabs labeled "Home", "Trends", "Settings", in that order. Tap each — each
shows its respective placeholder text ("Home — coming in Phase 5", etc.).

- [ ] **Step 4: confirm the logger route is reachable**

From the Home tab, tap "Open logger (demo)". Expected: a modal slides up
(bottom on iOS) showing "Logger — coming in Phase 6" and
"blockId: demo-block" — confirming the dynamic route segment correctly
receives its param. Dismiss the modal (swipe down or platform back
gesture) and confirm it returns to the Home tab cleanly.

- [ ] **Step 5: record the result**

No commit for this task (verification only). If any step fails, do not
mark this plan complete — return to the relevant earlier task and fix it,
re-running that task's own Step "confirm nothing else broke" before
re-attempting this task.
