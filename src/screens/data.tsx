import { useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { LOCATIONS } from '@/constants/app';
import { deleteDemoData, deleteMeasurement, insertMany, listMeasurements } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import type { Measurement } from '@/types';
import { toCsv } from '@/utils/csv';
import { makeDemoRows } from '@/utils/demo-data';
import { dateTime, num } from '@/utils/format';

export function Data() {
  const theme = useTheme();
  const [rows, setRows] = useState<Measurement[]>([]);
  const refresh = useCallback(() => setRows(listMeasurements()), []);
  useFocusEffect(refresh);

  const demoCount = rows.filter((r) => r.source === 'demo').length;

  async function exportCsv() {
    try {
      const file = new File(Paths.cache, `josqos-${new Date().toISOString().slice(0, 10)}.csv`);
      file.create({ overwrite: true });
      file.write(toCsv(rows));
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available on this device');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Export measurements',
      });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  }

  function confirmDelete(m: Measurement) {
    Alert.alert('Delete this run?', `${m.location}, ${m.technology}, ${dateTime(m.created_at)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMeasurement(m.id);
          refresh();
        },
      },
    ]);
  }

  function loadDemo() {
    Alert.alert(
      'Load demo data?',
      'Adds 216 made-up runs, each marked "demo". Use it to try the Analysis tab, then remove it before collecting real data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load',
          onPress: () => {
            insertMany(makeDemoRows(LOCATIONS));
            refresh();
          },
        },
      ],
    );
  }

  function removeDemo() {
    deleteDemoData();
    refresh();
  }

  const header = (
    <Card title={`${rows.length} run${rows.length === 1 ? '' : 's'} saved`} style={styles.header}>
      <ThemedText type="small" themeColor="textSecondary">
        Data lives only on this phone. Export a CSV after every session.
      </ThemedText>
      <Button title="Export CSV" onPress={exportCsv} disabled={rows.length === 0} />
      <Button
        title={demoCount > 0 ? `Remove demo data (${demoCount} runs)` : 'Load demo data'}
        variant="secondary"
        onPress={demoCount > 0 ? removeDemo : loadDemo}
      />
    </Card>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => String(r.id)}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <ThemedText themeColor="textSecondary" style={styles.empty}>
          No measurements yet. Run a test on the Measure tab, turn on Simulation mode there, or tap Load demo data above.
        </ThemedText>
      }
      contentContainerStyle={styles.content}
      renderItem={({ item: m }) => (
        <Card style={styles.item}>
          <ThemedText type="smallBold">
            {m.location} · {m.technology} · {m.period}
            {m.source === 'demo' ? (
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                {'  DEMO'}
              </ThemedText>
            ) : null}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {dateTime(m.created_at)}
            {m.operator ? ` · ${m.operator}` : ''}
            {m.signal_dbm !== null ? ` · ${num(m.signal_dbm, 0)} dBm` : ''}
          </ThemedText>
          <View style={styles.stats}>
            <Stat label="Download" value={`${num(m.download_mbps)} Mbps`} />
            <Stat label="Upload" value={`${num(m.upload_mbps)} Mbps`} />
            <Stat label="Latency" value={`${num(m.latency_ms, 0)} ms`} />
            <Stat label="Jitter" value={`${num(m.jitter_ms)} ms`} />
            <Stat label="Loss" value={`${num(m.packet_loss_pct, 0)}%`} />
          </View>
          <View style={styles.itemActions}>
            <Button title="Delete" variant="danger" compact onPress={() => confirmDelete(m)} />
          </View>
        </Card>
      )}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  header: { marginBottom: 4 },
  empty: { textAlign: 'center', padding: 24 },
  item: { gap: 6 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8, marginTop: 2 },
  statLabel: { fontSize: 12, lineHeight: 16 },
  itemActions: { alignItems: 'flex-end' },
});
