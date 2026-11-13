// supabase/functions/_shared/subscriptionRules.ts
//
// Turns a verified StoreKit 2 transaction payload into a `subscriptions` row, or says why
// it can't be used. Pure, so the app's jest suite tests it; the verify-subscription Edge
// Function runs it after appleJws.ts has checked Apple's signature.

export const BUNDLE_ID = 'com.sohan.bulletproof';
export const PRODUCT_IDS = {
  monthly: 'com.sohan.bulletproof.premium.monthly',
  yearly: 'com.sohan.bulletproof.premium.yearly',
} as const;
const KNOWN = new Set<string>(Object.values(PRODUCT_IDS));

export interface SubscriptionRow {
  owner_id: string;
  original_transaction_id: string;
  product_id: string;
  expires_at: string;
  environment: string;
  is_trial: boolean;
  revoked_at: string | null;
}

export type TransactionResult = { ok: true; row: SubscriptionRow } | { ok: false; reason: string };

export function subscriptionFromTransaction(tx: Record<string, any>, userId: string): TransactionResult {
  if (tx.bundleId !== BUNDLE_ID) return { ok: false, reason: 'Purchase is for a different app' };
  if (!KNOWN.has(tx.productId)) return { ok: false, reason: 'Unknown product' };
  if (tx.type !== 'Auto-Renewable Subscription') return { ok: false, reason: 'Not a subscription' };
  if (typeof tx.expiresDate !== 'number') return { ok: false, reason: 'Subscription has no expiry date' };
  if (!tx.originalTransactionId) return { ok: false, reason: 'Missing original transaction id' };
  // The app sets appAccountToken to the user's id when buying; a different id means the
  // purchase belongs to another MoveMaxx account (e.g. restored on a shared Apple ID).
  if (tx.appAccountToken && String(tx.appAccountToken).toLowerCase() !== userId.toLowerCase()) {
    return { ok: false, reason: 'This purchase belongs to another MoveMaxx account' };
  }
  return {
    ok: true,
    row: {
      owner_id: userId,
      original_transaction_id: String(tx.originalTransactionId),
      product_id: tx.productId,
      expires_at: new Date(tx.expiresDate).toISOString(),
      environment: String(tx.environment ?? 'Production'),
      // offerType 1 is the introductory offer; ours is the 2-week free trial.
      is_trial: tx.offerType === 1 && (tx.offerDiscountType == null || tx.offerDiscountType === 'FREE_TRIAL'),
      revoked_at: typeof tx.revocationDate === 'number' ? new Date(tx.revocationDate).toISOString() : null,
    },
  };
}
