import * as SQLite from 'expo-sqlite';

import type { Measurement, NewMeasurement } from '@/types';

const db = SQLite.openDatabaseSync('josqos.db');

db.execSync(`
  CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    location TEXT NOT NULL,
    period TEXT NOT NULL,
    technology TEXT NOT NULL,
    detected_technology TEXT,
    operator TEXT,
    signal_dbm REAL,
    download_mbps REAL NOT NULL,
    upload_mbps REAL NOT NULL,
    latency_ms REAL NOT NULL,
    jitter_ms REAL NOT NULL,
    packet_loss_pct REAL NOT NULL,
    latitude REAL,
    longitude REAL,
    source TEXT NOT NULL DEFAULT 'field'
  );
`);

const COLUMNS: (keyof NewMeasurement)[] = [
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

const INSERT = `INSERT INTO measurements (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`;

export function insertMeasurement(m: NewMeasurement) {
  db.runSync(INSERT, COLUMNS.map((c) => m[c]));
}

export function insertMany(rows: NewMeasurement[]) {
  db.withTransactionSync(() => rows.forEach(insertMeasurement));
}

/** Newest first. */
export function listMeasurements(): Measurement[] {
  return db.getAllSync<Measurement>('SELECT * FROM measurements ORDER BY created_at DESC, id DESC');
}

export function lastFieldMeasurement(): Measurement | null {
  return db.getFirstSync<Measurement>(
    "SELECT * FROM measurements WHERE source = 'field' ORDER BY created_at DESC, id DESC LIMIT 1",
  );
}

export function deleteMeasurement(id: number) {
  db.runSync('DELETE FROM measurements WHERE id = ?', [id]);
}

export function deleteDemoData() {
  db.runSync("DELETE FROM measurements WHERE source = 'demo'");
}
