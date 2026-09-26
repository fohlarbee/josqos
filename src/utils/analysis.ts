/** Turns stored measurements into the numbers shown on the Analysis tab (Chapter 3.14-3.18). */
import type { Measurement, Technology } from '../types.ts';
import {
  pairedTTest,
  pearson,
  spearman,
  summarize,
  wilcoxon,
  type Correlation,
  type PairedT,
  type Summary,
  type Wilcoxon,
} from './stats.ts';

export const METRICS = [
  { key: 'download_mbps', label: 'Download', unit: 'Mbps' },
  { key: 'upload_mbps', label: 'Upload', unit: 'Mbps' },
  { key: 'latency_ms', label: 'Latency', unit: 'ms' },
  { key: 'jitter_ms', label: 'Jitter', unit: 'ms' },
  { key: 'packet_loss_pct', label: 'Packet loss', unit: '%' },
  { key: 'signal_dbm', label: 'Signal', unit: 'dBm' },
] as const;

export type MetricKey = (typeof METRICS)[number]['key'];

const value = (m: Measurement, k: MetricKey): number | null => {
  const v = m[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

const valuesOf = (rows: Measurement[], k: MetricKey) =>
  rows.map((r) => value(r, k)).filter((v): v is number => v !== null);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Device-local calendar date, so an evening run is not filed under the next UTC day. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Mean / SD / min / max of one metric, per technology (all runs). */
export function byTechnology(rows: Measurement[], metric: MetricKey): Record<Technology, Summary | null> {
  return {
    '4G': summarize(valuesOf(rows.filter((r) => r.technology === '4G'), metric)),
    '5G': summarize(valuesOf(rows.filter((r) => r.technology === '5G'), metric)),
  };
}

/**
 * Matched pairs for the paired tests: one pair = same date + location + period, each side being
 * the mean of that technology's runs. Cells missing either technology are skipped.
 */
export function matchedPairs(rows: Measurement[], metric: MetricKey) {
  const cells = new Map<string, Record<Technology, number[]>>();
  for (const r of rows) {
    const v = value(r, metric);
    if (v === null) continue;
    const key = `${localDate(r.created_at)}|${r.location}|${r.period}`;
    const cell = cells.get(key) ?? { '4G': [], '5G': [] };
    cell[r.technology].push(v);
    cells.set(key, cell);
  }
  const fiveG: number[] = [];
  const fourG: number[] = [];
  for (const cell of cells.values()) {
    if (cell['4G'].length && cell['5G'].length) {
      fiveG.push(mean(cell['5G']));
      fourG.push(mean(cell['4G']));
    }
  }
  return { fiveG, fourG };
}

export type Comparison = { pairs: number; t: PairedT | null; wilcoxon: Wilcoxon | null };

/** H01: paired t-test and Wilcoxon on (5G - 4G) over the matched pairs. */
export function compare(rows: Measurement[], metric: MetricKey): Comparison {
  const { fiveG, fourG } = matchedPairs(rows, metric);
  return { pairs: fiveG.length, t: pairedTTest(fiveG, fourG), wilcoxon: wilcoxon(fiveG, fourG) };
}

export type SignalCorrelation = { n: number; pearson: Correlation | null; spearman: Correlation | null };

/** H02: signal strength vs one QoS metric, within a single technology. */
export function signalCorrelation(rows: Measurement[], tech: Technology, metric: MetricKey): SignalCorrelation {
  const x: number[] = [];
  const y: number[] = [];
  for (const r of rows) {
    if (r.technology !== tech) continue;
    const s = value(r, 'signal_dbm');
    const v = value(r, metric);
    if (s === null || v === null) continue;
    x.push(s);
    y.push(v);
  }
  return { n: x.length, pearson: pearson(x, y), spearman: spearman(x, y) };
}

export type GroupBy = 'location' | 'period';

/** Per-group mean for each technology, for the bar chart. `order` fixes the group order. */
export function groupedMeans(rows: Measurement[], metric: MetricKey, by: GroupBy, order: string[]) {
  const present = [...new Set(rows.map((r) => r[by] as string))];
  const groups = [...order, ...present.filter((g) => !order.includes(g))];
  return groups.map((group) => {
    const inGroup = rows.filter((r) => r[by] === group);
    const t = byTechnology(inGroup, metric);
    return { group, fourG: t['4G'], fiveG: t['5G'] };
  });
}
