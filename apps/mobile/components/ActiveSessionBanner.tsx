// Persistent app-wide banner shown whenever sessions has an open row
// (ended_at IS NULL) for the signed-in user -- rendered as a sibling to
// the root Stack in app/_layout.tsx, visible on every screen, not just
// the Logger (per the v2 design spec's explicit "persistent app-wide
// banner" requirement). Tapping it resumes the session directly for an
// ad-hoc workout (it has its own dedicated route); for a block-based
// session it still routes to Home to re-pick the block, since a session
// has no block_id column of its own (it can span multiple blocks in one
// sitting -- see design spec Decision 6's Non-goal) -- see
// resumeRouteForSession in lib/sessionLifecycle.ts.
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import { labelForSessionType } from '../lib/sessionTypeLabels';
import { discardActiveSession, resumeRouteForSession } from '../lib/sessionLifecycle';
import type { ActiveSessionRow } from '../lib/sessionLifecycle';

export interface ActiveSessionBannerProps {
  readonly session: ActiveSessionRow;
}

// Re-renders the banner every 15s so elapsedLabel's snapshot actually
// ticks forward instead of freezing at whatever it read on mount (or the
// last unrelated re-render). 15s not 1s: the label only shows whole
// minutes, so anything sub-minute is wasted work.
const ELAPSED_TICK_MS = 15000;

function elapsedLabel(startedAt: string | null): string {
  if (!startedAt) {
    return '';
  }
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  return `${minutes} min`;
}

export default function ActiveSessionBanner({ session }: ActiveSessionBannerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((t) => t + 1), ELAPSED_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  function handleDiscard() {
    Alert.alert('Discard this workout?', 'This ends the session without recording a duration.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardActiveSession(session.id).catch((err: any) => {
            Alert.alert("Couldn't discard", err.message ?? 'Try again.');
          });
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.sm }]}>
      <Pressable
        style={styles.tapArea}
        onPress={() => router.push(resumeRouteForSession(session))}
      >
        <View style={styles.dot} />
        <Text style={styles.text}>
          {labelForSessionType(session.type)} in progress · {elapsedLabel(session.startedAt)}
        </Text>
      </Pressable>
      <Pressable
        style={styles.discardButton}
        onPress={handleDiscard}
        accessibilityLabel="Discard workout"
        hitSlop={8}
      >
        <Text style={styles.discardText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accent,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  tapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.card },
  text: { ...TYPE.body, color: COLORS.card, fontWeight: '600' },
  discardButton: { paddingHorizontal: SPACING.xs, paddingVertical: SPACING.xs },
  discardText: { ...TYPE.body, color: COLORS.card, fontWeight: '700', fontSize: 20, lineHeight: 20 },
});
