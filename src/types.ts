export type Technology = '4G' | '5G';
export type Period = 'Morning' | 'Afternoon' | 'Evening';

/** One test run. Signal is typed in by the researcher (see PLAN.md), everything else is measured. */
export type Measurement = {
  id: number;
  session_id: string;
  created_at: string; // ISO 8601, UTC
  location: string;
  period: Period;
  technology: Technology;
  detected_technology: Technology | null;
  operator: string | null;
  signal_dbm: number | null;
  download_mbps: number;
  upload_mbps: number;
  latency_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  latitude: number | null;
  longitude: number | null;
  source: 'field' | 'demo';
};

export type NewMeasurement = Omit<Measurement, 'id'>;

/** What the phone reports about its connection right now (see src/measure/radio.ts). */
export type RadioInfo = {
  technology: Technology | null;
  operator: string | null;
  /** RSRP in dBm of the serving technology, when the phone reports it. */
  signalDbm: number | null;
  /** LTE, NR, 3G ... shown to the user. */
  networkType: string | null;
  /** True when `technology` is trustworthy enough to hold the user's choice against it. */
  reliable: boolean;
  /** Raw readings for troubleshooting (Android build only). */
  details: string | null;
  source: 'native' | 'expo-cellular';
};
