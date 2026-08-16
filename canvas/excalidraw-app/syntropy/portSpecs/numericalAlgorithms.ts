// math-lab/assets/js/algorithms.js is the Numerical Engine's pure, DOM-free core (see its own
// header comment: "pure, DOM-free numeric methods... shared between the browser pages and the
// Node verification suite"). Imported here once, for its side effect, and read off the global
// the UMD wrapper sets — every numerical-engine port spec shares this one adapter instead of
// repeating the same import/@ts-ignore per file (see riemannSums.ts for the calculus-engine
// equivalent of this comment, which explains why the import is side-effect-only).
// @ts-ignore — algorithms.js lives outside canvas's rootDir (../../../../math-lab/...), so tsc
// would report TS6059 if it followed the import; ignoring the import keeps it out of tsc's
// program while Vite resolves it fine at runtime.
import "../../../../math-lab/assets/js/algorithms.js";

/** Shape shared by every iterative root-finder: one record per iteration. */
export type Iteration = Record<string, number>;

/** Shape shared by runNewtonSystem/runBroyden: one record per iteration over a vector unknown. */
export type VectorIteration = {
  n: number;
  x: number[];
  fx: number[];
  xNext: number[];
  err: number;
};

export type AlgorithmsModule = {
  // Shared matrix primitives — used directly by several linear-algebra port specs to verify a
  // decomposition's own identity (A = LU, QᵀQ = I, …) rather than re-deriving matrix multiply.
  matVec: (A: number[][], x: number[]) => number[];
  matMul: (A: number[][], B: number[][]) => number[][];
  runBisection: (
    f: (x: number) => number,
    a: number,
    b: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runFalsePosition: (
    f: (x: number) => number,
    a: number,
    b: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runFixedPoint: (
    g: (x: number) => number,
    x0: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runNewton: (
    f: (x: number) => number,
    fp: (x: number) => number,
    x0: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runSecant: (
    f: (x: number) => number,
    x0: number,
    x1: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runTrapezoidal: (
    f: (x: number) => number,
    a: number,
    b: number,
    n: number,
  ) => { h: number; panels: unknown[]; total: number };
  runSimpson: (
    f: (x: number) => number,
    a: number,
    b: number,
    n: number,
    mode?: string,
  ) => { h: number; mode: string; panels: unknown[]; total: number };
  runRomberg: (
    f: (x: number) => number,
    a: number,
    b: number,
    m: number,
  ) => { R: number[][]; total: number };
  runAdaptiveQuadrature: (
    f: (x: number) => number,
    a: number,
    b: number,
    tol: number,
  ) => { leaves: unknown[]; total: number };
  runGaussLegendre: (
    f: (x: number) => number,
    a: number,
    b: number,
    order: number,
  ) => { order: number; points: unknown[]; total: number };
  runNumericalDiff: (
    f: (x: number) => number,
    x: number,
    h: number,
  ) => { forward: number; central: number; h: number };
  runRichardsonDiff: (
    f: (x: number) => number,
    x: number,
    h: number,
  ) => { D1: number; D2: number; richardson: number; h: number };
  runNewtonMultiple: (
    f: (x: number) => number,
    fp: (x: number) => number,
    fpp: (x: number) => number,
    x0: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runMuller: (
    f: (x: number) => number,
    x0: number,
    x1: number,
    x2: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runSteffensen: (
    g: (x: number) => number,
    x0: number,
    tol: number,
    maxIter: number,
  ) => Iteration[];
  runLagrangeInterpolation: (points: { x: number; y: number }[]) => number[];
  evalPolyAscending: (coeffsAsc: number[], x: number) => number;
  runHermite: (points: { x: number; f: number; fp: number }[]) => {
    z: number[];
    Q: number[][];
  };
  evalHermite: (z: number[], Q: number[][], x: number) => number;
  runNeville: (
    points: { x: number; y: number }[],
    x: number,
  ) => { table: number[][]; value: number };
  runNewtonDD: (
    points: { x: number; y: number }[],
    x: number,
  ) => { table: number[][]; value: number; coeffs: number[] };
  runDiscreteLeastSquares: (
    points: { x: number; y: number }[],
    d: number,
  ) => { coeffs: number[]; d: number };
  runChebyshevEcon: (
    coeffs: number[],
    d: number,
  ) => {
    econCoeffs: number[];
    originalDegree: number;
    economizedDegree: number;
  };
  runHorner: (
    coeffs: number[],
    x: number,
  ) => { value: number; deflated: number[] };
  runPowerMethod: (
    A: number[][],
    x0: number[],
    tol: number,
    maxIter: number,
  ) => { n: number; mu: number; xNext: number[]; err: number }[];
  runInversePowerMethod: (
    A: number[][],
    x0: number[],
    tol: number,
    maxIter: number,
  ) => {
    n: number;
    mu: number;
    lambdaMin: number;
    xNext: number[];
    err: number;
  }[];
  runQRAlgorithm: (
    A: number[][],
    tol: number,
    maxIter: number,
  ) => { n: number; A: number[][]; diag: number[]; offNorm: number }[];
  runNewtonSystem: (
    F: ((xVec: number[]) => number)[],
    x0: number[],
    tol: number,
    maxIter: number,
  ) => VectorIteration[];
  runBroyden: (
    F: ((xVec: number[]) => number)[],
    x0: number[],
    tol: number,
    maxIter: number,
  ) => VectorIteration[];
  runShooting: (
    p: (x: number) => number,
    q: (x: number) => number,
    r: (x: number) => number,
    a: number,
    b: number,
    alpha: number,
    beta: number,
    n: number,
  ) => {
    h: number;
    c: number;
    path: { x: number; y1: number; y2: number; y: number }[];
  };
  runFiniteDifference: (
    p: (x: number) => number,
    q: (x: number) => number,
    r: (x: number) => number,
    a: number,
    b: number,
    alpha: number,
    beta: number,
    n: number,
  ) => { h: number; grid: { i: number; x: number; w: number }[] };
};

export const Algorithms = (globalThis as { Algorithms?: AlgorithmsModule })
  .Algorithms as AlgorithmsModule;
