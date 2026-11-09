// apps/mobile/lib/workoutKind.test.ts
import { dominantKind } from './workoutKind';

const sets = (n: number, done = true, setType: 'warmup' | 'working' = 'working') =>
  Array.from({ length: n }, () => ({ setType, completedAt: done ? 'x' : null }));

describe('dominantKind', () => {
  it('picks the kind with the most completed working sets', () => {
    expect(
      dominantKind([
        { exerciseType: 'strength', unilateral: false, sets: sets(4) },
        { exerciseType: 'mobility_stretch', unilateral: false, sets: sets(2) },
      ])
    ).toBe('weight_reps');
  });
  it('ignores warm-ups and unfinished sets', () => {
    expect(
      dominantKind([
        { exerciseType: 'strength', unilateral: false, sets: [...sets(5, false), ...sets(5, true, 'warmup')] },
        { exerciseType: 'mobility_stretch', unilateral: false, sets: sets(1) },
      ])
    ).toBe('hold');
  });
  it('breaks ties toward hold (mobility-first)', () => {
    expect(
      dominantKind([
        { exerciseType: 'strength', unilateral: false, sets: sets(2) },
        { exerciseType: 'mobility_stretch', unilateral: false, sets: sets(2) },
      ])
    ).toBe('hold');
  });
});
