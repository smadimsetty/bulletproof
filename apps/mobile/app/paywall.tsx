// apps/mobile/app/paywall.tsx
//
// The paid plan: $2/month or $10/year, with a 2-week free trial (Apple's introductory
// offer). Shown in place of the app when premium_status() is 'none', and from Settings
// as a preview for moderators. Prices always come from Apple (localised), never hard-coded.
// Apple requires: the price and period, that it renews automatically until cancelled,
// a Restore button, and links to the Terms of Use and Privacy Policy.
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADII, SPACING, TYPE } from '../lib/theme';
import * as haptics from '../lib/haptics';
import { PRIVACY_URL, TERMS_URL } from '../lib/links';
import { buy, loadPlans, restore, type PlanProduct } from '../lib/premium';
import { needsPaywall, yearlySavingsPercent } from '../lib/premiumRules';
import { signOut } from '../lib/signOut';
import { Button, ScreenScroll, useToast } from '../components/ui';

const PERKS: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = [
  { icon: 'body-outline', text: 'Every 14-day sprint, built around your own assessment' },
  { icon: 'sparkles-outline', text: 'Daily routines that adapt to how each day went' },
  { icon: 'stats-chart-outline', text: 'Retests, progress tracking and your full history' },
  { icon: 'timer-outline', text: 'The dead hang timer and every logger tool' },
];

type PlanKey = 'yearly' | 'monthly';

export default function Paywall() {
  const router = useRouter();
  const toast = useToast();
  const [plans, setPlans] = useState<{ monthly: PlanProduct | null; yearly: PlanProduct | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanKey>('yearly');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  useEffect(() => {
    loadPlans()
      .then(setPlans)
      .catch((e) => setLoadError(e?.message ?? 'Could not reach the App Store.'));
  }, []);

  const plan = plans?.[selected] ?? null;
  const savings = yearlySavingsPercent(plans?.monthly?.price, plans?.yearly?.price);
  const unavailable = plans !== null && !plans.monthly && !plans.yearly;

  function done() {
    // In the gate the layout swaps the app in by itself; as a preview, go back.
    if (router.canGoBack()) router.back();
  }

  async function onBuy() {
    if (!plan || busy) return;
    setBusy('buy');
    haptics.primary();
    try {
      const status = await buy(plan.id);
      if (status && !needsPaywall(status)) {
        haptics.success();
        toast.show(plan.hasTrial ? 'Your free trial has started' : 'Welcome to MoveMaxx Premium');
        done();
      }
    } catch (e: any) {
      Alert.alert('Purchase not completed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    if (busy) return;
    setBusy('restore');
    try {
      const status = await restore();
      if (status && !needsPaywall(status)) {
        toast.show('Purchases restored');
        done();
      } else {
        Alert.alert('Nothing to restore', 'We could not find an active MoveMaxx subscription on this Apple ID.');
      }
    } catch (e: any) {
      Alert.alert('Could not restore', e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const period = selected === 'yearly' ? 'year' : 'month';
  const cta = plan ? (plan.hasTrial ? 'Start 2-week free trial' : `Subscribe for ${plan.displayPrice}/${period}`) : 'Subscribe';
  const fine = plan
    ? plan.hasTrial
      ? `Free for 2 weeks, then ${plan.displayPrice} per ${period}. Renews automatically until you cancel; cancel any time in Settings > Apple ID > Subscriptions at least 24 hours before the trial ends and you won't be charged.`
      : `${plan.displayPrice} per ${period}, charged to your Apple ID. Renews automatically until you cancel; cancel any time in Settings > Apple ID > Subscriptions at least 24 hours before the renewal date.`
    : '';

  return (
    <View style={styles.root}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={TYPE.overline}>MoveMaxx Premium</Text>
          <Text style={[TYPE.title1, styles.center]}>Keep building your mobility</Text>
          <Text style={[TYPE.callout, styles.center]}>Try everything free for 2 weeks. Less than a coffee a month after that.</Text>
        </View>

        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p.text} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Ionicons name={p.icon} size={18} color={COLORS.accent} />
              </View>
              <Text style={[TYPE.body, styles.flex]}>{p.text}</Text>
            </View>
          ))}
        </View>

        {loadError || unavailable ? (
          <Text style={[TYPE.callout, styles.center]}>
            {loadError ?? 'Plans are not available from the App Store right now.'} Try again in a little while, or restore a purchase below.
          </Text>
        ) : (
          <View style={styles.plans}>
            {(['yearly', 'monthly'] as const).map((key) => {
              const p = plans?.[key];
              const on = selected === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    haptics.select();
                    setSelected(key);
                  }}
                  disabled={!p}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: !p }}
                  style={[styles.plan, on && styles.planOn]}
                >
                  <View style={styles.flex}>
                    <Text style={TYPE.bodyStrong}>{key === 'yearly' ? 'Yearly' : 'Monthly'}</Text>
                    <Text style={TYPE.footnote}>{p ? `${p.displayPrice} / ${key === 'yearly' ? 'year' : 'month'}` : 'Loading…'}</Text>
                  </View>
                  {key === 'yearly' && savings ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{`Save ${savings}%`}</Text>
                    </View>
                  ) : null}
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? COLORS.accent : COLORS.textTertiary} />
                </Pressable>
              );
            })}
          </View>
        )}

        <Button title={cta} size="lg" fullWidth loading={busy === 'buy'} disabled={!plan || busy !== null} onPress={onBuy} />
        {fine ? <Text style={[TYPE.caption, styles.center, styles.fine]}>{fine}</Text> : null}

        <View style={styles.links}>
          <Button title="Restore purchases" variant="ghost" loading={busy === 'restore'} onPress={onRestore} />
          <View style={styles.legal}>
            <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>Terms of Use</Text>
            <Text style={TYPE.footnote}>·</Text>
            <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>Privacy Policy</Text>
            {router.canGoBack() ? null : (
              <>
                <Text style={TYPE.footnote}>·</Text>
                <Text style={styles.link} onPress={() => signOut()}>Sign out</Text>
              </>
            )}
          </View>
        </View>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { gap: SPACING.xl, paddingTop: SPACING.xxl, paddingBottom: SPACING.xxxl },
  hero: { alignItems: 'center', gap: SPACING.sm },
  center: { textAlign: 'center' },
  perks: { gap: SPACING.md },
  perk: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  perkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentTint, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  plans: { gap: SPACING.md },
  plan: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg,
    borderRadius: RADII.card, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  planOn: { borderColor: COLORS.accent },
  badge: { backgroundColor: COLORS.accent, borderRadius: RADII.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  badgeText: { ...TYPE.caption, color: COLORS.onAccent },
  fine: { marginTop: -SPACING.md },
  links: { alignItems: 'center', gap: SPACING.sm },
  legal: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  link: { ...TYPE.footnote, color: COLORS.textSecondary, textDecorationLine: 'underline' },
});
