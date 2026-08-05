/* General ODE solver — Phase 1 of the ODE engine redesign. Replaces the old hand-rolled
   classify-then-symbolically-derive pipeline (ode-symbolic.js's classifyFirstOrder /
   classifySecondOrder, now deleted — see git history) with a single any-order path: SymPy's
   general dsolve() does the solving, this module's job is turning a typed equation into a
   dsolveGeneral() call and independently re-verifying whatever comes back before it is ever
   shown, via numeric substitution into the ORIGINAL equation — never trusted blindly, same
   discipline every other solver on this site follows, just implemented once generically.

   compileRealFx / withArbitraryConstants were originally carried over from
   sympy-dsolve-fallback.js; that file (and the ODESymbolic parsing helpers only it used) was
   deleted in Phase 3 once laplace-transform.js was rewritten on top of this module's own
   verification instead — see their comments below for why each function exists now. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ODESolver = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ODESolver = {};

  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  function compileRealFx(exprStr) {
    try {
      if (!exprStr || !exprStr.trim()) return { ok: false, error: "Empty expression." };
      const node = math.parse(exprStr);
      const code = node.compile();
      const realLog = (v) => Math.log(Math.abs(v));
      const heaviside = (v) => (v > 0 ? 1 : 0);
      const diracDelta = () => 0;
      const fn = (scope) => {
        const full = Object.assign({ log: realLog, ln: realLog, Heaviside: heaviside, DiracDelta: diracDelta }, scope);
        const r = code.evaluate(full);
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      return { ok: true, fn };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }
  // Exposed for direct reuse by ode-systems.js (Phase 2) — verifying a linear system's
  // components needs the exact same real-valued-expression compilation, not a second copy.
  ODESolver.compileRealFx = compileRealFx;

  // A general solution carries free constants (SymPy's own C1, C2, ... convention). A general
  // solution must satisfy the ODE for ANY value of its constants, so substituting one fixed,
  // arbitrary, non-degenerate number per constant and checking THAT is a legitimate proof.
  // Every constant gets a genuinely DISTINCT value — critical, not cosmetic: a term depending on
  // the difference of two constants (e.g. in a wrong candidate that accidentally reuses one
  // constant where it should have another) must not spuriously cancel to zero and pass by
  // accident. The first six are pre-chosen distinct decimals (covers this site's order-1-through-4
  // course scope with margin); beyond that, a golden-ratio-conjugate-based formula stays distinct
  // for any index without needing to extend the table by hand.
  const ARBITRARY_CONSTANT_VALUES = ["1.3743", "-0.8123", "0.5417", "2.1934", "-1.6822", "0.9271"];
  function withArbitraryConstants(exprText) {
    return exprText.replace(/\bC(\d*)\b/g, (_, n) => {
      const idx = n === "" ? 1 : parseInt(n, 10);
      if (idx >= 1 && idx <= ARBITRARY_CONSTANT_VALUES.length) return ARBITRARY_CONSTANT_VALUES[idx - 1];
      return String(1 + idx * 0.6180339887);
    });
  }
  // Exposed for direct testing only: any linear combination of a linear homogeneous ODE's
  // solution basis satisfies the ODE regardless of whether two coefficients happen to be
  // numerically equal, so the C3/C4-collision regression can't be proven indirectly through
  // ODE-verification behavior — it has to check this function's actual output.
  ODESolver.withArbitraryConstants = withArbitraryConstants;

  // y -> Y0, y' -> Y1, y'' -> Y2, ... y^(n) -> Yn. The regex is greedy so "y''" is matched as
  // ONE occurrence (order 2), never corrupted by a "y'" (order 1) replacement running first.
  function toPlaceholdersGeneral(s) {
    return s
      .replace(/y('+)/g, (_, primes) => "Y" + primes.length)
      .replace(/(?<![A-Za-z0-9_])y(?![A-Za-z0-9_'(])/g, "Y0");
  }

  // Exposed for direct reuse by laplace-engine.js (Phase 3) — extracting a linear equation's
  // constant coefficients needs the exact same y/y'/y'' -> Y0/Y1/Y2 substitution.
  ODESolver.toPlaceholdersGeneral = toPlaceholdersGeneral;

  // Recursive central-difference nth derivative. Cost is 2^order function evaluations, which
  // is trivial for the order range (1-4) this site's ODE course material actually reaches.
  function nthCentralDifference(fn, x, order, h) {
    if (order === 0) return fn(x);
    if (order === 1) return (fn(x + h) - fn(x - h)) / (2 * h);
    const lower = (xx) => nthCentralDifference(fn, xx, order - 1, h);
    return (lower(x + h) - lower(x - h)) / (2 * h);
  }

  const SAMPLE_X = [0.37, 0.83, 1.29, 1.71, 2.13, -0.61, -1.47];
  // Exposed so a caller whose equation has a jump/impulse at a location this default range
  // doesn't reach (e.g. Heaviside(x-10)) can build its own sample points that include the
  // default coverage AND points past the jump — see verifyNthOrderAt.
  ODESolver.DEFAULT_SAMPLE_X = SAMPLE_X.slice();

  // Substitutes the candidate y(x) (and its finite-differenced derivatives up to `order`) into
  // the ORIGINAL typed equation and checks it holds at a quorum of the GIVEN sample points.
  // This is the one general verify gate that replaces every hand-rolled per-branch verify loop
  // the old classify tree had. Exposed directly (not just via the DEFAULT_SAMPLE_X-only
  // verifyNthOrder below) so callers whose equation has a jump/impulse at a specific location
  // (Heaviside/DiracDelta forcing) can supply sample points that actually straddle it — the
  // default fixed range covers roughly [-1.47, 2.13], so a jump anywhere outside that window
  // would otherwise never get exercised on its far side, and a wrong candidate that only
  // differs from the correct one past the jump would incorrectly "verify".
  function verifyNthOrderAt(yOfXText, equationText, order, sampleXs) {
    const eqParts = equationText.split("=");
    const lhsExpr = compileRealFx(toPlaceholdersGeneral(eqParts[0]));
    const rhsExpr = compileRealFx(toPlaceholdersGeneral(eqParts.length > 1 ? eqParts[1] : "0"));
    const Y = compileRealFx(withArbitraryConstants(yOfXText));
    if (!Y.ok || !lhsExpr.ok || !rhsExpr.ok) return false;
    const h = order >= 3 ? 1e-3 : 1e-4; // higher-order finite differences need a larger h against float noise
    let usable = 0;
    for (const x of sampleXs) {
      let scope;
      try {
        scope = { x };
        for (let k = 0; k <= order; k++) {
          scope["Y" + k] = nthCentralDifference((xx) => Y.fn({ x: xx }), x, k, h);
        }
      } catch (e) { continue; }
      let lhsVal, rhsVal;
      try {
        lhsVal = lhsExpr.fn(scope);
        rhsVal = rhsExpr.fn(scope);
      } catch (e) { continue; }
      if (![lhsVal, rhsVal].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(lhsVal - rhsVal) > 5e-2 * Math.max(1, Math.abs(rhsVal))) return false;
    }
    return usable >= 3;
  }
  ODESolver.verifyNthOrderAt = verifyNthOrderAt;

  function verifyNthOrder(yOfXText, equationText, order) {
    return verifyNthOrderAt(yOfXText, equationText, order, SAMPLE_X);
  }
  ODESolver.verifyNthOrder = verifyNthOrder;

  // Highest prime-run after a "y" — e.g. "y'' + y' = x" -> 2. Returns 0 if no y' term is found
  // at all (not an ODE this solver handles).
  ODESolver.detectOrder = function (equationText) {
    const matches = equationText.match(/y'+/g);
    if (!matches) return 0;
    return Math.max.apply(null, matches.map((m) => m.length - 1));
  };

  function unwrap(resultText) {
    if (resultText.startsWith("EXPLICIT:")) return { kind: "explicit", text: normalizeSympyText(resultText.slice(9)) };
    if (resultText.startsWith("IMPLICIT:")) return { kind: "implicit", text: normalizeSympyText(resultText.slice(9)) };
    return { kind: "explicit", text: normalizeSympyText(resultText) };
  }

  // ics: null, or { x0, derivValues: [y(x0), y'(x0), ...] } (derivValues.length === order).
  ODESolver.solve = function (equationText, ics) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The solver isn't available on this page." });
    }
    const order = ODESolver.detectOrder(equationText);
    if (order === 0) {
      return Promise.resolve({ ok: false, reason: "Couldn't find a y', y'', ... term — this doesn't look like an ODE." });
    }
    const icsList = ics ? [String(ics.x0)].concat(ics.derivValues.map(String)) : [];
    return SympyClient.dsolveGeneral(equationText, order, icsList)
      .then((out) => {
        const parsed = JSON.parse(out.resultText);
        const u = unwrap(parsed.solution);
        if (u.kind !== "explicit") {
          return { ok: false, reason: "SymPy found only an implicit relation for this equation, which can't be independently verified — refusing to show it." };
        }
        if (!verifyNthOrder(u.text, equationText, order)) {
          return { ok: false, reason: "SymPy returned an answer, but it did not independently verify against the equation — refusing to show a result this site cannot confirm." };
        }
        return { ok: true, result: u.text, classification: parsed.classification, order, verified: true };
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };

  return ODESolver;
});
