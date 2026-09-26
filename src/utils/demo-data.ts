import type { NewMeasurement, Period, Technology } from '../types.ts';

export type SimulatedMetrics = Pick<
  NewMeasurement,
  'download_mbps' | 'upload_mbps' | 'latency_ms' | 'jitter_ms' | 'packet_loss_pct'
>;

const PERIOD_HOUR: Record<Period, number> = { Morning: 9, Afternoon: 14, Evening: 19 };
const PERIOD_LOAD: Record<Period, number> = { Morning: 1, Afternoon: 0.85, Evening: 0.7 };

/** Small deterministic PRNG (mulberry32) so the demo set is identical every time. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plausible made-up QoS numbers for one run: 5G faster and lower-latency than 4G, busier periods
 * slower, stronger signal faster. Used by the demo set and by Simulation mode.
 */
export function simulateMetrics(
  technology: Technology,
  period: Period,
  signalDbm: number | null,
  rand: () => number = Math.random,
): SimulatedMetrics {
  const is5G = technology === '5G';
  const signal = signalDbm ?? (is5G ? -80 : -88);
  const quality = Math.max(0.2, 1 + (signal + 90) / 60); // stronger signal -> faster
  const load = PERIOD_LOAD[period];
  return {
    download_mbps: round((is5G ? 90 : 28) * quality * load * (0.8 + rand() * 0.4)),
    upload_mbps: round((is5G ? 22 : 9) * quality * load * (0.8 + rand() * 0.4)),
    latency_ms: round((is5G ? 38 : 62) / load + rand() * 14),
    jitter_ms: round((is5G ? 4 : 9) + rand() * 5),
    packet_loss_pct: round(rand() < 0.25 ? (is5G ? 1 : 2.5) : 0),
  };
}

/**
 * Synthetic rows for trying out the Analysis tab. Every row has source = 'demo' so it can never be
 * mistaken for field data (Chapter 3.20: no fabricated results).
 */
export function makeDemoRows(locations: string[], now = new Date()): NewMeasurement[] {
  const rand = rng(2026);
  const rows: NewMeasurement[] = [];
  const periods: Period[] = ['Morning', 'Afternoon', 'Evening'];
  const techs: Technology[] = ['4G', '5G'];

  for (let day = 0; day < 3; day++) {
    locations.forEach((location, li) => {
      for (const period of periods) {
        for (const technology of techs) {
          const session = `demo-${day}-${location}-${period}-${technology}`;
          for (let run = 0; run < 3; run++) {
            const signal = Math.round((technology === '5G' ? -80 : -88) - li * 2 + (rand() - 0.5) * 24);
            const when = new Date(now);
            when.setDate(when.getDate() - day);
            when.setHours(PERIOD_HOUR[period], run * 3, 0, 0);
            rows.push({
              session_id: session,
              created_at: when.toISOString(),
              location,
              period,
              technology,
              detected_technology: technology,
              operator: 'Demo',
              signal_dbm: signal,
              ...simulateMetrics(technology, period, signal, rand),
              latitude: null,
              longitude: null,
              source: 'demo',
            });
          }
        }
      }
    });
  }
  return rows;
}

const round = (n: number) => Math.round(n * 100) / 100;
