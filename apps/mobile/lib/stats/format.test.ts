// apps/mobile/lib/stats/format.test.ts
import { describePrEvent, formatPrValue, prHeadline } from './format';

test('formats each PR kind', () => {
  expect(formatPrValue('longest_hold', 75, 's', 'lbs')).toBe('75s');
  expect(formatPrValue('most_reps', 12, 'reps', 'lbs')).toBe('12 reps');
  expect(formatPrValue('best_rom', 12.5, 'cm', 'lbs')).toBe('12.5 cm');
  expect(formatPrValue('heaviest_weight', 100, 'kg', 'kg')).toBe('100 kg');
  expect(formatPrValue('heaviest_weight', 45.359237, 'kg', 'lbs')).toBe('100 lbs');
});

test('headline and description include side and previous', () => {
  expect(prHeadline('longest_hold', 'left', 75, 's', 'lbs')).toBe('Longest hold (L) · 75s');
  expect(
    describePrEvent(
      { workoutId: 'w', exerciseId: 'e', exerciseName: 'Ankle CARs', side: 'left', kind: 'longest_hold', value: 75, unit: 's', previous: 60, at: '2026-11-01T00:00:00Z' },
      'lbs'
    )
  ).toBe('Ankle CARs · Longest hold (L) · 75s ↑ from 60s');
});

test('weight tie-break shows reps', () => {
  expect(
    describePrEvent(
      { workoutId: 'w', exerciseId: 'e', exerciseName: 'Squat', side: null, kind: 'heaviest_weight', value: 100, unit: 'kg', previous: 100, reps: 8, previousReps: 5, at: '2026-11-01T00:00:00Z' },
      'kg'
    )
  ).toBe('Squat · Heaviest · 100 kg × 8 ↑ from 100 kg × 5');
});
