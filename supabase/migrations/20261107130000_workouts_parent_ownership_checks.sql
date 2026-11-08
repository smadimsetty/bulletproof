-- Tighten the workouts tables' owner policies: a row must not only be
-- owned by the caller, every row it references must be the caller's too.
--
-- Found by a live two-user smoke test on 2026-11-07: owner_all_* only
-- checked the row's own owner_id, and foreign-key checks bypass RLS, so
-- user B could insert a workout_sets row pointing at user A's
-- workout_exercise, or create a workout claiming A's sprint_day_id (a
-- UNIQUE column -- which would block A from ever logging that sprint day).
--
-- USING stays owner_id = auth.uid(); only WITH CHECK (inserts/updates)
-- gains the parent-ownership conditions. The social sub-project still adds
-- its read policies alongside these rather than editing them.

drop policy owner_all_workouts on workouts;
create policy owner_all_workouts on workouts
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      sprint_day_id is null
      or exists (
        select 1 from sprint_days d
        join sprints s on s.id = d.sprint_id
        where d.id = workouts.sprint_day_id and s.owner_id = auth.uid()
      )
    )
  );

drop policy owner_all_workout_exercises on workout_exercises;
create policy owner_all_workout_exercises on workout_exercises
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id and w.owner_id = auth.uid()
    )
    and (
      sprint_day_exercise_id is null
      or exists (
        select 1 from sprint_day_exercises x
        join sprint_days d on d.id = x.sprint_day_id
        join sprints s on s.id = d.sprint_id
        where x.id = workout_exercises.sprint_day_exercise_id and s.owner_id = auth.uid()
      )
    )
  );

drop policy owner_all_workout_sets on workout_sets;
create policy owner_all_workout_sets on workout_sets
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from workout_exercises we
      where we.id = workout_sets.workout_exercise_id and we.owner_id = auth.uid()
    )
  );
