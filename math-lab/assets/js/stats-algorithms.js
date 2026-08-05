/* Statistics Engine — pure, DOM-free statistical methods.
   Shared between the browser pages (assets/js/<method>.js wires this to the UI)
   and the Node verification suite (tests/verify-statistics.js) — one implementation,
   two callers, so a regression here is caught by tests instead of only by eyeballing a
   plot. This file is the Statistics Engine's parallel of the Numerical Engine's
   algorithms.js; do not mix the two (statistics math lives here, numerical math there). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.StatsAlgorithms = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const StatsAlgorithms = {};

  // Log-gamma via Lanczos approximation — Numerical Recipes coefficients, g=7.
  StatsAlgorithms.lgamma = function (x) {
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - StatsAlgorithms.lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };

  // Continued-fraction part of the regularized incomplete beta function I_x(a,b).
  StatsAlgorithms.betacf = function (a, b, x) {
    const MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };

  // Regularized incomplete beta function I_x(a,b), used as the Student-t CDF building block.
  StatsAlgorithms.betai = function (a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(StatsAlgorithms.lgamma(a + b) - StatsAlgorithms.lgamma(a) - StatsAlgorithms.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * StatsAlgorithms.betacf(a, b, x) / a : 1 - bt * StatsAlgorithms.betacf(b, a, 1 - x) / b;
  };

  // Two-tailed p-value for a Student-t statistic with the given degrees of freedom:
  // P(|T| > |t|) = I_{df/(df+t^2)}(df/2, 1/2). Pass the absolute value of t.
  StatsAlgorithms.tCDF = function (t, df) {
    const x = df / (df + t * t);
    return StatsAlgorithms.betai(df / 2, 0.5, x);
  };

  // One-sample t-test: data array, hypothesized mean mu0 -> {n, mean, variance, sd, se, t, df, p}.
  StatsAlgorithms.runOneSampleTTest = function (data, mu0) {
    if (!Array.isArray(data) || data.length < 2) throw new Error("Enter at least two numeric values.");
    const n = data.length;
    const mean = data.reduce((s, v) => s + v, 0) / n;
    const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(n);
    /* Zero sample variance makes the statistic undefined: t = (x̄ − μ₀)/0 is ±∞ when the mean
       differs from μ₀, and 0/0 when it does not. Neither is a test result. Computed rather
       than refused, this came back as t = ±∞ with p = 0 — "infinitely significant" from four
       identical observations, the most misleading answer this module could give. A t-test
       needs variation in the sample; with none, the honest answer is that it does not apply. */
    if (!(sd > 0)) {
      throw new Error(
        "Every value in this sample is identical, so the sample standard deviation is 0 and " +
        "the t statistic is undefined. A t-test needs some variation in the data."
      );
    }
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

  // data: number[] -> full descriptive-statistics summary. Sample variance uses /(n-1)
  // (matching runOneSampleTTest); population variance uses /n, labelled separately.
  // Quartiles use linear interpolation between closest ranks (index p*(n-1) into the
  // sorted array), the convention NumPy/Excel call "linear" — documented in the UI copy.
  // modes is [] when every value is unique (the per-method JS renders "No mode").
  // Includes se = sd/sqrt(n) for reuse by the confidence-interval methods (plan 03's
  // confidenceIntervalMean reads stats.se); the plan-01 spec didn't list se, but adding
  // it here is the minimal way to satisfy that downstream caller without a second copy.
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
    const se = n > 1 ? sd / Math.sqrt(n) : 0;

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
    return { n, sum, mean, variance, sd, se, popVariance, popSd, min, max, range: max - min, median, q1, q3, iqr, modes, sorted };
  };

  // Deterministic seeded PRNG (mulberry32). Returns a zero-argument function producing a
  // new uniform value in [0, 1) on every call, given a 32-bit integer seed. The simulation
  // methods below take an injected rng built from this — never a bare Math.random() — so
  // every run is reproducible from its seed (and testable).
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

  // Two-tailed critical value t* such that P(|T| > t*) = alpha, for the t-distribution
  // with df degrees of freedom. Solved by bisection on the existing tCDF (monotonic
  // decreasing in t for t > 0) — mirrors the Bisection Method's own root-finding loop:
  // the critical value is solved for, not looked up from a hidden table.
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

  // Binomial(n, p): PMF P(X = k) = C(n,k) * p^k * (1-p)^(n-k), for k = 0, 1, ..., n.
  StatsAlgorithms.binomialPMF = function (k, n, p) {
    if (!Number.isInteger(n) || n < 0) throw new Error("n must be a non-negative integer.");
    if (!(p >= 0 && p <= 1)) throw new Error("p must be between 0 and 1.");
    if (!Number.isInteger(k) || k < 0 || k > n) return 0;
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

  // Poisson(lambda): PMF P(X = k) = e^(-lambda) * lambda^k / k!, for k = 0, 1, 2, ...
  StatsAlgorithms.poissonPMF = function (k, lambda) {
    if (!(lambda > 0)) throw new Error("lambda must be positive.");
    if (!Number.isInteger(k) || k < 0) return 0;
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

  // Hypergeometric(N, K, n): PMF P(X = k) = C(K,k) * C(N-K, n-k) / C(N, n).
  // k ranges from max(0, n-(N-K)) to min(n, K).
  StatsAlgorithms.hypergeometricPMF = function (k, N, K, n) {
    if (!Number.isInteger(N) || N < 0) throw new Error("N must be a non-negative integer.");
    if (!Number.isInteger(K) || K < 0 || K > N) throw new Error("K must be between 0 and N.");
    if (!Number.isInteger(n) || n < 0 || n > N) throw new Error("n must be between 0 and N.");
    const kMin = Math.max(0, n - (N - K));
    const kMax = Math.min(n, K);
    if (!Number.isInteger(k) || k < kMin || k > kMax) return 0;
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

  // Normal(mean, sd): PDF f(x) = (1/(sd*sqrt(2*pi))) * exp(-((x-mean)^2)/(2*sd^2)).
  StatsAlgorithms.normalPDF = function (x, mean, sd) {
    if (!(sd > 0)) throw new Error("sd must be positive.");
    const z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  };

  // Normal(mean, sd): CDF P(X <= x) = Phi((x-mean)/sd), via the existing normalCDF.
  StatsAlgorithms.normalCDFValue = function (x, mean, sd) {
    if (!(sd > 0)) throw new Error("sd must be positive.");
    return StatsAlgorithms.normalCDF((x - mean) / sd);
  };

  // Normal mean and variance: mean, sd^2.
  StatsAlgorithms.normalMean = function (mean, sd) { return mean; };
  StatsAlgorithms.normalVariance = function (mean, sd) { return sd * sd; };

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

  // Gamma(shape, scale): PDF f(x) = x^(shape-1) * exp(-x/scale) / (Gamma(shape) * scale^shape),
  // for x > 0; boundary handled at x <= 0 to avoid Math.log(0) -> NaN for shape > 1.
  StatsAlgorithms.gammaPDF = function (x, shape, scale) {
    if (!(shape > 0)) throw new Error("shape must be positive.");
    if (!(scale > 0)) throw new Error("scale must be positive.");
    if (x <= 0) return shape > 1 ? 0 : (shape === 1 ? Math.exp(-x / scale) / scale : 0);
    const logPdf = (shape - 1) * Math.log(x) - x / scale - StatsAlgorithms.lgamma(shape) - shape * Math.log(scale);
    return Math.exp(logPdf);
  };

  // Gamma(shape, scale): CDF P(X <= x) = P(shape, x/scale), the regularized lower
  // incomplete gamma. 0 for x <= 0. Uses the same series/continued-fraction split as
  // chiSquareCDF: the gammaP series stalls short of 1 in the upper tail, so past
  // y >= shape + 1 the complement of gammaQCF is the accurate (and monotone) branch.
  StatsAlgorithms.gammaCDF = function (x, shape, scale) {
    if (!(shape > 0)) throw new Error("shape must be positive.");
    if (!(scale > 0)) throw new Error("scale must be positive.");
    if (x <= 0) return 0;
    const y = x / scale;
    return y < shape + 1 ? StatsAlgorithms.gammaP(shape, y) : 1 - StatsAlgorithms.gammaQCF(shape, y);
  };

  // Gamma mean and variance: shape*scale, shape*scale^2.
  StatsAlgorithms.gammaMean = function (shape, scale) { return shape * scale; };
  StatsAlgorithms.gammaVariance = function (shape, scale) { return shape * scale * scale; };

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

  // transpose(M): M is n×m -> returns m×n transpose. Rows must be equal length.
  StatsAlgorithms.transpose = function (M) {
    if (!Array.isArray(M) || M.length === 0) throw new Error("Matrix must be a non-empty array of rows.");
    const n = M.length, m = M[0].length;
    for (let i = 0; i < n; i++) if (!Array.isArray(M[i]) || M[i].length !== m)
      throw new Error("Matrix rows must all have the same length.");
    const T = new Array(m);
    for (let j = 0; j < m; j++) {
      T[j] = new Array(n);
      for (let i = 0; i < n; i++) T[j][i] = M[i][j];
    }
    return T;
  };

  // matMul(A, B): A is n×k, B is k×m -> returns n×m product. Inner dimensions
  // must match (A's column count === B's row count).
  StatsAlgorithms.matMul = function (A, B) {
    if (!Array.isArray(A) || !Array.isArray(B) || A.length === 0 || B.length === 0)
      throw new Error("matMul needs two non-empty matrices.");
    const n = A.length, k = B.length, m = B[0].length;
    for (let i = 0; i < n; i++) if (!Array.isArray(A[i]) || A[i].length !== k)
      throw new Error("Inner dimensions disagree: A's columns must equal B's rows.");
    for (let i = 0; i < k; i++) if (!Array.isArray(B[i]) || B[i].length !== m)
      throw new Error("B's rows must all have the same length.");
    const C = new Array(n);
    for (let i = 0; i < n; i++) {
      C[i] = new Array(m).fill(0);
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
        C[i][j] = s;
      }
    }
    return C;
  };

  // matInverse(M): square n×n inverse via Gauss-Jordan elimination with partial
  // pivoting on the augmented [M | I]. Throws if M is singular (or nearly so,
  // pivot < 1e-12). Returns the n×n inverse.
  StatsAlgorithms.matInverse = function (M) {
    if (!Array.isArray(M) || M.length === 0)
      throw new Error("Matrix must be a non-empty array of rows.");
    const n = M.length;
    for (let i = 0; i < n; i++) if (!Array.isArray(M[i]) || M[i].length !== n)
      throw new Error("Matrix must be square (n×n).");
    const A = M.map((row, i) => {
      const r = row.slice();
      for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
      return r;
    });
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-12)
        throw new Error("Matrix is singular (or nearly singular) — no unique solution.");
      if (piv !== col) { const tmp = A[col]; A[col] = A[piv]; A[piv] = tmp; }
      const pivVal = A[col][col];
      for (let c = 0; c < 2 * n; c++) A[col][c] /= pivVal;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = A[r][col];
        if (factor === 0) continue;
        for (let c = 0; c < 2 * n; c++) A[r][c] -= factor * A[col][c];
      }
    }
    return A.map((row) => row.slice(n));
  };

  // Multiple linear regression: data is an array of rows [x1, x2, ..., xp, y]
  // (p predictors + response). Fits β̂ = (XᵀX)⁻¹Xᵀy where X is the n×(p+1) design
  // matrix with a leading column of 1s. Returns {n, p, coefficients, coefSE,
  // tStats, pValues, fitted, residuals, s, r2, adjR2, df}. coefficients is
  // [β0, β1, ..., βp]. s = sqrt(SSE/(n-p-1)) is the residual standard error;
  // SE(βj) = s*sqrt((XᵀX)⁻¹_jj); tj = βj/SE(βj); pj = tCDF(|tj|, n-p-1) (two-
  // tailed). R² = 1 - SSE/SST; adjR² = 1 - (SSE/df)/(SST/(n-1)). Requires
  // n >= p + 2 (df >= 1) and a non-singular XᵀX (predictors not collinear).
  StatsAlgorithms.runMultipleRegression = function (data) {
    if (!Array.isArray(data) || data.length < 2)
      throw new Error("Enter at least two rows of data.");
    const n = data.length;
    const p = data[0].length - 1;
    if (p < 1) throw new Error("Each row must have at least one predictor and a response (x1, ..., xp, y).");
    for (let i = 0; i < n; i++) {
      if (!Array.isArray(data[i]) || data[i].length !== p + 1)
        throw new Error("Every row must have the same number of columns (x1, ..., xp, y).");
      for (const v of data[i]) if (!Number.isFinite(v)) throw new Error("All cells must be finite numbers.");
    }
    if (n < p + 2)
      throw new Error(`Need at least p + 2 = ${p + 2} rows for ${p} predictor(s) (df >= 1); got ${n}.`);
    const X = data.map((row) => [1, ...row.slice(0, p)]);
    const y = data.map((row) => row[p]);
    const Xt = StatsAlgorithms.transpose(X);
    const XtX = StatsAlgorithms.matMul(Xt, X);
    let XtXinv;
    try { XtXinv = StatsAlgorithms.matInverse(XtX); }
    catch (err) { throw new Error("Design matrix is collinear — predictors are linearly dependent."); }
    const Xty = StatsAlgorithms.matMul(Xt, y.map((v) => [v]));      // (p+1)×1
    const betaMat = StatsAlgorithms.matMul(XtXinv, Xty);            // (p+1)×1
    const coefficients = betaMat.map((r) => r[0]);
    const fitted = new Array(n);
    const residuals = new Array(n);
    let sse = 0;
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j <= p; j++) pred += coefficients[j] * X[i][j];
      fitted[i] = pred;
      residuals[i] = y[i] - pred;
      sse += residuals[i] * residuals[i];
    }
    const ybar = y.reduce((s, v) => s + v, 0) / n;
    const sst = y.reduce((s, v) => s + (v - ybar) * (v - ybar), 0);
    const r2 = sst === 0 ? 1 : 1 - sse / sst;
    const df = n - p - 1;
    const s = Math.sqrt(sse / df);
    const adjR2 = sst === 0 ? 1 : 1 - (sse / df) / (sst / (n - 1));
    const coefSE = new Array(p + 1);
    const tStats = new Array(p + 1);
    const pValues = new Array(p + 1);
    for (let j = 0; j <= p; j++) {
      const se = s * Math.sqrt(XtXinv[j][j]);
      coefSE[j] = se;
      tStats[j] = coefficients[j] / se;
      pValues[j] = StatsAlgorithms.tCDF(Math.abs(tStats[j]), df);
    }
    return { n, p, coefficients, coefSE, tStats, pValues, fitted, residuals, s, r2, adjR2, df };
  };

  // factorial(n): n! = 1*2*...*n for integer n >= 0; returns 1 for n = 0.
  // Iterative product — exact for moderate n; overflows to Infinity for n >= 171
  // (171! > Number.MAX_VALUE). Callers needing larger n should use lgamma(n+1)
  // for log-factorial. Throws for negative or non-integer n.
  StatsAlgorithms.factorial = function (n) {
    if (!Number.isInteger(n)) throw new Error("n must be an integer.");
    if (n < 0) throw new Error("n must be non-negative.");
    let f = 1;
    for (let i = 2; i <= n; i++) f *= i;
    return f;
  };

  // permutation(n, k): P(n, k) = n!/(n-k)! = n*(n-1)*...*(n-k+1), the number of
  // ordered k-length arrangements of n distinct items. Computed as an iterative
  // product to avoid constructing n! (which overflows earlier than the product
  // does). Requires integers 0 <= k <= n. Throws otherwise.
  StatsAlgorithms.permutation = function (n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error("n and k must be integers.");
    if (n < 0 || k < 0) throw new Error("n and k must be non-negative.");
    if (k > n) throw new Error("k must be <= n.");
    let p = 1;
    for (let i = 0; i < k; i++) p *= (n - i);
    return p;
  };

  // combination(n, k): C(n, k) = n!/(k!(n-k)!), the number of unordered
  // k-subsets of n distinct items. Computed via the multiplicative formula
  //   c = prod_{i=0}^{k-1} (n-i)/(i+1)
  // updated left-to-right. Each intermediate is an exact integer (the product of
  // the first i+1 terms of n*(n-1)*... is divisible by (i+1)!), so the result
  // stays exact for moderate n and avoids constructing n!. For very large n
  // where float64 rounding matters, use exp(lgamma(n+1)-lgamma(k+1)-lgamma(n-k+1)).
  // Requires integers 0 <= k <= n. Throws otherwise.
  StatsAlgorithms.combination = function (n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error("n and k must be integers.");
    if (n < 0 || k < 0) throw new Error("n and k must be non-negative.");
    if (k > n) throw new Error("k must be <= n.");
    if (k > n - k) k = n - k;
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
    return c;
  };

  // conditionalProbability(pAandB, pB): P(A|B) = P(A∩B)/P(B). Requires P(B) > 0
  // and both probabilities in [0, 1]. Throws otherwise.
  StatsAlgorithms.conditionalProbability = function (pAandB, pB) {
    if (!(pAandB >= 0 && pAandB <= 1)) throw new Error("P(A∩B) must be in [0, 1].");
    if (!(pB > 0 && pB <= 1)) throw new Error("P(B) must be in (0, 1].");
    if (pAandB > pB) throw new Error("P(A∩B) cannot exceed P(B).");
    return pAandB / pB;
  };

  // bayesTheorem(prior, likelihoods): generalized Bayes for a hypothesis set
  // {H_1, ..., H_m}. prior[i] = P(H_i) (must sum to ~1), likelihoods[i] = P(E|H_i)
  // (each in [0,1]). Returns {posteriors, normalizer} where
  //   posteriors[i] = P(H_i|E) = likelihoods[i]*prior[i] / normalizer
  //   normalizer    = sum_j likelihoods[j]*prior[j]   (= P(E))
  // Throws on length mismatch, priors not summing to 1 (tol 1e-9), or any entry
  // outside [0, 1].
  StatsAlgorithms.bayesTheorem = function (prior, likelihoods) {
    if (!Array.isArray(prior) || !Array.isArray(likelihoods))
      throw new Error("prior and likelihoods must be arrays.");
    const m = prior.length;
    if (m === 0) throw new Error("Need at least one hypothesis.");
    if (likelihoods.length !== m)
      throw new Error("prior and likelihoods must have the same length.");
    let sumPrior = 0;
    for (let i = 0; i < m; i++) {
      if (!(prior[i] >= 0 && prior[i] <= 1))
        throw new Error("prior[" + i + "] must be in [0, 1].");
      if (!(likelihoods[i] >= 0 && likelihoods[i] <= 1))
        throw new Error("likelihoods[" + i + "] must be in [0, 1].");
      sumPrior += prior[i];
    }
    if (Math.abs(sumPrior - 1) > 1e-9)
      throw new Error("priors must sum to 1 (got " + sumPrior + ").");
    let normalizer = 0;
    for (let i = 0; i < m; i++) normalizer += likelihoods[i] * prior[i];
    if (!(normalizer > 0))
      throw new Error("normalizer P(E) must be positive (at least one likelihood*prior > 0).");
    const posteriors = new Array(m);
    for (let i = 0; i < m; i++) posteriors[i] = likelihoods[i] * prior[i] / normalizer;
    return { posteriors, normalizer };
  };

  // bayesSimple(pH, pEgivenH, pEgivenNotH): two-hypothesis Bayes
  //   P(H|E) = P(E|H)*P(H) / [ P(E|H)*P(H) + P(E|¬H)*P(¬H) ]
  // Returns the posterior P(H|E) as a number in [0, 1]. Requires pH in (0,1)
  // (both hypotheses must have nonzero prior) and both likelihoods in [0, 1].
  // Throws otherwise.
  StatsAlgorithms.bayesSimple = function (pH, pEgivenH, pEgivenNotH) {
    if (!(pH > 0 && pH < 1)) throw new Error("P(H) must be in (0, 1) — both hypotheses need nonzero prior.");
    if (!(pEgivenH >= 0 && pEgivenH <= 1)) throw new Error("P(E|H) must be in [0, 1].");
    if (!(pEgivenNotH >= 0 && pEgivenNotH <= 1)) throw new Error("P(E|¬H) must be in [0, 1].");
    const numerator = pEgivenH * pH;
    const denominator = numerator + pEgivenNotH * (1 - pH);
    if (!(denominator > 0))
      throw new Error("P(E) must be positive (at least one likelihood > 0).");
    return numerator / denominator;
  };

  // ---- One-Way ANOVA (F-test) ----------------------------------------------
  // The F-distribution machinery mirrors the existing t/chi-square helpers:
  // the regularized incomplete beta `betai` already in this module gives the
  // F CDF directly. The upper-tail p-value follows the chi-square convention
  // (p = 1 - fCDF(F, df1, df2)).

  // F-distribution CDF: P(F <= x) = I_{df1*x/(df1*x+df2)}(df1/2, df2/2).
  // Increasing in x (like chiSquareCDF), so the critical-value bisection below
  // uses the same direction guard as chiSquareCritical.
  StatsAlgorithms.fCDF = function (x, df1, df2) {
    if (x <= 0) return 0;
    if (!(df1 > 0) || !(df2 > 0)) throw new Error("Degrees of freedom must be positive.");
    const z = (df1 * x) / (df1 * x + df2);
    return StatsAlgorithms.betai(df1 / 2, df2 / 2, z);
  };

  // Upper-tail critical value F_{p} such that P(F <= F_p) = p. For a
  // significance-level-α test, pass p = 1 - α (mirrors chiSquareCritical).
  StatsAlgorithms.fCritical = function (p, df1, df2) {
    if (!(p > 0 && p < 1)) throw new Error("p must be between 0 and 1.");
    if (!(df1 > 0) || !(df2 > 0)) throw new Error("Degrees of freedom must be positive.");
    let lo = 0, hi = 1000;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (StatsAlgorithms.fCDF(mid, df1, df2) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  // F-distribution PDF, for the density plot. Uses the existing Lanczos lgamma
  // for the normalizing Beta constant, matching the chi-square density helper.
  StatsAlgorithms.fPDF = function (x, df1, df2) {
    if (x <= 0) return 0;
    const a = df1 / 2, b = df2 / 2;
    const logNorm = StatsAlgorithms.lgamma(a + b) - StatsAlgorithms.lgamma(a) - StatsAlgorithms.lgamma(b)
      + a * Math.log(df1) + b * Math.log(df2) - (a + b) * Math.log(df1 * x + df2);
    return Math.exp(logNorm + (a - 1) * Math.log(x));
  };

  // One-way ANOVA across k >= 2 groups. Splits the total sum of squares into
  // between-group (SSB, explained by group membership) and within-group (SSW,
  // residual); F = (SSB/(k-1)) / (SSW/(N-k)); p = 1 - fCDF(F, k-1, N-k).
  // groups is an array of number[] (one per group). Each group needs n_i >= 1
  // and at least one group must have n_i >= 2 so SSW has a within-group
  // variance to estimate; total N must exceed k.
  StatsAlgorithms.runOneWayANOVA = function (groups) {
    if (!Array.isArray(groups) || groups.length < 2)
      throw new Error("ANOVA needs at least two groups (number[][]).");
    const k = groups.length;
    let N = 0;
    const groupNs = [], groupMeans = [], groupVariances = [];
    let grandSum = 0;
    for (let i = 0; i < k; i++) {
      const g = groups[i];
      if (!Array.isArray(g) || g.length < 1)
        throw new Error("Every group must be a non-empty array of numbers.");
      const ni = g.length;
      if (!g.every((v) => Number.isFinite(v)))
        throw new Error("Every value must be a finite number.");
      N += ni;
      groupNs.push(ni);
      const sum = g.reduce((s, v) => s + v, 0);
      grandSum += sum;
      const mean = sum / ni;
      groupMeans.push(mean);
      // sample variance (n-1); for n=1 this is 0 — fine, SSW contributes 0.
      const variance = ni > 1 ? g.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (ni - 1) : 0;
      groupVariances.push(variance);
    }
    if (N <= k)
      throw new Error("Total sample size N must exceed the number of groups k (need residual df > 0).");

    const grandMean = grandSum / N;

    // SSB = Σ n_i (mean_i − grandMean)²
    let ssb = 0;
    for (let i = 0; i < k; i++) ssb += groupNs[i] * (groupMeans[i] - grandMean) * (groupMeans[i] - grandMean);
    // SSW = Σ_i Σ_j (x_ij − mean_i)²  = Σ_i (n_i − 1) * variance_i
    let ssw = 0;
    for (let i = 0; i < k; i++) ssw += (groupNs[i] - 1) * groupVariances[i];

    const df1 = k - 1;
    const df2 = N - k;
    const msb = ssb / df1;
    const msw = ssw / df2;
    const F = msw > 0 ? msb / msw : (msb > 0 ? Infinity : 0);
    const p = Number.isFinite(F) ? 1 - StatsAlgorithms.fCDF(F, df1, df2) : (F > 0 ? 0 : 1);

    return {
      k, groups: groups.map((g) => g.slice()), n: N,
      grandMean, groupMeans, groupNs, groupVariances,
      ssb, ssw, msb, msw, df1, df2, F, p
    };
  };

  return StatsAlgorithms;
});