# Build Plan — Confidence Intervals (Mean, Proportion, Variance)

Roadmap ref: `CURRICULUM_ROADMAP.md` §4B.7, priority **P0**, Tier-0 build-order item 14.
Read `00-SHARED-CONVENTIONS.md` in full, and confirm `00-RESTRUCTURE-hub-migration.md` has
landed (this plan reuses `StatsAlgorithms.betai`/`lgamma` that migration extracts), before
starting. Independent of `01`/`02` beyond that shared dependency — safe to build in
parallel per the same caveat as `02`'s plan file.

## 1. What this method is

The direct counterpart to the one-sample t-test already on the site: instead of asking
"is the mean equal to this specific value?" (hypothesis test), ask "what range plausibly
contains the true mean/proportion/variance, given this sample, at a chosen confidence
level?" Three sub-modes, one page (chip-toggle, same pattern as the migrated t-test/
regression toggle): **Mean**, **Proportion**, **Variance**. Category/eyebrow:
**"Sampling & Inference"**.

All three need a **critical value** — a quantile of a reference distribution (Student-t for
the mean, standard normal for the proportion, chi-square for the variance). None of these
quantile functions exist yet anywhere on the site; the restructured `betai` gives a CDF, not
its inverse. This plan adds them via **bisection on the existing (or newly added) CDF** —
consistent with the site's numerical-methods ethos ("nothing hidden": the critical value
isn't looked up from a hidden table, it's solved for, visibly, the same way Bisection solves
`f(x) = 0` elsewhere on the site).

## 2. `stats-algorithms.js` — functions to add

### 2a. Student-t quantile (mean CI) — reuses the existing `betai`/`tCDF`

```js
// Two-tailed critical value t* such that P(|T| > t*) = alpha, for the t-distribution
// with df degrees of freedom. Solved by bisection on the existing tCDF (monotonic
// decreasing in t for t > 0) — mirrors Bisection Method's own root-finding loop.
StatsAlgorithms.tCritical = function (alpha, df) {
  if (!(alpha > 0 && alpha < 1)) throw new Error("alpha must be between 0 and 1.");
  if (!(df > 0)) throw new Error("Degrees of freedom must be positive.");
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (StatsAlgorithms.tCDF(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};
```

### 2b. Standard normal CDF and quantile (proportion CI)

```js
// Standard normal CDF via the Abramowitz-Stegun 7.1.26 erf approximation
// (max absolute error ~1.5e-7) — good enough for a confidence-interval multiplier.
StatsAlgorithms.normalCDF = function (z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
};

// Two-tailed critical value z* such that P(|Z| > z*) = alpha, standard normal. Bisection
// on normalCDF, same pattern as tCritical.
StatsAlgorithms.zCritical = function (alpha) {
  if (!(alpha > 0 && alpha < 1)) throw new Error("alpha must be between 0 and 1.");
  let lo = 0, hi = 10;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const twoTailP = 2 * (1 - StatsAlgorithms.normalCDF(mid));
    if (twoTailP > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};
```

### 2c. Chi-square CDF and quantile (variance CI)

```js
// Regularized lower incomplete gamma P(a, x) via its series expansion (valid, fast-
// converging for x < a+1 — Numerical Recipes gser).
StatsAlgorithms.gammaP = function (a, x) {
  if (x <= 0) return 0;
  const ITMAX = 200, EPS = 3e-9;
  let ap = a, sum = 1 / a, del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1; del *= x / ap; sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - StatsAlgorithms.lgamma(a));
};

// Upper incomplete gamma's continued-fraction form (valid for x >= a+1 — NR gcf),
// used as 1 - gammaP when x is large, for numerical stability.
StatsAlgorithms.gammaQCF = function (a, x) {
  const ITMAX = 200, EPS = 3e-9, FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - StatsAlgorithms.lgamma(a)) * h;
};

// Chi-square CDF with k degrees of freedom: P(X <= x) = P(k/2, x/2).
StatsAlgorithms.chiSquareCDF = function (x, k) {
  const a = k / 2, half = x / 2;
  return half < a + 1 ? StatsAlgorithms.gammaP(a, half) : 1 - StatsAlgorithms.gammaQCF(a, half);
};

// Critical value x* such that P(X <= x*) = p, chi-square with k df. Bisection on
// chiSquareCDF (monotonic increasing in x).
StatsAlgorithms.chiSquareCritical = function (p, k) {
  if (!(p > 0 && p < 1)) throw new Error("p must be between 0 and 1.");
  let lo = 0, hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (StatsAlgorithms.chiSquareCDF(mid, k) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};
```

### 2d. The three confidence-interval functions

```js
// data: number[], confidence: e.g. 0.95 -> {n, mean, sd, se, df, tStar, margin, lower, upper}.
StatsAlgorithms.confidenceIntervalMean = function (data, confidence) {
  if (!(confidence > 0 && confidence < 1)) throw new Error("Confidence level must be between 0 and 1.");
  const stats = StatsAlgorithms.descriptiveStats(data);
  const df = stats.n - 1;
  const alpha = 1 - confidence;
  const tStar = StatsAlgorithms.tCritical(alpha, df);
  const margin = tStar * stats.se;
  return { n: stats.n, mean: stats.mean, sd: stats.sd, se: stats.se, df, tStar, margin, lower: stats.mean - margin, upper: stats.mean + margin };
};

// successes, n, confidence -> {phat, se, zStar, margin, lower, upper} (Wald interval).
StatsAlgorithms.confidenceIntervalProportion = function (successes, n, confidence) {
  if (!Number.isInteger(successes) || !Number.isInteger(n) || n < 1 || successes < 0 || successes > n) {
    throw new Error("successes must be an integer between 0 and n.");
  }
  if (!(confidence > 0 && confidence < 1)) throw new Error("Confidence level must be between 0 and 1.");
  const phat = successes / n;
  const se = Math.sqrt(phat * (1 - phat) / n);
  const zStar = StatsAlgorithms.zCritical(1 - confidence);
  const margin = zStar * se;
  return { phat, se, zStar, margin, lower: phat - margin, upper: phat + margin };
};

// data: number[], confidence -> {n, variance, df, chiLower, chiUpper, varLower, varUpper, sdLower, sdUpper}.
StatsAlgorithms.confidenceIntervalVariance = function (data, confidence) {
  if (!(confidence > 0 && confidence < 1)) throw new Error("Confidence level must be between 0 and 1.");
  const stats = StatsAlgorithms.descriptiveStats(data);
  const df = stats.n - 1;
  const alpha = 1 - confidence;
  const chiUpperCrit = StatsAlgorithms.chiSquareCritical(1 - alpha / 2, df); // large value
  const chiLowerCrit = StatsAlgorithms.chiSquareCritical(alpha / 2, df);     // small value
  const varLower = (df * stats.variance) / chiUpperCrit;
  const varUpper = (df * stats.variance) / chiLowerCrit;
  return { n: stats.n, variance: stats.variance, df, chiLower: chiLowerCrit, chiUpper: chiUpperCrit, varLower, varUpper, sdLower: Math.sqrt(varLower), sdUpper: Math.sqrt(varUpper) };
};
```

All three call `StatsAlgorithms.descriptiveStats` for mean/sd/variance rather than
recomputing them — required by the one-hard-rule, and it's the second method (after
`02-sampling-distributions-clt.md`'s `drawSampleMeans`) to build on it, which is exactly the
kind of shared-infrastructure payoff the restructuring pass was meant to unlock.

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

```js
// t-critical value cross-checked against standard textbook t-table values.
{
  approx(StatsAlgorithms.tCritical(0.05, 10), 2.228, 1e-3, "t* (alpha=0.05, df=10) vs table 2.228");
  approx(StatsAlgorithms.tCritical(0.05, 24), 2.064, 1e-3, "t* (alpha=0.05, df=24) vs table 2.064");
  approx(StatsAlgorithms.tCritical(0.01, 15), 2.947, 1e-3, "t* (alpha=0.01, df=15) vs table 2.947");
}

// z-critical value cross-checked against the standard 95% multiplier, 1.959964.
{
  approx(StatsAlgorithms.zCritical(0.05), 1.959964, 1e-4, "z* (alpha=0.05) vs standard 1.959964");
}

// chi-square critical values cross-checked against standard textbook table values (df=10).
{
  approx(StatsAlgorithms.chiSquareCritical(0.025, 10), 3.247, 1e-3, "chi-sq lower crit (df=10) vs table 3.247");
  approx(StatsAlgorithms.chiSquareCritical(0.975, 10), 20.483, 1e-3, "chi-sq upper crit (df=10) vs table 20.483");
}

// 95% CI for the mean, same 12-value dataset used throughout this engine's test cases.
{
  const data = [78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79];
  const result = StatsAlgorithms.confidenceIntervalMean(data, 0.95);
  approx(result.df, 11, 1e-12, "Mean CI: df");
  approx(result.tStar, 2.2009851426504072, 1e-6, "Mean CI: t*");
  approx(result.lower, 76.8243837044115, 1e-6, "Mean CI: lower bound");
  approx(result.upper, 87.50894962892184, 1e-6, "Mean CI: upper bound");
}

// 95% CI for a proportion: 64 successes out of 200 trials.
{
  const result = StatsAlgorithms.confidenceIntervalProportion(64, 200, 0.95);
  approx(result.phat, 0.32, 1e-12, "Proportion CI: phat");
  approx(result.lower, 0.25535093071853465, 1e-6, "Proportion CI: lower bound");
  approx(result.upper, 0.38464906928146536, 1e-6, "Proportion CI: upper bound");
}

// 95% CI for the variance, same 12-value dataset as the mean CI case above.
{
  const data = [78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79];
  const result = StatsAlgorithms.confidenceIntervalVariance(data, 0.95);
  approx(result.varLower, 35.477414188416006, 1e-6, "Variance CI: lower bound");
  approx(result.varUpper, 203.8045005040741, 1e-6, "Variance CI: upper bound");
  approx(result.sdLower, 5.956291983139846, 1e-6, "Variance CI: sd lower bound");
  approx(result.sdUpper, 14.276011365366521, 1e-6, "Variance CI: sd upper bound");
}
```

Every value pre-verified with `node -e`, using the exact bisection implementations in §2,
before writing this plan — including cross-checking the `tCritical`/`chiSquareCritical`
implementations against standard textbook table values (§9 addition in
`00-SHARED-CONVENTIONS.md` requires this for any p-value/critical-value method). This plan
adds **3 + 1 + 2 + 4 + 3 + 4 = 17** new assertions. Run
`node tests/verify-statistics.js` and confirm the reported total is exactly 17 more than
whatever it was before this plan landed — don't assume a specific absolute total, since
`01`/`02` may or may not have landed first.

## 4. Files to create

- `math-lab/assets/js/confidence-intervals.js` — per-method DOM wiring.
- `math-lab/engines/statistics/methods/confidence-intervals.html`.

## 5. Inputs (the form panel)

- Mode chip row (id `ciModeRow`): **Mean**, **Proportion**, **Variance** — same `.chip`
  pattern as the migrated t-test/regression toggle, three fields sections shown/hidden by
  mode exactly like that page's `ttestFields`/`regressionFields`.
- **Mean/Variance mode**: a data textarea (id `ciDataInput`), same parsing as every other
  data-input page. Default example: reuse the engine's standard 12-value dataset.
- **Proportion mode**: two numeric fields, `successes` and `n` (ids `successesInput`,
  `nInput`), `type="number" step="1" min="0"`. Default example: `successes = 64, n = 200`.
- **Confidence level** (all modes) — a chip row or a numeric field, values `90%, 95%, 99%`
  (id `confidenceInput`, stored as `0.90`/`0.95`/`0.99`). Default: `95%`.
- `.status-line` validating: at least 2 data values (mean/variance modes), or
  `0 <= successes <= n` (proportion mode).
- "Try Example" fills the defaults above for whichever mode is active.

## 6. Outputs (results panel)

Result strip (mode-dependent, 4 tiles each):
- **Mean**: point estimate `x̄` (`accent`), margin of error, lower bound, upper bound.
- **Proportion**: point estimate `p̂` (`accent`), margin of error, lower bound, upper bound.
- **Variance**: point estimate `s²` (`accent`), lower bound, upper bound, plus a fifth
  small note tile or inline text giving the **sd** bounds too (`sdLower`/`sdUpper`) — since
  a student usually wants the sd interval more than the raw variance interval; don't make
  them mentally take square roots of the displayed numbers.

Formula block, per mode (`Engine.renderKatex(..., true)`):
```
\bar{x} \pm t^{*}_{df}\cdot \frac{s}{\sqrt{n}}
\qquad\qquad
\hat{p} \pm z^{*}\cdot\sqrt{\frac{\hat{p}(1-\hat{p})}{n}}
\qquad\qquad
\left(\frac{(n-1)s^2}{\chi^2_{\alpha/2}},\ \frac{(n-1)s^2}{\chi^2_{1-\alpha/2}}\right)
```
Render only the active mode's formula, substituting the actual computed numbers the same
way the migrated t-test page already does (`Engine.renderKatex` with the numbers spliced
into the template string, not the bare symbolic formula alone).

Plot — **"Interval on a number line"** (`#ciPlot`, height 200px): a single horizontal line
trace (`mode: "lines"`, thin grey) spanning a padded range around the interval, a thick
`#c99a3c` line segment for the interval itself (`[lower, upper]` at a fixed y), a marker at
the point estimate, and (mean/proportion modes only) a small **repeated-intervals
simulation** underneath: draw `numSamples` (e.g. 100) new *simulated* samples from a normal
approximation centered at the point estimate — reusing `StatsAlgorithms.mulberry32` and
`sampleNormal` from `02-sampling-distributions-clt.md` if that plan has landed, or a
locally-seeded `Math.random()`-free equivalent if built before it — compute each one's CI,
draw each as a short horizontal segment stacked below the main one, colored `#5c939f` if it
contains the true point estimate and `#ed6d40` if it doesn't, with a caption reporting what
fraction did — this is the "confidence level" made visually concrete, the same payoff the
roadmap calls out for this method. If `02` hasn't landed yet, this sub-feature can ship as a
fast-follow rather than blocking the rest of the page — the core interval display (first
paragraph of this section) does not depend on it.

No data table, no step slider.

## 7. `methods.html` — card to add

Category `"Sampling & Inference"`.

```html
<a href="methods/confidence-intervals.html" class="card engine-card reveal crosshair-host" style="display:block;">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Sampling & Inference</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Confidence Intervals</h3>
  <p>Builds a confidence interval for a mean, proportion, or variance from sample data, with the critical value solved by bisection, not looked up.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Mean / proportion / variance</span>
    <span class="tag">Number-line plot</span>
    <span class="tag">Repeated-interval simulation</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md` (including the p-value/critical-value table
cross-check addition), plus:
- `node tests/verify-statistics.js` reports 17 more passed than before this plan, 0 failed.
- Mean mode, example dataset, 95% confidence → interval ≈ `[76.824, 87.509]`.
- Proportion mode, `64/200`, 95% confidence → interval ≈ `[0.255, 0.385]`.
- Variance mode, example dataset, 95% confidence → variance interval ≈ `[35.48, 203.80]`,
  sd interval ≈ `[5.96, 14.28]`.
- Changing confidence level from 95% to 99% widens every interval (sanity check on
  direction, not just magnitude).
