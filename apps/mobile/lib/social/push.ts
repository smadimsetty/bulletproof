// apps/mobile/lib/social/push.ts
//
// Expo push registration. Permission is requested at most once and only at a
// meaningful moment (after the first finished workout or first follow), never
// at launch. If it is already granted, registration is silent and just keeps
// the stored token fresh. Tokens live in push_tokens (own rows; a trigger
// moves a token to whoever registered it last).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { getMyId } from '../session';

// Storage keys keep the pre-rename '@bulletproof/' prefix on purpose: renaming them
// would silently reset this state for every existing install.
const ASKED_KEY = '@bulletproof/push-asked';
const TOKEN_KEY = '@bulletproof/push-token';

// Show pushes as banners while the app is open too.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // Logger timer-end alerts: the app already played the sound in the foreground, so no banner.
    const isTimerEnd = (notification.request.content.data as { kind?: string } | undefined)?.kind === 'timer_end';
    return {
      shouldShowBanner: !isTimerEnd,
      shouldShowList: !isTimerEnd,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

let registering = false;

/**
 * Registers this device for push. With `ask: true` it may show the permission
 * prompt (once, ever); with `ask: false` it only registers if already granted.
 * Never throws -- push is optional.
 */
export async function ensurePushRegistered(opts: { ask: boolean }): Promise<void> {
  if (registering || !Device.isDevice) return;
  registering = true;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      if (!opts.ask) return;
      const alreadyAsked = (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) === '1';
      if (alreadyAsked) return;
      await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
      perm = await Notifications.requestPermissionsAsync();
      if (perm.status !== 'granted') return;
    }
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await getMyId(); // signed in?
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { token, platform: Platform.OS === 'android' ? 'android' : 'ios', updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      );
    if (error) throw new Error(error.message);
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
  } catch (err) {
    console.warn('Push registration failed:', err);
  } finally {
    registering = false;
  }
}

/** Removes this device's token (call before signing out so the next user on this phone isn't pushed to). */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    console.warn('Push token cleanup failed:', err);
  }
}
