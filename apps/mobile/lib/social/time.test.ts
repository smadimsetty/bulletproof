// apps/mobile/lib/social/time.test.ts
import { relativeTime } from './time';

const now = new Date('2026-11-08T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it('buckets minutes, hours and days', () => {
    expect(relativeTime(ago(10_000), now)).toBe('now');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5m');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3h');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2d');
  });
  it('never goes negative for clock skew', () => {
    expect(relativeTime(ago(-60_000), now)).toBe('now');
  });
});
