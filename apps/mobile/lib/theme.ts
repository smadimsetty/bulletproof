// apps/mobile/lib/theme.ts
//
// Design tokens for the Stage 4 redesign. Source of truth:
// docs/superpowers/specs/2026-11-08-visual-design.md section 2.
// A few legacy aliases (COLORS.ink/muted/card/background, RADII.card/chip/button,
// legacy TYPE keys) remain for older call sites; sharedStyles and
// LEGACY_SPACING were removed in step 20.
import { StyleSheet } from 'react-native';
import { Easing } from 'react-native-reanimated';

// ---------- 2.1 Colour ----------
export const COLORS = {
  bg: '#0B0C0F',
  surface: '#15171C',
  elevated: '#1E2128',
  sheet: '#262A32',
  tabBar: '#101115',
  scrim: 'rgba(0,0,0,0.6)',
  textPrimary: '#F4F5F7',
  textSecondary: '#B3B8C3',
  textTertiary: '#8E94A1',
  textDisabled: '#5C6270',
  accent: '#C6F432',
  accentPressed: '#A8D41C',
  onAccent: '#0B0C0F',
  accentTint: '#313A20',
  success: '#3DDC97',
  successTint: '#1B3730',
  warning: '#FFB547',
  warningTint: '#3A3023',
  danger: '#FF6369',
  dangerTint: '#3A2328',
  onDanger: '#0B0C0F',
  border: '#2C313A',
  borderStrong: '#3A404B',
  divider: '#20232A',
  chartLeft: '#4FC3F7',
  chartRight: '#FF9F43',
  chartSeries: ['#C6F432', '#4FC3F7', '#FF9F43', '#A78BFA', '#F472B6', '#3DDC97'],
  chartGrid: '#23262E',

  // Legacy aliases (pre-redesign screens).
  background: '#0B0C0F',
  card: '#15171C',
  ink: '#F4F5F7',
  muted: '#8E94A1',
  accentMuted: '#313A20',
} as const;

// ---------- 2.2 Type ----------
export const TYPE = {
  display: {
    fontSize: 64,
    fontWeight: '800' as const,
    lineHeight: 68,
    letterSpacing: -2,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  numeral: {
    fontSize: 40,
    fontWeight: '800' as const,
    lineHeight: 44,
    letterSpacing: -1,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  stat: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  title1: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34, letterSpacing: -0.5, color: COLORS.textPrimary },
  title2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.3, color: COLORS.textPrimary },
  title3: { fontSize: 17, fontWeight: '700' as const, lineHeight: 22, letterSpacing: -0.2, color: COLORS.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22, letterSpacing: 0, color: COLORS.textPrimary },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22, letterSpacing: 0, color: COLORS.textPrimary },
  callout: { fontSize: 14, fontWeight: '500' as const, lineHeight: 20, letterSpacing: 0, color: COLORS.textSecondary },
  footnote: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 0, color: COLORS.textTertiary },
  overline: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
    letterSpacing: 1.2,
    color: COLORS.textTertiary,
    textTransform: 'uppercase' as const,
  },
  caption: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.4, color: COLORS.textTertiary },

  // Legacy keys (pre-redesign screens).
  screenTitle: { fontSize: 22, fontWeight: '700' as const, color: COLORS.textPrimary },
  sectionTitle: { fontSize: 17, fontWeight: '600' as const, color: COLORS.textPrimary },
  label: { fontSize: 14, fontWeight: '500' as const, color: COLORS.textPrimary },
  helper: { fontSize: 13, fontWeight: '400' as const, color: COLORS.textTertiary },
};

/** Cap Dynamic Type growth on the big numerals (spec 2.2). Pass as maxFontSizeMultiplier. */
export const NUMERAL_MAX_FONT_SCALE = 1.2;

// ---------- 2.3 Spacing, radii, sizes ----------
export const SPACING = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Old scale; untouched screens import this as SPACING until they are redesigned. */

export const RADII = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
  // Legacy aliases.
  card: 16,
  chip: 999,
  button: 12,
} as const;

export const SIZES = {
  hitMin: 44,
  buttonSm: 36,
  buttonMd: 48,
  buttonLg: 56,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 32,
  rowMin: 56,
  setRow: 52,
  tabBar: 56,
  avatarXs: 24,
  avatarSm: 32,
  avatarMd: 44,
  avatarLg: 72,
  avatarXl: 96,
} as const;

/** Bottom padding for tab-screen scroll content so the docked ActiveWorkoutBanner never covers the last row. */
export const BANNER_CLEARANCE = 76;

// ---------- 2.4 Elevation ----------
export const ELEVATION = {
  0: {},
  1: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#262A32' },
  2: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#30353F',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  3: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3A404B',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  glow: {
    shadowColor: '#C6F432',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
} as const;

// ---------- 2.5 Motion ----------
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 320,
  roll: 600,
  stagger: 30,
  toastHold: 2500,
  easeOut: Easing.bezier(0.2, 0.9, 0.3, 1),
  easeIn: Easing.bezier(0.4, 0, 1, 1),
  standard: Easing.bezier(0.4, 0, 0.2, 1),
  spring: { damping: 18, stiffness: 220, mass: 1 },
  sheetSpring: { damping: 26, stiffness: 260, mass: 0.9, overshootClamping: false },
  popSpring: { damping: 10, stiffness: 300, mass: 0.8 },
} as const;

