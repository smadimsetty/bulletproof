# Stage 3 — Social, accounts, compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email sign-in + onboarding, profiles/follows, posting (visibility + photos), feed with likes/comments, copy workout, share card, inbox + push, report/block/hide + moderation, rebuilt Settings/Profile, account deletion, Apple Health write, legal pages.

**Architecture:** Additive migrations. Visibility is decided in SQL by `security definer` helper functions used by **new, separately named** read policies (A's `owner_all_*` policies are never edited). Inbox rows are created by triggers; a trigger on `notifications` posts to a `send-push` Edge Function via `pg_net`. Account deletion is a `delete-account` Edge Function. Client screens under `app/` with data layers in `lib/social/`.

**Tech Stack:** Expo SDK 56, expo-router, supabase-js v2, Supabase Storage, Edge Functions (Deno), `pg_net`, Supabase Vault, `expo-image-picker`, `expo-image-manipulator`, `expo-notifications`, `expo-device` (installed by the controller), `@kingstinct/react-native-healthkit` (installed), Next.js (`apps/web`).

**Spec:** `docs/superpowers/specs/2026-11-08-finish-the-app-design.md` §3 Stage 3, §4, §5a.

## Global Constraints

- Paths relative to `apps/mobile/` unless starting with `supabase/`, `apps/web/` or `docs/`.
- **No network / live commands** (no supabase CLI, curl, python, deno run, eas, npm install, git push, never read `.env`). Only `npx jest`, `npx tsc --noEmit` (mobile), `npx tsc --noEmit` / `npx next lint` (web), git commit. The controller deploys migrations/functions and runs smoke tests.
- Visibility rule (verbatim): a non-owner can read a workout and its children iff no block exists in either direction AND ((`visibility='public'` AND owner profile `is_public`) OR (`visibility in ('followers','public')` AND an accepted follow from the reader to the owner exists)) AND the workout is not `hidden_by_moderation`.
- Sprint workouts (`source='sprint'`) default to **Private** on the Finish sheet; others default to `user_settings.default_visibility` (initially `followers`). `Public` selectable only if the user's profile `is_public`.
- Private profiles: non-followers see handle, display name, avatar and a "Private" badge only.
- Handles: lowercase `^[a-z0-9_]{3,20}$`, unique, checked live.
- Photos: max 4 per workout, resized to max 1080px long edge, JPEG compress 0.8, stored at `workout-media/<owner_id>/<workout_id>/<uuid>.jpg`; avatars at `avatars/<owner_id>/<uuid>.jpg` (512px). Both buckets private; reads via `createSignedUrl` (1 hour).
- Every new table: `owner_id`-style ownership with RLS + parent-ownership `WITH CHECK`. Every `exercises` embed FK-hinted.
- Moderator: `profiles.is_moderator` set only by SQL (never client-writable — exclude from the update policy's allowed changes via a trigger that rejects changes to it unless `auth.role() = 'service_role'`).
- Auto-hide: a workout or comment reported by **3 distinct users** gets `hidden_by_moderation = true`.
- Word filter: `blocked_terms(term text primary key)`, service-role-write only; trigger rejects (raise exception with message `"That text isn't allowed."`, errcode `P0001`) on handles, display names, bios, comments, and workout title/notes when `visibility <> 'private'`. Match whole words case-insensitively (`~* ('\m' || term || '\M')`). Seed ~30 severe slurs/sexual/violent terms (no common words).
- Styling with `lib/theme.ts`; Icons via `Ionicons`. Commit per task (ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); no push.

## Review Focus

1. Blocked user → their workouts, comments, likes and profile vanish from feed, profile, comments and inbox in both directions, and existing follows both ways are removed.
2. A follower whose follow is still `pending` → sees nothing beyond the private-profile card.
3. Flipping a profile from public to private → strangers lose access to its `public` workouts immediately (rule requires `is_public`).
4. A follower opening a workout containing the owner's custom exercise → exercise name renders (widened read), and copying it clones the exercise into the copier's library.
5. Account deletion of a user who has follows, likes, comments, photos, routines, sprints and old-engine rows → completes without FK errors and leaves no rows or storage objects owned by them.

---

### Task 1: Social schema + visibility RLS

**Files:** Create `supabase/migrations/20261108140000_social_core.sql`

- [ ] **Step 1:** Tables: `profiles (id uuid pk references auth.users on delete cascade default auth.uid(), handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'), display_name text not null check (length between 1 and 40), avatar_path text, bio text check (length <= 160), is_public boolean not null default false, is_moderator boolean not null default false, terms_accepted_at timestamptz not null, created_at)`; `follows (follower_id, followee_id → auth.users on delete cascade, status text check in ('pending','accepted'), created_at, primary key (follower_id, followee_id), check (follower_id <> followee_id))`; `user_blocks (blocker_id, blocked_id, pk both, check distinct)`; `hidden_workouts (user_id, workout_id → workouts on delete cascade, pk)`; `workout_likes (user_id, workout_id, created_at, pk)`; `workout_comments (id, owner_id, workout_id → workouts on delete cascade, body text check (length between 1 and 500), hidden_by_moderation boolean default false, created_at)`; `workout_media (id, owner_id, workout_id → workouts on delete cascade, path text not null, position smallint, width int, height int, created_at)`; `alter table workouts add column copied_from_workout_id uuid references workouts(id) on delete set null, add column hidden_by_moderation boolean not null default false`. All `user_id`/`owner_id` columns `references auth.users(id) on delete cascade default auth.uid()`.
- [ ] **Step 2:** `security definer stable` functions, `set search_path = public`: `is_blocked_between(a uuid, b uuid) returns boolean`; `follows_accepted(reader uuid, owner uuid) returns boolean`; `can_read_workout(w_id uuid) returns boolean` (owner, or the visibility rule); `can_view_profile_details(p_id uuid) returns boolean` (self, or not blocked and (is_public or accepted follow)).
- [ ] **Step 3:** Policies (new names, alongside the existing `owner_all_*`): `social_read_workouts` (select, `can_read_workout(id)`), `social_read_workout_exercises` (`can_read_workout(workout_id)`), `social_read_workout_sets` (via its exercise's workout), `exercises` select widened with a new policy `social_read_referenced_exercises` (`exists (select 1 from workout_exercises we where we.exercise_id = exercises.id and can_read_workout(we.workout_id))`). `profiles`: select to authenticated where not blocked either way; insert/update own (`id = auth.uid()`); trigger blocks `is_moderator` changes by non-service-role. `follows`: select rows where you're either side; insert as follower with status forced by a trigger (`accepted` if followee `is_public`, else `pending`) and rejected if blocked; update (accept) only by followee; delete by either side. `user_blocks`: own rows only; an after-insert trigger deletes follows both ways. Likes/comments: select when `can_read_workout(workout_id)` and author not blocked either way and (for comments) not `hidden_by_moderation` unless owner; insert own when `can_read_workout`; delete own; workout owner may delete any comment on their workout. `workout_media`: select `can_read_workout(workout_id)`; write own with parent-ownership check. `hidden_workouts`: own rows.
- [ ] **Step 4:** Storage: create private buckets `workout-media` and `avatars` (`insert into storage.buckets … on conflict do nothing`); `storage.objects` policies: insert/delete own when `(storage.foldername(name))[1] = auth.uid()::text`; select `workout-media` when a `workout_media` row with that `path` exists and `can_read_workout(workout_id)`; select `avatars` to any authenticated user unless blocked.
- [ ] **Step 5:** Commit `feat(db): social core schema and visibility RLS`.

### Task 2: Moderation, word filter, inbox, push plumbing (SQL)

**Files:** Create `supabase/migrations/20261108141000_social_moderation_notifications.sql`

- [ ] **Step 1:** `content_reports (id, reporter_id default auth.uid(), target_type text check in ('workout','comment','user'), target_id uuid, reason text check in ('spam','harassment','nudity','hate','violence','other'), note text, status text default 'open' check in ('open','actioned','dismissed'), created_at, unique (reporter_id, target_type, target_id))`; insert own only, select own only. After-insert trigger: when distinct reporters for a workout/comment reach 3 → set `hidden_by_moderation = true`; always insert a `notifications` row for every moderator (`kind 'report'`).
- [ ] **Step 2:** `blocked_terms` + seed + `check_blocked_terms(text)` function + triggers on `profiles` (handle, display_name, bio), `workout_comments` (body), `workouts` (title, notes when `visibility <> 'private'`).
- [ ] **Step 3:** `notifications (id, recipient_id → auth.users cascade, actor_id → auth.users cascade null, kind text check in ('follow_request','follow_accepted','new_follower','like','comment','report'), workout_id uuid null references workouts on delete cascade, comment_id uuid null references workout_comments on delete cascade, read_at timestamptz, created_at)`; select/update(read_at) own; no client insert. Triggers create rows on: follow insert (pending → `follow_request`, accepted → `new_follower`), follow update to accepted (`follow_accepted` to the follower), like insert, comment insert (to the workout owner; never notify yourself).
- [ ] **Step 4:** `push_tokens (user_id cascade, token text, platform text, updated_at, pk (user_id, token))` own rows. `user_settings` gets `notify_reports boolean default true` (moderators). Trigger `after insert on notifications` → `net.http_post(url := <functions URL>/send-push, headers := jsonb with 'x-push-secret' from vault secret 'push_webhook_secret', body := jsonb_build_object('notification_id', new.id))`. Read the project URL from vault secret `project_url` (the controller creates both secrets). Wrap in `exception when others then null` so a push failure never fails the user's write.
- [ ] **Step 5:** Commit `feat(db): reports, auto-hide, word filter, inbox, push trigger`.

### Task 3: Edge Functions

**Files:** Create `supabase/functions/send-push/index.ts`, `supabase/functions/delete-account/index.ts`, `supabase/functions/_shared/cors.ts` (if absent)

- [ ] **Step 1:** `send-push`: verify `x-push-secret` header equals `Deno.env.get('PUSH_WEBHOOK_SECRET')` (else 401); load the notification + actor profile with the service-role client; check the recipient's `user_settings` toggle for the kind (`like`→`notify_likes`, `comment`→`notify_comments`, follow kinds→`notify_follows`, `report`→`notify_reports`); build text (`@handle liked your workout`, `@handle commented: "<first 80 chars>"`, `@handle wants to follow you`, `@handle accepted your follow request`, `@handle followed you`, `New report: <target_type>`); POST to `https://exp.host/--/api/v2/push/send` for each token with `data: { url }` (deep link path: `/workout-summary/<id>`, `/profile/<actor_id>`, `/inbox`); delete tokens Expo reports as `DeviceNotRegistered`.
- [ ] **Step 2:** `delete-account`: requires the caller's JWT (`verify_jwt` default true); resolve user id from it; with the service role: remove all storage objects under `workout-media/<uid>/` and `avatars/<uid>/` (list + remove, paginated), then delete rows in tables that reference the user **without** `on delete cascade` (inspect every migration: old-engine tables like `sessions`, `recovery`, `user_profile`, `recommendations*`, `exercise_logs`, `daily_feedback`, `activity`, sprint tables, `workouts` and children, routines, custom exercises — list them explicitly in a `const OWNED_TABLES` array in delete-order), then `auth.admin.deleteUser(uid)`. Return `{ ok: true }`; errors return 500 with the message.
- [ ] **Step 3:** Commit `feat: send-push and delete-account edge functions`.

### Task 4: Social RLS smoke suite

**Files:** Create `supabase/tests/rls_smoke_social.py` (model on `rls_smoke_workouts.py`; **do not run**)

- [ ] **Step 1:** Three throwaway users A, B, C. Assert: B can't read A's `followers` workout before follow; pending follow still can't; accepted can; B can't read A's `private` workout ever; C (no follow) reads A's `public` workout only while A `is_public`; block A↔B hides workouts/comments/profile details both ways and removes follows; B can't like/comment on what B can't read; a workout reported by 3 users is hidden from non-owners; `is_moderator` can't be self-set; B can read A's custom exercise only through a readable workout; storage: B can't read A's photo object unless the workout is readable; word filter rejects a seeded term in a followers-visible title but accepts it in a private one; cleanup deletes all three users.
- [ ] **Step 2:** Commit `test: social RLS smoke suite`.

### Task 5: Email sign-in + onboarding + profiles data layer

**Files:** Create `lib/social/profiles.ts` (+ test), `app/onboarding.tsx`; Modify `app/sign-in.tsx`, `app/_layout.tsx`

**Interfaces:**
- Produces: `export interface Profile { id: string; handle: string; displayName: string; avatarPath: string|null; bio: string|null; isPublic: boolean; isModerator: boolean }`; `fetchMyProfile(): Promise<Profile|null>`; `fetchProfile(id): Promise<Profile & { canViewDetails: boolean; followStatus: 'none'|'pending'|'accepted'; followsMe: boolean; followerCount: number|null; followingCount: number|null }>` (counts null when `!canViewDetails`; uses `rpc('can_view_profile_details')`); `isHandleAvailable(h): Promise<boolean>`; `export function normalizeHandle(raw: string): string` (trim, lowercase, strip leading `@`); `export function handleError(h: string): string|null` (`'3–20 letters, numbers or _'`); `createProfile(input: { handle; displayName; avatarUri?: string|null; termsAccepted: true })`; `updateProfile(patch)`; `uploadAvatar(localUri): Promise<string>` (manipulate to 512px, upload, return path); `signedUrl(bucket, path): Promise<string>` with an in-memory cache until 5 min before expiry.
- [ ] **Step 1:** Tests: `normalizeHandle('  @Sohan_M ')` → `sohan_m`; `handleError('ab')`, `handleError('has space')` non-null; valid → null.
- [ ] **Step 2:** Sign-in screen: Apple button + "Continue with email" → email field → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` → 6-digit code field → `verifyOtp({ email, token, type: 'email' })`; resend after 30s; errors inline. Note text: "Use the same sign-in method each time — Apple and email create separate accounts unless the emails match."
- [ ] **Step 3:** Root layout: after a session exists, `fetchMyProfile()`; null → route to `/onboarding` (Stack.Protected guard on a `needsOnboarding` flag; reload the flag after onboarding completes).
- [ ] **Step 4:** Onboarding (one scrolling screen, three steps with a step indicator): (1) display name + handle with live availability (debounced 400ms) + optional photo; (2) units (kg/lbs) + weekly goal (1–14, default 3) → `updateUserSettings`; (3) Terms: summary text + links to Terms and Privacy (`https://<web>/terms`, `/privacy` — base URL from `lib/links.ts` `WEB_BASE_URL` constant, placeholder `https://bulletproof.example` until the controller sets it) + checkbox "I agree to the Terms, including zero tolerance for abusive content" → `createProfile`.
- [ ] **Step 5:** `npx jest && npx tsc --noEmit`; commit `feat: email sign-in and onboarding`.

### Task 6: Profiles, follows, search screens

**Files:** Create `lib/social/follows.ts`, `app/profile/[userId].tsx`, `app/(tabs)/profile.tsx`, `app/people.tsx` (search), `app/follow-list.tsx` (`?userId=&kind=followers|following`), `components/social/Avatar.tsx`, `components/social/FollowButton.tsx`

**Interfaces:**
- Produces: `follow(userId)`, `unfollow(userId)`, `acceptFollow(followerId)`, `declineFollow(followerId)`, `removeFollower(followerId)`, `fetchFollowList(userId, kind)`, `searchProfiles(q)` (handle/display_name `ilike`, limit 20, excludes self and blocked).
- [ ] **Step 1:** Profile screen (own and others): Avatar (signed URL, initials fallback), name, @handle, bio, Private badge, counts (tap → follow list), FollowButton (`Follow` / `Requested` / `Following` with unfollow confirm / `Follow back`), streak + workouts count, list of their readable workouts (`WorkoutListRow`). Not viewable → private card. Own profile tab: same + `Edit profile` + gear → `/settings`. Header menu on others: Report user, Block.
- [ ] **Step 2:** People search with debounce; result rows → profile.
- [ ] **Step 3:** Commit `feat: profiles, follows, people search`.

### Task 7: Posting — visibility + photos; shared workout detail

**Files:** Create `lib/social/media.ts`; Modify `components/logger/FinishSheet.tsx`, `lib/workouts.ts` (`FinishInput` gains `visibility` and `photoUris: string[]`; `Workout` gains `visibility`, `ownerId`, `media: { id; path; position }[]`, `copiedFromWorkoutId`), `app/workout-summary/[workoutId].tsx`
- [ ] **Step 1:** FinishSheet: visibility segmented control (Private / Followers / Public; Public disabled with helper "Make your profile public in Settings to post publicly" when not public; default per Global Constraints), photo strip with `+` (`ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4 - n })`) and remove ×.
- [ ] **Step 2:** `finishWorkout` writes `visibility`; after `ended_at` succeeds, upload photos (`media.ts`: resize via `ImageManipulator`, upload, insert `workout_media` rows); a photo upload failure leaves the workout saved and Alerts "Saved, but N photo(s) didn't upload — add them from the workout."
- [ ] **Step 3:** Workout detail serves both owner and others: owner sees edit (title/notes/visibility/photos add+remove), delete, save as routine; others see author header (avatar, name → profile), photos (horizontal pager), read-only exercises/sets, like/comment bar, `Copy workout`, `⋯` (Report workout, Hide from feed, Block @handle). Word-filter rejection (`P0001`) shows the server message.
- [ ] **Step 4:** Commit `feat: post visibility and photos; shared workout detail`.

### Task 8: Feed, likes, comments, copy, share card

**Files:** Create `lib/social/feed.ts` (+ test for cursor building), `lib/social/interactions.ts`, `app/(tabs)/feed.tsx`, `components/social/FeedCard.tsx`, `app/comments/[workoutId].tsx`, `lib/social/copyWorkout.ts`
- [ ] **Step 1:** `fetchFeed(cursor: { endedAt; id } | null, limit = 20)`: workouts `ended_at not null` where owner is me or someone I follow (accepted) — fetch followee ids first, `.in('owner_id', [me, ...ids])` — excluding `hidden_workouts`; RLS enforces the rest. Each item carries author profile, media paths, exercise/set counts, duration, like count + `likedByMe`, comment count (use `workout_likes(count)`, `workout_comments(count)` aggregates).
- [ ] **Step 2:** Feed tab: FlatList, pull-to-refresh, keyset load-more, FeedCard (author row, relative time, title, notes (3 lines), photo pager, summary chips, like (optimistic, haptic) + comment buttons), bell icon with unread count → `/inbox`, people icon → `/people`. Empty: "Follow friends to see their workouts" + Find people button.
- [ ] **Step 3:** Comments screen: list (author, time, body), composer (500 max), delete own / owner deletes any (long-press), report comment.
- [ ] **Step 4:** `copyWorkout(workoutId, mode: 'start' | 'routine')`: read the workout (RLS), clone any custom exercise not owned by me into my library (`cloned_from_exercise_id`), then `start` → `startWorkout({ source: 'copy', title, copiedFromWorkoutId })` + `addExercisesToWorkout` with set counts and targets from the source's completed working sets; `routine` → `saveRoutine(routineFromWorkout(...))` with cloned ids.
- [ ] **Step 5:** Share card on workout detail: `ShareCard` (Stage 1) with title, date, duration, exercises count, PRs, top 3 exercise names → `shareViewAsImage`.
- [ ] **Step 6:** `npx jest && npx tsc --noEmit`; commit `feat: feed, likes, comments, copy workout, share card`.

### Task 9: Inbox, push registration, report/block/hide UI

**Files:** Create `app/inbox.tsx`, `lib/social/notifications.ts`, `lib/social/safety.ts`, `components/social/ReportSheet.tsx`, `app/blocked.tsx`
- [ ] **Step 1:** Inbox: notifications newest first with actor avatar/text/time; follow requests show Approve / Decline inline; tapping routes like the push `data.url`; opening marks all read.
- [ ] **Step 2:** Push: after sign-in + onboarding, if `Device.isDevice`, request permission (once, after the first finished workout or first follow — not at launch), `getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId })`, upsert into `push_tokens`; notification-tap listener routes to `data.url`; on sign-out delete this device's token.
- [ ] **Step 3:** `safety.ts`: `report(targetType, targetId, reason, note)` (duplicate → "You already reported this."), `block(userId)`, `unblock(userId)`, `fetchBlocked()`, `hideWorkout(id)`. ReportSheet with the 6 reasons + optional note; after reporting, the item disappears for the reporter (hide workouts; filter reported comments client-side for the session). Blocked users screen with Unblock.
- [ ] **Step 4:** Commit `feat: inbox, push notifications, report/block/hide`.

### Task 10: Settings + Profile tab + tabs + Apple Health write + account deletion

**Files:** Rewrite `app/(tabs)/settings.tsx` → move to `app/settings.tsx` (stack screen from Profile's gear); Modify `app/(tabs)/_layout.tsx` (tabs: `index` Workout, `history` History, `progress` Progress, `feed` Feed, `profile` Profile; `Ionicons` `barbell-outline`, `time-outline`, `stats-chart-outline`, `people-outline`, `person-circle-outline`); Create `lib/healthkitWrite.ts`; Delete old HealthKit read sync (`lib/healthkitSync.ts`, `lib/healthkitMapping.ts` + tests, `components/HealthKitSection.tsx`, its `_layout.tsx` calls) and old settings components no longer imported (`DropdownAddSection`, `PainEntryRow`, `FeltRatingPicker` — grep first); remove `expo-location` usage.
- [ ] **Step 1:** Settings sections: Profile (Edit → name/handle/bio/photo), Units, Weekly goal, Default post visibility, Public profile switch (turning off: confirm "Only approved followers will see your workouts"), Blocked users, Notifications (follows/likes/comments; `Reports` only for moderators), Apple Health ("Save workouts to Apple Health" switch → requests write permission for workouts), Legal (Terms, Privacy, Support → `WebBrowser`), Account ("Signed in with Apple" / "Signed in as <email>" from `session.user.app_metadata.provider` + `email`), Sign out, Delete account (two-step confirm, type `DELETE`, → `supabase.functions.invoke('delete-account')` → sign out).
- [ ] **Step 2:** `healthkitWrite.ts`: `saveWorkoutToHealth(w: { startedAt; endedAt; dominantKind: SetKind })` using the library's workout save API (verify the exact function name in `node_modules/@kingstinct/react-native-healthkit` typings — e.g. `saveWorkoutSample`) with activity type: `hold` → flexibility, `weight_reps` → traditionalStrengthTraining, `reps` → functionalStrengthTraining, `duration` → mixedCardio. Called after a successful finish when `healthkitWriteEnabled`; failures are silent (console.warn).
- [ ] **Step 3:** `app.json`: `name` → `Bulletproof`; HealthKit strings → share: "Bulletproof doesn't read your Health data." update: "Bulletproof saves your finished workouts to Apple Health when you turn this on in Settings."; remove the location usage string and the `expo-location` plugin/dependency usage (controller uninstalls); add `expo-notifications` plugin; add `NSPhotoLibraryUsageDescription`: "Choose photos to add to your workouts and profile."
- [ ] **Step 4:** `npx jest && npx tsc --noEmit`; commit `feat: rebuilt settings and profile tab, Apple Health write, account deletion`.

### Task 11: Legal pages on the web app

**Files:** Create `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/support/page.tsx`
- [ ] **Step 1:** Static pages, plain readable layout reusing `globals.css`. Privacy: what's collected (account email/Apple ID, profile, workouts, photos, assessments, push tokens; Apple Health only written, never read), why, who can see what (visibility rules), storage (Supabase), retention + in-app deletion, contact `smadimsetty@gmail.com`… **use a placeholder `support@<domain>` and leave a `TODO(Sohan)` comment** rather than publishing his personal email. Terms: eligibility (13+), acceptable use + **zero tolerance for objectionable content or abusive users**, moderation/termination, not medical advice (mobility suggestions are general information; stop if pain worsens; see a professional), liability limits, changes. Support: FAQ (deleting account, reporting, privacy) + contact.
- [ ] **Step 2:** `cd apps/web && npx tsc --noEmit`; commit `feat(web): privacy, terms, support pages`.

---

## Controller-only steps

Install `expo-image-picker expo-image-manipulator expo-notifications expo-device` (and uninstall `expo-location`) before Task 5. After: create Vault secrets `push_webhook_secret`, `project_url`; `supabase secrets set PUSH_WEBHOOK_SECRET`; enable `pg_net`; `db push`; deploy both functions; set Sohan's `is_moderator`; run both RLS smoke suites + embed smoke + a live delete-account test with a throwaway user; Opus review; fixes; `git push`. Set `WEB_BASE_URL` once Sohan says where `apps/web` is deployed.
