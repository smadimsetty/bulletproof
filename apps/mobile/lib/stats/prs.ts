// apps/mobile/lib/stats/prs.ts
//
// Personal records, per exercise and per side, from completed working sets of
// finished workouts. Four kinds only (no 1RM, no volume -- spec anti-goal):
//   longest_hold     duration_s       hold/duration exercises
//   best_rom         rom_value        higher is better; only within one rom_unit
//   most_reps        reps             reps-based exercises
//   heaviest_weight  weight_kg        weight x reps exercises; tie -> more reps
// The first-ever log of an exercise/side/kind is a baseline, never a PR.
import { fieldsForExercise } from '../setFields';
import type { StatsSet, StatsWorkout } from './dataset';

export type PrKind = 'longest_hold' | 'best_rom' | 'most_reps' | 'heaviest_weight';

export interface PrEvent {
  workoutId: string;
  exerciseId: string;
  exerciseName: string;
  side: 'left' | 'right' | null;
  kind: PrKind;
  value: number;
  /** 's' for holds, the ROM unit, 'reps', or 'kg' (screens convert weight). */
  unit: string;
  previous: number;
  /** heaviest_weight only: reps at this PR / at the previous best (for tie-breaks). */
  reps?: number;
  previousReps?: number;
  at: string;
}

export type Bests = Map<string, { value: number; reps?: number }>;

export interface PrCandidate {
  kind: PrKind;
  value: number;
  reps?: number;
  romUnit?: string;
}

export function prKey(exerciseId: string, side: string | null, kind: PrKind, romUnit?: string | null): string {
  // The ROM unit is part of the key so cm and deg are never compared.
  return [exerciseId, side ?? '-', kind, kind === 'best_rom' ? (romUnit ?? '-') : ''].join('|');
}

/** What a set could be a personal record in; empty for warm-ups / incomplete sets. */
export function setCandidates(exerciseType: string | null, unilateral: boolean, set: StatsSet): PrCandidate[] {
  if (set.setType === 'warmup' || set.completedAt == null) return [];
  const out: PrCandidate[] = [];
  // Storage is numeric(6,2); round so a retyped value equals what was stored.
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const { kind } = fieldsForExercise({ exerciseType, unilateral: unilateral });
  if ((kind === 'hold' || kind === 'duration') && set.durationS != null && set.durationS > 0) {
    out.push({ kind: 'longest_hold', value: set.durationS });
  } else if (kind === 'reps' && set.reps != null && set.reps > 0) {
    out.push({ kind: 'most_reps', value: set.reps });
  } else if (kind === 'weight_reps' && set.weightKg != null && set.weightKg > 0) {
    out.push({ kind: 'heaviest_weight', value: r2(set.weightKg), reps: set.reps ?? 0 });
  }
  if (set.romValue != null && set.romUnit != null) {
    out.push({ kind: 'best_rom', value: r2(set.romValue), romUnit: set.romUnit });
  }
  return out;
}

function beats(a: { value: number; reps?: number }, b: { value: number; reps?: number }): boolean {
  if (a.value !== b.value) return a.value > b.value;
  return (a.reps ?? 0) > (b.reps ?? 0);
}

export function isNewBest(bests: Bests, key: string, candidate: { value: number; reps?: number }): boolean {
  const prior = bests.get(key);
  return prior !== undefined && beats(candidate, prior);
}

export function computePrEvents(workouts: readonly StatsWorkout[]): { events: PrEvent[]; bests: Bests } {
  const bests: Bests = new Map();
  const events: PrEvent[] = [];

  for (const w of workouts) {
    const inWorkout = new Map<string, { cand: PrCandidate; exerciseId: string; name: string; side: 'left' | 'right' | null }>();
    for (const ex of w.exercises) {
      for (const set of ex.sets) {
        for (const cand of setCandidates(ex.exerciseType, ex.unilateral, set)) {
          const key = prKey(ex.exerciseId, set.side, cand.kind, cand.romUnit);
          const cur = inWorkout.get(key);
          if (!cur || beats(cand, cur.cand)) {
            inWorkout.set(key, { cand, exerciseId: ex.exerciseId, name: ex.name, side: set.side });
          }
        }
      }
    }
    // Compare against bests from strictly earlier workouts, then fold in, so
    // two improving sets in one workout yield a single event.
    for (const [key, hit] of inWorkout) {
      const prior = bests.get(key);
      if (prior && beats(hit.cand, prior)) {
        events.push({
          workoutId: w.id,
          exerciseId: hit.exerciseId,
          exerciseName: hit.name,
          side: hit.side,
          kind: hit.cand.kind,
          value: hit.cand.value,
          unit: unitFor(hit.cand),
          previous: prior.value,
          ...(hit.cand.kind === 'heaviest_weight' ? { reps: hit.cand.reps, previousReps: prior.reps } : {}),
          at: w.endedAt,
        });
      }
      if (!prior || beats(hit.cand, prior)) bests.set(key, { value: hit.cand.value, reps: hit.cand.reps });
    }
  }
  return { events, bests };
}

function unitFor(c: PrCandidate): string {
  switch (c.kind) {
    case 'longest_hold': return 's';
    case 'most_reps': return 'reps';
    case 'heaviest_weight': return 'kg';
    case 'best_rom': return c.romUnit ?? '';
  }
}
