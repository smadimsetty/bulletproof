# Finish the app — design (fixes, stats, routines, social, redesign, release)

Agreed with Sohan on 2026-11-08. Supersedes the *ordering and tab layout* of
`2026-11-07-mobility-logger-roadmap.md`; that doc's decisions 1–5 and its
permanent data model still hold unless changed here.

## 1. Intent

Bulletproof should go from "Sohan's personal prototype" to a polished,
publishable iPhone app on the public App Store: a mobility-first workout
logger with 14-day pain-point sprints, progress stats, routines, an exercise
library and a friends-first social layer. Sohan's words: it should look like
"a polished, finished, ready to publish app". Today the app works but feels
"very static" and "doesn't flow", and two tabs (Trends, Settings) are
leftovers from the retired training engine.

Sohan's working style for this: **build all functionality first, then a
full design/flow pass, then one TestFlight build at the end.** He will test
on-device himself and expects to iterate on bugs afterwards, so testing
here is "solid, not exhaustive" — with one exception: anything security-
or privacy-relevant (RLS, account deletion, social visibility) gets real
verification, because it is a public app holding health-adjacent data.

### Anti-goals (would make this a failure even if it "works")

- Copying Hevy's (or any app's) name, branding, icons, copy or visual look.
  Feature patterns only.
- Volume/1RM leaderboards or "best ankle ROM" competition. Social
  competition, if any, is consistency/improvement.
- Any path where one user can read or write another user's private data.
- Silent failures: a save that fails without the user seeing it, or a
  "Try again" button that does nothing (Sohan hit exactly this today).
- Locally-finished work that isn't live: un-pushed commits, un-applied
  migrations (both have bitten this repo before).

## 2. Decisions Sohan made (2026-11-08)

| Topic | Decision |
|---|---|
| Release target | **Public App Store.** Build everything Apple requires: in-app account deletion, privacy policy, terms/EULA, report/block/hide + objectionable-content filtering, onboarding for new users. |
| Order | **Fixes → Stats → Routines + library → Social (+ accounts/compliance) → Redesign → Release build.** |
| Look & feel | **Dark, athletic, energetic**: dark backgrounds, one bold accent colour, big numbers, snappy motion and haptics. |
| Stats wanted | **Consistency (streaks + calendar)**, **PRs + monthly recap**, **assessment before/after trends**. Left/right symmetry stats were *not* picked — don't build a symmetry screen (L/R values still show per-side in charts where they naturally appear). |
| Trends / Settings | **Rebuild both.** Trends → "Progress". Settings → profile, privacy, notifications, Apple Health, sign out, delete account. Old engine fields are hidden from the UI; their data/columns are kept (data model is permanent). |
| Social media | **Photos only** for now (no video). |
| Sign-in | **Apple + email.** |
| Builds | **One TestFlight build at the end** (stages are still committed + pushed as they finish). |
| Small asks | Eye icon to show/hide descriptions; prefill assessments from the last one; peek at last assessment during a sprint. |

## 3. Stages

Each stage: plan → build (cheaper models write code from the plan) →
controller verifies (jest, `tsc --noEmit`, `expo export`) → one Opus review
of the stage's diff → fixes → **migrations pushed live + commit + `git
push`** before the next stage starts.

### Stage 0 — Fixes and small asks

**0.1 The PGRST201 error Sohan hit today.** Root cause confirmed: build 20
(EAS build from commit `164776f`, 2026-09-18 10:46 EDT) predates the
`exercises!exercise_id` embed hint fix (`28cce8b`, 11:39 EDT). Build 21
has the fix; production data is intact (sprint cycle 2 + baseline saved,
14 days generated). Still do in this stage:
- Audit **every** PostgREST embed of `exercises` (and any table with two+
  FKs/paths to another) and hint it with the explicit FK constraint name,
  e.g. `exercises!sprint_day_exercises_exercise_id_fkey(...)`. Known unhinted:
  `sprintLifecycle.ts` `fetchSwapCandidates` (`sprint_exercise_pool` →
  `exercises`, currently unambiguous but will become ambiguous as soon as
  B adds `routine_exercises`). New stages add more paths to `exercises`, so
  every new embed is hinted from day one.
- Add a small test script (`supabase/tests/embed_smoke.py` or a jest test
  against recorded select strings — builder's call) that runs every
  app select string against the live REST API with the service key and
  fails on `PGRST201`. Re-run after each stage's migrations.

**0.2 "Try again" does nothing.** Every error state in the app with a retry
button must actually re-run the failed load and show a loading state while
it does. Audit `app/sprint.tsx`, Workout tab, History, workout detail.

**0.3 Eye icon on descriptions.** Wherever a long description/instructions
text sits on an exercise or assessment card (assessment form cards, sprint
day exercises, logger exercise cards, later the library), show the name
plus a small eye icon; the description is **collapsed by default** and the
icon toggles it open/closed (eye / eye-off). State is per card, per screen
visit — not persisted.

**0.4 Prefilled assessments.** When the assessment form opens (baseline of
a new sprint *or* reassessment), prefill every field from the **most recent
completed assessment for the same pain point** (across all of the user's
sprints, either phase). Show a banner: "Prefilled from your <date>
assessment — change anything that's different." Each field stays editable;
pass/fail chips preselected. A "Clear all" link empties the form. Submit is
enabled immediately when the prefill is complete. With no prior assessment,
the form behaves as today.

**0.5 Peek at last assessment.** On the sprint screen and inside the logger
when the workout is a sprint day, a "Last assessment" button opens a bottom
sheet listing each test of that pain point with the most recent value (L/R
for bilateral) and, when there is an earlier one, the previous value and
direction of change (better/worse coloured by `better_direction`).

**0.6 Parked items from A's review** — fix all:
M11 (ROM unit per exercise, not per set row), M15 (sprint start sequential
requests → parallelise or one RPC), M18 (Finish fails mid-way then Discard
leaves the sprint day marked done), M22 (History offset paging can skip/
duplicate → keyset paging on `ended_at, id`), the generation guard that can
skip a rest bar (`app/workout/[workoutId].tsx` ~195), and `uncompleteRow`
ignoring `inFlightRef`. Detail for each is in
`docs/superpowers/reports/2026-11-07-logger-history-final-review.md`.

### Stage 1 — Progress + stats (roadmap C)

The **Trends tab is replaced by a Progress tab.** Old trends components
(`SleepTrainingChart`, `MuscleGroupVolumeChart`, `TrendsSummaryCard`,
`BestLiftsSheet`, `TimeRangeSelector` and their `lib/trends*` /
`muscleGroupVolume` helpers) are deleted once nothing imports them.

Progress tab sections, top to bottom:

1. **Consistency.** Weekly streak = consecutive ISO weeks (Mon–Sun, device
   timezone) in which the user finished ≥ their weekly goal of workouts.
   Weekly goal defaults to 3, editable in Settings (stored in a new
   `user_settings` row — see §4). The current week counts toward the streak
   once met; an unfinished current week doesn't break it. Show current
   streak, best streak, this week's count vs goal (progress ring).
   **Calendar:** month grid with days that have a finished workout filled
   in, sprint-day workouts marked distinctly, swipe/arrow between months.
2. **Assessment trends.** One card per pain point the user has assessed.
   For each test: a small line chart across all completed assessments in
   chronological order (x = assessment date, labelled baseline/reassess +
   cycle number); bilateral tests draw Left and Right lines. Headline: first
   vs latest value and whether that's better per `better_direction`
   (`symmetry` = smaller |L−R| is better). Pass/fail tests show a row of
   pass/fail dots instead of a chart.
3. **Personal records.** List of recent PRs (last 30 days) with exercise,
   kind and value; "See all" → per-exercise PRs.
4. **Monthly recap** entry card for the previous month (and current
   month-to-date) → recap screen.

**PR definitions** (per exercise, per side for unilateral exercises;
computed from completed sets of *finished* workouts; warm-up sets excluded):
- longest hold (`duration_s`, for hold/duration exercise types)
- best ROM (`rom_value`; higher is better, compared only within the same
  `rom_unit`)
- most reps in a set (reps-based types)
- heaviest weight (weight×reps type; ties broken by more reps)
No 1RM, no volume PRs (anti-goal).

**PR toast in the logger:** when a set is completed and its value beats the
user's prior best for that exercise/side/kind (prior = finished workouts
only, excluding the current one), show a toast + success haptic ("New PR —
longest hold 75s"). The first-ever log of an exercise is **not** a PR. The
workout summary (`/workout-summary/[id]`) lists PRs earned in that workout.

**Monthly recap screen:** month picker; workouts finished, active days,
total time, longest streak in the month, PRs set, top 3 exercises by sets,
sprint progress (days completed, any assessment deltas that month), and a
**Share** button that renders a branded recap card to an image and opens
the iOS share sheet (`react-native-view-shot` + `expo-sharing`; builder
confirms current Expo-compatible versions). The same share-card machinery
is reused by Stage 3's workout share card.

**Exercise detail screen** (`/exercise/[id]`, built here, reused by the
library in Stage 2): name, eye-toggle description, demo video button
(opens `demo_video_url` in an in-app browser via `expo-web-browser`), the
user's PRs for it, a chart of the relevant metric over time (hold, ROM,
reps or weight), and recent sets grouped by workout.

Aggregation: client-side over the user's own rows, or SQL views with
`security_invoker = true` if a query gets heavy — builder's call. No new
base tables except `user_settings`.

### Stage 2 — Routines + exercise library (roadmap B)

Schema additions as in the roadmap: `routine_folders`, `routines`,
`routine_exercises`, `workouts.routine_id` (nullable, `on delete set
null`), nullable `exercises.owner_id` for custom exercises with read RLS
"global OR mine" and write RLS "mine only". `workouts.source` check widened
to include `'routine'` (and `'copy'` for Stage 3). Every child table gets
the parent-ownership `WITH CHECK` (see §5).

- **Routines** (on the Workout tab, below Start empty workout and the
  sprint card): folders (create/rename/delete/reorder; a routine lives in
  at most one folder; "Unfiled" otherwise). Routine editor: title, notes,
  ordered exercises (add via the exercise picker, reorder, remove), each
  with target sets, target reps/hold seconds/duration, rest seconds.
  Start a routine → creates a workout with `source='routine'`,
  `routine_id`, and pre-built set rows from the targets (previous-values
  prefill still applies on top, same as today).
- **Save as routine** from any finished workout (workout detail screen).
- **Update routine prompt:** on finishing a routine-based workout whose
  exercises/set counts differ from the routine, ask "Update routine with
  these changes?" (Update / Keep original).
- **Exercise library:** a screen reachable from the Workout tab and from the
  exercise picker: search, filter chips (body part, exercise type,
  equipment, "Mine"), list → exercise detail (Stage 1 screen).
- **Custom exercises:** create/edit/delete own exercises: name, exercise
  type (decides logger inputs), unilateral, body parts, equipment,
  description, optional video URL. Deleting one that's used in history is
  blocked with an explanation (or archive — builder's call, explain in UI).
- Sprints stay as they are (system-generated guided program), not routines.

### Stage 3 — Social + accounts + compliance (roadmap D, plus release needs)

**Accounts**
- **Email sign-in** alongside Apple: email + 6-digit one-time code
  (Supabase `signInWithOtp` + `verifyOtp`), not magic links (no deep-link
  round trip). Sign-in screen redesigned in Stage 4; functional here.
- **Onboarding** for a brand-new user (no `profiles` row): handle (unique,
  lowercase `a-z0-9_`, 3–20 chars, live availability check), display name,
  optional photo, units (kg/lbs), weekly goal, agree to Terms (required —
  Apple 1.2 needs users to accept terms with zero tolerance for abusive
  content). Existing users (Sohan) get the same onboarding once.
- **Account deletion** in Settings: confirm screen → Supabase Edge Function
  (service role) that deletes the user's storage objects and the auth user;
  every table that references `auth.users` or the user's rows must cascade
  or be explicitly cleaned so deletion actually succeeds — verify live with
  a throwaway user. Old engine tables included.

**Profiles & follows**
- `profiles`: handle, display_name, avatar_path, bio, `is_public` (default
  false). Readable by any signed-in user for discovery (handle, name,
  avatar, is_public, counts); bio + workouts gated by the visibility rule.
- `follows` (follower_id, followee_id, status `pending`/`accepted`):
  following a private profile creates a request the followee
  approves/declines; following a public profile is accepted immediately.
  Unfollow, remove follower.
- User search by handle/name.
- Profile screen: avatar, name, handle, bio, followers/following counts,
  streak, workouts count, their visible workouts list. Own profile has
  Edit.

**Posting = finishing a workout.** The Finish sheet gets: visibility
(Private / Followers / Public — default from Settings, initial default
**Followers**; Public only selectable if the profile is public), up to 4
photos (`expo-image-picker`, resized to max 1080px long edge, JPEG ~0.8,
uploaded to a private Storage bucket under `<owner_id>/<workout_id>/...`;
reads via signed URLs or a storage RLS policy mirroring the workout
visibility rule), and the existing title/notes as caption. Visibility and
photos are editable later from workout detail.

**Feed tab:** workouts (newest first, keyset paging) from people you follow
(accepted) plus your own, respecting visibility, excluding blocked users
and hidden posts. Each card: author, time, title/notes, photos (swipeable),
summary (duration, exercises, sets, PRs), like button + count, comment
count. Tap → workout detail (shared with History's detail screen, in
read-only mode for others' workouts). Empty state suggests finding friends.

**Interactions:** likes (one per user per workout), comments (create,
delete own; workout owner can delete any comment on their workout),
**Copy workout** on any visible workout → "Start now" (new workout,
`source='copy'`, `copied_from_workout_id`) or "Save as routine".
**Share card:** workout summary rendered to an image via the Stage 1 share
machinery.

**Activity inbox** (bell on Feed): follow requests (approve/decline), new
followers, likes, comments. **Push notifications** for follow requests,
comments and likes via `expo-notifications` + a Supabase Edge Function
fired by DB webhooks/triggers; per-type toggles in Settings. Push is the
last item in this stage; if it threatens the stage, it's cut to the inbox
only and logged as a follow-up.

**Safety (App Store 1.2):** report a workout, comment or user (reason
picker → `content_reports`); block a user (`user_blocks`; hides everything
both ways, removes follows both ways); hide a post from your feed.
Reported content is hidden from the reporter immediately. A simple
objectionable-word filter rejects handles, display names, bios, comments
and workout titles/notes on public/followers posts that contain listed
terms (server-side check in a trigger or Edge Function, plus client-side
pre-check for a friendly message). Sohan is the moderator: reports are
reviewed in the Supabase dashboard (document how in the handoff doc).

**Visibility rule** (roadmap, unchanged): a non-owner can read a workout and
its children iff no block exists in either direction AND (
(`visibility='public'` AND owner profile `is_public`) OR
(`visibility in ('followers','public')` AND an accepted follow from the
reader to the owner exists) ). Implemented as **new, separately named
read policies** added alongside A's `owner_all_*` policies — never by
editing those. Same rule gates `workout_media` storage objects, likes and
comments.

**Settings tab rebuilt** (reached from the Profile tab's gear): Profile
(edit), Units, Weekly goal, Default post visibility, Profile public/private,
Blocked users, Notifications (per type), Apple Health, Terms / Privacy /
Support links, Sign out, Delete account. Old engine fields (split,
activities, goals, pains, frequency, diet, weight, birth date, location)
are removed from the UI; `expo-location` and its Info.plist string are
removed if nothing else uses them.

**Apple Health:** replace the old read-for-the-engine sync with **"Save
workouts to Apple Health"** (write a workout sample on finish; activity
type flexibility / functional strength / traditional strength by the
workout's dominant exercise type — builder's call, documented). Toggle in
Settings, off by default, requests write permission when turned on. Update
both HealthKit usage strings to match. The old read sync code is removed
from the app (the dormant engine doesn't use the phone).

**Legal pages:** Privacy Policy, Terms of Use (incl. zero-tolerance clause
and the not-medical-advice disclaimer — this app suggests mobility work for
pain points), and Support pages added to the existing Next.js `apps/web`
app (static pages). URLs go in Settings and in App Store Connect.

### Stage 4 — Redesign + flow pass

Done after all functionality exists. An Opus design pass first produces
`docs/superpowers/specs/2026-11-xx-visual-design.md`: tokens (dark palette
with one bold accent + success/warning/danger, type scale with big
tabular numerals, spacing, radii, elevation), component inventory (Button,
IconButton, Card, Sheet, Chip, Stat, ProgressRing, Toast, EmptyState,
Skeleton, ListRow, Avatar, SegmentedControl, TabBar), motion rules
(`react-native-reanimated` for press-scale, sheet/list transitions,
number roll-ups, PR celebration; haptics on every completion), and a
screen-by-screen layout for every screen in the app. Cheaper models then
implement it screen by screen. `userInterfaceStyle` becomes dark.

**Final tab bar** (icons + labels): **Workout · History · Progress · Feed ·
Profile** (Settings lives behind Profile's gear). Flow goals: no dead ends
(every screen has an obvious next action or a way back), empty states that
teach, skeletons instead of "Loading…" text, pull-to-refresh on every list,
consistent bottom sheets for pickers.

App identity: display name **Bulletproof** (app.json `name` is currently
"mobile"), new icon + splash in the new style (generated as simple
geometric vector art — no third-party marks), Android untouched.

### Stage 5 — Release build

Whole-app Opus review → fixes → full verification (jest, tsc, expo export,
RLS smoke tests incl. a new social-visibility suite, embed smoke test,
account-deletion live test) → bump version → **one** `eas build` +
`eas submit` → update CLAUDE.md, the build log and a session handoff doc
with an on-device test checklist covering every stage.

## 4. Data model additions (all additive migrations)

- Stage 0: none expected (M11 may move ROM unit to `workout_exercises`).
- Stage 1: `user_settings` (owner_id PK, weekly_goal smallint default 3,
  weight_unit, default_visibility, notification prefs as columns or jsonb,
  healthkit_write_enabled) — or extend `user_profile` if cleaner; builder's
  call, but one row per user, owner RLS.
- Stage 2: per roadmap §B, plus `workouts.source` widened.
- Stage 3: per roadmap §D (`profiles`, `follows`, `workout_media`,
  `workout_likes`, `workout_comments`, `user_blocks`, `content_reports`,
  `workouts.copied_from_workout_id`), plus `hidden_workouts`
  (user_id, workout_id), `push_tokens`, `notifications` (inbox rows), and a
  Storage bucket for avatars + workout photos.

## 5. Constraints and lessons this repo has already paid for

- **Migrations are never auto-applied.** After writing one:
  `npx supabase migration list --linked` → `npx supabase db push --linked`
  → confirm. (CLAUDE.md has the full workflow.)
- **Not done until pushed.** Each stage ends with `git push`.
- **FK checks bypass RLS.** Every table whose rows point at a parent row
  owned by someone needs a parent-ownership `WITH CHECK`; every stage that
  adds such tables extends `supabase/tests/rls_smoke_workouts.py` (or a
  sibling) and runs it live with two throwaway users.
- **Supabase free tier auto-pauses** after ~1 week idle — fatal for a public
  app (see §7).
- **Subagents never run live commands** against the real `.env`
  credentials (migrations, smoke tests, EAS, REST calls). The controller
  does every live step. Dispatch prompts name this hazard explicitly.
- **EAS:** `apps/mobile/.npmrc` needs `legacy-peer-deps=true`; `eas build`
  then a separate `eas submit`; no dev client — EAS/TestFlight is the only
  device path.
- New native modules are fine (one build at the end), but each must be
  Expo SDK 56–compatible; install with `npx expo install`.
- PostgREST embeds of `exercises` always carry an explicit FK hint.

## 5a. Rulings after the builder check (2026-11-08)

Sohan decided:
- **Sprint workouts default to Private** on the Finish sheet (they reveal a
  health issue); he can flip one to Followers/Public. Other workouts use the
  default visibility (initially Followers).
- **Reports:** every new `content_reports` row sends a push notification to
  the moderator (Sohan — identified by a `is_moderator` flag on his
  `profiles` row, set by a migration/SQL, never from the client). Any
  workout or comment reported by **3 distinct users** is hidden from
  everyone except its owner until a moderator clears it
  (`hidden_by_moderation` flag, read policies exclude it). Users reported 3+
  times are flagged for review, not auto-hidden.
- **Library / picker show mobility content + the user's own custom
  exercises only.** "Mobility content" = rows used in any
  `sprint_exercise_pool`, plus rows whose `exercise_type` is
  `mobility_stretch` or `balance`, plus `is_corrective` rows. Old gym rows
  are hidden from browse/search/pick but stay readable, so past workouts
  that use them still render. Strength logging uses custom exercises (the
  custom-exercise form offers every exercise type, incl. strength).

Controller's calls (Sohan can override):
- **Custom exercises in shared workouts:** the `exercises` read policy is
  widened to "global OR mine OR referenced by a workout I can read" (via a
  `security definer` helper so it stays fast and recursion-free). Copying a
  workout / saving it as a routine **clones** any custom exercise not owned
  by the copier into the copier's library (name suffixed nothing; a
  `cloned_from_exercise_id` column records the origin), and the copy points
  at the clone. Covered by the social RLS smoke suite.
- **Private profiles:** non-followers see handle, display name, avatar and
  a "Private" badge only — no counts, streak, bio or workouts.
- **Apple vs email accounts:** not linked unless Supabase auto-links on a
  matching verified email. Settings shows "Signed in with Apple / email
  <address>". The sign-in screen says to use the same method each time.
- **Word filter:** a small list of severe terms (slurs/sexual/violent) in a
  `blocked_terms` table only the service role can write; checked by a
  trigger on handles, display names, bios, comments, and workout
  title/notes **only when visibility ≠ private**. Private workouts are
  never filtered.

## 6. Left to the builder

Component/file structure, query shapes, whether stats aggregate client-side
or in views, chart library usage (`react-native-gifted-charts` is already
installed), exact copy text, animation details within the Stage 4 spec,
how push fan-out is triggered. Every such call is recorded in the stage's
plan.

## 7. Needs Sohan (not blocking the build, blocking a public launch)

1. **Supabase Pro plan** (~$25/mo) before public launch — free tier pauses
   after a week of inactivity and caps Storage at 1 GB.
2. **Custom SMTP** for email sign-in codes (Supabase's built-in sender is
   rate-limited to a few emails/hour and not for production) — e.g. Resend
   free tier; needs a domain he controls.
3. **Where `apps/web` is deployed** (for the privacy/terms/support URLs).
4. **App Store Connect listing:** screenshots, description, age rating,
   privacy "nutrition label" answers, and a demo account for App Review
   (email sign-in makes this easy).
5. **The dormant engine's daily GitHub Actions cron** still runs every
   morning and may spend Anthropic API credit — decide whether to disable.
