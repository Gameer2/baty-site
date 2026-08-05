# ODE Engine Phase 3 — Laplace Transform Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `laplace-transform.html` — a themed front end over generic
`dsolve()` — with a real Laplace Transform engine: a standalone transform/inverse-transform
calculator, a fully staged "solve an IVP via Laplace" walkthrough (any order), and a convolution
demonstration. Retire the scaffolding this replaces (`sympy-dsolve-fallback.js` and the
`ODESymbolic` parsing helpers only it used).

**Architecture:** Four new SymPy worker ops do the actual transform-domain algebra (forward
transform, inverse transform, the staged IVP solve via the transform-of-derivative property, and
convolution). A new pure-JS module (`laplace-engine.js`) extracts constant-linear coefficients
from typed equations (reusing the same numeric-sampling technique `ode-direction-fields.js`'s
`detectLinear` already uses), and independently verifies every result numerically before it's
shown — reusing `ODESolver.verifyNthOrder`/`compileRealFx`/`withArbitraryConstants` directly, plus
`Algorithms.runSimpson` for the transform/convolution integral checks. A rewritten page wires
three sections to this module.

Full design rationale: `docs/superpowers/specs/2026-08-02-ode-engine-phase3-laplace-design.md`.

**Tech Stack:** Same as Phase 1/2 — vanilla JS (UMD modules, no build step), SymPy via Pyodide,
math.js, existing site CSS/KaTeX/Plotly conventions.

## Global Constraints

- No build step — plain `<script defer>` includes.
- Every returned result MUST be independently verified by numeric substitution/integration
  before being shown; a verification failure produces an honest refusal, never a guessed result.
  The one deliberate exception: `DiracDelta`-containing transforms are shown with an explicit
  "not independently verified (distributional)" label — a Dirac delta isn't Riemann-integrable,
  so numeric quadrature verification is mathematically impossible, not merely skipped for
  convenience.
- The independent variable is `x` (transform variable `s`), matching this codebase's existing
  convention — the current Laplace page already writes `Heaviside(x-1)`, not `Heaviside(t-1)`.
- The Pyodide/SymPy worker cannot be exercised from the Node test suite — Python-side changes are
  verified manually in a real browser, exactly like every other worker op.
- The IVP walkthrough handles constant-coefficient linear equations only (the only case the
  transform-of-derivative property applies to) — `extractLinearCoeffs` must refuse honestly,
  not silently misfire, on anything else.
- Reuse, don't duplicate: `ODESolver.detectOrder`/`verifyNthOrder`/`withArbitraryConstants`/
  `compileRealFx`/`toPlaceholdersGeneral` and `Algorithms.runSimpson` are reused directly.
- Dead-code cleanup is part of this phase, not deferred: `sympy-dsolve-fallback.js`, the
  `dsolveFirstOrder`/`dsolveSecondOrder`/`dsolveSecondOrderGeneral` worker ops + Python functions,
  and `ODESymbolic.isSecondOrderInput`/`parseSecondOrder`/`rhsFromInput` all become unreachable
  once this page stops calling them (verified via grep — no other caller exists) — delete them,
  don't leave them as unreferenced dead weight.

---

### Task 1: Four new SymPy worker ops

**Files:**
- Modify: `assets/js/sympy-worker.js`

**Interfaces:**
- Produces: `laplaceTransform`, `inverseLaplaceTransform`, `laplaceSolveIvp`,
  `laplaceConvolution` worker ops (details below).
- Consumes: nothing from other tasks.

Not Node-testable (no `pyodide` npm package) — sanity-checked directly against a local `sympy`
install below, then verified manually in-browser in Task 9.

- [ ] **Step 1: Add the four Python functions**

Find `_dsolve_general` and add these four functions directly after `_series_solution` (search
for `def _series_solution` and its matching `return json.dumps(...)` to find the end of that
function; insert after it):

```python
_LAPLACE_LOCALS_X = {"e": sp.E, "x": sp.symbols('x'), "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}
_LAPLACE_LOCALS_S = {"e": sp.E, "s": sp.symbols('s'), "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}

def _laplace_transform_of(expr_text):
    x, s = sp.symbols('x s', positive=True)
    try:
        expr = sp.sympify(expr_text, locals=_LAPLACE_LOCALS_X)
    except Exception as ex:
        raise ValueError("Couldn't parse this expression: " + str(ex))
    try:
        F = sp.laplace_transform(expr, x, s, noconds=True)
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form transform for this: " + str(ex))
    return str(sp.simplify(F))

def _inverse_laplace_transform_of(expr_text):
    x, s = sp.symbols('x s', positive=True)
    try:
        expr = sp.sympify(expr_text, locals=_LAPLACE_LOCALS_S)
    except Exception as ex:
        raise ValueError("Couldn't parse this expression: " + str(ex))
    try:
        f = sp.inverse_laplace_transform(expr, s, x)
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form inverse transform for this: " + str(ex))
    return str(sp.simplify(f))

def _laplace_solve_ivp(coeffs, rhs_text, ics_list):
    # coeffs: [a_n, ..., a_0] (highest order first, as typed left-to-right). ics_list:
    # [y(0), y'(0), ..., y^(n-1)(0)] as strings. Builds the s-domain equation via the
    # transform-of-derivative property L{y^(k)} = s^k*Y - sum_{j=0}^{k-1} s^(k-1-j)*y^(j)(0) —
    # the literal definition, not a per-case branch — solves algebraically for Y(s), then
    # inverse-transforms. Returns all three stages for the worked-walkthrough display.
    x, s = sp.symbols('x s', positive=True)
    Y = sp.symbols('Y')
    n = len(coeffs) - 1

    def laplace_deriv(order, y0_list):
        expr = s**order * Y
        for k in range(order):
            expr -= s**(order - 1 - k) * y0_list[k]
        return expr

    try:
        y0_list = [sp.sympify(v) for v in ics_list]
        rhs = sp.sympify(rhs_text, locals=_LAPLACE_LOCALS_X)
        coeff_syms = [sp.sympify(str(c)) for c in coeffs]
    except Exception as ex:
        raise ValueError("Couldn't parse the equation: " + str(ex))

    lhs_s = sum(coeff_syms[n - k] * laplace_deriv(k, y0_list) for k in range(n + 1))
    try:
        rhs_s = sp.laplace_transform(rhs, x, s, noconds=True)
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form transform for the right-hand side: " + str(ex))
    eq = sp.Eq(lhs_s, rhs_s)

    sols = sp.solve(eq, Y)
    if not sols:
        raise ValueError("Could not solve the transformed equation for Y(s).")
    Y_sol = sp.simplify(sols[0])
    try:
        y_x = sp.simplify(sp.inverse_laplace_transform(Y_sol, s, x))
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form inverse transform for Y(s): " + str(ex))

    return json.dumps({"s_domain_eq": str(eq), "Y_s": str(Y_sol), "y_x": str(y_x)})

def _laplace_convolution(f_text, g_text):
    x, s = sp.symbols('x s', positive=True)
    try:
        f = sp.sympify(f_text, locals=_LAPLACE_LOCALS_X)
        g = sp.sympify(g_text, locals=_LAPLACE_LOCALS_X)
    except Exception as ex:
        raise ValueError("Couldn't parse f(x) or g(x): " + str(ex))
    F = sp.laplace_transform(f, x, s, noconds=True)
    G = sp.laplace_transform(g, x, s, noconds=True)
    product = sp.simplify(F * G)
    try:
        conv_result = sp.simplify(sp.inverse_laplace_transform(product, s, x))
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form inverse transform for F(s)*G(s): " + str(ex))
    return json.dumps({"F": str(F), "G": str(G), "product": str(product), "conv_result": str(conv_result)})
```

- [ ] **Step 2: Register the four ops**

Find the ops dispatcher entry for `dsolveSystem` (search for `dsolveSystem: async`) and add
these four entries directly after it:

```javascript
  laplaceTransform: async (pyodide, args) => {
    const [exprText] = args;
    return pyodide.runPython(`_laplace_transform_of(${JSON.stringify(exprText)})`);
  },
  inverseLaplaceTransform: async (pyodide, args) => {
    const [exprText] = args;
    return pyodide.runPython(`_inverse_laplace_transform_of(${JSON.stringify(exprText)})`);
  },
  laplaceSolveIvp: async (pyodide, args) => {
    const [coeffs, rhsText, icsList] = args;
    return pyodide.runPython(
      `_laplace_solve_ivp(${JSON.stringify(coeffs.map(String))}, ${JSON.stringify(rhsText)}, ${JSON.stringify(icsList)})`
    );
  },
  laplaceConvolution: async (pyodide, args) => {
    const [fText, gText] = args;
    return pyodide.runPython(`_laplace_convolution(${JSON.stringify(fText)}, ${JSON.stringify(gText)})`);
  },
```

- [ ] **Step 3: Sanity-check against a local `sympy` install**

Run (adjust nothing — this exact script was already verified during design):

```bash
python3 -c "
import sympy as sp, json
x, s = sp.symbols('x s', positive=True)
print(sp.laplace_transform(sp.Heaviside(x-2), x, s, noconds=True))
print(sp.inverse_laplace_transform(1/(s+2), s, x))
"
```

Expected: `exp(-2*s)/s` then `exp(-2*x)`.

- [ ] **Step 4: Commit**

```bash
git add assets/js/sympy-worker.js
git commit -m "feat(laplace): add laplaceTransform/inverseLaplaceTransform/laplaceSolveIvp/laplaceConvolution ops"
```

---

### Task 2: SympyClient wrappers

**Files:**
- Modify: `assets/js/sympy-client.js`

**Interfaces:**
- Consumes: the four ops from Task 1.
- Produces: `SympyClient.laplaceTransform(exprText, opts)`,
  `SympyClient.inverseLaplaceTransform(exprText, opts)`,
  `SympyClient.laplaceSolveIvp(coeffs, rhsText, icsList, opts)`,
  `SympyClient.laplaceConvolution(fText, gText, opts)` — all Promises resolving to
  `{ resultText }`.

- [ ] **Step 1: Add the four wrappers**

Find `SympyClient.dsolveSystem` (search for `SympyClient.dsolveSystem = function`) and add
directly after its closing `};`:

```javascript
  // .laplaceTransform / .inverseLaplaceTransform / .laplaceSolveIvp / .laplaceConvolution
  // (laplace-engine.js) — Phase 3 of the ODE engine redesign, the real Laplace Transform
  // engine replacing the old dsolve()-front-end laplace-transform.js.
  SympyClient.laplaceTransform = function (exprText, opts) {
    return SympyClient.call("laplaceTransform", [exprText], opts);
  };
  SympyClient.inverseLaplaceTransform = function (exprText, opts) {
    return SympyClient.call("inverseLaplaceTransform", [exprText], opts);
  };
  SympyClient.laplaceSolveIvp = function (coeffs, rhsText, icsList, opts) {
    return SympyClient.call("laplaceSolveIvp", [coeffs, rhsText, icsList || []], opts);
  };
  SympyClient.laplaceConvolution = function (fText, gText, opts) {
    return SympyClient.call("laplaceConvolution", [fText, gText], opts);
  };
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/sympy-client.js
git commit -m "feat(laplace): add SympyClient wrappers for the four new ops"
```

---

### Task 3: Export `ODESolver.toPlaceholdersGeneral`

**Files:**
- Modify: `assets/js/ode-solver.js`
- Modify: `tests/verify-ode-solver.js`

**Interfaces:**
- Produces: `ODESolver.toPlaceholdersGeneral(equationText)` — already used internally by
  `verifyNthOrder`, now also exposed for `laplace-engine.js`'s `extractLinearCoeffs` to reuse.

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-ode-solver.js`, after the `compileRealFx` block:

```javascript
console.log("\ntoPlaceholdersGeneral — exported for reuse by laplace-engine.js:");
ok(typeof ODESolver.toPlaceholdersGeneral === "function", "toPlaceholdersGeneral is exported");
ok(ODESolver.toPlaceholdersGeneral("y'' + 3*y' + 2*y") === "Y2 + 3*Y1 + 2*Y0", "converts y, y', y'' to Y0, Y1, Y2");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-solver.js`
Expected: FAIL on `toPlaceholdersGeneral is exported`.

- [ ] **Step 3: Export it**

In `assets/js/ode-solver.js`, find `function toPlaceholdersGeneral(s) {` and directly after its
closing `}`, add:

```javascript
  // Exposed for direct reuse by laplace-engine.js (Phase 3) — extracting a linear equation's
  // constant coefficients needs the exact same y/y'/y'' -> Y0/Y1/Y2 substitution.
  ODESolver.toPlaceholdersGeneral = toPlaceholdersGeneral;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-solver.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-solver.js tests/verify-ode-solver.js
git commit -m "refactor(ode): export ODESolver.toPlaceholdersGeneral for reuse by the Laplace engine"
```

---

### Task 4: `laplace-engine.js` — `extractLinearCoeffs`

**Files:**
- Create: `assets/js/laplace-engine.js`
- Test: `tests/verify-laplace-engine.js`

**Interfaces:**
- Consumes: `ODESolver.detectOrder`, `ODESolver.toPlaceholdersGeneral` (Task 3).
- Produces: `LaplaceEngine.extractLinearCoeffs(equationText)` — returns
  `{ ok: true, order, coeffs, rhsText }` (`coeffs`: `number[]` of length `order+1`, `[a_n, ...,
  a_0]`, highest order first) or `{ ok: false, reason }`.

- [ ] **Step 1: Write the failing test**

Create `tests/verify-laplace-engine.js`:

```javascript
"use strict";
/* laplace-engine.js verification — Phase 3 of the ODE engine redesign.
   extractLinearCoeffs, verifyTransformPair, and verifyConvolution are pure JS (no Pyodide), so
   they're fully Node-testable. transformOf/inverseOf/solveIvp/convolutionOf themselves call
   SympyClient, which needs a real Worker + Pyodide — NOT unit tested here; verified manually in
   a browser (see the plan's Task 9). */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
global.math = math; // ode-solver.js and laplace-engine.js both expect a global `math`
const ODESolver = require(path.join(__dirname, "..", "assets", "js", "ode-solver.js"));
const Algorithms = require(path.join(__dirname, "..", "assets", "js", "algorithms.js"));
global.ODESolver = ODESolver;
global.Algorithms = Algorithms;
const LaplaceEngine = require(path.join(__dirname, "..", "assets", "js", "laplace-engine.js"));

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) {
    pass++;
    console.log(`  ok    ${label}${detail ? ": " + detail : ""}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`);
  }
  return cond;
}

console.log("extractLinearCoeffs — accepts constant-coefficient linear equations:");
{
  const r = LaplaceEngine.extractLinearCoeffs("y'' + 3*y' + 2*y = 0");
  ok(r.ok && r.order === 2, "detects order 2");
  ok(r.ok && JSON.stringify(r.coeffs) === JSON.stringify([1, 3, 2]), "extracts [a2,a1,a0] = [1,3,2]", JSON.stringify(r.coeffs));
  ok(r.ok && r.rhsText.trim() === "0", "rhs is 0");
}
{
  const r = LaplaceEngine.extractLinearCoeffs("y' = -2*y + DiracDelta(x-1)");
  ok(r.ok && r.order === 1, "handles y' = ... form (order 1)");
  ok(r.ok && JSON.stringify(r.coeffs) === JSON.stringify([1, 2]), "extracts [a1,a0] = [1,2] (rearranged to y'+2y=...)", JSON.stringify(r.coeffs));
}
{
  const r = LaplaceEngine.extractLinearCoeffs("y''' - y = 0");
  ok(r.ok && r.order === 3 && JSON.stringify(r.coeffs) === JSON.stringify([1, 0, 0, -1]), "order-3 equation extracts correctly", JSON.stringify(r && r.coeffs));
}

console.log("\nextractLinearCoeffs — refuses non-constant-coefficient / nonlinear input:");
ok(!LaplaceEngine.extractLinearCoeffs("x*y'' + y = 0").ok, "variable-coefficient equation refused");
ok(!LaplaceEngine.extractLinearCoeffs("y'' + y^2 = 0").ok, "nonlinear equation refused");
ok(!LaplaceEngine.extractLinearCoeffs("2*x + 3 = 0").ok, "no derivative term refused");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-laplace-engine.js`
Expected: FAIL to load — `Cannot find module '.../assets/js/laplace-engine.js'`.

- [ ] **Step 3: Create `assets/js/laplace-engine.js` with `extractLinearCoeffs`**

```javascript
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

  // Extracts [a_n, ..., a_0] from "a_n y^(n) + ... + a_0 y = rhs(x)" by evaluating the compiled
  // LHS (y/y'/y''/... substituted to Y0/Y1/Y2/... via ODESolver.toPlaceholdersGeneral) at unit
  // basis points — since the equation is guaranteed linear with constant coefficients, Yk=1 (all
  // others 0) evaluates to exactly a_k. A random-point cross-check and a zero-point check then
  // catch equations that AREN'T actually constant-coefficient linear, refusing honestly rather
  // than silently misreading them.
  function extractLinearCoeffs(equationText) {
    const order = ODESolver.detectOrder(equationText);
    if (order === 0) return { ok: false, reason: "Couldn't find a y', y'', ... term — this doesn't look like an ODE." };

    const parts = equationText.split("=");
    const lhsRaw = ODESolver.toPlaceholdersGeneral(parts[0]);
    const rhsText = parts.length > 1 ? parts[1].trim() : "0";

    let compiled;
    try {
      compiled = math.parse(lhsRaw).compile();
    } catch (e) {
      return { ok: false, reason: "Couldn't parse the left-hand side." };
    }
    function evalAt(values) {
      const scope = {};
      for (let k = 0; k <= order; k++) scope["Y" + k] = values[k];
      return compiled.evaluate(scope);
    }

    let zeroVal;
    try { zeroVal = evalAt(new Array(order + 1).fill(0)); } catch (e) {
      return { ok: false, reason: "Couldn't evaluate the equation's left-hand side." };
    }
    if (typeof zeroVal !== "number" || !Number.isFinite(zeroVal) || Math.abs(zeroVal) > 1e-9) {
      return { ok: false, reason: "The left-hand side must contain only y, y', ... terms — move any constant to the right-hand side." };
    }

    const coeffsByDegree = []; // index k = coefficient of Y_k, i.e. [a_0, a_1, ..., a_n]
    for (let k = 0; k <= order; k++) {
      const basis = new Array(order + 1).fill(0);
      basis[k] = 1;
      let val;
      try { val = evalAt(basis); } catch (e) {
        return { ok: false, reason: "Couldn't evaluate the equation's left-hand side." };
      }
      if (typeof val !== "number" || !Number.isFinite(val)) {
        return { ok: false, reason: "This isn't a constant-coefficient linear equation — the Laplace transform method doesn't apply." };
      }
      coeffsByDegree.push(val);
    }

    const randomPoint = samplePoint(order);
    const expected = randomPoint.reduce((sum, v, k) => sum + coeffsByDegree[k] * v, 0);
    let actual;
    try { actual = evalAt(randomPoint); } catch (e) {
      return { ok: false, reason: "Couldn't evaluate the equation's left-hand side." };
    }
    if (typeof actual !== "number" || !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-6 * Math.max(1, Math.abs(expected))) {
      return { ok: false, reason: "This isn't a constant-coefficient linear equation — the Laplace transform method doesn't apply." };
    }

    const coeffs = coeffsByDegree.slice().reverse(); // [a_n, ..., a_0]
    return { ok: true, order, coeffs, rhsText };
  }
  LaplaceEngine.extractLinearCoeffs = extractLinearCoeffs;

  return LaplaceEngine;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-laplace-engine.js`
Expected: PASS, all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/laplace-engine.js tests/verify-laplace-engine.js
git commit -m "feat(laplace): add extractLinearCoeffs to the new Laplace engine (TDD)"
```

---

### Task 5: `laplace-engine.js` — `verifyTransformPair`

**Files:**
- Modify: `assets/js/laplace-engine.js`
- Modify: `tests/verify-laplace-engine.js`

**Interfaces:**
- Consumes: `ODESolver.compileRealFx`, `Algorithms.runSimpson`.
- Produces: `LaplaceEngine.verifyTransformPair(fText, FText)` — `fText`: time-domain expression
  in `x` (e.g. `"exp(-2*x)"`). `FText`: transform-domain expression in `s`. Returns `boolean`:
  whether the truncated improper integral `∫₀ᵀf(x)e⁻ˢˣdx` (several sample `s`) agrees with `F(s)`
  evaluated at those same points. Used for BOTH directions: forward (compare the computed `F(s)`
  against the definition), and inverse (forward-transform the *candidate* `f(x)` and compare to
  the *original* `F(s)`) — same primitive, opposite roles, decided by the caller in Task 7.

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-laplace-engine.js`, after the `extractLinearCoeffs` blocks:

```javascript
console.log("\nverifyTransformPair — accepts a genuinely correct pair:");
ok(LaplaceEngine.verifyTransformPair("exp(-2*x)", "1/(s+2)"), "L{e^-2x} = 1/(s+2)");
ok(LaplaceEngine.verifyTransformPair("x^2", "2/s^3"), "L{x^2} = 2/s^3");
ok(LaplaceEngine.verifyTransformPair("Heaviside(x-2)", "exp(-2*s)/s"), "L{Heaviside(x-2)} = e^-2s/s (jump discontinuity)");

console.log("\nverifyTransformPair — rejects a wrong pair:");
ok(!LaplaceEngine.verifyTransformPair("exp(-2*x)", "1/(s+3)"), "e^-2x does NOT transform to 1/(s+3)");
ok(!LaplaceEngine.verifyTransformPair("x^2", "1/s^3"), "x^2 does NOT transform to 1/s^3 (missing factor of 2)");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-laplace-engine.js`
Expected: FAIL — `LaplaceEngine.verifyTransformPair is not a function`.

- [ ] **Step 3: Implement `verifyTransformPair`**

In `assets/js/laplace-engine.js`, add directly after `LaplaceEngine.extractLinearCoeffs = ...;`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-laplace-engine.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/laplace-engine.js tests/verify-laplace-engine.js
git commit -m "feat(laplace): add verifyTransformPair, numeric quadrature verification (TDD)"
```

---

### Task 6: `laplace-engine.js` — `verifyConvolution`

**Files:**
- Modify: `assets/js/laplace-engine.js`
- Modify: `tests/verify-laplace-engine.js`

**Interfaces:**
- Consumes: `ODESolver.compileRealFx`, `Algorithms.runSimpson`.
- Produces: `LaplaceEngine.verifyConvolution(fText, gText, convResultText)` — verifies
  `convResultText` (a candidate closed form for `(f∗g)(x)`) against the direct convolution
  integral `∫₀ˣf(τ)g(x−τ)dτ` (proper, finite bounds — no truncation needed) at several sample `x`.

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-laplace-engine.js`, after the `verifyTransformPair` blocks:

```javascript
console.log("\nverifyConvolution:");
// f=e^-x, g=sin(x) -> (f*g)(x) = (e^-x - cos(x) + sin(x)) / 2 (textbook identity)
ok(LaplaceEngine.verifyConvolution("exp(-x)", "sin(x)", "(exp(-x) - cos(x) + sin(x)) / 2"), "correct convolution closed form accepted");
ok(!LaplaceEngine.verifyConvolution("exp(-x)", "sin(x)", "exp(-x)"), "wrong convolution closed form rejected");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-laplace-engine.js`
Expected: FAIL — `LaplaceEngine.verifyConvolution is not a function`.

- [ ] **Step 3: Implement `verifyConvolution`**

In `assets/js/laplace-engine.js`, add directly after `LaplaceEngine.verifyTransformPair = ...;`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-laplace-engine.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/laplace-engine.js tests/verify-laplace-engine.js
git commit -m "feat(laplace): add verifyConvolution, direct convolution integral check (TDD)"
```

---

### Task 7: `laplace-engine.js` — orchestration (`transformOf`, `inverseOf`, `solveIvp`, `convolutionOf`)

**Files:**
- Modify: `assets/js/laplace-engine.js`

**Interfaces:**
- Consumes: `SympyClient.*` (Task 2), `extractLinearCoeffs`/`verifyTransformPair`/
  `verifyConvolution` (Tasks 4-6), `ODESolver.detectOrder`/`verifyNthOrder`/
  `withArbitraryConstants`.
- Produces:
  - `LaplaceEngine.transformOf(fText)` → `{ ok, result, distributional, verified }` or
    `{ ok: false, reason }`.
  - `LaplaceEngine.inverseOf(FText)` → `{ ok, result, distributional, verified }` or
    `{ ok: false, reason }`.
  - `LaplaceEngine.solveIvp(equationText, icsList)` → `{ ok, order, sDomainEq, Ys, result,
    verified }` or `{ ok: false, reason }`. `icsList`: `number[]` of length `order`
    (`[y(0), y'(0), ...]`), required (the Laplace method needs initial conditions).
  - `LaplaceEngine.convolutionOf(fText, gText)` → `{ ok, F, G, product, result, verified }` or
    `{ ok: false, reason }`.
  Not unit-tested (depend on `SympyClient`/the Worker) — verified manually in Task 9.

- [ ] **Step 1: Implement the four orchestration functions**

In `assets/js/laplace-engine.js`, add directly after `LaplaceEngine.verifyConvolution = ...;`
and before `return LaplaceEngine;`:

```javascript
  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

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
        if (!ODESolver.verifyNthOrder(yx, equationText, extracted.order)) {
          return { ok: false, reason: "SymPy returned an answer, but it did not independently verify against the original equation — refusing to show a result this site cannot confirm." };
        }
        return {
          ok: true,
          order: extracted.order,
          sDomainEq: normalizeSympyText(parsed.s_domain_eq),
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
```

- [ ] **Step 2: Run the existing Node suite to confirm nothing broke**

Run: `node tests/verify-laplace-engine.js`
Expected: PASS, same count as Task 6 (this task adds no new Node-testable surface).

- [ ] **Step 3: Commit**

```bash
git add assets/js/laplace-engine.js
git commit -m "feat(laplace): add transformOf/inverseOf/solveIvp/convolutionOf orchestration"
```

---

### Task 8: Rewrite the Laplace Transform page

**Files:**
- Modify: `engines/ode/methods/laplace-transform.html` (full rewrite)
- Modify: `assets/js/laplace-transform.js` (full rewrite — same filename, now wires the new
  three-section page instead of the old dsolve()-front-end form)

**Interfaces:**
- Consumes: `LaplaceEngine.transformOf`/`inverseOf`/`solveIvp`/`convolutionOf` (Task 7),
  `ODERender.bigBox` (existing), `Engine.attachMathKeypad`/`renderKatex` (existing).
- Not Node-tested — DOM/page wiring, verified manually in Task 9.

- [ ] **Step 1: Rewrite `engines/ode/methods/laplace-transform.html`**

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Laplace Transform — ODE/PDE Engine</title>
<link rel="stylesheet" href="../../../assets/vendor/katex.min.css" />
<link rel="stylesheet" href="../../../assets/css/engine.css" />
<style>:root{ --electric-teal:#4f8fc0; }</style>
</head>
<body>

<header class="site-header">
  <div class="bar">
    <a href="../methods.html" class="logo"><span class="dot"></span> ODE&nbsp;Engine</a>
    <ul class="nav-links">
      <li><a href="../methods.html"><span>Methods</span><span class="dup" aria-hidden="true">Methods</span></a></li>
      <li><a href="ode-solver.html"><span>ODE Solver</span><span class="dup" aria-hidden="true">ODE Solver</span></a></li>
      <li><a href="systems.html"><span>Systems</span><span class="dup" aria-hidden="true">Systems</span></a></li>
      <li><a href="series-solutions.html"><span>Series</span><span class="dup" aria-hidden="true">Series</span></a></li>
      <li><a href="heat-equation.html"><span>Heat&nbsp;PDE</span><span class="dup" aria-hidden="true">Heat&nbsp;PDE</span></a></li>
      <li><a href="../../../index.html"><span>All Engines</span><span class="dup" aria-hidden="true">All Engines</span></a></li>
    </ul>
    <a href="../methods.html" class="btn btn--ghost btn--sm"><span class="btn-text">All Methods</span></a>
  </div>
</header>

<section class="method-hero">
  <div class="container">
    <span class="eyebrow">The Laplace Transform</span>
    <h1 class="h2" style="margin-top:14px;">Laplace Transform</h1>
    <p class="method-summary">A real transform engine: compute <span class="mono">F(s) = L{f(x)}</span> or its inverse directly, solve an initial-value problem by the full transform → algebra → inverse-transform method (any order, including discontinuous or impulsive forcing), or verify the convolution theorem. Every result is independently re-checked numerically before it's shown.</p>
  </div>
</section>

<section class="section--tight">
  <div class="container">
    <div class="method-tags" id="sectionTabs" style="margin-bottom:24px;">
      <button type="button" class="tag is-active" data-section="calc">Transform Calculator</button>
      <button type="button" class="tag" data-section="ivp">Solve an IVP</button>
      <button type="button" class="tag" data-section="conv">Convolution</button>
    </div>

    <div id="calcSection" class="workspace">
      <form class="panel crosshair-host" id="calcForm">
        <span class="panel-title">Input</span>
        <label class="status-line" style="cursor:pointer;">
          <input type="radio" name="calcDir" id="dirForward" value="forward" checked style="width:auto;" />
          <span>Forward: f(x) &rarr; F(s)</span>
        </label>
        <label class="status-line" style="cursor:pointer; margin-top:8px;">
          <input type="radio" name="calcDir" id="dirInverse" value="inverse" style="width:auto;" />
          <span>Inverse: F(s) &rarr; f(x)</span>
        </label>
        <div class="field" style="margin-top:16px;">
          <label for="calcInput" id="calcInputLabel">f(x)</label>
          <input type="text" id="calcInput" class="mono" value="exp(-2*x)" autocomplete="off" spellcheck="false" />
        </div>
        <span class="field-note" style="margin-top:18px;">Worked examples — click to load</span>
        <div class="method-tags" id="calcChips">
          <button type="button" class="tag" data-dir="forward" data-v="x^2">x&sup2;</button>
          <button type="button" class="tag" data-dir="forward" data-v="exp(-2*x)">e&#8315;&sup2;&#7503;</button>
          <button type="button" class="tag" data-dir="forward" data-v="sin(3*x)">sin(3x)</button>
          <button type="button" class="tag" data-dir="forward" data-v="Heaviside(x-2)">Step at x=2</button>
          <button type="button" class="tag" data-dir="forward" data-v="DiracDelta(x-1)">Impulse at x=1</button>
          <button type="button" class="tag" data-dir="inverse" data-v="1/(s+2)">1/(s+2)</button>
          <button type="button" class="tag" data-dir="inverse" data-v="exp(-2*s)/s">e&#8315;&sup2;&#8347;/s</button>
        </div>
        <div class="status-line ok" id="calcStatus" style="margin-top:18px;"><span class="status-dot"></span><span id="calcStatusText">Ready — press Compute.</span></div>
        <div class="field" id="calcError" style="display:none;"><div class="status-line bad"><span class="status-dot"></span><span id="calcErrorText"></span></div></div>
        <div class="hero-actions" style="margin-top:6px;"><button type="submit" class="btn btn--primary"><span class="btn-text">Compute</span></button></div>
      </form>
      <div id="calcOutput">
        <div class="panel crosshair-host" id="calcPlaceholder"><span class="panel-title">Output</span><p class="p1">Type an expression and hit Compute.</p></div>
        <div id="calcResultsArea" style="display:none;"></div>
      </div>
    </div>

    <div id="ivpSection" class="workspace" style="display:none;">
      <form class="panel crosshair-host" id="ivpForm">
        <span class="panel-title">Input</span>
        <div class="field">
          <label for="ivpInput">Equation</label>
          <input type="text" id="ivpInput" class="mono" value="y'' + 4*y = Heaviside(x-1)" autocomplete="off" spellcheck="false" />
        </div>
        <div id="ivpIcFields" style="margin-top:12px;"></div>
        <span class="field-note" style="margin-top:18px;">Worked examples — click to load</span>
        <div class="method-tags" id="ivpChips">
          <button type="button" class="tag" data-eq="y'' + 3*y' + 2*y = 0" data-ics="1,0">Homogeneous, 2nd order</button>
          <button type="button" class="tag" data-eq="y'' + y = Heaviside(x-3)" data-ics="0,0">Step forcing</button>
          <button type="button" class="tag" data-eq="y'' + 4*y = DiracDelta(x-2)" data-ics="0,0">Impulse forcing</button>
          <button type="button" class="tag" data-eq="y''' - y = 0" data-ics="1,0,0">3rd order</button>
        </div>
        <div class="status-line ok" id="ivpStatus" style="margin-top:18px;"><span class="status-dot"></span><span id="ivpStatusText">Ready — press Solve.</span></div>
        <div class="field" id="ivpError" style="display:none;"><div class="status-line bad"><span class="status-dot"></span><span id="ivpErrorText"></span></div></div>
        <div class="hero-actions" style="margin-top:6px;"><button type="submit" class="btn btn--primary"><span class="btn-text">Solve</span></button></div>
      </form>
      <div id="ivpOutput">
        <div class="panel crosshair-host" id="ivpPlaceholder"><span class="panel-title">Output</span><p class="p1">Enter an equation and initial conditions, then hit Solve — all three stages (transform, algebra, inverse) will appear here.</p></div>
        <div id="ivpResultsArea" style="display:none;"></div>
      </div>
    </div>

    <div id="convSection" class="workspace" style="display:none;">
      <form class="panel crosshair-host" id="convForm">
        <span class="panel-title">Input</span>
        <div class="field"><label for="convF">f(x)</label><input type="text" id="convF" class="mono" value="exp(-x)" autocomplete="off" spellcheck="false" /></div>
        <div class="field" style="margin-top:12px;"><label for="convG">g(x)</label><input type="text" id="convG" class="mono" value="sin(x)" autocomplete="off" spellcheck="false" /></div>
        <div class="status-line ok" id="convStatus" style="margin-top:18px;"><span class="status-dot"></span><span id="convStatusText">Ready — press Compute.</span></div>
        <div class="field" id="convError" style="display:none;"><div class="status-line bad"><span class="status-dot"></span><span id="convErrorText"></span></div></div>
        <div class="hero-actions" style="margin-top:6px;"><button type="submit" class="btn btn--primary"><span class="btn-text">Compute</span></button></div>
      </form>
      <div id="convOutput">
        <div class="panel crosshair-host" id="convPlaceholder"><span class="panel-title">Output</span><p class="p1">Enter f(x) and g(x), then hit Compute — F(s)&middot;G(s) and the convolution (f&lowast;g)(x) will appear here, verified against the direct convolution integral.</p></div>
        <div id="convResultsArea" style="display:none;"></div>
      </div>
    </div>
  </div>
</section>

<footer class="site-footer">
  <div class="container bar">
    <span class="p2">ODE/PDE Engine</span>
    <a href="../methods.html" class="p2">← All Methods</a>
  </div>
</footer>

<script src="../../../assets/vendor/gsap.min.js" defer></script>
<script src="../../../assets/vendor/math.min.js" defer></script>
<script src="../../../assets/vendor/katex.min.js" defer></script>
<script src="../../../assets/js/engine-core.js" defer></script>
<script src="../../../assets/js/calc-core.js" defer></script>
<script src="../../../assets/js/ode-symbolic.js" defer></script>
<script src="../../../assets/js/ode-render.js" defer></script>
<script src="../../../assets/js/sympy-client.js" defer></script>
<script src="../../../assets/js/algorithms.js" defer></script>
<script src="../../../assets/js/ode-solver.js" defer></script>
<script src="../../../assets/js/laplace-engine.js" defer></script>
<script src="../../../assets/js/laplace-transform.js" defer></script>
<script defer>
  document.addEventListener("DOMContentLoaded", () => Engine.initChrome());
</script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `assets/js/laplace-transform.js`**

```javascript
/* Laplace Transform page wiring — Phase 3 of the ODE engine redesign. Three sections, one
   LaplaceEngine module behind them: a standalone transform/inverse-transform calculator, the
   staged "solve an IVP via Laplace" walkthrough (any order), and a convolution-theorem demo.
   Replaces the old dsolve()-front-end version of this file (see git history and the plan's
   design doc for why: that version never computed a transform at all). */
(function () {
  "use strict";

  function setStatus(statusEl, textEl, ok, msg) {
    statusEl.className = "status-line " + (ok ? "ok" : "bad");
    textEl.textContent = msg;
  }
  function showError(errEl, textEl, msg) { errEl.style.display = "block"; textEl.textContent = msg; }
  function hideError(errEl) { errEl.style.display = "none"; }

  // ---- Section tabs ----
  const tabs = document.querySelectorAll("#sectionTabs .tag");
  const sections = { calc: document.getElementById("calcSection"), ivp: document.getElementById("ivpSection"), conv: document.getElementById("convSection") };
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      Object.keys(sections).forEach((key) => { sections[key].style.display = key === tab.dataset.section ? "" : "none"; });
    });
  });

  // ---- Transform Calculator ----
  (function () {
    const form = document.getElementById("calcForm");
    const input = document.getElementById("calcInput");
    const label = document.getElementById("calcInputLabel");
    const dirForward = document.getElementById("dirForward");
    const status = document.getElementById("calcStatus"), statusText = document.getElementById("calcStatusText");
    const errEl = document.getElementById("calcError"), errText = document.getElementById("calcErrorText");
    const placeholder = document.getElementById("calcPlaceholder");
    const resultsArea = document.getElementById("calcResultsArea");

    function updateLabel() { label.textContent = dirForward.checked ? "f(x)" : "F(s)"; }
    document.getElementsByName("calcDir").forEach((r) => r.addEventListener("change", updateLabel));
    updateLabel();

    document.querySelectorAll("#calcChips .tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.dataset.dir === "forward" ? "dirForward" : "dirInverse").checked = true;
        updateLabel();
        input.value = btn.dataset.v;
      });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideError(errEl);
      const raw = input.value.trim();
      if (!raw) { setStatus(status, statusText, false, "Enter an expression."); return; }
      const forward = dirForward.checked;
      const call = forward ? LaplaceEngine.transformOf(raw) : LaplaceEngine.inverseOf(raw);
      call.then((out) => {
        placeholder.style.display = "none";
        resultsArea.style.display = "";
        if (!out.ok) {
          resultsArea.innerHTML = "";
          showError(errEl, errText, out.reason);
          setStatus(status, statusText, false, out.reason);
          return;
        }
        const outVar = forward ? "F(s)" : "f(x)";
        const classLine = out.distributional
          ? "Distributional transform — not independently verified (not Riemann-integrable), symbolic result only."
          : "Solved by SymPy, verified against the defining integral.";
        ODERender.bigBox(resultsArea, {
          classificationLine: classLine,
          generalSolution: `${outVar} = ${ODESymbolic.toLatex(out.result)}`,
          particularSolution: null,
        });
        setStatus(status, statusText, true, out.distributional ? "Computed (not independently verified)." : "Verified.");
      });
    });
  })();

  // ---- IVP walkthrough ----
  (function () {
    const form = document.getElementById("ivpForm");
    const input = document.getElementById("ivpInput");
    const icFields = document.getElementById("ivpIcFields");
    const status = document.getElementById("ivpStatus"), statusText = document.getElementById("ivpStatusText");
    const errEl = document.getElementById("ivpError"), errText = document.getElementById("ivpErrorText");
    const placeholder = document.getElementById("ivpPlaceholder");
    const resultsArea = document.getElementById("ivpResultsArea");

    function rebuildIcFields(icsCsv) {
      const order = ODESolver.detectOrder(input.value.trim());
      icFields.innerHTML = "";
      if (order === 0) return;
      const defaults = icsCsv ? icsCsv.split(",").map((s) => s.trim()) : [];
      const row = document.createElement("div");
      row.className = "field-row";
      row.style.flexWrap = "wrap";
      const labels = ["y(0)", "y'(0)", "y''(0)", "y'''(0)"];
      for (let k = 0; k < order; k++) {
        const f = document.createElement("div");
        f.className = "field";
        const lbl = labels[k] || `y^(${k})(0)`;
        const val = defaults[k] !== undefined ? defaults[k] : (k === 0 ? "1" : "0");
        f.innerHTML = `<label>${lbl}</label><input type="number" class="ic-input" data-role="ic${k}" value="${val}" step="any" />`;
        row.appendChild(f);
      }
      icFields.appendChild(row);
    }
    function readIcs() {
      const order = ODESolver.detectOrder(input.value.trim());
      const values = [];
      for (let k = 0; k < order; k++) {
        const el = icFields.querySelector(`[data-role="ic${k}"]`);
        const v = el ? parseFloat(el.value) : NaN;
        if (Number.isNaN(v)) return null;
        values.push(v);
      }
      return values;
    }

    document.querySelectorAll("#ivpChips .tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.eq;
        rebuildIcFields(btn.dataset.ics);
      });
    });
    input.addEventListener("input", Engine.debounce(() => rebuildIcFields(), 200));
    rebuildIcFields("0,0");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideError(errEl);
      const raw = input.value.trim();
      if (!raw) { setStatus(status, statusText, false, "Enter an equation."); return; }
      const ics = readIcs();
      if (ics === null) { setStatus(status, statusText, false, "Every initial condition needs a numeric value."); return; }

      LaplaceEngine.solveIvp(raw, ics).then((out) => {
        placeholder.style.display = "none";
        resultsArea.style.display = "";
        if (!out.ok) {
          resultsArea.innerHTML = "";
          showError(errEl, errText, out.reason);
          setStatus(status, statusText, false, out.reason);
          return;
        }
        const stages = "\\begin{gathered}" +
          "\\text{Transform: } " + ODESymbolic.toLatex(out.sDomainEq) + "\\\\" +
          "\\text{Solve: } Y(s) = " + ODESymbolic.toLatex(out.Ys) + "\\\\" +
          "\\text{Invert: } y(x) = " + ODESymbolic.toLatex(out.result) +
          "\\end{gathered}";
        ODERender.bigBox(resultsArea, {
          classificationLine: `Order ${out.order}, solved by Laplace transform — verified.`,
          generalSolution: stages,
          particularSolution: null,
        });
        setStatus(status, statusText, true, "Solved.");
      });
    });
  })();

  // ---- Convolution ----
  (function () {
    const form = document.getElementById("convForm");
    const fInput = document.getElementById("convF"), gInput = document.getElementById("convG");
    const status = document.getElementById("convStatus"), statusText = document.getElementById("convStatusText");
    const errEl = document.getElementById("convError"), errText = document.getElementById("convErrorText");
    const placeholder = document.getElementById("convPlaceholder");
    const resultsArea = document.getElementById("convResultsArea");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideError(errEl);
      const fText = fInput.value.trim(), gText = gInput.value.trim();
      if (!fText || !gText) { setStatus(status, statusText, false, "Enter both f(x) and g(x)."); return; }

      LaplaceEngine.convolutionOf(fText, gText).then((out) => {
        placeholder.style.display = "none";
        resultsArea.style.display = "";
        if (!out.ok) {
          resultsArea.innerHTML = "";
          showError(errEl, errText, out.reason);
          setStatus(status, statusText, false, out.reason);
          return;
        }
        const stages = "\\begin{gathered}" +
          "F(s) = " + ODESymbolic.toLatex(out.F) + "\\\\" +
          "G(s) = " + ODESymbolic.toLatex(out.G) + "\\\\" +
          "F(s)\\cdot G(s) = " + ODESymbolic.toLatex(out.product) + "\\\\" +
          "(f * g)(x) = " + ODESymbolic.toLatex(out.result) +
          "\\end{gathered}";
        ODERender.bigBox(resultsArea, {
          classificationLine: "Convolution theorem — verified against the direct convolution integral.",
          generalSolution: stages,
          particularSolution: null,
        });
        setStatus(status, statusText, true, "Verified.");
      });
    });
  })();

  Engine.attachMathKeypad(document.getElementById("calcInput"));
  Engine.attachMathKeypad(document.getElementById("ivpInput"));
})();
```

- [ ] **Step 3: Commit**

```bash
git add engines/ode/methods/laplace-transform.html assets/js/laplace-transform.js
git commit -m "feat(laplace): rewrite the Laplace Transform page with three real sections"
```

---

### Task 9: Delete dead code, wire into methods.html/docs, manual QA

**Files:**
- Delete: `assets/js/sympy-dsolve-fallback.js`
- Modify: `assets/js/sympy-worker.js` (remove `_dsolve_first_order`, `_dsolve_second_order`,
  `_dsolve_second_order_general` and their op registrations)
- Modify: `assets/js/sympy-client.js` (remove `dsolveFirstOrder`/`dsolveSecondOrder`/
  `dsolveSecondOrderGeneral` wrappers)
- Modify: `assets/js/ode-symbolic.js` (remove `isSecondOrderInput`, `parseSecondOrder`,
  `rhsFromInput`)
- Modify: `tests/verify-ode.js` (remove the now-dead tests for those three functions)
- Modify: `engines/ode/methods.html`
- Modify: `docs/ODE_PDE_ENGINE_PLAN.md`

- [ ] **Step 1: Re-confirm nothing else depends on the code being deleted**

Run (from `math-lab/`):

```bash
grep -rln "SympyDsolveFallback\|isSecondOrderInput\|parseSecondOrder\|rhsFromInput\|dsolveFirstOrder\|dsolveSecondOrder\b\|dsolveSecondOrderGeneral" . --include="*.js" --include="*.html"
```

Expected: only the files this task is about to delete/modify (and `tests/verify-ode.js`,
handled in Step 5) — if anything else appears, STOP and investigate before deleting.

- [ ] **Step 2: Delete `sympy-dsolve-fallback.js`**

```bash
git rm assets/js/sympy-dsolve-fallback.js
```

- [ ] **Step 3: Remove the dead Python functions and op registrations from `sympy-worker.js`**

Delete the `_dsolve_first_order`, `_dsolve_second_order`, and `_dsolve_second_order_general`
Python function definitions (search for `def _dsolve_first_order`, `def _dsolve_second_order`,
`def _dsolve_second_order_general` — remove each function body up to its `return` statement).
Delete the corresponding `dsolveFirstOrder:`, `dsolveSecondOrder:`, `dsolveSecondOrderGeneral:`
entries from the ops dispatcher object. Leave `_format_dsolve` and `_prepare_ode_text` in
place — both are still used by `_dsolve_general`/`_dsolve_system` and `_series_solution`
respectively.

- [ ] **Step 4: Remove the dead wrappers from `sympy-client.js`**

Delete `SympyClient.dsolveFirstOrder`, `SympyClient.dsolveSecondOrder`,
`SympyClient.dsolveSecondOrderGeneral`.

- [ ] **Step 5: Remove the dead functions from `ode-symbolic.js` and their tests**

Delete `ODESymbolic.isSecondOrderInput`, `ODESymbolic.parseSecondOrder`,
`ODESymbolic.rhsFromInput` from `assets/js/ode-symbolic.js`. In `tests/verify-ode.js`, delete
the test blocks exercising these three functions (search for `isSecondOrderInput`,
`parseSecondOrder`, `rhsFromInput`).

- [ ] **Step 6: Run the full Node suite**

```bash
node tests/verify-ode.js
node tests/verify-ode-solver.js
node tests/verify-ode-systems.js
node tests/verify-laplace-engine.js
```

Expected: all four PASS (fewer total assertions in `verify-ode.js` than before, since the
deleted functions' tests are gone — that's expected, not a regression).

- [ ] **Step 7: Commit the cleanup**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(ode): delete sympy-dsolve-fallback.js and the ODESymbolic parsing
helpers it depended on

Both were kept alive specifically for the old laplace-transform.js (see
ode-solver.js's own header comment) -- now dead now that page has been
rewritten on top of the new Laplace engine. Verified via grep that no
other caller exists before deleting.
EOF
)"
```

- [ ] **Step 8: Add the Laplace card update to `methods.html`**

The existing Laplace card already links to `methods/laplace-transform.html` — update its
description and tags to match what the page now actually does. Find the card with
`href="methods/laplace-transform.html"` in `engines/ode/methods.html` and replace its `<p>` and
`method-tags` content:

```html
        <p>A real transform engine: compute <span class="mono">F(s) = L{f(x)}</span> or its inverse directly, solve an IVP by the full transform &rarr; algebra &rarr; inverse-transform method (any order), or verify the convolution theorem. Every result independently re-checked numerically before it's shown.</p>
        <div class="method-tags" style="margin-top:16px;">
          <span class="tag">Forward + inverse transform</span>
          <span class="tag">Staged IVP walkthrough</span>
          <span class="tag">Convolution theorem</span>
        </div>
```

- [ ] **Step 9: Add the Phase 3 completion note to `ODE_PDE_ENGINE_PLAN.md`**

Find the `2026-08-02 — Phase 2 (systems of ODEs) shipped.` note and add this new note directly
after it:

```markdown
**2026-08-02 — Phase 3 (Laplace Transform engine) shipped.** Full plan:
`docs/superpowers/plans/2026-08-02-ode-engine-phase3-laplace.md`. Rewrote
`engines/ode/methods/laplace-transform.html` from a themed `dsolve()` front end into a real
transform engine: a standalone transform/inverse-transform calculator, a staged (transform →
algebra → invert) IVP walkthrough at any order, and a convolution-theorem demo — all
independently verified numerically. Deleted `sympy-dsolve-fallback.js` and the
`ODESymbolic.isSecondOrderInput`/`parseSecondOrder`/`rhsFromInput` helpers it depended on (dead
once this page stopped calling them). Phases 4-6 (series solutions cleanup, PDE, final docs
rewrite) remain not started.
```

- [ ] **Step 10: Commit**

```bash
git add engines/ode/methods.html docs/ODE_PDE_ENGINE_PLAN.md
git commit -m "docs(laplace): update methods.html card and record Phase 3 completion"
```

- [ ] **Step 11: Full manual browser verification pass**

Serve `math-lab/` locally (e.g. `python3 -m http.server`) and open
`engines/ode/methods/laplace-transform.html`. Check every one of these by hand:

1. **Transform Calculator, forward:** load each chip (x², e⁻²ˣ, sin(3x), Step at x=2, Impulse
   at x=1) and press Compute. The four non-impulse chips must show "Verified." The impulse chip
   must show the "distributional... not independently verified" label, NOT a false "Verified."
   All five must return the textbook-correct `F(s)` (`2/s³`, `1/(s+2)`, `3/(s²+9)`,
   `e⁻²ˢ/s`, `e⁻ˢ`).
2. **Transform Calculator, inverse:** switch to Inverse, load `1/(s+2)` and `e⁻²ˢ/s`, press
   Compute. Must return `exp(-2x)` and `Heaviside(x-2)` respectively, both verified.
3. **IVP walkthrough:** load all four chips and press Solve. Each must show all three stages
   (s-domain equation, `Y(s)`, `y(x)`) and a "Solved." status with no refusal. The homogeneous
   case must match `2e⁻ˣ − e⁻²ˣ` (up to the constant-combination form SymPy returns), the step
   case must match `(1−cos(x−3))·Heaviside(x−3)`, the impulse case must match
   `sin(2x−4)·Heaviside(x−2)/2`, the 3rd-order case must show a verified result.
4. **Convolution:** the default f=e⁻ˣ, g=sin(x) must verify and show
   `(e⁻ˣ − cos(x) + sin(x))/2` as the convolution result.
5. **Error handling:** on the IVP tab, type a nonlinear equation like `y'' + y^2 = 0` and press
   Solve — must show an honest inline refusal, never a guessed result.
6. Check the browser console for JS errors across all three sections.
7. If any check fails, fix the underlying issue and repeat this full pass before considering
   Phase 3 done. Do not proceed to Phase 4 (Series Solutions cleanup) until this pass is clean.
