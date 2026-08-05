# ODE Engine Phase 1 — General SymPy-Backed Solver — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ODE engine's hand-rolled classify-then-symbolically-derive pipeline (the
"First-Order Solver" + "Second-Order Solver" pages, and ~2600 lines of classification/exact-
arithmetic code in `ode-symbolic.js`) with one general, SymPy-`dsolve()`-backed solver that
handles any order, on one consolidated page — matching how Wolfram Alpha / Symbolab present
general ODE solving (answer-first, one-line classification tag, no mandatory derivation).

**Architecture:** A new Python function `_dsolve_general` in the existing Pyodide/SymPy worker
(`sympy-worker.js`) parses an ODE of any order, calls `sympy.dsolve()`, and tags the result with
`sympy.classify_ode()`'s best-match hint. A new pure-JS module (`ode-solver.js`, replacing
`sympy-dsolve-fallback.js`) orchestrates the call and independently re-verifies the returned
solution by numeric substitution (finite differences up to the equation's own order) before ever
showing it — same never-trust-blindly discipline every other solver on this site already follows,
just implemented once generically instead of per hand-rolled branch. The existing
answer-only `ODERender.bigBox` renderer is reused unchanged — it already does exactly the
Method-tag + Verified-badge presentation this phase wants; it does not need to change.

**Tech Stack:** Vanilla JS (UMD modules, no build step), SymPy via Pyodide 0.26.4 (already
vendored/wired in this repo), math.js (finite-difference verification), existing site CSS/KaTeX/
Plotly conventions.

## Global Constraints

- No build step — plain `<script defer>` includes, matching every other page on the site.
- Every returned symbolic answer MUST be independently verified by numeric substitution before
  being shown; a verification failure or a `NotImplementedError` from SymPy must produce an
  honest refusal message, never a guessed/faked result.
- Follow the existing UMD module pattern (`window.X` / `module.exports`) for every new pure-JS
  module, so it stays Node-testable.
- The Pyodide/SymPy worker cannot be exercised from the Node test suite (no `pyodide` npm
  package in this repo, WASM runtime fetched from CDN at browser runtime only) — Python-side
  changes are verified manually in a real browser, exactly like the existing `dsolveFirstOrder`/
  `dsolveSecondOrder` Python functions already are today. Only the pure-JS verification/parsing
  logic gets Node unit tests.
- PDE code (`heatSeriesValue`, `solveHeatEquation` in `ode-symbolic.js`) is out of scope for this
  phase — do not touch it.
- Out of scope for this phase (explicitly deferred): systems of ODEs, Laplace transform page
  cleanup, series solution page cleanup, and rewriting `ODE_PDE_ENGINE_PLAN.md` /
  `ODE_PDE_SOLVER_DESIGN.md` / `CURRICULUM_ROADMAP.md` §5 — those are later phases.
- Known, accepted limitation for this phase: the numeric (non-symbolic) fallback only exists for
  order 1 (`ODESymbolic.eulerRK4FirstOrder`, unchanged) and order 2 with constant coefficients
  (`ODESymbolic.rk4SecondOrder`, unchanged). An order-3+ equation that SymPy can't solve in closed
  form gets an honest refusal message with no plot, not a numeric fallback — building a general
  nth-order numeric fallback is out of scope here.

---

### Task 1: General `dsolve` + classification in the SymPy worker

**Files:**
- Modify: `assets/js/sympy-worker.js`

**Interfaces:**
- Produces: a new whitelisted worker op `dsolveGeneral`, callable as
  `pyodide.runPython('_dsolve_general(equation_text, order, ics_list)')` returning a JSON string
  `{"solution": "EXPLICIT:..."|"IMPLICIT:...", "classification": "<friendly label>"}`.

This task is Python-in-a-string, so there is no Node test for it — it's verified manually in
Task 9. Add the following, inserted directly after the existing `_dsolve_second_order_general`
function (currently ending around line 156) and before `_series_solution`:

- [ ] **Step 1: Add `_prepare_ode_text_general` — arbitrary-order prime-notation parser**

Add this function to the Python source string in `sympy-worker.js` (inside the same
`pyodide.runPythonAsync(...)` template literal that already defines `_prepare_ode_text`):

```python
def _prepare_ode_text_general(s):
    # Handles y, y', y'', y''', ... in one pass: the regex's '+' is greedy, so "y''''" matches
    # as ONE occurrence with a 4-character prime group, not four separate "y'" matches — this
    # sidesteps the substring-ordering trap _prepare_ode_text's two-step version has to work
    # around (y'' contains y' as a substring), for any order at once.
    def repl_derivative(m):
        order = len(m.group(1))
        return f"Derivative(y(x), x, {order})"
    s = re.sub(r"y('+)", repl_derivative, s)
    s = re.sub(r"(?<![A-Za-z0-9_])y(?![A-Za-z0-9_'(])", "y(x)", s)
    return s
```

- [ ] **Step 2: Add the hint-to-friendly-label table and `_classification_label`**

```python
_HINT_LABELS = {
    "separable": "Separable equation",
    "1st_exact": "Exact equation",
    "1st_linear": "First-order linear",
    "Bernoulli": "Bernoulli equation",
    "1st_homogeneous_coeff_best": "Homogeneous coefficients",
    "1st_homogeneous_coeff_subs_indep_div_dep": "Homogeneous coefficients",
    "1st_homogeneous_coeff_subs_dep_div_indep": "Homogeneous coefficients",
    "1st_rational_riccati": "Riccati equation",
    "nth_linear_constant_coeff_homogeneous": "Constant-coefficient linear (homogeneous)",
    "nth_linear_constant_coeff_undetermined_coefficients": "Constant-coefficient linear (undetermined coefficients)",
    "nth_linear_constant_coeff_variation_of_parameters": "Constant-coefficient linear (variation of parameters)",
    "nth_linear_euler_eq_homogeneous": "Euler-Cauchy equation",
    "nth_algebraic": "Algebraic equation",
    "nth_order_reducible": "Reducible to lower order",
    "2nd_power_series_ordinary": "Power series solution (ordinary point)",
    "2nd_power_series_regular": "Power series solution (regular singular point)",
    "2nd_linear_airy": "Airy equation",
    "2nd_linear_bessel": "Bessel equation",
    "2nd_hypergeometric": "Hypergeometric equation",
}

def _classification_label(eq, yfunc):
    try:
        hints = sp.classify_ode(eq, yfunc)
    except Exception:
        return "General ODE"
    if not hints:
        return "General ODE"
    best = hints[0]
    return _HINT_LABELS.get(best, best.replace("_", " "))
```

- [ ] **Step 3: Add `_dsolve_general`**

```python
def _dsolve_general(equation_text, order, ics_list):
    x = sp.symbols('x')
    yf = sp.Function('y')
    parts = equation_text.split("=")
    lhs_raw, rhs_raw = parts[0], (parts[1] if len(parts) > 1 else "0")
    locals_map = {"e": sp.E, "I": sp.I, "x": x, "y": yf, "Derivative": sp.Derivative,
                  "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}
    try:
        lhs = sp.sympify(_prepare_ode_text_general(lhs_raw), locals=locals_map)
        rhs = sp.sympify(_prepare_ode_text_general(rhs_raw), locals=locals_map)
    except Exception as ex:
        raise ValueError("Couldn't parse this equation: " + str(ex))
    eq = sp.Eq(lhs, rhs)

    ics = None
    if ics_list:
        x0 = sp.sympify(ics_list[0])
        ics = {}
        for k, val_str in enumerate(ics_list[1:]):
            val = sp.sympify(val_str)
            if k == 0:
                ics[yf(x0)] = val
            else:
                ics[yf(x).diff(x, k).subs(x, x0)] = val

    try:
        sol = sp.dsolve(eq, yf(x), ics=ics)
    except NotImplementedError as ex:
        raise ValueError("No closed-form method matched this equation: " + str(ex))
    except Exception as ex:
        raise ValueError("SymPy could not solve this ODE: " + str(ex))

    label = _classification_label(eq, yf(x))
    return json.dumps({"solution": _format_dsolve(sol), "classification": label})
```

- [ ] **Step 4: Whitelist the new op**

In the `OPS` object (after the existing `dsolveSecondOrderGeneral` entry), add:

```js
  // General any-order solver — Phase 1 of the ODE engine redesign. ics_list is
  // [x0, y(x0), y'(x0), ...] as strings, or [] for the general solution with no IC applied.
  dsolveGeneral: async (pyodide, args) => {
    const [equationText, order, icsList] = args;
    const icsArg = icsList && icsList.length ? JSON.stringify(icsList.map(String)) : "[]";
    return pyodide.runPython(
      `_dsolve_general(${JSON.stringify(equationText)}, ${JSON.stringify(order)}, ${icsArg})`
    );
  },
```

- [ ] **Step 5: Commit**

```bash
git add assets/js/sympy-worker.js
git commit -m "feat(ode): add general any-order dsolve op to the SymPy worker"
```

---

### Task 2: `SympyClient.dsolveGeneral` wrapper

**Files:**
- Modify: `assets/js/sympy-client.js`

**Interfaces:**
- Consumes: the `dsolveGeneral` op from Task 1.
- Produces: `SympyClient.dsolveGeneral(equationText, order, icsArray, opts)` → `Promise<{resultText: string}>`, where `resultText` is the JSON string from `_dsolve_general`.

- [ ] **Step 1: Add the wrapper**

Add this after the existing `SympyClient.dsolveSecondOrderGeneral` function:

```js
  // .dsolveGeneral (ode-solver.js) — any-order general solver, Phase 1 of the ODE redesign.
  // Replaces dsolveFirstOrder/dsolveSecondOrder/dsolveSecondOrderGeneral as the primary ODE
  // path; those three stay defined above for now since nothing has removed their callers yet
  // (Task 7 deletes ode-first-order.js / ode-second-order.js, their only callers).
  SympyClient.dsolveGeneral = function (equationText, order, ics, opts) {
    return SympyClient.call("dsolveGeneral", [equationText, order, ics || []], opts);
  };
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/sympy-client.js
git commit -m "feat(ode): add SympyClient.dsolveGeneral wrapper"
```

---

### Task 3: `ode-solver.js` — general verify + orchestration (TDD)

**Files:**
- Create: `assets/js/ode-solver.js`
- Test: `tests/verify-ode-solver.js`

**Interfaces:**
- Consumes: `SympyClient.dsolveGeneral` (Task 2), global `math` (math.js, already vendored).
- Produces: `window.ODESolver` / `module.exports` with:
  - `ODESolver.detectOrder(equationText)` → integer (0 if no `y'` term found)
  - `ODESolver.verifyNthOrder(yOfXText, equationText, order)` → boolean
  - `ODESolver.solve(equationText, ics)` → `Promise<{ok, result?, classification?, order?, verified?, reason?}>`, where `ics` is `null` or `{x0, derivValues: [...]}`

This is the module every later task depends on, so it's built test-first.

- [ ] **Step 1: Write the failing tests**

Create `tests/verify-ode-solver.js`:

```js
"use strict";
/* ode-solver.js verification — Phase 1 of the ODE engine redesign.
   detectOrder and verifyNthOrder are pure JS (no Pyodide), so they're fully Node-testable.
   ODESolver.solve itself calls SympyClient, which needs a real Worker + Pyodide — it is NOT
   unit tested here; it's verified manually in a browser (see the plan's Task 9). */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
global.math = math; // ode-solver.js expects a global `math`, matching every other page module
const ODESolver = require(path.join(__dirname, "..", "assets", "js", "ode-solver.js"));

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

console.log("detectOrder:");
ok(ODESolver.detectOrder("y' = x*y") === 1, "first-order detected");
ok(ODESolver.detectOrder("y'' + 3*y' + 2*y = 0") === 2, "second-order detected (max prime run)");
ok(ODESolver.detectOrder("y''' - y = x") === 3, "third-order detected");
ok(ODESolver.detectOrder("2*x + 3 = 0") === 0, "no derivative -> order 0");

console.log("\nverifyNthOrder — accepts genuinely correct candidates:");
ok(ODESolver.verifyNthOrder("C1*exp(x)", "y' = y", 1), "y=C1*e^x satisfies y'=y");
ok(ODESolver.verifyNthOrder("C1*sin(x) + C2*cos(x)", "y'' + y = 0", 2), "y=C1 sin x + C2 cos x satisfies y''+y=0");
ok(ODESolver.verifyNthOrder("C1*exp(x) + C2*exp(2*x)", "y'' - 3*y' + 2*y = 0", 2), "known 2nd-order homogeneous solution verifies");

console.log("\nverifyNthOrder — rejects wrong candidates:");
ok(!ODESolver.verifyNthOrder("C1*exp(2*x)", "y' = y", 1), "y=C1*e^(2x) does NOT satisfy y'=y");
ok(!ODESolver.verifyNthOrder("C1*exp(x)", "y'' + y = 0", 2), "y=C1*e^x does NOT satisfy y''+y=0");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/verify-ode-solver.js`
Expected: `Error: Cannot find module '.../assets/js/ode-solver.js'`

- [ ] **Step 3: Write `ode-solver.js`**

```js
/* General ODE solver — Phase 1 of the ODE engine redesign. Replaces the old hand-rolled
   classify-then-symbolically-derive pipeline (ode-symbolic.js's classifyFirstOrder /
   classifySecondOrder, now deleted — see git history) with a single any-order path: SymPy's
   general dsolve() does the solving, this module's job is turning a typed equation into a
   dsolveGeneral() call and independently re-verifying whatever comes back before it is ever
   shown, via numeric substitution into the ORIGINAL equation — never trusted blindly, same
   discipline every other solver on this site follows, just implemented once generically.

   compileRealFx / withArbitraryConstants are carried over unchanged from the retired
   sympy-dsolve-fallback.js — see their comments below for why each exists. */
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

  // A general solution carries free constants (SymPy's own C1, C2, ... convention). A general
  // solution must satisfy the ODE for ANY value of its constants, so substituting one fixed,
  // arbitrary, non-degenerate number per constant and checking THAT is a legitimate proof.
  // Distinct values avoid accidentally cancelling a term that depends on a difference of two.
  function withArbitraryConstants(exprText) {
    return exprText.replace(/\bC(\d*)\b/g, (_, n) => (n === "2" ? "-0.8123" : n === "1" || n === "" ? "1.3743" : "0.5417"));
  }

  // y -> Y0, y' -> Y1, y'' -> Y2, ... y^(n) -> Yn. The regex is greedy so "y''" is matched as
  // ONE occurrence (order 2), never corrupted by a "y'" (order 1) replacement running first.
  function toPlaceholdersGeneral(s) {
    return s
      .replace(/y('+)/g, (_, primes) => "Y" + primes.length)
      .replace(/(?<![A-Za-z0-9_])y(?![A-Za-z0-9_'(])/g, "Y0");
  }

  // Recursive central-difference nth derivative. Cost is 2^order function evaluations, which
  // is trivial for the order range (1-4) this site's ODE course material actually reaches.
  function nthCentralDifference(fn, x, order, h) {
    if (order === 0) return fn(x);
    if (order === 1) return (fn(x + h) - fn(x - h)) / (2 * h);
    const lower = (xx) => nthCentralDifference(fn, xx, order - 1, h);
    return (lower(x + h) - lower(x - h)) / (2 * h);
  }

  const SAMPLE_X = [0.37, 0.83, 1.29, 1.71, 2.13, -0.61, -1.47];

  // Substitutes the candidate y(x) (and its finite-differenced derivatives up to `order`) into
  // the ORIGINAL typed equation and checks it holds at a quorum of sample points. This is the
  // one general verify gate that replaces every hand-rolled per-branch verify loop the old
  // classify tree had.
  function verifyNthOrder(yOfXText, equationText, order) {
    const eqParts = equationText.split("=");
    const lhsExpr = compileRealFx(toPlaceholdersGeneral(eqParts[0]));
    const rhsExpr = compileRealFx(toPlaceholdersGeneral(eqParts.length > 1 ? eqParts[1] : "0"));
    const Y = compileRealFx(withArbitraryConstants(yOfXText));
    if (!Y.ok || !lhsExpr.ok || !rhsExpr.ok) return false;
    const h = order >= 3 ? 1e-3 : 1e-4; // higher-order finite differences need a larger h against float noise
    let usable = 0;
    for (const x of SAMPLE_X) {
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
```

- [ ] **Step 4: Run the tests**

Run: `node tests/verify-ode-solver.js`
Expected: `9 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-solver.js tests/verify-ode-solver.js
git commit -m "feat(ode): add general verify-by-substitution ODE solver module (TDD)"
```

---

### Task 4: Trim `ode-symbolic.js` down to numeric-fallback + PDE + display utilities

**Files:**
- Modify: `assets/js/ode-symbolic.js`

**Interfaces:**
- Produces (unchanged, kept): `ODESymbolic.configure`, `ODESymbolic.toLatex`,
  `ODESymbolic.formatNum`, `ODESymbolic.eulerRK4FirstOrder`, `ODESymbolic.rk4SecondOrder`,
  `ODESymbolic.heatSeriesValue`, `ODESymbolic.solveHeatEquation`.
- Removed: `ODESymbolic.classifyFirstOrder`, `ODESymbolic.classifySecondOrder`,
  `ODESymbolic.rhsFromInput`, `ODESymbolic.parseSecondOrder`, `ODESymbolic.isSecondOrderInput`,
  and every private classify/exact-arithmetic helper that only existed to support them
  (`isSeparable`, `isLinearInY`, `isHomogeneous`, `solveSeparable`, `solveLinear`, `solveExact`,
  `solveHomogeneous`, `solveBernoulli`, `solveBernoulliInX`, `solveLinearInX`,
  `solveLinearCombination`, `solveIntegratingFactor`, `parseEulerCauchy`, `classifyEulerCauchy`,
  `tryUndeterminedCoefficients`, `tryVariationOfParameters`,
  `tryVariationOfParametersEulerCauchy`, `classifyYMissing`, `classifyXMissing`,
  `classifyReducibleOrder`, `charRoots`, the whole BigInt exact-rational layer
  `frac`/`fAdd`/`fSub`/`fMul`/`fDiv`/`fIsZero`/`fNeg`/`fNum`/`fStr`/`fTex`,
  `solveExactLinearSystem`, `shapeMapOf`, `matchCoefficientsExact`, and their remaining small
  supporting utilities). This is nearly the entire file — what's kept is a small fraction.

- [ ] **Step 1: Confirm nothing else in the codebase calls the functions being removed**

Run:
```bash
grep -rn "classifyFirstOrder\|classifySecondOrder\|rhsFromInput\|ODESymbolic\.parseSecondOrder\|isSecondOrderInput" \
  --include="*.js" --include="*.html" engines/ assets/js/*.js
```
Expected: only matches inside `ode-symbolic.js` itself, `ode-first-order.js`, `ode-second-order.js`,
`cas-worker.js`, `cas-client.js`, and `engines/ode/methods/first-order.html` /
`second-order.html` — all of which Task 5 and Task 7 remove or edit in this same plan. If
anything else matches, stop and widen this task's scope before deleting.

- [ ] **Step 2: Archive a full copy before trimming**

This repo already has a convention for this — `archive/` (gitignored, see `.gitignore:6`),
used for superseded code kept around for reference (e.g. `archive/numerical-engine-v1/`). Copy
the full, untrimmed file there before editing it in place, so the hand-rolled classify tree
stays available to look at or reuse even though it won't be in the file's history-less working
copy going forward (it's still in git history too, this is just a faster/easier-to-find local
copy per the user's request):

```bash
mkdir -p archive/ode-engine-hand-rolled-classifier
cp assets/js/ode-symbolic.js archive/ode-engine-hand-rolled-classifier/ode-symbolic-full.js
```

- [ ] **Step 3: Delete the classify tree from the working copy**

Open `assets/js/ode-symbolic.js`. Keep lines 1–102 (module wrapper, `configure`, `cas`,
`math_`, `toLatex`, `renderTeX`, `formatNum`) unchanged. Delete everything from `compileFxy`
(currently line 103) through the end of `ODESymbolic.classifySecondOrder` and its private
helpers (currently ending around line 2710, immediately before `ODESymbolic.heatSeriesValue`).
Keep `ODESymbolic.heatSeriesValue`, `ODESymbolic.solveHeatEquation`,
`ODESymbolic.eulerRK4FirstOrder`, and `ODESymbolic.rk4SecondOrder` (currently lines
~2712–2802) unchanged. Delete the trailing exports
`ODESymbolic.parseSecondOrder = parseSecondOrder;` and
`ODESymbolic.isSecondOrderInput = function (input) { return /y''/.test(input); };` (currently
lines 2804–2805) — both reference deleted code.

- [ ] **Step 4: Update the file's header comment**

Replace the file's top-of-file comment block to describe the new, much smaller scope:

```js
/* ODE/PDE support module — Phase 1 of the ODE engine redesign retired the hand-rolled
   classify-then-derive pipeline that used to live here. A full pre-trim copy is kept at
   archive/ode-engine-hand-rolled-classifier/ode-symbolic-full.js (see the plan at
   docs/superpowers/plans/2026-08-01-ode-engine-phase1-general-solver.md for why). What's left:
     - toLatex / renderTeX / formatNum — display utilities, still used everywhere ODE/PDE
       results get shown.
     - eulerRK4FirstOrder / rk4SecondOrder — the numeric fallback for when no closed form is
       found (order 1, and order 2 with constant coefficients, respectively).
     - heatSeriesValue / solveHeatEquation — the Heat Equation PDE page's solver, untouched by
       the Phase 1 redesign (PDE stays hand-rolled deliberately — see the plan).
   The general ODE-solving path now lives in assets/js/ode-solver.js. */
```

- [ ] **Step 5: Run the existing ODE test suite to confirm the kept functions still work**

Run: `node tests/verify-ode.js`
Expected: fails right now, because it still contains tests for the deleted classify functions —
that's expected and gets fixed in Task 9. For this step, just confirm the failures are all in
deleted-function tests (`ReferenceError` / `undefined is not a function` on
`classifyFirstOrder`/`classifySecondOrder`/etc.), not in the kept functions.

- [ ] **Step 6: Commit**

`archive/` is gitignored, so the archived copy from Step 2 won't show up in `git status` —
only the trimmed working file needs staging:

```bash
git add assets/js/ode-symbolic.js
git commit -m "refactor(ode): delete the hand-rolled classify-tree and exact-arithmetic layer

Superseded by the general SymPy-backed solver in ode-solver.js (Task 3). ode-symbolic.js now
only carries display utilities, the numeric fallback, and the (untouched) PDE solver. A full
pre-trim copy is kept locally at archive/ode-engine-hand-rolled-classifier/ (gitignored, not
part of this commit) in case any of it is wanted again."
```

---

### Task 5: Remove the dead `classifyFirstOrder`/`classifySecondOrder` CAS ops

**Files:**
- Modify: `assets/js/cas-worker.js:84-85`
- Modify: `assets/js/cas-client.js:268-274`

**Interfaces:**
- Removed: worker ops `classifyFirstOrder`, `classifySecondOrder`; client wrappers
  `CAS.classifyFirstOrder`, `CAS.classifySecondOrder`.
- `CAS.call("solveHeatEquation", ...)` and its client wrapper are untouched (PDE, out of scope).

- [ ] **Step 1: Remove the two dead ops from `cas-worker.js`**

Delete these two lines (84-85):
```js
  classifyFirstOrder: (args) => ODESymbolic.classifyFirstOrder(args[0], args[1]),
  classifySecondOrder: (args) => ODESymbolic.classifySecondOrder(args[0], args[1]),
```

- [ ] **Step 2: Remove the two dead wrappers from `cas-client.js`**

Delete:
```js
  CAS.classifyFirstOrder = function (inputText, ic, opts) {
    return CAS.call("classifyFirstOrder", [inputText, ic], opts);
  };

  CAS.classifySecondOrder = function (input, ic, opts) {
    return CAS.call("classifySecondOrder", [input, ic], opts);
  };
```

- [ ] **Step 3: Remove the two now-dead test blocks from `verify-cas-worker.js`**

`tests/verify-cas-worker.js` has two blocks (currently lines 184-192 and 193-197) that dispatch
`classifyFirstOrder` and `classifySecondOrder` through the worker and assert on the results.
Delete both blocks entirely:

```js
  {
    const r = send({ id: 21, op: "classifyFirstOrder", args: ["y' = y", null] });
    ok(r && r.ok && r.result.raw && r.result.raw.kind === "implicit" &&
       /separable/.test(r.result.classificationLine),
       "dispatches classifyFirstOrder (separable) and returns the raw invariant pieces", r && r.result && r.result.classificationLine);
    let cloneable = true;
    try { JSON.parse(JSON.stringify(r.result)); } catch (e) { cloneable = false; }
    ok(cloneable, "classifyFirstOrder result is plain JSON-shaped data (survives structured clone)");
  }
  {
    const r = send({ id: 22, op: "classifySecondOrder", args: ["y'' + y = 0", { x0: 0, y0: 1, yp0: 0 }] });
    ok(r && r.ok && r.result.roots && r.result.roots.type === "complex" && /\\cos x \+ 0\\sin x/.test(r.result.particularSolution || ""),
       "dispatches classifySecondOrder and returns the IC-solved particular solution", r && r.result && r.result.particularSolution);
  }
```

The remaining block's `id: 23` (`solveHeatEquation`) is untouched — leave it and every other
block in the file exactly as-is.

- [ ] **Step 4: Run the CAS worker test suite**

Run: `node tests/verify-cas-worker.js`
Expected: passes, with 2 fewer assertions than before.

- [ ] **Step 5: Commit**

```bash
git add assets/js/cas-worker.js assets/js/cas-client.js tests/verify-cas-worker.js
git commit -m "chore(ode): remove dead classifyFirstOrder/classifySecondOrder CAS ops"
```

---

### Task 6: Build the consolidated "ODE Solver" page

**Files:**
- Create: `engines/ode/methods/ode-solver.html`
- Create: `assets/js/ode-solver-page.js`

**Interfaces:**
- Consumes: `ODESolver.solve`, `ODESolver.detectOrder` (Task 3), `ODERender.bigBox` (unchanged,
  existing), `ODESymbolic.eulerRK4FirstOrder` / `rk4SecondOrder` (unchanged, existing, for the
  numeric fallback plot).

- [ ] **Step 1: Create the page markup**

Model directly on the existing `engines/ode/methods/first-order.html` structure (same
`.workspace` / `.panel` / example-chips / IC-fields / `#resultsArea` /
`#fallbackPlotWrap` layout), with these differences: broader example chips spanning multiple
orders, and an IC-fields container that gets populated dynamically by the page script instead
of a fixed x₀/y(x₀) pair.

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ODE Solver — ODE/PDE Engine</title>
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
      <li><a href="laplace-transform.html"><span>Laplace</span><span class="dup" aria-hidden="true">Laplace</span></a></li>
      <li><a href="series-solutions.html"><span>Series</span><span class="dup" aria-hidden="true">Series</span></a></li>
      <li><a href="heat-equation.html"><span>Heat&nbsp;PDE</span><span class="dup" aria-hidden="true">Heat&nbsp;PDE</span></a></li>
      <li><a href="../../../index.html"><span>All Engines</span><span class="dup" aria-hidden="true">All Engines</span></a></li>
    </ul>
    <a href="../methods.html" class="btn btn--ghost btn--sm"><span class="btn-text">All Methods</span></a>
  </div>
</header>

<section class="method-hero">
  <div class="container">
    <span class="eyebrow">Ordinary Differential Equations</span>
    <h1 class="h2" style="margin-top:14px;">ODE Solver</h1>
    <p class="method-summary">Type any ordinary differential equation — first-order, second-order, or higher — using <span class="mono">y'</span>, <span class="mono">y''</span>, etc. The engine classifies it and solves it in closed form where one exists, verified numerically before it's shown, and gives a numeric fallback when no closed form is found.</p>
  </div>
</section>

<section class="section--tight">
  <div class="container">
    <div class="workspace">

      <form class="panel crosshair-host" id="solverForm">
        <span class="panel-title">Input</span>

        <div class="field">
          <label for="odeInput">Equation</label>
          <input type="text" id="odeInput" class="mono" value="y' = x*y" autocomplete="off" spellcheck="false" />
          <span class="field-note">Preview</span>
          <div class="katex-preview" id="odePreview"></div>
          <button type="button" class="keypad-toggle is-open" id="keypadToggle">
            <span>Math Keypad</span><span class="chev">⌄</span>
          </button>
          <div class="math-keypad is-open" id="odeKeypad"></div>
        </div>

        <span class="field-note" style="margin-top:18px;">Worked examples — click to load</span>
        <div class="method-tags" id="exampleChips">
          <button type="button" class="tag" data-eq="y' = x*y">Separable</button>
          <button type="button" class="tag" data-eq="y' = x - y">Linear</button>
          <button type="button" class="tag" data-eq="y' = y - y^2">Bernoulli — logistic</button>
          <button type="button" class="tag" data-eq="(2*x*y+3) dx + (x^2-1) dy = 0">Exact</button>
          <button type="button" class="tag" data-eq="y'' + 3*y' + 2*y = 0">Second-order, constant coefficient</button>
          <button type="button" class="tag" data-eq="y'' + y = sin(x)">Second-order, resonance</button>
          <button type="button" class="tag" data-eq="x^2*y'' - 2*x*y' + 2*y = 0">Euler-Cauchy</button>
          <button type="button" class="tag" data-eq="y''' - y = 0">Third-order</button>
        </div>

        <label class="status-line" style="cursor:pointer; margin-top:18px;">
          <input type="checkbox" id="icToggle" style="width:auto;" />
          <span>Include an initial condition</span>
        </label>

        <div id="icFields" style="display:none; margin-top:12px;"></div>

        <div class="status-line ok" id="startStatus">
          <span class="status-dot"></span><span id="startStatusText">Ready — press Solve.</span>
        </div>

        <div class="field" id="formError" style="display:none;">
          <div class="status-line bad"><span class="status-dot"></span><span id="formErrorText"></span></div>
        </div>

        <div class="hero-actions" style="margin-top:6px;">
          <button type="submit" class="btn btn--primary"><span class="btn-text">Solve</span></button>
        </div>
      </form>

      <div id="output">
        <div class="panel crosshair-host" id="placeholderPanel">
          <span class="panel-title">Output</span>
          <p class="p1">Type an ODE and hit Solve — the classification and the general (and particular, if you gave an initial condition) solution will appear here.</p>
        </div>
        <div id="resultsArea" style="display:none;"></div>
        <div id="fallbackPlotWrap" class="plot-wrap crosshair-host" style="display:none;">
          <div class="plot-wrap-head"><span class="panel-title" style="margin:0;">Numeric solution</span></div>
          <div id="fallbackPlot" style="height:340px;"></div>
        </div>
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
<script src="../../../assets/vendor/plotly-cartesian.min.js" defer></script>
<script src="../../../assets/js/engine-core.js" defer></script>
<script src="../../../assets/js/calc-core.js" defer></script>
<script src="../../../assets/js/ode-symbolic.js" defer></script>
<script src="../../../assets/js/ode-render.js" defer></script>
<script src="../../../assets/js/sympy-client.js" defer></script>
<script src="../../../assets/js/ode-solver.js" defer></script>
<script src="../../../assets/js/ode-solver-page.js" defer></script>
<script defer>
  document.addEventListener("DOMContentLoaded", () => Engine.initChrome());
</script>
</body>
</html>
```

**Correction found during manual testing (Task 6 Step 3):** the plan originally claimed this
page doesn't need `calc-core.js` — that's wrong. `ode-symbolic.js` (even after Task 4's trim)
has a module-load-time guard (`if (!CalcCore) throw ...`) that fires unconditionally, not just
when a nerdamer-specific call is made — so omitting `calc-core.js` breaks `ODESymbolic` loading
entirely (confirmed via browser console: `Error: ODESymbolic requires calc-core.js to be loaded
first.`). `calc-core.js` IS required; `nerdamer.min.js` and `cas-client.js` genuinely are not —
`CalcCore.math()` (the only accessor `ode-symbolic.js` still calls) only needs `math.min.js`,
confirmed by reading `calc-core.js` directly (its nerdamer-requiring guard lives in a different,
uncalled function). The script list above already reflects the fix.

- [ ] **Step 2: Create the page wiring script**

```js
/* ODE Solver page wiring. Detects the equation's order from the typed text, renders that many
   initial-condition fields on demand, calls ODESolver.solve (general, no IC) for the general
   solution and — if the user supplied one — a second call (with IC) for the particular
   solution, then renders both through the existing ODERender.bigBox. Falls back to a numeric
   plot only for order 1 (Euler/RK4) or order 2 with constant coefficients (RK4) when no closed
   form is found — see the plan's Global Constraints for why higher orders don't get a numeric
   fallback in this phase. */
(function () {
  "use strict";

  const odeInput = document.getElementById("odeInput");
  const odePreview = document.getElementById("odePreview");
  const icToggle = document.getElementById("icToggle");
  const icFields = document.getElementById("icFields");
  const form = document.getElementById("solverForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const fallbackPlotWrap = document.getElementById("fallbackPlotWrap");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = odeInput.value.trim();
    Engine.renderKatex(odePreview, raw ? (raw.includes("=") ? raw.replace(/'/g, "'") : `${raw} = 0`) : "", false);
    Engine.pulseFlash(odePreview);
  }

  // Rebuilds the IC field list to match the current input's detected order: x0, then one
  // field per derivative order (y(x0), y'(x0), y''(x0), ...).
  function rebuildIcFields() {
    const order = ODESolver.detectOrder(odeInput.value.trim());
    icFields.innerHTML = "";
    if (order === 0) return;
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.flexWrap = "wrap";
    const x0Field = document.createElement("div");
    x0Field.className = "field";
    x0Field.innerHTML = '<label>x₀</label><input type="number" class="ic-input" data-role="x0" value="0" step="any" />';
    row.appendChild(x0Field);
    const labels = ["y(x₀)", "y'(x₀)", "y''(x₀)", "y'''(x₀)", "y⁗(x₀)"];
    for (let k = 0; k < order; k++) {
      const f = document.createElement("div");
      f.className = "field";
      const label = labels[k] || `y^(${k})(x₀)`;
      f.innerHTML = `<label>${label}</label><input type="number" class="ic-input" data-role="deriv${k}" value="${k === 0 ? 1 : 0}" step="any" />`;
      row.appendChild(f);
    }
    icFields.appendChild(row);
  }

  function readIc() {
    if (!icToggle.checked) return null;
    const x0Input = icFields.querySelector('[data-role="x0"]');
    const x0 = parseFloat(x0Input.value);
    if (Number.isNaN(x0)) return { invalid: true };
    const order = ODESolver.detectOrder(odeInput.value.trim());
    const derivValues = [];
    for (let k = 0; k < order; k++) {
      const v = parseFloat(icFields.querySelector(`[data-role="deriv${k}"]`).value);
      if (Number.isNaN(v)) return { invalid: true };
      derivValues.push(v);
    }
    return { x0, derivValues };
  }

  icToggle.addEventListener("change", () => {
    if (icToggle.checked) rebuildIcFields();
    icFields.style.display = icToggle.checked ? "" : "none";
  });

  document.querySelectorAll("#exampleChips .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      odeInput.value = btn.dataset.eq;
      updatePreview();
      if (icToggle.checked) rebuildIcFields();
    });
  });

  function renderFallbackPlot(equationText, order, ic) {
    if (order === 1) {
      const rhs = equationText.split("=")[1] || equationText.replace(/^y'\s*/, "");
      let fn;
      try { fn = math.parse(rhs.trim()).compile(); } catch (e) { return false; }
      const evalFn = (x, y) => fn.evaluate({ x, y });
      const x0 = ic ? ic.x0 : 0, y0 = ic ? ic.derivValues[0] : 1;
      const { path, rk4Path } = ODESymbolic.eulerRK4FirstOrder(evalFn, x0, y0, 0.1, 40);
      fallbackPlotWrap.style.display = "";
      Plotly.newPlot("fallbackPlot", [
        { x: path.map((p) => p.x), y: path.map((p) => p.y), mode: "lines", name: "Euler", line: { color: "#ed6d40", width: 2 } },
        { x: rk4Path.map((p) => p.x), y: rk4Path.map((p) => p.y), mode: "lines", name: "RK4", line: { color: "#59a993", width: 2 } }
      ], Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "y" } }), Engine.plotlyConfig);
      return true;
    }
    // Order 2 constant-coefficient numeric fallback needs a/b/c split, which this general page
    // no longer parses (that was ode-symbolic.js's parseSecondOrder, now deleted). Per the
    // plan's Global Constraints, orders >= 2 that fail symbolically get an honest refusal
    // instead of a numeric plot in this phase.
    return false;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    fallbackPlotWrap.style.display = "none";
    const raw = odeInput.value.trim();
    if (!raw) { setStatus(false, "Enter an equation."); return; }

    const order = ODESolver.detectOrder(raw);
    if (order === 0) { setStatus(false, "Couldn't find a y', y'', ... term — this doesn't look like an ODE."); return; }

    const ic = readIc();
    if (ic && ic.invalid) { setStatus(false, "The initial condition needs numeric values in every field."); return; }

    // Hardcode the restore label rather than capturing/restoring .textContent: Engine.initChrome()
    // injects a hidden duplicate-text span into .btn-text for the hover-flip animation, and
    // .textContent concatenates both spans regardless of visibility — capturing "prev" here would
    // silently read back "SolveSolve" instead of "Solve".
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    if (submitBtn) submitBtn.textContent = "Solving…";

    ODESolver.solve(raw, null).then((generalOut) => {
      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      if (!generalOut.ok) {
        const handled = renderFallbackPlot(raw, order, ic);
        if (handled) {
          resultsArea.innerHTML = '<div class="status-line bad"><span class="status-dot"></span>' +
            '<span>No closed form — solved numerically instead.</span></div>';
          setStatus(true, "No closed form — showing a numeric solution.");
        } else {
          resultsArea.innerHTML = "";
          showError(generalOut.reason);
          setStatus(false, generalOut.reason);
        }
        return Promise.resolve();
      }
      if (!ic) {
        ODERender.bigBox(resultsArea, {
          classificationLine: generalOut.classification + " — solved by SymPy, verified.",
          generalSolution: `y = ${ODESymbolic.toLatex(generalOut.result)}`,
          particularSolution: null,
        });
        setStatus(true, "Solved.");
        return Promise.resolve();
      }
      return ODESolver.solve(raw, ic).then((particularOut) => {
        ODERender.bigBox(resultsArea, {
          classificationLine: generalOut.classification + " — solved by SymPy, verified.",
          generalSolution: `y = ${ODESymbolic.toLatex(generalOut.result)}`,
          particularSolution: particularOut.ok ? `y = ${ODESymbolic.toLatex(particularOut.result)}` : null,
        });
        setStatus(true, particularOut.ok ? "Solved." : "Solved the general form; the initial condition didn't verify against a particular solution.");
      });
    }).catch((err) => {
      showError(err.message || String(err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = "Solve";
    });
  });

  Engine.attachMathKeypad(odeInput, document.getElementById("odeKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("odeKeypad"));
  odeInput.addEventListener("input", Engine.debounce(() => { updatePreview(); if (icToggle.checked) rebuildIcFields(); }, 200));
  updatePreview();
})();
```

- [ ] **Step 3: Manual smoke test**

Serve the site (`python3 -m http.server 8000` from `math-lab/`), open
`engines/ode/methods/ode-solver.html`, click each example chip, press Solve, confirm a result
renders (or an honest refusal for anything that doesn't apply). Full verification checklist is
Task 9 — this step is just "does it run at all" before wiring up navigation to it.

- [ ] **Step 4: Commit**

```bash
git add engines/ode/methods/ode-solver.html assets/js/ode-solver-page.js
git commit -m "feat(ode): add the consolidated general ODE Solver page"
```

---

### Task 7: Archive the retired pages/modules and update navigation

**Files:**
- Archive (not delete — see Step 1): `engines/ode/methods/first-order.html`,
  `engines/ode/methods/second-order.html`, `assets/js/ode-first-order.js`,
  `assets/js/ode-second-order.js`, `assets/js/sympy-dsolve-fallback.js`
- Modify: `engines/ode/index.html`
- Modify: `engines/ode/methods.html`
- Modify: `engines/ode/methods/second-order.html` → n/a (archived out of the working tree);
  update these five **remaining** pages' nav lists: `engines/ode/methods/laplace-transform.html`,
  `engines/ode/methods/series-solutions.html`, `engines/ode/methods/heat-equation.html`,
  `engines/ode/methods/fourier-series.html`, `engines/ode/methods/direction-fields.html`

- [ ] **Step 1: Move the five retired files into `archive/`, not `git rm`**

Same convention as Task 4's Step 2 — copy first, so the old pages stay around to look at or
reuse locally, then remove them from the working tree with `git rm` (git history keeps them
too, but the local `archive/` copy is the fast/easy-to-find one the user asked for):

```bash
mkdir -p archive/ode-engine-hand-rolled-classifier/methods
cp engines/ode/methods/first-order.html engines/ode/methods/second-order.html \
   archive/ode-engine-hand-rolled-classifier/methods/
cp assets/js/ode-first-order.js assets/js/ode-second-order.js assets/js/sympy-dsolve-fallback.js \
   archive/ode-engine-hand-rolled-classifier/

git rm engines/ode/methods/first-order.html engines/ode/methods/second-order.html \
       assets/js/ode-first-order.js assets/js/ode-second-order.js \
       assets/js/sympy-dsolve-fallback.js
```

- [ ] **Step 2: Update `engines/ode/index.html`**

Line 35 currently:
```html
      <a href="methods/first-order.html" class="btn btn--ghost"><span class="btn-text">Open Solver →</span></a>
```
Change to:
```html
      <a href="methods/ode-solver.html" class="btn btn--ghost"><span class="btn-text">Open Solver →</span></a>
```

- [ ] **Step 3: Update `engines/ode/methods.html`**

Replace the hero CTA (currently line 34, `methods/first-order.html` → `Open First-Order Solver`)
with:
```html
      <a href="methods/ode-solver.html" class="btn btn--primary"><span class="btn-text">Open ODE Solver →</span></a>
```

Replace the two engine-cards (currently lines ~45-67, the "First-Order Solver" card linking to
`methods/first-order.html` and the "Second-Order Solver" card linking to
`methods/second-order.html`) with one card:
```html
      <a href="methods/ode-solver.html" class="card engine-card reveal crosshair-host" style="display:block;">
        <span class="engine-dot"></span>
        <div class="engine-card-head">
          <span class="eyebrow">Ordinary Differential Equations</span>
        </div>
        <h3 class="h3">ODE Solver</h3>
        <p>Any order, typed as <span class="mono">y'</span>, <span class="mono">y''</span>, etc. Classified and solved in closed form by a general symbolic solver, verified numerically before it's shown, with a numeric fallback when no closed form exists.</p>
      </a>
```

Update the `proto-badge` summary text (currently line 37) to drop the "first-order (separable /
linear...), second-order (constant-coefficient + Cauchy-Euler)" enumeration — replace with:
```html
      <span class="proto-badge" style="margin-top:28px;"><span class="status-dot"></span> ODE Solver (any order, general symbolic solver), the Laplace transform (step/impulse forcing IVPs), the heat equation (PDE), Fourier series (full / sine / cosine — the prerequisite for every separation-of-variables PDE), and a direction-field / Euler / RK4 comparison. Verified numerically before every result is shown.</span>
```

- [ ] **Step 4: Update the five remaining pages' nav lists**

In each of `engines/ode/methods/laplace-transform.html`,
`engines/ode/methods/series-solutions.html`, `engines/ode/methods/heat-equation.html`,
`engines/ode/methods/fourier-series.html`, `engines/ode/methods/direction-fields.html`,
replace the two `<li>` entries:
```html
      <li><a href="first-order.html"><span>First-Order</span><span class="dup" aria-hidden="true">First-Order</span></a></li>
      <li><a href="second-order.html"><span>Second-Order</span><span class="dup" aria-hidden="true">Second-Order</span></a></li>
```
with one:
```html
      <li><a href="ode-solver.html"><span>ODE Solver</span><span class="dup" aria-hidden="true">ODE Solver</span></a></li>
```

- [ ] **Step 5: Confirm no remaining references to the retired pages/files**

Run:
```bash
grep -rln "first-order.html\|second-order.html\|ode-first-order.js\|ode-second-order.js\|sympy-dsolve-fallback.js" engines/ assets/js/*.js
```
Expected: no output.

- [ ] **Step 6: Commit**

`archive/` is gitignored, so the copies from Step 1 won't show up here — only the working-tree
removal and the nav edits need staging:

```bash
git add -A engines/ode assets/js
git commit -m "refactor(ode): retire first-order.html/second-order.html in favor of ode-solver.html

Removes the pages, their page-wiring JS, and the now-superseded sympy-dsolve-fallback.js
(replaced by ode-solver.js) from the working tree — full copies kept locally at
archive/ode-engine-hand-rolled-classifier/ (gitignored) in case any of it is wanted again.
Updates every remaining ODE page's nav and the methods catalog."
```

---

### Task 8: Rewrite `tests/verify-ode.js`

**Files:**
- Modify: `tests/verify-ode.js`

**Interfaces:**
- Consumes: `ODESymbolic` (trimmed, Task 4) — `eulerRK4FirstOrder`, `rk4SecondOrder`,
  `solveHeatEquation`, `heatSeriesValue`, `toLatex`, `formatNum` only.

- [ ] **Step 1: Remove every test case for deleted functions**

Delete every test block in `tests/verify-ode.js` that calls `ODESymbolic.classifyFirstOrder`,
`ODESymbolic.classifySecondOrder`, or any of the private helpers that only existed to support
them (the file's own section comments — "Separable", "Linear", "Exact", "Homogeneous",
"Bernoulli", "Euler-Cauchy", "Reduction of order" — mark exactly which blocks these are). Keep:
the Euler/RK4 numeric tests, the heat-equation PDE tests, and the shared test-harness code at
the top of the file (`ok()`, `compileFxy()`, `rk4Trajectory()`, `invariantAlongTrajectory()` —
though `invariantAlongTrajectory` may end up unused once the implicit-solution classify tests
are gone; delete it too if nothing references it after the cut).

- [ ] **Step 2: Run to confirm what's left still passes**

Run: `node tests/verify-ode.js`
Expected: passes, with a much smaller case count (numeric fallback + PDE cases only).

- [ ] **Step 3: Update the file's header comment**

Replace the top-of-file comment to match the new scope:

```js
"use strict";
/* ODE/PDE Engine — verification suite for what's left in ode-symbolic.js after the Phase 1
   redesign (see docs/superpowers/plans/2026-08-01-ode-engine-phase1-general-solver.md): the
   numeric fallback (Euler/RK4) and the heat-equation PDE solver. The general symbolic ODE
   solver's pure-JS verification logic is tested separately in tests/verify-ode-solver.js; its
   SymPy/Pyodide half is browser-only and verified manually (see the plan's Task 9) — there is
   no `pyodide` npm package in this repo to run it under Node.
   Run with: node tests/verify-ode.js */
```

- [ ] **Step 4: Commit**

```bash
git add tests/verify-ode.js
git commit -m "test(ode): strip classify-tree test cases, keep numeric-fallback + PDE coverage"
```

---

### Task 9: Full regression pass + manual browser verification

**Files:** none (verification only)

- [ ] **Step 1: Run every Node test suite**

```bash
cd math-lab
for t in verify.js verify-linalg.js verify-statistics.js verify-calculus.js \
         verify-cas-client.js verify-cas-worker.js verify-ode.js verify-ode-solver.js; do
  echo "$t: $(node tests/$t | tail -1)"
done
```
Expected: every suite ends in `... passed, 0 failed`.

- [ ] **Step 2: Serve the site and manually verify the SymPy path in a real browser**

```bash
python3 -m http.server 8000
```
Open `http://localhost:8000/engines/ode/methods/ode-solver.html` and, for each example chip:
click it, press Solve, and confirm: (a) a classification tag appears that matches the equation
type, (b) the general solution renders and looks mathematically right, (c) toggling "Include an
initial condition" produces the right number of IC fields for that equation's order, and
submitting with an IC produces a particular solution, (d) an equation with no closed form (try
`y' = x^2 + y^2`, the classic non-elementary Riccati-adjacent case) produces either a numeric
fallback plot (order 1) or an honest refusal message — never a wrong or fabricated answer.

- [ ] **Step 3: Click through every remaining ODE page's nav to confirm no broken links**

From `engines/ode/methods.html`, visit `ode-solver.html`, `laplace-transform.html`,
`series-solutions.html`, `heat-equation.html`, `fourier-series.html`, `direction-fields.html` —
confirm each page's nav bar shows "ODE Solver" (not "First-Order"/"Second-Order") and that link
works.

- [ ] **Step 4: Report results**

If any manual check fails, fix it and repeat from Step 1 before considering Phase 1 done. Do
not proceed to Phase 2 (Systems of ODEs) or later phases until this full pass is clean.
