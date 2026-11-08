# Final whole-branch review: sub-project A (logger + history)

Branch `feat/logger-history`, `28cce8b..bfebfd5` (12 commits). Reviewed against
`docs/superpowers/specs/2026-11-07-logger-history-design.md` (binding) and the plan.
Method: one reviewer pass over every changed source file, read in full from the
working tree, plus `sprintLifecycle.ts`, earlier migrations and the pre-pivot bridge
(`04d0b3e^`) for context. I did not re-run jest, tsc or expo export, as instructed. I
touched no network and no `.env`.

## Strengths

- The data layer is clean. Every pure decision (`planFinish`, `prefillValues`,
  `parseTargetSeconds`, `tickHold`/`stopHold`, `groupByWeek`, `formatSetLines`)
  is isolated and unit-tested, and `workouts.ts` only reads and writes rows.
- `finishWorkout` follows the spec's ordering exactly. It deletes uncompleted sets,
  then empty exercises, then completes the sprint exercises, `completeDay` and the
  feedback upsert, and writes `ended_at` last. `handleSave` reloads before re-planning,
  so a retry recomputes the plan from DB truth. Every step is idempotent:
  re-deleting is a no-op, `completed_at` gets rewritten, and feedback is an upsert
  on `sprint_day_id`.
- The PostgREST query shapes are all valid:
  - `exercises!exercise_id` is a column-name FK hint. It is the same pattern as the
    proven `28cce8b` fix, and there is a single FK.
  - `workouts!inner(ended_at)` with `.not('workouts.ended_at','is',null)` is a
    supported embedded-filter-on-inner-join. It produces
    `workouts.ended_at=not.is.null`, and the client filters again as a belt-and-braces check.
  - `.is('ended_at', null).maybeSingle()` is safe because of the partial unique index.
  - `.order('ended_at', desc).range(...)` is fine.
- RLS is correct. None of the three tables' inserts pass `owner_id`, and each table has
  `default auth.uid()`, which satisfies the `with check`.
- The timers use absolute deadlines throughout. `tickHold` correctly collapses
  lead_in, then holding, then completed after a long background.
- The timer callbacks have no stale-closure bugs. The interval's captured
  `handleTimerEvent` and `completeRow` read `workoutRef`/`draftsRef`, and every
  setter they touch is stable.
- Navigation is sound:
  - All four new routes sit inside `Stack.Protected`.
  - There is no logger/summary `replace` loop. The logger redirects only when
    `endedAt` is set, the summary only when it is null, and nothing ever flips a
    workout back to in progress.
  - Every `subscribeToActiveWorkoutChanges` consumer returns the unsubscribe from its
    effect, so no listeners leak.
- The sprint move preserves the assessment-draft rule. Refresh mode never sets
  `loading`, and refresh errors now go through `Alert` (this closes the parked
  follow-up). The day-14 path leads into the reassessment form on both the Workout
  tab card and `/sprint`. "Day N logged ✓" shows correctly on both screens after
  save, because both refetch on focus and the tab also refetches on the change event.
- The Live Activity bridge improves on the original. It ends orphans from a
  previous process when nothing is active, and it can never throw. The per-call
  `require` is fine because Metro caches modules after the first call.

## Issues

### Critical

None.

### Important

**1. Starting a new hold while another is running lets the old row's async
completion hijack the new hold.**
- File: `apps/mobile/app/workout/[workoutId].tsx:198-207` and `:133-139`.
- Failure scenario:
  1. The user is holding Couch stretch L, set 1. They tap ▶ on a different row.
  2. `startHoldFor` calls `handleTimerEvent(stopped.event)`, which calls
     `completeRow(rowId, elapsed, viaTimer = true)`, and then immediately starts the new hold.
  3. About 300–800 ms later, after `updateSet` and `reload` resolve, `completeRow` sees
     an incomplete Right partner and `viaTimer`. It calls `setHold(startSwitch(...))`,
     which **overwrites the hold the user just started** and auto-starts Couch stretch R
     five seconds later.
  4. If the stopped row had no partner, `setRest(...)` fires instead, and a rest bar
     appears during an active hold. That contradicts "starting a hold timer cancels
     rest", and the warning haptic fires mid-hold.
  5. A success haptic also fires on this manual stop.

  The same clobbering happens whenever the user starts any hold during the network
  wait after an auto-completion.
- Fix:
  - In `startHoldFor`, call `completeRow(event.rowId, event.durationS, false)`
    directly, with no success haptic, rather than routing through `handleTimerEvent`.
  - Keep a `holdRef` in sync with `hold`. After the awaits in `completeRow`, skip
    `startSwitch`/`startRest` if `holdRef.current.phase !== 'idle'`.

**2. Tapping ✓, un-tick or × on the row whose hold timer is running does not stop
the timer, so the row gets completed twice.**
- File: `apps/mobile/app/workout/[workoutId].tsx:355`, `:359`, `:361-362`. `SetRow`
  keeps ✓ and × enabled while the row is timing.
- Failure scenario:
  1. Mid-hold, the user taps ✓ ("I'm done"). The row completes with the full target
     `duration_s`, not the elapsed time, and a rest timer starts (non-sided). The hold
     keeps counting.
  2. At zero it fires `hold_completed`, which rewrites the row, restarts rest, and on
     a Left row starts the switch countdown and auto-starts Right.
  3. If the user un-ticked the row instead, the timer silently re-ticks it.
  4. If they deleted the row, the label simply disappears and nothing visible stops
     the timer.
- Fix: when `isTimerRow`, route ✓ to `stopHoldNow`, which completes with the elapsed
  time. Make × and un-tick call `setHold(IDLE)` first.

**3. Edits to already-completed rows are silently lost when the user finishes
without blurring the field.**
- File: `apps/mobile/app/workout/[workoutId].tsx:154-164` and `:253-259`;
  `components/logger/SetRow.tsx:70-73`.
- Failure scenario:
  1. Completed rows persist edits only in `onEndEditing`. iOS `number-pad` and
     `decimal-pad` have no Return key.
  2. Because `keyboardShouldPersistTaps="handled"`, tapping another row's ✓ (or the
     header Finish) does not blur the input.
  3. So the user changes set 1 from 8 to 10 reps, ticks set 2, then taps Finish.
  4. `handleSave` reloads and `finishWorkout` saves the **DB** values. The edit is
     dropped, although the screen showed 10.
- Fix: before `finishWorkout`, call `Keyboard.dismiss()`. Then, for every completed
  set whose draft differs from `valuesOf(set)`, `await updateSet(id, draft)` and
  reload. Optionally also add an `InputAccessoryView` "Done" bar.

**4. Changing the ROM unit on a completed row is never persisted.** This is the
deferred minor from the ledger, upgraded here.
- File: `components/logger/SetRow.tsx:194`; `app/workout/[workoutId].tsx:154-160`.
- Failure scenario:
  1. The unit toggle calls only `onChange` and never `onCommitEdit`.
  2. Even if it did, `commitEdit` reads `draftsRef.current`, which is still pre-render.
  3. The logger shows "deg", because `reload` keeps the draft. The saved workout and
     History show "cm".
- Fix: change `onCommitEdit` to `(values?: SetValues) => void`. Have `commitEdit` use
  the explicit values when given. The toggle then calls
  `onChange(next); onCommitEdit(next)`. Finding 3's flush would also catch it on Finish.

**5. The logger has no keyboard avoidance, so the keyboard hides the lower set rows.**
- File: `apps/mobile/app/workout/[workoutId].tsx:328` (no
  `automaticallyAdjustKeyboardInsets`/`KeyboardAvoidingView` anywhere in `app/` or
  `components/`).
- Failure scenario:
  1. The bottom padding is only 120 pt, but the iOS number pad plus the safe area is
     about 290 pt.
  2. When the user taps reps on the last exercise's last rows, the keyboard covers the
     field and its ✓.
  3. The ScrollView cannot scroll it into view because its insets don't change.

  Every workout's last exercise is affected, so this will show up on the first
  TestFlight session.
- Fix: add `automaticallyAdjustKeyboardInsets` and `keyboardDismissMode="interactive"`
  to the logger ScrollView. The same flags help `FinishSheet`'s notes field.

**6. Finishing a sprint workout after its sprint was abandoned breaks: on day 14 it
revives the sprint or blocks the save for good.**
- File: `apps/mobile/lib/workouts.ts:432-446` together with
  `sprintLifecycle.ts:357-371`.
- Failure scenario:
  1. The user starts the Day 14 routine, opens `/sprint`, and taps "Switch pain point"
     (abandon). Nothing guards against this while a sprint workout is in progress.
  2. Later they finish the workout. `completeDay(..., 14, sprintId)` sets the
     **abandoned** sprint back to `pending_reassessment`.
  3. If the user picked no new pain point, the abandoned sprint comes back as in
     flight, undoing the switch.
  4. If they did pick one, `sprints_one_in_flight_per_owner` raises 23505. The save
     fails on every retry, and Discard becomes the only way out, losing the whole
     logged session.

  For days 1–13 the writes to an abandoned sprint are harmless but pointless.
- Fix: in `finishWorkout`, select `sprints(status)` with the day. Run the
  sprint-completion block only when the status is `'active'`; otherwise just save the
  workout. Alternatively, guard `completeDay`'s sprint update with
  `.eq('status','active')`. Also consider blocking or warning on abandon while
  `activeWorkout.sprintDayId === today.id`.

### Minor

**7. The timer state updaters have side effects.**
- File: `app/workout/[workoutId].tsx:181-192`.
- Problem: `setHold`'s updater schedules `setTimeout(handleTimerEvent)`, and
  `setRest`'s updater fires a haptic. Updaters must be pure. Under StrictMode, or if
  React discards and replays a render, both run twice, which means a duplicate
  `completeRow` or a duplicate haptic. This is low risk in production today.
- Fix: compute `tickHold(holdRef.current, t)` in the interval body, then call
  `setHold(timer)` and dispatch the event outside any updater.

**8. Stop and the auto-complete tick can race within 250 ms.**
- File: `:209-214`.
- Problem: `stopHoldNow` reads `hold` from the render closure. If a tick has already
  moved it to IDLE and queued `hold_completed`, both paths call `completeRow` with
  different durations (elapsed and target), and the last write wins.
- Fix: the `holdRef` from finding 1 fixes this. Read the ref in `stopHoldNow` and
  no-op if it is idle.

**9. Every tab load runs twice and the refresh spinner flashes on every focus.**
- Files: `app/(tabs)/index.tsx:55-63`, `app/(tabs)/history.tsx:238-246`,
  `app/sprint.tsx:111-118`.
- Problems:
  - `useEffect(load initial)` and `useFocusEffect(load refresh)` both fire on mount,
    so every request runs twice.
  - Each focus sets `refreshing = true`, so the native pull-to-refresh spinner
    flashes and the content shifts on every tab switch.
  - While offline, every focus raises an `Alert`. The first mount shows both the
    error screen and an Alert.
  - History's focus reload also resets paging to the first 30 items. Coming back
    from a workout detail after "Load more" truncates the list.
- Fix:
  - Drop the mount `useEffect`, since `useFocusEffect` runs on mount.
  - Use a silent `'focus'` mode that doesn't set `refreshing` and doesn't Alert.
  - In History, keep the loaded count on focus reloads.

**10. The spec's "prev: …" hint is not implemented.**
- Spec reference: §4 Planned sets. The plan dropped it too, since there is no
  `prev:` anywhere in the plan or the code.
- Problem: values are prefilled from history, so the hint is partly redundant.
  Still, this is a spec deviation that Sohan should confirm or defer explicitly.

**11. The ROM unit is chosen per row, not "once per exercise" as the spec says.**
- File: `SetRow.tsx:194`; spec §3.
- Problem: toggling the unit on row 1 doesn't change rows 2 and onward.
  `addSet` copies the last unit, which only partly covers this.

**12. Two spec §8 data-layer tests are missing.**
- File: `lib/workouts.test.ts`.
- Missing tests:
  - `finishWorkout` ordering and idempotency, including that `ended_at` is written
    last and that a failure mid-sequence leaves `ended_at` unset.
  - The `startSprintWorkout` resume-existing and cleanup-on-failure paths.

  `planFinish` is tested, but the sequence that the spec specifically calls out is not.

**13. Any 23505 is mapped to "workout in progress".**
- File: `lib/workouts.ts:114-116`, `:277-280`.
- Problem: `workouts.sprint_day_id` is also UNIQUE. Starting a routine for a day that
  already has a saved workout raises 23505 too, for example from a stale card or a
  second device. The user then sees "You already have a workout in progress" with no
  Resume button, because there is no active workout.
- Fix: check `error.message` or `details` for `workouts_one_in_progress_per_owner`.

**14. Swap is still offered while today's sprint workout is in progress.**
- File: `components/SprintDayChecklist.tsx:64`.
- Problem: swapping rewrites `sprint_day_exercises.exercise_id`. The workout row
  still points at that `sprint_day_exercise_id`, so on finish the *swapped-in*
  exercise is credited with `completed_at`. That pollutes the LRU history, which is
  the exact problem the inline comment warns about, and the logger and the sprint
  list now disagree.
- Fix: hide Swap when `routineInProgress`.

**15. Sprint start makes a long chain of sequential requests.**
- File: `lib/workouts.ts:207-229`, `:304-338`.
- Problems:
  - `fetchPreviousSets` pulls *every* historical `workout_exercises` row for the
    exercise, with all its sets, and sorts client-side. That grows without bound.
  - `addExercisesToWorkout` runs about 3 sequential round trips per exercise. A
    6-exercise sprint day is about 20 serial requests, several seconds of
    "Starting…" on cellular.
- Fix: order by `workouts(ended_at)` desc with `limit(1)` (PostgREST to-one ordering).
  Fetch the previous sets in parallel, or batch the inserts.

**16. The Live Activity can reattach to the wrong workout and is never ended on sign-out.**
- File: `lib/workoutActivityBridge.ts:36-41`; `app/_layout.tsx:86-109`.
- Problems:
  - Reattaching to `getInstances()[0]` may adopt an orphan from an older workout,
    for example one ended or discarded on another device. The lock screen then shows
    the stale title.
  - A switch straight from workout A to workout B, with no null fetch in between,
    keeps A's activity.
  - Signing out never ends the activity.
- Fix: store the workout id alongside `currentActivity`. End and restart when the id
  differs, and end on session loss.

**17. The logger re-renders the whole screen and resets header options 4×/s while a
timer runs.**
- File: `app/workout/[workoutId].tsx:178-180`, `:318-327`.
- Problems:
  - `setNow` re-renders every SetRow every 250 ms.
  - The inline `Stack.Screen options`/`headerRight` triggers `setOptions` on each tick.
  - Both can cause input lag and missed taps on Finish during rest or hold.
- Fix: memoize the options. Isolate the countdown text in a small ticking component.

**18. A partially-failed finish followed by Discard leaves the sprint day completed.**
- File: `lib/workouts.ts:432-456`.
- Problem: if `completeDay` succeeded but the `ended_at` update failed, and the user
  then discards, the sprint day stays completed with no workout behind it. This
  contradicts spec §4 ("Sprint day stays not-completed").
- Fix: low priority. Accept and document, or revert `completed_at` in
  `discardWorkout` when `sprint_day_id` is set.

**19. Opening the Finish sheet silently drops a running hold.**
- File: `app/workout/[workoutId].tsx:256`.
- Problem: `handleSave` sets the hold to IDLE before the no-completed-sets check. On
  "Keep logging" the in-progress hold is gone without being completed.
- Fix: stop the hold (completing it with elapsed time) instead of resetting it, or
  reset it only after a successful save.

**20. The summary's Edit can save an empty title.**
- File: `lib/workouts.ts:467-473`.
- Problem: `updateWorkoutMeta` writes `''`, while Finish falls back to the old title.
- Fix: apply the same fallback.

**21. Double taps can push two screens or trigger a false conflict.**
- Files: `ActiveWorkoutBanner.tsx:228`; `index.tsx:118`.
- Problems:
  - A fast double tap on the banner pushes two logger instances.
  - `disabled={starting}` doesn't protect against two taps landing before the
    re-render. The second start then hits 23505 and shows the "already in progress"
    alert for the workout just created.
- Fix: guard with a ref.

**22. History paging can skip or duplicate rows.**
- File: `lib/workouts.ts:251-252`.
- Problem: there is no tie-breaker on `ended_at`, and paging uses offsets, so a
  delete or save between pages shifts the window.
- Fix: add `.order('id')` as a secondary order. For a 30-item page this is acceptable.

## Ledger deferred-minor triage

| Ledger item | Verdict |
|---|---|
| Task 7: `_layout.tsx` header comment "per that same table" now dangles | **can-wait.** Comment only, so fix it opportunistically in the same commit as other `_layout` changes, e.g. finding 16. |
| Task 8: ROM unit toggle on a completed row is never persisted | **must-fix.** This is Important finding 4. It is real data loss visible in History, and the ledger already flagged it for the final wave. |

## Recommendations

- Findings 1, 2, 7, 8 and 19 share one root cause: there is no single synchronous
  source of truth for the hold timer. Introduce `holdRef` and make every
  completion path consult it. That one refactor fixes five findings.
- Findings 3 and 4 share another: completed-row persistence is tied to
  blur. Add a "flush dirty completed drafts" helper and call it from Finish, from the
  ROM toggle, and from unmount if practical.
- Finding 5 and the timer flows (holds, switch, rest haptics, backgrounding) can
  only be confirmed on a device. List them explicitly in the TestFlight checklist
  for Sohan.

## Assessment

**Ready to merge: With fixes**

**Reasoning:** The data model, the query shapes, RLS, the finish ordering and idempotency,
navigation, and the sprint move are all sound, and I found no Critical issues. However,
the live logger's timer and completion interplay (findings 1 and 2), lost edits on
completed rows (3 and 4), the keyboard covering inputs (5), and the abandoned-sprint
day-14 finish (6) would all surface in real use. All six are small, local fixes.
