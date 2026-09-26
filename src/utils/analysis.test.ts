import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Measurement } from '../types.ts';
import { byTechnology, compare, groupedMeans, matchedPairs, signalCorrelation } from './analysis.ts';
import { toCsv } from './csv.ts';
import { makeDemoRows, simulateMetrics } from './demo-data.ts';

let nextId = 1;
function row(over: Partial<Measurement>): Measurement {
  return {
    id: nextId++,
    session_id: 's',
    created_at: new Date(2026, 8, 1, 10).toISOString(),
    location: 'Terminus',
    period: 'Morning',
    technology: '4G',
    detected_technology: null,
    operator: null,
    signal_dbm: null,
    download_mbps: 10,
    upload_mbps: 5,
    latency_ms: 50,
    jitter_ms: 5,
    packet_loss_pct: 0,
    latitude: null,
    longitude: null,
    source: 'field',
    ...over,
  };
}

test('matchedPairs: averages runs per cell and skips cells missing a technology', () => {
  const rows = [
    row({ technology: '4G', download_mbps: 10 }),
    row({ technology: '4G', download_mbps: 20 }), // 4G mean 15
    row({ technology: '5G', download_mbps: 60 }),
    row({ technology: '5G', download_mbps: 80 }), // 5G mean 70
    row({ location: 'Rayfield', technology: '5G', download_mbps: 99 }), // no 4G partner
    row({ period: 'Evening', technology: '4G', download_mbps: 7 }), // no 5G partner
  ];
  assert.deepEqual(matchedPairs(rows, 'download_mbps'), { fiveG: [70], fourG: [15] });
});

test('matchedPairs: same place and period on different days are different pairs', () => {
  const day2 = new Date(2026, 8, 2, 10).toISOString();
  const rows = [
    row({ technology: '4G', download_mbps: 10 }),
    row({ technology: '5G', download_mbps: 50 }),
    row({ technology: '4G', download_mbps: 12, created_at: day2 }),
    row({ technology: '5G', download_mbps: 60, created_at: day2 }),
  ];
  const p = matchedPairs(rows, 'download_mbps');
  assert.equal(p.fiveG.length, 2);
});

test('byTechnology and null signal values', () => {
  const rows = [row({ technology: '5G', signal_dbm: -80 }), row({ technology: '5G', signal_dbm: null })];
  const s = byTechnology(rows, 'signal_dbm');
  assert.equal(s['5G']!.n, 1);
  assert.equal(s['4G'], null);
});

test('signalCorrelation only uses the requested technology and rows with a signal', () => {
  const rows = [
    row({ technology: '4G', signal_dbm: -100, download_mbps: 5 }),
    row({ technology: '4G', signal_dbm: -90, download_mbps: 10 }),
    row({ technology: '4G', signal_dbm: -80, download_mbps: 15 }),
    row({ technology: '4G', signal_dbm: null, download_mbps: 99 }),
    row({ technology: '5G', signal_dbm: -70, download_mbps: 500 }),
  ];
  const c = signalCorrelation(rows, '4G', 'download_mbps');
  assert.equal(c.n, 3);
  assert.ok(Math.abs(c.pearson!.r - 1) < 1e-12);
  assert.equal(signalCorrelation(rows, '5G', 'download_mbps').pearson, null); // one point only
});

test('groupedMeans keeps the requested order and appends unexpected groups', () => {
  const rows = [row({ location: 'Terminus' }), row({ location: 'Somewhere new', technology: '5G' })];
  const g = groupedMeans(rows, 'download_mbps', 'location', ['Rayfield', 'Terminus']);
  assert.deepEqual(g.map((x) => x.group), ['Rayfield', 'Terminus', 'Somewhere new']);
  assert.equal(g[0].fourG, null);
  assert.equal(g[1].fourG!.n, 1);
});

test('toCsv escapes commas, quotes and newlines and leaves nulls empty', () => {
  const csv = toCsv([row({ id: 7, operator: 'MTN, "Jos"\nline', signal_dbm: null })]);
  const [header, body] = csv.split('\r\n');
  assert.ok(header.startsWith('id,session_id,created_at,location'));
  assert.ok(body.includes('"MTN, ""Jos""\nline"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('demo data: deterministic, labelled, complete, and 5G beats 4G', () => {
  const locs = ['A', 'B', 'C', 'D'];
  const a = makeDemoRows(locs, new Date(2026, 8, 20));
  const b = makeDemoRows(locs, new Date(2026, 8, 20));
  assert.deepEqual(a, b);
  assert.equal(a.length, 3 * 4 * 3 * 2 * 3); // days x locations x periods x techs x runs
  assert.ok(a.every((r) => r.source === 'demo'));

  const rows = a.map((r, i) => ({ ...r, id: i + 1 }));
  const cmp = compare(rows, 'download_mbps');
  assert.equal(cmp.pairs, 3 * 4 * 3);
  assert.ok(cmp.t!.meanDiff > 0);
  assert.ok(cmp.t!.p < 0.05 && cmp.wilcoxon!.p < 0.05);
  const lat = compare(rows, 'latency_ms');
  assert.ok(lat.t!.meanDiff < 0); // 5G lower latency
});

test('simulateMetrics: 5G beats 4G, stronger signal is faster, busier periods are slower', () => {
  const mid = () => 0.5; // fixed "random" so only the inputs differ
  const g4 = simulateMetrics('4G', 'Morning', -85, mid);
  const g5 = simulateMetrics('5G', 'Morning', -85, mid);
  assert.ok(g5.download_mbps > g4.download_mbps && g5.upload_mbps > g4.upload_mbps);
  assert.ok(g5.latency_ms < g4.latency_ms);

  assert.ok(simulateMetrics('4G', 'Morning', -70, mid).download_mbps > simulateMetrics('4G', 'Morning', -100, mid).download_mbps);
  assert.ok(simulateMetrics('4G', 'Evening', -85, mid).download_mbps < g4.download_mbps);
});

test('simulateMetrics: no signal, extreme signal and unlucky draws all stay finite and sane', () => {
  for (const [signal, r] of [[null, 0.1], [-150, 0.9], [-20, 0.5]] as const) {
    const m = simulateMetrics('5G', 'Afternoon', signal, () => r);
    for (const v of Object.values(m)) assert.ok(Number.isFinite(v) && v >= 0, `${signal}: ${JSON.stringify(m)}`);
    assert.ok(m.download_mbps > 0);
  }
});
