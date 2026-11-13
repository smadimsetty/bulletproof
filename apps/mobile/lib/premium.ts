// apps/mobile/lib/premium.ts
//
// Apple in-app purchase for the paid plan, through expo-iap (StoreKit 2).
//  - fetchPremiumStatus(): the server's verdict (founder / trial / subscribed / none).
//  - syncPurchases(): sends the signed transactions StoreKit holds to verify-subscription,
//    so renewals and purchases made on another device are picked up.
//  - buy(): starts Apple's purchase sheet; the result arrives through a listener, gets
//    verified on the server, and only then is the transaction finished.
// Every purchase carries appAccountToken = the user's id, which the server checks.
import {
  deepLinkToSubscriptions, endConnection, fetchProducts, finishTransaction, getAvailablePurchases, initConnection,
  isUserCancelledError, purchaseErrorListener, purchaseUpdatedListener, requestPurchase, restorePurchases,
} from 'expo-iap';
import { supabase } from './supabase';
import { PRODUCT_IDS, type PremiumStatus } from './premiumRules';

export interface PlanProduct {
  id: string;
  displayPrice: string;
  price: number | null;
  hasTrial: boolean;
}

const listeners = new Set<() => void>();
/** Fires after anything that may have changed the user's premium status. */
export function subscribePremiumChanges(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

let connected: Promise<unknown> | null = null;
function connect() {
  if (!connected) connected = initConnection().catch((e) => {
    connected = null;
    throw e;
  });
  return connected;
}

export async function fetchPremiumStatus(): Promise<PremiumStatus> {
  const { data, error } = await supabase.rpc('my_premium_status');
  if (error) throw new Error(error.message);
  return data as PremiumStatus;
}

async function verify(tokens: string[]): Promise<{ status: PremiumStatus; results: { ok: boolean; reason?: string }[] }> {
  const { data, error } = await supabase.functions.invoke('verify-subscription', { body: { transactions: tokens } });
  if (error) throw new Error(error.message);
  return data;
}

/** Re-sends what StoreKit holds. Returns the fresh status, or null when there was nothing to send. */
export async function syncPurchases(): Promise<PremiumStatus | null> {
  await connect();
  const ids = new Set<string>(Object.values(PRODUCT_IDS));
  const ours = (await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })).filter(
    (p) => ids.has(p.productId) && p.purchaseToken,
  );
  if (ours.length === 0) return null;
  const { status, results } = await verify(ours.map((p) => p.purchaseToken as string));
  // Finish what the server recorded, or StoreKit redelivers it on every launch.
  await Promise.all(
    ours.map((p, i) => (results[i]?.ok ? finishTransaction({ purchase: p, isConsumable: false }).catch(() => undefined) : undefined)),
  );
  notify();
  return status;
}

export async function restore(): Promise<PremiumStatus | null> {
  await connect();
  await restorePurchases();
  return syncPurchases();
}

export async function loadPlans(): Promise<{ monthly: PlanProduct | null; yearly: PlanProduct | null }> {
  await connect();
  const products = ((await fetchProducts({ skus: Object.values(PRODUCT_IDS), type: 'subs' })) ?? []) as any[];
  const shape = (id: string): PlanProduct | null => {
    const p = products.find((x) => x.id === id);
    if (!p) return null;
    return {
      id,
      displayPrice: p.displayPrice,
      price: typeof p.price === 'number' ? p.price : null,
      hasTrial: p.introductoryPricePaymentModeIOS === 'free-trial',
    };
  };
  return { monthly: shape(PRODUCT_IDS.monthly), yearly: shape(PRODUCT_IDS.yearly) };
}

/**
 * Opens Apple's purchase sheet and resolves once the server has verified the purchase.
 * Resolves null if the user cancelled.
 */
export async function buy(productId: string): Promise<PremiumStatus | null> {
  await connect();
  const me = (await supabase.auth.getSession()).data.session?.user.id;
  if (!me) throw new Error('Sign in first.');
  return new Promise<PremiumStatus | null>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      okSub.remove();
      errSub.remove();
      fn();
    };
    const okSub = purchaseUpdatedListener(async (purchase) => {
      if (purchase.productId !== productId) return;
      // Ask to Buy: a parent has to approve. Nothing is charged yet; the approved purchase
      // arrives later and is picked up by syncPurchases() on the next launch.
      if (purchase.purchaseState === 'pending') {
        finish(() => reject(new Error('Waiting for approval. Once it is approved, reopen MoveMaxx.')));
        return;
      }
      if (!purchase.purchaseToken) return;
      try {
        const { status, results } = await verify([purchase.purchaseToken]);
        if (!results[0]?.ok) throw new Error(results[0]?.reason ?? 'Apple confirmed the purchase but we could not verify it.');
        // Only finish once our server has recorded it; an unfinished transaction is redelivered.
        await finishTransaction({ purchase, isConsumable: false });
        notify();
        finish(() => resolve(status));
      } catch (e) {
        finish(() => reject(e));
      }
    });
    const errSub = purchaseErrorListener((err: any) => {
      finish(() => (isUserCancelledError(err) ? resolve(null) : reject(new Error(err?.message ?? 'Purchase failed.'))));
    });
    requestPurchase({ type: 'subs', request: { apple: { sku: productId, appAccountToken: me } } }).catch((e) =>
      finish(() => (isUserCancelledError(e) ? resolve(null) : reject(e))),
    );
  });
}

export async function manageSubscription(): Promise<void> {
  await connect();
  await deepLinkToSubscriptions();
}

export function disconnectStore(): void {
  if (connected) endConnection().catch(() => undefined);
  connected = null;
}
