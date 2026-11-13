import { requiredTier, tierAllows, type EquipmentTier } from '../equipmentTiers';
import type { SlotState } from './progression';
import type { Side } from './types';

export type TimeRange = '5-10' | '10-20' | '20-30';
export const TIME_RANGE_BOUNDS: Record<TimeRange, { min: number; max: number }> = {
  '5-10': { min: 5, max: 10 },
  '10-20': { min: 10, max: 20 },
  '20-30': { min: 20, max: 30 },
};

export const TIME_RANGE_OPTIONS: readonly { range: TimeRange; title: string; subtitle: string }[] = [
  { range: '5-10', title: '5–10 min', subtitle: 'A quick daily dose' },
  { range: '10-20', title: '10–20 min', subtitle: 'The standard sprint' },
  { range: '20-30', title: '20–30 min', subtitle: 'Go deeper' },
];

export interface LadderRow {
  slotKey: string;
  level: number;
  exerciseId: string;
  altRank: number;
  step: number;
  sets: number;
  repsOrDuration: string;
  equipment: readonly string[] | null;
  unilateral: boolean;
  /** Informational only: the planner uses CandidateSlot.isStretch as the single source of truth. */
  isStretch: boolean;
}
export interface CandidateSlot {
  slotKey: string;
  area: string;
  order: number;
  isStretch: boolean;
}
export interface PlannedExercise {
  slotKey: string;
  exerciseId: string;
  level: number;
  step: number;
  sets: number;
  repsOrDuration: string;
  leadSide: Side | null;
  extraSideSet: boolean;
  order: number;
  estSeconds: number;
}
export interface DayPlan {
  exercises: PlannedExercise[];
  whyToday: string;
}

const REST_SECONDS = 30;
const DEFAULT_SET_SECONDS = 30;
const SECONDS_PER_REP = 3;
const STRETCH_AREA_CAP_SECONDS = 240;

/** Seconds for one set. "Nm" is metres (a walk distance), never minutes. */
function secondsPerSet(repsOrDuration: string): number {
  const t = repsOrDuration.trim().toLowerCase();
  let m = t.match(/^(\d+)\s*-\s*(\d+)\s*reps?$/);
  if (m) return Number(m[2]) * SECONDS_PER_REP;
  m = t.match(/^(\d+)\s*reps?$/);
  if (m) return Number(m[1]) * SECONDS_PER_REP;
  m = t.match(/^(\d+)\s*-\s*(\d+)\s*s$/);
  if (m) return Number(m[2]);
  m = t.match(/^(\d+)\s*s$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+(?:\.\d+)?)\s*min$/);
  if (m) return Math.round(Number(m[1]) * 60);
  return DEFAULT_SET_SECONDS; // includes "20m" distances and unknown text
}

export function estimateSeconds(sets: number, repsOrDuration: string, unilateral: boolean): number {
  const base = sets * secondsPerSet(repsOrDuration) + Math.max(0, sets - 1) * REST_SECONDS;
  return unilateral ? base * 2 : base;
}

interface PlanInput {
  candidates: readonly CandidateSlot[];
  offRhythm: readonly CandidateSlot[];
  yesterdaySlots: ReadonlySet<string>;
  priorities: ReadonlyMap<string, number>;
  priorityDelta: ReadonlyMap<string, number>;
  states: ReadonlyMap<string, SlotState>;
  levelOverride: ReadonlyMap<string, number>;
  ladder: readonly LadderRow[];
  tier: EquipmentTier | null;
  timeRange: TimeRange | null;
  lastDoneByExercise: ReadonlyMap<string, string>;
  prefer: ReadonlySet<string>;
  avoid: ReadonlySet<string>;
  weakerSideBySlot: ReadonlyMap<string, Side>;
  testNameBySlot: ReadonlyMap<string, string>;
  gapTextBySlot: ReadonlyMap<string, string>;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function rank(slots: readonly CandidateSlot[], input: PlanInput): CandidateSlot[] {
  const score = (s: CandidateSlot) =>
    (input.priorities.get(s.slotKey) ?? 0) + (input.priorityDelta.get(s.slotKey) ?? 0) * 0.5;
  return [...slots].sort((a, b) => score(b) - score(a) || a.order - b.order || cmp(a.slotKey, b.slotKey));
}

interface Choice {
  exerciseId: string;
  level: number;
  row: LadderRow;
}

/**
 * Pick the exercise for a slot. Level starts at override/state level and falls back downward only,
 * so the user is never silently given a harder level than earned.
 */
function chooseExercise(slotKey: string, input: PlanInput, pickedToday: ReadonlySet<string>): Choice | null {
  const rows = input.ladder.filter((r) => r.slotKey === slotKey);
  if (rows.length === 0) return null;
  const state = input.states.get(slotKey);
  const wantLevel = input.levelOverride.get(slotKey) ?? state?.level ?? 1;
  const wantStep = state?.step ?? 1;
  const levels = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  const below = levels.filter((l) => l <= wantLevel).reverse();
  const above = levels.filter((l) => l > wantLevel);

  const allowed = (r: LadderRow) => tierAllows(input.tier, requiredTier(r.equipment));
  const firstAllowed = (ls: number[]): { level: number; pool: LadderRow[] } | null => {
    for (const l of ls) {
      const p = rows.filter((r) => r.level === l && allowed(r));
      if (p.length) return { level: l, pool: p };
    }
    return null;
  };
  // Tier-respecting at or below; else ignore tier at the nearest level at or below (right difficulty,
  // equipment mismatch); only when no row exists at or below at all go upward (tier-respecting first).
  let found = firstAllowed(below);
  if (!found && below.length) found = { level: below[0], pool: rows.filter((r) => r.level === below[0]) };
  if (!found) found = firstAllowed(above);
  if (!found) found = { level: above[0], pool: rows.filter((r) => r.level === above[0]) };
  const { level, pool } = found;
  const ids = [...new Set(pool.map((r) => r.exerciseId))];
  let cands = ids;
  const noAvoid = cands.filter((id) => !input.avoid.has(id));
  if (noAvoid.length) cands = noAvoid;
  const fresh = cands.filter((id) => !pickedToday.has(id));
  if (fresh.length) cands = fresh;

  const altRank = (id: string) => Math.min(...pool.filter((r) => r.exerciseId === id).map((r) => r.altRank));
  cands = [...cands].sort((a, b) => {
    const pa = input.prefer.has(a) ? 0 : 1;
    const pb = input.prefer.has(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const la = input.lastDoneByExercise.get(a) ?? '';
    const lb = input.lastDoneByExercise.get(b) ?? '';
    if (la !== lb) return cmp(la, lb); // '' (never done) sorts first, then oldest
    return altRank(a) - altRank(b) || cmp(a, b);
  });
  const exerciseId = cands[0];

  const own = pool.filter((r) => r.exerciseId === exerciseId);
  const atOrBelow = own.filter((r) => r.step <= wantStep);
  const row = atOrBelow.length
    ? atOrBelow.reduce((best, r) => (r.step > best.step ? r : best))
    : own.reduce((best, r) => (r.step < best.step ? r : best));
  return { exerciseId, level, row };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function planDay(input: PlanInput): DayPlan {
  const bounds = TIME_RANGE_BOUNDS[input.timeRange ?? '10-20'];
  const budget = bounds.max * 60;

  const ranked = rank(input.candidates, input);
  const seen = new Set(input.candidates.map((c) => c.slotKey));
  const off = rank(
    input.offRhythm.filter((s) => !seen.has(s.slotKey) && !input.yesterdaySlots.has(s.slotKey)),
    input,
  );

  const exercises: PlannedExercise[] = [];
  const picked = new Set<string>();
  const stretchByArea = new Map<string, number>();
  let total = 0;
  let topSlot: CandidateSlot | null = null;
  let topLead = false;

  let rankedOverflowed = false;
  const queue = [
    ...ranked.map((slot) => ({ slot, isOff: false })),
    ...off.map((slot) => ({ slot, isOff: true })),
  ];
  for (const { slot, isOff } of queue) {
    // Ranked candidates form a priority prefix: after one overflows the budget, no lower-priority
    // ranked slot is added. Off-rhythm slots are only added if time remains (skip and continue).
    if (!isOff && rankedOverflowed) continue;
    const choice = chooseExercise(slot.slotKey, input, picked);
    if (!choice) continue;
    const { row, exerciseId, level } = choice;
    const isFirst = exercises.length === 0;

    const weaker = input.weakerSideBySlot.get(slot.slotKey);
    const lead = weaker != null && row.unilateral;
    const extra = lead ? 1 : 0;
    const hold = secondsPerSet(row.repsOrDuration);

    let sets = row.sets;
    if (slot.isStretch) {
      // The cap counts one side only; the weaker side gets one extra set, so it counts there.
      const used = stretchByArea.get(slot.area) ?? 0;
      if (used + (sets + extra) * hold > STRETCH_AREA_CAP_SECONDS) {
        const fit = Math.floor((STRETCH_AREA_CAP_SECONDS - used) / hold) - extra;
        if (fit >= 1) sets = Math.min(sets, fit);
        // The top-priority slot is always kept, even if a single hold exceeds the remaining cap.
        else if (isFirst) sets = 1;
        else continue;
      }
    }

    // The extra set is on the weaker side only: add one set's time and one rest, not doubled.
    const est = estimateSeconds(sets, row.repsOrDuration, row.unilateral) + (lead ? hold + REST_SECONDS : 0);
    if (!isFirst && total + est > budget) {
      if (!isOff) rankedOverflowed = true;
      continue;
    }

    exercises.push({
      slotKey: slot.slotKey, exerciseId, level, step: row.step, sets,
      repsOrDuration: row.repsOrDuration,
      leadSide: lead ? weaker! : null, extraSideSet: lead,
      order: slot.order, estSeconds: est,
    });
    picked.add(exerciseId);
    total += est;
    if (slot.isStretch) {
      stretchByArea.set(slot.area, (stretchByArea.get(slot.area) ?? 0) + (sets + extra) * hold);
    }
    if (isFirst) { topSlot = slot; topLead = lead; }
  }

  exercises.sort((a, b) => a.order - b.order || cmp(a.slotKey, b.slotKey));

  let whyToday = '';
  if (topSlot) {
    const testName = input.testNameBySlot.get(topSlot.slotKey) ?? topSlot.slotKey;
    const gap = input.gapTextBySlot.get(topSlot.slotKey);
    if (topLead && gap) {
      const side = input.weakerSideBySlot.get(topSlot.slotKey)!;
      whyToday = `${cap(side)} side first, plus one extra set: your ${testName} gap is ${gap}.`;
    } else {
      whyToday = `Focus today: ${testName}, your biggest gap to target.`;
    }
  }
  return { exercises, whyToday };
}
