// The real Logger screen (Phase 6), replacing the Phase 3 echo stub.
// Fetches its block standalone from the blockId route param (never
// assumes navigation-param data, since this route is reachable via deep
// link or after an app restart -- see
// docs/superpowers/specs/2026-06-24-logger-design.md Decision 1).
// Renders MobilityChecklistRow/StrengthSetRow per exercise based on
// exercise_type, a global "+ Add an exercise" action, Start/End Workout
// buttons against sessions.started_at/ended_at, a mid-session felt-
// rating control, and a completion celebration on End Workout. Handles
// the DB-enforced single-active-session constraint violation (Postgres
// 23505 on sessions_one_active_per_owner) via a resume/discard prompt
// rather than letting it surface as a raw error (Decision 5).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { fetchLoggerBlock, type LoggerBlock, type LoggerExercise } from '../../lib/loggerBlock';
import { fetchTodaysExerciseLogs, type ExerciseLogRow } from '../../lib/exerciseLogs';
import {
  fetchActiveSession,
  startSession,
  endSession,
  discardActiveSession,
  submitFeltRating,
  type ActiveSessionRow,
} from '../../lib/sessionLifecycle';
import { swapBlockExercise, removeBlockExercise, addBlockExercise } from '../../lib/blockExerciseActions';
import { fetchExerciseCatalog, buildSwapFilter, buildAddFilter, type CatalogExercise } from '../../lib/exerciseCatalog';
import MobilityChecklistRow from '../../components/MobilityChecklistRow';
import StrengthSetRow from '../../components/StrengthSetRow';
import ExercisePickerSheet from '../../components/ExercisePickerSheet';
import FeltRatingPicker from '../../components/FeltRatingPicker';

const MOBILITY_EXERCISE_TYPES = new Set(['mobility_stretch', 'balance']);

function isMobilityRow(exercise: LoggerExercise): boolean {
  return MOBILITY_EXERCISE_TYPES.has(exercise.exerciseType ?? '');
}

export default function Logger() {
  const { blockId } = useLocalSearchParams<{ blockId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [block, setBlock] = useState<LoggerBlock | null>(null);
  const [logsByBlockExerciseId, setLogsByBlockExerciseId] = useState<Map<string, ExerciseLogRow[]>>(new Map());
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [session, setSession] = useState<ActiveSessionRow | null>(null);

  const [pickerTarget, setPickerTarget] = useState<{ mode: 'swap'; row: LoggerExercise } | { mode: 'add' } | null>(
    null
  );
  const [celebration, setCelebration] = useState<{ minutes: number } | null>(null);

  const load = useCallback(async () => {
    if (!blockId) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [blockResult, activeSession, catalogResult] = await Promise.all([
        fetchLoggerBlock(blockId),
        fetchActiveSession(),
        fetchExerciseCatalog(),
      ]);
      setBlock(blockResult);
      setSession(activeSession);
      setCatalog(catalogResult);

      if (blockResult) {
        const logs = await fetchTodaysExerciseLogs(blockResult.exercises.map((e) => e.id));
        const byId = new Map<string, ExerciseLogRow[]>();
        for (const log of logs) {
          if (!log.recommendationBlockExerciseId) continue;
          const existing = byId.get(log.recommendationBlockExerciseId) ?? [];
          existing.push(log);
          byId.set(log.recommendationBlockExerciseId, existing);
        }
        setLogsByBlockExerciseId(byId);
      }
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load this block.');
    } finally {
      setLoading(false);
    }
  }, [blockId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStartWorkout() {
    if (!block) return;
    const result = await startSession(block.blockType);
    if (result.ok) {
      setSession(result.session);
      return;
    }

    // Conflict: a session is already active. Prompt to resume or discard
    // rather than surfacing the raw 23505 error (design spec Decision 5).
    const existing = await fetchActiveSession();
    Alert.alert(
      'You already have an active session',
      existing ? `Started at ${new Date(existing.startedAt ?? '').toLocaleTimeString()}.` : undefined,
      [
        {
          text: 'Resume it',
          onPress: () => setSession(existing),
        },
        {
          text: 'Discard it',
          style: 'destructive',
          onPress: async () => {
            if (existing) {
              await discardActiveSession(existing.id);
            }
            const retry = await startSession(block.blockType);
            if (retry.ok) {
              setSession(retry.session);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  async function handleEndWorkout() {
    if (!session) return;
    const ended = await endSession(session.id);
    setSession(null);

    const startedAtMs = ended.startedAt ? new Date(ended.startedAt).getTime() : null;
    const endedAtMs = ended.endedAt ? new Date(ended.endedAt).getTime() : null;
    const minutes =
      startedAtMs != null && endedAtMs != null ? Math.max(0, Math.round((endedAtMs - startedAtMs) / 60000)) : 0;
    setCelebration({ minutes });
  }

  async function handleFeltRating(rating: number) {
    if (!session) return;
    await submitFeltRating(session.id, rating);
    setSession((prev) => (prev ? { ...prev, feltRating: rating } : prev));
  }

  function handleOpenSwap(row: LoggerExercise) {
    setPickerTarget({ mode: 'swap', row });
  }

  function handleOpenAdd() {
    setPickerTarget({ mode: 'add' });
  }

  async function handleRemove(row: LoggerExercise) {
    await removeBlockExercise(row.id);
    setBlock((prev) => (prev ? { ...prev, exercises: prev.exercises.filter((e) => e.id !== row.id) } : prev));
  }

  async function handlePickExercise(picked: CatalogExercise) {
    if (!block || !pickerTarget) return;

    if (pickerTarget.mode === 'swap') {
      const row = pickerTarget.row;
      await swapBlockExercise(row.id, picked.id, row.exerciseId);
      setBlock((prev) =>
        prev
          ? {
              ...prev,
              exercises: prev.exercises.map((e) =>
                e.id === row.id
                  ? {
                      ...e,
                      exerciseId: picked.id,
                      name: picked.name,
                      movementPattern: picked.movementPattern,
                      exerciseType: picked.exerciseType,
                      demoVideoUrl: picked.demoVideoUrl,
                    }
                  : e
              ),
            }
          : prev
      );
    } else {
      const created = await addBlockExercise(
        block.id,
        picked.id,
        block.exercises.map((e) => e.order)
      );
      const newRow: LoggerExercise = {
        id: created.id,
        order: block.exercises.length === 0 ? 0 : Math.max(...block.exercises.map((e) => e.order)) + 1,
        exerciseId: picked.id,
        name: picked.name,
        movementPattern: picked.movementPattern,
        exerciseType: picked.exerciseType,
        prescribedSets: picked.defaultSets,
        prescribedReps: picked.defaultRepRange,
        prescribedWeightNote: null,
        isUnilateralLeftFirst: false,
        notes: null,
        demoVideoUrl: picked.demoVideoUrl,
      };
      setBlock((prev) => (prev ? { ...prev, exercises: [...prev.exercises, newRow] } : prev));
    }

    setPickerTarget(null);
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={TYPE.body}>Loading this block…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>Couldn't load this block: {loadError}</Text>
      </View>
    );
  }

  if (!block) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>This block couldn't be found.</Text>
      </View>
    );
  }

  const filterPredicate =
    pickerTarget?.mode === 'swap'
      ? buildSwapFilter({
          id: pickerTarget.row.exerciseId,
          name: pickerTarget.row.name,
          movementPattern: pickerTarget.row.movementPattern,
          exerciseType: pickerTarget.row.exerciseType,
          targetGoals: [],
          bodyParts: [],
          demoVideoUrl: null,
          defaultSets: null,
          defaultRepRange: null,
          unilateral: false,
          isCorrective: false,
        })
      : buildAddFilter(block.exercises.map((e) => e.movementPattern));

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>{block.title}</Text>

      {!session && (
        <Pressable style={sharedStyles.primaryButton} onPress={handleStartWorkout}>
          <Text style={sharedStyles.primaryButtonText}>Start Workout</Text>
        </Pressable>
      )}

      {session && (
        <Pressable style={[sharedStyles.primaryButton, styles.endButton]} onPress={handleEndWorkout}>
          <Text style={sharedStyles.primaryButtonText}>End Workout</Text>
        </Pressable>
      )}

      {block.exercises.map((exercise) =>
        isMobilityRow(exercise) ? (
          <MobilityChecklistRow
            key={exercise.id}
            exercise={exercise}
            blockType={block.blockType}
            initiallyCompleted={
              logsByBlockExerciseId.get(exercise.id)?.some((l) => l.completed) ?? false
            }
            onSwap={() => handleOpenSwap(exercise)}
            onRemove={() => handleRemove(exercise)}
          />
        ) : (
          <StrengthSetRow
            key={exercise.id}
            exercise={exercise}
            blockType={block.blockType}
            existingLogs={logsByBlockExerciseId.get(exercise.id) ?? []}
            onSwap={() => handleOpenSwap(exercise)}
            onRemove={() => handleRemove(exercise)}
          />
        )
      )}

      <Pressable onPress={handleOpenAdd}>
        <Text style={styles.addExerciseText}>+ Add an exercise</Text>
      </Pressable>

      {session && <FeltRatingPicker value={session.feltRating} onSelect={handleFeltRating} />}

      <ExercisePickerSheet
        visible={pickerTarget != null}
        title={pickerTarget?.mode === 'swap' ? `Swap ${pickerTarget.row.name}` : 'Add an exercise'}
        catalog={catalog}
        filterPredicate={filterPredicate}
        onSelect={handlePickExercise}
        onClose={() => setPickerTarget(null)}
      />

      <Modal visible={celebration != null} animationType="fade" transparent>
        <View style={styles.celebrationBackdrop}>
          <View style={[sharedStyles.card, styles.celebrationCard]}>
            <Text style={sharedStyles.sectionTitle}>Workout complete</Text>
            <Text style={TYPE.body}>You trained for {celebration?.minutes ?? 0} minutes.</Text>
            <Pressable
              style={sharedStyles.primaryButton}
              onPress={() => {
                setCelebration(null);
                router.replace('/(tabs)');
              }}
            >
              <Text style={sharedStyles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  endButton: { backgroundColor: COLORS.danger },
  addExerciseText: { color: COLORS.accent, fontWeight: '600', textAlign: 'center', paddingVertical: SPACING.sm },
  celebrationBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationCard: { width: '80%', gap: SPACING.md, alignItems: 'center' },
});
