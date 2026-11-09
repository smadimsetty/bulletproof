// apps/mobile/lib/localDate.ts
//
// Local calendar date (YYYY-MM-DD) in the device's current timezone --
// matches Postgres `date` column semantics (a single day, not a UTC-anchored
// instant). Moved here from the removed HealthKit read-sync mapping module.
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
