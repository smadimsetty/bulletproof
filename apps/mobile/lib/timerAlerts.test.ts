const mockSchedule = jest.fn();
const mockCancel = jest.fn();
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancel(...a),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => {
    throw new Error('no native audio');
  }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));

import { setAudioModeAsync } from 'expo-audio';
import {
  cancelTimerEndNotification, initTimerAudio, isTimerEndFresh, playTimerEnd, scheduleTimerEndNotification,
} from './timerAlerts';

beforeEach(() => {
  mockSchedule.mockReset();
  mockCancel.mockReset();
});

describe('timerAlerts', () => {
  it('schedules a date trigger at endsAtMs and returns the id', async () => {
    mockSchedule.mockResolvedValue('abc');
    const at = Date.now() + 30_000;
    expect(await scheduleTimerEndNotification(at, "Rest's over.")).toBe('abc');
    const arg = mockSchedule.mock.calls[0][0];
    expect(arg.trigger).toEqual({ type: 'date', date: new Date(at) });
    expect(arg.content.body).toBe("Rest's over.");
    expect(arg.content.data.kind).toBe('timer_end');
  });

  it('returns null without scheduling when the time has passed', async () => {
    expect(await scheduleTimerEndNotification(Date.now() - 1, 'x')).toBeNull();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('returns null if scheduling throws', async () => {
    mockSchedule.mockRejectedValue(new Error('denied'));
    expect(await scheduleTimerEndNotification(Date.now() + 5000, 'x')).toBeNull();
  });

  it('cancel(null) is a no-op and cancel(id) cancels', async () => {
    await cancelTimerEndNotification(null);
    expect(mockCancel).not.toHaveBeenCalled();
    await cancelTimerEndNotification('abc');
    expect(mockCancel).toHaveBeenCalledWith('abc');
  });

  it('sets silent-mode playback with ducking', async () => {
    await initTimerAudio();
    expect(setAudioModeAsync).toHaveBeenCalledWith({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  });

  it('playTimerEnd never throws', () => {
    expect(() => playTimerEnd()).not.toThrow();
  });
});

describe('isTimerEndFresh', () => {
  test('a deadline that just passed still beeps', () => {
    expect(isTimerEndFresh(10_000, 10_250)).toBe(true);
    expect(isTimerEndFresh(10_000, 12_000)).toBe(true);
  });
  test('a deadline found after a suspension does not (the notification already sounded)', () => {
    expect(isTimerEndFresh(10_000, 12_001)).toBe(false);
    expect(isTimerEndFresh(10_000, 70_000)).toBe(false);
  });
});
