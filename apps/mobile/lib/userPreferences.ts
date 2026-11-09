// Small standalone read of the weight unit needed outside Settings (which
// loads the full profile row itself). Delegates to user_settings, which now
// owns the unit; Settings also keeps user_profile.weight_unit in sync.
import { fetchUserSettings } from './userSettings';
import type { WeightUnit } from './units';

export async function fetchWeightUnit(): Promise<WeightUnit> {
  return (await fetchUserSettings()).weightUnit;
}
