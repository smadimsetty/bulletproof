// apps/mobile/app/comments/[workoutId].tsx
//
// Comments on a workout (visual spec 4.16): list, composer (500 max), long-press for delete
// (my own, or any comment on my workout) or report. Word-filter rejections show the server's
// message under the field.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as haptics from '../../lib/haptics';
import { COLORS, MOTION, SPACING, TYPE } from '../../lib/theme';
import Avatar from '../../components/social/Avatar';
import {
  addComment, deleteComment, fetchComments, fetchWorkoutOwnerId, type Comment,
} from '../../lib/social/interactions';
import { COMMENT_MAX, commentError } from '../../lib/social/commentRules';
import { relativeTime } from '../../lib/social/time';
import { getMyId } from '../../lib/session';
import { useSafety } from '../../components/social/ReportSheet';
import { ActionSheet, EmptyState, ErrorState, PressableScale, SkeletonRow, TextField, type ActionSheetAction } from '../../components/ui';

// Let an ActionSheet finish dismissing before the next Modal presents (iOS drops overlapping presentations).
const SHEET_HANDOFF_MS = 350;

export default function CommentsScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [workoutOwnerId, setWorkoutOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [menuComment, setMenuComment] = useState<Comment | null>(null);
  // Comments that mount after the first load fade in; the initial list doesn't.
  const [animateNew, setAnimateNew] = useState(false);
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
      setAnimateNew(true);
    }
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    if (postingRef.current) return;
    const problem = commentError(draft);
    if (problem) {
      haptics.error();
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
      haptics.error();
      setPostError(err?.message ?? 'Could not post your comment.');
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  function menuActions(c: Comment): ActionSheetAction[] {
    const canDelete = c.ownerId === meId || workoutOwnerId === meId;
    const actions: ActionSheetAction[] = [];
    if (canDelete) {
      actions.push({
        label: 'Delete comment',
        icon: 'trash-outline',
        destructive: true,
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
      actions.push({
        label: 'Report comment',
        icon: 'flag-outline',
        onPress: () =>
          setTimeout(
            () =>
              safety.openReport({
                type: 'comment',
                id: c.id,
                label: 'this comment',
                blockUser: c.author ?? undefined,
                // Reported content disappears for the reporter right away.
                after: () => setComments((prev) => prev.filter((x) => x.id !== c.id)),
              }),
            SHEET_HANDOFF_MS
          ),
      });
    }
    return actions;
  }

  function openMenu(c: Comment) {
    if (menuActions(c).length === 0) return;
    haptics.primary();
    setMenuComment(c);
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Comments' }} />
        <View style={styles.pad}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: 'Comments' }} />
        <View style={styles.pad}>
          <ErrorState
            message={error}
            retrying={retrying}
            onRetry={async () => {
              setRetrying(true);
              await load();
              setRetrying(false);
            }}
          />
        </View>
      </View>
    );
  }

  const now = new Date();
  const empty = draft.trim() === '';
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: 'Comments' }} />
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(c) => c.id}
        indicatorStyle="white"
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={async () => {
              haptics.tap();
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState compact icon="chatbubble-outline" title="No comments yet" body="Say something nice." style={styles.empty} />
        }
        renderItem={({ item }) => (
          <Animated.View entering={animateNew ? FadeInDown.duration(MOTION.base) : undefined}>
            <PressableScale
              style={styles.row}
              scaleTo={0.99}
              haptic="none"
              onLongPress={() => openMenu(item)}
              delayLongPress={350}
              accessibilityLabel={`Comment by ${item.author?.displayName ?? 'someone'}. Long press for options.`}
            >
              <PressableScale haptic="tap" onPress={() => item.author && router.push(`/profile/${item.author.id}`)} accessibilityLabel="Open profile">
                <Avatar path={item.author?.avatarPath} name={item.author?.displayName ?? '?'} size="sm" />
              </PressableScale>
              <View style={styles.rowText}>
                <Text style={TYPE.bodyStrong}>
                  {item.author?.displayName ?? 'Someone'}{' '}
                  <Text style={TYPE.footnote}>{relativeTime(item.createdAt, now)}</Text>
                </Text>
                <Text style={TYPE.body}>{item.body}</Text>
                {item.hidden ? <Text style={TYPE.footnote}>Hidden pending review</Text> : null}
              </View>
            </PressableScale>
          </Animated.View>
        )}
      />
      <ActionSheet
        visible={menuComment !== null}
        onClose={() => setMenuComment(null)}
        title="Comment"
        actions={menuComment ? menuActions(menuComment) : []}
      />
      {safety.element}
      <View style={styles.composer}>
        <View style={styles.composerRow}>
          <TextField
            containerStyle={styles.input}
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setPostError(null);
            }}
            placeholder="Add a comment"
            multiline
            maxLength={COMMENT_MAX}
            fieldStyle={styles.field}
            error={postError ?? undefined}
          />
          <PressableScale
            haptic="primary"
            disabled={posting || empty}
            onPress={post}
            style={styles.send}
            accessibilityLabel="Post comment"
          >
            {posting ? <ActivityIndicator color={COLORS.onAccent} /> : <Ionicons name="arrow-up" size={22} color={COLORS.onAccent} />}
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  pad: { padding: SPACING.lg, gap: SPACING.sm },
  list: { padding: SPACING.lg, gap: SPACING.lg, flexGrow: 1 },
  empty: { marginTop: SPACING.xxl },
  row: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  rowText: { flex: 1, gap: 2 },
  composer: {
    padding: SPACING.md,
    backgroundColor: COLORS.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  input: { flex: 1 },
  field: { maxHeight: 110, minHeight: 48 },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
});
