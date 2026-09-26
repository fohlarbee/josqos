import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Props = { label: string; selected: boolean; onPress: () => void; disabled?: boolean };

export function Chip({ label, selected, onPress, disabled }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: selected ? theme.accent : theme.background,
          borderColor: selected ? theme.accent : theme.backgroundSelected,
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      <ThemedText type="small" style={[styles.label, { color: selected ? '#ffffff' : theme.text }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // maxWidth keeps one very long label wrapping inside the row instead of running off-screen
  base: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  label: { flexShrink: 1 },
});
