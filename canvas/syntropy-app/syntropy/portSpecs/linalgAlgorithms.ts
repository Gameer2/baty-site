// math-lab/assets/js/linalg-algorithms.js is the Linear Algebra Engine's pure, DOM-free core
// (see its own header comment) — shared between the browser pages and the Node verification
// suite. Imported here once, for its side effect, and read off the global the UMD wrapper sets —
// every linear-algebra port spec shares this one adapter instead of repeating the same
// import/@ts-ignore per file (see numericalAlgorithms.ts for the numerical-engine equivalent of
// this comment).
// @ts-ignore — linalg-algorithms.js lives outside canvas's rootDir (../../../../math-lab/...), so
// tsc would report TS6059 if it followed the import; ignoring the import keeps it out of tsc's
// program while Vite resolves it fine at runtime. It also self-requires algorithms.js under
// CommonJS, but under the UMD/global branch (which the browser bundle takes) it reads
// root.Algorithms instead — so algorithms.js must already be loaded onto globalThis first.
import "./numericalAlgorithms";

// This import must load after numericalAlgorithms above, which is what actually puts Algorithms
// on the global this file's own UMD wrapper reads synchronously at import time; the rule's
// preferred ordering would silently break that.
// @ts-ignore — see above.
// eslint-disable-next-line import/order
import "../../../../math-lab/assets/js/linalg-algorithms.js";

export type Complex = { re: number; im: number };

export type RrefResult = {
  R: number[][];
  pivots: number[];
  freeCols: number[];
  rank: number;
  swaps: number;
  steps: unknown[];
  stepsOmitted: boolean;
};

export type SolveSystemResult =
  | {
      type: "none";
      rank: number;
      augmentedRank: number;
      rref: number[][];
      pivots: number[];
      freeVars: number[];
      reason: string;
    }
  | {
      type: "unique";
      solution: number[];
      rank: number;
      augmentedRank: number;
      rref: number[][];
      pivots: number[];
      freeVars: number[];
    }
  | {
      type: "infinite";
      particular: number[];
      nullBasis: number[][];
      rank: number;
      augmentedRank: number;
      rref: number[][];
      pivots: number[];
      freeVars: number[];
      dimensionOfSolutionSet: number;
    };

export type IterativeSolveResult = {
  variant: string;
  omega: number;
  solution: number[];
  iterations: { n: number; x: number[]; change: number; residual: number }[];
  converged: boolean;
  diagonallyDominant: boolean;
  sweeps: number;
};

export type ConjugateGradientResult = {
  solution: number[];
  iterations: { n: number; x: number[]; alpha: number; residual: number }[];
  converged: boolean;
  steps: number;
  size: number;
};

export type EigenResult = {
  values: Complex[];
  real: number[];
  hasComplex: boolean;
  charPoly: number[] | null;
  method: "charpoly" | "qr";
};

export type DiagonalizeResult =
  | {
      diagonalizable: true;
      P: number[][];
      D: number[][];
      diag: number[];
      eigenpairs: {
        eigenvalue: number;
        eigenvectors: number[][];
        algebraicMultiplicity: number;
        geometricMultiplicity: number;
      }[];
      eigenvalues: Complex[];
    }
  | {
      diagonalizable: false;
      eigenpairs: {
        eigenvalue: number;
        eigenvectors: number[][];
        algebraicMultiplicity: number;
        geometricMultiplicity: number;
      }[];
      eigenvalues: Complex[];
      reason: string;
    };

export type SvdResult = {
  U: number[][];
  S: number[];
  V: number[][];
  singularValues: number[];
  rank: number;
  sweeps: number;
  conditionNumber: number;
};

export type SpectralResult = {
  Q: number[][];
  D: number[][];
  eigenvalues: number[];
  eigenspaces: {
    eigenvalue: number;
    multiplicity: number;
    vectors: number[][];
  }[];
  sweeps: number;
};

export type CholeskyResult = { L: number[][]; det: number };

export type LuResult = {
  L: number[][];
  U: number[][];
  P: number[][];
  perm: number[];
  swaps: number;
  det: number;
};

export type LeastSquaresResult = {
  solution: number[];
  viaQR: number[] | null;
  viaNormalEquations: number[] | null;
  fitted: number[];
  residualVector: number[];
  residualNorm: number;
  r2: number;
};

export type MarkovSteadyStateResult = {
  steadyState: number[];
  convention: "column-stochastic" | "row-stochastic";
  uniqueUpToScale: boolean;
  nullSpaceDimension: number;
};

export type MarkovEvolveResult = {
  history: { step: number; distribution: number[] }[];
  final: number[];
};

export type LinAlgModule = {
  clone: (A: number[][]) => number[][];
  identity: (n: number) => number[][];
  transpose: (A: number[][]) => number[][];
  rref: (A: number[][], tol?: number) => RrefResult;
  rank: (A: number[][], tol?: number) => number;
  solveSystem: (A: number[][], b: number[], tol?: number) => SolveSystemResult;
  nullSpaceBasis: (A: number[][], tol?: number) => number[][];
  columnSpaceBasis: (A: number[][], tol?: number) => number[][];
  rowSpaceBasis: (A: number[][], tol?: number) => number[][];
  rankNullity: (
    A: number[][],
    tol?: number,
  ) => { rank: number; nullity: number; cols: number; identityHolds: boolean };
  isLinearlyIndependent: (
    vectors: number[][],
    tol?: number,
  ) => {
    independent: boolean;
    rank: number;
    count: number;
    relations: number[][];
  };
  basisFromSpanningSet: (
    vectors: number[][],
    tol?: number,
  ) => { basis: number[][]; indices: number[]; dimension: number };
  inverse: (
    A: number[][],
    tol?: number,
  ) => {
    inverse: number[][];
    steps: unknown[];
    stepsOmitted: boolean;
    rank: number;
  };
  determinant: (A: number[][], tol?: number) => number;
  determinantCofactor: (A: number[][]) => number;
  luDecompose: (A: number[][], tol?: number) => LuResult;
  eigenvalues: (A: number[][], tol?: number) => EigenResult;
  eigenvectorsFor: (A: number[][], lambda: number, tol?: number) => number[][];
  diagonalize: (A: number[][], tol?: number) => DiagonalizeResult;
  jacobi: (
    A: number[][],
    b: number[],
    tol?: number,
    maxIter?: number,
    x0?: number[],
  ) => IterativeSolveResult;
  gaussSeidel: (
    A: number[][],
    b: number[],
    tol?: number,
    maxIter?: number,
    x0?: number[],
  ) => IterativeSolveResult;
  sor: (
    A: number[][],
    b: number[],
    omega: number,
    tol?: number,
    maxIter?: number,
    x0?: number[],
  ) => IterativeSolveResult;
  bestOmega: (
    A: number[][],
    b: number[],
    tol?: number,
    maxIter?: number,
  ) => {
    trials: { omega: number; sweeps: number; converged: boolean }[];
    best: { omega: number; sweeps: number; converged: boolean } | null;
  };
  gramSchmidt: (
    vectors: number[][],
    tol?: number,
  ) => { Q: number[][]; R: number[][] };
  qrDecompose: (
    A: number[][],
    tol?: number,
  ) => { Q: number[][]; R: number[][] };
  conjugateGradient: (
    A: number[][],
    b: number[],
    tol?: number,
    maxIter?: number,
    x0?: number[],
  ) => ConjugateGradientResult;
  markovSteadyState: (P: number[][], tol?: number) => MarkovSteadyStateResult;
  markovEvolve: (
    P: number[][],
    v0: number[],
    steps: number,
  ) => MarkovEvolveResult;
  svd: (A: number[][], tol?: number, maxSweeps?: number) => SvdResult;
  lowRankApproximation: (
    A: number[][],
    k: number,
    tol?: number,
  ) => {
    approximation: number[][];
    keptSingularValues: number[];
    frobeniusError: number;
  };
  leastSquares: (
    A: number[][],
    b: number[],
    tol?: number,
  ) => LeastSquaresResult;
  symmetricEigen: (
    A: number[][],
    tol?: number,
    maxSweeps?: number,
  ) => { values: number[]; vectors: number[][]; sweeps: number };
  spectralDecomposition: (A: number[][], tol?: number) => SpectralResult;
  cholesky: (A: number[][], tol?: number) => CholeskyResult;
  isPositiveDefinite: (A: number[][]) => boolean;
};

export const LinAlg = (globalThis as { LinAlg?: LinAlgModule })
  .LinAlg as LinAlgModule;
