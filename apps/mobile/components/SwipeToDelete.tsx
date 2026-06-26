// Minimal swipe-left-to-delete wrapper, built on React Native core's
// Animated + PanResponder rather than react-native-gesture-handler -- this
// app has deliberately avoided adding gesture-handler/reanimated as a
// native dependency (see the Trends chart library choice for the same
// rationale: every native dependency is another required EAS rebuild for
// everyone testing the app), and a single swipe-to-delete affordance
// doesn't need a full gesture library.
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../lib/theme';

const DELETE_THRESHOLD = -72;
const REVEAL_WIDTH = 90;

export interface SwipeToDeleteProps {
  readonly onDelete: () => void;
  readonly children: ReactNode;
}

export default function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const translateX = useRef(new Animated.Value(0)).current;

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
          Animated.timing(translateX, { toValue: -400, duration: 180, useNativeDriver: true }).start(onDelete);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <Pressable style={styles.deleteBackdrop} onPress={onDelete} accessibilityLabel="Delete">
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
      <Animated.View style={[styles.foreground, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  deleteBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: REVEAL_WIDTH,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: COLORS.card, fontWeight: '700', fontSize: 13 },
  foreground: { backgroundColor: COLORS.card },
});
