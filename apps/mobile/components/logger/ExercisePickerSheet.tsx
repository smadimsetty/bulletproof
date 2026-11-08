import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import { filterExercises, type CatalogExercise } from '../../lib/exerciseSearch';

export interface ExercisePickerSheetProps {
  visible: boolean;
  catalog: readonly CatalogExercise[];
  onPick: (e: CatalogExercise) => void;
  onClose: () => void;
}

const CHIPS: { label: string; type: string | null }[] = [
  { label: 'All', type: null },
  { label: 'Mobility', type: 'mobility_stretch' },
  { label: 'Balance', type: 'balance' },
  { label: 'Strength', type: 'strength' },
  { label: 'Plyo', type: 'plyometric' },
  { label: 'Cardio', type: 'cardio' },
];

function typeLabel(type: string | null): string {
  return CHIPS.find((c) => c.type !== null && c.type === type)?.label ?? '';
}

export default function ExercisePickerSheet({ visible, catalog, onPick, onClose }: ExercisePickerSheetProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setType(null);
    }
  }, [visible]);

  const rows = filterExercises(catalog, query, type);

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
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={COLORS.muted}
          autoCorrect={false}
        />
        <FlatList
          horizontal
          data={CHIPS}
          keyExtractor={(c) => c.label}
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => {
            const active = item.type === type;
            return (
              <Pressable onPress={() => setType(item.type)} style={[sharedStyles.chip, active && styles.chipActive]}>
                <Text style={[sharedStyles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
        <FlatList
          data={rows}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={sharedStyles.helperText}>No exercises match.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPick(item)}>
              <Text style={TYPE.body}>{item.name}</Text>
              <Text style={sharedStyles.helperText}>{typeLabel(item.exerciseType)}</Text>
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
  chips: { flexGrow: 0 },
  chipsContent: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  chipActive: { backgroundColor: COLORS.accent },
  chipTextActive: { color: COLORS.card },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
});
