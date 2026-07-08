// Weight-unit conversion. exercise_logs.weight_kg and user_profile.weight_kg
// are always stored in kg (the canonical unit) -- conversion only ever
// happens at the display/input boundary, driven by user_profile.weight_unit.
export type WeightUnit = 'kg' | 'lbs';

const KG_PER_LB = 0.45359237;

export function kgToDisplayUnit(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kg / KG_PER_LB : kg;
}

export function displayUnitToKg(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value * KG_PER_LB : value;
}

export function formatWeightForDisplay(kg: number | null, unit: WeightUnit): string {
  if (kg == null) return '';
  return String(Math.round(kgToDisplayUnit(kg, unit) * 10) / 10);
}
