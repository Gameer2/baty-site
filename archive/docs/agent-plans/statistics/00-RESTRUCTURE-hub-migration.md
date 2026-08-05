# Build Plan — Restructure the Statistics Engine into the Hub Pattern

Read `00-SHARED-CONVENTIONS.md` in full before starting. This plan has no roadmap §
number — it's the prerequisite migration that makes every later plan in this directory
buildable, mirroring exactly what already happened to the Numerical Engine (compare
`git log` for that engine: it went from a single `index.html` prototype to a `methods.html`
hub + `methods/*.html` pages, with math extracted out of inline `<script>` into a tested
`algorithms.js`). Do this before `01-descriptive-statistics-explorer.md`.

## 1. Current state (read `engines/statistics/index.html` in full first — don't trust this
   summary as a substitute)

One page, one `<script>` block, two modes toggled by chips: "Hypothesis Test" (one-sample
t-test) and "Linear Regression" (OLS). All math is inline, private to that script:
`lgamma`, `betacf`, `betai`, `tTwoTailP` (regularized incomplete beta → exact two-tailed
t-test p-value), `recompute()` (t-test), `parsePairs`/`regressionRecompute()` (OLS). No
`stats-algorithms.js` exists yet, no `tests/verify-statistics.js` exists yet, no
`methods.html` hub exists yet.

## 2. `assets/js/stats-algorithms.js` — create this file

New file, UMD wrapper copied from `assets/js/algorithms.js`'s top/bottom boilerplate,
`module.exports`/`window.StatsAlgorithms` pattern, exporting a `StatsAlgorithms` object.
Move (don't duplicate) this math into it, converting each from a closure into an exported,
pure, DOM-free function:

```js
// Log-gamma via Lanczos approximation — Numerical Recipes coefficients, g=7.
StatsAlgorithms.lgamma = function (x) { /* identical body to the current inline lgamma */ };

// Continued-fraction part of the regularized incomplete beta function I_x(a,b).
StatsAlgorithms.betacf = function (a, b, x) { /* identical body to current inline betacf */ };

// Regularized incomplete beta function I_x(a,b), used as the Student-t CDF building block.
StatsAlgorithms.betai = function (a, b, x) { /* identical body to current inline betai */ };

// Two-tailed p-value for a Student-t statistic with the given degrees of freedom.
StatsAlgorithms.tCDF = function (t, df) {
  const x = df / (df + t * t);
  return StatsAlgorithms.betai(df / 2, 0.5, x);
};

// One-sample t-test: data array, hypothesized mean mu0 -> {n, mean, sd, se, t, df, p}.
StatsAlgorithms.runOneSampleTTest = function (data, mu0) {
  if (!Array.isArray(data) || data.length < 2) throw new Error("Enter at least two numeric values.");
  const n = data.length;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const se = sd / Math.sqrt(n);
  const t = (mean - mu0) / se;
  const df = n - 1;
  const p = StatsAlgorithms.tCDF(Math.abs(t), df);
  return { n, mean, variance, sd, se, t, df, p };
};

// Ordinary least squares on (x, y) pairs -> {n, slope, intercept, r2, xbar, ybar}.
StatsAlgorithms.runLinearRegression = function (points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("Enter at least two (x, y) pairs.");
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const n = points.length;
  const xbar = xs.reduce((s, v) => s + v, 0) / n;
  const ybar = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - xbar) * (ys[i] - ybar);
    sxx += (xs[i] - xbar) ** 2;
    syy += (ys[i] - ybar) ** 2;
  }
  if (sxx === 0) throw new Error("All x values are identical — a line isn't defined.");
  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;
  const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = syy === 0 ? 1 : 1 - ssRes / syy;
  return { n, slope, intercept, r2, xbar, ybar };
};
```

Copy the `lgamma`/`betacf`/`betai` bodies verbatim from
`engines/statistics/index.html` lines 188-227 (current line numbers — re-check, don't
assume they haven't shifted) — every constant in `lgamma`'s Lanczos coefficient array must
match exactly, character for character; these are not values to retype from memory.

## 3. `tests/verify-statistics.js` — create this file

Copy the harness from `tests/verify.js` (header comment, `approx()`, `pass`/`fail`
counters, final summary/`process.exit`), pointed at `stats-algorithms.js` instead, and drop
the unused `math.min.js`/`compile`/`derivativeOf` machinery (statistics methods take
numeric arrays, not free-form expressions). Add these migration cases (all pre-verified
with `node -e`, use exactly):

```js
// One-sample t-test: same 12-value sample as the current prototype's default example,
// H0: mu = 75. mean=82.16666..., sd=8.40814900539766, se=2.4272235458264118,
// t=(82.16667-75)/2.427224 = 2.952878..., df=11.
{
  const data = [78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79];
  const result = StatsAlgorithms.runOneSampleTTest(data, 75);
  approx(result.mean, 82.16666666666667, 1e-9, "One-sample t-test: mean");
  approx(result.sd, 8.40814900539766, 1e-9, "One-sample t-test: sample sd");
  approx(result.t, 2.9528786840448796, 1e-6, "One-sample t-test: t statistic");
  approx(result.df, 11, 1e-12, "One-sample t-test: degrees of freedom");
}

// t-distribution CDF cross-check against a standard textbook table value:
// t_{0.025, df=10} = 2.228 -> two-tailed p at t=2.228, df=10 should be ~0.05.
{
  const p = StatsAlgorithms.tCDF(2.228, 10);
  approx(p, 0.05, 1e-3, "Student-t two-tailed p at t=2.228, df=10 (table: ~0.05)");
}

// Linear regression: exact line y = 2x + 1 through (0,1),(1,3),(2,5),(3,7) -> slope=2, intercept=1, r2=1.
{
  const result = StatsAlgorithms.runLinearRegression([[0, 1], [1, 3], [2, 5], [3, 7]]);
  approx(result.slope, 2, 1e-10, "Linear regression: slope");
  approx(result.intercept, 1, 1e-10, "Linear regression: intercept");
  approx(result.r2, 1, 1e-10, "Linear regression: R^2 on an exact line");
}
```

After adding these, `node tests/verify-statistics.js` must report **6 passed, 0 failed**
(this is the first run of this file — 6 is the total, not an increment).

## 4. `engines/statistics/methods.html` — create the hub page

Copy `engines/numerical/methods.html`'s structure exactly (header with full seven-engine
nav, hero, `.grid.grid--2.engine-grid` of cards), changing: `<title>` to
`Methods — Statistics Engine`, logo label to `Statistics Engine`, hero copy to something
in the site's existing voice (e.g. eyebrow `"Method library"`, h1 `"Pick a method"`, same
sub-copy pattern as the numerical hub, adapted to "hypothesis test or fit a line" ->
generalize to "explore a dataset, test a hypothesis, or fit a model"). Two cards initially
(both migrated from the current single page, not new methods):

```html
<a href="methods/one-sample-t-test.html" class="card engine-card reveal crosshair-host" style="display:block;">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Sampling & Inference</span>
    <span class="engine-index">1 / 2</span>
  </div>
  <h3 class="h3">One-Sample t-Test</h3>
  <p>Tests whether a sample's mean differs significantly from a hypothesized value, using the exact Student-t p-value.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Sample data + H0</span>
    <span class="tag">Histogram</span>
    <span class="tag">Exact p-value</span>
  </div>
</a>

<a href="methods/linear-regression.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.08s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Regression</span>
    <span class="engine-index">2 / 2</span>
  </div>
  <h3 class="h3">Simple Linear Regression</h3>
  <p>Fits a least-squares line through (x, y) pairs and reports the slope, intercept, and R^2.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">(x, y) pairs</span>
    <span class="tag">Scatter + fit line</span>
    <span class="tag">R^2</span>
  </div>
</a>
```

## 5. Two new method pages — split the current prototype in two

- `engines/statistics/methods/one-sample-t-test.html` — copy the skeleton from
  `engines/numerical/methods/secant.html` (§4 of `00-SHARED-CONVENTIONS.md`), fill the
  input panel with the current prototype's t-test fields (sample data textarea, `mu0`,
  `alpha`), the output panel with its result strip (`n`, mean, sd, t) + formula blocks + the
  histogram-with-mean/mu0-lines plot, exactly as currently rendered — just relocate, don't
  redesign. No step slider needed for this method (there's no iteration sequence to step
  through — a t-test is a single computation, not a converging process; omit that panel
  entirely rather than leaving a non-functional one).
- `engines/statistics/methods/linear-regression.html` — same approach for the regression
  half: pairs textarea input, scatter+fit-line plot, slope/intercept/R^2 stats. Also no step
  slider.
- Both pages' per-method `.js` files (`assets/js/one-sample-t-test.js`,
  `assets/js/linear-regression.js`) call `StatsAlgorithms.runOneSampleTTest`/
  `StatsAlgorithms.runLinearRegression` — they must not re-implement `lgamma`/`betai`/the
  regression normal equations locally; that math now lives only in `stats-algorithms.js`
  per the one-hard-rule.
- Script tags load `engine-core.js`, `stats-algorithms.js`, then the page's own `.js` —
  drop `math.min.js`/KaTeX-keypad wiring, neither page takes a free-form expression input.

## 6. Retire the old prototype page

Delete `engines/statistics/index.html`'s current content and either (a) redirect it to
`methods.html` (simplest: a `<meta http-equiv="refresh">` or a tiny inline
`location.replace("methods.html")` script — check whether the numerical engine's old
`index.html` was deleted outright or redirected before choosing; match whatever it did) or
(b) delete the file outright if that's what happened for numerical. Check
`git log --follow -- math-lab/engines/numerical/index.html` to see exactly how that file's
removal was handled, and do the same thing here for consistency.

## 7. Update every sitewide nav link

Eight files currently link to `engines/statistics/index.html` (confirmed by
`grep -rl "statistics/index.html" math-lab/`): `math-lab/index.html` (two places — the header
nav `<li>` and, separately, a `href` inside a `recentActivity`/localStorage-key config
object around the "Statistics Engine" entry — check both), and one header-nav `<li>` in each
of `engines/graph/index.html`, `engines/optimization/index.html`,
`engines/calculus/index.html`, `engines/ode/index.html`, `engines/linear-algebra/index.html`,
`engines/numerical/methods.html`, and `engines/statistics/index.html` itself (which no longer
exists after step 6 — skip it). Change every one of these to
`engines/statistics/methods.html` (or the correct relative path from each file's location —
they're not all at the same depth, don't blindly string-replace without checking each
file's relative-path prefix).

## 8. Acceptance criteria

- `node tests/verify-statistics.js` → 6 passed, 0 failed.
- `engines/statistics/methods.html` loads, shows both cards, each links to a working method
  page.
- Both method pages reproduce the current prototype's behavior exactly: same default
  example data, same computed t/p/slope/intercept/R^2 for that data, same plot appearance.
- Every one of the eight files in §7 now links to `methods.html`, not `index.html` — no
  dead links (verify manually or with a link-check pass, e.g. grep for
  `statistics/index.html` sitewide again and confirm zero remaining hits outside this plan
  file itself).
- No console errors on either new method page.
- `git status`/`git diff` shows no leftover reference to the deleted inline `<script>`
  math anywhere else in the repo (grep for `tTwoTailP` and `betacf` outside
  `stats-algorithms.js` and this plan file — should be zero hits).
