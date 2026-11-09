// Sheet preset: list of actions + Cancel. Visual spec section 3 "ActionSheet".
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../lib/theme';
import { Button } from './Button';
import { ListRow } from './ListRow';
import { Sheet } from './Sheet';
import type { IoniconName } from './types';

export interface ActionSheetAction {
  label: string;
  icon?: IoniconName;
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
}

const ACTION_HANDOFF_MS = 260;

export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} dismissable>
      <View style={styles.list}>
        {actions.map((a) => (
          <ListRow
            key={a.label}
            title={a.label}
            destructive={a.destructive}
            leading={a.icon ? { icon: a.icon, tone: a.destructive ? 'danger' : 'neutral' } : undefined}
            onPress={() => {
              onClose();
              // One central handoff: let this sheet finish dismissing before the action presents anything else.
              setTimeout(a.onPress, ACTION_HANDOFF_MS);
            }}
            style={styles.row}
          />
        ))}
      </View>
      <Button title="Cancel" variant="secondary" size="lg" fullWidth onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { marginHorizontal: -SPACING.lg },
  row: {},
});
