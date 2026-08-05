"use strict";
/* L3 — Factorization over Q. See docs/kernel/04_BUILD_PHASES.md Phase 3 task 5.

   Scope, stated honestly (the same "deliberately narrow, refuses outside scope" discipline as
   assets/js/kernel/rulesets/factor.js and rationalize.js): this module factors a primitive
   integer polynomial over Q using RATIONAL-ROOT STRIPPING followed by KRONECKER'S INTERPOLATION
   method, gated at every step by exact integer divisibility. It is complete and correct for the
   corpus-scale degrees this phase targets (denominators of undergraduate rational integrals —
   degree roughly <= 6, small integer coefficients), and refuses with a reason when a denominator
   exceeds the combination cap, rather than silently returning a partial factorization.

   The doc names Cantor-Zassenhaus mod p + Hensel lifting (or Zassenhaus) as the factorization
   algorithm. That is the POLYNOMIAL-TIME method and is the right choice for large degrees, where
   Kronecker's exponential divisor-enumeration blows up. It is reserved as a named follow-up
   increment (the same way Phase 2b/2c/2d were named increments pulled out of Phase 5): the
   finite-field arithmetic, distinct-degree and equal-degree factorization, and Hensel lifting
   it needs are real work that is not required to meet THIS slice's gate — "every rational
   function in the corpus integrates correctly" over Q-splitting denominators, which the degrees
   here cover. Kronecker delivers that correctness now, with a clean refusal path for the cases
   it cannot reach; CZ+Hassen replaces it for scale later. Property tests cross-check the full
   factorizer against INDEPENDENT brute force (root evaluation + product reconstitution) in
   tests/verify-poly-properties.js, per docs/kernel/03_ARCHITECTURE.md §3 L4.

   Gauss's lemma grounds the approach: a primitive integer polynomial factors over Q iff it
   factors over Z into primitive factors, so factoring over Z is factoring over Q. We strip
   linear (rational-root) factors first via the rational root theorem, then find higher-degree
   factors by Kronecker's method — interpolating a candidate factor of degree d through d+1
   integer evaluation points and all sign choices of the divisors of the values. */

const Poly = require("./polynomial");
const { Rational, bigGcd } = require("./rational");
const { squarefree } = require("./squarefree");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// Combination cap: a denominator so large that the divisor-enumeration would explode. Refusing
// here is a safe failure that routes to nerdamer in production (strangler fig); it is NOT a
// wrong answer. Tuned for corpus-scale; raise when CZ+Hensel lands.
const MAX_DIVISOR_VALUE = 10n ** 12n; // |f(x)| at an evaluation point must be <= this
const MAX_COMBINATIONS = 1 << 18; // total divisor-combinations across the chosen points

// ---------------------------------------------------------------------------------------
// Integer-polynomial helpers (ascending BigInt[]). Kept local because Kronecker is pure
// integer arithmetic; Poly (Rational[]) is the cross-module currency but overkill here.
// ---------------------------------------------------------------------------------------

function ideg(p) { let n = p.length; while (n > 0 && p[n - 1] === 0n) n--; return n - 1; }
function itrim(p) { let n = p.length; while (n > 0 && p[n - 1] === 0n) n--; return p.slice(0, n); }
function ilc(p) { const d = ideg(p); return d < 0 ? 0n : p[d]; }

function ieval(p, x) {
  let acc = 0n;
  for (let i = p.length - 1; i >= 0; i--) acc = acc * x + p[i];
  return acc;
}

function iadd(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0n);
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i] += b[i];
  return itrim(out);
}

function isub(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0n);
  for (let i = 0; i < a.length; i++) out[i] += a[i];
  for (let i = 0; i < b.length; i++) out[i] -= b[i];
  return itrim(out);
}

function imul(a, b) {
  if (!a.length || !b.length) return [];
  const out = new Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return itrim(out);
}

function iscalar(a, s) { return itrim(a.map((c) => c * s)); }

// Integer content (gcd of |coeffs|) with the sign of the leading coefficient.
function icontent(p) {
  let g = 0n;
  for (const c of p) {
    const a = c < 0n ? -c : c;
    if (a !== 0n) g = g === 0n ? a : bigGcd(g, a);
  }
  if (g === 0n) return 0n;
  return ilc(p) < 0n ? -g : g;
}

function iprimitive(p) {
  const c = icontent(p);
  if (c === 0n) return p.slice();
  return p.map((x) => x / c);
}

// Exact division of integer poly a by integer poly b; returns integer quotient or null if the
// remainder is nonzero (i.e., b does not divide a in Z[x]).
function idivExact(a, b) {
  if (ideg(b) < 0) throw new RangeError("idivExact: division by zero");
  if (ideg(a) < 0) return [];
  const db = ideg(b);
  const bl = b[db];
  const r = a.slice();
  const q = new Array(Math.max(0, ideg(a) - db + 1)).fill(0n);
  let dr = ideg(r);
  while (dr >= db) {
    const tr = r[dr];
    if (tr % bl !== 0n) return null; // non-integer quotient -> not a factor over Z
    const coef = tr / bl;
    const k = dr - db;
    q[k] = coef;
    for (let i = 0; i <= db; i++) r[k + i] -= coef * b[i];
    dr--;
  }
  for (let i = 0; i <= db - 1 && i < r.length; i++) if (r[i] !== 0n) return null;
  return itrim(q);
}

// ---------------------------------------------------------------------------------------
// Rational-root theorem: linear factors of a primitive integer polynomial.
// A rational root p/q (reduced) of primitive f => p | a0, q | a_n. Returns integer linear
// factors (q*x - p), one per distinct root, with lc > 0.
// ---------------------------------------------------------------------------------------

function divisors(n) {
  n = n < 0n ? -n : n;
  if (n === 0n) return [];
  const ds = [];
  for (let i = 1n; i * i <= n; i++) {
    if (n % i === 0n) {
      ds.push(i);
      if (i * i !== n) ds.push(n / i);
    }
  }
  return ds;
}

function rationalRootFactors(p) {
  const d = ideg(p);
  if (d < 1) return [];
  const a0 = p[0];
  const an = p[d];
  if (a0 === 0n) {
    // 0 is a root: factor x. Strip it and recurse on the rest to find further roots.
    const rest = p.slice(1); // divide by x
    return [{ factor: [0n, 1n], root: ZERO }, ...rationalRootFactors(rest).filter((f) => ideg(f.factor) > 0)];
  }
  const pDivs = divisors(a0);
  const qDivs = divisors(an);
  const seen = new Set();
  const factors = [];
  for (const sign of [1n, -1n]) {
    for (const pp of pDivs) {
      for (const qq of qDivs) {
        if (bigGcd(pp, qq) !== 1n) continue; // reduced
        // root = (sign*pp)/qq ; linear integer factor (qq*x - sign*pp), lc = qq > 0
        const rootRat = Rational.of(sign * pp, qq);
        const key = rootRat.num.toString() + "/" + rootRat.den.toString();
        if (seen.has(key)) continue;
        // exact rational evaluation (Horner with Rational):
        let acc = ZERO;
        for (let i = p.length - 1; i >= 0; i--) acc = acc.mul(rootRat).add(Rational.of(p[i], 1n));
        if (acc.isZero) {
          seen.add(key);
          factors.push({ factor: [-sign * pp, qq], root: rootRat });
        }
      }
    }
  }
  return factors;
}

// ---------------------------------------------------------------------------------------
// Kronecker's method: find a nontrivial factor of a primitive, square-free, integer polynomial
// of degree >= 2 that has no rational roots. Returns an integer factor (primitive, lc>0) or
// null if no factor of degree 2..floor(n/2) exists (i.e., the polynomial is irreducible).
// ---------------------------------------------------------------------------------------

// Lagrange interpolation over Q through integer points -> Rational[] poly, or null if the
// interpolant is not of degree <= d (shouldn't happen) — caller checks integrality.
function interpolate(points) {
  const n = points.length;
  let g = []; // zero rational poly
  for (let i = 0; i < n; i++) {
    // L_i = product over j != i of (X - x_j)/(x_i - x_j)
    let li = [ONE]; // constant 1
    let denom = ONE;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      // multiply li by (X - x_j)
      const xj = Rational.of(points[j].x, 1n);
      li = polyRMul(li, [xj.neg(), ONE]); // (X - x_j)
      denom = denom.mul(Rational.of(points[i].x, 1n).sub(xj));
    }
    const yi = Rational.of(points[i].y, 1n).div(denom);
    li = li.map((c) => c.mul(yi));
    g = polyRAdd(g, li);
  }
  return g;
}

function polyRAdd(a, b) {
  const n = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push((i < a.length ? a[i] : ZERO).add(i < b.length ? b[i] : ZERO));
  return trimR(out);
}
function polyRMul(a, b) {
  if (!a.length || !b.length) return [];
  const out = new Array(a.length + b.length - 1).fill(ZERO);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] = out[i + j].add(a[i].mul(b[j]));
  return trimR(out);
}
function trimR(p) {
  let n = p.length;
  while (n > 0 && p[n - 1].isZero) n--;
  return p.slice(0, n);
}

function isIntegerPoly(rationalPoly) {
  return rationalPoly.every((c) => c.isInteger);
}

function rationalPolyToBigInt(rationalPoly) {
  return rationalPoly.map((c) => c.num); // precondition: isIntegerPoly
}

// kroneckerFindFactor(intPoly) -> integer factor (BigInt[]) or null (irreducible)
function kroneckerFindFactor(p) {
  const n = ideg(p);
  for (let d = 2; d <= Math.floor(n / 2); d++) {
    // d+1 evaluation points 0..d
    const points = [];
    for (let i = 0n; i <= BigInt(d); i++) {
      const v = ieval(p, i);
      if (v === 0n) {
        // i is a root — but rational-root stripping should have removed these. Treat defensively:
        // (x - i) is a factor. Return it.
        return [-i, 1n];
      }
      if (bigAbs(v) > MAX_DIVISOR_VALUE) return { refuse: true, reason: "factor: Kronecker evaluation exceeds divisor cap; needs Cantor-Zassenhaus" };
      points.push({ x: i, y: v, divs: signedDivisors(v) });
    }
    // enumerate combinations of one divisor per point
    let combos = 1;
    for (const pt of points) {
      combos *= pt.divs.length;
      if (combos > MAX_COMBINATIONS) return { refuse: true, reason: "factor: Kronecker divisor combinations exceed cap; needs Cantor-Zassenhaus" };
    }
    for (const choice of combinations(points)) {
      const interp = interpolate(choice.map((c, i) => ({ x: points[i].x, y: c })));
      if (!isIntegerPoly(interp)) continue;
      const cand = rationalPolyToBigInt(interp);
      if (ideg(cand) < 1) continue;
      const prim = iprimitive(cand);
      if (ideg(prim) < 1) continue;
      // require leading coefficient positive (canonical) and proper degree d
      if (ilc(prim) < 0n) continue;
      if (ideg(prim) !== d) continue; // only accept factors of exactly degree d this pass
      const q = idivExact(p, prim);
      if (q !== null) return prim;
    }
  }
  return null; // no factor of degree 2..n/2 => irreducible
}

function bigAbs(a) { return a < 0n ? -a : a; }

function signedDivisors(v) {
  const ds = divisors(v);
  const out = [];
  for (const d of ds) { out.push(d); out.push(-d); }
  return out;
}

// Iterator over the Cartesian product of divisor lists, yielding arrays (one divisor per point).
function combinations(points) {
  return (function* gen(idx, acc) {
    if (idx === points.length) { yield acc.slice(); return; }
    for (const d of points[idx].divs) { acc.push(d); yield* gen(idx + 1, acc); acc.pop(); }
  })(0, []);
}

// ---------------------------------------------------------------------------------------
// Full square-free integer factorization (Kronecker + rational-root stripping)
// ---------------------------------------------------------------------------------------

// factorSquarefreeInteger(p) -> BigInt[] factors (each primitive, lc>0), product = p (up to sign,
// normalized so lc>0). p must be primitive, square-free, lc>0.
function factorSquarefreeInteger(p) {
  const factors = [];
  let work = p.slice();
  // strip rational (incl. integer) linear factors
  for (const { factor: lin } of rationalRootFactors(work)) {
    if (ideg(lin) < 1) continue;
    let q;
    while ((q = idivExact(work, lin)) !== null) {
      factors.push(lin);
      work = q;
    }
  }
  // now work has no rational roots; Kronecker for degree >= 2 factors
  while (ideg(work) >= 2) {
    const f = kroneckerFindFactor(work);
    if (f && f.refuse) throw new FactorRefusalError(f.reason);
    if (f === null) {
      // irreducible
      factors.push(work);
      work = [];
      break;
    }
    const q = idivExact(work, f);
    factors.push(f);
    work = q || [];
  }
  if (ideg(work) === 1) {
    // a leftover linear factor that rational-root stripping missed (e.g., leading coeff not 1)
    factors.push(work);
  } else if (ideg(work) === 0 && work.length) {
    // a leftover nonzero constant — must be ±1 for a primitive squarefree poly; ignore unit.
  }
  // normalize each factor to lc > 0
  return factors.map((f) => (ilc(f) < 0n ? f.map((c) => -c) : f)).filter((f) => ideg(f) >= 1);
}

class FactorRefusalError extends Error {
  constructor(reason) { super(reason); this.name = "FactorRefusalError"; }
}

// Convert an integer factor (BigInt[]) to a monic Rational[] poly (Poly currency).
function intFactorToMonicPoly(intF) {
  const l = ilc(intF);
  return intF.map((c) => Rational.of(c, l));
}

// ---------------------------------------------------------------------------------------
// Public API: factorOverQ
// ---------------------------------------------------------------------------------------

// factorOverQ(f) -> { content: Rational, factors: [{ factor: Rational[] (monic), mult: number }] }
//   with f = content * product(factor ^ mult). The factors are monic IRREDUCIBLE over Q and
//   pairwise coprime. Refuses (throws FactorRefusalError) when a square-free piece exceeds the
//   Kronecker cap; callers route that to the L4 refusal path.
function factorOverQ(f) {
  if (Poly.isZero(f)) return { content: ZERO, factors: [] };
  if (Poly.isConstant(f)) return { content: Poly.lc(f), factors: [] };

  // Square-free decomposition gives multiplicities; factor each square-free piece into irreducibles.
  const sq = squarefree(f); // { content: lc(f), factors: [{ factor: monic rational squarefree, mult }] }
  const irreducibles = [];
  for (const { factor: g, mult } of sq.factors) {
    // g is monic rational & square-free. Convert to a primitive integer poly for Kronecker.
    const { primitive: p } = Poly.contentAndPrimitivePart(g); // integer primitive, lc>0, g = p/lc(p)
    let intFactors;
    try {
      intFactors = factorSquarefreeInteger(toBigIntPoly(p));
    } catch (e) {
      if (e instanceof FactorRefusalError) throw e;
      throw e;
    }
    for (const intF of intFactors) {
      irreducibles.push({ factor: intFactorToMonicPoly(intF), mult });
    }
  }
  return { content: sq.content, factors: irreducibles };
}

function toBigIntPoly(p) {
  // p is rational with denominator 1 (integer primitive) — verified by contentAndPrimitivePart.
  return p.map((c) => c.num);
}

module.exports = { factorOverQ, FactorRefusalError, factorSquarefreeInteger, rationalRootFactors };