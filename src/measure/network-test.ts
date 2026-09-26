import { SERVER, TEST } from '@/constants/app';

import { latencyStats, toMbps } from './calc';

export type Stage = 'latency' | 'download' | 'upload';

export type RunResult = {
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  /** Payload bytes moved by the download and upload transfers. */
  bytes: number;
};

const nonce = () => Math.random().toString(36).slice(2);

/** Runs `task` with a signal that aborts on timeout or when the caller's signal aborts. */
async function withTimeout<T>(ms: number, outer: AbortSignal, task: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const forward = () => ctrl.abort();
  if (outer.aborted) ctrl.abort();
  else outer.addEventListener('abort', forward);
  try {
    return await task(ctrl.signal);
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
      await res.arrayBuffer();
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
  for (let i = 0; i < TEST.latencyProbes; i++) rtts.push(await probe(signal));
  const stats = latencyStats(rtts);
  if (Number.isNaN(stats.latencyMs)) throw new Error('No response from the test server. Check your connection.');
  return stats;
}

/** Transfers growing payloads; keeps escalating only while the last one finished quickly. */
async function measureTransfer(kind: 'down' | 'up', signal: AbortSignal) {
  const sizes = kind === 'down' ? TEST.downloadSizes : TEST.uploadSizes;
  let mbps: number | null = null;
  let bytes = 0;
  for (const size of sizes) {
    try {
      const ms = await withTimeout(TEST.transferTimeoutMs, signal, async (s) => {
        const t0 = performance.now();
        const res =
          kind === 'down'
            ? await fetch(`${SERVER.down(size)}&r=${nonce()}`, { signal: s })
            : await fetch(SERVER.up, { method: 'POST', body: 'a'.repeat(size), signal: s });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
        return performance.now() - t0;
      });
      mbps = toMbps(size, ms);
      bytes += size;
      if (ms >= TEST.escalateBelowMs) break;
    } catch (e) {
      if (signal.aborted) throw e;
      if (mbps === null) throw new Error(`${kind === 'down' ? 'Download' : 'Upload'} test failed. Check your connection.`);
      break; // a larger transfer timed out: keep the last completed measurement
    }
  }
  return { mbps: mbps as number, bytes };
}

/** One full run: latency/jitter/loss, then download, then upload. */
export async function runTest(signal: AbortSignal, onStage: (s: Stage) => void): Promise<RunResult> {
  onStage('latency');
  const lat = await measureLatency(signal);
  onStage('download');
  const down = await measureTransfer('down', signal);
  onStage('upload');
  const up = await measureTransfer('up', signal);
  return {
    downloadMbps: down.mbps,
    uploadMbps: up.mbps,
    latencyMs: lat.latencyMs,
    jitterMs: lat.jitterMs,
    lossPct: lat.lossPct,
    bytes: down.bytes + up.bytes,
  };
}
