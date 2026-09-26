import type { Period, Technology } from '@/types';
import { simulateMetrics } from '@/utils/demo-data';

import type { RunResult, Stage } from './network-test';

const STAGE_MS = 700;

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Stand-in for runTest in Simulation mode: same stages and result shape, no network, made-up numbers. */
export async function simulateTest(
  signal: AbortSignal,
  onStage: (s: Stage) => void,
  technology: Technology,
  period: Period,
  signalDbm: number | null,
): Promise<RunResult> {
  for (const stage of ['latency', 'download', 'upload'] as const) {
    onStage(stage);
    await pause(STAGE_MS, signal);
  }
  const m = simulateMetrics(technology, period, signalDbm);
  return {
    downloadMbps: m.download_mbps,
    uploadMbps: m.upload_mbps,
    latencyMs: m.latency_ms,
    jitterMs: m.jitter_ms,
    lossPct: m.packet_loss_pct,
    bytes: 0,
  };
}
