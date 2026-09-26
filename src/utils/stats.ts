/**
 * Descriptive statistics and the hypothesis tests from Chapter 3 (3.14, 3.17, 3.18).
 * Pure functions, no dependencies. Verified against SciPy in stats.test.ts.
 */

export type Summary = { n: number; mean: number; sd: number; min: number; max: number };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Mean, sample SD (n - 1), min, max. `sd` is NaN when n < 2. */
export function summarize(xs: number[]): Summary | null {
  const n = xs.length;
  if (n === 0) return null;
  const mean = sum(xs) / n;
  const sd = n > 1 ? Math.sqrt(sum(xs.map((x) => (x - mean) ** 2)) / (n - 1)) : NaN;
  return { n, mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
}

// ---- special functions (Numerical Recipes / Lanczos) -----------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** ln Γ(x) for x > 0. */
function lgamma(x: number): number {
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const TINY = 1e-300;
const EPS = 1e-15;

/** Continued fraction for the incomplete beta function. */
function betacf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Regularized upper incomplete gamma Q(a, x). */
function gammq(a: number, x: number): number {
  if (x <= 0) return 1;
  const front = Math.exp(-x + a * Math.log(x) - lgamma(a));
  if (x < a + 1) {
    let ap = a;
    let total = 1 / a;
    let del = total;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      total += del;
      if (Math.abs(del) < Math.abs(total) * EPS) break;
    }
    return 1 - total * front;
  }
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return front * h;
}

/** Two-sided p-value of Student's t with `df` degrees of freedom. */
function tTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t)) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

/** Two-sided p-value of the standard normal. */
function normalTwoSidedP(z: number): number {
  return gammq(0.5, (z * z) / 2);
}

// ---- ranks -----------------------------------------------------------------

/** Average ranks (1-based), ties share the mean rank. */
export function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

// ---- paired t-test ---------------------------------------------------------

export type PairedT = { n: number; meanDiff: number; t: number; df: number; p: number };

/** Two-sided paired t-test on a[i] - b[i]. Needs at least 2 pairs. */
export function pairedTTest(a: number[], b: number[]): PairedT | null {
  const n = a.length;
  if (n < 2 || n !== b.length) return null;
  const d = a.map((v, i) => v - b[i]);
  const meanDiff = sum(d) / n;
  const sd = Math.sqrt(sum(d.map((v) => (v - meanDiff) ** 2)) / (n - 1));
  const df = n - 1;
  if (sd === 0) {
    // every difference identical
    return meanDiff === 0
      ? { n, meanDiff, t: 0, df, p: 1 }
      : { n, meanDiff, t: meanDiff > 0 ? Infinity : -Infinity, df, p: 0 };
  }
  const t = meanDiff / (sd / Math.sqrt(n));
  return { n, meanDiff, t, df, p: tTwoSidedP(t, df) };
}

// ---- Wilcoxon signed-rank --------------------------------------------------

export type Wilcoxon = { n: number; statistic: number; p: number; method: 'exact' | 'approx' };

/**
 * Two-sided Wilcoxon signed-rank test on a[i] - b[i], following SciPy's
 * `method='auto'`: zero differences are dropped; the p-value is exact (sign-flip
 * enumeration) when there are no ties or zeros, or when there are at most 13 pairs;
 * otherwise (ties/zeros with more pairs, or more than 50 pairs) a normal approximation
 * with tie correction and no continuity correction is used.
 */
export function wilcoxon(a: number[], b: number[]): Wilcoxon | null {
  if (a.length !== b.length || a.length === 0) return null;
  const total = a.length;
  const d = a.map((v, i) => v - b[i]);
  const nz = d.filter((v) => v !== 0);
  const n = nz.length;
  if (n === 0) return null;

  const abs = nz.map(Math.abs);
  const rk = ranks(abs);
  let rPlus = 0;
  let rMinus = 0;
  nz.forEach((v, i) => (v > 0 ? (rPlus += rk[i]) : (rMinus += rk[i])));
  const statistic = Math.min(rPlus, rMinus);

  const tieGroups = new Map<number, number>();
  abs.forEach((v) => tieGroups.set(v, (tieGroups.get(v) ?? 0) + 1));
  const hasTies = tieGroups.size !== n;
  const hasZeros = n !== total;

  const useExact = total <= 13 || (total <= 50 && !hasTies && !hasZeros);
  if (useExact) {
    // Distribution of r+ over all 2^n sign assignments. Ranks are multiples of 0.5,
    // so double them to get integer weights for a subset-sum count.
    const w = rk.map((r) => Math.round(2 * r));
    const max = sum(w);
    const counts = new Array<number>(max + 1).fill(0);
    counts[0] = 1;
    for (const wi of w) for (let s = max; s >= wi; s--) counts[s] += counts[s - wi];
    const obs = Math.round(2 * rPlus);
    let le = 0;
    let ge = 0;
    for (let s = 0; s <= max; s++) {
      if (s <= obs) le += counts[s];
      if (s >= obs) ge += counts[s];
    }
    const p = Math.min(1, (2 * Math.min(le, ge)) / 2 ** n);
    return { n, statistic, p, method: 'exact' };
  }

  const tieCorrect = [...tieGroups.values()].reduce((acc, t) => acc + (t ** 3 - t), 0);
  const mean = (n * (n + 1)) / 4;
  const se = Math.sqrt((n * (n + 1) * (2 * n + 1) - tieCorrect / 2) / 24);
  return { n, statistic, p: normalTwoSidedP((rPlus - mean) / se), method: 'approx' };
}

// ---- correlation -----------------------------------------------------------

export type Correlation = { n: number; r: number; p: number };

/** Pearson r with a two-sided p-value. Needs at least 3 points and some spread. */
export function pearson(x: number[], y: number[]): Correlation | null {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;
  const mx = sum(x) / n;
  const my = sum(y) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const p = Math.abs(r) === 1 ? 0 : tTwoSidedP(r * Math.sqrt((n - 2) / (1 - r * r)), n - 2);
  return { n, r, p };
}

/** Spearman ρ: Pearson on average ranks. */
export function spearman(x: number[], y: number[]): Correlation | null {
  if (x.length !== y.length) return null;
  return pearson(ranks(x), ranks(y));
}
