export interface CatalogExercise {
  readonly id: string;
  readonly name: string;
  readonly exerciseType: string | null;
  readonly unilateral: boolean;
  readonly defaultSets: number | null;
}

export function filterExercises(list: readonly CatalogExercise[], query: string, type: string | null): CatalogExercise[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((e) => (type ? e.exerciseType === type : true))
    .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}
