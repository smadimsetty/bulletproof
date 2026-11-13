// supabase/functions/sprint-coach/validate.ts
//
// Validates Claude's JSON for the three coach triggers against what the rules
// allow (spec 2026-11-12 §5.4). Anything out of range is clamped or dropped; a
// wrong top-level shape returns null and the rules apply on their own.
// No imports: jest tests this file directly from apps/mobile.

export interface CoachContext {
  trigger: 'start' | 'pain' | 'retest';
  slotKeys: string[];
  allowedExerciseIdsBySlot: Record<string, string[]>;
  maxLevelBySlot: Record<string, number>;
  defaultLevelBySlot: Record<string, number>;
  painPointIds: string[];
}
export interface StartOutput {
  summary: string;
  slots: { slot_key: string; priority_delta: -1 | 0 | 1; start_level: number; prefer: string[]; avoid: string[] }[];
}
export interface PainOutput {
  slots: { slot_key: string; level: number; prefer: string[]; avoid: string[]; note: string }[];
}
export interface RetestOutput {
  choice: 'stay' | 'switch';
  reason: string;
  suggested_pain_point_id: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function ids(v: unknown, allowed: readonly string[] | undefined): string[] {
  if (!Array.isArray(v) || !allowed) return [];
  const ok = new Set(allowed);
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && ok.has(x)))];
}

/** Known slot entries, first occurrence per slot_key. */
function slotEntries(raw: unknown, ctx: CoachContext): Record<string, unknown>[] | null {
  if (!Array.isArray(raw)) return null;
  const known = new Set(ctx.slotKeys);
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const s of raw) {
    if (!isObj(s) || typeof s.slot_key !== 'string' || !known.has(s.slot_key) || seen.has(s.slot_key)) continue;
    seen.add(s.slot_key);
    out.push(s);
  }
  return out;
}

export function validateStart(raw: unknown, ctx: CoachContext): StartOutput | null {
  if (!isObj(raw) || typeof raw.summary !== 'string') return null;
  const entries = slotEntries(raw.slots, ctx);
  if (!entries) return null;
  return {
    summary: text(raw.summary, 400),
    slots: entries.map((s) => {
      const key = s.slot_key as string;
      const max = Math.max(1, ctx.maxLevelBySlot[key] ?? 1);
      const def = clamp(ctx.defaultLevelBySlot[key] ?? 1, 1, max);
      const level = clamp(num(s.start_level, def), Math.max(1, def - 1), Math.min(max, def + 1));
      return {
        slot_key: key,
        priority_delta: clamp(num(s.priority_delta, 0), -1, 1) as -1 | 0 | 1,
        start_level: level,
        prefer: ids(s.prefer, ctx.allowedExerciseIdsBySlot[key]),
        avoid: ids(s.avoid, ctx.allowedExerciseIdsBySlot[key]),
      };
    }),
  };
}

export function validatePain(
  raw: unknown,
  ctx: CoachContext,
  currentLevelBySlot: Record<string, number>,
): PainOutput | null {
  if (!isObj(raw)) return null;
  const entries = slotEntries(raw.slots, ctx);
  if (!entries) return null;
  return {
    slots: entries.map((s) => {
      const key = s.slot_key as string;
      const current = Math.max(1, currentLevelBySlot[key] ?? ctx.defaultLevelBySlot[key] ?? 1);
      return {
        slot_key: key,
        // Pain never raises a level: a raise is clamped to the current level.
        level: clamp(num(s.level, current), 1, current),
        prefer: ids(s.prefer, ctx.allowedExerciseIdsBySlot[key]),
        avoid: ids(s.avoid, ctx.allowedExerciseIdsBySlot[key]),
        note: text(s.note, 160),
      };
    }),
  };
}

export function validateRetest(raw: unknown, ctx: CoachContext): RetestOutput | null {
  if (!isObj(raw) || (raw.choice !== 'stay' && raw.choice !== 'switch')) return null;
  const suggested =
    raw.choice === 'switch' && typeof raw.suggested_pain_point_id === 'string' && ctx.painPointIds.includes(raw.suggested_pain_point_id)
      ? raw.suggested_pain_point_id
      : null;
  return { choice: raw.choice, reason: text(raw.reason, 400), suggested_pain_point_id: suggested };
}
