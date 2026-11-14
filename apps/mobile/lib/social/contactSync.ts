// apps/mobile/lib/social/contactSync.ts
//
// Find friends from contacts (2026-11-13).
//  - Verifying your own phone (an SMS code through Supabase Auth's phone-change flow)
//    is what lets friends who have your number find you.
//  - findFriendsInContacts() reads the numbers in your contacts, normalises them
//    (contactNumbers.ts) and asks find_contacts() which belong to MoveMaxx users who
//    verified that number and left discovery on. Nothing sent is stored.
import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';
import { supabase } from '../supabase';
import type { ProfileCard } from './profiles';
import { normalizeNumbers, regionFromLocale } from './contactNumbers';

export function deviceRegion() {
  return regionFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
}

export interface MyPhone {
  phone: string | null; // E.164 with '+', or null
  confirmed: boolean;
}

export async function fetchMyPhone(): Promise<MyPhone> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const u = data.user;
  const phone = u?.phone ? `+${u.phone.replace(/^\+/, '')}` : null;
  return { phone, confirmed: !!(u?.phone && u.phone_confirmed_at) };
}

/** Texts a 6-digit code to the number (E.164). */
export async function sendPhoneCode(e164: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ phone: e164 });
  if (error) throw new Error(friendlySmsError(error.message));
}

export async function confirmPhoneCode(e164: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'phone_change' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Send a new one.' : error.message);
}

function friendlySmsError(message: string): string {
  // Only a missing/disabled provider means texting isn't set up. A provider-side
  // send failure (Twilio rejecting the number, compliance, geo) gets its own message.
  if (/phone.*(disabled|provider)|Unsupported phone provider|sms provider/i.test(message) && !/Error sending/i.test(message)) {
    return 'Text messages are not switched on yet. Try again later.';
  }
  if (/Error sending|sms_send_failed/i.test(message)) {
    return "We couldn't text that number. Check it and try again in a few minutes.";
  }
  if (/already|registered|exists/i.test(message)) return 'That number is already linked to another MoveMaxx account.';
  return message;
}

export type ContactsResult = { kind: 'denied' } | { kind: 'ok'; friends: ProfileCard[]; checked: number };

export async function findFriendsInContacts(): Promise<ContactsResult> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) return { kind: 'denied' };
  const details = await Contact.getAllDetails([ContactField.PHONES] as const);
  const raw = details.flatMap((d: any) => (d.phones ?? []).map((p: any) => String(p?.number ?? '')));
  const numbers = normalizeNumbers(raw, deviceRegion());
  if (numbers.length === 0) return { kind: 'ok', friends: [], checked: 0 };
  const { data, error } = await supabase.rpc('find_contacts', { p_numbers: numbers });
  if (error) throw new Error(error.message);
  const friends: ProfileCard[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    avatarPath: r.avatar_path,
    isPublic: r.is_public,
  }));
  return { kind: 'ok', friends, checked: numbers.length };
}
