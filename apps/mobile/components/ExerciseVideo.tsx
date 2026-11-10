// apps/mobile/components/ExerciseVideo.tsx
//
// Embedded demo video for the exercise detail screen: a 16:9 YouTube player
// that plays inline, plus an "Open in YouTube" link. Without a usable video it
// shows a quiet placeholder instead.
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, SPACING, TYPE } from '../lib/theme';
import { youtubeEmbedUrl } from '../lib/youtube';
import { Button } from './ui';

export default function ExerciseVideo({ url }: { url: string | null }) {
  const embed = youtubeEmbedUrl(url);
  if (!url || !embed) {
    return (
      <View style={[styles.frame, styles.placeholder]}>
        <Text style={TYPE.footnote}>Video coming soon</Text>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        <WebView
          source={{ uri: embed }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          allowsFullscreenVideo
          javaScriptEnabled
          scrollEnabled={false}
          originWhitelist={['https://*']}
          accessibilityLabel="Exercise demo video"
        />
      </View>
      <Button title="Open in YouTube" variant="ghost" size="sm" icon="open-outline" onPress={() => WebBrowser.openBrowserAsync(url)} style={styles.link} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.elevated },
  web: { flex: 1, backgroundColor: COLORS.elevated },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  link: { alignSelf: 'flex-start' },
});
