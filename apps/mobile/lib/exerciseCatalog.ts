// apps/mobile/lib/exerciseCatalog.ts
//
// Fetches the full exercise catalog (189 rows per the Phase 1 seed --
// small enough to fetch once per Logger-screen mount and filter
// client-side, mirroring engine/exercise_catalog_repo.py's own precedent
// of pulling a movement_pattern-scoped set and narrowing further in code
// rather than expressing an array-intersection in PostgREST query
// syntax) plus the two pure filter-predicate builders the swap and
// "+ Add an exercise" pickers each need. Requires the authenticated-role
// read policy added in supabase/migrations/20260624050000_logger_rls_fixes.sql
// -- without it this query silently returns zero rows under
// RLS for a signed-in user. See
// docs/superpowers/specs/2026-06-24-logger-design.md Decision 13.
import { supabase } from './supabase';

export interface CatalogExercise {
  readonly id: string;
  readonly name: string;
  readonly movementPattern: string;
  readonly exerciseType: string | null;
  readonly targetGoals: readonly string[];
  readonly bodyParts: readonly string[];
  readonly demoVideoUrl: string | null;
  readonly defaultSets: number | null;
  readonly defaultRepRange: string | null;
  readonly unilateral: boolean;
  readonly isCorrective: boolean;
}

interface RawExerciseRow {
  id: string;
  name: string;
  movement_pattern: string;
  exercise_type: string | null;
  target_goals: string[] | null;
  body_parts: string[] | null;
  demo_video_url: string | null;
  default_sets: number | null;
  default_rep_range: string | null;
  unilateral: boolean;
  is_corrective: boolean;
}

const SELECT_COLUMNS =
  'id, name, movement_pattern, exercise_type, target_goals, body_parts, demo_video_url, default_sets, default_rep_range, unilateral, is_corrective';

export async function fetchExerciseCatalog(): Promise<CatalogExercise[]> {
  const { data, error } = await supabase.from('exercises').select(SELECT_COLUMNS);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as RawExerciseRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    movementPattern: row.movement_pattern,
    exerciseType: row.exercise_type,
    targetGoals: row.target_goals ?? [],
    bodyParts: row.body_parts ?? [],
    demoVideoUrl: row.demo_video_url,
    defaultSets: row.default_sets,
    defaultRepRange: row.default_rep_range,
    unilateral: row.unilateral,
    isCorrective: row.is_corrective,
  }));
}

function intersects(a: readonly string[], b: readonly string[]): boolean {
  return a.some((item) => b.includes(item));
}

/**
 * A swap candidate must share the target's movement_pattern and overlap
 * at least one body_part or target_goal -- the exact filter the v2
 * design spec's Decision 10 calls for ("pre-filtered to the same
 * movement_pattern/body_parts/target_goals"). Never offers the target
 * exercise itself as a candidate to swap to.
 */
export function buildSwapFilter(
  target: CatalogExercise
): (candidate: CatalogExercise) => boolean {
  return (candidate) => {
    if (candidate.id === target.id) {
      return false;
    }
    if (candidate.movementPattern !== target.movementPattern) {
      return false;
    }
    return (
      intersects(candidate.bodyParts, target.bodyParts) ||
      intersects(candidate.targetGoals, target.targetGoals)
    );
  };
}

/**
 * "+ Add an exercise" has no single current row to match against, so it
 * narrows only by the block's aggregate set of movement_patterns (every
 * pattern already present among the block's prescribed exercises) --
 * looser than the swap filter by design. An empty pattern set (a block
 * with zero exercises left, e.g. every prescribed exercise was removed)
 * matches everything rather than nothing, since "no patterns to match"
 * should not mean "no exercises addable."
 */
export function buildAddFilter(
  blockMovementPatterns: readonly string[]
): (candidate: CatalogExercise) => boolean {
  if (blockMovementPatterns.length === 0) {
    return () => true;
  }
  return (candidate) => blockMovementPatterns.includes(candidate.movementPattern);
}
