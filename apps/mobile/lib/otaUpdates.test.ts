jest.mock('expo-updates', () => ({ isEnabled: false }));

import { isSafeToReload, shouldCheckNow, MIN_CHECK_INTERVAL_MS } from './otaUpdates';

describe('isSafeToReload', () => {
  it('is safe on ordinary tabs with no workout running', () => {
    expect(isSafeToReload({ pathname: '/', hasActiveWorkout: false })).toBe(true);
    expect(isSafeToReload({ pathname: '/progress', hasActiveWorkout: false })).toBe(true);
    expect(isSafeToReload({ pathname: '/workout-summary/abc', hasActiveWorkout: false })).toBe(true);
  });
  it('never reloads during a workout, even off the logger', () => {
    expect(isSafeToReload({ pathname: '/progress', hasActiveWorkout: true })).toBe(false);
  });
  it('never reloads on the logger or the hang timer', () => {
    expect(isSafeToReload({ pathname: '/workout/abc', hasActiveWorkout: false })).toBe(false);
    expect(isSafeToReload({ pathname: '/hang', hasActiveWorkout: false })).toBe(false);
  });
});

describe('shouldCheckNow', () => {
  it('checks the first time and then at most every interval', () => {
    expect(shouldCheckNow(null, 1000)).toBe(true);
    expect(shouldCheckNow(1000, 1000 + MIN_CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(shouldCheckNow(1000, 1000 + MIN_CHECK_INTERVAL_MS)).toBe(true);
  });
});
