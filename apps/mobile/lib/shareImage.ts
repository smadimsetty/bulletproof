// apps/mobile/lib/shareImage.ts
//
// Renders a mounted view to a PNG and opens the iOS share sheet. Shared by
// the monthly recap and (Stage 3) the workout share card.
import type { RefObject } from 'react';
import { Alert, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export async function shareViewAsImage(ref: RefObject<View | null>, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Sharing unavailable', "Sharing isn't available on this device.");
    return;
  }
  const uri = await captureRef(ref, { format: 'png', quality: 1 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
}
