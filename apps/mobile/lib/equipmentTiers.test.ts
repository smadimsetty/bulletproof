import { requiredTier, tierAllows, EQUIPMENT_TIER_OPTIONS } from './equipmentTiers';

test('requiredTier', () => {
  expect(requiredTier([])).toBe('basic');
  expect(requiredTier(null)).toBe('basic');
  expect(requiredTier(['wall'])).toBe('basic');
  expect(requiredTier(['resistance_band', 'wall'])).toBe('intermediate');
  expect(requiredTier(['cable_machine'])).toBe('advanced');
  expect(requiredTier(['mystery'])).toBe('advanced');
  expect(requiredTier(['wall', 'bench', 'cable_machine'])).toBe('advanced');
});

test('tierAllows', () => {
  expect(tierAllows(null, 'advanced')).toBe(true);
  expect(tierAllows('basic', 'intermediate')).toBe(false);
  expect(tierAllows('advanced', 'basic')).toBe(true);
  expect(tierAllows('intermediate', 'intermediate')).toBe(true);
});

test('options', () => {
  expect(EQUIPMENT_TIER_OPTIONS.map((o) => o.title)).toEqual(['Basic', 'Intermediate', 'Advanced']);
});

test('a Nordic curl anchor (partner_or_bench) is not bodyweight-only', () => {
  expect(requiredTier(['bodyweight', 'partner_or_bench'])).toBe('intermediate');
});
