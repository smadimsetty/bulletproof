// apps/mobile/lib/hangs.test.ts
jest.mock('./supabase', () => ({ supabase: {} }));
import { COUNTDOWN_MS, formatHangDuration, hangStats, readTimer, type Hang } from './hangs';

const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi);
const hang = (id: string, start: Date, sec: number): Hang => ({
  id, startedAt: start.toISOString(), durationMs: sec * 1000, mode: 'free', targetMs: null,
});

describe('hangStats', () => {
  const now = at(2026, 11, 13, 18);
  const hangs = [
    hang('a', at(2026, 11, 13, 8), 40),
    hang('b', at(2026, 11, 13, 12), 35),
    hang('c', at(2026, 11, 12, 20), 75),
    hang('d', at(2026, 11, 1, 9), 90), // outside the 7-day window, still counts for best
  ];

  it('stacks today\'s hangs into one total', () => {
    const s = hangStats(hangs, now);
    expect(s.todayMs).toBe(75_000);
    expect(s.todayCount).toBe(2);
  });

  it('keeps the best single hang across all time', () => {
    expect(hangStats(hangs, now).bestMs).toBe(90_000);
  });

  it('returns 7 days oldest first, ending today, with zero days filled in', () => {
    const days = hangStats(hangs, now).last7;
    expect(days).toHaveLength(7);
    expect(days[6]).toEqual({ date: '2026-11-13', ms: 75_000 });
    expect(days[5]).toEqual({ date: '2026-11-12', ms: 75_000 });
    expect(days[0]).toEqual({ date: '2026-11-07', ms: 0 });
  });

  it('is all zeros with no hangs', () => {
    const s = hangStats([], now);
    expect(s).toMatchObject({ todayMs: 0, todayCount: 0, bestMs: 0 });
  });
});

describe('readTimer', () => {
  it('counts 3, 2, 1 during the countdown, then starts the hang', () => {
    const t = { phase: 'countdown' as const, startedAt: 1000, mode: 'free' as const, targetMs: null };
    expect(readTimer(t, 1000)).toMatchObject({ phase: 'countdown', count: 3 });
    expect(readTimer(t, 2100)).toMatchObject({ phase: 'countdown', count: 2 });
    expect(readTimer(t, 3999)).toMatchObject({ phase: 'countdown', count: 1 });
    const r = readTimer(t, 1000 + COUNTDOWN_MS + 2500);
    expect(r).toMatchObject({ phase: 'hanging', elapsedMs: 2500, hangStartedAt: 1000 + COUNTDOWN_MS });
  });

  it('counts down in interval mode and reports done at the target', () => {
    const t = { phase: 'countdown' as const, startedAt: 0, mode: 'interval' as const, targetMs: 30_000 };
    expect(readTimer(t, COUNTDOWN_MS + 10_000)).toMatchObject({ phase: 'hanging', remainingMs: 20_000, done: false });
    expect(readTimer(t, COUNTDOWN_MS + 30_000)).toMatchObject({ phase: 'hanging', remainingMs: 0, done: true, elapsedMs: 30_000 });
    // Never reports more than the target, even if the screen woke up late.
    expect(readTimer(t, COUNTDOWN_MS + 45_000)).toMatchObject({ elapsedMs: 30_000, done: true });
  });

  it('a free hang is never done on its own', () => {
    const t = { phase: 'countdown' as const, startedAt: 0, mode: 'free' as const, targetMs: null };
    expect(readTimer(t, COUNTDOWN_MS + 600_000)).toMatchObject({ done: false, remainingMs: null });
  });
});

describe('formatHangDuration', () => {
  it('uses seconds under a minute and minutes plus seconds above', () => {
    expect(formatHangDuration(0)).toBe('0s');
    expect(formatHangDuration(42_400)).toBe('42s');
    expect(formatHangDuration(65_000)).toBe('1m 05s');
    expect(formatHangDuration(600_000)).toBe('10m 00s');
  });
});
