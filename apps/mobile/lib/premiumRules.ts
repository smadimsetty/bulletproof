// apps/mobile/lib/premiumRules.ts
//
// Pure helpers for the paid plan (2026-11-13): $2/month or $10/year with a 2-week free
// trial, beta testers are founders with premium for life. The server's
// premium_status() is the source of truth; these only shape what the app shows.
export const PRODUCT_IDS = {
  monthly: 'com.sohan.bulletproof.premium.monthly',
  yearly: 'com.sohan.bulletproof.premium.yearly',
} as const;

export type PremiumStatusKind = 'founder' | 'trial' | 'subscribed' | 'none';
export interface PremiumStatus {
  status: PremiumStatusKind;
  expires_at?: string | null;
  product_id?: string | null;
}

/** Fail open: if the status couldn't be loaded, never lock a possibly-paying user out. */
export function needsPaywall(s: PremiumStatus | null): boolean {
  return s?.status === 'none';
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function membershipLabel(s: PremiumStatus): string {
  switch (s.status) {
    case 'founder':
      return 'Founder: free for life';
    case 'trial':
      return s.expires_at ? `Free trial, ends ${day(s.expires_at)}` : 'Free trial';
    case 'subscribed':
      return s.expires_at ? `Premium, renews ${day(s.expires_at)}` : 'Premium';
    default:
      return 'No membership';
  }
}

export function yearlySavingsPercent(monthly: number | null | undefined, yearly: number | null | undefined): number | null {
  if (!monthly || !yearly) return null;
  const pct = Math.round((1 - yearly / (monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}
