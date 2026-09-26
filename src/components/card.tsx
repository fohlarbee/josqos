import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type Props = ViewProps & { title?: string };

export function Card({ title, children, style, ...rest }: Props) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]} {...rest}>
      {title ? <ThemedText type="smallBold">{title}</ThemedText> : null}
      <View style={styles.body}>{children}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 8 },
  body: { gap: 8 },
});
