"use strict";
/* Linear Algebra Engine — verification suite.
   Runs the exact same code the pages ship (assets/js/linalg-algorithms.js) against
   known answers. Run with: node tests/verify-linalg.js

   Most cases here are *self-verifying*: instead of comparing against a constant computed
   elsewhere, they check a property that pins the answer down on its own — P*A = L*U,
   Q'Q = I, A*A^-1 = I, ||Av - lambda v|| = 0, rank + nullity = cols, sum of eigenvalues
   = trace. That removes the main way a numeric test can be wrong, namely a mistyped or
   mis-derived expected value. */

const path = require("path");
const LinAlg = require(path.join(__dirname, "..", "assets", "js", "linalg-algorithms.js"));
const Algorithms = require(path.join(__dirname, "..", "assets", "js", "algorithms.js"));

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

function check(condition, label, detail) {
  if (condition) {
    pass++;
    console.log(`  ok    ${label}${detail !== undefined ? `: ${detail}` : ""}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}${detail !== undefined ? `: ${detail}` : ""}`);
  }
  return condition;
}

function throws(fn, label) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  return check(threw, label);
}

// Largest absolute entry of (X - Y) — the residual norm every structural identity below
// is measured with.
function maxDiff(X, Y) {
  let m = 0;
  for (let i = 0; i < X.length; i++) for (let j = 0; j < X[i].length; j++) m = Math.max(m, Math.abs(X[i][j] - Y[i][j]));
  return m;
}
function maxAbs(v) { return Math.max(...v.map(Math.abs)); }

console.log("Linear Algebra Engine — verification suite\n");

/* ------------------------------------------------------------ 1. RREF */

// Rank-deficient matrix: all three rows are multiples of the first, so rank must be 1
// and the reduced form must be the first row followed by zero rows.
{
  const r = LinAlg.rref([[1, 2, -1], [2, 4, -2], [3, 6, -3]]);
  approx(r.rank, 1, 1e-12, "RREF: rank of a rank-1 matrix");
  check(JSON.stringify(r.R[0]) === "[1,2,-1]", "RREF: leading row is the normalized first row", JSON.stringify(r.R[0]));
  check(r.R[1].every((v) => v === 0) && r.R[2].every((v) => v === 0), "RREF: remaining rows are exactly zero");
  check(JSON.stringify(r.freeCols) === "[1,2]", "RREF: columns 2 and 3 are free", JSON.stringify(r.freeCols));
}

// Partial pivoting must handle a zero in the leading position rather than dividing by it.
{
  const r = LinAlg.rref([[0, 1], [1, 0]]);
  approx(r.rank, 2, 1e-12, "RREF: rank with a zero leading entry");
  check(maxDiff(r.R, LinAlg.identity(2)) < 1e-12, "RREF: [[0,1],[1,0]] reduces to the identity");
  check(r.steps.length > 0 && r.steps[0].type === "swap", "RREF: records the row swap as its first step", r.steps[0].description);
}

// RREF is idempotent — reducing an already-reduced matrix changes nothing.
{
  const once = LinAlg.rref([[2, 4, 6], [1, 3, 5], [0, 1, 2]]).R;
  const twice = LinAlg.rref(once).R;
  check(maxDiff(once, twice) < 1e-12, "RREF is idempotent (reducing twice = reducing once)");
}

/* -------------------------------------------- 2. Ax = b, all three cases */

// Unique solution: verified by substitution, not by a stored answer.
{
  const A = [[2, 1], [1, 3]], b = [3, 5];
  const s = LinAlg.solveSystem(A, b);
  check(s.type === "unique", "Ax=b: square nonsingular system is 'unique'", s.type);
  const residual = Algorithms.matVec(A, s.solution).map((v, i) => v - b[i]);
  approx(maxAbs(residual), 0, 1e-12, "Ax=b unique: ||Ax - b||");
}

// Infinitely many solutions: EVERY point of particular + t*null must satisfy the system.
// This is the case the engine could not reach before this module existed.
{
  const A = [[1, 2], [2, 4]], b = [3, 6];
  const s = LinAlg.solveSystem(A, b);
  check(s.type === "infinite", "Ax=b: dependent consistent system is 'infinite'", s.type);
  approx(s.nullBasis.length, 1, 1e-12, "Ax=b infinite: one free variable");
  approx(s.dimensionOfSolutionSet, 1, 1e-12, "Ax=b infinite: solution set is 1-dimensional");
  let worst = 0;
  for (const t of [0, 1, -2, 3.75, 100]) {
    const x = s.particular.map((p, i) => p + t * s.nullBasis[0][i]);
    worst = Math.max(worst, maxAbs(Algorithms.matVec(A, x).map((v, i) => v - b[i])));
  }
  approx(worst, 0, 1e-12, "Ax=b infinite: every point of the solution set satisfies Ax=b");
}

// Inconsistent system: must be reported as having no solution, with a reason.
{
  const s = LinAlg.solveSystem([[1, 2], [2, 4]], [3, 7]);
  check(s.type === "none", "Ax=b: inconsistent system is 'none'", s.type);
  check(typeof s.reason === "string" && s.reason.length > 0, "Ax=b none: explains which row is impossible", s.reason);
  check(s.augmentedRank > s.rank, "Ax=b none: rank([A|b]) > rank(A)", `${s.augmentedRank} > ${s.rank}`);
}

// Underdetermined system (more unknowns than equations) with two free variables.
{
  const A = [[1, 1, 1], [2, 2, 2], [3, 3, 3]], b = [1, 2, 3];
  const s = LinAlg.solveSystem(A, b);
  check(s.type === "infinite", "Ax=b: rank-1 3x3 system is 'infinite'");
  approx(s.nullBasis.length, 2, 1e-12, "Ax=b: rank-1 3x3 leaves 2 free variables");
  let worst = 0;
  for (const [s1, s2] of [[0, 0], [1, 0], [0, 1], [2, -3]]) {
    const x = s.particular.map((p, i) => p + s1 * s.nullBasis[0][i] + s2 * s.nullBasis[1][i]);
    worst = Math.max(worst, maxAbs(Algorithms.matVec(A, x).map((v, i) => v - b[i])));
  }
  approx(worst, 0, 1e-12, "Ax=b: 2-parameter solution family all satisfies Ax=b");
}

/* ---------------------------------------- 3. subspaces and rank-nullity */

{
  const A = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]; // classic singular 3x3, rank 2
  const ns = LinAlg.nullSpaceBasis(A);
  approx(ns.length, 1, 1e-12, "Null space: singular 3x3 has a 1-dimensional kernel");
  approx(maxAbs(Algorithms.matVec(A, ns[0])), 0, 1e-12, "Null space: A * (basis vector) = 0");

  const rn = LinAlg.rankNullity(A);
  check(rn.rank + rn.nullity === rn.cols, "Rank-nullity theorem: rank + nullity = columns", `${rn.rank} + ${rn.nullity} = ${rn.cols}`);

  const cs = LinAlg.columnSpaceBasis(A);
  approx(cs.length, rn.rank, 1e-12, "Column space: basis size equals the rank");
  // The column-space basis must consist of ACTUAL columns of A, not of its RREF.
  const originalCols = [0, 1, 2].map((j) => A.map((r) => r[j]));
  check(cs.every((c) => originalCols.some((oc) => maxAbs(oc.map((v, i) => v - c[i])) < 1e-12)),
    "Column space: basis vectors are original columns of A, not RREF columns");

  const rs = LinAlg.rowSpaceBasis(A);
  approx(rs.length, rn.rank, 1e-12, "Row space: basis size equals the rank");
  // Row rank = column rank, the theorem both of the above depend on.
  approx(LinAlg.rank(LinAlg.transpose(A)), rn.rank, 1e-12, "Row rank equals column rank");
}

/* ------------------------------- 4. independence, span, basis of a set */

{
  const ind = LinAlg.isLinearlyIndependent([[1, 0], [0, 1]]);
  check(ind.independent === true, "Independence: the standard basis is independent");

  const dep = LinAlg.isLinearlyIndependent([[1, 2], [2, 4]]);
  check(dep.independent === false, "Independence: [1,2] and [2,4] are dependent");
  // The reported dependency relation must actually produce the zero vector.
  const vs = [[1, 2], [2, 4]], rel = dep.relations[0];
  const combo = [0, 1].map((i) => vs[0][i] * rel[0] + vs[1][i] * rel[1]);
  approx(maxAbs(combo), 0, 1e-12, "Independence: the reported relation really sums to zero");

  const bs = LinAlg.basisFromSpanningSet([[1, 0], [2, 0], [0, 1]]);
  approx(bs.dimension, 2, 1e-12, "Basis from spanning set: dimension of the span");
  check(JSON.stringify(bs.indices) === "[0,2]", "Basis from spanning set: keeps original vectors 1 and 3", JSON.stringify(bs.indices));
}

/* ------------------------------------------------------- 5. inverse */

{
  const A = [[4, 7], [2, 6]];
  const inv = LinAlg.inverse(A).inverse;
  approx(maxDiff(Algorithms.matMul(A, inv), LinAlg.identity(2)), 0, 1e-12, "Inverse: A * A^-1 = I");
  approx(maxDiff(Algorithms.matMul(inv, A), LinAlg.identity(2)), 0, 1e-12, "Inverse: A^-1 * A = I");
}

// A 3x3 case, and the inverse-of-inverse identity.
{
  const A = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
  const inv = LinAlg.inverse(A).inverse;
  approx(maxDiff(Algorithms.matMul(A, inv), LinAlg.identity(3)), 0, 1e-12, "Inverse (3x3): A * A^-1 = I");
  approx(maxDiff(LinAlg.inverse(inv).inverse, A), 0, 1e-10, "Inverse: (A^-1)^-1 = A");
}

// Regression test: a singular matrix must throw. The first implementation tested the rank
// of the augmented [A | I] rather than of A, and [[1,2],[2,4]] reaches full augmented rank
// by taking a pivot in the identity half — so this silently returned a garbage "inverse".
throws(() => LinAlg.inverse([[1, 2], [2, 4]]), "Inverse: singular matrix throws (augmented-rank regression)");
throws(() => LinAlg.inverse([[1, 2, 3], [4, 5, 6]]), "Inverse: non-square matrix throws");

/* --------------------------------------------------- 6. determinant */

{
  approx(LinAlg.determinant([[4, 7], [2, 6]]), 10, 1e-12, "Determinant: 2x2 by hand (4*6 - 7*2)");
  approx(LinAlg.determinant([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), 0, 1e-9, "Determinant: singular 3x3 is 0");
  approx(LinAlg.determinant(LinAlg.identity(5)), 1, 1e-12, "Determinant: det(I) = 1");

  // The O(n^3) elimination determinant and the O(n!) cofactor expansion must agree — two
  // independent algorithms, so neither needs a looked-up expected value.
  const T = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
  approx(LinAlg.determinant(T), LinAlg.determinantCofactor(T), 1e-10, "Determinant: elimination agrees with cofactor expansion");
  const G = [[2, 1, 1, 0], [4, -6, 0, 3], [-2, 7, 2, 1], [1, 1, 1, 1]];
  approx(LinAlg.determinant(G), LinAlg.determinantCofactor(G), 1e-9, "Determinant (4x4): elimination agrees with cofactor expansion");

  // det(AB) = det(A)det(B), a property no single implementation can fake.
  const A1 = [[1, 2], [3, 4]], B1 = [[0, 1], [5, 6]];
  approx(LinAlg.determinant(Algorithms.matMul(A1, B1)), LinAlg.determinant(A1) * LinAlg.determinant(B1), 1e-10, "Determinant: det(AB) = det(A)det(B)");
}

/* ---------------------------------------------------------- 7. LU */

{
  const A = [[2, 1, 1], [4, -6, 0], [-2, 7, 2]];
  const { L, U, P, det } = LinAlg.luDecompose(A);
  approx(maxDiff(Algorithms.matMul(P, A), Algorithms.matMul(L, U)), 0, 1e-12, "LU: P*A = L*U");
  check(L.every((r, i) => r[i] === 1), "LU: L is unit lower-triangular (ones on the diagonal)");
  check(L.every((r, i) => r.every((v, j) => j <= i || v === 0)), "LU: L has zeros above the diagonal");
  check(U.every((r, i) => r.every((v, j) => j >= i || Math.abs(v) < 1e-12)), "LU: U has zeros below the diagonal");
  approx(det, LinAlg.determinant(A), 1e-10, "LU: det from the U diagonal matches elimination");
}

throws(() => LinAlg.luDecompose([[1, 2], [2, 4]]), "LU: singular matrix throws");

/* -------------------------------------- 8. eigenvalues & eigenvectors */

{
  const S = [[4, -2, 1], [-2, 4, -2], [1, -2, 4]]; // symmetric
  const e = LinAlg.eigenvalues(S);
  check(!e.hasComplex, "Eigenvalues: a symmetric matrix has only real eigenvalues", e.real.map((v) => v.toFixed(6)).join(", "));
  approx(e.real.length, 3, 1e-12, "Eigenvalues: 3x3 gives three real eigenvalues");

  // Two invariants that pin the eigenvalues down without any looked-up constant.
  const trace = S[0][0] + S[1][1] + S[2][2];
  approx(e.real.reduce((a, c) => a + c, 0), trace, 1e-8, "Eigenvalues: sum equals the trace");
  approx(e.real.reduce((a, c) => a * c, 1), LinAlg.determinant(S), 1e-7, "Eigenvalues: product equals the determinant");

  // The defining property itself.
  let worst = 0;
  for (const lambda of e.real) {
    for (const v of LinAlg.eigenvectorsFor(S, lambda)) {
      const Av = Algorithms.matVec(S, v);
      worst = Math.max(worst, maxAbs(Av.map((y, i) => y - lambda * v[i])));
    }
  }
  approx(worst, 0, 1e-6, "Eigenvectors: ||A v - lambda v|| = 0 for every eigenpair");
}

// Characteristic polynomial, checked against a hand-computable case:
// det(A - xI) for diag(2,3) is (2-x)(3-x) = 6 - 5x + x^2.
{
  const p = LinAlg.charPoly([[2, 0], [0, 3]]);
  approx(p[0], 6, 1e-12, "Characteristic polynomial: constant term");
  approx(p[1], -5, 1e-12, "Characteristic polynomial: x coefficient");
  approx(p[2], 1, 1e-12, "Characteristic polynomial: x^2 coefficient");
}

// Cayley-Hamilton: a matrix satisfies its own characteristic polynomial, p(A) = 0.
{
  const A = [[1, 2], [3, 4]];
  const p = LinAlg.charPoly(A);
  let acc = p.reduce((m, _, k) => m, null);
  // Evaluate p(A) = sum_k p[k] * A^k
  let power = LinAlg.identity(2);
  acc = [[0, 0], [0, 0]];
  for (let k = 0; k < p.length; k++) {
    acc = acc.map((r, i) => r.map((v, j) => v + p[k] * power[i][j]));
    power = Algorithms.matMul(power, A);
  }
  approx(maxDiff(acc, [[0, 0], [0, 0]]), 0, 1e-10, "Cayley-Hamilton: p(A) = 0");
}

// A rotation matrix has a genuinely complex conjugate pair — the case a real-only
// eigenvalue routine would silently get wrong.
{
  const e = LinAlg.eigenvalues([[0, -1], [1, 0]]);
  check(e.hasComplex, "Eigenvalues: rotation matrix is detected as complex",
    e.values.map((z) => `${z.re.toFixed(3)}${z.im >= 0 ? "+" : ""}${z.im.toFixed(3)}i`).join(", "));
  approx(Math.abs(e.values[0].im), 1, 1e-8, "Eigenvalues: rotation eigenvalues are ±i");
  approx(e.values[0].re, 0, 1e-8, "Eigenvalues: rotation eigenvalues have zero real part");
}

/* --------------------------------------------------- 9. diagonalization */

{
  const S = [[4, -2, 1], [-2, 4, -2], [1, -2, 4]];
  const d = LinAlg.diagonalize(S);
  check(d.diagonalizable, "Diagonalization: symmetric matrix is diagonalizable");
  const PDPinv = Algorithms.matMul(Algorithms.matMul(d.P, d.D), LinAlg.inverse(d.P).inverse);
  approx(maxDiff(PDPinv, S), 0, 1e-6, "Diagonalization: A = P D P^-1");
}

// Defective matrix: repeated eigenvalue with only one eigenvector. Regression test — the
// first version of polynomialRoots left ~1e-8 of imaginary residue on a double real root,
// so this reported "complex eigenvalues" instead of the true reason (deficient eigenspace).
{
  const d = LinAlg.diagonalize([[2, 1], [0, 2]]);
  check(!d.diagonalizable, "Diagonalization: defective matrix is not diagonalizable");
  check(/defective|multiplicity/i.test(d.reason), "Diagonalization: reason cites multiplicity, not 'complex'", d.reason);
  const pair = d.eigenpairs[0];
  approx(pair.eigenvalue, 2, 1e-7, "Defective matrix: repeated eigenvalue is 2");
  approx(pair.algebraicMultiplicity, 2, 1e-12, "Defective matrix: algebraic multiplicity 2");
  approx(pair.geometricMultiplicity, 1, 1e-12, "Defective matrix: geometric multiplicity 1");
}

// A matrix with distinct real eigenvalues is always diagonalizable.
{
  const d = LinAlg.diagonalize([[1, 2], [0, 3]]);
  check(d.diagonalizable, "Diagonalization: distinct eigenvalues => diagonalizable");
  const PDPinv = Algorithms.matMul(Algorithms.matMul(d.P, d.D), LinAlg.inverse(d.P).inverse);
  approx(maxDiff(PDPinv, [[1, 2], [0, 3]]), 0, 1e-9, "Diagonalization (triangular): A = P D P^-1");
}

/* ------------------------------------------ 10. Gram-Schmidt and QR */

{
  const vs = [[1, 1, 0], [1, 0, 1], [0, 1, 1]];
  const { Q } = LinAlg.gramSchmidt(vs);
  let worst = 0;
  for (let i = 0; i < Q.length; i++) {
    for (let j = 0; j < Q.length; j++) {
      const dot = Q[i].reduce((s, v, k) => s + v * Q[j][k], 0);
      worst = Math.max(worst, Math.abs(dot - (i === j ? 1 : 0)));
    }
  }
  approx(worst, 0, 1e-12, "Gram-Schmidt: <qi, qj> = delta_ij (orthonormal)");
}

{
  const A = [[1, 1, 0], [1, 0, 1], [0, 1, 1]];
  const { Q, R } = LinAlg.qrDecompose(A);
  approx(maxDiff(Algorithms.matMul(Q, R), A), 0, 1e-12, "QR: A = Q*R");
  const Qt = LinAlg.transpose(Q);
  approx(maxDiff(Algorithms.matMul(Qt, Q), LinAlg.identity(3)), 0, 1e-12, "QR: Q'Q = I");
  check(R.every((r, i) => r.every((v, j) => j >= i || Math.abs(v) < 1e-12)), "QR: R is upper triangular");
}

// Orthogonality must survive an ill-conditioned set. Both LinAlg.gramSchmidt and
// Algorithms.qrDecompose now run the same modified process (LinAlg delegates, adding only
// the step trace), so they must agree AND both stay orthogonal. This case previously
// asserted that the modified version beat the classical one, which it did by seven orders
// of magnitude (1.6e-9 vs 1.3e-2) — that gap is gone now the shared implementation is the
// modified one, so the meaningful check is that neither path drifts.
{
  const eps = 1e-7;
  const A = [[1, 1, 1], [eps, 0, 0], [0, eps, 0], [0, 0, eps]];
  const cols = [0, 1, 2].map((j) => A.map((r) => r[j]));
  const orthLoss = (Qc) => {
    let w = 0;
    for (let i = 0; i < Qc.length; i++) for (let j = i + 1; j < Qc.length; j++) {
      w = Math.max(w, Math.abs(Qc[i].reduce((s, v, k) => s + v * Qc[j][k], 0)));
    }
    return w;
  };
  const viaLinAlg = orthLoss(LinAlg.gramSchmidt(cols).Q);
  const viaAlgorithms = orthLoss(Algorithms.qrDecompose(A).Q[0].map((_, j) => Algorithms.qrDecompose(A).Q.map((r) => r[j])));
  approx(viaLinAlg, 0, 1e-7, "Ill-conditioned Gram-Schmidt: LinAlg path stays orthogonal");
  approx(viaAlgorithms, 0, 1e-7, "Ill-conditioned Gram-Schmidt: Algorithms path stays orthogonal");
  approx(viaLinAlg, viaAlgorithms, 1e-15, "Both Gram-Schmidt entry points give identical orthogonality (one shared implementation)");
}

// LinAlg.gramSchmidt must still return the per-projection trace the pages step through,
// even though the mathematics now lives in Algorithms.gramSchmidt.
{
  const g = LinAlg.gramSchmidt([[1, 1, 0], [1, 0, 1], [0, 1, 1]]);
  check(g.steps.length > 0, "Gram-Schmidt: step trace still recorded after delegating", `${g.steps.length} steps`);
  check(Algorithms.gramSchmidt([[1, 1, 0], [1, 0, 1], [0, 1, 1]]).steps.length === 0,
    "Gram-Schmidt: steps are opt-in (plain call records none)");
}

throws(() => LinAlg.gramSchmidt([[1, 2], [2, 4]]), "Gram-Schmidt: dependent input throws");

/* -------------------------------------------------- input validation */

throws(() => LinAlg.rref([]), "Validation: empty matrix throws");
throws(() => LinAlg.rref([[1, 2], [3]]), "Validation: ragged rows throw");
throws(() => LinAlg.rref([[1, NaN]]), "Validation: non-finite entry throws");
throws(() => LinAlg.solveSystem([[1, 2], [3, 4]], [1]), "Validation: wrong right-hand-side length throws");
throws(() => LinAlg.determinant([[1, 2, 3], [4, 5, 6]]), "Validation: determinant of a non-square matrix throws");
throws(() => LinAlg.charPoly([[1, 2, 3], [4, 5, 6]]), "Validation: characteristic polynomial of a non-square matrix throws");

/* ------------------------------------ large matrices (n beyond the grid) */

// Deterministic test matrices, so a failure here is reproducible.
function seeded(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return (s / 2147483648) * 2 - 1; }; }
function randomMatrix(n, seed) { const r = seeded(seed); return Array.from({ length: n }, () => Array.from({ length: n }, () => +(r() * 5).toFixed(2))); }
function randomSymmetric(n, seed) {
  const M = randomMatrix(n, seed);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) M[i][j] = M[j][i];
  for (let i = 0; i < n; i++) M[i][i] += n; // keep it well separated
  return M;
}

// Hessenberg reduction preserves eigenvalues (same trace and determinant) and really is
// zero below the first subdiagonal.
{
  const A = randomMatrix(8, 99);
  const H = LinAlg.hessenberg(A);
  let trA = 0, trH = 0;
  for (let i = 0; i < 8; i++) { trA += A[i][i]; trH += H[i][i]; }
  approx(trH, trA, 1e-10, "Hessenberg: trace is preserved");
  approx(LinAlg.determinant(H), LinAlg.determinant(A), 1e-6 * Math.max(1, Math.abs(LinAlg.determinant(A))), "Hessenberg: determinant is preserved");
  let belowSub = 0;
  for (let i = 2; i < 8; i++) for (let j = 0; j < i - 1; j++) belowSub = Math.max(belowSub, Math.abs(H[i][j]));
  approx(belowSub, 0, 1e-12, "Hessenberg: entries below the first subdiagonal are zero");
}

// Regression: the characteristic-polynomial route returned NaN from about n = 15 (its
// coefficients overflow a double and its roots are ill-conditioned in them). LinAlg.eigenvalues
// must now switch to shifted QR and stay accurate. Checked against the trace invariant.
{
  for (const n of [15, 20, 30]) {
    const M = randomSymmetric(n, 7 * n + 1);
    let trace = 0;
    for (let i = 0; i < n; i++) trace += M[i][i];
    const e = LinAlg.eigenvalues(M);
    check(e.values.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im)), `Large eigenvalues (n=${n}): all values finite (NaN regression)`);
    check(e.method === "qr", `Large eigenvalues (n=${n}): switched to shifted QR`, e.method);
    approx(e.values.reduce((s, z) => s + z.re, 0), trace, 1e-6 * Math.abs(trace), `Large eigenvalues (n=${n}): sum equals the trace`);
    approx(e.values.length, n, 1e-12, `Large eigenvalues (n=${n}): found n eigenvalues`);
  }
}

// A symmetric matrix has real eigenvalues at any size, and its eigenvectors must still
// satisfy the defining equation when found through the QR route.
{
  const n = 20;
  const M = randomSymmetric(n, 4242);
  const e = LinAlg.eigenvalues(M);
  check(!e.hasComplex, "Large symmetric (n=20): all eigenvalues real");
  let worst = 0;
  for (const lambda of e.real.slice(0, 5)) {
    for (const v of LinAlg.eigenvectorsFor(M, lambda)) {
      const Av = Algorithms.matVec(M, v);
      worst = Math.max(worst, maxAbs(Av.map((y, i) => y - lambda * v[i])));
    }
  }
  approx(worst, 0, 1e-6, "Large symmetric (n=20): ||A v - lambda v|| = 0");
}

// Complex eigenvalues must survive the large-n route too: a block-diagonal matrix built
// from rotation blocks has a known, exactly-complex spectrum.
{
  const n = 16;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < n; k += 2) { M[k][k + 1] = -1; M[k + 1][k] = 1; }
  const e = LinAlg.eigenvalues(M);
  check(e.hasComplex, "Large rotation blocks (n=16): complex pairs detected");
  approx(e.values.filter((z) => z.im !== 0).length, n, 1e-12, "Large rotation blocks: every eigenvalue is complex");
  approx(Math.max(...e.values.map((z) => Math.abs(Math.hypot(z.re, z.im) - 1))), 0, 1e-8, "Large rotation blocks: every eigenvalue lies on the unit circle");
}

// Row reduction, determinant, inverse and rank must all stay correct at a size the grid
// UI never shows — verified structurally, not against stored numbers.
{
  const n = 30;
  const A = randomMatrix(n, 31337);
  const inv = LinAlg.inverse(A).inverse;
  approx(maxDiff(Algorithms.matMul(A, inv), LinAlg.identity(n)), 0, 1e-6, "Large inverse (n=30): A * A^-1 = I");
  const { L, U, P } = LinAlg.luDecompose(A);
  approx(maxDiff(Algorithms.matMul(P, A), Algorithms.matMul(L, U)), 0, 1e-9, "Large LU (n=30): P*A = L*U");
  approx(LinAlg.rank(LinAlg.identity(n)), n, 1e-12, "Large rank (n=30): identity has full rank");
  const b = Array.from({ length: n }, (_, i) => i + 1);
  const sol = LinAlg.solveSystem(A, b);
  check(sol.type === "unique", "Large system (n=30): nonsingular system is unique");
  approx(maxAbs(Algorithms.matVec(A, sol.solution).map((v, i) => v - b[i])), 0, 1e-8, "Large system (n=30): ||Ax - b|| = 0");
}

// The step log is O(n^4) in memory, so it is dropped above 12x12 — but the arithmetic must
// be unaffected, and the caller must be told the log was skipped.
{
  const small = LinAlg.rref(randomMatrix(5, 11));
  check(small.steps.length > 0 && small.stepsOmitted === false, "Step log: kept for a small matrix", `${small.steps.length} steps`);
  const big = LinAlg.rref(randomMatrix(30, 11));
  check(big.steps.length === 0 && big.stepsOmitted === true, "Step log: omitted for a 30x30");
  // Same answer either way.
  const forced = LinAlg.rref(randomMatrix(5, 11), undefined, { recordSteps: false });
  approx(maxDiff(forced.R, small.R), 0, 1e-15, "Step log: omitting steps does not change the result");
  approx(forced.rank, small.rank, 1e-12, "Step log: omitting steps does not change the rank");
}

/* ---------------------------- iterative solvers (Jacobi / Gauss-Seidel) ---- */

// Both iterations must land on the same answer direct elimination gives — three
// independent routes to one solution, so no stored constant is needed.
{
  const A = [[4, -1, 0], [-1, 4, -1], [0, -1, 4]], b = [15, 10, 10];
  const exact = LinAlg.solveSystem(A, b).solution;
  const j = LinAlg.jacobi(A, b, 1e-12, 500);
  const g = LinAlg.gaussSeidel(A, b, 1e-12, 500);
  check(j.converged, "Jacobi converges on a diagonally dominant system", `${j.sweeps} sweeps`);
  check(g.converged, "Gauss-Seidel converges on a diagonally dominant system", `${g.sweeps} sweeps`);
  approx(maxAbs(j.solution.map((v, i) => v - exact[i])), 0, 1e-9, "Jacobi agrees with direct elimination");
  approx(maxAbs(g.solution.map((v, i) => v - exact[i])), 0, 1e-9, "Gauss-Seidel agrees with direct elimination");
  approx(maxAbs(Algorithms.matVec(A, g.solution).map((v, i) => v - b[i])), 0, 1e-9, "Gauss-Seidel: ||Ax - b|| = 0");
  // Gauss-Seidel reuses this sweep's updates, so it should need meaningfully fewer sweeps.
  check(g.sweeps < j.sweeps, "Gauss-Seidel needs fewer sweeps than Jacobi", `${g.sweeps} < ${j.sweeps}`);
  check(j.diagonallyDominant === true, "Diagonal dominance detected on a dominant matrix");
}

// The residual must fall monotonically on a dominant system — that is what "converging"
// means, and a sign error in the update would still reach a fixed point without it.
{
  const A = [[10, -1, 2], [-1, 11, -1], [2, -1, 10]], b = [6, 25, -11];
  const g = LinAlg.gaussSeidel(A, b, 1e-12, 500);
  let increases = 0;
  for (let i = 1; i < g.iterations.length; i++) {
    if (g.iterations[i].residual > g.iterations[i - 1].residual * 1.000001) increases++;
  }
  approx(increases, 0, 0.5, "Gauss-Seidel residual decreases every sweep");
  approx(maxAbs(Algorithms.matVec(A, g.solution).map((v, i) => v - b[i])), 0, 1e-9, "Gauss-Seidel solves a second dominant system");
}

// A non-dominant matrix must be reported as such rather than silently promised to converge.
{
  const r = LinAlg.jacobi([[1, 3], [2, 1]], [1, 1], 1e-10, 20);
  check(r.diagonallyDominant === false, "Non-dominant matrix is flagged");
}

// A zero on the diagonal divides by zero — it must throw, naming the row.
throws(() => LinAlg.jacobi([[0, 1], [1, 0]], [1, 1]), "Iterative solver: zero diagonal throws");
throws(() => LinAlg.gaussSeidel([[1, 2, 3], [4, 5, 6]], [1, 2]), "Iterative solver: non-square throws");
throws(() => LinAlg.jacobi([[4, 1], [1, 4]], [1]), "Iterative solver: wrong b length throws");

// Both iterations must also work at a size the direct solver handles, on a dominant system.
{
  const n = 25;
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 4 * n : (Math.abs(i - j) === 1 ? -1 : 0))));
  const b = Array.from({ length: n }, (_, i) => i + 1);
  const g = LinAlg.gaussSeidel(A, b, 1e-12, 500);
  check(g.converged, "Gauss-Seidel converges at n=25", `${g.sweeps} sweeps`);
  approx(maxAbs(Algorithms.matVec(A, g.solution).map((v, i) => v - b[i])), 0, 1e-8, "Gauss-Seidel at n=25: ||Ax - b|| = 0");
}

/* ---------------------------------------------------------------- SVD */

// A = U diag(S) V^T with U and V orthonormal — three properties that pin the whole
// factorisation down without a single stored constant.
{
  const A = [[3, 0], [4, 5]];
  const { U, S, V, rank } = LinAlg.svd(A);
  const D = S.map((s, i) => S.map((_, j) => (i === j ? s : 0)));
  approx(maxDiff(Algorithms.matMul(Algorithms.matMul(U, D), LinAlg.transpose(V)), A), 0, 1e-12, "SVD: U diag(S) V^T = A");
  approx(maxDiff(Algorithms.matMul(LinAlg.transpose(U), U), LinAlg.identity(2)), 0, 1e-12, "SVD: U^T U = I");
  approx(maxDiff(Algorithms.matMul(LinAlg.transpose(V), V), LinAlg.identity(2)), 0, 1e-12, "SVD: V^T V = I");
  check(S[0] >= S[1] && S[1] >= 0, "SVD: singular values are sorted and non-negative", S.map((v) => v.toFixed(6)).join(", "));
  approx(rank, 2, 1e-12, "SVD: full-rank matrix reports rank 2");
  // sigma_i^2 must be the eigenvalues of A^T A — the textbook characterisation.
  const eig = LinAlg.eigenvalues(Algorithms.matMul(LinAlg.transpose(A), A)).real.sort((a, b) => b - a);
  approx(Math.sqrt(eig[0]), S[0], 1e-9, "SVD: largest sigma = sqrt of largest eigenvalue of A^T A");
  approx(Math.sqrt(eig[1]), S[1], 1e-9, "SVD: second sigma = sqrt of second eigenvalue of A^T A");
}

// The reason this uses one-sided Jacobi rather than eigen-decomposing A^T A: forming A^T A
// squares the condition number, so a singular value of 1e-8 would be lost entirely
// (1e-16 is at the edge of double precision). This route keeps it exactly.
{
  const A = [[1, 0], [0, 1e-8]];
  const { S } = LinAlg.svd(A);
  approx(S[0], 1, 1e-12, "SVD ill-conditioned: largest singular value");
  approx(S[1], 1e-8, 1e-16, "SVD ill-conditioned: smallest singular value survives (A^T A route would lose it)");
}

// Non-square and rank-deficient cases.
{
  const A = [[1, 2], [3, 4], [5, 6]]; // 3x2, full column rank
  const { U, S, V } = LinAlg.svd(A);
  const D = S.map((s, i) => S.map((_, j) => (i === j ? s : 0)));
  approx(maxDiff(Algorithms.matMul(Algorithms.matMul(U, D), LinAlg.transpose(V)), A), 0, 1e-12, "SVD (3x2): reconstructs A");
  approx(LinAlg.svd([[1, 2], [2, 4]]).rank, 1, 1e-12, "SVD: rank-deficient matrix reports rank 1");
  approx(LinAlg.svd([[1, 2], [2, 4]]).S[1], 0, 1e-12, "SVD: the redundant singular value is exactly 0");
  // rank from the SVD must agree with rank from row reduction.
  approx(LinAlg.svd([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).rank, LinAlg.rank([[1, 2, 3], [4, 5, 6], [7, 8, 9]]), 1e-12,
    "SVD rank agrees with row-reduction rank");
}

// Eckart-Young: the rank-k truncation is the best rank-k approximation, and the Frobenius
// error it leaves is exactly the root-sum-square of the discarded singular values.
{
  const A = [[4, 0, 0], [0, 3, 0], [0, 0, 1]];
  const { approximation, frobeniusError } = LinAlg.lowRankApproximation(A, 2);
  approx(frobeniusError, 1, 1e-10, "Low-rank: Frobenius error = the discarded singular value");
  let actual = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) actual += (approximation[i][j] - A[i][j]) ** 2;
  approx(Math.sqrt(actual), frobeniusError, 1e-9, "Low-rank: reported error matches the actual error");
  approx(LinAlg.rank(approximation), 2, 1e-12, "Low-rank: the approximation really has rank 2");
  approx(maxDiff(LinAlg.lowRankApproximation(A, 3).approximation, A), 0, 1e-12, "Low-rank: keeping every singular value returns A");
}

/* ------------------------------------------------------- least squares */

// An exact fit must be reproduced exactly, and both routes must agree.
{
  const A = [[1, 0], [1, 1], [1, 2], [1, 3]], b = [1, 3, 5, 7]; // y = 1 + 2x
  const ls = LinAlg.leastSquares(A, b);
  approx(ls.solution[0], 1, 1e-9, "Least squares: intercept");
  approx(ls.solution[1], 2, 1e-9, "Least squares: slope");
  approx(ls.residualNorm, 0, 1e-9, "Least squares: exact fit leaves zero residual");
  approx(ls.r2, 1, 1e-12, "Least squares: R^2 = 1 on an exact fit");
  approx(maxAbs(ls.viaQR.map((v, i) => v - ls.viaNormalEquations[i])), 0, 1e-9, "Least squares: QR and normal equations agree");
}

// The defining property: the residual must be orthogonal to every column of A. That is what
// "least squares" means, and it holds whether or not the fit is exact.
{
  const A = [[1, 0], [1, 1], [1, 2], [1, 3]], b = [1, 3, 4, 8]; // deliberately not collinear
  const ls = LinAlg.leastSquares(A, b);
  let worst = 0;
  for (let j = 0; j < 2; j++) {
    let dot = 0;
    for (let i = 0; i < 4; i++) dot += A[i][j] * ls.residualVector[i];
    worst = Math.max(worst, Math.abs(dot));
  }
  approx(worst, 0, 1e-9, "Least squares: residual is orthogonal to every column of A");
  check(ls.residualNorm > 0, "Least squares: an inexact fit leaves a nonzero residual", ls.residualNorm.toFixed(6));
}

// It must reproduce the Numerical Engine's own least-squares routine on the same data —
// two independently written implementations agreeing.
{
  const pts = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }];
  const viaNumerical = Algorithms.runDiscreteLeastSquares(pts, 1).coeffs;
  const viaLinAlg = LinAlg.leastSquares(pts.map((p) => [1, p.x]), pts.map((p) => p.y)).solution;
  approx(viaLinAlg[0], viaNumerical[0], 1e-9, "Least squares agrees with Algorithms.runDiscreteLeastSquares (intercept)");
  approx(viaLinAlg[1], viaNumerical[1], 1e-9, "Least squares agrees with Algorithms.runDiscreteLeastSquares (slope)");
}

throws(() => LinAlg.leastSquares([[1, 0], [1, 1]], [1, 2, 3]), "Least squares: wrong b length throws");
throws(() => LinAlg.leastSquares([[1, 2, 3]], [1]), "Least squares: fewer rows than columns throws");

/* ---------------------------------------------------- spectral theorem */

{
  const A = [[4, -2, 1], [-2, 4, -2], [1, -2, 4]];
  const { Q, D } = LinAlg.spectralDecomposition(A);
  approx(maxDiff(Algorithms.matMul(Algorithms.matMul(Q, D), LinAlg.transpose(Q)), A), 0, 1e-9, "Spectral: Q D Q^T = A");
  approx(maxDiff(Algorithms.matMul(LinAlg.transpose(Q), Q), LinAlg.identity(3)), 0, 1e-12, "Spectral: Q is orthogonal (Q^T Q = I)");
  // For an orthogonal Q the inverse is the transpose, so this must match diagonalisation.
  const d = LinAlg.diagonalize(A);
  const specEigs = D.map((r, i) => r[i]).sort((a, b) => a - b);
  const diagEigs = d.D.map((r, i) => r[i]).sort((a, b) => a - b);
  approx(maxAbs(specEigs.map((v, i) => v - diagEigs[i])), 0, 1e-6, "Spectral eigenvalues match diagonalize()");
}

// A repeated eigenvalue must still produce an orthonormal basis for its eigenspace.
{
  const A = [[2, 0, 0], [0, 3, 0], [0, 0, 3]]; // eigenvalue 3 has multiplicity 2
  const { Q, D } = LinAlg.spectralDecomposition(A);
  approx(maxDiff(Algorithms.matMul(LinAlg.transpose(Q), Q), LinAlg.identity(3)), 0, 1e-12, "Spectral: orthonormal even with a repeated eigenvalue");
  approx(maxDiff(Algorithms.matMul(Algorithms.matMul(Q, D), LinAlg.transpose(Q)), A), 0, 1e-9, "Spectral: reconstructs a matrix with a repeated eigenvalue");
}

throws(() => LinAlg.spectralDecomposition([[1, 2], [3, 4]]), "Spectral: non-symmetric matrix throws");

/* ---------------------------------------------------------- Cholesky */

{
  const A = [[4, 2, -2], [2, 10, 2], [-2, 2, 5]];
  const { L, det } = LinAlg.cholesky(A);
  approx(maxDiff(Algorithms.matMul(L, LinAlg.transpose(L)), A), 0, 1e-12, "Cholesky: L L^T = A");
  check(L.every((r, i) => r.every((v, j) => j <= i || v === 0)), "Cholesky: L is lower-triangular");
  approx(det, LinAlg.determinant(A), 1e-8, "Cholesky: det from the diagonal matches elimination");
  check(LinAlg.isPositiveDefinite(A) === true, "Cholesky: positive-definite matrix detected");
}

// A symmetric matrix that is NOT positive definite must be reported, not factorised.
throws(() => LinAlg.cholesky([[1, 2], [2, 1]]), "Cholesky: non-positive-definite matrix throws");
throws(() => LinAlg.cholesky([[1, 2], [3, 4]]), "Cholesky: non-symmetric matrix throws");
check(LinAlg.isPositiveDefinite([[1, 2], [2, 1]]) === false, "isPositiveDefinite: rejects an indefinite matrix");

/* ------------------------------------------------------ SOR and CG */

// SOR with omega = 1 IS Gauss-Seidel — identical sweep count and identical answer. This
// caught a real bug: SOR was reading the previous sweep's values (Jacobi-style), which made
// omega = 1 take Jacobi's 29 sweeps instead of Gauss-Seidel's 16, and made omega > 1 diverge.
{
  const A = [[4, -1, 0], [-1, 4, -1], [0, -1, 4]], b = [15, 10, 10];
  const gs = LinAlg.gaussSeidel(A, b, 1e-12, 500);
  const sor1 = LinAlg.sor(A, b, 1, 1e-12, 500);
  approx(sor1.sweeps, gs.sweeps, 0.5, "SOR with omega = 1 takes exactly Gauss-Seidel's sweep count");
  approx(maxAbs(sor1.solution.map((v, i) => v - gs.solution[i])), 0, 1e-14, "SOR with omega = 1 gives exactly Gauss-Seidel's answer");
  // Over-relaxation should beat it on this system.
  const best = LinAlg.bestOmega(A, b);
  check(best.best && best.best.sweeps <= gs.sweeps, "SOR: a tuned omega is at least as fast as Gauss-Seidel",
    `omega ${best.best.omega} in ${best.best.sweeps} sweeps`);
  const exact = LinAlg.solveSystem(A, b).solution;
  approx(maxAbs(LinAlg.sor(A, b, 1.1, 1e-12, 500).solution.map((v, i) => v - exact[i])), 0, 1e-9, "SOR (omega=1.1) agrees with direct elimination");
}

throws(() => LinAlg.sor([[4, 1], [1, 4]], [1, 1], 0), "SOR: omega = 0 throws (guaranteed divergence)");
throws(() => LinAlg.sor([[4, 1], [1, 4]], [1, 1], 2), "SOR: omega = 2 throws (guaranteed divergence)");

// Conjugate gradient must reach the exact answer within n steps on an SPD system.
{
  const A = [[4, -1, 0], [-1, 4, -1], [0, -1, 4]], b = [15, 10, 10];
  const cg = LinAlg.conjugateGradient(A, b, 1e-14);
  check(cg.converged, "Conjugate gradient converges");
  check(cg.steps <= cg.size, "Conjugate gradient finishes within n steps", `${cg.steps} <= ${cg.size}`);
  approx(maxAbs(Algorithms.matVec(A, cg.solution).map((v, i) => v - b[i])), 0, 1e-9, "Conjugate gradient: ||Ax - b|| = 0");
  approx(maxAbs(cg.solution.map((v, i) => v - LinAlg.solveSystem(A, b).solution[i])), 0, 1e-9, "Conjugate gradient agrees with direct elimination");
}

throws(() => LinAlg.conjugateGradient([[1, 2], [3, 4]], [1, 1]), "Conjugate gradient: non-SPD matrix throws");

/* ------------------------------------------------------ Markov chains */

// Steady state must be a genuine fixed point of the chain and a probability distribution.
{
  const P = [[0.9, 0.5], [0.1, 0.5]]; // column-stochastic
  const { steadyState, convention, uniqueUpToScale } = LinAlg.markovSteadyState(P);
  approx(steadyState.reduce((s2, v) => s2 + v, 0), 1, 1e-12, "Markov: steady state sums to 1");
  check(steadyState.every((v) => v >= -1e-12), "Markov: steady state has no negative entries");
  approx(maxAbs(Algorithms.matVec(P, steadyState).map((v, i) => v - steadyState[i])), 0, 1e-12, "Markov: P v = v (it is a fixed point)");
  approx(steadyState[0], 5 / 6, 1e-9, "Markov: hand-computable steady state 5/6");
  approx(steadyState[1], 1 / 6, 1e-9, "Markov: hand-computable steady state 1/6");
  check(convention === "column-stochastic", "Markov: detects the column-stochastic convention", convention);
  check(uniqueUpToScale, "Markov: steady state is unique for this chain");
}

// Row-stochastic input must be accepted too, giving the same distribution.
{
  const rowP = [[0.9, 0.1], [0.5, 0.5]]; // transpose of the case above
  const r = LinAlg.markovSteadyState(rowP);
  check(r.convention === "row-stochastic", "Markov: detects the row-stochastic convention", r.convention);
  approx(r.steadyState[0], 5 / 6, 1e-9, "Markov: row-stochastic input gives the same steady state");
}

// Evolving any starting distribution must approach the steady state.
{
  const P = [[0.9, 0.5], [0.1, 0.5]];
  const { steadyState } = LinAlg.markovSteadyState(P);
  const { final } = LinAlg.markovEvolve(P, [1, 0], 200);
  approx(maxAbs(final.map((v, i) => v - steadyState[i])), 0, 1e-9, "Markov: evolving from [1,0] converges to the steady state");
  const { history } = LinAlg.markovEvolve(P, [0, 1], 5);
  approx(history.length, 6, 0.5, "Markov: evolve returns the starting distribution plus one row per step");
  approx(history[0].distribution.reduce((s2, v) => s2 + v, 0), 1, 1e-12, "Markov: each distribution stays normalised");
}

throws(() => LinAlg.markovSteadyState([[1, 2], [3, 4]]), "Markov: a non-stochastic matrix throws");
throws(() => LinAlg.markovEvolve([[0.9, 0.5], [0.1, 0.5]], [1], 5), "Markov: wrong starting-vector length throws");

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
