import assert from 'node:assert/strict';
import { test } from 'node:test';

import { latencyStats, periodOf, toMbps } from './calc.ts';

test('toMbps: 1 MB in 1 s is 8 Mbps', () => {
  assert.equal(toMbps(1_000_000, 1000), 8);
  assert.equal(toMbps(50_000_000, 2000), 200);
});

test('latencyStats: mean, jitter and loss', () => {
  // 3 of 5 probes lost? no: 1 of 5 lost -> 20%
  const r = latencyStats([100, 110, null, 90, 100]);
  assert.equal(r.lossPct, 20);
  assert.equal(r.latencyMs, 100);
  // consecutive successful RTTs: 100,110,90,100 -> |10|,|20|,|10| -> mean 13.333...
  assert.ok(Math.abs(r.jitterMs - 40 / 3) < 1e-12);
});

test('latencyStats: constant RTT has zero jitter; all lost gives NaN and 100%', () => {
  assert.equal(latencyStats([50, 50, 50]).jitterMs, 0);
  const r = latencyStats([null, null]);
  assert.equal(r.lossPct, 100);
  assert.ok(Number.isNaN(r.latencyMs));
});

test('periodOf', () => {
  assert.equal(periodOf(new Date(2026, 8, 1, 7)), 'Morning');
  assert.equal(periodOf(new Date(2026, 8, 1, 12)), 'Afternoon');
  assert.equal(periodOf(new Date(2026, 8, 1, 16, 59)), 'Afternoon');
  assert.equal(periodOf(new Date(2026, 8, 1, 17)), 'Evening');
  assert.equal(periodOf(new Date(2026, 8, 1, 23)), 'Evening');
});
