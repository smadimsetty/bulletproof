// apps/mobile/lib/library.ts
//
// The mobility-first exercise library: global mobility content plus the
// user's own custom exercises. Old gym rows stay readable (past workouts must
// still render) but are deliberately never offered for browse/search/pick.
import { eyeCue } from './exerciseCue';
import { supabase } from './supabase';

export interface LibraryExercise {
  id: string;
  name: string;
  exerciseType: string | null;
  unilateral: boolean;
  defaultSets: number | null;
  bodyParts: string[];
  equipment: string[];
  isMine: boolean;
  /** One-line cue (custom exercises: their own description). */
  cue: string | null;
  demoVideoUrl: string | null;
}

export interface LibraryFilter {
  query: string;
  bodyPart: string | null;
  exerciseType: string | null;
  equipment: string | null;
  mineOnly: boolean;
}

export const EMPTY_FILTER: LibraryFilter = { query: '', bodyPart: null, exerciseType: null, equipment: null, mineOnly: false };

export type CustomExerciseType = 'strength' | 'mobility_stretch' | 'plyometric' | 'balance' | 'cardio';

export const MOVEMENT_PATTERNS = ['squat', 'hinge', 'push', 'pull', 'core', 'mobility', 'balance'] as const;

export interface CustomExerciseInput {
  name: string;
  exerciseType: CustomExerciseType;
  unilateral: boolean;
  bodyParts: string[];
  equipment: string[];
  description: string | null;
  demoVideoUrl: string | null;
  movementPattern?: string;
}

const LIBRARY_COLUMNS =
  'id, name, exercise_type, unilateral, default_sets, body_parts, equipment_needed, owner_id, description, cue, demo_video_url';

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function toLibrary(r: any, myId: string | null): LibraryExercise {
  return {
    id: r.id,
    name: r.name,
    exerciseType: r.exercise_type ?? null,
    unilateral: !!r.unilateral,
    defaultSets: r.default_sets ?? null,
    bodyParts: r.body_parts ?? [],
    equipment: r.equipment_needed ?? [],
    isMine: !!r.owner_id && r.owner_id === myId,
    cue: eyeCue(r),
    demoVideoUrl: r.demo_video_url ?? null,
  };
}

async function currentUserId(): Promise<string> {
  // getSession reads the persisted session; no network round trip.
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Sign in to manage custom exercises.');
  return id;
}

export async function fetchLibrary(): Promise<LibraryExercise[]> {
  const { data: pool, error: poolError } = await supabase.from('sprint_exercise_pool').select('exercise_id');
  check(poolError);
  const poolIds = Array.from(new Set(((pool ?? []) as any[]).map((p) => p.exercise_id as string)));
  const mobilityClauses = [
    ...(poolIds.length > 0 ? [`id.in.(${poolIds.join(',')})`] : []),
    'exercise_type.in.(mobility_stretch,balance)',
    'is_corrective.eq.true',
  ].join(',');

  const myId = (await supabase.auth.getSession()).data.session?.user.id ?? null;
  if (!myId) throw new Error('Sign in to see exercises.');
  const [globalRes, mineRes] = await Promise.all([
    supabase.from('exercises').select(LIBRARY_COLUMNS).is('owner_id', null).or(mobilityClauses),
    // RLS also exposes other users' custom exercises that appear in workouts I
    // can read (stage 3), so filter to mine explicitly.
    supabase.from('exercises').select(LIBRARY_COLUMNS).eq('owner_id', myId),
  ]);
  check(globalRes.error);
  check(mineRes.error);
  const byId = new Map<string, LibraryExercise>();
  for (const r of [...((globalRes.data ?? []) as any[]), ...((mineRes.data ?? []) as any[])]) {
    byId.set(r.id, toLibrary(r, myId));
  }
  return dedupeGlobalByName(Array.from(byId.values()), new Set(poolIds)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A few global exercises exist twice (older rows plus the same move re-seeded as sprint
 * content). Show one per name, preferring the row the sprints use. My own exercises are
 * never dropped.
 */
export function dedupeGlobalByName(list: readonly LibraryExercise[], poolIds: ReadonlySet<string>): LibraryExercise[] {
  const keep = new Map<string, LibraryExercise>();
  const mine: LibraryExercise[] = [];
  for (const e of list) {
    if (e.isMine) {
      mine.push(e);
      continue;
    }
    const key = e.name.trim().toLowerCase();
    const seen = keep.get(key);
    if (!seen || (!poolIds.has(seen.id) && poolIds.has(e.id))) keep.set(key, e);
  }
  return [...keep.values(), ...mine];
}

export function filterLibrary(list: readonly LibraryExercise[], f: LibraryFilter): LibraryExercise[] {
  const q = f.query.trim().toLowerCase();
  return list
    .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
    .filter((e) => (f.bodyPart ? e.bodyParts.includes(f.bodyPart) : true))
    .filter((e) => (f.exerciseType ? e.exerciseType === f.exerciseType : true))
    .filter((e) => (f.equipment ? e.equipment.includes(f.equipment) : true))
    .filter((e) => (f.mineOnly ? e.isMine : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function facetValues(list: readonly LibraryExercise[]): { bodyParts: string[]; types: string[]; equipment: string[] } {
  return {
    bodyParts: sortedUnique(list.flatMap((e) => e.bodyParts)),
    types: sortedUnique(list.flatMap((e) => (e.exerciseType ? [e.exerciseType] : []))),
    equipment: sortedUnique(list.flatMap((e) => e.equipment)),
  };
}

/** movement_pattern is NOT NULL on exercises; see the stage 2 plan for the mapping. */
export function movementPatternFor(input: CustomExerciseInput): string {
  switch (input.exerciseType) {
    case 'mobility_stretch':
      return 'mobility';
    case 'balance':
      return 'balance';
    case 'plyometric':
      return input.movementPattern ?? 'squat';
    case 'cardio':
      return 'core';
    default:
      // Strength and plyometric let the user choose (the form offers all 7 values).
      return input.movementPattern ?? 'push';
  }
}

function toRow(input: CustomExerciseInput) {
  return {
    name: input.name.trim(),
    exercise_type: input.exerciseType,
    movement_pattern: movementPatternFor(input),
    unilateral: input.unilateral,
    body_parts: input.bodyParts,
    equipment_needed: input.equipment,
    description: input.description?.trim() || null,
    demo_video_url: input.demoVideoUrl?.trim() || null,
  };
}

export async function createCustomExercise(input: CustomExerciseInput): Promise<string> {
  // No column default for owner_id (global seeds must stay global), so it is explicit.
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from('exercises')
    .insert({ ...toRow(input), owner_id: ownerId })
    .select('id')
    .single();
  check(error);
  return (data as any).id;
}

export async function updateCustomExercise(id: string, input: CustomExerciseInput): Promise<void> {
  const { error } = await supabase.from('exercises').update(toRow(input)).eq('id', id);
  check(error);
}

export async function deleteCustomExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error?.code === '23503') {
    throw new Error("This exercise is used in your history or a routine, so it can't be deleted.");
  }
  check(error);
}

// A one-shot channel from the "+ Create exercise" form back to the logger /
// routine editor: expo-router has no return values, so the form leaves the
// new id here and the opener takes it on focus.
let pendingPickedExerciseId: string | null = null;

export function setPendingPickedExercise(id: string | null): void {
  pendingPickedExerciseId = id;
}

export function takePendingPickedExercise(): string | null {
  const id = pendingPickedExerciseId;
  pendingPickedExerciseId = null;
  return id;
}

/** Parses a comma-separated text field into trimmed, lowercased, unique values. */
export function parseTagList(text: string): string[] {
  return Array.from(new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)));
}

/** Loads one of the user's custom exercises into form shape (for editing). */
export async function fetchCustomExercise(id: string): Promise<CustomExerciseInput> {
  const { data, error } = await supabase
    .from('exercises')
    .select('name, exercise_type, movement_pattern, unilateral, body_parts, equipment_needed, description, demo_video_url')
    .eq('id', id)
    .single();
  check(error);
  const r: any = data;
  return {
    name: r.name,
    exerciseType: r.exercise_type ?? 'strength',
    unilateral: !!r.unilateral,
    bodyParts: r.body_parts ?? [],
    equipment: r.equipment_needed ?? [],
    description: r.description ?? null,
    demoVideoUrl: r.demo_video_url ?? null,
    movementPattern: r.movement_pattern,
  };
}

/** Form validation; returns the first problem or null. */
export function validateCustomExercise(input: CustomExerciseInput): string | null {
  const name = input.name.trim();
  if (!name) return 'Give the exercise a name.';
  if (name.length > 80) return 'Keep the name to 80 characters or fewer.';
  const url = input.demoVideoUrl?.trim();
  if (url && !url.startsWith('https://')) return 'The demo link must start with https://';
  return null;
}
