// apps/mobile/lib/workoutActivityBridge.ts
//
// Drives the lock-screen/Dynamic Island Live Activity (widgets/WorkoutActivity.tsx)
// from the same subscribeToActiveSessionChanges signal app/_layout.tsx uses
// for the in-app banner -- both react to the exact same start/end/discard
// events regardless of which screen triggered them (Logger, Home's Start
// button, the ad-hoc flow). Deliberately NOT imported by sessionLifecycle.ts
// itself: that module is exercised by plain-Node Jest tests with no RN/Expo
// native-module shims, and expo-widgets requires a real iOS runtime. The
// require() below is lazy (inside the try/catch, only reached when actually
// invoked from _layout.tsx on a real device) so this file can be imported
// anywhere without risking a crash under Jest or on non-iOS platforms.
import { Platform } from 'react-native';
import { labelForSessionType } from './sessionTypeLabels';
import type { ActiveSessionRow } from './sessionLifecycle';

interface WorkoutActivityProps {
  readonly sessionTypeLabel: string;
  readonly startedAtLabel: string;
}

interface LiveActivityInstance {
  end(dismissalPolicy: 'default' | 'immediate', props: WorkoutActivityProps): void;
}

interface LiveActivityFactory {
  start(props: WorkoutActivityProps): LiveActivityInstance;
  getInstances(): readonly LiveActivityInstance[];
}

let currentActivity: LiveActivityInstance | null = null;

function startedAtLabel(startedAt: string | null): string {
  if (!startedAt) {
    return 'Started';
  }
  const time = new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Started at ${time}`;
}

/**
 * Starts a Live Activity when a session begins, ends it when the session
 * closes (ended or discarded). A no-op on non-iOS platforms and a no-op,
 * not a crash, if expo-widgets/the widget module can't be loaded (e.g.
 * this hasn't gone through a native prebuild/dev-client build yet) --
 * the Live Activity is a nice-to-have, never allowed to break the actual
 * session-lifecycle flow it's mirroring.
 */
export function syncWorkoutLiveActivity(session: ActiveSessionRow | null): void {
  if (Platform.OS !== 'ios') {
    return;
  }

  try {
    if (session) {
      if (currentActivity) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WorkoutActivity: LiveActivityFactory = require('../widgets/WorkoutActivity').default;

      // A cold app relaunch loses the in-memory currentActivity reference,
      // but a real Live Activity started before the relaunch keeps running
      // natively (that's the whole point) -- reattach to it via
      // getInstances() instead of blindly starting a duplicate.
      const existing = WorkoutActivity.getInstances();
      if (existing.length > 0) {
        currentActivity = existing[0];
        return;
      }

      currentActivity = WorkoutActivity.start({
        sessionTypeLabel: labelForSessionType(session.type),
        startedAtLabel: startedAtLabel(session.startedAt),
      });
    } else if (currentActivity) {
      currentActivity.end('immediate', { sessionTypeLabel: '', startedAtLabel: '' });
      currentActivity = null;
    }
  } catch (err) {
    console.warn('Live Activity sync failed:', err);
  }
}
