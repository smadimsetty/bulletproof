// apps/mobile/lib/userSettings.ts
//
// One user_settings row per user, created lazily on first write. A missing
// row is normal (not an error): readers get DEFAULT_SETTINGS.
import { supabase } from './supabase';
import type { EquipmentTier } from './equipmentTiers';
import type { WeightUnit } from './units';
import type { TimeRange } from './engine/dayPlanner';

export type Visibility = 'private' | 'followers' | 'public';

export interface UserSettings {
  weightUnit: WeightUnit;
  weeklyGoal: number;
  defaultVisibility: Visibility;
  healthkitWriteEnabled: boolean;
  notifyFollows: boolean;
  notifyLikes: boolean;
  notifyComments: boolean;
  /** Moderators only: push for new content reports. */
  notifyReports: boolean;
  equipmentTier: EquipmentTier | null;
  /** Target minutes per sprint day; null = not asked yet (planner assumes 10-20). */
  dailyTimeRange: TimeRange | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  weightUnit: 'lbs',
  weeklyGoal: 3,
  defaultVisibility: 'followers',
  healthkitWriteEnabled: false,
  notifyFollows: true,
  notifyLikes: true,
  notifyComments: true,
  notifyReports: true,
  equipmentTier: null,
  dailyTimeRange: null,
};

const COLUMNS =
  'weight_unit, weekly_goal, default_visibility, healthkit_write_enabled, notify_follows, notify_likes, notify_comments, notify_reports, equipment_tier, daily_time_range';

function fromRow(r: any): UserSettings {
  return {
    weightUnit: r.weight_unit,
    weeklyGoal: r.weekly_goal,
    defaultVisibility: r.default_visibility,
    healthkitWriteEnabled: r.healthkit_write_enabled,
    notifyFollows: r.notify_follows,
    notifyLikes: r.notify_likes,
    notifyComments: r.notify_comments,
    notifyReports: r.notify_reports ?? true,
    equipmentTier: r.equipment_tier ?? null,
    dailyTimeRange: r.daily_time_range ?? null,
  };
}

const COLUMN_BY_KEY: Record<keyof UserSettings, string> = {
  weightUnit: 'weight_unit',
  weeklyGoal: 'weekly_goal',
  defaultVisibility: 'default_visibility',
  healthkitWriteEnabled: 'healthkit_write_enabled',
  notifyFollows: 'notify_follows',
  notifyLikes: 'notify_likes',
  notifyComments: 'notify_comments',
  notifyReports: 'notify_reports',
  equipmentTier: 'equipment_tier',
  dailyTimeRange: 'daily_time_range',
};

export async function fetchUserSettings(): Promise<UserSettings> {
  const { data, error } = await supabase.from('user_settings').select(COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : DEFAULT_SETTINGS;
}

export async function updateUserSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof UserSettings)[]) {
    if (patch[key] !== undefined) row[COLUMN_BY_KEY[key]] = patch[key];
  }
  // owner_id defaults to auth.uid() on insert; onConflict makes the same call
  // an update once the row exists.
  const { data, error } = await supabase
    .from('user_settings')
    .upsert(row, { onConflict: 'owner_id' })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}
