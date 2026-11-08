# Mobility logger + social — roadmap spec

Agreed with Sohan on 2026-11-07. Bulletproof grows from the single-purpose
pain-point sprint app (`2026-09-16-mobility-sprint-pivot-design.md`) into a
full workout logger with history, routines, progress stats, and a social
layer — modeled on the *feature set and interaction patterns* of Hevy
(a popular strength-training logger with a social feed), but re-aimed at
long-lasting mobility. We copy no Hevy branding, naming, or visual design.

## Decisions (from the 2026-11-07 brainstorm)

1. **Sprints live inside the logger.** A 14-day pain-point sprint becomes one
   kind of guided program the user can run; each sprint day is completed by
   logging a real workout through the same logger, so sprint work appears in
   history (and later the feed) like any other workout.
2. **Social audience: small circle of real friends first, with opt-in public
   profiles.** Profiles are private by default (follow requests need
   approval); a user may flip their profile public. Posts carry photos,
   videos, and the full workout. "Copy this workout" / "save as routine"
   from anything you can see is a core action. Public profiles mean
   user-generated content is visible to strangers, so App Store rules
   require report / block / hide — these ship with the social sub-project,
   not later.
3. **Mobility-first, logs everything.** Mobility/stretch/balance/corrective
   work is the center (holds, sides, ROM measurements), but strength sets
   (weight × reps), plyometrics, and cardio log in the same workout. The
   exercise's `exercise_type` decides which inputs appear.
4. **New clean workout tables**, not the old `sessions`/`exercise_logs`
   (those are coupled to the dormant engine: `exercise_logs` has no session
   foreign key at all, and `block_type` is a required old-engine enum).
   The old tables stay untouched for `engine/`.
5. **Mobility-appropriate metrics.** No volume/1RM leaderboards. Progress =
   ROM measurements, hold times, left/right symmetry, consistency. Social
   competition (if any) = consistency/improvement, never "best ankle ROM".

## Sub-projects (each gets its own detailed spec → plan → build)

| # | Sub-project | Ships | Tabs after it ships |
|---|---|---|---|
| **A** | Logger + history | Log any workout (empty or sprint day); hold/rest/side timers; previous-values prefill; Live Activity; history list + workout detail | Workout · History · Trends · Settings |
| B | Routines + library | Routines + folders; save any workout as a routine; start from routine; exercise library browser with demo videos; custom exercises | same |
| C | Progress + stats | ROM/hold trends per exercise, L/R symmetry, streaks, personal-best toasts in the logger, monthly recap, discomfort/RPE inputs | Workout · Profile (history + stats + settings) |
| D | Social | Profiles (private default, opt-in public), follow requests, feed, photo/video on posts, likes + comments, copy workout / save as routine, share card, report/block/hide | Feed · Workout · Profile |

Order is load-bearing: the feed is empty without A; "save as routine from a
friend's post" needs B; profile stats need C.

## Permanent data model

Every personal table: `owner_id uuid not null references auth.users default
auth.uid()` + `owner_id = auth.uid()` RLS, exactly like the rest of the
schema.

**Built in A** (detailed in the A spec): `workouts`, `workout_exercises`,
`workout_sets`. `workouts.visibility` (`private`/`followers`/`public`,
default `private`) exists from day one but is only *enforced for other
readers* in D.

**Added later by additive migrations only:**
- B: `routine_folders`, `routines`, `routine_exercises`; `workouts.routine_id`;
  nullable `exercises.owner_id` (null = global catalog row) for custom
  exercises, with RLS widened to "global OR mine".
- C: read-only SQL views / client-side aggregation over `workout_sets`; no
  new base tables expected.
- D: `profiles` (handle, display_name, avatar_path, bio, is_public),
  `follows` (follower_id, followee_id, status `pending`/`accepted`),
  `workout_media` (Supabase Storage bucket, path + kind + position),
  `workout_likes`, `workout_comments`, `user_blocks`, `content_reports`;
  `workouts.copied_from_workout_id`. Non-owner read rule for a workout and
  its children: owner, OR (`visibility='public'` AND the owner's profile
  `is_public`), OR (`visibility in ('followers','public')` AND an accepted
  follow exists), AND no block in either direction. This is a widening of
  the A-era policies, so A's policies are written as separate, named
  owner policies D can add alongside rather than rewrite.

## Out of scope across the whole roadmap (for now)

Coach platform, paid tiers, Strava export, Android-specific work, offline
logging (noted as a later item after A), web-dashboard changes.
