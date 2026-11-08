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
/** The workout `currentActivity` was started for. */
let currentWorkoutId: string | null = null;

const EMPTY_PROPS: WorkoutActivityProps = { sessionTypeLabel: '', startedAtLabel: '' };

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
      if (currentActivity && currentWorkoutId === active.id) return;
      // Either ours belongs to a different workout, or this is a fresh process
      // and any instance on screen is an orphan whose workout we can't
      // identify (it may have been finished or discarded elsewhere). End them
      // all and start one that is known to match.
      const stale = currentActivity ? [currentActivity] : WorkoutActivity.getInstances();
      stale.forEach((a) => a.end('immediate', EMPTY_PROPS));
      currentActivity = WorkoutActivity.start({
        sessionTypeLabel: active.title,
        startedAtLabel: startedAtLabel(active.startedAt),
      });
      currentWorkoutId = active.id;
    } else {
      // End ours and any orphan left by a previous app process.
      const all = currentActivity ? [currentActivity] : WorkoutActivity.getInstances();
      all.forEach((a) => a.end('immediate', EMPTY_PROPS));
      currentActivity = null;
      currentWorkoutId = null;
    }
  } catch (err) {
    console.warn('Live Activity sync failed:', err);
  }
}
