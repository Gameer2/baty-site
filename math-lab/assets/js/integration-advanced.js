/* Calculus Engine — advanced integration techniques.

   Companion to calculus-symbolic.js, which already ships the four named textbook techniques
   (u-substitution, by parts, partial fractions, trig substitution). This module adds the two
   that were missing, both of which are standard Stewart §7.4–§7.5 material:

     - algebraicSubstitution  u = ⁿ√(ax+b)   — rationalises a radical of a linear expression
     - completeTheSquare      x²+bx+c → (x+b/2)² + k, then integrate in the shifted variable

   Both were identified by tests/bench/reachability.js as the largest reachable gap: five of
   the twelve measured integration failures belong to these two techniques, and nerdamer solves
   every one of them correctly once the rewrite is done for it.

   THE ONE IDEA THAT MAKES THESE WORK — reduceRadical() below. nerdamer will not simplify
   √(u²) past abs(u), and will not reduce √(cosh(t)²−1) at all, because doing so requires
   knowing the sign of the argument. That is an assumptions system's job and nerdamer has none
   (see docs/kernel/01_CURRENT_STATE.md §4). Rather than assume, this module *proves* the
   reduction numerically on the substitution's own domain before applying it — so a reduction
   is only ever used where it has been shown valid, never where it was merely plausible.

   Same discipline as the rest of the engine: every result is verified before it is returned,
   and a failed check yields ok:false with a reason rather than a confident wrong formula.

   Depends on calc-core.js (dependency injection + verified helpers), exactly like
   calculus-symbolic.js. In the browser it is picked up as a global; in Node it is required
   directly and configured via IntegrationAdvanced.configure(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.IntegrationAdvanced = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const IntegrationAdvanced = {};

  const CalcCore =
    (typeof module === "object" && module.exports)
      ? require("./calc-core.js")
      : (typeof self !== "undefined" ? self.CalcCore : root.CalcCore);

  if (!CalcCore) {
    throw new Error("IntegrationAdvanced requires calc-core.js to be loaded first.");
  }

  const cas = CalcCore.cas;
  const tryStr = CalcCore.tryStr;
  const toTeX = CalcCore.toTeX;
  const pretty = CalcCore.pretty;
  const numericallyEqual = CalcCore.numericallyEqual;
  const compileFn = CalcCore.compileFn;
  const fdVerifyAntideriv = CalcCore.fdVerifyAntideriv;
  const kernelTidy = CalcCore.tidy;
  const kernelBridge = CalcCore.kernel;

  IntegrationAdvanced.configure = function (deps) {
    CalcCore.configure(deps);
    return IntegrationAdvanced;
  };

  // Resolved lazily (not at module load) because in Node the two modules can load in either
  // order depending on the caller's require() sequence; in the browser/worker both are
  // already globals by the time any page code calls autoIntegrate.
  function calculusSymbolic() {
    if (typeof module === "object" && module.exports) return require("./calculus-symbolic.js");
    return typeof self !== "undefined" ? self.CalculusSymbolic : root.CalculusSymbolic;
  }

  /* ============================== AUTOMATIC TECHNIQUE SELECTION ==============================

     Every technique above (and the four in calculus-symbolic.js) is reachable only by a
     student explicitly choosing its page — by design, since the site teaches "recognise which
     technique applies," not "get an answer." But nothing in the engine could previously answer
     "which of these solves ∫f dx", and tests/bench/baseline.js measured the smoke corpus
     entirely against raw nerdamer integrate() — bypassing every one of these techniques even
     though most of them solve the raw-nerdamer failures outright (see the reading in
     04_BUILD_PHASES.md Phase 2's status note: 11 of the 12 measured smoke-corpus failures
     already succeed once routed through the matching named technique; only one needed an
     actual fix, made above in calculus-symbolic.js's trigSubstitution).

     autoIntegrate is that dispatcher: try each technique in a fixed, deterministic order,
     return the first that succeeds, and fall back to raw nerdamer (still verified, same
     discipline as every technique here) only once every named technique has honestly refused. */
  IntegrationAdvanced.autoIntegrate = function (integrand, variable) {
    const v = variable || "x";
    requireIntegrand(integrand);
    cas();

    const CS = calculusSymbolic();
    const techniques = [
      ["rational integration (kernel)", (i, vv) => IntegrationAdvanced.kernelRationalIntegrate(i, vv)],
      ["u-substitution", (i, vv) => CS.uSubstitution(i, vv)],
      ["integration by parts", (i, vv) => CS.integrationByParts(i, vv)],
      ["partial fractions", (i, vv) => CS.partialFractions(i, vv)],
      ["trigonometric substitution", (i, vv) => CS.trigSubstitution(i, vv)],
      ["algebraic substitution", (i, vv) => IntegrationAdvanced.algebraicSubstitution(i, vv)],
      ["completing the square", (i, vv) => IntegrationAdvanced.completeTheSquare(i, vv)],
    ];

    const rejected = [];
    for (const [name, fn] of techniques) {
      let out;
      try { out = fn(integrand, v); } catch (e) { out = { ok: false, reason: "threw: " + (e && e.message) }; }
      if (out && out.ok) return Object.assign({}, out, { technique: out.technique || name });
      rejected.push({ technique: name, reason: out && out.reason });
    }

    // Last resort: nerdamer's own integrate(), still held to the same differentiate-back
    // gate as every named technique — never returned just because nothing else matched.
    const normalized = normalize(integrand);
    const raw = normalized === null ? null : integrateIn(normalized, v);
    if (raw !== null && verifyResult(raw, normalized, v)) {
      const tidied = kernelTidy(raw);
      const finalResult = tidied !== raw && verifyResult(tidied, normalized, v) ? tidied : raw;
      return {
        ok: true,
        technique: "direct integration",
        result: finalResult,
        latex: toTeX(finalResult) + " + C",
        verified: true,
        rejected,
      };
    }

    return {
      ok: false,
      reason: "No technique in this engine's toolkit solves this integral.",
      rejected,
    };
  };

  /* ============================== SHARED MACHINERY ============================== */

  /* Verify an antiderivative two independent ways and accept if either holds.

     fdVerifyAntideriv is tried FIRST and is the one that matters here: nerdamer's diff() is
     wrong on √(quadratic) forms (documented at tests/verify-calculus.js:198), which is exactly
     the shape both of these techniques produce. Using nerdamer's derivative alone would reject
     correct answers. numericallyEqual is kept as a second opinion for the non-radical results. */
  function verifyResult(result, integrand, v) {
    if (fdVerifyAntideriv(result, integrand, v)) return true;
    const d = tryStr(() => cas()("diff(" + result + "," + v + ")"));
    return d !== null && numericallyEqual(d, integrand, v);
  }

  /* ============================== KERNEL RATIONAL INTEGRATION (Phase 3) ==============================

     Kernel-first, fall-back-on-refusal: this is the exact ∫P(x)/Q(x)dx algorithm from
     docs/kernel/04_BUILD_PHASES.md Phase 3 (assets/js/kernel/rational-integrate.js), reached
     through CalcCore.kernel() the same way tidy() reaches the kernel's simplify() — never
     required directly, so a missing/unloadable kernel degrades to "this technique refuses,
     try the next one" rather than breaking the page (same strangler-fig discipline as bridge.js).

     Runs FIRST in autoIntegrate's technique list, ahead of the existing nerdamer-based
     "partial fractions" technique, because the known bug this fixes (wrong partial-fraction
     decomposition on repeated linear factors, e.g. 1/((x-1)^2(x+2))) lives in that nerdamer
     path. Any input the kernel does not recognise as a rational function of `variable`, or
     any denominator factor it honestly refuses (irreducible degree>=3, or an irreducible
     quadratic with real irrational roots — both need the Q(alpha)/Rothstein-Trager follow-up),
     comes back ok:false here and falls through to every technique below exactly as if this
     one did not exist. */
  IntegrationAdvanced.kernelRationalIntegrate = function (integrand, variable) {
    const v = variable || "x";
    requireIntegrand(integrand);
    cas();
    const normalized = normalize(integrand);
    if (normalized === null) {
      return { ok: false, reason: "Couldn't parse the integrand.", rejected: [] };
    }
    const kb = kernelBridge();
    if (!kb || typeof kb.integrateRationalText !== "function") {
      return { ok: false, reason: "The kernel rational-integration bridge is unavailable.", rejected: [] };
    }
    const out = kb.integrateRationalText(normalized, v);
    if (!out.ok) {
      return { ok: false, reason: out.reason || "The kernel refused this rational function.", rejected: [] };
    }
    if (!verifyResult(out.resultText, normalized, v)) {
      return { ok: false, reason: "The kernel's antiderivative failed the differentiate-back check.", rejected: [] };
    }
    const tidied = kernelTidy(out.resultText);
    const finalResult = tidied !== out.resultText && verifyResult(tidied, normalized, v) ? tidied : out.resultText;
    return {
      ok: true,
      technique: "rational integration (kernel)",
      result: finalResult,
      latex: toTeX(finalResult) + " + C",
      verified: true,
      rejected: [],
    };
  };

  function matchParen(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  /* Reduce every √(E) in `s` to a non-negative closed form, but ONLY where the reduction is
     numerically demonstrated to hold across `domain`.

     This stands in for the assumptions system the kernel does not yet have. `√(u²) → u` is
     valid when u ≥ 0 and wrong when u < 0; rather than assert either, we evaluate both sides
     on the interval the substitution actually maps into and require exact agreement at every
     sampled point (and at least three usable ones). A candidate that disagrees anywhere — or
     that cannot be sampled — is rejected and the radical is left alone.

     When docs/kernel Phase 1 lands, this function is the first thing to replace: the domain
     sampling becomes an assumption query, and the reduction becomes a rewrite rule. */
  function reduceRadical(s, v, domain, candidates) {
    const KEEP = "KEEP";
    let guard = 0;
    while (guard++ < 30) {
      const idx = s.indexOf("sqrt(");
      if (idx === -1) break;
      const close = matchParen(s, idx + 4);
      if (close === -1) break;
      const inner = s.slice(idx + 5, close);

      let chosen = null;
      for (const cand of candidates) {
        const lhs = compileFn("sqrt(" + inner + ")", v);
        const rhs = compileFn(cand, v);
        if (!lhs || !rhs) continue;
        let agree = 0, disagree = 0;
        for (const t of domain) {
          let a, b;
          try { a = lhs.evaluate({ [v]: t }); b = rhs.evaluate({ [v]: t }); } catch (e) { continue; }
          if (typeof a !== "number" || typeof b !== "number") continue;
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          if (Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a))) agree++; else disagree++;
        }
        if (agree >= 3 && disagree === 0) { chosen = cand; break; }
      }

      if (chosen === null) {
        // Not reducible on this domain — mark it so the scan moves past it, restore later.
        s = s.slice(0, idx) + KEEP + "(" + inner + ")" + s.slice(close + 1);
        continue;
      }
      s = s.slice(0, idx) + "(" + chosen + ")" + s.slice(close + 1);
    }
    return s.split(KEEP).join("sqrt");
  }

  function integrateIn(expr, v) {
    const r = tryStr(() => cas()("integrate(" + expr + "," + v + ")"));
    if (r === null || /integrate\s*\(/.test(r)) return null;
    return r;
  }

  function normalize(integrand) {
    return tryStr(() => cas()(integrand).toString());
  }

  function requireIntegrand(integrand) {
    if (typeof integrand !== "string" || integrand.trim() === "") {
      throw new Error("The integrand must be a non-empty expression string.");
    }
  }

  /* ========================== ALGEBRAIC SUBSTITUTION ==========================

     ∫ f(x, ⁿ√(ax+b)) dx  with  u = ⁿ√(ax+b),  x = (uⁿ − b)/a,  dx = (n/a)·uⁿ⁻¹ du

     The point of the technique: the radical disappears entirely and what is left is usually a
     rational or elementary function the CAS handles immediately. Measured examples —
     ∫x√(x+1)dx, ∫dx/(1+√x), ∫e^√x dx — all of which nerdamer refuses outright but solves
     without complaint once the substitution is performed for it. */

  // Finds ⁿ√(linear in v). Returns {a, b, n, radStr} or null.
  function findLinearRadical(exprStr, v) {
    // sqrt(...) — degree 2
    let idx = exprStr.indexOf("sqrt(");
    while (idx !== -1) {
      const close = matchParen(exprStr, idx + 4);
      if (close === -1) break;
      const inner = exprStr.slice(idx + 5, close);
      const lin = linearCoeffs(inner, v);
      if (lin) return { a: lin.a, b: lin.b, n: 2, radStr: exprStr.slice(idx, close + 1) };
      idx = exprStr.indexOf("sqrt(", idx + 1);
    }
    return null;
  }

  // Returns {a, b} if `exprStr` is exactly a·v + b with numeric a ≠ 0, else null.
  function linearCoeffs(exprStr, v) {
    const f = compileFn(exprStr, v);
    if (!f) return null;
    let y0, y1, y2;
    try {
      y0 = f.evaluate({ [v]: 0 });
      y1 = f.evaluate({ [v]: 1 });
      y2 = f.evaluate({ [v]: 2 });
    } catch (e) { return null; }
    if (![y0, y1, y2].every((y) => typeof y === "number" && Number.isFinite(y))) return null;
    const a = y1 - y0;
    if (Math.abs(a) < 1e-12) return null;                    // constant — not a substitution
    if (Math.abs(y2 - (2 * a + y0)) > 1e-9) return null;     // not linear
    return { a: a, b: y0 };
  }

  IntegrationAdvanced.algebraicSubstitution = function (integrand, variable) {
    const v = variable || "x";
    requireIntegrand(integrand);

    cas();
    const normalized = normalize(integrand);
    if (normalized === null) throw new Error("Couldn't parse the integrand: " + integrand);

    const rad = findLinearRadical(normalized, v);
    if (!rad) {
      return {
        ok: false,
        reason: "Algebraic substitution applies when the integrand contains a radical of a linear expression, √(ax+b) — none is present here.",
        rejected: []
      };
    }

    const { a, b, n } = rad;
    const U = v === "u" ? "u_1" : "u";
    const xOfU = "((" + U + "^" + n + ")-(" + b + "))/(" + a + ")";
    const dxOfU = "(" + n + "/(" + a + "))*" + U + "^" + (n - 1);
    const backSub = "(" + (a === 1 ? "" : "") + "nthRoot(" + rad.a + "*" + v + "+" + rad.b + "," + n + "))";
    const uOfX = n === 2 ? "sqrt(" + a + "*" + v + "+" + b + ")" : backSub;

    // u = ⁿ√(ax+b) is non-negative by construction, so √(u^k) reduces cleanly. The domain
    // below is the image of the substitution; reduceRadical proves each reduction on it.
    const domain = [0.31, 0.63, 0.97, 1.34, 1.76, 2.21, 2.68];

    let inU = tryStr(() => cas()(normalized).sub(v, xOfU).toString());
    if (inU === null) {
      return { ok: false, reason: "The substitution didn't apply cleanly to the integrand.", rejected: [] };
    }
    inU = reduceRadical(inU, U, domain, [U, "(" + U + ")^2", "1"]);

    let body = tryStr(() => cas()("(" + inU + ")*(" + dxOfU + ")").simplify().toString());
    if (body === null) body = "(" + inU + ")*(" + dxOfU + ")";
    body = reduceRadical(body, U, domain, [U, "(" + U + ")^2", "1"]);
    // nerdamer leaves abs() where it could not decide the sign; on this domain u ≥ 0.
    body = body.split("abs(" + U + ")").join("(" + U + ")");

    const antiderivU = integrateIn(body, U);
    if (antiderivU === null) {
      return {
        ok: false,
        reason: "The substitution removed the radical but the resulting integral in " + U + " could not be evaluated.",
        rejected: [{ u: uOfX, why: "reduced integral not elementary here" }]
      };
    }

    const result = tryStr(() => cas()(antiderivU).sub(U, uOfX).toString());
    if (result === null) {
      return { ok: false, reason: "Back-substitution failed.", rejected: [{ u: uOfX, why: "back-substitution failed" }] };
    }

    const tidy = kernelTidy(result);
    const finalResult = verifyResult(tidy, normalized, v) ? tidy : result;

    if (!verifyResult(finalResult, normalized, v)) {
      return {
        ok: false,
        reason: "The candidate antiderivative failed the differentiate-back check — try a different technique.",
        rejected: [{ u: uOfX, why: "failed the differentiate-back check" }]
      };
    }

    return {
      ok: true,
      technique: "algebraic substitution",
      u: uOfX,
      substitution: v + " = " + pretty(xOfU),
      integrandInU: pretty(body),
      antiderivativeInU: antiderivU,
      result: finalResult,
      latex: toTeX(finalResult) + " + C",
      verified: true,
      rejected: [],
      steps: buildAlgebraicSteps(normalized, v, U, uOfX, xOfU, dxOfU, body, antiderivU, finalResult)
    };
  };

  function buildAlgebraicSteps(integrand, v, U, uOfX, xOfU, dxOfU, body, antiderivU, result) {
    const d = "\\,d";
    return [
      {
        rule: "The integral",
        text: "∫ " + integrand + " d" + v,
        latex: "\\int " + toTeX(integrand) + d + v
      },
      {
        rule: "Substitute to clear the radical",
        text: U + " = " + uOfX + ",  so " + v + " = " + pretty(xOfU) + ",  d" + v + " = " + pretty(dxOfU) + " d" + U,
        latex: U + " = " + toTeX(uOfX) + ", \\qquad " + v + " = " + toTeX(pretty(xOfU)) + ", \\qquad d" + v + " = " + toTeX(pretty(dxOfU)) + d + U
      },
      {
        rule: "Rewrite — the radical is gone",
        text: "∫ " + pretty(body) + " d" + U,
        latex: "\\int " + toTeX(pretty(body)) + d + U
      },
      {
        rule: "Integrate",
        text: antiderivU + " + C",
        latex: toTeX(antiderivU) + " + C"
      },
      {
        rule: "Back-substitute " + U + " = " + uOfX,
        text: result + " + C",
        latex: toTeX(result) + " + C"
      },
      {
        rule: "Check by differentiating",
        text: "d/d" + v + " [" + result + "] matches the integrand  ✓",
        latex: "\\frac{d}{d" + v + "}\\left[" + toTeX(result) + "\\right] = " + toTeX(integrand)
      }
    ];
  }

  /* =========================== COMPLETING THE SQUARE ===========================

     x² + bx + c = (x + b/2)² + k,  k = c − b²/4,  then u = x + b/2.

     Turns an unrecognisable quadratic into one of the standard forms — u²+k, u²−k, or their
     radicals — for which the antiderivative is an arctan, a log, or an inverse hyperbolic.
     Measured examples: ∫dx/(x²+2x+5) (which nerdamer answers with an expression whose
     denominator is algebraically zero) and ∫dx/√(x²+4x+13) (which it refuses). */

  // Returns {b, c} if `exprStr` is exactly v² + b·v + c, else null.
  function monicQuadraticCoeffs(exprStr, v) {
    const f = compileFn(exprStr, v);
    if (!f) return null;
    let y0, y1, y2, y3;
    try {
      y0 = f.evaluate({ [v]: 0 });
      y1 = f.evaluate({ [v]: 1 });
      y2 = f.evaluate({ [v]: 2 });
      y3 = f.evaluate({ [v]: 3 });
    } catch (e) { return null; }
    if (![y0, y1, y2, y3].every((y) => typeof y === "number" && Number.isFinite(y))) return null;
    const A = (y2 - 2 * y1 + y0) / 2;          // leading coefficient
    if (Math.abs(A - 1) > 1e-9) return null;   // only the monic case here
    const B = y1 - y0 - A;
    const C = y0;
    const predict3 = A * 9 + B * 3 + C;
    if (Math.abs(y3 - predict3) > 1e-9) return null;   // not quadratic
    if (Math.abs(B) < 1e-12) return null;              // already centred — nothing to complete
    return { b: B, c: C };
  }

  // Finds the first monic quadratic in v inside the expression. Returns {text, b, c} or null.
  function findQuadratic(exprStr, v) {
    const spots = [];
    let i = exprStr.indexOf("sqrt(");
    while (i !== -1) { const cl = matchParen(exprStr, i + 4); if (cl === -1) break; spots.push([i + 5, cl]); i = exprStr.indexOf("sqrt(", i + 1); }
    for (let j = 0; j < exprStr.length; j++) {
      if (exprStr[j] === "(") { const cl = matchParen(exprStr, j); if (cl !== -1) spots.push([j + 1, cl]); }
    }
    for (const [s, e] of spots) {
      const frag = exprStr.slice(s, e);
      const q = monicQuadraticCoeffs(frag, v);
      if (q) return { text: frag, b: q.b, c: q.c };
    }
    return null;
  }

  // The standard forms nerdamer cannot evaluate on its own.
  function standardForm(shiftedIntegrand, U, k) {
    const kAbs = Math.abs(k);
    const forms = [
      // ∫ du/√(u²+k)  = log(u + √(u²+k))
      { test: "1/sqrt(" + U + "^2+" + k + ")", anti: "log(" + U + "+sqrt(" + U + "^2+" + k + "))" },
      { test: "sqrt(" + U + "^2+" + k + ")^(-1)", anti: "log(" + U + "+sqrt(" + U + "^2+" + k + "))" },
      // ∫ du/√(u²−k)  = log(u + √(u²−k))
      { test: "1/sqrt(" + U + "^2-" + kAbs + ")", anti: "log(" + U + "+sqrt(" + U + "^2-" + kAbs + "))" },
      { test: "sqrt(" + U + "^2-" + kAbs + ")^(-1)", anti: "log(" + U + "+sqrt(" + U + "^2-" + kAbs + "))" }
    ];
    const norm = (s) => { const r = tryStr(() => cas()(s).toString()); return r === null ? s : r; };
    const target = norm(shiftedIntegrand);
    for (const f of forms) if (norm(f.test) === target) return f.anti;
    return null;
  }

  // Renders "+ n" as "- 3" instead of "+ -3" when n is negative — completing the square
  // routinely produces a negative shift/constant, and naive concatenation showed the bare
  // minus sign glued onto a plus (same bug class as the Numerical audit's sign-string bugs).
  function signedTerm(n, wrapFn) {
    wrapFn = wrapFn || ((s) => s);
    const num = Number(n);
    return (num < 0 ? " - " : " + ") + wrapFn(String(Math.abs(num)));
  }
  function signedParenTerm(n, wrapFn) {
    wrapFn = wrapFn || ((s) => s);
    const num = Number(n);
    return (num < 0 ? " - (" : " + (") + wrapFn(String(Math.abs(num))) + ")";
  }

  IntegrationAdvanced.completeTheSquare = function (integrand, variable) {
    const v = variable || "x";
    requireIntegrand(integrand);

    cas();
    const normalized = normalize(integrand);
    if (normalized === null) throw new Error("Couldn't parse the integrand: " + integrand);

    const quad = findQuadratic(normalized, v);
    if (!quad) {
      return {
        ok: false,
        reason: "Completing the square applies to an integrand containing a quadratic x²+bx+c with b ≠ 0 — none is present here.",
        rejected: []
      };
    }

    const shift = quad.b / 2;
    const k = quad.c - shift * shift;
    const U = v === "u" ? "u_1" : "u";

    // Replace the quadratic by its completed form written in U, i.e. x²+bx+c → U² + k.
    const shifted = normalized.split(quad.text).join("(" + U + "^2+(" + k + "))");
    if (shifted === normalized) {
      return { ok: false, reason: "Couldn't rewrite the quadratic in completed-square form.", rejected: [] };
    }

    let antiderivU = integrateIn(shifted, U);
    if (antiderivU === null) antiderivU = standardForm(shifted, U, k);
    if (antiderivU === null) {
      return {
        ok: false,
        reason: "Completing the square produced a standard form that could not be integrated — try trigonometric substitution.",
        rejected: [{ u: v + " + " + shift, why: "shifted integral not evaluated" }]
      };
    }

    const result = tryStr(() => cas()(antiderivU).sub(U, "(" + v + "+(" + shift + "))").toString());
    if (result === null) {
      return { ok: false, reason: "Back-substitution failed.", rejected: [] };
    }

    const tidy = kernelTidy(result);
    const finalResult = verifyResult(tidy, normalized, v) ? tidy : result;

    if (!verifyResult(finalResult, normalized, v)) {
      return {
        ok: false,
        reason: "The candidate antiderivative failed the differentiate-back check — try a different technique.",
        rejected: [{ u: v + " + " + shift, why: "failed the differentiate-back check" }]
      };
    }

    return {
      ok: true,
      technique: "completing the square",
      completedSquare: "(" + v + signedTerm(shift, pretty) + ")^2" + signedParenTerm(k, pretty),
      u: v + signedTerm(shift, pretty),
      integrandInU: pretty(shifted),
      antiderivativeInU: antiderivU,
      result: finalResult,
      latex: toTeX(finalResult) + " + C",
      verified: true,
      rejected: [],
      steps: buildSquareSteps(normalized, v, U, quad, shift, k, shifted, antiderivU, finalResult)
    };
  };

  function buildSquareSteps(integrand, v, U, quad, shift, k, shifted, antiderivU, result) {
    const d = "\\,d";
    const sq = "(" + v + signedTerm(shift) + ")^2" + signedParenTerm(k);
    return [
      {
        rule: "The integral",
        text: "∫ " + integrand + " d" + v,
        latex: "\\int " + toTeX(integrand) + d + v
      },
      {
        rule: "Complete the square",
        text: quad.text + " = " + sq,
        latex: toTeX(quad.text) + " = " + toTeX(sq)
      },
      {
        rule: "Substitute",
        text: U + " = " + v + signedTerm(shift) + ",  d" + U + " = d" + v,
        latex: U + " = " + v + signedTerm(shift, toTeX) + ", \\qquad d" + U + " = d" + v
      },
      {
        rule: "Now a standard form",
        text: "∫ " + pretty(shifted) + " d" + U,
        latex: "\\int " + toTeX(pretty(shifted)) + d + U
      },
      {
        rule: "Integrate, then back-substitute",
        text: antiderivU + "  →  " + result + " + C",
        latex: toTeX(antiderivU) + " \\;\\longrightarrow\\; " + toTeX(result) + " + C"
      },
      {
        rule: "Check by differentiating",
        text: "d/d" + v + " [" + result + "] matches the integrand  ✓",
        latex: "\\frac{d}{d" + v + "}\\left[" + toTeX(result) + "\\right] = " + toTeX(integrand)
      }
    ];
  }

  return IntegrationAdvanced;
});
