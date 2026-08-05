# Build Plan — Two-Sample & Paired t-Tests + z-Test

Roadmap ref: `CURRICULUM_ROADMAP.md` §4B.8, priority **P1**, Tier-1 build-order
item 3 (see `BACKLOG.md`). Read `00-SHARED-CONVENTIONS.md` in full before starting.
This plan follows the shape established by `04-discrete-distributions.md` and
`05-continuous-distributions.md` (the eight-section layout) and reuses the
hypothesis-test UI pattern already live in `one-sample-t-test.html` /
`one-sample-t-test.js`, plus the mode-chip pattern from `confidence-intervals.js`.

## 1. What this method is

A hypothesis-test workspace with **three modes** (a chip row, like
`confidence-intervals.js`): **Two-Sample (Welch's)**, **Paired**, and **z-Test**
(one-sample, known variance). Category/eyebrow: **"Sampling & Inference"**.

- **Two-Sample (Welch's)** — the unequal-variance two-sample t-test. Welch's is
  the defensible default (it does not assume equal variances, matching this
  site's general preference for not hiding assumptions). The standard error is
  `se = sqrt(var1/n1 + var2/n2)` and the degrees of freedom use the
  Welch–Satterthwaite approximation. No pooled-variance option is provided.
- **Paired** — the paired t-test is a one-sample t-test on the per-subject
  differences. The implementation computes `differences = after - before` per
  pair and literally calls `runOneSampleTTest(differences, 0)`; it does not
  re-implement the t-statistic math.
- **z-Test (one-sample, known variance)** — the known-sigma case distinct from
  the t-test. With known population `sigma`, the test statistic is standard
  normal: `z = (mean - mu0) / (sigma/sqrt(n))`, `p = 2*(1 - Phi(|z|))`.

All p-values route through the existing exact distribution CDFs already in
`stats-algorithms.js` — `tCDF` (regularized incomplete beta) for the t-based
tests, `normalCDF` (Abramowitz-Stegun erf approximation) for the z-test. No
new special-function code is added here.

### Reuse — DO NOT DUPLICATE (already in `stats-algorithms.js`)

- `StatsAlgorithms.tCDF(t, df)` — two-tailed p for a t-statistic. Reuse for all
  t-test p-values. Do not re-implement.
- `StatsAlgorithms.runOneSampleTTest(data, mu0)` — returns
  `{n, mean, variance, sd, se, t, df, p}`. The paired t-test calls this on the
  derived differences array. Do not re-implement the t-statistic math.
- `StatsAlgorithms.descriptiveStats(data)` — for any summary stats needed.
- `StatsAlgorithms.normalCDF(z)` — standard normal CDF. The z-test's p-value is
  `2*(1 - normalCDF(|z|))`. Do not re-implement.
- `StatsAlgorithms.zCritical(alpha)` — for showing the z critical value in the
  UI. Do not re-implement.
- `StatsAlgorithms.tCritical(alpha, df)` — for showing the t critical value in
  the UI. Do not re-implement.

## 2. `stats-algorithms.js` — functions to add

Append before the `return StatsAlgorithms;` line. Each function follows the
existing `StatsAlgorithms.X = function (...) {...}` UMD pattern with a `//`
header comment stating the formula, and `throw new Error("...")` with a
specific message for invalid input (never returns `NaN` or fails silently).

### 2a. Welch's unequal-variance two-sample t-test

```js
// Welch's two-sample t-test (unequal variances): data1, data2 -> {n1, n2, mean1,
// mean2, var1, var2, se, t, df, p, diff}. se = sqrt(var1/n1 + var2/n2) with
// sample variances (/(n-1)); df is the Welch-Satterthwaite approximation;
// p = tCDF(|t|, df) (two-tailed). diff = mean1 - mean2.
StatsAlgorithms.runTwoSampleTTest = function (data1, data2) {
  if (!Array.isArray(data1) || data1.length < 2) throw new Error("Sample 1 needs at least two numeric values.");
  if (!Array.isArray(data2) || data2.length < 2) throw new Error("Sample 2 needs at least two numeric values.");
  const n1 = data1.length, n2 = data2.length;
  const mean1 = data1.reduce((s, v) => s + v, 0) / n1;
  const mean2 = data2.reduce((s, v) => s + v, 0) / n2;
  const var1 = data1.reduce((s, v) => s + (v - mean1) ** 2, 0) / (n1 - 1);
  const var2 = data2.reduce((s, v) => s + (v - mean2) ** 2, 0) / (n2 - 1);
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) throw new Error("Both samples have zero variance — test statistic is undefined.");
  const t = (mean1 - mean2) / se;
  const df = Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));
  const p = StatsAlgorithms.tCDF(Math.abs(t), df);
  return { n1, n2, mean1, mean2, var1, var2, se, t, df, p, diff: mean1 - mean2 };
};
```

### 2b. Paired t-test (one-sample t-test on per-subject differences)

```js
// Paired t-test: pairs is an array of [before, after] -> one-sample t-test on
// the per-pair differences (after - before) against mu0 = 0. Returns the
// runOneSampleTTest result augmented with {meanDiff, sdDiff} aliases. Differences
// are computed as (after - before); the UI copy documents this sign convention.
StatsAlgorithms.runPairedTTest = function (pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) throw new Error("Enter at least two [before, after] pairs.");
  const differences = pairs.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || Number.isNaN(p[0]) || Number.isNaN(p[1]))
      throw new Error("Each pair must be [before, after] with two numeric values.");
    return p[1] - p[0];
  });
  const r = StatsAlgorithms.runOneSampleTTest(differences, 0);
  return { n: r.n, meanDiff: r.mean, sdDiff: r.sd, variance: r.variance, sd: r.sd, se: r.se, t: r.t, df: r.df, p: r.p, differences };
};
```

### 2c. One-sample z-test with known population sigma

```js
// One-sample z-test with known population sigma: data, mu0, sigma ->
// {n, mean, sigma, se, z, p}. se = sigma/sqrt(n); z = (mean - mu0)/se;
// p = 2*(1 - normalCDF(|z|)) (two-tailed). This is the known-variance case
// distinct from the t-test (which uses the sample sd).
StatsAlgorithms.runZTest = function (data, mu0, sigma) {
  if (!Array.isArray(data) || data.length < 1) throw new Error("Enter at least one numeric value.");
  if (!(sigma > 0)) throw new Error("Population sigma must be positive.");
  const n = data.length;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const se = sigma / Math.sqrt(n);
  const z = (mean - mu0) / se;
  const p = 2 * (1 - StatsAlgorithms.normalCDF(Math.abs(z)));
  return { n, mean, sigma, se, z, p };
};
```

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

All expected values below were produced by running `node -e` against the actual
formulas in `stats-algorithms.js` **before** this plan was written. Do not alter
them. Tolerances are tight (`1e-12`) for exact hand-computable values, `1e-9` for
values routing through `tCDF`'s regularized incomplete beta (series/continued-
fraction with EPS 3e-7), and `1e-6` for the z-test's `normalCDF` erf
approximation (max abs error ~1.5e-7).

```js
// Welch's two-sample t-test, equal variances / equal n (hand-computable):
// d1=[5,6,7,8,9] (mean 7, var 2.5), d2=[1,2,3,4,5] (mean 3, var 2.5).
// se = sqrt(2.5/5 + 2.5/5) = 1, t = (7-3)/1 = 4, Welch df = 8 (= n1+n2-2 here
// because the variances are equal), p = tCDF(4, 8).
{
  const r = StatsAlgorithms.runTwoSampleTTest([5, 6, 7, 8, 9], [1, 2, 3, 4, 5]);
  approx(r.n1, 5, 1e-12, "Welch (equal n,var): n1");
  approx(r.n2, 5, 1e-12, "Welch (equal n,var): n2");
  approx(r.mean1, 7, 1e-12, "Welch (equal n,var): mean1");
  approx(r.mean2, 3, 1e-12, "Welch (equal n,var): mean2");
  approx(r.var1, 2.5, 1e-12, "Welch (equal n,var): var1");
  approx(r.var2, 2.5, 1e-12, "Welch (equal n,var): var2");
  approx(r.se, 1, 1e-12, "Welch (equal n,var): se = sqrt(0.5+0.5)");
  approx(r.t, 4, 1e-12, "Welch (equal n,var): t = (7-3)/1");
  approx(r.df, 8, 1e-9, "Welch (equal n,var): Welch-Satterthwaite df = 8");
  approx(r.diff, 4, 1e-12, "Welch (equal n,var): diff = mean1 - mean2");
  approx(r.p, 0.003949772798268517, 1e-9, "Welch (equal n,var): p = tCDF(4, 8)");
}

// Welch's two-sample t-test, unequal variances / unequal n (textbook-style example):
// a=[22,24,25,26,28,27,30,31,24,28] (n=10), b=[18,20,22,17,15,21,19,16] (n=8).
// mean1=26.5, mean2=18.5, var1=8.0556, var2=6 -> Welch df = 15.8715 (non-integer).
// Cross-check: p must equal tCDF(|t|, df) exactly.
{
  const r = StatsAlgorithms.runTwoSampleTTest(
    [22, 24, 25, 26, 28, 27, 30, 31, 24, 28],
    [18, 20, 22, 17, 15, 21, 19, 16]);
  approx(r.n1, 10, 1e-12, "Welch (unequal): n1");
  approx(r.n2, 8, 1e-12, "Welch (unequal): n2");
  approx(r.mean1, 26.5, 1e-12, "Welch (unequal): mean1");
  approx(r.mean2, 18.5, 1e-12, "Welch (unequal): mean2");
  approx(r.var1, 8.055555555555555, 1e-12, "Welch (unequal): var1");
  approx(r.var2, 6, 1e-12, "Welch (unequal): var2");
  approx(r.se, 1.247219128924647, 1e-12, "Welch (unequal): se");
  approx(r.t, 6.4142698058981855, 1e-12, "Welch (unequal): t");
  approx(r.df, 15.871465295629818, 1e-9, "Welch (unequal): Welch df (non-integer)");
  approx(r.diff, 8, 1e-12, "Welch (unequal): diff");
  approx(r.p, 0.00000890087497919452, 1e-9, "Welch (unequal): p");
  approx(r.p, StatsAlgorithms.tCDF(Math.abs(r.t), r.df), 1e-12, "Welch (unequal): p === tCDF(|t|, df)");
}

// Paired t-test: pairs [before, after] -> differences = after - before, then
// one-sample t-test on differences against 0. pairs = [[10,12],[14,15],[15,18],
// [12,14],[9,11]] -> diffs = [2,1,3,2,2], meanDiff = 2, var = 0.5,
// t = 2*sqrt(10) = 6.3245553, df = 4. Cross-check: runPairedTTest must produce
// identical t/df/p to runOneSampleTTest(differences, 0).
{
  const pairs = [[10, 12], [14, 15], [15, 18], [12, 14], [9, 11]];
  const diffs = [2, 1, 3, 2, 2];
  const r = StatsAlgorithms.runPairedTTest(pairs);
  const one = StatsAlgorithms.runOneSampleTTest(diffs, 0);
  approx(r.n, 5, 1e-12, "Paired: n");
  approx(r.meanDiff, 2, 1e-12, "Paired: meanDiff");
  approx(r.variance, 0.5, 1e-12, "Paired: variance of differences");
  approx(r.sdDiff, 0.7071067811865476, 1e-12, "Paired: sdDiff = sqrt(0.5)");
  approx(r.se, 0.31622776601683794, 1e-12, "Paired: se = sd/sqrt(5)");
  approx(r.t, 6.324555320336758, 1e-9, "Paired: t = 2*sqrt(10)");
  approx(r.df, 4, 1e-12, "Paired: df = n - 1");
  approx(r.p, 0.003198202152071666, 1e-9, "Paired: p = tCDF(6.3246, 4)");
  approx(r.t, one.t, 1e-12, "Paired: t === runOneSampleTTest(diffs, 0).t");
  approx(r.df, one.df, 1e-12, "Paired: df === runOneSampleTTest(diffs, 0).df");
  approx(r.p, one.p, 1e-12, "Paired: p === runOneSampleTTest(diffs, 0).p");
}

// One-sample z-test with known population sigma. data with n=16, mean=44,
// sigma=8, mu0=40 -> se=8/4=2, z=(44-40)/2=2, p=2*(1-Phi(2))=0.04550.
// Textbook cross-check: Phi(2) = 0.97725 (standard normal table), so the
// two-tailed p is 2*(1-0.97725) = 0.0455, matching the computed value to the
// erf approximation's ~1.5e-7 accuracy. Cross-check: p === 2*(1-normalCDF(|z|)).
{
  const data = [42, 46, 44, 43, 45, 44, 46, 42, 43, 45, 44, 44, 43, 45, 44, 44];
  const r = StatsAlgorithms.runZTest(data, 40, 8);
  approx(r.n, 16, 1e-12, "z-Test: n");
  approx(r.mean, 44, 1e-12, "z-Test: sample mean");
  approx(r.sigma, 8, 1e-12, "z-Test: sigma");
  approx(r.se, 2, 1e-12, "z-Test: se = 8/sqrt(16)");
  approx(r.z, 2, 1e-12, "z-Test: z = (44-40)/2 (textbook z=2)");
  approx(r.p, 0.04550012577451268, 1e-6, "z-Test: p = 2*(1-Phi(2)) (textbook ~0.0455)");
  approx(r.p, 2 * (1 - StatsAlgorithms.normalCDF(Math.abs(r.z))), 1e-12, "z-Test: p === 2*(1-normalCDF(|z|))");
}
```

This plan adds **11 + 12 + 11 + 7 = 41** new assertions. After adding these,
`node tests/verify-statistics.js` must report **120 + 41 = 161 passed, 0 failed**.

### Textbook cross-checks (per §9 of `00-SHARED-CONVENTIONS.md`)

- **Welch (equal n, equal var) p-value**: `t = 4`, `df = 8`. The standard
  t-table gives `t_{0.01, df=8} = 3.355` (two-tailed `alpha = 0.01`) and
  `t_{0.001, df=8} = 5.041` (two-tailed `alpha = 0.001`). Since
  `3.355 < 4 < 5.041`, the two-tailed p must lie in `(0.001, 0.01)` — the
  computed `p = 0.00395` does. The Welch df collapses to `n1 + n2 - 2 = 8` here
  because the two sample variances are equal (the Welch–Satterthwaite formula
  reduces to the pooled df in that special case).
- **Welch df (unequal variances)**: with unequal `var1 = 8.0556` and `var2 = 6`
  and unequal `n1 = 10`, `n2 = 8`, the Welch–Satterthwaite df is the
  non-integer `15.8715` — between `min(n1,n2)-1 = 7` and `n1+n2-2 = 16`, the
  expected range for Welch's df. This is the known behaviour for Welch's test
  (Satterthwaite 1946), and the value matches `node -e` to full double
  precision.
- **Paired t-test**: `t = 2*sqrt(10) = 6.3246`, `df = 4`. The standard t-table
  gives `t_{0.01, df=4} = 3.747` and `t_{0.001, df=4} = 8.610` (two-tailed). The
  computed `p = 0.00320` lies in `(0.001, 0.01)`, consistent. The
  cross-check `runPairedTTest` vs `runOneSampleTTest(differences, 0)` produces
  bit-identical `t`, `df`, `p` (tolerance `1e-12`) — confirming the paired test
  is literally the one-sample test on differences.
- **z-Test**: `z = 2`, `Phi(2) = 0.97725` (standard normal table), two-tailed
  `p = 2*(1-0.97725) = 0.0455`. The computed `p = 0.045500126` agrees to the
  erf approximation's stated ~1.5e-7 max abs error (tolerance `1e-6`). The
  internal-consistency cross-check `p === 2*(1-normalCDF(|z|))` passes at
  `1e-12`.

## 4. Files to create

- `math-lab/assets/js/two-sample-paired-tests.js` — per-method DOM wiring (IIFE).
- `math-lab/engines/statistics/methods/two-sample-paired-tests.html` — method
  page copying the structure of `one-sample-t-test.html` / `confidence-intervals.html`.

## 5. Inputs (the form panel)

- **Mode chip row** (id `modeRow`): **Two-Sample**, **Paired**, **z-Test** —
  same `.chip` pattern as `confidence-intervals.html`'s `ciModeRow`.
- **Per-mode input fields** (shown/hidden by mode):
  - **Two-Sample**: `data1Input` textarea (sample 1, default
    `22, 24, 25, 26, 28, 27, 30, 31, 24, 28`), `data2Input` textarea (sample 2,
    default `18, 20, 22, 17, 15, 21, 19, 16`).
  - **Paired**: `pairedInput` textarea, one `[before, after]` pair per line
    (default `10, 12\n14, 15\n15, 18\n12, 14\n9, 11`). Differences are computed
    as `after - before`; the field-note documents this sign convention.
  - **z-Test**: `zDataInput` textarea (default
    `42, 46, 44, 43, 45, 44, 46, 42, 43, 45, 44, 44, 43, 45, 44, 44`),
    `mu0Input` (default `40`), `sigmaInput` (default `8`).
- **Hypothesized difference** `d0Input` (default `0`) — only used by the
  two-sample mode (`t = (mean1 - mean2 - d0) / se`). For paired and z-test it
  is hidden (paired tests H₀: mean diff = 0; z-test uses mu0 directly).
- **Significance α** `alphaInput` (default `0.05`, `step="0.01"`, `min="0.001"`,
  `max="0.5"`).
- `.status-line` (id `verdictLine`) for the reject/fail-to-reject verdict.
- `.field#formError` for validation errors.
- "Try Example" fills defaults above for whichever mode is active.

## 6. Outputs (results panel)

Result strip (4 tiles, mode-specific):
- **Two-Sample**: `n1, n2` (combined as `n₁+n₂`), `mean1 - mean2` (accent),
  `t-statistic` (accent), `p-value`, `df`.
- **Paired**: `n pairs`, `mean diff` (accent), `t-statistic` (accent),
  `p-value`, `df`.
- **z-Test**: `n`, `x̄` (accent), `z-statistic` (accent), `p-value`,
  `σ/√n (se)`.

Formula block (`formula-block--reference`), per mode (rendered via KaTeX):
- **Two-Sample**: `t = \dfrac{\bar{x}_1 - \bar{x}_2 - d_0}{\sqrt{s_1^2/n_1 + s_2^2/n_2}}`,
  `df \approx \dfrac{(s_1^2/n_1 + s_2^2/n_2)^2}{(s_1^2/n_1)^2/(n_1-1) + (s_2^2/n_2)^2/(n_2-1)}`.
- **Paired**: `t = \dfrac{\bar{d} - 0}{s_d / \sqrt{n}}`, `df = n - 1`.
- **z-Test**: `z = \dfrac{\bar{x} - \mu_0}{\sigma / \sqrt{n}}`, `p = 2(1 - \Phi(|z|))`.

Render the active mode's formula with the substituted numeric values, then the
two-tailed p-value below it.

Plot (one per mode, `#testPlot`, height 320px):
- **Two-Sample**: two overlaid histograms (sample 1 teal-gold
  `rgba(201,154,60,0.5)`, sample 2 orange `rgba(237,109,64,0.5)`), with
  vertical lines at `mean1` (teal-gold) and `mean2` (orange dashed).
- **Paired**: histogram of the differences (teal-gold), with a vertical line at
  the mean difference (teal-gold) and a dashed reference line at 0 (orange).
  Optionally shade the t-distribution critical region — kept simple here: the
  histogram + two reference lines communicates the result clearly.
- **z-Test**: a number-line scatter showing the sample mean (teal-gold marker)
  against the hypothesized mean `mu0` (orange dashed line), with the standard
  normal curve `f(x) = (1/sqrt(2pi))exp(-x²/2)` drawn in the background
  rescaled to the plot, and the two-tailed rejection region
  `|z| > z_{alpha/2}` shaded orange. A vertical line at the observed z
  highlights where it falls.

Use `Engine.formatNum` for ALL displayed numbers (never `.toFixed()` directly).
`Engine.debounce` on every input listener (200 ms). `Engine.renderKatex` for
the formula block. `Engine.plotlyBaseLayout` / `Engine.plotlyConfig` for the
plot. `Proto.saveState` / `loadState` with store key
`engine-lab:statistics:twosample`.

## 7. `methods.html` — card to add

Category `"Sampling & Inference"`. Insert as card 8 of 8 (consolidation pass
will fix the index — the `8 / 8` is a TODO marker per the parallel-build
addendum, §10 of `00-SHARED-CONVENTIONS.md`).

```html
<!-- TODO index: pending consolidation — Statistics Engine card 8/8 (Two-Sample/Paired/z-Test) -->
<a href="methods/two-sample-paired-tests.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.56s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Sampling & Inference</span>
    <span class="engine-index">8 / 8</span>
  </div>
  <h3 class="h3">Two-Sample, Paired &amp; z-Tests</h3>
  <p>Compares two samples (Welch's unequal-variance t-test), paired observations (one-sample t-test on differences), or a sample against a known-variance reference (z-test) — p-values from the exact t and normal CDFs.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">3 test modes</span>
    <span class="tag">Welch's df</span>
    <span class="tag">Known-sigma z-test</span>
  </div>
</a>
```

**Note:** Card is NOT added to `methods.html` directly in this build (per the
parallel-build addendum, §10 of `00-SHARED-CONVENTIONS.md`); it is appended to
`docs/agent-plans/PENDING-CARDS.md` under the existing `## Statistics Engine`
heading instead.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → **161 passed, 0 failed** (41 new
  assertions added).
- Welch two-sample test on `[5,6,7,8,9]` vs `[1,2,3,4,5]` → `t = 4`,
  `df = 8`, `p ≈ 0.00395` (matches the node-verified values; p in `(0.001,
  0.01)` per the t-table for `df = 8`).
- Welch two-sample on the unequal-variance example → `t ≈ 6.4143`,
  `df ≈ 15.8715` (non-integer Welch–Satterthwaite df), `p ≈ 8.9e-6`.
- Paired test on `[[10,12],[14,15],[15,18],[12,14],[9,11]]` → `meanDiff = 2`,
  `t = 2*sqrt(10) ≈ 6.3246`, `df = 4`, `p ≈ 0.00320`; `t`, `df`, `p` are
  bit-identical to `runOneSampleTTest([2,1,3,2,2], 0)`.
- z-Test with `sigma = 8`, `mu0 = 40` on the 16-value sample → `z = 2`,
  `p ≈ 0.0455` (textbook `2*(1-Phi(2)) = 0.0455`).
- Switching modes updates the formula block, the visible input fields, and the
  plot to match the active mode.
- The plan file is complete with node-verified numbers.