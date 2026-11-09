// Sheet preset: confirm / destructive confirm. Visual spec section 3 "ConfirmSheet".
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import * as haptics from '../../lib/haptics';
import { COLORS, TYPE } from '../../lib/theme';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { TextField } from './TextField';

export interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** User must type this exactly before confirm enables (e.g. DELETE). */
  requireText?: string;
  onConfirm: () => void;
  loading?: boolean;
}

export function ConfirmSheet({
  visible,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  requireText,
  onConfirm,
  loading,
}: ConfirmSheetProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (visible) {
      setTyped('');
      if (destructive) haptics.warning();
    }
  }, [visible, destructive]);

  const blocked = requireText != null && typed.trim() !== requireText;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      dismissable={!loading}
      footer={
        <>
          <Button
            title={confirmLabel}
            variant={destructive ? 'destructive' : 'primary'}
            solid={destructive}
            size="lg"
            fullWidth
            loading={loading}
            disabled={blocked}
            onPress={onConfirm}
          />
          <Button title={cancelLabel} variant="ghost" size="lg" fullWidth disabled={loading} onPress={onClose} />
        </>
      }
    >
      {body ? <Text style={[TYPE.body, { color: COLORS.textSecondary }]}>{body}</Text> : null}
      {requireText != null ? (
        <TextField
          value={typed}
          onChangeText={setTyped}
          placeholder={requireText}
          autoCapitalize="characters"
          autoCorrect={false}
          helper={`Type ${requireText} to confirm.`}
        />
      ) : null}
    </Sheet>
  );
}
