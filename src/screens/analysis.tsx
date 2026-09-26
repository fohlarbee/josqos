import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ALPHA, LOCATIONS } from '@/constants/app';
import { listMeasurements } from '@/db';
import { useTheme } from '@/hooks/use-theme';
import type { Measurement } from '@/types';
import {
  METRICS,
  byTechnology,
  compare,
  groupedMeans,
  signalCorrelation,
  type GroupBy,
  type MetricKey,
} from '@/utils/analysis';
import { num, pValue } from '@/utils/format';

const PERIODS = ['Morning', 'Afternoon', 'Evening'];
const QOS = METRICS.filter((m) => m.key !== 'signal_dbm');

export function Analysis() {
  const theme = useTheme();
  const [rows, setRows] = useState<Measurement[]>([]);
  const [metric, setMetric] = useState<MetricKey>('download_mbps');
  const [by, setBy] = useState<GroupBy>('location');
  useFocusEffect(useCallback(() => setRows(listMeasurements()), []));

  const summary = useMemo(() => METRICS.map((m) => ({ m, s: byTechnology(rows, m.key) })), [rows]);
  const comparisons = useMemo(() => METRICS.map((m) => ({ m, c: compare(rows, m.key) })), [rows]);
  const correlations = useMemo(
    () =>
      QOS.map((m) => ({
        m,
        f: signalCorrelation(rows, '4G', m.key),
        g: signalCorrelation(rows, '5G', m.key),
      })),
    [rows],
  );
  const chart = useMemo(
    () => groupedMeans(rows, metric, by, by === 'location' ? LOCATIONS : PERIODS),
    [rows, metric, by],
  );

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          Nothing to analyse yet. Run tests on the Measure tab, or load demo data on the Data tab.
        </ThemedText>
      </View>
    );
  }

  const demo = rows.some((r) => r.source === 'demo');
  const n4 = rows.filter((r) => r.technology === '4G').length;
  const n5 = rows.filter((r) => r.technology === '5G').length;
  const selected = METRICS.find((m) => m.key === metric)!;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {demo && (
        <ThemedText type="smallBold" style={{ color: theme.danger }}>
          Demo data is included. Remove it on the Data tab before analysing real results.
        </ThemedText>
      )}

      <Card title="4G vs 5G: all runs (mean ± SD)">
        <Table
          head={['', '4G', '5G']}
          rows={[
            ['Runs', String(n4), String(n5)],
            ...summary.map(({ m, s }) => [
              `${m.label} (${m.unit})`,
              s['4G'] ? `${num(s['4G'].mean)} ± ${num(s['4G'].sd)}` : '—',
              s['5G'] ? `${num(s['5G'].mean)} ± ${num(s['5G'].sd)}` : '—',
            ]),
          ]}
          flex={[1.4, 1, 1]}
        />
      </Card>

      <Card title="Comparison chart">
        <View style={styles.chips}>
          {METRICS.map((m) => (
            <Chip key={m.key} label={m.label} selected={m.key === metric} onPress={() => setMetric(m.key)} />
          ))}
        </View>
        <View style={styles.chips}>
          <Chip label="By location" selected={by === 'location'} onPress={() => setBy('location')} />
          <Chip label="By time of day" selected={by === 'period'} onPress={() => setBy('period')} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Mean {selected.label.toLowerCase()} ({selected.unit})
        </ThemedText>
        <BarChart data={chart.map((g) => ({ label: g.group, fourG: g.fourG?.mean ?? null, fiveG: g.fiveG?.mean ?? null }))} />
      </Card>

      <Card title={`H₀₁: is 5G different from 4G? (α = ${ALPHA})`}>
        <ThemedText type="small" themeColor="textSecondary">
          One pair = same date, location and time of day, each side the mean of that technology's runs. Difference is 5G − 4G.
        </ThemedText>
        <Table
          head={['', 'Pairs', 'Diff', 't-test p', 'Wilcoxon p']}
          rows={comparisons.map(({ m, c }) => [
            m.label,
            String(c.pairs),
            num(c.t?.meanDiff),
            `${pValue(c.t?.p)}${c.t && c.t.p <= ALPHA ? ' *' : ''}`,
            pValue(c.wilcoxon?.p),
          ])}
          flex={[1.3, 0.8, 1, 1.2, 1.3]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          * p ≤ {ALPHA}: reject H₀₁ for that metric. At least 2 pairs are needed. Wilcoxon is the non-parametric check.
        </ThemedText>
      </Card>

      <Card title="H₀₂: signal strength vs QoS">
        <ThemedText type="small" themeColor="textSecondary">
          Pearson r and Spearman ρ, computed within each technology. Only runs with a signal value count.
        </ThemedText>
        <Table
          head={['', '4G', '5G']}
          rows={correlations.map(({ m, f, g }) => [m.label, corrCell(f), corrCell(g)])}
          flex={[1.1, 1.3, 1.3]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          * Pearson p ≤ {ALPHA}. Correlation does not show cause.
        </ThemedText>
      </Card>
    </ScrollView>
  );
}

function corrCell(c: ReturnType<typeof signalCorrelation>) {
  if (!c.pearson || !c.spearman) return `n=${c.n}`;
  return `r ${num(c.pearson.r, 2)}${c.pearson.p <= ALPHA ? ' *' : ''}\nρ ${num(c.spearman.r, 2)} · n=${c.n}`;
}

function Table({ head, rows, flex }: { head: string[]; rows: string[][]; flex: number[] }) {
  return (
    <View style={styles.table}>
      <TableRow cells={head} flex={flex} bold />
      {rows.map((r, i) => (
        <TableRow key={i} cells={r} flex={flex} />
      ))}
    </View>
  );
}

function TableRow({ cells, flex, bold }: { cells: string[]; flex: number[]; bold?: boolean }) {
  return (
    <View style={styles.row}>
      {cells.map((c, i) => (
        <ThemedText key={i} type={bold ? 'smallBold' : 'small'} style={[styles.cell, { flex: flex[i] }]}>
          {c}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  empty: { flex: 1, justifyContent: 'center', padding: 24 },
  center: { textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  table: { gap: 6 },
  row: { flexDirection: 'row', gap: 4 },
  cell: { minWidth: 0, fontSize: 12, lineHeight: 17 },
});
