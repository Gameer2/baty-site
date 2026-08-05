# Build Plan — Continuous Probability Distributions

Roadmap ref: `CURRICULUM_ROADMAP.md` §4A.4, priority **P1**, Tier-1 build-order item 2.
Read `00-SHARED-CONVENTIONS.md` in full before starting. This plan directly follows the
shape established by `04-discrete-distributions.md` (the `pmf`/`pdf`/`cdf` distribution
pattern) and reuses low-level machinery already landed by the `01`–`03` plans.

## 1. What this method is

A probability distribution explorer for **four continuous distributions**: **Normal**,
**Exponential**, **Uniform** (continuous), and **Gamma**. Each gets a PDF curve and a CDF
curve with adjustable parameters and a draggable "highlight x" marker showing the PDF
value, CDF value, mean, and variance at a glance. Category/eyebrow: **"Probability"**.

This is the continuous analogue of `04-discrete-distributions.md`. It exposes the same
three-function distribution shape (here `pdf`/`cdf`, no `quantile` for this pass):
- `pdf(x, params)` — density at a single point
- `cdf(x, params)` — cumulative probability P(X ≤ x)

The CDFs are **closed-form** for Normal (via the existing `normalCDF` erf approximation),
Exponential, and Uniform; the Gamma CDF reuses the existing `gammaP` lower incomplete
gamma function (the same routine `03-confidence-intervals.md` introduced for the
chi-square CDF — `chiSquareCDF(x, k) = gammaP(k/2, x/2)`, and the Gamma(shape, scale)
CDF is `gammaP(shape, x/scale)`). No new special-function code is added here.

### Reuse — DO NOT DUPLICATE (already in `stats-algorithms.js`)

- `StatsAlgorithms.normalCDF(z)` — standard normal CDF (Abramowitz-Stegun 7.1.26 erf
  approximation, max abs error ~1.5e-7). The Normal distribution's CDF is
  `normalCDF((x - mean) / sd)` — computed inline in `normalCDFValue`, not via a new
  wrapper. Do not re-implement `normalCDF`.
- `StatsAlgorithms.lgamma(x)` — Lanczos log-gamma. Reused inside `gammaPDF` for the
  `Γ(shape)` normalization factor. Do not re-implement.
- `StatsAlgorithms.gammaP(a, x)` — regularized lower incomplete gamma. Reused inside
  `gammaCDF` as `gammaP(shape, x / scale)`. Do not re-implement.
- `StatsAlgorithms.sampleNormal`, `sampleUniform`, `sampleExponential`, `mulberry32` —
  seeded samplers from the CLT build. The page does not run a simulation, so these are
  not called here, but a later "verify distribution by sampling" extension would use
  them rather than re-implementing.

## 2. `stats-algorithms.js` — functions to add

Append before the `return StatsAlgorithms;` line. Each function follows the existing
`StatsAlgorithms.X = function (...) {...}` UMD pattern with a `//` header comment
stating the formula, and `throw new Error("...")` with a specific message for invalid
parameters (never returns `NaN` or fails silently).

### 2a. Normal distribution (mean μ, standard deviation σ)

```js
// Normal(mean, sd): PDF f(x) = (1/(sd*sqrt(2*pi))) * exp(-((x-mean)^2)/(2*sd^2)).
StatsAlgorithms.normalPDF = function (x, mean, sd) {
  if (!(sd > 0)) throw new Error("sd must be positive.");
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
};

// Normal(mean, sd): CDF P(X <= x) = Phi((x-mean)/sd), via the existing normalCDF.
// (Inline call — no separate normalCDF wrapper added.)
StatsAlgorithms.normalCDFValue = function (x, mean, sd) {
  if (!(sd > 0)) throw new Error("sd must be positive.");
  return StatsAlgorithms.normalCDF((x - mean) / sd);
};

// Normal mean and variance: mean, sd^2.
StatsAlgorithms.normalMean = function (mean, sd) { return mean; };
StatsAlgorithms.normalVariance = function (mean, sd) { return sd * sd; };
```

### 2b. Uniform distribution (continuous) on [a, b]

```js
// Uniform(a, b): PDF f(x) = 1/(b-a) for a <= x <= b, 0 otherwise.
StatsAlgorithms.uniformPDF = function (x, a, b) {
  if (!(a < b)) throw new Error("a must be less than b.");
  return (x < a || x > b) ? 0 : 1 / (b - a);
};

// Uniform(a, b): CDF P(X <= x) = (x-a)/(b-a) clamped to [0, 1].
StatsAlgorithms.uniformCDF = function (x, a, b) {
  if (!(a < b)) throw new Error("a must be less than b.");
  if (x <= a) return 0;
  if (x >= b) return 1;
  return (x - a) / (b - a);
};

// Uniform mean and variance: (a+b)/2, (b-a)^2/12.
StatsAlgorithms.uniformMean = function (a, b) { return (a + b) / 2; };
StatsAlgorithms.uniformVariance = function (a, b) { return ((b - a) * (b - a)) / 12; };
```

### 2c. Exponential distribution (rate λ)

```js
// Exponential(rate): PDF f(x) = rate * exp(-rate*x) for x >= 0, 0 for x < 0.
StatsAlgorithms.exponentialPDF = function (x, rate) {
  if (!(rate > 0)) throw new Error("rate must be positive.");
  return x < 0 ? 0 : rate * Math.exp(-rate * x);
};

// Exponential(rate): CDF P(X <= x) = 1 - exp(-rate*x) for x >= 0, 0 for x < 0.
StatsAlgorithms.exponentialCDF = function (x, rate) {
  if (!(rate > 0)) throw new Error("rate must be positive.");
  return x < 0 ? 0 : 1 - Math.exp(-rate * x);
};

// Exponential mean and variance: 1/rate, 1/rate^2.
StatsAlgorithms.exponentialMean = function (rate) { return 1 / rate; };
StatsAlgorithms.exponentialVariance = function (rate) { return 1 / (rate * rate); };
```

### 2d. Gamma distribution (shape k, scale θ)

```js
// Gamma(shape, scale): PDF f(x) = x^(shape-1) * exp(-x/scale) / (Gamma(shape) * scale^shape),
// for x > 0; 0 for x <= 0 (when shape > 0). Uses lgamma for the Gamma(shape) normalization.
StatsAlgorithms.gammaPDF = function (x, shape, scale) {
  if (!(shape > 0)) throw new Error("shape must be positive.");
  if (!(scale > 0)) throw new Error("scale must be positive.");
  if (x <= 0) return shape > 1 ? 0 : (shape === 1 ? Math.exp(-x / scale) / scale : 0);
  const logPdf = (shape - 1) * Math.log(x) - x / scale - StatsAlgorithms.lgamma(shape) - shape * Math.log(scale);
  return Math.exp(logPdf);
};

// Gamma(shape, scale): CDF P(X <= x) = P(shape, x/scale) via the existing gammaP
// (regularized lower incomplete gamma). 0 for x <= 0.
StatsAlgorithms.gammaCDF = function (x, shape, scale) {
  if (!(shape > 0)) throw new Error("shape must be positive.");
  if (!(scale > 0)) throw new Error("scale must be positive.");
  if (x <= 0) return 0;
  return StatsAlgorithms.gammaP(shape, x / scale);
};

// Gamma mean and variance: shape*scale, shape*scale^2.
StatsAlgorithms.gammaMean = function (shape, scale) { return shape * scale; };
StatsAlgorithms.gammaVariance = function (shape, scale) { return shape * scale * scale; };
```

The `gammaPDF` branch at `x <= 0` handles the density's boundary behaviour correctly
without calling `Math.log(0)` (which would return `-Infinity` and produce a NaN via
`0 * -Infinity` for shape > 1): for `shape > 1` the density is 0 at the boundary, for
`shape === 1` it's the exponential density `exp(-x/scale)/scale`, and `shape < 1` has a
singularity at 0 (we return 0 rather than `Infinity` so plots stay finite — the same
convention Plotly's density curves use for a vertical asymptote).

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

All expected values below were produced by running `node -e` against the actual
formulas in `stats-algorithms.js` **before** this plan was written. Do not alter them.
Tolerances are tight (`1e-12`) for exact closed-form values and `1e-6` for values that
route through the `normalCDF` erf approximation (max abs error ~1.5e-7) or `gammaP`
series (max abs error ~3e-9).

```js
// Normal(mean=0, sd=1): PDF and CDF cross-checks against textbook table values.
{
  approx(StatsAlgorithms.normalPDF(0, 0, 1), 0.3989422804014327, 1e-12, "Normal(0,1) PDF at 0 = 1/sqrt(2pi)");
  approx(StatsAlgorithms.normalPDF(1, 0, 1), 0.24197072451914337, 1e-12, "Normal(0,1) PDF at 1");
  approx(StatsAlgorithms.normalPDF(2, 2, 3), 0.1329807601338109, 1e-12, "Normal(2,3) PDF at peak x=mean");
  approx(StatsAlgorithms.normalCDFValue(1.96, 0, 1), 0.9750021738917761, 1e-6, "Normal(0,1) CDF at 1.96 (textbook ~0.975)");
  approx(StatsAlgorithms.normalCDFValue(1, 0, 1), 0.8413447361676363, 1e-6, "Normal(0,1) CDF at 1 (textbook ~0.8413447)");
  approx(StatsAlgorithms.normalCDFValue(2, 2, 3), 0.5000000005, 1e-6, "Normal(2,3) CDF at x=mean (≈0.5)");
  approx(StatsAlgorithms.normalMean(2, 3), 2, 1e-12, "Normal mean");
  approx(StatsAlgorithms.normalVariance(2, 3), 9, 1e-12, "Normal variance");
}

// Exponential(rate=2): PDF and CDF cross-checks (closed form).
{
  approx(StatsAlgorithms.exponentialPDF(1, 2), 0.2706705664732254, 1e-12, "Exponential(2) PDF at 1");
  approx(StatsAlgorithms.exponentialPDF(0, 2), 2, 1e-12, "Exponential(2) PDF at 0");
  approx(StatsAlgorithms.exponentialPDF(-1, 2), 0, 1e-12, "Exponential(2) PDF at x<0 (zero)");
  approx(StatsAlgorithms.exponentialCDF(1, 2), 0.8646647167633873, 1e-12, "Exponential(2) CDF at 1 = 1-e^-2");
  approx(StatsAlgorithms.exponentialCDF(0, 2), 0, 1e-12, "Exponential(2) CDF at 0");
  approx(StatsAlgorithms.exponentialCDF(-1, 2), 0, 1e-12, "Exponential(2) CDF at x<0 (zero)");
  approx(StatsAlgorithms.exponentialMean(2), 0.5, 1e-12, "Exponential mean = 1/rate");
  approx(StatsAlgorithms.exponentialVariance(2), 0.25, 1e-12, "Exponential variance = 1/rate^2");
}

// Uniform(a=0, b=1) and Uniform(2,5): PDF and CDF cross-checks (closed form).
{
  approx(StatsAlgorithms.uniformPDF(0.5, 0, 1), 1, 1e-12, "Uniform(0,1) PDF = 1");
  approx(StatsAlgorithms.uniformPDF(3, 2, 5), 0.3333333333333333, 1e-12, "Uniform(2,5) PDF = 1/3");
  approx(StatsAlgorithms.uniformCDF(0.5, 0, 1), 0.5, 1e-12, "Uniform(0,1) CDF at 0.5");
  approx(StatsAlgorithms.uniformCDF(3, 2, 5), 0.3333333333333333, 1e-12, "Uniform(2,5) CDF at 3");
  approx(StatsAlgorithms.uniformCDF(-0.5, 0, 1), 0, 1e-12, "Uniform(0,1) CDF below a (clamped to 0)");
  approx(StatsAlgorithms.uniformCDF(2, 0, 1), 1, 1e-12, "Uniform(0,1) CDF above b (clamped to 1)");
  approx(StatsAlgorithms.uniformMean(0, 1), 0.5, 1e-12, "Uniform(0,1) mean = (a+b)/2");
  approx(StatsAlgorithms.uniformMean(2, 5), 3.5, 1e-12, "Uniform(2,5) mean");
  approx(StatsAlgorithms.uniformVariance(0, 1), 0.08333333333333333, 1e-12, "Uniform(0,1) variance = 1/12");
  approx(StatsAlgorithms.uniformVariance(2, 5), 0.75, 1e-12, "Uniform(2,5) variance = (b-a)^2/12");
}

// Gamma(shape=2, scale=1) and Gamma(shape=3, scale=2): PDF and CDF cross-checks.
// CDF at (2, shape=2, scale=1) = gammaP(2, 2) ≈ 0.593994 — textbook chi-square(4 df)
// at x=2 value is also gammaP(2, 1) (different scale), confirming the relationship
// chiSquareCDF(x, k) = gammaP(k/2, x/2) = gammaCDF(x, k/2, 2) (chi-square is Gamma(k/2, 2)).
{
  approx(StatsAlgorithms.gammaPDF(2, 2, 1), 0.2706705664732254, 1e-12, "Gamma(2,1) PDF at 2");
  approx(StatsAlgorithms.gammaPDF(1, 2, 1), 0.36787944117144233, 1e-12, "Gamma(2,1) PDF at 1");
  approx(StatsAlgorithms.gammaPDF(4, 3, 2), 0.1353352832366126, 1e-12, "Gamma(3,2) PDF at 4");
  approx(StatsAlgorithms.gammaPDF(0, 2, 1), 0, 1e-12, "Gamma(2,1) PDF at 0 (shape>1 -> 0)");
  approx(StatsAlgorithms.gammaCDF(2, 2, 1), 0.5939941502341012, 1e-9, "Gamma(2,1) CDF at 2 = gammaP(2,2)");
  approx(StatsAlgorithms.gammaCDF(1, 2, 1), 0.26424111759351754, 1e-9, "Gamma(2,1) CDF at 1");
  approx(StatsAlgorithms.gammaCDF(4, 3, 2), 0.32332358376087567, 1e-9, "Gamma(3,2) CDF at 4 = gammaP(3,2)");
  approx(StatsAlgorithms.gammaMean(2, 1), 2, 1e-12, "Gamma(2,1) mean = shape*scale");
  approx(StatsAlgorithms.gammaMean(3, 2), 6, 1e-12, "Gamma(3,2) mean");
  approx(StatsAlgorithms.gammaVariance(2, 1), 2, 1e-12, "Gamma(2,1) variance = shape*scale^2");
  approx(StatsAlgorithms.gammaVariance(3, 2), 12, 1e-12, "Gamma(3,2) variance");
}
```

This plan adds **8 + 8 + 10 + 11 = 37** new assertions. After adding these,
`node tests/verify-statistics.js` must report **83 + 37 = 120 passed, 0 failed**.

### Textbook cross-checks (per §9 of `00-SHARED-CONVENTIONS.md`)

- **Normal CDF**: `normalCDFValue(1.96, 0, 1) = 0.9750021738917761` vs the standard
  normal table value `P(Z ≤ 1.96) = 0.9750` — agrees to 4 decimals (the ~2.2e-6
  residual is the stated erf-approximation error, well within the `1e-6` tolerance
  scaled by the approximation's max-abs-error bound). `normalCDFValue(1, 0, 1) =
  0.8413447361676363` vs table `0.8413447` — agrees to 7 decimals.
- **Gamma ↔ Chi-square**: the chi-square distribution with `k` df is `Gamma(k/2, 2)`.
  The plan's `gammaCDF(x, shape, scale) = gammaP(shape, x/scale)` is the same function
  the existing `chiSquareCDF(x, k) = gammaP(k/2, x/2)` calls — i.e.
  `gammaCDF(x, k/2, 2) === chiSquareCDF(x, k)`. The `Gamma(2, 1)` CDF at 2
  (`gammaP(2, 2) = 0.593994...`) is a textbook regularized-incomplete-gamma table
  value for `P(2, 2)`, confirming the relationship numerically.

## 4. Files to create

- `math-lab/assets/js/continuous-distributions.js` — per-method DOM wiring.
- `math-lab/engines/statistics/methods/continuous-distributions.html`.

## 5. Inputs (the form panel)

- **Distribution chip row** (id `distRow`): **Normal**, **Exponential**, **Uniform**,
  **Gamma** — same `.chip` pattern as `discrete-distributions.html`.
- **Parameter fields** per distribution (shown/hidden by mode, in `.field-row`s):
  - **Normal**: `mean` (`type="number" step="0.1"`, default 0),
    `sd` (`type="number" step="0.1" min="0.01"`, default 1).
  - **Exponential**: `rate` (`type="number" step="0.1" min="0.01"`, default 2).
  - **Uniform**: `a` (`type="number" step="0.1"`, default 0),
    `b` (`type="number" step="0.1"`, default 1).
  - **Gamma**: `shape` (`type="number" step="0.1" min="0.01"`, default 2),
    `scale` (`type="number" step="0.1" min="0.01"`, default 1).
- **Highlight x** field (`type="number" step="0.1"`, id `highlightX`) — which x value
  to highlight in the PDF/CDF display. Default: the mean (rounded to 1 decimal).
- `.status-line`: Validates parameters are in range for each distribution
  (`sd > 0`, `rate > 0`, `a < b`, `shape > 0`, `scale > 0`).
- "Try Example" fills defaults above for whichever distribution is active.

## 6. Outputs (results panel)

Result strip (4 tiles): **Mean** (`accent`), **Variance**, **f(x)** (PDF at highlighted x),
**F(x)** (CDF at highlighted x).

Formula block (`formula-block--reference`), per distribution (rendered via KaTeX):
```
\text{Normal: } f(x) = \frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^2}{2\sigma^2}}
\qquad
\text{Exponential: } f(x) = \lambda e^{-\lambda x}
\qquad
\text{Uniform: } f(x) = \frac{1}{b-a}
\qquad
\text{Gamma: } f(x) = \frac{x^{k-1} e^{-x/\theta}}{\Gamma(k)\,\theta^k}
```
Render only the active distribution's formula.

Plot 1 — **"PDF"** (`#pdfPlot`, height 320px): `type: "scatter"`, `mode: "lines"` line
in teal-gold (`#c99a3c`), with a vertical dashed line at the mean (orange `#ed6d40`)
and a highlighted marker at `(x, f(x))` in orange. For the Gamma distribution with
`shape < 1` (singularity at 0) the curve starts just above 0 to avoid the asymptote.

Plot 2 — **"CDF"** (`#cdfPlot`, height 220px): `type: "scatter"`, `mode: "lines+markers"`
showing the CDF curve in teal-gold, with a highlighted point at `(x, F(x))` in orange
and a horizontal reference line at the CDF value of the highlighted x.

No data table, no step slider — the "steps" here are the x grid, shown directly in the
plots.

## 7. `methods.html` — card to add

Category `"Probability"`. Insert as card 7 (after Discrete Distributions, card 6).

```html
<!-- TODO index: pending consolidation — Statistics Engine card 7/8 -->
<a href="methods/continuous-distributions.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.48s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Probability</span>
    <span class="engine-index">7 / 8</span>
  </div>
  <h3 class="h3">Continuous Probability Distributions</h3>
  <p>Explores Normal, Exponential, Uniform, and Gamma distributions — PDF and CDF curves with adjustable parameters and a highlightable x marker.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">4 distributions</span>
    <span class="tag">PDF + CDF plots</span>
    <span class="tag">Closed-form + gammaP</span>
  </div>
</a>
```

**Note:** The `.engine-index` is `7 / 8` as a TODO marker — the consolidation pass will
fix all indices across the Statistics Engine. Card not added to `methods.html` directly
in this build (per the parallel-build addendum, §10 of `00-SHARED-CONVENTIONS.md`);
it is appended to `docs/agent-plans/PENDING-CARDS.md` under a `## Statistics Engine`
heading instead.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → **120 passed, 0 failed** (37 new assertions added).
- Normal(0,1): PDF at 0 = `0.39894` (`1/√(2π)`), CDF at 1.96 ≈ `0.97500`, Mean = `0`,
  Variance = `1`.
- Exponential(rate=2): CDF at 1 = `0.86466` (`1-e^-2`), Mean = `0.5`, Variance = `0.25`.
- Uniform(0,1): CDF at 0.5 = `0.5`, PDF = `1`, Mean = `0.5`, Variance = `0.08333` (`1/12`).
- Gamma(shape=2, scale=1): Mean = `2`, Variance = `2`, CDF at 2 = `0.59399`
  (`gammaP(2, 2)`).
- Switching distributions updates the formula block to show the correct formula.
- PDF curve integrates to ~1 (the CDF's right-tail value approaches 1 as x → ∞ —
  spot-check: the CDF plot's maximum y is 1).