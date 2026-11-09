// apps/mobile/components/share/ShareCard.tsx
//
// Fixed 4:5 branded card (360x450 here; view-shot upscales by pixel ratio)
// that gets captured to an image. Deliberately independent of the app theme:
// it must look the same whatever restyle the app gets. Callers mount it
// off-screen with collapsable={false} on the wrapping view.
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../lib/theme';

export interface ShareCardProps {
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  footer?: string;
}

const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ title, subtitle, stats, footer }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.value}>{s.value}</Text>
            <Text style={styles.label}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View>
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
        <Text style={styles.brand}>BULLETPROOF</Text>
      </View>
    </View>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 450,
    backgroundColor: '#0E0F12',
    padding: 28,
    justifyContent: 'space-between',
  },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A8A8A8', fontSize: 15, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  stat: { width: '50%' },
  value: { color: COLORS.accent, fontSize: 32, fontWeight: '800' },
  label: { color: '#FFFFFF', fontSize: 13, marginTop: 2 },
  footer: { color: '#A8A8A8', fontSize: 13, marginBottom: 10 },
  brand: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
});
