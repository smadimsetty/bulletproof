// apps/mobile/lib/social/imageSizing.test.ts
import { avatarPath, resizeTarget, workoutMediaPath } from './imageSizing';

describe('resizeTarget', () => {
  it('scales the long edge down to the max, keeping aspect', () => {
    expect(resizeTarget(4000, 3000, 1080)).toEqual({ width: 1080, height: 810 });
    expect(resizeTarget(3000, 4000, 1080)).toEqual({ width: 810, height: 1080 });
  });
  it('never upscales', () => {
    expect(resizeTarget(800, 600, 1080)).toEqual({ width: 800, height: 600 });
  });
});

describe('paths', () => {
  it('start with the owner folder (storage RLS depends on it)', () => {
    expect(workoutMediaPath('u1', 'w1', 'x')).toBe('u1/w1/x.jpg');
    expect(avatarPath('u1', 'x')).toBe('u1/x.jpg');
  });
});
