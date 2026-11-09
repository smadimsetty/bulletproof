// apps/mobile/components/social/PhotoPager.tsx
//
// Horizontally swipeable photos (one per page) with page dots.
import { useState } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { COLORS, LEGACY_SPACING as SPACING } from '../../lib/theme';
import SignedImage from './SignedImage';

export default function PhotoPager({ paths, aspectRatio = 4 / 3 }: { paths: readonly string[]; aspectRatio?: number }) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  if (paths.length === 0) return null;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          {paths.map((p) => (
            <SignedImage key={p} path={p} style={{ width, height: width / aspectRatio }} />
          ))}
        </ScrollView>
      )}
      {paths.length > 1 && (
        <View style={styles.dots}>
          {paths.map((p, i) => (
            <View key={p} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', borderRadius: 12 },
  dots: { position: 'absolute', bottom: SPACING.sm, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: COLORS.card },
});
