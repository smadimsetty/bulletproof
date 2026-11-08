import { formatSeconds, formatSetValue, formatSetLines, type FormattableSet } from './setFormatting';
import { EMPTY_SET_VALUES } from './setFields';

const s = (v: Partial<FormattableSet>): FormattableSet => ({ ...EMPTY_SET_VALUES, setNumber: 1, side: null, setType: 'working', ...v });

test('formatSeconds', () => {
  expect(formatSeconds(45)).toBe('45 s');
  expect(formatSeconds(60)).toBe('1:00');
  expect(formatSeconds(65)).toBe('1:05');
});

describe('formatSetValue', () => {
  test('weight x reps in kg and lbs', () => {
    expect(formatSetValue(s({ weightKg: 40, reps: 8 }), 'weight_reps', 'kg')).toBe('40 kg × 8');
    expect(formatSetValue(s({ weightKg: 45.359237, reps: 8 }), 'weight_reps', 'lbs')).toBe('100 lbs × 8');
  });
  test('bodyweight weight_reps shows reps only', () => {
    expect(formatSetValue(s({ reps: 10 }), 'weight_reps', 'kg')).toBe('× 10');
  });
  test('reps, hold, duration', () => {
    expect(formatSetValue(s({ reps: 12 }), 'reps', 'kg')).toBe('× 12');
    expect(formatSetValue(s({ durationS: 45 }), 'hold', 'kg')).toBe('45 s');
    expect(formatSetValue(s({ durationS: 750 }), 'duration', 'kg')).toBe('12:30');
  });
  test('ROM suffix and warmup prefix', () => {
    expect(formatSetValue(s({ durationS: 45, romValue: 12, romUnit: 'cm' }), 'hold', 'kg')).toBe('45 s · 12 cm');
    expect(formatSetValue(s({ reps: 5, romValue: 30, romUnit: 'deg' }), 'reps', 'kg')).toBe('× 5 · 30°');
    expect(formatSetValue(s({ reps: 5, setType: 'warmup' }), 'reps', 'kg')).toBe('W × 5');
  });
});

test('formatSetLines pairs sides by set number, left first', () => {
  const lines = formatSetLines(
    [s({ setNumber: 1, side: 'right', durationS: 40 }), s({ setNumber: 1, side: 'left', durationS: 45 }), s({ setNumber: 2, side: 'left', durationS: 50 })],
    'hold',
    'kg'
  );
  expect(lines).toEqual(['L 45 s · R 40 s', 'L 50 s']);
});

test('formatSetLines bilateral keeps set order', () => {
  expect(formatSetLines([s({ setNumber: 2, reps: 6 }), s({ setNumber: 1, reps: 8 })], 'reps', 'kg')).toEqual(['× 8', '× 6']);
});
