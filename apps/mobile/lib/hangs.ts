// apps/mobile/lib/hangs.ts
//
// Dead hang timer: a standalone tool, separate from workouts and sprints. Each hang
// is one row in `hangs`; the day's hangs stack into a daily total.
//  - readTimer(): pure clock maths for the 3-2-1 countdown and the hang itself,
//    driven by timestamps (not interval ticks) so a late or paused render is still exact.
//  - hangStats(): today's total, best single hang, and the last 7 days.
import { supabase } from './supabase';
import { localDateString } from './localDate';

export const COUNTDOWN_MS = 3000;

export type HangMode = 'free' | 'interval';

export interface Hang {
  id: string;
  startedAt: string;
  durationMs: number;
  mode: HangMode;
  targetMs: number | null;
}

/** A running timer: `startedAt` is when the countdown began (epoch ms). */
export interface RunningTimer {
  phase: 'countdown';
  startedAt: number;
  mode: HangMode;
  targetMs: number | null;
}

export type TimerReading =
  | { phase: 'countdown'; count: number }
  | { phase: 'hanging'; hangStartedAt: number; elapsedMs: number; remainingMs: number | null; done: boolean };

export function readTimer(t: RunningTimer, now: number): TimerReading {
  const sinceStart = now - t.startedAt;
  if (sinceStart < COUNTDOWN_MS) {
    return { phase: 'countdown', count: Math.max(1, Math.ceil((COUNTDOWN_MS - sinceStart) / 1000)) };
  }
  const hangStartedAt = t.startedAt + COUNTDOWN_MS;
  const raw = now - hangStartedAt;
  if (t.mode === 'interval' && t.targetMs != null) {
    const elapsedMs = Math.min(raw, t.targetMs);
    return { phase: 'hanging', hangStartedAt, elapsedMs, remainingMs: t.targetMs - elapsedMs, done: raw >= t.targetMs };
  }
  return { phase: 'hanging', hangStartedAt, elapsedMs: raw, remainingMs: null, done: false };
}

export interface HangStats {
  todayMs: number;
  todayCount: number;
  bestMs: number;
  last7: { date: string; ms: number }[];
}

export function hangStats(hangs: readonly Hang[], now: Date): HangStats {
  const byDay = new Map<string, number>();
  let bestMs = 0;
  for (const h of hangs) {
    const day = localDateString(new Date(h.startedAt));
    byDay.set(day, (byDay.get(day) ?? 0) + h.durationMs);
    bestMs = Math.max(bestMs, h.durationMs);
  }
  const today = localDateString(now);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const date = localDateString(d);
    return { date, ms: byDay.get(date) ?? 0 };
  });
  return {
    todayMs: byDay.get(today) ?? 0,
    todayCount: hangs.filter((h) => localDateString(new Date(h.startedAt)) === today).length,
    bestMs,
    last7,
  };
}

export function formatHangDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

function toHang(r: any): Hang {
  return { id: r.id, startedAt: r.started_at, durationMs: r.duration_ms, mode: r.mode, targetMs: r.target_ms ?? null };
}

/** Recent hangs, newest first. Filters by owner explicitly (house rule for own-data reads). */
export async function fetchHangs(limit = 500): Promise<Hang[]> {
  const me = (await supabase.auth.getSession()).data.session?.user.id;
  if (!me) throw new Error('Sign in to see your hangs.');
  const { data, error } = await supabase
    .from('hangs')
    .select('id, started_at, duration_ms, mode, target_ms')
    .eq('owner_id', me)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toHang);
}

export async function saveHang(h: { startedAt: number; durationMs: number; mode: HangMode; targetMs: number | null }): Promise<Hang> {
  const { data, error } = await supabase
    .from('hangs')
    .insert({ started_at: new Date(h.startedAt).toISOString(), duration_ms: Math.round(h.durationMs), mode: h.mode, target_ms: h.targetMs })
    .select('id, started_at, duration_ms, mode, target_ms')
    .single();
  if (error) throw new Error(error.message);
  return toHang(data);
}

export async function deleteHang(id: string): Promise<void> {
  const { error } = await supabase.from('hangs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
