// apps/mobile/lib/library.test.ts
import {
  dedupeGlobalByName, deleteCustomExercise, facetValues, toLibrary, filterLibrary, movementPatternFor, parseTagList, EMPTY_FILTER,
  type CustomExerciseInput, type LibraryExercise,
} from './library';

jest.mock('./supabase', () => ({ supabase: { from: jest.fn(), auth: { getSession: jest.fn() } } }));
import { supabase } from './supabase';

const ex = (o: Partial<LibraryExercise> & { id: string; name: string }): LibraryExercise => ({
  exerciseType: 'mobility_stretch', unilateral: false, defaultSets: null, bodyParts: [], equipment: [],
  isMine: false, cue: null, demoVideoUrl: null, ...o,
});
const list = [
  ex({ id: '1', name: 'Couch Stretch', bodyParts: ['hips', 'quads'] }),
  ex({ id: '2', name: 'Banded Ankle Distraction', exerciseType: 'balance', bodyParts: ['ankle'], equipment: ['band'] }),
  ex({ id: '3', name: 'My Neck Thing', bodyParts: ['neck'], isMine: true }),
];

test('filterLibrary: query is case-insensitive and results are sorted', () => {
  expect(filterLibrary(list, { ...EMPTY_FILTER, query: ' COUCH ' }).map((e) => e.id)).toEqual(['1']);
  expect(filterLibrary(list, EMPTY_FILTER).map((e) => e.id)).toEqual(['2', '1', '3']);
});

test('filterLibrary: chips are AND-ed with the query and each other', () => {
  expect(filterLibrary(list, { ...EMPTY_FILTER, bodyPart: 'ankle', equipment: 'band' }).map((e) => e.id)).toEqual(['2']);
  expect(filterLibrary(list, { ...EMPTY_FILTER, bodyPart: 'ankle', exerciseType: 'mobility_stretch' })).toEqual([]);
  expect(filterLibrary(list, { ...EMPTY_FILTER, query: 'neck', mineOnly: true }).map((e) => e.id)).toEqual(['3']);
  expect(filterLibrary(list, { ...EMPTY_FILTER, query: 'couch', mineOnly: true })).toEqual([]);
});

test('an old gym exercise name finds nothing in a mobility-only library', () => {
  expect(filterLibrary(list, { ...EMPTY_FILTER, query: 'bench press' })).toEqual([]);
});

test('facetValues are unique and sorted', () => {
  expect(facetValues([...list, ex({ id: '4', name: 'X', bodyParts: ['hips'], equipment: ['band', 'wall'] })])).toEqual({
    bodyParts: ['ankle', 'hips', 'neck', 'quads'],
    types: ['balance', 'mobility_stretch'],
    equipment: ['band', 'wall'],
  });
});

const input = (o: Partial<CustomExerciseInput>): CustomExerciseInput => ({
  name: 'x', exerciseType: 'strength', unilateral: false, bodyParts: [], equipment: [], description: null, demoVideoUrl: null, ...o,
});

test('movementPatternFor maps exercise type to a legal movement_pattern', () => {
  expect(movementPatternFor(input({ exerciseType: 'mobility_stretch' }))).toBe('mobility');
  expect(movementPatternFor(input({ exerciseType: 'balance' }))).toBe('balance');
  expect(movementPatternFor(input({ exerciseType: 'strength' }))).toBe('push');
  expect(movementPatternFor(input({ exerciseType: 'strength', movementPattern: 'hinge' }))).toBe('hinge');
  expect(movementPatternFor(input({ exerciseType: 'plyometric' }))).toBe('squat');
  expect(movementPatternFor(input({ exerciseType: 'cardio' }))).toBe('core');
  // A stale pattern from a previously selected type must not leak into fixed-mapping types.
  expect(movementPatternFor(input({ exerciseType: 'balance', movementPattern: 'pull' }))).toBe('balance');
});

test('parseTagList trims, lowercases, de-duplicates', () => {
  expect(parseTagList(' Band, WALL ,band,, ')).toEqual(['band', 'wall']);
});

function deleteChain(result: any) {
  const c: any = {};
  c.delete = jest.fn(() => c);
  c.eq = jest.fn(() => Promise.resolve(result));
  return c;
}

test('deleteCustomExercise maps FK violation 23503 to a clear message', async () => {
  (supabase.from as jest.Mock).mockReturnValueOnce(deleteChain({ error: { code: '23503', message: 'fk' } }));
  await expect(deleteCustomExercise('e1')).rejects.toThrow("can't be deleted");
});

test('deleteCustomExercise passes other errors through and resolves on success', async () => {
  (supabase.from as jest.Mock).mockReturnValueOnce(deleteChain({ error: { code: '42501', message: 'denied' } }));
  await expect(deleteCustomExercise('e1')).rejects.toThrow('denied');
  (supabase.from as jest.Mock).mockReturnValueOnce(deleteChain({ error: null }));
  await expect(deleteCustomExercise('e1')).resolves.toBeUndefined();
});


test('toLibrary: the short text is the cue, never the long description or rationale', () => {
  const r = { id: 'a', name: 'X', cue: 'Tuck your chin.', description: 'long how-to', evidence_rationale: 'why', owner_id: null };
  expect(toLibrary(r, 'me').cue).toBe('Tuck your chin.');
  expect(toLibrary({ ...r, cue: null }, 'me').cue).toBeNull();
  expect(toLibrary({ ...r, cue: null, owner_id: 'me' }, 'me').cue).toBe('long how-to');
});

test('dedupeGlobalByName keeps one global row per name, preferring sprint-pool rows, and never drops my own', () => {
  const rows = [
    ex({ id: 'old', name: 'Dead Bug' }),
    ex({ id: 'new', name: 'Dead Bug' }),
    ex({ id: 'b', name: 'Bird Dog' }),
    ex({ id: 'mine', name: 'dead bug', isMine: true }),
  ];
  const out = dedupeGlobalByName(rows, new Set(['new']));
  expect(out.map((e) => e.id).sort()).toEqual(['b', 'mine', 'new']);
});
