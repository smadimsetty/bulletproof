// apps/mobile/app/(tabs)/index.tsx
//
// Home screen (Phase 5): Yesterday's summary (reading the already-
// generated recommendations.public_rationale column -- no client-side
// Claude call of any kind, see CLAUDE.md and design spec Non-goals),
// Today's full multi-block program (recommendation_blocks +
// recommendation_block_exercises, tappable into the logger), a
// "Swap activity" picker shell that visibly states swapping isn't
// available yet (no real backend exists for it -- build_program_for_
// activity was deferred out of the engine v2 phase), and a free-text
// daily-feedback box. See
// docs/superpowers/specs/2026-06-24-home-screen-design.md for the full
// design rationale and the live-data shape this was built against.
//
// This screen fetches its own data via homeProgram.ts rather than reusing
// app/_layout.tsx's `recommendations` state -- that state comes from
// `recommendations_public`, which excludes `id` and therefore can't join
// to recommendation_blocks. See design spec Decision 1.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { fetchHomeData, type BlockExercise, type HomeData, type ProgramBlock } from '../../lib/homeProgram';
import { formatSetsReps } from '../../lib/programDisplay';
import { submitDailyFeedback } from '../../lib/dailyFeedback';
import { fetchSwapOptions, type SwapOptionGroup } from '../../lib/swapOptions';
import { labelForSessionType } from '../../lib/sessionTypeLabels';

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [homeData, setHomeData] = useState<HomeData | null>(null);

  const [swapGroups, setSwapGroups] = useState<SwapOptionGroup[]>([]);
  const [swapSheetOpen, setSwapSheetOpen] = useState(false);
  const [swapMessage, setSwapMessage] = useState<string | null>(null);

  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, groups] = await Promise.all([fetchHomeData(new Date()), fetchSwapOptions()]);
      setHomeData(data);
      setSwapGroups(groups);
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load your program.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleOpenBlock(block: ProgramBlock) {
    router.push(`/logger/${block.id}`);
  }

  function handleOpenSwapSheet() {
    setSwapMessage(null);
    setSwapSheetOpen(true);
  }

  function handleSelectSwapOption() {
    setSwapMessage("Swapping isn't available yet — this is coming in a future update.");
  }

  async function handleSaveFeedback() {
    setFeedbackStatus('saving');
    setFeedbackError(null);
    try {
      await submitDailyFeedback(new Date(), feedbackDraft);
      setFeedbackDraft('');
      setFeedbackStatus('saved');
    } catch (err: any) {
      setFeedbackStatus('error');
      setFeedbackError(err.message ?? 'Failed to save feedback.');
    }
  }

  function handleOpenDemoVideo(url: string) {
    Linking.openURL(url).catch(() => {
      // Best-effort: if the system can't open the URL, there's no
      // additional in-app recovery available here -- silently ignore
      // rather than surface a disruptive error for a non-critical action.
    });
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={TYPE.body}>Loading your program…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>Couldn't load your program: {loadError}</Text>
      </View>
    );
  }

  const today = homeData?.today ?? null;
  const yesterdayRationale = homeData?.yesterdayRationale ?? null;

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>Home</Text>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>Yesterday</Text>
        {yesterdayRationale ? (
          <Text style={TYPE.body}>{yesterdayRationale}</Text>
        ) : (
          <Text style={sharedStyles.helperText}>No summary available for yesterday yet.</Text>
        )}
      </View>

      <View style={sharedStyles.card}>
        <View style={styles.programHeaderRow}>
          <Text style={sharedStyles.sectionTitle}>Today's Program</Text>
          <Pressable onPress={handleOpenSwapSheet}>
            <Text style={styles.swapLink}>Swap activity</Text>
          </Pressable>
        </View>

        {!today && (
          <Text style={sharedStyles.helperText}>Today's program hasn't generated yet.</Text>
        )}

        {today && (
          <>
            <Text style={sharedStyles.helperText}>{today.publicRationale}</Text>
            {today.blocks.length === 0 && (
              <Text style={sharedStyles.helperText}>No blocks in today's program yet.</Text>
            )}
            {today.blocks.map((block) => (
              <Pressable
                key={block.id}
                style={styles.blockRow}
                onPress={() => handleOpenBlock(block)}
              >
                <View style={styles.blockHeaderRow}>
                  <Text style={TYPE.label}>
                    {block.title || labelForSessionType(block.blockType)}
                  </Text>
                  {block.estimatedMinutes != null && (
                    <Text style={sharedStyles.helperText}>{block.estimatedMinutes} min</Text>
                  )}
                </View>
                {block.exercises.map((exercise) => (
                  <ExerciseRow key={exercise.id} exercise={exercise} onOpenDemo={handleOpenDemoVideo} />
                ))}
              </Pressable>
            ))}
          </>
        )}
      </View>

      <View style={sharedStyles.card}>
        <Text style={sharedStyles.sectionTitle}>How are you feeling?</Text>
        <TextInput
          style={[sharedStyles.textInput, styles.feedbackInput]}
          value={feedbackDraft}
          onChangeText={setFeedbackDraft}
          placeholder="Anything worth noting today?"
          multiline
        />
        <Pressable
          style={sharedStyles.primaryButton}
          onPress={handleSaveFeedback}
          disabled={feedbackStatus === 'saving' || feedbackDraft.trim() === ''}
        >
          <Text style={sharedStyles.primaryButtonText}>
            {feedbackStatus === 'saving' ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
        {feedbackStatus === 'saved' && <Text style={sharedStyles.helperText}>Saved.</Text>}
        {feedbackStatus === 'error' && (
          <Text style={sharedStyles.warningText}>{feedbackError}</Text>
        )}
      </View>

      <SwapActivitySheet
        visible={swapSheetOpen}
        groups={swapGroups}
        message={swapMessage}
        onSelect={handleSelectSwapOption}
        onClose={() => setSwapSheetOpen(false)}
      />
    </ScrollView>
  );
}

function ExerciseRow({
  exercise,
  onOpenDemo,
}: {
  exercise: BlockExercise;
  onOpenDemo: (url: string) => void;
}) {
  const setsReps = formatSetsReps(exercise);
  return (
    <View style={styles.exerciseRow}>
      <Text style={TYPE.body}>{exercise.name}</Text>
      {setsReps !== '' && <Text style={sharedStyles.helperText}>{setsReps}</Text>}
      {exercise.demoVideoUrl && (
        <Pressable onPress={() => onOpenDemo(exercise.demoVideoUrl!)}>
          <Text style={styles.demoLink}>Watch demo</Text>
        </Pressable>
      )}
    </View>
  );
}

function SwapActivitySheet({
  visible,
  groups,
  message,
  onSelect,
  onClose,
}: {
  visible: boolean;
  groups: SwapOptionGroup[];
  message: string | null;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={sharedStyles.sectionTitle}>Swap activity</Text>
          {message && <Text style={sharedStyles.warningText}>{message}</Text>}
          <ScrollView>
            {groups.map((group) => (
              <View key={group.category}>
                {group.options.length > 0 && (
                  <Text style={styles.groupLabel}>{group.label}</Text>
                )}
                {group.options.map((option) => (
                  <Pressable key={option.id} style={styles.optionRow} onPress={onSelect}>
                    <Text style={TYPE.body}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  programHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  swapLink: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  blockRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  blockHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseRow: {
    paddingVertical: SPACING.xs,
    gap: 2,
  },
  demoLink: {
    color: COLORS.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  feedbackInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    maxHeight: '70%',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  groupLabel: {
    color: COLORS.muted,
    fontWeight: '600',
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  optionRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
