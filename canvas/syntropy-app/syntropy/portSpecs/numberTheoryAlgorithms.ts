// math-lab/assets/js/number-theory.js is the Number Theory Engine's pure, DOM-free core (see its
// own header comment) — shared between the browser pages and the Node verification suite.
// Imported here once, for its side effect, and read off the global the UMD wrapper sets — every
// number-theory port spec shares this one adapter instead of repeating the same
// import/@ts-ignore per file (see numericalAlgorithms.ts for the numerical-engine equivalent of
// this comment).
// @ts-ignore — number-theory.js lives outside canvas's rootDir (../../../../math-lab/...), so tsc
// would report TS6059 if it followed the import; ignoring the import keeps it out of tsc's
// program while Vite resolves it fine at runtime.
import "../../../../math-lab/assets/js/number-theory.js";

export type DivideResult = { q: bigint; r: bigint };
export type EuclideanStepsResult = {
  ok: boolean;
  steps: { n: number; a: bigint; b: bigint; q: bigint; r: bigint }[];
  gcd: bigint;
  reason?: string;
};
export type ExtendedGcdResult = {
  gcd: bigint;
  x: bigint;
  y: bigint;
  steps: { n: number; r: bigint; q: bigint | null; s: bigint; t: bigint }[];
};
export type DiophantineResult =
  | {
      solvable: true;
      gcd: bigint;
      x0: bigint;
      y0: bigint;
      xStep: bigint;
      yStep: bigint;
    }
  | { solvable: true; gcd: bigint; everyPairSolves: true }
  | { solvable: false; gcd: bigint; reason: string };
export type PrimeCountResult = { pi: bigint; primes: bigint[] };
export type FactorizeResult = {
  ok: boolean;
  reason?: string;
  factors: { p: bigint; e: bigint; unfactored?: boolean }[];
  operations: number;
};
export type MillerRabinResult = {
  prime: boolean;
  witnesses?: { base: bigint; sequence: bigint[]; verdict: string }[];
  witness?: bigint;
  reason?: string;
};
export type SolveLinearCongruenceResult =
  | { solvable: false; gcd: bigint; reason: string }
  | {
      solvable: true;
      gcd: bigint;
      count: number;
      solutions: bigint[];
      x0?: bigint;
      modulusClass?: bigint;
    };
export type CrtResult =
  | { ok: true; x: bigint; modulus: bigint }
  | { ok: false; reason: string };
export type EulerTheoremCheckResult =
  | { applies: false; reason: string; phi?: bigint }
  | {
      applies: true;
      phi: bigint;
      value: bigint;
      equalsOne: boolean;
      equation: string;
    };
export type WilsonCheckResult = {
  prime: boolean;
  factorial: bigint;
  residue: bigint;
  note: string;
};
export type MultiplicativeOrderResult =
  | { ok: true; order: bigint; phi: bigint }
  | { ok: false; reason: string };
export type PrimitiveRootsResult =
  | { exists: false; reason: string }
  | {
      exists: true;
      generator: bigint;
      phi: bigint;
      roots: bigint[];
      count: number;
      powers: bigint[];
    };
export type DiscreteLogResult =
  | {
      ok: true;
      x: bigint;
      i: bigint;
      j: bigint;
      babySteps: bigint;
      giantSteps: bigint;
    }
  | { ok: false; reason: string };
export type RsaKeygenResult = {
  p: bigint;
  q: bigint;
  n: bigint;
  phi: bigint;
  e: bigint;
  d: bigint;
};
export type DiffieHellmanResult = {
  A: bigint;
  B: bigint;
  sharedA: bigint;
  sharedB: bigint;
  match: boolean;
};
export type ContinuedFractionSqrtResult =
  | { perfectSquare: true; a0: bigint; period: bigint[] }
  | { perfectSquare: false; a0: bigint; period: bigint[] };
export type PellSolveResult =
  | {
      solvable: true;
      x: bigint;
      y: bigint;
      termsUsed: number;
      periodLength: number;
    }
  | { solvable: false; reason: string };
export type FrobeniusResult =
  | { exists: true; frobenius: bigint }
  | { exists: false; reason: string };

export type NumberTheoryModule = {
  divide: (a: bigint, b: bigint) => DivideResult;
  gcd: (a: bigint, b: bigint) => bigint;
  euclideanSteps: (
    a: bigint,
    b: bigint,
    maxSteps?: number,
  ) => EuclideanStepsResult;
  extendedGcd: (a: bigint, b: bigint) => ExtendedGcdResult;
  modPow: (base: bigint, exp: bigint, mod: bigint) => bigint;
  modInverse: (a: bigint, m: bigint) => bigint | null;
  isqrt: (n: bigint) => bigint;
  solveLinearDiophantine: (
    a: bigint,
    b: bigint,
    c: bigint,
  ) => DiophantineResult;
  primesUpTo: (n: bigint) => bigint[];
  nextPrime: (n: bigint) => bigint;
  isPrimeTrial: (
    n: bigint,
    maxSteps?: number,
  ) => { prime: boolean | null; witness: bigint | null; reason?: string };
  factorize: (n: bigint, opts?: { maxOps?: number }) => FactorizeResult;
  factorizeFull: (n: bigint, opts?: { maxOps?: number }) => FactorizeResult;
  millerRabin: (n: bigint, bases?: bigint[]) => MillerRabinResult;
  primeCount: (x: bigint) => PrimeCountResult;
  mod: (a: bigint, n: bigint) => bigint;
  solveLinearCongruence: (
    a: bigint,
    b: bigint,
    n: bigint,
  ) => SolveLinearCongruenceResult;
  crt: (residues: bigint[], moduli: bigint[]) => CrtResult;
  eulerTheoremCheck: (a: bigint, n: bigint) => EulerTheoremCheckResult;
  wilsonCheck: (n: bigint) => WilsonCheckResult;
  totient: (n: bigint) => bigint;
  divisors: (n: bigint) => bigint[];
  tau: (n: bigint) => bigint;
  sigma: (n: bigint) => bigint;
  mobius: (n: bigint) => bigint;
  multiplicativeOrder: (a: bigint, n: bigint) => MultiplicativeOrderResult;
  hasPrimitiveRoot: (n: bigint) => boolean;
  primitiveRoots: (n: bigint) => PrimitiveRootsResult;
  discreteLog: (
    g: bigint,
    h: bigint,
    n: bigint,
    opts?: { maxSteps?: number },
  ) => DiscreteLogResult;
  legendreSymbol: (a: bigint, p: bigint) => bigint;
  jacobiSymbol: (a: bigint, n: bigint) => bigint;
  modPowTrace: (
    base: bigint,
    exp: bigint,
    mod: bigint,
  ) => { result: bigint; steps: unknown[]; binary: string };
  rsaKeygen: (p: bigint, q: bigint) => RsaKeygenResult;
  rsaEncrypt: (m: bigint, e: bigint, n: bigint) => bigint;
  rsaDecrypt: (c: bigint, d: bigint, n: bigint) => bigint;
  diffieHellman: (
    p: bigint,
    g: bigint,
    a: bigint,
    b: bigint,
  ) => DiffieHellmanResult;
  affineEncrypt: (text: string, a: bigint, b: bigint) => string;
  affineDecrypt: (text: string, a: bigint, b: bigint) => string;
  continuedFractionSqrt: (
    D: bigint,
    maxTerms?: number,
  ) => ContinuedFractionSqrtResult;
  pellSolve: (D: bigint, maxTerms?: number) => PellSolveResult;
  frobenius: (a: bigint, b: bigint) => FrobeniusResult;
};

export const NumberTheory = (
  globalThis as { NumberTheory?: NumberTheoryModule }
).NumberTheory as NumberTheoryModule;
