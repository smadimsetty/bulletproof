// apps/mobile/lib/coachLimits.test.ts
import { DAILY_COACH_CAP, coachBlockReason } from '../../../supabase/functions/_shared/coachLimits';

test('the cap is 4 AI coach calls per user per day', () => {
  expect(DAILY_COACH_CAP).toBe(4);
});

test('allows a premium user under the cap', () => {
  expect(coachBlockReason({ aiCallsLast24h: 3, premiumStatus: 'subscribed' })).toBeNull();
  expect(coachBlockReason({ aiCallsLast24h: 0, premiumStatus: 'founder' })).toBeNull();
  expect(coachBlockReason({ aiCallsLast24h: 0, premiumStatus: 'trial' })).toBeNull();
});

test('blocks the 5th call in 24 hours', () => {
  expect(coachBlockReason({ aiCallsLast24h: 4, premiumStatus: 'founder' })).toMatch(/daily cap/);
});

test('blocks users without premium, and fails closed on an unknown status', () => {
  expect(coachBlockReason({ aiCallsLast24h: 0, premiumStatus: 'none' })).toMatch(/premium/);
  expect(coachBlockReason({ aiCallsLast24h: 0, premiumStatus: null })).toMatch(/premium/);
});
