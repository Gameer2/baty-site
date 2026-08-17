// math-lab/assets/js/stats-algorithms.js is the Statistics Engine's pure, DOM-free core (see its
// own header comment) — shared between the browser pages and the Node verification suite.
// Imported here once, for its side effect, and read off the global the UMD wrapper sets — every
// statistics port spec shares this one adapter instead of repeating the same import/@ts-ignore
// per file (see numericalAlgorithms.ts for the numerical-engine equivalent of this comment).
// @ts-ignore — stats-algorithms.js lives outside canvas's rootDir (../../../../math-lab/...), so
// tsc would report TS6059 if it followed the import; ignoring the import keeps it out of tsc's
// program while Vite resolves it fine at runtime.
import "../../../../math-lab/assets/js/stats-algorithms.js";

export type OneSampleTTestResult = {
  n: number;
  mean: number;
  variance: number;
  sd: number;
  se: number;
  t: number;
  df: number;
  p: number;
};

export type TwoSampleTTestResult = {
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  var1: number;
  var2: number;
  se: number;
  t: number;
  df: number;
  p: number;
  diff: number;
};

export type ZTestResult = {
  n: number;
  mean: number;
  sigma: number;
  se: number;
  z: number;
  p: number;
};

export type LinearRegressionResult = {
  n: number;
  slope: number;
  intercept: number;
  r2: number;
  xbar: number;
  ybar: number;
};

export type DescriptiveStatsResult = {
  n: number;
  sum: number;
  mean: number;
  variance: number;
  sd: number;
  se: number;
  popVariance: number;
  popSd: number;
  min: number;
  max: number;
  range: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  modes: number[];
  sorted: number[];
};

export type ConfidenceIntervalMeanResult = {
  n: number;
  mean: number;
  sd: number;
  se: number;
  df: number;
  tStar: number;
  margin: number;
  lower: number;
  upper: number;
};

export type ChiSquareGoodnessOfFitResult = {
  categories: number;
  observed: number[];
  expected: number[];
  stat: number;
  df: number;
  p: number;
  contributions: number[];
};

export type MultipleRegressionResult = {
  n: number;
  p: number;
  coefficients: number[];
  coefSE: number[];
  tStats: number[];
  pValues: number[];
  fitted: number[];
  residuals: number[];
  s: number;
  r2: number;
  adjR2: number;
  df: number;
};

export type OneWayAnovaResult = {
  k: number;
  groups: number[][];
  n: number;
  grandMean: number;
  groupMeans: number[];
  groupNs: number[];
  groupVariances: number[];
  ssb: number;
  ssw: number;
  msb: number;
  msw: number;
  df1: number;
  df2: number;
  F: number;
  p: number;
};

export type StatsAlgorithmsModule = {
  runOneSampleTTest: (data: number[], mu0: number) => OneSampleTTestResult;
  runTwoSampleTTest: (data1: number[], data2: number[]) => TwoSampleTTestResult;
  runZTest: (data: number[], mu0: number, sigma: number) => ZTestResult;
  runLinearRegression: (points: number[][]) => LinearRegressionResult;
  descriptiveStats: (data: number[]) => DescriptiveStatsResult;
  mulberry32: (seed: number) => () => number;
  sampleUniform: (rng: () => number, lo: number, hi: number) => number;
  sampleExponential: (rng: () => number, rate: number) => number;
  sampleNormal: (rng: () => number, mean: number, sd: number) => number;
  drawSampleMeans: (
    draw: () => number,
    n: number,
    numSamples: number,
  ) => { means: number[]; grandMean: number; se: number };
  confidenceIntervalMean: (
    data: number[],
    confidence: number,
  ) => ConfidenceIntervalMeanResult;
  binomialPMF: (k: number, n: number, p: number) => number;
  binomialCDF: (k: number, n: number, p: number) => number;
  binomialMean: (n: number, p: number) => number;
  binomialVariance: (n: number, p: number) => number;
  normalPDF: (x: number, mean: number, sd: number) => number;
  normalCDFValue: (x: number, mean: number, sd: number) => number;
  normalMean: (mean: number, sd: number) => number;
  normalVariance: (mean: number, sd: number) => number;
  chiSquareGoodnessOfFit: (
    observed: number[],
    expected: number[],
    dfAdjust?: number,
  ) => ChiSquareGoodnessOfFitResult;
  runMultipleRegression: (data: number[][]) => MultipleRegressionResult;
  factorial: (n: number) => number;
  permutation: (n: number, k: number) => number;
  combination: (n: number, k: number) => number;
  runOneWayANOVA: (groups: number[][]) => OneWayAnovaResult;
};

export const StatsAlgorithms = (
  globalThis as { StatsAlgorithms?: StatsAlgorithmsModule }
).StatsAlgorithms as StatsAlgorithmsModule;
