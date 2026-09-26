"""Generate reference values for src/utils/stats.test.ts using SciPy.

    python3 -m venv venv && ./venv/bin/pip install scipy numpy
    ./venv/bin/python scripts/make-stats-fixtures.py > src/utils/stats.fixtures.json
"""
import json
import numpy as np
from scipy import stats

# Paired data: (a, b) -> a - b. Wilcoxon path depends on ties/zeros, so cover each.
paired = {
    "exact_no_ties": (
        [10, 20, 30, 40, 50, 60, 70, 80, 90],
        [9, 22, 27, 36, 55, 54, 63, 72, 81],
    ),
    "ties_approx": (
        [5, 7, 9, 4, 12, 15, 8, 20, 3, 18, 11, 14],
        [4, 6, 7, 6, 9, 11, 4, 15, 9, 11, 3, 6],
    ),
    "zeros_approx": ([5, 7, 9, 4, 12], [5, 6, 9, 7, 8]),
    "decimals": (
        [41.2, 38.5, 55.1, 47.9, 60.3, 52.2, 44.8, 39.9, 58.4, 49.1, 43.3, 51.7],
        [30.1, 35.9, 42.8, 40.2, 51.7, 49.9, 41.0, 33.3, 50.2, 45.5, 36.8, 44.6],
    ),
}

# Larger samples: exercise the exact-DP path (n > 13, no ties/zeros) and the
# normal-approximation path (ties/zeros with n > 13, and n > 50).
rng = np.random.default_rng(42)


def make(n, decimals, zeros=0):
    a = np.round(rng.normal(50, 12, n), decimals)
    b = np.round(a - rng.normal(4, 6, n), decimals)
    for i in range(zeros):
        b[i] = a[i]
    return a.tolist(), b.tolist()


paired["exact_n20"] = make(20, 3)
paired["approx_ties_n16"] = make(16, 0)
paired["approx_zeros_n15"] = make(15, 1, zeros=2)
paired["approx_n60"] = make(60, 3)

corr = {
    "no_ties": (
        [-85, -90, -78, -101, -95, -70, -88, -82, -99, -75],
        [35.2, 20.1, 48.5, 8.4, 15.9, 60.3, 30.7, 41.1, 10.2, 52.8],
    ),
    "ties": (
        [-85, -90, -78, -101, -95, -70, -88, -82, -99, -75],
        [3, 3, 5, 7, 7, 7, 9, 10, 12, 12],
    ),
}

out = {"paired": {}, "corr": {}, "summary": {}}

for name, (a, b) in paired.items():
    tt = stats.ttest_rel(a, b)
    w = stats.wilcoxon(a, b)  # SciPy defaults, method='auto'
    d = np.array(a) - np.array(b)
    nz = d[d != 0]
    ties = len(set(np.abs(nz).tolist())) != len(nz)
    zeros = len(nz) != len(d)
    exact = len(d) <= 13 or (len(d) <= 50 and not ties and not zeros)
    out["paired"][name] = {
        "method": "exact" if exact else "approx",
        "a": a,
        "b": b,
        "t": float(tt.statistic),
        "df": int(tt.df),
        "tp": float(tt.pvalue),
        "wStat": float(w.statistic),
        "wp": float(w.pvalue),
    }

for name, (x, y) in corr.items():
    pr = stats.pearsonr(x, y)
    sp = stats.spearmanr(x, y)
    out["corr"][name] = {
        "x": x,
        "y": y,
        "r": float(pr.statistic),
        "rp": float(pr.pvalue),
        "rho": float(sp.statistic),
        "rhop": float(sp.pvalue),
    }

s = [12.5, 14.1, 9.8, 20.2, 18.7, 11.3]
out["summary"] = {
    "xs": s,
    "mean": float(np.mean(s)),
    "sd": float(np.std(s, ddof=1)),
    "min": min(s),
    "max": max(s),
}

print(json.dumps(out, indent=2))
