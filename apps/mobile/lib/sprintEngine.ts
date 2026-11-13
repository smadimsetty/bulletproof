// apps/mobile/lib/sprintEngine.ts
//
// Data layer for the adaptive sprint engine (spec
// docs/superpowers/specs/2026-11-12-adaptive-sprint-engine-design.md §5).
// A sprint day is built lazily the first time it is opened:
//   1. claim the day (sprint_days.built_at) so it is built exactly once;
//   2. progress slot state from every earlier, not-yet-progressed day;
//   3. apply the missed-day rule and any pending AI adjustments;
//   4. plan the day (engine/dayPlanner) and write its exercise rows.
// computeDayBuild is the pure core (fully unit tested); ensureDayBuilt only
// loads its inputs and writes its outputs, all through RLS as the user.
import { scoreTest, slotPriorities, weakerSideBySlot } from './engine/assessmentPriority';
import { planDay, type CandidateSlot, type DayPlan, type LadderRow, type TimeRange } from './engine/dayPlanner';
import {
  applyGap, daysBetween, isPainTrendingUp, progressSlot,
  type DayFeedback, type LadderShape, type SlotState,
} from './engine/progression';
import type { EngineTest, SlotLink, TestResult } from './engine/types';
import type { EquipmentTier } from './equipmentTiers';
import { fetchLastCompletedByExerciseId } from './sprintLifecycle';
import { supabase } from './supabase';
import { fetchUserSettings } from './userSettings';

// ---------------------------------------------------------------- types

export interface TemplateSlotRow {
  dayNumber: number;
  slotKey: string;
  tier: number;
  slotOrder: number;
}
export interface SlotInfo {
  slotKey: string;
  area: string;
  isStretch: boolean;
}
export interface NamedTest extends EngineTest {
  name: string;
  unit: string;
}
export interface AiAdjustment {
  id: string;
  slotKey: string;
  kind: 'start' | 'pain' | null;
  levelOverride: number | null;
  prefer: readonly string[];
  avoid: readonly string[];
  priorityDelta: number;
  createdAt: string;
}
export interface PendingDay {
  id: string;
  date: string;
  /** null when the day has no feedback row at all. */
  feedback: DayFeedback | null;
  /** Only the slots with at least one completed working set that day. */
  slots: readonly { slotKey: string; completedFraction: number }[];
}
export interface BuildInputs {
  today: string;
  dayNumber: number;
  template: readonly TemplateSlotRow[];
  slots: readonly SlotInfo[];
  links: readonly SlotLink[];
  tests: readonly NamedTest[];
  baseline: readonly TestResult[];
  states: readonly SlotState[];
  ladder: readonly LadderRow[];
  tier: EquipmentTier | null;
  timeRange: TimeRange | null;
  adjustments: readonly AiAdjustment[];
  pendingDays: readonly PendingDay[];
  painHistory: readonly { date: string; pain: number }[];
  yesterdaySlots: readonly string[];
  lastDoneByExercise: ReadonlyMap<string, string>;
}
export interface DayExerciseInsert {
  slot_key: string;
  tier: number;
  exercise_id: string;
  prescribed_sets: number;
  prescribed_reps_or_duration: string;
  exercise_order: number;
  level: number;
  step: number;
  lead_side: 'left' | 'right' | null;
  extra_side_set: boolean;
}
export interface BuildResult {
  states: SlotState[];
  plan: DayPlan;
  rows: DayExerciseInsert[];
  consumedAdjustmentIds: string[];
  progressedDayIds: string[];
}

// ---------------------------------------------------------------- pure helpers

/** True when this caller should build the day (it has not been built or claimed yet). */
export function claimRows(builtAt: string | null): boolean {
  return builtAt == null;
}

/** Completed working sets over the prescription (both sides of a one-sided exercise, plus the extra set). */
export function completedFraction(
  prescribedSets: number | null,
  unilateral: boolean,
  extraSideSet: boolean,
  completedSets: number,
): number {
  const sets = prescribedSets != null && prescribedSets > 0 ? prescribedSets : 1;
  const expected = sets * (unilateral ? 2 : 1) + (extraSideSet ? 1 : 0);
  return Math.min(1, Math.max(0, completedSets) / expected);
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function ladderShapes(ladder: readonly LadderRow[]): Map<string, LadderShape> {
  const steps = new Map<string, Map<number, number>>();
  for (const r of ladder) {
    const byLevel = steps.get(r.slotKey) ?? new Map<number, number>();
    byLevel.set(r.level, Math.max(byLevel.get(r.level) ?? 0, r.step));
    steps.set(r.slotKey, byLevel);
  }
  const out = new Map<string, LadderShape>();
  for (const [slotKey, byLevel] of steps) {
    const maxLevel = Math.max(...byLevel.keys());
    out.set(slotKey, { maxLevel, stepsAt: (level) => byLevel.get(level) ?? 1 });
  }
  return out;
}

const freshState = (slotKey: string): SlotState => ({
  slotKey, level: 1, step: 1, rightStreak: 0, hardStreak: 0, lastDoneOn: null, gapBackApplied: 0,
});

/** Below this deficit a first sprint starts the slot at step 2 (spec §5.2, "my call"). */
const SMALL_DEFICIT = 0.2;

/**
 * Starting slot state for a newly activated sprint: carried over from the previous
 * sprint on the same pain point when there is one (spec §8a.2; the missed-day rule then
 * steps it back at build time from its last_done_on), else level 1 step 1, or step 2
 * when every test linked to the slot is already within SMALL_DEFICIT of target.
 */
export function initialSlotStates(
  inputs: Pick<BuildInputs, 'ladder' | 'links' | 'tests' | 'baseline'>,
  previous: readonly SlotState[],
): SlotState[] {
  const shapes = ladderShapes(inputs.ladder);
  const prev = new Map(previous.map((s) => [s.slotKey, s]));
  const results = new Map(inputs.baseline.map((r) => [r.testKey, r]));
  const deficits = new Map(inputs.tests.map((t) => [t.testKey, scoreTest(t, results.get(t.testKey)).deficit]));
  const hasBaseline = inputs.baseline.length > 0;

  return [...shapes.keys()].sort(cmp).map((slotKey) => {
    const carried = prev.get(slotKey);
    if (carried) return { ...carried, slotKey };
    const linked = inputs.links.filter((l) => l.slotKey === slotKey);
    const small = hasBaseline && linked.length > 0 &&
      linked.every((l) => results.has(l.testKey) && (deficits.get(l.testKey) ?? 1) < SMALL_DEFICIT);
    const steps = shapes.get(slotKey)!.stepsAt(1);
    return { ...freshState(slotKey), step: small && steps >= 2 ? 2 : 1 };
  });
}

/** "4 cm" style text for a test's side gap, or undefined when there is no result. */
function gapText(test: NamedTest, result: TestResult | undefined): string | undefined {
  if (!result || result.left == null || result.right == null) return undefined;
  const gap = Math.round(Math.abs(result.left - result.right) * 10) / 10;
  return `${gap} ${test.unit}`.trim();
}

/** The pure core of a day build. */
export function computeDayBuild(input: BuildInputs): BuildResult {
  const shapes = ladderShapes(input.ladder);
  const slotInfo = new Map(input.slots.map((s) => [s.slotKey, s]));

  // 1. Current state for every laddered slot (in-flight sprints may have no rows yet).
  const states = new Map<string, SlotState>();
  for (const key of [...shapes.keys()].sort(cmp)) states.set(key, freshState(key));
  for (const s of input.states) if (shapes.has(s.slotKey)) states.set(s.slotKey, { ...s });

  // 2. Progress every earlier, not-yet-progressed day, oldest first.
  const pending = [...input.pendingDays].sort((a, b) => cmp(a.date, b.date));
  for (const day of pending) {
    if (day.slots.length === 0) continue;
    const history = input.painHistory.filter((p) => p.date <= day.date);
    const trendUp = isPainTrendingUp(history);
    const fb: DayFeedback = day.feedback ?? { effort: null, pain: null, painArea: null };
    // A real session resets every slot's gap counter (progression ruling, Task 4).
    for (const [key, s] of states) states.set(key, { ...s, gapBackApplied: 0 });
    for (const done of day.slots) {
      const shape = shapes.get(done.slotKey);
      const state = states.get(done.slotKey);
      if (!shape || !state) continue;
      const outcome = { slotKey: done.slotKey, area: slotInfo.get(done.slotKey)?.area ?? '', completedFraction: done.completedFraction };
      states.set(done.slotKey, progressSlot(state, shape, outcome, fb, trendUp, day.date).state);
    }
  }

  // 3. Missed-day rule, measured from the sprint's last session on any slot.
  const lastActiveOn = [...states.values()]
    .map((s) => s.lastDoneOn)
    .filter((d): d is string => d != null && daysBetween(d, input.today) >= 0)
    .sort(cmp)
    .pop() ?? null;
  for (const [key, s] of states) states.set(key, applyGap(s, shapes.get(key)!, lastActiveOn, input.today).state);

  // 4. AI adjustments: the latest level override per slot moves the slot state itself.
  const adjustments = [...input.adjustments].sort((a, b) => cmp(a.createdAt, b.createdAt));
  const priorityDelta = new Map<string, number>();
  const prefer = new Set<string>();
  const avoid = new Set<string>();
  const levelOverride = new Map<string, number>();
  for (const a of adjustments) {
    const shape = shapes.get(a.slotKey);
    const state = states.get(a.slotKey);
    if (!shape || !state) continue;
    if (a.levelOverride != null && Number.isFinite(a.levelOverride)) {
      const level = Math.min(shape.maxLevel, Math.max(1, Math.round(a.levelOverride)));
      if (level !== state.level) states.set(a.slotKey, { ...state, level, step: 1, rightStreak: 0, hardStreak: 0 });
      levelOverride.set(a.slotKey, level);
    }
    if (a.priorityDelta) priorityDelta.set(a.slotKey, a.priorityDelta);
    a.prefer.forEach((id) => prefer.add(id));
    a.avoid.forEach((id) => avoid.add(id));
  }

  // 5. Priorities and side bias from the baseline.
  const results = new Map(input.baseline.map((r) => [r.testKey, r]));
  const testByKey = new Map(input.tests.map((t) => [t.testKey, t]));
  const scores = input.tests.map((t) => scoreTest(t, results.get(t.testKey)));
  const scoreByKey = new Map(scores.map((s) => [s.testKey, s]));
  const priorities = slotPriorities(scores, input.links);
  const weaker = weakerSideBySlot(scores, input.links);

  const testNameBySlot = new Map<string, string>();
  const gapTextBySlot = new Map<string, string>();
  for (const slotKey of shapes.keys()) {
    const linked = input.links
      .filter((l) => l.slotKey === slotKey && testByKey.has(l.testKey))
      .map((l) => ({ l, contribution: l.weight * (0.2 + (scoreByKey.get(l.testKey)?.deficit ?? 0)) }))
      .sort((a, b) => b.contribution - a.contribution);
    if (linked.length) testNameBySlot.set(slotKey, testByKey.get(linked[0].l.testKey)!.name);
    const sided = linked.find(({ l }) => scoreByKey.get(l.testKey)?.weakerSide != null);
    if (sided) {
      const t = testByKey.get(sided.l.testKey)!;
      const text = gapText(t, results.get(t.testKey));
      if (text) gapTextBySlot.set(slotKey, text);
    }
  }

  // 6. Candidates (today's template slots) and off-rhythm slots (the rest of the pain point's).
  const tierBySlot = new Map<string, number>();
  const orderBySlot = new Map<string, number>();
  for (const t of input.template) {
    if (!tierBySlot.has(t.slotKey)) tierBySlot.set(t.slotKey, t.tier);
    orderBySlot.set(t.slotKey, Math.min(orderBySlot.get(t.slotKey) ?? Infinity, t.slotOrder));
  }
  const toCandidate = (slotKey: string, order: number): CandidateSlot => ({
    slotKey, order, area: slotInfo.get(slotKey)?.area ?? '', isStretch: slotInfo.get(slotKey)?.isStretch ?? false,
  });
  const todayRows = input.template.filter((t) => t.dayNumber === input.dayNumber && shapes.has(t.slotKey));
  const todayKeys = new Set(todayRows.map((t) => t.slotKey));
  const candidates = todayRows.map((t) => toCandidate(t.slotKey, t.slotOrder));
  const offRhythm = [...orderBySlot.keys()]
    .filter((k) => !todayKeys.has(k) && shapes.has(k))
    .map((k) => toCandidate(k, orderBySlot.get(k)!));

  const plan = planDay({
    candidates,
    offRhythm,
    yesterdaySlots: new Set(input.yesterdaySlots),
    priorities,
    priorityDelta,
    states,
    levelOverride,
    ladder: input.ladder,
    tier: input.tier,
    timeRange: input.timeRange,
    lastDoneByExercise: input.lastDoneByExercise,
    prefer,
    avoid,
    weakerSideBySlot: weaker,
    testNameBySlot,
    gapTextBySlot,
  });

  const rows: DayExerciseInsert[] = plan.exercises.map((e, i) => ({
    slot_key: e.slotKey,
    tier: tierBySlot.get(e.slotKey) === 1 ? 1 : 2,
    exercise_id: e.exerciseId,
    prescribed_sets: e.sets,
    prescribed_reps_or_duration: e.repsOrDuration,
    exercise_order: i + 1,
    level: e.level,
    step: e.step,
    lead_side: e.leadSide,
    extra_side_set: e.extraSideSet,
  }));

  return {
    states: [...states.values()],
    plan,
    rows,
    consumedAdjustmentIds: adjustments.map((a) => a.id),
    progressedDayIds: pending.map((d) => d.id),
  };
}

// ---------------------------------------------------------------- data layer

function check(error: { message: string } | null | undefined): void {
  if (error) throw new Error(error.message);
}

const toState = (r: any): SlotState => ({
  slotKey: r.slot_key,
  level: r.level,
  step: r.step,
  rightStreak: r.right_streak ?? 0,
  hardStreak: r.hard_streak ?? 0,
  lastDoneOn: r.last_done_on ?? null,
  gapBackApplied: r.gap_back_applied ?? 0,
});

const fromState = (sprintId: string, s: SlotState) => ({
  sprint_id: sprintId,
  slot_key: s.slotKey,
  level: s.level,
  step: s.step,
  right_streak: s.rightStreak,
  hard_streak: s.hardStreak,
  last_done_on: s.lastDoneOn,
  gap_back_applied: s.gapBackApplied,
});

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Loads the pain point's content: template, slots, links, tests, ladder. */
async function loadContent(painPointId: string) {
  const [template, slots, links, tests, ladder] = await Promise.all([
    supabase.from('sprint_day_template').select('day_number, slot_key, tier, slot_order').eq('pain_point_id', painPointId),
    supabase.from('sprint_slots').select('slot_key, area, is_stretch').eq('pain_point_id', painPointId),
    supabase.from('assessment_slot_links').select('test_key, slot_key, weight').eq('pain_point_id', painPointId),
    supabase
      .from('assessment_definitions')
      .select('test_key, name, unit, better_direction, raw_direction, target_value, noise_threshold, is_bilateral')
      .eq('pain_point_id', painPointId),
    supabase
      .from('slot_ladder')
      .select('slot_key, level, exercise_id, alt_rank, step, sets, reps_or_duration, exercises!slot_ladder_exercise_id_fkey ( equipment_needed, unilateral )')
      .eq('pain_point_id', painPointId),
  ]);
  for (const r of [template, slots, links, tests, ladder]) check(r.error);

  const slotRows = ((slots.data ?? []) as any[]).map((r) => ({ slotKey: r.slot_key, area: r.area, isStretch: !!r.is_stretch }));
  const stretch = new Set(slotRows.filter((s) => s.isStretch).map((s) => s.slotKey));
  return {
    template: ((template.data ?? []) as any[]).map((r) => ({
      dayNumber: r.day_number, slotKey: r.slot_key, tier: r.tier, slotOrder: r.slot_order,
    })) as TemplateSlotRow[],
    slots: slotRows as SlotInfo[],
    links: ((links.data ?? []) as any[]).map((r) => ({ testKey: r.test_key, slotKey: r.slot_key, weight: Number(r.weight) })) as SlotLink[],
    tests: ((tests.data ?? []) as any[]).map((r) => ({
      testKey: r.test_key,
      name: r.name,
      unit: r.unit ?? '',
      betterDirection: r.better_direction,
      rawDirection: r.raw_direction ?? null,
      targetValue: num(r.target_value),
      noiseThreshold: num(r.noise_threshold),
      isBilateral: !!r.is_bilateral,
    })) as NamedTest[],
    ladder: ((ladder.data ?? []) as any[]).map((r) => ({
      slotKey: r.slot_key,
      level: r.level,
      exerciseId: r.exercise_id,
      altRank: r.alt_rank,
      step: r.step,
      sets: r.sets,
      repsOrDuration: r.reps_or_duration,
      equipment: (r.exercises?.equipment_needed ?? null) as string[] | null,
      unilateral: !!r.exercises?.unilateral,
      isStretch: stretch.has(r.slot_key),
    })) as LadderRow[],
  };
}

/** The sprint's baseline results (for a continued sprint, the copied retest). */
async function loadBaseline(sprintId: string): Promise<TestResult[]> {
  const { data, error } = await supabase
    .from('sprint_assessments')
    .select('id, sprint_assessment_results ( test_key, value_left, value_right, value_single )')
    .eq('sprint_id', sprintId)
    .eq('phase', 'baseline')
    .maybeSingle();
  check(error);
  return (((data as any)?.sprint_assessment_results ?? []) as any[]).map((r) => ({
    testKey: r.test_key, left: num(r.value_left), right: num(r.value_right), single: num(r.value_single),
  }));
}

/**
 * Creates the sprint's slot state rows (idempotent: existing rows are kept). State
 * carries over from the most recent other sprint on the same pain point, if any.
 */
export async function initSlotState(sprintId: string, painPointId: string): Promise<void> {
  const content = await loadContent(painPointId);
  const baseline = await loadBaseline(sprintId);

  const { data: others, error: othersError } = await supabase
    .from('sprints')
    .select('id, started_on')
    .eq('pain_point_id', painPointId)
    .neq('id', sprintId)
    .order('started_on', { ascending: false });
  check(othersError);

  let previous: SlotState[] = [];
  for (const other of (others ?? []) as any[]) {
    const { data, error } = await supabase.from('sprint_slot_state').select('*').eq('sprint_id', other.id);
    check(error);
    if ((data ?? []).length > 0) {
      previous = ((data ?? []) as any[]).map(toState);
      break;
    }
  }

  const rows = initialSlotStates({ ...content, baseline }, previous).map((s) => fromState(sprintId, s));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('sprint_slot_state')
    .upsert(rows, { onConflict: 'sprint_id,slot_key', ignoreDuplicates: true });
  check(error);
}

/**
 * Builds the sprint day on `date` if it has not been built yet. Safe to call on every
 * open, from several devices at once: only the caller that claims built_at builds it.
 */
export async function ensureDayBuilt(sprintId: string, date: string): Promise<void> {
  const { data: day, error: dayError } = await supabase
    .from('sprint_days')
    .select('id, sprint_id, day_number, date, built_at')
    .eq('sprint_id', sprintId)
    .eq('date', date)
    .maybeSingle();
  check(dayError);
  if (!day || !claimRows((day as any).built_at ?? null)) return;
  const dayId = (day as any).id as string;

  const { data: claimed, error: claimError } = await supabase
    .from('sprint_days')
    .update({ built_at: new Date().toISOString() })
    .eq('id', dayId)
    .is('built_at', null)
    .select('id');
  check(claimError);
  if (!claimed || (claimed as any[]).length === 0) return; // someone else is building it

  try {
    await buildClaimedDay(sprintId, dayId, (day as any).day_number, date);
  } catch (e) {
    // Release the claim so a retry can rebuild. An unbuilt day never had exercise
    // rows, so clearing any partial insert is safe.
    await supabase.from('sprint_day_exercises').delete().eq('sprint_day_id', dayId);
    await supabase.from('sprint_days').update({ built_at: null }).eq('id', dayId);
    throw e;
  }
}

async function buildClaimedDay(sprintId: string, dayId: string, dayNumber: number, date: string): Promise<void> {
  const { data: sprint, error: sprintError } = await supabase
    .from('sprints')
    .select('pain_point_id')
    .eq('id', sprintId)
    .single();
  check(sprintError);
  const painPointId = (sprint as any).pain_point_id as string;

  const [content, baseline, settings, lastDone, statesRes, adjRes, daysRes] = await Promise.all([
    loadContent(painPointId),
    loadBaseline(sprintId),
    fetchUserSettings().catch(() => null),
    fetchLastCompletedByExerciseId(painPointId).catch(() => new Map<string, string>()),
    supabase.from('sprint_slot_state').select('*').eq('sprint_id', sprintId),
    supabase
      .from('sprint_ai_adjustments')
      .select('id, slot_key, kind, level_override, prefer_exercise_ids, avoid_exercise_ids, priority_delta, created_at')
      .eq('sprint_id', sprintId)
      .is('consumed_at', null),
    supabase.from('sprint_days').select('id, day_number, date, built_at, progressed_at').eq('sprint_id', sprintId),
  ]);
  for (const r of [statesRes, adjRes, daysRes]) check(r.error);

  const days = ((daysRes.data ?? []) as any[]);
  const dayIds = days.map((d) => d.id);
  const pendingRows = days.filter((d) => d.built_at != null && d.progressed_at == null && d.date < date);
  const yesterday = days.find((d) => d.day_number === dayNumber - 1);

  // Exercise rows of pending days and yesterday; feedback for the whole sprint (pain history).
  const exerciseDayIds = [...pendingRows.map((d) => d.id), ...(yesterday ? [yesterday.id] : [])];
  const [exRes, fbRes, woRes] = await Promise.all([
    exerciseDayIds.length
      ? supabase
          .from('sprint_day_exercises')
          .select('id, sprint_day_id, slot_key, prescribed_sets, extra_side_set, exercises!sprint_day_exercises_exercise_id_fkey ( unilateral )')
          .in('sprint_day_id', exerciseDayIds)
      : Promise.resolve({ data: [], error: null }),
    dayIds.length
      ? supabase.from('sprint_day_feedback').select('sprint_day_id, effort, pain, pain_area').in('sprint_day_id', dayIds)
      : Promise.resolve({ data: [], error: null }),
    pendingRows.length
      ? supabase
          .from('workouts')
          .select('sprint_day_id, workout_exercises ( sprint_day_exercise_id, workout_sets ( set_type, completed_at ) )')
          .in('sprint_day_id', pendingRows.map((d) => d.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [exRes, fbRes, woRes]) check(r.error);

  const exercises = (exRes.data ?? []) as any[];
  const feedbackByDay = new Map(((fbRes.data ?? []) as any[]).map((f) => [f.sprint_day_id, f]));
  const dateByDay = new Map(days.map((d) => [d.id, d.date as string]));

  const completedBySde = new Map<string, number>();
  for (const w of (woRes.data ?? []) as any[]) {
    for (const we of (w.workout_exercises ?? []) as any[]) {
      if (!we.sprint_day_exercise_id) continue;
      const n = ((we.workout_sets ?? []) as any[]).filter((s) => s.completed_at && s.set_type !== 'warmup').length;
      completedBySde.set(we.sprint_day_exercise_id, (completedBySde.get(we.sprint_day_exercise_id) ?? 0) + n);
    }
  }

  const pendingDays: PendingDay[] = pendingRows.map((d) => {
    const bySlot = new Map<string, number>();
    for (const e of exercises.filter((x) => x.sprint_day_id === d.id)) {
      const done = completedBySde.get(e.id) ?? 0;
      if (done === 0) continue;
      const frac = completedFraction(e.prescribed_sets, !!e.exercises?.unilateral, !!e.extra_side_set, done);
      bySlot.set(e.slot_key, Math.max(bySlot.get(e.slot_key) ?? 0, frac));
    }
    const f = feedbackByDay.get(d.id);
    return {
      id: d.id,
      date: d.date,
      feedback: f ? { effort: f.effort ?? null, pain: f.pain ?? null, painArea: f.pain_area ?? null } : null,
      slots: [...bySlot].map(([slotKey, fraction]) => ({ slotKey, completedFraction: fraction })),
    };
  });

  const painHistory = ((fbRes.data ?? []) as any[])
    .filter((f) => f.pain != null && dateByDay.has(f.sprint_day_id))
    .map((f) => ({ date: dateByDay.get(f.sprint_day_id)!, pain: Number(f.pain) }));

  const result = computeDayBuild({
    today: date,
    dayNumber,
    ...content,
    baseline,
    states: ((statesRes.data ?? []) as any[]).map(toState),
    tier: settings?.equipmentTier ?? null,
    timeRange: (settings as any)?.dailyTimeRange ?? null,
    adjustments: ((adjRes.data ?? []) as any[]).map((a) => ({
      id: a.id,
      slotKey: a.slot_key,
      kind: a.kind ?? null,
      levelOverride: a.level_override ?? null,
      prefer: a.prefer_exercise_ids ?? [],
      avoid: a.avoid_exercise_ids ?? [],
      priorityDelta: a.priority_delta ?? 0,
      createdAt: a.created_at ?? '',
    })),
    pendingDays,
    painHistory,
    yesterdaySlots: yesterday ? exercises.filter((e) => e.sprint_day_id === yesterday.id).map((e) => e.slot_key) : [],
    lastDoneByExercise: lastDone,
  });

  // Writes: state first, then the progressed marks, then today's rows.
  if (result.states.length) {
    const { error } = await supabase
      .from('sprint_slot_state')
      .upsert(result.states.map((s) => fromState(sprintId, s)), { onConflict: 'sprint_id,slot_key' });
    check(error);
  }
  if (result.progressedDayIds.length) {
    const { error } = await supabase
      .from('sprint_days')
      .update({ progressed_at: new Date().toISOString() })
      .in('id', result.progressedDayIds);
    check(error);
  }
  if (result.rows.length) {
    const { error } = await supabase
      .from('sprint_day_exercises')
      .insert(result.rows.map((r) => ({ ...r, sprint_day_id: dayId })));
    check(error);
  }
  const { error: whyError } = await supabase.from('sprint_days').update({ why_today: result.plan.whyToday || null }).eq('id', dayId);
  check(whyError);
  if (result.consumedAdjustmentIds.length) {
    const { error } = await supabase
      .from('sprint_ai_adjustments')
      .update({ consumed_at: new Date().toISOString() })
      .in('id', result.consumedAdjustmentIds);
    check(error);
  }
}
