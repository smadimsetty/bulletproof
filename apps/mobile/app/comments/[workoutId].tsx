// apps/mobile/app/comments/[workoutId].tsx
//
// Comments on a workout: list, composer (500 max), long-press to delete (my
// own, or any comment on my workout) or report. Word-filter rejections show
// the server's message.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, sharedStyles, TYPE } from '../../lib/theme';
import Avatar from '../../components/social/Avatar';
import {
  addComment, deleteComment, fetchComments, fetchWorkoutOwnerId, type Comment,
} from '../../lib/social/interactions';
import { COMMENT_MAX, commentError } from '../../lib/social/commentRules';
import { relativeTime } from '../../lib/social/time';
import { getMyId } from '../../lib/session';
import { useSafety } from '../../components/social/ReportSheet';

export default function CommentsScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [workoutOwnerId, setWorkoutOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const postingRef = useRef(false);
  const listRef = useRef<FlatList<Comment>>(null);
  const safety = useSafety();

  const load = useCallback(async () => {
    try {
      const [list, me, owner] = await Promise.all([fetchComments(workoutId), getMyId(), fetchWorkoutOwnerId(workoutId)]);
      setComments(list);
      setMeId(me);
      setWorkoutOwnerId(owner);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load comments.');
    } finally {
      setLoading(false);
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    if (postingRef.current) return;
    const problem = commentError(draft);
    if (problem) {
      setPostError(problem);
      return;
    }
    postingRef.current = true;
    setPosting(true);
    setPostError(null);
    try {
      await addComment(workoutId, draft);
      setDraft('');
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      setPostError(err?.message ?? 'Could not post your comment.');
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  function openMenu(c: Comment) {
    const canDelete = c.ownerId === meId || workoutOwnerId === meId;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (canDelete) {
      buttons.push({
        text: 'Delete comment',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(c.id);
            setComments((prev) => prev.filter((x) => x.id !== c.id));
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Could not delete the comment.');
          }
        },
      });
    }
    if (c.ownerId !== meId) {
      buttons.push({
        text: 'Report comment',
        onPress: () =>
          safety.openReport({
            type: 'comment',
            id: c.id,
            label: 'this comment',
            // Reported content disappears for the reporter right away.
            after: () => setComments((prev) => prev.filter((x) => x.id !== c.id)),
          }),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    if (buttons.length === 1) return;
    Alert.alert('Comment', undefined, buttons);
  }

  if (loading) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Comments' }} />
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={[sharedStyles.screen, styles.centered]}>
        <Stack.Screen options={{ title: 'Comments' }} />
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

  const now = new Date();
  return (
    <KeyboardAvoidingView style={sharedStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: 'Comments' }} />
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(c) => c.id}
        contentContainerStyle={sharedStyles.screenContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={sharedStyles.helperText}>No comments yet. Be the first.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onLongPress={() => openMenu(item)} delayLongPress={350}>
            <Pressable onPress={() => item.author && router.push(`/profile/${item.author.id}`)}>
              <Avatar path={item.author?.avatarPath} name={item.author?.displayName ?? '?'} size={34} />
            </Pressable>
            <View style={styles.rowText}>
              <Text style={TYPE.label}>
                {item.author?.displayName ?? 'Someone'}{' '}
                <Text style={sharedStyles.helperText}>{relativeTime(item.createdAt, now)}</Text>
              </Text>
              <Text style={TYPE.body}>{item.body}</Text>
              {item.hidden && <Text style={sharedStyles.helperText}>Hidden pending review</Text>}
            </View>
          </Pressable>
        )}
      />
      {safety.element}
      <View style={styles.composer}>
        {postError && <Text style={sharedStyles.warningText}>{postError}</Text>}
        <View style={styles.composerRow}>
          <TextInput
            style={[sharedStyles.textInput, styles.input]}
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setPostError(null);
            }}
            placeholder="Add a comment"
            placeholderTextColor={COLORS.muted}
            multiline
            maxLength={COMMENT_MAX}
          />
          <Pressable
            style={[styles.send, (posting || draft.trim() === '') && styles.dim]}
            disabled={posting || draft.trim() === ''}
            onPress={post}
            accessibilityLabel="Post comment"
          >
            {posting ? <ActivityIndicator color={COLORS.card} /> : <Ionicons name="arrow-up" size={20} color={COLORS.card} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.md },
  dim: { opacity: 0.5 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  rowText: { flex: 1, gap: 2 },
  composer: { padding: SPACING.md, gap: SPACING.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: COLORS.card },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  input: { flex: 1, maxHeight: 110 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
});
