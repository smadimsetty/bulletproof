# Stage 1 — Progress + stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Trends tab with a Progress tab (consistency streak + calendar, assessment trends, PRs, monthly recap), add PR toasts in the logger, PRs on the workout summary, and an exercise detail screen.

**Architecture:** One owner-scoped data fetch (`fetchStatsDataset`) feeds pure, unit-tested calculators in `lib/stats/`. Screens are thin. A new `user_settings` table (one row per user, lazily created, defaults when absent) holds the weekly goal and, from now on, the weight unit.

**Tech Stack:** Expo SDK 56, expo-router, supabase-js v2, `react-native-gifted-charts` (installed), `expo-web-browser`, `react-native-view-shot`, `expo-sharing` (installed by the controller before this stage runs), jest.

**Spec:** `docs/superpowers/specs/2026-11-08-finish-the-app-design.md` §3 Stage 1, §4.

## Global Constraints

- Paths relative to `apps/mobile/` unless starting with `supabase/` or `docs/`.
- **No network / live commands** (no supabase CLI, curl, python, eas, npm install, git push, never read `.env`). Only `npx jest`, `npx tsc --noEmit`, git commit. The controller applies migrations.
- Every `exercises` embed carries an FK hint (`exercises!workout_exercises_exercise_id_fkey(...)`).
- Weeks are ISO weeks, **Monday–Sunday in the device's local timezone**. Dates shown as `MMM D` (`Nov 8`) via `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })`.
- PR kinds and rules (spec, verbatim intent): per exercise, per side (`left`/`right`/`null`), completed sets of **finished** workouts, **warm-up sets excluded**:
  `longest_hold` (`duration_s`; exercise kind `hold` or `duration`), `best_rom` (`rom_value`, higher better, compared only within the same `rom_unit`; key includes the unit), `most_reps` (kind `reps`), `heaviest_weight` (kind `weight_reps`; ties → more reps wins). The first-ever log of an exercise/side/kind is **not** a PR. No 1RM, no volume.
- Set kind comes from `fieldsForExercise` in `lib/setFields.ts`.
- Styling with existing `lib/theme.ts` tokens; Stage 4 restyles. Icons via `Ionicons` from `@expo/vector-icons`.
- Commit after each task (message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); do not push.

## Review Focus

1. Streak across a week where the goal is met only in the current, unfinished week → counts; current week below goal → streak = previous consecutive met weeks (not 0).
2. A workout finished at 11:30pm Sunday local time but stored as Monday UTC → counted in Sunday's week/day (local), in both streak and calendar.
3. User with zero finished workouts / zero assessments → every Progress section renders an empty state, no crash, no NaN.
4. Unilateral PR: a new best on the left side only is a left PR; the right side is unaffected.
5. ROM PR comparing `cm` vs `deg` → never compared across units.

---

### Task 1: `user_settings` table + data layer

**Files:**
- Create: `supabase/migrations/20261108120000_create_user_settings.sql`
- Create: `lib/userSettings.ts`, `lib/userSettings.test.ts`
- Modify: `lib/userPreferences.ts` (`fetchWeightUnit` delegates to `fetchUserSettings`)

**Interfaces:**
- Produces:
  - `export interface UserSettings { weightUnit: 'kg' | 'lbs'; weeklyGoal: number; defaultVisibility: 'private' | 'followers' | 'public'; healthkitWriteEnabled: boolean; notifyFollows: boolean; notifyLikes: boolean; notifyComments: boolean }`
  - `export const DEFAULT_SETTINGS: UserSettings` = `{ weightUnit: 'lbs', weeklyGoal: 3, defaultVisibility: 'followers', healthkitWriteEnabled: false, notifyFollows: true, notifyLikes: true, notifyComments: true }`
  - `export async function fetchUserSettings(): Promise<UserSettings>` — `maybeSingle()`; no row → `DEFAULT_SETTINGS`.
  - `export async function updateUserSettings(patch: Partial<UserSettings>): Promise<UserSettings>` — `upsert` on `owner_id` with snake_case columns, returns the saved row mapped.

- [ ] **Step 1:** Migration: table `user_settings` — `owner_id uuid primary key references auth.users(id) on delete cascade default auth.uid()`, `weight_unit text not null default 'lbs' check (in ('kg','lbs'))`, `weekly_goal smallint not null default 3 check (between 1 and 14)`, `default_visibility text not null default 'followers' check (in ('private','followers','public'))`, `healthkit_write_enabled boolean not null default false`, `notify_follows/notify_likes/notify_comments boolean not null default true`, `updated_at timestamptz not null default now()`. RLS enabled; one policy `owner_all_user_settings for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())`. Backfill: `insert into user_settings (owner_id, weight_unit) select owner_id, weight_unit from user_profile where owner_id is not null on conflict do nothing;` (check `user_profile.weight_unit`'s real column name in `20260707090000_add_weight_unit_to_user_profile.sql`).
- [ ] **Step 2: Failing tests** (`lib/userSettings.test.ts`, supabase mocked like `lib/workouts.test.ts`): no row → `DEFAULT_SETTINGS`; row → camelCase mapping; `updateUserSettings({ weeklyGoal: 4 })` calls `upsert` with `{ weekly_goal: 4 }` and `onConflict: 'owner_id'`.
- [ ] **Step 3:** Implement; `fetchWeightUnit()` returns `(await fetchUserSettings()).weightUnit`. Settings screen's unit toggle (`app/(tabs)/settings.tsx`) also writes via `updateUserSettings({ weightUnit })` (in addition to its current write, so the old column stays in sync).
- [ ] **Step 4:** `npx jest lib/userSettings.test.ts && npx tsc --noEmit` pass; commit `feat: user_settings table with weekly goal and weight unit`.

### Task 2: Stats dataset + streak/calendar calculators

**Files:**
- Create: `lib/stats/dataset.ts`, `lib/stats/consistency.ts`, `lib/stats/consistency.test.ts`

**Interfaces:**
- Produces (`dataset.ts`):
  - `export interface StatsSet { side: 'left'|'right'|null; setType: 'warmup'|'working'; reps: number|null; weightKg: number|null; durationS: number|null; romValue: number|null; romUnit: 'cm'|'deg'|'in'|null; completedAt: string|null }`
  - `export interface StatsExercise { exerciseId: string; name: string; exerciseType: string|null; unilateral: boolean; sets: StatsSet[] }`
  - `export interface StatsWorkout { id: string; title: string; source: string; startedAt: string; endedAt: string; isSprint: boolean; exercises: StatsExercise[] }`
  - `export async function fetchStatsDataset(opts?: { exerciseIds?: string[] }): Promise<StatsWorkout[]>` — finished workouts only (`ended_at not null`), oldest first, with nested exercises/sets; with `exerciseIds`, filter `workout_exercises.exercise_id in (...)` via `!inner`.
- Produces (`consistency.ts`):
  - `export function localWeekStart(d: Date): string` — `YYYY-MM-DD` of the local Monday.
  - `export function localDay(iso: string): string` — local `YYYY-MM-DD`.
  - `export interface Consistency { currentStreak: number; bestStreak: number; thisWeekCount: number; weeklyGoal: number }`
  - `export function computeConsistency(endedAts: readonly string[], weeklyGoal: number, now: Date): Consistency` — weeks with ≥ goal workouts are "met"; current streak = consecutive met weeks ending at the current week if it's met, else ending at last week; best = longest run.
  - `export interface CalendarDay { date: string; inMonth: boolean; count: number; hasSprint: boolean; isToday: boolean }`
  - `export function monthGrid(year: number, month0: number, workouts: readonly { endedAt: string; isSprint: boolean }[], now: Date): CalendarDay[][]` — Monday-first weeks covering the month (leading/trailing days `inMonth: false`).

- [ ] **Step 1: Failing tests:** `localWeekStart` of a Sunday returns the previous Monday; streak: goal 3, last 3 weeks each 3 workouts, current week 1 → `currentStreak 3`; current week 3 → 4; a gap week resets current but `bestStreak` keeps the max; empty input → all zeros; `monthGrid(2026, 10, …)` (Nov 2026) → first row starts Mon Oct 26 with `inMonth false`, contains 5 rows; a workout ending `2026-11-09T04:30:00Z` with `TZ=America/New_York` counts on Nov 8 (set `process.env.TZ` in the test file before imports, or construct expectations via `localDay` so the test is TZ-robust — document which).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: stats dataset and consistency calculators`.

### Task 3: PR calculator

**Files:**
- Create: `lib/stats/prs.ts`, `lib/stats/prs.test.ts`

**Interfaces:**
- Produces:
  - `export type PrKind = 'longest_hold' | 'best_rom' | 'most_reps' | 'heaviest_weight';`
  - `export interface PrEvent { workoutId: string; exerciseId: string; exerciseName: string; side: 'left'|'right'|null; kind: PrKind; value: number; unit: string; previous: number; at: string }` (`unit`: `s` for holds, the rom unit, `reps`, `kg`; weight `previous`/`value` in kg — screens convert with `lib/units.ts`)
  - `export type Bests = Map<string, { value: number; reps?: number }>` keyed by `prKey(exerciseId, side, kind, romUnit?)`.
  - `export function prKey(exerciseId: string, side: string|null, kind: PrKind, romUnit?: string|null): string`
  - `export function setCandidates(exerciseType: string|null, unilateral: boolean, set: StatsSet): { kind: PrKind; value: number; reps?: number; romUnit?: string }[]` — what a completed working set could be a PR in.
  - `export function computePrEvents(workouts: readonly StatsWorkout[]): { events: PrEvent[]; bests: Bests }` — walk workouts oldest→newest; per workout compute each key's best candidate; it's an event iff a prior best exists and the candidate beats it; then fold into bests. One event per key per workout.
  - `export function isNewBest(bests: Bests, key: string, candidate: { value: number; reps?: number }): boolean` — false when the key is absent (first log).

- [ ] **Step 1: Failing tests:** first log → no event; second workout longer hold → one `longest_hold` event with `previous`; two improving sets in one workout → one event with the max; warm-up set ignored; left improvement → event `side: 'left'` only; rom 10cm then 20deg → no event (different units); heaviest_weight tie on weight with more reps → event; `isNewBest` absent key → false.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat: personal-record calculator`.

### Task 4: Assessment trends + monthly recap calculators

**Files:**
- Create: `lib/stats/assessmentTrends.ts` (+ test), `lib/stats/recap.ts` (+ test)
- Modify: `lib/sprintAssessment.ts` (add `fetchAllAssessments`)

**Interfaces:**
- Consumes: `PastAssessment`, `fetchAssessmentDefinitions` (Stage 0, `lib/sprintAssessment.ts`).
- Produces:
  - `export async function fetchAllAssessments(): Promise<(PastAssessment & { painPointId: string })[]>` — all completed, oldest first (same query shape as `fetchAssessmentHistory` without the pain-point filter).
  - `export interface TrendPoint { label: string; date: string; left?: number; right?: number; single?: number }` (`label` like `C1 base`, `C1 re`, `C2 base`)
  - `export interface TestTrend { testKey: string; name: string; unit: string; betterDirection: BetterDirection; isBilateral: boolean; isPassFail: boolean; points: TrendPoint[]; verdict: 'better'|'worse'|'same'|null }` (verdict first vs latest point, reuse Stage 0 `changeVerdict` semantics)
  - `export function buildTestTrends(definitions: readonly AssessmentDefinition[], assessments: readonly PastAssessment[]): TestTrend[]` (`isPassFail` = `unit === 'pass/fail'`)
  - `export interface MonthlyRecap { year: number; month0: number; workouts: number; activeDays: number; totalMinutes: number; longestDailyStreak: number; prs: PrEvent[]; topExercises: { name: string; sets: number }[]; sprintDaysLogged: number }`
  - `export function buildMonthlyRecap(workouts: readonly StatsWorkout[], prEvents: readonly PrEvent[], year: number, month0: number): MonthlyRecap` — local-time month membership by `endedAt`; minutes = Σ(ended−started) rounded; top 3 by completed working sets; `sprintDaysLogged` = workouts with `isSprint`.

- [ ] **Step 1: Failing tests:** trends: two assessments → two points with labels `C1 base`, `C1 re`, verdict per direction; definition without results → `points: []`, verdict null. Recap: empty month → zeros; longest daily streak across 3 consecutive local days = 3; top exercises ordering.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** commit `feat: assessment trend and monthly recap calculators`.

### Task 5: Progress tab (replaces Trends)

**Files:**
- Create: `app/(tabs)/progress.tsx`, `components/progress/ConsistencyCard.tsx`, `components/progress/MonthCalendar.tsx`, `components/progress/AssessmentTrendsSection.tsx`, `components/progress/RecentPrsCard.tsx`, `components/progress/RecapEntryCard.tsx`, `components/progress/WeeklyGoalSheet.tsx`
- Modify: `app/(tabs)/_layout.tsx` (tab `progress` titled `Progress` in place of `trends`)
- Delete: `app/(tabs)/trends.tsx`, `components/SleepTrainingChart.tsx`, `components/MuscleGroupVolumeChart.tsx`, `components/TrendsSummaryCard.tsx`, `components/BestLiftsSheet.tsx`, `components/TimeRangeSelector.tsx`, `lib/trendsHistory.ts`, `lib/trendsRange.ts`, `lib/trendsSummary.ts`, `lib/muscleGroupVolume.ts` and their tests — only after `grep` confirms nothing else imports each.

- [ ] **Step 1:** `progress.tsx` loads in parallel: `fetchStatsDataset()`, `fetchUserSettings()`, `fetchAllAssessments()`, `fetchPainPoints()`; definitions per assessed pain point. Focus reload is silent (pattern in `app/sprint.tsx`: `'initial' | 'refresh' | 'focus'`); pull-to-refresh; error state with working Retry; computes via Tasks 2–4.
- [ ] **Step 2:** ConsistencyCard: big current streak (`3 week streak`), best streak, `This week 2 / 3` with a simple progress ring (react-native-svg `Circle` with strokeDasharray), tap → WeeklyGoalSheet (stepper 1–14, Save → `updateUserSettings({ weeklyGoal })`, recompute). Empty: "Finish a workout to start a streak."
- [ ] **Step 3:** MonthCalendar: Mon–Sun header, `monthGrid` cells; a filled accent dot for days with workouts, an outlined ring when `hasSprint`, today bolded; ‹ › to change month (not past the current month).
- [ ] **Step 4:** AssessmentTrendsSection: card per pain point (display name), per test a gifted-charts `LineChart` (bilateral: `data` = left, `data2` = right, legend "L"/"R"; single: one line; height 120, labels from `label`) and a headline `first → latest unit` with verdict colour (`better` accent, `worse` danger, `same` muted). Pass/fail tests: a row of dots (filled = pass). Only 1 point → show the value, "Reassess to see a trend". Empty: "Complete an assessment in a sprint to see trends here."
- [ ] **Step 5:** RecentPrsCard: PR events in the last 30 days, newest first, max 5 (`Ankle CARs · Longest hold (L) · 75s ↑ from 60s`), weights converted to the user's unit; tap a row → `/exercise/<id>`. Empty: "No PRs yet — keep logging."
- [ ] **Step 6:** RecapEntryCard: "October recap" (previous month) and "November so far" → `/recap?year=&month=`.
- [ ] **Step 7:** Delete the old Trends files (grep first). `npx jest && npx tsc --noEmit` pass. Commit `feat: Progress tab replaces Trends`.

### Task 6: Monthly recap screen + share card

**Files:**
- Create: `app/recap.tsx`, `components/share/ShareCard.tsx`, `lib/shareImage.ts`
- Modify: `app/_layout.tsx` (register `recap` and `exercise/[exerciseId]` stack screens, titles `Monthly recap` / `Exercise`)

**Interfaces:**
- Produces: `export async function shareViewAsImage(ref: React.RefObject<View>, dialogTitle: string): Promise<void>` (`captureRef` from `react-native-view-shot`, `format: 'png'`, `quality: 1`, then `Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle })`; if `Sharing.isAvailableAsync()` is false, `Alert` "Sharing isn't available on this device."). `export default function ShareCard({ title, subtitle, stats, footer }: { title: string; subtitle: string; stats: { label: string; value: string }[]; footer?: string })` — fixed 1080×1350-ratio card (render at width 360, aspect 4:5), dark background `#0E0F12`, white text, accent from `COLORS.accent`, "BULLETPROOF" wordmark text bottom-left. Reused by Stage 3's workout share.

- [ ] **Step 1:** `recap.tsx`: reads `year`/`month` params (default previous month), month switcher, renders `buildMonthlyRecap` as stat tiles + PR list + top exercises; a `Share` button renders an offscreen-but-mounted `ShareCard` (positioned absolutely at `left: -10000`, `collapsable={false}`) and calls `shareViewAsImage`.
- [ ] **Step 2:** `npx tsc --noEmit` passes; commit `feat: monthly recap with shareable card`.

### Task 7: Exercise detail screen

**Files:**
- Create: `app/exercise/[exerciseId].tsx`, `lib/exerciseDetail.ts`

**Interfaces:**
- Consumes: `fetchStatsDataset({ exerciseIds: [id] })`, `computePrEvents`, `DescriptionToggleButton`/`useToggle` (Stage 0 `components/DescriptionToggle.tsx`).
- Produces: `export async function fetchExerciseInfo(id: string): Promise<{ id: string; name: string; exerciseType: string|null; unilateral: boolean; description: string|null; demoVideoUrl: string|null; bodyParts: string[]; equipment: string[] }>` (columns `evidence_rationale`, `demo_video_url`, `body_parts`, `equipment_needed`). `export function metricSeries(workouts: StatsWorkout[], exerciseId: string): { date: string; left?: number; right?: number; value?: number; unit: string }[]` — best working-set value per workout for the exercise's primary metric (hold s / reps / weight kg; plus a separate ROM series if any `rom_value` exists).

- [ ] **Step 1:** Test `metricSeries` in `lib/exerciseDetail.test.ts`: hold exercise, two workouts → two points with max `durationS`; unilateral → `left`/`right` filled.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Screen: name, type chip, eye-toggled description, `Watch demo` button when `demoVideoUrl` (`WebBrowser.openBrowserAsync`), current bests (per side), line chart of `metricSeries`, ROM chart if present, recent sets grouped by workout date (last 10 workouts). Empty history: "You haven't logged this yet."
- [ ] **Step 6:** Commit `feat: exercise detail screen`.

### Task 8: PR toast in the logger + PRs on the workout summary

**Files:**
- Create: `components/Toast.tsx`
- Modify: `app/workout/[workoutId].tsx`, `app/workout-summary/[workoutId].tsx`

**Interfaces:**
- Consumes: `fetchStatsDataset({ exerciseIds })`, `computePrEvents`, `setCandidates`, `prKey`, `isNewBest`.
- Produces: `export function useToast(): { show: (message: string) => void; element: JSX.Element | null }` — one toast at a time, slides/fades in at the top below the header (`Animated`), auto-hides after 2.5s.

- [ ] **Step 1:** Logger: when the workout's exercise id set changes, load `bests` for those ids from finished workouts **excluding the current workout** (`computePrEvents(dataset).bests`; dataset is finished-only so the in-progress workout is naturally excluded). After a set's completion write succeeds in `completeRow`, compute `setCandidates` for the completed values; for each candidate that `isNewBest` and hasn't toasted this session for that key at an equal-or-higher value, toast `New PR — <kind label> <value>` (labels: `Longest hold`, `Best ROM`, `Most reps`, `Heaviest`; side suffix ` (L)`/` (R)`; weight in user unit) and fire `Haptics.notificationAsync(Success)`. A bests-load failure means no toasts, never an error.
- [ ] **Step 2:** Workout summary: load `fetchStatsDataset({ exerciseIds })` for this workout's exercises, `computePrEvents`, filter events by `workoutId === this id`, render a "Personal records" card when non-empty.
- [ ] **Step 3:** `npx jest && npx tsc --noEmit` pass; commit `feat: PR toasts in the logger and PRs on the workout summary`.

---

## Controller-only steps

Before execution: `npx expo install expo-web-browser react-native-view-shot expo-sharing` (commit). After: `npx supabase migration list --linked` → `db push --linked`; RLS smoke for `user_settings` (2 users) added to `supabase/tests/rls_smoke_workouts.py` and run; embed smoke re-run; Opus review; fixes; `git push`.
