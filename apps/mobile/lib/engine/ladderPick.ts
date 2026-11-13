// Level-aware exercise choices on a slot's ladder (spec 2026-11-12 §8a.5): swaps stay within
// the slot's current level, "easier version" steps back one step, and a tier refit picks a
// same-level alternate or, failing that, the nearest LOWER level. Never upward. Pure.
import { requiredTier, tierAllows, type EquipmentTier } from '../equipmentTiers';
import type { LadderRow } from './dayPlanner';
import { stepBack, type LadderShape, type SlotState } from './progression';

export interface LadderChoice {
  exerciseId: string;
  level: number;
  step: number;
  sets: number;
  repsOrDuration: string;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const allowed = (tier: EquipmentTier | null) => (r: LadderRow) => tierAllows(tier, requiredTier(r.equipment));

/** The exercise's row at `level` for the largest step <= `step`, else its smallest step. */
export function prescriptionFor(
  ladder: readonly LadderRow[],
  slotKey: string,
  level: number,
  exerciseId: string,
  step: number,
): LadderChoice | null {
  const own = ladder.filter((r) => r.slotKey === slotKey && r.level === level && r.exerciseId === exerciseId);
  if (own.length === 0) return null;
  const atOrBelow = own.filter((r) => r.step <= step);
  const row = atOrBelow.length
    ? atOrBelow.reduce((b, r) => (r.step > b.step ? r : b))
    : own.reduce((b, r) => (r.step < b.step ? r : b));
  return { exerciseId, level, step: row.step, sets: row.sets, repsOrDuration: row.repsOrDuration };
}

export interface PickRequest {
  slotKey: string;
  level: number;
  step: number;
  tier: EquipmentTier | null;
  /** Exercises not to choose (e.g. the current one, or others already in the day). */
  exclude: ReadonlySet<string>;
  lastDone: ReadonlyMap<string, string>;
}

/** Least recently done, then alt rank, among tier-allowed exercises at the level or the nearest lower one. */
export function pickAtLevel(ladder: readonly LadderRow[], req: PickRequest): LadderChoice | null {
  const rows = ladder.filter((r) => r.slotKey === req.slotKey && r.level <= req.level).filter(allowed(req.tier));
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => b - a);
  for (const level of levels) {
    const pool = rows.filter((r) => r.level === level && !req.exclude.has(r.exerciseId));
    if (pool.length === 0) continue;
    const altRank = (id: string) => Math.min(...pool.filter((r) => r.exerciseId === id).map((r) => r.altRank));
    const ids = [...new Set(pool.map((r) => r.exerciseId))].sort((a, b) => {
      const la = req.lastDone.get(a) ?? '';
      const lb = req.lastDone.get(b) ?? '';
      return cmp(la, lb) || altRank(a) - altRank(b) || cmp(a, b);
    });
    // Same step clamp as the day planner, so a refit and a fresh build agree.
    return prescriptionFor(ladder, req.slotKey, level, ids[0], req.step);
  }
  return null;
}

/** Swap sheet options: tier-allowed alternates at exactly this level, prescribed for the current step. */
export function swapOptionsAtLevel(
  ladder: readonly LadderRow[],
  slotKey: string,
  level: number,
  step: number,
  tier: EquipmentTier | null,
  excludingExerciseId: string,
): LadderChoice[] {
  const ids = [
    ...new Set(
      ladder
        .filter((r) => r.slotKey === slotKey && r.level === level && r.exerciseId !== excludingExerciseId)
        .filter(allowed(tier))
        .sort((a, b) => a.altRank - b.altRank || cmp(a.exerciseId, b.exerciseId))
        .map((r) => r.exerciseId),
    ),
  ];
  return ids.map((id) => prescriptionFor(ladder, slotKey, level, id, step)!);
}

export function shapeFor(ladder: readonly LadderRow[], slotKey: string): LadderShape {
  const rows = ladder.filter((r) => r.slotKey === slotKey);
  const maxLevel = rows.length ? Math.max(...rows.map((r) => r.level)) : 1;
  return {
    maxLevel,
    stepsAt: (level) => Math.max(1, ...rows.filter((r) => r.level === level).map((r) => r.step)),
  };
}

/**
 * "Easier version": one step back in the slot's state, and the exercise for it. Keeps the
 * current exercise when it exists at the new level; otherwise picks one there (tier-allowed,
 * falling back lower). Null when the slot is already at level 1 step 1.
 */
export function planStepDown(
  state: SlotState,
  ladder: readonly LadderRow[],
  currentExerciseId: string,
  tier: EquipmentTier | null,
  lastDone: ReadonlyMap<string, string>,
): { state: SlotState; choice: LadderChoice } | null {
  if (state.level <= 1 && state.step <= 1) return null;
  const back = stepBack(state, shapeFor(ladder, state.slotKey));
  const next: SlotState = { ...back, rightStreak: 0, hardStreak: 0 };
  const keep = prescriptionFor(ladder, state.slotKey, next.level, currentExerciseId, next.step);
  const choice =
    keep ??
    pickAtLevel(ladder, { slotKey: state.slotKey, level: next.level, step: next.step, tier, exclude: new Set(), lastDone });
  if (!choice) return null;
  return { state: { ...next, level: choice.level, step: choice.step }, choice };
}
