// apps/mobile/lib/programDisplay.test.ts
import { formatSetsReps } from './programDisplay';
import type { BlockExercise } from './homeProgram';

function exercise(overrides: Partial<BlockExercise>): BlockExercise {
  return {
    id: 'ex-1',
    order: 0,
    name: 'Test Exercise',
    prescribedSets: null,
    prescribedReps: null,
    prescribedWeightNote: null,
    isUnilateralLeftFirst: false,
    notes: null,
    demoVideoUrl: null,
    ...overrides,
  };
}

describe('formatSetsReps', () => {
  test('renders "{sets} x {reps}" when both are present', () => {
    expect(formatSetsReps(exercise({ prescribedSets: 3, prescribedReps: '10 reps/side' }))).toBe(
      '3 x 10 reps/side'
    );
  });

  test('renders sets-only when reps is null', () => {
    expect(formatSetsReps(exercise({ prescribedSets: 3, prescribedReps: null }))).toBe('3 sets');
  });

  test('renders reps-only when sets is null', () => {
    expect(formatSetsReps(exercise({ prescribedSets: null, prescribedReps: '30-45s hold' }))).toBe(
      '30-45s hold'
    );
  });

  test('renders an empty string when both are null', () => {
    expect(formatSetsReps(exercise({ prescribedSets: null, prescribedReps: null }))).toBe('');
  });

  test('renders mixed real-data formats verbatim, never reformatted', () => {
    expect(formatSetsReps(exercise({ prescribedSets: 2, prescribedReps: '5 reps/side' }))).toBe(
      '2 x 5 reps/side'
    );
    expect(formatSetsReps(exercise({ prescribedSets: 3, prescribedReps: '8-10 reps/side' }))).toBe(
      '3 x 8-10 reps/side'
    );
  });
});
