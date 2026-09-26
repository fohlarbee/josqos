import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { num } from '@/utils/format';

export type BarGroup = { label: string; fourG: number | null; fiveG: number | null };

/** 4G vs 5G horizontal bars per group. Negative data (dBm) is shifted so a stronger signal is longer. */
export function BarChart({ data, digits = 1 }: { data: BarGroup[]; digits?: number }) {
  const theme = useTheme();
  const values = data.flatMap((d) => [d.fourG, d.fiveG]).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No data for this metric yet.
      </ThemedText>
    );
  }
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const length = (v: number) => (lo >= 0 ? (hi > 0 ? v / hi : 0) : hi === lo ? 1 : 0.1 + (0.9 * (v - lo)) / (hi - lo));

  const bar = (v: number | null, color: string, tag: string) => (
    <View style={styles.line}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tag}>
        {tag}
      </ThemedText>
      <View style={styles.track}>
        {v !== null && <View style={[styles.fill, { backgroundColor: color, width: `${length(v) * 100}%` }]} />}
      </View>
      <ThemedText type="small" style={styles.value}>
        {num(v, digits)}
      </ThemedText>
    </View>
  );

  return (
    <View style={styles.chart}>
      {data.map((d) => (
        <View key={d.label} style={styles.group}>
          <ThemedText type="smallBold">{d.label}</ThemedText>
          {bar(d.fourG, theme.textSecondary, '4G')}
          {bar(d.fiveG, theme.accent, '5G')}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: 12 },
  group: { gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { minWidth: 24 },
  track: { flex: 1, height: 10 },
  fill: { height: 10, borderRadius: 5 },
  value: { minWidth: 56, textAlign: 'right' },
});
