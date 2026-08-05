"use strict";
/* L3 — Dense univariate polynomial over Q. See docs/kernel/04_BUILD_PHASES.md Phase 3 task 1.

   The kernel's L0 `Expr` represents a polynomial only implicitly (as Add/Mul/Pow of Symbols),
   which is fine for display and rewriting but unusable for the algorithms of Phase 3: GCD,
   square-free factorization, resultants, factorization over Q, and rational integration all
   need coefficient access by degree. This module is the concrete representation those
   algorithms operate on, built on the same exact-arithmetic foundation as L0 (Rational,
   BigInt numerator/denominator — no floats; see docs/kernel/03_ARCHITECTURE.md §3 L0).

   Representation: a polynomial is a `coeffs` array of `Rational`, ASCENDING by degree —
   `coeffs[i]` is the coefficient of x^i. The array is kept trimmed of high-order zeros, so the
   zero polynomial is the empty array `[]` and `degree()` is `coeffs.length - 1` (or -Infinity for
   the zero polynomial). Ascending order is chosen because the algorithms here — pseudo-division,
   Hensel lifting, square-free factorization — index coefficients by degree far more often than
   they print leading terms; an ascending array makes `coeffs[i]` a direct, offset-free lookup.

   Scope: UNIVARIATE only. Multivariate polynomial algebra is outside the corpus rational-
   integration problem this phase exists to solve (every rational function integrates in one
   variable). A `fromExpr` that sees more than one free symbol, or any Func, refuses honestly
   rather than silently dropping a variable — the same discipline as the existing narrow
   `factor`/`rationalize` rulesets (docs/kernel/04_BUILD_PHASES.md Phase 2 scope note). */

const { Rational, bigGcd } = require("./rational");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;
const NEG_INF = -Infinity;

// ---------------------------------------------------------------------------------------
// Construction & normalization
// ---------------------------------------------------------------------------------------

// Trim high-order zero coefficients so the representation is canonical: two equal polynomials
// have equal `coeffs` arrays. The zero polynomial is `[]`.
function trim(coeffs) {
  let n = coeffs.length;
  while (n > 0 && coeffs[n - 1].isZero) n--;
  return n === coeffs.length ? coeffs : coeffs.slice(0, n);
}

// Build from a (possibly sparse) array of rationals. Trims automatically.
function of(coeffs) {
  return trim(coeffs.map((c) => (c instanceof Rational ? c : Rational.of(c))));
}

// The zero polynomial.
const zero = () => [];

// A constant polynomial.
function constant(c) {
  c = c instanceof Rational ? c : Rational.of(c);
  return c.isZero ? [] : [c];
}

// Copy.
function clone(p) {
  return p.slice();
}

function isZero(p) {
  return p.length === 0;
}

function degree(p) {
  return p.length === 0 ? NEG_INF : p.length - 1;
}

// Leading coefficient ( Rational.ZERO for the zero polynomial — call after an isZero check ).
function lc(p) {
  return p.length === 0 ? ZERO : p[p.length - 1];
}

// Trailing (constant) coefficient.
function tc(p) {
  return p.length === 0 ? ZERO : p[0];
}

function isOne(p) {
  return p.length === 1 && p[0].isOne;
}

function isConstant(p) {
  return p.length <= 1;
}

// Structural equality (canonical because of trimming).
function equals(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!a[i].equals(b[i])) return false;
  return true;
}

// Deterministic order for canonical sorting of factor lists (by degree, then lexicographically
// by coefficient rationals) — used by square-free/factorization callers to keep output
// reproducible across runs, the same determinism discipline as docs/kernel/03 L2b.
function compare(a, b) {
  const da = degree(a), db = degree(b);
  if (da !== db) return da - db;
  for (let i = 0; i < a.length; i++) {
    const c = a[i].compare(b[i]);
    if (c !== 0) return c;
  }
  return 0;
}

// ---------------------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------------------

function add(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const ca = i < a.length ? a[i] : ZERO;
    const cb = i < b.length ? b[i] : ZERO;
    out[i] = ca.add(cb);
  }
  return trim(out);
}

function neg(p) {
  return p.map((c) => c.neg());
}

function sub(a, b) {
  return add(a, neg(b));
}

function scalarMul(p, s) {
  if (s.isZero) return [];
  return trim(p.map((c) => c.mul(s)));
}

function mul(a, b) {
  if (a.length === 0 || b.length === 0) return [];
  const out = new Array(a.length + b.length - 1).fill(null).map(() => ZERO);
  for (let i = 0; i < a.length; i++) {
    if (a[i].isZero) continue;
    for (let j = 0; j < b.length; j++) {
      out[i + j] = out[i + j].add(a[i].mul(b[j]));
    }
  }
  return trim(out);
}

// Multiply by x^k (k >= 0).
function shift(p, k) {
  if (p.length === 0 || k === 0) return p.slice();
  const out = new Array(k).fill(ZERO);
  for (let i = 0; i < p.length; i++) out[k + i] = p[i];
  return out;
}

// Raise to a non-negative integer power.
function pow(p, n) {
  if (n < 0) throw new RangeError("poly.pow: negative exponent");
  if (n === 0) return constant(ONE);
  let result = constant(ONE);
  let base = p;
  while (n > 0) {
    if (n & 1) result = mul(result, base);
    n >>>= 1;
    if (n) base = mul(base, base);
  }
  return result;
}

// Formal derivative.
function derivative(p) {
  if (p.length <= 1) return [];
  const out = new Array(p.length - 1);
  for (let i = 1; i < p.length; i++) out[i - 1] = p[i].mul(Rational.of(i, 1));
  return trim(out);
}

// Evaluate at a Rational point (Horner).
function evalAt(p, x) {
  let acc = ZERO;
  for (let i = p.length - 1; i >= 0; i--) acc = acc.mul(x).add(p[i]);
  return acc;
}

// Monic associate: p divided by its leading coefficient. The zero polynomial stays zero.
function monic(p) {
  if (p.length === 0) return [];
  const l = lc(p);
  if (l.isOne) return p.slice();
  return p.map((c) => c.div(l));
}

// ---------------------------------------------------------------------------------------
// Division over Q
// ---------------------------------------------------------------------------------------

// Exact division check: does g divide p in Q[x]? Returns the quotient if so, else null.
// Used wherever an exact quotient is expected (square-free factorization, factor combination,
// partial fractions). Implements ordinary polynomial long division and verifies zero remainder.
function divExact(p, g) {
  if (g.length === 0) throw new RangeError("poly.divExact: division by zero polynomial");
  if (p.length === 0) return [];
  const q = new Array(Math.max(0, p.length - g.length + 1)).fill(ZERO);
  const r = p.slice();
  const gl = g[g.length - 1];
  let dr = r.length - 1;
  while (dr >= g.length - 1 && dr >= 0) {
    if (!r[dr].isZero) {
      const coef = r[dr].div(gl);
      const k = dr - (g.length - 1);
      q[k] = coef;
      for (let i = 0; i < g.length; i++) {
        r[k + i] = r[k + i].sub(coef.mul(g[i]));
      }
    }
    dr--;
  }
  // Verify exact: trailing remainder must be all zero.
  for (let i = 0; i < g.length - 1 && i < r.length; i++) {
    if (i < r.length && !r[i].isZero) return null;
  }
  return trim(q);
}

// Ordinary quotient/remainder over Q (r = p mod g, deg r < deg g). The base of the Euclidean
// PRS GCD and the Euclidean resultant recurrence.
function divRem(p, g) {
  if (g.length === 0) throw new RangeError("poly.divRem: division by zero polynomial");
  if (p.length === 0) return { q: [], r: [] };
  const q = new Array(Math.max(0, p.length - g.length + 1)).fill(ZERO);
  const r = p.slice();
  const gl = g[g.length - 1];
  const dg = g.length - 1;
  let dr = r.length - 1;
  while (dr >= dg) {
    if (!r[dr].isZero) {
      const coef = r[dr].div(gl);
      const k = dr - dg;
      q[k] = coef;
      for (let i = 0; i <= dg; i++) {
        r[k + i] = r[k + i].sub(coef.mul(g[i]));
      }
    }
    dr--;
  }
  return { q: trim(q), r: trim(r.slice(0, dg)) };
}

// ---------------------------------------------------------------------------------------
// Pseudo-division (the core of the subresultant PRS family)
// ---------------------------------------------------------------------------------------

// Pseudo-remainder prem(a, b) = rem(lc(b)^(deg a - deg b + 1) * a, b), which is EXACT over any
// integral domain — no fractions are introduced, so over Q[x] it returns a polynomial with
// integer-ish (rational, but fraction-free given integer inputs) coefficients. This is what
// primitive/s subresultant PRS algorithms build on to control coefficient growth without
// leaving the UFD (docs/kernel/04_BUILD_PHASES.md Phase 3 task 2).
function pseudoRemainder(a, b) {
  return pseudoDivRem(a, b).r;
}

function pseudoDivRem(a, b) {
  if (b.length === 0) throw new RangeError("pseudoDivRem: division by zero polynomial");
  const da = degree(a), db = degree(b);
  if (da < db) return { q: [], r: a.slice() };
  const d = da - db + 1;
  const bl = b[db];
  // Multiply a through by bl^d so the division is exact (fraction-free).
  const factor = bl.pow(d);
  const r = a.map((c) => c.mul(factor));
  const q = new Array(da - db + 1).fill(ZERO);
  const dg = db;
  let dr = da;
  while (dr >= dg) {
    if (!r[dr].isZero) {
      const coef = r[dr]; // divided by bl, but we scaled by bl^d so coef/bl^(remaining) is exact
      const k = dr - dg;
      q[k] = coef.div(bl);
      for (let i = 0; i <= dg; i++) {
        r[k + i] = r[k + i].sub(coef.mul(b[i]));
      }
    }
    dr--;
  }
  return { q: trim(q), r: trim(r.slice(0, dg)) };
}

// ---------------------------------------------------------------------------------------
// Integer content & primitive part
// ---------------------------------------------------------------------------------------

// Bring a rational-coefficient polynomial to a primitive INTEGER polynomial, returning the
// rational scalar `content` such that p = content * primitivePart(p). The primitive part has
// integer coefficients (denominator 1), gcd 1, and positive leading coefficient — the canonical
// form factorization over Q operates on (docs/kernel/04_BUILD_PHASES.md Phase 3 task 5).
function contentAndPrimitivePart(p) {
  if (p.length === 0) return { content: ZERO, primitive: [] };
  // L = lcm of denominators; multiplying through clears to integers.
  let L = 1n;
  for (const c of p) L = bigLcm(L, c.den);
  const intCoeffs = p.map((c) => c.num * (L / c.den)); // BigInts, gcd-cleanable
  // integer content = gcd of |intCoeffs|, with the sign of the leading coefficient.
  let g = 0n;
  for (const v of intCoeffs) {
    const a = v < 0n ? -v : v;
    if (a === 0n) continue;
    g = g === 0n ? a : bigGcd(g, a);
  }
  if (g === 0n) return { content: ZERO, primitive: [] };
  const leadSign = intCoeffs[intCoeffs.length - 1] < 0n ? -1n : 1n;
  const den = g * leadSign; // make primitive part's leading coefficient positive
  const primitive = intCoeffs.map((v) => Rational.of(v, den));
  const content = Rational.of(den, L); // p = content * primitive (both scaled consistently)
  // NB: content here is the rational scalar; p = content * primitive holds because
  // intCoeffs/L = p, and intCoeffs = den * primitive_coeffs, so p = (den/L) * primitive.
  return { content, primitive };
}

function primitivePart(p) {
  return contentAndPrimitivePart(p).primitive;
}

// ---------------------------------------------------------------------------------------
// BigInt lcm helper (bigGcd reused from rational.js)
// ---------------------------------------------------------------------------------------

function bigLcm(a, b) {
  if (a === 0n || b === 0n) return 0n;
  return (a < 0n ? -a : a) / bigGcd(a, b) * (b < 0n ? -b : b);
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

module.exports = {
  ZERO: [],
  of,
  constant,
  clone,
  zero,
  isZero,
  isOne,
  isConstant,
  degree,
  lc,
  tc,
  equals,
  compare,
  add,
  sub,
  neg,
  scalarMul,
  mul,
  shift,
  pow,
  derivative,
  evalAt,
  monic,
  divExact,
  divRem,
  pseudoRemainder,
  pseudoDivRem,
  contentAndPrimitivePart,
  primitivePart,
  NEG_INF,
  // exposed for tests/finite-field sibling modules
  _bigGcd: bigGcd,
};