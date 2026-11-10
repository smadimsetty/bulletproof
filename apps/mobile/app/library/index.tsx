// apps/mobile/app/library/index.tsx
//
// The exercise library (visual spec 4.12): mobility content plus the user's own
// exercises, with search and body part / type / equipment / "Mine" filters, as an
// alphabetical sectioned list with sticky letters.
// TODO(stage4): spec's Equipment sheet is multi-select; LibraryFilter.equipment is a single
// value (changing it alters the filter model), so the sheet is single-select.
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as haptics from '../../lib/haptics';
import { COLORS, SPACING, TYPE } from '../../lib/theme';
import { bodyPartLabel } from '../../lib/bodyParts';
import { EMPTY_FILTER, facetValues, fetchLibrary, filterLibrary, type LibraryExercise, type LibraryFilter } from '../../lib/library';
import ExerciseListRow, { typeLabel } from '../../components/library/ExerciseListRow';
import { Button, EmptyState, ErrorState, FilterChip, FilterChipRow, IconButton, ListRow, Sheet, SkeletonRow, TextField } from '../../components/ui';

function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

export default function LibraryScreen() {
  const router = useRouter();
  const [list, setList] = useState<LibraryExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);
  const [equipmentOpen, setEquipmentOpen] = useState(false);

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
  const sections = useMemo(() => {
    const byLetter = new Map<string, LibraryExercise[]>();
    for (const e of rows) {
      const l = letterOf(e.name);
      byLetter.set(l, [...(byLetter.get(l) ?? []), e]);
    }
    return [...byLetter.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))).map(([title, data]) => ({ title, data }));
  }, [rows]);
  const hasMine = (list ?? []).some((e) => e.isMine);
  const set = (patch: Partial<LibraryFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const activeCount = (filter.bodyPart ? 1 : 0) + (filter.exerciseType ? 1 : 0) + (filter.equipment ? 1 : 0) + (filter.mineOnly ? 1 : 0);
  const query = filter.query.trim();

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Exercises',
          headerRight: () => <IconButton icon="add" size="sm" accessibilityLabel="New exercise" onPress={() => router.push('/library/new')} />,
        }}
      />
      <View style={styles.search}>
        <TextField
          value={filter.query}
          onChangeText={(q) => set({ query: q })}
          placeholder="Search exercises"
          leftIcon="search"
          autoCorrect={false}
          accessibilityLabel="Search exercises"
        />
      </View>
      {list ? (
        <>
          <FilterChipRow>
            {hasMine ? <FilterChip label="Mine" selected={filter.mineOnly} onToggle={() => set({ mineOnly: !filter.mineOnly })} /> : null}
            {facets.types.map((t) => (
              <FilterChip
                key={`t-${t}`}
                label={typeLabel(t) || t}
                selected={filter.exerciseType === t}
                onToggle={() => set({ exerciseType: filter.exerciseType === t ? null : t })}
              />
            ))}
            {facets.equipment.length > 0 ? (
              <FilterChip label={filter.equipment ?? 'Equipment'} selected={!!filter.equipment} onToggle={() => setEquipmentOpen(true)} />
            ) : null}
            {activeCount > 0 ? (
              <Button
                title={`Clear (${activeCount})`}
                variant="ghost"
                size="sm"
                onPress={() => set({ bodyPart: null, exerciseType: null, equipment: null, mineOnly: false })}
              />
            ) : null}
          </FilterChipRow>
          <FilterChipRow>
            {facets.bodyParts.map((b) => (
              <FilterChip key={`b-${b}`} label={bodyPartLabel(b)} selected={filter.bodyPart === b} onToggle={() => set({ bodyPart: filter.bodyPart === b ? null : b })} />
            ))}
          </FilterChipRow>
        </>
      ) : null}

      {list === null && !error ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 10 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : error && list === null ? (
        <ErrorState
          message={error}
          retrying={retrying}
          onRetry={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          indicatorStyle="white"
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={COLORS.accent}
              onRefresh={() => {
                haptics.tap();
                refresh();
              }}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.letter}>
              <Text style={TYPE.overline}>{section.title}</Text>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No exercises match"
              body="Try fewer filters."
              action={{ label: 'Clear filters', onPress: () => setFilter(EMPTY_FILTER) }}
              secondaryAction={query ? { label: `Create “${query}”`, onPress: () => router.push('/library/new') } : undefined}
              style={styles.empty}
            />
          }
          renderItem={({ item }) => <ExerciseListRow exercise={item} onPress={() => router.push(`/exercise/${item.id}`)} />}
        />
      )}

      <Sheet visible={equipmentOpen} onClose={() => setEquipmentOpen(false)} title="Equipment">
        <View>
          <ListRow
            title="Any equipment"
            trailing={!filter.equipment ? <Text style={[TYPE.callout, { color: COLORS.accent }]}>Selected</Text> : undefined}
            onPress={() => {
              set({ equipment: null });
              setEquipmentOpen(false);
            }}
          />
          {facets.equipment.map((e) => (
            <ListRow
              key={e}
              title={e}
              trailing={filter.equipment === e ? <Text style={[TYPE.callout, { color: COLORS.accent }]}>Selected</Text> : undefined}
              onPress={() => {
                set({ equipment: e });
                setEquipmentOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingTop: SPACING.sm },
  search: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xs },
  skeletons: { paddingHorizontal: SPACING.lg, gap: SPACING.xs },
  listContent: { paddingBottom: SPACING.xxl },
  letter: { backgroundColor: 'rgba(11,12,15,0.95)', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  empty: { marginTop: SPACING.xxl },
});
