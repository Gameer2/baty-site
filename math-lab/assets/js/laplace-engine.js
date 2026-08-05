/* Laplace Transform engine — Phase 3 of the ODE engine redesign (see
   docs/superpowers/plans/2026-08-02-ode-engine-phase3-laplace.md). Replaces the old
   dsolve()-front-end laplace-transform.js with a real transform/inverse-transform calculator,
   a staged "solve an IVP via Laplace" walkthrough, and a convolution demonstration.

   Depends on ODESolver (detectOrder, toPlaceholdersGeneral, verifyNthOrder,
   withArbitraryConstants, compileRealFx — reused, not reimplemented) and Algorithms
   (runSimpson, for numeric verification of transform integrals). Both must be loaded first. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ode-solver.js"), require("./algorithms.js"));
  } else {
    root.LaplaceEngine = factory(root.ODESolver, root.Algorithms);
  }
})(typeof self !== "undefined" ? self : this, function (ODESolver, Algorithms) {
  "use strict";

  const LaplaceEngine = {};

  const SAMPLE_COEFF_POINT = [1.3743, -0.8123, 0.5417, 2.1934, -1.6822, 0.9271];
  function samplePoint(n) {
    const pt = SAMPLE_COEFF_POINT.slice(0, n + 1);
    while (pt.length < n + 1) pt.push(1 + pt.length * 0.6180339887);
    return pt;
  }

  // x samples used to (a) confirm each coefficient is constant rather than a function of x (as
  // in x*y''), and (b) make forcing terms cancel when a coefficient is taken as a difference of two
  // evaluations at the same x.
  const X_SAMPLES = [0.37, 1.29, 2.13];

  // Puts a linear ODE in standard form a_n y^(n) + ... + a_0 y = f(x) and returns {order, coeffs,
  // rhsText}. Substitutes y/y'/y''/... -> Y0/Y1/Y2/... on BOTH sides via ODESolver.toPlaceholdersGeneral
  // and works with E = (LHS) - (RHS), so y-terms typed on either side (e.g. "y' = -2*y + ...") end
  // up on the left. The coefficient of Yk is E(Yk=1, others=0, x) - E(0, x) -- the forcing
  // (functions of x only) is present in both and cancels, so the difference is the pure
  // coefficient, which must agree at every x sample for a constant-coefficient equation. A
  // random-Y affine check then catches nonlinearity (y^2, y*y', ...), and the forcing f(x) =
  // -E(0, x) is recovered symbolically by zeroing every Yk node and simplifying, so the returned
  // rhsText never carries a stray y that would corrupt the downstream transform-of-derivative solve.
  function extractLinearCoeffs(equationText) {
    const order = ODESolver.detectOrder(equationText);
    if (order === 0) return { ok: false, reason: "Couldn't find a y', y'', ... term — this doesn't look like an ODE." };

    const parts = equationText.split("=");
    const lhsRaw = ODESolver.toPlaceholdersGeneral(parts[0]);
    const rhsRaw = ODESolver.toPlaceholdersGeneral(parts.length > 1 ? parts[1] : "0");
    const exprText = `(${lhsRaw}) - (${rhsRaw})`;

    // compileRealFx (not raw math.compile) so DiracDelta/Heaviside/log evaluate instead of
    // throwing -- the same reason every other numeric check on this site goes through it.
    const compiled = ODESolver.compileRealFx(exprText);
    if (!compiled.ok) return { ok: false, reason: "Couldn't parse the equation." };
    function evalAt(values, xVal) {
      const scope = { x: xVal };
      for (let k = 0; k <= order; k++) scope["Y" + k] = values[k];
      return compiled.fn(scope);
    }

    // Coefficient of Yk = E(basis_k, x) - E(0, x), forcing cancels. Must be identical across x
    // samples -- a varying value means the coefficient is itself a function of x (e.g. x*y''),
    // which the transform-of-derivative property doesn't apply to.
    const coeffsByDegree = []; // index k = coefficient of Y_k, i.e. [a_0, a_1, ..., a_n]
    const zeroVec = new Array(order + 1).fill(0);
    for (let k = 0; k <= order; k++) {
      const basis = new Array(order + 1).fill(0);
      basis[k] = 1;
      const vals = [];
      for (const xVal of X_SAMPLES) {
        let bv, zv;
        try { bv = evalAt(basis, xVal); zv = evalAt(zeroVec, xVal); } catch (e) {
          return { ok: false, reason: "Couldn't evaluate the equation — check the syntax of all terms." };
        }
        if (typeof bv !== "number" || !Number.isFinite(bv) || typeof zv !== "number" || !Number.isFinite(zv)) {
          return { ok: false, reason: "This isn't a constant-coefficient linear equation — the Laplace transform method doesn't apply." };
        }
        vals.push(bv - zv);
      }
      if (!vals.every((v) => Math.abs(v - vals[0]) < 1e-9)) {
        return { ok: false, reason: "This isn't a constant-coefficient linear equation — the Laplace transform method doesn't apply." };
      }
      coeffsByDegree.push(vals[0]);
    }

    // Affine-in-Y cross-check: E(randY, x) must equal sum_k coeff_k * randY_k + E(0, x) at every
    // x sample. Catches nonlinear terms (y^2, y*y', ...) the per-coefficient probe above can't.
    const randomPoint = samplePoint(order);
    for (const xVal of X_SAMPLES) {
      let rv, zv;
      try { rv = evalAt(randomPoint, xVal); zv = evalAt(zeroVec, xVal); } catch (e) {
        return { ok: false, reason: "Couldn't evaluate the equation's left-hand side." };
      }
      if (typeof rv !== "number" || !Number.isFinite(rv) || typeof zv !== "number" || !Number.isFinite(zv)) {
        return { ok: false, reason: "This isn't a constant-coefficient linear equation — the Laplace transform method doesn't apply." };
      }
      const expected = coeffsByDegree.reduce((sum, c, k) => sum + c * randomPoint[k], 0) + zv;
      if (Math.abs(rv - expected) > 1e-6 * Math.max(1, Math.abs(expected))) {
        return { ok: false, reason: "This isn't a constant-coefficient linear equation — the Laplace transform method doesn't apply." };
      }
    }

    // Recover the forcing f(x) = -E(0, x) as an expression string: zero every Yk node in the
    // parsed tree and simplify, leaving only the x-dependent terms, then negate (E = 0 means
    // the y-terms equal -forcing). Symbolic -- never evaluated -- so DiracDelta/Heaviside survive
    // as function nodes, exactly what _laplace_solve_ivp's sympify expects.
    let rhsText;
    try {
      const node = math.parse(exprText);
      const zeroed = node.transform(function (n) {
        if (n.isSymbolNode && /^Y\d+$/.test(n.name)) return new math.ConstantNode(0);
        return n;
      });
      const forcing = math.simplify(zeroed);
      rhsText = math.simplify(math.parse("-(" + forcing.toString() + ")")).toString();
    } catch (e) {
      return { ok: false, reason: "Couldn't isolate the forcing term on the right-hand side." };
    }

    const coeffs = coeffsByDegree.slice().reverse(); // [a_n, ..., a_0]
    return { ok: true, order, coeffs, rhsText };
  }
  LaplaceEngine.extractLinearCoeffs = extractLinearCoeffs;

  // Truncated improper integral: exp(-s*x) decays fast enough by x=T for every function this
  // course's material produces (polynomial/exponential/trig/step growth, never worse than
  // exponential) that the tail past T is negligible relative to the 5% tolerance used below.
  const QUAD_T = 25;
  const QUAD_N = 500;
  const SAMPLE_S = [1, 1.5, 2, 2.5, 3];

  function definiteLaplaceIntegral(fFn, sVal) {
    const integrand = (xVal) => fFn({ x: xVal }) * Math.exp(-sVal * xVal);
    return Algorithms.runSimpson(integrand, 0, QUAD_T, QUAD_N, "auto").total;
  }

  // Verifies f(x) <-> F(s) by comparing the definition (numeric truncated integral) against F(s)
  // evaluated directly, at a quorum of sample s. Symmetric by construction: the caller decides
  // which side is "the candidate" by choosing what to pass as fText vs FText.
  function verifyTransformPair(fText, FText) {
    if (fText.includes("DiracDelta") || FText.includes("DiracDelta")) return null; // not Riemann-integrable — caller must handle this case separately
    const fCompiled = ODESolver.compileRealFx(fText);
    const FCompiled = ODESolver.compileRealFx(FText);
    if (!fCompiled.ok || !FCompiled.ok) return false;

    let usable = 0;
    for (const sVal of SAMPLE_S) {
      let integralVal, directVal;
      try {
        integralVal = definiteLaplaceIntegral(fCompiled.fn, sVal);
        directVal = FCompiled.fn({ s: sVal });
      } catch (e) { continue; }
      if (![integralVal, directVal].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(integralVal - directVal) > 5e-2 * Math.max(1, Math.abs(directVal))) return false;
    }
    return usable >= 3;
  }
  LaplaceEngine.verifyTransformPair = verifyTransformPair;

  const SAMPLE_X = [0.8, 1.5, 2.3, 3.1, 4.0];

  // Direct convolution integral (f*g)(x) = integral_0^x f(tau) g(x-tau) d(tau) — a PROPER
  // integral (finite bounds, no truncation needed, unlike the transform-pair check above).
  function convolutionIntegral(fFn, gFn, xVal) {
    const integrand = (tau) => fFn({ x: tau }) * gFn({ x: xVal - tau });
    return Algorithms.runSimpson(integrand, 0, xVal, 200, "auto").total;
  }

  function verifyConvolution(fText, gText, convResultText) {
    const fCompiled = ODESolver.compileRealFx(fText);
    const gCompiled = ODESolver.compileRealFx(gText);
    const resultCompiled = ODESolver.compileRealFx(convResultText);
    if (!fCompiled.ok || !gCompiled.ok || !resultCompiled.ok) return false;

    let usable = 0;
    for (const xVal of SAMPLE_X) {
      let integralVal, directVal;
      try {
        integralVal = convolutionIntegral(fCompiled.fn, gCompiled.fn, xVal);
        directVal = resultCompiled.fn({ x: xVal });
      } catch (e) { continue; }
      if (![integralVal, directVal].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(integralVal - directVal) > 5e-2 * Math.max(1, Math.abs(directVal))) return false;
    }
    return usable >= 3;
  }
  LaplaceEngine.verifyConvolution = verifyConvolution;

  // ---- IVP trajectory verification --------------------------------------------------------
  // verifyNthOrder-style pointwise ODE substitution (see ode-solver.js) is NOT sufficient for a
  // Laplace IVP answer: that answer is a PARTICULAR solution (initial conditions already baked
  // in, no free C1/C2 left), and pointwise substitution only checks that a candidate satisfies
  // the DIFFERENTIAL EQUATION somewhere -- it never checks that it satisfies the SPECIFIC
  // initial conditions given, or that it's continuous through a jump/impulse the right way
  // rather than some other way. (Confirmed: for y''+y=Heaviside(x-3), y(0)=0, y'(0)=0, the
  // answer "(1-cos(x))*Heaviside(x-3)" -- missing the x-3 shift -- passes pointwise
  // verification, because 1-cos(x) is ALSO a valid solution of Y''+Y=1, just not the one that
  // continues from the correct pre-jump state.) The fix: numerically integrate the ORIGINAL
  // system forward from the given initial conditions (RK4, exact jump condition applied at each
  // Dirac impulse) and compare the candidate against that unique, IC-correct trajectory instead.

  // Extracts {location, magnitude} for each isolated DiracDelta(x - a) term in a forcing text,
  // e.g. "3*DiracDelta(x-2)" -> [{location: 2, magnitude: 3}]. A DiracDelta term can't be
  // evaluated pointwise (it's a distribution, not a function) -- ODESolver.compileRealFx already
  // treats it as 0 for the "regular" part of the forcing, so its actual effect (a jump in the
  // (order-1)th derivative) has to be applied explicitly during integration instead.
  function extractDiracImpulses(rhsText) {
    const impulses = [];
    const re = /([\d.]+\s*\*\s*)?DiracDelta\(\s*x\s*([+-])\s*([\d.]+)\s*\)/g;
    let m;
    while ((m = re.exec(rhsText))) {
      const magnitude = m[1] ? parseFloat(m[1]) : 1;
      const location = m[2] === "-" ? parseFloat(m[3]) : -parseFloat(m[3]);
      impulses.push({ location, magnitude });
    }
    return impulses;
  }
  LaplaceEngine.extractDiracImpulses = extractDiracImpulses;

  // Same idea, for Heaviside(x - a) terms -- these ARE ordinary evaluable functions (just a 0/1
  // step), so they don't need a jump condition; their location only matters for choosing sample
  // points that actually straddle the step.
  function extractHeavisideLocations(rhsText) {
    const locations = [];
    const re = /Heaviside\(\s*x\s*([+-])\s*([\d.]+)\s*\)/g;
    let m;
    while ((m = re.exec(rhsText))) {
      const val = parseFloat(m[2]);
      locations.push(m[1] === "-" ? val : -val);
    }
    return locations;
  }
  LaplaceEngine.extractHeavisideLocations = extractHeavisideLocations;

  // Reduces a_n y^(n) + ... + a_0 y = rhsFn(x) to a first-order system and integrates forward
  // via RK4, applying each Dirac impulse's standard jump condition (the (n-1)th derivative
  // jumps by magnitude/a_n) exactly at its location -- segment by segment, so no RK4 step ever
  // straddles a genuine discontinuity. coeffs: [a_n, ..., a_0]. state0: [y(x0), y'(x0), ...].
  function integrateLinearODE(coeffs, rhsFn, diracImpulses, x0, state0, xTarget, stepsPerUnit) {
    const n = coeffs.length - 1;
    const aN = coeffs[0];
    function deriv(x, state) {
      const d = new Array(n);
      for (let k = 0; k < n - 1; k++) d[k] = state[k + 1];
      let sum = rhsFn(x);
      for (let k = 0; k < n; k++) sum -= coeffs[n - k] * state[k];
      d[n - 1] = sum / aN;
      return d;
    }
    function rk4Step(x, state, h) {
      const k1 = deriv(x, state);
      const k2 = deriv(x + h / 2, state.map((v, j) => v + (h / 2) * k1[j]));
      const k3 = deriv(x + h / 2, state.map((v, j) => v + (h / 2) * k2[j]));
      const k4 = deriv(x + h, state.map((v, j) => v + h * k3[j]));
      return state.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    const boundaries = [x0, ...diracImpulses.map((d) => d.location).filter((a) => a > x0 && a < xTarget).sort((a, b) => a - b), xTarget];
    let x = x0;
    let state = state0.slice();
    const path = [{ x, state: state.slice() }];
    for (let seg = 0; seg < boundaries.length - 1; seg++) {
      const segStart = boundaries[seg], segEnd = boundaries[seg + 1];
      if (segEnd <= segStart) continue;
      const segSteps = Math.max(1, Math.round((segEnd - segStart) * stepsPerUnit));
      const h = (segEnd - segStart) / segSteps;
      for (let i = 0; i < segSteps; i++) {
        state = rk4Step(x, state, h);
        x += h;
        path.push({ x, state: state.slice() });
      }
      if (seg < boundaries.length - 2) {
        const impulse = diracImpulses.find((d) => Math.abs(d.location - segEnd) < 1e-6);
        if (impulse) state[n - 1] += impulse.magnitude / aN;
      }
    }
    return path;
  }
  LaplaceEngine.integrateLinearODE = integrateLinearODE;

  // Verifies a candidate y(x) against a forward numeric integration of the ORIGINAL system from
  // the GIVEN initial conditions -- catches wrong particular-solution choices (right ODE, wrong
  // IC-matching/continuity) that pointwise substitution alone cannot.
  function verifyIvpTrajectory(coeffs, rhsText, icsList, order, candidateYText) {
    const rhsCompiled = ODESolver.compileRealFx(rhsText);
    const candidateCompiled = ODESolver.compileRealFx(candidateYText);
    if (!rhsCompiled.ok || !candidateCompiled.ok) return false;
    const impulses = extractDiracImpulses(rhsText);
    const state0 = icsList.map(Number);
    if (state0.length !== order || !state0.every(Number.isFinite)) return false;
    const jumpLocations = impulses.map((d) => d.location).concat(extractHeavisideLocations(rhsText));
    const maxJump = jumpLocations.length ? Math.max(...jumpLocations) : 0;
    const xTarget = Math.max(6, maxJump + 3);

    let path;
    try {
      path = integrateLinearODE(coeffs, (x) => rhsCompiled.fn({ x }), impulses, 0, state0, xTarget, 40);
    } catch (e) { return false; }

    const targets = new Set();
    for (const frac of [0.15, 0.35, 0.6, 0.85]) targets.add(xTarget * frac);
    for (const loc of jumpLocations) { targets.add(loc + 0.3); targets.add(loc + 1.0); }

    let usable = 0;
    for (const t of targets) {
      if (t <= 0 || t > xTarget) continue;
      let closest = path[0];
      for (const p of path) if (Math.abs(p.x - t) < Math.abs(closest.x - t)) closest = p;
      const trueY = closest.state[0];
      let candY;
      try { candY = candidateCompiled.fn({ x: closest.x }); } catch (e) { continue; }
      if (!Number.isFinite(candY) || !Number.isFinite(trueY)) continue;
      usable++;
      if (Math.abs(candY - trueY) > 5e-2 * Math.max(1, Math.abs(trueY))) return false;
    }
    return usable >= 3;
  }
  LaplaceEngine.verifyIvpTrajectory = verifyIvpTrajectory;

  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  // Same throw-safe math.js -> LaTeX conversion as ODESymbolic.toLatex, kept local rather than
  // pulling in ODESymbolic as a third dependency just for this one call -- laplace-engine.js
  // already implicitly requires a global `math` (ODESolver.compileRealFx uses it too).
  function toLatexSafe(exprStr) {
    try { return math.parse(exprStr).toTex({ parenthesis: "auto" }); }
    catch (e) { return exprStr; }
  }

  // Python's str(sp.Eq(lhs, rhs)) always looks like "Eq(<lhs>, <rhs>)". math.js can't parse a
  // bare "lhs = rhs" as one expression either (it reads "=" as assignment, which throws unless
  // the left side is a plain variable name) -- so each side has to be converted to LaTeX
  // SEPARATELY and joined with "=" afterward, not textually joined first and parsed as a whole.
  // Splits at the top-level comma (paren-depth-aware, since lhs/rhs can themselves contain
  // commas inside nested function calls).
  function formatEqAsEquation(eqText) {
    const m = eqText.match(/^Eq\((.*)\)$/s);
    if (!m) return toLatexSafe(eqText);
    const inner = m[1];
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === "," && depth === 0) {
        const lhs = inner.slice(0, i).trim();
        const rhs = inner.slice(i + 1).trim();
        return toLatexSafe(lhs) + " = " + toLatexSafe(rhs);
      }
    }
    return toLatexSafe(eqText);
  }
  LaplaceEngine.formatEqAsEquation = formatEqAsEquation;

  LaplaceEngine.transformOf = function (fText) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The transform engine isn't available on this page." });
    }
    return SympyClient.laplaceTransform(fText)
      .then((out) => {
        // _laplace_transform_of returns a bare string (not JSON) -- resultText IS the answer.
        const clean = normalizeSympyText(out.resultText);
        if (fText.includes("DiracDelta") || clean.includes("DiracDelta")) {
          return { ok: true, result: clean, distributional: true, verified: false };
        }
        const verified = verifyTransformPair(fText, clean);
        if (verified === false) {
          return { ok: false, reason: "SymPy returned a transform, but it did not independently verify against the defining integral — refusing to show a result this site cannot confirm." };
        }
        return { ok: true, result: clean, distributional: false, verified: true };
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };

  LaplaceEngine.inverseOf = function (FText) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The transform engine isn't available on this page." });
    }
    return SympyClient.inverseLaplaceTransform(FText)
      .then((out) => {
        // _inverse_laplace_transform_of returns a bare string (not JSON) -- resultText IS the answer.
        const clean = normalizeSympyText(out.resultText);
        if (FText.includes("DiracDelta") || clean.includes("DiracDelta")) {
          return { ok: true, result: clean, distributional: true, verified: false };
        }
        // Round-trip: forward-transform the CANDIDATE f(x) and compare to the ORIGINAL F(s).
        const verified = verifyTransformPair(clean, FText);
        if (verified === false) {
          return { ok: false, reason: "SymPy returned an inverse transform, but forward-transforming it did not reproduce the original F(s) — refusing to show a result this site cannot confirm." };
        }
        return { ok: true, result: clean, distributional: false, verified: true };
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };

  LaplaceEngine.solveIvp = function (equationText, icsList) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The transform engine isn't available on this page." });
    }
    const extracted = extractLinearCoeffs(equationText);
    if (!extracted.ok) return Promise.resolve(extracted);
    if (!icsList || icsList.length !== extracted.order) {
      return Promise.resolve({ ok: false, reason: `This equation needs ${extracted.order} initial condition(s) — the Laplace transform method requires them.` });
    }
    return SympyClient.laplaceSolveIvp(extracted.coeffs, extracted.rhsText, icsList.map(String))
      .then((out) => {
        const parsed = JSON.parse(out.resultText);
        const yx = normalizeSympyText(parsed.y_x);
        // A candidate that still contains a literal DiracDelta term is structurally wrong on
        // its face -- the solution to a well-posed IVP is never itself a distribution, only the
        // FORCING can be. Catch this before spending time integrating.
        if (yx.includes("DiracDelta")) {
          return { ok: false, reason: "SymPy's inverse transform still contains an unresolved impulse term — refusing to show a result this site cannot confirm." };
        }
        // verifyNthOrder-style pointwise substitution can't tell a correct particular solution
        // from a wrong one that happens to satisfy the same differential equation elsewhere
        // (see verifyIvpTrajectory's own comment) -- forward-integrate from the actual given
        // initial conditions instead, which is the only check that's actually decisive here.
        if (!verifyIvpTrajectory(extracted.coeffs, extracted.rhsText, icsList, extracted.order, yx)) {
          return { ok: false, reason: "SymPy returned an answer, but it did not independently verify against the original equation and initial conditions — refusing to show a result this site cannot confirm." };
        }
        return {
          ok: true,
          order: extracted.order,
          sDomainEq: formatEqAsEquation(normalizeSympyText(parsed.s_domain_eq)),
          Ys: normalizeSympyText(parsed.Y_s),
          result: yx,
          verified: true,
        };
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };

  LaplaceEngine.convolutionOf = function (fText, gText) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The transform engine isn't available on this page." });
    }
    return SympyClient.laplaceConvolution(fText, gText)
      .then((out) => {
        const parsed = JSON.parse(out.resultText);
        const result = normalizeSympyText(parsed.conv_result);
        if (!verifyConvolution(fText, gText, result)) {
          return { ok: false, reason: "SymPy returned a convolution result, but it did not independently verify against the direct convolution integral — refusing to show a result this site cannot confirm." };
        }
        return {
          ok: true,
          F: normalizeSympyText(parsed.F),
          G: normalizeSympyText(parsed.G),
          product: normalizeSympyText(parsed.product),
          result,
          verified: true,
        };
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };

  return LaplaceEngine;
});