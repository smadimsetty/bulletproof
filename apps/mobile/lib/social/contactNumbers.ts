// apps/mobile/lib/social/contactNumbers.ts
//
// Contacts store phone numbers in every format. Before matching, each one is parsed
// against the device's region and turned into E.164 (+CCNNN...), the same form Supabase
// Auth stores a verified phone in. Pure; tested in contactNumbers.test.ts.
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** find_contacts() refuses more than 2000 numbers per call. */
export const MAX_NUMBERS = 2000;

export function toE164(raw: string, region: CountryCode): string | null {
  const p = parsePhoneNumberFromString(raw ?? '', region);
  return p && p.isValid() ? p.number : null;
}

export function normalizeNumbers(raw: readonly string[], region: CountryCode): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const n = toE164(r, region);
    if (n) out.add(n);
    if (out.size >= MAX_NUMBERS) break;
  }
  return [...out];
}

/** 'en-US' -> 'US'. Falls back to US when the locale has no region. */
export function regionFromLocale(locale: string | undefined): CountryCode {
  const m = (locale ?? '').match(/[-_]([A-Za-z]{2})\b/);
  return (m ? m[1].toUpperCase() : 'US') as CountryCode;
}
