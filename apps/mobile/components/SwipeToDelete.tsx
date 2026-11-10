// Minimal swipe-left-to-delete wrapper, built on React Native core's
// Animated + PanResponder rather than a gesture library: a single
// swipe-to-delete affordance doesn't need one (visual spec 3 SetRow).
// Restyled for Stage 4: dangerTint action with a danger trash icon.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII } from '../lib/theme';

const DELETE_THRESHOLD = -72;
const REVEAL_WIDTH = 90;

export interface SwipeToDeleteProps {
  readonly onDelete: () => void;
  readonly children: ReactNode;
}

export default function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const deletedRef = useRef(false);
  const mountedRef = useRef(true);
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  // VoiceOver users can't swipe a row; making the whole row one accessible
  // element (for a custom action) would hide the set inputs inside it. So
  // with a screen reader on, show an explicit delete button instead.
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // One-shot: a second swipe/tap while the delete is in flight is ignored. The parent removes the row
  // optimistically; if it is still mounted afterwards (delete declined), spring it back.
  const triggerDelete = useRef(() => {
    if (deletedRef.current) return;
    deletedRef.current = true;
    onDeleteRef.current();
    setTimeout(() => {
      if (!mountedRef.current) return;
      deletedRef.current = false;
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    }, 600);
  }).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx <= 0) {
          translateX.setValue(gesture.dx);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < DELETE_THRESHOLD) {
          // Optimistic: the delete fires on release, not after the slide-out; the parent drops the row
          // immediately and the short slide (<=120 ms) just runs alongside.
          Animated.timing(translateX, { toValue: -400, duration: 120, useNativeDriver: true }).start();
          triggerDelete();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.deleteBackdrop}
        onPress={triggerDelete}
        accessibilityLabel="Delete"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
      </Pressable>
      <Animated.View style={[styles.foreground, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {screenReader ? (
          <View style={styles.srRow}>
            <View style={styles.srContent}>{children}</View>
            <Pressable onPress={triggerDelete} accessibilityRole="button" accessibilityLabel="Delete set" hitSlop={8} style={styles.srDelete}>
              <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
            </Pressable>
          </View>
        ) : (
          children
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', borderRadius: RADII.sm, overflow: 'hidden' },
  deleteBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: REVEAL_WIDTH,
    backgroundColor: COLORS.dangerTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foreground: { backgroundColor: COLORS.surface },
  srRow: { flexDirection: 'row', alignItems: 'center' },
  srContent: { flex: 1 },
  srDelete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
