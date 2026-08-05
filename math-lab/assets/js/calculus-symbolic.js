/* Calculus Engine — pure, DOM-free symbolic methods.

   Companion to algorithms.js, deliberately kept separate: algorithms.js returns numeric
   iteration arrays (approximate, converging), while everything here returns an exact
   closed form plus the derivation that produced it — {ok, result, latex, steps[], verified}.
   Same "one implementation, two callers" rule: the browser pages wire this to the UI,
   tests/verify-calculus.js requires it directly in Node.

   Every result is verified before it is returned: the antiderivative is differentiated back
   and compared numerically against the original integrand. A step engine that emits a
   confident, wrong derivation is worse than one that says "I can't do this" — so on a failed
   check this returns ok:false rather than the formula. Same discipline as the symbolic
   integration in ode-symbolic.js.

   Depends on nerdamer (algebra) and math.js (expression-tree walking). Both are already
   vendored site-wide. In the browser they are picked up from globals automatically; in Node
   they must be injected via CalculusSymbolic.configure(), because the vendored nerdamer
   bundle is not directly require()-able. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CalculusSymbolic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CalculusSymbolic = {};

  /* Shared CAS core — dependency injection + engine-agnostic helpers (cas, toTeX, pretty,
     numericallyEqual, finite-difference verification). Extracted to calc-core.js so the same
     verified helpers back Calculus, ODE, and the forthcoming Complex Analysis engine. Loaded
     as a global in the browser/worker (a <script>/importScripts sibling that runs first) and
     required directly in Node. */
  const CalcCore =
    (typeof module === "object" && module.exports)
      ? require("./calc-core.js")
      : (typeof self !== "undefined" ? self.CalcCore : root.CalcCore);

  if (!CalcCore) {
    throw new Error("CalculusSymbolic requires calc-core.js to be loaded first.");
  }

  // Local aliases so the ~200 helper call sites below stay byte-for-byte unchanged.
  const cas = CalcCore.cas;
  const tryStr = CalcCore.tryStr;
  const toTeX = CalcCore.toTeX;
  const pretty = CalcCore.pretty;
  const varsOf = CalcCore.varsOf;
  const numericallyEqual = CalcCore.numericallyEqual;
  const compileFn = CalcCore.compileFn;
  const fdVerifyAntideriv = CalcCore.fdVerifyAntideriv;
  const symbolicDeriv = CalcCore.symbolicDeriv;
  const tidy = CalcCore.tidy;
  const kernelBridge = CalcCore.kernel;

  // The ~23 sites below that walk math.js's parse tree directly use this local binding.
  // It holds the CORE'S FACADE, never the raw library: the facade rewrites `ln(` to `log(`
  // on every parse, so a tree-walking site here sees exactly the expression nerdamer will
  // see. Binding the raw library instead would reopen the split-parser bug that
  // CalcCore.normalizeInput exists to close.
  let mathjs = null;
  function syncMath() {
    try { mathjs = CalcCore.math(); } catch (e) { mathjs = null; } // not injected yet
  }
  syncMath(); // browser/worker: math.min.js has already run by the time this file loads

  // Injected in Node by the test harness; auto-resolved from globals in the browser. Delegates
  // the library injection to the shared core, and keeps the local mathjs binding in sync.
  CalculusSymbolic.configure = function (deps) {
    CalcCore.configure(deps);
    syncMath();
  };

  /* ---------------- candidate generation ----------------

     The inner function of a composition is what u should be, so the candidates worth trying
     are exactly the compound subexpressions: arguments of function calls (sin(x^2) -> x^2),
     bases and exponents of powers ((2x+1)^5 -> 2x+1, e^(3x) -> 3x), and denominators.
     Collected by walking math.js's parse tree rather than by string matching, so that
     "x^2" inside "sin(x^2)" is found structurally instead of by a regex that would also
     match the wrong thing inside "sin(x^21)". */
  function candidateSubexpressions(exprStr, variable) {
    const found = new Map(); // string -> rank; Map keeps first-seen insertion order
    let tree;
    try {
      tree = mathjs.parse(exprStr);
    } catch (e) {
      return [];
    }

    function note(node, rank) {
      if (!node) return;
      let s;
      try { s = node.toString(); } catch (e) { return; }
      // A candidate must actually involve the integration variable and must be compound —
      // u = x is the identity substitution and u = 3 has du = 0.
      if (!s || s === variable) return;
      const v = varsOf(s);
      if (!v || v.indexOf(variable) === -1) return;
      if (!found.has(s) || found.get(s) > rank) found.set(s, rank);
    }

    tree.traverse(function (node) {
      if (node.type === "FunctionNode") {
        (node.args || []).forEach((a) => note(a, 0)); // sin(u), log(u), e^u ...
        // The call itself is a candidate too: in 1/(x*log(x)) the substitution is
        // u = log(x), which appears as a bare factor and so is never anyone's argument.
        note(node, 1);
      } else if (node.type === "OperatorNode") {
        if (node.op === "^") {
          note(node.args[0], 1); // base:     (2x+1)^5
          note(node.args[1], 0); // exponent: e^(3x)
        } else if (node.op === "/") {
          note(node.args[1], 1); // denominator
        }
      } else if (node.type === "ParenthesisNode") {
        note(node.content, 2);
      }
    });

    // Rank first (function arguments and exponents are the likeliest u), then prefer the
    // longer expression, which is the more specific guess when several are plausible.
    return Array.from(found.entries())
      .sort((a, b) => (a[1] - b[1]) || (b[0].length - a[0].length))
      .map((e) => e[0]);
  }

  /* numericallyEqual, SAMPLE_POINTS/MIN_HITS/TOL — moved to calc-core.js (aliased above). */

  /* ---------------- u-substitution ----------------

     integrand: string, e.g. "x*sin(x^2)". Returns
       { ok: true, technique, u, du, result, latex, verified, steps: [...] }
     or
       { ok: false, reason }.

     The search itself is the textbook rule read backwards: if the integrand is h(g(x))*g'(x),
     then dividing it by g'(x) must leave something expressible in g(x) alone. So for each
     candidate g, divide, substitute g -> u, and ask nerdamer which variables survive. If x
     is gone, the substitution was valid. */
  CalculusSymbolic.uSubstitution = function (integrand, variable) {
    const v = variable || "x";
    if (typeof integrand !== "string" || integrand.trim() === "") {
      throw new Error("The integrand must be a non-empty expression string.");
    }
    cas(); // fail fast with a clear message if the CAS was never configured

    let normalized;
    try {
      normalized = cas()(integrand).toString();
    } catch (e) {
      throw new Error("Couldn't parse the integrand: " + integrand);
    }

    // Pick a substitution symbol that cannot collide with something already in the integrand.
    const present = varsOf(normalized) || [];
    let U = "u";
    let k = 0;
    while (present.indexOf(U) !== -1) U = "u_" + ++k;

    const candidates = candidateSubexpressions(normalized, v);
    if (candidates.length === 0) {
      // `rejected` is present on every failure path, empty or not, so callers can render
      // "what was tried" without having to guard for the field being missing.
      return {
        ok: false,
        reason: "No compound subexpression to substitute — this integrand needs a different technique.",
        rejected: []
      };
    }

    const tried = [];
    for (const g of candidates) {
      const du = tryStr(() => cas()("diff(" + g + "," + v + ")"));
      if (du === null || du === "0") { tried.push({ u: pretty(g), why: "du/dx is zero" }); continue; }

      // integrand / g'(x), simplified before substituting so that the x's meant to cancel
      // actually do cancel — without the simplify() pass the leftover x survives textually
      // and every candidate looks like a failure.
      const quotient = tryStr(() => cas()("(" + normalized + ")/(" + du + ")").simplify());
      if (quotient === null) { tried.push({ u: pretty(g), why: "couldn't form the quotient" }); continue; }

      const inU = tryStr(() => cas()(quotient).sub(g, U));
      if (inU === null) { tried.push({ u: pretty(g), why: "substitution failed" }); continue; }

      const leftover = varsOf(inU);
      if (leftover === null) { tried.push({ u: pretty(g), why: "unreadable after substitution" }); continue; }
      if (leftover.indexOf(v) !== -1) { tried.push({ u: pretty(g), why: "still contains " + v }); continue; }

      const antiderivU = tryStr(() => cas()("integrate(" + inU + "," + U + ")"));
      if (antiderivU === null || /integrate\(/i.test(antiderivU)) {
        tried.push({ u: pretty(g), why: "the u-integral is itself unsolvable" });
        continue;
      }

      const result = tryStr(() => cas()(antiderivU).sub(U, g));
      if (result === null) { tried.push({ u: pretty(g), why: "back-substitution failed" }); continue; }

      // The whole point of the exercise: differentiate the answer and check it against the
      // integrand we started from. A candidate that cannot survive this is not reported.
      const checkDeriv = tryStr(() => cas()("diff(" + result + "," + v + ")"));
      const verified = checkDeriv !== null && numericallyEqual(checkDeriv, normalized, v);
      if (!verified) { tried.push({ u: pretty(g), why: "failed the differentiate-back check" }); continue; }

      return {
        ok: true,
        technique: "u-substitution",
        u: pretty(g),
        du: du,
        integrandInU: inU,
        antiderivativeInU: antiderivU,
        result: result,
        latex: toTeX(result) + " + C",
        verified: true,
        rejected: tried,
        steps: buildSteps(normalized, v, U, g, du, inU, antiderivU, result, checkDeriv)
      };
    }

    return {
      ok: false,
      reason: "No substitution worked — try another technique (by parts, partial fractions).",
      rejected: tried
    };
  };

  // The derivation ladder: one rule-annotated line per step, in the order a textbook writes
  // them. `latex` is what the page renders; `text` is the plain-string fallback used by the
  // Node tests and by any non-KaTeX context.
  function buildSteps(integrand, v, U, g, du, inU, antiderivU, result, checkDeriv) {
    const d = "\\,d";
    g = pretty(g);
    return [
      {
        rule: "The integral",
        text: "∫ " + integrand + " d" + v,
        latex: "\\int " + toTeX(integrand) + d + v
      },
      {
        rule: "Choose the substitution",
        text: U + " = " + g + ",  d" + U + " = " + du + " d" + v,
        latex: U + " = " + toTeX(g) + ", \\qquad d" + U + " = " + toTeX(du) + d + v
      },
      {
        rule: "Rewrite in terms of " + U,
        text: "∫ " + inU + " d" + U,
        latex: "\\int " + toTeX(inU) + d + U
      },
      {
        rule: "Integrate",
        text: antiderivU + " + C",
        latex: toTeX(antiderivU) + " + C"
      },
      {
        rule: "Back-substitute " + U + " = " + g,
        text: result + " + C",
        latex: toTeX(result) + " + C"
      },
      {
        rule: "Check by differentiating",
        text: "d/d" + v + " [" + result + "] = " + checkDeriv + "  ✓ matches the integrand",
        latex: "\\frac{d}{d" + v + "}\\left[" + toTeX(result) + "\\right] = " + toTeX(checkDeriv)
      }
    ];
  }

  /* ================================ INTEGRATION BY PARTS ================================

     ∫u dv = uv - ∫v du. u/dv are chosen by the LIATE heuristic (Logarithmic > Inverse trig >
     Algebraic > Trig > Exponential — earlier in that list is the better choice of u), applied
     to the integrand's TOP-LEVEL multiplicative factors (split via math.js's parse tree, same
     idea as candidateSubexpressions above but for "*" instead of function arguments).

     Only one round of manual decomposition is done here, not a recursive chain: nerdamer's
     own integrate() already resolves the REDUCED integral ∫v du in one call, including cases
     that textbook-wise need repeated by-parts (x^2*e^x, x^3*e^x) or the "solve for I" trick
     (e^x*sin(x)) — confirmed by direct experiment. So the derivation shows the one insight
     that is actually ours to teach (which factor is u and why) and lets the CAS do the
     mechanical antidifferentiation on both sides of the formula, exactly like u-substitution
     hands its rewritten integral to integrate() rather than solving it by hand. */

  // Splits "a*b*c" into ["a","b","c"] via math.js's parse tree (left-associative nested
  // multiply nodes), so the split is structural rather than a fragile string search.
  function splitTopLevelFactors(exprStr) {
    let node;
    try {
      node = mathjs.parse(exprStr);
      if (node.type === "ParenthesisNode") node = node.content;
    } catch (e) { return null; }

    const factors = [];
    function walk(n) {
      if (n.type === "OperatorNode" && n.op === "*" && n.args && n.args.length === 2) {
        walk(n.args[0]);
        walk(n.args[1]);
      } else {
        let s;
        try { s = n.toString(); } catch (e) { s = null; }
        if (s) factors.push(s);
      }
    }
    walk(node);
    return factors;
  }

  const LIATE_PATTERNS = [
    { rank: 0, name: "logarithmic", re: /\b(log|ln)\s*\(/i },
    { rank: 1, name: "inverse trig", re: /\b(asin|acos|atan|acot|asec|acsc|arcsin|arccos|arctan)\s*\(/i },
    { rank: 3, name: "trigonometric", re: /\b(sin|cos|tan|sec|csc|cot)\s*\(/i },
    { rank: 4, name: "exponential", re: /(?:^|[^a-zA-Z])e\^|\bexp\s*\(/i }
  ];
  // No matching function call at all (a bare power of the variable, e.g. "x", "x^2") is the
  // textbook "Algebraic" category, which sits in the MIDDLE of LIATE — above Trig/Exponential
  // but below Logarithmic/Inverse-trig — which is why its rank is 2, not last or first.
  function liateRank(factorStr) {
    for (const p of LIATE_PATTERNS) if (p.re.test(factorStr)) return { rank: p.rank, name: p.name };
    return { rank: 2, name: "algebraic" };
  }

  CalculusSymbolic.integrationByParts = function (integrand, variable) {
    const v = variable || "x";
    if (typeof integrand !== "string" || integrand.trim() === "") {
      throw new Error("The integrand must be a non-empty expression string.");
    }
    cas();

    let normalized;
    try { normalized = cas()(integrand).toString(); }
    catch (e) { throw new Error("Couldn't parse the integrand: " + integrand); }

    // math.js's own toString() spaces operators out ("e ^ x"), which is whitespace-sensitive
    // LIATE_PATTERNS would silently fail to match — round-trip each factor through nerdamer
    // for the compact form, same as pretty() does everywhere else in this file.
    const rawFactors = splitTopLevelFactors(normalized);
    const factors = rawFactors ? rawFactors.map((f) => pretty(f)) : null;
    if (!factors || !factors.length) {
      return { ok: false, reason: "Couldn't identify factors in this integrand to split for integration by parts.", rejected: [] };
    }

    const constFactors = [], varFactors = [];
    for (const fac of factors) {
      const vs = varsOf(fac);
      if (vs && vs.indexOf(v) !== -1) varFactors.push(fac); else constFactors.push(fac);
    }
    if (varFactors.length === 0) {
      return { ok: false, reason: "This integrand doesn't depend on " + v + " — nothing for integration by parts to do.", rejected: [] };
    }

    let uPart, dvPart, liateNote;
    if (varFactors.length === 1) {
      uPart = varFactors[0];
      dvPart = "1";
      liateNote = "only one factor involves " + v + "; take dv = d" + v + " (v = " + v + ")";
    } else {
      const ranked = varFactors.map((f) => Object.assign({ f }, liateRank(f)));
      ranked.sort((a, b) => a.rank - b.rank);
      uPart = ranked[0].f;
      dvPart = ranked.slice(1).map((r) => "(" + r.f + ")").join("*");
      liateNote = "LIATE: " + ranked[0].name + " (" + pretty(uPart) + ") beats " +
                  ranked.slice(1).map((r) => r.name + " (" + pretty(r.f) + ")").join(", ");
    }
    const constMult = constFactors.length ? constFactors.map((c) => "(" + c + ")").join("*") : null;

    const du = tryStr(() => cas()("diff(" + uPart + "," + v + ")"));
    if (du === null) {
      return { ok: false, reason: "Couldn't differentiate the chosen u = " + pretty(uPart) + ".", rejected: [] };
    }

    const vAntideriv = tryStr(() => cas()("integrate(" + dvPart + "," + v + ")"));
    if (vAntideriv === null || /integrate\(/i.test(vAntideriv)) {
      return {
        ok: false,
        reason: "dv = " + pretty(dvPart) + " d" + v + " has no elementary antiderivative — integration by parts doesn't apply with this split.",
        rejected: [{ u: pretty(uPart), why: "dv = " + pretty(dvPart) + " couldn't be integrated" }]
      };
    }

    // Deliberately NOT .simplify() here — confirmed by direct experiment that it can flip the
    // sign of an expression wholesale (e.g. "(x)*(-cos(x))-(-sin(x))" simplifies to something
    // that evaluates to the NEGATIVE of the unsimplified form). Plain re-parsing (what pretty()
    // does) still normalizes nerdamer's own output into its compact form without that risk;
    // the differentiate-back check below is what actually guards correctness either way.
    const reducedIntegrand = pretty("(" + vAntideriv + ")*(" + du + ")");
    const reducedResult = tryStr(() => cas()("integrate(" + reducedIntegrand + "," + v + ")"));
    if (reducedResult === null || /integrate\(/i.test(reducedResult)) {
      return {
        ok: false,
        reason: "The reduced integral ∫" + pretty(reducedIntegrand) + " d" + v + " has no elementary antiderivative either — try a different technique.",
        rejected: [{ u: pretty(uPart), why: "the reduced integral ∫v du is itself unsolvable" }]
      };
    }

    let result = pretty("(" + uPart + ")*(" + vAntideriv + ") - (" + reducedResult + ")");
    if (constMult) {
      result = pretty("(" + constMult + ")*(" + result + ")");
    }

    const checkDeriv = tryStr(() => cas()("diff(" + result + "," + v + ")"));
    const verified = checkDeriv !== null && numericallyEqual(checkDeriv, normalized, v);
    if (!verified) {
      return {
        ok: false,
        reason: "The candidate antiderivative failed the differentiate-back check — try a different technique.",
        rejected: [{ u: pretty(uPart), why: "result did not differentiate back to the integrand" }]
      };
    }

    return {
      ok: true,
      technique: "integration-by-parts",
      u: pretty(uPart),
      dv: pretty(dvPart) + " d" + v,
      du: du + " d" + v,
      vAntiderivative: vAntideriv,
      result,
      latex: toTeX(result) + " + C",
      verified: true,
      rejected: [],
      steps: buildByPartsSteps(normalized, v, uPart, dvPart, liateNote, du, vAntideriv, reducedIntegrand, reducedResult, result, checkDeriv, constMult)
    };
  };

  function buildByPartsSteps(integrand, v, uPart, dvPart, liateNote, du, vAntideriv, reducedIntegrand, reducedResult, result, checkDeriv, constMult) {
    const d = "\\,d";
    const steps = [
      { rule: "The integral", text: "∫ " + integrand + " d" + v, latex: "\\int " + toTeX(integrand) + d + v },
      {
        rule: "Choose u and dv",
        text: "u = " + pretty(uPart) + ",  dv = " + pretty(dvPart) + " d" + v + "  (" + liateNote + ")",
        latex: "u = " + toTeX(uPart) + ",\\qquad dv = " + toTeX(dvPart) + d + v
      },
      {
        rule: "Differentiate u, integrate dv",
        text: "du = " + du + " d" + v + ",  v = " + vAntideriv,
        latex: "du = " + toTeX(du) + d + v + ",\\qquad v = " + toTeX(vAntideriv)
      },
      {
        rule: "Apply ∫u dv = uv − ∫v du",
        text: pretty(uPart) + "·" + vAntideriv + " − ∫ " + reducedIntegrand + " d" + v,
        latex: toTeX(uPart) + "\\,(" + toTeX(vAntideriv) + ") - \\int " + toTeX(reducedIntegrand) + d + v
      },
      {
        rule: "Evaluate the remaining integral",
        text: "∫ " + reducedIntegrand + " d" + v + " = " + reducedResult,
        latex: "\\int " + toTeX(reducedIntegrand) + d + v + " = " + toTeX(reducedResult)
      },
      {
        rule: constMult ? "Combine, restoring the constant factor " + pretty(constMult) : "Combine",
        text: result + " + C",
        latex: toTeX(result) + " + C"
      },
      {
        rule: "Check by differentiating",
        text: "d/d" + v + " [" + result + "] = " + checkDeriv + "  ✓ matches the integrand",
        latex: "\\frac{d}{d" + v + "}\\left[" + toTeX(result) + "\\right] = " + toTeX(checkDeriv)
      }
    ];
    return steps;
  }

  /* SHARED VERIFY HELPERS (fdVerifyAntideriv, symbolicDeriv, compileFn) — moved to
     calc-core.js and aliased above. They back the verify gate for every CAS engine. */

  /* ================================ PARTIAL FRACTIONS ================================

     ∫P(x)/Q(x) dx, decomposed into a sum of simpler rational terms and integrated term by
     term. The most mechanical of the four techniques — and the one nerdamer handles most
     completely: `partfrac()` does the decomposition itself, including irreducible-quadratic
     factors, repeated factors, AND the polynomial long division a proper textbook treatment
     does first when deg P ≥ deg Q. So unlike by-parts (where the LIATE choice was ours to
     teach), here the engine's job is to *show* the decomposition nerdamer produces and
     integrate the result — not to re-derive the cover-up method by hand. Verified by the
     finite-difference gate. */

  // A polynomial in v only: no function calls, no other variables, no division, and any power
  // has a non-negative integer exponent. Walked on math.js's tree so it is structural, not a
  // fragile string check.
  function isPolynomialIn(exprStr, v) {
    let node;
    try { node = mathjs.parse(exprStr); } catch (e) { return false; }
    let okk = true;
    node.traverse(function (n) {
      if (!okk) return;
      if (n.type === "FunctionNode") { okk = false; return; }
      if (n.type === "SymbolNode" && n.name !== v) { okk = false; return; }
      if (n.type === "OperatorNode") {
        if (n.op === "+" || n.op === "-" || n.op === "*") return;
        if (n.op === "^") {
          const e = n.args && n.args[1];
          const k = e && e.type === "ConstantNode" ? parseFloat(e.value) : NaN;
          if (!Number.isInteger(k) || k < 0) okk = false;
          return;
        }
        okk = false; // "/" or anything else — not a polynomial
      }
    });
    return okk;
  }

  // splitRational: the partial-fractions detector. nerdamer normalizes every quotient away
  // from the "/" operator — `1/(x^2-1)` becomes `(-1+x^2)^(-1)`, `x/(x^2-1)` becomes
  // `(-1+x^2)^(-1)*x`, an improper fraction `x^3/(x^2-1)` stays `(-1+x^2)^(-1)*x^3` (the long
  // division happens inside partfrac, not in toString). So the "/"-based splitQuotient used by
  // the limits work sees nothing here and returns null. This walker instead flattens the
  // top-level product and separates factors by the SIGN of their integer exponent: positive
  // (or bare) factors are the numerator, negative-integer-exponent factors are the
  // denominator. Anything that is not a polynomial in v on either side (e.g. `e^x`, `sqrt(...)`,
  // another variable) is caught by isPolynomialIn and refused — so `x*e^x` (no denominator, a
  // non-polynomial factor) and `1/sqrt(4-x^2)` (a radical denominator) are both rejected, the
  // former as "not a single quotient", the latter as "not polynomials" (trig sub's turf).
  function unwrapNode(n) { return n && n.type === "ParenthesisNode" ? n.content : n; }

  function asIntPow(node) {
    node = unwrapNode(node);
    if (node.type !== "OperatorNode" || node.op !== "^") return null;
    const e = unwrapNode(node.args[1]);
    let k = null;
    if (e.type === "ConstantNode") k = parseFloat(e.value);
    else if (e.type === "OperatorNode" && e.op === "-" && e.args.length === 1
             && unwrapNode(e.args[0]).type === "ConstantNode") k = -parseFloat(unwrapNode(e.args[0]).value);
    if (k === null || !Number.isInteger(k)) return null;
    return { base: unwrapNode(node.args[0]), k: k };
  }

  function flattenProduct(node) {
    node = unwrapNode(node);
    if (node.type === "OperatorNode" && node.op === "*" && node.args.length === 2) {
      return flattenProduct(node.args[0]).concat(flattenProduct(node.args[1]));
    }
    return [node];
  }

  // Returns {num, den} (pretty polynomial strings), or a tagged refusal:
  //   {sum}            — top level is a sum/difference, not a single quotient
  //   {noDenominator}  — a product of polynomials with no denominator (a plain polynomial)
  //   {nonRational}    — has a denominator but a side is not a polynomial in v
  function splitRational(exprStr, v) {
    let root;
    try { root = unwrapNode(mathjs.parse(exprStr)); } catch (e) { return { sum: true }; }
    if (root.type === "OperatorNode" && (root.op === "+" || root.op === "-")) return { sum: true };
    const factors = flattenProduct(root);
    const numStrs = [], denStrs = [];
    for (const f of factors) {
      const ip = asIntPow(f);
      if (ip && ip.k < 0) {
        denStrs.push(ip.k === -1 ? "(" + ip.base.toString() + ")" : "(" + ip.base.toString() + ")^" + (-ip.k));
      } else {
        numStrs.push("(" + f.toString() + ")");
      }
    }
    if (denStrs.length === 0) return { noDenominator: true };
    const numRaw = numStrs.length ? numStrs.join("*") : "1";
    const denRaw = denStrs.join("*");
    const P = pretty(numRaw), Q = pretty(denRaw);
    if (!isPolynomialIn(P, v) || !isPolynomialIn(Q, v)) return { nonRational: true };
    return { num: P, den: Q };
  }

  CalculusSymbolic.partialFractions = function (integrand, variable) {
    const v = variable || "x";
    if (typeof integrand !== "string" || integrand.trim() === "") {
      throw new Error("The integrand must be a non-empty expression string.");
    }
    cas();
    let normalized;
    try { normalized = cas()(integrand).toString(); } catch (e) { throw new Error("Couldn't parse the integrand: " + integrand); }

    const q = splitRational(normalized, v);
    if ("sum" in q || "noDenominator" in q) {
      return { ok: false, reason: "Partial fractions applies to a rational function P(" + v + ")/Q(" + v + ") — this integrand is not a single quotient.", rejected: [] };
    }
    if ("nonRational" in q) {
      return { ok: false, reason: "Partial fractions applies to polynomials P(" + v + ")/Q(" + v + ") — one side here is not a polynomial in " + v + " (it contains a root, trig, log, or another variable).", rejected: [] };
    }
    const P = q.num, Q = q.den;

    const decomposition = tryStr(() => cas()("partfrac(" + normalized + "," + v + ")"));
    if (decomposition === null) {
      return { ok: false, reason: "Couldn't decompose the denominator into partial fractions — it may not factor over the reals.", rejected: [] };
    }

    const result = tryStr(() => cas()("integrate(" + decomposition + "," + v + ")"));
    if (result === null || /integrate\(/i.test(result)) {
      return { ok: false, reason: "The partial-fraction terms don't have elementary antiderivatives in this form.", rejected: [] };
    }

    if (!fdVerifyAntideriv(result, normalized, v)) {
      return { ok: false, reason: "The candidate antiderivative failed the differentiate-back check — try a different technique.", rejected: [{ u: pretty(Q), why: "result did not differentiate back to the integrand" }] };
    }

    const factorStr = tryStr(() => cas()("factor(" + Q + ")").toString()) || Q;
    const decPretty = pretty(decomposition);
    const checkDeriv = symbolicDeriv(result, v);

    return {
      ok: true,
      technique: "partial-fractions",
      numerator: P,
      denominator: Q,
      factoredDenominator: factorStr,
      decomposition: decPretty,
      result: result,
      latex: toTeX(result) + " + C",
      verified: true,
      rejected: [],
      steps: buildPartialFractionsSteps(normalized, v, P, Q, factorStr, decPretty, result, checkDeriv)
    };
  };

  function buildPartialFractionsSteps(integrand, v, P, Q, factorStr, decomposition, result, checkDeriv) {
    const d = "\\,d";
    return [
      { rule: "The integral", text: "∫ " + integrand + " d" + v, latex: "\\int " + toTeX(integrand) + d + v },
      { rule: "Factor the denominator", text: Q + " = " + factorStr, latex: toTeX(Q) + " = " + toTeX(factorStr) },
      { rule: "Decompose into partial fractions", text: P + "/" + Q + " = " + decomposition, latex: toTeX(P) + "/" + toTeX(Q) + " = " + toTeX(decomposition) },
      { rule: "Integrate each term", text: "∫ " + decomposition + " d" + v + " = " + result, latex: "\\int " + toTeX(decomposition) + d + v + " = " + toTeX(result) },
      { rule: "Result", text: result + " + C", latex: toTeX(result) + " + C" },
      { rule: "Check by differentiating", text: "d/d" + v + " [" + result + "] = " + checkDeriv + "  ✓ matches the integrand", latex: "\\frac{d}{d" + v + "}\\left[" + toTeX(result) + "\\right] = " + toTeX(checkDeriv) }
    ];
  }

  /* ================================ TRIGONOMETRIC SUBSTITUTION ================================

     Recognises the three radical forms that demand a trigonometric substitution:
       √(a²−x²)  →  x = a sin θ   (radical → a cos θ,  dx = a cos θ dθ)
       √(a²+x²)  →  x = a tan θ   (radical → a sec θ,  dx = a sec²θ dθ)
       √(x²−a²)  →  x = a sec θ   (radical → a tan θ,  dx = a sec θ tan θ dθ)

     Two things make this the hardest technique to get right, both confirmed by experiment:

     1. nerdamer's integrate() is UNRELIABLE on the raw substituted integrand — on
        ∫2cos(θ)·√(4−4sin²θ) dθ it returns an antiderivative that does NOT differentiate back.
        The fix is to remove the radical ourselves: divide it out of the integrand (the
        division cancels cleanly under plain toString(), confirmed — no .simplify() needed),
        then multiply back its trig form. The θ-integrand nerdamer then sees is a pure
        trig polynomial it integrates correctly.

     2. nerdamer does NOT simplify compositions like cos(asin(x/a)) — it leaves them verbatim,
        and its symbolic diff() is wrong on the resulting √(quadratic) forms (see the note on
        fdVerifyAntideriv). So: a tree-based composition simplifier rewrites
        trig(inverseTrig(u)) into x-forms for display, and the verify gate is fdVerifyAntideriv,
        which is form-independent. The simplifier is cosmetic; the gate guarantees correctness
        — an unsimplified-but-correct answer still passes. */

  // trig(inverseTrig(u)) identities. Applied by walking the math.js tree with transform(), so
  // the argument u may be arbitrarily complex (e.g. (1/2)*x) — a regex on [^()]* failed on that.
  const TRIG_COMPOSITIONS = {
    sin: { asin: "u", acos: "sqrt(1-u^2)", atan: "u/sqrt(1+u^2)", asec: "sqrt(u^2-1)/u" },
    cos: { asin: "sqrt(1-u^2)", acos: "u", atan: "1/sqrt(1+u^2)", asec: "1/u" },
    tan: { asin: "u/sqrt(1-u^2)", acos: "sqrt(1-u^2)/u", atan: "u", asec: "sqrt(u^2-1)" },
    sec: { asin: "1/sqrt(1-u^2)", acos: "1/sqrt(1-u^2)", atan: "sqrt(1+u^2)", asec: "u" },
    csc: { asin: "1/u", acos: "1/sqrt(1-u^2)", atan: "sqrt(1+u^2)/u", asec: "u/sqrt(u^2-1)" },
    cot: { asin: "sqrt(1-u^2)/u", acos: "u/sqrt(1-u^2)", atan: "1/u", asec: "1/sqrt(u^2-1)" }
  };
  function simplifyTrigCompositions(exprStr) {
    let prev, guard = 0;
    do {
      prev = exprStr;
      let node;
      try { node = mathjs.parse(exprStr); } catch (e) { return exprStr; }
      node = node.transform(function (n) {
        if (n.type !== "FunctionNode") return n;
        const outer = n.fn && n.fn.name;
        if (!outer || !TRIG_COMPOSITIONS[outer] || !n.args || n.args.length !== 1) return n;
        const arg = n.args[0];
        if (arg.type !== "FunctionNode") return n;
        const inner = arg.fn && arg.fn.name;
        const repl = TRIG_COMPOSITIONS[outer][inner];
        if (!repl) return n;
        const u = arg.args[0].toString();
        try {
          const composed = cas()(repl).sub("u", u).toString();
          return mathjs.parse(composed);
        } catch (e) { return n; }
      });
      exprStr = node.toString({ implicit: "hide" });
      guard++;
    } while (exprStr !== prev && guard < 30);
    return exprStr;
  }

  // Classifies a √(A*x² + B) radical into one of the three cases. Numeric detection (evaluate
  // the radicand at a few x) sidesteps nerdamer's string reordering — it writes 4−x² as −x²+4.
  // Requires the x² coefficient to be exactly ±1 (monic), which covers every standard
  // textbook exercise; non-monic radicals are refused with a clear reason.
  function classifyRadical(radStr, v) {
    let argStr;
    try { argStr = mathjs.parse(radStr).args[0].toString(); } catch (e) { return null; }
    const r0 = tryStr(() => cas()(argStr).evaluate({ [v]: 0 }).text("decimals"));
    const r1 = tryStr(() => cas()(argStr).evaluate({ [v]: 1 }).text("decimals"));
    const rm1 = tryStr(() => cas()(argStr).evaluate({ [v]: -1 }).text("decimals"));
    const r2 = tryStr(() => cas()(argStr).evaluate({ [v]: 2 }).text("decimals"));
    if (r0 === null || r1 === null || rm1 === null || r2 === null) return null;
    const B = parseFloat(r0), v1 = parseFloat(r1), vm1 = parseFloat(rm1), v2 = parseFloat(r2);
    if (![B, v1, vm1, v2].every(Number.isFinite)) return null;
    if (Math.abs(v1 - vm1) > 1e-9) return null;            // must be even in x (no linear term)
    const A = v1 - B;                                       // coefficient of x²
    if (Math.abs((v2 - B) - 4 * A) > 1e-9) return null;     // confirm it is A*x², not higher
    if (Math.abs(A + 1) < 1e-9 && B > 0) return { kind: "sine", a: Math.sqrt(B), radStr: pretty(radStr) };
    if (Math.abs(A - 1) < 1e-9 && B > 0) return { kind: "tan", a: Math.sqrt(B), radStr: pretty(radStr) };
    if (Math.abs(A - 1) < 1e-9 && B < 0) return { kind: "sec", a: Math.sqrt(-B), radStr: pretty(radStr) };
    return null;
  }
  function findRecognizedRadical(integrandStr, v) {
    let node;
    try { node = mathjs.parse(integrandStr); } catch (e) { return null; }
    const rads = [];
    node.traverse(function (n) {
      if (n.type === "FunctionNode" && n.fn && n.fn.name === "sqrt" && n.args && n.args.length === 1) {
        try { rads.push(n.toString()); } catch (e) {}
      }
    });
    for (const radStr of rads) {
      const found = classifyRadical(radStr, v);
      if (found) return found;
    }
    return null;
  }

  /* `inv` takes the integration variable, because the back-substitution θ → arcsin(v/a) has to
     name the variable actually being integrated. It used to hard-code "x", so the technique
     silently only worked for ∫…dx: integrating in y produced an antiderivative in x, which the
     differentiate-back gate then (correctly) rejected, and the refusal looked like "this
     integral is too hard" rather than "this function has a bug".

     That mattered well beyond the Calculus engine — separable ODEs integrate in y, and every
     substitution method (y = vx, v = y^{1-n}) integrates in v, so the most-needed direction
     for the ODE engine was exactly the broken one. ∫dy/√(1+y²) refused, and with it
     y' = x·√(1+y²). */
  const TRIG_SUB = {
    sine: { xSub: (a) => a + "*sin(t)", dx: (a) => a + "*cos(t)", radical: (a) => a + "*cos(t)",
            inv: (a, v) => "asin(" + v + "/" + a + ")", name: "x = a sin θ", radNote: "√(a²−x²) → a cos θ" },
    tan:  { xSub: (a) => a + "*tan(t)", dx: (a) => a + "*sec(t)^2", radical: (a) => a + "*sec(t)",
            inv: (a, v) => "atan(" + v + "/" + a + ")", name: "x = a tan θ", radNote: "√(a²+x²) → a sec θ" },
    sec:  { xSub: (a) => a + "*sec(t)", dx: (a) => a + "*sec(t)*tan(t)", radical: (a) => a + "*tan(t)",
            inv: (a, v) => "asec(" + v + "/" + a + ")", name: "x = a sec θ", radNote: "√(x²−a²) → a tan θ" }
  };

  /* fdVerifyAntideriv's default sample points sit near x=0 — right where a sec-substitution
     result is UNDEFINED (its domain is |x|>a; found because ∫x²/√(x²−9)dx computed a correct
     antiderivative that every default sample point rejected as "unverifiable", not "wrong").
     Sample points scaled into each substitution's actual domain instead: sine → (−a,a),
     sec → |x|>a. The sec case only trusts a shifted domain when the kernel confirms x>a is
     the valid branch for √(x²−a²) — the literal Phase 1 gate case
     (docs/kernel/04_BUILD_PHASES.md, "sqrt(x^2 - a^2) selects its branch from x>a, with a
     symbolic") — so this degrades to the old (occasionally too-conservative) default rather
     than ever fabricating a domain the kernel hasn't backed. tan is unrestricted; the default
     points are already domain-correct there. */
  function trigSubVerifyPoints(kind, a) {
    if (kind === "sec") {
      const k = CalcCore.kernel && CalcCore.kernel();
      if (!k || !k.sqrtDifferenceOfSquaresValidUnderGT()) return null;
      return [1.13, 1.37, 1.71, 2.08, 2.6, 3.3].map((m) => a * m);
    }
    if (kind === "sine") return [0.09, 0.23, 0.38, 0.55, 0.71, 0.85].map((m) => a * m);
    return null;
  }

  /* θ-integrand cleanup. After substituting x → a·trig(t) and re-attaching the radical's trig
     form and dx, the θ-integrand is ALMOST always a pure product of trig powers that
     nerdamer integrates cleanly (4cos²t, 16sin²t·cos²t, sec(t)·tan(t)^2). It breaks ONLY when
     the radical was in the integrand's DENOMINATOR: 1/√(a²−x²) leaves rest = 1/(a²−x²), which
     substitutes to (a²−a²sin²t)^(−1) — a *polynomial in sin(t)* in a denominator, not a trig
     function, and nerdamer's integrate() returns a wrong, non-differentiating mess on it. The
     cure is two tree rewrites, both confirmed by experiment on all the standard forms:

     1. applyPythagorean — recognise k − k·sin²t, k + k·tan²t, k·sec²t − k, etc. (including the
        forms nerdamer writes as a sum with a negative term, e.g. (−4sin²t)+4) and rewrite them
        via the Pythagorean identities to k·cos²t, k·sec²t, k·tan²t. This turns the polynomial-
        in-trig denominator into a trig power, which then cancels against the radical·dx factor
        (nerdamer cancels X·X^(−1) under plain toString(), no .simplify() needed). The walker
        treats A−B and A+B uniformly by carrying each term's sign, so the same code handles
        `4−4sin²t`, `(−4sin²t)+4`, `sec²t−1`, and `(−1)+sec²t`.
     2. convertNegPowers — after cancellation, a stray negative power may remain (e.g.
        sec(t)^(−1) = cos(t)). Convert each `trig(t)^(−k)` to its reciprocal function's positive
        power (sec→cos, cos→sec, tan→cot, …) so the θ-integrand stays a product of POSITIVE trig
        powers, which is the only shape nerdamer integrates reliably here.

     The verify gate (fdVerifyAntideriv) still has the final word — if a rewrite leaves
     nerdamer an integral it can't do, the result is refused, never returned wrong. */
  function expInt(node) {
    node = unwrapNode(node);
    if (node.type === "ConstantNode") { const v = parseFloat(node.value); return Number.isInteger(v) ? v : null; }
    if (node.type === "OperatorNode" && node.op === "-" && node.args.length === 1) {
      const c = expInt(node.args[0]); return c === null ? null : -c;
    }
    return null;
  }

  function trigPowName(node) {
    node = unwrapNode(node);
    const names = ["sin", "cos", "tan", "sec", "csc", "cot"];
    if (node.type === "FunctionNode" && names.indexOf(node.fn.name) >= 0
        && node.args.length === 1 && node.args[0].type === "SymbolNode" && node.args[0].name === "t") return node.fn.name;
    if (node.type === "OperatorNode" && node.op === "^" && expInt(node.args[1]) === 2) {
      const b = unwrapNode(node.args[0]);
      if (b.type === "FunctionNode" && names.indexOf(b.fn.name) >= 0
          && b.args.length === 1 && b.args[0].type === "SymbolNode" && b.args[0].name === "t") return b.fn.name;
    }
    return null;
  }

  function isConstInT(node) { let c = true; node.traverse(function (m) { if (m.type === "SymbolNode" && m.name === "t") c = false; }); return c; }
  function constValInT(node) { const s = tryStr(() => cas()(node.toString()).evaluate({ t: 0 }).text("decimals")); return s === null ? NaN : parseFloat(s); }

  // A sum term is either a pure constant (no t) or k·trig(t)^2. Returns {kind:"const",val} or
  // {kind:"trig2",trig,coef} with the coefficient's sign baked in, or null.
  function pythTerm(node) {
    node = unwrapNode(node);
    const tp = trigPowName(node);
    if (tp) return { kind: "trig2", trig: tp, coef: 1 };
    if (node.type === "OperatorNode" && node.op === "*" && node.args.length === 2) {
      for (const ord of [[0, 1], [1, 0]]) {
        const a = node.args[ord[0]], b = node.args[ord[1]];
        if (isConstInT(a)) { const tp = trigPowName(b); if (tp) return { kind: "trig2", trig: tp, coef: constValInT(a) }; }
      }
    }
    if (isConstInT(node)) return { kind: "const", val: constValInT(node) };
    return null;
  }
  function negPythTerm(t) { return t ? { kind: t.kind, trig: t.trig, coef: -t.coef } : null; }

  function applyPythagorean(str) {
    let prev, guard = 0;
    do {
      prev = str;
      let node;
      try { node = mathjs.parse(str); } catch (e) { return str; }
      node = node.transform(function (n) {
        n = unwrapNode(n);
        if (n.type !== "OperatorNode" || (n.op !== "-" && n.op !== "+") || n.args.length !== 2) return n;
        let A = pythTerm(n.args[0]), B = pythTerm(n.args[1]);
        if (!A || !B) return n;
        if (n.op === "-") B = negPythTerm(B);
        let c = null, d = null, trig = null;
        for (const t of [A, B]) {
          if (t.kind === "const") { if (c === null) c = t.val; }
          else { if (d === null) d = t.coef; trig = t.trig; }
        }
        if (c === null || d === null || trig === null || c === 0 || d === 0) return n;
        const mk = (k, tn) => mathjs.parse(k + "*" + tn + "(t)^2");
        if (trig === "sin" && Math.abs(c + d) < 1e-9) return mk(c, "cos");
        if (trig === "cos" && Math.abs(c + d) < 1e-9) return mk(c, "sin");
        if (trig === "tan" && Math.abs(c - d) < 1e-9) return mk(c, "sec");
        if (trig === "sec" && Math.abs(c + d) < 1e-9) return mk(-c, "tan");
        if (trig === "csc" && Math.abs(c + d) < 1e-9) return mk(-c, "cot");
        if (trig === "cot" && Math.abs(c - d) < 1e-9) return mk(c, "csc");
        return n;
      });
      str = node.toString({ implicit: "hide" });
      guard++;
    } while (str !== prev && guard < 20);
    return str;
  }

  function convertNegPowers(str) {
    const recip = { sin: "csc", cos: "sec", tan: "cot", sec: "cos", csc: "sin", cot: "tan" };
    let prev, guard = 0;
    do {
      prev = str;
      let node;
      try { node = mathjs.parse(str); } catch (e) { return str; }
      node = node.transform(function (n) {
        n = unwrapNode(n);
        if (n.type !== "OperatorNode" || n.op !== "^") return n;
        const e = expInt(n.args[1]);
        if (e === null || e >= 0) return n;
        const b = unwrapNode(n.args[0]);
        if (b.type !== "FunctionNode" || !recip[b.fn.name] || b.args.length !== 1
            || b.args[0].type !== "SymbolNode" || b.args[0].name !== "t") return n;
        const e2 = -e;
        return mathjs.parse(e2 === 1 ? recip[b.fn.name] + "(t)" : recip[b.fn.name] + "(t)^" + e2);
      });
      str = node.toString({ implicit: "hide" });
      guard++;
    } while (str !== prev && guard < 20);
    return str;
  }

  // Normalise a θ-integrand string through the cleanup pipeline: Pythagorean identities,
  // nerdamer re-parse (cancels X·X^(−1)), reciprocal positive powers, nerdamer re-parse again.
  function cleanThetaIntegrand(thetaStr) {
    let s = tryStr(() => cas()(thetaStr).toString()) || thetaStr;
    s = applyPythagorean(s);
    s = tryStr(() => cas()(s).toString()) || s;
    s = convertNegPowers(s);
    s = tryStr(() => cas()(s).toString()) || s;
    return s;
  }

  CalculusSymbolic.trigSubstitution = function (integrand, variable) {
    const v = variable || "x";
    if (typeof integrand !== "string" || integrand.trim() === "") {
      throw new Error("The integrand must be a non-empty expression string.");
    }
    cas();
    let normalized;
    try { normalized = cas()(integrand).toString(); } catch (e) { throw new Error("Couldn't parse the integrand: " + integrand); }

    const rad = findRecognizedRadical(normalized, v);
    if (!rad) {
      return { ok: false, reason: "Trigonometric substitution applies when the integrand contains √(a²−x²), √(a²+x²), or √(x²−a²) — none is present here.", rejected: [] };
    }
    const a = rad.a;
    const spec = TRIG_SUB[rad.kind];

    // Divide the radical out of the integrand to get the "rest". Confirmed by experiment: the
    // division cancels cleanly under plain toString() — sqrt(R)/sqrt(R) → 1, 1/(sqrt(R)*sqrt(R))
    // → R^(-1) — with no call to .simplify() (which can flip values). This works whether the
    // radical sits in the numerator or the denominator.
    const rest = tryStr(() => cas()("(" + normalized + ")/(" + rad.radStr + ")").toString());
    if (rest === null) {
      return { ok: false, reason: "Couldn't separate the radical from the integrand — this form of trig substitution isn't supported.", rejected: [] };
    }

    // Substitute x → a·sin/tan/sec(t) in the rest, then re-attach the radical's trig form and
    // the dx factor. The θ-integrand is now a pure trig expression nerdamer integrates right.
    const restT = tryStr(() => cas()(rest).sub(v, "(" + spec.xSub(a) + ")").toString());
    if (restT === null) {
      return { ok: false, reason: "The substitution didn't apply cleanly to the integrand.", rejected: [] };
    }
    const thetaIntegrandRaw = "(" + restT + ")*(" + spec.radical(a) + ")*(" + spec.dx(a) + ")";
    // Run the cleanup pipeline before handing the θ-integrand to integrate(). When the radical
    // was in the integrand's denominator the raw form is a trig ratio nerdamer cannot integrate
    // (see cleanThetaIntegrand); the Pythagorean + reciprocal-power rewrites reduce it to a pure
    // product of positive trig powers. The verify gate still rejects anything that comes out wrong.
    const thetaIntegrand = cleanThetaIntegrand(thetaIntegrandRaw);
    const thetaAntideriv = tryStr(() => cas()("integrate(" + thetaIntegrand + ",t)").toString());
    if (thetaAntideriv === null || /integrate\(/i.test(thetaAntideriv)) {
      return { ok: false, reason: "The substituted integral ∫ " + pretty(thetaIntegrand) + " dθ has no elementary antiderivative — try a different technique.", rejected: [] };
    }

    // Back-substitute θ → the inverse function, then clean up the trig(inverseTrig(u))
    // compositions that nerdamer leaves unsimplified.
    const subbed = tryStr(() => cas()(thetaAntideriv).sub("t", spec.inv(a, v)).toString());
    if (subbed === null) {
      return { ok: false, reason: "Back-substitution failed.", rejected: [] };
    }
    const simplified = pretty(simplifyTrigCompositions(subbed));
    let result = pretty(simplified);

    const verifyPoints = trigSubVerifyPoints(rad.kind, a);
    if (!fdVerifyAntideriv(result, normalized, v, verifyPoints)) {
      return { ok: false, reason: "The candidate antiderivative failed the differentiate-back check — try a different technique.", rejected: [{ u: spec.name, why: "result did not differentiate back to the integrand" }] };
    }

    // Cosmetic only, guarded by the same gate: prefer the kernel-tidied form if it still
    // verifies, otherwise keep the untidied (already-verified) result.
    const tidied = tidy(result);
    if (tidied !== result && fdVerifyAntideriv(tidied, normalized, v, verifyPoints)) result = tidied;

    const checkDeriv = symbolicDeriv(result, v);

    return {
      ok: true,
      technique: "trigonometric-substitution",
      substitution: spec.name.replace("a", String(a)),
      radical: rad.radStr,
      a: a,
      thetaIntegrand: pretty(thetaIntegrand),
      thetaAntiderivative: pretty(thetaAntideriv),
      result: result,
      latex: toTeX(result) + " + C",
      verified: true,
      rejected: [],
      steps: buildTrigSubSteps(normalized, v, rad, spec, a, thetaIntegrand, thetaAntideriv, spec.inv(a, v), simplified, result, checkDeriv)
    };
  };

  function buildTrigSubSteps(integrand, v, rad, spec, a, thetaIntegrand, thetaAntideriv, inv, simplified, result, checkDeriv) {
    const d = "\\,d";
    const sub = spec.name.replace("a", String(a));
    const radNote = spec.radNote.replace("a", String(a));
    return [
      { rule: "The integral", text: "∫ " + integrand + " d" + v, latex: "\\int " + toTeX(integrand) + d + v },
      { rule: "Choose the substitution", text: sub + ",  " + radNote, latex: sub.replace("θ", "\\theta") + ",\\quad " + radNote.replace("θ", "\\theta").replace("√", "\\sqrt").replace("²", "^2").replace("−", "-") },
      { rule: "Rewrite in θ", text: "∫ " + thetaIntegrand + " dθ", latex: "\\int " + toTeX(thetaIntegrand) + "\\,d\\theta" },
      { rule: "Integrate in θ", text: thetaAntideriv + " + C", latex: toTeX(thetaAntideriv) + " + C" },
      { rule: "Back-substitute θ = " + inv, text: result + " + C", latex: toTeX(result) + " + C" },
      { rule: "Check by differentiating", text: "d/d" + v + " [" + result + "] = " + checkDeriv + "  ✓ matches the integrand", latex: "\\frac{d}{d" + v + "}\\left[" + toTeX(result) + "\\right] = " + toTeX(checkDeriv) }
    ];
  }

  /* ================================ LIMITS ================================

     Deliberately does NOT lead with nerdamer's own limit(). That function is strong on
     textbook cases but has two disqualifying behaviours, both confirmed against the
     vendored 1.1.13 bundle:

       limit(1/x, x, 0)        -> Infinity     WRONG. The two-sided limit does not exist:
                                               the function runs to -inf on the left and
                                               +inf on the right.
       limit(abs(x)/x, x, 0)   -> never returns. A hard hang, not a slow answer — in a
                                               browser this freezes the tab, since a
                                               synchronous loop cannot be interrupted.

     So the primary path here is built from operations that are known-safe: symbolic
     differentiation (diff never hangs, even on abs) plus numeric probing. That covers the
     entire first-course syllabus — direct substitution, then L'Hopital for indeterminate
     forms — and is *more* correct than nerdamer alone, because the two-sided numeric probe
     detects the 1/x case that nerdamer gets wrong. nerdamer's limit() is consulted only as
     a last resort, and never on an expression containing a construct known to hang it.

     See LIMIT_HANG_RISK below and the note in the page wiring: any call into nerdamer's
     limit() from the browser belongs in a Web Worker with a terminate-on-timeout, because
     no in-process guard can stop an infinite loop. */

  // Constructs observed to hang nerdamer's limit(). Not exhaustive — it cannot be, which is
  // exactly why the fallback is last-resort rather than primary.
  const LIMIT_HANG_RISK = /\b(abs|sign|floor|ceil|round|mod)\s*\(/i;

  const PROBE_OFFSETS = [1e-2, 1e-3, 1e-4, 1e-5];
  const PROBE_INFINITE = [1e2, 1e3, 1e4, 1e5, 1e6];
  // Divergence is detected by sustained growth, not by crossing a fixed magnitude: probing
  // only as close as 1e-5 means 1/x reaches just 1e5, so any absolute cutoff large enough to
  // be safe would miss it. Requiring the values to keep multiplying up instead catches 1/x
  // (x10 per step) and 1/x^2 (x100) while leaving a merely large constant alone.
  const DIVERGENCE_GROWTH = 3;
  const DIVERGENCE_FLOOR = 1e3;
  const LIMIT_REL_TOL = 1e-4; // probing is coarse; near the point, cancellation costs digits

  // Numeric evaluation goes through math.js rather than nerdamer: it is far faster and, more
  // importantly, cannot hang. nerdamer is used only for symbolic manipulation.
  function numericFn(exprStr, variable) {
    try {
      const code = mathjs.parse(exprStr).compile();
      return (x) => {
        try {
          const y = code.evaluate({ [variable]: x });
          return typeof y === "number" && Number.isFinite(y) ? y : null;
        } catch (e) { return null; }
      };
    } catch (e) { return null; }
  }

  // Like numericFn, but keeps an actual ±Infinity result instead of collapsing it to null.
  // Needed wherever a caller (classifyForm's infinite-point probing, via evalRaw) must tell
  // "diverges to infinity" apart from "couldn't evaluate" — e^x at x=1000 already overflows
  // JS's float range, and numericFn's own null-on-non-finite would erase that signal before
  // the caller ever saw it.
  function numericFnRaw(exprStr, variable) {
    try {
      const code = mathjs.parse(exprStr).compile();
      return (x) => {
        try {
          const y = code.evaluate({ [variable]: x });
          return typeof y === "number" && !Number.isNaN(y) ? y : null;
        } catch (e) { return null; }
      };
    } catch (e) { return null; }
  }

  function normalizePoint(at) {
    const s = String(at).trim();
    if (/^[+]?(inf(inity)?)$/i.test(s)) return { kind: "+inf", label: "\\infty", text: "∞" };
    if (/^-(inf(inity)?)$/i.test(s)) return { kind: "-inf", label: "-\\infty", text: "-∞" };
    const num = parseFloat(s);
    if (!Number.isFinite(num)) return null;
    return { kind: "finite", value: num, label: toTeX(s), text: s };
  }

  /* Approaches the point along one side and reports what the values are doing:
       { type: "finite", value }  |  { type: "+inf" }  |  { type: "-inf" }  |  { type: "none" }
     "Converged" means the last two probe points agree to LIMIT_REL_TOL; divergence means the
     magnitude blew past DIVERGENCE_CUTOFF while still growing. Anything else (oscillation
     like sin(1/x), or an undefined side) is reported as "none" rather than guessed at. */
  function probeSide(f, point, side) {
    const vals = [];
    if (point.kind === "finite") {
      for (const h of PROBE_OFFSETS) {
        const y = f(point.value + side * h);
        vals.push(y);
      }
    } else {
      const sign = point.kind === "+inf" ? 1 : -1;
      for (const m of PROBE_INFINITE) vals.push(f(sign * m));
    }

    const finite = vals.filter((y) => y !== null);
    if (finite.length < 2) return { type: "none" };

    const last = finite[finite.length - 1];
    const prev = finite[finite.length - 2];

    if (Math.abs(last) > DIVERGENCE_FLOOR && Math.abs(last) > Math.abs(prev) * DIVERGENCE_GROWTH) {
      return { type: last > 0 ? "+inf" : "-inf" };
    }
    if (Math.abs(last - prev) <= LIMIT_REL_TOL * Math.max(1, Math.abs(last))) {
      return { type: "finite", value: last };
    }
    return { type: "none" };
  }

  function sidesAgree(a, b) {
    // "none" means the probe learned nothing about that side. Two sides that are both
    // uninformative are NOT in agreement — treating them as agreeing would wave through
    // exactly the cases this check exists to catch.
    if (a.type === "none" || b.type === "none") return false;
    if (a.type !== b.type) return false;
    if (a.type !== "finite") return true;
    return Math.abs(a.value - b.value) <= LIMIT_REL_TOL * Math.max(1, Math.abs(a.value));
  }

  function describeSide(s) {
    if (s.type === "finite") return String(Math.round(s.value * 1e6) / 1e6);
    if (s.type === "+inf") return "+∞";
    if (s.type === "-inf") return "-∞";
    return "no limit";
  }

  // Numeric value of a symbolic answer ("1/2", "e", "-Infinity"), for cross-checking against
  // the probe. Returns null when the value is not a plain number.
  function symbolicToNumber(value) {
    if (/^-?Infinity$/i.test(String(value).trim())) return null;
    try {
      const y = parseFloat(cas()(value).evaluate().text("decimals"));
      return Number.isFinite(y) ? y : null;
    } catch (e) { return null; }
  }

  // Splits a quotient using math.js's parse tree, so L'Hopital is only ever applied to
  // something that genuinely is f/g.
  function splitQuotient(exprStr) {
    try {
      const node = mathjs.parse(exprStr);
      const root = node.type === "ParenthesisNode" ? node.content : node;
      if (root.type === "OperatorNode" && root.op === "/") {
        return { num: root.args[0].toString(), den: root.args[1].toString() };
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function sideLimitOf(exprStr, variable, point) {
    const f = numericFn(exprStr, variable);
    if (!f) return null;
    if (point.kind !== "finite") return probeSide(f, point, 1);
    return { left: probeSide(f, point, -1), right: probeSide(f, point, 1) };
  }

  /* CalculusSymbolic.limit(expr, variable, at)

     Returns
       { ok: true, kind: "finite"|"infinite"|"dne", value, latex, steps: [...], sides }
     or
       { ok: false, reason, sides }

     A limit that does not exist is a RESULT, not a failure — "the one-sided limits disagree"
     is the correct answer to lim(1/x) as x->0 and is reported as such, with both sides shown.
     ok:false means the engine could not determine the answer at all. */
  function computeLimit(expr, variable, at, ctx) {
    const v = variable || "x";
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The expression must be a non-empty string.");
    }
    cas();

    const point = normalizePoint(at);
    if (!point) throw new Error("The point must be a number, Infinity, or -Infinity — got: " + at);

    let normalized;
    try { normalized = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse the expression: " + expr); }

    const f = numericFn(normalized, v);
    if (!f) return { ok: false, reason: "Couldn't evaluate this expression numerically.", sides: null };

    // The approach table is the first thing a calculus course shows about limits — f(x) at
    // x = a ± 0.1, 0.01, 0.001 — so it is returned alongside the answer rather than being
    // recomputed by whoever is displaying it. Same probe points the decision below uses, so
    // the table is literally the evidence for the verdict, not a separate illustration.
    if (ctx) ctx.table = buildApproachTable(f, point);

    const steps = [];
    // Echo the expression as typed. Normalizing is right for computation but wrong for the
    // first line of a derivation — a student should recognise their own input.
    const shown = expr.trim();
    const limTeX = "\\lim_{" + v + " \\to " + point.label + "} " + toTeX(shown);
    const limTxt = "lim " + v + "->" + point.text + " of " + shown;
    steps.push({ rule: "The limit", text: limTxt, latex: limTeX });

    /* ---- 1. establish what the function actually does, numerically, on each side.
       This runs first because it is what decides existence, and it is the check every
       symbolic answer below is measured against. ---- */
    let left, right, sides;
    if (point.kind === "finite") {
      left = probeSide(f, point, -1);
      right = probeSide(f, point, 1);
      sides = { left: describeSide(left), right: describeSide(right) };
      steps.push({
        rule: "Approach from both sides",
        text: "from the left: " + sides.left + "   from the right: " + sides.right,
        latex: "\\text{left: } " + sides.left + " \\qquad \\text{right: } " + sides.right
      });
      if (!sidesAgree(left, right)) {
        steps.push({
          rule: "The one-sided limits disagree",
          text: "the limit does not exist",
          latex: "\\text{the limit does not exist}"
        });
        return { ok: true, kind: "dne", value: null, latex: "\\text{does not exist}", steps, sides, verified: true };
      }
    } else {
      right = probeSide(f, point, 1);
      left = right;
      sides = { left: null, right: describeSide(right) };
    }
    const target = left; // both sides agree at this stage

    /* ---- 1.5. kernel-first (Phase 4 exact series+L'Hopital route, docs/kernel/04_BUILD_PHASES.md)

       Reached through CalcCore.kernel() the same way tidy() reaches simplify() — never
       required directly, so a missing/unloadable kernel just skips this block (falls straight
       through to direct substitution / L'Hopital / nerdamer below, exactly as before Phase 4
       wiring). Placed AFTER the numeric probe/DNE check above (step 1 must stay first — it is
       what correctly reports a true non-existence from actual sampled behaviour) so a kernel
       success is still cross-checked against `target`, that same sampled evidence, via
       finishLimit — the kernel is exact, but this is cheap insurance against a printer/parser
       mismatch rather than trust-on-faith. A kernel refusal (Puiseux/branch-point, essential
       singularity, oscillatory, or a non-resolving indeterminate — see limit.js's honest
       refusals) or a failed cross-check falls through to every step below unchanged. */
    const kb = kernelBridge();
    if (kb && typeof kb.limitText === "function") {
      const pointArg = point.kind === "+inf" ? "Infinity" : point.kind === "-inf" ? "-Infinity" : point.text;
      let kres;
      try { kres = kb.limitText(shown, v, pointArg); } catch (e) { kres = null; }
      if (kres && kres.ok) {
        if (kres.kind === "dne") {
          steps.push({
            rule: "Kernel: series + L'Hôpital analysis",
            text: "the one-sided limits disagree — the limit does not exist",
            latex: "\\text{the limit does not exist}"
          });
          return { ok: true, kind: "dne", value: null, latex: "\\text{does not exist}", steps, sides, verified: true };
        }
        if (kres.kind === "finite" && kres.resultText) {
          steps.push({
            rule: "Kernel: exact series + L'Hôpital result",
            text: v + " -> " + point.text + ": " + kres.resultText,
            latex: toTeX(kres.resultText)
          });
          const out = finishLimit(kres.resultText, "finite", steps, sides, target);
          if (out.ok) return out;
          steps.pop();
        } else if (kres.kind === "infinite") {
          const signedInf = kres.sign === -1 ? "-Infinity" : "Infinity";
          steps.push({
            rule: "Kernel: exact series + L'Hôpital result",
            text: v + " -> " + point.text + ": " + signedInf,
            latex: kres.sign === -1 ? "-\\infty" : "\\infty"
          });
          const out = finishLimit(signedInf, "infinite", steps, sides, target);
          if (out.ok) return out;
          steps.pop();
        }
      }
    }

    /* ---- 2. direct substitution ---- */
    if (point.kind === "finite") {
      const direct = f(point.value);
      if (direct !== null && target.type === "finite" &&
          Math.abs(direct - target.value) <= LIMIT_REL_TOL * Math.max(1, Math.abs(direct))) {
        const exact = tryStr(() => cas()(normalized).sub(v, String(point.value)).evaluate()) || String(direct);
        steps.push({
          rule: "Direct substitution",
          text: "the function is continuous here — substitute " + v + " = " + point.text + ": " + exact,
          latex: "\\text{continuous at } " + v + " = " + point.label + " \\Rightarrow " + toTeX(exact)
        });
        return finishLimit(exact, "finite", steps, sides, target);
      }
    }

    /* ---- 3. L'Hopital, for the indeterminate quotients ----
       Split the expression the user actually typed, not the nerdamer-normalized form:
       normalizing rewrites "(1-cos(x))/x^2" as "(-cos(x)+1)*x^(-2)", a product with a
       negative power, which hides the quotient structure L'Hopital needs and silently
       demotes the whole derivation to the black-box fallback below. */
    const parts = splitQuotient(expr.trim()) || splitQuotient(normalized);
    if (parts) {
      const fn = numericFn(parts.num, v);
      const gn = numericFn(parts.den, v);
      if (fn && gn) {
        const nLim = probeSide(fn, point, point.kind === "finite" ? 1 : 1);
        const dLim = probeSide(gn, point, point.kind === "finite" ? 1 : 1);
        const isZeroZero = nLim.type === "finite" && Math.abs(nLim.value) < 1e-6 &&
                           dLim.type === "finite" && Math.abs(dLim.value) < 1e-6;
        const isInfInf = (nLim.type === "+inf" || nLim.type === "-inf") &&
                         (dLim.type === "+inf" || dLim.type === "-inf");
        if (isZeroZero || isInfInf) {
          steps.push({
            rule: "Indeterminate form",
            text: "substitution gives " + (isZeroZero ? "0/0" : "∞/∞") + " — apply L'Hôpital's Rule",
            latex: "\\frac{" + (isZeroZero ? "0" : "\\infty") + "}{" + (isZeroZero ? "0" : "\\infty") + "}\\text{ — apply L'Hôpital}"
          });
          const viaLH = applyLHopital(parts, v, point, steps, target);
          if (viaLH) return finishLimit(viaLH, target.type === "finite" ? "finite" : "infinite", steps, sides, target);
        }
      }
    }

    /* ---- 4. last resort: nerdamer's own limit(), only when it cannot hang ---- */
    if (!LIMIT_HANG_RISK.test(normalized)) {
      const pointArg = point.kind === "finite" ? String(point.value)
                     : point.kind === "+inf" ? "Infinity" : "-Infinity";
      const raw = tryStr(() => cas()("limit(" + normalized + "," + v + "," + pointArg + ")"));
      if (raw !== null && !/limit\(/i.test(raw)) {
        const cleaned = raw.replace(/e\^Infinity/g, "Infinity");
        steps.push({
          rule: "Evaluate the limit",
          text: cleaned,
          latex: toTeX(cleaned)
        });
        return finishLimit(cleaned, target.type === "finite" ? "finite" : "infinite", steps, sides, target);
      }
    }

    // Divergence with no closed form is still a real answer.
    if (target.type === "+inf" || target.type === "-inf") {
      const val = target.type === "+inf" ? "Infinity" : "-Infinity";
      steps.push({ rule: "The function diverges", text: val, latex: target.type === "+inf" ? "\\infty" : "-\\infty" });
      return { ok: true, kind: "infinite", value: val, latex: target.type === "+inf" ? "\\infty" : "-\\infty", steps, sides, verified: true };
    }

    return {
      ok: false,
      reason: "Couldn't find a closed form for this limit" +
              (target.type === "finite" ? " (numerically it looks like " + describeSide(target) + ")." : "."),
      sides,
      steps
    };
  }

  /* Public entry point. Wraps computeLimit purely so the approach table can be attached to
     every outcome — success, DNE, divergence and failure alike — without threading it
     through six separate return statements. */
  CalculusSymbolic.limit = function (expr, variable, at) {
    const ctx = {};
    const result = computeLimit(expr, variable, at, ctx);
    result.table = ctx.table || [];
    return result;
  };

  // x -> f(x) closing in on the point from each side. Values that are undefined there (a log
  // of a negative, a division by zero) are reported as null rather than skipped, because
  // "undefined on this side" is itself the answer to some limit questions.
  function buildApproachTable(f, point) {
    const rows = [];
    if (point.kind === "finite") {
      for (const h of PROBE_OFFSETS) {
        const xl = point.value - h;
        const xr = point.value + h;
        rows.push({ h, xLeft: xl, fLeft: f(xl), xRight: xr, fRight: f(xr) });
      }
    } else {
      const sign = point.kind === "+inf" ? 1 : -1;
      for (const m of PROBE_INFINITE) {
        const x = sign * m;
        rows.push({ h: null, xLeft: null, fLeft: null, xRight: x, fRight: f(x) });
      }
    }
    return rows;
  }

  // Differentiates top and bottom separately — NOT the quotient rule — re-probing after each
  // pass, and stops as soon as the form is no longer indeterminate. Bounded, because a
  // mis-detected form would otherwise differentiate forever.
  const LH_MAX_PASSES = 6;

  function applyLHopital(parts, v, point, steps, target) {
    let num = parts.num, den = parts.den;
    for (let pass = 1; pass <= LH_MAX_PASSES; pass++) {
      const dNum = tryStr(() => cas()("diff(" + num + "," + v + ")"));
      const dDen = tryStr(() => cas()("diff(" + den + "," + v + ")"));
      if (dNum === null || dDen === null || dDen === "0") return null;
      num = dNum; den = dDen;

      const quotient = "(" + num + ")/(" + den + ")";
      steps.push({
        rule: "L'Hôpital's Rule" + (pass > 1 ? " (pass " + pass + ")" : ""),
        text: "differentiate top and bottom: (" + num + ") / (" + den + ")",
        latex: "\\lim " + toTeX(quotient)
      });

      const q = numericFn(quotient, v);
      if (!q) return null;
      const now = probeSide(q, point, 1);
      if (now.type === "finite") {
        // The probe says the quotient converges, but that does not mean substitution
        // *works* yet: sin(x)/(2x) converges to 1/2 while still being 0/0 at the point.
        // Only an exact symbolic value ends the loop — otherwise differentiate again.
        // Accepting the probe's number here would hand back 0.4999999999916666 for a
        // limit whose answer is 1/2, which is precisely what a symbolic engine exists to
        // avoid.
        const exact = point.kind === "finite"
          ? tryStr(() => cas()(quotient).sub(v, String(point.value)).evaluate())
          : tryStr(() => cas()("limit(" + quotient + "," + v + ",Infinity)"));
        if (exact !== null && !/limit\(|nan|undefined|infinity/i.test(exact)) {
          steps.push({ rule: "Now substitution works", text: exact, latex: toTeX(exact) });
          return exact;
        }
        continue; // still indeterminate — another pass
      }
      if (now.type === "+inf" || now.type === "-inf") {
        // Still divergent and no longer a 0/0 or inf/inf quotient to reduce.
        return now.type === "+inf" ? "Infinity" : "-Infinity";
      }
    }
    return null;
  }

  // Cross-checks the symbolic answer against the numeric probe before returning it. Same gate
  // as u-substitution: a symbolic value that contradicts what the function visibly does is
  // withheld rather than reported.
  function finishLimit(value, kind, steps, sides, target) {
    const asNum = symbolicToNumber(value);
    let verified = true;
    if (target && target.type === "finite" && asNum !== null) {
      verified = Math.abs(asNum - target.value) <= 1e-3 * Math.max(1, Math.abs(target.value));
    }
    if (!verified) {
      return {
        ok: false,
        reason: "The symbolic result (" + value + ") disagrees with the function's actual behaviour near the point — refusing to report it.",
        sides,
        steps
      };
    }
    steps.push({
      rule: "Check numerically",
      text: "matches the values approaching the point ✓",
      latex: "\\checkmark\\ \\text{agrees with the numeric approach}"
    });
    /* Classify from the answer, not from the probe. lim(log(x)/x) as x->inf is 0 — a finite
       limit — but the probe values are still visibly shrinking at the last sample, so the
       probe alone reports "no verdict" and the caller's guess of "infinite" would stick.
       The value is the authority once it has been verified. */
    const resolvedKind = /^-?Infinity$/i.test(String(value).trim()) ? "infinite"
                       : asNum !== null ? "finite"
                       : kind;
    return { ok: true, kind: resolvedKind, value, latex: toTeX(value), steps, sides, verified: true };
  }

  /* ================================ L'HOPITAL'S RULE ================================

     A standalone front door onto the same applyLHopital() that limit() already uses
     internally — the roadmap's "promote to its own page" item. Where limit() treats an
     indeterminate form as one path among several (direct substitution, then L'Hopital, then
     nerdamer as a last resort), this entry point makes the indeterminate-form check itself
     the point: a continuous function is REFUSED here even though limit() would happily
     evaluate it by direct substitution, because showing "L'Hopital applied to something
     that didn't need it" would misteach the rule.

     Detecting "is this actually 0/0 or ∞/∞" needs its own, more careful check than the
     probe reuse below would suggest — see classifyForm(). */
  function evalSafe(fn, x) {
    try { const y = fn(x); return Number.isFinite(y) ? y : null; } catch (e) { return null; }
  }

  // Like evalSafe, but keeps an actual ±Infinity result instead of nulling it out — needed for
  // probing fast-growing functions (e.g. e^x) at large finite x, where the true value overflows
  // JS's float range well before the probe point itself is "at infinity". Still discards NaN and
  // thrown errors, which carry no directional information.
  function evalRaw(fn, x) {
    try { const y = fn(x); return typeof y === "number" && !Number.isNaN(y) ? y : null; } catch (e) { return null; }
  }

  // A sequence with each sample strictly larger in magnitude than the last, ending above a
  // low bar, is "heading to infinity" — deliberately NOT the multiplicative-growth test
  // probeSide uses elsewhere, because that test misses slow divergences: log(x) at x=1e2..1e6
  // grows from 4.6 to 13.8, nowhere near probeSide's x3-per-step bar, but it is unbounded all
  // the same. A quotient's own two limits matter more here than how fast they blow up.
  function trendClassify(vals) {
    if (vals.length < 2) return "none";
    for (let i = 1; i < vals.length; i++) {
      const prev = Math.abs(vals[i - 1]), cur = Math.abs(vals[i]);
      // Once a fast-growing function has overflowed to actual Infinity, later probes staying at
      // Infinity are still consistent with "heading to infinity" — not a break in the trend.
      if (cur === Infinity && prev === Infinity) continue;
      if (!(cur > prev)) return "other";
    }
    const last = vals[vals.length - 1];
    if (Math.abs(last) > 10) return "inf";
    if (Math.abs(last) < 1e-6) return "zero";
    return "other";
  }

  // Classifies what a single piece (numerator or denominator alone) does at the point:
  // "zero", "inf", "other" (some ordinary finite nonzero value) or "none" (couldn't tell).
  // At a finite point this prefers evaluating exactly AT the point when defined — sin(x) and
  // x are each individually perfectly well-defined and exactly 0 at x=0, even though their
  // ratio is not, which is a far more reliable zero-test than probing nearby and hoping the
  // probe granularity happens to be fine enough. Only falls back to probing when the piece
  // itself is undefined at the point (e.g. 1/x has no value at x=0 to check directly).
  function classifyForm(fn, point) {
    if (point.kind === "finite") {
      const atPoint = evalSafe(fn, point.value);
      if (atPoint !== null) return Math.abs(atPoint) < 1e-9 ? "zero" : "other";
      const near = PROBE_OFFSETS.map((h) => evalSafe(fn, point.value + h)).filter((y) => y !== null);
      return trendClassify(near);
    }
    const sign = point.kind === "+inf" ? 1 : -1;
    const far = PROBE_INFINITE.map((m) => evalRaw(fn, sign * m)).filter((y) => y !== null);
    return trendClassify(far);
  }

  function computeLHopital(expr, variable, at) {
    const v = variable || "x";
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The expression must be a non-empty string.");
    }
    cas();

    const point = normalizePoint(at);
    if (!point) throw new Error("The point must be a number, Infinity, or -Infinity — got: " + at);

    let normalized;
    try { normalized = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse the expression: " + expr); }

    const f = numericFn(normalized, v);
    if (!f) return { ok: false, reason: "Couldn't evaluate this expression numerically.", sides: null };

    const shown = expr.trim();
    const limTeX = "\\lim_{" + v + " \\to " + point.label + "} " + toTeX(shown);
    const limTxt = "lim " + v + "->" + point.text + " of " + shown;
    const steps = [{ rule: "The limit", text: limTxt, latex: limTeX }];

    let left, right, sides;
    if (point.kind === "finite") {
      left = probeSide(f, point, -1);
      right = probeSide(f, point, 1);
      sides = { left: describeSide(left), right: describeSide(right) };
      if (!sidesAgree(left, right)) {
        return {
          ok: false,
          reason: "The one-sided limits disagree (left: " + sides.left + ", right: " + sides.right + ") — the limit does not exist, so there is nothing for L'Hôpital's Rule to resolve.",
          sides
        };
      }
    } else {
      right = probeSide(f, point, 1);
      left = right;
      sides = { left: null, right: describeSide(right) };
    }
    const target = left;

    const parts = splitQuotient(shown) || splitQuotient(normalized);
    if (!parts) {
      return { ok: false, reason: "L'Hôpital's Rule applies to a quotient f(x)/g(x) — this expression isn't one.", sides };
    }

    const fn = numericFnRaw(parts.num, v);
    const gn = numericFnRaw(parts.den, v);
    if (!fn || !gn) {
      return { ok: false, reason: "Couldn't evaluate the numerator or denominator numerically.", sides };
    }

    const nForm = classifyForm(fn, point);
    const dForm = classifyForm(gn, point);
    const isZeroZero = nForm === "zero" && dForm === "zero";
    const isInfInf = nForm === "inf" && dForm === "inf";

    if (!isZeroZero && !isInfInf) {
      const describeForm = (k) => k === "zero" ? "0" : k === "inf" ? "∞" : k === "none" ? "?" : "a finite nonzero value";
      return {
        ok: false,
        reason: "Substituting gives " + describeForm(nForm) + " / " + describeForm(dForm) +
                " — not an indeterminate 0/0 or ∞/∞ form, so L'Hôpital's Rule does not apply here" +
                (target.type === "finite" ? " (the limit can be found directly: it is " + describeSide(target) + ")." : "."),
        sides
      };
    }

    steps.push({
      rule: "Indeterminate form",
      text: "substitution gives " + (isZeroZero ? "0/0" : "∞/∞") + " — apply L'Hôpital's Rule",
      latex: "\\frac{" + (isZeroZero ? "0" : "\\infty") + "}{" + (isZeroZero ? "0" : "\\infty") + "}\\text{ — apply L'Hôpital}"
    });

    const viaLH = applyLHopital(parts, v, point, steps, target);
    if (viaLH === null) {
      return {
        ok: false,
        reason: "L'Hôpital's Rule did not settle to a closed form within " + LH_MAX_PASSES + " passes — this indeterminate form needs a different technique.",
        sides,
        steps
      };
    }
    return finishLimit(viaLH, target.type === "finite" ? "finite" : "infinite", steps, sides, target);
  }

  /* CalculusSymbolic.lhopital(expr, variable, at)

     Returns { ok: true, kind, value, latex, steps, sides, table } on success, or
     { ok: false, reason, sides } — including when the expression is not itself indeterminate,
     which is a refusal (this is not the right tool), not an error. */
  CalculusSymbolic.lhopital = function (expr, variable, at) {
    const result = computeLHopital(expr, variable, at);
    const point = normalizePoint(at);
    const v = variable || "x";
    let normalized = null;
    try { normalized = cas()(expr).toString(); } catch (e) { /* left null; table stays empty */ }
    const f = normalized ? numericFn(normalized, v) : null;
    result.table = (f && point) ? buildApproachTable(f, point) : [];
    return result;
  };

  /* ================================ TAYLOR SERIES ================================

     Coefficients via repeated symbolic differentiation, evaluated at the center point —
     c_k = f^(k)(a) / k!. Unlike u-substitution and limit(), there is no "wrong technique"
     failure mode here: differentiation always succeeds, so the verification gate checks the
     polynomial itself instead — P_n(a) must equal f(a), and P_n must track f numerically in
     a neighbourhood of a. A polynomial that fails either check is withheld, same discipline
     as everywhere else in this file. */
  const TAYLOR_CHECK_OFFSETS = [-0.05, -0.02, 0.02, 0.05];
  const TAYLOR_CHECK_TOL = 1e-2; // coarse: the polynomial is only a LOCAL approximation

  CalculusSymbolic.taylorSeries = function (expr, variable, at, degree) {
    const v = variable || "x";
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The expression must be a non-empty string.");
    }
    if (!Number.isFinite(at)) throw new Error("The center point a must be a finite number.");
    if (!Number.isInteger(degree) || degree < 0) throw new Error("The degree must be a non-negative integer.");
    cas();

    let normalized;
    try { normalized = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse the expression: " + expr); }

    const f = numericFn(normalized, v);
    if (!f) return { ok: false, reason: "Couldn't evaluate this expression numerically." };

    // Repeated symbolic differentiation, each pass exact — not the derivative of the
    // previous *numeric* coefficient, so degree 10 is exactly as accurate as degree 1.
    const derivs = [normalized];
    for (let k = 1; k <= degree; k++) {
      const d = tryStr(() => cas()("diff(" + derivs[k - 1] + "," + v + ")"));
      if (d === null) {
        return { ok: false, reason: "Couldn't differentiate this far (order " + k + ")." };
      }
      derivs.push(d);
    }

    const coeffs = []; // { value: exact string, num: number }
    let fact = 1;
    for (let k = 0; k <= degree; k++) {
      if (k > 0) fact *= k;
      const atExpr = tryStr(() => cas()(derivs[k]).sub(v, String(at)).evaluate());
      if (atExpr === null) return { ok: false, reason: "Couldn't evaluate the order-" + k + " derivative at " + v + " = " + at + "." };
      const num = parseFloat(cas()(atExpr).evaluate().text("decimals"));
      if (!Number.isFinite(num)) return { ok: false, reason: "The order-" + k + " derivative is not finite at " + v + " = " + at + "." };
      const coefExpr = fact === 1 ? atExpr : tryStr(() => cas()("(" + atExpr + ")/" + fact).evaluate());
      coeffs.push({ value: coefExpr === null ? String(num / fact) : coefExpr, num: num / fact });
    }

    // Build the polynomial as an exact symbolic sum so it can be verified and rendered like
    // any other result here, not just evaluated numerically term by term.
    const shift = at === 0 ? v : "(" + v + "-(" + at + "))";
    const terms = coeffs.map((c, k) => k === 0 ? c.value : "(" + c.value + ")*" + shift + (k === 1 ? "" : "^" + k));
    const poly = tryStr(() => cas()(terms.join("+")).toString()) || terms.join("+");

    const polyFn = numericFn(poly, v);
    if (!polyFn) return { ok: false, reason: "Couldn't build a numeric form of the Taylor polynomial." };

    // Verify: P(a) must equal f(a) exactly (by construction), and P must track f nearby.
    const atF = f(at);
    const atP = polyFn(at);
    let verified = atF !== null && atP !== null && Math.abs(atF - atP) <= 1e-6 * Math.max(1, Math.abs(atF));
    if (verified) {
      for (const h of TAYLOR_CHECK_OFFSETS) {
        const x = at + h;
        const fy = f(x), py = polyFn(x);
        if (fy === null || py === null) continue; // outside f's domain — not a disagreement
        if (Math.abs(fy - py) > TAYLOR_CHECK_TOL * Math.max(1, Math.abs(fy))) { verified = false; break; }
      }
    }
    if (!verified) {
      return {
        ok: false,
        reason: "The degree-" + degree + " Taylor polynomial does not track f(x) near " + v + " = " + at + " closely enough to report — try a lower degree or a different center."
      };
    }

    const steps = buildTaylorSteps(normalized, v, at, degree, derivs, coeffs, poly);
    return {
      ok: true,
      technique: "taylor-series",
      degree,
      center: at,
      coeffs: coeffs.map((c) => c.num),
      result: poly,
      latex: toTeX(poly),
      verified: true,
      steps
    };
  };

  function buildTaylorSteps(expr, v, at, degree, derivs, coeffs, poly) {
    const steps = [{
      rule: "The function",
      text: "f(" + v + ") = " + expr,
      latex: "f(" + v + ") = " + toTeX(expr)
    }];
    const shown = Math.min(degree, 4); // beyond order 4 the derivative chain adds noise, not insight
    for (let k = 0; k <= shown; k++) {
      steps.push({
        rule: k === 0 ? "f(a)" : k <= 3 ? "f" + "′".repeat(k) + "(a)" : "f^(" + k + ")(a)",
        text: "f^(" + k + ")(" + v + ") = " + derivs[k] + "  =>  at " + v + " = " + at + ": " + coeffs[k].value,
        latex: "f^{(" + k + ")}(" + v + ") = " + toTeX(derivs[k]) + "\\ \\Rightarrow\\ " + toTeX(String(coeffs[k].value))
      });
    }
    if (degree > shown) {
      steps.push({
        rule: "…continuing to degree " + degree,
        text: "coefficients c_" + (shown + 1) + " through c_" + degree + " computed the same way",
        latex: "c_{" + (shown + 1) + "} \\ldots c_{" + degree + "}\\text{ computed the same way}"
      });
    }
    steps.push({
      rule: "Assemble the polynomial",
      text: "P_" + degree + "(" + v + ") = " + poly,
      latex: "P_{" + degree + "}(" + v + ") = " + toTeX(poly)
    });
    steps.push({
      rule: "Check",
      text: "P_" + degree + "(" + at + ") = f(" + at + ")  and P_" + degree + " tracks f nearby ✓",
      latex: "P_{" + degree + "}(" + at + ") = f(" + at + ")\\ \\checkmark"
    });
    return steps;
  }

  /* ================================ SERIES: CONVERGENCE TESTS ========================

     convergenceTests(term, variable) classifies ∑ aₙ — given only the general term aₙ as a
     string in the index variable (default "n") — by walking the standard decision tree a
     Stewart-style course teaches, in the order it teaches them: nth-term → geometric →
     p-series → integral → limit-comparison → ratio → root → alternating. The first test that
     returns a conclusive verdict wins; every test that was tried-and-found-inconclusive is
     recorded as a step so the derivation shows the whole ladder, not just the winner.

     Every verdict is cross-checked by numericSeriesCheck, which evaluates the actual partial
     sums S_N = a₁+…+aₙ. The gate is a clear-contradiction detector, not a proof: a numeric
     partial-sum probe fundamentally cannot confirm a slowly-convergent p-series (p just above
     1) at finite N, so the gate trusts the symbolic verdict and only refuses when the partial
     sums clearly contradict it (blowing up on a "converges" verdict, or settling to a limit on
     a "diverges" verdict). The symbolic tests are correct by construction — this catches bugs.

     Returns the standard shape { ok, technique, term, verdict, test, sum?, reason, steps[],
     latex, verified }. ok:false is either a refusal (term doesn't parse / doesn't depend on n
     / depends on another free variable like x — "this looks like a power-series term, use the
     Power Series method") or an honest "no standard test gave a conclusive verdict". Like
     computeLimit's kind:"dne", an inconclusive tree is a first-class result, not an error.
  */

  // node is free of the index variable v (no v anywhere in the tree)
  function isFreeOf(node, v) {
    let c = true;
    node.traverse(function (m) { if (m.type === "SymbolNode" && m.name === v) c = false; });
    return c;
  }
  // numeric value of a node that is constant in v (no free variables at all)
  function numEvalConst(node) {
    const s = tryStr(() => cas()(node.toString()).evaluate({}).text("decimals"));
    return s === null ? NaN : parseFloat(s);
  }

  // Structural match of aₙ = coef · v^exp where coef and exp are constants. Returns
  // { coef, exp } or null. Run on the nerdamer-normalised form, which turns 1/n^2 into n^(-2),
  // 2/n^2 into 2*n^(-2), and 1/sqrt(n) into sqrt(n)^(-1). vPower recognises v, sqrt(v) (=v^½),
  // v^k, and compositions like (sqrt(v))^k, so fractional p-series (1/√n → p=½) match too.
  // Anything with a non-constant factor ((-1)^n, 2^(-n), n^2+1, 1/(n·log n)) returns null and
  // falls through to the integral / limit-comparison / ratio tests.
  function vPower(node, v) {
    node = unwrapNode(node);
    if (node.type === "SymbolNode" && node.name === v) return 1;
    if (node.type === "FunctionNode" && node.fn && node.fn.name === "sqrt") {
      const inner = vPower(node.args[0], v);
      return inner === null ? null : inner / 2;
    }
    if (node.type === "OperatorNode" && node.op === "^") {
      const base = unwrapNode(node.args[0]), e = unwrapNode(node.args[1]);
      const b = vPower(base, v);
      if (b !== null && isFreeOf(e, v)) {
        const ek = numEvalConst(e);
        return Number.isFinite(ek) ? b * ek : null;
      }
    }
    return null;
  }
  function matchPowTerm(termStr, v) {
    const nstr = tryStr(() => cas()(termStr).toString());
    if (!nstr) return null;
    let node;
    try { node = mathjs.parse(nstr); } catch (e) { return null; }
    node = unwrapNode(node);
    if (node.type === "OperatorNode" && node.op === "*" && node.args.length === 2) {
      for (const ord of [[0, 1], [1, 0]]) {
        const a = unwrapNode(node.args[ord[0]]), b = node.args[ord[1]];
        if (isFreeOf(a, v) && Number.isFinite(numEvalConst(a))) {
          const e = vPower(b, v);
          if (e !== null) return { coef: numEvalConst(a), exp: e };
        }
      }
      return null;
    }
    const e = vPower(node, v);
    if (e !== null) return { coef: 1, exp: e };
    return null;
  }

  const RATIO_BOUNDARY_TOL = 1e-2; // |L - 1| within this => ratio/root test inconclusive
  // ratio/root limits stabilise fast (they are the tests for exponential/factorial growth), so
  // probing at MODERATE n is enough — and it sidesteps the n!/n^n and n^n overflow that kills
  // any probe at 1e6. Capped at 140: 171! overflows, 141^141 overflows, but n≤140 keeps both
  // finite, and the ratio a(n+1)/a(n) at n=140 only needs a(141) which is still finite.
  const SERIES_RATIO_PROBES = [30, 50, 80, 110, 140];
  // nth-term / alternating trend probes. Moderate on purpose: factorial/power terms (n!/n^n,
  // 2^n/n!) overflow past n≈170, so probing at 1e6 would see only nulls. These points keep
  // such terms finite while still showing exponential blow-up (2^n) clearly.
  const SERIES_TREND_PROBES = [50, 100, 150, 200, 300, 500];

  // Is the term eventually strictly positive? Samples CONSECUTIVE n (so an alternating sign
  // pattern like (-1)^n is caught — PROBE_INFINITE is all even and would false-positive it) plus
  // a few large points. Used to gate the integral and limit-comparison tests, which only apply
  // to positive-term series.
  function eventuallyPositive(fn) {
    const pts = [];
    for (let i = 0; i < 10; i++) pts.push(fn(100 + i));
    [1e3, 1e4, 1e5].forEach((m) => pts.push(fn(m)));
    const valid = pts.filter((y) => y !== null && Number.isFinite(y));
    if (valid.length < 5) return false;
    return valid.every((y) => y > 0);
  }

  // Trend of the sequence aₙ as n→∞, distinguishing four outcomes the nth-term test needs:
  //   "zero"           magnitude shrinking toward 0  (lim = 0)        → nth-term inconclusive
  //   "finite"         stable nonzero value          (lim = L ≠ 0)    → nth-term DIVERGES
  //   "+inf" / "-inf"  magnitude blowing up                           → nth-term DIVERGES
  //   "none"           oscillation / limit DNE                        → nth-term DIVERGES
  // "zero" is the subtle one: 1/√n at n≤500 is still ~0.045, not below any absolute threshold,
  // yet it is plainly heading to 0. The signal is monotone-decreasing magnitude combined with
  // a meaningful relative step (|last−prev|/|last| > 1e-2 — the value is still shedding a real
  // fraction of itself each probe, i.e. decaying, not levelling off at a nonzero constant like
  // n/(n+1)→1 whose steps shrink relative to the value). Overflow-tolerant: a term that decayed
  // to 0 and then underflowed to exactly 0 / NaN at larger probes is "zero" via |last| < 1e-2.
  function sequenceTrend(f) {
    const vals = SERIES_TREND_PROBES.map((m) => f(m)).filter((y) => y !== null && Number.isFinite(y));
    if (vals.length === 0) return { type: "none" };
    const last = vals[vals.length - 1];
    if (vals.length >= 2) {
      const prev = vals[vals.length - 2];
      if (Math.abs(last) > DIVERGENCE_FLOOR && Math.abs(last) > Math.abs(prev) * DIVERGENCE_GROWTH)
        return { type: last > 0 ? "+inf" : "-inf" };
    }
    const absV = vals.map(Math.abs);
    const monotoneDown = absV.every((y, i) => i === 0 || y <= absV[i - 1] + 1e-12);
    if (monotoneDown) {
      if (vals.length >= 2) {
        const prev = vals[vals.length - 2];
        const relStep = Math.abs(last - prev) / Math.max(1e-12, Math.abs(last));
        if (Math.abs(last) < 1e-2 || relStep > 1e-2) return { type: "zero", value: last };
      } else if (Math.abs(last) < 1e-2) {
        return { type: "zero", value: last };
      }
    }
    if (Math.abs(last) >= 1e-2) return { type: "finite", value: last };
    return { type: "none" };
  }

  // lim_{n→∞} |a(n+1)/a(n)| — for the ratio test. Loose stability (1e-2) because moderate-n
  // probes of a ratio still settling to its limit (e.g. (1+1/n)²/2 → 0.5) differ by ~1/n²,
  // tighter than LIMIT_REL_TOL can confirm; we only need the value clearly on one side of 1.
  function ratioLimit(termFn) {
    const rs = [];
    for (const n of SERIES_RATIO_PROBES) {
      const a1 = termFn(n), a2 = termFn(n + 1);
      if (a1 === null || a2 === null || a1 === 0) continue;
      const r = Math.abs(a2 / a1);
      if (Number.isFinite(r)) rs.push(r);
    }
    if (rs.length < 2) return { type: "none" };
    const last = rs[rs.length - 1], prev = rs[rs.length - 2];
    if (last > DIVERGENCE_FLOOR && last > prev * DIVERGENCE_GROWTH) return { type: "+inf" };
    if (Math.abs(last - prev) <= 1e-2 * Math.max(1, Math.abs(last))) return { type: "finite", value: last };
    return { type: "none" };
  }

  // lim_{n→∞} |a(n)|^(1/n) — for the root test. The root approaches its limit SLOWER than the
  // ratio does (1/(n·log n) has root climbing through 0.94→0.954 toward 1 while its ratio is
  // already at 0.991), so the root test needs a TIGHTER stability check (5e-3) than the ratio
  // test — otherwise a root still climbing toward an inconclusive limit of 1 is misread as a
  // stable value below 1 and the test falsely says "converges".
  function rootLimit(termFn) {
    const rs = [];
    for (const n of SERIES_RATIO_PROBES) {
      const a = termFn(n);
      if (a === null || a === 0) continue;
      const r = Math.pow(Math.abs(a), 1 / n);
      if (Number.isFinite(r)) rs.push(r);
    }
    if (rs.length < 2) return { type: "none" };
    const last = rs[rs.length - 1], prev = rs[rs.length - 2];
    if (last > DIVERGENCE_FLOOR && last > prev * DIVERGENCE_GROWTH) return { type: "+inf" };
    if (Math.abs(last - prev) <= 5e-3 * Math.max(1, Math.abs(last))) return { type: "finite", value: last };
    return { type: "none" };
  }

  // Partial-sum verification gate. Form-independent (never asks the CAS, only evaluates the
  // term). A "converges" verdict is refused only if the finite partial sums clearly blow up; a
  // "diverges" verdict is refused only if they clearly settle to a limit. Everything else
  // trusts the symbolic verdict — see the section header for why a proof-strength gate is
  // impossible for slow p-series at finite N.
  //
  // Overflow-tolerant: fast-decay terms (2^n/n!) reach 0 then evaluate to NaN at large n once
  // both numerator and denominator overflow; a divergent blow-up (2^n) also hits NaN. Overflow
  // alone is therefore NOT a contradiction in either direction — we classify from the partial
  // sums that were finite: blow-up among them contradicts "converges", settling among them
  // contradicts "diverges", and anything ambiguous trusts the symbolic verdict.
  function numericSeriesCheck(termFn, verdict) {
    if (!termFn) return false;
    const cps = [200, 1000, 4000];
    let S = 0, k = 1, sums = [], overflow = false;
    for (const N of cps) {
      for (; k <= N; k++) {
        const t = termFn(k);
        if (t === null || !Number.isFinite(t)) { overflow = true; break; }
        S += t;
      }
      if (!overflow) sums.push(S);
      if (overflow) break;
    }
    const blewUp = sums.length >= 2
      && Math.abs(sums[sums.length - 1]) > 1e6
      && Math.abs(sums[sums.length - 1]) > Math.abs(sums[sums.length - 2]) * 1.5;
    const settled = sums.length >= 3
      && Math.abs(sums[2] - sums[1]) < 1e-4
      && Math.abs(sums[2] - sums[1]) < Math.abs(sums[1] - sums[0])
      && Math.abs(sums[2]) < 1e6;
    if (verdict === "converges") return !blewUp;   // trust unless finite sums clearly blew up
    return !settled;                                // diverges: trust unless finite sums clearly settled
  }

  CalculusSymbolic.convergenceTests = function (term, variable) {
    const v = variable || "n";
    const base = { technique: "convergence-tests", term: String(term) };

    // ---- refusals: malformed / wrong-kind input ----
    if (varsOf(term) === null) return { ...base, ok: false, reason: "the term does not parse as a mathematical expression." };
    const vs = varsOf(term);
    if (vs.indexOf(v) === -1)
      return { ...base, ok: false, reason: "the term does not depend on the index " + v + " — a series term must vary with its index." };
    if (vs.some((w) => w !== v))
      return { ...base, ok: false, reason: "the term depends on another free variable (" + vs.filter((w) => w !== v).join(", ") + ") — this looks like a power-series term; use the Power Series method for ∑cₙ(x−a)ⁿ." };

    const fn = numericFn(term, v);
    if (!fn) return { ...base, ok: false, reason: "the term could not be evaluated numerically." };
    const termTeX = toTeX(term);
    const steps = [];
    function pushStep(rule, text, latex) { steps.push({ rule, text, latex: latex || "" }); }

    // ---------- 1. nth-term (divergence) test ----------
    {
      const L = sequenceTrend(fn);
      // "finite" with a value of essentially 0 (overflow of a decaying term rounded to a stable
      // 0) is really "zero" — treat it as inconclusive, not as a nonzero limit.
      const isZero = L.type === "zero" || (L.type === "finite" && Math.abs(L.value) < 1e-6);
      let note;
      if (isZero) note = "lim aₙ = 0 — inconclusive (the test gives no verdict).";
      else if (L.type === "finite") note = "lim aₙ = " + pretty(String(L.value)) + " ≠ 0 — the series DIVERGES.";
      else if (L.type === "+inf" || L.type === "-inf") note = "lim aₙ = " + (L.type === "+inf" ? "+∞" : "−∞") + " — the series DIVERGES.";
      else note = "lim aₙ does not exist (the terms oscillate) — the series DIVERGES.";
      pushStep("nth-term test", "\\lim_{n\\to\\infty} a_n = " + note.replace(/DIVERGES|inconclusive|does not exist[^.]*/, "").trim() || "see text", "\\lim_{n\\to\\infty} " + termTeX);
      if (!isZero) {
        const verdict = "diverges";
        const reason = L.type === "finite"
          ? "the terms approach " + pretty(String(L.value)) + " ≠ 0, so by the nth-term (divergence) test the series diverges."
          : L.type === "none"
            ? "the terms do not approach 0 (the limit does not exist), so by the nth-term test the series diverges."
            : "the terms grow without bound, so by the nth-term (divergence) test the series diverges.";
        if (numericSeriesCheck(fn, verdict))
          return { ...base, ok: true, verdict, test: "nth-term", reason, steps, latex: termTeX, verified: true };
        return { ...base, ok: false, reason: "the nth-term test says the series diverges, but the partial sums disagree with that — refusing to report it.", steps };
      }
    }

    // ---------- 2. geometric ----------
    {
      // aₙ₊₁/aₙ constant r across small n (where nothing overflows). 1/2^n → 0.5 everywhere.
      const probeN = [1, 2, 3, 5, 10, 20];
      const ratios = [];
      for (const n of probeN) {
        const a1 = fn(n), a2 = fn(n + 1);
        if (a1 === null || a2 === null || a1 === 0) { ratios.length = 0; break; }
        ratios.push(a2 / a1);
      }
      if (ratios.length === probeN.length && ratios.every((r) => Number.isFinite(r))) {
        const r = ratios[0];
        if (ratios.every((rr) => Math.abs(rr - r) < 1e-9)) {
          const a1 = fn(1);
          const sum = a1 / (1 - r); // ∑_{n=1}∞ c·rⁿ = cr/(1-r) = a₁/(1-r)
          const absR = Math.abs(r);
          if (absR < 1) {
            pushStep("geometric series", "aₙ₊₁/aₙ = " + pretty(String(r)) + " (constant), |r| < 1 — the series CONVERGES; sum = a₁/(1−r) = " + pretty(String(sum)) + ".", "r=" + toTeX(String(r)));
            if (numericSeriesCheck(fn, "converges"))
              return { ...base, ok: true, verdict: "converges", test: "geometric", sum, reason: "the ratio aₙ₊₁/aₙ is the constant " + pretty(String(r)) + " with |r| < 1, so this is a convergent geometric series with sum " + pretty(String(sum)) + ".", steps, latex: termTeX, verified: true };
            return { ...base, ok: false, reason: "the geometric test says the series converges, but the partial sums disagree — refusing to report it.", steps };
          } else {
            pushStep("geometric series", "aₙ₊₁/aₙ = " + pretty(String(r)) + " (constant), |r| ≥ 1 — the series DIVERGES.", "r=" + toTeX(String(r)));
            if (numericSeriesCheck(fn, "diverges"))
              return { ...base, ok: true, verdict: "diverges", test: "geometric", reason: "the ratio aₙ₊₁/aₙ is the constant " + pretty(String(r)) + " with |r| ≥ 1, so this is a divergent geometric series.", steps, latex: termTeX, verified: true };
            return { ...base, ok: false, reason: "the geometric test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
          }
        }
      }
      pushStep("geometric series", "aₙ₊₁/aₙ is not a constant ratio, so this is not a geometric series — skip.", "");
    }

    // ---------- 3. p-series (structural) ----------
    {
      const m = matchPowTerm(term, v);
      if (m && Number.isFinite(m.exp)) {
        const p = -m.exp; // aₙ = c·n^k = c·n^(-p); converges iff p > 1
        if (p > 1) {
          pushStep("p-series", "aₙ = " + pretty(term) + " is a p-series with p = " + pretty(String(p)) + " > 1 — the series CONVERGES.", "p=" + toTeX(String(p)));
          if (numericSeriesCheck(fn, "converges"))
            return { ...base, ok: true, verdict: "converges", test: "p-series", reason: "aₙ = " + pretty(term) + " is a p-series ∑ 1/nᵖ with p = " + pretty(String(p)) + " > 1, so the series converges.", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the p-series test says the series converges, but the partial sums disagree — refusing to report it.", steps };
        } else {
          pushStep("p-series", "aₙ = " + pretty(term) + " is a p-series with p = " + pretty(String(p)) + " ≤ 1 — the series DIVERGES.", "p=" + toTeX(String(p)));
          if (numericSeriesCheck(fn, "diverges"))
            return { ...base, ok: true, verdict: "diverges", test: "p-series", reason: "aₙ = " + pretty(term) + " is a p-series ∑ 1/nᵖ with p = " + pretty(String(p)) + " ≤ 1, so the series diverges.", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the p-series test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
        }
      }
      pushStep("p-series", "aₙ is not a single power c·nᵏ, so the p-series test does not apply — skip.", "");
    }

    // ---------- 4. integral test ----------
    {
      // The integral test requires a positive (eventually), continuous, decreasing f. We only
      // gate on positivity here (consecutive sampling, so alternating terms are rejected) and
      // trust the rest; then integrate f and read lim F(b) − F(b0).
      if (eventuallyPositive(fn)) {
        const fStr = tryStr(() => cas()(term).sub(cas()(v), cas()("x")).toString());
        // integrate() is a nerdamer *function* (integrate(expr, x)), not a method on the
        // expression object — and it returns the unevaluated "integrate(...)" string when it
        // can't do the integral, which we treat as a skip.
        const FStr = fStr && !/^integrate\(/i.test(fStr)
          ? tryStr(() => cas()("integrate(" + fStr + ",x)"))
          : null;
        const Ffn = (FStr && !/^integrate\(/i.test(FStr)) ? numericFn(FStr, "x") : null;
        if (Ffn) {
          const b0 = [1, 2, 3, 5, 10].map((b) => Ffn(b)).find((y) => y !== null && Number.isFinite(y));
          const limF = probeSide(Ffn, { kind: "+inf" }, 1);
          if (b0 !== undefined && limF.type === "finite") {
            pushStep("integral test", "∫₁∞ f(x) dx = lim F(b) − F(1) = " + pretty(String(limF.value - b0)) + " (finite) — the series CONVERGES.", "\\int_1^\\infty " + toTeX(fStr) + "\\,dx");
            if (numericSeriesCheck(fn, "converges"))
              return { ...base, ok: true, verdict: "converges", test: "integral", reason: "the corresponding integral ∫₁∞ f(x) dx converges (it equals " + pretty(String(limF.value - b0)) + "), so by the integral test the series converges.", steps, latex: termTeX, verified: true };
            return { ...base, ok: false, reason: "the integral test says the series converges, but the partial sums disagree — refusing to report it.", steps };
          }
          if (b0 !== undefined && (limF.type === "+inf" || limF.type === "-inf")) {
            pushStep("integral test", "∫₁∞ f(x) dx = " + (limF.type === "+inf" ? "+∞" : "−∞") + " — the series DIVERGES.", "\\int_1^\\infty " + toTeX(fStr) + "\\,dx");
            if (numericSeriesCheck(fn, "diverges"))
              return { ...base, ok: true, verdict: "diverges", test: "integral", reason: "the corresponding integral ∫₁∞ f(x) dx diverges to " + (limF.type === "+inf" ? "+∞" : "−∞") + ", so by the integral test the series diverges.", steps, latex: termTeX, verified: true };
            return { ...base, ok: false, reason: "the integral test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
          }
        }
      }
      pushStep("integral test", "the integral test did not give a conclusive verdict — skip.", "");
    }

    // ---------- 5. limit comparison (auto-benchmark 1/nᵖ) ----------
    {
      // Only valid for positive-term series (consecutive sampling gates out alternating ones).
      // p = lim -log|aₙ| / log(n); benchmark bₙ = 1/nᵖ; L = lim aₙ·nᵖ. L finite nonzero ⇒ same
      // verdict as the p-series 1/nᵖ. p approaches its integer limit from one side at finite n
      // (n/(n²+1) → p = 1⁺), so snap p to the nearest integer when within 1e-3 to avoid reading
      // a limit of exactly 1 as a spurious 1.0000000001 and concluding "converges".
      if (eventuallyPositive(fn)) {
        const pn = (n) => { const a = fn(n); if (a === null || a === 0) return null; return -Math.log(Math.abs(a)) / Math.log(n); };
        const pLim = probeSide(pn, { kind: "+inf" }, 1);
        if (pLim.type === "finite" && Number.isFinite(pLim.value)) {
          let p = pLim.value;
          if (Math.abs(p - Math.round(p)) < 1e-3) p = Math.round(p);
          const Ln = (n) => { const a = fn(n); if (a === null) return null; return a * Math.pow(n, p); };
          const L = probeSide(Ln, { kind: "+inf" }, 1);
          if (L.type === "finite" && Math.abs(L.value) > 1e-3) {
          if (p > 1) {
            pushStep("limit comparison", "compare to 1/nᵖ with p = " + pretty(String(p)) + " > 1; lim aₙ·nᵖ = " + pretty(String(L.value)) + " ≠ 0 — the series CONVERGES.", "p=" + toTeX(String(p)));
            if (numericSeriesCheck(fn, "converges"))
              return { ...base, ok: true, verdict: "converges", test: "limit-comparison", reason: "aₙ behaves like " + pretty(String(1)) + "/nᵖ with p = " + pretty(String(p)) + " > 1 (lim aₙ·nᵖ = " + pretty(String(L.value)) + ", finite and nonzero), so by limit comparison with the convergent p-series the series converges.", steps, latex: termTeX, verified: true };
            return { ...base, ok: false, reason: "limit comparison says the series converges, but the partial sums disagree — refusing to report it.", steps };
          } else {
            pushStep("limit comparison", "compare to 1/nᵖ with p = " + pretty(String(p)) + " ≤ 1; lim aₙ·nᵖ = " + pretty(String(L.value)) + " ≠ 0 — the series DIVERGES.", "p=" + toTeX(String(p)));
            if (numericSeriesCheck(fn, "diverges"))
              return { ...base, ok: true, verdict: "diverges", test: "limit-comparison", reason: "aₙ behaves like 1/nᵖ with p = " + pretty(String(p)) + " ≤ 1 (lim aₙ·nᵖ = " + pretty(String(L.value)) + ", finite and nonzero), so by limit comparison with the divergent p-series the series diverges.", steps, latex: termTeX, verified: true };
            return { ...base, ok: false, reason: "limit comparison says the series diverges, but the partial sums disagree — refusing to report it.", steps };
          }
        }
        }
      }
      pushStep("limit comparison", "no clean power benchmark 1/nᵖ was found — skip.", "");
    }

    // ---------- 6. ratio test ----------
    {
      const L = ratioLimit(fn);
      if (L.type === "finite") {
        if (L.value < 1 - RATIO_BOUNDARY_TOL) {
          pushStep("ratio test", "lim |aₙ₊₁/aₙ| = " + pretty(String(L.value)) + " < 1 — the series CONVERGES.", "\\lim_{n\\to\\infty}\\left|\\frac{a_{n+1}}{a_n}\\right|=" + toTeX(String(L.value)));
          if (numericSeriesCheck(fn, "converges"))
            return { ...base, ok: true, verdict: "converges", test: "ratio", reason: "lim |aₙ₊₁/aₙ| = " + pretty(String(L.value)) + " < 1, so by the ratio test the series converges.", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the ratio test says the series converges, but the partial sums disagree — refusing to report it.", steps };
        }
        if (L.value > 1 + RATIO_BOUNDARY_TOL) {
          pushStep("ratio test", "lim |aₙ₊₁/aₙ| = " + pretty(String(L.value)) + " > 1 — the series DIVERGES.", "\\lim_{n\\to\\infty}\\left|\\frac{a_{n+1}}{a_n}\\right|=" + toTeX(String(L.value)));
          if (numericSeriesCheck(fn, "diverges"))
            return { ...base, ok: true, verdict: "diverges", test: "ratio", reason: "lim |aₙ₊₁/aₙ| = " + pretty(String(L.value)) + " > 1, so by the ratio test the series diverges.", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the ratio test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
        }
        pushStep("ratio test", "lim |aₙ₊₁/aₙ| = " + pretty(String(L.value)) + " ≈ 1 — inconclusive.", "");
      } else if (L.type === "+inf") {
        pushStep("ratio test", "lim |aₙ₊₁/aₙ| = +∞ — the series DIVERGES.", "\\lim_{n\\to\\infty}\\left|\\frac{a_{n+1}}{a_n}\\right|=\\infty");
        if (numericSeriesCheck(fn, "diverges"))
          return { ...base, ok: true, verdict: "diverges", test: "ratio", reason: "lim |aₙ₊₁/aₙ| = +∞ > 1, so by the ratio test the series diverges.", steps, latex: termTeX, verified: true };
        return { ...base, ok: false, reason: "the ratio test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
      } else {
        pushStep("ratio test", "the ratio |aₙ₊₁/aₙ| did not settle to a limit — inconclusive.", "");
      }
    }

    // ---------- 7. root test ----------
    {
      const L = rootLimit(fn);
      if (L.type === "finite") {
        if (L.value < 1 - RATIO_BOUNDARY_TOL) {
          pushStep("root test", "lim |aₙ|^(1/n) = " + pretty(String(L.value)) + " < 1 — the series CONVERGES.", "\\lim_{n\\to\\infty}\\sqrt[n]{|a_n|}=" + toTeX(String(L.value)));
          if (numericSeriesCheck(fn, "converges"))
            return { ...base, ok: true, verdict: "converges", test: "root", reason: "lim |aₙ|^(1/n) = " + pretty(String(L.value)) + " < 1, so by the root test the series converges.", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the root test says the series converges, but the partial sums disagree — refusing to report it.", steps };
        }
        if (L.value > 1 + RATIO_BOUNDARY_TOL) {
          pushStep("root test", "lim |aₙ|^(1/n) = " + pretty(String(L.value)) + " > 1 — the series DIVERGES.", "\\lim_{n\\to\\infty}\\sqrt[n]{|a_n|}=" + toTeX(String(L.value)));
          if (numericSeriesCheck(fn, "diverges"))
            return { ...base, ok: true, verdict: "diverges", test: "root", reason: "lim |aₙ|^(1/n) = " + pretty(String(L.value)) + " > 1, so by the root test the series diverges.", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the root test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
        }
        pushStep("root test", "lim |aₙ|^(1/n) = " + pretty(String(L.value)) + " ≈ 1 — inconclusive.", "");
      } else if (L.type === "+inf") {
        pushStep("root test", "lim |aₙ|^(1/n) = +∞ — the series DIVERGES.", "\\lim_{n\\to\\infty}\\sqrt[n]{|a_n|}=\\infty");
        if (numericSeriesCheck(fn, "diverges"))
          return { ...base, ok: true, verdict: "diverges", test: "root", reason: "lim |aₙ|^(1/n) = +∞ > 1, so by the root test the series diverges.", steps, latex: termTeX, verified: true };
        return { ...base, ok: false, reason: "the root test says the series diverges, but the partial sums disagree — refusing to report it.", steps };
      } else {
        pushStep("root test", "|aₙ|^(1/n) did not settle to a limit — inconclusive.", "");
      }
    }

    // ---------- 8. alternating series test ----------
    {
      // detect sign alternation across CONSECUTIVE n (probeSide only samples even n, so it
      // cannot see (-1)ⁿ; we must walk n, n+1, n+2 directly).
      const start = 20, stretch = 8;
      const seq = [];
      for (let i = 0; i < stretch; i++) { const y = fn(start + i); if (y === null) { seq.length = 0; break; } seq.push(y); }
      const alternating = seq.length === stretch && seq.every((y, i) => y !== 0 && Math.sign(y) === -Math.sign(seq[i - 1]) || i === 0);
      if (alternating) {
        const b = (n) => Math.abs(fn(n));
        // decreasing over the stretch AND a larger window
        const dec1 = seq.every((y, i) => i === 0 || Math.abs(y) <= Math.abs(seq[i - 1]) + 1e-12);
        const big = [1e2, 1e3, 1e4, 1e5].map((n) => b(n));
        const dec2 = big.every((y, i) => i === 0 || y <= big[i - 1] + 1e-9);
        const bTrend = sequenceTrend((n) => b(n));
        const toZero = bTrend.type === "zero" || (bTrend.type === "finite" && Math.abs(bTrend.value) < 1e-2 && Math.abs(bTrend.value) < Math.abs(big[big.length - 1]));
        if (dec1 && dec2 && toZero) {
          pushStep("alternating series test", "signs alternate, bₙ = |aₙ| is decreasing and bₙ → 0 — the series CONVERGES (conditionally).", "b_n=|a_n|\\downarrow 0");
          if (numericSeriesCheck(fn, "converges"))
            return { ...base, ok: true, verdict: "converges", test: "alternating", reason: "the terms alternate in sign with bₙ = |aₙ| decreasing and bₙ → 0, so by the alternating series test the series converges (conditionally).", steps, latex: termTeX, verified: true };
          return { ...base, ok: false, reason: "the alternating series test says the series converges, but the partial sums disagree — refusing to report it.", steps };
        }
        pushStep("alternating series test", "signs alternate but bₙ = |aₙ| is not decreasing to 0 — inconclusive.", "");
      } else {
        pushStep("alternating series test", "the terms do not alternate in sign — skip.", "");
      }
    }

    pushStep("result", "no standard test gave a conclusive verdict for this series.", "");
    return { ...base, ok: false, reason: "no standard convergence test gave a conclusive verdict for this series.", steps };
  }

  /* ================================ SERIES: POWER SERIES & RADIUS ====================

     powerSeries(coeffs, variable, center) analyses ∑ cₙ (x−a)ⁿ — given the coefficient
     formula cₙ in the index n, the series variable (default x), and the centre a (default 0).
     It finds the radius of convergence R from the coefficients (ratio test, root test
     fallback), classifies the two endpoints x = a ± R by reusing the convergence decision
     tree on the endpoint series, and assembles the interval of convergence.

     The radius is the trickiest numeric part: the ratio c_{n+1}/c_n can tend to 0 (cₙ = 1/n! →
     R = ∞), to ∞ (cₙ = n! → R = 0), or to a finite nonzero L (R = 1/L). Telling "→ ∞" from
     "→ a finite limit" when the growth is only polynomial (n!'s ratio is n+1, which at n≤500
     is just 501 — well below any blow-up floor) needs a monotone-and-more-than-doubled check,
     not a magnitude floor. The endpoint series cₙ·Rⁿ can simplify to a constant (cₙ = 1,
     R = 1 → the term is just 1), which the convergence tree would refuse as "doesn't depend
     on n" — so endpoints are pre-checked for a constant term and classified directly.

     Returns { ok, technique, coeffs, variable, center, radius, radiusText, interval,
     endpoints[], steps[], latex, verified }.
  */

  // Classify lim |c_{n+1}/c_n| for the radius computation. Distinguishes the three outcomes the
  // radius needs: "inf" (R=0), "zero" (R=∞), "finite" value (R=1/value), or "none" (try root).
  function classifyRatioLimit(cFn) {
    const probes = [30, 50, 80, 110, 140, 200];
    const rs = [];
    for (const n of probes) {
      const a = cFn(n), b = cFn(n + 1);
      if (a === null || b === null || a === 0) continue;
      const r = Math.abs(b / a);
      if (Number.isFinite(r)) rs.push(r);
    }
    if (rs.length < 2) return { type: "none" };
    const first = rs[0], last = rs[rs.length - 1], prev = rs[rs.length - 2];
    if (last > DIVERGENCE_FLOOR && last > prev * DIVERGENCE_GROWTH) return { type: "inf" };
    const absV = rs.map(Math.abs);
    const monotoneUp = absV.every((y, i) => i === 0 || y >= absV[i - 1] - 1e-12);
    const monotoneDown = absV.every((y, i) => i === 0 || y <= absV[i - 1] + 1e-12);
    // polynomial-growth ratio (n+1, n·e, …): monotone increasing AND more than doubled across the
    // probe range AND still above 1 → heading to ∞ even though it hasn't blown past any floor.
    if (monotoneUp && last > 2 * first && last > 1) return { type: "inf" };
    if (monotoneDown && (last < 1e-2
        || (Math.abs(last - prev) / Math.max(1e-12, last) > 1e-2 && last < first)))
      return { type: "zero" };
    if (Math.abs(last - prev) <= 1e-2 * Math.max(1, last)) return { type: "finite", value: last };
    return { type: "none" };
  }

  // lim |c_n|^(1/n) — root-test fallback for the radius when the ratio is inconclusive.
  function classifyRootLimit(cFn) {
    const rs = [];
    for (const n of SERIES_RATIO_PROBES) {
      const a = cFn(n);
      if (a === null || a === 0) continue;
      const r = Math.pow(Math.abs(a), 1 / n);
      if (Number.isFinite(r)) rs.push(r);
    }
    if (rs.length < 2) return { type: "none" };
    const first = rs[0], last = rs[rs.length - 1], prev = rs[rs.length - 2];
    if (last > DIVERGENCE_FLOOR && last > prev * DIVERGENCE_GROWTH) return { type: "inf" };
    const monotoneUp = rs.every((y, i) => i === 0 || y >= rs[i - 1] - 1e-12);
    if (monotoneUp && last > 2 * first && last > 1) return { type: "inf" };
    if (Math.abs(last - prev) <= 5e-3 * Math.max(1, last)) return { type: "finite", value: last };
    return { type: "none" };
  }

  function fmtSeriesNum(x) {
    if (!Number.isFinite(x)) return x > 0 ? "\\infty" : "-\\infty";
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-6) return String(r);
    return String(Number(x.toFixed(4)));
  }
  function fmtSeriesNumPlain(x) {
    if (!Number.isFinite(x)) return x > 0 ? "∞" : "-∞";
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-6) return String(r);
    return String(Number(x.toFixed(4)));
  }

  // Classify the series at one endpoint x = a ± R. The endpoint term is cₙ·factorⁿ (factor = R
  // or −R). If that simplifies to a constant in n (cₙ = 1, R = 1 → term = 1), classify directly
  // — the convergence tree would otherwise refuse "doesn't depend on n". Otherwise hand the
  // term to convergenceTests and relay its verdict.
  function endpointVerdict(coeffs, factor, v) {
    // The factor MUST be parenthesized: "-1^n" parses as -(1^n) = -1 (a constant), collapsing
    // the alternating endpoint series (-1)^n/n to -1/n. "((-1)^n)" keeps the sign oscillating.
    const termStr = "(" + coeffs + ")*((" + factor + ")^" + v + ")";
    const tfn = numericFn(termStr, v);
    if (!tfn) return { x: factor, verdict: "inconclusive", test: "endpoint", reason: "the endpoint term could not be evaluated." };
    const samples = [50, 100, 200, 500, 1000].map((n) => tfn(n)).filter((y) => y !== null && Number.isFinite(y));
    if (samples.length >= 2 && samples.every((y) => Math.abs(y - samples[0]) < 1e-9 * Math.max(1, Math.abs(samples[0])))) {
      const c = samples[0];
      if (Math.abs(c) < 1e-9)
        return { verdict: "converges", test: "endpoint-constant", reason: "at this endpoint every term is 0, so the series converges (to 0)." };
      return { verdict: "diverges", test: "endpoint-constant", reason: "at this endpoint the terms are the nonzero constant " + fmtSeriesNumPlain(c) + ", so by the nth-term test the series diverges." };
    }
    const r = CalculusSymbolic.convergenceTests(termStr, v);
    if (r.ok) return { verdict: r.verdict, test: r.test, reason: r.reason };
    return { verdict: "inconclusive", test: "endpoint", reason: r.reason || "the endpoint series could not be classified." };
  }

  CalculusSymbolic.powerSeries = function (coeffs, variable, center) {
    const v = "n";
    const x = variable || "x";
    const a = Number(center) || 0;
    const base = { technique: "power-series", coeffs: String(coeffs), variable: x, center: a };
    const steps = [];
    function pushStep(rule, text, latex) { steps.push({ rule, text, latex: latex || "" }); }

    if (varsOf(coeffs) === null) return { ...base, ok: false, reason: "the coefficients do not parse as a mathematical expression." };
    const vs = varsOf(coeffs);
    // Constant coefficients are legitimate (cₙ = 1 is the geometric series ∑xⁿ); only a
    // dependence on the series variable itself is a misuse — cₙ must vary with the index n,
    // not with x.
    if (vs.indexOf(x) !== -1)
      return { ...base, ok: false, reason: "the coefficients depend on the series variable " + x + " — cₙ must depend on n, not on " + x + "." };

    const cFn = numericFn(coeffs, v);
    if (!cFn) return { ...base, ok: false, reason: "the coefficients could not be evaluated numerically." };
    const coeffsTeX = toTeX(coeffs);

    // ---- radius via the ratio test on the coefficients (root fallback) ----
    let R = null, radiusMethod = null, ratioL = null;
    const cr = classifyRatioLimit(cFn);
    if (cr.type === "inf") { R = 0; radiusMethod = "ratio"; ratioL = Infinity; }
    else if (cr.type === "zero") { R = Infinity; radiusMethod = "ratio"; ratioL = 0; }
    else if (cr.type === "finite") {
      R = Math.abs(cr.value) < 1e-9 ? Infinity : 1 / cr.value;
      radiusMethod = "ratio"; ratioL = cr.value;
      if (Number.isFinite(R) && Math.abs(R - Math.round(R)) < 0.05) R = Math.round(R); // 1/0.993 → 1.007 → snap to 1
    } else {
      const rt = classifyRootLimit(cFn);
      if (rt.type === "inf") { R = 0; radiusMethod = "root"; }
      else if (rt.type === "zero") { R = Infinity; radiusMethod = "root"; }
      else if (rt.type === "finite") {
        R = Math.abs(rt.value) < 1e-9 ? Infinity : 1 / rt.value;
        radiusMethod = "root"; ratioL = rt.value;
        if (Number.isFinite(R) && Math.abs(R - Math.round(R)) < 0.05) R = Math.round(R);
      } else {
        return { ...base, ok: false, reason: "the radius of convergence could not be determined — neither the ratio nor the root test settled on the coefficients.", steps };
      }
    }
    const radiusText = R === Infinity ? "∞" : fmtSeriesNumPlain(R);
    pushStep("coefficients", "the series is ∑ cₙ(x−a)ⁿ with cₙ = " + pretty(coeffs) + " and centre a = " + a + ".", "\\sum c_n(" + x + "-" + a + ")^n,\\quad c_n=" + coeffsTeX);
    if (radiusMethod === "ratio") {
      const lTex = ratioL === Infinity ? "\\infty" : (ratioL === 0 ? "0" : toTeX(String(ratioL)));
      pushStep("ratio test (radius)", "lim |c_{n+1}/c_n| = " + (ratioL === Infinity ? "∞" : ratioL === 0 ? "0" : fmtSeriesNumPlain(ratioL)) + ", so the radius R = 1/L = " + radiusText + ".", "R=\\frac{1}{" + lTex + "}=" + (R === Infinity ? "\\infty" : fmtSeriesNum(R)));
    } else {
      pushStep("root test (radius)", "the ratio test was inconclusive on the coefficients; lim |c_n|^(1/n) gives radius R = " + radiusText + ".", "R=\\frac{1}{\\lim |c_n|^{1/n}}=" + (R === Infinity ? "\\infty" : fmtSeriesNum(R)));
    }

    // ---- endpoints (only when R is finite, positive, and not ∞) ----
    let interval, endpoints = [];
    if (R === 0) {
      interval = "{" + a + "}";
      endpoints = [];
      pushStep("endpoints", "R = 0: the series converges only at the centre x = " + a + " (where every term is 0).", "");
    } else if (R === Infinity) {
      interval = "(-∞, ∞)";
      endpoints = [];
      pushStep("endpoints", "R = ∞: the series converges for every x — the interval of convergence is (−∞, ∞).", "(-\\infty,\\infty)");
    } else {
      const left = a - R, right = a + R;
      const epL = endpointVerdict(coeffs, -R, v);
      const epR = endpointVerdict(coeffs, R, v);
      endpoints = [
        { x: left, ...epL },
        { x: right, ...epR }
      ];
      const lb = epL.verdict === "converges" ? "[" : "(";
      const rb = epR.verdict === "converges" ? "]" : ")";
      interval = lb + fmtSeriesNumPlain(left) + ", " + fmtSeriesNumPlain(right) + rb;
      const lTex = (epL.verdict === "converges" ? "[" : "(") + fmtSeriesNum(left) + ", " + fmtSeriesNum(right) + (epR.verdict === "converges" ? "]" : ")");
      pushStep("endpoint x = " + fmtSeriesNumPlain(left), (epL.verdict === "converges" ? "CONVERGES" : epL.verdict === "diverges" ? "DIVERGES" : "inconclusive") + " — " + epL.reason, x + "=" + fmtSeriesNum(left) + ":\\ " + (epL.verdict === "converges" ? "\\text{converges}" : "\\text{diverges}"));
      pushStep("endpoint x = " + fmtSeriesNumPlain(right), (epR.verdict === "converges" ? "CONVERGES" : epR.verdict === "diverges" ? "DIVERGES" : "inconclusive") + " — " + epR.reason, x + "=" + fmtSeriesNum(right) + ":\\ " + (epR.verdict === "converges" ? "\\text{converges}" : "\\text{diverges}"));
      pushStep("interval of convergence", "the interval of convergence is " + interval + ".", lTex);
    }

    // ---- numeric verification gate: converges inside the radius, diverges outside ----
    let verified = false;
    function gateTerm(xOff) { // xOff = x - a
      return numericFn("(" + coeffs + ")*(" + xOff + "^" + v + ")", v);
    }
    if (R === Infinity) {
      const tIn = gateTerm(1); // any x converges; x−a = 1 → cₙ·1ⁿ = cₙ
      verified = !!tIn && numericSeriesCheck(tIn, "converges");
    } else if (R === 0) {
      const tCenter = gateTerm(0); // x = a → cₙ·0ⁿ = 0 (converges to 0)
      const tOut = gateTerm(0.5);   // any x ≠ a diverges when R = 0
      verified = !!tCenter && !!tOut && numericSeriesCheck(tCenter, "converges") && numericSeriesCheck(tOut, "diverges");
    } else {
      const tIn = gateTerm(0.5 * R);  // |x−a| = R/2 < R → converges
      const tOut = gateTerm(1.5 * R); // |x−a| = 1.5R > R → diverges
      verified = !!tIn && !!tOut && numericSeriesCheck(tIn, "converges") && numericSeriesCheck(tOut, "diverges");
    }
    if (!verified)
      return { ...base, ok: false, reason: "the radius/interval did not check out against the numeric partial sums — refusing to report it.", steps, radius: R, radiusText, interval };

    const rTex = R === Infinity ? "\\infty" : fmtSeriesNum(R);
    let intervalTex;
    if (R === 0) intervalTex = "\\{" + a + "\\}";
    else if (R === Infinity) intervalTex = "(-\\infty,\\infty)";
    else {
      const lb = endpoints[0] && endpoints[0].verdict === "converges" ? "[" : "(";
      const rb = endpoints[1] && endpoints[1].verdict === "converges" ? "]" : ")";
      intervalTex = lb + fmtSeriesNum(a - R) + ", " + fmtSeriesNum(a + R) + rb;
    }
    return { ...base, ok: true, radius: R, radiusText, interval, endpoints, steps,
             latex: "R=" + rTex + ",\\quad " + intervalTex, verified: true };
  }

  /* ================================ CURVE SKETCHING ================================

     f' locates increasing/decreasing and critical points; f'' locates concavity and
     inflection points. Both derivatives come from diff(), which is unconditionally trusted
     elsewhere in this file. Locating their ROOTS is the hard part, and nerdamer's solve() is
     only trustworthy for algebraic (polynomial/rational) expressions — confirmed by direct
     experiment: solve(diff(sin(x),x), x), i.e. solve(cos(x), x), does not return the textbook
     answer pi/2 + k*pi. It silently falls back to a NUMERIC root search and hands back
     dozens of ugly rational approximations of individual roots (e.g. "359657293/228964944"
     for what is really pi/2), with no indication that this is not an exact symbolic result.
     Presenting one of those as "the exact critical point" would be exactly the kind of
     confidently-wrong output the verification gate exists to prevent.

     So: solve() is used ONLY when the derivative contains no transcendental function call
     (sin/cos/exp/log/sqrt/...), where it is reliable and gives genuinely exact answers
     (fractions, sqrt(2), etc). Otherwise — and as a safety net if solve() still returns an
     implausible number of "real" roots even for an algebraic expression — critical and
     inflection points are found by scanning the requested interval for sign changes in f' and
     f'' and bisecting, which works regardless of what functions are involved and cannot hang
     (unlike nerdamer's own equation solving, this is bounded numeric iteration on a function
     already known to evaluate safely). Points found this way are marked inexact so the page
     can show "≈" instead of "=". */
  const TRANSCENDENTAL_RE = /\b(sin|cos|tan|sec|csc|cot|asin|acos|atan|sinh|cosh|tanh|log|ln|exp|sqrt|abs)\s*\(/i;
  const MAX_TRUSTED_ROOTS = 10;
  const SIGN_SCAN_SAMPLES = 2000;
  const BISECT_PASSES = 60;

  // Real roots of exprStr = 0, via nerdamer's solve(). Complex roots (anything whose
  // evaluated text contains "i") are dropped. Returns null (not []) if solve() itself throws,
  // so the caller can tell "no roots" apart from "couldn't ask the question".
  function realRootsOf(exprStr, v) {
    let solved;
    try { solved = cas()("solve(" + exprStr + "," + v + ")"); } catch (e) { return null; }
    const elements = (solved && solved.symbol && solved.symbol.elements) ? solved.symbol.elements : null;
    if (!elements) return [];
    const roots = [];
    for (const el of elements) {
      let txt;
      try { txt = cas()(el).evaluate().text("decimals"); } catch (e) { continue; }
      if (txt.indexOf("i") !== -1) continue; // nonzero imaginary part — not a real root
      const num = parseFloat(txt);
      if (!Number.isFinite(num)) continue;
      let exactStr;
      try { exactStr = el.toString(); } catch (e) { exactStr = txt; }
      roots.push({ exact: exactStr, value: num, exactKnown: true });
    }
    return roots;
  }

  // Scans [a, b] for sign changes in fn and bisects each one down to a numeric root.
  // Ascending order, one entry per genuine crossing (a mere touch at 0, e.g. f''=x^2 at 0,
  // produces no sign change and so is correctly not reported as an inflection point).
  function scanForRoots(fn, a, b) {
    const step = (b - a) / SIGN_SCAN_SAMPLES;
    const xs = [], ys = [];
    for (let i = 0; i <= SIGN_SCAN_SAMPLES; i++) {
      const x = a + i * step;
      xs.push(x);
      ys.push(evalSafe(fn, x));
    }
    const roots = [];
    for (let i = 1; i <= SIGN_SCAN_SAMPLES; i++) {
      const y0 = ys[i - 1], y1 = ys[i];
      if (y0 === null || y1 === null || y0 * y1 >= 0) continue;
      let lo = xs[i - 1], hi = xs[i], flo = y0;
      for (let k = 0; k < BISECT_PASSES; k++) {
        const mid = (lo + hi) / 2;
        const fm = evalSafe(fn, mid);
        if (fm === null) break;
        if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      roots.push({ exact: null, value: (lo + hi) / 2, exactKnown: false });
    }
    return roots;
  }

  // The single decision point for "can this root list be trusted symbolically": no
  // transcendental functions in play, solve() didn't throw, and it didn't hand back an
  // implausible flood of numeric-search artifacts.
  function findRoots(derivExprStr, derivFn, a, b) {
    if (!TRANSCENDENTAL_RE.test(derivExprStr)) {
      const exact = realRootsOf(derivExprStr, "x");
      if (exact !== null && exact.length <= MAX_TRUSTED_ROOTS) {
        return exact.filter((r) => r.value >= a && r.value <= b).sort((p, q) => p.value - q.value);
      }
    }
    return scanForRoots(derivFn, a, b);
  }

  function classifySign(fn, x0, span) {
    const eps = Math.max(span * 1e-4, 1e-6);
    const before = evalSafe(fn, x0 - eps);
    const after = evalSafe(fn, x0 + eps);
    return { before, after };
  }

  /* CalculusSymbolic.curveAnalysis(expr, variable, a, b)

     Returns
       { ok: true, derivative, secondDerivative, criticalPoints, inflectionPoints,
         monotonic: [...], concavity: [...], steps, verified }
     or
       { ok: false, reason }

     criticalPoints: [{ x, exact, kind: "max"|"min"|"neither", fValue }]
     inflectionPoints: [{ x, exact, fValue }]
     monotonic / concavity: [{ from, to, sign: "+"|"-" }] covering [a, b] end to end. */
  CalculusSymbolic.curveAnalysis = function (expr, variable, a, b) {
    const v = variable || "x";
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The expression must be a non-empty string.");
    }
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) {
      throw new Error("The interval [a, b] must be finite with b > a.");
    }
    cas();

    let normalized;
    try { normalized = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse the expression: " + expr); }

    const f = numericFn(normalized, v);
    if (!f) return { ok: false, reason: "Couldn't evaluate this expression numerically." };

    const fpExpr = tryStr(() => cas()("diff(" + normalized + "," + v + ")"));
    if (fpExpr === null) return { ok: false, reason: "Couldn't differentiate this expression." };
    const fppExpr = tryStr(() => cas()("diff(" + fpExpr + "," + v + ")"));
    if (fppExpr === null) return { ok: false, reason: "Couldn't differentiate this expression a second time." };

    const fp = numericFn(fpExpr, v);
    const fpp = numericFn(fppExpr, v);
    if (!fp || !fpp) return { ok: false, reason: "Couldn't evaluate the derivatives numerically." };

    const span = b - a;

    const critRoots = findRoots(fpExpr, fp, a, b);
    const criticalPoints = critRoots.map((r) => {
      const { before, after } = classifySign(fp, r.value, span);
      let kind = "neither";
      if (before !== null && after !== null) {
        if (before > 0 && after < 0) kind = "max";
        else if (before < 0 && after > 0) kind = "min";
      }
      return { x: r.value, exact: r.exact, kind, fValue: evalSafe(f, r.value) };
    });

    // findRoots (symbolic branch) reports every algebraic root of f'', including a mere
    // touch (e.g. f''=12x^2 at x=0 for f=x^4) where concavity doesn't actually change — that's
    // not an inflection point. The numeric-scan branch already excludes these via its
    // sign-change bisection; this filter makes the symbolic branch agree with it.
    const inflRoots = findRoots(fppExpr, fpp, a, b).filter((r) => {
      const { before, after } = classifySign(fpp, r.value, span);
      return before !== null && after !== null && before * after < 0;
    });
    const inflectionPoints = inflRoots.map((r) => ({
      x: r.value, exact: r.exact, fValue: evalSafe(f, r.value)
    }));

    // Sub-intervals between consecutive critical/inflection points (plus the endpoints),
    // each stamped with the sign of f' / f'' at its midpoint.
    function intervalsFrom(fn, points) {
      const bounds = [a, ...points.map((p) => p.x), b];
      const out = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const from = bounds[i], to = bounds[i + 1];
        if (to - from < span * 1e-9) continue; // a root sitting exactly on a boundary
        const mid = (from + to) / 2;
        const y = evalSafe(fn, mid);
        out.push({ from, to, sign: y === null ? null : y > 0 ? "+" : "-" });
      }
      return out;
    }

    const monotonic = intervalsFrom(fp, criticalPoints);
    const concavity = intervalsFrom(fpp, inflectionPoints);

    const fmt = (r) => r.exact !== null ? r.exact : formatApprox(r.value);
    const steps = [
      { rule: "The function", text: "f(" + v + ") = " + normalized, latex: "f(" + v + ") = " + toTeX(normalized) },
      { rule: "First derivative", text: "f'(" + v + ") = " + fpExpr, latex: "f'(" + v + ") = " + toTeX(fpExpr) },
      { rule: "Second derivative", text: "f''(" + v + ") = " + fppExpr, latex: "f''(" + v + ") = " + toTeX(fppExpr) },
      {
        rule: "Critical points (f' = 0)",
        text: criticalPoints.length
          ? criticalPoints.map((c) => v + " = " + fmt(c) + " (" + c.kind + ")").join(", ")
          : "none in [" + a + ", " + b + "]",
        latex: criticalPoints.length
          ? criticalPoints.map((c) => v + " = " + (c.exact !== null ? toTeX(c.exact) : c.x.toFixed(4)) + "\\ (\\text{" + c.kind + "})").join(",\\ ")
          : "\\text{none in the interval}"
      },
      {
        rule: "Inflection points (f'' = 0, sign change)",
        text: inflectionPoints.length
          ? inflectionPoints.map((p) => v + " = " + fmt(p)).join(", ")
          : "none in [" + a + ", " + b + "]",
        latex: inflectionPoints.length
          ? inflectionPoints.map((p) => v + " = " + (p.exact !== null ? toTeX(p.exact) : p.x.toFixed(4))).join(",\\ ")
          : "\\text{none in the interval}"
      }
    ];

    return {
      ok: true,
      derivative: fpExpr,
      derivativeLatex: toTeX(fpExpr),
      secondDerivative: fppExpr,
      secondDerivativeLatex: toTeX(fppExpr),
      criticalPoints,
      inflectionPoints,
      monotonic,
      concavity,
      steps,
      verified: true
    };
  };

  // Small formatting helper local to curveAnalysis's step text — kept separate from
  // Engine.formatNum (a browser-only helper this file must not depend on, since it also
  // runs in Node under the test suite).
  function formatApprox(x) {
    return "≈" + (Math.round(x * 10000) / 10000);
  }

  /* ================================ APPLIED OPTIMIZATION ================================

     The Calc-1 word-problem procedure, not the Optimization Engine's Gradient
     Descent/Simplex: on a CLOSED interval [a, b], the global max or min of f is attained
     either at a critical point (f' = 0) or at one of the two endpoints — the Extreme Value
     Theorem — so the whole method is "evaluate f at every candidate, keep the best one".
     Reuses findRoots()/evalSafe() from curveAnalysis rather than re-solving f'=0 from
     scratch, since it is exactly the same problem (and the same nerdamer-solve()-is-not-
     always-trustworthy caveat applies here too). */
  CalculusSymbolic.appliedOptimization = function (expr, variable, a, b, goal) {
    const v = variable || "x";
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The expression must be a non-empty string.");
    }
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) {
      throw new Error("The interval [a, b] must be finite with b > a.");
    }
    if (goal !== "max" && goal !== "min") {
      throw new Error("goal must be \"max\" or \"min\".");
    }
    cas();

    let normalized;
    try { normalized = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse the expression: " + expr); }

    const f = numericFn(normalized, v);
    if (!f) return { ok: false, reason: "Couldn't evaluate this expression numerically." };

    const fpExpr = tryStr(() => cas()("diff(" + normalized + "," + v + ")"));
    if (fpExpr === null) return { ok: false, reason: "Couldn't differentiate this expression." };
    const fp = numericFn(fpExpr, v);
    if (!fp) return { ok: false, reason: "Couldn't evaluate the derivative numerically." };

    const critRoots = findRoots(fpExpr, fp, a, b);
    const candidates = [
      { x: a, exact: null, label: "left endpoint", fValue: evalSafe(f, a) },
      ...critRoots.map((r) => ({ x: r.value, exact: r.exact, label: "critical point", fValue: evalSafe(f, r.value) })),
      { x: b, exact: null, label: "right endpoint", fValue: evalSafe(f, b) }
    ].filter((c) => c.fValue !== null);

    if (!candidates.length) {
      return { ok: false, reason: "Couldn't evaluate f at any candidate point (endpoints or critical points)." };
    }

    let best = candidates[0];
    for (const c of candidates) {
      if (goal === "max" ? c.fValue > best.fValue : c.fValue < best.fValue) best = c;
    }

    // Safety net: an interior winner must actually be a near-zero of f' — catches a candidate
    // that slipped through with a bad numeric evaluation rather than a genuine root.
    if (best.label === "critical point") {
      const d = evalSafe(fp, best.x);
      const verified = d !== null && Math.abs(d) < 1e-3 * Math.max(1, Math.abs(best.fValue));
      if (!verified) {
        return { ok: false, reason: "The candidate optimum did not check out against the derivative — refusing to report it." };
      }
    }

    const fmtX = (c) => c.exact !== null ? c.exact : formatApprox(c.x);
    const steps = [
      { rule: "The objective function", text: "f(" + v + ") = " + normalized, latex: "f(" + v + ") = " + toTeX(normalized) },
      { rule: "Derivative", text: "f'(" + v + ") = " + fpExpr, latex: "f'(" + v + ") = " + toTeX(fpExpr) },
      {
        rule: "Candidates: critical points and endpoints",
        text: candidates.map((c) => v + " = " + fmtX(c) + " (" + c.label + ") → f = " + c.fValue.toFixed(4)).join(";  "),
        latex: candidates.map((c) => "f(" + (c.exact !== null ? toTeX(c.exact) : c.x.toFixed(4)) + ") = " + c.fValue.toFixed(4)).join(",\\ ")
      },
      {
        rule: goal === "max" ? "The largest candidate value wins" : "The smallest candidate value wins",
        text: v + " = " + fmtX(best) + " (" + best.label + "), f = " + best.fValue.toFixed(4),
        latex: v + " = " + (best.exact !== null ? toTeX(best.exact) : best.x.toFixed(4)) + ",\\quad f = " + best.fValue.toFixed(4)
      }
    ];

    return {
      ok: true,
      goal,
      x: best.x,
      exact: best.exact,
      atEndpoint: best.label !== "critical point",
      value: best.fValue,
      candidates,
      derivative: fpExpr,
      derivativeLatex: toTeX(fpExpr),
      steps,
      verified: true
    };
  };

  /* ================================ VECTORS IN SPACE ================================

     vectorOps(operation, operands) — exact 3D vector algebra. The first multivariable entry
     point. The arithmetic is simple, but it stays in this module so every result on the engine
     comes from the same verified-symbolic discipline: each component is an exact closed form
     (1/2, sqrt(14), -10) produced by nerdamer, and the vector identities a result is supposed
     to satisfy are checked numerically before it is returned. A cross product that isn't
     perpendicular to either factor, or a "unit" vector whose norm isn't 1, is withheld exactly
     like a wrong antiderivative would be — same gate, lower stakes.

     operands is op-dependent:
       add / subtract / dot / cross / distance / angle : [u, v]      (two 3-vectors)
       scalarMultiply                                 : [scalar, u]
       magnitude / unit                               : [u]
       projection                                     : [u, v]   (proj_v u, projection of u onto v)
       tripleProduct                                  : [u, v, w]
     A "vector" is an array of three component strings (or numbers). Returns
       { ok, operation, kind: "vector"|"scalar", result, resultVector?, numeric, latex,
         steps[], verified }
     kind "vector" => resultVector: [sx,sy,sz] exact strings, numeric: [nx,ny,nz]
     kind "scalar" => result: exact string, numeric: number; "angle" also carries
       angleRadians / angleDegrees. ok:false carries { reason }.

     Components go through nerdamer for the exact form and math.js for the numeric check —
     the same division of labour as the limit work. `.toString()` (pretty) is used, never
     `.simplify()`, per the value-flip trap documented in CALCULUS_ENGINE_PLAN.md §3. */
  const VECTOR_TOL = 1e-7;

  function evalNum(str) {
    try {
      const v = mathjs.evaluate(String(str));
      return typeof v === "number" && Number.isFinite(v) ? v : NaN;
    } catch (e) { return NaN; }
  }

  // Parse one component to an exact nerdamer string + a number. Numbers are passed through
  // unchanged; strings are normalized so "2*3" becomes "6" and "1/2" stays "1/2".
  function parseComponent(raw) {
    const s = String(raw).trim();
    if (s === "") return null;
    const exactStr = tryStr(() => cas()(s).toString());
    if (exactStr === null) return null;
    const num = evalNum(exactStr);
    if (!Number.isFinite(num)) return null;
    return { exact: exactStr, num };
  }

  function parseVec(arr) {
    if (!Array.isArray(arr) || arr.length !== 3) return null;
    const out = [];
    for (const c of arr) {
      const p = parseComponent(c);
      if (!p) return null;
      out.push(p);
    }
    return out; // [{exact, num}, ...3]
  }

  // Build an exact expression from a string and normalize it through nerdamer (toString only).
  function exact(exprStr) {
    const s = tryStr(() => cas()(exprStr).toString());
    return s === null ? exprStr : s;
  }

  function vecTex(comps) {
    return "\\left\\langle " + comps.map((c) => toTeX(c)).join(",\\ ") + " \\right\\rangle";
  }

  function numVec(ps) { return ps.map((p) => p.num); }
  function exactVec(ps) { return ps.map((p) => p.exact); }

  // Per-component exact arithmetic, built as one string so nerdamer simplifies the whole term.
  function compAdd(a, b) { return exact("((" + a + ")+(" + b + "))"); }
  function compSub(a, b) { return exact("((" + a + ")-(" + b + "))"); }
  function compMul(a, b) { return exact("((" + a + ")*(" + b + "))"); }
  function compDiv(a, b) { return exact("((" + a + ")/(" + b + "))"); }

  function dotExact(u, v) {
    return exact("((" + u[0] + ")*(" + v[0] + ")+(" + u[1] + ")*(" + v[1] + ")+(" + u[2] + ")*(" + v[2] + "))");
  }
  function dotNum(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }

  function crossExact(u, v) {
    return [
      exact("((" + u[1] + ")*(" + v[2] + ")-(" + u[2] + ")*(" + v[1] + "))"),
      exact("((" + u[2] + ")*(" + v[0] + ")-(" + u[0] + ")*(" + v[2] + "))"),
      exact("((" + u[0] + ")*(" + v[1] + ")-(" + u[1] + ")*(" + v[0] + "))")
    ];
  }

  function magExact(u) {
    return exact("sqrt((" + u[0] + ")^2+(" + u[1] + ")^2+(" + u[2] + ")^2)");
  }
  function magNum(u) { return Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]); }

  CalculusSymbolic.vectorOps = function (operation, operands) {
    if (typeof operation !== "string" || operation.trim() === "") {
      throw new Error("vectorOps needs an operation name.");
    }
    const op = operation.trim();
    cas();

    const need = (n, label) => {
      if (!Array.isArray(operands) || operands.length !== n) {
        return { ok: false, reason: label + " needs " + n + " operand" + (n === 1 ? "" : "s") + "." };
      }
      return null;
    };

    // ---- two-vector operations: add, subtract, dot, cross, distance, angle, projection ----
    if (op === "add" || op === "subtract" || op === "dot" || op === "cross" ||
        op === "distance" || op === "angle" || op === "projection") {
      const bad = need(2, op);
      if (bad) return bad;
      const u = parseVec(operands[0]);
      const v = parseVec(operands[1]);
      if (!u || !v) return { ok: false, reason: "Each vector must have exactly three numeric components." };

      const ue = exactVec(u), ve = exactVec(v);
      const un = numVec(u), vn = numVec(v);
      const uTex = vecTex(ue), vTex = vecTex(ve);

      if (op === "add" || op === "subtract") {
        const comps = op === "add"
          ? [compAdd(ue[0], ve[0]), compAdd(ue[1], ve[1]), compAdd(ue[2], ve[2])]
          : [compSub(ue[0], ve[0]), compSub(ue[1], ve[1]), compSub(ue[2], ve[2])];
        const nums = comps.map(evalNum);
        const expect = op === "add"
          ? [un[0] + vn[0], un[1] + vn[1], un[2] + vn[2]]
          : [un[0] - vn[0], un[1] - vn[1], un[2] - vn[2]];
        const verified = nums.every((n, i) => Math.abs(n - expect[i]) <= VECTOR_TOL * Math.max(1, Math.abs(expect[i])));
        if (!verified) return { ok: false, reason: "The component arithmetic failed its numeric check." };
        const sign = op === "add" ? "+" : "-";
        const steps = [
          { rule: "The vectors", text: "u = " + ue.join(", ") + " ; v = " + ve.join(", "), latex: `\\mathbf{u}=${uTex}\\quad \\mathbf{v}=${vTex}` },
          { rule: "Add componentwise", text: "u " + sign + " v = ⟨" + ue.map((c, i) => c + sign + ve[i]).join(", ") + "⟩",
            latex: `\\mathbf{u}${sign}\\mathbf{v}=${vecTex(ue.map((c, i) => c + sign + ve[i]))}` },
          { rule: "Result", text: "= " + comps.join(", "), latex: `=${vecTex(comps)}` }
        ];
        return { ok: true, operation: op, kind: "vector", resultVector: comps, numeric: nums, latex: vecTex(comps), steps, verified };
      }

      if (op === "dot") {
        const dExact = dotExact(ue, ve);
        const dNum = evalNum(dExact);
        const expect = dotNum(un, vn);
        const verified = Number.isFinite(dNum) && Math.abs(dNum - expect) <= VECTOR_TOL * Math.max(1, Math.abs(expect));
        if (!verified) return { ok: false, reason: "The dot product failed its numeric check." };
        const steps = [
          { rule: "The vectors", text: "u = " + ue.join(", ") + " ; v = " + ve.join(", "), latex: `\\mathbf{u}=${uTex}\\quad \\mathbf{v}=${vTex}` },
          { rule: "Dot product", text: "u·v = " + ue[0] + "·" + ve[0] + " + " + ue[1] + "·" + ve[1] + " + " + ue[2] + "·" + ve[2],
            latex: `\\mathbf{u}\\cdot\\mathbf{v}=${ue[0]}\\cdot${ve[0]}+${ue[1]}\\cdot${ve[1]}+${ue[2]}\\cdot${ve[2]}` },
          { rule: "Result", text: "= " + dExact, latex: `=${toTeX(dExact)}` }
        ];
        return { ok: true, operation: op, kind: "scalar", result: dExact, numeric: dNum, latex: toTeX(dExact), steps, verified };
      }

      if (op === "cross") {
        const comps = crossExact(ue, ve);
        const nums = comps.map(evalNum);
        // A cross product must be perpendicular to both inputs: u·(u×v) = 0 and v·(u×v) = 0.
        const perpU = Math.abs(nums[0] * un[0] + nums[1] * un[1] + nums[2] * un[2]);
        const perpV = Math.abs(nums[0] * vn[0] + nums[1] * vn[1] + nums[2] * vn[2]);
        const mU = magNum(un), mV = magNum(vn);
        const denom = mU * mV;
        const sinTheta = denom > 0
          ? Math.sin(Math.acos(Math.max(-1, Math.min(1, dotNum(un, vn) / denom))))
          : 0;
        const expectMag = denom * sinTheta;
        const verified = perpU <= 1e-6 * Math.max(1, expectMag) && perpV <= 1e-6 * Math.max(1, expectMag) &&
          Math.abs(magNum(nums) - expectMag) <= 1e-6 * Math.max(1, expectMag);
        if (!verified) return { ok: false, reason: "The cross product failed its perpendicularity/magnitude check." };
        const steps = [
          { rule: "The vectors", text: "u = " + ue.join(", ") + " ; v = " + ve.join(", "), latex: `\\mathbf{u}=${uTex}\\quad \\mathbf{v}=${vTex}` },
          { rule: "Determinant", text: "u×v = det[[i,j,k],[" + ue.join(",") + "],[" + ve.join(",") + "]]",
            latex: `\\mathbf{u}\\times\\mathbf{v}=\\begin{vmatrix}\\mathbf{i}&\\mathbf{j}&\\mathbf{k}\\\\${ue[0]}&${ue[1]}&${ue[2]}\\\\${ve[0]}&${ve[1]}&${ve[2]}\\end{vmatrix}` },
          { rule: "Expand", text: "= ⟨" + ue[1] + "·" + ve[2] + "−" + ue[2] + "·" + ve[1] + ", " + ue[2] + "·" + ve[0] + "−" + ue[0] + "·" + ve[2] + ", " + ue[0] + "·" + ve[1] + "−" + ue[1] + "·" + ve[0] + "⟩",
            latex: `=\\left\\langle ${ue[1]}${ve[2]}-${ue[2]}${ve[1]},\\ ${ue[2]}${ve[0]}-${ue[0]}${ve[2]},\\ ${ue[0]}${ve[1]}-${ue[1]}${ve[0]} \\right\\rangle` },
          { rule: "Result", text: "= " + comps.join(", "), latex: `=${vecTex(comps)}` },
          { rule: "Check", text: "u·(u×v)=0 and v·(u×v)=0 ✓", latex: "\\mathbf{u}\\cdot(\\mathbf{u}\\times\\mathbf{v})=0\\ \\checkmark" }
        ];
        return { ok: true, operation: op, kind: "vector", resultVector: comps, numeric: nums, latex: vecTex(comps), steps, verified };
      }

      if (op === "distance") {
        const diff = [compSub(ue[0], ve[0]), compSub(ue[1], ve[1]), compSub(ue[2], ve[2])];
        const mag = magExact(diff);
        const magNumVal = evalNum(mag);
        const expect = magNum([un[0] - vn[0], un[1] - vn[1], un[2] - vn[2]]);
        const verified = Number.isFinite(magNumVal) && Math.abs(magNumVal - expect) <= VECTOR_TOL * Math.max(1, Math.abs(expect));
        if (!verified) return { ok: false, reason: "The distance failed its numeric check." };
        const steps = [
          { rule: "The points", text: "u = " + ue.join(", ") + " ; v = " + ve.join(", "), latex: `\\mathbf{u}=${uTex}\\quad \\mathbf{v}=${vTex}` },
          { rule: "Difference", text: "u−v = " + diff.join(", "), latex: `\\mathbf{u}-\\mathbf{v}=${vecTex(diff)}` },
          { rule: "Magnitude", text: "‖u−v‖ = " + mag, latex: `\\lVert\\mathbf{u}-\\mathbf{v}\\rVert=${toTeX(mag)}` }
        ];
        return { ok: true, operation: op, kind: "scalar", result: mag, numeric: magNumVal, latex: toTeX(mag), steps, verified };
      }

      if (op === "angle") {
        const dotE = dotExact(ue, ve);
        const magU = magExact(ue), magV = magExact(ve);
        const cosE = exact("((" + dotE + ")/((" + magU + ")*(" + magV + ")))");
        const cosNum = evalNum(cosE);
        const dU = magNum(un), dV = magNum(vn);
        if (dU === 0 || dV === 0) return { ok: false, reason: "The angle is undefined for a zero vector." };
        const expectCos = dotNum(un, vn) / (dU * dV);
        const verified = Number.isFinite(cosNum) && Math.abs(cosNum - expectCos) <= 1e-6 * Math.max(1, Math.abs(expectCos)) && cosNum >= -1 - 1e-9 && cosNum <= 1 + 1e-9;
        if (!verified) return { ok: false, reason: "The angle computation failed its numeric check." };
        const clamped = Math.max(-1, Math.min(1, cosNum));
        const angleRad = Math.acos(clamped);
        const steps = [
          { rule: "The vectors", text: "u = " + ue.join(", ") + " ; v = " + ve.join(", "), latex: `\\mathbf{u}=${uTex}\\quad \\mathbf{v}=${vTex}` },
          { rule: "Dot product", text: "u·v = " + dotE, latex: `\\mathbf{u}\\cdot\\mathbf{v}=${toTeX(dotE)}` },
          { rule: "Magnitudes", text: "‖u‖ = " + magU + " ; ‖v‖ = " + magV, latex: `\\lVert\\mathbf{u}\\rVert=${toTeX(magU)}\\quad \\lVert\\mathbf{v}\\rVert=${toTeX(magV)}` },
          { rule: "cos θ", text: "cos θ = (u·v)/(‖u‖‖v‖) = " + cosE, latex: `\\cos\\theta=\\frac{${toTeX(dotE)}}{${toTeX(magU)}\\,${toTeX(magV)}}=${toTeX(cosE)}` },
          { rule: "Angle", text: "θ = arccos(" + cosE + ")", latex: `\\theta=\\arccos\\left(${toTeX(cosE)}\\right)` }
        ];
        return { ok: true, operation: op, kind: "scalar", result: cosE, numeric: cosNum,
          angleRadians: angleRad, angleDegrees: angleRad * 180 / Math.PI,
          latex: "\\cos\\theta=" + toTeX(cosE),
          steps, verified };
      }

      if (op === "projection") {
        // proj_v u = (u·v / v·v) v
        const dotUV = dotExact(ue, ve);
        const dotVV = dotExact(ve, ve);
        const vvNum = dotNum(vn, vn);
        if (Math.abs(vvNum) <= VECTOR_TOL) return { ok: false, reason: "Cannot project onto a zero vector." };
        const coef = exact("((" + dotUV + ")/(" + dotVV + "))");
        const comps = [compMul(coef, ve[0]), compMul(coef, ve[1]), compMul(coef, ve[2])];
        const nums = comps.map(evalNum);
        const coefNum = dotNum(un, vn) / vvNum;
        const expect = [coefNum * vn[0], coefNum * vn[1], coefNum * vn[2]];
        const verified = nums.every((n, i) => Math.abs(n - expect[i]) <= 1e-6 * Math.max(1, Math.abs(expect[i])));
        if (!verified) return { ok: false, reason: "The projection failed its numeric check." };
        const steps = [
          { rule: "The vectors", text: "u = " + ue.join(", ") + " ; v = " + ve.join(", "), latex: `\\mathbf{u}=${uTex}\\quad \\mathbf{v}=${vTex}` },
          { rule: "Scalar coefficient", text: "(u·v)/(v·v) = " + dotUV + "/" + dotVV + " = " + coef,
            latex: `\\frac{\\mathbf{u}\\cdot\\mathbf{v}}{\\mathbf{v}\\cdot\\mathbf{v}}=\\frac{${toTeX(dotUV)}}{${toTeX(dotVV)}}=${toTeX(coef)}` },
          { rule: "Scale v", text: "proj_v u = " + coef + " * v",
            latex: `\\operatorname{proj}_{\\mathbf{v}}\\mathbf{u}=${toTeX(coef)}\\,${vTex}` },
          { rule: "Result", text: "= " + comps.join(", "), latex: `=${vecTex(comps)}` }
        ];
        return { ok: true, operation: op, kind: "vector", resultVector: comps, numeric: nums, latex: vecTex(comps), steps, verified };
      }
    }

    // ---- scalar multiply: [scalar, u] ----
    if (op === "scalarMultiply") {
      const bad = need(2, op);
      if (bad) return bad;
      const sc = parseComponent(operands[0]);
      const u = parseVec(operands[1]);
      if (!sc || !u) return { ok: false, reason: "scalarMultiply needs a scalar and a 3-component vector." };
      const ue = exactVec(u);
      const comps = [compMul(sc.exact, ue[0]), compMul(sc.exact, ue[1]), compMul(sc.exact, ue[2])];
      const nums = comps.map(evalNum);
      const expect = [sc.num * u[0].num, sc.num * u[1].num, sc.num * u[2].num];
      const verified = nums.every((n, i) => Math.abs(n - expect[i]) <= VECTOR_TOL * Math.max(1, Math.abs(expect[i])));
      if (!verified) return { ok: false, reason: "The scalar multiplication failed its numeric check." };
      const uTex = vecTex(ue);
      const steps = [
        { rule: "The vector and scalar", text: "u = " + ue.join(", ") + " ; c = " + sc.exact, latex: `\\mathbf{u}=${uTex}\\quad c=${toTeX(sc.exact)}` },
        { rule: "Scale each component", text: "c·u = " + comps.join(", "), latex: `c\\,\\mathbf{u}=${vecTex(comps)}` }
      ];
      return { ok: true, operation: op, kind: "vector", resultVector: comps, numeric: nums, latex: vecTex(comps), steps, verified };
    }

    // ---- magnitude / unit: [u] ----
    if (op === "magnitude" || op === "unit") {
      const bad = need(1, op);
      if (bad) return bad;
      const u = parseVec(operands[0]);
      if (!u) return { ok: false, reason: op + " needs a 3-component vector." };
      const ue = exactVec(u);
      const mag = magExact(ue);
      const magNumVal = evalNum(mag);
      const expectMag = magNum(numVec(u));
      if (op === "magnitude") {
        const verified = Number.isFinite(magNumVal) && Math.abs(magNumVal - expectMag) <= 1e-7 * Math.max(1, expectMag);
        if (!verified) return { ok: false, reason: "The magnitude failed its numeric check." };
        const steps = [
          { rule: "The vector", text: "u = " + ue.join(", "), latex: `\\mathbf{u}=${vecTex(ue)}` },
          { rule: "Magnitude", text: "‖u‖ = √(" + ue.map((c) => "(" + c + ")^2").join("+") + ") = " + mag,
            latex: `\\lVert\\mathbf{u}\\rVert=\\sqrt{${ue[0]}^2+${ue[1]}^2+${ue[2]}^2}=${toTeX(mag)}` }
        ];
        return { ok: true, operation: op, kind: "scalar", result: mag, numeric: magNumVal, latex: toTeX(mag), steps, verified };
      }
      // unit
      if (Math.abs(expectMag) <= VECTOR_TOL) return { ok: false, reason: "The zero vector has no direction — it cannot be normalized." };
      const comps = [compDiv(ue[0], mag), compDiv(ue[1], mag), compDiv(ue[2], mag)];
      const nums = comps.map(evalNum);
      const unitMag = magNum(nums);
      const verified = Math.abs(unitMag - 1) <= 1e-6;
      if (!verified) return { ok: false, reason: "The normalized vector's norm is not 1 — the check failed." };
      const steps = [
        { rule: "The vector", text: "u = " + ue.join(", "), latex: `\\mathbf{u}=${vecTex(ue)}` },
        { rule: "Magnitude", text: "‖u‖ = " + mag, latex: `\\lVert\\mathbf{u}\\rVert=${toTeX(mag)}` },
        { rule: "Divide by the magnitude", text: "û = u/‖u‖ = " + comps.join(", "), latex: `\\hat{\\mathbf{u}}=\\frac{\\mathbf{u}}{\\lVert\\mathbf{u}\\rVert}=${vecTex(comps)}` },
        { rule: "Check", text: "‖û‖ = 1 ✓", latex: "\\lVert\\hat{\\mathbf{u}}\\rVert=1\\ \\checkmark" }
      ];
      return { ok: true, operation: op, kind: "vector", resultVector: comps, numeric: nums, latex: vecTex(comps), steps, verified };
    }

    // ---- triple product: [u, v, w] => u·(v×w) ----
    if (op === "tripleProduct") {
      const bad = need(3, op);
      if (bad) return bad;
      const u = parseVec(operands[0]);
      const v = parseVec(operands[1]);
      const w = parseVec(operands[2]);
      if (!u || !v || !w) return { ok: false, reason: "tripleProduct needs three 3-component vectors." };
      const ue = exactVec(u), ve = exactVec(v), we = exactVec(w);
      const cw = crossExact(ve, we);
      const tp = dotExact(ue, cw);
      const tpNum = evalNum(tp);
      const un = numVec(u), vn = numVec(v), wn = numVec(w);
      const expect = un[0] * (vn[1] * wn[2] - vn[2] * wn[1]) + un[1] * (vn[2] * wn[0] - vn[0] * wn[2]) + un[2] * (vn[0] * wn[1] - vn[1] * wn[0]);
      const verified = Number.isFinite(tpNum) && Math.abs(tpNum - expect) <= 1e-6 * Math.max(1, Math.abs(expect));
      if (!verified) return { ok: false, reason: "The scalar triple product failed its numeric check." };
      const steps = [
        { rule: "The vectors", text: "u=" + ue.join(",") + " v=" + ve.join(",") + " w=" + we.join(","), latex: `\\mathbf{u}=${vecTex(ue)}\\ \\mathbf{v}=${vecTex(ve)}\\ \\mathbf{w}=${vecTex(we)}` },
        { rule: "Cross first", text: "v×w = " + cw.join(", "), latex: `\\mathbf{v}\\times\\mathbf{w}=${vecTex(cw)}` },
        { rule: "Dot with u", text: "u·(v×w) = " + tp, latex: `\\mathbf{u}\\cdot(\\mathbf{v}\\times\\mathbf{w})=${toTeX(tp)}` }
      ];
      return { ok: true, operation: op, kind: "scalar", result: tp, numeric: tpNum, latex: toTeX(tp), steps, verified };
    }

    return { ok: false, reason: "Unknown vector operation: " + op + "." };
  };

  /* ================================ PARTIAL DERIVATIVES, GRADIENT, TANGENT PLANES =====

     partialDerivatives(expr, vars, point) — the first genuinely multivariable symbolic
     computation: f_x, f_y, ∇f, ∇f at (a, b), and the tangent plane
       z = f(a,b) + f_x(a,b)(x−a) + f_y(a,b)(y−b).
     Each piece is an exact closed form via nerdamer's diff(), and the whole is checked
     numerically before it is returned: the symbolic partials must match central-difference
     approximations at (a, b), and the tangent plane must touch the surface at (a, b) with the
     same slopes. A surface whose "partial" doesn't differentiate back to the integrand-style
     behaviour is withheld, same gate as everywhere else.

     vars defaults to ["x","y"]; point is [a, b] (strings or numbers). Returns
       { ok, technique, fx, fy, grad, point, fAtPoint, fAtPointNum, gradAtPoint, gradAtPointNum,
         tangentPlane, latex, steps[], verified }
     or { ok:false, reason }. */
  const PARTIAL_TOL = 1e-4; // central differences are coarse near non-smooth points

  // Two-variable numeric evaluator through math.js — fast, cannot hang, same division of
  // labour as numericFn. Returns null on a parse failure.
  function numericFn2(exprStr, v0, v1) {
    try {
      const code = mathjs.parse(exprStr).compile();
      return (x, y) => {
        try {
          const z = code.evaluate({ [v0]: x, [v1]: y });
          return typeof z === "number" && Number.isFinite(z) ? z : null;
        } catch (e) { return null; }
      };
    } catch (e) { return null; }
  }

  // Evaluate an exact nerdamer expression at [a, b], returning { exact, num } or null.
  function eval2At(exprStr, v0, v1, a, b) {
    const subbed = tryStr(() => cas()(exprStr).sub(v0, String(a)).sub(v1, String(b)).evaluate());
    if (subbed === null) return null;
    const num = evalNum(subbed);
    if (!Number.isFinite(num)) return null;
    return { exact: subbed, num };
  }

  CalculusSymbolic.partialDerivatives = function (expr, vars, point) {
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The expression must be a non-empty string.");
    }
    const v = Array.isArray(vars) && vars.length === 2 ? vars : ["x", "y"];
    const [vx, vy] = v;
    if (!Array.isArray(point) || point.length !== 2) {
      return { ok: false, reason: "The point must be a pair [a, b]." };
    }
    cas();

    let fStr;
    try { fStr = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse f(x, y): " + expr); }

    const f = numericFn2(fStr, vx, vy);
    if (!f) return { ok: false, reason: "Couldn't evaluate f(x, y) numerically." };

    const aRaw = String(point[0]).trim(), bRaw = String(point[1]).trim();
    const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
      return { ok: false, reason: "The point coordinates must be numbers." };
    }
    const fAtPointNum = f(aNum, bNum);
    if (fAtPointNum === null) return { ok: false, reason: "f is not defined at (" + aRaw + ", " + bRaw + ")." };

    // Symbolic partials — nerdamer's diff() never hangs (confirmed for the limit work).
    const fxStr = tryStr(() => cas()("diff(" + fStr + "," + vx + ")").toString());
    const fyStr = tryStr(() => cas()("diff(" + fStr + "," + vy + ")").toString());
    if (fxStr === null || fyStr === null) {
      return { ok: false, reason: "Couldn't compute the partial derivatives symbolically." };
    }

    // Evaluate each partial and f itself at the point — exact form + number.
    const fxAt = eval2At(fxStr, vx, vy, aRaw, bRaw);
    const fyAt = eval2At(fyStr, vx, vy, aRaw, bRaw);
    const fAt = eval2At(fStr, vx, vy, aRaw, bRaw);
    if (!fxAt || !fyAt || !fAt) {
      return { ok: false, reason: "Couldn't evaluate the partials at the point." };
    }

    // Verification gate: central-difference partials must match the symbolic ones at (a,b),
    // and the tangent plane's value and slopes must agree with the surface there. This is
    // where an incorrect diff() (the documented unreliability on transcendental forms) gets
    // caught — the numeric partial is computed independently from f, not from the derivative.
    const h = 1e-5;
    const fxNumCheck = (f(aNum + h, bNum) - f(aNum - h, bNum)) / (2 * h);
    const fyNumCheck = (f(aNum, bNum + h) - f(aNum, bNum - h)) / (2 * h);
    const slopesOk =
      Math.abs(fxNumCheck - fxAt.num) <= PARTIAL_TOL * Math.max(1, Math.abs(fxAt.num)) &&
      Math.abs(fyNumCheck - fyAt.num) <= PARTIAL_TOL * Math.max(1, Math.abs(fyAt.num));

    // Tangent plane: z = f(a,b) + fx(a,b)*(x-a) + fy(a,b)*(y-b), built exactly.
    const planeStr = tryStr(() => cas()(
      "(" + fAt.exact + ")+(" + fxAt.exact + ")*((" + vx + ")-(" + aRaw + "))+(" + fyAt.exact + ")*((" + vy + ")-(" + bRaw + "))"
    ).toString());
    if (planeStr === null) return { ok: false, reason: "Couldn't assemble the tangent plane." };

    // The plane must touch the surface at (a,b) and share its slopes there.
    const plane = numericFn2(planeStr, vx, vy);
    if (!plane) return { ok: false, reason: "Couldn't evaluate the tangent plane numerically." };
    const planeAtPoint = plane(aNum, bNum);
    const planeSlopeX = (plane(aNum + h, bNum) - plane(aNum - h, bNum)) / (2 * h);
    const planeSlopeY = (plane(aNum, bNum + h) - plane(aNum, bNum - h)) / (2 * h);
    const planeOk =
      planeAtPoint !== null && Math.abs(planeAtPoint - fAtPointNum) <= 1e-9 * Math.max(1, Math.abs(fAtPointNum)) &&
      Math.abs(planeSlopeX - fxAt.num) <= 1e-6 * Math.max(1, Math.abs(fxAt.num)) &&
      Math.abs(planeSlopeY - fyAt.num) <= 1e-6 * Math.max(1, Math.abs(fyAt.num));

    const verified = slopesOk && planeOk;
    if (!verified) {
      return { ok: false, reason: "The partial derivatives or tangent plane failed their numeric check — the CAS may be unreliable on this form." };
    }

    const gradTex = "\\left\\langle " + toTeX(fxAt.exact) + ",\\ " + toTeX(fyAt.exact) + " \\right\\rangle";
    const pointTex = "(" + toTeX(aRaw) + "," + toTeX(bRaw) + ")";

    // Symbolic magnitude ‖∇f(a,b)‖ = √(f_x(a,b)² + f_y(a,b)²), built exactly from the
    // already-evaluated partials. nerdamer reduces the radical in toString(), so ⟨2,2⟩ gives
    // "2*sqrt(2)" and ⟨16,12⟩ gives "20" — the exact closed form, not a decimal. Falls back
    // to the numeric magnitude only if the CAS declines to form the radical.
    const gradMag = tryStr(() => cas()("sqrt((" + fxAt.exact + ")^2+(" + fyAt.exact + ")^2)").toString());
    const gradMagLatex = gradMag !== null ? toTeX(gradMag) : null;

    const steps = [
      { rule: "The surface", text: "f(" + vx + "," + vy + ") = " + fStr,
        latex: "f(" + vx + "," + vy + ")=" + toTeX(fStr) },
      { rule: "∂f/∂x", text: "f_x = " + fxStr, latex: "\\frac{\\partial f}{\\partial " + vx + "}=" + toTeX(fxStr) },
      { rule: "∂f/∂y", text: "f_y = " + fyStr, latex: "\\frac{\\partial f}{\\partial " + vy + "}=" + toTeX(fyStr) },
      { rule: "Gradient", text: "∇f = ⟨f_x, f_y⟩ = ⟨" + fxStr + ", " + fyStr + "⟩",
        latex: "\\nabla f=\\left\\langle " + toTeX(fxStr) + ",\\ " + toTeX(fyStr) + " \\right\\rangle" },
      { rule: "At the point", text: "f(" + aRaw + "," + bRaw + ") = " + fAt.exact + ";  f_x=" + fxAt.exact + ", f_y=" + fyAt.exact,
        latex: "f(" + toTeX(aRaw) + "," + toTeX(bRaw) + ")=" + toTeX(fAt.exact) + "\\quad f_x=" + toTeX(fxAt.exact) + "\\quad f_y=" + toTeX(fyAt.exact) },
      { rule: "Tangent plane", text: "z = " + fAt.exact + " + " + fxAt.exact + "(" + vx + "−" + aRaw + ") + " + fyAt.exact + "(" + vy + "−" + bRaw + ")",
        latex: "z=" + toTeX(fAt.exact) + "+" + toTeX(fxAt.exact) + "(" + vx + "-" + toTeX(aRaw) + ")+" + toTeX(fyAt.exact) + "(" + vy + "-" + toTeX(bRaw) + ")" },
      { rule: "Check", text: "central-difference partials match and the plane touches the surface ✓",
        latex: "\\text{partials checked, plane touches }\\checkmark" }
    ];

    return {
      ok: true,
      technique: "partial-derivatives",
      fx: fxStr,
      fy: fyStr,
      fxLatex: toTeX(fxStr),
      fyLatex: toTeX(fyStr),
      grad: [fxStr, fyStr],
      point: [aNum, bNum],
      pointTex,
      fAtPoint: fAt.exact,
      fAtPointLatex: toTeX(fAt.exact),
      fAtPointNum,
      gradAtPoint: [fxAt.exact, fyAt.exact],
      gradAtPointLatex: gradTex,
      gradAtPointNum: [fxAt.num, fyAt.num],
      gradMag: gradMag !== null ? gradMag : String(Math.hypot(fxAt.num, fyAt.num)),
      gradMagLatex: gradMagLatex !== null ? gradMagLatex : toTeX(String(Math.hypot(fxAt.num, fyAt.num))),
      tangentPlane: planeStr,
      tangentPlaneLatex: toTeX(planeStr),
      latex: "\\nabla f" + pointTex + "=" + gradTex,
      steps,
      verified
    };
  };

  /* ================================ VOLUMES OF REVOLUTION ===========================

     volumeOfRevolution(f, variable, a, b, opts) — the solid swept out by revolving a planar
     region about an axis, with its volume computed as a definite integral exactly. Two
     standard setups, both integrating in x (no inversion needed):
       disk / washer about the x-axis : V = π ∫_a^b [f(x)² − g(x)²] dx   (g defaults to 0 → disk)
       shell about the y-axis          : V = 2π ∫_a^b x · f(x) dx
     nerdamer's `defint` is unreliable (errors on numeric bounds, returns unevaluated on trig),
     so the definite integral is built the way the rest of the file does it: `integrate()` for
     the antiderivative, evaluate at the bounds by substitution, subtract symbolically, then
     multiply by the factor — keeping π symbolic through `.sub().toString()` (never
     `.evaluate()` on a bound containing π, which numericizes it into a rational approximation).
     The whole volume expression is reduced through one final `.toString()`, which collapses
     sin(π)→0 and the arithmetic while leaving π and e alone. A numeric Simpson integration of
     the full integrand gates the result.

     opts: { method: "disk"|"washer"|"shell", inner: "g(x)" (washer only) }. Returns
       { ok, technique, method, axis, integrand, antideriv, volume, numeric, latex, steps[], verified }
     or { ok:false, reason }. */
  const VOL_SAMPLES = 40; // Simpson panels for the numeric gate

  function simpson(fn, a, b, n) {
    n = n || VOL_SAMPLES;
    if (n % 2) n++;
    const h = (b - a) / n;
    let s = 0, counted = 0;
    for (let i = 0; i <= n; i++) {
      const y = fn(a + i * h);
      if (y === null || !Number.isFinite(y)) continue; // skip outside-domain points
      const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      s += w * y; counted++;
    }
    if (counted < n / 2) return null; // too few usable points — the region is mostly undefined
    return s * h / 3;
  }

  CalculusSymbolic.volumeOfRevolution = function (f, variable, a, b, opts) {
    if (typeof f !== "string" || f.trim() === "") throw new Error("The curve f(x) must be a non-empty string.");
    const v = variable || "x";
    opts = opts || {};
    const method = opts.method || "disk";
    if (method !== "disk" && method !== "washer" && method !== "shell") {
      return { ok: false, reason: "Unknown method: " + method + " (use disk, washer, or shell)." };
    }
    cas();

    let fStr;
    try { fStr = cas()(f).toString(); }
    catch (e) { throw new Error("Couldn't parse f(x): " + f); }

    const aRaw = String(a).trim(), bRaw = String(b).trim();
    const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
      return { ok: false, reason: "The bounds a and b must be numbers (or constants like pi)." };
    }
    if (aNum >= bNum) return { ok: false, reason: "The lower bound a must be less than the upper bound b." };

    // The integrand core (without the constant factor) and the factor, per method.
    let core, factor, axis, formulaTex, gStr = "0";
    if (method === "shell") {
      core = "(" + v + ")*(" + fStr + ")";
      factor = "2*pi";
      axis = "y";
      formulaTex = "V=2\\pi\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "} " + v + "\\,f(" + v + ")\\,d" + v;
    } else {
      if (method === "washer") {
        if (typeof opts.inner !== "string" || opts.inner.trim() === "") {
          return { ok: false, reason: "The washer method needs a second curve g(x) (the inner radius)." };
        }
        try { gStr = cas()(opts.inner).toString(); }
        catch (e) { return { ok: false, reason: "Couldn't parse g(x): " + opts.inner }; }
      }
      core = "((" + fStr + ")^2-(" + gStr + ")^2)";
      factor = "pi";
      axis = "x";
      formulaTex = "V=\\pi\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}\\left[" + toTeX(fStr) + "^2" +
        (method === "washer" ? "-" + toTeX(gStr) + "^2" : "") + "\\right]\\,d" + v;
    }

    // f must be defined on the closed interval, or the integral is meaningless. Sample a few
    // points; any NaN means a singularity in the region.
    const fNumFn = numericFn(fStr, v);
    if (!fNumFn) return { ok: false, reason: "Couldn't evaluate f(x) numerically." };
    for (let i = 0; i <= 10; i++) {
      const x = aNum + (i / 10) * (bNum - aNum);
      if (fNumFn(x) === null) return { ok: false, reason: "f is not defined on the whole interval [" + aRaw + ", " + bRaw + "]." };
    }

    // Washer method: the outer radius |f| must dominate the inner radius |g| everywhere on
    // the interval, or f^2-g^2 goes negative and "volume" comes out negative/meaningless.
    if (method === "washer") {
      const gNumFn = numericFn(gStr, v);
      if (!gNumFn) return { ok: false, reason: "Couldn't evaluate g(x) numerically." };
      for (let i = 0; i <= 20; i++) {
        const x = aNum + (i / 20) * (bNum - aNum);
        const fx = fNumFn(x), gx = gNumFn(x);
        if (fx === null || gx === null) continue;
        if (Math.abs(fx) < Math.abs(gx) - 1e-9) {
          return { ok: false, reason: "The outer radius f(x) must be at least as large as the inner radius g(x) in absolute value across the whole interval — here |g| exceeds |f| near x = " + (Math.round(x * 10000) / 10000) + ". Did you mean to swap f and g?" };
        }
      }
    }

    // Antiderivative of the core (constant factor pulled out — cleaner and matches the step).
    const F = tryStr(() => cas()("integrate(" + core + "," + v + ")").toString());
    if (F === null) return { ok: false, reason: "Couldn't find an elementary antiderivative for " + core + " — try a different function." };

    // F(b) − F(a), kept symbolic through sub().toString() so π stays π.
    const Fa = tryStr(() => cas()(F).sub(v, aRaw).toString());
    const Fb = tryStr(() => cas()(F).sub(v, bRaw).toString());
    if (Fa === null || Fb === null) return { ok: false, reason: "Couldn't evaluate the antiderivative at the bounds." };

    const volExpr = "(" + factor + ")*((" + Fb + ")-(" + Fa + "))";
    const volume = tryStr(() => cas()(volExpr).toString());
    if (volume === null) return { ok: false, reason: "Couldn't assemble the volume expression." };

    const volumeNum = evalNum(volume);
    if (!Number.isFinite(volumeNum)) return { ok: false, reason: "The volume expression didn't reduce to a finite number." };

    // Verification gate: an independent Simpson integration of the full integrand
    // (factor × core) must match the symbolic volume.
    const integrandFn = numericFn("(" + factor + ")*(" + core + ")", v);
    if (!integrandFn) return { ok: false, reason: "Couldn't evaluate the integrand numerically for the check." };
    const simpVal = simpson(integrandFn, aNum, bNum, VOL_SAMPLES);
    if (simpVal === null) return { ok: false, reason: "The integrand isn't defined on enough of the interval to verify." };
    const verified = Math.abs(simpVal - volumeNum) <= 1e-3 * Math.max(1, Math.abs(volumeNum));
    if (!verified) {
      return { ok: false, reason: "The symbolic volume doesn't match the numeric integration — the CAS may be unreliable on this form." };
    }

    const integrandDisp = "(" + factor + ")*(" + core + ")";
    const steps = [
      { rule: "The curve and interval", text: "f(" + v + ") = " + fStr + ",  " + v + " ∈ [" + aRaw + ", " + bRaw + "]",
        latex: "f(" + v + ")=" + toTeX(fStr) + ",\\quad " + v + "\\in[" + toTeX(aRaw) + "," + toTeX(bRaw) + "]" },
      { rule: "Method", text: method + (method === "shell" ? " about the y-axis" : " about the x-axis"),
        latex: formulaTex },
      { rule: "Integrand", text: "∫ " + integrandDisp + " d" + v,
        latex: "\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "} " + toTeX(integrandDisp) + "\\,d" + v },
      { rule: "Antiderivative", text: "F(" + v + ") = " + F, latex: "F(" + v + ")=" + toTeX(F) },
      { rule: "Evaluate at the bounds", text: "F(" + bRaw + ") − F(" + aRaw + ") = " + Fb + " − " + Fa,
        latex: "F(" + toTeX(bRaw) + ")-F(" + toTeX(aRaw) + ")=(" + toTeX(Fb) + ")-(" + toTeX(Fa) + ")" },
      { rule: "Volume", text: "V = " + volume, latex: "V=" + toTeX(volume) },
      { rule: "Check", text: "Simpson integration of the integrand agrees ✓", latex: "\\text{numeric check}\\ \\checkmark" }
    ];

    return {
      ok: true,
      technique: "volume-of-revolution",
      method,
      axis,
      integrand: integrandDisp,
      antideriv: F,
      volume,
      numeric: volumeNum,
      latex: "V=" + toTeX(volume),
      steps,
      verified
    };
  };

  /* ================================ MULTIPLE INTEGRALS ===========================

     multipleIntegral(f, opts) — a double integral over a planar region, evaluated as an
     iterated integral exactly, in one of two coordinate systems:

       cartesian (Type I region): ∬_R f(x,y) dA = ∫_a^b ∫_{lower(x)}^{upper(x)} f(x,y) dy dx
         opts: { mode:"cartesian", a, b, lower:"g1(x)", upper:"g2(x)", vars:["x","y"] }

       polar: ∬_R f(r,θ) r dr dθ = ∫_a^b ∫_{lower(θ)}^{upper(θ)} f(r,θ)·r dr dθ
         opts: { mode:"polar", a: alpha, b: beta, lower:"r1(θ)", upper:"r2(θ)" } — f is a
         function of r and theta directly; the extra factor of r that dA carries in polar
         coordinates is appended automatically, so the caller never has to remember it.

     Same defint-avoidance discipline as Volumes of Revolution (§3's nerdamer table): every
     bound evaluation goes through integrate() → sub(bound).toString(), never defint() or
     .evaluate() on a symbol-containing bound, so π/e survive. The inner antiderivative is a
     function of the outer variable (its bounds are curves in that variable, not necessarily
     constants), so it is evaluated at the symbolic upper/lower curve first, subtracted, and
     only THEN integrated a second time in the outer variable — an honest two-antiderivative
     pipeline, not defint() called twice.

     Verified independently by a nested-Simpson numeric double integration over the same
     region (outer Simpson, and at every outer sample an inner Simpson between that sample's
     bounds) — a completely different code path, with no CAS involved, computing the same
     number. This is also what catches the case nerdamer cannot integrate elementarily
     (∫e^(y²)dy returns an erf-of-i expression per §3 — it is not null, so the antiderivative
     step alone would not refuse; feeding that expression through evalNum for the final check
     yields NaN, and the gate refuses honestly instead of showing nonsense).

     Triple integrals and cylindrical/spherical coordinates are out of scope for this entry
     point — see CALCULUS_ENGINE_PLAN.md §5. Returns
       { ok, technique, mode, outerVar, innerVar, integrand, lower, upper, a, b,
         antiderivInner, antiderivOuter, value, numeric, latex, steps[], verified }
     or { ok:false, reason }. */
  const MULTINT_OUTER_SAMPLES = 30;
  const MULTINT_INNER_SAMPLES = 30;

  // Nested Simpson: outer Simpson over [aOuter, bOuter], inner Simpson (per outer sample)
  // between lowerFn(t) and upperFn(t). No CAS involved — an independent numeric double
  // integration used purely as the verification gate.
  function doubleSimpson(f2, aOuter, bOuter, lowerFn, upperFn, nOuter, nInner) {
    nOuter = nOuter || MULTINT_OUTER_SAMPLES;
    if (nOuter % 2) nOuter++;
    const h = (bOuter - aOuter) / nOuter;
    let total = 0, counted = 0;
    for (let i = 0; i <= nOuter; i++) {
      const t = aOuter + i * h;
      const lo = lowerFn(t), hi = upperFn(t);
      if (lo === null || hi === null || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) continue;
      const inner = simpson((s) => f2(t, s), lo, hi, nInner || MULTINT_INNER_SAMPLES);
      if (inner === null) continue;
      const w = (i === 0 || i === nOuter) ? 1 : (i % 2 ? 4 : 2);
      total += w * inner;
      counted++;
    }
    if (counted < nOuter / 2) return null;
    return total * h / 3;
  }

  CalculusSymbolic.multipleIntegral = function (f, opts) {
    if (typeof f !== "string" || f.trim() === "") throw new Error("The integrand must be a non-empty string.");
    opts = opts || {};
    const mode = opts.mode || "cartesian";
    if (mode !== "cartesian" && mode !== "polar") {
      return { ok: false, reason: "Unknown mode: " + mode + " (use cartesian or polar)." };
    }
    if (typeof opts.lower !== "string" || opts.lower.trim() === "" ||
        typeof opts.upper !== "string" || opts.upper.trim() === "") {
      return { ok: false, reason: "The inner bounds (lower and upper) are required." };
    }
    cas();

    const vars = mode === "cartesian" && Array.isArray(opts.vars) && opts.vars.length === 2 ? opts.vars : null;
    const outerVar = mode === "polar" ? "theta" : (vars ? vars[0] : "x");
    const innerVar = mode === "polar" ? "r" : (vars ? vars[1] : "y");

    let fStr;
    try { fStr = cas()(f).toString(); }
    catch (e) { throw new Error("Couldn't parse the integrand: " + f); }

    const aRaw = String(opts.a).trim(), bRaw = String(opts.b).trim();
    const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
      return { ok: false, reason: "The outer bounds must be numbers (or constants like pi)." };
    }
    if (aNum >= bNum) return { ok: false, reason: "The lower outer bound must be less than the upper outer bound." };

    let lowerStr, upperStr;
    try { lowerStr = cas()(opts.lower).toString(); }
    catch (e) { return { ok: false, reason: "Couldn't parse the inner lower bound: " + opts.lower }; }
    try { upperStr = cas()(opts.upper).toString(); }
    catch (e) { return { ok: false, reason: "Couldn't parse the inner upper bound: " + opts.upper }; }

    // The region must be non-degenerate across the whole outer interval — sampled the same
    // way Volumes of Revolution samples f on [a, b].
    const lowerFn = numericFn(lowerStr, outerVar);
    const upperFn = numericFn(upperStr, outerVar);
    if (!lowerFn || !upperFn) return { ok: false, reason: "Couldn't evaluate the inner bounds numerically." };
    for (let i = 0; i <= 10; i++) {
      const t = aNum + (i / 10) * (bNum - aNum);
      const lo = lowerFn(t), hi = upperFn(t);
      if (lo === null || hi === null) return { ok: false, reason: "The inner bounds aren't defined for the whole outer interval." };
      // Strict inversion only — a region legitimately pinches to zero width at an endpoint
      // (a triangle's apex at x = a is "y from 0 to x" evaluated at x = 0).
      if (hi < lo) return { ok: false, reason: "The upper inner bound must stay above the lower inner bound across [" + aRaw + ", " + bRaw + "]." };
    }

    // Polar's area element carries an extra factor of r. Built into the integrand once, here,
    // so every later step — antiderivative, displayed steps, numeric gate — already has it
    // and none of them can forget it.
    const integrandCore = mode === "polar" ? "(" + fStr + ")*(r)" : fStr;

    const fFn2 = numericFn2(integrandCore, outerVar, innerVar);
    if (!fFn2) return { ok: false, reason: "Couldn't evaluate the integrand numerically." };
    let sampleOk = false;
    for (let i = 1; i <= 4 && !sampleOk; i++) {
      const t = aNum + (i / 5) * (bNum - aNum);
      const lo = lowerFn(t), hi = upperFn(t);
      if (fFn2(t, lo + 0.5 * (hi - lo)) !== null) sampleOk = true;
    }
    if (!sampleOk) return { ok: false, reason: "The integrand isn't defined anywhere in the region — check the bounds and the function." };

    // Inner antiderivative w.r.t. the inner variable — still a function of the outer variable.
    const innerAnti = tryStr(() => cas()("integrate(" + integrandCore + "," + innerVar + ")").toString());
    if (innerAnti === null) {
      return { ok: false, reason: "Couldn't find an elementary antiderivative in " + innerVar + " for " + integrandCore + "." };
    }

    const atUpper = tryStr(() => cas()(innerAnti).sub(innerVar, upperStr).toString());
    const atLower = tryStr(() => cas()(innerAnti).sub(innerVar, lowerStr).toString());
    if (atUpper === null || atLower === null) {
      return { ok: false, reason: "Couldn't evaluate the inner antiderivative at the inner bounds." };
    }

    const h = tryStr(() => cas()("(" + atUpper + ")-(" + atLower + ")").toString());
    if (h === null) return { ok: false, reason: "Couldn't assemble the inner-integral result." };

    const outerAnti = tryStr(() => cas()("integrate(" + h + "," + outerVar + ")").toString());
    if (outerAnti === null) {
      return { ok: false, reason: "Couldn't find an elementary antiderivative in " + outerVar + " for the inner-integral result — try different bounds." };
    }
    const atB = tryStr(() => cas()(outerAnti).sub(outerVar, bRaw).toString());
    const atA = tryStr(() => cas()(outerAnti).sub(outerVar, aRaw).toString());
    if (atB === null || atA === null) {
      return { ok: false, reason: "Couldn't evaluate the outer antiderivative at the outer bounds." };
    }

    const value = tryStr(() => cas()("(" + atB + ")-(" + atA + ")").toString());
    if (value === null) return { ok: false, reason: "Couldn't assemble the final value." };
    const valueNum = evalNum(value);
    if (!Number.isFinite(valueNum)) {
      return { ok: false, reason: "The result didn't reduce to a finite number — the CAS likely fell back to a non-elementary form (like erf) that this method refuses to trust." };
    }

    const simpVal = doubleSimpson(fFn2, aNum, bNum, lowerFn, upperFn);
    if (simpVal === null) return { ok: false, reason: "The integrand isn't defined on enough of the region to verify." };
    const verified = Math.abs(simpVal - valueNum) <= 1e-3 * Math.max(1, Math.abs(valueNum));
    if (!verified) {
      return { ok: false, reason: "The symbolic result doesn't match an independent numeric double integration — the CAS may be unreliable on this form." };
    }

    const innerVarTex = mode === "polar" ? "r" : toTeX(innerVar);
    const outerVarTex = mode === "polar" ? "\\theta" : toTeX(outerVar);
    const dA = mode === "polar" ? "r\\,dr\\,d\\theta" : "d" + innerVarTex + "\\,d" + outerVarTex;
    const formulaTex = "\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}\\int_{" + toTeX(lowerStr) + "}^{" + toTeX(upperStr) + "} " +
      toTeX(fStr) + "\\," + dA;

    const steps = [
      { rule: "The region",
        text: outerVar + " ∈ [" + aRaw + ", " + bRaw + "], " + innerVar + " ∈ [" + lowerStr + ", " + upperStr + "]",
        latex: outerVarTex + "\\in[" + toTeX(aRaw) + "," + toTeX(bRaw) + "],\\ " + innerVarTex + "\\in[" + toTeX(lowerStr) + "," + toTeX(upperStr) + "]" },
      { rule: "Set up the iterated integral",
        text: "∫∫ " + integrandCore + " d" + innerVar + " d" + outerVar,
        latex: formulaTex },
      { rule: "Inner antiderivative (" + innerVar + ")",
        text: "∫ " + integrandCore + " d" + innerVar + " = " + innerAnti,
        latex: "\\int " + toTeX(integrandCore) + "\\,d" + innerVarTex + "=" + toTeX(innerAnti) },
      { rule: "Evaluate at the inner bounds",
        text: "[" + innerAnti + "] from " + lowerStr + " to " + upperStr + " = " + h,
        latex: "\\Big[" + toTeX(innerAnti) + "\\Big]_{" + toTeX(lowerStr) + "}^{" + toTeX(upperStr) + "}=" + toTeX(h) },
      { rule: "Outer antiderivative (" + outerVar + ")",
        text: "∫ (" + h + ") d" + outerVar + " = " + outerAnti,
        latex: "\\int(" + toTeX(h) + ")\\,d" + outerVarTex + "=" + toTeX(outerAnti) },
      { rule: "Evaluate at the outer bounds",
        text: "Result = " + value,
        latex: "\\Big[" + toTeX(outerAnti) + "\\Big]_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}=" + toTeX(value) },
      { rule: "Check", text: "nested-Simpson double integration agrees ✓", latex: "\\text{numeric check}\\ \\checkmark" }
    ];

    return {
      ok: true,
      technique: "multiple-integral",
      mode,
      outerVar, innerVar,
      integrand: fStr,
      integrandWithJacobian: integrandCore,
      lower: lowerStr, upper: upperStr,
      a: aNum, b: bNum,
      antiderivInner: innerAnti,
      antiderivOuter: outerAnti,
      value,
      numeric: valueNum,
      latex: formulaTex + "=" + toTeX(value),
      steps,
      verified
    };
  };

  /* ================================ LAGRANGE MULTIPLIERS ===========================

     lagrangeMultipliers(f, g, c, vars, opts) — constrained optimization of f(x,y) subject to
     g(x,y) = c, the Calc-3 treatment: solve ∇f = λ∇g together with the constraint itself.

     nerdamer's own system solver was tried first and rejected: `solveEquations` on the
     textbook circle example (f=xy, g=x²+y²=1 → eliminated condition y²=x²) returns exactly
     ONE of the four real solutions, and as a rounded decimal rather than the exact ±1/√2 —
     both silently incomplete and silently inexact, the same "confidently wrong" failure mode
     §3 documents for `solve()` on transcendental forms. So the system here is never handed to
     nerdamer to solve.

     Instead: f_x, f_y, g_x, g_y come from nerdamer's diff() (which never hangs — confirmed
     for the limit work), but the 3-equation system in (x, y, λ) —
       f_x(x,y) − λ g_x(x,y) = 0
       f_y(x,y) − λ g_y(x,y) = 0
       g(x,y) − c = 0
     — is solved numerically: a finite-difference-Jacobian Newton's method (the same idea as
     the Numerical Engine's nonlinear-systems solver, reimplemented locally here rather than
     imported — this module stays dependency-free of algorithms.js by convention, see §4) run
     from a deterministic multi-start grid of seeds so multiple critical points (a constraint
     curve typically has several) are all found, not just whichever one a single seed reaches.

     The verification gate does NOT reuse the Newton residual (that would just confirm Newton
     did its own arithmetic correctly). Instead, at each candidate point it computes the
     directional derivative of f — evaluated directly from f itself via central differences,
     never from f_x/f_y — along the TANGENT to the constraint curve (⟂ ∇g). A genuine
     constrained critical point has zero rate of change of f along the curve it sits on; a
     spurious Newton convergence (near-singular Jacobian, a seed that wandered off) will not.
     Points that fail this check are dropped rather than shown.

     Assumes the constraint g(x,y) = c traces a bounded curve (a circle, ellipse, etc.) so the
     Extreme Value Theorem guarantees a global max and min among the critical points found —
     the standard textbook setup. Reports every verified critical point, tagged max / min by
     comparing f-values; if only one survives, it is reported untagged (max vs. min cannot be
     determined from a single point).

     Returns { ok, technique, f, g, c, grad:{fx,fy,gx,gy}, vars, points:[{x,y,lambda,value,
     label}], max, min, latex, steps[], verified } or { ok:false, reason }. */
  const LAGRANGE_TOL = 1e-3; // directional-derivative-along-the-curve tolerance

  function laSolveLinear(J, b) {
    const n = b.length;
    const M = J.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-13) throw new Error("singular");
      const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  function laJacobianFD(F, x) {
    const n = x.length;
    const hh = 1e-6;
    const f0 = F.map((fi) => fi(x));
    const J = [];
    for (let i = 0; i < n; i++) J.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const xh = x.slice(); xh[j] += hh;
      const f1 = F.map((fi) => fi(xh));
      for (let i = 0; i < n; i++) J[i][j] = (f1[i] - f0[i]) / hh;
    }
    return J;
  }

  function laNewtonSystem(F, x0, tol, maxIter) {
    let x = x0.slice();
    for (let k = 0; k < maxIter; k++) {
      const fx = F.map((fi) => fi(x));
      if (!fx.every(Number.isFinite)) return null;
      let delta;
      try { delta = laSolveLinear(laJacobianFD(F, x), fx.map((v) => -v)); }
      catch (e) { return null; }
      x = x.map((xi, i) => xi + delta[i]);
      const err = Math.max(...delta.map(Math.abs));
      if (err < tol) return x;
    }
    return null;
  }

  CalculusSymbolic.lagrangeMultipliers = function (f, g, c, vars, opts) {
    if (typeof f !== "string" || f.trim() === "") throw new Error("f(x, y) must be a non-empty string.");
    if (typeof g !== "string" || g.trim() === "") throw new Error("The constraint g(x, y) must be a non-empty string.");
    const v = Array.isArray(vars) && vars.length === 2 ? vars : ["x", "y"];
    const [vx, vy] = v;
    opts = opts || {};
    const range = Number.isFinite(opts.range) && opts.range > 0 ? opts.range : 3;
    cas();

    let fStr, gStr;
    try { fStr = cas()(f).toString(); } catch (e) { throw new Error("Couldn't parse f(" + vx + ", " + vy + "): " + f); }
    try { gStr = cas()(g).toString(); } catch (e) { throw new Error("Couldn't parse the constraint g(" + vx + ", " + vy + "): " + g); }

    const cRaw = String(c).trim();
    const cNum = evalNum(cRaw);
    if (!Number.isFinite(cNum)) return { ok: false, reason: "The constraint value c must be a number." };

    const fxStr = tryStr(() => cas()("diff(" + fStr + "," + vx + ")").toString());
    const fyStr = tryStr(() => cas()("diff(" + fStr + "," + vy + ")").toString());
    const gxStr = tryStr(() => cas()("diff(" + gStr + "," + vx + ")").toString());
    const gyStr = tryStr(() => cas()("diff(" + gStr + "," + vy + ")").toString());
    if (fxStr === null || fyStr === null || gxStr === null || gyStr === null) {
      return { ok: false, reason: "Couldn't compute the gradients of f or g symbolically." };
    }

    const fFn = numericFn2(fStr, vx, vy);
    const gFn = numericFn2(gStr, vx, vy);
    const fxFn = numericFn2(fxStr, vx, vy);
    const fyFn = numericFn2(fyStr, vx, vy);
    const gxFn = numericFn2(gxStr, vx, vy);
    const gyFn = numericFn2(gyStr, vx, vy);
    if (!fFn || !gFn || !fxFn || !fyFn || !gxFn || !gyFn) {
      return { ok: false, reason: "Couldn't evaluate f or g numerically." };
    }

    // p = [x, y, lambda]. NaN/nulls surface as non-finite so laNewtonSystem abandons the seed
    // rather than chasing a value outside f or g's domain.
    const at = (fn, p) => { const r = fn(p[0], p[1]); return r === null ? NaN : r; };
    const F = [
      (p) => at(fxFn, p) - p[2] * at(gxFn, p),
      (p) => at(fyFn, p) - p[2] * at(gyFn, p),
      (p) => at(gFn, p) - cNum
    ];

    const grid = [-range, -range / 2, 0, range / 2, range];
    const lambdaSeeds = [-2, 0, 2];
    const found = [];
    for (const x0 of grid) {
      for (const y0 of grid) {
        for (const l0 of lambdaSeeds) {
          const sol = laNewtonSystem(F, [x0, y0, l0], 1e-10, 60);
          if (!sol || !sol.every(Number.isFinite)) continue;
          // Round before formatting: toFixed on an unrounded value like -1e-11 prints "-0.0000"
          // (the sign survives even though the magnitude is noise), which would dedupe against
          // "0.0000" as two different keys. Rounding first collapses both to exact -0 / 0,
          // which toFixed renders identically.
          const key = (Math.round(sol[0] * 10000) / 10000).toFixed(4) + "," + (Math.round(sol[1] * 10000) / 10000).toFixed(4);
          if (found.some((s) => s.key === key)) continue;
          found.push({ key, x: sol[0], y: sol[1], lambda: sol[2] });
        }
      }
    }

    if (!found.length) {
      return { ok: false, reason: "Couldn't find a critical point of f on g = " + cRaw + " — try a different constraint or a wider search range." };
    }

    // Verification gate: the directional derivative of f itself (never f_x/f_y) along the
    // tangent to the constraint curve must vanish at a genuine critical point.
    const hStep = 1e-4;
    const verifiedPoints = [];
    for (const p of found) {
      const gxAt = gxFn(p.x, p.y), gyAt = gyFn(p.x, p.y);
      if (gxAt === null || gyAt === null) continue;
      const tmag = Math.hypot(gxAt, gyAt);
      if (!Number.isFinite(tmag) || tmag < 1e-9) continue; // ∇g ≈ 0: constraint qualification fails here
      const t0 = -gyAt / tmag, t1 = gxAt / tmag;
      const plus = fFn(p.x + hStep * t0, p.y + hStep * t1);
      const minus = fFn(p.x - hStep * t0, p.y - hStep * t1);
      if (plus === null || minus === null) continue;
      const dirDeriv = (plus - minus) / (2 * hStep);
      if (Math.abs(dirDeriv) > LAGRANGE_TOL) continue;
      const value = fFn(p.x, p.y);
      if (!Number.isFinite(value)) continue;
      verifiedPoints.push({ x: p.x, y: p.y, lambda: p.lambda, value });
    }

    if (!verifiedPoints.length) {
      return { ok: false, reason: "Found candidate points but none passed the constrained-critical-point check — try a different search range." };
    }

    verifiedPoints.sort((a, b) => a.value - b.value);
    const minVal = verifiedPoints[0].value;
    const maxVal = verifiedPoints[verifiedPoints.length - 1].value;
    const singleCritical = verifiedPoints.length === 1;
    const degenerate = !singleCritical && Math.abs(maxVal - minVal) < 1e-6 * Math.max(1, Math.abs(maxVal));
    const points = verifiedPoints.map((p) => {
      let label = "critical point";
      if (!singleCritical && !degenerate) {
        if (Math.abs(p.value - maxVal) < 1e-6 * Math.max(1, Math.abs(maxVal))) label = "max";
        else if (Math.abs(p.value - minVal) < 1e-6 * Math.max(1, Math.abs(minVal))) label = "min";
      }
      return { x: p.x, y: p.y, lambda: p.lambda, value: p.value, label };
    });
    const maxPoint = points.find((p) => p.label === "max") || null;
    const minPoint = points.find((p) => p.label === "min") || null;

    const fmt = (n) => (Math.round(n * 10000) / 10000).toString();
    const pointsLine = points.map((p) =>
      "(" + fmt(p.x) + ", " + fmt(p.y) + "), λ=" + fmt(p.lambda) + " → f=" + fmt(p.value) + " (" + p.label + ")"
    ).join(";  ");

    const steps = [
      { rule: "The problem", text: "maximize/minimize f(" + vx + "," + vy + ") = " + fStr + "  subject to  " + gStr + " = " + cRaw,
        latex: "f(" + vx + "," + vy + ")=" + toTeX(fStr) + "\\quad\\text{s.t.}\\quad " + toTeX(gStr) + "=" + toTeX(cRaw) },
      { rule: "Gradients", text: "∇f = ⟨" + fxStr + ", " + fyStr + "⟩,  ∇g = ⟨" + gxStr + ", " + gyStr + "⟩",
        latex: "\\nabla f=\\left\\langle " + toTeX(fxStr) + "," + toTeX(fyStr) + "\\right\\rangle,\\ \\nabla g=\\left\\langle " + toTeX(gxStr) + "," + toTeX(gyStr) + "\\right\\rangle" },
      { rule: "Lagrange condition", text: "∇f = λ∇g  ⇒  " + fxStr + " = λ(" + gxStr + "),  " + fyStr + " = λ(" + gyStr + ")",
        latex: "\\nabla f=\\lambda\\nabla g" },
      { rule: "Solve the system", text: "{ f_x=λg_x, f_y=λg_y, g=" + cRaw + " } numerically, from a multi-start search",
        latex: "\\begin{cases}f_" + vx + "=\\lambda g_" + vx + "\\\\ f_" + vy + "=\\lambda g_" + vy + "\\\\ g=" + toTeX(cRaw) + "\\end{cases}" },
      { rule: "Critical points found", text: pointsLine, latex: pointsLine.replace(/λ/g, "\\lambda") },
      { rule: singleCritical ? "Only one critical point survived" : "Compare f at every critical point",
        text: singleCritical
          ? "(" + fmt(points[0].x) + ", " + fmt(points[0].y) + ") → f = " + fmt(points[0].value)
          : "max f = " + fmt(maxVal) + ",  min f = " + fmt(minVal),
        latex: singleCritical ? "f=" + fmt(points[0].value) : "\\max f=" + fmt(maxVal) + ",\\quad \\min f=" + fmt(minVal) },
      { rule: "Check", text: "the directional derivative of f along the constraint curve is ≈ 0 at every reported point ✓",
        latex: "\\left.\\dfrac{d}{dt}f\\right|_{\\text{curve}}\\approx 0\\ \\checkmark" }
    ];

    return {
      ok: true,
      technique: "lagrange-multipliers",
      f: fStr, g: gStr, c: cNum,
      grad: { fx: fxStr, fy: fyStr, gx: gxStr, gy: gyStr },
      vars: v,
      points,
      max: maxPoint,
      min: minPoint,
      singleCritical,
      latex: "\\nabla f=\\lambda\\nabla g",
      steps,
      verified: true
    };
  };

  /* ================================ RELATED RATES ================================

     Differentiate an implicit relationship between quantities that depend on time, plug in
     the known values and rates, and solve for the unknown rate. nerdamer's diff() treats
     every symbol other than the differentiation variable as a constant — so diff(x^2, t)
     reads as 0, not 2*x*dx/dt — which means the chain rule has to be supplied by hand: the
     total derivative is Σ_v ∂f/∂v · dv/dt, summed over the time-dependent variables. A
     constant in the equation (a fixed ladder length, a fixed cone ratio) is simply left out
     of the variable list, so it contributes no dv/dt term — the derivative of a constant is
     zero, exactly as it should be.

     The differentiated equation is always LINEAR in the unknown rate, so the rate is
     recovered two independent ways: an exact solve() for the closed form and a numeric
     linear-coefficient evaluation (evaluate the substituted expression at the unknown = 0
     and at 1; the rate is -B/A). The master gate is an independent numeric total-derivative
     residual — central-difference partials of the relationship itself (never the symbolic
     ones) times the known + computed rates, which must vanish at the instant. That single
     check catches a wrong symbolic derivative, a wrong substitution, and a wrong solve all
     at once. A second gate refuses inputs whose given values don't satisfy the relationship
     in the first place (a ladder with x=3, y=5 against x^2+y^2=25 is not a valid instant). */
  CalculusSymbolic.relatedRates = function (equation, vars, values, knownRates, unknownVar) {
    if (typeof equation !== "string" || equation.trim() === "") {
      throw new Error("The relationship must be a non-empty equation string.");
    }
    cas();

    const eqParts = equation.split("=");
    if (eqParts.length !== 2 || !eqParts[0].trim() || !eqParts[1].trim()) {
      return { ok: false, reason: "Enter the relationship as a single equation with one '=' — e.g. x^2 + y^2 = 25." };
    }
    let lhs, rhs;
    try {
      lhs = pretty(eqParts[0].trim());
      rhs = pretty(eqParts[1].trim());
    } catch (e) {
      return { ok: false, reason: "Couldn't parse the relationship — check the syntax." };
    }

    const v = Array.isArray(vars) ? vars.map((x) => String(x).trim()).filter((x) => x) : [];
    if (v.length === 0) {
      return { ok: false, reason: "Name at least one quantity that depends on time (e.g. x, y)." };
    }
    if (!unknownVar || v.indexOf(String(unknownVar).trim()) === -1) {
      return { ok: false, reason: "Pick which quantity's rate to find — it must be one of the time-dependent variables you named." };
    }
    const unknown = String(unknownVar).trim();

    const valMap = {};
    if (values && typeof values === "object") for (const k in values) valMap[k] = String(values[k]);
    const rateMap = {};
    if (knownRates && typeof knownRates === "object") for (const k in knownRates) rateMap[k] = String(knownRates[k]);

    for (const name of v) {
      if (!(name in valMap)) {
        return { ok: false, reason: "Give the value of " + name + " at the instant — every time-dependent quantity needs one." };
      }
    }
    for (const name of v) {
      if (name === unknown) continue;
      if (!(name in rateMap)) {
        return { ok: false, reason: "Give the known rate d" + name + "/dt — every time-dependent quantity except the one you're solving for needs one." };
      }
    }

    const d = "\\,d";
    const rateSym = (name) => "d" + name + "dt";

    // Replaces the internal rate symbols d<v>dt with \frac{d<v>}{dt} in a TeX string, so the
    // differentiated equation reads the way a textbook writes it.
    function ratesToLatex(tex) {
      let out = tex;
      for (const name of v) {
        const frac = "\\frac{" + d + name + "}{" + d + "t}";
        out = out.split("\\mathrm{d" + name + "dt}").join(frac);
        out = out.replace(new RegExp("(?<![a-zA-Z])d" + name + "dt(?![a-zA-Z])", "g"), frac);
      }
      return out;
    }

    // Total derivative of one side: Σ_v ∂(side)/∂v · d(v)/dt. Returns the expression string
    // and a list of per-term TeX fragments (so the combined line keeps the d/dt fractions).
    function totalDeriv(side, label) {
      const terms = [];
      const termLatex = [];
      for (const name of v) {
        const pd = tryStr(() => cas()("diff(" + side + "," + name + ")"));
        if (pd === null) {
          return { ok: false, reason: "Couldn't differentiate the " + label + " with respect to " + name + "." };
        }
        const pds = pretty(pd);
        if (pds === "0" || pds === "") continue;
        terms.push("(" + pds + ")*" + rateSym(name));
        termLatex.push("\\left(" + toTeX(pds) + "\\right)\\frac{" + d + name + "}{" + d + "t}");
      }
      return { ok: true, expr: terms.length ? terms.join("+") : "0", termLatex };
    }

    const dLhs = totalDeriv(lhs, "left-hand side");
    if (!dLhs.ok) return { ok: false, reason: dLhs.reason };
    const dRhs = totalDeriv(rhs, "right-hand side");
    if (!dRhs.ok) return { ok: false, reason: dRhs.reason };

    const sideLatex = (terms) => (terms.length ? terms.join(" + ") : "0");
    const diffEqLatex = sideLatex(dLhs.termLatex) + " = " + sideLatex(dRhs.termLatex);

    // d/dt[lhs] - d/dt[rhs] = 0 — the expression we substitute into and solve.
    const diffExpr = "((" + dLhs.expr + ")-(" + dRhs.expr + "))";

    // Substitute every given value (variables AND constants), then every known rate.
    let withValues = diffExpr;
    for (const name in valMap) {
      const next = tryStr(() => cas()(withValues).sub(name, valMap[name]).toString());
      if (next === null) return { ok: false, reason: "Couldn't substitute the value of " + name + "." };
      withValues = next;
    }
    let withRates = withValues;
    for (const name in rateMap) {
      const next = tryStr(() => cas()(withRates).sub(rateSym(name), rateMap[name]).toString());
      if (next === null) return { ok: false, reason: "Couldn't substitute the known rate d" + name + "/dt." };
      withRates = next;
    }
    const sym = rateSym(unknown);

    // The unknown rate, recovered two independent ways. The differentiated relationship is
    // always LINEAR in the rates, so the root is -B/A where B = expr|_{sym=0} and
    // A+B = expr|_{sym=1}. nerdamer's solve() is NOT used here: it numericizes π
    // (solve(-3*dhdt*pi+2, dhdt) returns the rational 35396335/166801299 instead of
    // 2/(3*pi)) and even manufactures spurious extra roots (solve(-400*drdt*pi+100, drdt)
    // returns two). Building -B/A from .sub().toString() keeps π symbolic — the same path
    // the volumes engine uses to keep π out of the numericizer.
    const at0 = tryStr(() => cas()(withRates).sub(sym, "0").toString());
    const at1 = tryStr(() => cas()(withRates).sub(sym, "1").toString());
    if (at0 === null || at1 === null) {
      return { ok: false, reason: "Couldn't isolate d" + unknown + "/dt after substitution — re-check the givens." };
    }
    const B = evalNum(at0);
    const AplusB = evalNum(at1);
    const A = AplusB - B;
    if (!Number.isFinite(B) || !Number.isFinite(A) || Math.abs(A) <= 1e-12) {
      return { ok: false, reason: "The differentiated equation doesn't involve d" + unknown + "/dt, so its rate can't be determined from this relationship." };
    }
    const numVal = -B / A;

    // Exact closed form, π kept symbolic: -B / ((A+B) - B). Cross-checked against the
    // independent numeric value; if they disagree for any reason, the numeric form stands.
    let resultStr = tryStr(() => cas()("-((" + at0 + "))/((" + at1 + ")-(" + at0 + "))").toString());
    const exactNum = resultStr === null ? NaN : evalNum(resultStr);
    if (resultStr === null || !Number.isFinite(exactNum) || Math.abs(exactNum - numVal) > 1e-6 * Math.max(1, Math.abs(numVal))) {
      resultStr = formatApprox(numVal);
    }

    // ---- Verification gates ----
    // (1) Well-posedness: the given values must actually satisfy the relationship.
    const scope = {};
    for (const name in valMap) scope[name] = evalNum(valMap[name]);
    const lhsC = mathjs.parse(lhs).compile();
    const rhsC = mathjs.parse(rhs).compile();
    function evN(C) {
      try { const r = C.evaluate(scope); return (typeof r === "number" && Number.isFinite(r)) ? r : null; } catch (e) { return null; }
    }
    const lhsVal = evN(lhsC), rhsVal = evN(rhsC);
    if (lhsVal === null || rhsVal === null) {
      return { ok: false, reason: "A symbol in the relationship has no value — give a value for every letter that appears (variables and constants alike)." };
    }
    const scale = Math.max(1, Math.abs(lhsVal), Math.abs(rhsVal));
    if (Math.abs(lhsVal - rhsVal) > 1e-6 * scale) {
      return { ok: false, reason: "The given values don't satisfy the relationship at this instant — re-check the numbers you entered." };
    }

    // (2) Master gate: an independent numeric total-derivative residual. Central-difference
    // partials of (lhs - rhs) itself, times the known + computed rates, must sum to ≈0.
    const eqC = mathjs.parse("((" + lhs + ")-(" + rhs + "))").compile();
    function evalEq(s) {
      try { const r = eqC.evaluate(s); return (typeof r === "number" && Number.isFinite(r)) ? r : null; } catch (e) { return null; }
    }
    const h = 1e-5; // central-difference step (same size as calc-core's FD verification)
    const rateValues = {};
    for (const name of v) rateValues[name] = (name === unknown) ? numVal : evalNum(rateMap[name]);
    let residual = 0;
    for (const name of v) {
      const sp = Object.assign({}, scope); sp[name] = scope[name] + h;
      const sm = Object.assign({}, scope); sm[name] = scope[name] - h;
      const fp = evalEq(sp), fm = evalEq(sm);
      if (fp === null || fm === null) {
        return { ok: false, reason: "The relationship isn't defined near the given values of " + name + " — check the domain." };
      }
      residual += ((fp - fm) / (2 * h)) * rateValues[name];
    }
    const verified = Number.isFinite(residual) && Math.abs(residual) <= 1e-4 * scale;
    if (!verified) {
      return { ok: false, reason: "The computed rate didn't pass the independent total-derivative check — re-check the relationship and the givens." };
    }

    const rateLatex = "\\frac{" + d + unknown + "}{" + d + "t}";
    const subValuesLatex = ratesToLatex(toTeX(withValues));
    const subRatesLatex = ratesToLatex(toTeX(withRates));

    const steps = [
      { rule: "The relationship", text: lhs + " = " + rhs, latex: toTeX(lhs) + " = " + toTeX(rhs) },
      { rule: "Differentiate both sides with respect to t (chain rule)", text: "", latex: diffEqLatex },
      { rule: "Substitute the given values", text: withValues, latex: subValuesLatex + " = 0" },
      { rule: "Substitute the known rates", text: withRates, latex: subRatesLatex + " = 0" },
      { rule: "Solve for d" + unknown + "/dt", text: resultStr, latex: rateLatex + " = " + toTeX(resultStr) },
      { rule: "Check: the total derivative of the relationship is ≈0 at this instant", text: "residual ≈ 0", latex: "0 \\;\\checkmark" }
    ];

    return {
      ok: true,
      technique: "related-rates",
      equation: lhs + " = " + rhs,
      unknown,
      rateLabel: "d" + unknown + "/dt",
      differentiatedLatex: diffEqLatex,
      substitutedLatex: subRatesLatex,
      result: resultStr,
      numeric: numVal,
      latex: rateLatex + " = " + toTeX(resultStr),
      steps,
      verified: true
    };
  };

  /* ================================ ARC LENGTH & SURFACE AREA ========================

     arcLengthSurfaceArea(f, variable, a, b, opts) — two geometric integrals over a planar
     curve y = f(x) on [a, b], both built on the same root √(1 + (f')²):
       arc length                L = ∫_a^b √(1 + (f')²) dx
       surface area of revolution S = 2π ∫_a^b f(x) · √(1 + (f')²) dx   (about the x-axis)
     The integrand is assembled from nerdamer's diff(); the definite integral goes through the
     same integrate() → sub(bound).toString() → subtract pipeline as Volumes of Revolution, so
     π stays symbolic in the surface-area form. An independent Simpson integration of the full
     integrand gates every result — the same honest refusal when nerdamer finds no elementary
     antiderivative (∫√(1+cos²x) dx is elliptic, so the arc length of one arch of sin x is
     refused rather than approximated). Surface area needs f ≥ 0 on the interval (the radius is
     a distance); a sign change is refused with a reason.

     opts: { mode: "arc-length" | "surface-area" }. Returns
       { ok, technique, mode, axis?, df, integrand, antideriv, value, numeric, latex, steps[], verified }
     or { ok:false, reason }. */
  CalculusSymbolic.arcLengthSurfaceArea = function (f, variable, a, b, opts) {
    if (typeof f !== "string" || f.trim() === "") throw new Error("The curve f(x) must be a non-empty string.");
    const v = variable || "x";
    opts = opts || {};
    const mode = opts.mode || "arc-length";
    if (mode !== "arc-length" && mode !== "surface-area") {
      return { ok: false, reason: "Unknown mode: " + mode + " (use arc-length or surface-area)." };
    }
    cas();

    let fStr;
    try { fStr = cas()(f).toString(); }
    catch (e) { throw new Error("Couldn't parse f(x): " + f); }

    const aRaw = String(a).trim(), bRaw = String(b).trim();
    const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
      return { ok: false, reason: "The bounds a and b must be numbers (or constants like pi)." };
    }
    if (aNum >= bNum) return { ok: false, reason: "The lower bound a must be less than the upper bound b." };

    const dfStr = tryStr(() => cas()("diff(" + fStr + "," + v + ")").toString());
    if (dfStr === null) return { ok: false, reason: "Couldn't differentiate f(x) — the CAS may be unreliable on this form." };

    const fNumFn = numericFn(fStr, v);
    if (!fNumFn) return { ok: false, reason: "Couldn't evaluate f(x) numerically." };
    for (let i = 0; i <= 12; i++) {
      const x = aNum + (i / 12) * (bNum - aNum);
      const y = fNumFn(x);
      if (y === null) return { ok: false, reason: "f is not defined on the whole interval [" + aRaw + ", " + bRaw + "]." };
      if (mode === "surface-area" && y < -1e-9) {
        return { ok: false, reason: "Surface area of revolution needs f(x) ≥ 0 on the interval — f dips below the axis here. Reflect the curve or restrict the bounds." };
      }
    }

    const root = "sqrt(1+(" + dfStr + ")^2)";
    const core = mode === "surface-area" ? "(" + fStr + ")*" + root : root;
    const integrandExpr = mode === "surface-area" ? "(2*pi)*(" + core + ")" : core;

    const g = gatedIntegral(integrandExpr, v, aRaw, bRaw, aNum, bNum, 60);
    if (!g.ok) {
      const reason = g.reason === "no elementary antiderivative"
        ? (mode === "arc-length"
            ? "This arc length has no elementary closed form the CAS can find (e.g. an elliptic integral)."
            : "This surface area has no elementary closed form the CAS can find.")
        : g.reason === "symbolic result doesn't match the numeric integration"
            ? "The symbolic result doesn't match the numeric integration — the CAS may be unreliable on this form."
            : "The integrand isn't defined on enough of the interval to verify.";
      return { ok: false, reason };
    }

    const rootTex = "\\sqrt{1+\\left(" + toTeX(dfStr) + "\\right)^2}";
    const sym = mode === "surface-area" ? "S" : "L";
    const formulaTex = mode === "surface-area"
      ? "S=2\\pi\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "} " + toTeX(fStr) + "\\," + rootTex + "\\,d" + v
      : "L=\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "} " + rootTex + "\\,d" + v;

    const steps = [
      { rule: "The curve and interval", text: "f(" + v + ") = " + fStr + ",  " + v + " ∈ [" + aRaw + ", " + bRaw + "]",
        latex: "f(" + v + ")=" + toTeX(fStr) + ",\\quad " + v + "\\in[" + toTeX(aRaw) + "," + toTeX(bRaw) + "]" },
      { rule: "Derivative", text: "f'(" + v + ") = " + dfStr, latex: "f'(" + v + ")=" + toTeX(dfStr) },
      { rule: "The arc-length element", text: "ds = √(1 + (f')²) d" + v, latex: "ds=\\sqrt{1+(f'(" + v + "))^2}\\,d" + v },
      { rule: "Integrand", text: "∫ " + integrandExpr + " d" + v, latex: formulaTex },
      { rule: "Antiderivative", text: "F(" + v + ") = " + g.F, latex: "F(" + v + ")=" + toTeX(g.F) },
      { rule: "Evaluate at the bounds", text: "F(" + bRaw + ") − F(" + aRaw + ") = " + g.Fb + " − " + g.Fa,
        latex: "F(" + toTeX(bRaw) + ")-F(" + toTeX(aRaw) + ")=(" + toTeX(g.Fb) + ")-(" + toTeX(g.Fa) + ")" },
      { rule: sym, text: sym + " = " + g.value, latex: sym + "=" + toTeX(g.value) },
      { rule: "Check", text: "Simpson integration of the integrand agrees ✓", latex: "\\text{numeric check}\\ \\checkmark" }
    ];

    return {
      ok: true,
      technique: "arc-length-surface-area",
      mode,
      axis: mode === "surface-area" ? "x" : null,
      df: dfStr,
      integrand: integrandExpr,
      antideriv: g.F,
      value: g.value,
      numeric: g.valueNum,
      latex: sym + "=" + toTeX(g.value),
      steps,
      verified: g.verified
    };
  };

  /* ---------------- shared integral helpers ----------------
     A gated definite integral: integrate() for the antiderivative, sub().toString() at the
     bounds (so π/e survive), subtract, and verify against an independent Simpson integration.
     Returns { ok, F, Fa, Fb, value, valueNum, verified } or { ok:false, reason }. Refused
     honestly when no elementary antiderivative exists or the gate disagrees. */
  function gatedIntegral(integrandExpr, v, aRaw, bRaw, aNum, bNum, panels) {
    const integrandFn = numericFn(integrandExpr, v);
    if (!integrandFn) return { ok: false, reason: "couldn't evaluate the integrand numerically" };
    const simpVal = simpson(integrandFn, aNum, bNum, panels || 60);
    if (simpVal === null) return { ok: false, reason: "integrand undefined on too much of the interval" };

    // Substitute a bound into an antiderivative by TEXT, then re-parse — NOT nerdamer's
    // .sub(). When the antiderivative forces numeric evaluation of the bound (cos(t)→cos(2*pi),
    // say), .sub() evaluates 2*pi into a rational and, worse, caches that so every later sub in
    // the process numericizes too. A textual substitute-then-parse lets nerdamer simplify
    // cos(2*pi)→1 and sin(2*pi)→0 symbolically and keep π alive. Word boundaries so a "t" bound
    // variable doesn't touch "sqrt" or "theta", and the bound (a constant) never contains the
    // variable, so a single replace pass can't re-substitute inserted text.
    const boundRe = new RegExp("\\b" + v + "\\b", "g");
    function atBound(F, raw) { return tryStr(() => cas()(F.replace(boundRe, "(" + raw + ")")).toString()); }

    // Build Fa/Fb/value from a candidate antiderivative F, and gate it against Simpson.
    function attempt(F) {
      const Fa = atBound(F, aRaw);
      const Fb = atBound(F, bRaw);
      if (Fa === null || Fb === null) return null;
      const value = tryStr(() => cas()("((" + Fb + ")-(" + Fa + "))").toString());
      if (value === null) return null;
      const valueNum = evalNum(value);
      if (!Number.isFinite(valueNum)) return null;
      if (Math.abs(simpVal - valueNum) > 1e-3 * Math.max(1, Math.abs(valueNum))) return null;
      return { F, Fa, Fb, value, valueNum, verified: true };
    }

    // Primary path: simplify the integrand, then ask nerdamer for an antiderivative. nerdamer
    // returns the UNEVALUATED "integrate(...)" string (not null) when it can't find one, so we
    // detect that explicitly rather than feed garbage downstream.
    const simpInt = tryStr(() => cas()(integrandExpr).simplify().toString()) || integrandExpr;
    const Fraw = tryStr(() => cas()("integrate(" + simpInt + "," + v + ")").toString());
    if (Fraw !== null && !/^\s*integrate\s*\(/.test(Fraw)) {
      const r = attempt(Fraw);
      if (r) return { ok: true, F: r.F, Fa: r.Fa, Fb: r.Fb, value: r.value, valueNum: r.valueNum, verified: true };
    }

    // Fallback for a constant integrand. nerdamer can't always see that sin²+cos² collapses to
    // 1, so it returns a WRONG antiderivative for things like ∫√(cos²+sin²) dθ — the gate
    // catches it above and we land here. A constant c integrates to c·(b−a); we detect constancy
    // by sampling, then make it exact by simplifying the integrand at a bound (which nerdamer
    // CAN do) and building F = c·v so the display reads like a normal integration.
    const finite = [];
    for (let i = 0; i <= 8; i++) {
      const y = integrandFn(aNum + (i / 8) * (bNum - aNum));
      if (Number.isFinite(y)) finite.push(y);
    }
    if (finite.length >= 5) {
      const mn = Math.min.apply(null, finite), mx = Math.max.apply(null, finite);
      if (mx - mn <= 1e-9 * Math.max(1, Math.abs(mn), Math.abs(mx))) {
        let cStr = tryStr(() => cas()(simpInt.replace(boundRe, "(" + aRaw + ")")).simplify().toString());
        if (cStr === null) cStr = tryStr(() => cas()(simpInt.replace(boundRe, "(" + bRaw + ")")).simplify().toString());
        if (cStr !== null) {
          const Fc = tryStr(() => cas()("((" + cStr + ")*" + v + ")").toString());
          if (Fc !== null) {
            const r = attempt(Fc);
            if (r) return { ok: true, F: r.F, Fa: r.Fa, Fb: r.Fb, value: r.value, valueNum: r.valueNum, verified: true };
          }
        }
      }
    }

    if (Fraw === null || /^\s*integrate\s*\(/.test(Fraw)) return { ok: false, reason: "no elementary antiderivative" };
    return { ok: false, reason: "symbolic result doesn't match the numeric integration" };
  }

  // Wraps gatedIntegral into a named quantity with its own derivation — the building block for
  // the parametric/polar/line-integral bundles, where several integrals are reported together.
  function qIntegral(name, symbol, integrandExpr, v, aRaw, bRaw, aNum, bNum, formulaLatex, panels) {
    const g = gatedIntegral(integrandExpr, v, aRaw, bRaw, aNum, bNum, panels);
    if (!g.ok) {
      return { ok: false, name, symbol, reason: g.reason, latex: formulaLatex,
        steps: [
          { rule: "Integrand", text: "∫ " + integrandExpr + " d" + v, latex: formulaLatex },
          { rule: "Result", text: name + " — no elementary closed form", latex: "\\text{" + name + ": no elementary closed form}" }
        ] };
    }
    return {
      ok: true, name, symbol, verified: g.verified,
      integrand: integrandExpr, antideriv: g.F, value: g.value, numeric: g.valueNum,
      latex: symbol + "=" + toTeX(g.value),
      steps: [
        { rule: "Integrand", text: "∫ " + integrandExpr + " d" + v, latex: formulaLatex },
        { rule: "Antiderivative", text: "F(" + v + ") = " + g.F, latex: "F(" + v + ")=" + toTeX(g.F) },
        { rule: "Evaluate at the bounds", text: "F(" + bRaw + ") − F(" + aRaw + ") = " + g.Fb + " − " + g.Fa,
          latex: "F(" + toTeX(bRaw) + ")-F(" + toTeX(aRaw) + ")=(" + toTeX(g.Fb) + ")-(" + toTeX(g.Fa) + ")" },
        { rule: "Result", text: symbol + " = " + g.value, latex: symbol + "=" + toTeX(g.value) },
        { rule: "Check", text: "Simpson integration agrees ✓", latex: "\\text{numeric check}\\ \\checkmark" }
      ]
    };
  }

  // Used by the vector calculus numeric gates, which check a symbolic div/curl/potential
  // against central differences of the field itself. Compiles each side once via numericFn2
  // (the same two-variable evaluator used elsewhere) rather than re-parsing per sample point.
  function twoVarEq(aStr, bStr) {
    const fnA = numericFn2(aStr, "x", "y");
    const fnB = numericFn2(bStr, "x", "y");
    if (!fnA || !fnB) return false;
    let hits = 0;
    for (const xy of [[1.3, 0.7], [0.4, 1.1], [2.0, 0.5], [0.8, 1.7]]) {
      const a = fnA(xy[0], xy[1]);
      const b = fnB(xy[0], xy[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      hits++;
      if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
    }
    return hits >= 2;
  }

  /* ================================ PARAMETRIC & POLAR ===============================

     parametricAndPolar(mode, spec, opts) — the calculus of curves that are not the graph of a
     single function y = f(x): parametric curves (x(t), y(t)) and polar curves r(θ). Each mode
     reports the quantities a course asks of it, every integral gated by qIntegral:

       parametric: dy/dx = y'(t)/x'(t) (at the midpoint, checked vs a central difference),
                   arc length  L = ∫√(x'² + y'²) dt,
                   signed area A = ∫ y(t)·x'(t) dt   (the area swept as t runs a→b; CCW is +)
       polar:      dy/dx = (r' sinθ + r cosθ)/(r' cosθ − r sinθ) (at the midpoint),
                   area       A = ½ ∫ r(θ)² dθ,
                   arc length L = ∫√(r² + r'²) dθ

     A curve with a vertical tangent at the midpoint (the unit circle at θ = π) has an undefined
     dy/dx there — that is reported as a refused slope quantity, not a wrong number. A
     non-elementary arc length (one arch of sin(t); a cardioid) is refused per-quantity while the
     area still resolves. Returns
       { ok, technique, mode, quantities:{slope,arcLength,area}, qOrder, latex, steps:[], verified }
     with each quantity carrying its own {ok, value, numeric, latex, steps, verified, reason?}.
     Top-level ok:false is for input errors only; a refused quantity is an ok:true bundle. */
  CalculusSymbolic.parametricAndPolar = function (mode, spec, opts) {
    spec = spec || {};
    if (mode !== "parametric" && mode !== "polar") {
      return { ok: false, reason: "Unknown mode: " + mode + " (use parametric or polar)." };
    }
    cas();

    function bundle(mode, qOrder, quantities, extra) {
      const anyOk = qOrder.some((k) => quantities[k].ok);
      const verified = anyOk && qOrder.every((k) => !quantities[k].ok || quantities[k].verified === true);
      const summary = qOrder.filter((k) => quantities[k].ok).map((k) => quantities[k].latex).join("\\quad ");
      return Object.assign({
        ok: true, technique: "parametric-polar", mode, quantities: quantities, qOrder: qOrder,
        latex: summary, steps: [], verified: verified
      }, extra || {});
    }

    if (mode === "parametric") {
      if (typeof spec.x !== "string" || !spec.x.trim() || typeof spec.y !== "string" || !spec.y.trim()) {
        return { ok: false, reason: "Parametric mode needs x(t) and y(t)." };
      }
      const t = "t";
      let xStr, yStr;
      try { xStr = cas()(spec.x).toString(); yStr = cas()(spec.y).toString(); }
      catch (e) { return { ok: false, reason: "Couldn't parse x(t) or y(t)." }; }
      const aRaw = String(spec.a).trim(), bRaw = String(spec.b).trim();
      const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
      if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return { ok: false, reason: "The bounds a and b must be numbers (or constants like pi)." };
      if (aNum >= bNum) return { ok: false, reason: "The lower bound a must be less than the upper bound b." };

      const dxStr = tryStr(() => cas()("diff(" + xStr + "," + t + ")").toString());
      const dyStr = tryStr(() => cas()("diff(" + yStr + "," + t + ")").toString());
      if (dxStr === null || dyStr === null) return { ok: false, reason: "Couldn't differentiate x(t) or y(t)." };

      const slopeSym = tryStr(() => cas()("((" + dyStr + ")/(" + dxStr + "))").toString());
      const tMidNum = (aNum + bNum) / 2;
      // Symbolic midpoint for clean labels (pi/2, not a 16-digit rational approximating it).
      const tMidSym = tryStr(() => cas()("((" + aRaw + "+(" + bRaw + "))/2)").toString()) || String(tMidNum);
      const xFn = numericFn(xStr, t), yFn = numericFn(yStr, t);
      const slopeFn = slopeSym ? numericFn(slopeSym, t) : null;   // mathjs, NOT nerdamer.evaluate()
      const h = 1e-5;
      let slopeNumeric = null, slopeNum = NaN, slopeVerified = false, slopeOk = slopeSym !== null;
      if (xFn && yFn) {
        const dxN = (xFn(tMidNum + h) - xFn(tMidNum - h)) / (2 * h);
        const dyN = (yFn(tMidNum + h) - yFn(tMidNum - h)) / (2 * h);
        if (Math.abs(dxN) > 1e-6) {
          slopeNumeric = dyN / dxN;
          if (slopeFn) { const sv = slopeFn(tMidNum); slopeNum = Number.isFinite(sv) ? sv : NaN; }
          slopeVerified = Number.isFinite(slopeNum) && Math.abs(slopeNumeric - slopeNum) <= 1e-3 * Math.max(1, Math.abs(slopeNum));
        } else { slopeOk = false; }
      }
      const slope = slopeOk ? {
        ok: true, name: "Slope", symbol: "dy/dx", verified: slopeVerified, value: slopeSym, numeric: slopeNum,
        latex: "\\left.\\frac{dy}{dx}\\right|_{t=" + toTeX(tMidSym) + "}=\\frac{" + toTeX(dyStr) + "}{" + toTeX(dxStr) + "}",
        steps: [
          { rule: "Slope of a parametric curve", text: "dy/dx = y'(t) / x'(t)", latex: "\\frac{dy}{dx}=\\frac{y'(t)}{x'(t)}=\\frac{" + toTeX(dyStr) + "}{" + toTeX(dxStr) + "}" },
          { rule: "At the midpoint t = " + tMidSym, text: "dy/dx = " + slopeSym + " ≈ " + (Number.isFinite(slopeNum) ? slopeNum : "?"),
            latex: "\\left.\\frac{dy}{dx}\\right|_{t=" + toTeX(tMidSym) + "}\\approx " + (Number.isFinite(slopeNum) ? toTeX(String(slopeNum)) : "?") },
          { rule: "Check", text: slopeVerified ? "matches the central-difference slope ✓" : "numeric slope check skipped", latex: slopeVerified ? "\\checkmark" : "" }
        ]
      } : { ok: false, name: "Slope", symbol: "dy/dx", reason: "dy/dx is undefined at the midpoint — x'(t) = 0 (a vertical tangent or cusp).", latex: "\\frac{dy}{dx}\\ \\text{undefined}", steps: [] };

      const arcLength = qIntegral("Arc length", "L", "sqrt((" + dxStr + ")^2+(" + dyStr + ")^2)", t, aRaw, bRaw, aNum, bNum,
        "L=\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}\\sqrt{x'(t)^2+y'(t)^2}\\,dt", 80);
      const area = qIntegral("Area", "A", "(" + yStr + ")*(" + dxStr + ")", t, aRaw, bRaw, aNum, bNum,
        "A=\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "} y(t)\\,x'(t)\\,dt", 80);

      return bundle("parametric", ["slope", "arcLength", "area"], { slope: slope, arcLength: arcLength, area: area }, { x: xStr, y: yStr });
    }

    // polar
    if (typeof spec.r !== "string" || !spec.r.trim()) return { ok: false, reason: "Polar mode needs r(θ)." };
    const th = "theta";
    let rStr;
    try { rStr = cas()(spec.r).toString(); }
    catch (e) { return { ok: false, reason: "Couldn't parse r(θ)." }; }
    const aRaw = String(spec.a).trim(), bRaw = String(spec.b).trim();
    const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return { ok: false, reason: "The bounds a and b must be numbers (or constants like pi)." };
    if (aNum >= bNum) return { ok: false, reason: "The lower bound a must be less than the upper bound b." };

    const drStr = tryStr(() => cas()("diff(" + rStr + "," + th + ")").toString());
    if (drStr === null) return { ok: false, reason: "Couldn't differentiate r(θ)." };

    const slopeExpr = "((" + drStr + ")*sin(" + th + ")+(" + rStr + ")*cos(" + th + "))/((" + drStr + ")*cos(" + th + ")-(" + rStr + ")*sin(" + th + "))";
    const slopeSym = tryStr(() => cas()(slopeExpr).toString());
    const thMidNum = (aNum + bNum) / 2;
    const thMidSym = tryStr(() => cas()("((" + aRaw + "+(" + bRaw + "))/2)").toString()) || String(thMidNum);
    const rFn = numericFn(rStr, th);
    const slopeFn = slopeSym ? numericFn(slopeSym, th) : null;   // mathjs, NOT nerdamer.evaluate()
    const xPolar = (u) => { const r = rFn(u); return Number.isFinite(r) ? r * Math.cos(u) : null; };
    const yPolar = (u) => { const r = rFn(u); return Number.isFinite(r) ? r * Math.sin(u) : null; };
    const hp = 1e-5;
    let slopeNum = NaN, slopeVerified = false, slopeOk = slopeSym !== null;
    const dxN = (xPolar(thMidNum + hp) - xPolar(thMidNum - hp)) / (2 * hp);
    const dyN = (yPolar(thMidNum + hp) - yPolar(thMidNum - hp)) / (2 * hp);
    if (Math.abs(dxN) > 1e-6) {
      if (slopeFn) { const sv = slopeFn(thMidNum); slopeNum = Number.isFinite(sv) ? sv : NaN; }
      slopeVerified = Number.isFinite(slopeNum) && Math.abs(dyN / dxN - slopeNum) <= 1e-3 * Math.max(1, Math.abs(slopeNum));
    } else { slopeOk = false; }
    const slope = slopeOk ? {
      ok: true, name: "Slope", symbol: "dy/dx", verified: slopeVerified, value: slopeSym, numeric: slopeNum,
      latex: "\\left.\\frac{dy}{dx}\\right|_{\\theta=" + toTeX(thMidSym) + "}",
      steps: [
        { rule: "Slope in polar", text: "dy/dx = (r' sinθ + r cosθ)/(r' cosθ − r sinθ)",
          latex: "\\frac{dy}{dx}=\\frac{r'\\sin\\theta+r\\cos\\theta}{r'\\cos\\theta-r\\sin\\theta}" },
        { rule: "At θ = " + thMidSym, text: "dy/dx ≈ " + (Number.isFinite(slopeNum) ? slopeNum : "?"),
          latex: "\\left.\\frac{dy}{dx}\\right|_{\\theta=" + toTeX(thMidSym) + "}\\approx " + (Number.isFinite(slopeNum) ? toTeX(String(slopeNum)) : "?") },
        { rule: "Check", text: slopeVerified ? "matches the central-difference slope ✓" : "numeric slope check skipped", latex: slopeVerified ? "\\checkmark" : "" }
      ]
    } : { ok: false, name: "Slope", symbol: "dy/dx", reason: "dy/dx is undefined at the midpoint (a vertical tangent).", latex: "\\frac{dy}{dx}\\ \\text{undefined}", steps: [] };

    const area = qIntegral("Area", "A", "(1/2)*(" + rStr + ")^2", th, aRaw, bRaw, aNum, bNum,
      "A=\\frac12\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "} r(\\theta)^2\\,d\\theta", 80);
    const arcLength = qIntegral("Arc length", "L", "sqrt((" + rStr + ")^2+(" + drStr + ")^2)", th, aRaw, bRaw, aNum, bNum,
      "L=\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}\\sqrt{r(\\theta)^2+r'(\\theta)^2}\\,d\\theta", 80);

    return bundle("polar", ["slope", "arcLength", "area"], { slope: slope, arcLength: arcLength, area: area }, { r: rStr });
  };

  /* ================================ VECTOR CALCULUS ===============================

     vectorCalculus(operation, spec, opts) — the differential and integral calculus of a 2D
     vector field F = ⟨P(x,y), Q(x,y)⟩, the heart of a Calc-3 vector-calculus unit. Three
     operations, each with its own exact computation and numeric gate:

       divergence-curl: ∇·F = P_x + Q_y, the 2D scalar curl ∇×F = Q_x − P_y, a conservative
         test (curl = 0 ⇒ conservative on a simply-connected domain), and — when conservative —
         a potential φ with φ_x = P, φ_y = Q, recovered by integrating P in x and matching Q in
         y. div, curl and φ are each checked against central differences of the field itself.

       line-integral: along a parametric curve (x(t), y(t)), the work ∫ F·dr = ∫(P x' + Q y') dt
         and the flux ∫ F·n ds = ∫(P y' − Q x') dt, each gated by Simpson.

       greens: ∮_C P dx + Q dy around a rectangle, computed two independent ways — the line
         integral summed over the four CCW edges, and the double integral ∬_R (Q_x − P_y) dA —
         and the theorem is confirmed by their agreement (the gate), not by trusting either side.

     Returns the operation-specific shape, each with {ok, ..., latex, steps[], verified} or
     {ok:false, reason}. Per-quantity refusals (a non-elementary line integral) stay ok:true at
     the top with that quantity ok:false. */
  CalculusSymbolic.vectorCalculus = function (operation, spec, opts) {
    spec = spec || {};
    cas();

    if (operation === "divergence-curl") {
      if (typeof spec.P !== "string" || !spec.P.trim() || typeof spec.Q !== "string" || !spec.Q.trim())
        return { ok: false, reason: "Need a vector field F = ⟨P(x,y), Q(x,y)⟩." };
      let P, Q;
      try { P = cas()(spec.P).toString(); Q = cas()(spec.Q).toString(); }
      catch (e) { return { ok: false, reason: "Couldn't parse P or Q." }; }
      const dpx = tryStr(() => cas()("diff(" + P + ",x)").toString());
      const dqy = tryStr(() => cas()("diff(" + Q + ",y)").toString());
      const dqx = tryStr(() => cas()("diff(" + Q + ",x)").toString());
      const dpy = tryStr(() => cas()("diff(" + P + ",y)").toString());
      if (!dpx || !dqy || !dqx || !dpy) return { ok: false, reason: "Couldn't differentiate the field components." };

      const divStr = tryStr(() => cas()("((" + dpx + ")+(" + dqy + "))").toString()) || ("(" + dpx + ")+(" + dqy + ")");
      const curlStr = tryStr(() => cas()("((" + dqx + ")-(" + dpy + "))").toString()) || ("(" + dqx + ")-(" + dpy + ")");

      const sx = 1.3, sy = 0.7, h = 1e-5;
      const Pf = numericFn2(P, "x", "y"), Qf = numericFn2(Q, "x", "y");
      if (!Pf || !Qf) return { ok: false, reason: "Couldn't evaluate the field numerically." };
      const divFn = numericFn2(divStr, "x", "y"), curlFn = numericFn2(curlStr, "x", "y");
      const divNum = divFn ? divFn(sx, sy) : null;
      const curlNum = curlFn ? curlFn(sx, sy) : null;
      const divCD = (Pf(sx + h, sy) - Pf(sx - h, sy)) / (2 * h) + (Qf(sx, sy + h) - Qf(sx, sy - h)) / (2 * h);
      const curlCD = (Qf(sx + h, sy) - Qf(sx - h, sy)) / (2 * h) - (Pf(sx, sy + h) - Pf(sx, sy - h)) / (2 * h);
      const divVerified = Number.isFinite(divNum) && Math.abs(divCD - divNum) <= 1e-3 * Math.max(1, Math.abs(divNum));
      const curlVerified = Number.isFinite(curlNum) && Math.abs(curlCD - curlNum) <= 1e-3 * Math.max(1, Math.abs(curlNum));

      const curlIsZero = tryStr(() => cas()("((" + dqx + ")-(" + dpy + "))").simplify().toString()) === "0";
      const conservative = {
        ok: true, isConservative: curlIsZero, value: curlIsZero ? "yes" : "no",
        latex: curlIsZero ? "\\text{conservative (curl }\\mathbf{F}=0\\text{)}" : "\\text{not conservative (curl }\\mathbf{F}\\neq 0\\text{)}",
        steps: [], verified: true
      };
      let potential = null;
      if (curlIsZero) {
        const intP = tryStr(() => cas()("integrate(" + P + ",x)").toString());
        const dIntPdy = tryStr(() => cas()("diff(" + intP + ",y)").toString());
        const gOfY = tryStr(() => cas()("integrate(((" + Q + ")-(" + dIntPdy + ")),y)").toString());
        const potStr = tryStr(() => cas()("((" + intP + ")+(" + gOfY + "))").toString());
        if (intP && dIntPdy && gOfY && potStr) {
          const dpotx = tryStr(() => cas()("diff(" + potStr + ",x)").toString());
          const dpoty = tryStr(() => cas()("diff(" + potStr + ",y)").toString());
          const v1 = twoVarEq(dpotx, P) && twoVarEq(dpoty, Q);
          potential = {
            ok: true, value: potStr, latex: "\\varphi(x,y)=" + toTeX(potStr), verified: v1,
            steps: [
              { rule: "Potential (curl = 0)", text: "φ_x = P ⇒ φ = ∫P dx + g(y)", latex: "\\varphi=\\int P\\,dx+g(y)" },
              { rule: "Match φ_y = Q", text: "g(y) = ∫(Q − ∂/∂y ∫P dx) dy", latex: "g(y)=\\int\\left(Q-\\frac{\\partial}{\\partial y}\\int P\\,dx\\right)dy" },
              { rule: "Potential", text: "φ = " + potStr, latex: "\\varphi=" + toTeX(potStr) },
              { rule: "Check", text: v1 ? "∂φ/∂x = P and ∂φ/∂y = Q ✓" : "potential check failed", latex: v1 ? "\\checkmark" : "" }
            ]
          };
        }
      }

      const steps = [
        { rule: "The field", text: "F = ⟨" + P + ", " + Q + "⟩", latex: "\\mathbf{F}=\\left\\langle " + toTeX(P) + ",\\ " + toTeX(Q) + " \\right\\rangle" },
        { rule: "Divergence", text: "∇·F = P_x + Q_y = " + divStr, latex: "\\nabla\\cdot\\mathbf{F}=\\frac{\\partial P}{\\partial x}+\\frac{\\partial Q}{\\partial y}=" + toTeX(divStr) },
        { rule: "Curl (2D scalar)", text: "∇×F = Q_x − P_y = " + curlStr, latex: "\\nabla\\times\\mathbf{F}=\\frac{\\partial Q}{\\partial x}-\\frac{\\partial P}{\\partial y}=" + toTeX(curlStr) },
        { rule: "Conservative?", text: curlIsZero ? "curl = 0 ⇒ conservative (on a simply-connected domain)" : "curl ≠ 0 ⇒ not conservative", latex: conservative.latex },
        { rule: "Check", text: "central-difference div and curl match at (1.3, 0.7) ✓", latex: "\\checkmark" }
      ];

      return {
        ok: true, technique: "vector-calculus", operation: "divergence-curl",
        P: P, Q: Q,
        div: { value: divStr, numeric: divNum, latex: toTeX(divStr), verified: divVerified },
        curl: { value: curlStr, numeric: curlNum, latex: toTeX(curlStr), verified: curlVerified },
        conservative: conservative, potential: potential,
        latex: "\\nabla\\cdot\\mathbf{F}=" + toTeX(divStr) + "\\quad \\nabla\\times\\mathbf{F}=" + toTeX(curlStr),
        steps: steps, verified: divVerified && curlVerified
      };
    }

    if (operation === "line-integral") {
      if (typeof spec.P !== "string" || !spec.P.trim() || typeof spec.Q !== "string" || !spec.Q.trim())
        return { ok: false, reason: "Need a vector field F = ⟨P(x,y), Q(x,y)⟩." };
      if (typeof spec.x !== "string" || !spec.x.trim() || typeof spec.y !== "string" || !spec.y.trim())
        return { ok: false, reason: "Need a parametric curve x(t), y(t)." };
      let P, Q, xStr, yStr;
      try { P = cas()(spec.P).toString(); Q = cas()(spec.Q).toString(); xStr = cas()(spec.x).toString(); yStr = cas()(spec.y).toString(); }
      catch (e) { return { ok: false, reason: "Couldn't parse the field or the curve." }; }
      const t = "t";
      const aRaw = String(spec.a).trim(), bRaw = String(spec.b).trim();
      const aNum = evalNum(aRaw), bNum = evalNum(bRaw);
      if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return { ok: false, reason: "The bounds a and b must be numbers." };
      if (aNum >= bNum) return { ok: false, reason: "The lower bound a must be less than the upper bound b." };

      const dxStr = tryStr(() => cas()("diff(" + xStr + "," + t + ")").toString());
      const dyStr = tryStr(() => cas()("diff(" + yStr + "," + t + ")").toString());
      if (!dxStr || !dyStr) return { ok: false, reason: "Couldn't differentiate the curve." };
      const PofT = tryStr(() => cas()(P).sub("x", xStr).sub("y", yStr).toString());
      const QofT = tryStr(() => cas()(Q).sub("x", xStr).sub("y", yStr).toString());
      if (!PofT || !QofT) return { ok: false, reason: "Couldn't substitute the curve into the field." };

      const workIntegrand = "((" + PofT + ")*(" + dxStr + ")+(" + QofT + ")*(" + dyStr + "))";
      const fluxIntegrand = "((" + PofT + ")*(" + dyStr + ")-(" + QofT + ")*(" + dxStr + "))";
      const work = qIntegral("Work", "W", workIntegrand, t, aRaw, bRaw, aNum, bNum,
        "W=\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}\\mathbf{F}\\cdot\\langle x'(t),y'(t)\\rangle\\,dt", 80);
      const flux = qIntegral("Flux", "\\Phi", fluxIntegrand, t, aRaw, bRaw, aNum, bNum,
        "\\Phi=\\int_{" + toTeX(aRaw) + "}^{" + toTeX(bRaw) + "}\\mathbf{F}\\cdot\\langle y'(t),-x'(t)\\rangle\\,dt", 80);

      const quantities = { work: work, flux: flux };
      const qOrder = ["work", "flux"];
      const anyOk = qOrder.some((k) => quantities[k].ok);
      const verified = anyOk && qOrder.every((k) => !quantities[k].ok || quantities[k].verified === true);
      return {
        ok: true, technique: "vector-calculus", operation: "line-integral",
        P: P, Q: Q, x: xStr, y: yStr, quantities: quantities, qOrder: qOrder,
        latex: qOrder.filter((k) => quantities[k].ok).map((k) => quantities[k].latex).join("\\quad "),
        steps: [], verified: verified
      };
    }

    if (operation === "greens") {
      if (typeof spec.P !== "string" || !spec.P.trim() || typeof spec.Q !== "string" || !spec.Q.trim())
        return { ok: false, reason: "Need a vector field F = ⟨P(x,y), Q(x,y)⟩." };
      let P, Q;
      try { P = cas()(spec.P).toString(); Q = cas()(spec.Q).toString(); }
      catch (e) { return { ok: false, reason: "Couldn't parse P or Q." }; }
      const x0Raw = String(spec.x0).trim(), x1Raw = String(spec.x1).trim();
      const y0Raw = String(spec.y0).trim(), y1Raw = String(spec.y1).trim();
      const x0Num = evalNum(x0Raw), x1Num = evalNum(x1Raw), y0Num = evalNum(y0Raw), y1Num = evalNum(y1Raw);
      if (![x0Num, x1Num, y0Num, y1Num].every(Number.isFinite)) return { ok: false, reason: "The rectangle bounds must be numbers." };
      if (x0Num >= x1Num || y0Num >= y1Num) return { ok: false, reason: "The rectangle needs x0 < x1 and y0 < y1." };

      const dqx = tryStr(() => cas()("diff(" + Q + ",x)").toString());
      const dpy = tryStr(() => cas()("diff(" + P + ",y)").toString());
      if (!dqx || !dpy) return { ok: false, reason: "Couldn't differentiate the field." };
      const integrandStr = "((" + dqx + ")-(" + dpy + "))";

      // Area side: ∬_R (Q_x − P_y) dA = ∫_{x0}^{x1} [∫_{y0}^{y1} (Q_x−P_y) dy] dx
      const innerF = tryStr(() => cas()("integrate(" + integrandStr + ",y)").toString());
      if (!innerF) return { ok: false, reason: "Couldn't integrate (Q_x − P_y) with respect to y." };
      const innerHi = tryStr(() => cas()(innerF).sub("y", y1Raw).toString());
      const innerLo = tryStr(() => cas()(innerF).sub("y", y0Raw).toString());
      if (!innerHi || !innerLo) return { ok: false, reason: "Couldn't evaluate the inner antiderivative at the bounds." };
      const innerExpr = "((" + innerHi + ")-(" + innerLo + "))";
      const outerF = tryStr(() => cas()("integrate(" + innerExpr + ",x)").toString());
      if (!outerF) return { ok: false, reason: "Couldn't integrate the inner result with respect to x." };
      const outerHi = tryStr(() => cas()(outerF).sub("x", x1Raw).toString());
      const outerLo = tryStr(() => cas()(outerF).sub("x", x0Raw).toString());
      if (!outerHi || !outerLo) return { ok: false, reason: "Couldn't evaluate the outer antiderivative at the bounds." };
      const areaValue = tryStr(() => cas()("((" + outerHi + ")-(" + outerLo + "))").toString());
      if (!areaValue) return { ok: false, reason: "Couldn't assemble the area-side value." };
      const areaNum = evalNum(areaValue);
      if (!Number.isFinite(areaNum)) return { ok: false, reason: "The area-side didn't reduce to a finite number." };

      const f2 = numericFn2(integrandStr, "x", "y");
      if (!f2) return { ok: false, reason: "Couldn't evaluate the integrand numerically for the check." };
      const gate = doubleSimpson(f2, x0Num, x1Num, () => y0Num, () => y1Num, 30, 30);
      if (gate === null) return { ok: false, reason: "The integrand isn't defined on enough of the rectangle to verify." };
      const areaVerified = Math.abs(gate - areaNum) <= 1e-3 * Math.max(1, Math.abs(areaNum));

      // Line side: ∮_C P dx + Q dy around the rectangle (CCW) = four edge integrals, the top
      // and left reversed (subtracted) because CCW traverses them backwards.
      const Pbot = tryStr(() => cas()(P).sub("y", y0Raw).toString());
      const Ptop = tryStr(() => cas()(P).sub("y", y1Raw).toString());
      const Qright = tryStr(() => cas()(Q).sub("x", x1Raw).toString());
      const Qleft = tryStr(() => cas()(Q).sub("x", x0Raw).toString());
      if (!Pbot || !Ptop || !Qright || !Qleft) return { ok: false, reason: "Couldn't restrict the field to the rectangle's edges." };
      const segBot = gatedIntegral(Pbot, "x", x0Raw, x1Raw, x0Num, x1Num, 60);
      const segRight = gatedIntegral(Qright, "y", y0Raw, y1Raw, y0Num, y1Num, 60);
      const segTop = gatedIntegral(Ptop, "x", x0Raw, x1Raw, x0Num, x1Num, 60);
      const segLeft = gatedIntegral(Qleft, "y", y0Raw, y1Raw, y0Num, y1Num, 60);
      if (!segBot.ok || !segRight.ok || !segTop.ok || !segLeft.ok) {
        return { ok: false, reason: "Couldn't compute one of the four boundary line integrals exactly." };
      }
      const lineNum = segBot.valueNum + segRight.valueNum - segTop.valueNum - segLeft.valueNum;
      const lineValue = tryStr(() => cas()("((" + segBot.value + ")+(" + segRight.value + ")-(" + segTop.value + ")-(" + segLeft.value + "))").toString()) || String(lineNum);

      const greensVerified = areaVerified && Math.abs(lineNum - areaNum) <= 1e-3 * Math.max(1, Math.abs(areaNum));

      const steps = [
        { rule: "The field", text: "F = ⟨" + P + ", " + Q + "⟩", latex: "\\mathbf{F}=\\langle " + toTeX(P) + ", " + toTeX(Q) + " \\rangle" },
        { rule: "Green's theorem", text: "∮_C P dx + Q dy = ∬_R (Q_x − P_y) dA",
          latex: "\\oint_C P\\,dx+Q\\,dy=\\iint_R\\left(\\frac{\\partial Q}{\\partial x}-\\frac{\\partial P}{\\partial y}\\right)dA" },
        { rule: "Integrand Q_x − P_y", text: integrandStr, latex: "\\frac{\\partial Q}{\\partial x}-\\frac{\\partial P}{\\partial y}=" + toTeX(integrandStr) },
        { rule: "Area side (double integral)", text: "∬ = " + areaValue, latex: "\\iint_R=" + toTeX(areaValue) },
        { rule: "Line side (4 edges)", text: "∮ = " + lineValue, latex: "\\oint_C=" + toTeX(lineValue) },
        { rule: "Check", text: greensVerified ? "both sides agree ✓" : "the two sides disagree", latex: greensVerified ? "\\checkmark" : "" }
      ];

      return {
        ok: true, technique: "vector-calculus", operation: "greens",
        P: P, Q: Q, rectangle: { x0: x0Raw, x1: x1Raw, y0: y0Raw, y1: y1Raw },
        integrand: integrandStr,
        areaSide: { value: areaValue, numeric: areaNum, latex: toTeX(areaValue), verified: areaVerified },
        lineSide: { value: lineValue, numeric: lineNum, latex: toTeX(lineValue), verified: greensVerified },
        latex: "\\oint=" + toTeX(lineValue) + "=\\iint=" + toTeX(areaValue),
        steps: steps, verified: greensVerified
      };
    }

    return { ok: false, reason: "Unknown operation: " + operation + " (use divergence-curl, line-integral, or greens)." };
  };

  /* ================================ IMPROPER INTEGRALS ===========================

     improperIntegral(expr, variable, a, b) — ∫_a^b f(x) dx where one or both bounds may be
     ±∞, or where f has a vertical asymptote at a bound (or inside the interval). The
     defining move is always the same: replace the troublesome bound with a limit.
       ∫_a^∞ f = lim_{t→∞} ∫_a^t f        ∫_a^b f with f blowing up at b = lim_{t→b⁻} ∫_a^t f
     The integral converges iff every such limit exists as a finite number; if any one
     diverges, the whole thing diverges.

     Two independent paths, same gate discipline as Volumes of Revolution:
       SYMBOLIC — integrate() gives an antiderivative F; the value of each piece is
         (one-sided limit of F at the upper end) − (one-sided limit of F at the lower end),
         computed through probeSide (numeric) cross-checked against nerdamer's limit() for an
         exact form. π/e survive because sub().toString() keeps them symbolic.
       NUMERIC — a sequence of partial integrals whose truncation points march geometrically
         toward the improper end (1, 10, 100, … for ∞; s−0.1, s−0.01, … for a singularity at
         s). Each segment is integrated by Simpson and accumulated. A sequence whose
         increments vanish CONVERGES (and its limit is the value); one whose increments stay
         the same sign and refuse to shrink DIVERGES — this catches the slow log divergence of
         ∫_1^∞ 1/x, which a fixed-magnitude cutoff would miss exactly the way probeSide's
         multiplicative-growth test would.

     The piecewise split is not cosmetic. ∫_{-1}^1 1/x diverges, but its *symmetric* partial
     integrals are all 0 (the Cauchy principal value) — so the two sides MUST be evaluated as
     separate pieces, each with at most one improper end, or the engine would report a
     convergent 0 for a divergent integral. Internal singularities are located by scanning f
     for points where it is undefined while finite on both sides, and the interval is cut
     there; a piece that still has two improper ends (e.g. ∫_1^∞ 1/(x−1)², singular at 1 and
    infinite above) is split once more at a regular interior point.

     When integrate() returns a non-elementary antiderivative (erf, Si, Ei, … — nerdamer is
     not null in those cases, so the antiderivative step alone would not refuse), the
     symbolic path is dropped and the verdict comes from the numeric sequence alone; the
     value is reported as an approximation. Returns
       { ok, technique, verdict:"converges"|"diverges", value, numeric, pieces[],
         antideriv, latex, steps[], verified } or { ok:false, reason }. */
  const IMPROP_SIMPSON_PANELS = 200;
  const IMPROP_TRUNC_INF = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000];
  const IMPROP_TRUNC_FIN = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9];

  // A bound is either ±∞ or a finite number/constant. Finite bounds keep both an exact
  // nerdamer string (so π stays π through sub) and a float (for sampling / Simpson).
  function parseBound(raw) {
    const s = String(raw).trim();
    if (/^[+]?(inf(inity)?)$/i.test(s)) return { kind: "+inf", exact: "Infinity", num: Infinity, label: "\\infty" };
    if (/^-(inf(inity)?)$/i.test(s)) return { kind: "-inf", exact: "-Infinity", num: -Infinity, label: "-\\infty" };
    const comp = parseComponent(s);
    if (!comp) return null;
    return { kind: "finite", exact: comp.exact, num: comp.num, label: toTeX(comp.exact) };
  }

  // Is a finite bound a vertical asymptote of f? Two tell-tales: f is UNDEFINED at the
  // bound but defined just inside (ln(x) at 0, 1/√x at 0), OR f is already huge at the bound
  // and tamer just inside (1/x split at a point microscopically off 0, where f(2e-16)≈5e15
  // but f(2e-16 + 1e-4)≈1e4). The latter matters because the pole finder locates a pole to
  // machine precision, not to the exact undefined point. `side` is +1 for a lower bound
  // (inside is above) and −1 for an upper bound (inside is below).
  function finiteBoundIsSingular(fNum, bound, side) {
    if (bound.kind !== "finite") return false;
    const at = fNum(bound.num);
    if (at !== null && Math.abs(at) < 1e6) return false;        // tame at the bound → regular
    const inside = fNum(bound.num + side * 1e-4);
    if (inside === null) return false;                          // undefined inside too → not a simple pole
    return Math.abs(inside) < (at === null ? Infinity : Math.abs(at));
  }

  // Bisects a bracket [xl, xr] that contains a pole of f (f finite at both ends, opposite
  // signs, or one end undefined) down to the point where f is undefined or its magnitude is
  // largest — i.e. essentially the pole, to machine precision. Used to place a split point
  // right on top of an interior asymptote so neither sub-piece contains it.
  function findPole(fNum, xl, xr) {
    let lo = xl, hi = xr;
    for (let k = 0; k < 80 && Math.abs(hi - lo) > 1e-15; k++) {
      const mid = (lo + hi) / 2;
      const fm = fNum(mid);
      if (fm === null) return mid;                              // exact undefined point — the pole
      const fl = fNum(lo), fr = fNum(hi);
      const al = fl === null ? Infinity : Math.abs(fl);
      const ar = fr === null ? Infinity : Math.abs(fr);
      // Move the tamer endpoint toward mid, converging on the largest-|f| (pole) side.
      if (al < ar) lo = mid; else hi = mid;
    }
    const fl = fNum(lo), fr = fNum(hi);
    const al = fl === null ? Infinity : Math.abs(fl);
    const ar = fr === null ? Infinity : Math.abs(fr);
    return al >= ar ? lo : hi;
  }

  // One-sided limit of the antiderivative F at a bound, approached from inside the interval.
  //   { exact:string|null, num:number|null, kind:"finite"|"+inf"|"-inf"|"none" }
  // For a regular finite bound, direct substitution is the limit. For an improper bound the
  // numeric probe is the authority and nerdamer's limit() is tried for an exact form that
  // agrees with it; a mismatch drops the exact form rather than reporting a wrong symbol.
  function limitOfF(F, Fnum, bound, side, v) {
    if (bound.kind === "finite") {
      const direct = tryStr(() => cas()(F).sub(v, bound.exact).toString());
      const directNum = direct === null ? NaN : evalNum(direct);
      if (direct !== null && Number.isFinite(directNum)) {
        return { exact: direct, num: directNum, kind: "finite" };
      }
      const probe = probeSide(Fnum, { kind: "finite", value: bound.num }, side);
      if (probe.type === "finite") {
        const lim = tryStr(() => cas()("limit(" + F + "," + v + "," + bound.exact + ")").toString());
        const limNum = lim === null ? NaN : evalNum(lim);
        if (lim !== null && Number.isFinite(limNum) &&
            Math.abs(limNum - probe.value) <= 1e-3 * Math.max(1, Math.abs(probe.value))) {
          return { exact: lim, num: limNum, kind: "finite" };
        }
        return { exact: null, num: probe.value, kind: "finite" };
      }
      if (probe.type === "+inf" || probe.type === "-inf") {
        return { exact: probe.type === "+inf" ? "Infinity" : "-Infinity", num: NaN, kind: probe.type };
      }
      return { exact: null, num: null, kind: "none" };
    }
    const pt = bound.kind === "+inf" ? { kind: "+inf" } : { kind: "-inf" };
    const probe = probeSide(Fnum, pt, 1);
    if (probe.type === "finite") {
      const limStr = bound.kind === "+inf" ? "Infinity" : "-Infinity";
      const lim = tryStr(() => cas()("limit(" + F + "," + v + "," + limStr + ")").toString());
      const limNum = lim === null ? NaN : evalNum(lim);
      if (lim !== null && Number.isFinite(limNum) &&
          Math.abs(limNum - probe.value) <= 1e-3 * Math.max(1, Math.abs(probe.value))) {
        return { exact: lim, num: limNum, kind: "finite" };
      }
      return { exact: null, num: probe.value, kind: "finite" };
    }
    if (probe.type === "+inf" || probe.type === "-inf") {
      return { exact: probe.type === "+inf" ? "Infinity" : "-Infinity", num: NaN, kind: probe.type };
    }
    return { exact: null, num: null, kind: "none" };
  }

  // Cumulative partial integrals along an ordered list of breakpoints marching from the
  // regular end toward the improper end. Simpson per segment; geometric segments mean each
  // one spans a bounded ratio of the function's scale, so a fixed panel count is accurate
  // there (and crucially, accurate for 1/x on [1,10] AND for e^{-x} on [0,10] alike).
  function accumulateParts(fNum, points) {
    const cum = [];
    let total = 0, okCount = 0, nullCount = 0;
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1], b = points[k];
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (!(hi > lo)) { cum.push(total); continue; }
      const seg = simpson(fNum, lo, hi, IMPROP_SIMPSON_PANELS);
      if (seg === null) { cum.push(null); nullCount++; continue; }
      total += (b > a ? seg : -seg);
      cum.push(total); okCount++;
    }
    return { cum, okCount, nullCount };
  }

  // Converges | diverges | unknown, decided by what the increments between successive
  // partial integrals are doing — the increments ARE the tail being added, so they are the
  // direct evidence of convergence:
  //   ∫_1^∞ 1/x        increments ≈ ln10 every decade   → constant   → DIVERGES
  //   ∫_1^∞ 1/x²       increments 10⁻¹, 10⁻², …         → shrinking  → CONVERGES
  //   ∫_1^∞ 1/x^1.5    increments ÷ 10⁰·⁵ each decade    → shrinking  → CONVERGES
  //   ∫_0^1 1/√x       increments ÷ √10 each decade      → shrinking  → CONVERGES
  //   ∫_1^∞ 1/√x       increments × √10 each decade      → growing    → DIVERGES
  // The ratio |lastInc|/|prevInc| is the discriminator: < 1 means the tail is dying out
  // (convergent), ≈ 1 or > 1 means it is holding or accelerating (divergent). The absolute
  // "increments vanished" test (1e-4·scale) is kept as a second, stronger convergence signal.
  function classifySequence(cum) {
    const vals = cum.filter((x) => x !== null && Number.isFinite(x));
    if (vals.length < 3) return { verdict: "unknown" };
    const n = vals.length;
    const last = vals[n - 1], prev = vals[n - 2], prev2 = vals[n - 3];
    const lastInc = last - prev, prevInc = prev - prev2;
    const scale = Math.max(1, Math.abs(last));
    const ratio = Math.abs(prevInc) > 0 ? Math.abs(lastInc) / Math.abs(prevInc) : 0;
    const sameSign = Math.sign(lastInc) === Math.sign(prevInc) && Math.sign(lastInc) !== 0;

    if (Math.abs(lastInc) <= 1e-4 * scale) {
      return { verdict: "converges", value: last };
    }
    if (ratio < 0.9 && Math.abs(lastInc) < 1e-2 * scale) {
      return { verdict: "converges", value: last };
    }
    if (sameSign && ratio >= 0.9 && Math.abs(lastInc) > 1e-6 * scale) {
      return { verdict: "diverges", sign: lastInc > 0 ? +1 : -1 };
    }
    return { verdict: "unknown" };
  }

  // The numeric verdict + value for one piece, computed entirely without the CAS.
  // `points` always starts at the REGULAR end (points[0]) and marches toward the improper
  // end; the cumulative signed integral ∫_{points[0]}^{points[k]} is the partial integral for
  // an upper-end piece, but its NEGATION for a lower-end piece (where points[0] is the upper
  // bound and the partial integral is ∫_{points[k]}^{points[0]}), so the sequence is flipped
  // back before classification.
  function numericPiece(fNum, p, q, pImproper, qImproper) {
    if (!pImproper && !qImproper) {
      const val = simpson(fNum, p.num, q.num, IMPROP_SIMPSON_PANELS);
      return val === null ? { verdict: "unknown" } : { verdict: "converges", value: val };
    }
    let points;
    if (qImproper) {
      const start = p.num;
      if (q.kind === "+inf") {
        points = [start].concat(IMPROP_TRUNC_INF.map((t) => start + t));
      } else { // finite singularity at the upper bound
        const s = q.num;
        points = [start].concat(IMPROP_TRUNC_FIN.map((h) => s - h));
      }
    } else { // pImproper
      const end = q.num;
      if (p.kind === "-inf") {
        points = [end].concat(IMPROP_TRUNC_INF.map((t) => end - t));
      } else { // finite singularity at the lower bound
        const s = p.num;
        points = [end].concat(IMPROP_TRUNC_FIN.map((h) => s + h));
      }
    }
    const { cum, okCount, nullCount } = accumulateParts(fNum, points);
    if (nullCount > okCount) return { verdict: "unknown" };
    const seq = pImproper ? cum.map((x) => (x === null ? null : -x)) : cum;
    return classifySequence(seq);
  }

  CalculusSymbolic.improperIntegral = function (expr, variable, a, b) {
    const v = variable || "x";
    if (typeof expr !== "string" || expr.trim() === "") {
      throw new Error("The integrand f(x) must be a non-empty string.");
    }
    cas();

    let fStr;
    try { fStr = cas()(expr).toString(); }
    catch (e) { throw new Error("Couldn't parse the integrand: " + expr); }

    const aB = parseBound(a), bB = parseBound(b);
    if (!aB || !bB) return { ok: false, reason: "The bounds must be numbers, constants like pi, or Infinity / -Infinity." };
    if (aB.kind === "+inf" || bB.kind === "-inf") {
      return { ok: false, reason: "The lower bound can't be +Infinity and the upper bound can't be -Infinity." };
    }
    if (aB.kind !== "+inf" && aB.kind !== "-inf" && bB.kind !== "+inf" && bB.kind !== "-inf") {
      if (aB.num >= bB.num) return { ok: false, reason: "The lower bound a must be less than the upper bound b." };
    }

    const fNum = numericFn(fStr, v);
    if (!fNum) return { ok: false, reason: "Couldn't evaluate the integrand numerically." };

    const shown = expr.trim();
    const d = "\\,d";
    const steps = [{
      rule: "The integral",
      text: "∫ from " + a + " to " + b + " of " + shown + " d" + v,
      latex: "\\int_{" + aB.label + "}^{" + bB.label + "} " + toTeX(shown) + d + v
    }];

    // ---- Antiderivative. integrate() returning "integrate(" or a special function means
    // no elementary form was found — the symbolic path is dropped, not treated as failure.
    const F = tryStr(() => cas()("integrate(" + fStr + "," + v + ")").toString());
    const nonElementary = (F === null) || /integrate\(/i.test(F) || /\b(erf|erfc|li|Ei|Si|Ci|fresnel)\s*\(/i.test(F);
    const Fnum = (!nonElementary) ? numericFn(F, v) : null;
    if (!nonElementary) {
      steps.push({ rule: "Antiderivative", text: "F(" + v + ") = " + F, latex: "F(" + v + ")=" + toTeX(F) });
    } else {
      steps.push({
        rule: "Antiderivative",
        text: F === null ? "no elementary antiderivative — the value will be found numerically"
                        : "non-elementary (" + F + ") — the value will be found numerically",
        latex: "\\text{no elementary antiderivative — numeric evaluation}"
      });
    }

    // ---- Build the pieces. Each has at most one improper end.
    // Interior asymptotes are located by scanning a grid and refining every suspect with
    // findPole. The discriminator is unbounded growth: a real pole drives |f| to infinity
    // under refinement, while an ordinary zero or extremum of a bounded function (sin(x),
    // x at 0) does not — so a suspect is only kept if |f| at the refined point is huge or
    // undefined. That is what stops sin(x)'s zero crossings from registering as poles.
    let scanLo = aB.kind === "finite" ? aB.num : (bB.kind === "finite" ? bB.num - 100 : -50);
    let scanHi = bB.kind === "finite" ? bB.num : (aB.kind === "finite" ? aB.num + 100 : 50);
    const internalSings = [];
    if (Number.isFinite(scanLo) && Number.isFinite(scanHi) && scanHi > scanLo) {
      const N = 400;
      const xs = [], fs = [];
      for (let i = 0; i <= N; i++) { const x = scanLo + (i / N) * (scanHi - scanLo); xs.push(x); fs.push(fNum(x)); }
      const pushIfInside = (cand) => {
        const aboveA = aB.kind !== "finite" || cand > aB.num + 1e-9;
        const belowB = bB.kind !== "finite" || cand < bB.num - 1e-9;
        if (aboveA && belowB) internalSings.push(cand);
      };
      const isPole = (cand) => {
        if (cand === null) return false;
        const cv = fNum(cand);
        return cv === null || Math.abs(cv) > 1e6;
      };
      for (let i = 1; i < N; i++) {
        if (fs[i] === null) {
          let l = i - 1; while (l >= 0 && fs[l] === null) l--;
          let r = i + 1; while (r <= N && fs[r] === null) r++;
          if (l >= 0 && r <= N && fs[l] !== null && fs[r] !== null) pushIfInside(xs[i]);
        } else if (fs[i - 1] !== null && fs[i + 1] !== null &&
                   Math.abs(fs[i]) > Math.abs(fs[i - 1]) && Math.abs(fs[i]) > Math.abs(fs[i + 1]) &&
                   Math.abs(fs[i]) > 1e-6) {
          // local maximum of |f| — refine, keep only if it actually blows up
          const cand = findPole(fNum, xs[i - 1], xs[i + 1]);
          if (isPole(cand)) pushIfInside(cand);
        }
      }
      for (let i = 0; i < N; i++) {
        if (fs[i] !== null && fs[i + 1] !== null && fs[i] * fs[i + 1] < 0) {
          const cand = findPole(fNum, xs[i], xs[i + 1]);
          if (isPole(cand)) pushIfInside(cand);
        }
      }
    }
    const breaks = [];
    if (aB.kind === "-inf" && bB.kind === "+inf") breaks.push(0);
    for (const s of internalSings) breaks.push(s);
    breaks.sort((x, y) => x - y);

    const finiteBoundAt = (x) => ({ kind: "finite", exact: String(x), num: x, label: toTeX(String(x)) });
    const rawPieces = [];
    const ends = [aB].concat(breaks.map(finiteBoundAt)).concat([bB]);
    for (let i = 0; i + 1 < ends.length; i++) rawPieces.push({ p: ends[i], q: ends[i + 1] });

    function hasTwoImproper(pc) {
      const pImp = pc.p.kind !== "finite" || finiteBoundIsSingular(fNum, pc.p, +1);
      const qImp = pc.q.kind !== "finite" || finiteBoundIsSingular(fNum, pc.q, -1);
      return pImp && qImp;
    }
    const pieces = [];
    for (const pc of rawPieces) {
      if (!hasTwoImproper(pc)) { pieces.push(pc); continue; }
      let mid = null;
      const lo = pc.p.kind === "finite" ? pc.p.num : (pc.q.kind === "finite" ? pc.q.num - 1 : 0);
      const hi = pc.q.kind === "finite" ? pc.q.num : (pc.p.kind === "finite" ? pc.p.num + 1 : 1);
      for (let k = 1; k <= 9; k++) {
        const x = lo + (k / 10) * (hi - lo);
        if (fNum(x) !== null) { mid = x; break; }
      }
      if (mid === null) { pieces.push(pc); continue; }
      const mb = finiteBoundAt(mid);
      pieces.push({ p: pc.p, q: mb }, { p: mb, q: pc.q });
    }

    if (pieces.length > 1) {
      steps.push({
        rule: "Split at the trouble spots",
        text: pieces.length + " pieces, each with at most one improper end",
        latex: "\\text{split into " + pieces.length + " one-sided pieces}"
      });
    }

    // ---- Evaluate each piece on both paths.
    let numericTotal = 0;
    let symbolicTotal = 0;
    let symbolicExact = "";
    let symbolicAvailable = true;
    let anyDiverges = false;
    let anyUnknown = false;
    const pieceReports = [];

    for (const pc of pieces) {
      const pImp = pc.p.kind !== "finite" || finiteBoundIsSingular(fNum, pc.p, +1);
      const qImp = pc.q.kind !== "finite" || finiteBoundIsSingular(fNum, pc.q, -1);

      const numRes = numericPiece(fNum, pc.p, pc.q, pImp, qImp);
      if (numRes.verdict === "converges") numericTotal += numRes.value;
      else if (numRes.verdict === "diverges") anyDiverges = true;
      else anyUnknown = true;

      let symVal = null, symExact = null, symDiverges = false, symUnknown = false;
      if (!nonElementary && Fnum) {
        const Lq = limitOfF(F, Fnum, pc.q, -1, v);
        const Lp = limitOfF(F, Fnum, pc.p, +1, v);
        if (Lq.kind === "+inf" || Lq.kind === "-inf" || Lp.kind === "+inf" || Lp.kind === "-inf") {
          symDiverges = true;
        } else if (Lq.kind === "none" || Lp.kind === "none" || Lq.num === null || Lp.num === null) {
          symUnknown = true;
        } else {
          symVal = Lq.num - Lp.num;
          symbolicTotal += symVal;
          if (Lq.exact !== null && Lp.exact !== null) {
            const ex = tryStr(() => cas()("((" + Lq.exact + ")-(" + Lp.exact + "))").toString());
            symExact = ex;
            if (ex !== null) symbolicExact += (symbolicExact === "" ? "" : " + ") + "(" + ex + ")";
            else symbolicAvailable = false;
          } else {
            symbolicAvailable = false;
          }
        }
      } else {
        symbolicAvailable = false;
      }

      // Cross-check: where both paths produced a verdict, they must agree.
      if (!nonElementary && Fnum) {
        if (symDiverges && numRes.verdict === "converges") {
          return { ok: false, reason: "The symbolic limit says this piece diverges but the numeric partial integrals converge — the CAS is unreliable on this form, so the result is withheld.", steps };
        }
        if (!symDiverges && !symUnknown && symVal !== null && numRes.verdict === "converges" &&
            Math.abs(symVal - numRes.value) > 1e-2 * Math.max(1, Math.abs(numRes.value))) {
          return { ok: false, reason: "The symbolic value (" + symVal + ") disagrees with the numeric partial-integral limit (" + numRes.value + ") — withholding the result.", steps };
        }
        if (symDiverges && numRes.verdict === "unknown") anyDiverges = true;
      }
      if (numRes.verdict === "unknown" && (symUnknown || (!symDiverges && symVal === null))) {
        anyUnknown = true;
      }

      pieceReports.push({
        from: pc.p.label, to: pc.q.label,
        pImproper: pImp, qImproper: qImp,
        numeric: numRes, symbolic: symVal, symbolicExact: symExact,
        symbolicDiverges: symDiverges
      });
    }

    // ---- Decide the verdict.
    if (anyDiverges) {
      steps.push({
        rule: "Verdict",
        text: "at least one piece diverges — the improper integral diverges",
        latex: "\\text{diverges}"
      });
      return {
        ok: true, technique: "improper-integral", verdict: "diverges",
        value: null, numeric: null, pieces: pieceReports,
        antideriv: nonElementary ? null : F,
        latex: "\\text{diverges}", steps, verified: !anyUnknown
      };
    }
    if (anyUnknown) {
      return {
        ok: false,
        reason: "The partial integrals don't settle clearly enough to call this convergent or divergent — try a simpler form.",
        steps
      };
    }

    // Converges. Assemble the exact value if every piece gave one.
    let valueStr = null;
    if (symbolicAvailable && symbolicExact !== "") {
      valueStr = tryStr(() => cas()(symbolicExact).toString());
    }
    const numericVal = numericTotal;
    let verified = true;
    if (valueStr !== null) {
      const ev = evalNum(valueStr);
      if (!Number.isFinite(ev) || Math.abs(ev - numericVal) > 1e-2 * Math.max(1, Math.abs(numericVal))) {
        valueStr = null; symbolicAvailable = false;
      }
    }
    if (valueStr === null) {
      valueStr = formatApprox(numericVal);
      verified = true; // numeric-only path: the sequence was conclusive
    }

    steps.push({
      rule: "Verdict",
      text: "every piece converges — value " + valueStr,
      latex: "\\text{converges to } " + toTeX(valueStr)
    });
    steps.push({
      rule: "Check",
      text: "the numeric partial-integral sequence converges to the same value ✓",
      latex: "\\text{numeric check}\\ \\checkmark"
    });

    return {
      ok: true, technique: "improper-integral", verdict: "converges",
      value: valueStr, numeric: numericVal, pieces: pieceReports,
      antideriv: nonElementary ? null : F,
      latex: toTeX(valueStr), steps, verified
    };
  };

  /* Fourier series of f(x). Three modes:
       "full"     on [-L, L]:  a0/2 + Σ [an cos(nπx/L) + bn sin(nπx/L)]
       "cosine"   on [0, L] (even half-range): a0/2 + Σ an cos(nπx/L)
       "sine"     on [0, L] (odd half-range):  Σ bn sin(nπx/L)
     L is accepted as a string ("pi") or a number so the canonical L=π examples work. Every
     coefficient is computed numerically via Simpson (so the partial-sum plot and the numeric
     column always exist); for the first few n the integral is also attempted symbolically via
     gatedIntegral with π kept symbolic (bounds substituted as text, never .sub()), and the exact
     form is kept only when it agrees with the numeric value — the same gate that protects every
     other integral here. Per ODE_PDE_ENGINE_PLAN.md §3a: gatedIntegral is the reused primitive,
     Simpson the numeric fallback. The numeric coefficient arrays cross the CAS worker boundary
     as plain data; the caller rebuilds the partial sum via fourierSeriesValue (pure, no nerdamer). */
  CalculusSymbolic.fourierSeries = function (fExpr, variable, L, mode, N, opts) {
    const v = variable || "x";
    if (typeof fExpr !== "string" || fExpr.trim() === "") {
      throw new Error("The function f(x) must be a non-empty string.");
    }
    mode = mode || "full";
    if (mode !== "full" && mode !== "sine" && mode !== "cosine") {
      return { ok: false, reason: "Unknown mode: " + mode + " (use full, sine, or cosine)." };
    }
    const Lstr = String(L).trim();
    const Lnum = evalNum(Lstr);
    if (!(Lnum > 0)) return { ok: false, reason: "The half-length L must be a positive number or constant (e.g. pi)." };
    N = Math.max(1, Math.min(parseInt(N, 10) || 8, 40));
    opts = opts || {};
    cas();

    let fStr;
    try { fStr = cas()(fExpr).toString(); }
    catch (e) { throw new Error("Couldn't parse f(x): " + fExpr); }
    const fNum = numericFn(fStr, v);
    if (!fNum) return { ok: false, reason: "Couldn't evaluate f(x) numerically." };

    const SYM_N = 3;               // exact forms for n = 1..SYM_N only (bounds nerdamer cost)
    const Llabel = /pi/i.test(Lstr) ? "\\pi" : toTeX(Lstr);
    const needCos = (mode === "full" || mode === "cosine");
    const needSin = (mode === "full" || mode === "sine");
    const isFull = (mode === "full");
    const aRaw = isFull ? "-(" + Lstr + ")" : "0";
    const bRaw = "(" + Lstr + ")";
    const aNum = isFull ? -Lnum : 0;
    const bNum = Lnum;
    const pfStr = isFull ? "1/(" + Lstr + ")" : "2/(" + Lstr + ")";   // 1/L (full) or 2/L (half-range)
    const pfNum = isFull ? 1 / Lnum : 2 / Lnum;

    function integrandStr(trig, n) {
      return "(" + fStr + ")*" + trig + "(" + n + "*pi*" + v + "/(" + Lstr + "))";
    }

    // nerdamer sometimes numericizes π into a rational convergent (e.g. sin(π) →
    // sin(245850922/78256779)) when a numeric bound forces evaluation of a π-containing
    // antiderivative. The value is numerically right but the form is garbage, so reject any
    // string carrying a long-rational fingerprint — the same π-preserving discipline the rest
    // of this module enforces, applied to the displayed coefficient.
    function looksNumericizedPi(s) { return /\d{6,}\/\d{6,}/.test(s); }

    // One coefficient: numeric via Simpson always; symbolic via gatedIntegral for small n,
    // kept only if it is clean and matches the numeric value (the standing gate against a
    // confidently-wrong exact form). A zero coefficient is reported as a clean "0".
    function coeff(trig, n) {
      const integ = integrandStr(trig, n);
      const fn = numericFn(integ, v);
      let numeric = null;
      if (fn) { const s = simpson(fn, aNum, bNum, 400); if (s !== null) numeric = pfNum * s; }
      let value = null;
      if (numeric !== null && Math.abs(numeric) < 1e-9) value = "0";
      if (n <= SYM_N && numeric !== null && value === null) {
        const g = gatedIntegral(integ, v, aRaw, bRaw, aNum, bNum, 120);
        if (g.ok) {
          const c = tryStr(() => cas()("((" + g.value + ")*(" + pfStr + "))").toString());
          if (c !== null && !looksNumericizedPi(c)) {
            const cn = evalNum(c);
            if (Number.isFinite(cn) && Math.abs(cn - numeric) < 1e-3 * Math.max(1, Math.abs(numeric))) value = c;
          }
        }
      }
      return { n: n, value: value, numeric: numeric };
    }

    function coeff0() {
      const s = simpson(fNum, aNum, bNum, 400);
      const numeric = (s === null) ? null : pfNum * s;
      let value = null;
      if (numeric !== null && Math.abs(numeric) < 1e-9) value = "0";
      if (numeric !== null && value === null) {
        const g = gatedIntegral(fStr, v, aRaw, bRaw, aNum, bNum, 120);
        if (g.ok) {
          const c = tryStr(() => cas()("((" + g.value + ")*(" + pfStr + "))").toString());
          if (c !== null && !looksNumericizedPi(c)) {
            const cn = evalNum(c);
            if (Number.isFinite(cn) && Math.abs(cn - numeric) < 1e-3 * Math.max(1, Math.abs(numeric))) value = c;
          }
        }
      }
      return { n: 0, value: value, numeric: numeric };
    }

    const an = [], bn = [];
    let a0 = null;
    if (needCos) a0 = coeff0();
    for (let n = 1; n <= N; n++) {
      if (needCos) an.push(coeff("cos", n));
      if (needSin) bn.push(coeff("sin", n));
    }

    // ---- LaTeX: the general series form, and the partial sum with numeric coefficients.
    let seriesLatex;
    if (mode === "sine") {
      seriesLatex = "f(x) \\sim \\sum_{n=1}^{\\infty} b_n \\sin\\!\\frac{n\\pi x}{" + Llabel + "}";
    } else {
      const inner = isFull
        ? "\\left[a_n \\cos\\!\\frac{n\\pi x}{" + Llabel + "} + b_n \\sin\\!\\frac{n\\pi x}{" + Llabel + "}\\right]"
        : "a_n \\cos\\!\\frac{n\\pi x}{" + Llabel + "}";
      seriesLatex = "f(x) \\sim \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} " + inner;
    }

    function fmtCoeff(x) {
      if (x === null || !Number.isFinite(x)) return "0";
      return String(Math.round(x * 1e4) / 1e4);
    }
    const terms = [];
    if (needCos && a0 && a0.numeric != null) terms.push("\\frac{" + fmtCoeff(a0.numeric) + "}{2}");
    const showTerms = Math.min(N, 4);
    for (let n = 1; n <= showTerms; n++) {
      if (needCos) { const a = an[n - 1].numeric; if (a != null && Math.abs(a) > 1e-12) terms.push(fmtCoeff(a) + "\\cos\\!\\frac{" + n + "\\pi x}{" + Llabel + "}"); }
      if (needSin) { const b = bn[n - 1].numeric; if (b != null && Math.abs(b) > 1e-12) terms.push(fmtCoeff(b) + "\\sin\\!\\frac{" + n + "\\pi x}{" + Llabel + "}"); }
    }
    const partialSumLatex = "S_{" + N + "}(x) = " + (terms.length ? terms.join(" + ") : "0") + (N > showTerms ? " + \\cdots" : "");

    // ---- Steps
    const pfTex = isFull ? "\\frac{1}{" + Llabel + "}" : "\\frac{2}{" + Llabel + "}";
    const steps = [];
    steps.push({ rule: "The series", latex: seriesLatex });
    if (needCos) {
      steps.push({ rule: "Cosine coefficients",
        latex: "a_0 = " + pfTex + "\\!\\int_{" + (isFull ? "-" + Llabel : "0") + "}^{" + Llabel + "} f(x)\\,dx, \\quad a_n = " + pfTex + "\\!\\int_{" + (isFull ? "-" + Llabel : "0") + "}^{" + Llabel + "} f(x)\\cos\\!\\frac{n\\pi x}{" + Llabel + "}\\,dx" });
    }
    if (needSin) {
      steps.push({ rule: "Sine coefficients",
        latex: "b_n = " + pfTex + "\\!\\int_{" + (isFull ? "-" + Llabel : "0") + "}^{" + Llabel + "} f(x)\\sin\\!\\frac{n\\pi x}{" + Llabel + "}\\,dx" });
    }
    steps.push({ rule: "Compute", latex: "\\text{Simpson's Rule for each } n\\text{; exact forms kept where the integral is elementary}" });

    // Verification: the N-term partial sum approximates f at an interior point where f is
    // continuous (Fourier converges to f there). Loose tolerance — partial sums oscillate.
    let verified = false;
    try {
      const testX = Lnum / 3;
      const ps = partialSumValueAt(a0, an, bn, mode, Lnum, testX, N);
      const fx = fNum(testX);
      if (ps != null && fx != null && Math.abs(ps - fx) < 0.1 * Math.max(1, Math.abs(fx)) + 0.1) verified = true;
    } catch (e) { /* leave unverified */ }

    return {
      ok: true, technique: "fourier-series", mode: mode, L: Lnum, Llabel: Llabel, N: N,
      a0: a0, an: an, bn: bn,
      seriesLatex: seriesLatex, partialSumLatex: partialSumLatex,
      steps: steps, verified: verified
    };
  };

  // Pure partial-sum evaluator from the numeric coefficient arrays — no nerdamer, so it is
  // structured-clone-safe and the page rebuilds it on its side of the worker boundary. Same
  // split solveHeatEquation / heatSeriesValue use.
  function partialSumValueAt(a0, an, bn, mode, Lnum, x, nTerms) {
    const needCos = (mode === "full" || mode === "cosine");
    const needSin = (mode === "full" || mode === "sine");
    let s = 0;
    if (needCos && a0 && a0.numeric != null) s += a0.numeric / 2;
    const K = Math.min(nTerms, needCos ? an.length : bn.length);
    for (let n = 1; n <= K; n++) {
      const arg = (n * Math.PI * x) / Lnum;
      if (needCos) { const a = an[n - 1].numeric; if (a != null) s += a * Math.cos(arg); }
      if (needSin) { const b = bn[n - 1].numeric; if (b != null) s += b * Math.sin(arg); }
    }
    return s;
  }

  CalculusSymbolic.fourierSeriesValue = function (coeffs, mode, L, x, nTerms) {
    const Lnum = (typeof L === "number") ? L : evalNum(String(L));
    return partialSumValueAt(coeffs.a0, coeffs.an, coeffs.bn, mode, Lnum, x, nTerms);
  };

  return CalculusSymbolic;
});
