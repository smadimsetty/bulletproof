// apps/mobile/lib/theme.ts
//
// Shared calm/minimal, Oura-inspired style constants for the mobile app's
// screens. Plain constants + StyleSheet fragments, not a styling library
// dependency -- every existing screen in this repo already uses RN's
// built-in StyleSheet.create (sign-in.tsx, the tab stubs), and adding a
// styling package for one screen would be exactly the over-engineering
// CLAUDE.md's conventions warn against. See
// docs/superpowers/specs/2026-06-24-settings-healthkit-design.md
// Decision 9 for the palette rationale.
import { StyleSheet } from 'react-native';

export const COLORS = {
  background: '#F7F5F2',
  card: '#FFFFFF',
  ink: '#1C1B1A',
  muted: '#8A8580',
  accent: '#3A6B5C',
  accentMuted: '#DCE6E2',
  border: '#E7E3DC',
  danger: '#B3261E',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const RADII = {
  card: 16,
  chip: 999,
  button: 12,
} as const;

export const TYPE = {
  screenTitle: { fontSize: 22, fontWeight: '700' as const, color: COLORS.ink },
  sectionTitle: { fontSize: 17, fontWeight: '600' as const, color: COLORS.ink },
  label: { fontSize: 14, fontWeight: '500' as const, color: COLORS.ink },
  helper: { fontSize: 13, fontWeight: '400' as const, color: COLORS.muted },
  body: { fontSize: 15, fontWeight: '400' as const, color: COLORS.ink },
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screenContent: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADII.card,
    padding: SPACING.md,
    gap: SPACING.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: {
    ...TYPE.sectionTitle,
  },
  helperText: {
    ...TYPE.helper,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accentMuted,
    borderRadius: RADII.chip,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  chipText: {
    ...TYPE.body,
    color: COLORS.accent,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...TYPE.body,
    color: COLORS.card,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    fontSize: 15,
    color: COLORS.ink,
  },
  warningText: {
    ...TYPE.helper,
    color: COLORS.danger,
  },
});
