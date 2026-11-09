// apps/mobile/lib/social/notificationFormat.test.ts
import { notificationRoute, notificationText, safePushRoute } from './notificationFormat';

describe('notificationText', () => {
  it('names the actor', () => {
    expect(notificationText('like', 'ana')).toBe('@ana liked your workout');
    expect(notificationText('follow_request', null)).toBe('Someone wants to follow you');
  });
});

describe('notificationRoute', () => {
  it('matches the push payload paths', () => {
    expect(notificationRoute({ kind: 'like', actorId: 'a', workoutId: 'w' })).toBe('/workout-summary/w');
    expect(notificationRoute({ kind: 'comment', actorId: 'a', workoutId: 'w' })).toBe('/workout-summary/w');
    expect(notificationRoute({ kind: 'new_follower', actorId: 'a', workoutId: null })).toBe('/profile/a');
    expect(notificationRoute({ kind: 'follow_request', actorId: 'a', workoutId: null })).toBe('/inbox');
  });
  it('is null without a target', () => {
    expect(notificationRoute({ kind: 'like', actorId: 'a', workoutId: null })).toBeNull();
  });
});

describe('safePushRoute', () => {
  it('allows only known in-app paths', () => {
    expect(safePushRoute('/inbox')).toBe('/inbox');
    expect(safePushRoute('/profile/abc-123')).toBe('/profile/abc-123');
    expect(safePushRoute('/workout-summary/abc')).toBe('/workout-summary/abc');
    expect(safePushRoute('https://evil.example')).toBeNull();
    expect(safePushRoute('/settings')).toBeNull();
    expect(safePushRoute(42)).toBeNull();
  });
});
