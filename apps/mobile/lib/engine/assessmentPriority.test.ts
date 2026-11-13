import {
  PRIORITY_FLOOR,
  scoreTest,
  slotPriorities,
  weakerSideBySlot,
} from './assessmentPriority';
import type { EngineTest, TestResult } from './types';

const t = (o: Partial<EngineTest> = {}): EngineTest => ({
  testKey: 'k',
  betterDirection: 'higher',
  rawDirection: 'higher',
  targetValue: 10,
  noiseThreshold: 1.5,
  isBilateral: true,
  ...o,
});
const r = (o: Partial<TestResult> = {}): TestResult => ({
  testKey: 'k',
  left: null,
  right: null,
  single: null,
  ...o,
});

describe('scoreTest', () => {
  it('takes the larger of raw and symmetry deficit and flags the weaker side', () => {
    const s = scoreTest(t(), r({ left: 8, right: 12 }));
    expect(s.deficit).toBeCloseTo(0.259, 3);
    expect(s.weakerSide).toBe('left');
  });
  it('does not flag a side within noise', () => {
    expect(scoreTest(t(), r({ left: 11, right: 12 })).weakerSide).toBeNull();
  });
  it('handles lower-is-better single tests', () => {
    const s = scoreTest(t({ betterDirection: 'lower', isBilateral: false }), r({ single: 12 }));
    expect(s.deficit).toBeCloseTo(0.2, 5);
  });
  it('flags the larger side as weaker for lower tests', () => {
    const s = scoreTest(t({ betterDirection: 'lower' }), r({ left: 9, right: 14 }));
    expect(s.weakerSide).toBe('right');
  });
  it('gives zero deficit at or above target', () => {
    expect(scoreTest(t({ isBilateral: false }), r({ single: 10 })).deficit).toBe(0);
    expect(scoreTest(t({ isBilateral: false }), r({ single: 15 })).deficit).toBe(0);
  });
  it('is zero (never NaN) for missing result or null target', () => {
    expect(scoreTest(t(), undefined)).toEqual({ testKey: 'k', deficit: 0, weakerSide: null });
    const s = scoreTest(t({ targetValue: null, isBilateral: false }), r({ single: 5 }));
    expect(s).toEqual({ testKey: 'k', deficit: 0, weakerSide: null });
  });
  it('handles target 0 on lower-is-better tests via the noise scale', () => {
    const s = scoreTest(
      t({ betterDirection: 'lower', targetValue: 0, noiseThreshold: 2, isBilateral: false }),
      r({ single: 6 }),
    );
    expect(s.deficit).toBeCloseTo(0.3, 5);
  });
  it('target 0 with no noise gives deficit 0, not NaN', () => {
    const s = scoreTest(
      t({ betterDirection: 'lower', targetValue: 0, noiseThreshold: null, isBilateral: false }),
      r({ single: 6 }),
    );
    expect(s.deficit).toBe(0);
  });
  it('uses the gap term when one side is 0', () => {
    const s = scoreTest(
      t({ targetValue: 0, noiseThreshold: 2, betterDirection: 'lower' }),
      r({ left: 0, right: 5 }),
    );
    expect(s.deficit).toBeCloseTo(0.25, 5);
    const n = scoreTest(t({ noiseThreshold: null, targetValue: 0 }), r({ left: 0, right: 5 }));
    expect(n.deficit).toBe(0);
  });
  it('symmetry tests with null rawDirection use only the symmetry term', () => {
    const s = scoreTest(
      t({ betterDirection: 'symmetry', rawDirection: null }),
      r({ left: 6, right: 10 }),
    );
    expect(s.deficit).toBeCloseTo((0.9 - 0.6) / 0.9, 5);
  });
});

describe('slotPriorities', () => {
  it('adds weighted contributions for two links to one slot', () => {
    const scores = [
      { testKey: 'a', deficit: 0.5, weakerSide: null },
      { testKey: 'b', deficit: 0, weakerSide: null },
    ];
    const p = slotPriorities(scores, [
      { testKey: 'a', slotKey: 's', weight: 1 },
      { testKey: 'b', slotKey: 's', weight: 0.5 },
    ]);
    expect(p.get('s')).toBeCloseTo(1 * (PRIORITY_FLOOR + 0.5) + 0.5 * PRIORITY_FLOOR, 5);
  });
  it('is weight x floor at zero deficit', () => {
    const p = slotPriorities(
      [{ testKey: 'a', deficit: 0, weakerSide: null }],
      [{ testKey: 'a', slotKey: 's', weight: 2 }],
    );
    expect(p.get('s')).toBeCloseTo(0.4, 5);
  });
});

describe('weakerSideBySlot', () => {
  it('takes the side from the linked test with the largest deficit', () => {
    const m = weakerSideBySlot(
      [
        { testKey: 'a', deficit: 0.2, weakerSide: 'left' },
        { testKey: 'b', deficit: 0.6, weakerSide: 'right' },
        { testKey: 'c', deficit: 0.9, weakerSide: null },
      ],
      ['a', 'b', 'c'].map((testKey) => ({ testKey, slotKey: 's', weight: 1 })),
    );
    expect(m.get('s')).toBe('right');
  });
});
