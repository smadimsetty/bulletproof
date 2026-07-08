// apps/mobile/lib/loggerBlock.ts
//
// Fetches one recommendation_blocks row standalone, by id, joined to its
// recommendation_block_exercises and each row's exercises -- the Logger
// screen is reachable via a direct deep link or after an app restart, so
// it cannot assume it was handed block data via navigation params the
// way Home already has it in memory. Mirrors homeProgram.ts's nested-
// select shape exactly (same embed syntax, same column list plus the
// extra exercise_id/movement_pattern/exercise_type fields the Logger
// needs to pick a row component and a swap filter, which Home's display-
// only use case didn't need). See
// docs/superpowers/specs/2026-06-24-logger-design.md Decision 1.
import { supabase } from './supabase';
import type { SessionType } from './recommendations';

export interface LoggerExercise {
  readonly id: string;
  readonly recommendationBlockExerciseId: string | null;
  readonly order: number;
  readonly exerciseId: string;
  readonly name: string;
  readonly movementPattern: string;
  readonly exerciseType: string | null;
  readonly prescribedSets: number | null;
  readonly prescribedReps: string | null;
  readonly prescribedWeightNote: string | null;
  readonly isUnilateralLeftFirst: boolean;
  readonly notes: string | null;
  readonly demoVideoUrl: string | null;
}

export interface LoggerBlock {
  readonly id: string;
  readonly order: number;
  readonly blockType: SessionType;
  readonly splitDayLabel: string | null;
  readonly title: string;
  readonly estimatedMinutes: number | null;
  readonly exercises: readonly LoggerExercise[];
}

interface RawExerciseRow {
  id: string;
  exercise_order: number;
  prescribed_sets: number | null;
  prescribed_reps: string | null;
  prescribed_weight_note: string | null;
  is_unilateral_left_first: boolean;
  notes: string | null;
  exercises: {
    id: string;
    name: string;
    movement_pattern: string;
    exercise_type: string | null;
    demo_video_url: string | null;
  } | null;
}

interface RawBlockRow {
  id: string;
  block_order: number;
  block_type: SessionType;
  split_day_label: string | null;
  title: string;
  estimated_minutes: number | null;
  recommendation_block_exercises: RawExerciseRow[];
}

const SELECT = `id, block_order, block_type, split_day_label, title, estimated_minutes,
  recommendation_block_exercises (
    id, exercise_order, prescribed_sets, prescribed_reps, prescribed_weight_note,
    is_unilateral_left_first, notes,
    exercises:exercise_id ( id, name, movement_pattern, exercise_type, demo_video_url )
  )`;

export async function fetchLoggerBlock(blockId: string): Promise<LoggerBlock | null> {
  const { data, error } = await supabase
    .from('recommendation_blocks')
    .select(SELECT)
    .eq('id', blockId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as RawBlockRow;

  return {
    id: row.id,
    order: row.block_order,
    blockType: row.block_type,
    splitDayLabel: row.split_day_label,
    title: row.title,
    estimatedMinutes: row.estimated_minutes,
    exercises: [...row.recommendation_block_exercises]
      .sort((a, b) => a.exercise_order - b.exercise_order)
      .map((exercise) => ({
        id: exercise.id,
        recommendationBlockExerciseId: exercise.id,
        order: exercise.exercise_order,
        exerciseId: exercise.exercises?.id ?? '',
        name: exercise.exercises?.name ?? 'Unknown exercise',
        movementPattern: exercise.exercises?.movement_pattern ?? '',
        exerciseType: exercise.exercises?.exercise_type ?? null,
        prescribedSets: exercise.prescribed_sets,
        prescribedReps: exercise.prescribed_reps,
        prescribedWeightNote: exercise.prescribed_weight_note,
        isUnilateralLeftFirst: exercise.is_unilateral_left_first,
        notes: exercise.notes,
        demoVideoUrl: exercise.exercises?.demo_video_url ?? null,
      })),
  };
}
