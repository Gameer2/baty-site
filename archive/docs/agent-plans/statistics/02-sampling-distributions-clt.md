# Build Plan — Sampling Distributions & the Central Limit Theorem

Roadmap ref: `CURRICULUM_ROADMAP.md` §4B.5, priority **P0**, Tier-0 build-order item 13.
Read `00-SHARED-CONVENTIONS.md` in full, and confirm `00-RESTRUCTURE-hub-migration.md` has
landed, before starting. Independent of `01-descriptive-statistics-explorer.md` — can be
built in parallel by a different agent (see the parallel-build caveat in
`00-SHARED-CONVENTIONS.md` §10), though it reuses `StatsAlgorithms.descriptiveStats` (§2
below), so land `01` first if only one agent is available, to avoid one agent blocking on
the other's in-flight function.

## 1. What this method is

Pick a population distribution (uniform, exponential, or normal — three built-in choices
covers the roadmap's "any distribution, including a deliberately skewed one" without
needing a general-purpose distribution picker yet), pick a sample size `n`, repeatedly draw
samples of that size and plot the distribution of the sample means. As more samples
accumulate, that histogram of means should visibly tighten around the population mean and
look increasingly bell-shaped — regardless of the population's own shape — which is the
entire content of the Central Limit Theorem and the direct theoretical justification for why
the site's one-sample t-test is valid at all. Category/eyebrow: **"Sampling & Inference"**.

This is the first method on the site whose core computation is a **random simulation**, not
a deterministic formula. Per `00-SHARED-CONVENTIONS.md` §2, this must be built on an
injected, seedable RNG — never a bare `Math.random()` call — so it stays testable.

## 2. `stats-algorithms.js` — functions to add

```js
// Deterministic seeded PRNG (mulberry32). Returns a zero-argument function producing a
// new uniform value in [0, 1) on every call, given a 32-bit integer seed.
StatsAlgorithms.mulberry32 = function (seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// rng: () -> [0,1) -> one draw from Uniform(lo, hi).
StatsAlgorithms.sampleUniform = function (rng, lo, hi) { return lo + rng() * (hi - lo); };

// rng: () -> [0,1) -> one draw from Exponential(rate), via inverse-CDF sampling.
StatsAlgorithms.sampleExponential = function (rng, rate) { return -Math.log(1 - rng()) / rate; };

// rng: () -> [0,1) -> one draw from Normal(mean, sd), via Box-Muller transform.
// Consumes two uniform draws per call.
StatsAlgorithms.sampleNormal = function (rng, mean, sd) {
  const u1 = Math.max(rng(), 1e-12), u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
};

// draw: () -> number (a closure already bound to a distribution + rng), n: sample size,
// numSamples: how many independent samples to draw -> {means, grandMean, se}. Reuses
// descriptiveStats on the resulting means array instead of recomputing variance locally.
StatsAlgorithms.drawSampleMeans = function (draw, n, numSamples) {
  if (!Number.isInteger(n) || n < 1) throw new Error("Sample size must be a positive integer.");
  if (!Number.isInteger(numSamples) || numSamples < 2) throw new Error("Need at least 2 samples to show a distribution.");
  const means = [];
  for (let s = 0; s < numSamples; s++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += draw();
    means.push(sum / n);
  }
  const stats = StatsAlgorithms.descriptiveStats(means);
  return { means, grandMean: stats.mean, se: stats.sd };
};
```

Do not reimplement mean/variance inside `drawSampleMeans` — it must call
`StatsAlgorithms.descriptiveStats`, per the one-hard-rule (this is exactly the kind of
internal reuse the rule is meant to encourage, not just reuse from a page's DOM-wiring
file).

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

```js
// PRNG determinism: mulberry32(seed=1) must reproduce this exact sequence — if this case
// fails, the PRNG implementation was transcribed wrong; nothing else in this file's
// simulation cases can be trusted until this passes.
{
  const rng = StatsAlgorithms.mulberry32(1);
  const draws = [rng(), rng(), rng(), rng(), rng(), rng()];
  approx(draws[0], 0.6270739405881613, 1e-9, "mulberry32(1) draw 1");
  approx(draws[3], 0.9810509674716741, 1e-9, "mulberry32(1) draw 4");
  approx(draws[5], 0.281103502959013, 1e-9, "mulberry32(1) draw 6");
}

// Sampling distribution of the mean, small hand-traceable case: seed=1, Uniform(0,1),
// n=2 per sample, 3 samples -> exact deterministic means from the 6 draws above.
{
  const rng = StatsAlgorithms.mulberry32(1);
  const draw = () => StatsAlgorithms.sampleUniform(rng, 0, 1);
  const result = StatsAlgorithms.drawSampleMeans(draw, 2, 3);
  approx(result.means[0], 0.3149048308841884, 1e-9, "Sample mean 1 (seed=1, n=2)");
  approx(result.means[1], 0.7542490037158132, 1e-9, "Sample mean 2 (seed=1, n=2)");
  approx(result.means[2], 0.624740700586699, 1e-9, "Sample mean 3 (seed=1, n=2)");
  approx(result.grandMean, 0.5646315117289001, 1e-9, "Grand mean of 3 sample means (seed=1)");
  approx(result.se, 0.22575575627020683, 1e-9, "SE of 3 sample means (seed=1)");
}

// CLT sanity check at scale: seed=42, Uniform(0,1) (population mean 0.5, population
// sd 1/sqrt(12)), n=30, 2000 samples. Exact deterministic value first (reproducibility),
// then a loose check against the *theoretical* standard error — these are two different
// claims, don't collapse them into one tolerance.
{
  const rng = StatsAlgorithms.mulberry32(42);
  const draw = () => StatsAlgorithms.sampleUniform(rng, 0, 1);
  const result = StatsAlgorithms.drawSampleMeans(draw, 30, 2000);
  approx(result.grandMean, 0.5013688083240719, 1e-9, "CLT sim (seed=42): exact reproducible grand mean");
  approx(result.se, 0.052409974466729875, 1e-9, "CLT sim (seed=42): exact reproducible SE");
  const theoreticalSE = (1 / Math.sqrt(12)) / Math.sqrt(30);
  approx(result.grandMean, 0.5, 0.02, "CLT sim (seed=42): grand mean near population mean 0.5 (sanity, loose tolerance)");
  approx(result.se, theoreticalSE, 0.005, "CLT sim (seed=42): SE near theoretical sigma/sqrt(n) (sanity, loose tolerance)");
}
```

All values pre-verified with `node -e` before writing this plan, using the exact
`mulberry32` implementation in §2 — do not alter them, and do not "fix" a failing case by
loosening its tolerance without first checking whether the PRNG was transcribed correctly
(the first test case exists specifically to catch that). This plan adds 12 new assertions
(3 PRNG-determinism checks + 5 in the small hand-traceable case + 4 in the at-scale CLT
case). After adding these, `node tests/verify-statistics.js` must report **18 passed, 0
failed** if built directly on top of the restructuring pass (6 baseline + 12), or the
restructuring's 6 plus 12 for this plan plus whatever
`01-descriptive-statistics-explorer.md` already added, if both have landed — run the suite
and read its own reported count rather than assuming a specific total when more than one
plan has landed.

## 4. Files to create

- `math-lab/assets/js/sampling-distributions.js` — per-method DOM wiring.
- `math-lab/engines/statistics/methods/sampling-distributions-clt.html`.

## 5. Inputs (the form panel)

- **Population distribution** chip row (id `distRow`, same `.chip`/`data-*` pattern as the
  existing mode toggle in the migrated t-test/regression pages): `Uniform(0,1)`,
  `Exponential(rate=1)`, `Normal(mean=0, sd=1)`. Each choice's parameters are fixed presets
  for this first build (not user-editable fields) — keep scope tight; parameter sliders are
  a natural follow-up, not part of this plan.
- **Sample size `n`** — `type="number" step="1" min="1" max="500"` (id `nInput`). Default
  example: `n = 30`.
- **Number of samples to draw** — `type="number" step="1" min="10" max="5000"` (id
  `numSamplesInput`). Default example: `2000`. Cap at `5000` to keep the browser responsive
  — 5000 draws × up to 500 per sample is 2.5M `rng()` calls, still well under a second in
  practice, but don't raise the cap without checking actual render time first.
- **Seed** — `type="number" step="1"` (id `seedInput`), default `42`, with a "Re-roll" ghost
  button that fills a new random-looking integer (using `Date.now()` is fine for *picking* a
  fresh seed to hand to `mulberry32` — that's a one-time non-deterministic choice by the UI,
  not a violation of §2's "no bare `Math.random()`" rule, which is about the simulation math
  itself always being reproducible once a seed is fixed). Exposing the seed at all (rather
  than hiding it) is deliberate — it's what makes "run it again" reproducible for a student
  comparing results, consistent with the site's "nothing hidden" ethos.
- "Try Example" button: `Uniform(0,1)`, `n = 30`, `numSamples = 2000`, `seed = 42` — the
  scale test case above, so a student's first click reproduces a known-good result.

## 6. Outputs (results panel)

Result strip (4 tiles): **Grand mean** (`accent`) — `Engine.formatNum(result.grandMean, 5)`;
**Population mean** — the known true mean of the chosen preset distribution (`0.5` for
Uniform(0,1), `1/rate` for Exponential, `mean` for Normal); **Empirical SE** —
`Engine.formatNum(result.se, 5)`; **Theoretical SE** —
`populationSd / Math.sqrt(n)`, where `populationSd` is the chosen distribution's known
closed-form sd (`1/sqrt(12)` for Uniform(0,1), `1/rate` for Exponential, `sd` for Normal).
Putting empirical next to theoretical side by side is the point of this whole method —
don't hide one of them in a tooltip.

Formula block (`formula-block--reference`):
```
\text{SE}(\bar{X}) = \frac{\sigma}{\sqrt{n}} \qquad \bar{X} \xrightarrow{d} N\!\left(\mu, \frac{\sigma^2}{n}\right) \text{ as } n \to \infty
```

Plot 1 — **"Distribution of sample means"** (`#meansPlot`, height 320px): `type:
"histogram"` over `result.means`, same teal-gold styling as the descriptive-statistics
histogram, plus a dashed `#ed6d40` vertical reference line at the true population mean.
This is the plot that should visibly narrow and bell out as `numSamples`/`n` increase —
call this out in the page's method-summary copy.

Plot 2 — **"One example raw sample"** (`#rawSamplePlot`, height 220px): a histogram of just
the *first* individual sample's raw draws (not the means) — `n` points — so a student can
see the population's actual shape (visibly skewed for Exponential, flat for Uniform) right
next to the bell-shaped means plot, making the "it doesn't matter what the population looks
like" point concrete rather than asserted. Requires `drawSampleMeans` (or the per-method JS
wrapping it) to also retain the first sample's raw draws — either add an optional
`keepFirstSample` behavior in the per-method `.js` file by drawing that one sample directly
via `draw()` in a loop before calling `StatsAlgorithms.drawSampleMeans` for the rest, or
have the per-method JS call `draw()` `n` times itself first for display, then reset the rng
state — **don't** add a "return the first sample's raw values" side channel to the pure
`drawSampleMeans` function itself; keep that function's return shape exactly as specified
in §2, and do this extra draw as its own explicit step in the per-method file.

No data table, no step slider — the "steps" here are `numSamples` draws, too many to table
usefully; the two histograms are the whole result.

## 7. `methods.html` — card to add

Category `"Sampling & Inference"`. Exact index/`transition-delay` depends on how many other
cards exist when this lands — follow §7 of `00-SHARED-CONVENTIONS.md` and the parallel-build
addendum (§10) if `01`/`03` are also in flight.

```html
<a href="methods/sampling-distributions-clt.html" class="card engine-card reveal crosshair-host" style="display:block;">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Sampling & Inference</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Sampling Distributions & the CLT</h3>
  <p>Repeatedly samples from a chosen population and watches the distribution of sample means tighten toward normal, however skewed the population itself is.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Population + n + samples</span>
    <span class="tag">Two histograms</span>
    <span class="tag">Empirical vs. theoretical SE</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` reports the count from §3, 0 failed.
- "Try Example" (Uniform(0,1), n=30, numSamples=2000, seed=42) then Compute shows a grand
  mean within `0.02` of `0.5` and empirical SE within `0.005` of the theoretical
  `1/sqrt(12·30) ≈ 0.05270` — matching the scale test case.
- Switching the population to Exponential visibly changes the raw-sample histogram's shape
  (skewed) while the means histogram stays visually bell-shaped and centered near
  `1/rate`.
- Re-running with the same seed reproduces the exact same grand mean/SE (determinism);
  changing the seed changes them.
