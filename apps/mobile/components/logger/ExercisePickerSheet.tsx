// apps/mobile/components/logger/ExercisePickerSheet.tsx
//
// Picks from the mobility library (+ the user's own exercises); never the old
// gym rows. "+ Create exercise" hands off to the library form via onCreate.
// Visual spec 4.6: tall Sheet, search, filter chips, rows.
// TODO(stage4): spec asks for multi-select with an "Add N exercises" footer; the logger's
// onPick adds exactly one exercise and closes, so tapping a row still adds it immediately.
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { bodyPartLabel } from '../../lib/bodyParts';
import { EMPTY_FILTER, facetValues, filterLibrary, type LibraryExercise, type LibraryFilter } from '../../lib/library';
import { typeLabel } from '../library/ExerciseListRow';
import { Button, FilterChip, FilterChipRow, PressableScale, Sheet, TextField } from '../ui';

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
  const query = filter.query.trim();

  return (
    <Sheet visible={visible} onClose={onClose} title="Add exercise" snap="tall" scrollable={false}>
      <View style={styles.body}>
        <TextField
          value={filter.query}
          onChangeText={(q) => setFilter((f) => ({ ...f, query: q }))}
          placeholder="Search exercises"
          leftIcon="search"
          autoCorrect={false}
          accessibilityLabel="Search exercises"
        />
        <FilterChipRow style={styles.chips}>
          {facets.types.map((t) => (
            <FilterChip
              key={`t-${t}`}
              label={typeLabel(t) || t}
              selected={filter.exerciseType === t}
              onToggle={() => setFilter((f) => ({ ...f, exerciseType: f.exerciseType === t ? null : t }))}
            />
          ))}
        </FilterChipRow>
        <FilterChipRow style={styles.chips}>
          {facets.bodyParts.map((b) => (
            <FilterChip
              key={`b-${b}`}
              label={bodyPartLabel(b)}
              selected={filter.bodyPart === b}
              onToggle={() => setFilter((f) => ({ ...f, bodyPart: f.bodyPart === b ? null : b }))}
            />
          ))}
        </FilterChipRow>
        <FlatList
          style={styles.list}
          data={rows}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            onCreate ? (
              <PressableScale style={styles.row} scaleTo={0.98} onPress={onCreate} accessibilityLabel="Create exercise">
                <Ionicons name="create-outline" size={20} color={COLORS.accent} />
                <Text style={[TYPE.bodyStrong, styles.create]}>Create exercise</Text>
              </PressableScale>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={TYPE.callout}>{query ? `No exercises match “${query}”.` : 'No exercises match.'}</Text>
              {query && onCreate ? <Button title={`Create “${query}”`} variant="ghost" onPress={onCreate} /> : null}
            </View>
          }
          renderItem={({ item }) => {
            const sub = [typeLabel(item.exerciseType), item.bodyParts.map(bodyPartLabel).join(', ')].filter(Boolean).join(' · ');
            return (
              <PressableScale style={styles.row} scaleTo={0.98} onPress={() => onPick(item)} accessibilityLabel={`Add ${item.name}`}>
                <View style={styles.text}>
                  <Text style={TYPE.bodyStrong} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {sub || item.isMine ? (
                    <Text style={TYPE.footnote} numberOfLines={1}>
                      {item.isMine ? `Mine${sub ? ` · ${sub}` : ''}` : sub}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="add-circle" size={24} color={COLORS.accent} />
              </PressableScale>
            );
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: SPACING.sm },
  chips: { marginHorizontal: -SPACING.lg },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 56,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  text: { flex: 1, gap: 2 },
  create: { color: COLORS.accent },
  empty: { paddingVertical: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
});
