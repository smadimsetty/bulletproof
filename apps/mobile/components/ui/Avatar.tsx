// Visual spec section 3 "Avatar". (Distinct from components/social/Avatar.tsx, replaced in a later step.)
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { COLORS, SIZES, TYPE } from '../../lib/theme';

export interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

const DIAMETER = { xs: SIZES.avatarXs, sm: SIZES.avatarSm, md: SIZES.avatarMd, lg: SIZES.avatarLg, xl: SIZES.avatarXl } as const;

// chartSeries[1..5] at 30% over `elevated`, precomputed (spec: "precompute 5 tint hexes").
const TINTS = ['#2D5266', '#624730', '#474167', '#5E3953', '#275949'] as const;

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

export function Avatar({ uri, name, size = 'md', ring = false, style }: AvatarProps) {
  const d = DIAMETER[size];
  const opacity = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;

  const circle = (
    <View
      accessibilityLabel={`${name} avatar`}
      style={[
        styles.circle,
        { width: d, height: d, borderRadius: d / 2, backgroundColor: showImage ? COLORS.elevated : TINTS[hash(name) % TINTS.length] },
      ]}
    >
      {showImage ? (
        <Animated.View style={[StyleSheet.absoluteFill, fade]}>
          <Image
            source={{ uri: uri as string }}
            style={StyleSheet.absoluteFill}
            onLoad={() => {
              opacity.value = withTiming(1, { duration: 150 });
            }}
            onError={() => setFailed(true)}
          />
        </Animated.View>
      ) : (
        <Text style={[TYPE.bodyStrong, { fontSize: Math.round(d * 0.4), lineHeight: Math.round(d * 0.5) }]}>{initials(name)}</Text>
      )}
    </View>
  );

  if (!ring) return <View style={style}>{circle}</View>;
  const outer = d + 8;
  return (
    <View
      style={[
        { width: outer, height: outer, borderRadius: outer / 2, borderWidth: 2, borderColor: COLORS.accent, padding: 2, backgroundColor: COLORS.bg },
        style,
      ]}
    >
      {circle}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
