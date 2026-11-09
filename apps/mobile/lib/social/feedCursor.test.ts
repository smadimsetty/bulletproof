// apps/mobile/lib/social/feedCursor.test.ts
import { feedCursorFilter, nextCursor } from './feedCursor';

describe('feedCursorFilter', () => {
  it('orders by ended_at then id so equal timestamps are not skipped or repeated', () => {
    expect(feedCursorFilter({ endedAt: '2026-11-08T10:00:00Z', id: 'b' })).toBe(
      'ended_at.lt.2026-11-08T10:00:00Z,and(ended_at.eq.2026-11-08T10:00:00Z,id.lt.b)'
    );
  });
});

describe('nextCursor', () => {
  const row = (id: string, endedAt: string) => ({ id, endedAt });
  it('is the last row of a full page', () => {
    expect(nextCursor([row('a', '2'), row('b', '1')], 2)).toEqual({ endedAt: '1', id: 'b' });
  });
  it('is null for a short or empty page', () => {
    expect(nextCursor([row('a', '2')], 2)).toBeNull();
    expect(nextCursor([], 2)).toBeNull();
  });
});
