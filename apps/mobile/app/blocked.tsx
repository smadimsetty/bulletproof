// apps/mobile/app/blocked.tsx
//
// Users I have blocked, with Unblock.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING, sharedStyles, TYPE } from '../lib/theme';
import Avatar from '../components/social/Avatar';
import { fetchBlocked, unblock, type BlockedUser } from '../lib/social/safety';

export default function BlockedScreen() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchBlocked());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function confirmUnblock(u: BlockedUser) {
    Alert.alert(`Unblock ${u.handle ? '@' + u.handle : u.displayName}?`, 'They will be able to find you again. Follows are not restored.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setBusyId(u.id);
          try {
            await unblock(u.id);
            setUsers((prev) => prev.filter((x) => x.id !== u.id));
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Could not unblock.');
          } finally {
            setBusyId(null);
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
  if (error) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Text style={TYPE.body}>{error}</Text>
        <Pressable
          style={[sharedStyles.primaryButton, retrying && styles.dim]}
          disabled={retrying}
          onPress={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
        >
          <Text style={sharedStyles.primaryButtonText}>{retrying ? 'Retrying…' : 'Try again'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.screenContent}
      data={users}
      keyExtractor={(u) => u.id}
      ListEmptyComponent={<Text style={sharedStyles.helperText}>You have not blocked anyone.</Text>}
      renderItem={({ item }) => (
        <View style={[sharedStyles.card, styles.row]}>
          <Avatar path={null} name={item.displayName} size={40} />
          <View style={styles.text}>
            <Text style={TYPE.label}>{item.displayName}</Text>
            {!!item.handle && <Text style={sharedStyles.helperText}>@{item.handle}</Text>}
          </View>
          <Pressable disabled={busyId === item.id} onPress={() => confirmUnblock(item)} hitSlop={8}>
            <Text style={[styles.unblock, busyId === item.id && styles.dim]}>Unblock</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  text: { flex: 1 },
  unblock: { color: COLORS.accent, fontWeight: '600' },
});
