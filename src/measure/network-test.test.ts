import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { TEST } from '../constants/app.ts';
import { runTest, type Stage } from './network-test.ts';

const realFetch = globalThis.fetch;
const realTest = { ...TEST };
afterEach(() => {
  globalThis.fetch = realFetch;
  Object.assign(TEST, realTest);
});

const ok = (size = 0) => ({ ok: true, status: 200, blob: async () => ({ size }) }) as unknown as Response;
const bytesOf = (url: string) => Number(/bytes=(\d+)/.exec(url)?.[1] ?? 0);
const install = (handler: (url: string, init: RequestInit) => Promise<Response>) => {
  globalThis.fetch = ((url: unknown, init?: RequestInit) => handler(String(url), init ?? {})) as typeof fetch;
};
/** A request that never completes on its own but rejects when aborted, like a stalled connection. */
const stall = (init: RequestInit) =>
  new Promise<never>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));

test('a healthy run reports all stages in order, with live partial values and timings', async () => {
  install(async (url) => ok(bytesOf(url)));
  const stages: Stage[] = [];
  const partials: string[] = [];
  const r = await runTest(new AbortController().signal, (s) => stages.push(s), (p) => partials.push(Object.keys(p).join('+')));

  assert.deepEqual(stages, ['latency', 'download', 'upload']);
  assert.deepEqual(partials, ['latencyMs+jitterMs+lossPct', 'downloadMbps', 'uploadMbps']);
  assert.equal(r.lossPct, 0);
  assert.ok(r.downloadMbps > 0 && r.uploadMbps > 0 && Number.isFinite(r.latencyMs));
  assert.ok(r.bytes > 0);
  for (const s of stages) assert.ok(r.stageMs[s] >= 0);
});

test('an unresponsive server fails fast with a clear message, not after 20 timeouts', async () => {
  let calls = 0;
  install(async () => {
    calls++;
    throw new Error('Network request failed');
  });
  await assert.rejects(runTest(new AbortController().signal, () => {}), /No response from the test server/);
  assert.ok(calls <= 1 + TEST.minLatencySamples, `made ${calls} requests`);
});

test('a stalled download times out and names the stage instead of hanging', async () => {
  TEST.transferTimeoutMs = 80;
  install(async (url, init) => (bytesOf(url) === 0 ? ok() : stall(init)));
  await assert.rejects(runTest(new AbortController().signal, () => {}), /Download failed: timed out/);
});

test('pressing Stop during a stalled transfer rejects promptly with the abort, not a stage error', async () => {
  install(async (url, init) => (bytesOf(url) === 0 ? ok() : stall(init)));
  const ctrl = new AbortController();
  const started = Date.now();
  const run = runTest(ctrl.signal, (s) => {
    if (s === 'download') setTimeout(() => ctrl.abort(), 30);
  });
  await assert.rejects(run, (e: Error) => e.message === 'aborted');
  assert.ok(Date.now() - started < 2000, 'Stop must not wait for the transfer timeout');
});

test('a slow link stops probing once enough samples are in', async () => {
  TEST.latencyBudgetMs = 100;
  let probes = 0;
  install(async (url) => {
    if (bytesOf(url) === 0) {
      probes++;
      await new Promise((r) => setTimeout(r, 40));
    }
    return ok(bytesOf(url));
  });
  await runTest(new AbortController().signal, () => {});
  assert.ok(probes < 1 + TEST.latencyProbes, `sent ${probes} probes`);
  assert.ok(probes >= 1 + TEST.minLatencySamples);
});

test('a partly failing link still yields a result with packet loss', async () => {
  let n = 0;
  install(async (url) => {
    if (bytesOf(url) === 0 && ++n % 4 === 0) throw new Error('dropped');
    return ok(bytesOf(url));
  });
  const r = await runTest(new AbortController().signal, () => {});
  assert.ok(r.lossPct > 0 && r.lossPct < 100, `loss ${r.lossPct}`);
});
