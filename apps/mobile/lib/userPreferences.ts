// Small standalone reads of user_profile fields needed outside Settings
// (which loads the full profile row itself). Kept as single-column
// selects rather than growing Settings' own fetch into a shared
// context/store -- Logger only ever needs the unit, not the whole profile.
import { supabase } from './supabase';
import type { WeightUnit } from './units';

export async function fetchWeightUnit(): Promise<WeightUnit> {
  const { data, error } = await supabase.from('user_profile').select('weight_unit').single();
  if (error) {
    throw new Error(error.message);
  }
  return (data as { weight_unit: WeightUnit } | null)?.weight_unit ?? 'lbs';
}
