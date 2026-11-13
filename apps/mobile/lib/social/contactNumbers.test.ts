// apps/mobile/lib/social/contactNumbers.test.ts
import { MAX_NUMBERS, normalizeNumbers, regionFromLocale, toE164 } from './contactNumbers';

test('normalises US formats to one E.164 number and drops duplicates', () => {
  expect(normalizeNumbers(['(732) 524-8928', '+1 732-524-8928', '732.524.8928'], 'US')).toEqual(['+17325248928']);
});

test('keeps numbers that already carry another country code', () => {
  expect(normalizeNumbers(['+44 7911 123456', '+91 98765 43210'], 'US')).toEqual(['+447911123456', '+919876543210']);
});

test('reads local numbers in the device region', () => {
  expect(normalizeNumbers(['07911 123456'], 'GB')).toEqual(['+447911123456']);
});

test('drops junk and short codes', () => {
  expect(normalizeNumbers(['', 'abc', '911', '12345'], 'US')).toEqual([]);
});

test('caps how many numbers are sent', () => {
  const many = Array.from({ length: MAX_NUMBERS + 50 }, (_, i) => `+1 202 555 ${String(1000 + i).slice(-4)}`.replace(/ (\d{4})$/, ` ${String(i % 10000).padStart(4, '0')}`));
  expect(normalizeNumbers(many, 'US').length).toBeLessThanOrEqual(MAX_NUMBERS);
});

test('toE164 for the number a user types, or null', () => {
  expect(toE164('732 524 8928', 'US')).toBe('+17325248928');
  expect(toE164('12', 'US')).toBeNull();
});

test('regionFromLocale', () => {
  expect(regionFromLocale('en-US')).toBe('US');
  expect(regionFromLocale('en-GB')).toBe('GB');
  expect(regionFromLocale('en')).toBe('US');
  expect(regionFromLocale(undefined)).toBe('US');
});
