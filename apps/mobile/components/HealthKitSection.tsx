// apps/mobile/components/HealthKitSection.tsx
//
// The Settings screen's HealthKit section: a sync-enable toggle bound to
// user_profile.healthkit_sync_enabled, plus a static "what we read"
// disclosure list. Explicitly read-only -- this app has never requested
// HealthKit write/share permissions and never will via this section. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md Goals.
import { Switch, Text, View } from 'react-native';
import { sharedStyles, TYPE } from '../lib/theme';

export interface HealthKitSectionProps {
  readonly enabled: boolean;
  readonly onToggle: (next: boolean) => void;
}

const WHAT_WE_READ = [
  'Workouts (type, duration, calories, distance) -- pickleball, running, gym sessions',
  'Active calories burned and step count, per day',
  'Sleep analysis, per night',
  'Heart rate and resting heart rate',
];

export default function HealthKitSection({ enabled, onToggle }: HealthKitSectionProps) {
  return (
    <View style={sharedStyles.card}>
      <Text style={sharedStyles.sectionTitle}>HealthKit</Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={TYPE.body}>Sync with Apple Health</Text>
        <Switch value={enabled} onValueChange={onToggle} />
      </View>

      <Text style={sharedStyles.helperText}>
        Read-only. Bulletproof never writes any data to Apple Health. What we read:
      </Text>
      {WHAT_WE_READ.map((line) => (
        <Text key={line} style={sharedStyles.helperText}>
          {'•'} {line}
        </Text>
      ))}
    </View>
  );
}
