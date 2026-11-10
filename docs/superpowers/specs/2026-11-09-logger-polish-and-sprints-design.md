# Logger polish, exercise content, equipment tiers, new sprints — design (2026-11-09)

Source: Sohan's notes after his second real workout on build 22 (v1.1.0), plus answers to follow-up questions the same evening. Goal: everything below on TestFlight (build 23) by the morning of 2026-11-10, migrations live, pushed to GitHub.

## Why

Sohan's rule: **the workout has to be super easy and super solid before anything else.** Progress, routines, social and settings are fine as they are. The logger is used every day, so every delay, missing sound, or confusing exercise is felt daily.

## Scope (in priority order)

### 1. Workout polish
1. **Consistent font/form in the logger.** The workout screen (`app/workout/[workoutId].tsx`, `components/logger/*`) looked different from the rest of the app. Every text node uses `TYPE` tokens from `lib/theme.ts`; inputs, headers and buttons use the same `components/ui` primitives as other screens. No native-stack header with system styling.
2. **✓ (complete set) is instant.** The tick and its visual state change on press, before any network call (optimistic), with haptic on press. Server write follows; on failure revert and toast.
3. **Swipe-to-delete is instant.** The row removes as soon as the swipe passes the threshold / delete is tapped (optimistic), no waiting on an animation chain or server round-trip.
4. **Timer-end sounds.** A short, clear sound when any hold timer (e.g. 30 s eyes-closed balance), switch-sides timer, or rest timer finishes. Plays with the ringer on silent; ducks other audio (music dips, doesn't stop). If the app is backgrounded/locked when the timer ends, a local notification with sound fires at the end time (scheduled when the timer starts, cancelled if the timer is stopped/finished early). Sound asset is generated in-repo (no licensed audio).
5. **Live Activity works.** Today the lock-screen / Dynamic Island Live Activity renders as an empty black box. Fix it so it shows: workout title, a live-ticking elapsed timer (system timer text, no per-second updates from JS), and the current exercise name. When a hold/rest timer is running, show its countdown. Dynamic Island compact: icon + elapsed timer.

### 2. Exercise content
1. **Eye icon shows a one-liner "what to do" cue**, not the "why". New column `exercises.cue`. Voice (approved by Sohan): a person giving you direct instructions, plain words, no hype, no AI tells. Reference: *"Stand on one foot, close your eyes, and stay as still as you can."* One sentence, ideally under ~20 words.
2. **Tapping the exercise name opens the full detail screen** (`app/exercise/[exerciseId].tsx`, already exists): short how-to description (`exercises.description`, 2–4 plain sentences, same voice), then the "Why it helps" (`evidence_rationale`), then an embedded demo video.
3. **Videos: existing YouTube demos for now** (Sohan: "yes for now, but we have to slowly build this in"). Each link must be verified to exist and its title must plausibly match the exercise (oEmbed check). No match → "Video coming soon", never a wrong video. Played in-app (embedded player). Priority: every sprint-pool exercise; then the rest of the library.
4. **Readable body-area labels.** Never show raw keys like `lower_back` / `lumbar_spine`. One label map in the app (e.g. "Lower back", "Upper back", "Hips"), and normalize duplicate keys in the data (`ankle`/`ankles`, `hip`/`hips`, `hamstring`/`hamstrings`, `shoulder`/`shoulders`; `lower_back`+`lumbar_spine` → `lower_back`).
5. Content scope: all global exercises visible in the library/logger (~143) plus new sprint exercises.

### 3. Equipment tiers
- Three tiers, stored on `user_settings.equipment_tier` (`basic` | `intermediate` | `advanced`, nullable = not asked yet):
  - **Basic** — nothing; bodyweight only (floor, wall, doorway, towel, step/stairs, couch count as "nothing").
  - **Intermediate** — basic equipment: bench, light dumbbells, resistance bands, pull-up bar (plus small stuff: foam roller, yoga mat, strap, massage ball, foam pad).
  - **Advanced** — full gym access.
- Each tier includes everything in the tiers below it. An exercise's required tier is derived from its `equipment_needed` via one mapping (single source of truth, unit-tested).
- Asked in onboarding (new step) and once for existing users with a null tier (a sheet on the Workout tab); changeable in Settings.
- The sprint exercise picker only picks candidates the user's tier allows. **Every sprint slot must have at least one Basic candidate** — content work adds bodyweight alternatives to the existing 4 sprints where missing. Enforced by a check query run after the content migration.

### 4. Three new sprints
All three get a real baseline + reassessment ("there should always be a test… even for feel-good and recovery"). Assessments must **feel easy**: 3–4 tests, no equipment beyond a wall/tape measure/phone timer, each explainable in one or two sentences, each under ~2 minutes. One may be a 1–10 self-rating if it's the honest measure (e.g. stiffness).
- **Full Body** — tagline: for desk workers with imbalances all over who want something general.
- **Total Mobility** — mobility + recovery merged. For gym-goers who want to add flexibility/mobility work to their existing training; feel-good stretching and recovery.
- **Knees** — knee resilience/pain-free knees.
Same structure as the existing four (`pain_points`, `sprint_exercise_pool` tiers 1/2, `sprint_day_template` 14 days, `assessment_definitions`), so the existing sprint code works unchanged. The picker shows each sprint's name plus an expandable short description (human voice; the existing four's descriptions are internal notes like "Mobility Bible Ch. 4" and get rewritten too).

### 5. Change today's focus (one-off)
On the active sprint card: "Change today's focus". First a clear disclaimer that this deviates from the sprint. Then pick a different pain point, then choose:
- **Just today** — builds today's routine from that pain point's pool (respecting equipment tier) and starts a workout. It is saved like any workout but **does not complete the sprint day** (approved by Sohan); the sprint day stays open.
- **Start a new sprint** — abandons the current sprint (existing `abandonSprint`) and starts the normal baseline flow for the new pain point.

## Non-goals (stored for later, Sohan expects to revisit ~Wed/Thu)
- Progressions / making an exercise harder.
- Self-made or AI-generated videos.
- Rethinking the existing four sprints' assessments (new ones are built easy; a later pass revisits the old ones).
- Public App Store launch items (SMTP, Apple key, Supabase Pro, web hosting, listing). Beta testing with people Sohan knows comes first; registering a domain/website is Sohan's action item.
- Logger gaps from stage 4 (rename title, multi-pick picker, auto-scroll), calendar day tap, feed chips, follow button in search, profile share.

## Anti-goals
- Cues/descriptions that read as AI-written (no "Engage your core to unlock…", no em-dash flourishes, no "This exercise is great for…").
- A wrong video shown confidently.
- A sprint day that a Basic user can't complete because a slot has no bodyweight option.
- Anything that makes the logger slower or adds steps.

## Constraints
- Migrations are pushed manually (`npx supabase migration list --linked` first) and live test suites re-run after: `supabase/tests/rls_smoke_workouts.py`, `rls_smoke_social.py`, `embed_smoke.py`.
- Any new table referencing a parent row needs parent-ownership `WITH CHECK`.
- New native modules are fine (build 23 is a full native build): expected `expo-audio`, `react-native-webview`.
- Ship = merged to master, pushed, migrations live, EAS build + `eas submit`.

## Calls made by Claude (for Sohan to check)
- Sound plays through silent mode and ducks music; locked-phone case uses a local notification.
- Existing users are asked their equipment tier once; until answered, the picker treats null as Advanced (current behaviour).
- Cue lives in a new column, not in `description`, so custom exercises' user-written descriptions are untouched.
- Body-area normalization rewrites data in place (global exercises only; custom exercises' arrays mapped the same way).
- Videos are embedded with the YouTube embed URL in a WebView; tapping "Open in YouTube" is the fallback.
