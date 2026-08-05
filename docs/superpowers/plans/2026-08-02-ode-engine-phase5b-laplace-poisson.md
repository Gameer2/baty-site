# ODE Engine Phase 5b — Laplace's and Poisson's Equations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new page solving Laplace's equation (`u_xx+u_yy=0` on a rectangle, Dirichlet data on
up to four edges) two independent ways — sinh-series and numeric relaxation, cross-checked — and
Poisson's equation (`u_xx+u_yy=f(x,y)`, zero Dirichlet) by relaxation, verified by its discrete
residual.

**Architecture:** A new pure-JS module `ode-poisson.js` builds the dense linear system for the
standard 5-point stencil on a modest interior grid (`M=20`) and reuses `LinAlg.jacobi`/
`gaussSeidel` directly for the relaxation solve — exactly the roadmap's own reuse suggestion.
The Laplace sinh-series uses the same Simpson-integral coefficient pattern as
`solveHeatEquation`/`solveWaveEquation`.

Full design rationale: `docs/superpowers/specs/2026-08-02-ode-engine-phase5b-laplace-poisson-design.md`.

## Global Constraints

- Rectangle domain only, `[0,a]×[0,b]`.
- `LinAlg.jacobi`/`gaussSeidel` default to `maxIter=200`, `tol=1e-10` — far too tight/short for
  a 400-unknown system (validated this session: ~1100 iterations needed at `tol=1e-8` for a
  20×20 grid). Every call in this phase MUST pass explicit `tol=1e-6, maxIter=3000`.
- The discrete Laplacian's dense system has *weak*, not strict, diagonal dominance
  (`iterativeSolve`'s own `dominant` flag will correctly report `false` for fully-interior rows
  — this is expected and harmless: the discrete Poisson system is a textbook example that
  converges under Jacobi/Gauss-Seidel despite lacking strict dominance, confirmed empirically
  this session). Do not treat `dominant: false` as an error.
- If `LinAlg.jacobi`/`gaussSeidel` report `converged: false`, refuse honestly rather than show a
  partially-converged answer.
- All of this phase's new logic is pure JS (Simpson's rule + dense linear algebra, both already
  Node-tested elsewhere in this codebase) — Node-testable, same as Phase 5a.

---

### Task 1: `buildGridSystem` and `gridResidual`

**Files:**
- Create: `assets/js/ode-poisson.js`
- Test: `tests/verify-ode-poisson.js`

**Interfaces:**
- Produces: `PoissonEngine.buildGridSystem({a, b, M, boundaryFn, sourceFn})` → `{A, b, M, hx,
  hy}` (`A`: dense `(M-1)²×(M-1)²` matrix, `b`: right-hand-side vector, both ready for
  `LinAlg.jacobi`/`gaussSeidel`). `PoissonEngine.gridResidual(U, M, hx, hy, sourceFn)` →
  boolean (`U`: 2D array indexed `U[i][j]`, `i,j ∈ [0,M]`, boundary values already filled in).

- [ ] **Step 1: Write the failing test**

Create `tests/verify-ode-poisson.js`:

```javascript
"use strict";
/* ode-poisson.js verification — Phase 5b of the ODE/PDE redesign.
   All of this module is pure JS (dense linear algebra + Simpson's rule) -- no Pyodide, no
   CAS-worker dependency -- fully Node-testable. */

const path = require("path");
const Algorithms = require(path.join(__dirname, "..", "assets", "js", "algorithms.js"));
const LinAlg = require(path.join(__dirname, "..", "assets", "js", "linalg-algorithms.js"));
global.Algorithms = Algorithms;
global.LinAlg = LinAlg;
const PoissonEngine = require(path.join(__dirname, "..", "assets", "js", "ode-poisson.js"));

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

console.log("buildGridSystem + LinAlg.jacobi — matches a known exact Poisson solution:");
{
  const a = 1, b = 1, M = 20;
  const uExact = (x, y) => Math.sin(Math.PI * x / a) * Math.sin(Math.PI * y / b);
  const source = (x, y) => -((Math.PI / a) ** 2 + (Math.PI / b) ** 2) * uExact(x, y);
  const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({ a, b, M, boundaryFn: () => 0, sourceFn: source });
  const result = LinAlg.jacobi(A, rhs, 1e-6, 3000);
  ok(result.converged, "Jacobi converges within the iteration budget");
  function U(i, j) { return result.solution[(i - 1) * (M - 1) + (j - 1)]; }
  const samples = [[0.3, 0.3], [0.5, 0.5], [0.7, 0.2]];
  let maxErr = 0;
  for (const [x, y] of samples) {
    const i = Math.round(x / hx), j = Math.round(y / hy);
    maxErr = Math.max(maxErr, Math.abs(U(i, j) - uExact(x, y)));
  }
  ok(maxErr < 5e-3, "numeric solution matches the known exact solution", `maxErr=${maxErr}`);
}

console.log("\ngridResidual:");
{
  // A trivially exact discrete solution: U[i][j] = 0 everywhere satisfies u_xx+u_yy=0 (Laplace).
  const M = 10, a = 1, b = 1, hx = a / M, hy = b / M;
  const U = Array.from({ length: M + 1 }, () => new Array(M + 1).fill(0));
  ok(PoissonEngine.gridResidual(U, M, hx, hy, () => 0), "all-zero grid satisfies Laplace's equation exactly");
  ok(!PoissonEngine.gridResidual(U, M, hx, hy, () => 5), "all-zero grid does NOT satisfy u_xx+u_yy=5");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-poisson.js`
Expected: FAIL to load — `Cannot find module '.../assets/js/ode-poisson.js'`.

- [ ] **Step 3: Create `assets/js/ode-poisson.js` with `buildGridSystem` and `gridResidual`**

```javascript
/* Laplace's and Poisson's Equations — Phase 5b of the ODE/PDE redesign (see
   docs/superpowers/plans/2026-08-02-ode-engine-phase5b-laplace-poisson.md). Builds the dense
   5-point-stencil linear system for u_xx+u_yy=f(x,y) on a rectangle's interior grid and reuses
   LinAlg.jacobi/gaussSeidel for the relaxation solve directly -- the roadmap's own reuse
   suggestion, not a second iterative-solver implementation.

   Depends on LinAlg (jacobi, gaussSeidel) and Algorithms (LinAlg's own dependency). Both must
   be loaded first. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./linalg-algorithms.js"));
  } else {
    root.PoissonEngine = factory(root.LinAlg);
  }
})(typeof self !== "undefined" ? self : this, function (LinAlg) {
  "use strict";

  const PoissonEngine = {};

  // Interior unknowns U[i][j], i,j in [1, M-1], mapped to a flat index for the dense linear
  // system. Boundary values (i or j = 0 or M) are known and folded into the right-hand side.
  function flatIndex(i, j, M) { return (i - 1) * (M - 1) + (j - 1); }
  PoissonEngine.flatIndex = flatIndex;

  // Standard 5-point stencil for u_xx + u_yy = f(x,y) on a (possibly non-square-cell) grid:
  // wx*(U[i+1,j]+U[i-1,j]) + wy*(U[i,j+1]+U[i,j-1]) - 2(wx+wy)*U[i,j] = f(x_i,y_j), with known
  // boundary values moved to the right-hand side. boundaryFn(x,y): the Dirichlet data (only
  // evaluated at boundary points). sourceFn(x,y): f(x,y) (zero for Laplace's equation).
  function buildGridSystem({ a, b, M, boundaryFn, sourceFn }) {
    const hx = a / M, hy = b / M;
    const wx = 1 / (hx * hx), wy = 1 / (hy * hy);
    const diag = -2 * (wx + wy);
    const n = (M - 1) * (M - 1);
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const rhs = new Array(n).fill(0);

    for (let i = 1; i <= M - 1; i++) {
      for (let j = 1; j <= M - 1; j++) {
        const row = flatIndex(i, j, M);
        A[row][row] = diag;
        rhs[row] = sourceFn(i * hx, j * hy);

        if (i - 1 >= 1) A[row][flatIndex(i - 1, j, M)] += wx;
        else rhs[row] -= wx * boundaryFn((i - 1) * hx, j * hy);

        if (i + 1 <= M - 1) A[row][flatIndex(i + 1, j, M)] += wx;
        else rhs[row] -= wx * boundaryFn((i + 1) * hx, j * hy);

        if (j - 1 >= 1) A[row][flatIndex(i, j - 1, M)] += wy;
        else rhs[row] -= wy * boundaryFn(i * hx, (j - 1) * hy);

        if (j + 1 <= M - 1) A[row][flatIndex(i, j + 1, M)] += wy;
        else rhs[row] -= wy * boundaryFn(i * hx, (j + 1) * hy);
      }
    }
    return { A, b: rhs, M, hx, hy };
  }
  PoissonEngine.buildGridSystem = buildGridSystem;

  // Direct definitional check: does the discrete stencil actually hold at interior grid points,
  // given a FULLY POPULATED grid U (boundary values already filled in)? The most direct
  // verification available for a relaxation solve -- substituting back into the defining
  // equation, same discipline as every other numeric check on this site.
  function gridResidual(U, M, hx, hy, sourceFn) {
    const wx = 1 / (hx * hx), wy = 1 / (hy * hy);
    let usable = 0;
    for (let i = 1; i <= M - 1; i += Math.max(1, Math.floor((M - 1) / 6))) {
      for (let j = 1; j <= M - 1; j += Math.max(1, Math.floor((M - 1) / 6))) {
        const lap = wx * (U[i + 1][j] + U[i - 1][j]) + wy * (U[i][j + 1] + U[i][j - 1]) - 2 * (wx + wy) * U[i][j];
        const expected = sourceFn(i * hx, j * hy);
        if (![lap, expected].every(Number.isFinite)) continue;
        usable++;
        if (Math.abs(lap - expected) > 1e-2 * Math.max(1, Math.abs(expected))) return false;
      }
    }
    return usable >= 3;
  }
  PoissonEngine.gridResidual = gridResidual;

  return PoissonEngine;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-poisson.js`
Expected: PASS, all 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-poisson.js tests/verify-ode-poisson.js
git commit -m "feat(laplace-poisson): add buildGridSystem/gridResidual (TDD)"
```

---

### Task 2: `solveGrid` and Laplace's sinh-series

**Files:**
- Modify: `assets/js/ode-poisson.js`
- Modify: `tests/verify-ode-poisson.js`

**Interfaces:**
- Produces: `PoissonEngine.solveGrid(A, b, method)` → `{ U, converged }` (`U`: `(M-1)×(M-1)`
  reshaped grid, `method`: `"jacobi"` or `"gauss-seidel"`). `PoissonEngine.laplaceEdgeCoeffs
  ({a, b, edgeExpr, N, simpsonIntegrate})` → `number[]` (the sinh-series coefficients for one
  nonzero edge, generalized so any of the four edges reuses the same formula via coordinate
  relabeling — see Step 3). `PoissonEngine.laplaceSeriesValue(edges, a, b, x, y)` → number
  (`edges`: `{bottom, top, left, right}`, each `null` or `{coeffs}`).

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-ode-poisson.js`, after the `gridResidual` block:

```javascript
console.log("\nlaplaceEdgeCoeffs + laplaceSeriesValue — matches Jacobi relaxation:");
{
  const a = 1, b = 1, N = 25, M = 20;
  function simpson(fn, lo, hi, n) {
    if (n % 2) n++;
    const h = (hi - lo) / n;
    let s = fn(lo) + fn(hi);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(lo + i * h);
    return (h / 3) * s;
  }
  const f = (x) => x * (a - x); // nonzero on the top edge (y=b)
  const coeffs = PoissonEngine.laplaceEdgeCoeffs({ a, b, edge: "top", fFn: f, N, simpsonIntegrate: simpson });
  const edges = { bottom: null, left: null, right: null, top: { coeffs } };

  const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({
    a, b, M,
    boundaryFn: (x, y) => (Math.abs(y - b) < 1e-9 ? f(x) : 0),
    sourceFn: () => 0,
  });
  const { U: flat, converged } = PoissonEngine.solveGrid(A, rhs, "jacobi");
  ok(converged, "Jacobi converges for the Laplace boundary-value problem");

  let maxErr = 0;
  for (const [x, y] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.2]]) {
    const i = Math.round(x / hx), j = Math.round(y / hy);
    const series = PoissonEngine.laplaceSeriesValue(edges, a, b, x, y);
    const relax = flat[(i - 1) * (M - 1) + (j - 1)];
    maxErr = Math.max(maxErr, Math.abs(series - relax));
  }
  ok(maxErr < 1e-3, "sinh-series matches relaxation", `maxErr=${maxErr}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode-poisson.js`
Expected: FAIL — `PoissonEngine.solveGrid is not a function`.

- [ ] **Step 3: Implement `solveGrid`, `laplaceEdgeCoeffs`, `laplaceSeriesValue`**

In `assets/js/ode-poisson.js`, add directly after `PoissonEngine.gridResidual = gridResidual;`:

```javascript
  function solveGrid(A, b, method) {
    const result = method === "gauss-seidel" ? LinAlg.gaussSeidel(A, b, 1e-6, 3000) : LinAlg.jacobi(A, b, 1e-6, 3000);
    return { U: result.solution, converged: result.converged };
  }
  PoissonEngine.solveGrid = solveGrid;

  // Coefficients for the classic single-edge Dirichlet case, u=0 on the other three edges:
  // u(x,y) = sum cn sin(n*pi*x/a) sinh(n*pi*y/a), cn = (2/(a*sinh(n*pi*b/a))) * integral of
  // fFn(x)*sin(n*pi*x/a) over [0,a] -- for the "top" edge (y=b). The other three edges use the
  // SAME formula with x/y (and a/b) swapped or reflected -- one technique, four placements.
  // edge: "bottom" | "top" | "left" | "right". fFn: the boundary data as a function of the
  // coordinate running along that edge (x for bottom/top, y for left/right).
  function laplaceEdgeCoeffs({ a, b, edge, fFn, N, simpsonIntegrate }) {
    const along = edge === "left" || edge === "right" ? b : a;
    const across = edge === "left" || edge === "right" ? a : b;
    const coeffs = [];
    for (let n = 1; n <= N; n++) {
      const integrand = (s) => fFn(s) * Math.sin((n * Math.PI * s) / along);
      const raw = (2 / along) * simpsonIntegrate(integrand, 0, along, 120);
      coeffs.push(raw / Math.sinh((n * Math.PI * across) / along));
    }
    return coeffs;
  }
  PoissonEngine.laplaceEdgeCoeffs = laplaceEdgeCoeffs;

  function laplaceSeriesValue(edges, a, b, x, y) {
    let s = 0;
    if (edges.top) {
      const { coeffs } = edges.top;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * x) / a) * Math.sinh((n * Math.PI * y) / a);
    }
    if (edges.bottom) {
      const { coeffs } = edges.bottom;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * x) / a) * Math.sinh((n * Math.PI * (b - y)) / a);
    }
    if (edges.right) {
      const { coeffs } = edges.right;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * y) / b) * Math.sinh((n * Math.PI * x) / b);
    }
    if (edges.left) {
      const { coeffs } = edges.left;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * y) / b) * Math.sinh((n * Math.PI * (a - x)) / b);
    }
    return s;
  }
  PoissonEngine.laplaceSeriesValue = laplaceSeriesValue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode-poisson.js`
Expected: PASS, all 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-poisson.js tests/verify-ode-poisson.js
git commit -m "feat(laplace-poisson): add solveGrid and the Laplace sinh-series (TDD)"
```

---

### Task 3: `laplace-poisson.html` page + wiring

**Files:**
- Create: `engines/ode/methods/laplace-poisson.html`
- Create: `assets/js/laplace-poisson-page.js`
- Modify: `engines/ode/methods.html` (new card)

**Interfaces:**
- Consumes: everything from Tasks 1-2 (all pure JS — no CAS worker needed for this page at all,
  since there's no expensive computation requiring a background thread beyond what a modest
  400-unknown relaxation already handles synchronously in well under a second).
- Not Node-tested — DOM/page wiring, verified manually in Task 4.

- [ ] **Step 1: Create `engines/ode/methods/laplace-poisson.html`**

Two-section page (tabs, matching `laplace-transform.html`'s `#sectionTabs` pattern from Phase
3, and its own workspace/panel/output markup structure — copy that page's head, header, footer,
and `<section class="method-hero">` block, retitled "Laplace's and Poisson's Equations"):
- **Laplace section** (`id="laplaceSection"`, form `id="laplaceForm"`): fields `a`, `b`
  (numbers, ids `laplaceA`/`laplaceB`), four text inputs `bottomExpr`/`topExpr`/`leftExpr`/
  `rightExpr` (each defaulting to `"0"`), `N` (terms, id `laplaceN`, default `20`). A
  `laplaceStatus`/`laplaceStatusText` status line, a `laplaceError`/`laplaceErrorText` inline
  error block (hidden by default), a `laplacePlaceholder` panel (shown until first solve), and
  output: `laplaceResultsArea` (hidden until solved, rendered via `ODERender.bigBox`) and a
  `laplacePlot` div (360px).
- **Poisson section** (`id="poissonSection"`, form `id="poissonForm"`, `style="display:none;"`
  initially): fields `a`, `b` (ids `poissonA`/`poissonB`), a text input `sourceExpr` (default
  `"0"`). Same status/error/placeholder/results pattern as Laplace: `poissonStatus`/
  `poissonStatusText`, `poissonError`/`poissonErrorText`, `poissonPlaceholder`,
  `poissonResultsArea`, `poissonPlot`.
- Script includes: `gsap.min.js`, `math.min.js`, `katex.min.js`, `plotly-cartesian.min.js`,
  `engine-core.js`, `calc-core.js`, `ode-render.js`, `algorithms.js`, `linalg-algorithms.js`,
  `ode-poisson.js`, `laplace-poisson-page.js` — no `sympy-client.js`, no `cas-client.js` (this
  page needs neither; everything is synchronous pure JS).

- [ ] **Step 2: Create `assets/js/laplace-poisson-page.js`**

```javascript
/* Laplace's and Poisson's Equations page wiring — Phase 5b of the ODE/PDE redesign. Both
   sections are pure JS, synchronous — no CAS worker, no SymPy worker needed. Laplace is
   cross-checked two independent ways (sinh-series vs relaxation); Poisson is verified by its
   discrete residual. */
(function () {
  "use strict";

  const M = 20;
  const SAMPLE_FRACS = [[0.3, 0.3], [0.5, 0.5], [0.7, 0.2], [0.2, 0.7]];

  document.querySelectorAll("#sectionTabs .tag").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#sectionTabs .tag").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById("laplaceSection").style.display = tab.dataset.section === "laplace" ? "" : "none";
      document.getElementById("poissonSection").style.display = tab.dataset.section === "poisson" ? "" : "none";
    });
  });

  function compile(exprText) {
    try { return { ok: true, fn: math.parse(exprText || "0").compile() }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  }

  function plotHeatmap(divId, a, b, hx, hy, valueAt) {
    const NX = 40, NY = 40;
    const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * a);
    const ys = Array.from({ length: NY }, (_, i) => (i / (NY - 1)) * b);
    const z = ys.map((y) => xs.map((x) => valueAt(x, y)));
    Plotly.newPlot(divId, [{ x: xs, y: ys, z, type: "heatmap", colorscale: [[0, "#090909"], [0.5, "#4f8fc0"], [1, "#e7e7e7"]] }],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "y" }, margin: { l: 55, r: 20, t: 20, b: 45 } }),
      Engine.plotlyConfig);
  }

  // ---- Laplace ----
  document.getElementById("laplaceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = parseFloat(document.getElementById("laplaceA").value);
    const b = parseFloat(document.getElementById("laplaceB").value);
    const N = parseInt(document.getElementById("laplaceN").value, 10);
    const statusEl = document.getElementById("laplaceStatus"), statusText = document.getElementById("laplaceStatusText");
    const errEl = document.getElementById("laplaceError"), errText = document.getElementById("laplaceErrorText");
    errEl.style.display = "none";
    if (!(a > 0) || !(b > 0) || !(N >= 1)) { statusEl.className = "status-line bad"; statusText.textContent = "a, b must be positive and N at least 1."; return; }

    const edgeSpecs = {
      bottom: document.getElementById("bottomExpr").value.trim(),
      top: document.getElementById("topExpr").value.trim(),
      left: document.getElementById("leftExpr").value.trim(),
      right: document.getElementById("rightExpr").value.trim(),
    };
    const compiled = {};
    for (const [edge, text] of Object.entries(edgeSpecs)) {
      const c = compile(text);
      if (!c.ok) { statusEl.className = "status-line bad"; statusText.textContent = `Couldn't parse the ${edge} edge: ${c.error}`; return; }
      compiled[edge] = c.fn;
    }

    function simpson(fn, lo, hi, n) {
      if (n % 2) n++;
      const h = (hi - lo) / n;
      let s = fn(lo) + fn(hi);
      for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(lo + i * h);
      return (h / 3) * s;
    }

    const edges = {};
    for (const edge of ["bottom", "top", "left", "right"]) {
      const text = edgeSpecs[edge];
      if (!text || text === "0") { edges[edge] = null; continue; }
      const along = edge === "left" || edge === "right" ? "y" : "x";
      const fn = (s) => compiled[edge].evaluate({ [along]: s });
      const coeffs = PoissonEngine.laplaceEdgeCoeffs({ a, b, edge, fFn: fn, N, simpsonIntegrate: simpson });
      edges[edge] = { coeffs };
    }

    function boundaryFn(x, y) {
      if (Math.abs(y) < 1e-9) return compiled.bottom.evaluate({ x });
      if (Math.abs(y - b) < 1e-9) return compiled.top.evaluate({ x });
      if (Math.abs(x) < 1e-9) return compiled.left.evaluate({ y });
      if (Math.abs(x - a) < 1e-9) return compiled.right.evaluate({ y });
      return 0;
    }
    const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({ a, b, M, boundaryFn, sourceFn: () => 0 });
    const { U: flat, converged } = PoissonEngine.solveGrid(A, rhs, "jacobi");
    if (!converged) { statusEl.className = "status-line bad"; statusText.textContent = "The relaxation solve did not converge — try fewer terms or a different boundary function."; return; }

    let usable = 0, agree = true;
    for (const [fx, fy] of SAMPLE_FRACS) {
      const x = fx * a, y = fy * b;
      const i = Math.round(x / hx), j = Math.round(y / hy);
      if (i < 1 || i > M - 1 || j < 1 || j > M - 1) continue;
      const series = PoissonEngine.laplaceSeriesValue(edges, a, b, x, y);
      const relax = flat[PoissonEngine.flatIndex(i, j, M)];
      if (![series, relax].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(series - relax) > 5e-2 * Math.max(1, Math.abs(relax))) { agree = false; break; }
    }
    if (!agree || usable < 3) {
      errEl.style.display = "block";
      errText.textContent = "The sinh-series and relaxation solutions did not agree — refusing to show an unconfirmed result.";
      statusEl.className = "status-line bad"; statusText.textContent = "Verification failed.";
      return;
    }

    document.getElementById("laplacePlaceholder").style.display = "none";
    document.getElementById("laplaceResultsArea").style.display = "";
    ODERender.bigBox(document.getElementById("laplaceResultsArea"), {
      classificationLine: "Elliptic PDE (Laplace's equation), Dirichlet boundary conditions — sinh-series, cross-checked against relaxation.",
      generalSolution: "u(x,y) = \\sum_n c_n \\sin\\frac{n\\pi\\xi}{\\ell}\\sinh\\frac{n\\pi\\eta}{\\ell} \\text{ (one term per nonzero edge)}",
      particularSolution: null,
    });
    plotHeatmap("laplacePlot", a, b, hx, hy, (x, y) => PoissonEngine.laplaceSeriesValue(edges, a, b, x, y));
    statusEl.className = "status-line ok"; statusText.textContent = "Solved — sinh-series and relaxation agree.";
  });

  // ---- Poisson ----
  document.getElementById("poissonForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = parseFloat(document.getElementById("poissonA").value);
    const b = parseFloat(document.getElementById("poissonB").value);
    const statusEl = document.getElementById("poissonStatus"), statusText = document.getElementById("poissonStatusText");
    const errEl = document.getElementById("poissonError"), errText = document.getElementById("poissonErrorText");
    errEl.style.display = "none";
    if (!(a > 0) || !(b > 0)) { statusEl.className = "status-line bad"; statusText.textContent = "a, b must be positive."; return; }

    const sourceText = document.getElementById("sourceExpr").value.trim();
    const compiled = compile(sourceText);
    if (!compiled.ok) { statusEl.className = "status-line bad"; statusText.textContent = "Couldn't parse f(x,y): " + compiled.error; return; }
    const sourceFn = (x, y) => compiled.fn.evaluate({ x, y });

    const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({ a, b, M, boundaryFn: () => 0, sourceFn });
    const { U: flat, converged } = PoissonEngine.solveGrid(A, rhs, "jacobi");
    if (!converged) { statusEl.className = "status-line bad"; statusText.textContent = "The relaxation solve did not converge."; return; }

    const grid = Array.from({ length: M + 1 }, () => new Array(M + 1).fill(0));
    for (let i = 1; i <= M - 1; i++) for (let j = 1; j <= M - 1; j++) grid[i][j] = flat[PoissonEngine.flatIndex(i, j, M)];

    if (!PoissonEngine.gridResidual(grid, M, hx, hy, sourceFn)) {
      errEl.style.display = "block";
      errText.textContent = "The relaxed solution did not satisfy the discrete Poisson equation — refusing to show an unconfirmed result.";
      statusEl.className = "status-line bad"; statusText.textContent = "Verification failed.";
      return;
    }

    document.getElementById("poissonPlaceholder").style.display = "none";
    document.getElementById("poissonResultsArea").style.display = "";
    ODERender.bigBox(document.getElementById("poissonResultsArea"), {
      classificationLine: "Elliptic PDE (Poisson's equation), zero Dirichlet boundary — solved by relaxation, verified against the discrete equation.",
      generalSolution: "u_{xx} + u_{yy} = f(x,y) \\text{ (solved numerically on a " + M + "\\times" + M + " grid)}",
      particularSolution: null,
    });
    plotHeatmap("poissonPlot", a, b, hx, hy, (x, y) => {
      const i = Math.round(x / hx), j = Math.round(y / hy);
      return (i >= 1 && i <= M - 1 && j >= 1 && j <= M - 1) ? grid[i][j] : 0;
    });
    statusEl.className = "status-line ok"; statusText.textContent = "Solved — verified against the discrete equation.";
  });
})();
```

Note: this reuses `PoissonEngine.flatIndex`, exposed alongside `buildGridSystem` in Task 1 —
add `PoissonEngine.flatIndex = flatIndex;` there if not already exported (it is, per Task 1's
Step 3 code above).

- [ ] **Step 3: Add the Laplace/Poisson card to `methods.html`**

Insert a new card (bump every `engine-index` denominator by one again), tags: "Sinh-series",
"Relaxation (Jacobi/Gauss-Seidel)", "Cross-verified".

- [ ] **Step 4: Commit**

```bash
git add engines/ode/methods/laplace-poisson.html assets/js/laplace-poisson-page.js engines/ode/methods.html
git commit -m "feat(laplace-poisson): add the Laplace/Poisson page"
```

---

### Task 4: Manual browser verification pass

- [ ] **Step 1: Serve `math-lab/` locally and open `engines/ode/methods/laplace-poisson.html`**

Check:
1. **Laplace, single edge:** `a=b=1`, `top(x) = x*(1-x)`, other edges `0` — cross-check must
   pass, heatmap peaking near the top edge.
2. **Laplace, multiple edges:** nonzero on two adjacent edges — cross-check must pass.
3. **Poisson:** `a=b=1`, `f(x,y) = -2*pi^2*sin(pi*x)*sin(pi*y)` (the known exact-solution case
   validated this session) — residual check must pass, and the surface should visually
   resemble `sin(πx)sin(πy)` (a single symmetric bump).
4. Confirm `LinAlg.jacobi`'s `converged: true` in both cases (check via browser console if not
   surfaced directly in the UI).
5. Check the browser console for JS errors.
6. If any check fails, fix the underlying issue and repeat this pass before considering Phase
   5b done.
