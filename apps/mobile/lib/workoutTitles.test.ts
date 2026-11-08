import { defaultWorkoutTitle, sprintWorkoutTitle, sprintTargetText } from './workoutTitles';

test('defaultWorkoutTitle by local hour', () => {
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 7))).toBe('Morning workout');
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 12))).toBe('Afternoon workout');
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 16, 59))).toBe('Afternoon workout');
  expect(defaultWorkoutTitle(new Date(2026, 10, 7, 17))).toBe('Evening workout');
});
test('sprintWorkoutTitle', () => expect(sprintWorkoutTitle('Ankles', 6)).toBe('Ankles · Day 6'));
test('sprintTargetText', () => {
  expect(sprintTargetText(2, '15 reps')).toBe('2 × 15 reps');
  expect(sprintTargetText(null, '30s each side')).toBe('30s each side');
  expect(sprintTargetText(3, null)).toBe('3 sets');
  expect(sprintTargetText(null, null)).toBeNull();
  expect(sprintTargetText(null, '  ')).toBeNull();
});
