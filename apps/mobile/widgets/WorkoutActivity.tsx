// The lock-screen / Dynamic Island Live Activity shown for the duration
// of an active workout session. Content is static (session type label +
// start time), refreshed only via explicit .start()/.end() calls from
// sessionLifecycle.ts -- not a live per-second ticking counter, since
// that needs a native SwiftUI timer-text API this pass didn't confirm is
// exposed through @expo/ui/swift-ui's Text. `'widget'` marks this
// component as a native SwiftUI view, compiled by expo-widgets' config
// plugin -- it is not a regular React Native screen and cannot use
// react-native components inside its returned layout.
import { Image, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export interface WorkoutActivityProps {
  readonly sessionTypeLabel: string;
  readonly startedAtLabel: string;
}

const ACCENT_LIGHT = '#007AFF';
const ACCENT_DARK = '#FFFFFF';

function WorkoutActivityComponent(props: WorkoutActivityProps, environment: LiveActivityEnvironment) {
  'widget';
  const accentColor = environment.colorScheme === 'dark' ? ACCENT_DARK : ACCENT_LIGHT;

  return {
    banner: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'bold' }), foregroundStyle(accentColor)]}>
          {props.sessionTypeLabel} in progress
        </Text>
        <Text>{props.startedAtLabel}</Text>
      </VStack>
    ),
    compactLeading: <Image systemName="figure.strengthtraining.traditional" color={accentColor} />,
    compactTrailing: <Text>{'●'}</Text>,
    minimal: <Image systemName="figure.strengthtraining.traditional" color={accentColor} />,
    expandedBottom: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ size: 12 })]}>Open Bulletproof to log sets</Text>
      </VStack>
    ),
  };
}

export default createLiveActivity('WorkoutActivity', WorkoutActivityComponent);
