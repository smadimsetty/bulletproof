// apps/mobile/app/people.tsx
//
// People search by handle or display name (debounced), visual spec 4.20. Blocked users never
// appear: their profile rows are hidden by RLS. With the search box empty, the screen offers
// "Find friends from your contacts" and adding your own phone so friends can find you.
// TODO(stage4): spec shows a trailing FollowButton sm on each result; search results carry no
// follow status (ProfileCard has none), so tapping a row opens the profile where Follow lives.
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '../lib/theme';
import PersonRow from '../components/social/PersonRow';
import { searchProfiles } from '../lib/social/follows';
import type { ProfileCard } from '../lib/social/profiles';
import { Button, Card, EmptyState, ErrorState, IconButton, ListRow, SectionHeader, SkeletonRow, TextField } from '../components/ui';
import PhoneVerifySheet from '../components/social/PhoneVerifySheet';
import { fetchMyPhone, findFriendsInContacts, type MyPhone } from '../lib/social/contactSync';
import { TYPE } from '../lib/theme';

export default function PeopleScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileCard[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Try again" so the effect re-runs the same query.
  const [attempt, setAttempt] = useState(0);
  const [myPhone, setMyPhone] = useState<MyPhone | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [contactFriends, setContactFriends] = useState<ProfileCard[] | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetchMyPhone().then(setMyPhone).catch(() => setMyPhone(null));
  }, []);

  const checkContacts = useCallback(async () => {
    setChecking(true);
    try {
      const r = await findFriendsInContacts();
      if (r.kind === 'denied') {
        Alert.alert('Contacts access is off', 'Allow MoveMaxx to see your contacts in Settings to find friends.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      setContactFriends(r.friends);
    } catch (err: any) {
      Alert.alert('Could not check contacts', err?.message ?? 'Try again.');
    } finally {
      setChecking(false);
    }
  }, []);

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
              <View style={styles.contacts}>
                <SectionHeader title="From your contacts" inset={0} />
                {contactFriends === null ? (
                  <Card>
                    <View style={styles.contactsCard}>
                      <Text style={TYPE.bodyStrong}>See which friends are on MoveMaxx</Text>
                      <Text style={TYPE.footnote}>We check the phone numbers in your contacts. Nothing is saved.</Text>
                      <Button title="Check my contacts" icon="people-outline" loading={checking} onPress={checkContacts} />
                    </View>
                  </Card>
                ) : contactFriends.length === 0 ? (
                  <EmptyState
                    compact
                    icon="people-outline"
                    title="None of your contacts are here yet"
                    body="Friends show up once they add their phone number in MoveMaxx."
                    action={{ label: 'Check again', onPress: checkContacts, loading: checking }}
                  />
                ) : (
                  contactFriends.map((p) => <PersonRow key={p.id} person={p} onPress={() => router.push(`/profile/${p.id}`)} />)
                )}
                {myPhone && !myPhone.confirmed ? (
                  <ListRow
                    title="Add your phone number"
                    subtitle="So friends with your number can find you"
                    leading={{ icon: 'call-outline' }}
                    trailing="chevron"
                    onPress={() => setPhoneOpen(true)}
                  />
                ) : null}
              </View>
            )
          }
          renderItem={({ item }) => <PersonRow person={item} onPress={() => router.push(`/profile/${item.id}`)} />}
        />
      )}
      <PhoneVerifySheet
        visible={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        onVerified={(e164) => setMyPhone({ phone: e164, confirmed: true })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  searchBox: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  skeletons: { paddingHorizontal: SPACING.lg, gap: SPACING.xs },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  contacts: { gap: SPACING.md },
  contactsCard: { gap: SPACING.sm },
});
