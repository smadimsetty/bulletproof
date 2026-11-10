// apps/mobile/lib/equipmentTiers.ts
//
// Equipment access tiers. An exercise's tier is the highest tier among its
// equipment keys; unknown keys count as advanced.
export type EquipmentTier = 'basic' | 'intermediate' | 'advanced';

const RANK: Record<EquipmentTier, number> = { basic: 0, intermediate: 1, advanced: 2 };

const BASIC = new Set([
  'none', 'bodyweight', 'wall', 'wall_or_couch', 'doorway', 'towel', 'step',
  'floor_markers', 'cone_or_marker', 'cones', 'cones_or_floor_markers', 'partner_or_bench',
]);

const INTERMEDIATE = new Set([
  'bench', 'dumbbell', 'bodyweight_or_dumbbell', 'light_barbell_or_dumbbell', 'light_plate',
  'resistance_band', 'pull_up_bar', 'foam_roller', 'foam_pad', 'balance_pad', 'yoga_mat',
  'strap', 'massage_ball', 'kettlebell', 'dumbbell_or_kettlebell', 'jump_rope', 'box',
  'plyo_box', 'wobble_board', 'medicine_ball',
]);

function tierOfKey(key: string): EquipmentTier {
  if (BASIC.has(key)) return 'basic';
  if (INTERMEDIATE.has(key)) return 'intermediate';
  return 'advanced';
}

export function requiredTier(equipment: readonly string[] | null | undefined): EquipmentTier {
  let best: EquipmentTier = 'basic';
  for (const key of equipment ?? []) {
    const t = tierOfKey(key);
    if (RANK[t] > RANK[best]) best = t;
  }
  return best;
}

/** A null user tier means no preference set: everything is allowed. */
export function tierAllows(userTier: EquipmentTier | null, required: EquipmentTier): boolean {
  if (userTier == null) return true;
  return RANK[userTier] >= RANK[required];
}

export const EQUIPMENT_TIER_OPTIONS: readonly { tier: EquipmentTier; title: string; subtitle: string }[] = [
  { tier: 'basic', title: 'Basic', subtitle: 'Nothing but your body' },
  { tier: 'intermediate', title: 'Intermediate', subtitle: 'A bench, light dumbbells, bands, a pull-up bar' },
  { tier: 'advanced', title: 'Advanced', subtitle: 'Full gym access' },
];
