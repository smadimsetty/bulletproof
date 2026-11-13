// apps/mobile/lib/premiumRules.test.ts
import { PRODUCT_IDS as SERVER_IDS } from '../../../supabase/functions/_shared/subscriptionRules';
import { PRODUCT_IDS, membershipLabel, needsPaywall, yearlySavingsPercent } from './premiumRules';

test('the app and the server agree on the product ids', () => {
  expect(PRODUCT_IDS).toEqual(SERVER_IDS);
});

test('only "none" sends someone to the paywall; an unknown status lets them in', () => {
  expect(needsPaywall({ status: 'none' })).toBe(true);
  for (const s of ['founder', 'trial', 'subscribed'] as const) expect(needsPaywall({ status: s })).toBe(false);
  expect(needsPaywall(null)).toBe(false); // couldn't load: fail open so paying users are never locked out
});

test('membership labels', () => {
  const end = '2026-11-27T15:00:00Z';
  expect(membershipLabel({ status: 'founder' })).toBe('Founder: free for life');
  expect(membershipLabel({ status: 'trial', expires_at: end })).toMatch(/^Free trial, ends /);
  expect(membershipLabel({ status: 'subscribed', expires_at: end })).toMatch(/^Premium, renews /);
  expect(membershipLabel({ status: 'none' })).toBe('No membership');
});

test('yearly savings compares a year of monthly payments', () => {
  expect(yearlySavingsPercent(1.99, 9.99)).toBe(58);
  expect(yearlySavingsPercent(null, 9.99)).toBeNull();
  expect(yearlySavingsPercent(1, 20)).toBeNull(); // no saving, say nothing
});
