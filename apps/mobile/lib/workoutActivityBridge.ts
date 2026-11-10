// apps/mobile/lib/workoutActivityBridge.ts
//
// Drives the lock-screen / Dynamic Island Live Activity
// (widgets/WorkoutActivity.tsx) from the in-progress workout. iOS-only and
// never allowed to throw: expo-widgets needs a real native build, so the
// widget module is require()d lazily inside try/catch (keeps Jest and
// non-iOS safe).
import { Platform } from 'react-native';
import type { ActiveWorkoutSummary } from './workouts';

interface WorkoutActivityProps {
  readonly title: string;
  readonly startedAtMs: number;
  readonly exerciseName: string;
  readonly timerEndsAtMs: number;
  readonly timerLabel: string;
}
interface LiveActivityInstance {
  update(props: WorkoutActivityProps): Promise<void>;
  end(dismissalPolicy: 'default' | 'immediate', props: WorkoutActivityProps): Promise<void>;
}
interface LiveActivityFactory {
  start(props: WorkoutActivityProps): LiveActivityInstance;
  getInstances(): readonly LiveActivityInstance[];
}

export interface CurrentWorkoutActivity {
  readonly exerciseName: string;
  /** Epoch ms the running hold/rest timer ends; 0 when none. */
  readonly timerEndsAtMs: number;
  /** 'Rest' | 'Hold' | 'Switch sides' | '' */
  readonly timerLabel: string;
}

let currentActivity: LiveActivityInstance | null = null;
/** The workout `currentActivity` was started for. */
let currentWorkoutId: string | null = null;
/** Serialised props last sent, so identical updates are skipped. */
let lastPropsKey: string | null = null;

const EMPTY_PROPS: WorkoutActivityProps = {
  title: '',
  startedAtMs: 0,
  exerciseName: '',
  timerEndsAtMs: 0,
  timerLabel: '',
};

function buildProps(active: ActiveWorkoutSummary, current?: CurrentWorkoutActivity): WorkoutActivityProps {
  const startedAtMs = new Date(active.startedAt).getTime();
  const hasTimer = !!current && current.timerEndsAtMs > 0;
  return {
    title: active.title,
    startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
    exerciseName: current?.exerciseName ?? '',
    timerEndsAtMs: hasTimer ? current!.timerEndsAtMs : 0,
    timerLabel: hasTimer ? current!.timerLabel : '',
  };
}

function swallow(p: Promise<void> | undefined): void {
  p?.catch((err) => console.warn('Live Activity call failed:', err));
}

export function syncWorkoutLiveActivity(
  active: ActiveWorkoutSummary | null,
  current?: CurrentWorkoutActivity
): void {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WorkoutActivity: LiveActivityFactory = require('../widgets/WorkoutActivity').default;
    if (active) {
      if (currentActivity && currentWorkoutId === active.id) {
        // Already running for this workout. Without `current` (the app-level
        // refresh) there is nothing new to show; with it, push changes only.
        if (!current) return;
        const props = buildProps(active, current);
        const key = JSON.stringify(props);
        if (key === lastPropsKey) return;
        lastPropsKey = key;
        swallow(currentActivity.update(props));
        return;
      }
      // Either ours belongs to a different workout, or this is a fresh process
      // and any instance on screen is an orphan whose workout we can't
      // identify (it may have been finished or discarded elsewhere). End them
      // all and start one that is known to match.
      const stale = currentActivity ? [currentActivity] : WorkoutActivity.getInstances();
      stale.forEach((a) => swallow(a.end('immediate', EMPTY_PROPS)));
      const props = buildProps(active, current);
      currentActivity = WorkoutActivity.start(props);
      currentWorkoutId = active.id;
      lastPropsKey = JSON.stringify(props);
    } else {
      // End ours and any orphan left by a previous app process.
      const all = currentActivity ? [currentActivity] : WorkoutActivity.getInstances();
      all.forEach((a) => swallow(a.end('immediate', EMPTY_PROPS)));
      currentActivity = null;
      currentWorkoutId = null;
      lastPropsKey = null;
    }
  } catch (err) {
    console.warn('Live Activity sync failed:', err);
  }
}
