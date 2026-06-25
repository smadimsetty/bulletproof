// apps/mobile/lib/sessionTypeLabels.test.ts
import { labelForSessionType } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

describe('labelForSessionType', () => {
  test.each<[SessionType, string]>([
    ['upper', 'Upper Body'],
    ['lower', 'Lower Body'],
    ['pickleball', 'Pickleball'],
    ['run', 'Run'],
    ['rest', 'Rest'],
    ['mobility', 'Mobility'],
  ])('labels %s as %s', (type, expected) => {
    expect(labelForSessionType(type)).toBe(expected);
  });

  test('falls back to Unknown for a value outside the live enum', () => {
    expect(labelForSessionType('upper_a' as SessionType)).toBe('Unknown');
  });
});
