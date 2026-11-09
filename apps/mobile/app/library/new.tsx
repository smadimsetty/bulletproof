// apps/mobile/app/library/new.tsx
//
// Create (no id) or edit (?id=) a custom exercise. With ?returnTo=picker the
// new id is left on the pending-pick channel for the screen that opened the
// picker to add on focus.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, LEGACY_SPACING as SPACING, TYPE, sharedStyles } from '../../lib/theme';
import {
  MOVEMENT_PATTERNS, createCustomExercise, deleteCustomExercise, fetchCustomExercise, parseTagList,
  setPendingPickedExercise, updateCustomExercise, validateCustomExercise,
  type CustomExerciseInput, type CustomExerciseType,
} from '../../lib/library';

const TYPES: { label: string; value: CustomExerciseType }[] = [
  { label: 'Stretch/hold', value: 'mobility_stretch' },
  { label: 'Balance', value: 'balance' },
  { label: 'Strength', value: 'strength' },
  { label: 'Plyo', value: 'plyometric' },
  { label: 'Cardio', value: 'cardio' },
];

export default function NewExerciseScreen() {
  const router = useRouter();
  const { id, returnTo } = useLocalSearchParams<{ id?: string; returnTo?: string }>();
  const editing = !!id;
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomExerciseType>('mobility_stretch');
  const [pattern, setPattern] = useState<string>('push');
  const [unilateral, setUnilateral] = useState(false);
  const [bodyParts, setBodyParts] = useState('');
  const [equipment, setEquipment] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const e = await fetchCustomExercise(id);
        setName(e.name);
        setType(e.exerciseType);
        setPattern(e.movementPattern ?? 'push');
        setUnilateral(e.unilateral);
        setBodyParts(e.bodyParts.join(', '));
        setEquipment(e.equipment.join(', '));
        setDescription(e.description ?? '');
        setUrl(e.demoVideoUrl ?? '');
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Could not load this exercise.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  const showsPattern = type === 'strength' || type === 'plyometric';

  const savingRef = useRef(false);

  async function save() {
    if (savingRef.current) return;
    const input: CustomExerciseInput = {
      name,
      exerciseType: type,
      unilateral,
      bodyParts: parseTagList(bodyParts),
      equipment: parseTagList(equipment),
      description: description.trim() || null,
      demoVideoUrl: url.trim() || null,
      movementPattern: showsPattern ? pattern : undefined,
    };
    const problem = validateCustomExercise(input);
    if (problem) {
      Alert.alert('Check the form', problem);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      if (id) {
        await updateCustomExercise(id, input);
      } else {
        const newId = await createCustomExercise(input);
        if (returnTo === 'picker') setPendingPickedExercise(newId);
      }
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save this exercise.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete exercise?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCustomExercise(id!);
            // Two screens deep (library > detail > edit): the detail screen
            // is stale now, so go back to the library list.
            router.dismissTo('/library');
          } catch (err: any) {
            // Includes the clear "used in your history" message for FK 23503.
            Alert.alert('Cannot delete', err?.message ?? 'Could not delete this exercise.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.screenContent} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editing ? 'Edit exercise' : 'New exercise' }} />
      <View style={sharedStyles.card}>
        <Text style={TYPE.label}>Name</Text>
        <TextInput style={sharedStyles.textInput} value={name} onChangeText={setName} maxLength={80} placeholder="e.g. Cat-cow" placeholderTextColor={COLORS.muted} />

        <Text style={TYPE.label}>Type</Text>
        <View style={styles.segment}>
          {TYPES.map((t) => (
            <Pressable key={t.value} onPress={() => setType(t.value)} style={[sharedStyles.chip, type === t.value && styles.chipActive]}>
              <Text style={[sharedStyles.chipText, type === t.value && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {showsPattern ? (
          <>
            <Text style={TYPE.label}>Movement pattern</Text>
            <View style={styles.segment}>
              {MOVEMENT_PATTERNS.map((p) => (
                <Pressable key={p} onPress={() => setPattern(p)} style={[sharedStyles.chip, pattern === p && styles.chipActive]}>
                  <Text style={[sharedStyles.chipText, pattern === p && styles.chipTextActive]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={TYPE.label}>One side at a time</Text>
          <Switch value={unilateral} onValueChange={setUnilateral} trackColor={{ true: COLORS.accent }} />
        </View>

        <Text style={TYPE.label}>Body parts</Text>
        <TextInput style={sharedStyles.textInput} value={bodyParts} onChangeText={setBodyParts} placeholder="comma separated, e.g. neck, upper back" placeholderTextColor={COLORS.muted} autoCapitalize="none" />
        <Text style={TYPE.label}>Equipment</Text>
        <TextInput style={sharedStyles.textInput} value={equipment} onChangeText={setEquipment} placeholder="comma separated, e.g. band, wall" placeholderTextColor={COLORS.muted} autoCapitalize="none" />
        <Text style={TYPE.label}>Description</Text>
        <TextInput style={[sharedStyles.textInput, styles.multiline]} value={description} onChangeText={setDescription} multiline placeholder="Cues, setup, why it helps" placeholderTextColor={COLORS.muted} />
        <Text style={TYPE.label}>Demo link</Text>
        <TextInput style={sharedStyles.textInput} value={url} onChangeText={setUrl} placeholder="https://" placeholderTextColor={COLORS.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      </View>

      <Pressable style={[sharedStyles.primaryButton, saving && styles.disabled]} onPress={save} disabled={saving}>
        <Text style={sharedStyles.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>
      {editing ? (
        <Pressable style={styles.deleteButton} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Delete exercise</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chipActive: { backgroundColor: COLORS.accent },
  chipTextActive: { color: COLORS.card },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  disabled: { opacity: 0.6 },
  deleteButton: { alignItems: 'center', paddingVertical: SPACING.sm },
  deleteText: { ...TYPE.body, color: COLORS.danger, fontWeight: '600' },
});
