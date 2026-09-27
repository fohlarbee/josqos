import { SERVER, TEST } from '../constants/app.ts';

import { latencyStats, toMbps } from './calc.ts';

export type Stage = 'latency' | 'download' | 'upload';

export type RunResult = {
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  /** Payload bytes moved by the download and upload transfers. */
  bytes: number;
  /** How long each stage took, to show where a slow run spends its time. */
  stageMs: Record<Stage, number>;
};

/** Values that become known before the run finishes, for the live display. */
export type PartialResult = Partial<Pick<RunResult, 'latencyMs' | 'jitterMs' | 'lossPct' | 'downloadMbps' | 'uploadMbps'>>;

const nonce = () => Math.random().toString(36).slice(2);
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Runs `task` with a signal that aborts on timeout or when the caller's signal aborts.
 * A timeout is reported as "timed out after N s"; a caller abort is passed through unchanged.
 */
async function withTimeout<T>(ms: number, outer: AbortSignal, task: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  const forward = () => ctrl.abort();
  if (outer.aborted) ctrl.abort();
  else outer.addEventListener('abort', forward);
  try {
    return await task(ctrl.signal);
  } catch (e) {
    if (timedOut && !outer.aborted) throw new Error(`timed out after ${Math.round(ms / 1000)} s`);
    throw e;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', forward);
  }
}

/** One zero-byte request; returns its round-trip time in ms, or null if it failed or timed out. */
async function probe(signal: AbortSignal): Promise<number | null> {
  try {
    return await withTimeout(TEST.probeTimeoutMs, signal, async (s) => {
      const t0 = performance.now();
      const res = await fetch(`${SERVER.down(0)}&r=${nonce()}`, { signal: s });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.blob();
      return performance.now() - t0;
    });
  } catch (e) {
    if (signal.aborted) throw e; // the user cancelled: not a lost packet
    return null;
  }
}

async function measureLatency(signal: AbortSignal) {
  await probe(signal); // warm-up: opens the connection, result discarded
  const rtts: (number | null)[] = [];
  const started = Date.now();
  for (let i = 0; i < TEST.latencyProbes; i++) {
    if (rtts.length >= TEST.minLatencySamples) {
      if (Date.now() - started > TEST.latencyBudgetMs) break; // slow link: enough samples
      if (rtts.every((v) => v === null)) break; // nothing is answering: fail fast
    }
    rtts.push(await probe(signal));
  }
  const stats = latencyStats(rtts);
  if (Number.isNaN(stats.latencyMs)) throw new Error('No response from the test server. Check the mobile data connection.');
  return stats;
}

/** Transfers growing payloads; keeps escalating only while the last one finished quickly. */
async function measureTransfer(kind: 'down' | 'up', signal: AbortSignal) {
  const sizes = kind === 'down' ? TEST.downloadSizes : TEST.uploadSizes;
  let mbps: number | null = null;
  let bytes = 0;
  for (const size of sizes) {
    try {
      const { ms, moved } = await withTimeout(TEST.transferTimeoutMs, signal, async (s) => {
        const t0 = performance.now();
        const res =
          kind === 'down'
            ? await fetch(`${SERVER.down(size)}&r=${nonce()}`, { signal: s })
            : await fetch(SERVER.up, { method: 'POST', body: 'a'.repeat(size), signal: s });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // blob(), not arrayBuffer(): React Native keeps blobs native, while arrayBuffer() would
        // copy every byte through a slow base64 step in JavaScript and inflate the timing.
        const blob = await res.blob();
        return { ms: performance.now() - t0, moved: kind === 'down' && blob.size > 0 ? blob.size : size };
      });
      mbps = toMbps(moved, ms);
      bytes += moved;
      if (ms >= TEST.escalateBelowMs) break;
    } catch (e) {
      if (signal.aborted) throw e;
      if (mbps === null) throw new Error(`${kind === 'down' ? 'Download' : 'Upload'} failed: ${reason(e)}`);
      break; // a larger transfer failed or timed out: keep the last completed measurement
    }
  }
  return { mbps: mbps as number, bytes };
}

/** One full run: latency/jitter/loss, then download, then upload. */
export async function runTest(
  signal: AbortSignal,
  onStage: (s: Stage) => void,
  onPartial: (p: PartialResult) => void = () => {},
): Promise<RunResult> {
  const stageMs: Record<Stage, number> = { latency: 0, download: 0, upload: 0 };
  const timed = async <T>(stage: Stage, task: () => Promise<T>): Promise<T> => {
    onStage(stage);
    const t0 = Date.now();
    try {
      return await task();
    } finally {
      stageMs[stage] = Date.now() - t0;
    }
  };

  const lat = await timed('latency', () => measureLatency(signal));
  onPartial({ latencyMs: lat.latencyMs, jitterMs: lat.jitterMs, lossPct: lat.lossPct });
  const down = await timed('download', () => measureTransfer('down', signal));
  onPartial({ downloadMbps: down.mbps });
  const up = await timed('upload', () => measureTransfer('up', signal));
  onPartial({ uploadMbps: up.mbps });

  return {
    downloadMbps: down.mbps,
    uploadMbps: up.mbps,
    latencyMs: lat.latencyMs,
    jitterMs: lat.jitterMs,
    lossPct: lat.lossPct,
    bytes: down.bytes + up.bytes,
    stageMs,
  };
}
