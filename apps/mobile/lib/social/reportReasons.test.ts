// apps/mobile/lib/social/reportReasons.test.ts
import { REPORT_REASONS, reportFailureMessage } from './reportReasons';

describe('report reasons', () => {
  it('covers the six server-side reasons', () => {
    expect(REPORT_REASONS.map((r) => r.value).sort()).toEqual(['harassment', 'hate', 'nudity', 'other', 'spam', 'violence']);
  });
  it('maps a duplicate report to a friendly message', () => {
    expect(reportFailureMessage({ code: '23505', message: 'duplicate key' })).toBe('You already reported this.');
    expect(reportFailureMessage({ message: 'boom' })).toBe('boom');
  });
});
