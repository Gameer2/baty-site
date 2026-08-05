# Build Plan — Discrete Probability Distributions

Roadmap ref: `CURRICULUM_ROADMAP.md` §4A.3, priority **P1**, Tier-1 build-order item 1.
Read `00-SHARED-CONVENTIONS.md` in full before starting. This plan establishes the
`pmf`/`cdf`/`quantile` function shape that all later distribution methods will follow —
get this one's structure right, it's the precedent for `05-continuous-distributions.md`.

## 1. What this method is

A probability distribution explorer for **four discrete distributions**: **Binomial**,
**Poisson**, **Geometric**, and **Hypergeometric**. Each gets a PMF bar chart with
draggable parameters and a CDF visualization. Category/eyebrow: **"Probability"**.

This is the first method to expose the three-function distribution shape from
`00-SHARED-CONVENTIONS.md` §2:
- `pmf(k, params)` — probability mass at a single point
- `cdf(k, params)` — cumulative probability P(X ≤ k)
- (No `quantile` for this first pass — inverse CDF for discrete distributions requires
  a different search pattern; add it later if a plan specifically calls for it)

All four distributions are **exact** — no numerical approximation, just combinatorics
and closed-form formulas. The PMF/CDF values are computed directly, not looked up.

## 2. `stats-algorithms.js` — functions to add

### 2a. Binomial distribution (n trials, probability p)

```js
// Binomial(n, p): PMF P(X = k) = C(n,k) * p^k * (1-p)^(n-k), for k = 0, 1, ..., n.
StatsAlgorithms.binomialPMF = function (k, n, p) {
  if (!Number.isInteger(n) || n < 0) throw new Error("n must be a non-negative integer.");
  if (!(p >= 0 && p <= 1)) throw new Error("p must be between 0 and 1.");
  if (!Number.isInteger(k) || k < 0 || k > n) return 0;
  // Compute C(n, k) iteratively to avoid factorial overflow
  let comb = 1;
  for (let i = 0; i < k; i++) comb = comb * (n - i) / (i + 1);
  return comb * Math.pow(p, k) * Math.pow(1 - p, n - k);
};

// Binomial(n, p): CDF P(X <= k) = sum of PMF from 0 to k.
StatsAlgorithms.binomialCDF = function (k, n, p) {
  if (!Number.isInteger(n) || n < 0) throw new Error("n must be a non-negative integer.");
  if (!(p >= 0 && p <= 1)) throw new Error("p must be between 0 and 1.");
  if (!Number.isInteger(k) || k < 0) return 0;
  if (k >= n) return 1;
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += StatsAlgorithms.binomialPMF(i, n, p);
  return sum;
};

// Binomial mean and variance: np, np(1-p).
StatsAlgorithms.binomialMean = function (n, p) { return n * p; };
StatsAlgorithms.binomialVariance = function (n, p) { return n * p * (1 - p); };
```

### 2b. Poisson distribution (rate lambda)

```js
// Poisson(lambda): PMF P(X = k) = e^(-lambda) * lambda^k / k!, for k = 0, 1, 2, ...
StatsAlgorithms.poissonPMF = function (k, lambda) {
  if (!(lambda > 0)) throw new Error("lambda must be positive.");
  if (!Number.isInteger(k) || k < 0) return 0;
  // Compute lambda^k / k! iteratively to avoid overflow
  let pk = 1;
  for (let i = 1; i <= k; i++) pk *= lambda / i;
  return Math.exp(-lambda) * pk;
};

// Poisson(lambda): CDF P(X <= k) = sum of PMF from 0 to k.
StatsAlgorithms.poissonCDF = function (k, lambda) {
  if (!(lambda > 0)) throw new Error("lambda must be positive.");
  if (!Number.isInteger(k) || k < 0) return 0;
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += StatsAlgorithms.poissonPMF(i, lambda);
  return sum;
};

// Poisson mean and variance: both equal lambda.
StatsAlgorithms.poissonMean = function (lambda) { return lambda; };
StatsAlgorithms.poissonVariance = function (lambda) { return lambda; };
```

### 2c. Geometric distribution (probability p, "trials until first success")

```js
// Geometric(p): PMF P(X = k) = (1-p)^(k-1) * p, for k = 1, 2, 3, ...
// This is the "trials until first success" convention (not "failures before success").
StatsAlgorithms.geometricPMF = function (k, p) {
  if (!(p > 0 && p <= 1)) throw new Error("p must be in (0, 1].");
  if (!Number.isInteger(k) || k < 1) return 0;
  return Math.pow(1 - p, k - 1) * p;
};

// Geometric(p): CDF P(X <= k) = 1 - (1-p)^k.
StatsAlgorithms.geometricCDF = function (k, p) {
  if (!(p > 0 && p <= 1)) throw new Error("p must be in (0, 1].");
  if (!Number.isInteger(k) || k < 1) return 0;
  return 1 - Math.pow(1 - p, k);
};

// Geometric mean and variance: 1/p, (1-p)/p^2.
StatsAlgorithms.geometricMean = function (p) { return 1 / p; };
StatsAlgorithms.geometricVariance = function (p) { return (1 - p) / (p * p); };
```

### 2d. Hypergeometric distribution (N population, K successes, n draws)

```js
// Hypergeometric(N, K, n): PMF P(X = k) = C(K,k) * C(N-K, n-k) / C(N, n).
// k ranges from max(0, n-(N-K)) to min(n, K).
StatsAlgorithms.hypergeometricPMF = function (k, N, K, n) {
  if (!Number.isInteger(N) || N < 0) throw new Error("N must be a non-negative integer.");
  if (!Number.isInteger(K) || K < 0 || K > N) throw new Error("K must be between 0 and N.");
  if (!Number.isInteger(n) || n < 0 || n > N) throw new Error("n must be between 0 and N.");
  const kMin = Math.max(0, n - (N - K));
  const kMax = Math.min(n, K);
  if (!Number.isInteger(k) || k < kMin || k > kMax) return 0;
  // C(a, b) helper
  function comb(a, b) {
    if (b < 0 || b > a) return 0;
    let c = 1;
    for (let i = 0; i < b; i++) c = c * (a - i) / (i + 1);
    return c;
  }
  return comb(K, k) * comb(N - K, n - k) / comb(N, n);
};

// Hypergeometric(N, K, n): CDF P(X <= k) = sum of PMF from 0 to k.
StatsAlgorithms.hypergeometricCDF = function (k, N, K, n) {
  if (!Number.isInteger(N) || N < 0) throw new Error("N must be a non-negative integer.");
  if (!Number.isInteger(K) || K < 0 || K > N) throw new Error("K must be between 0 and N.");
  if (!Number.isInteger(n) || n < 0 || n > N) throw new Error("n must be between 0 and N.");
  const kMin = Math.max(0, n - (N - K));
  if (!Number.isInteger(k) || k < kMin) return 0;
  const kMax = Math.min(n, K);
  if (k >= kMax) return 1;
  let sum = 0;
  for (let i = kMin; i <= k; i++) sum += StatsAlgorithms.hypergeometricPMF(i, N, K, n);
  return sum;
};

// Hypergeometric mean and variance: n*K/N, n*(K/N)*(1-K/N)*(N-n)/(N-1).
StatsAlgorithms.hypergeometricMean = function (N, K, n) { return n * K / N; };
StatsAlgorithms.hypergeometricVariance = function (N, K, n) {
  if (N < 2) return 0;
  const p = K / N;
  return n * p * (1 - p) * (N - n) / (N - 1);
};
```

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

```js
// Binomial(n=10, p=0.5): PMF and CDF cross-checks.
{
  approx(StatsAlgorithms.binomialPMF(5, 10, 0.5), 0.24609375, 1e-12, "Binomial(10,0.5) k=5 PMF");
  approx(StatsAlgorithms.binomialPMF(0, 10, 0.5), 0.0009765625, 1e-12, "Binomial(10,0.5) k=0 PMF");
  approx(StatsAlgorithms.binomialPMF(10, 10, 0.5), 0.0009765625, 1e-12, "Binomial(10,0.5) k=10 PMF");
  approx(StatsAlgorithms.binomialCDF(5, 10, 0.5), 0.623046875, 1e-12, "Binomial(10,0.5) k<=5 CDF");
  approx(StatsAlgorithms.binomialCDF(3, 10, 0.5), 0.171875, 1e-12, "Binomial(10,0.5) k<=3 CDF");
  approx(StatsAlgorithms.binomialMean(10, 0.5), 5, 1e-12, "Binomial mean");
  approx(StatsAlgorithms.binomialVariance(10, 0.5), 2.5, 1e-12, "Binomial variance");
}

// Poisson(lambda=3): PMF and CDF cross-checks.
{
  approx(StatsAlgorithms.poissonPMF(0, 3), 0.049787068367863944, 1e-12, "Poisson(3) k=0 PMF");
  approx(StatsAlgorithms.poissonPMF(1, 3), 0.14936120510359183, 1e-12, "Poisson(3) k=1 PMF");
  approx(StatsAlgorithms.poissonPMF(2, 3), 0.22404180765538775, 1e-12, "Poisson(3) k=2 PMF");
  approx(StatsAlgorithms.poissonPMF(3, 3), 0.22404180765538775, 1e-12, "Poisson(3) k=3 PMF");
  approx(StatsAlgorithms.poissonCDF(3, 3), 0.6472318887822313, 1e-12, "Poisson(3) k<=3 CDF");
  approx(StatsAlgorithms.poissonCDF(5, 3), 0.9160820579686966, 1e-12, "Poisson(3) k<=5 CDF");
  approx(StatsAlgorithms.poissonMean(3), 3, 1e-12, "Poisson mean");
  approx(StatsAlgorithms.poissonVariance(3), 3, 1e-12, "Poisson variance");
}

// Geometric(p=0.3): PMF and CDF cross-checks.
{
  approx(StatsAlgorithms.geometricPMF(1, 0.3), 0.3, 1e-12, "Geometric(0.3) k=1 PMF");
  approx(StatsAlgorithms.geometricPMF(2, 0.3), 0.21, 1e-12, "Geometric(0.3) k=2 PMF");
  approx(StatsAlgorithms.geometricPMF(3, 0.3), 0.147, 1e-12, "Geometric(0.3) k=3 PMF");
  approx(StatsAlgorithms.geometricCDF(3, 0.3), 0.657, 1e-12, "Geometric(0.3) k<=3 CDF");
  approx(StatsAlgorithms.geometricCDF(5, 0.3), 0.83193, 1e-12, "Geometric(0.3) k<=5 CDF");
  approx(StatsAlgorithms.geometricMean(0.3), 3.3333333333333335, 1e-12, "Geometric mean");
  approx(StatsAlgorithms.geometricVariance(0.3), 7.777777777777778, 1e-12, "Geometric variance");
}

// Hypergeometric(N=52, K=13, n=5): PMF and CDF cross-checks (5-card poker hand, hearts).
{
  approx(StatsAlgorithms.hypergeometricPMF(0, 52, 13, 5), 0.22153361344537814, 1e-12, "Hypergeometric k=0 PMF");
  approx(StatsAlgorithms.hypergeometricPMF(1, 52, 13, 5), 0.41141956782713085, 1e-12, "Hypergeometric k=1 PMF");
  approx(StatsAlgorithms.hypergeometricPMF(2, 52, 13, 5), 0.2742797118847539, 1e-12, "Hypergeometric k=2 PMF");
  approx(StatsAlgorithms.hypergeometricPMF(3, 52, 13, 5), 0.08154261704681873, 1e-12, "Hypergeometric k=3 PMF");
  approx(StatsAlgorithms.hypergeometricCDF(2, 52, 13, 5), 0.9072328931572629, 1e-12, "Hypergeometric k<=2 CDF");
  approx(StatsAlgorithms.hypergeometricCDF(3, 52, 13, 5), 0.9887755102040816, 1e-12, "Hypergeometric k<=3 CDF");
  approx(StatsAlgorithms.hypergeometricMean(52, 13, 5), 1.25, 1e-12, "Hypergeometric mean");
  approx(StatsAlgorithms.hypergeometricVariance(52, 13, 5), 0.8639705882352942, 1e-12, "Hypergeometric variance");
}
```

All values pre-verified with `node -e` before writing this plan — do not alter them.
This plan adds **7 + 8 + 7 + 8 = 30** new assertions. After adding these,
`node tests/verify-statistics.js` must report **53 + 30 = 83 passed, 0 failed**
(current baseline is 53 passed from the GLM track's 3 plans + 2 pre-existing methods).

## 4. Files to create

- `math-lab/assets/js/discrete-distributions.js` — per-method DOM wiring.
- `math-lab/engines/statistics/methods/discrete-distributions.html`.

## 5. Inputs (the form panel)

- **Distribution chip row** (id `distRow`): **Binomial**, **Poisson**, **Geometric**,
  **Hypergeometric** — same `.chip` pattern as other mode toggles.
- **Parameter fields** per distribution (shown/hidden by mode):
  - **Binomial**: `n` (`type="number" step="1" min="0" max="100"`, default 10),
    `p` (`type="number" step="0.01" min="0" max="1"`, default 0.5).
  - **Poisson**: `lambda` (`type="number" step="0.1" min="0.1" max="20"`, default 3).
  - **Geometric**: `p` (`type="number" step="0.01" min="0.01" max="1"`, default 0.3).
  - **Hypergeometric**: `N` (`type="number" step="1" min="1" max="1000"`, default 52),
    `K` (`type="number" step="1" min="0" max="N"`, default 13),
    `n` (`type="number" step="1" min="1" max="N"`, default 5).
- **Highlight k** field (`type="number" step="1"`, id `highlightK`) — which k value to
  highlight in the PMF/CDF display. Default: the mean (rounded to integer).
- `.status-line`: Validates parameters are in range for each distribution.
- "Try Example" fills defaults above for whichever distribution is active.

## 6. Outputs (results panel)

Result strip (4 tiles): **Mean** (`accent`), **Variance**, **P(X = k)** (PMF at highlighted k),
**P(X ≤ k)** (CDF at highlighted k).

Formula block (`formula-block--reference`), per distribution:
```
\text{Binomial: } P(X=k) = \binom{n}{k} p^k (1-p)^{n-k}
\qquad
\text{Poisson: } P(X=k) = e^{-\lambda} \frac{\lambda^k}{k!}
\qquad
\text{Geometric: } P(X=k) = (1-p)^{k-1} p
\qquad
\text{Hypergeometric: } P(X=k) = \frac{\binom{K}{k}\binom{N-K}{n-k}}{\binom{N}{n}}
```
Render only the active distribution's formula.

Plot 1 — **"PMF"** (`#pmfPlot`, height 320px): `type: "bar"` trace showing PMF for all
valid k values (0 to n for Binomial, 0 to ~lambda+4*sqrt(lambda) for Poisson, 1 to ~20 for
Geometric, kMin to kMax for Hypergeometric). Style: teal-gold bars (`#c99a3c`), with the
highlighted k bar in orange (`#ed6d40`). Add a vertical dashed line at the mean.

Plot 2 — **"CDF"** (`#cdfPlot`, height 220px): `type: "scatter"` with `mode: "lines+markers"`
showing the step-function CDF. Highlight the point at k with a marker. Add a horizontal
reference line at the CDF value for the highlighted k.

No data table, no step slider — the "steps" here are the k values, shown directly in the
plots.

## 7. `methods.html` — card to add

Category `"Probability"`. Insert as card 6 (after the 5 existing methods from the GLM track).

```html
<a href="methods/discrete-distributions.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.40s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Probability</span>
    <span class="engine-index">6 / 8</span>
  </div>
  <h3 class="h3">Discrete Probability Distributions</h3>
  <p>Explores Binomial, Poisson, Geometric, and Hypergeometric distributions — PMF bar charts and CDF visualization with draggable parameters.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">4 distributions</span>
    <span class="tag">PMF + CDF plots</span>
    <span class="tag">Exact formulas</span>
  </div>
</a>
```

**Note:** The `.engine-index` should be `6 / 8` assuming this lands after the 5 existing
methods (One-Sample t-Test, Linear Regression, Descriptive Statistics, Sampling Distributions,
Confidence Intervals) and before Continuous Distributions and Chi-Square Tests. Update all
existing cards' indices if needed per §7 of `00-SHARED-CONVENTIONS.md`.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → 83 passed, 0 failed (30 new assertions added).
- Binomial(n=10, p=0.5), k=5 → PMF ≈ `0.24609`, CDF ≈ `0.62305`, Mean = `5`, Variance = `2.5`.
- Poisson(λ=3), k=3 → PMF ≈ `0.22404`, CDF ≈ `0.64723`, Mean = `3`, Variance = `3`.
- Geometric(p=0.3), k=3 → PMF ≈ `0.147`, CDF ≈ `0.657`, Mean ≈ `3.333`.
- Hypergeometric(N=52, K=13, n=5), k=2 → PMF ≈ `0.27428`, CDF ≈ `0.90723`, Mean = `1.25`.
- Switching distributions updates the formula block to show the correct formula.
- PMF bars sum to 1 (spot-check: the y-axis max should be < 1, total height of all bars ≈ 1).
