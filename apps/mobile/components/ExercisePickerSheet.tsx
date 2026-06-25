// Shared bottom-sheet catalog browser for both the per-row swap action
// and the global "+ Add an exercise" action -- same modal/list shell,
// different filterPredicate supplied by the caller (lib/exerciseCatalog.ts's
// buildSwapFilter/buildAddFilter), per design spec Decision 13. Visually
// mirrors components/DropdownAddSection.tsx's bottom-sheet modal pattern
// without importing it directly -- DropdownAddSection is wired for
// multi/single-select-with-persistence semantics that don't fit this
// one-shot "pick one exercise" action.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, RADII, SPACING, sharedStyles, TYPE } from '../lib/theme';
import type { CatalogExercise } from '../lib/exerciseCatalog';

export interface ExercisePickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly catalog: readonly CatalogExercise[];
  readonly filterPredicate: (exercise: CatalogExercise) => boolean;
  readonly onSelect: (exercise: CatalogExercise) => void;
  readonly onClose: () => void;
}

export default function ExercisePickerSheet({
  visible,
  title,
  catalog,
  filterPredicate,
  onSelect,
  onClose,
}: ExercisePickerSheetProps) {
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const filtered = catalog.filter(filterPredicate);
    const term = search.trim().toLowerCase();
    if (term === '') {
      return filtered;
    }
    return filtered.filter((exercise) => exercise.name.toLowerCase().includes(term));
  }, [catalog, filterPredicate, search]);

  function handleSelect(exercise: CatalogExercise) {
    setSearch('');
    onSelect(exercise);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={sharedStyles.sectionTitle}>{title}</Text>
          <TextInput
            style={sharedStyles.textInput}
            placeholder="Search exercises"
            value={search}
            onChangeText={setSearch}
          />
          <ScrollView>
            {options.map((exercise) => (
              <Pressable key={exercise.id} style={styles.row} onPress={() => handleSelect(exercise)}>
                <Text style={TYPE.body}>{exercise.name}</Text>
                {exercise.defaultRepRange && (
                  <Text style={sharedStyles.helperText}>{exercise.defaultRepRange}</Text>
                )}
              </Pressable>
            ))}
            {options.length === 0 && (
              <Text style={sharedStyles.helperText}>No matching exercises found.</Text>
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADII.card,
    borderTopRightRadius: RADII.card,
    maxHeight: '75%',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  row: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
