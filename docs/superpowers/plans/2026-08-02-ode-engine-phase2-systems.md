# ODE Engine Phase 2 — Systems of ODEs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch — this run explicitly opted out of subagent-driven-development). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new consolidated page solving first-order linear systems `x' = Ax + g(t)`, any n×n,
verified numerically before the answer is ever shown — `dsolve()` does the algebra generically;
the only hand-rolled piece is the n=2 equilibrium classification (node/saddle/spiral/center),
reusing the Linear Algebra Engine's existing eigenvalue solver.

**Architecture:** A new `_dsolve_system` Python function in the SymPy worker builds the system of
`Eq`s from a matrix and forcing vector and calls `sp.dsolve()`. A new pure-JS module
(`ode-systems.js`) orchestrates the call, independently re-verifies by numeric substitution
(finite differences, same discipline as Phase 1's `ode-solver.js`), and — only at n=2 — classifies
the equilibrium via `LinAlg.eigenvalues`. A new page (`systems.html`) wires matrix/vector inputs
to this module and renders a phase-portrait plot (vector field + trajectories) at n=2, reusing the
exact Plotly `shapes`-line-segment technique already in `ode-direction-fields.js`.

**Tech Stack:** Same as Phase 1 — vanilla JS (UMD modules, no build step), SymPy via Pyodide
(already vendored/wired), math.js, existing site CSS/KaTeX/Plotly conventions.

Full design rationale: `docs/superpowers/specs/2026-08-02-ode-engine-phase2-systems-design.md`.

## Global Constraints

- No build step — plain `<script defer>` includes, matching every other page.
- Every returned symbolic answer MUST be independently verified by numeric substitution before
  being shown; a verification failure or `NotImplementedError` produces an honest refusal
  message, never a guessed/faked result.
- Follow the existing UMD module pattern (`window.X` / `module.exports`) for every new pure-JS
  module, so it stays Node-testable.
- The Pyodide/SymPy worker cannot be exercised from the Node test suite — Python-side changes are
  verified manually in a real browser, exactly like every other worker op.
- Phase-portrait rendering and node/saddle/spiral/center classification apply ONLY at n=2. At
  n≥3, show the solved component functions, the eigenvalues, and a general stability read
  (all real parts negative → asymptotically stable; any positive → unstable; mixed signs →
  saddle-type) — no portrait plot, no five-way classification (that's a 2D concept).
- Reuse, don't duplicate: `ODESolver.withArbitraryConstants` / `ODESolver.compileRealFx` (Phase
  1's substitution-verification primitives) are reused directly, not reimplemented — matches
  this project's no-overlapping-engine-files rule.
- Out of scope for this phase: nonlinear system linearization (Jacobian-based), n≥3 phase-space
  visualization, updating the nav links on the five pre-existing sibling method pages (that nav
  is already inconsistent page-to-page in this codebase — not this phase's job to fix).

---

### Task 1: `_dsolve_system` op in the SymPy worker

**Files:**
- Modify: `assets/js/sympy-worker.js`

**Interfaces:**
- Produces: a new whitelisted worker op `dsolveSystem`, callable as
  `pyodide.runPython('_dsolve_system(matrix_rows, g_list, ics_list)')` returning a JSON string
  `{"components": ["<x1(t) rhs>", "<x2(t) rhs>", ...]}` — one explicit closed-form string per
  state variable, in order.
- Consumes: nothing from other tasks (this is the first task).

This task is NOT Node-testable (no `pyodide` npm package in this repo) — it's verified manually
in a browser in Task 9's full pass, same as every other worker op in this file.

- [ ] **Step 1: Add `_dsolve_system` to the Python section of `sympy-worker.js`**

Find `_dsolve_general` (search for `def _dsolve_general`) and add this new function directly
after it:

```python
def _format_dsolve_system(sol, xs):
    # dsolve on a system returns a list of Eq(xi(t), expr), one per state variable, in whatever
    # order SymPy chose internally — never assume it matches the input order. Match each
    # equation back to its xi by lhs identity; refuse (as with the single-equation solver) if any
    # component came back in a form that isn't a plain xi(t) = <explicit expression>, since that's
    # the only shape the JS-side numeric verifier can substitute into.
    if not isinstance(sol, (list, tuple)):
        sol = [sol]
    by_func = {}
    for eq in sol:
        if not hasattr(eq, "lhs"):
            raise ValueError("SymPy returned a non-equation result for this system.")
        for i, xi in enumerate(xs):
            if eq.lhs == xi:
                by_func[i] = eq.rhs
    if len(by_func) != len(xs):
        raise ValueError("SymPy's system solution didn't come back as one explicit equation per state variable.")
    return [str(sp.simplify(by_func[i])) for i in range(len(xs))]

def _dsolve_system(matrix_rows, g_list, ics_list):
    t = sp.symbols('t')
    n = len(matrix_rows)
    funcs = [sp.Function('x' + str(i + 1)) for i in range(n)]
    xs = [f(t) for f in funcs]
    locals_map = {"e": sp.E, "I": sp.I, "t": t, "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}

    try:
        A = sp.Matrix([[sp.sympify(str(v)) for v in row] for row in matrix_rows])
        g = [sp.sympify(gi, locals=locals_map) for gi in g_list] if g_list else [sp.Integer(0)] * n
    except Exception as ex:
        raise ValueError("Couldn't parse the matrix or forcing term: " + str(ex))

    eqs = []
    for i in range(n):
        rhs = sum(A[i, j] * xs[j] for j in range(n)) + g[i]
        eqs.append(sp.Eq(xs[i].diff(t), rhs))

    ics = None
    if ics_list:
        ics = {}
        for i, val_str in enumerate(ics_list):
            ics[xs[i].subs(t, 0)] = sp.sympify(val_str)

    try:
        sol = sp.dsolve(eqs, xs, ics=ics)
    except NotImplementedError as ex:
        raise ValueError("No closed-form method matched this system: " + str(ex))
    except Exception as ex:
        raise ValueError("SymPy could not solve this system: " + str(ex))

    return json.dumps({"components": _format_dsolve_system(sol, xs)})
```

- [ ] **Step 2: Register the `dsolveSystem` op**

Find the ops dispatcher entry for `dsolveGeneral` (search for `dsolveGeneral: async`) and add
this new entry directly after it:

```javascript
  // Systems of first-order linear ODEs, x' = Ax + g(t) — Phase 2 of the ODE engine redesign.
  // matrixRows: number[][] (n x n). gList: string[] of length n (SymPy-syntax expressions in
  // t, or "0"). icsList: string[] of length n (x_i(0) values as strings), or [] for the
  // general solution with no IC applied.
  dsolveSystem: async (pyodide, args) => {
    const [matrixRows, gList, icsList] = args;
    return pyodide.runPython(
      `_dsolve_system(${JSON.stringify(matrixRows)}, ${JSON.stringify(gList)}, ${JSON.stringify(icsList)})`
    );
  },
```

- [ ] **Step 3: Commit**

```bash
git add assets/js/sympy-worker.js
git commit -m "feat(ode): add dsolveSystem op to the SymPy worker"
```

---

### Task 2: `SympyClient.dsolveSystem` wrapper

**Files:**
- Modify: `assets/js/sympy-client.js`

**Interfaces:**
- Consumes: the `dsolveSystem` worker op (Task 1).
- Produces: `SympyClient.dsolveSystem(matrixRows, gList, icsList, opts)` — a Promise resolving
  to `{ resultText }` where `resultText` is the JSON string from Task 1, matching the exact
  calling convention `SympyClient.dsolveGeneral` already uses (`SympyClient.call(opName, args,
  opts)`).

- [ ] **Step 1: Add the wrapper**

Find `SympyClient.dsolveGeneral` (search for `SympyClient.dsolveGeneral = function`) and add
this directly after its closing `};`:

```javascript
  // .dsolveSystem (ode-systems.js) — systems of first-order linear ODEs, Phase 2 of the ODE
  // engine redesign. matrixRows: number[][]. gList: string[]. icsList: string[] or [].
  SympyClient.dsolveSystem = function (matrixRows, gList, icsList, opts) {
    return SympyClient.call("dsolveSystem", [matrixRows, gList || [], icsList || []], opts);
  };
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/sympy-client.js
git commit -m "feat(ode): add SympyClient.dsolveSystem wrapper"
```

---

### Task 3: Export `compileRealFx` from `ode-solver.js` for reuse

**Files:**
- Modify: `assets/js/ode-solver.js`

**Interfaces:**
- Produces: `ODESolver.compileRealFx(exprStr)` — same function already used internally by
  `verifyNthOrder`, now also exposed for `ode-systems.js` to reuse rather than reimplement.

This is the one small edit to Phase 1's file that Phase 2 needs — avoids a second copy of
expression-compilation logic (this project's no-overlapping-engine-files rule).

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-ode-solver.js`, after the existing `detectOrder` block:

```javascript
console.log("\ncompileRealFx — exported for reuse by ode-systems.js:");
ok(typeof ODESolver.compileRealFx === "function", "compileRealFx is exported");
const compiled = ODESolver.compileRealFx("t^2 + 1");
ok(compiled.ok && compiled.fn({ t: 3 }) === 10, "compiled expression evaluates correctly");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-solver.js`
Expected: FAIL on `compileRealFx is exported` (`ODESolver.compileRealFx` is `undefined`).

- [ ] **Step 3: Export it**

In `assets/js/ode-solver.js`, find `function compileRealFx(exprStr) {` and, directly after that
function's closing `}` (right before the `withArbitraryConstants` comment block), add:

```javascript
  // Exposed for direct reuse by ode-systems.js (Phase 2) — verifying a linear system's
  // components needs the exact same real-valued-expression compilation, not a second copy.
  ODESolver.compileRealFx = compileRealFx;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-solver.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-solver.js tests/verify-ode-solver.js
git commit -m "refactor(ode): export ODESolver.compileRealFx for reuse by the systems module"
```

---

### Task 4: `ode-systems.js` — `verifySystem`

**Files:**
- Create: `assets/js/ode-systems.js`
- Test: `tests/verify-ode-systems.js`

**Interfaces:**
- Consumes: `ODESolver.withArbitraryConstants`, `ODESolver.compileRealFx` (Task 3).
- Produces: `ODESystems.verifySystem(components, matrixRows, gExprList)` — boolean. `components`:
  string[] of length n (each an expression in `t`, may contain `C1`, `C2`, ...). `matrixRows`:
  number[][] (n×n). `gExprList`: string[] of length n (math.js-syntax expressions in `t`).

- [ ] **Step 1: Write the failing test**

Create `tests/verify-ode-systems.js`:

```javascript
"use strict";
/* ode-systems.js verification — Phase 2 of the ODE engine redesign.
   verifySystem, classifyEquilibrium2D, and rk4System are pure JS (no Pyodide), so they're fully
   Node-testable. ODESystems.solve itself calls SympyClient, which needs a real Worker + Pyodide
   — it is NOT unit tested here; it's verified manually in a browser (see the plan's Task 9). */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
global.math = math; // ode-solver.js and ode-systems.js both expect a global `math`
const ODESolver = require(path.join(__dirname, "..", "assets", "js", "ode-solver.js"));
const LinAlg = require(path.join(__dirname, "..", "assets", "js", "linalg-algorithms.js"));
global.ODESolver = ODESolver;
global.LinAlg = LinAlg;
const ODESystems = require(path.join(__dirname, "..", "assets", "js", "ode-systems.js"));

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

console.log("verifySystem — accepts a genuinely correct candidate:");
// x' = [[0,1],[-1,0]] x, x(0)=[1,0] -> x1=cos t, x2=-sin t
ok(ODESystems.verifySystem(["C1*cos(t) - C2*sin(t)", "-C1*sin(t) - C2*cos(t)"], [[0, 1], [-1, 0]], ["0", "0"]),
  "x1=cos t (as C1 cos - C2 sin), x2=-sin t satisfies x'=[[0,1],[-1,0]]x");

console.log("\nverifySystem — rejects a wrong candidate:");
ok(!ODESystems.verifySystem(["C1*exp(t)", "C2*exp(t)"], [[0, 1], [-1, 0]], ["0", "0"]),
  "x1=x2=e^t does NOT satisfy x'=[[0,1],[-1,0]]x");

console.log("\nverifySystem — accounts for a nonzero forcing term g(t):");
// x' = [[0]] x + [t] i.e. dx/dt = t -> x = t^2/2 + C1
ok(ODESystems.verifySystem(["t^2/2 + C1"], [[0]], ["t"]), "x = t^2/2 + C1 satisfies x' = t");
ok(!ODESystems.verifySystem(["C1"], [[0]], ["t"]), "x = C1 does NOT satisfy x' = t");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-systems.js`
Expected: FAIL to even load — `Cannot find module '.../assets/js/ode-systems.js'`.

- [ ] **Step 3: Create `assets/js/ode-systems.js` with `verifySystem`**

```javascript
/* Systems of first-order linear ODEs, x' = Ax + g(t) — Phase 2 of the ODE engine redesign
   (see docs/superpowers/plans/2026-08-02-ode-engine-phase2-systems.md). SymPy's dsolve() does
   the algebra generically for any n; this module's job — same discipline as Phase 1's
   ode-solver.js — is turning matrix/vector input into a dsolveSystem() call and independently
   re-verifying whatever comes back before it is ever shown, via numeric substitution into the
   ORIGINAL system. At n=2 only, it also classifies the equilibrium (node/saddle/spiral/center)
   using the Linear Algebra Engine's existing eigenvalue solver — the one deliberately
   hand-rolled piece, a single bounded calculation, not a second classify tree.

   Depends on ODESolver (compileRealFx, withArbitraryConstants — reused, not reimplemented) and
   LinAlg (eigenvalues, eigenvectorsFor — reused for classification). Both must be loaded first. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ode-solver.js"), require("./linalg-algorithms.js"));
  } else {
    root.ODESystems = factory(root.ODESolver, root.LinAlg);
  }
})(typeof self !== "undefined" ? self : this, function (ODESolver, LinAlg) {
  "use strict";

  const ODESystems = {};

  // Substitutes each candidate xi(t) (and its central-differenced first derivative) into the
  // ORIGINAL system xi'(t) = row_i(A)*x(t) + g_i(t) and checks it holds at a quorum of sample
  // points — the system-of-equations analogue of ode-solver.js's verifyNthOrder. Systems are
  // always first-order (x' = Ax + g), so only a first derivative is ever needed.
  const SAMPLE_T = [0.37, 0.83, 1.29, 1.71, 2.13];
  const H = 1e-4;
  function verifySystem(components, matrixRows, gExprList) {
    const n = matrixRows.length;
    const compiled = components.map((c) => ODESolver.compileRealFx(ODESolver.withArbitraryConstants(c)));
    if (!compiled.every((c) => c.ok)) return false;
    const gList = gExprList && gExprList.length ? gExprList : matrixRows.map(() => "0");
    const gCompiled = gList.map((g) => ODESolver.compileRealFx(g));
    if (!gCompiled.every((c) => c.ok)) return false;

    let usable = 0;
    for (const t of SAMPLE_T) {
      let xVals, xDeriv, gVals;
      try {
        xVals = compiled.map((c) => c.fn({ t }));
        xDeriv = compiled.map((c) => (c.fn({ t: t + H }) - c.fn({ t: t - H })) / (2 * H));
        gVals = gCompiled.map((c) => c.fn({ t }));
      } catch (e) { continue; }
      if (![...xVals, ...xDeriv, ...gVals].every(Number.isFinite)) continue;

      let rowsOk = true;
      for (let i = 0; i < n; i++) {
        let expected = gVals[i];
        for (let j = 0; j < n; j++) expected += matrixRows[i][j] * xVals[j];
        if (Math.abs(xDeriv[i] - expected) > 5e-2 * Math.max(1, Math.abs(expected))) { rowsOk = false; break; }
      }
      if (rowsOk) usable++;
    }
    return usable >= 3;
  }
  ODESystems.verifySystem = verifySystem;

  return ODESystems;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-systems.js`
Expected: PASS, all 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-systems.js tests/verify-ode-systems.js
git commit -m "feat(ode): add verifySystem to the new systems module (TDD)"
```

---

### Task 5: `ode-systems.js` — `classifyEquilibrium2D`

**Files:**
- Modify: `assets/js/ode-systems.js`
- Modify: `tests/verify-ode-systems.js`

**Interfaces:**
- Consumes: `LinAlg.eigenvalues`, `LinAlg.eigenvectorsFor` (already in the codebase).
- Produces: `ODESystems.classifyEquilibrium2D(matrixRows)` — for a 2×2 `matrixRows`, returns
  `{ type, stability, eigenvalues }` where `type` is one of `"node"`, `"saddle"`,
  `"improper node"`, `"star node"`, `"spiral"`, `"center"`, or `"degenerate"`; `stability` is a
  short human-readable phrase; `eigenvalues` is `LinAlg.eigenvalues`'s own `.values` array
  (`{re, im}` pairs) unchanged, for direct display.
- Also produces: `ODESystems.stabilityFromEigenvalues(matrixRows)` — the n≥3 generalization
  (works for any n, including 2): `{ stability, eigenvalues }`, no five-way `type` (that's a 2D
  concept). `stability` is `"asymptotically stable"` (every real part < 0), `"unstable"` (any
  real part > 0 and none negative... see Step 3 for the exact three-way rule), or
  `"saddle-type"` (mixed signs). Required by the plan's Global Constraints (n≥3 must still show
  a stability read) — Task 7 attaches this at every n, and `classifyEquilibrium2D` additionally
  at n=2 only.

- [ ] **Step 1: Write the failing tests**

Add to `tests/verify-ode-systems.js`, after the `verifySystem` blocks:

```javascript
console.log("\nclassifyEquilibrium2D — the five standard equilibrium types:");
ok(ODESystems.classifyEquilibrium2D([[-1, 0], [0, -2]]).type === "node", "distinct negative real eigenvalues -> node (stable)");
ok(ODESystems.classifyEquilibrium2D([[-1, 0], [0, -2]]).stability === "asymptotically stable", "stable node is asymptotically stable");
ok(ODESystems.classifyEquilibrium2D([[1, 0], [0, 2]]).stability === "unstable", "distinct positive real eigenvalues -> unstable node");
ok(ODESystems.classifyEquilibrium2D([[1, 0], [0, -1]]).type === "saddle", "opposite-sign real eigenvalues -> saddle");
ok(ODESystems.classifyEquilibrium2D([[0, 1], [-1, 0]]).type === "center", "purely imaginary eigenvalues -> center");
ok(ODESystems.classifyEquilibrium2D([[-0.5, 1], [-1, -0.5]]).type === "spiral", "complex eigenvalues with negative real part -> spiral");
ok(ODESystems.classifyEquilibrium2D([[-0.5, 1], [-1, -0.5]]).stability === "asymptotically stable", "stable spiral is asymptotically stable");
ok(ODESystems.classifyEquilibrium2D([[-1, 0], [0, -1]]).type === "star node", "repeated eigenvalue, diagonalizable (A = -I) -> star node");
ok(ODESystems.classifyEquilibrium2D([[-1, 1], [0, -1]]).type === "improper node", "repeated eigenvalue, defective -> improper node");

console.log("\nstabilityFromEigenvalues — the general n-dimensional read (n=2 and n=3):");
ok(ODESystems.stabilityFromEigenvalues([[-1, 0], [0, -2]]).stability === "asymptotically stable", "n=2 all-negative -> asymptotically stable");
ok(ODESystems.stabilityFromEigenvalues([[1, 0], [0, -1]]).stability === "saddle-type", "n=2 mixed sign -> saddle-type");
ok(ODESystems.stabilityFromEigenvalues([[-1, 0, 0], [0, -2, 0], [0, 0, -3]]).stability === "asymptotically stable", "n=3 all-negative -> asymptotically stable");
ok(ODESystems.stabilityFromEigenvalues([[1, 0, 0], [0, 2, 0], [0, 0, 3]]).stability === "unstable", "n=3 all-positive -> unstable");
ok(ODESystems.stabilityFromEigenvalues([[1, 0, 0], [0, -2, 0], [0, 0, -3]]).stability === "saddle-type", "n=3 mixed sign -> saddle-type");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-systems.js`
Expected: FAIL — `ODESystems.classifyEquilibrium2D is not a function`.

- [ ] **Step 3: Implement `classifyEquilibrium2D` and `stabilityFromEigenvalues`**

In `assets/js/ode-systems.js`, add directly after `ODESystems.verifySystem = verifySystem;`:

```javascript
  // n=2 only — classifies the equilibrium at the origin from A's eigenvalues, the standard
  // trace-determinant chart. Deliberately hand-rolled (per the plan's Global Constraints): a
  // single bounded calculation reusing LinAlg.eigenvalues, not a second classify-then-derive
  // tree competing with dsolve().
  function classifyEquilibrium2D(matrixRows) {
    const eig = LinAlg.eigenvalues(matrixRows);
    if (eig.hasComplex) {
      const alpha = eig.values[0].re;
      if (Math.abs(alpha) < 1e-9) return { type: "center", stability: "stable (periodic orbits, not asymptotic)", eigenvalues: eig.values };
      return { type: "spiral", stability: alpha < 0 ? "asymptotically stable" : "unstable", eigenvalues: eig.values };
    }
    const [l1, l2] = eig.real;
    if (Math.abs(l1 - l2) < 1e-7) {
      const geometric = LinAlg.eigenvectorsFor(matrixRows, l1).length;
      const type = geometric === 2 ? "star node" : "improper node";
      const stability = l1 < 0 ? "asymptotically stable" : l1 > 0 ? "unstable" : "degenerate (zero eigenvalue)";
      return { type, stability, eigenvalues: eig.values };
    }
    if (l1 * l2 < 0) return { type: "saddle", stability: "unstable", eigenvalues: eig.values };
    if (l1 === 0 || l2 === 0) return { type: "degenerate", stability: "degenerate (zero eigenvalue)", eigenvalues: eig.values };
    return { type: "node", stability: l1 < 0 && l2 < 0 ? "asymptotically stable" : "unstable", eigenvalues: eig.values };
  }
  ODESystems.classifyEquilibrium2D = classifyEquilibrium2D;

  // Any n — the general stability read the plan's Global Constraints require for n>=3 (where
  // the five-way node/saddle/spiral/center split doesn't generalize). Real part of every
  // eigenvalue negative -> asymptotically stable; every real part positive -> unstable; mixed
  // signs -> saddle-type; any zero real part (with the rest one-signed) -> degenerate, since
  // linearized stability can't decide that case.
  function stabilityFromEigenvalues(matrixRows) {
    const eig = LinAlg.eigenvalues(matrixRows);
    const reParts = eig.values.map((z) => z.re);
    const hasZero = reParts.some((r) => Math.abs(r) < 1e-9);
    const hasNeg = reParts.some((r) => r < -1e-9);
    const hasPos = reParts.some((r) => r > 1e-9);
    let stability;
    if (hasZero) stability = "degenerate (an eigenvalue has zero real part)";
    else if (hasNeg && hasPos) stability = "saddle-type";
    else if (hasNeg) stability = "asymptotically stable";
    else stability = "unstable";
    return { stability, eigenvalues: eig.values };
  }
  ODESystems.stabilityFromEigenvalues = stabilityFromEigenvalues;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-systems.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-systems.js tests/verify-ode-systems.js
git commit -m "feat(ode): add classifyEquilibrium2D, reusing LinAlg.eigenvalues (TDD)"
```

---

### Task 6: `ode-systems.js` — `rk4System`

**Files:**
- Modify: `assets/js/ode-systems.js`
- Modify: `tests/verify-ode-systems.js`

**Interfaces:**
- Produces: `ODESystems.rk4System(matrixRows, gFn, x0, h, steps)` — `gFn` is `(t) => number[]`
  of length n, or `null` for the homogeneous case. Returns `[{ t, x: number[] }, ...]` of length
  `steps + 1`. No existing module has a vector-valued stepper (`ODESymbolic.eulerRK4FirstOrder`/
  `rk4SecondOrder` are scalar-only) — this is new code, not a reuse, and stays local to this file.

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-ode-systems.js`, after the `classifyEquilibrium2D` block:

```javascript
console.log("\nrk4System:");
{
  // x' = [[0,1],[-1,0]] x, x(0)=[1,0] -> exact x1(t)=cos t, x2(t)=-sin t
  const path = ODESystems.rk4System([[0, 1], [-1, 0]], null, [1, 0], 0.01, 200);
  ok(path.length === 201, "returns steps+1 points");
  const end = path[path.length - 1];
  ok(Math.abs(end.t - 2) < 1e-9, "final t is steps*h");
  ok(Math.abs(end.x[0] - Math.cos(2)) < 1e-6, "x1 endpoint matches cos(t)", `got=${end.x[0]}, exact=${Math.cos(2)}`);
  ok(Math.abs(end.x[1] - (-Math.sin(2))) < 1e-6, "x2 endpoint matches -sin(t)", `got=${end.x[1]}, exact=${-Math.sin(2)}`);
}
{
  // x' = [0]x + [1] (i.e. dx/dt = 1), x(0)=[0] -> exact x(t) = t
  const path = ODESystems.rk4System([[0]], () => [1], [0], 0.1, 10);
  const end = path[path.length - 1];
  ok(Math.abs(end.x[0] - 1) < 1e-9, "forced scalar case x'=1, x(0)=0 gives x(1)=1");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-systems.js`
Expected: FAIL — `ODESystems.rk4System is not a function`.

- [ ] **Step 3: Implement `rk4System`**

In `assets/js/ode-systems.js`, add directly after `ODESystems.classifyEquilibrium2D = ...;`:

```javascript
  // Classic 4th-order Runge-Kutta, vectorized for x' = Ax + g(t). gFn is (t) => number[], or
  // null for the homogeneous case. Used for the n=2 phase-portrait trajectories.
  function rk4System(matrixRows, gFn, x0, h, steps) {
    const n = x0.length;
    function deriv(t, x) {
      const g = gFn ? gFn(t) : null;
      const dx = new Array(n);
      for (let i = 0; i < n; i++) {
        let s = g ? g[i] : 0;
        for (let j = 0; j < n; j++) s += matrixRows[i][j] * x[j];
        dx[i] = s;
      }
      return dx;
    }
    function addScaled(base, delta, scale) {
      return base.map((v, i) => v + scale * delta[i]);
    }
    let t = 0;
    let x = x0.slice();
    const path = [{ t, x: x.slice() }];
    for (let step = 0; step < steps; step++) {
      const k1 = deriv(t, x);
      const k2 = deriv(t + h / 2, addScaled(x, k1, h / 2));
      const k3 = deriv(t + h / 2, addScaled(x, k2, h / 2));
      const k4 = deriv(t + h, addScaled(x, k3, h));
      x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      t += h;
      path.push({ t, x: x.slice() });
    }
    return path;
  }
  ODESystems.rk4System = rk4System;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-systems.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-systems.js tests/verify-ode-systems.js
git commit -m "feat(ode): add rk4System vector stepper for phase-portrait trajectories (TDD)"
```

---

### Task 7: `ODESystems.solve` orchestration

**Files:**
- Modify: `assets/js/ode-systems.js`

**Interfaces:**
- Consumes: `SympyClient.dsolveSystem` (Task 2), `verifySystem` (Task 4), `classifyEquilibrium2D`
  / `stabilityFromEigenvalues` (Task 5) — all from this same file/its dependencies.
- Produces: `ODESystems.solve(matrixRows, gExprList, ics)` — `ics`: `number[]` of length n, or
  `null`. Returns a Promise resolving to `{ ok: true, components, n, verified: true, stability,
  eigenvalues, classification? }` (`classification` only present at n=2; `stability`/
  `eigenvalues` — from `stabilityFromEigenvalues` — present at every n, satisfying the plan's
  n≥3 requirement) or `{ ok: false, reason }`. Not unit-tested (depends on `SympyClient` / the
  Worker, same as `ODESolver.solve` in Phase 1) — verified manually in Task 9.

- [ ] **Step 1: Implement `solve`**

In `assets/js/ode-systems.js`, add directly after `ODESystems.rk4System = rk4System;` and
before `return ODESystems;`:

```javascript
  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  // ics: number[] of length n, or null for the general solution with no IC applied.
  ODESystems.solve = function (matrixRows, gExprList, ics) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The solver isn't available on this page." });
    }
    const n = matrixRows.length;
    if (n === 0 || !matrixRows.every((row) => row.length === n)) {
      return Promise.resolve({ ok: false, reason: "The matrix must be square and non-empty." });
    }
    const gList = gExprList && gExprList.length ? gExprList : matrixRows.map(() => "0");
    const icsList = ics ? ics.map(String) : [];
    return SympyClient.dsolveSystem(matrixRows, gList, icsList)
      .then((out) => {
        const parsed = JSON.parse(out.resultText);
        const components = parsed.components.map(normalizeSympyText);
        if (!verifySystem(components, matrixRows, gList)) {
          return { ok: false, reason: "SymPy returned a solution, but it did not independently verify against the system — refusing to show a result this site cannot confirm." };
        }
        const { stability, eigenvalues } = stabilityFromEigenvalues(matrixRows);
        const result = { ok: true, components, n, verified: true, stability, eigenvalues };
        if (n === 2) result.classification = classifyEquilibrium2D(matrixRows);
        return result;
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };
```

- [ ] **Step 2: Manual sanity check (not Node-testable — no `pyodide` package)**

Note for Task 9's browser pass: `ODESystems.solve([[0,1],[-1,0]], null, null)` on the `systems.html`
page (once Task 8 exists) should return a verified solution with `classification.type === "center"`.

- [ ] **Step 3: Commit**

```bash
git add assets/js/ode-systems.js
git commit -m "feat(ode): add ODESystems.solve orchestration"
```

---

### Task 8: `systems.html` page + `ode-systems-page.js` wiring

**Files:**
- Create: `engines/ode/methods/systems.html`
- Create: `assets/js/ode-systems-page.js`

**Interfaces:**
- Consumes: `ODESystems.solve`, `ODESystems.rk4System` (Task 7, Task 6), `ODERender.bigBox`
  (existing, from `ode-render.js`), `Engine.plotlyBaseLayout` / `Engine.plotlyConfig` (existing).
- Not Node-tested — DOM/page wiring, verified manually in Task 9 (same as every other
  `*-page.js` file in this codebase, e.g. `ode-solver-page.js`).

- [ ] **Step 1: Create `engines/ode/methods/systems.html`**

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Systems of ODEs — ODE/PDE Engine</title>
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
    <span class="eyebrow">Systems of ODEs</span>
    <h1 class="h2" style="margin-top:14px;">Systems of ODEs</h1>
    <p class="method-summary">Solve <span class="mono">x' = Ax + g(t)</span> for any n×n <span class="mono">A</span> — closed form by SymPy, verified numerically before it's shown. At n=2, the equilibrium at the origin is classified (node, saddle, spiral, or center) from <span class="mono">A</span>'s eigenvalues, alongside the phase portrait.</p>
  </div>
</section>

<section class="section--tight">
  <div class="container">
    <div class="workspace">

      <form class="panel crosshair-host" id="systemsForm">
        <span class="panel-title">Input</span>

        <div class="field">
          <label for="matrixInput">Matrix A (one row per line)</label>
          <textarea id="matrixInput" class="mono" rows="3" spellcheck="false">0, 1
-1, 0</textarea>
        </div>

        <div class="field">
          <label for="gInput">Forcing g(t) (comma-separated, one per row — leave as 0 for homogeneous)</label>
          <input type="text" id="gInput" class="mono" value="0, 0" autocomplete="off" spellcheck="false" />
        </div>

        <span class="field-note" style="margin-top:18px;">Worked examples — click to load</span>
        <div class="method-tags" id="exampleChips">
          <button type="button" class="tag" data-a="0, 1&#10;-1, 0" data-g="0, 0">Center</button>
          <button type="button" class="tag" data-a="-1, 0&#10;0, -2" data-g="0, 0">Stable node</button>
          <button type="button" class="tag" data-a="1, 0&#10;0, -1" data-g="0, 0">Saddle</button>
          <button type="button" class="tag" data-a="-0.5, 1&#10;-1, -0.5" data-g="0, 0">Spiral</button>
          <button type="button" class="tag" data-a="0, 1&#10;-1, 0" data-g="0, sin(t)">Forced</button>
        </div>

        <label class="status-line" style="cursor:pointer; margin-top:18px;">
          <input type="checkbox" id="icToggle" style="width:auto;" />
          <span>Include an initial condition x(0)</span>
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
          <p class="p1">Enter a square matrix and hit Solve — the solution, equilibrium classification (n=2), and phase portrait will appear here.</p>
        </div>
        <div id="resultsArea" style="display:none;"></div>
        <div id="portraitWrap" class="plot-wrap crosshair-host" style="display:none;">
          <div class="plot-wrap-head"><span class="panel-title" style="margin:0;">Phase portrait</span></div>
          <div id="portraitPlot" style="height:420px;"></div>
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
<script src="../../../assets/js/linalg-algorithms.js" defer></script>
<script src="../../../assets/js/ode-solver.js" defer></script>
<script src="../../../assets/js/ode-systems.js" defer></script>
<script src="../../../assets/js/ode-systems-page.js" defer></script>
<script defer>
  document.addEventListener("DOMContentLoaded", () => Engine.initChrome());
</script>
</body>
</html>
```

- [ ] **Step 2: Create `assets/js/ode-systems-page.js`**

```javascript
/* Systems of ODEs page wiring. Parses the matrix/forcing/IC inputs, calls ODESystems.solve,
   renders the result through the existing ODERender.bigBox, and — at n=2 only — draws the
   phase portrait: a vector-field arrow grid (the exact Plotly `shapes`-line-segment technique
   already used in ode-direction-fields.js, fed (dx/dt, dy/dt) instead of a scalar slope) plus a
   handful of ODESystems.rk4System trajectories from points around the equilibrium. */
(function () {
  "use strict";

  const matrixInput = document.getElementById("matrixInput");
  const gInput = document.getElementById("gInput");
  const icToggle = document.getElementById("icToggle");
  const icFields = document.getElementById("icFields");
  const form = document.getElementById("systemsForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const portraitWrap = document.getElementById("portraitWrap");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function parseMatrix(raw) {
    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return lines.map((line) =>
      line.split(",").map((s) => s.trim()).filter(Boolean).map(Number));
  }

  function parseGRow(raw) {
    return raw.split(",").map((s) => s.trim() || "0");
  }

  function rebuildIcFields(n) {
    icFields.innerHTML = "";
    if (n <= 0) return;
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.flexWrap = "wrap";
    for (let i = 0; i < n; i++) {
      const f = document.createElement("div");
      f.className = "field";
      f.innerHTML = `<label>x${i + 1}(0)</label><input type="number" class="ic-input" data-role="ic${i}" value="${i === 0 ? 1 : 0}" step="any" />`;
      row.appendChild(f);
    }
    icFields.appendChild(row);
  }

  function readIc(n) {
    if (!icToggle.checked) return null;
    const values = [];
    for (let i = 0; i < n; i++) {
      const el = icFields.querySelector(`[data-role="ic${i}"]`);
      const v = el ? parseFloat(el.value) : NaN;
      if (Number.isNaN(v)) return { invalid: true };
      values.push(v);
    }
    return values;
  }

  icToggle.addEventListener("change", () => {
    icFields.style.display = icToggle.checked ? "" : "none";
  });

  document.querySelectorAll("#exampleChips .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      matrixInput.value = btn.dataset.a;
      gInput.value = btn.dataset.g;
    });
  });

  function drawPhasePortrait(matrixRows, gExprList, classification) {
    let gFn = null;
    if (gExprList.some((g) => g !== "0")) {
      const compiled = gExprList.map((g) => ODESolver.compileRealFx(g));
      if (compiled.every((c) => c.ok)) {
        gFn = (t) => compiled.map((c) => c.fn({ t }));
      }
    }

    const RANGE = 3;
    const GRID = 14;
    const shapes = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const gx = -RANGE + (i / GRID) * 2 * RANGE;
        const gy = -RANGE + (j / GRID) * 2 * RANGE;
        const dx = matrixRows[0][0] * gx + matrixRows[0][1] * gy;
        const dy = matrixRows[1][0] * gx + matrixRows[1][1] * gy;
        const norm = Math.sqrt(dx * dx + dy * dy) || 1;
        const len = (2 * RANGE / GRID) * 0.6;
        const ux = (dx / norm) * len, uy = (dy / norm) * len;
        shapes.push({ type: "line", x0: gx - ux / 2, y0: gy - uy / 2, x1: gx + ux / 2, y1: gy + uy / 2, line: { color: "rgba(255,255,255,0.16)", width: 1.5 } });
      }
    }

    const starts = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1, 1], [-1, -1]];
    const traces = starts.map((x0, idx) => {
      const path = ODESystems.rk4System(matrixRows, gFn, x0, 0.02, 250);
      return { x: path.map((p) => p.x[0]), y: path.map((p) => p.x[1]), mode: "lines", name: `trajectory ${idx + 1}`, showlegend: false, line: { color: "#59a993", width: 2 } };
    });

    portraitWrap.style.display = "";
    Plotly.react("portraitPlot", traces, Engine.plotlyBaseLayout({
      shapes,
      xaxis: { title: "x₁", range: [-RANGE, RANGE] },
      yaxis: { title: "x₂", range: [-RANGE, RANGE] },
    }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    portraitWrap.style.display = "none";

    let matrixRows;
    try {
      matrixRows = parseMatrix(matrixInput.value);
    } catch (err) {
      setStatus(false, "Couldn't parse the matrix.");
      return;
    }
    const n = matrixRows.length;
    if (n === 0 || !matrixRows.every((row) => row.length === n && row.every(Number.isFinite))) {
      setStatus(false, "The matrix must be square, with numeric entries in every row.");
      return;
    }
    const gList = parseGRow(gInput.value);
    if (gList.length !== n) {
      setStatus(false, `The forcing row needs exactly ${n} entries (one per state variable).`);
      return;
    }

    rebuildIcFields(n);
    const ic = readIc(n);
    if (ic && ic.invalid) { setStatus(false, "The initial condition needs numeric values in every field."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    if (submitBtn) submitBtn.textContent = "Solving…";

    ODESystems.solve(matrixRows, gList, ic).then((out) => {
      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      if (!out.ok) {
        resultsArea.innerHTML = "";
        showError(out.reason);
        setStatus(false, out.reason);
        return;
      }
      const varNames = out.components.map((_, i) => `x_{${i + 1}}(t)`);
      const lines = out.components.map((c, i) => `${varNames[i]} = ${ODESymbolic.toLatex(c)}`).join("\\\\");
      const classLine = out.classification
        ? `Equilibrium: ${out.classification.type} (${out.classification.stability}) — solved by SymPy, verified.`
        : `Stability: ${out.stability} — solved by SymPy, verified.`;
      ODERender.bigBox(resultsArea, {
        classificationLine: classLine,
        generalSolution: lines,
        particularSolution: null,
      });
      setStatus(true, "Solved.");
      if (n === 2) drawPhasePortrait(matrixRows, gList, out.classification);
    }).catch((err) => {
      showError(err.message || String(err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = "Solve";
    });
  });
})();
```

- [ ] **Step 3: Commit**

```bash
git add engines/ode/methods/systems.html assets/js/ode-systems-page.js
git commit -m "feat(ode): add the Systems of ODEs page"
```

---

### Task 9: Wire into `methods.html`, update `ODE_PDE_ENGINE_PLAN.md`, full manual pass

**Files:**
- Modify: `engines/ode/methods.html`
- Modify: `docs/ODE_PDE_ENGINE_PLAN.md`

- [ ] **Step 1: Add the Systems card to `methods.html`**

In `engines/ode/methods.html`, change every existing card's `engine-index` from `N / 6` to
`N / 7` (six edits: `1 / 6`→`1 / 7`, `2 / 6`→`2 / 7`, `3 / 6`→`3 / 7`, `4 / 6`→`4 / 7`,
`5 / 6`→`5 / 7`, `6 / 6`→`6 / 7`), then add this new card directly after the `ODE Solver` card
(before the `laplace-transform.html` card):

```html
      <a href="methods/systems.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.08s">
        <span class="engine-dot"></span>
        <div class="engine-card-head">
          <span class="eyebrow">Systems of ODEs</span>
          <span class="engine-index">2 / 7</span>
        </div>
        <h3 class="h3">Systems of ODEs</h3>
        <p><span class="mono">x' = Ax + g(t)</span> for any n×n <span class="mono">A</span>, solved generally by SymPy and independently re-verified. At n=2, the equilibrium at the origin is classified — node, saddle, spiral, or center — by reusing the Linear Algebra Engine's own eigenvalue solver, alongside the phase portrait.</p>
        <div class="method-tags" style="margin-top:16px;">
          <span class="tag">Any n×n</span>
          <span class="tag">Eigenvalue classification</span>
          <span class="tag">Phase portrait</span>
        </div>
      </a>
```

(This shifts what was `2 / 7` for Laplace to `3 / 7`, etc. — after this insertion, walk the
remaining cards top-to-bottom and number them `3 / 7` through `7 / 7` in order.)

- [ ] **Step 2: Add the Phase 2 completion note to `ODE_PDE_ENGINE_PLAN.md`**

Find the existing `2026-08-01 — Phase 1 of a SymPy-dsolve()-backed general solver shipped...`
note (added when Phase 1 landed) and add this new note directly after it, before the
`2026-07-30 — scope pivoted...` note:

```markdown
**2026-08-02 — Phase 2 (systems of ODEs) shipped.** Full plan:
`docs/superpowers/plans/2026-08-02-ode-engine-phase2-systems.md`. New `engines/ode/methods/
systems.html` page solves `x' = Ax + g(t)` for any n×n via SymPy `dsolve()`, verified
numerically. At n=2, the equilibrium is classified (node/saddle/spiral/center) by reusing
`LinAlg.eigenvalues` — the one deliberately hand-rolled piece, not a second classify tree.
Phases 3-6 (Laplace/Series cleanup, PDE, final docs rewrite) remain not started.
```

- [ ] **Step 3: Commit**

```bash
git add engines/ode/methods.html docs/ODE_PDE_ENGINE_PLAN.md
git commit -m "docs(ode): wire Systems of ODEs into methods.html and record Phase 2 completion"
```

- [ ] **Step 4: Full manual browser verification pass**

Open `engines/ode/methods/systems.html` in a real browser (Pyodide/SymPy worker only runs
there) and check every one of these by hand:

1. Load each of the 5 example chips (Center, Stable node, Saddle, Spiral, Forced) and press
   Solve. Each must return a **verified** result (no refusal message) with a classification
   line matching the chip's name (Center → "center", Stable node → "node" +
   "asymptotically stable", Saddle → "saddle", Spiral → "spiral" +
   "asymptotically stable"), and the phase portrait must render with trajectories that visually
   match that equilibrium type (e.g. Saddle shows trajectories diverging along one axis,
   converging along the other).
2. Toggle "Include an initial condition", set `x1(0)=1, x2(0)=0` on the Center example, press
   Solve — the particular solution shown must reduce to `x1(t)=cos t, x2(t)=-sin t` (up to
   sign/labeling), and the equilibrium classification line must still appear.
3. Enter a 3×3 matrix (e.g. `-1,0,0` / `0,-2,0` / `0,0,-3`, three rows) with `g = 0,0,0` — the
   page must show the solved component functions, a "Stability: asymptotically stable" line,
   and NOT attempt to render a phase portrait (`portraitWrap` stays hidden), consistent with
   the plan's n≥3 scope.
4. Enter a non-square matrix (e.g. two rows of different lengths) — the page must show the
   inline form error and never call `ODESystems.solve`.
5. If any check fails, fix the underlying issue and repeat this full pass from Step 1 before
   considering Phase 2 done. Do not proceed to Phase 3 (Laplace Transform cleanup) until this
   pass is clean.
