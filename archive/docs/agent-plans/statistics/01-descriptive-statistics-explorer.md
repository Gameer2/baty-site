# Build Plan — Descriptive Statistics Explorer

Roadmap ref: `CURRICULUM_ROADMAP.md` §4A.1, priority **P0**, Tier-0 build-order item 12.
Read `00-SHARED-CONVENTIONS.md` in full, and confirm `00-RESTRUCTURE-hub-migration.md` has
already landed (this plan adds a card to `engines/statistics/methods.html`, which must
already exist) before starting.

## 1. What this method is

Paste a dataset, get every summary statistic and a histogram + box plot at once. No
hypothesis, no model — the "front door" that should exist before a student is asked to test
anything, per the roadmap's own framing. Category/eyebrow: **"Descriptive Statistics"**.

Statistics to compute, all from one pass over the sorted + unsorted data:
- `n`, sum, mean
- sample variance (`/(n-1)`) and sample standard deviation — the same convention already
  used by `runOneSampleTTest`, for consistency across the engine
- population variance (`/n`) and population standard deviation — shown as a secondary pair,
  labelled clearly (`s²`/`s` for sample, `σ²`/`σ` for population) so a student sees both
  conventions and which one the engine's inferential methods use elsewhere
- min, max, range
- median, Q1, Q3, IQR — via **linear interpolation between closest ranks** (the same method
  NumPy/Excel call "linear", i.e. index `p*(n-1)` into the sorted array, interpolating
  between the floor and ceil positions). Pick this one method and document it in the UI
  copy ("quartiles use linear interpolation between ranks") — don't silently pick a
  different convention than a student's textbook without saying so.
- mode — the most frequent value(s). If every value is unique, report "no mode" rather than
  an empty list or a misleading single value.

## 2. `stats-algorithms.js` — function to add

```js
// data: number[] -> full descriptive-statistics summary (sample stats, quartiles via
// linear interpolation between ranks, mode detection).
StatsAlgorithms.descriptiveStats = function (data) {
  if (!Array.isArray(data) || data.length < 1) throw new Error("Enter at least one numeric value.");
  const n = data.length;
  const sorted = [...data].sort((a, b) => a - b);
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const sumSqDev = data.reduce((a, x) => a + (x - mean) ** 2, 0);
  const variance = n > 1 ? sumSqDev / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const popVariance = sumSqDev / n;
  const popSd = Math.sqrt(popVariance);

  function quantile(p) {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
  }
  const median = quantile(0.5);
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;

  const freq = new Map();
  for (const x of data) freq.set(x, (freq.get(x) || 0) + 1);
  const maxFreq = Math.max(...freq.values());
  const modes = maxFreq > 1 ? [...freq.entries()].filter(([, c]) => c === maxFreq).map(([v]) => v).sort((a, b) => a - b) : [];

  const min = sorted[0], max = sorted[sorted.length - 1];
  return { n, sum, mean, variance, sd, popVariance, popSd, min, max, range: max - min, median, q1, q3, iqr, modes, sorted };
};
```

Note the returned shape: `modes` is an empty array when every value is unique — the
per-method JS renders `"No mode"` in that case, not `modes.join(", ")` on an empty array
(which would silently render nothing). `sorted` is included so the per-method JS can build
the histogram/box-plot traces without re-sorting.

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

```js
// Descriptive Statistics: 12-value sample (same dataset as the t-test migration case,
// for cross-check consistency across the engine) -> hand-computed via node -e.
{
  const data = [78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79];
  const result = StatsAlgorithms.descriptiveStats(data);
  approx(result.mean, 82.16666666666667, 1e-9, "Descriptive stats: mean");
  approx(result.variance, 70.69696969696969, 1e-9, "Descriptive stats: sample variance");
  approx(result.sd, 8.40814900539766, 1e-9, "Descriptive stats: sample sd");
  approx(result.popSd, 8.050189783822216, 1e-9, "Descriptive stats: population sd");
  approx(result.median, 82.5, 1e-12, "Descriptive stats: median (even n, averages middle two)");
  approx(result.q1, 77, 1e-9, "Descriptive stats: Q1 (linear interpolation)");
  approx(result.q3, 88.5, 1e-9, "Descriptive stats: Q3 (linear interpolation)");
  approx(result.iqr, 11.5, 1e-9, "Descriptive stats: IQR");
  approx(result.min, 67, 1e-12, "Descriptive stats: min");
  approx(result.max, 95, 1e-12, "Descriptive stats: max");
  if (result.modes.length !== 0) { fail++; console.error("  FAIL  Descriptive stats: expected no mode (all values unique)"); } else { pass++; console.log("  ok    Descriptive stats: no mode when all values are unique"); }
}

// Descriptive Statistics: small odd-n dataset with a repeated value -> exact fractions,
// hand-computable, and exercises the mode-detection path.
{
  const data = [1, 2, 2, 3, 4];
  const result = StatsAlgorithms.descriptiveStats(data);
  approx(result.mean, 2.4, 1e-12, "Descriptive stats (small set): mean");
  approx(result.variance, 1.3, 1e-12, "Descriptive stats (small set): sample variance");
  approx(result.sd, 1.140175425099138, 1e-12, "Descriptive stats (small set): sample sd");
  approx(result.median, 2, 1e-12, "Descriptive stats (small set): median (odd n)");
  approx(result.q1, 2, 1e-12, "Descriptive stats (small set): Q1");
  approx(result.q3, 3, 1e-12, "Descriptive stats (small set): Q3");
  if (result.modes.length === 1 && result.modes[0] === 2) { pass++; console.log("  ok    Descriptive stats (small set): mode = 2"); } else { fail++; console.error(`  FAIL  Descriptive stats (small set): expected mode [2], got ${JSON.stringify(result.modes)}`); }
}
```

Both datasets and every value above were computed and checked with `node -e` before writing
this plan — do not alter them. After adding these, `node tests/verify-statistics.js` must
report a specific total: the restructuring pass leaves the suite at 6 passed; this plan
adds 16 `approx()` calls (10 in the first case, 6 in the second) plus 2 manual `pass`/`fail`
mode-detection checks = 18 new assertions. Final count must be **24 passed, 0 failed**. (If
your running total differs, you added or dropped an assertion somewhere — recount before
assuming the math is wrong.)

## 4. Files to create

- `math-lab/assets/js/descriptive-statistics.js` — per-method DOM wiring.
- `math-lab/engines/statistics/methods/descriptive-statistics.html`.

## 5. Inputs (the form panel)

- A single data textarea (id `dataInput`), same parsing rule as the migrated t-test page
  (`/[\s,]+/` split, filter non-numeric) — comma, space, or newline separated. Default
  example: reuse the 12-value dataset from the test cases
  (`78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79`), for visual consistency with the
  t-test page a student may have just come from.
- No other inputs — this method has no hypothesis, no parameter, nothing to configure.
- `.status-line`: "Enter at least one numeric value." until valid; on valid input, "n = N
  values entered."
- "Try Example" button fills the default dataset above.

## 6. Outputs (results panel)

Result strip: this method has more stats than fit in the standard 4-tile strip used
elsewhere — use **two rows** of `.result-stat` tiles (the `.result-strip` class already
wraps via CSS grid on the existing pages when given more children; confirm this by
inspecting `engine.css`'s `.result-strip` rule before assuming it wraps cleanly, and if it
doesn't, use two adjacent `.result-strip` blocks stacked with normal margin instead of
fighting the CSS). Tiles, in this order: **n**, **mean** (`accent`), **sample sd (s)**,
**variance (s²)**, **median**, **Q1**, **Q3**, **IQR**, **min**, **max**, **range**, **mode**
(render `"No mode"` when `modes.length === 0`, else the joined list e.g. `"2"` or `"3, 7"`
for a bimodal set).

Formula block — not a single formula, since this method computes many; instead render a
short reference list via `Engine.renderKatex` per line or one block with `\\` line breaks:
```
\bar{x} = \frac{1}{n}\sum x_i \qquad s^2 = \frac{1}{n-1}\sum (x_i-\bar{x})^2 \qquad \text{IQR} = Q_3 - Q_1
```

Plot 1 — **"Distribution"** (`#histPlot`, height 320px): `type: "histogram"` trace over
`data`, styling exactly as specified in `00-SHARED-CONVENTIONS.md` §4 (teal-gold fill,
`#c99a3c` outline) — plus vertical reference lines (Plotly `shapes`, same technique already
used on the migrated t-test page) at the mean (`#c99a3c` solid) and median (`#ed6d40`
dashed), each with a small text annotation (`x̄`, `median`) same as the t-test page's
`x̄`/`μ₀` annotations.

Plot 2 — **"Box plot"** (`#boxPlot`, height 220px): `type: "box"` trace, `boxpoints: "all"`
so individual values show as jittered points alongside the box, `marker: { color:
"#c99a3c" }`. This is the first box plot on the site — no table/step-slider needed for
either plot; this method has no iteration sequence.

No data table, no step slider — unlike the numerical engine's methods, there's no sequence
to step through here. Skip both panels entirely (per §9 addition in the shared conventions
doc: don't leave a non-functional slider/table just to match the visual template).

## 7. `methods.html` — card to add

Insert as the 3rd card (after One-Sample t-Test, Linear Regression — see
`00-RESTRUCTURE-hub-migration.md` §4), category `"Descriptive Statistics"`,
`transition-delay:.16s`, updating all three cards' `.engine-index` to `X / 3`:

```html
<a href="methods/descriptive-statistics.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.16s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Descriptive Statistics</span>
    <span class="engine-index">3 / 3</span>
  </div>
  <h3 class="h3">Descriptive Statistics Explorer</h3>
  <p>Paste a dataset and get every summary statistic — mean, variance, quartiles, mode — plus a live histogram and box plot.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Raw data</span>
    <span class="tag">Histogram + box plot</span>
    <span class="tag">Full summary table</span>
  </div>
</a>
```

If `02-sampling-distributions-clt.md` or `03-confidence-intervals.md` are built in the same
pass, coordinate index numbers per the parallel-build addendum (§10 of the shared
conventions doc) — append to `PENDING-CARDS.md` instead of editing `methods.html` directly
when more than one method is in flight.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → 24 passed, 0 failed (see §3's count above).
- Loading the page with the example dataset and clicking Compute shows mean ≈ `82.167`,
  sample sd ≈ `8.408`, median = `82.5`, Q1 = `77`, Q3 = `88.5`, mode = `"No mode"` — matching
  the first test case exactly.
- Pasting `1, 2, 2, 3, 4` shows mode = `"2"`, median = `2`, matching the second test case.
- The histogram's mean/median reference lines land at visually correct positions relative
  to the bars (spot-check, don't just trust the number in the tile).
