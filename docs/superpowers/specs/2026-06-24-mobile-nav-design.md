# Mobile navigation (Phase 3) — design spec

## Background

`apps/mobile/` is currently a single-screen Expo app: `App.tsx` owns all
state (Supabase auth session, HealthKit sync trigger, today's/yesterday's
recommendation fetch) and renders either an Apple Sign-In button (no
session) or a scrollable recommendation view (session present), registered
via `index.ts`'s `registerRootComponent(App)`. There is no router and no
second screen. `apps/mobile/AGENTS.md` flags that Expo has changed
materially since training-data knowledge and instructs reading
`https://docs.expo.dev/versions/v56.0.0/` before writing any code — this was
done for this spec (see Decision 1 for what was verified and from which
exact pages).

The v2 design (`docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`,
"Mobile UI (Phases 3, 5-7)" section, "Phase 3 — navigation" subsection) calls
for: "add Expo Router (file-based, first-party with the pinned Expo SDK).
Restructure `App.tsx` into `app/_layout.tsx` (root: auth gate + global
persistent active-session banner), `app/(tabs)/_layout.tsx` (bottom tabs:
Home/Trends/Settings), `app/(tabs)/index.tsx`, `app/(tabs)/trends.tsx`,
`app/(tabs)/settings.tsx`, `app/logger/[blockId].tsx` (modal, not a tab)."

This phase is purely structural: move the existing sign-in/signed-out
conditional exactly as it behaves today into the new file-based tree, add
the tab shell, and stub the four new route files with placeholder content.
Phases 5-7 (Home, Logger, Trends) and Phase 4 (Settings) fill in real
content later — this phase's job is only to make the screens *reachable*.
The global persistent active-session banner mentioned in the v2 design's
root-layout description is explicitly Phase 6 scope (it depends on
`sessions.started_at`/`ended_at`, the Start/End workout flow, which doesn't
exist yet) — this phase's root layout is the auth gate only, with a comment
marking where the banner will later attach.

## Goals

- Add `expo-router` (and its required peer packages) to `apps/mobile/`,
  matching the exact current API verified against
  `https://docs.expo.dev/versions/v56.0.0/` and its linked router pages
  (not a remembered/older Expo Router shape).
- Restructure the project so `app/` (not `App.tsx`) is the entry point:
  `package.json`'s `main` becomes `expo-router/entry`, `app.json` gains the
  `expo-router` config plugin and a URL `scheme`.
- `app/_layout.tsx`: migrate the existing session-state/auth logic
  (`supabase.auth.getSession()`, `onAuthStateChange`, `handleSignIn`'s Apple
  Sign-In call) from `App.tsx` verbatim — same calls, same error handling,
  same not-signed-in UI — gated via `Stack.Protected`, the current
  documented Expo Router auth pattern.
- `app/(tabs)/_layout.tsx`: a bottom tab bar with exactly 3 tabs (Home,
  Trends, Settings), text-label tabs (no icon library added this phase —
  see Decision 6).
- `app/(tabs)/index.tsx`, `app/(tabs)/trends.tsx`, `app/(tabs)/settings.tsx`:
  placeholder screens (a centered `Text` naming the screen) — Phases 4/5/7
  fill these in.
- `app/logger/[blockId].tsx`: a modal-presented dynamic route, reachable via
  `router.push()`, placeholder content that echoes the `blockId` param back
  (proves the dynamic segment plumbing works) — Phase 6 fills this in.
- Acceptance bar (restated from the dispatch): the app still builds, still
  signs in with Apple exactly as before, and now shows a tab bar with 3 tabs
  plus a reachable (even if placeholder) logger route.

## Non-goals (explicitly out of scope for this phase)

- Any redesign of the auth flow itself — the exact same Supabase calls,
  same Apple Sign-In button, same error-message-in-`Text` UI. This phase is
  a structural move, not an auth rewrite.
- The global persistent active-session banner (Phase 6 — depends on
  `sessions.started_at`/`ended_at` and the Start/End workout flow, neither
  of which exists yet).
- Real content for Home/Trends/Settings/Logger (Phases 4-7).
- `@expo/vector-icons` or any icon library/tab-bar icon (Decision 6 — text
  labels only this phase; icons are a visual-polish concern for the Phase
  5-7 Oura-inspired design pass, not navigation plumbing).
- Moving `lib/healthkitSync.ts`'s call site logic — it still gets invoked
  from the same place in the migrated tree (the root layout, once signed
  in), unchanged in behavior, just relocated from `App.tsx`'s `useEffect`
  to `app/_layout.tsx`'s.
- Typed routes (`experiments.typedRoutes`) — left off this phase; nothing
  in this phase's stub screens needs compile-time route-param typing, and
  turning it on is a one-line, reversible follow-up once real `Link`/
  `router.push()` call sites with real param shapes exist in Phase 6.
- Removing `App.tsx`/`index.ts` from the repo outright — see Decision 5.
- Web target changes (`react-native-web`/`react-dom`) — `apps/mobile` has
  no web target today (`expo start --web` exists as a script but nothing
  depends on it shipping); not adding those two optional packages this
  phase since nothing in CLAUDE.md or the v2 design calls for a mobile-web
  target.

## Decisions

Ambiguities resolved here since this phase runs autonomously with no
interactive Sohan review.

1. **Expo Router API verified live against the v56 docs this session, not
   assumed from training data.** Fetched
   `https://docs.expo.dev/versions/v56.0.0/` (router section index),
   `https://docs.expo.dev/router/installation/`,
   `https://docs.expo.dev/router/basics/core-concepts/`,
   `https://docs.expo.dev/router/basics/notation/`,
   `https://docs.expo.dev/router/basics/navigation-layouts/`,
   `https://docs.expo.dev/router/basics/common-navigation-patterns/`,
   `https://docs.expo.dev/router/advanced/tabs/`, and
   `https://docs.expo.dev/router/advanced/modals/`. Confirmed shape:
   - Install: `npx expo install expo-router react-native-safe-area-context
     react-native-screens expo-linking expo-constants expo-status-bar`
     (`expo-status-bar` is already a dependency; the other four are net
     new).
   - `package.json`: `"main": "expo-router/entry"` replaces
     `"main": "index.ts"`.
   - `app.json`: add `"scheme": "bulletproof"` (deep-link scheme, required
     for the router's linking config) and `"plugins": ["expo-router"]`
     alongside the existing `@kingstinct/react-native-healthkit` plugin
     entry.
   - No `babel.config.js`/`metro.config.js` changes needed — SDK 56's
     default Expo babel/metro config already understands `expo-router`
     once the config plugin is registered in `app.json`; this project has
     no `babel.config.js` today and none is being added.
   - File-based routing root is `app/` at the project root (not
     `src/app/`) — this project has no `src/` directory today, so `app/`
     sits beside `lib/`, matching the existing flat layout.
   - **Auth gating uses `Stack.Protected` with a `guard` prop** — the
     current documented pattern
     (`https://docs.expo.dev/router/basics/common-navigation-patterns/`),
     superseding any older remembered pattern (a manual `Slot`/conditional
     return, or `expo-router`'s older `useProtectedRoutes`-style hooks from
     pre-v6 docs). `Stack.Protected guard={!!session}` wraps the `(tabs)`
     group and `logger` route; a second `Stack.Protected
     guard={!session}` wraps a `sign-in` route. The router automatically
     redirects to the first available unguarded-or-now-guarded route when
     `guard` flips, which is exactly the existing app's behavior (session
     appears → recommendation view replaces the sign-in button) reproduced
     declaratively instead of via a manual `if (!session) return ...`.
   - **Bottom tabs use the JS `<Tabs>`/`<Tabs.Screen>` API from
     `expo-router`** (`https://docs.expo.dev/router/advanced/tabs/`), not
     the newer native-tabs API (`expo-router/unstable-native-tabs` /
     "Native tabs" page) — native tabs is flagged experimental/unstable in
     the v56 docs' own navigation ("Native tabs" sits in the same section
     as "Experimental Stack"); the JS `<Tabs>` component is the stable,
     long-documented path and CLAUDE.md's "rules first, no speculative
     complexity" posture favors the stable choice for pure navigation
     plumbing. Revisit if a later phase has a specific reason to want
     native tab-bar chrome.
   - **Dynamic/modal route**: `app/logger/[blockId].tsx`, paired with a
     `Stack.Screen name="logger/[blockId]" options={{ presentation:
     'modal' }}` entry in the root `_layout.tsx`'s `Stack`, param read via
     `useLocalSearchParams<{ blockId: string }>()`
     (`https://docs.expo.dev/router/advanced/modals/`).

2. **Root layout structure: `Stack` with three protected groups, not a bare
   conditional return.** `app/_layout.tsx` renders:
   ```
   <Stack>
     <Stack.Protected guard={!!session}>
       <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
       <Stack.Screen name="logger/[blockId]" options={{ presentation: 'modal', title: 'Log session' }} />
     </Stack.Protected>
     <Stack.Protected guard={!session}>
       <Stack.Screen name="sign-in" options={{ headerShown: false }} />
     </Stack.Protected>
   </Stack>
   ```
   This requires a new `app/sign-in.tsx` route carrying exactly the
   not-signed-in JSX `App.tsx` renders today (the `status` `Text` +
   `AppleAuthentication.AppleAuthenticationButton`) and exactly the same
   `handleSignIn` function. The session-loading/auth-state-change
   `useEffect` pair, `loadRecommendations`/HealthKit-sync `useEffect`, and
   `recommendations` state all move into `app/_layout.tsx` itself (not
   into `(tabs)/index.tsx`) — `App.tsx` already runs sync/fetch from a
   single shared place regardless of which sub-view renders, and the v2
   design explicitly assigns the root layout this responsibility
   ("root: auth gate + global persistent active-session banner"). The
   `recommendations` state and `loadRecommendations` callback are passed
   to `(tabs)/index.tsx` later (Phase 5) via a shared context or
   route-param mechanism not yet decided — out of scope this phase, since
   `(tabs)/index.tsx` is a placeholder with no real content to receive
   them yet. For *this* phase, the recommendations fetch/HealthKit-sync
   `useEffect` is migrated verbatim into `_layout.tsx` so its *behavior*
   (network calls happen on sign-in and on foreground) is unchanged, even
   though nothing renders its result yet — `(tabs)/index.tsx` is a stub.
   This keeps the migration honest to "exactly as-is" for the auth/sync
   side effects while not inventing a premature state-sharing mechanism
   the dispatch didn't ask for.

3. **Tab bar contents and route names.** Per the v2 design's explicit list:
   `app/(tabs)/_layout.tsx` declares exactly 3 `Tabs.Screen` entries —
   `index` (title "Home"), `trends` (title "Trends"), `settings` (title
   "Settings") — in that order, matching file order `index.tsx`,
   `trends.tsx`, `settings.tsx`. No icons (Decision 6). No fourth tab for
   the logger — it is explicitly "modal, not a tab" per the v2 design, kept
   as a sibling route outside `(tabs)` and reached via `router.push()`, not
   the tab bar.

4. **Placeholder screen content: minimal but distinguishable, with a
   manual nav affordance to the logger stub.** Each of `index.tsx`/
   `trends.tsx`/`settings.tsx` renders a centered `View`/`Text` naming the
   screen (e.g. "Home — coming in Phase 5"), so a human tester can
   visually confirm which tab is active without reading file names.
   `index.tsx` additionally renders one `Pressable`/`Text` link
   (`router.push('/logger/demo-block')`) so the logger route's
   reachability (the acceptance bar's explicit requirement) is manually
   verifiable in one tap rather than only by URL/deep-link. This is a
   placeholder affordance, not real product UI — Phase 6 replaces it with
   the real per-block "Log this" entry point from the Home program card.

5. **`App.tsx`/`index.ts` are deleted, not left dead in the tree.** Expo
   Router's `expo-router/entry` becomes the sole entry point
   (`package.json`'s `main`); leaving `App.tsx`/`index.ts` present but
   unused would read as a leftover/ambiguous dual-entry-point setup to any
   future reader and risks someone editing the dead file by mistake. Their
   logic is fully accounted for: sign-in JSX/handler → `app/sign-in.tsx`,
   session/HealthKit/recommendations effects → `app/_layout.tsx`,
   recommendation-card JSX/styles → temporarily dropped (no current
   renderer needs them this phase; `(tabs)/index.tsx` is a stub) but not
   lost — they live unchanged in git history and Phase 5's plan will lift
   them back out verbatim into the real Home screen. `git rm` both files
   in the same task that adds the router tree, so there is never a commit
   with two competing entry points.

6. **No icon library added this phase.** `@expo/vector-icons` is bundled
   with the `expo` package's typical template usage but is not currently a
   dependency of this project and the v2 design's "calm, minimal,
   Oura-inspired" visual direction is explicitly scoped to Phases 5-7
   ("apply this as each screen is rebuilt, not as a separate retrofit
   pass"). Adding an icon dependency for tab-bar chrome that gets restyled
   in a later phase anyway would be exactly the kind of premature/
   speculative addition CLAUDE.md's "no over-engineering" convention
   warns against. Text-label tabs satisfy this phase's acceptance bar
   ("shows a tab bar with 3 tabs") without it.

7. **`scheme` value: `"bulletproof"`.** Required by Expo Router for deep
   linking; no existing scheme is configured today (the v1 app never
   needed one, having no router). `"bulletproof"` matches the project's
   own name and the `com.sohan.bulletproof` iOS bundle identifier already
   in `app.json`, so it reads as an obvious, non-arbitrary choice rather
   than inventing unrelated branding.

8. **`recommendations.ts`'s exported `SessionType` union still lists the
   dropped v1 enum values (`upper_a`/`upper_b`/`lower_a`/`lower_b`)** even
   though `docs/superpowers/specs/2026-06-23-bulletproof-v2-design.md`
   simplified `session_type` to 6 values back in the schema-v2 phase. This
   is a pre-existing inconsistency from an earlier phase, not something
   this navigation-only phase touches — `lib/recommendations.ts` is moved
   into the new tree unchanged (it's already correctly placed at
   `lib/recommendations.ts`, outside `app/`, so "moved" really means
   "untouched"). Flagging it here so it isn't mistaken for a regression
   introduced by this phase; fixing it is a separate, later cleanup (or
   folds naturally into whichever Phase 5 task next touches
   `recommendations.ts` for the real Home screen).

9. **Tests location and scope.** No new automated test framework
   work is needed for route *files themselves* (Expo Router file
   conventions are declarative — there's no meaningful unit test for "does
   this file export a default component" beyond what `tsc`/the Expo build
   already verifies). The existing `lib/*.test.ts` files
   (`healthkitMapping`, `recommendations`, `sessionTypeLabels`) are
   untouched and must continue passing via `npm test` (Jest) — they test
   `lib/`, which doesn't move. Verification for this phase is functional
   (the app builds and the tab bar / modal route are reachable), not a new
   unit-test surface — consistent with how `2026-06-22-mobile-app-bootstrap.md`
   and `2026-06-22-recommendation-ui.md` (the only prior mobile-app plans)
   verified UI-shell work: TypeScript compiles clean and `expo start`
   actually renders, rather than inventing component-render tests for a
   project with no existing RN testing-library dependency.

## Out of scope

Restated from Non-goals for plan-writing clarity:

- Auth-flow behavior changes of any kind.
- The active-session banner (Phase 6).
- Real Home/Trends/Settings/Logger content (Phases 4-7).
- Any icon library.
- Typed routes.
- Web target packages (`react-native-web`, `react-dom`).
- Fixing `recommendations.ts`'s stale `SessionType` union.
