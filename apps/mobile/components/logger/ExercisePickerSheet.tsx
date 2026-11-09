// apps/mobile/components/logger/ExercisePickerSheet.tsx
//
// Picks from the mobility library (+ the user's own exercises); never the old
// gym rows. "+ Create exercise" hands off to the library form via onCreate.
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { EMPTY_FILTER, facetValues, filterLibrary, type LibraryExercise, type LibraryFilter } from '../../lib/library';
import FilterChips from '../library/FilterChips';
import { typeLabel } from '../library/ExerciseListRow';

export interface ExercisePickerSheetProps {
  visible: boolean;
  catalog: readonly LibraryExercise[];
  onPick: (e: LibraryExercise) => void;
  onClose: () => void;
  /** Shows a "+ Create exercise" row; the caller closes the sheet and opens the form. */
  onCreate?: () => void;
}

export default function ExercisePickerSheet({ visible, catalog, onPick, onClose, onCreate }: ExercisePickerSheetProps) {
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);

  useEffect(() => {
    if (!visible) setFilter(EMPTY_FILTER);
  }, [visible]);

  const facets = facetValues(catalog);
  const rows = filterLibrary(catalog, filter);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[sharedStyles.screen, styles.body]}>
        <View style={styles.header}>
          <Text style={TYPE.sectionTitle}>Add exercise</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <TextInput
          style={sharedStyles.textInput}
          value={filter.query}
          onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
          placeholder="Search exercises"
          placeholderTextColor={COLORS.muted}
          autoCorrect={false}
        />
        <FilterChips
          options={facets.types.map((t) => ({ label: typeLabel(t) || t, value: t }))}
          value={filter.exerciseType}
          onChange={(exerciseType) => setFilter((f) => ({ ...f, exerciseType }))}
        />
        <FilterChips
          options={facets.bodyParts.map((b) => ({ label: b, value: b }))}
          value={filter.bodyPart}
          onChange={(bodyPart) => setFilter((f) => ({ ...f, bodyPart }))}
        />
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            onCreate ? (
              <Pressable style={styles.row} onPress={onCreate}>
                <Text style={[TYPE.body, styles.create]}>+ Create exercise</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={sharedStyles.helperText}>No exercises match.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPick(item)}>
              <Text style={TYPE.body}>{item.name}</Text>
              <Text style={sharedStyles.helperText}>{item.isMine ? 'Mine' : typeLabel(item.exerciseType)}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: SPACING.md, gap: SPACING.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { ...TYPE.label, color: COLORS.accent },
  create: { color: COLORS.accent, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
});
