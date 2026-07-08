// apps/mobile/lib/units.test.ts
import { displayUnitToKg, formatWeightForDisplay, kgToDisplayUnit } from './units';

describe('kgToDisplayUnit', () => {
  test('passes kg through unchanged', () => {
    expect(kgToDisplayUnit(100, 'kg')).toBe(100);
  });

  test('converts kg to lbs', () => {
    expect(kgToDisplayUnit(100, 'lbs')).toBeCloseTo(220.462, 2);
  });
});

describe('displayUnitToKg', () => {
  test('passes kg through unchanged', () => {
    expect(displayUnitToKg(100, 'kg')).toBe(100);
  });

  test('converts lbs to kg', () => {
    expect(displayUnitToKg(220.462, 'lbs')).toBeCloseTo(100, 1);
  });

  test('round-trips kg -> lbs -> kg', () => {
    const kg = 62.5;
    const lbs = kgToDisplayUnit(kg, 'lbs');
    expect(displayUnitToKg(lbs, 'lbs')).toBeCloseTo(kg, 5);
  });
});

describe('formatWeightForDisplay', () => {
  test('returns empty string for null', () => {
    expect(formatWeightForDisplay(null, 'lbs')).toBe('');
  });

  test('formats kg with one decimal, rounded', () => {
    expect(formatWeightForDisplay(62.53, 'kg')).toBe('62.5');
  });

  test('formats lbs converted from kg', () => {
    expect(formatWeightForDisplay(100, 'lbs')).toBe('220.5');
  });
});
