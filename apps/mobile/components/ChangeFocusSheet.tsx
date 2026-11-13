// apps/mobile/components/ChangeFocusSheet.tsx
//
// Three-step sheet for deviating from the active sprint: disclaimer, pick a
// different pain point, then either do it just for today or start a new sprint.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import type { PainPoint } from '../lib/sprintLifecycle';
import { Button, ListRow, Sheet } from './ui';
import SprintIcon from './SprintIcon';

type Step = 'disclaimer' | 'pick' | 'choose' | 'confirmNew';

export default function ChangeFocusSheet({
  visible,
  onClose,
  sprintName,
  painPoints,
  busy,
  onJustToday,
  onStartNewSprint,
}: {
  visible: boolean;
  onClose: () => void;
  /** Display name of the current sprint's pain point. */
  sprintName: string;
  /** Pain points other than the current sprint's. */
  painPoints: readonly PainPoint[];
  busy: boolean;
  onJustToday: (painPoint: PainPoint) => void;
  onStartNewSprint: (painPoint: PainPoint) => void;
}) {
  const [step, setStep] = useState<Step>('disclaimer');
  const [picked, setPicked] = useState<PainPoint | null>(null);

  useEffect(() => {
    if (visible) {
      setStep('disclaimer');
      setPicked(null);
    }
  }, [visible]);

  const titles: Record<Step, string> = {
    disclaimer: "Change today's focus",
    pick: 'Pick a different focus',
    choose: picked?.displayName ?? 'Choose',
    confirmNew: 'Start a new sprint?',
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={titles[step]} dismissable={!busy}>
      <View style={styles.body}>
        {step === 'disclaimer' ? (
          <>
            <Text style={TYPE.body}>
              {`This takes you off your ${sprintName} plan for today. Your sprint day stays open, so you can still do it later.`}
            </Text>
            <Button title="Continue" size="lg" fullWidth onPress={() => setStep('pick')} />
            <Button title="Cancel" variant="ghost" fullWidth onPress={onClose} />
          </>
        ) : null}

        {step === 'pick' ? (
          <>
            {painPoints.map((pp) => (
              <ListRow
                key={pp.id}
                leading={
                  <View style={styles.iconCircle}>
                    <SprintIcon id={pp.id} size={28} color={COLORS.accent} background={COLORS.accentTint} />
                  </View>
                }
                title={pp.displayName}
                subtitle={pp.tagline ?? undefined}
                trailing="chevron"
                onPress={() => {
                  setPicked(pp);
                  setStep('choose');
                }}
              />
            ))}
            <Button title="Back" variant="ghost" fullWidth onPress={() => setStep('disclaimer')} />
          </>
        ) : null}

        {step === 'choose' && picked ? (
          <>
            <Text style={TYPE.body}>
              {`Do a ${picked.displayName} routine just for today, or drop ${sprintName} and start a ${picked.displayName} sprint.`}
            </Text>
            <Button title="Just today" size="lg" fullWidth loading={busy} onPress={() => onJustToday(picked)} />
            <Button title="Start a new sprint" variant="secondary" size="lg" fullWidth disabled={busy} onPress={() => setStep('confirmNew')} />
            <Button title="Back" variant="ghost" fullWidth disabled={busy} onPress={() => setStep('pick')} />
          </>
        ) : null}

        {step === 'confirmNew' && picked ? (
          <>
            <Text style={TYPE.body}>
              {`You'll lose your ${sprintName} sprint progress and start a new ${picked.displayName} sprint with a baseline test.`}
            </Text>
            <Button
              title={`Abandon and start ${picked.displayName}`}
              variant="destructive"
              solid
              size="lg"
              fullWidth
              loading={busy}
              onPress={() => onStartNewSprint(picked)}
            />
            <Button title="Back" variant="ghost" fullWidth disabled={busy} onPress={() => setStep('choose')} />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACING.md, paddingBottom: SPACING.md },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accentTint, alignItems: 'center', justifyContent: 'center' },
});
