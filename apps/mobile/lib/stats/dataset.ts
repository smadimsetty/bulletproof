// apps/mobile/lib/stats/dataset.ts
//
// One owner-scoped read of finished workouts with their exercises and sets.
// Every stats calculator (streaks, PRs, recap, exercise detail) is a pure
// function over this shape, so screens stay thin and the maths is testable
// without Supabase. Queries filter on owner_id explicitly: the social read
// policies also expose followed users' workouts.
import { supabase } from '../supabase';
import { getMyId } from '../session';
import type { RomUnit, Side } from '../setFields';

export interface StatsSet {
  side: Side;
  setType: 'warmup' | 'working';
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  romValue: number | null;
  romUnit: RomUnit | null;
  completedAt: string | null;
}

export interface StatsExercise {
  exerciseId: string;
  name: string;
  exerciseType: string | null;
  unilateral: boolean;
  sets: StatsSet[];
}

export interface StatsWorkout {
  id: string;
  title: string;
  source: string;
  startedAt: string;
  endedAt: string;
  isSprint: boolean;
  exercises: StatsExercise[];
}

const PAGE = 1000;

function num(v: unknown): number | null {
  // numeric(6,2) columns can arrive as strings depending on the client path.
  return v == null ? null : Number(v);
}

export function toStatsWorkout(w: any): StatsWorkout {
  return {
    id: w.id,
    title: w.title,
    source: w.source,
    startedAt: w.started_at,
    endedAt: w.ended_at,
    isSprint: w.source === 'sprint',
    exercises: ((w.workout_exercises ?? []) as any[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((we) => ({
        exerciseId: we.exercise_id,
        name: we.exercises?.name ?? 'Unknown exercise',
        exerciseType: we.exercises?.exercise_type ?? null,
        unilateral: !!we.exercises?.unilateral,
        sets: ((we.workout_sets ?? []) as any[])
          .slice()
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => ({
            side: s.side ?? null,
            setType: s.set_type ?? 'working',
            reps: num(s.reps),
            weightKg: num(s.weight_kg),
            durationS: num(s.duration_s),
            romValue: num(s.rom_value),
            romUnit: s.rom_unit ?? null,
            completedAt: s.completed_at ?? null,
          })),
      })),
  };
}

/**
 * Finished workouts only (ended_at not null), oldest first. With
 * `exerciseIds`, only those exercises' rows are embedded (and workouts with
 * none of them are dropped) via an inner join.
 */
export async function fetchStatsDataset(opts?: { exerciseIds?: string[] }): Promise<StatsWorkout[]> {
  const ids = opts?.exerciseIds;
  if (ids && ids.length === 0) return [];

  const embed = ids ? 'workout_exercises!inner' : 'workout_exercises';
  const select = `id, title, source, started_at, ended_at,
     ${embed} ( exercise_id, position,
       exercises!workout_exercises_exercise_id_fkey ( name, exercise_type, unilateral ),
       workout_sets ( set_number, side, set_type, reps, weight_kg, duration_s, rom_value, rom_unit, completed_at ) )`;

  // Followed users' workouts are readable too; stats are about me only.
  const me = await getMyId();
  const out: StatsWorkout[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('workouts')
      .select(select)
      .eq('owner_id', me)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (ids) q = q.in('workout_exercises.exercise_id', ids);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    out.push(...rows.map(toStatsWorkout));
    if (rows.length < PAGE) break;
  }
  return out;
}
