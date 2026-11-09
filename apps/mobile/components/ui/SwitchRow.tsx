// ListRow with a trailing Switch; the whole row toggles. Visual spec section 3 "SwitchRow".
import { type StyleProp, type ViewStyle } from 'react-native';
import { ListRow, type ListRowProps } from './ListRow';

export interface SwitchRowProps {
  title: string;
  subtitle?: string;
  leading?: ListRowProps['leading'];
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SwitchRow({ value, onValueChange, ...rest }: SwitchRowProps) {
  return <ListRow {...rest} trailing="switch" switchValue={value} onSwitchChange={onValueChange} />;
}
