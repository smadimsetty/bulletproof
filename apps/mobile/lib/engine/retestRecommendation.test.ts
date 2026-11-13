import { pickRecommendation, recommendStayOrSwitch } from './retestRecommendation';
import type { EngineTest } from './types';

const kneeWall: EngineTest = {
  testKey: 'kneewall', betterDirection: 'symmetry', rawDirection: 'higher', targetValue: 10, noiseThreshold: 1.5, isBilateral: true,
};
const balance: EngineTest = {
  testKey: 'balance', betterDirection: 'higher', rawDirection: 'higher', targetValue: 30, noiseThreshold: 3, isBilateral: false,
};
const names = { kneewall: 'knee-to-wall', balance: 'single-leg balance' };

test('a side gap beyond the noise threshold -> stay', () => {
  const r = recommendStayOrSwitch([kneeWall], [{ testKey: 'kneewall', left: 9, right: 12, single: null }], names);
  expect(r.choice).toBe('stay');
  expect(r.reason).toContain('knee-to-wall');
});

test('still clearly short of target -> stay', () => {
  expect(recommendStayOrSwitch([balance], [{ testKey: 'balance', left: null, right: null, single: 20 }], names).choice).toBe('stay');
});

test('a shortfall within the noise threshold does not count', () => {
  expect(recommendStayOrSwitch([balance], [{ testKey: 'balance', left: null, right: null, single: 28 }], names).choice).toBe('switch');
});

test('everything at target and symmetric -> switch', () => {
  const r = recommendStayOrSwitch(
    [kneeWall, balance],
    [{ testKey: 'kneewall', left: 11, right: 11.5, single: null }, { testKey: 'balance', left: null, right: null, single: 31 }],
    names,
  );
  expect(r.choice).toBe('switch');
});

test('missing results contribute nothing (Review Focus 5)', () => {
  expect(recommendStayOrSwitch([kneeWall], [{ testKey: 'kneewall', left: 9, right: null, single: null }], names).choice).toBe('switch');
});

describe('pickRecommendation', () => {
  const rules = { choice: 'stay' as const, reason: 'rules' };
  test('a valid AI recommendation wins', () => {
    expect(pickRecommendation({ choice: 'switch', reason: 'ai', suggested_pain_point_id: 'knees', source: 'ai' }, rules))
      .toEqual({ choice: 'switch', reason: 'ai', suggestedPainPointId: 'knees', source: 'ai' });
  });
  test('missing or malformed AI output falls back to the rules', () => {
    expect(pickRecommendation(null, rules)).toEqual({ choice: 'stay', reason: 'rules', suggestedPainPointId: null, source: 'rules' });
    expect(pickRecommendation({ choice: 'maybe' }, rules).source).toBe('rules');
  });
});
