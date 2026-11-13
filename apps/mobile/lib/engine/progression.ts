// Criteria-based daily progression (spec 5.2, 8a.2-8a.3). Pure; dates are local 'YYYY-MM-DD'.

export interface SlotState {
  slotKey: string;
  level: number;
  step: number;
  rightStreak: number;
  hardStreak: number;
  lastDoneOn: string | null;
  /** Gap step-backs already applied since the last real session (keeps applyGap idempotent). */
  gapBackApplied: number;
}
export interface LadderShape {
  maxLevel: number;
  /** Max step count among the level's exercises (the planner clamps per exercise later). */
  stepsAt(level: number): number;
}
export interface DayFeedback {
  effort: 'easy' | 'right' | 'hard' | null;
  pain: number | null;
  painArea: string | null;
}
export interface SlotOutcome {
  slotKey: string;
  area: string;
  completedFraction: number;
}
export type ProgressionReason =
  | 'pain_back' | 'pain_hold' | 'pain_trend' | 'incomplete' | 'hard' | 'hard_back'
  | 'right' | 'right_up' | 'easy_up' | 'no_feedback' | 'gap_hold' | 'gap_back' | 'already_today';

const MS_PER_DAY = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}
/** Whole days from `from` to `to`, immune to timezone/DST. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** One step up: next step, else next level step 1; capped at maxLevel's last step. */
export function stepUp(state: SlotState, shape: LadderShape): SlotState {
  const steps = Math.max(1, shape.stepsAt(state.level));
  if (state.step < steps) return { ...state, step: state.step + 1 };
  if (state.level < shape.maxLevel) return { ...state, level: state.level + 1, step: 1 };
  return { ...state, step: Math.min(state.step, steps) };
}

/** One step back: mirror of stepUp, floor level 1 step 1. */
export function stepBack(state: SlotState, shape: LadderShape): SlotState {
  if (state.step > 1) return { ...state, step: state.step - 1 };
  if (state.level > 1) {
    const level = state.level - 1;
    return { ...state, level, step: Math.max(1, shape.stepsAt(level)) };
  }
  return { ...state, level: 1, step: 1 };
}

const resetStreaks = (s: SlotState): SlotState => ({ ...s, rightStreak: 0, hardStreak: 0 });

/**
 * At most one step per slot per day: if state.lastDoneOn === doneOn, hold unchanged ('already_today').
 * Rule precedence when signals overlap (first match wins):
 *  1. no_feedback (effort or pain missing -> hold, only lastDoneOn changes)
 *  2. pain_back   (pain > 5, or painArea matches slot area with pain >= 4)
 *  3. pain_trend  (pain trending up -> hold)
 *  4. pain_hold   (pain 3-5 -> hold)
 *  5. incomplete  (completedFraction < 0.8 -> hold)
 *  6. hard / hard_back (second consecutive hard -> step back)
 *  7. right / right_up (second consecutive right -> step up)
 *  8. easy_up     (easy, pain <= 2, completedFraction >= 1)
 * Easy with pain <= 2 but completedFraction in [0.8, 1) holds with reason incomplete.
 */
export function progressSlot(
  state: SlotState,
  shape: LadderShape,
  outcome: SlotOutcome,
  fb: DayFeedback,
  painTrendUp: boolean,
  doneOn: string,
): { state: SlotState; reason: ProgressionReason; painFlag: boolean } {
  const done = (s: SlotState): SlotState => ({ ...s, lastDoneOn: doneOn, gapBackApplied: 0 });

  if (state.lastDoneOn === doneOn) {
    return { state, reason: 'already_today', painFlag: false };
  }
  if (fb.effort == null || fb.pain == null || !Number.isFinite(fb.pain)) {
    return { state: done(state), reason: 'no_feedback', painFlag: false };
  }
  const pain = fb.pain;

  if (pain > 5 || (fb.painArea != null && fb.painArea === outcome.area && pain >= 4)) {
    return { state: done(resetStreaks(stepBack(state, shape))), reason: 'pain_back', painFlag: true };
  }
  if (painTrendUp) {
    return { state: done(resetStreaks(state)), reason: 'pain_trend', painFlag: false };
  }
  if (pain >= 3) {
    return { state: done(resetStreaks(state)), reason: 'pain_hold', painFlag: false };
  }
  if (outcome.completedFraction < 0.8) {
    return { state: done(resetStreaks(state)), reason: 'incomplete', painFlag: false };
  }

  if (fb.effort === 'hard') {
    if (state.hardStreak + 1 >= 2) {
      return { state: done(resetStreaks(stepBack(state, shape))), reason: 'hard_back', painFlag: false };
    }
    return { state: done({ ...state, hardStreak: state.hardStreak + 1, rightStreak: 0 }), reason: 'hard', painFlag: false };
  }
  if (fb.effort === 'right') {
    if (state.rightStreak + 1 >= 2 && pain <= 2) {
      return { state: done(resetStreaks(stepUp(state, shape))), reason: 'right_up', painFlag: false };
    }
    return { state: done({ ...state, rightStreak: state.rightStreak + 1, hardStreak: 0 }), reason: 'right', painFlag: false };
  }
  // easy
  if (pain <= 2 && outcome.completedFraction >= 1) {
    return { state: done(resetStreaks(stepUp(state, shape))), reason: 'easy_up', painFlag: false };
  }
  return { state: done(resetStreaks(state)), reason: 'incomplete', painFlag: false };
}

/** Gap measured from the sprint's last active day (any slot). null -> no action. */
export function applyGap(
  state: SlotState,
  shape: LadderShape,
  lastActiveOn: string | null,
  today: string,
): { state: SlotState; reason: ProgressionReason | null } {
  if (lastActiveOn == null) return { state, reason: null };
  const days = daysBetween(lastActiveOn, today);
  if (!Number.isFinite(days) || days < 3) return { state, reason: null };
  if (days < 7) return { state: resetStreaks(state), reason: 'gap_hold' };
  const target = Math.min(3, Math.floor(days / 7));
  const extra = Math.max(0, target - state.gapBackApplied);
  let s = state;
  for (let i = 0; i < extra; i++) s = stepBack(s, shape);
  return { state: { ...resetStreaks(s), gapBackApplied: Math.max(target, state.gapBackApplied) }, reason: 'gap_back' };
}

/** True when each of the last 2 sessions had higher pain than the latest session >= 7 days before it. */
export function isPainTrendingUp(history: readonly { date: string; pain: number }[]): boolean {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (sorted.length < 2) return false;
  return sorted.slice(0, 2).every((s) => {
    const ref = sorted.find((o) => daysBetween(o.date, s.date) >= 7);
    return ref != null && s.pain > ref.pain;
  });
}
