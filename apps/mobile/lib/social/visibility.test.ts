// apps/mobile/lib/social/visibility.test.ts
import { initialVisibility } from './visibility';

describe('initialVisibility', () => {
  it('sprint workouts default to private whatever the setting', () => {
    expect(initialVisibility(true, 'followers', true)).toBe('private');
    expect(initialVisibility(true, 'public', true)).toBe('private');
  });
  it('other workouts use the user default', () => {
    expect(initialVisibility(false, 'followers', false)).toBe('followers');
    expect(initialVisibility(false, 'private', false)).toBe('private');
    expect(initialVisibility(false, 'public', true)).toBe('public');
  });
  it('a public default degrades to followers when the profile is private', () => {
    expect(initialVisibility(false, 'public', false)).toBe('followers');
  });
});
