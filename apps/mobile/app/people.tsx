// apps/mobile/app/people.tsx
//
// People search by handle or display name (debounced). Blocked users never
// appear: their profile rows are hidden by RLS.
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../lib/theme';
import PersonRow from '../components/social/PersonRow';
import { searchProfiles } from '../lib/social/follows';
import type { ProfileCard } from '../lib/social/profiles';

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

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.searchBox}>
        <TextInput
          style={sharedStyles.textInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by handle or name"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </View>
      {error ? (
        <View style={styles.centered}>
          <Text style={TYPE.body}>{error}</Text>
          <Pressable style={[sharedStyles.primaryButton, loading && styles.dim]} disabled={loading} onPress={() => setAttempt((a) => a + 1)}>
            <Text style={sharedStyles.primaryButtonText}>{loading ? 'Retrying…' : 'Try again'}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={sharedStyles.screenContent}
          ListHeaderComponent={loading ? <ActivityIndicator color={COLORS.accent} /> : null}
          ListEmptyComponent={
            <Text style={sharedStyles.helperText}>
              {searched && !loading ? 'No one found.' : 'Find friends by their @handle or name.'}
            </Text>
          }
          renderItem={({ item }) => <PersonRow person={item} onPress={() => router.push(`/profile/${item.id}`)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { padding: SPACING.md, paddingBottom: 0 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.6 },
});
