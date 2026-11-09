// apps/mobile/components/share/ShareCard.tsx
//
// Fixed 4:5 branded card (360x450 here; view-shot upscales by pixel ratio)
// that gets captured to an image (visual spec 4.10). Two layouts: the recap
// variant (kicker + hero numeral) and the workout variant (title, date, stats
// row, PR rows, top exercises). Callers mount it off-screen; the root keeps
// collapsable={false} and a fixed size so the capture is stable.
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/theme';
import BrandMark from '../BrandMark';

export interface ShareCardProps {
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  footer?: string;
  /** Recap variant: accent overline above the hero, e.g. "OCTOBER 2026 RECAP". */
  kicker?: string;
  /** Recap variant: the big numeral and its unit label. */
  hero?: { value: string; label: string };
  /** Workout variant: personal-record lines, each shown with a trophy. */
  prs?: string[];
}

const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ title, subtitle, stats, footer, kicker, hero, prs }, ref) {
  const recap = !!hero;
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Decorative arc bleeding off the bottom-right corner. */}
      <View style={styles.motif} pointerEvents="none">
        <BrandMark size={340} opacity={0.3} />
      </View>

      <View style={styles.top}>
        <View style={styles.brandRow}>
          <BrandMark size={28} />
          <Text style={styles.brand}>BULLETPROOF</Text>
        </View>
        {recap ? (
          <View style={styles.heroBlock}>
            {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
            <View style={styles.heroRow}>
              <Text style={styles.heroValue}>{hero.value}</Text>
              <Text style={styles.heroLabel}>{hero.label}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        )}
      </View>

      <View style={recap ? styles.grid : styles.row}>
        {stats.map((s) => (
          <View key={s.label} style={recap ? styles.statGrid : styles.statRow}>
            <Text style={styles.label}>{s.label}</Text>
            <Text style={styles.value}>{s.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.bottom}>
        {prs && prs.length > 0 ? (
          <View style={styles.prs}>
            {prs.slice(0, 3).map((p) => (
              <View key={p} style={styles.prRow}>
                <Ionicons name="trophy" size={14} color={COLORS.accent} />
                <Text style={styles.pr} numberOfLines={1}>
                  {p}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {footer ? (
          <Text style={styles.footer} numberOfLines={2}>
            {footer}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 450,
    backgroundColor: COLORS.bg,
    padding: 28,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  motif: { position: 'absolute', right: -110, bottom: -110 },
  top: { gap: 28 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  heroBlock: { gap: 6 },
  kicker: { color: COLORS.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  heroValue: { color: COLORS.textPrimary, fontSize: 96, lineHeight: 100, fontWeight: '800', letterSpacing: -3, fontVariant: ['tabular-nums'] },
  heroLabel: { color: COLORS.textSecondary, fontSize: 20, fontWeight: '600' },
  titleBlock: { gap: 4 },
  title: { color: COLORS.textPrimary, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: COLORS.textSecondary, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  statGrid: { width: '50%', gap: 2 },
  row: { flexDirection: 'row', gap: 20 },
  statRow: { gap: 2 },
  label: { color: COLORS.textTertiary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  value: { color: COLORS.textPrimary, fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  bottom: { gap: 8, minHeight: 40 },
  prs: { gap: 4 },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pr: { flex: 1, color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  footer: { color: COLORS.textSecondary, fontSize: 13 },
});
