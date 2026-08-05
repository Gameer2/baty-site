# Build Plan — Chi-Square Tests (Goodness-of-Fit & Independence)

Roadmap ref: `CURRICULUM_ROADMAP.md` §4B.9, priority **P1**, Tier-1 build-order
item 4 (see `BACKLOG.md`). Read `00-SHARED-CONVENTIONS.md` in full before starting.
This plan follows the eight-section layout established by `04-discrete-
distributions.md`, `05-continuous-distributions.md`, and `06-two-sample-paired-
tests.md`, and reuses the multi-mode hypothesis-test UI pattern already live in
`two-sample-paired-tests.html` / `two-sample-paired-tests.js` (chip row, per-mode
inputs shown/hidden, alpha selector, `.status-line` verdict, formula block,
Plotly plot).

## 1. What this method is

A hypothesis-test workspace with **two modes** (a chip row, like
`two-sample-paired-tests.js`): **Goodness-of-Fit** and **Test of Independence**.
Category/eyebrow: **"Sampling & Inference"**.

- **Goodness-of-Fit (GoF)** — tests whether an observed distribution over `k`
  categories matches a hypothesized expected distribution. The test statistic is
  `χ² = Σᵢ (Oᵢ − Eᵢ)² / Eᵢ`, distributed `χ²` with `df = k − 1` degrees of
  freedom (the base case; an optional `dfAdjust` subtracts the number of
  parameters estimated from the data, e.g. `dfAdjust = 1` when fitting a Normal's
  mean from the sample — documented in the UI copy). The p-value is the upper
  tail `p = 1 − chiSquareCDF(stat, df)`.
- **Test of Independence** — tests whether two categorical variables are
  independent across an `r × c` contingency table of counts. The expected count
  for cell `(i, j)` is `Eᵢⱼ = (rowTotalᵢ · colTotalⱼ) / grandTotal`; the test
  statistic is `χ² = ΣΣ (Oᵢⱼ − Eᵢⱼ)² / Eᵢⱼ`, distributed `χ²` with
  `df = (r − 1)(c − 1)`. The p-value is again the upper tail
  `p = 1 − chiSquareCDF(stat, df)`.

Both p-values route through the existing `StatsAlgorithms.chiSquareCDF` /
`chiSquareCritical` already in `stats-algorithms.js` — no new special-function
code is added here. The new functions compute the **test statistic** from
observed/expected counts and delegate to `chiSquareCDF` for the p-value.

### Reuse — DO NOT DUPLICATE (already in `stats-algorithms.js`)

- `StatsAlgorithms.chiSquareCDF(x, k)` — chi-square CDF with `k` df. Reuse for
  p-values: `p = 1 - chiSquareCDF(stat, df)` (upper tail). Do not re-implement.
- `StatsAlgorithms.chiSquareCritical(p, k)` — critical value via bisection on
  `chiSquareCDF`. Reuse for the critical-value display / rejection-region
  shading. Do not re-implement.
- `StatsAlgorithms.lgamma`, `StatsAlgorithms.gammaP`, `StatsAlgorithms.gammaQCF`
  — already underpin `chiSquareCDF`; do not re-implement.
- `StatsAlgorithms.descriptiveStats` — available if useful for summaries (not
  required by this plan).

## 2. `stats-algorithms.js` — functions to add

Append before the `return StatsAlgorithms;` line. Each function follows the
existing `StatsAlgorithms.X = function (...) {...}` UMD pattern with a `//`
header comment stating the formula, and `throw new Error("...")` with a
specific message for invalid input (never returns `NaN` or fails silently).

### 2a. Chi-Square Goodness-of-Fit

```js
// Chi-square goodness-of-fit test: observed, expected (equal-length arrays of
// counts; expected may be floats). stat = Σ (O-E)²/E; df = categories - 1 -
// (dfAdjust || 0); p = 1 - chiSquareCDF(stat, df) (upper tail). Returns
// {categories, observed, expected, stat, df, p, contributions}. dfAdjust is the
// number of parameters estimated from the data (default 0) — e.g. 1 when the
// expected distribution's mean was fitted from the sample.
StatsAlgorithms.chiSquareGoodnessOfFit = function (observed, expected, dfAdjust) {
  if (!Array.isArray(observed) || !Array.isArray(expected))
    throw new Error("observed and expected must be arrays.");
  if (observed.length !== expected.length)
    throw new Error("observed and expected must have the same number of categories.");
  if (observed.length < 2) throw new Error("Need at least two categories.");
  const adj = dfAdjust === undefined ? 0 : dfAdjust;
  if (!Number.isFinite(adj) || adj < 0 || adj >= observed.length - 1)
    throw new Error("dfAdjust must be in [0, categories - 1).");
  const k = observed.length;
  const contributions = new Array(k);
  let stat = 0;
  for (let i = 0; i < k; i++) {
    const o = observed[i], e = expected[i];
    if (!Number.isFinite(o) || o < 0) throw new Error("Observed counts must be non-negative numbers.");
    if (!Number.isFinite(e) || e <= 0) throw new Error("Expected counts must all be positive.");
    const c = (o - e) * (o - e) / e;
    contributions[i] = c;
    stat += c;
  }
  const df = k - 1 - adj;
  const p = 1 - StatsAlgorithms.chiSquareCDF(stat, df);
  return { categories: k, observed: [...observed], expected: [...expected], stat, df, p, contributions };
};
```

### 2b. Chi-Square Test of Independence

```js
// Chi-square test of independence: observedMatrix is a 2D array (rows × cols) of
// counts. expected_ij = (rowTotal_i * colTotal_j) / grandTotal;
// stat = ΣΣ (O-E)²/E; df = (rows-1)*(cols-1); p = 1 - chiSquareCDF(stat, df).
// Returns {rows, cols, observed, expected, rowTotals, colTotals, grandTotal,
// stat, df, p, contributions} where expected and contributions are 2D arrays.
StatsAlgorithms.chiSquareIndependence = function (observedMatrix) {
  if (!Array.isArray(observedMatrix) || observedMatrix.length < 2)
    throw new Error("Need at least two rows in the contingency table.");
  const rows = observedMatrix.length;
  const cols = observedMatrix[0] ? observedMatrix[0].length : 0;
  if (cols < 2) throw new Error("Need at least two columns in the contingency table.");
  for (let i = 0; i < rows; i++) {
    if (!Array.isArray(observedMatrix[i]) || observedMatrix[i].length !== cols)
      throw new Error("Contingency table must be rectangular (every row the same length).");
    for (let j = 0; j < cols; j++) {
      const v = observedMatrix[i][j];
      if (!Number.isFinite(v) || v < 0) throw new Error("All cell counts must be non-negative numbers.");
    }
  }
  const rowTotals = observedMatrix.map((r) => r.reduce((s, v) => s + v, 0));
  const colTotals = new Array(cols).fill(0);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) colTotals[j] += observedMatrix[i][j];
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0);
  if (grandTotal <= 0) throw new Error("Grand total must be positive.");
  const expected = new Array(rows);
  const contributions = new Array(rows);
  let stat = 0;
  for (let i = 0; i < rows; i++) {
    expected[i] = new Array(cols);
    contributions[i] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      const e = rowTotals[i] * colTotals[j] / grandTotal;
      if (e <= 0) throw new Error("Expected cell count is zero — collapse categories or collect more data.");
      const c = (observedMatrix[i][j] - e) * (observedMatrix[i][j] - e) / e;
      expected[i][j] = e;
      contributions[i][j] = c;
      stat += c;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const p = 1 - StatsAlgorithms.chiSquareCDF(stat, df);
  return {
    rows, cols,
    observed: observedMatrix.map((r) => [...r]),
    expected, rowTotals, colTotals, grandTotal,
    stat, df, p, contributions
  };
};
```

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

All expected values below were produced by running `node -e` against the actual
formulas in `stats-algorithms.js` **before** this plan was written (the
`chiSquareGoodnessOfFit` / `chiSquareIndependence` stat formulas were computed
inline against the existing `chiSquareCDF`). Do not alter them. Tolerances are
tight (`1e-12`) for exact hand-computable values (stat, df, totals, expected
counts), `1e-9` for the upper-tail p-values routing through `chiSquareCDF`
(series/continued-fraction with EPS 3e-9), and `1e-3` for the chi-square
critical-value textbook cross-checks (the bisection solves `chiSquareCDF` to
full double precision; `1e-3` is the tolerance at which standard textbook tables
are tabulated, so this is the cross-check tolerance, not a precision limit).

```js
// Chi-square goodness-of-fit — classic Mendel pea-genetics example. 556 peas
// classified Round/Yellow 315, Round/Green 108, Wrinkled/Yellow 101,
// Wrinkled/Green 32. Expected under 9:3:3:1 ratio: 312.75, 104.25, 104.25, 34.75.
// stat = (315-312.75)²/312.75 + (108-104.25)²/104.25 + (101-104.25)²/104.25 +
// (32-34.75)²/34.75 = 0.47002, df = 3, p = 0.92543. Cross-check: stat equals
// sum of contributions, and p === 1 - chiSquareCDF(stat, df).
{
  const r = StatsAlgorithms.chiSquareGoodnessOfFit(
    [315, 108, 101, 32],
    [312.75, 104.25, 104.25, 34.75]);
  approx(r.categories, 4, 1e-12, "GoF Mendel: categories");
  approx(r.observed.reduce((s, v) => s + v, 0), 556, 1e-12, "GoF Mendel: observed total = 556");
  approx(r.expected.reduce((s, v) => s + v, 0), 556, 1e-12, "GoF Mendel: expected total = 556");
  approx(r.stat, 0.4700239808153477, 1e-12, "GoF Mendel: stat");
  approx(r.df, 3, 1e-12, "GoF Mendel: df = k - 1");
  approx(r.p, 0.9254258951043723, 1e-9, "GoF Mendel: p (upper tail)");
  approx(r.p, 1 - StatsAlgorithms.chiSquareCDF(r.stat, r.df), 1e-12, "GoF Mendel: p === 1 - chiSquareCDF(stat, df)");
  approx(r.contributions[0], 0.01618705035971223, 1e-12, "GoF Mendel: contribution[0]");
  approx(r.contributions[1], 0.13489208633093525, 1e-12, "GoF Mendel: contribution[1]");
  approx(r.contributions[2], 0.1013189448441247, 1e-12, "GoF Mendel: contribution[2]");
  approx(r.contributions[3], 0.21762589928057555, 1e-12, "GoF Mendel: contribution[3]");
  approx(r.stat, r.contributions.reduce((s, v) => s + v, 0), 1e-12, "GoF Mendel: stat === Σ contributions");
}

// Chi-square goodness-of-fit — fair-die example. Die rolled 120 times; observed
// counts [20, 22, 17, 18, 19, 24] vs expected [20,20,20,20,20,20].
// stat = 0/20 + 4/20 + 9/20 + 4/20 + 1/20 + 16/20 = 34/20 = 1.7, df = 5,
// p = 0.88890. Cross-check: p === 1 - chiSquareCDF(stat, df).
{
  const r = StatsAlgorithms.chiSquareGoodnessOfFit(
    [20, 22, 17, 18, 19, 24],
    [20, 20, 20, 20, 20, 20]);
  approx(r.categories, 6, 1e-12, "GoF die: categories");
  approx(r.stat, 1.7, 1e-12, "GoF die: stat = 34/20 = 1.7");
  approx(r.df, 5, 1e-12, "GoF die: df = 5");
  approx(r.p, 0.8888997594949551, 1e-9, "GoF die: p (upper tail)");
  approx(r.p, 1 - StatsAlgorithms.chiSquareCDF(r.stat, r.df), 1e-12, "GoF die: p === 1 - chiSquareCDF(stat, df)");
  approx(r.contributions.length, 6, 1e-12, "GoF die: contributions length");
  approx(r.contributions[1], 0.2, 1e-12, "GoF die: contribution[1] = 4/20");
  approx(r.contributions[2], 0.45, 1e-12, "GoF die: contribution[2] = 9/20");
  approx(r.contributions[5], 0.8, 1e-12, "GoF die: contribution[5] = 16/20");
  approx(r.stat, r.contributions.reduce((s, v) => s + v, 0), 1e-12, "GoF die: stat === Σ contributions");
}

// Chi-square test of independence — 2×2 gender-vs-preference table.
// [[20,30],[30,20]] — row totals [50,50], col totals [50,50], grand 100, every
// expected cell = 25. stat = 4 * (25/25) = 4, df = 1, p = 0.045500.
// Cross-check: p === 1 - chiSquareCDF(4, 1). For df=1, χ²=4 corresponds to
// |z|=2 of a standard normal, so p ≈ 2*(1-Phi(2)) ≈ 0.0455 — a built-in
// cross-check between the chi-square (df=1) and normal CDFs.
{
  const r = StatsAlgorithms.chiSquareIndependence([[20, 30], [30, 20]]);
  approx(r.rows, 2, 1e-12, "Indep 2x2: rows");
  approx(r.cols, 2, 1e-12, "Indep 2x2: cols");
  approx(r.grandTotal, 100, 1e-12, "Indep 2x2: grand total = 100");
  approx(r.rowTotals[0], 50, 1e-12, "Indep 2x2: rowTotal[0]");
  approx(r.rowTotals[1], 50, 1e-12, "Indep 2x2: rowTotal[1]");
  approx(r.colTotals[0], 50, 1e-12, "Indep 2x2: colTotal[0]");
  approx(r.colTotals[1], 50, 1e-12, "Indep 2x2: colTotal[1]");
  approx(r.expected[0][0], 25, 1e-12, "Indep 2x2: expected[0][0] = 25");
  approx(r.expected[1][1], 25, 1e-12, "Indep 2x2: expected[1][1] = 25");
  approx(r.stat, 4, 1e-12, "Indep 2x2: stat = 4");
  approx(r.df, 1, 1e-12, "Indep 2x2: df = (2-1)*(2-1) = 1");
  approx(r.p, 0.0455002637847175, 1e-9, "Indep 2x2: p (upper tail, ≈ 2*(1-Phi(2)))");
  approx(r.p, 1 - StatsAlgorithms.chiSquareCDF(r.stat, r.df), 1e-12, "Indep 2x2: p === 1 - chiSquareCDF(stat, df)");
  approx(r.stat, r.contributions.flat().reduce((s, v) => s + v, 0), 1e-12, "Indep 2x2: stat === ΣΣ contributions");
}

// Chi-square test of independence — 2×3 contingency table.
// [[10,20,30],[15,25,40]] — row totals [60,80], col totals [25,45,70], grand 140.
// expected = [[10.714, 19.286, 30], [14.286, 25.714, 40]]; stat = 0.12963,
// df = 2, p = 0.93724. Cross-check: p === 1 - chiSquareCDF(stat, df).
{
  const r = StatsAlgorithms.chiSquareIndependence([[10, 20, 30], [15, 25, 40]]);
  approx(r.rows, 2, 1e-12, "Indep 2x3: rows");
  approx(r.cols, 3, 1e-12, "Indep 2x3: cols");
  approx(r.grandTotal, 140, 1e-12, "Indep 2x3: grand total = 140");
  approx(r.rowTotals[0], 60, 1e-12, "Indep 2x3: rowTotal[0]");
  approx(r.rowTotals[1], 80, 1e-12, "Indep 2x3: rowTotal[1]");
  approx(r.colTotals[0], 25, 1e-12, "Indep 2x3: colTotal[0]");
  approx(r.colTotals[1], 45, 1e-12, "Indep 2x3: colTotal[1]");
  approx(r.colTotals[2], 70, 1e-12, "Indep 2x3: colTotal[2]");
  approx(r.expected[0][0], 10.714285714285714, 1e-12, "Indep 2x3: expected[0][0]");
  approx(r.expected[0][2], 30, 1e-12, "Indep 2x3: expected[0][2] = 30");
  approx(r.expected[1][2], 40, 1e-12, "Indep 2x3: expected[1][2] = 40");
  approx(r.stat, 0.1296296296296296, 1e-12, "Indep 2x3: stat");
  approx(r.df, 2, 1e-12, "Indep 2x3: df = (2-1)*(3-1) = 2");
  approx(r.p, 0.937241010458719, 1e-9, "Indep 2x3: p (upper tail)");
  approx(r.p, 1 - StatsAlgorithms.chiSquareCDF(r.stat, r.df), 1e-12, "Indep 2x3: p === 1 - chiSquareCDF(stat, df)");
}

// Chi-square critical-value cross-checks against standard textbook table values.
// chiSquareCritical(p, k) inverts chiSquareCDF by bisection; the textbook χ²
// table values at α=0.05 (upper-tail area 0.05, so CDF = 0.95) are:
//   df=1: 3.841,  df=3: 7.815,  df=5: 11.070.
// At α=0.01 (CDF = 0.99), df=3: 11.345.
{
  approx(StatsAlgorithms.chiSquareCritical(0.95, 1), 3.841, 1e-3, "χ² crit: df=1, p=0.95 (textbook 3.841)");
  approx(StatsAlgorithms.chiSquareCritical(0.95, 3), 7.815, 1e-3, "χ² crit: df=3, p=0.95 (textbook 7.815)");
  approx(StatsAlgorithms.chiSquareCritical(0.95, 5), 11.070, 1e-3, "χ² crit: df=5, p=0.95 (textbook 11.070)");
  approx(StatsAlgorithms.chiSquareCritical(0.99, 3), 11.345, 1e-3, "χ² crit: df=3, p=0.99 (textbook 11.345)");
}
```

This plan adds **12 + 11 + 14 + 14 + 4 = 55** new assertions. After adding
these, `node tests/verify-statistics.js` must report **161 + 55 = 216 passed,
0 failed**.

### Textbook cross-checks (per §9 of `00-SHARED-CONVENTIONS.md`)

- **GoF Mendel**: `stat = 0.4700`, `df = 3`. The standard χ² table gives
  `χ²_{0.05, df=3} = 7.815` and `χ²_{0.01, df=3} = 11.345`. Since
  `0.4700 ≪ 7.815`, the test fails to reject the 9:3:3:1 ratio — the computed
  `p = 0.9254` is consistent (well above 0.05). This is the classic Mendel
  result (the data fits the hypothesized ratio extremely well).
- **GoF die**: `stat = 1.7`, `df = 5`. The standard χ² table gives
  `χ²_{0.05, df=5} = 11.070`. Since `1.7 < 11.070`, fail to reject fairness —
  `p = 0.8889` agrees.
- **Independence 2×2**: `stat = 4`, `df = 1`. The standard χ² table gives
  `χ²_{0.05, df=1} = 3.841`. Since `4 > 3.841`, reject independence at
  `α = 0.05` — the computed `p = 0.0455` agrees. Bonus cross-check: for
  `df = 1`, `χ² = z²`, so `χ² = 4` corresponds to `|z| = 2` and
  `p = 2*(1 - Phi(2)) ≈ 0.0455` — the same value the z-test plan (item 06)
  cites, providing an internal cross-check between `chiSquareCDF(4, 1)` and
  `normalCDF`.
- **Independence 2×3**: `stat = 0.1296`, `df = 2`. The χ² table gives
  `χ²_{0.05, df=2} = 5.991`. Since `0.1296 < 5.991`, fail to reject
  independence — `p = 0.9372` agrees.
- **Critical-value cross-checks**: `chiSquareCritical(0.95, 1) = 3.841`,
  `chiSquareCritical(0.95, 3) = 7.815`, `chiSquareCritical(0.95, 5) = 11.070`,
  `chiSquareCritical(0.99, 3) = 11.345` — all match the textbook χ² table to
  the tabulated 3-decimal precision (tolerance `1e-3`).

## 4. Files to create

- `math-lab/assets/js/chi-square-tests.js` — per-method DOM wiring (IIFE).
- `math-lab/engines/statistics/methods/chi-square-tests.html` — method page
  copying the structure of `two-sample-paired-tests.html` (simplified two-link
  header nav, chip row, per-mode inputs, alpha selector, `.status-line`, result
  strip, formula block, Plotly plot).

## 5. Inputs (the form panel)

- **Mode chip row** (id `modeRow`): **Goodness-of-Fit**, **Independence** —
  same `.chip` pattern as `two-sample-paired-tests.html`'s `modeRow`.
- **Per-mode input fields** (shown/hidden by mode):
  - **Goodness-of-Fit**: `gofObservedInput` textarea (one observed count per
    line or comma-separated; default `315, 108, 101, 32`), `gofExpectedInput`
    textarea (expected counts in the same order; default
    `312.75, 104.25, 104.25, 34.75`), and an optional `dfAdjustInput`
    (default `0`, `step="1"`, `min="0"`) for parameters estimated from the
    data — the field-note documents the `df = k − 1 − dfAdjust` convention.
    A convenience `equalExpectedBtn` is optional; not required.
  - **Independence**: `indepMatrixInput` textarea — one table row per line,
    columns comma-separated (default `20, 30\n30, 20`). The field-note shows
    the `10,20,30;15,25,40` example as well.
- **Significance α** `alphaInput` (default `0.05`, `step="0.01"`,
  `min="0.001"`, `max="0.5"`).
- `.status-line` (id `verdictLine`) for the reject/fail-to-reject verdict.
- `.field#formError` for validation errors.
- "Try Example" fills defaults above for whichever mode is active.

## 6. Outputs (results panel)

Result strip (mode-specific, 5 tiles):
- **Goodness-of-Fit**: `categories`, `χ² stat` (accent), `df`, `p-value`
  (accent), `critical χ²_{α}`.
- **Independence**: `rows × cols`, `χ² stat` (accent), `df`, `p-value`
  (accent), `critical χ²_{α}`.

Formula block (`formula-block--reference`), per mode (rendered via KaTeX):
- **Goodness-of-Fit**:
  `χ² = \sum_i \frac{(O_i - E_i)^2}{E_i}`, `df = k - 1 - \text{dfAdjust}`,
  `p = 1 - F_{\chi^2_{df}}(\chi^2)`.
- **Independence**:
  `E_{ij} = \frac{R_i C_j}{N}`, `χ² = \sum_{i,j} \frac{(O_{ij} - E_{ij})^2}{E_{ij}}`,
  `df = (r-1)(c-1)`, `p = 1 - F_{\chi^2_{df}}(\chi^2)`.

Render the active mode's formula with the substituted numeric values, then the
p-value and the reject/fail-to-reject verdict below it.

Plot (`#testPlot`, height 360px):
- **Goodness-of-Fit**: a grouped bar chart — observed (teal-gold
  `#c99a3c`) and expected (orange `#ed6d40`) bars side by side per category —
  plus a chi-square distribution curve below or beside it with the observed
  `χ²` marked (teal-gold vertical line) and the rejection region
  `[χ²_{α, df}, ∞)` shaded orange. A single Plotly figure with two sub-plots
  (or a single combined bar chart) is acceptable; the simpler choice is two
  vertically stacked `plot-wrap` divs: `#barPlot` (observed vs expected) and
  `#distPlot` (the χ² curve with shaded rejection region and observed stat).
- **Independence**: a heatmap of the contingency table (Plotly `type: "heatmap"`,
  colorscale anchored to the engine accent) OR a grouped bar chart of observed
  counts per cell, plus the same χ²-distribution curve with the observed stat
  marked and rejection region shaded. The heatmap reads more cleanly for
  `r × c` tables; the grouped bar chart reads more cleanly for `2 × 2`. The
  implementation uses the grouped bar chart for both (consistent with the GoF
  mode's observed-vs-expected bar chart) and the χ² curve plot for the
  distribution. Expected-cell counts can be shown in a small table under the
  plot (plain HTML, `Engine.formatNum` for every value).

Use `Engine.formatNum` for ALL displayed numbers (never `.toFixed()` directly).
`Engine.debounce` on every input listener (200 ms). `Engine.renderKatex` for
the formula block. `Engine.plotlyBaseLayout` / `Engine.plotlyConfig` for every
plot. `Proto.saveState` / `loadState` with store key
`engine-lab:statistics:chisquare`.

## 7. `methods.html` — card to add

Category `"Sampling & Inference"`. Insert as card 9 of 9 (consolidation pass
will fix the index — the `9 / 9` is a TODO marker per the parallel-build
addendum, §10 of `00-SHARED-CONVENTIONS.md`).

```html
<!-- TODO index: pending consolidation — Statistics Engine card 9/9 (Chi-Square Tests) -->
<a href="methods/chi-square-tests.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.64s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Sampling & Inference</span>
    <span class="engine-index">9 / 9</span>
  </div>
  <h3 class="h3">Chi-Square Tests</h3>
  <p>Goodness-of-fit (are these categories in the hypothesized ratio?) and test of independence (are two categorical variables related?) — χ² statistics from observed/expected counts, p-values from the exact chi-square CDF.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">2 test modes</span>
    <span class="tag">Contingency tables</span>
    <span class="tag">Exact χ² CDF</span>
  </div>
</a>
```

**Note:** Card is NOT added to `methods.html` directly in this build (per the
parallel-build addendum, §10 of `00-SHARED-CONVENTIONS.md`); it is appended to
`docs/agent-plans/PENDING-CARDS.md` under the existing `## Statistics Engine`
heading instead.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → **216 passed, 0 failed** (55 new
  assertions added).
- GoF on the Mendel pea example → `stat ≈ 0.4700`, `df = 3`, `p ≈ 0.9254`
  (matches the node-verified values; `stat ≪ 7.815 = χ²_{0.05, df=3}` so fail
  to reject the 9:3:3:1 ratio — the classic Mendel result).
- GoF on the fair-die example → `stat = 1.7`, `df = 5`, `p ≈ 0.8889`.
- Independence on `[[20,30],[30,20]]` → `stat = 4`, `df = 1`, `p ≈ 0.0455`
  (reject at `α = 0.05`; internally cross-checks against `2*(1-Phi(2))` from
  the z-test plan).
- Independence on `[[10,20,30],[15,25,40]]` → `stat ≈ 0.1296`, `df = 2`,
  `p ≈ 0.9372`.
- Textbook χ² critical-value cross-checks pass: `χ²_{0.95, df=1} = 3.841`,
  `χ²_{0.95, df=3} = 7.815`, `χ²_{0.95, df=5} = 11.070`,
  `χ²_{0.99, df=3} = 11.345`.
- Switching modes updates the formula block, the visible input fields, the
  result strip, and the plot to match the active mode.
- The plan file is complete with node-verified numbers.