# Logger polish, exercise content, equipment tiers, new sprints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship build 23: a logger that feels instant and makes sounds, a working Live Activity, human one-liner cues + full exercise detail with video, equipment tiers, 3 new sprints, and a one-off "change today's focus".

**Architecture:** Data changes are plain SQL migrations (schema first, then content seeds authored offline from exported JSON). App changes are small focused libs (`lib/equipmentTiers.ts`, `lib/bodyParts.ts`, `lib/timerAlerts.ts`, `lib/focusSwap.ts`) wired into existing screens. Existing sprint code stays data-driven, so new sprints are content only.

**Tech Stack:** Expo SDK 56 / React Native 0.85, expo-router, Supabase (Postgres + RLS), expo-widgets + @expo/ui (Live Activity), expo-audio, expo-notifications, react-native-webview, Jest.

**Spec:** `docs/superpowers/specs/2026-11-09-logger-polish-and-sprints-design.md`

## Global Constraints

- Branch `logger-polish-and-sprints`. Commit only the files you changed (`git add <paths>`, never `git add -A`/`.`) — other agents work in the same tree concurrently.
- **No live database / no credentials.** Never read or source the repo-root `.env`, never run `npx supabase` commands, never curl Supabase. Migrations are written as files only; the orchestrator pushes them.
- **No Python.** Use `node` for any script. Do not run `python`, `python3` or `py`.
- Mobile checks run from `apps/mobile`: `npx jest <path>` and `npx tsc --noEmit`. Other agents edit concurrently, so judge tsc only on errors in files you touched.
- Migration filenames: `supabase/migrations/2026110915xxxx_<name>.sql`, numbered in the order listed in each task.
- Copy voice for cues/descriptions/taglines: a person giving direct instructions in plain words. Reference cue: *"Stand on one foot, close your eyes, and stay as still as you can."* Banned: "engage your core to…", "unlock", "great for", "this exercise", "helps to", em-dashes, exclamation marks, emojis, marketing adjectives.
- Styling: only `COLORS`/`TYPE`/spacing tokens from `apps/mobile/lib/theme.ts` and primitives in `apps/mobile/components/ui/`.
- Exported read-only data for content tasks: `docs/superpowers/content/2026-11-09/{library_exercises,sprint_pools,sprint_templates,assessments,pain_points}.json`.

## Review Focus

1. A Basic-tier user starts any of the 7 sprints → every day has every slot filled with a bodyweight exercise (Task 6 picker test + Task 8 live coverage query).
2. User has `equipment_tier = null` (existing users before answering) → picker behaves exactly as today (Task 6 test: null allows everything).
3. Timer stopped early / workout finished / discarded while a timer-end notification is scheduled → no stray notification fires later (Task 4 test on cancel).
4. Exercise with no cue / no description / no video (custom exercises) → eye icon hidden, detail screen omits empty sections, "Video coming soon" shown (Task 5 tests).
5. ✓ tapped and the network write fails → set reverts to un-ticked and a toast shows; tapping ✓ twice fast never double-completes (Task 2 test).

---

## Wave 1 (parallel)

### Task 1: Schema + shared libs

**Files:**
- Create: `supabase/migrations/20261109150000_exercise_cues_equipment_tiers.sql`
- Create: `apps/mobile/lib/equipmentTiers.ts`, `apps/mobile/lib/equipmentTiers.test.ts`
- Create: `apps/mobile/lib/bodyParts.ts`, `apps/mobile/lib/bodyParts.test.ts`
- Modify: `apps/mobile/lib/userSettings.ts` (+ its test)

**Interfaces — Produces:**
- SQL: `exercises.cue text null`; `user_settings.equipment_tier text null check (equipment_tier in ('basic','intermediate','advanced'))`; `pain_points.tagline text null`.
- SQL body-part normalization on all `exercises` rows (global and custom): `ankle→ankles`, `hip→hips`, `hamstring→hamstrings`, `shoulder→shoulders`, `lumbar_spine→lower_back`, then de-duplicate each array (`select array(select distinct unnest(...))`, preserving no particular order is fine).
- `export type EquipmentTier = 'basic' | 'intermediate' | 'advanced'`
- `export function requiredTier(equipment: readonly string[] | null | undefined): EquipmentTier`
- `export function tierAllows(userTier: EquipmentTier | null, required: EquipmentTier): boolean` — null → true.
- `export const EQUIPMENT_TIER_OPTIONS: readonly { tier: EquipmentTier; title: string; subtitle: string }[]` — titles `Basic`, `Intermediate`, `Advanced`; subtitles `Nothing but your body`, `A bench, light dumbbells, bands, a pull-up bar`, `Full gym access`.
- `export function bodyPartLabel(key: string): string`
- `UserSettings.equipmentTier: EquipmentTier | null` (default `null`), mapped to/from `equipment_tier` in fetch/update.

Tier mapping (exact): basic = `none, bodyweight, wall, wall_or_couch, doorway, towel, step, floor_markers, cone_or_marker, cones, cones_or_floor_markers, partner_or_bench`; intermediate adds `bench, dumbbell, bodyweight_or_dumbbell, light_barbell_or_dumbbell, light_plate, resistance_band, pull_up_bar, foam_roller, foam_pad, balance_pad, yoga_mat, strap, massage_ball, kettlebell, dumbbell_or_kettlebell, jump_rope, box, plyo_box, wobble_board, medicine_ball`; any other key (or unknown) → advanced. Empty/null array → basic. Result = highest tier among keys.

Body-part labels (exact): ankles "Ankles", feet "Feet", knees "Knees", hips "Hips", hamstrings "Hamstrings", lower_back "Lower back", thoracic_spine "Upper back", neck "Neck", shoulders "Shoulders", elbows "Elbows", wrists "Wrists"; also accept the pre-normalization keys (ankle, hip, hamstring, shoulder, lumbar_spine) with the same labels; unknown keys → split on `_`, capitalize the first word only.

- [ ] Step 1: Write tests: `requiredTier([])==='basic'`, `requiredTier(['wall'])==='basic'`, `requiredTier(['resistance_band','wall'])==='intermediate'`, `requiredTier(['cable_machine'])==='advanced'`, `requiredTier(['mystery'])==='advanced'`; `tierAllows(null,'advanced')===true`, `tierAllows('basic','intermediate')===false`, `tierAllows('advanced','basic')===true`; `bodyPartLabel('lumbar_spine')==='Lower back'`, `bodyPartLabel('thoracic_spine')==='Upper back'`, `bodyPartLabel('upper_traps')==='Upper traps'`; userSettings maps `equipment_tier` both ways and defaults to null.
- [ ] Step 2: Run `npx jest lib/equipmentTiers lib/bodyParts lib/userSettings` — FAIL.
- [ ] Step 3: Implement libs + migration.
- [ ] Step 4: Run tests — PASS.
- [ ] Step 5: Commit `feat: equipment tiers, body-part labels, cue/tier/tagline columns`.

### Task 2: Logger feel — instant ✓, instant swipe-delete, consistent type/form

**Files:** Modify `apps/mobile/components/logger/SetRow.tsx`, `apps/mobile/components/SwipeToDelete.tsx`, `apps/mobile/app/workout/[workoutId].tsx`, `apps/mobile/components/logger/ExerciseCard.tsx`, `apps/mobile/components/logger/RestBar.tsx` as needed; the logger state helpers in `apps/mobile/lib/workouts.ts` if completion is awaited there. Tests next to any lib you change.

- [ ] Step 1: Find why ✓ lags (likely the visual state waits on the Supabase write, or a PressableScale/Animated delay) and why swipe-delete lags (likely waits for a timing animation and/or the server delete before removing the row). Write a failing unit test for whichever pure state helper you introduce: completing a set updates local state synchronously; a failed write reverts it; a second complete while one is in flight is ignored.
- [ ] Step 2: Make ✓ optimistic: local state + haptic on press-in, write in background, revert + `Toast` on error. Remove any press delay (`delayPressIn`, long scale animation gating the handler).
- [ ] Step 3: Make delete optimistic: on threshold release or delete-button tap, remove the row immediately (short ≤150 ms collapse at most), server delete in background, restore + toast on error. Keep the VoiceOver delete button working.
- [ ] Step 4: Font/form consistency: every `Text` in the logger uses a `TYPE` token; `TextInput`s use `TYPE.body`/`TYPE.stat` with `COLORS.textPrimary`, same field style as `components/ui` inputs used elsewhere (e.g. edit-profile / routine editor); no system-default header — the screen uses the app's own header row; set rows, exercise card headers, and buttons match `components/ui` primitives. Compare side-by-side with `app/routines/[routineId].tsx` and match its row/input styling.
- [ ] Step 5: `npx jest` (all) and tsc on your files pass. Commit `fix: logger feels instant — optimistic tick and delete, consistent type`.

### Task 3: Live Activity that renders (not a black box)

**Files:** Modify `apps/mobile/widgets/WorkoutActivity.tsx`, `apps/mobile/lib/workoutActivityBridge.ts`, `apps/mobile/app.json` (only if the widget config is wrong), the bridge call site in `apps/mobile/app/workout/[workoutId].tsx` (surgical edit; Task 2 edits the same file concurrently — re-read before each edit).

**Interfaces — Produces:**
```ts
export interface WorkoutActivityProps {
  readonly title: string;            // workout title
  readonly startedAtMs: number;      // epoch ms, drives a system timer text
  readonly exerciseName: string;     // current exercise, '' if none
  readonly timerEndsAtMs: number;    // 0 when no hold/rest timer running
  readonly timerLabel: string;       // 'Rest' | 'Hold' | 'Switch sides' | ''
}
export function syncWorkoutLiveActivity(
  active: ActiveWorkoutSummary | null,
  current?: { exerciseName: string; timerEndsAtMs: number; timerLabel: string }
): void   // starts, updates (instance.update(props)), or ends
```

- [ ] Step 1: Root-cause the black box. Read `node_modules/expo-widgets` (README, build/, plugin/, any docs) and `node_modules/@expo/ui/swift-ui` for: how a Live Activity layout must be declared (banner vs expanded regions, required keys), whether `'widget'` components can capture module-level constants (the current `ACCENT_LIGHT`/`ACCENT_DARK` consts are outside the function — likely not serialized into the widget bundle, which would crash rendering), whether `supportedFamilies` matters for Live Activities, and whether a `Text` with a date/timer style exists (e.g. `Text` `timerInterval`/`date` + `style: 'timer'`/`'relative'`). Write the root cause in your report.
- [ ] Step 2: Rewrite the widget with everything inline inside the `'widget'` function (no outer constants), dark background + `#C6F432` accent: banner = title, live elapsed timer, current exercise, and when `timerEndsAtMs > 0` a countdown with `timerLabel`; Dynamic Island compact leading = icon, compact trailing = elapsed (or countdown when running), minimal = icon, expanded = same as banner. If no system timer text is exposed, show "Started h:mm" and the countdown end time as static text instead, and say so in the report.
- [ ] Step 3: Bridge: add `update` to the instance interface (check the real expo-widgets API name), call it when `current` changes (debounce identical props). Keep "never throws".
- [ ] Step 4: Wire the call site: pass the current exercise name (first incomplete exercise) and the running hold/rest timer end time.
- [ ] Step 5: tsc on your files, `npx jest`, and `npx expo export --platform ios` (bundles widget code) succeed. Commit `fix: Live Activity renders with live timer and current exercise`.

### Task C1/C2: Cues + descriptions for the existing library (two parallel agents)

**Files:** Create `docs/superpowers/content/2026-11-09/cues_a.json` (C1: exercises 1–72 of `library_exercises.json` in file order) / `cues_b.json` (C2: 73–143).

Format: `[{ "id": "<uuid>", "name": "<exact name>", "cue": "...", "description": "..." }]`.
- `cue`: one sentence, ≤ 20 words, what to physically do. Voice per Global Constraints.
- `description`: 2–4 short sentences: setup, the movement, the one thing people get wrong. Same voice. No "why"/evidence talk (that's `evidence_rationale`).
- Use `name`, `exercise_type`, `equipment_needed`, `unilateral`, `default_rep_range`, `evidence_rationale` for context. If unilateral, say which side work happens on naturally ("…then switch legs").
- [ ] Step 1: Write the file. Step 2: `node -e` check: valid JSON, count = 72 / 71, every id from your slice present, no banned phrases (regex over the banned list), every cue ≤ 20 words. Step 3: commit the JSON.

### Task C3: Three new sprints + Basic alternatives for the existing four

**Files:** Create `supabase/migrations/20261109150500_new_sprints_and_basic_alternatives.sql`, `docs/superpowers/content/2026-11-09/new_sprints_notes.md` (short: per sprint, slot list and the reasoning, assessment choices).

Mirror the structure of `supabase/migrations/20260916140000_seed_ankle_content.sql` exactly (CTE inserting exercises, then `sprint_exercise_pool`, `sprint_day_template`, `assessment_definitions`).

- New `pain_points` rows (columns `id, display_name, description, tagline, sort_order`):
  - `full_body`, "Full Body", tagline "For desk workers with stiffness everywhere", sort 5
  - `total_mobility`, "Total Mobility", tagline "Feel-good mobility and recovery for people who already train", sort 6
  - `knees`, "Knees", tagline "Pain-free, resilient knees", sort 7
  - `description`: 2–3 human sentences for the expandable picker section.
- Also `update pain_points set tagline=…, description=…` for the existing four (human voice; drop "Mobility Bible Ch. N" references).
- New exercises: name prefix like the existing ones (`Full Body: …`, `Mobility: …`, `Knees: …`); fill `cue` and `description` (voice rules) plus `evidence_rationale`, `evidence_grade`, `equipment_needed`, `exercise_type`, `body_parts` (normalized keys from Task 1: ankles, feet, knees, hips, hamstrings, lower_back, thoracic_spine, neck, shoulders, elbows, wrists), `default_sets`, `default_rep_range`, `unilateral`, `is_corrective`. Reuse an existing exercise (by name lookup subquery) instead of creating a duplicate where one fits.
- Each new sprint: 3 tier-1 slots every day (days 1–14) + tier-2 slots on ~9 days, like ankle. Every slot has ≥ 2 candidates and **≥ 1 candidate whose `equipment_needed` maps to basic** (Task 1 mapping). Daily routine ≈ 10–15 min.
- Assessments, 3–4 per new sprint, easy: no equipment beyond wall/tape measure/phone timer, instructions ≤ 2 sentences, each < 2 min. Use `better_direction` in ('lower','higher','symmetry'). A 1–10 self-rating is allowed (unit `score`) if it's the honest measure. Suggested: Full Body — toe-touch reach (cm past/short of toes), deep squat hold (s), wall angel contact (reps or s), overall stiffness 1–10; Total Mobility — toe touch, deep squat hold, back-scratch shoulder reach (cm, bilateral), how you feel after training 1–10; Knees — single-leg sit-to-stand from chair (reps, bilateral), knee-to-wall (cm, bilateral), wall sit (s), knee pain on stairs 0–10 (lower).
- Existing four sprints: for every slot (pain_point_id, slot_key) in `sprint_pools.json` with no basic candidate, add a bodyweight exercise (new or existing) to that slot's pool with `default_rank` after the existing ones.
- [ ] Step 1: Write the migration + notes. Step 2: write a `node` script at `docs/superpowers/content/2026-11-09/check_basic_coverage.mjs` that parses nothing from the DB but documents the SQL check query (the orchestrator runs it live):
  ```sql
  select p.pain_point_id, p.slot_key from sprint_exercise_pool p join exercises e on e.id = p.exercise_id
  group by 1,2 having bool_or(coalesce(e.equipment_needed,'{}') <@ array['none','bodyweight','wall','wall_or_couch','doorway','towel','step','floor_markers','cone_or_marker','cones','cones_or_floor_markers','partner_or_bench']) is not true;
  ```
  (save it as `check_basic_coverage.sql` instead of .mjs). Step 3: commit.

## Wave 2 (after Wave 1 code tasks land)

### Task 4: Timer-end sounds + locked-phone notifications

**Files:** Create `apps/mobile/lib/timerAlerts.ts` (+ test), `apps/mobile/assets/sounds/timer-end.wav`, `scripts/gen-timer-sound.mjs` (repo root `scripts/` or `apps/mobile/scripts/`); modify the logger's hold/switch/rest timer handling (`app/workout/[workoutId].tsx`, `components/logger/RestBar.tsx`, `lib/workoutTimers.ts` consumers), `apps/mobile/package.json` (+`expo-audio` via `npx expo install expo-audio`), `app.json` plugins if expo-audio needs one.

**Interfaces — Produces:**
```ts
export async function initTimerAudio(): Promise<void>               // set audio mode: playsInSilentMode true, interruptionMode 'duckOthers'
export function playTimerEnd(): void                                  // never throws
export async function scheduleTimerEndNotification(endsAtMs: number, body: string): Promise<string | null>
export async function cancelTimerEndNotification(id: string | null): Promise<void>
```
- [ ] Step 1: Generate the sound with node (two short sine beeps ~880 Hz, 0.15 s each, 0.1 s gap, 44.1 kHz mono 16-bit WAV, gentle fade in/out). Commit the script and the wav.
- [ ] Step 2: Tests (mock `expo-audio` and `expo-notifications`): schedule returns id and uses a date trigger at `endsAtMs`; cancel(null) is a no-op; cancel(id) calls `cancelScheduledNotificationAsync(id)`; schedule in the past returns null without scheduling.
- [ ] Step 3: Implement. Wire: when a hold, switch-sides, or rest timer starts → schedule notification (body e.g. "Rest's over" / "Time's up — switch sides" without em-dash: "Time's up. Switch sides."); when it ends while the app is foregrounded → `playTimerEnd()` + existing haptic and cancel the scheduled one; when stopped early, skipped, adjusted (re-schedule), or workout finished/discarded → cancel. Foreground notification handler must not show the banner for these (sound already played).
- [ ] Step 4: `npx jest`, tsc on touched files. Commit `feat: timer-end sound and locked-phone alerts`.

### Task 5: Exercise content UI — cue on the eye, full detail with video, readable body areas

**Files:** Modify `apps/mobile/lib/exerciseDetail.ts` (+test), `apps/mobile/app/exercise/[exerciseId].tsx`, `apps/mobile/lib/library.ts` (+test), the logger `ExerciseCard.tsx` and sprint/assessment cards that use `DescriptionToggle`, `components/library/*`, anywhere body parts render (grep `bodyParts`). Add `react-native-webview` via `npx expo install react-native-webview`. Create `apps/mobile/components/ExerciseVideo.tsx`, `apps/mobile/lib/youtube.ts` (+test).

**Interfaces — Consumes:** `bodyPartLabel` (Task 1), column `exercises.cue`. **Produces:** `ExerciseDetail` gets `cue: string | null`, `howTo: string | null` (= `description`, no rationale fallback), `whyItHelps: string | null` (= `evidence_rationale`); `export function youtubeEmbedUrl(url: string | null): string | null` (accepts watch?v=, youtu.be/, shorts/, embed/ forms; returns `https://www.youtube-nocookie.com/embed/<id>?playsinline=1&rel=0`; null for anything else).

- [ ] Step 1: Tests: detail maps cue/howTo/whyItHelps separately; `youtubeEmbedUrl('https://www.youtube.com/watch?v=ultWZbUMPL8')` → `https://www.youtube-nocookie.com/embed/ultWZbUMPL8?playsinline=1&rel=0`; `youtu.be/ID`, `shorts/ID` work; `'https://example.com'` → null; `null` → null. Library row mapping uses cue for the short text.
- [ ] Step 2: Implement. Eye icon everywhere shows only `cue`; hidden when cue is null (custom exercises fall back to their own `description`). Exercise name in the logger card and sprint card is pressable → `/exercise/[id]` (keep it obviously tappable, no layout jump). Detail screen order: name, body-area chips (labels), video (16:9 WebView, inline playback, `allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction`), "How to do it" (howTo), "Why it helps" (whyItHelps), equipment. No video → a quiet "Video coming soon" placeholder. Plus an "Open in YouTube" text link under a video.
- [ ] Step 3: Replace every raw body-part render with `bodyPartLabel`; library filter chips use labels (and the normalized keys).
- [ ] Step 4: `npx jest`, tsc. Commit `feat: one-line cues, full exercise detail with video, readable body areas`.

### Task 6: Equipment tier — onboarding, settings, existing-user prompt, picker filtering

**Files:** Modify `apps/mobile/app/onboarding.tsx`, `apps/mobile/app/settings.tsx`, `apps/mobile/app/(tabs)/index.tsx` (one-time sheet), `apps/mobile/lib/sprintLifecycle.ts` (where pool candidates are fetched/picked, incl. `activateSprintAfterBaseline` and `fetchSwapCandidates`), `apps/mobile/lib/sprintExercisePicker.ts` (+test). Create `apps/mobile/components/EquipmentTierPicker.tsx`.

**Interfaces — Consumes:** Task 1 `EquipmentTier`, `requiredTier`, `tierAllows`, `EQUIPMENT_TIER_OPTIONS`, `UserSettings.equipmentTier`. **Produces:** `export function filterCandidatesByTier<T extends { equipment: readonly string[] | null }>(candidates: readonly T[], tier: EquipmentTier | null): T[]` — returns allowed candidates; if none allowed, returns the original list (never empty a slot).

- [ ] Step 1: Tests: basic tier drops a band exercise and keeps a bodyweight one; null keeps all; all-disallowed returns the original list.
- [ ] Step 2: Implement filtering in sprint day materialization and swap candidates (select `equipment_needed` with the pool rows).
- [ ] Step 3: `EquipmentTierPicker` (three large selectable cards from `EQUIPMENT_TIER_OPTIONS`). Onboarding: new step "What do you have to train with?" before the terms step, required. Settings: "Equipment" row showing the tier title, opens the picker sheet. Workout tab: if settings loaded and `equipmentTier === null` and onboarding done, show the picker sheet once; saving persists via `updateUserSettings`.
- [ ] Step 4: `npx jest`, tsc. Commit `feat: equipment tiers in onboarding, settings, and sprint picks`.

## Wave 3

### Task 7: Sprint picker descriptions + change today's focus

**Files:** Modify `apps/mobile/components/PainPointPicker.tsx`, `apps/mobile/lib/sprintLifecycle.ts` (`PainPoint` gets `tagline: string | null`; `fetchPainPoints` selects it), `apps/mobile/components/SprintCard.tsx`, `apps/mobile/app/sprint.tsx` as needed. Create `apps/mobile/lib/focusSwap.ts` (+test), `apps/mobile/components/ChangeFocusSheet.tsx`.

**Interfaces — Consumes:** Task 6 `filterCandidatesByTier`, `pickExerciseForSlot`, `slotsForDay`, existing workout-start path used by the sprint day (find how a sprint day starts its workout and reuse it without the sprint-day link), `abandonSprint`, `beginSprint`. **Produces:** `export async function buildOneOffExercises(painPointId: string, dayNumber: number, tier: EquipmentTier | null): Promise<{ exerciseId: string; sets: number | null; repsOrDuration: string | null }[]>` plus a pure helper `pickOneOffSlots(template, pool, dayNumber, tier, lastCompleted)` that is unit-tested.

- [ ] Step 1: Tests for `pickOneOffSlots`: returns one exercise per slot of that day in `slot_order`; respects tier; deterministic with an empty history (lowest `default_rank`).
- [ ] Step 2: Picker: each pain point row shows display_name + tagline, with a chevron that expands the description (animated, `DescriptionBody` is reusable).
- [ ] Step 3: SprintCard (active sprint): "Change today's focus" secondary action → `ChangeFocusSheet`: step 1 disclaimer ("This takes you off your <Sprint> plan for today. Your sprint day stays open, so you can still do it later."), Continue/Cancel; step 2 pick a different pain point; step 3 "Just today" (builds via `buildOneOffExercises` with the sprint's current day number, starts a normal workout titled "<Pain point> (one-off)", no sprint-day link, so it never completes the sprint day) or "Start a new sprint" (confirm, `abandonSprint`, then the normal begin/baseline flow).
- [ ] Step 4: `npx jest`, tsc. Commit `feat: sprint taglines and change today's focus`.

### Task C4: Verified demo videos

**Files:** Create `docs/superpowers/content/2026-11-09/videos.json` (`[{ "name": "<exact exercise name>", "url": "https://www.youtube.com/watch?v=…", "oembed_title": "…" }]`) and `supabase/migrations/20261109151000_exercise_videos_and_cues.sql`.

- Targets, in order: every sprint-pool exercise (existing from `sprint_pools.json` + new ones in the C3 migration), then library exercises with null `demo_video_url`.
- For each: web-search a real demo (prefer physios/coaches/clinics, short form, clear view). Verify with `curl -s "https://www.youtube.com/oembed?url=<url>&format=json"`: 200 + title plausibly the same exercise. No good match → omit. Never guess IDs.
- The migration also applies C1/C2 cues: `update exercises set cue = …, description = … where id = '…' and owner_id is null;` for every row in `cues_a.json`/`cues_b.json` (generate with a node script, SQL-escape single quotes), then `update exercises set demo_video_url = … where name = … and owner_id is null` for each video.
- [ ] Step 1: Research + JSON. Step 2: node generator → migration. Step 3: commit.

## Wave 4 (orchestrator)

### Task 8: Integrate, push migrations, verify live
- [ ] `npx supabase migration list --linked`, then `db push --linked`.
- [ ] Run `check_basic_coverage.sql` live → zero rows. Spot-check 3 videos, 10 cues.
- [ ] Live suites: `rls_smoke_workouts.py`, `rls_smoke_social.py`, `embed_smoke.py` all pass.
- [ ] `npx jest`, `npx tsc --noEmit`, `npx expo export --platform ios` clean.

### Task 9: Whole-branch review, then ship
- [ ] One whole-branch review (most capable model) against the spec; fix findings.
- [ ] Bump version to 1.2.0, merge to master, push, `eas build --platform ios --profile preview --non-interactive`, then `eas submit --platform ios --latest --profile preview --non-interactive`.
- [ ] Update `CLAUDE.md` status, `docs/BACKLOG.md` (stored-for-later list from the spec), and write `docs/superpowers/reports/2026-11-10-morning-handoff.md` (what shipped, how to verify on device, calls made, anything unfinished).
