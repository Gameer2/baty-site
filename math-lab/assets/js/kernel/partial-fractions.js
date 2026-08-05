"use strict";
/* L3 — Correct partial-fraction decomposition. See docs/kernel/04_BUILD_PHASES.md Phase 3
   task 6. This is the module that fixes the measured `partfrac` repeated-factor bug
   (`1/((x-1)^2(x+2))` in docs/kernel/01_CURRENT_STATE.md / 08_ENGINE_CALCULUS.md §2).

   Given P/Q over Q with Q factored into monic irreducibles q_i with multiplicities e_i
   (Q = content * ∏ q_i^{e_i}), the decomposition of a PROPER fraction (deg P < deg Q) is

     P/Q = Σ_i Σ_{k=1}^{e_i} A_{i,k}(x) / q_i(x)^k,    deg A_{i,k} < deg q_i.

   This module solves for the A_{i,k} coefficients as a LINEAR SYSTEM over Q. Multiplying the
   identity through by Q gives the polynomial identity

     P = Σ_i Σ_k A_{i,k}(x) · q_i(x)^{e_i - k} · (Q / q_i^{e_i}),

   in which the only unknowns are the deg(q_i) coefficients of each A_{i,k}. Matching the
   coefficients of x^0 .. x^{deg Q - 1} on both sides yields a square (deg Q × deg Q) system
   with a UNIQUE solution (the uniqueness of partial fractions). Solving it over Q is
   unconditionally correct for any factorization, including repeated factors and irreducible
   quadratics — exactly the cases the measured bug corrupted — and never relies on the cover-up
   heuristic that fails on repeated factors.

   Improper fractions (deg P >= deg Q) are handled by polynomial long division first:
   P = S·Q + R, so P/Q = S + R/Q. The polynomial part S integrates directly; R/Q decomposes. */

const Poly = require("./polynomial");
const { Rational } = require("./rational");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// Solve a square linear system M·v = b over Q (Gaussian elimination with partial pivoting).
// M: Rational[][] (rows), b: Rational[]. Returns Rational[] v or null if singular.
function solveLinear(M, b) {
  const n = b.length;
  // augmented copy
  const A = M.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot: largest nonzero in column col (by absolute value, to stay numerically tidy over Q)
    let piv = -1;
    let best = ZERO;
    for (let row = col; row < n; row++) {
      const v = A[row][col];
      if (!v.isZero) {
        const ab = v.num < 0n ? -v.num : v.num;
        if (piv === -1 || ab > best) { piv = row; best = ab; }
      }
    }
    if (piv === -1) return null; // singular — would mean the PFD is not unique (a bug, not input)
    if (piv !== col) { const t = A[col]; A[col] = A[piv]; A[piv] = t; }
    const pv = A[col][col];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = A[row][col].div(pv);
      if (f.isZero) continue;
      for (let j = col; j <= n; j++) A[row][j] = A[row][j].sub(f.mul(A[col][j]));
    }
  }
  const v = new Array(n);
  for (let i = 0; i < n; i++) v[i] = A[i][n].div(A[i][i]);
  return v;
}

// partialFractions(P, Q, factors) -> { polyPart: Rational[], content: Rational,
//   terms: [{ num: Rational[] (deg < deg factor), factor: Rational[] (monic irreducible),
//             mult: number }] }
//   `factors` = [{ factor, mult }] from factorOverQ(Q); `content` = Q's content. P/Q is
//   reconstructed as polyPart + Σ num/factor^mult (the content cancels into the terms — see below).
function partialFractions(P, Q, factors, content) {
  content = content || ONE;
  // Polynomial long division for the improper-fraction case.
  let polyPart = [];
  let R = P.slice();
  if (Poly.degree(R) >= Poly.degree(Q)) {
    const { q, r } = Poly.divRem(R, Q);
    polyPart = q;
    R = r;
  }
  // Build the multiplier polynomials M_{i,k} = factor^{e - k} * (Q / factor^e).
  // Q_effective = Q (already includes content). We match: P = R (the proper remainder) against
  // Σ A_{i,k} · M_{i,k}, BUT the identity P = Σ A_{i,k} M_{i,k} assumed P/Q = Σ A/q^k, i.e.
  // multiplied through by Q. Here R/Q = Σ A_{i,k}/q_i^k, so R = Σ A_{i,k} · q_i^{e_i-k} · (Q/q_i^{e_i}).
  // Q = content · ∏ factor^{mult}. Q/factor^{mult} = content · ∏_{j≠i} factor_j^{mult_j}.
  const Qi = []; // per factor i: list of {factorIdx, k, Mpoly, degA}
  const Mpolys = [];
  const meta = [];
  const productAll = factors.reduce((acc, f) => Poly.mul(acc, Poly.pow(f.factor, f.mult)), Poly.constant(ONE));
  for (let i = 0; i < factors.length; i++) {
    const { factor: qi, mult: ei } = factors[i];
    const QoverQi = Poly.divExact(productAll, Poly.pow(qi, ei)); // = ∏_{j≠i} q_j^{e_j} (monic)
    for (let k = 1; k <= ei; k++) {
      const M = Poly.mul(Poly.pow(qi, ei - k), QoverQi); // = q_i^{e_i-k} * (Q/q_i^{e_i})/content
      // Note: Q = content * productAll, so Q/q_i^{e_i} = content * QoverQi.
      // The true identity uses Q (with content): R = Σ A_{i,k} q_i^{e_i-k} (content * QoverQi).
      // To keep content explicit, multiply M by content here:
      const Mfull = Poly.scalarMul(M, content);
      Mpolys.push(Mfull);
      meta.push({ factorIdx: i, k, degA: Poly.degree(qi) });
    }
  }
  // Unknowns: coefficients of each A_{i,k}: a_{i,k,0}..a_{i,k,degA-1}.
  const N = meta.reduce((acc, m) => acc + m.degA, 0); // = deg(productAll) = deg Q
  // Build coefficient matrix: rows = power 0..N-1, columns = unknowns.
  const cols = []; // each col = Rational[] of length N (coefficients of x^t · M)
  let colOffset = 0;
  for (let idx = 0; idx < meta.length; idx++) {
    const M = Mpolys[idx];
    const dA = meta[idx].degA;
    for (let t = 0; t < dA; t++) {
      const col = new Array(N).fill(ZERO);
      // x^t · M contributes M shifted by t
      for (let j = 0; j < M.length; j++) col[t + j] = col[t + j].add(M[j]);
      cols.push(col);
    }
  }
  // Build matrix rows
  const Mat = new Array(N);
  for (let row = 0; row < N; row++) Mat[row] = cols.map((c) => c[row]);
  // RHS: coefficients of R (the proper remainder), padded to length N.
  const bvec = new Array(N).fill(ZERO);
  for (let j = 0; j < R.length; j++) bvec[j] = R[j];
  const sol = solveLinear(Mat, bvec);
  if (sol === null) throw new Error("partialFractions: singular system (factorization not coprime?)");
  // Reassemble A_{i,k} from the solution vector.
  const terms = [];
  let off = 0;
  for (let idx = 0; idx < meta.length; idx++) {
    const { factorIdx, k, degA } = meta[idx];
    const Acoeffs = sol.slice(off, off + degA);
    off += degA;
    terms.push({ num: Poly.of(Acoeffs), factor: factors[factorIdx].factor, mult: k });
  }
  return { polyPart, content, terms };
}

module.exports = { partialFractions, solveLinear };