# Stage 4 — Redesign + flow pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle and re-flow every screen per the visual design spec, without changing behaviour.

**Architecture:** New tokens in `lib/theme.ts` (with temporary legacy aliases so untouched screens keep compiling), a primitives library in `components/ui/`, then screen-by-screen restyles. Logic stays where it is; screens swap presentation only.

**Tech Stack:** Expo SDK 56, React Native StyleSheet, `react-native-reanimated` + `react-native-worklets` (controller installs), `expo-haptics`, `@expo/vector-icons` Ionicons, `react-native-gifted-charts`.

**Spec:** `docs/superpowers/specs/2026-11-08-visual-design.md` (the source of truth for every value, component and layout) and `docs/superpowers/specs/2026-11-08-finish-the-app-design.md` §3 Stage 4.

## Global Constraints

- The task list **is** the visual spec's §7 "Implementation order", steps 1–21, executed in that order; each step = one task = one commit (`style: <step name>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- **Behaviour must not change.** Data calls, state machines, timers, completion logic, RLS-relevant queries: untouched. If a restyle seems to need a logic change, stop and leave a `// TODO(stage4):` note instead — the controller decides.
- No new styling library. All exact values (colours, sizes, radii, motion, haptics, copy) come from the visual spec; don't invent new ones.
- **No network / live commands** (no supabase CLI, curl, python, eas, npm/expo install, git push; never read `.env`). Allowed: `npx jest`, `npx tsc --noEmit`, `npx expo export --platform ios --output-dir <scratch dir outside the repo>` (bundle-compile check, offline), git commit.
- Tests that assert on rendered text/styles may need updating; logic tests must keep passing unchanged.
- Every step ends green: `npx jest && npx tsc --noEmit`.

## Review Focus

1. Reduce Motion on → every animation falls back to a fade/no-op (spec §2.5).
2. 375pt-wide screen (iPhone SE/mini) with Dynamic Type 1.2× → no clipped buttons or overlapping numerals in the logger, Progress and Feed.
3. Logger as `fullScreenModal`: minimise → banner shows → tapping the banner reopens the same workout; the swipe-down/back gesture never discards.
4. Keyboard over the bottom sets in the logger still scrolls into view (`automaticallyAdjustKeyboardInsets` kept).
5. Light-mode device setting → app stays dark (`userInterfaceStyle: dark`), status bar light.

---

### Tasks 1–21

Follow `docs/superpowers/specs/2026-11-08-visual-design.md` §7 steps 1–21 exactly, each as its own task with the step's referenced spec sections as its requirements. Step 20's PNG rendering and step 1's package installs are controller steps (the implementer writes the SVG source files and leaves `TODO(controller)` notes). Step 21 (flow sweep) is run by an Opus reviewer, not an implementer.
