/* Calculus/CAS shared core — dependency injection + engine-agnostic symbolic helpers.

   Extracted from calculus-symbolic.js so the same verified helpers back every CAS engine
   (Calculus, ODE, and the forthcoming Complex Analysis engine) instead of each re-deriving
   them. Owns the two vendored libraries the whole symbolic stack depends on:

     - nerdamer  (algebra: simplify, toTeX, evaluate)
     - math.js   (expression-tree walking, symbolic derivative, compiled evaluation)

   Nothing here is specific to any one technique. Everything that IS specific — u-sub candidate
   generation, partial-fraction decomposition, Fourier coefficients — stays in its domain module.

   Two callers, one implementation: browser pages/worker pick nerdamer + math.js up from globals
   (or via configure); tests inject them through configure() because the vendored nerdamer bundle
   is not directly require()-able. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CalcCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CalcCore = {};

  let nerdamer = null;
  let mathjs = null;
  let casFacade = null;
  let mathFacade = null;
  let kernelBridge = null;
  let kernelBridgeAttempted = false;

  /* ---------------- input normalization ----------------

     nerdamer has no `ln` function. It parses "ln(x)" as the SYMBOL `ln` MULTIPLIED BY `x`,
     silently, with no error — so ∫ln(x)dx returns (1/2)·ln·x² instead of x·ln(x) − x.

     The differentiate-back gate cannot catch this, and it is important to understand why:
     the integrand misparses the same way the answer does, so the wrong result is internally
     consistent. d/dx[(1/2)·ln·x²] = ln·x, which is exactly the misparsed integrand, and the
     check passes. A verifier that shares a parser with the thing it verifies is blind to
     every parser bug — see validateInput() below for the second half of this fix.

     Rewriting on the way in is exact, not an approximation: nerdamer's log() and math.js's
     one-argument log() are both the NATURAL log, and toTeX() already renders log as \ln, so
     the student sees the notation they typed. The \b prevents rewriting identifiers that
     merely end in "ln" (a variable named "xln"). */
  function normalizeInput(expr) {
    if (typeof expr !== "string") return expr;
    return expr.replace(/\bln\s*\(/g, "log(");
  }
  CalcCore.normalizeInput = normalizeInput;

  /* Every expression string reaching either library goes through normalizeInput first. Doing
     it at the accessor rather than at ~190 individual call sites means a new solver cannot
     forget to do it — the only way to reach nerdamer from a domain module is cas(). */
  function makeCasFacade(nd) {
    const facade = function (expr) {
      const args = Array.prototype.slice.call(arguments);
      args[0] = normalizeInput(expr);
      const result = nd.apply(this, args);
      return guardEvaluate(result);
    };
    // nerdamer carries static helpers (setVar, clear, getCore, ...) that a call site may
    // reach through cas(); copy them so the facade is a drop-in replacement.
    for (const k of Object.keys(nd)) {
      try { facade[k] = nd[k]; } catch (e) { /* non-writable, skip */ }
    }
    facade.__raw = nd;
    return facade;
  }

  // Same idea for math.js: parse/compile/evaluate are the three entry points that accept a
  // raw expression string. Every other member (derivative, matrix, the constants) is copied
  // across so the facade is a drop-in.
  //
  // The copy is FLAT — deliberately not Object.create(mj). math.js resolves some of its own
  // internal calls through the receiver, so an inherited override makes parse() re-enter
  // itself and blow the stack ("Maximum call stack size exceeded" on every expression).
  // A flat own-property copy has no prototype chain to re-enter.
  function makeMathFacade(mj) {
    const facade = {};
    for (const k of Object.keys(mj)) {
      try { facade[k] = mj[k]; } catch (e) { /* non-writable, skip */ }
    }
    facade.parse = function (expr) {
      const args = Array.prototype.slice.call(arguments);
      args[0] = normalizeInput(expr);
      return mj.parse.apply(mj, args);
    };
    facade.compile = function (expr) {
      const args = Array.prototype.slice.call(arguments);
      args[0] = normalizeInput(expr);
      return mj.compile.apply(mj, args);
    };
    facade.evaluate = function (expr) {
      const args = Array.prototype.slice.call(arguments);
      args[0] = normalizeInput(expr);
      return mj.evaluate.apply(mj, args);
    };
    facade.__raw = mj;
    return facade;
  }

  // Injected in Node by the test harness; auto-resolved from globals in the browser.
  CalcCore.configure = function (deps) {
    if (deps && deps.nerdamer) { nerdamer = deps.nerdamer; casFacade = null; }
    if (deps && deps.math) { mathjs = deps.math; mathFacade = null; }
    if (deps && deps.kernelBridge) { kernelBridge = deps.kernelBridge; kernelBridgeAttempted = true; }
  };

  /* The symbolic kernel (docs/kernel/, assets/js/kernel/) is optional and best-effort: a
     missing or unloadable kernel must never break a page that worked before it existed. Node
     resolves it via require() (tests, tests/bench, and this file's own default when nothing
     was injected); the browser Worker resolves it from self.KernelBridge, published once by
     the require-shim loader in cas-worker.js after it loads assets/js/kernel/bridge.js. Any
     failure — kernel absent, load error, wrong environment — is swallowed and cached as
     "unavailable" rather than retried on every call. */
  function kernel() {
    if (kernelBridgeAttempted) return kernelBridge;
    kernelBridgeAttempted = true;
    try {
      if (typeof module === "object" && module.exports && typeof require === "function") {
        kernelBridge = require("./kernel/bridge.js");
      } else if (typeof self !== "undefined" && self.KernelBridge) {
        kernelBridge = self.KernelBridge;
      }
    } catch (e) {
      kernelBridge = null;
    }
    return kernelBridge;
  }
  CalcCore.kernel = kernel;

  // Returns nerdamer, auto-resolving both libraries from globals on first use if configure
  // was never called (the browser path). Throws a clear message if neither is available.
  function cas() {
    if (!nerdamer && typeof self !== "undefined" && self.nerdamer) nerdamer = self.nerdamer;
    if (!mathjs && typeof self !== "undefined" && self.math) mathjs = self.math;
    if (!nerdamer || !mathjs) {
      throw new Error("CalcCore needs nerdamer and math.js — call CalcCore.configure({nerdamer, math}) first.");
    }
    if (!casFacade) casFacade = makeCasFacade(nerdamer);
    return casFacade;
  }
  CalcCore.cas = cas;

  // math.js accessor, same auto-resolve as cas(). Domain modules that walk the parse tree
  // directly (candidate generation, polynomial tests) call this instead of closing over a
  // private mathjs binding, so there is a single source of truth for the injected library.
  CalcCore.math = function () {
    if (!mathjs && typeof self !== "undefined" && self.math) mathjs = self.math;
    if (!mathjs) throw new Error("CalcCore needs math.js — call CalcCore.configure({math}) first.");
    if (!mathFacade) mathFacade = makeMathFacade(mathjs);
    return mathFacade;
  };

  /* ---------------- the independent-parse gate ----------------

     The second half of the ln fix, and the general defence against the whole bug class.

     nerdamer GUESSES on an unrecognised function name: it treats `foo(x)` as the symbol foo
     times x, and returns a confident wrong answer. math.js REFUSES: it throws "Undefined
     function foo". Those two behaviours disagreeing is precisely the signal that the input
     contains something nerdamer is about to silently misread.

     So: parse every user expression with math.js FIRST, and refuse anything it rejects.
     This is an independent parser, not the one being guarded, which is what makes it able to
     catch what the differentiate-back gate structurally cannot. Cheap — one parse per call —
     and it converts a silent wrong answer into an honest error message.

     Returns null when the expression is clean, or a student-readable reason when it is not. */
  function validateInput(expr) {
    if (typeof expr !== "string" || expr.trim() === "") return "Enter an expression.";
    const normalized = normalizeInput(expr);
    let mj;
    try { mj = CalcCore.math(); } catch (e) { return null; } // math.js absent: cannot gate, don't block

    let tree;
    try {
      tree = mj.parse(normalized);
    } catch (e) {
      return `That expression could not be parsed: ${String((e && e.message) || e)}`;
    }

    /* math.js only rejects an unknown function name when it EVALUATES, and evaluating here
       would mean inventing values for the variables and then having to tell a genuine domain
       error apart from a typo. Checking the parse tree instead is exact and side-effect-free:
       a FunctionNode whose name is not a member of the math.js namespace is a name neither
       library can resolve — and it is exactly the shape nerdamer would silently reinterpret
       as "symbol × argument". */
    let unknown = null;
    try {
      tree.traverse(function (node) {
        if (unknown) return;
        if (node.type === "FunctionNode") {
          const name = node.fn && (node.fn.name || String(node.fn));
          if (name && typeof mj[name] !== "function") unknown = name;
        }
      });
    } catch (e) { /* traversal failed: fall through, don't block on a gate bug */ }

    if (unknown) {
      return `"${unknown}" is not a function this engine knows. Check the spelling — write ` +
             `log(x) or ln(x) for the natural log, sqrt(x), abs(x), exp(x), or the ` +
             `trig / inverse-trig names (sin, cos, tan, asin, ...).`;
    }
    return null;
  }
  CalcCore.validateInput = validateInput;

  /* ---------------- global-settings leak guard ----------------

     nerdamer's .evaluate() flips its GLOBAL Settings.PARSE2NUMBER to true for the duration of
     the call and restores it on the way out — but only on the success path. When evaluate()
     throws (a domain error, an unbound symbol — routine here, since evaluate() is how every
     solver probes a candidate), the flag is left true for the rest of the session.

     With PARSE2NUMBER stuck on, nerdamer numericizes every constant it parses afterwards.
     sin(1) stops being sin(1) and becomes 0.8414709848…, which nerdamer then converts to an
     exact rational — so a later, unrelated, perfectly good solve reports

         (342919925/288557167)·y = …        instead of        y = −cos(x)/sin(1) + C

     The bug is invisible when a solver runs alone and appears only after some earlier call
     happened to throw, which is why it survived: the failing input and the wrong answer are
     in different parts of the session, and the test suite that would show it runs the cases
     in isolation. Restoring the flag in a finally block contains it at the one place that
     can leak it. */
  function withSettingsRestored(fn) {
    let settings = null;
    try { settings = cas().getCore().Settings; } catch (e) { /* older build: just run */ }
    if (!settings) return fn();
    const saved = settings.PARSE2NUMBER;
    try {
      return fn();
    } finally {
      settings.PARSE2NUMBER = saved;
    }
  }
  CalcCore.withSettingsRestored = withSettingsRestored;

  /* Wraps .evaluate() on a nerdamer Expression so the flag is restored however the call
     exits. Applied by the cas() facade to every expression it hands out, because there are
     ~20 direct `cas()(...).evaluate(...)` sites across the engines and a rule that each must
     remember to wrap itself is a rule that will be broken by the next solver added. Doing it
     at the one place expressions are created means no call site can bypass it.

     .evaluate() can itself return an Expression (chained calls like .sub().evaluate()), so
     the result is re-wrapped to keep the guarantee across a chain. */
  function guardEvaluate(expr) {
    if (!expr || typeof expr.evaluate !== "function" || expr.__evalGuarded) return expr;
    const original = expr.evaluate;
    try {
      expr.evaluate = function () {
        const args = arguments;
        return withSettingsRestored(() => guardEvaluate(original.apply(this, args)));
      };
      expr.__evalGuarded = true;
    } catch (e) { /* frozen object: hand back the original rather than fail the call */ }
    return expr;
  }

  /* Numeric evaluation of an expression — the convenience entry point. Returns NaN rather
     than throwing, which is the shape the numeric probes throughout the engines want. */
  function evalNum(exprStr, scope) {
    try { return parseFloat(cas()(exprStr).evaluate(scope || {}).text()); }
    catch (e) { return NaN; }
  }
  CalcCore.evalNum = evalNum;

  // nerdamer throws on malformed input for most calls; every wrapper below returns null
  // instead so a failed candidate just gets skipped rather than aborting the whole search.
  function tryStr(fn) {
    try {
      const out = fn();
      const s = out === null || out === undefined ? null : String(out);
      return s === null || s === "" ? null : s;
    } catch (e) {
      return null;
    }
  }
  CalcCore.tryStr = tryStr;

  function toTeX(expr) {
    const tex = tryStr(() => cas()(expr).toTeX());
    // nerdamer's log() is the natural log, but it renders as \mathrm{log} — which in a
    // calculus course reads as log base 10. Every textbook writes this as ln.
    return tex === null ? expr : tex.replace(/\\mathrm\{log\}/g, "\\ln");
  }
  CalcCore.toTeX = toTeX;

  // math.js's node.toString() spaces operators out ("2 + x ^ 3"); round-tripping through
  // nerdamer gives the compact form ("2+x^3") used everywhere else on the site. Display
  // only — the original string is what actually gets substituted.
  function pretty(expr) {
    const s = tryStr(() => cas()(expr).toString());
    return s === null ? expr : s;
  }
  CalcCore.pretty = pretty;

  /* Runs the kernel's rewrite engine (inverse-trig composition, log/exp laws under
     assumption guards, trig identities, double-angle — the Phase 2 rule sets, see
     docs/kernel/04_BUILD_PHASES.md) as a PRE-PASS before nerdamer's own .simplify(), then
     always runs nerdamer's simplify on top. This is additive, never a replacement: the
     documented weak spots of raw nerdamer .simplify() (inverse-trig compose 0/4, canonical
     simplify 6/8 in tests/bench/baseline.js) are exactly the kernel's strong spots, and
     anything the kernel doesn't handle (it refuses rather than guesses — no assumption, no
     combine) still gets nerdamer's pass same as before. assumeFn(ctx), if given, installs
     assumptions before the kernel rewrites; omit it to stay maximally conservative (the
     kernel's own guards, e.g. positivity before combining logs, then do all the deciding). */
  // The kernel canonicalizes natural log to "ln(...)" everywhere (see kernel/printer.js);
  // cas()'s facade already rewrites "ln(" -> "log(" on the way IN (normalizeInput, above), so
  // nerdamer itself never sees raw "ln(". What it does NOT do is the reverse: nerdamer's own
  // output comes back spelled "log(", which breaks the kernel-wide "ln" invariant every other
  // caller of tidy() relies on. This restores it on the way out only — the one direction that
  // was actually missing.
  function logToLn(s) { return s.replace(/\blog\(/g, "ln("); }

  function tidy(exprStr, assumeFn) {
    const k = kernel();
    let expr = null;
    if (k) {
      const simplified = tryStr(() => k.simplify(exprStr, assumeFn));
      if (simplified !== null) {
        try { expr = cas()(simplified); } catch (e) { expr = null; }
      }
    }
    if (!expr) {
      try { expr = cas()(exprStr); } catch (e) { return exprStr; }
    }
    // Chained directly on the already-parsed expression — no reformat-then-reparse round trip.
    const simplifiedStr = tryStr(() => expr.simplify().toString()) || tryStr(() => expr.toString());
    return logToLn(simplifiedStr || exprStr);
  }
  CalcCore.tidy = tidy;

  function varsOf(expr) {
    try {
      return cas()(expr).variables() || [];
    } catch (e) {
      return null;
    }
  }
  CalcCore.varsOf = varsOf;

  /* ---------------- numeric verification ----------------

     Compares two expressions at a spread of sample points. Points where either side is
     undefined (log of a negative, division by zero) are skipped rather than counted as
     disagreement, but at least MIN_HITS usable points must agree or the check fails —
     otherwise an expression that is undefined almost everywhere would "pass" vacuously. */
  const SAMPLE_POINTS = [0.37, 0.61, 0.94, 1.23, 1.58, 2.11, 2.72, 3.35];
  const MIN_HITS = 4;
  const TOL = 1e-7;

  function numericallyEqual(exprA, exprB, variable) {
    let hits = 0;
    for (const x of SAMPLE_POINTS) {
      let a, b;
      // withSettingsRestored: a throw inside evaluate() would otherwise leave nerdamer's
      // global PARSE2NUMBER flipped on, and a point where one side is undefined is the
      // NORMAL case in this loop — see the guard's own comment above.
      try {
        [a, b] = withSettingsRestored(() => [
          parseFloat(cas()(exprA).evaluate({ [variable]: x }).text("decimals")),
          parseFloat(cas()(exprB).evaluate({ [variable]: x }).text("decimals")),
        ]);
      } catch (e) {
        continue;
      }
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      hits++;
      // Relative tolerance, so the check does not get artificially strict on large values.
      if (Math.abs(a - b) > TOL * Math.max(1, Math.abs(a), Math.abs(b))) return false;
    }
    return hits >= MIN_HITS;
  }
  CalcCore.numericallyEqual = numericallyEqual;

  /* ---------------- finite-difference verification ----------------

     fdVerifyAntideriv: checks that an antiderivative's derivative matches the integrand, using
     math.js *numeric finite differences* rather than nerdamer's symbolic diff(). nerdamer's
     diff() is reliable on the log/atan/rational forms that partial fractions emits, but is
     demonstrably WRONG on the √(quadratic) forms that trigonometric substitution produces
     — it drops the asin term's contribution and mishandles sqrt(A*x^2+B). Finite differences
     never ask the CAS to differentiate, only to evaluate, so they are immune to the diff bug.

     symbolicDeriv: math.js's math.derivative does symbolic differentiation correctly on every
     form the engine ships — including the asin/sqrt forms nerdamer's diff gets wrong — so the
     on-page "check by differentiating" line uses this, not nerdamer. */
  const FD_POINTS = [0.21, 0.43, 0.67, 0.91, 1.17, 1.41, 1.63, 1.87];
  const FD_H = 1e-5;
  const FD_TOL = 1e-4;

  function compileFn(str, v) {
    try { return CalcCore.math().parse(str).compile(); } catch (e) { return null; }
  }
  CalcCore.compileFn = compileFn;

  // `points` defaults to FD_POINTS (all near x=0). Pass an explicit domain-appropriate set
  // for integrands that are undefined near 0 — e.g. the |x|>a branch a sec-substitution
  // produces — otherwise every sample is a domain error, `hits` never reaches the floor, and
  // a CORRECT antiderivative is reported as unverifiable. See calculus-symbolic.js
  // trigSubstitution, which is the caller that found this.
  function fdVerifyAntideriv(antiderivStr, integrandStr, v, points) {
    const F = compileFn(antiderivStr, v);
    const g = compileFn(integrandStr, v);
    if (!F || !g) return false;
    let hits = 0;
    for (const x of (points || FD_POINTS)) {
      let fp, gx;
      try {
        const a = F.evaluate({ [v]: x + FD_H });
        const b = F.evaluate({ [v]: x - FD_H });
        fp = (a - b) / (2 * FD_H);
        gx = g.evaluate({ [v]: x });
      } catch (e) { continue; }
      if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
      hits++;
      if (Math.abs(fp - gx) > FD_TOL * Math.max(1, Math.abs(gx))) return false;
    }
    return hits >= 4;
  }
  CalcCore.fdVerifyAntideriv = fdVerifyAntideriv;

  // math.js symbolic derivative as a string. Used for the on-page "check" line because, unlike
  // nerdamer's diff(), it is correct on asin/√(quadratic) forms. Falls back to nerdamer if
  // math.js refuses (it shouldn't, but a graceful fallback beats a thrown step).
  function symbolicDeriv(exprStr, v) {
    try {
      const d = CalcCore.math().derivative(CalcCore.math().parse(exprStr), v);
      return d.toString({ implicit: "hide" });
    } catch (e) {
      return tryStr(() => cas()("diff(" + exprStr + "," + v + ")")) || "";
    }
  }
  CalcCore.symbolicDeriv = symbolicDeriv;

  return CalcCore;
});
