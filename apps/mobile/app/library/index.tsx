// apps/mobile/app/library/index.tsx
//
// The exercise library: mobility content plus the user's own exercises, with
// search and body part / type / equipment / "Mine" filters.
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles } from '../../lib/theme';
import { EMPTY_FILTER, facetValues, fetchLibrary, filterLibrary, type LibraryExercise, type LibraryFilter } from '../../lib/library';
import FilterChips from '../../components/library/FilterChips';
import ExerciseListRow, { typeLabel } from '../../components/library/ExerciseListRow';

export default function LibraryScreen() {
  const router = useRouter();
  const [list, setList] = useState<LibraryExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);

  const load = useCallback(async () => {
    try {
      setList(await fetchLibrary());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load exercises.');
    }
  }, []);
  // Refetch on focus so a just-created/edited/deleted custom exercise shows up.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const facets = useMemo(() => facetValues(list ?? []), [list]);
  const rows = useMemo(() => filterLibrary(list ?? [], filter), [list, filter]);
  const hasMine = (list ?? []).some((e) => e.isMine);
  const set = (patch: Partial<LibraryFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <View style={[sharedStyles.screen, styles.body]}>
      <Stack.Screen
        options={{
          title: 'Exercises',
          headerRight: () => (
            <Pressable onPress={() => router.push('/library/new')} hitSlop={8} accessibilityLabel="New exercise">
              <Ionicons name="add" size={26} color={COLORS.accent} />
            </Pressable>
          ),
        }}
      />
      <TextInput
        style={sharedStyles.textInput}
        value={filter.query}
        onChangeText={(query) => set({ query })}
        placeholder="Search exercises"
        placeholderTextColor={COLORS.muted}
        autoCorrect={false}
      />
      <FilterChips
        options={facets.bodyParts.map((b) => ({ label: b, value: b }))}
        value={filter.bodyPart}
        onChange={(bodyPart) => set({ bodyPart })}
      />
      <FilterChips
        options={facets.types.map((t) => ({ label: typeLabel(t) || t, value: t }))}
        value={filter.exerciseType}
        onChange={(exerciseType) => set({ exerciseType })}
      />
      <FilterChips
        options={facets.equipment.map((e) => ({ label: e, value: e }))}
        value={filter.equipment}
        onChange={(equipment) => set({ equipment })}
      />
      {hasMine ? (
        <FilterChips
          options={[{ label: 'Mine', value: 'mine' }]}
          value={filter.mineOnly ? 'mine' : null}
          onChange={(v) => set({ mineOnly: v === 'mine' })}
        />
      ) : null}
      {list === null && !error ? (
        <ActivityIndicator color={COLORS.accent} />
      ) : error ? (
        <Text style={sharedStyles.warningText}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={sharedStyles.helperText}>No exercises match.</Text>}
          renderItem={({ item }) => <ExerciseListRow exercise={item} onPress={() => router.push(`/exercise/${item.id}`)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACING.md, gap: SPACING.sm },
});
