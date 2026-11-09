// apps/mobile/lib/localDate.test.ts
import { localDateString } from './localDate';

describe('localDateString', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(localDateString(new Date(2026, 5, 20, 14, 30))).toBe('2026-06-20');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localDateString(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});
