// apps/mobile/lib/bodyParts.ts
const LABELS: Record<string, string> = {
  ankles: 'Ankles', ankle: 'Ankles',
  feet: 'Feet',
  knees: 'Knees',
  hips: 'Hips', hip: 'Hips',
  hamstrings: 'Hamstrings', hamstring: 'Hamstrings',
  lower_back: 'Lower back', lumbar_spine: 'Lower back',
  thoracic_spine: 'Upper back',
  neck: 'Neck',
  shoulders: 'Shoulders', shoulder: 'Shoulders',
  elbows: 'Elbows',
  wrists: 'Wrists',
};

export function bodyPartLabel(key: string): string {
  const known = LABELS[key];
  if (known) return known;
  const words = key.split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
