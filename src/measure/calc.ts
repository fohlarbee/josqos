import type { Period } from '@/types';

/** Mbps from a transfer of `bytes` that took `ms` milliseconds. */
export function toMbps(bytes: number, ms: number): number {
  return (bytes * 8) / (ms / 1000) / 1e6;
}

/**
 * Latency, jitter and packet loss from probe round-trip times (`null` = lost/timed out).
 * latency = mean RTT; jitter = mean absolute difference of consecutive successful RTTs;
 * loss = lost / sent x 100 (Chapter 3.15).
 */
export function latencyStats(rtts: (number | null)[]) {
  const ok = rtts.filter((v): v is number => v !== null);
  const lossPct = rtts.length ? ((rtts.length - ok.length) / rtts.length) * 100 : 100;
  if (ok.length === 0) return { latencyMs: NaN, jitterMs: NaN, lossPct };
  const latencyMs = ok.reduce((a, b) => a + b, 0) / ok.length;
  let jitterMs = 0;
  if (ok.length > 1) {
    let sum = 0;
    for (let i = 1; i < ok.length; i++) sum += Math.abs(ok[i] - ok[i - 1]);
    jitterMs = sum / (ok.length - 1);
  }
  return { latencyMs, jitterMs, lossPct };
}

export function periodOf(date: Date): Period {
  const h = date.getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}
