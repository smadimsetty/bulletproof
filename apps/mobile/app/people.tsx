// apps/mobile/app/people.tsx
//
// People search by handle or display name (debounced), visual spec 4.20. Blocked users never
// appear: their profile rows are hidden by RLS.
// TODO(stage4): spec shows a trailing FollowButton sm on each result; search results carry no
// follow status (ProfileCard has none), so tapping a row opens the profile where Follow lives.
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '../lib/theme';
import PersonRow from '../components/social/PersonRow';
import { searchProfiles } from '../lib/social/follows';
import type { ProfileCard } from '../lib/social/profiles';
import { EmptyState, ErrorState, IconButton, SkeletonRow, TextField } from '../components/ui';

export default function PeopleScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileCard[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Try again" so the effect re-runs the same query.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearched(false);
      setError(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      searchProfiles(q)
        .then((r) => {
          if (!live) return;
          setResults(r);
          setSearched(true);
          setError(null);
        })
        .catch((err) => live && setError(err?.message ?? 'Search failed.'))
        .finally(() => live && setLoading(false));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, attempt]);

  const q = query.trim();
  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search by handle or name"
          leftIcon="search"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search people"
          right={
            query.length > 0 ? (
              <IconButton icon="close-circle" size="sm" accessibilityLabel="Clear search" onPress={() => setQuery('')} />
            ) : undefined
          }
        />
      </View>
      {error ? (
        <ErrorState message={error} retrying={loading} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loading ? (
        <View style={styles.skeletons}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          indicatorStyle="white"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            searched ? (
              <EmptyState compact icon="search-outline" title={`No one matches “${q}”`} body="Check the spelling or try their handle." />
            ) : (
              <EmptyState compact icon="search-outline" title="Find friends by name or handle" />
            )
          }
          renderItem={({ item }) => <PersonRow person={item} onPress={() => router.push(`/profile/${item.id}`)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  searchBox: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  skeletons: { paddingHorizontal: SPACING.lg, gap: SPACING.xs },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
});
