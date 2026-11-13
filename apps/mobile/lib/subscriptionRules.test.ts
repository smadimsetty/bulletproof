// apps/mobile/lib/subscriptionRules.test.ts
import { PRODUCT_IDS, subscriptionFromTransaction } from '../../../supabase/functions/_shared/subscriptionRules';

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
const tx = {
  bundleId: 'com.sohan.bulletproof',
  productId: PRODUCT_IDS.monthly,
  type: 'Auto-Renewable Subscription',
  originalTransactionId: '2000000123',
  transactionId: '2000000456',
  expiresDate: Date.UTC(2026, 11, 1),
  appAccountToken: USER.toUpperCase(),
  environment: 'Sandbox',
  offerType: 1,
  offerDiscountType: 'FREE_TRIAL',
};

test('maps a valid transaction to a subscription row', () => {
  expect(subscriptionFromTransaction(tx, USER)).toEqual({
    ok: true,
    row: {
      owner_id: USER,
      original_transaction_id: '2000000123',
      product_id: PRODUCT_IDS.monthly,
      expires_at: new Date(Date.UTC(2026, 11, 1)).toISOString(),
      environment: 'Sandbox',
      is_trial: true,
      revoked_at: null,
    },
  });
});

test('a paid period is not a trial', () => {
  const r = subscriptionFromTransaction({ ...tx, offerType: undefined, offerDiscountType: undefined }, USER);
  expect(r.ok && r.row.is_trial).toBe(false);
});

test('records a refund or revocation', () => {
  const r = subscriptionFromTransaction({ ...tx, revocationDate: Date.UTC(2026, 10, 20) }, USER);
  expect(r.ok && r.row.revoked_at).toBe(new Date(Date.UTC(2026, 10, 20)).toISOString());
});

test.each([
  ['another app', { bundleId: 'com.someone.else' }, /app/],
  ['an unknown product', { productId: 'com.sohan.bulletproof.coins' }, /product/],
  ['a one-time purchase', { type: 'Non-Consumable' }, /subscription/],
  ['no expiry', { expiresDate: undefined }, /expiry/],
  ['a purchase made by another account', { appAccountToken: '11111111-2222-3333-4444-555555555555' }, /account/],
])('rejects %s', (_label, change, reason) => {
  const r = subscriptionFromTransaction({ ...tx, ...change }, USER);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(reason);
});

test('accepts a transaction with no account token (bound by its original transaction id instead)', () => {
  expect(subscriptionFromTransaction({ ...tx, appAccountToken: undefined }, USER).ok).toBe(true);
});
