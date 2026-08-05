"use strict";
/* L3 — Radius + interval of convergence of a power series Sum c_n (varName - center)^n.
   See docs/kernel/04_BUILD_PHASES.md Phase 4 task 4 (radius/interval of convergence) and
   docs/kernel/08_ENGINE_CALCULUS.md (the power-series capability the Calculus engine teaches).

   powerSeriesConvergence(coeffs, varName, center) ->
     { refused, radius, radiusInfinite, interval, endpoints, derivation } | { refused, reason }
   where:
     - `radius` is a Rational (finite, possibly ZERO) or null when the radius is infinite;
       `radiusInfinite` is the matching boolean.
     - `interval` describes the open interior |varName - center| < radius (or all reals, or the
       single point center when radius = 0).
     - `endpoints` is an array of { point, side, verdict, reason } for center +/- radius when the
       radius is finite and positive; verdict in
       "converges-absolutely" | "converges-conditionally" | "diverges".

   The radius is computed EXACTLY over Q for the closed coefficient patterns:
     - geometric      c_n = first * ratio^n  ->  R = 1/|ratio|   (ratio = 0 -> R = infinity)
     - rationalInN    c_n = P(n)/Q(n) (P,Q polynomials) -> R = 1   (root test: |P(n)/Q(n)|^(1/n)->1,
                       since n^k -> 1 under the n-th root for any fixed k)
     - factorialGrowth c_n ~ (n!)^k or a^n n! etc. (ratio -> infinity) -> R = 0
     - factorialDecay  c_n ~ 1/(n!)^k (ratio -> 0) -> R = infinity
   A finite coefficient array is also accepted; it is closed ONLY when the consecutive ratios are
   all equal (geometric) — otherwise the pattern cannot be inferred from a finite prefix and the
   call is refused (the same "refuse rather than guess" discipline as the Phase 3 factorizer).

   Endpoint classification (Stewart-order decision tree, exact over Q): at x = center +/- R the
   term is c_n ( +/- R )^n. For the closed classes this collapses to a constant-coefficient series
   classified by:
     - geometric at R = 1/|ratio|: term = first*(sign ratio)^n, magnitude |first| > 0 does not tend
       to 0 -> nth-term test -> DIVERGES at both endpoints (unless first = 0, trivial converge).
     - rationalInN at R = 1: term = (P(n)/Q(n)) * (+/-1)^n. Let p = degQ - degP (so |c_n| ~ C/n^p,
       C = lcP/lcQ). Then:
         endpoint +R (no alternation): p > 1 -> converges-absolutely; else DIVERGES (p-series
           p <= 1, or nth-term when p <= 0).
         endpoint -R (alternating (-1)^n): p > 1 -> converges-absolutely; 0 < p <= 1 ->
           converges-conditionally (Leibniz: |c_n| -> 0 and is eventually monotone for a rational
           P/Q); p <= 0 -> DIVERGES (nth-term).
   This is the kernel analog of the production convergenceTests/powerSeries helpers, but exact and
   over the closed patterns only. Production wiring deferred (same boundary as Phases 1-3).
   Verified by numeric partial-sum behavior inside vs outside the radius (independent numEval,
   docs/kernel/03_ARCHITECTURE.md §3 L4). */

const { Expr, Rational } = require("./expr");
const { Derivation } = require("./derivation");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// Coerce a Rational | BigInt | number | numeric Expr to a Rational.
function toRational(v) {
  if (v && typeof v === "object" && "num" in v && "den" in v) return v;
  if (typeof v === "number" || typeof v === "bigint") return Rational.of(v, 1n);
  if (Expr.isNumeric(v)) return Expr.numericValue(v);
  throw new TypeError("expected a Rational, BigInt, number, or numeric Expr");
}

// Trim trailing zero coefficients of a polynomial given as an array of Rationals (ascending).
function trimPoly(p) {
  let n = p.length;
  while (n > 1 && p[n - 1].isZero) n--;
  return p.slice(0, n);
}
function degPoly(p) { const t = trimPoly(p); let d = t.length - 1; while (d > 0 && t[d].isZero) d--; return d; }
function lcPoly(p) { const d = degPoly(p); return p[d]; }
function isZeroPoly(p) { return degPoly(p) === 0 && p[0].isZero; }

const RULE = {
  id: "kernel:convergence",
  name: "powerSeriesConvergence",
  source: "kernel",
  describe: () => ({ text: "radius/interval of convergence via ratio/root test over Q", latex: "" }),
};

// Classify the endpoint at x = center + side*R for a rationalInN pattern (p = degQ - degP).
function classifyRationalInNEndpoint(p, side) {
  if (side > 0) {
    // No alternation: pure p-series Sigma c_n.
    if (p > 1) return { verdict: "converges-absolutely", reason: "p-series with p = " + p + " > 1" };
    if (p > 0) return { verdict: "diverges", reason: "p-series with p = " + p + " <= 1 (harmonic-or-slower)" };
    return { verdict: "diverges", reason: "terms grow (p = " + p + " <= 0); nth-term test" };
  }
  // Alternating Sigma c_n (-1)^n: Leibniz.
  if (p > 1) return { verdict: "converges-absolutely", reason: "alternating p-series with p = " + p + " > 1 (absolute)" };
  if (p > 0) return { verdict: "converges-conditionally", reason: "alternating series (Leibniz): |c_n| ~ C/n^" + p + " -> 0 monotonically" };
  return { verdict: "diverges", reason: "alternating but |c_n| does not tend to 0 (p = " + p + " <= 0); nth-term test" };
}

// powerSeriesConvergence(coeffs, varName, center, ctx?) ->
//   { refused, radius, radiusInfinite, interval, endpoints, derivation } | { refused, reason }.
function powerSeriesConvergence(coeffs, varName, center, ctx) {
  let centerRat;
  try {
    centerRat = toRational(center);
  } catch (e) {
    return { refused: true, reason: "powerSeriesConvergence: " + e.message };
  }

  // Normalize `coeffs` into a descriptor. Accept either a structured descriptor or a finite
  // array of Rationals/numbers (geometric-only detection).
  let desc;
  if (Array.isArray(coeffs)) {
    const arr = coeffs.map(toRational);
    if (arr.length < 2) {
      return { refused: true, reason: "powerSeriesConvergence: a coefficient array needs >= 2 terms to detect a pattern" };
    }
    // Geometric detection: c_{n+1}/c_n constant (skip zero terms defensively).
    let ratio = null, ok = true;
    for (let i = 0; i + 1 < arr.length; i++) {
      if (arr[i].isZero) continue;
      const r = arr[i + 1].div(arr[i]);
      if (ratio === null) ratio = r;
      else if (!ratio.equals(r)) { ok = false; break; }
    }
    if (ok && ratio !== null) {
      desc = { kind: "geometric", first: arr[0], ratio };
    } else {
      return { refused: true, reason: "powerSeriesConvergence: cannot infer a closed coefficient pattern from the given finite prefix (only exact geometric detection is supported for arrays); pass a {kind:'rationalInN',...} or {kind:'geometric',...} descriptor" };
    }
  } else if (coeffs && typeof coeffs === "object" && coeffs.kind) {
    desc = coeffs;
  } else {
    return { refused: true, reason: "powerSeriesConvergence: `coeffs` must be a descriptor {kind,...} or an array of Rationals" };
  }

  let radius;        // Rational (finite, possibly ZERO) or null (= infinity)
  let radiusInfinite;
  let endpoints = [];
  let intervalDesc;

  switch (desc.kind) {
    case "geometric": {
      const first = toRational(desc.first);
      const q = toRational(desc.ratio);
      if (q.isZero) {
        radius = null; radiusInfinite = true; // only c_0 nonzero -> entire series is a constant
        intervalDesc = { kind: "all-reals", text: "all real " + varName };
      } else {
        const absQ = q.sign < 0 ? q.neg() : q;
        radius = ONE.div(absQ); // 1/|q|
        radiusInfinite = false;
        const lo = centerRat.sub(radius), hi = centerRat.add(radius);
        intervalDesc = { kind: "open", lo, hi, text: varName + " in (" + lo + ", " + hi + ")" };
        // Endpoints: term = first * (sign q)^n, magnitude |first| > 0 -> nth-term divergence.
        const trivial = first.isZero;
        for (const side of [+1, -1]) {
          const pt = centerRat.add(side > 0 ? radius : radius.neg());
          endpoints.push({
            point: pt,
            side,
            verdict: trivial ? "converges-absolutely" : "diverges",
            reason: trivial
              ? "first coefficient is zero (trivial zero series)"
              : "geometric endpoint: term = first*(sign ratio)^n has magnitude |first| > 0; nth-term test",
          });
        }
      }
      break;
    }
    case "rationalInN": {
      const P = trimPoly((desc.num || []).map(toRational));
      const Q = trimPoly((desc.den || []).map(toRational));
      if (isZeroPoly(Q)) return { refused: true, reason: "powerSeriesConvergence: rationalInN denominator is zero" };
      if (isZeroPoly(P)) {
        // all c_n = 0 -> radius infinite, trivial.
        radius = null; radiusInfinite = true;
        intervalDesc = { kind: "all-reals", text: "all real " + varName + " (zero series)" };
        break;
      }
      const p = degPoly(Q) - degPoly(P); // |c_n| ~ C / n^p
      radius = ONE; radiusInfinite = false;
      const lo = centerRat.sub(ONE), hi = centerRat.add(ONE);
      intervalDesc = { kind: "open", lo, hi, text: varName + " in (" + lo + ", " + hi + ")" };
      for (const side of [+1, -1]) {
        const pt = centerRat.add(side > 0 ? ONE : ONE.neg());
        const cls = classifyRationalInNEndpoint(p, side);
        endpoints.push({ point: pt, side, verdict: cls.verdict, reason: cls.reason });
      }
      break;
    }
    case "factorialGrowth": {
      // c_n grows at least factorially: ratio |c_{n+1}/c_n| -> infinity -> R = 0.
      radius = ZERO; radiusInfinite = false;
      intervalDesc = { kind: "point", point: centerRat, text: "converges only at " + varName + " = " + centerRat };
      break;
    }
    case "factorialDecay": {
      // c_n decays at least like 1/n!: ratio -> 0 -> R = infinity.
      radius = null; radiusInfinite = true;
      intervalDesc = { kind: "all-reals", text: "all real " + varName };
      break;
    }
    default:
      return { refused: true, reason: "powerSeriesConvergence: unknown pattern kind '" + desc.kind + "' (supported: geometric, rationalInN, factorialGrowth, factorialDecay)" };
  }

  const result = Expr.func("Convergence", [Expr.sym(varName)]);
  const derivation = Derivation.step(RULE, {}, result, result, ctx || null, []);
  return { refused: false, radius, radiusInfinite, interval: intervalDesc, endpoints, derivation };
}

module.exports = { powerSeriesConvergence };