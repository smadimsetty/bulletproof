// The ad-hoc workout Logger -- a freeform session not tied to any
// recommendation_blocks row (see lib/adhocSession.ts). The session is
// already started (sessions.started_at set) by the time this screen is
// reached -- Home's "+" flow creates it and navigates straight here --
// so there is no separate Start button here, only End Workout, mirroring
// [blockId].tsx's End/celebration flow exactly. Exercises are built from
// sessions.ad_hoc_exercise_ids resolved against the full catalog, and
// existing logs are looked up by exercise_id (fetchTodaysAdhocExerciseLogs)
// since ad-hoc rows have no block-exercise id to key on.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../../lib/theme';
import { fetchSessionById, setAdhocExerciseIds, type AdhocSessionRow } from '../../../lib/adhocSession';
import { fetchTodaysAdhocExerciseLogs, type ExerciseLogRow } from '../../../lib/exerciseLogs';
import { endSession, submitFeltRating } from '../../../lib/sessionLifecycle';
import { fetchExerciseCatalog, type CatalogExercise } from '../../../lib/exerciseCatalog';
import { fetchWeightUnit } from '../../../lib/userPreferences';
import type { WeightUnit } from '../../../lib/units';
import type { LoggerExercise } from '../../../lib/loggerBlock';
import MobilityChecklistRow from '../../../components/MobilityChecklistRow';
import StrengthSetRow from '../../../components/StrengthSetRow';
import ExercisePickerSheet from '../../../components/ExercisePickerSheet';
import FeltRatingPicker from '../../../components/FeltRatingPicker';

const MOBILITY_EXERCISE_TYPES = new Set(['mobility_stretch', 'balance']);

function isMobilityRow(exercise: LoggerExercise): boolean {
  return MOBILITY_EXERCISE_TYPES.has(exercise.exerciseType ?? '');
}

function toLoggerExercise(order: number, catalogExercise: CatalogExercise): LoggerExercise {
  return {
    id: catalogExercise.id,
    recommendationBlockExerciseId: null,
    order,
    exerciseId: catalogExercise.id,
    name: catalogExercise.name,
    movementPattern: catalogExercise.movementPattern,
    exerciseType: catalogExercise.exerciseType,
    prescribedSets: catalogExercise.defaultSets,
    prescribedReps: catalogExercise.defaultRepRange,
    prescribedWeightNote: null,
    isUnilateralLeftFirst: false,
    notes: null,
    demoVideoUrl: catalogExercise.demoVideoUrl,
  };
}

export default function AdhocLogger() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<AdhocSessionRow | null>(null);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [exercises, setExercises] = useState<LoggerExercise[]>([]);
  const [logsByExerciseId, setLogsByExerciseId] = useState<Map<string, ExerciseLogRow[]>>(new Map());
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lbs');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [celebration, setCelebration] = useState<{ minutes: number } | null>(null);
  const [feltRatingStatus, setFeltRatingStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const load = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [sessionResult, catalogResult, weightUnitResult] = await Promise.all([
        fetchSessionById(sessionId),
        fetchExerciseCatalog(),
        fetchWeightUnit(),
      ]);
      setSession(sessionResult);
      setCatalog(catalogResult);
      setWeightUnit(weightUnitResult);

      if (sessionResult) {
        const byCatalogId = new Map(catalogResult.map((c) => [c.id, c]));
        const builtExercises = sessionResult.adHocExerciseIds
          .map((id, index) => {
            const catalogExercise = byCatalogId.get(id);
            return catalogExercise ? toLoggerExercise(index, catalogExercise) : null;
          })
          .filter((e): e is LoggerExercise => e != null);
        setExercises(builtExercises);

        const logs = await fetchTodaysAdhocExerciseLogs(sessionResult.adHocExerciseIds);
        const byId = new Map<string, ExerciseLogRow[]>();
        for (const log of logs) {
          const existing = byId.get(log.exerciseId) ?? [];
          existing.push(log);
          byId.set(log.exerciseId, existing);
        }
        setLogsByExerciseId(byId);
      }
    } catch (err: any) {
      setLoadError(err.message ?? 'Failed to load this workout.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function persistExerciseIds(nextIds: readonly string[]) {
    if (!session) return;
    await setAdhocExerciseIds(session.id, nextIds);
    setSession((prev) => (prev ? { ...prev, adHocExerciseIds: nextIds } : prev));
  }

  async function handleAddExercise(picked: CatalogExercise) {
    if (!session) return;
    setPickerOpen(false);
    if (session.adHocExerciseIds.includes(picked.id)) {
      return;
    }
    const nextIds = [...session.adHocExerciseIds, picked.id];
    await persistExerciseIds(nextIds);
    setExercises((prev) => [...prev, toLoggerExercise(prev.length, picked)]);
  }

  async function handleRemove(exerciseId: string) {
    if (!session) return;
    const nextIds = session.adHocExerciseIds.filter((id) => id !== exerciseId);
    await persistExerciseIds(nextIds);
    setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
  }

  async function handleEndWorkout() {
    if (!session) return;
    const ended = await endSession(session.id);
    setSession((prev) => (prev ? { ...prev, endedAt: ended.endedAt } : prev));

    const startedAtMs = ended.startedAt ? new Date(ended.startedAt).getTime() : null;
    const endedAtMs = ended.endedAt ? new Date(ended.endedAt).getTime() : null;
    const minutes =
      startedAtMs != null && endedAtMs != null ? Math.max(0, Math.round((endedAtMs - startedAtMs) / 60000)) : 0;
    setCelebration({ minutes });
  }

  async function handleFeltRating(rating: number) {
    if (!session) return;
    try {
      await submitFeltRating(session.id, rating);
      setSession((prev) => (prev ? { ...prev, feltRating: rating } : prev));
      setFeltRatingStatus('saved');
    } catch {
      setFeltRatingStatus('error');
    }
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={TYPE.body}>Loading this workout…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>Couldn't load this workout: {loadError}</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>This workout couldn't be found.</Text>
      </View>
    );
  }

  const pickedIds = new Set(exercises.map((e) => e.exerciseId));

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent}>
      <Text style={TYPE.screenTitle}>New workout</Text>

      {session.endedAt == null && (
        <Pressable style={[sharedStyles.primaryButton, styles.endButton]} onPress={handleEndWorkout}>
          <Text style={sharedStyles.primaryButtonText}>End Workout</Text>
        </Pressable>
      )}

      {exercises.length === 0 && (
        <Text style={sharedStyles.helperText}>Add an exercise below to start logging.</Text>
      )}

      {exercises.map((exercise) =>
        isMobilityRow(exercise) ? (
          <MobilityChecklistRow
            key={exercise.id}
            exercise={exercise}
            blockType={session.type}
            existingLogs={logsByExerciseId.get(exercise.exerciseId) ?? []}
            onSwap={() => {}}
            onRemove={() => handleRemove(exercise.exerciseId)}
          />
        ) : (
          <StrengthSetRow
            key={exercise.id}
            exercise={exercise}
            blockType={session.type}
            existingLogs={logsByExerciseId.get(exercise.exerciseId) ?? []}
            weightUnit={weightUnit}
            onSwap={() => {}}
            onRemove={() => handleRemove(exercise.exerciseId)}
          />
        )
      )}

      <Pressable onPress={() => setPickerOpen(true)}>
        <Text style={styles.addExerciseText}>+ Add an exercise</Text>
      </Pressable>

      {session.endedAt != null && (
        <View>
          <FeltRatingPicker value={session.feltRating} onSelect={handleFeltRating} />
          {feltRatingStatus === 'saved' && <Text style={sharedStyles.helperText}>Saved.</Text>}
          {feltRatingStatus === 'error' && <Text style={sharedStyles.warningText}>Couldn't save — try again.</Text>}
        </View>
      )}

      <ExercisePickerSheet
        visible={pickerOpen}
        title="Add an exercise"
        catalog={catalog}
        filterPredicate={(candidate) => !pickedIds.has(candidate.id)}
        onSelect={handleAddExercise}
        onClose={() => setPickerOpen(false)}
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
