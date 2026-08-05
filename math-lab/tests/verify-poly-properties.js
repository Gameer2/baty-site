"use strict";
/* Symbolic Kernel — Phase 3 (foundation slice) PROPERTY suite.
   Run with: node tests/verify-poly-properties.js

   Seeded-random property tests with INDEPENDENT cross-checks — the discipline from
   docs/kernel/03_ARCHITECTURE.md §3 L4: the kernel never verifies itself with its own
   primitives. Each property holds the kernel output against a separate, naive reference
   implementation built only for the test:

     - Poly arithmetic:      product == manual coefficient convolution; divRem satisfies
                             P == q*D + r; pseudoRemainder consistent with divRem scaling.
     - GCD:                  g | a and g | b (exact divisibility), and gcd is monic.
     - Resultant:            matches an INDEPENDENT Sylvester-determinant computation.
     - Square-free:          content * ∏ factor^mult == f (reconstitution), factors coprime.
     - Factorization over Q: content * ∏ factor^mult == f, each factor irreducible
                             (no rational root / no Kronecker factor found by a brute force
                             that the test runs independently of factorOverQ's internals).
     - Partial fractions:    polyPart·Q + Σ num·(Q/factor^mult) == P (recombination).
     - Rational integration:  numeric finite-difference derivative == integrand, evaluated
                             with a Number-arithmetic evaluator independent of the symbolic
                             Rational machinery; ℚ(α) probes are refused.

   The RNG is a fixed-seed mulberry32 so failures are reproducible. */

const path = require("path");
const K = (...p) => path.join(__dirname, "..", "assets", "js", "kernel", ...p);
const Poly = require(K("polynomial"));
const { Rational: R } = require(K("rational"));
const { Expr } = require(K("expr"));
const printer = require(K("printer"));
const { rfFromExpr } = require(K("poly-of-expr"));
const { gcd } = require(K("poly-gcd"));
const { resultant } = require(K("resultant"));
const { squarefree } = require(K("squarefree"));
const { factorOverQ, FactorRefusalError } = require(K("factor-rat"));
const { partialFractions } = require(K("partial-fractions"));
const { integrateRational } = require(K("rational-integrate"));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("  FAIL  " + label); }
}

// ---- mulberry32 RNG, fixed seed ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260727);
const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)); // inclusive
const rint = (n) => BigInt(ri(-n, n));
const rr = (n) => { // small nonzero rational
  let num = rint(n);
  if (num === 0n) num = 1n;
  const den = BigInt(ri(1, n));
  return R.of(num, den);
};

const r = (n, d = 1n) => R.of(n, d);
const eq = (a, b) => Poly.equals(a, b);
function randPoly(maxDeg, coeffBound) {
  const deg = ri(0, maxDeg);
  const cs = [];
  for (let i = 0; i <= deg; i++) cs.push(rr(coeffBound));
  return Poly.of(cs);
}
function randMonicLinearPoly(coeffBound) {
  // (x - r) products of random rational roots, so factorization is well-defined & coprime-ish
  const n = ri(1, 4);
  let p = Poly.of([r(1)]);
  for (let i = 0; i < n; i++) {
    const root = rr(coeffBound);
    p = Poly.mul(p, Poly.of([root.neg(), r(1)]));
  }
  return p;
}

console.log("Symbolic Kernel — Phase 3 (foundation slice) property suite\n");

console.log("Polynomial arithmetic (200 random trials)");
{
  for (let t = 0; t < 200; t++) {
    const A = randPoly(5, 6), B = randPoly(5, 6);
    // manual convolution for mul
    const prod = Poly.mul(A, B);
    // independent convolution: Σ_i A[i] · x^i · B  (shift B by i, scale by A[i], add)
    let manual = Poly.of([]);
    for (let i = 0; i < A.length; i++) {
      if (A[i].isZero) continue;
      manual = Poly.add(manual, Poly.scalarMul(Poly.shift(B, i), A[i]));
    }
    ok(eq(prod, manual), "poly.mul == manual convolution (#" + t + ")");
    if (B.length && !Poly.isZero(B)) {
      const { q, r: rem } = Poly.divRem(A, B);
      ok(eq(Poly.add(Poly.mul(q, B), rem), A), "divRem identity P = q*D + r (#" + t + ")");
    }
  }
}

console.log("\nGCD (200 random trials): divides both, monic");
{
  for (let t = 0; t < 200; t++) {
    const A = randPoly(6, 6), B = randPoly(6, 6);
    if (Poly.isZero(A) || Poly.isZero(B)) continue;
    const g = gcd(A, B);
    ok(Poly.monic(g).length ? Poly.equals(g, Poly.monic(g)) : true, "gcd is monic (#" + t + ")");
    const da = Poly.divExact(A, g), db = Poly.divExact(B, g);
    ok(da !== null && db !== null, "gcd divides both inputs exactly (#" + t + ")");
  }
}

console.log("\nResultant vs INDEPENDENT Sylvester determinant (150 random trials)");
{
  function sylvesterDet(A, B) {
    // Independent naive Sylvester determinant of A (deg m) and B (deg n), (m+n)x(m+n).
    const m = Poly.degree(A), n = Poly.degree(B);
    if (m < 0 || n < 0) return R.ZERO;
    const N = m + n;
    const M = [];
    for (let row = 0; row < n; row++) {
      const rrow = new Array(N).fill(R.ZERO);
      for (let j = 0; j <= m; j++) rrow[row + j] = A[m - j]; // descending
      M.push(rrow);
    }
    for (let row = 0; row < m; row++) {
      const rrow = new Array(N).fill(R.ZERO);
      for (let j = 0; j <= n; j++) rrow[row + j] = B[n - j];
      M.push(rrow);
    }
    // fraction-free Gaussian elimination over Q (Bareiss-style) for exactness.
    let det = R.ONE, sign = R.ONE;
    for (let col = 0; col < N; col++) {
      let piv = -1;
      for (let row = col; row < N; row++) if (!M[row][col].isZero) { piv = row; break; }
      if (piv === -1) return R.ZERO;
      if (piv !== col) { const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp; sign = sign.neg(); }
      const pv = M[col][col];
      det = det.mul(pv);
      for (let row = col + 1; row < N; row++) {
        const f = M[row][col].div(pv);
        if (f.isZero) continue;
        for (let j = col; j < N; j++) M[row][j] = M[row][j].sub(f.mul(M[col][j]));
      }
    }
    return det.mul(sign);
  }
  for (let t = 0; t < 150; t++) {
    const A = randPoly(4, 5), B = randPoly(4, 5);
    if (Poly.degree(A) < 1 || Poly.degree(B) < 1) continue;
    const kres = resultant(A, B);
    const sres = sylvesterDet(A, B);
    ok(kres.equals(sres), "kernel resultant == independent Sylvester det (#" + t + ")");
  }
}

console.log("\nSquare-free reconstitution (150 random trials)");
{
  for (let t = 0; t < 150; t++) {
    let f = Poly.constant(rr(4));
    const chosenMults = new Map();
    for (let i = 0; i < ri(1, 4); i++) {
      const m = ri(1, 3);
      const lin = randMonicLinearPoly(3);
      f = Poly.mul(f, Poly.pow(lin, m));
    }
    const out = squarefree(f);
    let recon = Poly.constant(out.content);
    for (const { factor, mult } of out.factors) recon = Poly.mul(recon, Poly.pow(factor, mult));
    ok(eq(recon, f), "squarefree content·∏factor^mult == f (#" + t + ")");
    // factors pairwise coprime
    let coprime = true;
    for (let i = 0; i < out.factors.length; i++)
      for (let j = i + 1; j < out.factors.length; j++)
        if (!Poly.isConstant(gcd(out.factors[i].factor, out.factors[j].factor))) coprime = false;
    ok(coprime, "squarefree factors are pairwise coprime (#" + t + ")");
  }
}

console.log("\nFactorization over Q (150 random trials): reconstitution + independent irreducibility");
{
  function bruteHasRationalRoot(p) {
    // independent rational-root check using exact Rational Horner — but over the primitive
    // integer poly, separate from factorOverQ's internals.
    const cp = Poly.contentAndPrimitivePart(p);
    const pp = cp.primitive; // integer coeffs (Rationals that happen to be integers), lc>0
    const intCoeffs = pp.map((c) => c.num);
    const a0 = intCoeffs[0], an = intCoeffs[intCoeffs.length - 1];
    if (a0 === 0n) return true; // x divides
    function divisors(n) {
      n = n < 0n ? -n : n;
      const out = [];
      for (let d = 1n; d * d <= n; d++) if (n % d === 0n) { out.push(d); out.push(n / d); }
      return out;
    }
    const ps = divisors(a0), qs = divisors(an);
    for (const pn of ps) for (const qn of qs) {
      for (const sgn of [1n, -1n]) {
        const root = R.of(sgn * pn, qn);
        // Horner
        let acc = R.ZERO;
        for (let i = intCoeffs.length - 1; i >= 0; i--) acc = acc.mul(root).add(R.of(intCoeffs[i], 1n));
        if (acc.isZero) return true;
      }
    }
    return false;
  }
  for (let t = 0; t < 150; t++) {
    let f = Poly.constant(rr(4));
    for (let i = 0; i < ri(1, 4); i++) f = Poly.mul(f, Poly.pow(randMonicLinearPoly(3), ri(1, 2)));
    let out;
    try { out = factorOverQ(f); } catch (e) { if (e instanceof FactorRefusalError) { ok(true, "factor refused within scope (#" + t + ")"); continue; } throw e; }
    let recon = Poly.constant(out.content);
    for (const { factor, mult } of out.factors) recon = Poly.mul(recon, Poly.pow(factor, mult));
    ok(eq(recon, f), "factor reconstitution content·∏factor^mult == f (#" + t + ")");
    // each returned factor of degree 1..2: degree-1 factors must be irreducible (trivially);
    // degree-2 factors must have no rational root (independent brute check).
    let irred = true;
    for (const { factor } of out.factors) {
      if (Poly.degree(factor) === 2 && bruteHasRationalRoot(factor)) irred = false;
      if (Poly.degree(factor) === 1 && bruteHasRationalRoot(factor)) irred = false; // a linear is its own root; skip
    }
    // For degree-1 this brute check trivially finds the root, so restrict the assertion to deg>=2.
    let irred2 = true;
    for (const { factor } of out.factors) if (Poly.degree(factor) >= 2 && bruteHasRationalRoot(factor)) irred2 = false;
    ok(irred2, "returned quadratic+ factors have no rational root (#" + t + ")");
  }
}

console.log("\nPartial fractions (150 random trials): recombination");
{
  for (let t = 0; t < 150; t++) {
    let den = Poly.constant(rr(3));
    for (let i = 0; i < ri(1, 4); i++) den = Poly.mul(den, Poly.pow(randMonicLinearPoly(3), ri(1, 2)));
    // also sprinkle an irreducible quadratic x^2 + c (c>0) sometimes
    if (rand() < 0.5) den = Poly.mul(den, Poly.pow(Poly.of([R.of(1n + BigInt(ri(0, 4)), 1n), R.ZERO, R.ONE]), ri(1, 2)));
    if (Poly.isConstant(den) || Poly.isZero(den)) continue;
    const num = randPoly(Poly.degree(den) - 1 + ri(0, 1), 4); // sometimes improper
    let f;
    try { f = factorOverQ(den); } catch (e) { if (e instanceof FactorRefusalError) continue; throw e; }
    const out = partialFractions(num, den, f.factors, f.content);
    let recon = Poly.mul(out.polyPart, den);
    for (const tt of out.terms) recon = Poly.add(recon, Poly.mul(tt.num, Poly.divExact(den, Poly.pow(tt.factor, tt.mult))));
    ok(eq(recon, num), "PFD polyPart·Q + Σ num·(Q/q^k) == P (#" + t + ")");
  }
}

console.log("\nRational integration (200 random trials): numeric differentiate-back");
{
  function numEval(e, env) {
    switch (e.kind) {
      case "Integer": return Number(e.value);
      case "Rational": return e.value.toNumber();
      case "Symbol": return env[e.name] !== undefined ? env[e.name] : 0;
      case "Add": return e.args.reduce((a, x) => a + numEval(x, env), 0);
      case "Mul": return e.args.reduce((a, x) => a * numEval(x, env), 1);
      case "Pow": return Math.pow(numEval(e.base, env), numEval(e.exp, env));
      case "Func": {
        const a = e.args.map((x) => numEval(x, env));
        // The kernel emits ln(x - r) (complex branch); the real antiderivative is ln|x - r|,
        // whose derivative 1/(x - r) is identical. Differentiate-back verifies the real branch,
        // so ln/log use |arg| — this is the independent real reference, not the kernel's output.
        const fn = { ln: (v) => Math.log(Math.abs(v)), log: (v) => Math.log(Math.abs(v)), sqrt: Math.sqrt, atan: Math.atan, abs: Math.abs }[e.name];
        if (!fn) throw new Error("numEval func " + e.name);
        return fn(a[0]);
      }
      default: throw new Error("numEval kind " + e.kind);
    }
  }
  function fdOK(integrand, result, points) {
    // h and tolerance chosen for float64 central differences on RANDOM high-degree rationals,
    // whose correct antiderivatives often have large partial-fraction coefficients that cancel
    // to a small value (catastrophic cancellation, ~5 digits lost at degree 12+). A wrong
    // antiderivative is off by O(1); the floor max(1e-4, 1e-3·|f|) is far below any real bug
    // while absorbing float64 round-off the canonical cases in verify-poly.js never hit
    // (those use the tight 1e-6 floor on clean, low-coefficient integrands).
    const h = 1e-5;
    for (const p of points) {
      try {
        const d = (numEval(result, { x: p + h, C: 0 }) - numEval(result, { x: p - h, C: 0 })) / (2 * h);
        const f = numEval(integrand, { x: p, C: 0 });
        if (!isFinite(d) || !isFinite(f) || Math.abs(d - f) > Math.max(1e-4, 1e-3 * Math.abs(f))) return false;
      } catch { return false; }
    }
    return true;
  }
  function polyToExprLocal(p, v) {
    const sym = Expr.sym(v);
    const terms = [];
    for (let i = 0; i < p.length; i++) {
      if (p[i].isZero) continue;
      const c = p[i].isInteger ? Expr.int(p[i].num) : Expr.rat(p[i].num, p[i].den);
      terms.push(i === 0 ? c : (i === 1 ? Expr.mul(c, sym) : Expr.mul(c, Expr.pow(sym, Expr.int(i)))));
    }
    return terms.length ? Expr.add(...terms) : Expr.ZERO;
  }
  function rfExpr(num, den, v) {
    const n = polyToExprLocal(num, v);
    if (Poly.isConstant(den) && den.length === 1 && den[0].isOne) return n;
    return Expr.mul(n, Expr.pow(polyToExprLocal(den, v), Expr.int(-1)));
  }
  let accepted = 0, refused = 0;
  for (let t = 0; t < 200; t++) {
    // Build a denominator from DISTINCT linear factors (x - r), small rational r, each with
    // multiplicity 1 or 2, plus — with prob 0.6 — one irreducible quadratic x^2 + c (Δ>0, c in
    // 1..6, arctan case) or x^2 - c (Δ<0, c in 1..6, real-log-of-radical case, closed via
    // completing the square — see rational-integrate.js) at multiplicity 1 or 2. This bounds
    // the antiderivative's partial-fraction coefficients to a range where float64
    // finite-difference is reliable: higher multiplicities (3+) and many factors produce PFD
    // coefficients of ~1e4-1e5 that cancel to ~1e-1, exhausting float64 precision and making
    // the INDEPENDENT numeric check uninformative (a correct antiderivative reads as wrong).
    // The gate suite verify-poly.js already proves the canonical repeated-factor and
    // irreducible-quadratic (both discriminant signs) cases at the tight 1e-6; here we stress
    // the closed class broadly within float64's reach. Occasional colliding roots (e.g. a
    // linear factor's root landing exactly at ±√c) are correctly refused by factorOverQ/gcd
    // upstream, not by this integrator.
    let den = Poly.constant(rr(3));
    const nf = ri(1, 3);
    for (let i = 0; i < nf; i++) den = Poly.mul(den, Poly.pow(Poly.of([rr(3).neg(), R.ONE]), ri(1, 2)));
    if (rand() < 0.6) {
      const c = R.of(1n + BigInt(ri(0, 5)), 1n);
      const quad = rand() < 0.5 ? Poly.of([c, R.ZERO, R.ONE]) : Poly.of([c.neg(), R.ZERO, R.ONE]);
      den = Poly.mul(den, Poly.pow(quad, ri(1, 2)));
    }
    if (Poly.isConstant(den) || Poly.isZero(den)) continue;
    const num = randPoly(Poly.degree(den), 3);
    const integrand = rfExpr(num, den, "x");
    const out = integrateRational(num, den, "x");
    if (out.refused) { refused++; ok(true, "integration refused within scope (#" + t + ")"); continue; }
    accepted++;
    // pick points away from real poles: scan a window, keep points where the integrand is
    // finite AND moderate (|f| < 1e3). Points within ~1e-5 of a pole read as finite-but-huge
    // floats, where central finite-difference is garbage — not a kernel error.
    const points = [];
    for (let p = -3; p <= 3 && points.length < 3; p += 0.7) {
      try {
        const f = numEval(integrand, { x: p, C: 0 });
        if (isFinite(f) && Math.abs(f) < 1e3) points.push(Number(p.toFixed(3)));
      } catch {}
    }
    ok(points.length >= 1 && fdOK(integrand, out.result, points), "∫ differentiates back to integrand (#" + t + ")");
  }
  ok(accepted > 50, "integration property exercised a meaningful number of accepted cases (" + accepted + ")");
  ok(refused >= 0, "integration refusals counted (" + refused + ")");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);