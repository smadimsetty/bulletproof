// Persistent app-wide banner shown whenever sessions has an open row
// (ended_at IS NULL) for the signed-in user -- rendered as a sibling to
// the root Stack in app/_layout.tsx, visible on every screen, not just
// the Logger (per the v2 design spec's explicit "persistent app-wide
// banner" requirement). Tapping it routes to the Home tab rather than a
// specific blockId, since a session has no block_id column of its own
// (it can span multiple blocks in one sitting -- see design spec
// Decision 6's Non-goal) -- the user re-picks which block to resume
// logging from Home.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import { labelForSessionType } from '../lib/sessionTypeLabels';
import type { ActiveSessionRow } from '../lib/sessionLifecycle';

export interface ActiveSessionBannerProps {
  readonly session: ActiveSessionRow;
}

function elapsedLabel(startedAt: string | null): string {
  if (!startedAt) {
    return '';
  }
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  return `${minutes} min`;
}

export default function ActiveSessionBanner({ session }: ActiveSessionBannerProps) {
  const router = useRouter();

  return (
    <Pressable style={styles.container} onPress={() => router.push('/(tabs)')}>
      <View style={styles.dot} />
      <Text style={styles.text}>
        {labelForSessionType(session.type)} in progress · {elapsedLabel(session.startedAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card },
  text: { ...TYPE.body, color: COLORS.card, fontWeight: '600' },
});
