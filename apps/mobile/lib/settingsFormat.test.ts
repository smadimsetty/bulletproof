// apps/mobile/lib/settingsFormat.test.ts
import { accountLabel, canConfirmDelete } from './settingsFormat';

describe('accountLabel', () => {
  it('names the sign-in method', () => {
    expect(accountLabel('apple', 'x@y.z')).toBe('Signed in with Apple');
    expect(accountLabel('email', 'x@y.z')).toBe('Signed in as x@y.z');
    expect(accountLabel(undefined, undefined)).toBe('Signed in');
  });
});

describe('canConfirmDelete', () => {
  it('requires DELETE exactly', () => {
    expect(canConfirmDelete('DELETE')).toBe(true);
    expect(canConfirmDelete(' DELETE ')).toBe(true);
    expect(canConfirmDelete('delete')).toBe(false);
    expect(canConfirmDelete('')).toBe(false);
  });
});
