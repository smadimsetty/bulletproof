// apps/web/lib/sessionTypeLabels.test.ts
import { SESSION_TYPE_LABELS, labelForSessionType } from './sessionTypeLabels';
import type { SessionType } from './recommendations';

const ALL_SESSION_TYPES: SessionType[] = ['upper', 'lower', 'pickleball', 'run', 'rest', 'mobility'];

describe('SESSION_TYPE_LABELS', () => {
  test('has a defined, non-empty label for every session_type enum value', () => {
    for (const type of ALL_SESSION_TYPES) {
      expect(SESSION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  test('produces the expected friendly names', () => {
    expect(SESSION_TYPE_LABELS.upper).toBe('Upper Body');
    expect(SESSION_TYPE_LABELS.lower).toBe('Lower Body');
    expect(SESSION_TYPE_LABELS.pickleball).toBe('Pickleball');
    expect(SESSION_TYPE_LABELS.run).toBe('Run');
    expect(SESSION_TYPE_LABELS.rest).toBe('Rest');
    expect(SESSION_TYPE_LABELS.mobility).toBe('Mobility');
  });
});

describe('labelForSessionType', () => {
  test('returns the mapped label for a known type', () => {
    expect(labelForSessionType('mobility')).toBe('Mobility');
  });

  test('falls back to Unknown for a value outside the known union', () => {
    expect(labelForSessionType('not_a_real_type' as SessionType)).toBe('Unknown');
  });
});
