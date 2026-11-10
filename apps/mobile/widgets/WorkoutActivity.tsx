// The lock-screen / Dynamic Island Live Activity shown while a workout is in
// progress: a live elapsed timer, the current exercise, and a hold/rest
// countdown when one is running.
//
// IMPORTANT: the 'widget' directive makes babel-preset-expo stringify the
// function body (widgets-plugin.js: generator.generate -> template literal).
// That string is later eval'd inside a bare JavaScriptCore context
// (expo-widgets ios/Widgets/WidgetsJSRuntime.swift), so NOTHING from the
// module scope exists there: no constants, no helper functions, no imports
// other than the SwiftUI components/modifiers that bundle/index.ts puts on
// globalThis. Everything this layout needs is therefore declared inside the
// function. A module-level constant referenced from inside throws a
// ReferenceError at render time and the Live Activity renders as an empty box.
//
// Times are passed as epoch-ms numbers (props are JSON-serialised) and become
// Dates inside the function. SwiftUI timer text ticks by itself on the lock
// screen, so no per-second updates are needed.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export interface WorkoutActivityProps {
  readonly title: string; // workout title
  readonly startedAtMs: number; // epoch ms, drives a system timer text
  readonly exerciseName: string; // current exercise, '' if none
  readonly timerEndsAtMs: number; // 0 when no hold/rest timer running
  readonly timerLabel: string; // 'Rest' | 'Hold' | 'Switch sides' | ''
}

function WorkoutActivityComponent(props: WorkoutActivityProps, _environment: LiveActivityEnvironment) {
  'widget';
  const accent = '#C6F432';
  const surface = '#0B0B0C';
  const white = '#FFFFFF';
  const muted = '#A1A1A6';

  const startedAt = new Date(props.startedAtMs || 0);
  const hasTimer = props.timerEndsAtMs > 0;
  const timerEndsAt = new Date(props.timerEndsAtMs || 0);
  // Bounded countdown: with an interval the system text stops at 0:00 instead of counting up
  // when the app is suspended and cannot clear the timer. Rest and hold timers are well under an hour.
  const timerStart = new Date((props.timerEndsAtMs || 0) - 60 * 60 * 1000);
  const hasExercise = props.exerciseName !== '';
  const icon = 'figure.strengthtraining.traditional';

  const elapsed = (size: number, color: string, width?: number) => (
    <Text
      date={startedAt}
      dateStyle="timer"
      modifiers={[
        font({ size, weight: 'semibold', design: 'rounded' }),
        monospacedDigit(),
        foregroundStyle(color),
        ...(width ? [frame({ width })] : []),
      ]}
    />
  );

  const countdown = (size: number, color: string, width?: number) => (
    <Text
      timerInterval={{ lower: timerStart, upper: timerEndsAt }}
      countsDown
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        foregroundStyle(color),
        ...(width ? [frame({ width })] : []),
      ]}
    />
  );

  const body = (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[padding({ all: 16 }), activityBackgroundTint(surface)]}>
      <HStack spacing={8}>
        <Image systemName={icon} size={16} color={accent} />
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(white), lineLimit(1)]}>
          {props.title || 'Workout'}
        </Text>
        <Spacer />
        {elapsed(20, accent, 70)}
      </HStack>
      {hasExercise ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(1)]}>
          {props.exerciseName}
        </Text>
      ) : null}
      {hasTimer ? (
        <HStack spacing={8}>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>
            {props.timerLabel || 'Timer'}
          </Text>
          <Spacer />
          {countdown(28, white, 90)}
        </HStack>
      ) : null}
    </VStack>
  );

  return {
    banner: body,
    compactLeading: <Image systemName={icon} color={accent} />,
    compactTrailing: hasTimer ? countdown(14, accent, 46) : elapsed(14, accent, 46),
    minimal: <Image systemName={icon} color={accent} />,
    expandedLeading: (
      <VStack alignment="leading" modifiers={[padding({ all: 8 })]}>
        <Image systemName={icon} size={22} color={accent} />
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" modifiers={[padding({ all: 8 })]}>
        {elapsed(22, accent, 80)}
      </VStack>
    ),
    expandedCenter: (
      <VStack modifiers={[padding({ all: 8 })]}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(white), lineLimit(1)]}>
          {props.title || 'Workout'}
        </Text>
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 8 })]}>
        {hasExercise ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(1)]}>
            {props.exerciseName}
          </Text>
        ) : null}
        {hasTimer ? (
          <HStack spacing={8}>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>
              {props.timerLabel || 'Timer'}
            </Text>
            <Spacer />
            {countdown(24, white, 90)}
          </HStack>
        ) : null}
      </VStack>
    ),
  };
}

export default createLiveActivity<WorkoutActivityProps>('WorkoutActivity', WorkoutActivityComponent);
