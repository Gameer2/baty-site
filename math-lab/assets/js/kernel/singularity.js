"use strict";
/* L3 — Singularity classification: removable / pole of order n / essential. See
   docs/kernel/04_BUILD_PHASES.md Phase 4 task 3 (singularity classification) and
   docs/kernel/10_ENGINE_COMPLEX.md (the Complex Analysis engine's residue/pole-order needs).

   classifySingularity(expr, varName, point) ->
     { refused, kind, order?, reason, derivation } | { refused, reason }
   where kind ∈ "regular" | "removable" | "pole", and `order` is the pole order (kind "pole") or
   the cancellation order (kind "removable"); "regular" carries no order (the point is not a
   singularity — the function is analytic there).

   For a RATIONAL function at a RATIONAL point, classification needs only the multiplicity of the
   linear factor (varName - point) in the numerator and denominator — found by repeated EXACT
   division by that linear factor over Q, never by full factorization. This is stronger than the
   build-plan's factorOverQ route: it never hits the Q(α) refusal, because an irreducible
   quadratic (or higher) has no RATIONAL root, so at a rational point only linear factors can
   vanish. Let a = mult of (x - point) in the numerator, b = mult in the denominator (before gcd
   cancellation):
     b = 0           -> "regular"      (analytic at the point; a > 0 just means a zero)
     b > 0, a = 0    -> "pole", order b
     b > 0, a >= b   -> "removable", order b   (cancelled; the limit is finite)
     b > 0, 0 < a < b -> "pole", order b - a

   Honest refusal (same discipline as Phases 3/4): a NON-rational input about the point
   (e.g. exp(1/x) at 0, or sin(x)/x at 0) is refused — transcendental-composition classification
   (which of removable/pole/essential it is) needs the full series machinery deferred with the
   Gruntz follow-up (memory: Phase 4 foundation slice). The refusal message says exactly that,
   rather than mislabeling sin(x)/x as "essential". Production wiring deferred, same boundary as
   Phases 1-3. Verified by INDEPENDENT numeric blowup rate (log-log slope -m near a pole of order
   m; finite near a removable/regular point) in the tests — docs/kernel/03_ARCHITECTURE.md §3 L4. */

const { Expr, Rational } = require("./expr");
const { Derivation } = require("./derivation");
const Poly = require("./polynomial");
const { rfFromExpr } = require("./poly-of-expr");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// Coerce a point spec to a Rational (singularity classification is at rational points only).
function pointToRational(point) {
  if (point && typeof point === "object" && "num" in point && "den" in point) return point;
  if (typeof point === "number" || typeof point === "bigint") return Rational.of(point, 1n);
  if (Expr.isNumeric(point)) return Expr.numericValue(point);
  throw new TypeError("classifySingularity: point must be a Rational, BigInt, number, or numeric Expr");
}

// Multiplicity of the linear factor (varName - point) in polynomial P (ascending Rational[]),
// by repeated exact division. Returns a non-negative integer.
function multAt(P, point) {
  if (Poly.isZero(P)) return 0; // 0 polynomial: conventionally infinite multiplicity; treat as 0
  const L = [point.neg(), ONE]; // monic (x - point)
  let m = 0;
  let cur = P;
  for (;;) {
    if (Poly.isZero(cur) || Poly.degree(cur) < 1) break;
    const q = Poly.divExact(cur, L);
    if (q === null) break;
    m++;
    cur = q;
  }
  return m;
}

const RULE = {
  id: "kernel:singularity",
  name: "classifySingularity",
  source: "kernel",
  describe: () => ({ text: "singularity classification via linear-factor multiplicity", latex: "" }),
};

// classifySingularity(expr, varName, point, ctx?) ->
//   { refused, kind, order?, reason, derivation } | { refused, reason }.
function classifySingularity(expr, varName, point, ctx) {
  let pointRat;
  try {
    pointRat = pointToRational(point);
  } catch (e) {
    return { refused: true, reason: "classifySingularity: " + e.message };
  }

  // Must be a rational function of varName to classify at a rational point in this slice.
  const rf = rfFromExpr(expr, varName);
  if (rf === null) {
    return {
      refused: true,
      reason: "classifySingularity: input is not a rational function of " + varName + "; classification of transcendental compositions (removable/pole/essential, e.g. exp(1/x), sin(x)/x) is deferred with the full series machinery (Gruntz follow-up)",
    };
  }
  const a = multAt(rf.num, pointRat); // multiplicity of (x - point) in the numerator
  const b = multAt(rf.den, pointRat); // ... in the denominator

  let kind, order, reason;
  if (b === 0) {
    kind = "regular";
    reason = "no factor (" + varName + " - " + pointRat + ") in the denominator; the function is analytic at the point";
  } else if (a === 0) {
    kind = "pole";
    order = b;
    reason = "pole of order " + b + " at " + varName + " = " + pointRat;
  } else if (a >= b) {
    kind = "removable";
    order = b;
    reason = "removable singularity at " + varName + " = " + pointRat + " (numerator zero of order " + a + " cancels denominator zero of order " + b + ")";
  } else {
    kind = "pole";
    order = b - a;
    reason = "pole of order " + (b - a) + " at " + varName + " = " + pointRat + " (after canceling " + a + " common factor(s))";
  }

  const result = Expr.func("Singularity", [Expr.sym(varName), Expr.int(BigInt(order || 0))]);
  const derivation = Derivation.step(RULE, {}, expr, result, ctx || null, []);
  return { refused: false, kind, order, reason, derivation };
}

module.exports = { classifySingularity };