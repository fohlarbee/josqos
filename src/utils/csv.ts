import type { Measurement } from '../types.ts';

const COLUMNS: (keyof Measurement)[] = [
  'id',
  'session_id',
  'created_at',
  'location',
  'period',
  'technology',
  'detected_technology',
  'operator',
  'signal_dbm',
  'download_mbps',
  'upload_mbps',
  'latency_ms',
  'jitter_ms',
  'packet_loss_pct',
  'latitude',
  'longitude',
  'source',
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV, one row per run, opens directly in Excel / SPSS. */
export function toCsv(rows: Measurement[]): string {
  const lines = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))];
  return lines.join('\r\n') + '\r\n';
}
