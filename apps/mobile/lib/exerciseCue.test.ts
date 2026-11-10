import { eyeCue } from './exerciseCue';

test('uses the cue; custom exercises fall back to their description; global without cue is null', () => {
  expect(eyeCue({ cue: 'Tuck your chin.', description: 'long', owner_id: null })).toBe('Tuck your chin.');
  expect(eyeCue({ cue: null, description: 'mine', owner_id: 'u1' })).toBe('mine');
  expect(eyeCue({ cue: null, description: 'long', owner_id: null })).toBeNull();
  expect(eyeCue(null)).toBeNull();
});
