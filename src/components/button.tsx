import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Smaller padding, for buttons inside list items. */
  compact?: boolean;
};

/** Primary is filled; secondary and danger are outlined so they read as buttons on any background. */
export function Button({ title, onPress, variant = 'primary', disabled, compact }: Props) {
  const theme = useTheme();
  const color = variant === 'primary' ? '#ffffff' : variant === 'danger' ? theme.danger : theme.accent;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { borderColor: color, backgroundColor: variant === 'primary' ? theme.accent : 'transparent' },
        variant === 'primary' && { borderColor: theme.accent },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold" style={[styles.label, { color }]}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 14 },
  label: { textAlign: 'center', flexShrink: 1 },
});
