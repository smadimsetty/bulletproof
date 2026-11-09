// apps/mobile/components/social/PhotoStrip.tsx
//
// Thumbnails of picked (not yet uploaded) photos with remove buttons and a +
// tile that opens the library picker, capped at `max`.
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SPACING } from '../../lib/theme';

/** Opens the picker for up to `limit` more images; returns their local URIs ([] if cancelled). */
export async function pickPhotos(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: limit,
      quality: 1,
    });
    if (res.canceled) return [];
    return res.assets.slice(0, limit).map((a) => a.uri);
  } catch (err: any) {
    Alert.alert('Could not open photos', err?.message ?? 'Try again.');
    return [];
  }
}

export default function PhotoStrip({
  uris,
  max,
  onChange,
  disabled,
}: {
  uris: string[];
  max: number;
  onChange: (uris: string[]) => void;
  disabled?: boolean;
}) {
  async function add() {
    const picked = await pickPhotos(max - uris.length);
    if (picked.length > 0) onChange([...uris, ...picked].slice(0, max));
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {uris.map((uri, i) => (
        <View key={`${uri}-${i}`} style={styles.tile}>
          <Image source={{ uri }} style={styles.image} />
          <Pressable
            style={styles.remove}
            disabled={disabled}
            onPress={() => onChange(uris.filter((_, j) => j !== i))}
            hitSlop={6}
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="close" size={14} color={COLORS.card} />
          </Pressable>
        </View>
      ))}
      {uris.length < max && (
        <Pressable style={[styles.tile, styles.add]} disabled={disabled} onPress={add} accessibilityLabel="Add photos">
          <Ionicons name="add" size={28} color={COLORS.accent} />
          <Text style={styles.addText}>{uris.length}/{max}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  tile: { width: 80, height: 80, borderRadius: RADII.button, overflow: 'hidden' },
  image: { width: 80, height: 80, backgroundColor: COLORS.accentMuted },
  add: { borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 11, color: COLORS.muted },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
