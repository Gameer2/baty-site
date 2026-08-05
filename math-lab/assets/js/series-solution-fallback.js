/* Series Solutions page fallback — SymPy's power-series dsolve hints, wrapped.

   A genuinely different verification shape from every other SymPy fallback on this site: the
   candidate "solution" is a TRUNCATED polynomial, not an exact closed form, so it can never
   satisfy p(x)y'' + q(x)y' + r(x)y = 0 exactly away from the expansion point — only
   approximately, with the residual shrinking as x approaches that point (that IS what "this
   series solves the ODE near x0" means). So instead of checking the residual is ~0 at fixed
   sample points, this checks the residual SHRINKS as a sequence of points geometrically
   approach the expansion point — the actual content of the claim being verified.

   The safety gate that matters most here isn't in this file: sympy-worker.js's
   _series_solution computes the indicial equation's roots itself and refuses (rather than
   calling SymPy's '2nd_power_series_regular' hint) whenever those roots are repeated or
   differ by an integer — verified directly against Bessel's equation (orders 0 and 1) that
   the hint silently returns an INCOMPLETE general solution in exactly those cases, no error
   raised. This file's job is only the numeric confirmation of what SymPy actually returned. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ode-solver.js"));
  } else {
    root.SeriesSolutionFallback = factory(root.ODESolver);
  }
})(typeof self !== "undefined" ? self : this, function (ODESolver) {
  "use strict";

  const SeriesSolutionFallback = {};

  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  /* Residual = p(x)*y''(x) + q(x)*y'(x) + r(x)*y(x), evaluated with the TRUE (concrete-
     constant) truncated series and its exact derivatives. Checked at four points shrinking
     geometrically toward the expansion point — confirms the residual actually decays as the
     claim requires, rather than merely being small by coincidence at one arbitrary point.
     compileRealFx / withArbitraryConstants are the ODESolver shared versions (same arbitrary
     values for C1/C2 the local copies used; ODESolver.compileRealFx also handles DiracDelta /
     Heaviside / log, a strict superset). */
  function residualShrinksTowardPoint(data, point) {
    const P = ODESolver.compileRealFx(data.p), Q = ODESolver.compileRealFx(data.q), R = ODESolver.compileRealFx(data.r);
    const Y = ODESolver.compileRealFx(ODESolver.withArbitraryConstants(data.y));
    const YP = ODESolver.compileRealFx(ODESolver.withArbitraryConstants(data.yp));
    const YPP = ODESolver.compileRealFx(ODESolver.withArbitraryConstants(data.ypp));
    if (![P, Q, R, Y, YP, YPP].every((c) => c.ok)) return false;

    function residualAt(x) {
      const p = P.fn(x), q = Q.fn(x), r = R.fn(x);
      const y = Y.fn(x), yp = YP.fn(x), ypp = YPP.fn(x);
      const val = p * ypp + q * yp + r * y;
      return Number.isFinite(val) ? Math.abs(val) : null;
    }

    const h = 0.06;
    const residuals = [];
    for (const frac of [1, 0.5, 0.25, 0.125]) {
      // Approach from whichever side of the (possibly singular) point is evaluable — try
      // both, since a regular singular point often only has a real series on one side (e.g.
      // sqrt(x) terms need x > point).
      let v = null;
      try { v = residualAt(point + h * frac); } catch (e) { /* try the other side */ }
      if (v === null) { try { v = residualAt(point - h * frac); } catch (e) { /* neither side usable */ } }
      if (v === null || !Number.isFinite(v)) return false;
      residuals.push(v);
    }
    // A per-step strict-decrease requirement breaks once the residual is already near
    // floating-point noise (a very accurate series hits ~1e-13 residuals within one or two
    // halvings, where further "decrease" is meaningless sign-flipping noise, not a failure).
    // So: any residual already effectively zero passes outright; otherwise require genuine
    // decay from the farthest point to the nearest.
    const NOISE_FLOOR = 1e-9;
    if (residuals[residuals.length - 1] < NOISE_FLOOR) return true;
    return residuals[residuals.length - 1] / residuals[0] < 0.3; // genuine decay, not noise
  }

  SeriesSolutionFallback.solve = function (equationText, point, order) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The advanced solver isn't available on this page." });
    }
    return SympyClient.seriesSolution(equationText, point, order)
      .then((out) => {
        let data;
        try { data = JSON.parse(out.resultText); } catch (e) {
          return { ok: false, reason: "Couldn't read the solver's response." };
        }
        data = {
          kind: data.kind,
          y: normalizeSympyText(data.y), yp: normalizeSympyText(data.yp), ypp: normalizeSympyText(data.ypp),
          p: normalizeSympyText(data.p), q: normalizeSympyText(data.q), r: normalizeSympyText(data.r),
          point: parseFloat(data.point),
        };
        if (!residualShrinksTowardPoint(data, data.point)) {
          return { ok: false, reason: "SymPy returned a series, but the residual didn't shrink toward the expansion point as claimed — refusing to show an unconfirmed result." };
        }
        return { ok: true, kind: data.kind, series: data.y, point: data.point, verified: true };
      })
      .catch((err) => ({ ok: false, reason: err.message }));
  };

  return SeriesSolutionFallback;
});
