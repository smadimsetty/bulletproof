import {
  isAssessmentComplete,
  buildBeforeAfterComparison,
  prefillDraft,
  changeVerdict,
  type AssessmentComparison,
  type PastAssessment,
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

import { submitAssessment } from './sprintAssessment';

describe('submitAssessment', () => {
  function mockChain(overrides: Record<string, any>) {
    const chain: any = {};
    for (const method of ['select', 'update', 'upsert', 'eq', 'single']) {
      chain[method] = overrides[method] ?? jest.fn(() => chain);
    }
    return chain;
  }

  function mockAssessmentUpsert() {
    return mockChain({
      upsert: jest.fn(() =>
        mockChain({ select: jest.fn(() => mockChain({ single: jest.fn(() => Promise.resolve({ data: { id: 'a-1' }, error: null })) })) })
      ),
    });
  }

  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  // The baseline phase deliberately leaves the sprint in pending_baseline:
  // activateSprintAfterBaseline flips it to 'active' only once all 14 days
  // exist, so a failed generation can be retried instead of stranding an
  // 'active' sprint with missing days.
  test('the baseline phase does NOT flip the sprint to active', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(mockAssessmentUpsert())
      .mockReturnValueOnce(mockChain({ upsert: jest.fn(() => Promise.resolve({ error: null })) }))
      .mockReturnValue(mockChain({ update: updateSpy }));

    await submitAssessment('sprint-1', 'baseline', [{ testKey: 'knee_to_wall', valueLeft: 8, valueRight: 9 }]);

    expect(supabase.from).toHaveBeenCalledWith('sprint_assessments');
    expect(supabase.from).toHaveBeenCalledWith('sprint_assessment_results');
    expect(supabase.from).not.toHaveBeenCalledWith('sprints');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('the reassessment phase still completes the sprint', async () => {
    const updateSpy = jest.fn(() => mockChain({ eq: jest.fn(() => Promise.resolve({ error: null })) }));
    (supabase.from as jest.Mock)
      .mockReturnValueOnce(mockAssessmentUpsert())
      .mockReturnValueOnce(mockChain({ upsert: jest.fn(() => Promise.resolve({ error: null })) }))
      .mockReturnValue(mockChain({ update: updateSpy }));

    await submitAssessment('sprint-1', 'reassessment', [{ testKey: 'knee_to_wall', valueLeft: 10, valueRight: 10 }]);

    expect(supabase.from).toHaveBeenCalledWith('sprints');
    expect(updateSpy).toHaveBeenCalledWith({ status: 'completed' });
  });
});

function past(results: AssessmentResultInput[]): PastAssessment {
  return {
    assessmentId: 'a1',
    sprintId: 's1',
    phase: 'baseline',
    cycleNumber: 1,
    completedAt: '2026-11-01T10:00:00Z',
    results,
  };
}

describe('prefillDraft', () => {
  test('copies left/right for bilateral and single for others', () => {
    const draft = prefillDraft(
      [BILATERAL_DEF, SINGLE_DEF],
      past([
        { testKey: 'knee_to_wall', valueLeft: 9, valueRight: 11 },
        { testKey: 'ccf_endurance_hold', valueSingle: 30 },
      ])
    );
    expect(draft.get('knee_to_wall')).toEqual({ testKey: 'knee_to_wall', valueLeft: 9, valueRight: 11 });
    expect(draft.get('ccf_endurance_hold')).toEqual({ testKey: 'ccf_endurance_hold', valueSingle: 30 });
    expect(isAssessmentComplete([BILATERAL_DEF, SINGLE_DEF], draft)).toBe(true);
  });

  test('keeps a 0 (fail) value', () => {
    const passFail: AssessmentDefinition = { ...SINGLE_DEF, testKey: 'wall_reach', unit: 'pass/fail' };
    const draft = prefillDraft([passFail], past([{ testKey: 'wall_reach', valueSingle: 0 }]));
    expect(draft.get('wall_reach')?.valueSingle).toBe(0);
    expect(isAssessmentComplete([passFail], draft)).toBe(true);
  });

  test('ignores past keys not in definitions and leaves new definitions empty', () => {
    const draft = prefillDraft([SINGLE_DEF], past([{ testKey: 'removed_test', valueSingle: 5 }]));
    expect(draft.has('removed_test')).toBe(false);
    expect(draft.has('ccf_endurance_hold')).toBe(false);
    expect(isAssessmentComplete([SINGLE_DEF], draft)).toBe(false);
  });

  test('null past gives an empty map', () => {
    expect(prefillDraft([BILATERAL_DEF], null).size).toBe(0);
  });
});

function comparison(
  betterDirection: AssessmentComparison['betterDirection'],
  baseline: AssessmentComparison['baseline'],
  reassessment: AssessmentComparison['reassessment']
): AssessmentComparison {
  return { testKey: 't', name: 'T', unit: 'cm', betterDirection, baseline, reassessment };
}

describe('changeVerdict', () => {
  test('higher + single, 30 -> 45 is better', () => {
    expect(changeVerdict(comparison('higher', { single: 30 }, { single: 45 }))).toBe('better');
  });
  test('lower + single, 5 -> 7 is worse', () => {
    expect(changeVerdict(comparison('lower', { single: 5 }, { single: 7 }))).toBe('worse');
  });
  test('symmetry narrows from L9/R12 to L10/R11 is better', () => {
    expect(changeVerdict(comparison('symmetry', { left: 9, right: 12 }, { left: 10, right: 11 }))).toBe('better');
  });
  test('higher uses the mean of left/right when there is no single value', () => {
    expect(changeVerdict(comparison('higher', { left: 8, right: 10 }, { left: 10, right: 12 }))).toBe('better');
  });
  test('missing previous gives null', () => {
    expect(changeVerdict(comparison('higher', null, { single: 5 }))).toBeNull();
  });
  test('equal is same', () => {
    expect(changeVerdict(comparison('lower', { single: 5 }, { single: 5 }))).toBe('same');
  });
});
