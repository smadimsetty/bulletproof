// Minimal swipe-left-to-delete wrapper, built on React Native core's
// Animated + PanResponder rather than a gesture library: a single
// swipe-to-delete affordance doesn't need one (visual spec 3 SetRow).
// Restyled for Stage 4: dangerTint action with a danger trash icon.
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
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
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // One-shot: a second swipe/tap while the delete is in flight is ignored. If the row is still
  // mounted afterwards (delete failed or was declined), spring it back.
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
          Animated.timing(translateX, { toValue: -400, duration: 180, useNativeDriver: true }).start(triggerDelete);
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
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        accessible
        accessibilityActions={[{ name: 'delete', label: 'Delete set' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'delete') triggerDelete();
        }}
        {...panResponder.panHandlers}
      >
        {children}
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
});
