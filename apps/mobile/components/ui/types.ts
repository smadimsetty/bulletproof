import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
