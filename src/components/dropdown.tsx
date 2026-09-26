import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: string | null;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Tap to open a short list, tap an option to choose it. */
export function Dropdown({ value, options, placeholder, onChange, disabled }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { backgroundColor: theme.background }]}>
        <ThemedText type="small" themeColor={value ? 'text' : 'textSecondary'} style={styles.value}>
          {value ?? placeholder}
        </ThemedText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textSecondary} />
      </Pressable>
      {open && (
        <View style={[styles.list, { backgroundColor: theme.background }]}>
          {options.map((o) => (
            <Pressable
              key={o}
              accessibilityRole="menuitem"
              onPress={() => {
                onChange(o);
                setOpen(false);
              }}
              style={styles.option}>
              <ThemedText type={o === value ? 'smallBold' : 'small'} style={o === value ? { color: theme.accent } : undefined}>
                {o}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  value: { flex: 1 },
  list: { borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  option: { paddingHorizontal: 12, paddingVertical: 12 },
});
