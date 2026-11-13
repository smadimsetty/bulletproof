// apps/mobile/components/social/PhoneVerifySheet.tsx
//
// Add and verify a phone number so friends who have it in their contacts can find you.
// Two steps: type the number, then the 6-digit code texted to it.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING, TYPE } from '../../lib/theme';
import * as haptics from '../../lib/haptics';
import { confirmPhoneCode, deviceRegion, sendPhoneCode } from '../../lib/social/contactSync';
import { toE164 } from '../../lib/social/contactNumbers';
import { Button, Sheet, TextField } from '../ui';

export default function PhoneVerifySheet({
  visible,
  onClose,
  onVerified,
}: {
  visible: boolean;
  onClose: () => void;
  onVerified: (e164: string) => void;
}) {
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [raw, setRaw] = useState('');
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep('number');
    setCode('');
    setError(null);
  }, [visible]);

  async function send() {
    const n = toE164(raw, deviceRegion());
    if (!n) {
      setError('That doesn\'t look like a full phone number. Include the area code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendPhoneCode(n);
      setE164(n);
      setStep('code');
    } catch (e: any) {
      setError(e?.message ?? 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!e164 || code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPhoneCode(e164, code);
      haptics.success();
      onVerified(e164);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={step === 'number' ? 'Add your phone number' : 'Enter the code'}
      subtitle={
        step === 'number'
          ? 'Friends who have your number in their contacts can find you. We text you a code to confirm it\'s yours.'
          : `We texted a 6-digit code to ${e164}.`
      }
    >
      <View style={styles.body}>
        {step === 'number' ? (
          <>
            <TextField
              value={raw}
              onChangeText={setRaw}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              leftIcon="call-outline"
              accessibilityLabel="Phone number"
              error={error ?? undefined}
            />
            <Button title="Text me a code" size="lg" fullWidth loading={busy} disabled={raw.trim().length < 7} onPress={send} />
          </>
        ) : (
          <>
            <TextField
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              autoFocus
              accessibilityLabel="Verification code"
              error={error ?? undefined}
            />
            <Button title="Verify" size="lg" fullWidth loading={busy} disabled={code.length < 6} onPress={verify} />
            <Button title="Use a different number" variant="ghost" fullWidth disabled={busy} onPress={() => setStep('number')} />
          </>
        )}
        <Text style={[TYPE.caption, styles.center]}>Standard message rates may apply. You can turn off being found by phone in Settings.</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACING.md, paddingVertical: SPACING.md },
  center: { textAlign: 'center' },
});
