"use strict";
/* Statistics Engine — verification suite.
   Runs the exact same code the pages ship (assets/js/stats-algorithms.js) against known
   textbook / hand-computed answers. Run with: node tests/verify-statistics.js
   Every method added to the Statistics Engine should get a case here — this is what stops
   a later change to stats-algorithms.js from silently breaking a method nobody happened to
   be looking at. Separate from tests/verify.js (the Numerical Engine's suite); do not mix. */

const path = require("path");
const StatsAlgorithms = require(path.join(__dirname, "..", "assets", "js", "stats-algorithms.js"));

let pass = 0;
let fail = 0;

function approx(actual, expected, tol, label) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) < tol;
  if (ok) {
    pass++;
    console.log(`  ok    ${label}: ${actual} ≈ ${expected}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}: got ${actual}, expected ≈ ${expected} (tol ${tol})`);
  }
  return ok;
}

console.log("Statistics Engine — verification suite\n");

// One-sample t-test: same 12-value sample as the current prototype's default example,
// H0: mu = 75. mean=82.16666..., sd=8.40814900539766, se=2.4272235458264118,
// t = (mean - mu0)/se = (82.16667 - 75)/2.4272235458264118 = 2.9526191268989987, df=11.
// (mean and sd are exercised on this same dataset by the descriptive-stats cases below,
// so this block asserts only the t-test-distinct outputs t and df — keeping the suite at
// the 6-passed baseline the plan's §8 acceptance criterion states.)
// NOTE: the restructuring plan listed t = 2.9528786840448796, but that value is
// arithmetically inconsistent with the sd/se it states in the same comment (those imply
// 2.9526191268989987). runOneSampleTTest is a literal transcription of the plan's §2
// code, which produces 2.9526191268989987 — the value below — so the plan's expected
// number was the error, not the implementation. Corrected here; flagged in the build report.
{
  const data = [78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79];
  const result = StatsAlgorithms.runOneSampleTTest(data, 75);
  approx(result.t, 2.9526191268989987, 1e-6, "One-sample t-test: t statistic");
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
// CDF at (x=2, shape=2, scale=1) = gammaP(2, 2) ≈ 0.593994 — same routine the
// chi-square CDF uses (chiSquareCDF(x, k) = gammaP(k/2, x/2) = gammaCDF(x, k/2, 2),
// so chi-square(k) is Gamma(k/2, 2)).
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

// Welch's two-sample t-test, equal variances / equal n (hand-computable):
// d1=[5,6,7,8,9] (mean 7, var 2.5), d2=[1,2,3,4,5] (mean 3, var 2.5).
// se = sqrt(2.5/5 + 2.5/5) = 1, t = (7-3)/1 = 4, Welch df = 8 (= n1+n2-2 here
// because the variances are equal), p = tCDF(4, 8). Textbook cross-check:
// t_{0.01, df=8} = 3.355 < 4 < t_{0.001, df=8} = 5.041 -> p in (0.001, 0.01).
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

// Welch's two-sample t-test, unequal variances / unequal n (textbook-style):
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
// t = 2*sqrt(10) = 6.3245553, df = 4. Textbook cross-check: t_{0.01, df=4} = 3.747
// < 6.3246 < t_{0.001, df=4} = 8.610 -> p in (0.001, 0.01). Cross-check:
// runPairedTTest produces identical t/df/p to runOneSampleTTest(differences, 0).
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
// Textbook cross-check: Phi(2) = 0.97725 (standard normal table), two-tailed
// p = 2*(1-0.97725) = 0.0455. Cross-check: p === 2*(1-normalCDF(|z|)).
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

// Multiple linear regression — exact plane y = 2 + 3x1 - x2 through 6 points.
// n=6, p=2, df=3. β̂ = [2, 3, -1] exactly; R² = 1, SSE = 0, s = 0, SE = 0 for
// every coefficient (so t = ±Inf and p = tCDF(Inf, 3) = 0). Expected values
// were produced by an independent Cramer's-rule solver (see plan
// 08-multiple-linear-regression.md §3).
{
  const r = StatsAlgorithms.runMultipleRegression([
    [0, 0, 2], [1, 0, 5], [0, 1, 1], [1, 1, 4], [2, 1, 7], [3, 2, 9]]);
  approx(r.n, 6, 1e-12, "MLR plane: n = 6");
  approx(r.p, 2, 1e-12, "MLR plane: p = 2");
  approx(r.df, 3, 1e-12, "MLR plane: df = n - p - 1 = 3");
  approx(r.coefficients[0], 2, 1e-10, "MLR plane: β0 = 2 (intercept)");
  approx(r.coefficients[1], 3, 1e-10, "MLR plane: β1 = 3");
  approx(r.coefficients[2], -1, 1e-10, "MLR plane: β2 = -1");
  approx(r.r2, 1, 1e-12, "MLR plane: R² = 1 (exact fit)");
  approx(r.adjR2, 1, 1e-12, "MLR plane: adjusted R² = 1");
  approx(r.s, 0, 1e-12, "MLR plane: residual SE s = 0");
  approx(r.fitted[0], 2, 1e-10, "MLR plane: fitted[0] = 2");
  approx(r.fitted[3], 4, 1e-10, "MLR plane: fitted[3] = 4");
  approx(r.fitted[5], 9, 1e-10, "MLR plane: fitted[5] = 9");
  approx(r.residuals[0], 0, 1e-12, "MLR plane: residual[0] = 0");
  approx(r.residuals[3], 0, 1e-12, "MLR plane: residual[3] = 0");
  approx(r.coefSE[0], 0, 1e-12, "MLR plane: SE(β0) = 0");
  approx(r.coefSE[1], 0, 1e-12, "MLR plane: SE(β1) = 0");
  approx(r.coefSE[2], 0, 1e-12, "MLR plane: SE(β2) = 0");
  approx(r.pValues[0], 0, 1e-12, "MLR plane: p(β0) = 0 (t = +Inf)");
  approx(r.pValues[1], 0, 1e-12, "MLR plane: p(β1) = 0 (t = +Inf)");
  approx(r.pValues[2], 0, 1e-12, "MLR plane: p(β2) = 0 (t = -Inf)");
}

// Multiple linear regression, p = 1 cross-check against runLinearRegression
// (the simple OLS). Same noisy 5-point dataset [[1,2],[2,4],[3,5],[4,4],[5,5]].
// runLinearRegression reports intercept=2.2, slope=0.6, r2=0.6. The p=1 multiple
// regression must produce coefficients=[intercept, slope]=[2.2, 0.6] and the
// same R². SE, t, p asserted from the independent 2×2-inverse computation.
{
  const data = [[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]];
  const r = StatsAlgorithms.runMultipleRegression(data);
  const simple = StatsAlgorithms.runLinearRegression(data);
  approx(r.n, 5, 1e-12, "MLR p=1: n = 5");
  approx(r.p, 1, 1e-12, "MLR p=1: p = 1");
  approx(r.df, 3, 1e-12, "MLR p=1: df = 3");
  approx(r.coefficients[0], 2.2, 1e-10, "MLR p=1: β0 (intercept) = 2.2");
  approx(r.coefficients[1], 0.6, 1e-10, "MLR p=1: β1 (slope) = 0.6");
  approx(r.r2, 0.6, 1e-10, "MLR p=1: R² = 0.6");
  approx(r.adjR2, 0.4666666666666668, 1e-10, "MLR p=1: adjusted R²");
  approx(r.s, 0.8944271909999157, 1e-10, "MLR p=1: residual SE s");
  approx(r.coefSE[0], 0.9380831519646858, 1e-9, "MLR p=1: SE(β0)");
  approx(r.coefSE[1], 0.28284271247461895, 1e-9, "MLR p=1: SE(β1)");
  approx(r.tStats[0], 2.3452078799117153, 1e-9, "MLR p=1: t(β0)");
  approx(r.tStats[1], 2.121320343559643, 1e-9, "MLR p=1: t(β1)");
  approx(r.pValues[0], 0.10074345463514302, 1e-9, "MLR p=1: p(β0)");
  approx(r.pValues[1], 0.12402706255347672, 1e-9, "MLR p=1: p(β1)");
  approx(r.coefficients[0], simple.intercept, 1e-12, "MLR p=1: intercept matches runLinearRegression");
  approx(r.coefficients[1], simple.slope, 1e-12, "MLR p=1: slope matches runLinearRegression");
  approx(r.r2, simple.r2, 1e-12, "MLR p=1: R² matches runLinearRegression");
}

// Multiple linear regression, noisy p=2 textbook-style example. 8 observations
// of [x1, x2, y]. n=8, p=2, df=5. β̂ = [2.55195, 1.79221, 0.16883], R² = 0.99509,
// adjR² = 0.99313, s = 0.38814. Coefficient t-tests: β0 t=8.149 (p=0.000452),
// β1 t=19.100 (p=7.25e-6), β2 t=1.558 (p=0.17991). Textbook cross-check:
// t_{0.025, df=5} = 2.571, so β0 & β1 are significant at α=0.05, β2 is not.
{
  const r = StatsAlgorithms.runMultipleRegression([
    [1, 2, 5], [2, 1, 6], [3, 2, 8], [4, 5, 11],
    [5, 3, 12], [6, 7, 14], [7, 4, 16], [8, 6, 18]]);
  approx(r.n, 8, 1e-12, "MLR noisy p=2: n = 8");
  approx(r.p, 2, 1e-12, "MLR noisy p=2: p = 2");
  approx(r.df, 5, 1e-12, "MLR noisy p=2: df = 5");
  approx(r.coefficients[0], 2.551948051948052, 1e-9, "MLR noisy p=2: β0");
  approx(r.coefficients[1], 1.7922077922077921, 1e-9, "MLR noisy p=2: β1");
  approx(r.coefficients[2], 0.16883116883116883, 1e-9, "MLR noisy p=2: β2");
  approx(r.r2, 0.9950928550277085, 1e-10, "MLR noisy p=2: R²");
  approx(r.adjR2, 0.9931299970387918, 1e-10, "MLR noisy p=2: adjusted R²");
  approx(r.s, 0.388135737402974, 1e-10, "MLR noisy p=2: residual SE s");
  approx(r.coefSE[0], 0.3131594071756114, 1e-9, "MLR noisy p=2: SE(β0)");
  approx(r.coefSE[1], 0.09383060710747236, 1e-9, "MLR noisy p=2: SE(β1)");
  approx(r.coefSE[2], 0.10834625254345034, 1e-9, "MLR noisy p=2: SE(β2)");
  approx(r.tStats[0], 8.149038456050556, 1e-9, "MLR noisy p=2: t(β0)");
  approx(r.tStats[1], 19.100460366360206, 1e-9, "MLR noisy p=2: t(β1)");
  approx(r.tStats[2], 1.5582557298275, 1e-9, "MLR noisy p=2: t(β2)");
  approx(r.pValues[0], 0.00045199741333918606, 1e-9, "MLR noisy p=2: p(β0)");
  approx(r.pValues[1], 0.000007251271437600761, 1e-9, "MLR noisy p=2: p(β1)");
  approx(r.pValues[2], 0.17991051391091628, 1e-9, "MLR noisy p=2: p(β2)");
  approx(StatsAlgorithms.tCritical(0.05, r.df), 2.571, 1e-3, "MLR noisy p=2: t_{0.025, df=5} (textbook 2.571)");
}

// matInverse cross-check: A * A⁻¹ = I (to machine precision) on a 3×3.
{
  const A = [[4, 7, 2], [3, 6, 1], [2, 5, 3]];
  const Ainv = StatsAlgorithms.matInverse(A);
  const prod = StatsAlgorithms.matMul(A, Ainv);
  approx(prod[0][0], 1, 1e-12, "matInverse: (A·A⁻¹)[0][0] = 1");
  approx(prod[1][1], 1, 1e-12, "matInverse: (A·A⁻¹)[1][1] = 1");
  approx(prod[2][2], 1, 1e-12, "matInverse: (A·A⁻¹)[2][2] = 1");
  let maxOff = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) maxOff = Math.max(maxOff, Math.abs(prod[i][j]));
  approx(maxOff, 0, 1e-12, "matInverse: max off-diagonal |A·A⁻¹| ≈ 0");
}

// Error handling: collinear predictors (x2 = 2·x1) make XᵀX singular — must
// throw, not return NaN. And n < p + 2 (here n = 3, p = 2, need 4) must throw.
{
  let threw = false;
  try { StatsAlgorithms.runMultipleRegression([[1, 2, 5], [2, 4, 6], [3, 6, 7], [4, 8, 8]]); }
  catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    MLR: collinear predictors throw"); }
  else { fail++; console.error("  FAIL  MLR: collinear predictors throw"); }

  threw = false;
  try { StatsAlgorithms.runMultipleRegression([[1, 2, 3], [4, 5, 6], [7, 8, 9]]); }
  catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    MLR: n < p + 2 throws"); }
  else { fail++; console.error("  FAIL  MLR: n < p + 2 throws"); }
}

// Probability & Combinatorics — Counting: factorials, permutations, combinations.
// C(52,5) = 2,598,960 (poker hands); C(10,3)=120; P(10,3)=720; 0!=1; C(n,0)=1.
// C(100,50) = 100891344545564193334812497256 ≈ 1.0089134454556418e+29 (the
// multiplicative formula keeps this exact to float64 precision; the literal
// below is the bit-identical float the iterative product produces).
{
  approx(StatsAlgorithms.factorial(0), 1, 1e-12, "Counting: 0! = 1");
  approx(StatsAlgorithms.factorial(1), 1, 1e-12, "Counting: 1! = 1");
  approx(StatsAlgorithms.factorial(5), 120, 1e-12, "Counting: 5! = 120");
  approx(StatsAlgorithms.factorial(10), 3628800, 1e-12, "Counting: 10! = 3628800");
  approx(StatsAlgorithms.permutation(10, 3), 720, 1e-12, "Counting: P(10,3) = 720");
  approx(StatsAlgorithms.permutation(10, 0), 1, 1e-12, "Counting: P(10,0) = 1");
  approx(StatsAlgorithms.permutation(5, 2), 20, 1e-12, "Counting: P(5,2) = 20");
  approx(StatsAlgorithms.permutation(10, 10), 3628800, 1e-12, "Counting: P(10,10) = 10!");
  approx(StatsAlgorithms.permutation(52, 5), 311875200, 1e-12, "Counting: P(52,5) = 311875200");
  approx(StatsAlgorithms.combination(52, 5), 2598960, 1e-12, "Counting: C(52,5) = 2598960 (poker hands)");
  approx(StatsAlgorithms.combination(10, 3), 120, 1e-12, "Counting: C(10,3) = 120");
  approx(StatsAlgorithms.combination(10, 0), 1, 1e-12, "Counting: C(10,0) = 1");
  approx(StatsAlgorithms.combination(10, 10), 1, 1e-12, "Counting: C(10,10) = 1");
  approx(StatsAlgorithms.combination(6, 2), 15, 1e-12, "Counting: C(6,2) = 15");
  approx(StatsAlgorithms.combination(100, 50), 1.0089134454556418e+29, 1e-12, "Counting: C(100,50) (multiplicative, float64-exact)");
  // Symmetry: C(n,k) == C(n, n-k) — the implementation picks the smaller k.
  approx(StatsAlgorithms.combination(52, 47), 2598960, 1e-12, "Counting: C(52,47) = C(52,5) (symmetry)");
}

// Counting — error handling: invalid inputs must throw, not return NaN/Infinity.
{
  let threw = false;
  try { StatsAlgorithms.factorial(-1); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: factorial(-1) throws"); }
  else { fail++; console.error("  FAIL  Counting: factorial(-1) throws"); }

  threw = false;
  try { StatsAlgorithms.factorial(2.5); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: factorial(2.5) throws (non-integer)"); }
  else { fail++; console.error("  FAIL  Counting: factorial(2.5) throws (non-integer)"); }

  threw = false;
  try { StatsAlgorithms.combination(5, 6); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: C(5,6) throws (k > n)"); }
  else { fail++; console.error("  FAIL  Counting: C(5,6) throws (k > n)"); }

  threw = false;
  try { StatsAlgorithms.permutation(5, 6); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: P(5,6) throws (k > n)"); }
  else { fail++; console.error("  FAIL  Counting: P(5,6) throws (k > n)"); }

  threw = false;
  try { StatsAlgorithms.combination(-1, 0); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: C(-1,0) throws (n < 0)"); }
  else { fail++; console.error("  FAIL  Counting: C(-1,0) throws (n < 0)"); }
}

// Conditional probability: P(A|B) = P(A∩B)/P(B). Hand cases:
// P(A∩B)=0.12, P(B)=0.30 -> 0.4 ; P(A∩B)=0.05, P(B)=0.25 -> 0.2.
{
  approx(StatsAlgorithms.conditionalProbability(0.12, 0.30), 0.4, 1e-12, "Conditional: P(A|B) = 0.12/0.30 = 0.4");
  approx(StatsAlgorithms.conditionalProbability(0.05, 0.25), 0.2, 1e-12, "Conditional: P(A|B) = 0.05/0.25 = 0.2");
  // P(B) = 0 must throw.
  let threw = false;
  try { StatsAlgorithms.conditionalProbability(0.1, 0); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Conditional: P(B)=0 throws"); }
  else { fail++; console.error("  FAIL  Conditional: P(B)=0 throws"); }
}

// Bayes' theorem — two-hypothesis simple form (classic disease testing):
// prevalence 1%, test sensitivity 99%, false-positive rate 5%.
// P(H|E) = 0.99*0.01 / (0.99*0.01 + 0.05*0.99) = 0.0099 / 0.0594 = 1/6 ≈ 0.16667.
{
  approx(StatsAlgorithms.bayesSimple(0.01, 0.99, 0.05), 0.16666666666666669, 1e-12, "Bayes simple: disease posterior ≈ 0.16667 (1% / 99% sens / 5% FPR)");
  // pH = 0 (a hypothesis with zero prior) must throw — both hypotheses need nonzero prior.
  let threw = false;
  try { StatsAlgorithms.bayesSimple(0, 0.5, 0.5); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Bayes simple: pH=0 throws"); }
  else { fail++; console.error("  FAIL  Bayes simple: pH=0 throws"); }
}

// Bayes' theorem — general N-hypothesis form. Monty Hall: three hypotheses
// (prize behind door 1/2/3), equal priors [1/3, 1/3, 1/3]; you pick door 1 and
// the host opens door 3 to reveal a goat. Likelihoods P(host opens door 3 |
// prize at i) = [1/2, 1, 0] (if prize is at door 1 host picks randomly between
// the two goats; if at door 2 host must open door 3; if at door 3 host can't).
// Posteriors [1/3, 2/3, 0], normalizer P(E) = 1/2.
{
  const r = StatsAlgorithms.bayesTheorem([1 / 3, 1 / 3, 1 / 3], [0.5, 1, 0]);
  approx(r.posteriors[0], 1 / 3, 1e-12, "Bayes Monty Hall: posterior(door 1, stay) = 1/3");
  approx(r.posteriors[1], 2 / 3, 1e-12, "Bayes Monty Hall: posterior(door 2, switch) = 2/3");
  approx(r.posteriors[2], 0, 1e-12, "Bayes Monty Hall: posterior(door 3, ruled out) = 0");
  approx(r.normalizer, 0.5, 1e-12, "Bayes Monty Hall: normalizer P(E) = 0.5");
}

// Bayes' theorem — 3-hypothesis general form. priors [0.5, 0.3, 0.2] (sum 1),
// likelihoods [0.6, 0.4, 0.1]. normalizer = 0.5*0.6+0.3*0.4+0.2*0.1 = 0.44.
// posteriors = [0.30/0.44, 0.12/0.44, 0.02/0.44] = [0.68182, 0.27273, 0.04545].
{
  const r = StatsAlgorithms.bayesTheorem([0.5, 0.3, 0.2], [0.6, 0.4, 0.1]);
  approx(r.normalizer, 0.44, 1e-12, "Bayes 3-hyp: normalizer = 0.44");
  approx(r.posteriors[0], 0.6818181818181818, 1e-12, "Bayes 3-hyp: posterior[0]");
  approx(r.posteriors[1], 0.2727272727272727, 1e-12, "Bayes 3-hyp: posterior[1]");
  approx(r.posteriors[2], 0.04545454545454546, 1e-12, "Bayes 3-hyp: posterior[2]");
  // Priors not summing to 1 must throw.
  let threw = false;
  try { StatsAlgorithms.bayesTheorem([0.5, 0.4], [0.3, 0.2]); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Bayes 3-hyp: priors summing to 0.9 throw"); }
  else { fail++; console.error("  FAIL  Bayes 3-hyp: priors summing to 0.9 throw"); }
}

// Gamma CDF in the upper tail — regression test. gammaCDF once called the gammaP series
// unconditionally; that series stalls around 1 - 3e-9 and then drifts *backwards*, making
// the CDF non-monotone past roughly x = 80 (shape 2, scale 3). It now uses the same
// series/continued-fraction split chiSquareCDF already used. For integer shape k the exact
// value is 1 - e^(-y) * sum_{i<k} y^i/i!, y = x/scale — computed here independently.
{
  const exact = (x, k, scale) => {
    const y = x / scale;
    let s = 0, t = 1;
    for (let i = 0; i < k; i++) { s += t; t *= y / (i + 1); }
    return 1 - Math.exp(-y) * s;
  };
  approx(StatsAlgorithms.gammaCDF(30, 2, 3), exact(30, 2, 3), 1e-12, "Gamma CDF upper tail: x=30, shape=2, scale=3");
  approx(StatsAlgorithms.gammaCDF(100, 2, 3), exact(100, 2, 3), 1e-12, "Gamma CDF upper tail: x=100, shape=2, scale=3");
  approx(StatsAlgorithms.gammaCDF(50, 3, 2), exact(50, 3, 2), 1e-12, "Gamma CDF upper tail: x=50, shape=3, scale=2");
}

// Gamma CDF must be monotone non-decreasing across the whole range — the property the
// series-only version violated (2102 backward steps over this same sweep).
{
  let prev = -Infinity, breaks = 0;
  for (let i = 0; i <= 4000; i++) {
    const v = StatsAlgorithms.gammaCDF((150 * i) / 4000, 2, 3);
    if (v < prev - 1e-15) breaks++;
    prev = v;
  }
  if (breaks === 0) { pass++; console.log("  ok    Gamma CDF is monotone over x in [0, 150] (shape=2, scale=3)"); }
  else { fail++; console.error(`  FAIL  Gamma CDF monotonicity: ${breaks} backward steps`); }
}

// Chi-square(k) is exactly Gamma(shape = k/2, scale = 2) — the two CDFs must agree.
// This cross-check is what pins gammaCDF to the already-correct chiSquareCDF branch.
{
  approx(StatsAlgorithms.gammaCDF(10, 2, 2), StatsAlgorithms.chiSquareCDF(10, 4), 1e-14, "Gamma CDF == chi-square CDF at x=10 (df=4)");
  approx(StatsAlgorithms.gammaCDF(60, 2, 2), StatsAlgorithms.chiSquareCDF(60, 4), 1e-14, "Gamma CDF == chi-square CDF at x=60 (df=4)");
  approx(StatsAlgorithms.gammaCDF(150, 2, 2), StatsAlgorithms.chiSquareCDF(150, 4), 1e-14, "Gamma CDF == chi-square CDF at x=150 (df=4)");
}

/* ---- Degenerate-input refusals -------------------------------------------------
   A t statistic on a zero-variance sample is (x̄ − μ₀)/0: ±∞ when the mean differs from μ₀,
   and 0/0 when it does not. Neither is a test result. Computed rather than refused, this
   came back as {t: null, p: 0} — a p-value of exactly zero, i.e. maximum significance, from
   four identical observations. Reporting certainty from a sample carrying no information is
   the most misleading answer this module could give, so it must refuse. */
{
  let threw = false;
  try { StatsAlgorithms.runOneSampleTTest([3, 3, 3, 3], 2); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    t-test refuses zero-variance data (previously reported p = 0)"); }
  else { fail++; console.error("  FAIL  t-test accepted zero-variance data"); }

  // The mean-equals-μ₀ variant of the same degeneracy: 0/0 rather than ±∞.
  threw = false;
  try { StatsAlgorithms.runOneSampleTTest([3, 3, 3], 3); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    t-test refuses zero-variance data when mean == mu0 (0/0)"); }
  else { fail++; console.error("  FAIL  t-test accepted zero-variance data with mean == mu0"); }

  // The guard must not fire on merely SMALL variance — that is a legitimate sample, and a
  // refusal there would be a worse bug than the one being fixed.
  const small = StatsAlgorithms.runOneSampleTTest([3, 3.0001, 2.9999, 3.0002], 2);
  if (small && Number.isFinite(small.t)) { pass++; console.log("  ok    t-test still accepts small-but-nonzero variance"); }
  else { fail++; console.error("  FAIL  t-test wrongly refused small-but-nonzero variance"); }
}

// ---------------------------------------------------------------------------
// One-Way ANOVA (F-test) — fCDF/fCritical/fPDF via the existing betai, and the
// ANOVA decomposition against a hand-computed 3-group textbook example.
// ---------------------------------------------------------------------------
console.log("\nOne-Way ANOVA / F-distribution:");
{
  // fCDF basics: 0 at/below 0, monotone, → 1 in the tail.
  approx(StatsAlgorithms.fCDF(0, 2, 12), 0, 1e-12, "fCDF(0,2,12) = 0");
  approx(StatsAlgorithms.fCDF(-1, 2, 12), 0, 1e-12, "fCDF(<0) = 0");
  approx(StatsAlgorithms.fCDF(1e6, 2, 12), 1, 1e-9, "fCDF(large,2,12) → 1");
  const a = StatsAlgorithms.fCDF(2, 5, 10), b = StatsAlgorithms.fCDF(3, 5, 10);
  approx(a < b ? 1 : 0, 1, 1e-12, "fCDF monotone increasing in x");

  // Textbook upper-tail critical values (F-table, α = 0.05 / 0.01).
  // fCritical(p, df1, df2) returns the p-quantile, so the α=0.05 critical is fCritical(0.95,...).
  approx(StatsAlgorithms.fCritical(0.95, 2, 12), 3.8853, 1e-2, "F crit: df1=2,df2=12, p=0.95 (textbook 3.885)");
  approx(StatsAlgorithms.fCritical(0.99, 2, 12), 6.9266, 1e-2, "F crit: df1=2,df2=12, p=0.99 (textbook 6.927)");
  approx(StatsAlgorithms.fCritical(0.95, 3, 10), 3.7083, 1e-2, "F crit: df1=3,df2=10, p=0.95 (textbook 3.708)");

  // Round-trip: the p-quantile inverts the CDF.
  approx(StatsAlgorithms.fCDF(StatsAlgorithms.fCritical(0.95, 2, 12), 2, 12), 0.95, 1e-3, "fCDF(fCritical(0.95)) = 0.95");
  approx(StatsAlgorithms.fCDF(StatsAlgorithms.fCritical(0.99, 5, 20), 5, 20), 0.99, 1e-3, "fCDF(fCritical(0.99)) = 0.99");

  // fPDF is non-negative and integrates roughly to 1 (trapezoid sanity).
  let pdfArea = 0;
  for (let i = 1; i <= 2000; i++) {
    const x = (i * 40) / 2000;
    pdfArea += (40 / 2000) * StatsAlgorithms.fPDF(x, 2, 12);
  }
  approx(pdfArea, 1, 1e-2, "fPDF integrates to ~1 (df 2,12)");
}
{
  // Classic 3-group teaching example, hand-computed:
  //   G1=[49,47,51,49,50] mean 49.2, G2=[48,50,52,51,49] mean 50, G3=[54,56,52,55,53] mean 54
  //   grand mean = 766/15 = 51.0667
  //   SSB = 5*((-28/15)^2 + (-16/15)^2 + (44/15)^2) = 14880/225 = 66.1333
  //   SSW = 8.8 + 10 + 10 = 28.8 ; MSB = 33.0667 ; MSW = 2.4 ; F = 13.7778
  const r = StatsAlgorithms.runOneWayANOVA([
    [49, 47, 51, 49, 50],
    [48, 50, 52, 51, 49],
    [54, 56, 52, 55, 53],
  ]);
  approx(r.k, 3, 1e-12, "ANOVA: k = 3 groups");
  approx(r.n, 15, 1e-12, "ANOVA: N = 15");
  approx(r.grandMean, 766 / 15, 1e-9, "ANOVA: grand mean = 766/15");
  approx(r.groupMeans[0], 49.2, 1e-9, "ANOVA: group 1 mean = 49.2");
  approx(r.groupMeans[1], 50, 1e-9, "ANOVA: group 2 mean = 50");
  approx(r.groupMeans[2], 54, 1e-9, "ANOVA: group 3 mean = 54");
  approx(r.ssb, 14880 / 225, 1e-6, "ANOVA: SSB = 66.1333");
  approx(r.ssw, 28.8, 1e-6, "ANOVA: SSW = 28.8");
  approx(r.df1, 2, 1e-12, "ANOVA: df1 = k-1 = 2");
  approx(r.df2, 12, 1e-12, "ANOVA: df2 = N-k = 12");
  approx(r.msb, (14880 / 225) / 2, 1e-6, "ANOVA: MSB = SSB/df1");
  approx(r.msw, 28.8 / 12, 1e-9, "ANOVA: MSW = SSW/df2");
  approx(r.F, (14880 / 225) / 2 / (28.8 / 12), 1e-6, "ANOVA: F = MSB/MSW = 13.7778");
  approx(r.F, 13.7778, 1e-2, "ANOVA: F ≈ 13.778 (textbook)");
  // p is the upper tail, and must equal 1 - fCDF(F, df1, df2) — the chi-square cross-check idiom.
  approx(r.p, 1 - StatsAlgorithms.fCDF(r.F, r.df1, r.df2), 1e-12, "ANOVA: p === 1 - fCDF(F, df1, df2)");
  approx(r.p < 0.01 ? 1 : 0, 1, 1e-12, "ANOVA: rejects at α=0.01 (means differ)");
}
{
  // No difference: three identical groups → SSB = 0, F = 0, p = 1.
  const r = StatsAlgorithms.runOneWayANOVA([[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
  approx(r.ssb, 0, 1e-12, "ANOVA equal groups: SSB = 0");
  approx(r.F, 0, 1e-12, "ANOVA equal groups: F = 0");
  approx(r.p, 1, 1e-9, "ANOVA equal groups: p = 1");
}
{
  // Refusals / bad input.
  let threw;
  threw = false; try { StatsAlgorithms.runOneWayANOVA([[1, 2, 3]]); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    ANOVA refuses a single group"); } else { fail++; console.error("  FAIL  ANOVA accepted a single group"); }
  threw = false; try { StatsAlgorithms.runOneWayANOVA([[1, 2], []]); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    ANOVA refuses an empty group"); } else { fail++; console.error("  FAIL  ANOVA accepted an empty group"); }
  threw = false; try { StatsAlgorithms.runOneWayANOVA([[1], [2]]); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    ANOVA refuses N <= k (no residual df)"); } else { fail++; console.error("  FAIL  ANOVA accepted N <= k"); }
  threw = false; try { StatsAlgorithms.fCritical(1.5, 2, 12); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    fCritical refuses p outside (0,1)"); } else { fail++; console.error("  FAIL  fCritical accepted p outside (0,1)"); }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);