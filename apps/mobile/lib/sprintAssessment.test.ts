import {
  isAssessmentComplete,
  buildBeforeAfterComparison,
  type AssessmentDefinition,
  type AssessmentResultInput,
} from './sprintAssessment';

jest.mock('./supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const BILATERAL_DEF: AssessmentDefinition = {
  testKey: 'knee_to_wall',
  name: 'Knee to Wall',
  instructions: '...',
  unit: 'cm',
  targetDescription: '...',
  betterDirection: 'symmetry',
  isBilateral: true,
  isSynthesized: false,
};

const SINGLE_DEF: AssessmentDefinition = {
  testKey: 'ccf_endurance_hold',
  name: 'CCF Endurance Hold',
  instructions: '...',
  unit: 'seconds',
  targetDescription: '...',
  betterDirection: 'higher',
  isBilateral: false,
  isSynthesized: true,
};

describe('isAssessmentComplete', () => {
  test('false when a bilateral test is missing a side', () => {
    const draft = new Map<string, AssessmentResultInput>([
      ['knee_to_wall', { testKey: 'knee_to_wall', valueLeft: 10 }],
    ]);
    expect(isAssessmentComplete([BILATERAL_DEF], draft)).toBe(false);
  });

  test('true when a bilateral test has both sides', () => {
    const draft = new Map<string, AssessmentResultInput>([
      ['knee_to_wall', { testKey: 'knee_to_wall', valueLeft: 10, valueRight: 11 }],
    ]);
    expect(isAssessmentComplete([BILATERAL_DEF], draft)).toBe(true);
  });

  test('a single-value test only needs valueSingle', () => {
    const draft = new Map<string, AssessmentResultInput>([
      ['ccf_endurance_hold', { testKey: 'ccf_endurance_hold', valueSingle: 25 }],
    ]);
    expect(isAssessmentComplete([SINGLE_DEF], draft)).toBe(true);
  });

  test('false when a definition has no draft entry at all', () => {
    expect(isAssessmentComplete([SINGLE_DEF], new Map())).toBe(false);
  });
});

describe('buildBeforeAfterComparison', () => {
  test('pairs baseline and reassessment values by test_key', () => {
    const comparison = buildBeforeAfterComparison(
      [BILATERAL_DEF],
      [{ testKey: 'knee_to_wall', valueLeft: 8, valueRight: 8.5 }],
      [{ testKey: 'knee_to_wall', valueLeft: 10, valueRight: 9.5 }]
    );

    expect(comparison).toEqual([
      {
        testKey: 'knee_to_wall',
        name: 'Knee to Wall',
        unit: 'cm',
        betterDirection: 'symmetry',
        baseline: { left: 8, right: 8.5, single: undefined },
        reassessment: { left: 10, right: 9.5, single: undefined },
      },
    ]);
  });

  test('a missing reassessment value renders as null, not a crash', () => {
    const comparison = buildBeforeAfterComparison(
      [SINGLE_DEF],
      [{ testKey: 'ccf_endurance_hold', valueSingle: 15 }],
      []
    );

    expect(comparison[0].reassessment).toBeNull();
  });
});

import { fetchAssessmentResults } from './sprintAssessment';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));
import { supabase } from './supabase';

describe('fetchAssessmentResults', () => {
  function mockChain(overrides: Record<string, any>) {
    const chain: any = {};
    for (const method of ['select', 'eq', 'maybeSingle']) {
      chain[method] = overrides[method] ?? jest.fn(() => chain);
    }
    return chain;
  }

  test('returns an empty array when no assessment exists for that phase yet', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      mockChain({
        select: jest.fn(() =>
          mockChain({ eq: jest.fn(() => mockChain({ eq: jest.fn(() => mockChain({ maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })) })) })) })
        ),
      })
    );

    const result = await fetchAssessmentResults('sprint-1', 'reassessment');
    expect(result).toEqual([]);
  });

  test('maps result rows to AssessmentResultInput, undefined for unset fields', async () => {
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(
        mockChain({
          select: jest.fn(() =>
            mockChain({ eq: jest.fn(() => mockChain({ eq: jest.fn(() => mockChain({ maybeSingle: jest.fn(() => Promise.resolve({ data: { id: 'assessment-1' }, error: null })) })) })) })
          ),
        })
      )
      .mockReturnValueOnce(
        mockChain({
          select: jest.fn(() =>
            mockChain({ eq: jest.fn(() => Promise.resolve({ data: [{ test_key: 'knee_to_wall', value_left: 8, value_right: null, value_single: null, notes: null }], error: null })) })
          ),
        })
      );

    const result = await fetchAssessmentResults('sprint-1', 'baseline');
    expect(result).toEqual([{ testKey: 'knee_to_wall', valueLeft: 8, valueRight: undefined, valueSingle: undefined, notes: undefined }]);
  });
});
