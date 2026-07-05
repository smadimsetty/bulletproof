// apps/mobile/lib/homeProgram.ts
//
// Fetches today's full multi-block program (recommendation_blocks +
// recommendation_block_exercises, joined to exercises for display fields)
// plus yesterday's already-generated public_rationale, for the Home
// screen. Deliberately queries the base `recommendations` table, not
// `recommendations_public` -- the public view excludes `id`, which
// `recommendation_blocks.recommendation_id` needs to join against, and an
// authenticated screen reading its own RLS-scoped row is exactly what the
// base table's `owner_read_recommendations` policy is for. See
// docs/superpowers/specs/2026-06-24-home-screen-design.md Decision 1/2/3.
//
// No client-side Claude call of any kind happens here or anywhere in this
// module -- `yesterdayRationale` is read verbatim from the `recommendations`
// row the nightly engine already wrote.
import { supabase } from './supabase';
import { localDateString } from './healthkitMapping';
import type { SessionType } from './recommendations';

export interface BlockExercise {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly prescribedSets: number | null;
  readonly prescribedReps: string | null;
  readonly prescribedWeightNote: string | null;
  readonly isUnilateralLeftFirst: boolean;
  readonly notes: string | null;
  readonly demoVideoUrl: string | null;
}

export interface ProgramBlock {
  readonly id: string;
  readonly order: number;
  readonly blockType: SessionType;
  readonly splitDayLabel: string | null;
  readonly title: string;
  readonly estimatedMinutes: number | null;
  readonly exercises: readonly BlockExercise[];
}

export interface TodayProgram {
  readonly recommendationId: string;
  readonly date: string;
  readonly topPick: SessionType;
  readonly runnerUp: SessionType | null;
  readonly publicRationale: string;
  readonly isProvisional: boolean;
  readonly blocks: readonly ProgramBlock[];
}

export interface HomeData {
  readonly today: TodayProgram | null;
  readonly yesterdayRationale: string | null;
}

interface RawRecommendationRow {
  id: string;
  date: string;
  top_pick: SessionType;
  runner_up: SessionType | null;
  public_rationale: string;
  score_breakdown: { readiness: number | null } | null;
}

interface RawBlockExerciseRow {
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
    demo_video_url: string | null;
    exercise_type: string | null;
  } | null;
}

interface RawBlockRow {
  id: string;
  block_order: number;
  block_type: SessionType;
  split_day_label: string | null;
  title: string;
  estimated_minutes: number | null;
  recommendation_block_exercises: RawBlockExerciseRow[];
}

async function fetchRecommendationRow(dateIso: string): Promise<RawRecommendationRow | null> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('id, date, top_pick, runner_up, public_rationale, score_breakdown')
    .eq('date', dateIso)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RawRecommendationRow | null) ?? null;
}

async function fetchBlocksWithExercises(recommendationId: string): Promise<ProgramBlock[]> {
  const { data, error } = await supabase
    .from('recommendation_blocks')
    .select(
      `id, block_order, block_type, split_day_label, title, estimated_minutes,
       recommendation_block_exercises (
         id, exercise_order, prescribed_sets, prescribed_reps, prescribed_weight_note,
         is_unilateral_left_first, notes,
         exercises:exercise_id ( id, name, demo_video_url, exercise_type )
       )`
    )
    .eq('recommendation_id', recommendationId)
    .order('block_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as RawBlockRow[];

  return rows.map((block) => ({
    id: block.id,
    order: block.block_order,
    blockType: block.block_type,
    splitDayLabel: block.split_day_label,
    title: block.title,
    estimatedMinutes: block.estimated_minutes,
    exercises: [...block.recommendation_block_exercises]
      .sort((a, b) => a.exercise_order - b.exercise_order)
      .map((exercise) => ({
        id: exercise.id,
        order: exercise.exercise_order,
        name: exercise.exercises?.name ?? 'Unknown exercise',
        prescribedSets: exercise.prescribed_sets,
        prescribedReps: exercise.prescribed_reps,
        prescribedWeightNote: exercise.prescribed_weight_note,
        isUnilateralLeftFirst: exercise.is_unilateral_left_first,
        notes: exercise.notes,
        demoVideoUrl: exercise.exercises?.demo_video_url ?? null,
      })),
  }));
}

/**
 * Fetches everything the Home screen needs to render today's program and
 * yesterday's summary, in one call. `today` is resolved to its local
 * calendar date (matching `recommendations.ts`'s existing local-date
 * convention) -- this is a single screen-level fetch, not three independent
 * ones, per design spec Decision 2.
 */
export async function fetchHomeData(today: Date): Promise<HomeData> {
  const todayIso = localDateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = localDateString(yesterday);

  const todayRow = await fetchRecommendationRow(todayIso);

  if (!todayRow) {
    return { today: null, yesterdayRationale: null };
  }

  const [blocks, yesterdayRow] = await Promise.all([
    fetchBlocksWithExercises(todayRow.id),
    fetchRecommendationRow(yesterdayIso),
  ]);

  return {
    today: {
      recommendationId: todayRow.id,
      date: todayRow.date,
      topPick: todayRow.top_pick,
      runnerUp: todayRow.runner_up,
      publicRationale: todayRow.public_rationale,
      isProvisional: todayRow.score_breakdown?.readiness == null,
      blocks,
    },
    yesterdayRationale: yesterdayRow?.public_rationale ?? null,
  };
}

/**
 * Whether the Home screen should fire the on-demand engine trigger and poll
 * for a fresher recommendation. `isProvisional` (no real Oura readiness yet)
 * is not the same as "not ready" -- a fallback_template row with null
 * readiness can be permanently null (e.g. the ring never synced that day),
 * so gating this on isProvisional alone would retrigger on every foreground
 * forever with no way to ever resolve. Bounding it to one attempt per local
 * calendar date (reset by an explicit pull-to-refresh) keeps the "try to
 * get something fresher right after opening the app" behavior without the
 * unbounded retry loop.
 */
export function shouldAttemptFreshRecommendation(
  data: HomeData,
  todayIso: string,
  lastAttemptedIso: string | null
): boolean {
  const needsFresh = !data.today || data.today.isProvisional;
  return needsFresh && lastAttemptedIso !== todayIso;
}
