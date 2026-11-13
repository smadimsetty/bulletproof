import { pickAtLevel, planStepDown, prescriptionFor, swapOptionsAtLevel } from './ladderPick';
import type { LadderRow } from './dayPlanner';

const r = (level: number, exerciseId: string, step: number, sets: number, equipment: string[] | null = null, altRank = 1): LadderRow => ({
  slotKey: 's', level, exerciseId, altRank, step, sets, repsOrDuration: `${sets * 10}s`, equipment, unilateral: false, isStretch: false,
});
const ladder: LadderRow[] = [
  r(1, 'bw1', 1, 2), r(1, 'bw1', 2, 3),
  r(2, 'gym2', 1, 2, ['cable_machine']), r(2, 'gym2', 2, 3, ['cable_machine']),
  r(2, 'band2', 1, 2, ['resistance_band'], 2),
  r(3, 'gym3', 1, 2, ['barbell']),
];

describe('prescriptionFor', () => {
  test('largest step at or below the wanted step, else the smallest', () => {
    expect(prescriptionFor(ladder, 's', 1, 'bw1', 5)).toMatchObject({ step: 2, sets: 3 });
    expect(prescriptionFor(ladder, 's', 1, 'bw1', 1)).toMatchObject({ step: 1, sets: 2 });
    expect(prescriptionFor(ladder, 's', 2, 'band2', 2)).toMatchObject({ step: 1 });
    expect(prescriptionFor(ladder, 's', 3, 'nope', 1)).toBeNull();
  });
});

describe('pickAtLevel', () => {
  test('a same-level alternate the tier allows', () => {
    expect(pickAtLevel(ladder, { slotKey: 's', level: 2, step: 2, tier: 'intermediate', exclude: new Set(['gym2']), lastDone: new Map() }))
      .toMatchObject({ exerciseId: 'band2', level: 2, step: 1 });
  });
  test('no allowed exercise at the level drops to the nearest lower level (Review Focus 3)', () => {
    expect(pickAtLevel(ladder, { slotKey: 's', level: 3, step: 1, tier: 'basic', exclude: new Set(), lastDone: new Map() }))
      .toMatchObject({ exerciseId: 'bw1', level: 1, step: 1 });
  });
  test('never goes up a level; null when nothing at or below fits', () => {
    expect(pickAtLevel(ladder, { slotKey: 's', level: 1, step: 1, tier: 'basic', exclude: new Set(['bw1']), lastDone: new Map() })).toBeNull();
  });
  test('least recently done wins among alternates', () => {
    const lastDone = new Map([['gym2', '2026-11-10'], ['band2', '2026-11-01']]);
    expect(pickAtLevel(ladder, { slotKey: 's', level: 2, step: 1, tier: 'advanced', exclude: new Set(), lastDone })!.exerciseId).toBe('band2');
  });
});

describe('swapOptionsAtLevel', () => {
  test('tier-allowed alternates at the level, with the prescription for the step', () => {
    expect(swapOptionsAtLevel(ladder, 's', 2, 2, 'advanced', 'gym2')).toEqual([
      { exerciseId: 'band2', level: 2, step: 1, sets: 2, repsOrDuration: '20s' },
    ]);
    expect(swapOptionsAtLevel(ladder, 's', 2, 1, 'basic', 'gym2')).toEqual([]);
  });
});

describe('planStepDown', () => {
  const state = { slotKey: 's', level: 2, step: 1, rightStreak: 1, hardStreak: 0, lastDoneOn: null, gapBackApplied: 0 };
  test('level 2 step 1 steps back to level 1 at its last step, with that level\'s exercise', () => {
    const out = planStepDown(state, ladder, 'gym2', 'advanced', new Map())!;
    expect(out.state).toMatchObject({ level: 1, step: 2, rightStreak: 0 });
    expect(out.choice).toMatchObject({ exerciseId: 'bw1', level: 1, step: 2, sets: 3 });
  });
  test('within a level keeps the current exercise at the lower step', () => {
    const out = planStepDown({ ...state, step: 2 }, ladder, 'gym2', 'advanced', new Map())!;
    expect(out.choice).toMatchObject({ exerciseId: 'gym2', level: 2, step: 1 });
  });
  test('already at the bottom -> null', () => {
    expect(planStepDown({ ...state, level: 1, step: 1 }, ladder, 'bw1', null, new Map())).toBeNull();
  });
});
