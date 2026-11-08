// apps/mobile/components/DescriptionToggle.tsx
//
// Eye icon that collapses/expands a long description on an exercise or
// assessment card. Callers render the button only when there is text, and
// render the text only while `open`. State is per card, per screen visit.
import { useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../lib/theme';

export function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}

export function DescriptionToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide description' : 'Show description'}
    >
      <Ionicons name={open ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.muted} />
    </Pressable>
  );
}
