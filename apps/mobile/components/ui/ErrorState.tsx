// Visual spec section 3 "ErrorState". onRetry must re-run the load.
import type { StyleProp, ViewStyle } from 'react-native';
import { EmptyState } from './EmptyState';

export interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({ message, onRetry, retrying = false, compact, style }: ErrorStateProps) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      tone="danger"
      title="Couldn't load this"
      body={message || 'Check your connection and try again.'}
      action={{ label: 'Try again', onPress: onRetry, loading: retrying }}
      compact={compact}
      style={style}
    />
  );
}
