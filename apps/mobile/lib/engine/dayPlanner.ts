import { requiredTier, tierAllows, type EquipmentTier } from '../equipmentTiers';
import type { SlotState } from './progression';
import type { Side } from './types';

export type TimeRange = '5-10' | '10-20' | '20-30';
export const TIME_RANGE_BOUNDS: Record<TimeRange, { min: number; max: number }> = {
  '5-10': { min: 5, max: 10 },
  '10-20': { min: 10, max: 20 },
  '20-30': { min: 20, max: 30 },
};

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
 * Pick the exercise for a slot. Level starts at override/state level and falls back downward
 * (then upward, then ignoring tier) so a slot is never empty while the ladder has any row.
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
  const order = [...below, ...above];

  const allowed = (r: LadderRow) => tierAllows(input.tier, requiredTier(r.equipment));
  let level: number | null = null;
  let pool: LadderRow[] = [];
  for (const l of order) {
    const p = rows.filter((r) => r.level === l && allowed(r));
    if (p.length) { level = l; pool = p; break; }
  }
  if (level == null) {
    // Nothing fits the tier anywhere: ignore the tier rather than return an empty slot.
    level = order[0];
    pool = rows.filter((r) => r.level === level);
  }
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

  for (const slot of [...ranked, ...off]) {
    const choice = chooseExercise(slot.slotKey, input, picked);
    if (!choice) continue;
    const { row, exerciseId, level } = choice;
    const isFirst = exercises.length === 0;

    let sets = row.sets;
    if (slot.isStretch) {
      const hold = secondsPerSet(row.repsOrDuration);
      const used = stretchByArea.get(slot.area) ?? 0;
      if (used + sets * hold > STRETCH_AREA_CAP_SECONDS) {
        const fit = Math.floor((STRETCH_AREA_CAP_SECONDS - used) / hold);
        if (fit >= 1) sets = Math.min(sets, fit);
        else if (isFirst) sets = 1;
        else continue;
      }
    }

    const weaker = input.weakerSideBySlot.get(slot.slotKey);
    const lead = weaker != null && row.unilateral;
    const est = estimateSeconds(lead ? sets + 1 : sets, row.repsOrDuration, row.unilateral);
    if (!isFirst && total + est > budget) continue;

    exercises.push({
      slotKey: slot.slotKey, exerciseId, level, step: row.step, sets,
      repsOrDuration: row.repsOrDuration,
      leadSide: lead ? weaker! : null, extraSideSet: lead,
      order: slot.order, estSeconds: est,
    });
    picked.add(exerciseId);
    total += est;
    if (slot.isStretch) {
      stretchByArea.set(slot.area, (stretchByArea.get(slot.area) ?? 0) + sets * secondsPerSet(row.repsOrDuration));
    }
    if (isFirst) { topSlot = slot; topLead = lead; }
  }

  exercises.sort((a, b) => a.order - b.order || cmp(a.slotKey, b.slotKey));

  let whyToday = '';
  if (topSlot) {
    const testName = input.testNameBySlot.get(topSlot.slotKey) ?? topSlot.slotKey;
    if (topLead) {
      const side = input.weakerSideBySlot.get(topSlot.slotKey)!;
      const gap = input.gapTextBySlot.get(topSlot.slotKey) ?? '';
      whyToday = `${cap(side)} side first, plus one extra set: your ${testName} gap is ${gap}.`;
    } else {
      whyToday = `Focus today: ${testName}, your biggest gap to target.`;
    }
  }
  return { exercises, whyToday };
}
