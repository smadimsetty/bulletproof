import { filterExercises, type CatalogExercise } from './exerciseSearch';

const ex = (id: string, name: string, exerciseType: string | null): CatalogExercise => ({ id, name, exerciseType, unilateral: false, defaultSets: null });
const list = [ex('1', 'Couch Stretch', 'mobility_stretch'), ex('2', 'Nordic Hamstring Curl', 'strength'), ex('3', 'Single-Leg Balance', 'balance')];

test('empty query + no type returns all, sorted by name', () => {
  expect(filterExercises(list, '', null).map((e) => e.id)).toEqual(['1', '2', '3']);
});
test('case-insensitive substring', () => {
  expect(filterExercises(list, 'HAM', null).map((e) => e.id)).toEqual(['2']);
});
test('type filter combines with query', () => {
  expect(filterExercises(list, 'e', 'balance').map((e) => e.id)).toEqual(['3']);
});
test('trims query', () => {
  expect(filterExercises(list, '  couch ', null).map((e) => e.id)).toEqual(['1']);
});
