import { planSummaryFallback } from './planSummary';
import type { EngineTest } from './types';

const t = (testKey: string, targetValue: number): EngineTest => ({
  testKey, betterDirection: 'higher', rawDirection: 'higher', targetValue, noiseThreshold: 1, isBilateral: false,
});
const names = { a: 'knee-to-wall', b: 'balance', c: 'calf raises' };

test('names the two tests furthest from target, biggest gap first', () => {
  const s = planSummaryFallback(
    [t('a', 10), t('b', 30), t('c', 20)],
    [
      { testKey: 'a', left: null, right: null, single: 9 },
      { testKey: 'b', left: null, right: null, single: 10 },
      { testKey: 'c', left: null, right: null, single: 12 },
    ],
    names,
  );
  expect(s).toBe('Your plan targets balance first, then calf raises.');
});

test('one test with a gap, or none', () => {
  expect(planSummaryFallback([t('a', 10)], [{ testKey: 'a', left: null, right: null, single: 5 }], names))
    .toBe('Your plan targets knee-to-wall first.');
  expect(planSummaryFallback([t('a', 10)], [{ testKey: 'a', left: null, right: null, single: 12 }], names))
    .toBe('Your tests are near target, so this plan keeps every area ticking over.');
  expect(planSummaryFallback([t('a', 10)], [], names)).toBeNull();
});
