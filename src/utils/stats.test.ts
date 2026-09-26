// Run: npm test   (compares against SciPy values in stats.fixtures.json)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { pairedTTest, pearson, spearman, summarize, wilcoxon } from './stats.ts';

const fx = JSON.parse(readFileSync(new URL('./stats.fixtures.json', import.meta.url), 'utf8'));

/** Matches within 1e-9, absolute or relative (SciPy prints ~1e-16 p-values as 0). */
function close(actual: number, expected: number, label: string) {
  const tol = 1e-9 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, expected ${expected}`);
}

test('summarize', () => {
  const s = summarize(fx.summary.xs)!;
  assert.equal(s.n, fx.summary.xs.length);
  close(s.mean, fx.summary.mean, 'mean');
  close(s.sd, fx.summary.sd, 'sd');
  assert.equal(s.min, fx.summary.min);
  assert.equal(s.max, fx.summary.max);
  assert.equal(summarize([]), null);
  assert.ok(Number.isNaN(summarize([4])!.sd));
});

for (const [name, c] of Object.entries<any>(fx.paired)) {
  test(`paired t-test: ${name}`, () => {
    const r = pairedTTest(c.a, c.b)!;
    assert.equal(r.df, c.df);
    close(r.t, c.t, 't');
    close(r.p, c.tp, 'p');
  });

  test(`wilcoxon: ${name}`, () => {
    const r = wilcoxon(c.a, c.b)!;
    assert.equal(r.method, c.method);
    close(r.statistic, c.wStat, 'W');
    close(r.p, c.wp, 'p');
  });
}

for (const [name, c] of Object.entries<any>(fx.corr)) {
  test(`pearson: ${name}`, () => {
    const r = pearson(c.x, c.y)!;
    close(r.r, c.r, 'r');
    close(r.p, c.rp, 'p');
  });

  test(`spearman: ${name}`, () => {
    const r = spearman(c.x, c.y)!;
    close(r.r, c.rho, 'rho');
    close(r.p, c.rhop, 'p');
  });
}

test('edge cases return null or sensible values instead of throwing', () => {
  assert.equal(pairedTTest([1], [2]), null);
  assert.equal(wilcoxon([1, 2], [1, 2]), null); // all differences zero
  assert.equal(pearson([1, 2], [3, 4]), null); // fewer than 3 points
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null); // no spread in x
  assert.deepEqual(pairedTTest([2, 3, 4], [1, 2, 3])!.p, 0); // constant non-zero difference
});
