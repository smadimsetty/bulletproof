// apps/mobile/app/hang.tsx
//
// Dead hang timer: a standalone tool anyone can use any time, separate from workouts
// and sprints. Free mode is a stopwatch stopped by hand; Intervals counts down from a
// chosen hang length and saves itself at the end. Both start with a 3-2-1 countdown.
// Every hang stacks into today's total.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { COLORS, NUMERAL_MAX_FONT_SCALE, RADII, SPACING, TYPE } from '../lib/theme';
import * as haptics from '../lib/haptics';
import { initTimerAudio, playTimerEnd } from '../lib/timerAlerts';
import {
  deleteHang, fetchHangs, formatHangDuration, hangStats, readTimer, saveHang,
  type Hang, type HangMode, type RunningTimer,
} from '../lib/hangs';
import { Button, Card, ErrorState, FilterChip, ProgressRing, ScreenScroll, SectionHeader, SegmentedControl, useToast } from '../components/ui';

const INTERVALS = [15, 30, 45, 60, 90];
const KEEP_AWAKE_TAG = 'dead-hang';
const MIN_SAVE_MS = 1000;

function clock(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const s = Math.floor(tenths / 10);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}.${tenths % 10}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
}

export default function HangScreen() {
  const toast = useToast();
  const [hangs, setHangs] = useState<Hang[]>([]);
  // Latest list for the save path, which runs from a timer effect after awaits.
  const hangsRef = useRef<Hang[]>([]);
  hangsRef.current = hangs;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<HangMode>('free');
  const [intervalSec, setIntervalSec] = useState(30);
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  // The interval auto-save must run once per hang, even though renders keep coming.
  const savedRef = useRef(false);
  const lastCountRef = useRef<number | null>(null);
  const startedHangRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setHangs(await fetchHangs());
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Could not load your hangs.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    initTimerAudio();
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, []);

  // Tick while running; the reading itself comes from timestamps, so the rate only affects smoothness.
  useEffect(() => {
    if (!timer) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => {
      clearInterval(id);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [timer]);

  const reading = timer ? readTimer(timer, now) : null;

  const record = useCallback(
    async (startedAt: number, durationMs: number, t: RunningTimer) => {
      if (durationMs < MIN_SAVE_MS) {
        toast.show('Too short to save');
        return;
      }
      try {
        const saved = await saveHang({ startedAt, durationMs, mode: t.mode, targetMs: t.targetMs });
        const next = [saved, ...hangsRef.current];
        hangsRef.current = next;
        setHangs(next);
        toast.show(`+${formatHangDuration(saved.durationMs)} · today ${formatHangDuration(hangStats(next, new Date()).todayMs)}`);
      } catch (err: any) {
        Alert.alert('Hang not saved', err?.message ?? 'Check your connection and try again.');
      }
    },
    [toast],
  );

  // Countdown ticks, the start cue, and the interval's automatic finish.
  useEffect(() => {
    if (!timer || !reading) return;
    if (reading.phase === 'countdown') {
      if (lastCountRef.current !== reading.count) {
        lastCountRef.current = reading.count;
        haptics.rigid();
      }
      return;
    }
    if (!startedHangRef.current) {
      startedHangRef.current = true;
      haptics.heavy();
      playTimerEnd();
    }
    if (reading.done && !savedRef.current) {
      savedRef.current = true;
      haptics.success();
      playTimerEnd();
      setTimer(null);
      record(reading.hangStartedAt, reading.elapsedMs, timer);
    }
  }, [timer, reading, record]);

  function start() {
    savedRef.current = false;
    startedHangRef.current = false;
    lastCountRef.current = null;
    haptics.primary();
    const t: RunningTimer = { phase: 'countdown', startedAt: Date.now(), mode, targetMs: mode === 'interval' ? intervalSec * 1000 : null };
    setNow(t.startedAt);
    setTimer(t);
  }

  function stop() {
    if (!timer) return;
    const r = readTimer(timer, Date.now());
    setTimer(null);
    if (r.phase === 'countdown' || savedRef.current) return; // cancelled before the hang began
    savedRef.current = true;
    haptics.success();
    record(r.hangStartedAt, r.elapsedMs, timer);
  }

  async function remove(h: Hang) {
    setHangs((prev) => prev.filter((x) => x.id !== h.id));
    try {
      await deleteHang(h.id);
    } catch (err: any) {
      Alert.alert('Could not delete', err?.message ?? 'Try again.');
      load();
    }
  }

  const stats = useMemo(() => hangStats(hangs, new Date()), [hangs]);
  const todayHangs = useMemo(() => {
    const today = stats.last7[6].date;
    return hangs.filter((h) => {
      const d = new Date(h.startedAt);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return local === today;
    });
  }, [hangs, stats]);
  const maxDay = Math.max(1, ...stats.last7.map((d) => d.ms));
  const running = timer !== null;

  let face: ReactElement;
  if (reading?.phase === 'countdown') {
    face = (
      <Text style={[styles.count]} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE} accessibilityLiveRegion="assertive">
        {reading.count}
      </Text>
    );
  } else if (reading?.phase === 'hanging') {
    const shown = reading.remainingMs ?? reading.elapsedMs;
    face = (
      <View style={styles.faceCol}>
        <Text style={TYPE.overline}>{reading.remainingMs != null ? 'Hold on' : 'Hanging'}</Text>
        <Text style={TYPE.display} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>{clock(shown)}</Text>
      </View>
    );
  } else {
    face = (
      <View style={styles.faceCol}>
        <Text style={TYPE.overline}>Today</Text>
        <Text style={TYPE.display} maxFontSizeMultiplier={NUMERAL_MAX_FONT_SCALE}>{formatHangDuration(stats.todayMs)}</Text>
        <Text style={TYPE.footnote}>{stats.todayCount === 1 ? '1 hang' : `${stats.todayCount} hangs`}</Text>
      </View>
    );
  }

  const ringProgress =
    reading?.phase === 'hanging' && timer?.targetMs ? reading.elapsedMs / timer.targetMs : reading?.phase === 'countdown' ? 0 : 1;

  return (
    <View style={styles.root}>
      <ScreenScroll contentContainerStyle={styles.content}>
        <SegmentedControl
          options={[{ value: 'free', label: 'Free hang', disabled: running }, { value: 'interval', label: 'Intervals', disabled: running }]}
          value={mode}
          onChange={(v) => setMode(v as HangMode)}
        />
        {mode === 'interval' ? (
          <View style={styles.chips}>
            {INTERVALS.map((s) => (
              <FilterChip key={s} label={`${s}s`} selected={intervalSec === s} onToggle={() => !running && setIntervalSec(s)} />
            ))}
          </View>
        ) : null}

        <View style={styles.faceWrap}>
          <ProgressRing progress={Math.max(0, Math.min(1, ringProgress))} size={260} stroke={10} label={face} />
        </View>

        {running ? (
          <Button
            title={reading?.phase === 'countdown' ? 'Cancel' : 'Let go'}
            icon={reading?.phase === 'countdown' ? 'close' : 'stop'}
            variant={reading?.phase === 'countdown' ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            onPress={stop}
          />
        ) : (
          <Button
            title={mode === 'interval' ? `Start ${intervalSec}s hang` : 'Start hang'}
            icon="play"
            size="lg"
            fullWidth
            onPress={start}
          />
        )}
        <Text style={[TYPE.footnote, styles.center]}>
          {mode === 'interval'
            ? 'After 3-2-1, hang until the beep. It saves itself; tap Let go to stop early.'
            : 'After 3-2-1, hang as long as you can, then tap Let go.'}
        </Text>

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={TYPE.caption}>BEST HANG</Text>
                <Text style={TYPE.stat}>{formatHangDuration(stats.bestMs)}</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={TYPE.caption}>LAST 7 DAYS</Text>
                <Text style={TYPE.stat}>{formatHangDuration(stats.last7.reduce((a, d) => a + d.ms, 0))}</Text>
              </Card>
            </View>

            <Card>
              <View style={styles.bars} accessibilityLabel="Hang time over the last 7 days">
                {stats.last7.map((d, i) => (
                  <View key={d.date} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          { height: `${Math.round((d.ms / maxDay) * 100)}%`, backgroundColor: i === 6 ? COLORS.accent : COLORS.accentTint },
                        ]}
                      />
                    </View>
                    <Text style={TYPE.caption}>{dayLabel(d.date)}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <SectionHeader title="Today's hangs" inset={SPACING.xs} />
            {todayHangs.length === 0 ? (
              <Text style={[TYPE.footnote, styles.center]}>No hangs yet today. Every one you do adds to today's total.</Text>
            ) : (
              <Card padding={0}>
                {todayHangs.map((h, i) => (
                  <View key={h.id} style={[styles.hangRow, i > 0 && styles.divider]}>
                    <Text style={[TYPE.bodyStrong, styles.flex]}>{formatHangDuration(h.durationMs)}</Text>
                    <Text style={TYPE.footnote}>
                      {new Date(h.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      {h.mode === 'interval' && h.targetMs ? ` · ${h.targetMs / 1000}s interval` : ''}
                    </Text>
                    <Pressable hitSlop={12} onPress={() => remove(h)} accessibilityLabel={`Delete ${formatHangDuration(h.durationMs)} hang`}>
                      <Ionicons name="close" size={18} color={COLORS.textTertiary} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { gap: SPACING.lg, paddingTop: SPACING.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center' },
  faceWrap: { alignItems: 'center', paddingVertical: SPACING.md },
  faceCol: { alignItems: 'center', gap: SPACING.xs },
  count: { ...TYPE.display, fontSize: 120, lineHeight: 128, color: COLORS.accent },
  center: { textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: SPACING.md },
  statCard: { flex: 1, gap: SPACING.xs },
  bars: { flexDirection: 'row', gap: SPACING.sm, height: 110, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: SPACING.xs },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: RADII.xs, minHeight: 3 },
  hangRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.divider },
  flex: { flex: 1 },
});
