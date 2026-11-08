// apps/mobile/lib/workoutActivityBridge.ts
//
// Drives the lock-screen / Dynamic Island Live Activity
// (widgets/WorkoutActivity.tsx) from the in-progress workout. iOS-only and
// never allowed to throw: expo-widgets needs a real native build, so the
// widget module is require()d lazily inside try/catch (keeps Jest and
// non-iOS safe). Restored from the pre-sprint-pivot Logger (commit 04d0b3e^).
import { Platform } from 'react-native';
import type { ActiveWorkoutSummary } from './workouts';

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

function startedAtLabel(startedAt: string): string {
  const time = new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Started at ${time}`;
}

export function syncWorkoutLiveActivity(active: ActiveWorkoutSummary | null): void {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WorkoutActivity: LiveActivityFactory = require('../widgets/WorkoutActivity').default;
    if (active) {
      if (currentActivity) return;
      const existing = WorkoutActivity.getInstances();
      if (existing.length > 0) {
        currentActivity = existing[0];
        return;
      }
      currentActivity = WorkoutActivity.start({
        sessionTypeLabel: active.title,
        startedAtLabel: startedAtLabel(active.startedAt),
      });
    } else {
      // End ours and any orphan left by a previous app process.
      const all = currentActivity ? [currentActivity] : WorkoutActivity.getInstances();
      all.forEach((a) => a.end('immediate', { sessionTypeLabel: '', startedAtLabel: '' }));
      currentActivity = null;
    }
  } catch (err) {
    console.warn('Live Activity sync failed:', err);
  }
}
