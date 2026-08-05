/* Shared SymPy-integration fallback — factored out of integral-calculator.js so the other
   technique pages (u-sub, trig-sub, algebraic-sub, completing-the-square, by-parts, partial
   fractions) don't each duplicate the same ~80 lines. One implementation, many callers, same
   rule this codebase already follows elsewhere (algorithms.js / calculus-symbolic.js).

   Same discipline as integral-calculator.js: SymPy is never trusted blindly. Its answer is
   independently re-verified by numeric finite-difference against the integrand before it is
   ever returned as ok:true — this file shares no verification code with SymPy itself or with
   the kernel's own checks. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SympyIntegrateFallback = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SympyIntegrateFallback = {};

  // SymPy's str() output is Python syntax: ** for power (site/math.js convention is ^),
  // Abs(...) capitalized (math.js wants lowercase abs).
  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  /* Like Engine.compileFx, but evaluates log/ln on the REAL branch (Math.log(Math.abs(v)))
     instead of math.js's complex-valued log — SymPy's antiderivatives routinely contain a bare
     log(x-r) that is genuinely only real-valued on one side of r (the textbook convention
     "the antiderivative is ln|x-r|, not ln(x-r)") — and does NOT smoke-test at a fixed point
     before returning ok:true, since that fixed point can itself land outside a branch-
     restricted domain. Domain issues are handled per-sample-point by the caller instead. */
  function compileRealFx(exprStr, variable) {
    try {
      if (!exprStr || !exprStr.trim()) return { ok: false, error: "Enter an expression." };
      const node = math.parse(exprStr);
      const code = node.compile();
      const realLog = (v) => Math.log(Math.abs(v));
      const fn = (val) => {
        const scope = { log: realLog, ln: realLog };
        scope[variable] = val;
        const r = code.evaluate(scope);
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      return { ok: true, fn };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }
  SympyIntegrateFallback.compileRealFx = compileRealFx;

  // Independent numeric finite-difference check — shares no code with SymPy's own internal
  // verification (it has none exposed to us anyway) or with the kernel's checks.
  function verifyNumerically(resultText, integrandText, variable) {
    const F = compileRealFx(resultText, variable);
    const f = compileRealFx(integrandText, variable);
    if (!F.ok || !f.ok) return false;
    const h = 1e-5;
    let usable = 0;
    for (const x of [0.37, 0.83, 1.29, 1.71, 2.13, -0.61, -1.47]) {
      let fp, gx;
      try { fp = (F.fn(x + h) - F.fn(x - h)) / (2 * h); } catch (e) { continue; }
      try { gx = f.fn(x); } catch (e) { continue; }
      if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
      usable++;
      if (Math.abs(fp - gx) > 1e-3 * Math.max(1, Math.abs(gx))) return false;
    }
    return usable >= 3;
  }
  SympyIntegrateFallback.verifyNumerically = verifyNumerically;

  /* The one function pages actually call: try SymPy, normalize its output, verify it
     independently, and resolve with a plain {ok, result, verified, reason} object — never
     rejects, so a caller can always .then() into its own render/refuse branching. */
  SympyIntegrateFallback.solve = function (integrand, variable) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The advanced SymPy solver isn't available on this page." });
    }
    return SympyClient.integrate(integrand, variable)
      .then((out) => {
        const normalized = normalizeSympyText(out.resultText);
        if (!verifyNumerically(normalized, integrand, variable)) {
          return { ok: false, reason: "SymPy returned an answer, but it did not independently verify against the integrand — refusing to show a result this site cannot confirm." };
        }
        return { ok: true, result: normalized, verified: true };
      })
      .catch((err) => ({ ok: false, reason: err.message }));
  };

  return SympyIntegrateFallback;
});
