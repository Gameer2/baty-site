# ODE Engine Phase 5a — Wave Equation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Wave Equation page: `u_tt = c²u_xx`, Dirichlet ends, initial position `f(x)` and
velocity `g(x)`, solved by separation of variables (standing-wave series) and independently
cross-checked against d'Alembert's traveling-wave form before anything is shown.

**Architecture:** Three new pure functions in `ode-symbolic.js` (`waveSeriesValue`,
`oddPeriodicExtension`, `dAlembertValue`), a `solveWaveEquation` orchestrator mirroring
`solveHeatEquation` exactly, wired through the existing lightweight `cas-worker.js` (no
Pyodide/SymPy — this is pure numerics, same as the heat equation). A new page
(`wave-equation.html` + `ode-wave.js`) renders the heatmap and verifies the two independently
derived forms agree numerically.

Full design rationale: `docs/superpowers/specs/2026-08-02-ode-engine-phase5a-wave-design.md`.

## Global Constraints

- Dirichlet BCs only (`u(0,t)=u(L,t)=0`), matching the heat equation page's scope.
- Every result MUST be independently verified before being shown — here, by comparing the
  standing-wave series against d'Alembert's form at a quorum of sample points, not by
  substituting into the PDE directly (both forms are already independent derivations of the
  same answer; agreement between them is the check).
- Unlike Phases 1-4, none of this phase's new logic touches Pyodide/SymPy — it is all pure JS
  (Simpson's rule + `math.js` compile, same as the existing heat equation), so it IS
  Node-testable, including `solveWaveEquation` itself.

---

### Task 1: `waveSeriesValue`, `oddPeriodicExtension`, `dAlembertValue`

**Files:**
- Modify: `assets/js/ode-symbolic.js`
- Modify: `tests/verify-ode.js`

**Interfaces:**
- Produces: `ODESymbolic.waveSeriesValue(An, Bn, L, c, x, t)` → number.
  `ODESymbolic.oddPeriodicExtension(fn, L)` → `(x) => number`, the odd `2L`-periodic extension
  of `fn` (defined on `[0,L]`). `ODESymbolic.dAlembertValue(Fext, Gext, c, x, t)` → number.
- Consumes: the module's existing private `simpsonIntegrate(fn, a, b, n)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/verify-ode.js`, in a new section after the heat-equation tests (search for the
heat equation section header to find the right spot, e.g. after `heatSeriesValue`/
`solveHeatEquation` tests):

```javascript
console.log("\nwaveSeriesValue:");
{
  // Single mode n=1: An=[1], Bn=[0], L=1, c=1 -> u(x,t) = cos(pi*t)*sin(pi*x), the exact
  // standing-wave solution for f(x)=sin(pi x), g=0.
  const u = ODESymbolic.waveSeriesValue([1], [0], 1, 1, 0.3, 0.5);
  const exact = Math.cos(Math.PI * 0.5) * Math.sin(Math.PI * 0.3);
  ok(Math.abs(u - exact) < 1e-10, "single-mode standing wave matches the exact solution", `got=${u}, exact=${exact}`);
}

console.log("\noddPeriodicExtension:");
{
  const f = (x) => x * (1 - x); // defined on [0,1]
  const F = ODESymbolic.oddPeriodicExtension(f, 1);
  ok(Math.abs(F(0.3) - f(0.3)) < 1e-10, "matches f on [0,L]");
  ok(Math.abs(F(-0.3) - (-f(0.3))) < 1e-10, "odd: F(-x) = -f(x)");
  ok(Math.abs(F(1.7) - F(1.7 - 2)) < 1e-10, "2L-periodic: F(x) = F(x - 2L)");
  ok(Math.abs(F(0) - 0) < 1e-10, "F(0) = 0 (odd function)");
}

console.log("\ndAlembertValue:");
{
  // f(x) = sin(pi x), g = 0, L=1, c=1 -> exact solution cos(pi c t) sin(pi x), same as the
  // waveSeriesValue single-mode check above -- cross-checks the two independent code paths.
  const f = (x) => Math.sin(Math.PI * x);
  const Fext = ODESymbolic.oddPeriodicExtension(f, 1);
  const Gext = ODESymbolic.oddPeriodicExtension(() => 0, 1);
  const u = ODESymbolic.dAlembertValue(Fext, Gext, 1, 0.3, 0.5);
  const exact = Math.cos(Math.PI * 0.5) * Math.sin(Math.PI * 0.3);
  ok(Math.abs(u - exact) < 1e-6, "d'Alembert matches the same exact single-mode solution", `got=${u}, exact=${exact}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode.js`
Expected: FAIL — `ODESymbolic.waveSeriesValue is not a function`.

- [ ] **Step 3: Implement the three functions**

In `assets/js/ode-symbolic.js`, find `ODESymbolic.heatSeriesValue` and add directly after
`ODESymbolic.solveHeatEquation`'s closing `};` (before the `Numeric fallbacks` section
comment):

```javascript
  /* ============================================================
   * PDE — Wave Equation (Phase 5a of the ODE/PDE redesign)
   * ============================================================ */

  // Standing-wave (normal-mode) series: u(x,t) = sum [An cos(n*pi*c*t/L) + Bn sin(n*pi*c*t/L)] sin(n*pi*x/L).
  ODESymbolic.waveSeriesValue = function (An, Bn, L, c, x, t) {
    let s = 0;
    for (let n = 1; n <= An.length; n++) {
      const arg = (n * Math.PI * c * t) / L;
      s += (An[n - 1] * Math.cos(arg) + Bn[n - 1] * Math.sin(arg)) * Math.sin((n * Math.PI * x) / L);
    }
    return s;
  };

  // The odd, 2L-periodic extension of fn (defined on [0,L]) to all reals -- the reflection
  // method d'Alembert's form needs for a FINITE string with Dirichlet ends. Shared by both F
  // (from the initial position f) and G (from the initial velocity g).
  ODESymbolic.oddPeriodicExtension = function (fn, L) {
    const period = 2 * L;
    return function (x) {
      let xm = ((x % period) + period) % period; // reduce to [0, 2L)
      if (xm > L) xm -= period; // now in (-L, L]
      return xm < 0 ? -fn(-xm) : fn(xm);
    };
  };

  // d'Alembert's traveling-wave form: u(x,t) = [Fext(x-ct)+Fext(x+ct)]/2 + (1/2c) * integral of
  // Gext from x-ct to x+ct. Fext/Gext: odd-periodic extensions of f/g (oddPeriodicExtension).
  ODESymbolic.dAlembertValue = function (Fext, Gext, c, x, t) {
    const lo = x - c * t, hi = x + c * t;
    const travelling = (Fext(lo) + Fext(hi)) / 2;
    if (c === 0) return travelling;
    const velocityTerm = simpsonIntegrate(Gext, lo, hi, 200) / (2 * c);
    return travelling + velocityTerm;
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode.js`
Expected: PASS, all new assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-symbolic.js tests/verify-ode.js
git commit -m "feat(wave): add waveSeriesValue/oddPeriodicExtension/dAlembertValue (TDD)"
```

---

### Task 2: `solveWaveEquation`

**Files:**
- Modify: `assets/js/ode-symbolic.js`
- Modify: `tests/verify-ode.js`

**Interfaces:**
- Consumes: `waveSeriesValue`'s neighbors, `math_()` (module-private, via `CalcCore`), the
  module's private `simpsonIntegrate`.
- Produces: `ODESymbolic.solveWaveEquation({L, c, fxExpr, gxExpr, N, T})` → `{
  classificationLine, steps, generalSolution, particularSolution: null, An, Bn, L, c, T }` —
  same shape family as `solveHeatEquation`.

- [ ] **Step 1: Write the failing test**

Add to `tests/verify-ode.js`, after the `dAlembertValue` block:

```javascript
console.log("\nsolveWaveEquation:");
{
  // f(x) = sin(pi x), g = 0, L=1, c=1 -> An=[1,0,0,...], Bn=[0,0,0,...] (single mode).
  const box = ODESymbolic.solveWaveEquation({ L: 1, c: 1, fxExpr: "sin(pi*x)", gxExpr: "0", N: 5, T: 1 });
  ok(Math.abs(box.An[0] - 1) < 1e-6, "A1 ~ 1 for f(x)=sin(pi x)", `A1=${box.An[0]}`);
  ok(box.An.slice(1).every((v) => Math.abs(v) < 1e-6), "higher An ~ 0 for a pure single-mode f");
  ok(box.Bn.every((v) => Math.abs(v) < 1e-6), "all Bn ~ 0 when g=0");
  ok(typeof box.classificationLine === "string" && box.classificationLine.length > 0, "returns a classification line");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode.js`
Expected: FAIL — `ODESymbolic.solveWaveEquation is not a function`.

- [ ] **Step 3: Implement `solveWaveEquation`**

In `assets/js/ode-symbolic.js`, add directly after `ODESymbolic.dAlembertValue = ...;`:

```javascript
  ODESymbolic.solveWaveEquation = function ({ L, c, fxExpr, gxExpr, N, T }) {
    const fFn = math_().parse(fxExpr).compile();
    const f = (x) => fFn.evaluate({ x });
    const gFn = math_().parse(gxExpr || "0").compile();
    const g = (x) => gFn.evaluate({ x });

    const An = [], Bn = [];
    for (let n = 1; n <= N; n++) {
      const integrandA = (x) => f(x) * Math.sin((n * Math.PI * x) / L);
      An.push((2 / L) * simpsonIntegrate(integrandA, 0, L, 120));
      const integrandB = (x) => g(x) * Math.sin((n * Math.PI * x) / L);
      const bCoeff = (2 / L) * simpsonIntegrate(integrandB, 0, L, 120);
      Bn.push(bCoeff / ((n * Math.PI * c) / L));
    }

    const steps = [
      { tex: `u_{tt} = ${c}^2\\,u_{xx}, \\quad 0 < x < ${L}, \\quad u(0,t)=u(${L},t)=0, \\quad u(x,0)=f(x), \\quad u_t(x,0)=g(x)` },
      { label: "Separate variables: u(x,t) = X(x)·T(t)", tex: `X'' + \\lambda X = 0, \\qquad T'' + ${c}^2\\lambda T = 0` },
      { label: "Dirichlet eigenvalue problem gives", tex: `\\lambda_n = \\left(\\frac{n\\pi}{${L}}\\right)^2, \\quad X_n(x) = \\sin\\!\\frac{n\\pi x}{${L}}` },
      { label: "Solve the time ODE", tex: `T_n(t) = A_n\\cos\\!\\frac{n\\pi ${c} t}{${L}} + B_n\\sin\\!\\frac{n\\pi ${c} t}{${L}}` },
      { label: "Match u(x,0)=f(x) — Fourier sine coefficients", tex: `A_n = \\frac{2}{${L}}\\int_0^{${L}} f(x)\\sin\\!\\frac{n\\pi x}{${L}}\\,dx` },
      { label: "Match u_t(x,0)=g(x) — Fourier sine coefficients", tex: `B_n = \\frac{2}{n\\pi ${c}}\\int_0^{${L}} g(x)\\sin\\!\\frac{n\\pi x}{${L}}\\,dx` },
    ];
    return {
      classificationLine: "Hyperbolic PDE (wave equation), Dirichlet boundary conditions — solved by separation of variables, cross-checked against d'Alembert's traveling-wave form.",
      steps,
      generalSolution: `u(x,t) = \\sum_{n=1}^{\\infty} \\left(A_n\\cos\\frac{n\\pi ${c} t}{${L}} + B_n\\sin\\frac{n\\pi ${c} t}{${L}}\\right)\\sin\\frac{n\\pi x}{${L}}`,
      particularSolution: null,
      An, Bn, L, c, T,
    };
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/verify-ode.js`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add assets/js/ode-symbolic.js tests/verify-ode.js
git commit -m "feat(wave): add solveWaveEquation orchestrator (TDD)"
```

---

### Task 3: Wire `solveWaveEquation` through the CAS worker

**Files:**
- Modify: `assets/js/cas-worker.js`
- Modify: `assets/js/cas-client.js`

**Interfaces:**
- Produces: `CAS.solveWaveEquation(params, opts)` — a Promise resolving to the box from Task 2.

- [ ] **Step 1: Register the worker op**

In `assets/js/cas-worker.js`, find `solveHeatEquation: (args) => ODESymbolic.solveHeatEquation(args[0]),`
and add directly after it:

```javascript
  solveWaveEquation: (args) => ODESymbolic.solveWaveEquation(args[0]),
```

- [ ] **Step 2: Add the client wrapper**

In `assets/js/cas-client.js`, find `CAS.solveHeatEquation` (search for `CAS.solveHeatEquation = function`)
and add directly after its closing `};`:

```javascript
  CAS.solveWaveEquation = function (params, opts) {
    return CAS.call("solveWaveEquation", [params], opts);
  };
```

- [ ] **Step 3: Commit**

```bash
git add assets/js/cas-worker.js assets/js/cas-client.js
git commit -m "feat(wave): wire solveWaveEquation through the CAS worker"
```

---

### Task 4: `wave-equation.html` page + `ode-wave.js` wiring

**Files:**
- Create: `engines/ode/methods/wave-equation.html`
- Create: `assets/js/ode-wave.js`
- Modify: `engines/ode/methods.html` (new card)

**Interfaces:**
- Consumes: `CAS.solveWaveEquation` (Task 3), `ODESymbolic.waveSeriesValue`/
  `oddPeriodicExtension`/`dAlembertValue` (Task 1), `ODERender.bigBox`, `Engine.plotlyBaseLayout`.
- Not Node-tested — DOM/page wiring, verified manually in Task 5.

- [ ] **Step 1: Create `engines/ode/methods/wave-equation.html`**

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Wave Equation — ODE/PDE Engine</title>
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
    <span class="eyebrow">Partial Differential Equations</span>
    <h1 class="h2" style="margin-top:14px;">Wave Equation</h1>
    <p class="method-summary">The wave equation <span class="mono">u_tt = c&sup2;·u_xx</span> on <span class="mono">0 &lt; x &lt; L</span>, ends fixed (<span class="mono">u(0,t) = u(L,t) = 0</span>), initial position <span class="mono">u(x,0) = f(x)</span> and initial velocity <span class="mono">u_t(x,0) = g(x)</span>. Solved two independent ways — the standing-wave (normal-mode) series from separation of variables, and d'Alembert's traveling-wave form — and shown only once they agree numerically.</p>
  </div>
</section>

<section class="section--tight">
  <div class="container">
    <div class="workspace">

      <form class="panel crosshair-host" id="pdeForm">
        <span class="panel-title">Input</span>
        <p class="p2" style="margin:0 0 18px;">u<sub>tt</sub> = c&sup2;·u<sub>xx</sub> on 0 &lt; x &lt; L, with u(0,t) = u(L,t) = 0 (Dirichlet), u(x,0) = f(x), u<sub>t</sub>(x,0) = g(x).</p>

        <div class="field-row">
          <div class="field"><label for="pdeL">Length L</label><input type="number" id="pdeL" value="1" step="any" min="0.1" /></div>
          <div class="field"><label for="pdeC">Wave speed c</label><input type="number" id="pdeC" value="1" step="any" min="0.0001" /></div>
        </div>
        <div class="field">
          <label for="pdeFx">Initial position f(x)</label>
          <input type="text" id="pdeFx" class="mono" value="sin(pi*x)" autocomplete="off" spellcheck="false" />
          <span class="field-note">Preview</span>
          <div class="katex-preview" id="fxPreview"></div>
          <button type="button" class="keypad-toggle is-open" id="keypadToggle">
            <span>Math Keypad</span><span class="chev">⌄</span>
          </button>
          <div class="math-keypad is-open" id="fxKeypad"></div>
        </div>
        <div class="field" style="margin-top:14px;">
          <label for="pdeGx">Initial velocity g(x)</label>
          <input type="text" id="pdeGx" class="mono" value="0" autocomplete="off" spellcheck="false" />
          <span class="field-note">Preview</span>
          <div class="katex-preview" id="gxPreview"></div>
          <div class="math-keypad" id="gxKeypad"></div>
        </div>
        <span class="field-note" style="margin-top:14px;">Worked examples — click to load</span>
        <div class="method-tags" id="presetRow">
          <button type="button" class="tag" data-fx="sin(pi*x)" data-gx="0">Single mode, plucked</button>
          <button type="button" class="tag" data-fx="0" data-gx="sin(2*pi*x)">Single mode, struck</button>
          <button type="button" class="tag" data-fx="x*(1-x)" data-gx="sin(pi*x)">Mixed IC</button>
        </div>
        <div class="field-row" style="margin-top:14px;">
          <div class="field"><label for="pdeN">Terms N</label><input type="number" id="pdeN" value="15" step="1" min="1" max="60" /></div>
          <div class="field"><label for="pdeT">Max time T</label><input type="number" id="pdeT" value="2" step="any" min="0.01" /></div>
        </div>

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
          <p class="p1">Set the length, wave speed, initial position and velocity, then solve — the standing-wave series (cross-checked against d'Alembert's traveling-wave form) and the displacement surface over time will appear here.</p>
        </div>
        <div id="resultsArea" style="display:none;"></div>
        <div id="plotsWrap" style="display:none;">
          <div class="plot-wrap crosshair-host">
            <div class="plot-wrap-head"><span class="panel-title" style="margin:0;">u(x,t) — displacement over space and time</span></div>
            <div id="wavePlot" style="height:360px;"></div>
          </div>
          <div class="plot-wrap crosshair-host">
            <div class="plot-wrap-head"><span class="panel-title" style="margin:0;">Snapshots at fixed t</span></div>
            <div id="snapshotsPlot" style="height:280px;"></div>
          </div>
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
<script src="../../../assets/js/cas-client.js" defer></script>
<script src="../../../assets/js/ode-wave.js" defer></script>
<script defer>
  document.addEventListener("DOMContentLoaded", () => Engine.initChrome());
</script>
</body>
</html>
```

Note this adds a "Heat&nbsp;PDE" nav link that the current `heat-equation.html` doesn't
reciprocally link back to `laplace-transform.html`'s neighbors consistently — matches this
codebase's existing (already inconsistent pre-Phase-5) nav pattern, not a new inconsistency
introduced here (see Phase 2's plan for the same observation).

- [ ] **Step 2: Create `assets/js/ode-wave.js`**

```javascript
/* Wave Equation page wiring — Phase 5a of the ODE/PDE redesign. Calls CAS.solveWaveEquation
   (-> ODESymbolic.solveWaveEquation: separation of variables -> Dirichlet eigenvalue problem ->
   Fourier sine coefficients via Simpson's rule for BOTH the position and velocity initial
   conditions), then independently reconstructs d'Alembert's traveling-wave form from the same
   f(x)/g(x) and verifies the two agree at a quorum of sample points before rendering anything
   — two independent derivations of the same answer, cross-checked, same discipline as every
   other numeric verification on this site. */
(function () {
  "use strict";

  const form = document.getElementById("pdeForm");
  const pdeL = document.getElementById("pdeL"), pdeC = document.getElementById("pdeC");
  const pdeFx = document.getElementById("pdeFx"), pdeGx = document.getElementById("pdeGx");
  const pdeN = document.getElementById("pdeN"), pdeT = document.getElementById("pdeT");
  const formError = document.getElementById("formError"), formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus"), startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const plotsWrap = document.getElementById("plotsWrap");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  const SAMPLE_POINTS = [[0.2, 0.3], [0.5, 0.6], [0.7, 1.1], [0.35, 1.7], [0.6, 2.3]];

  function crossCheck(box, f, g) {
    const Fext = ODESymbolic.oddPeriodicExtension(f, box.L);
    const Gext = ODESymbolic.oddPeriodicExtension(g, box.L);
    let usable = 0;
    for (const [x, t] of SAMPLE_POINTS) {
      if (t > box.T * 3) continue; // stay in a sensible time range
      let series, dalembert;
      try {
        series = ODESymbolic.waveSeriesValue(box.An, box.Bn, box.L, box.c, x, t);
        dalembert = ODESymbolic.dAlembertValue(Fext, Gext, box.c, x, t);
      } catch (e) { continue; }
      if (![series, dalembert].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(series - dalembert) > 5e-2 * Math.max(1, Math.abs(dalembert))) return false;
    }
    return usable >= 3;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const L = parseFloat(pdeL.value), c = parseFloat(pdeC.value);
    const N = parseInt(pdeN.value, 10), T = parseFloat(pdeT.value);
    if (!(L > 0)) { setStatus(false, "Length L must be positive."); return; }
    if (!(c > 0)) { setStatus(false, "Wave speed c must be positive."); return; }
    if (!(N >= 1)) { setStatus(false, "Terms N must be at least 1."); return; }
    if (!(T > 0)) { setStatus(false, "Max time T must be positive."); return; }
    if (!pdeFx.value.trim()) { setStatus(false, "Enter an initial position f(x)."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    if (submitBtn) submitBtn.textContent = "Solving…";

    CAS.solveWaveEquation({ L, c, fxExpr: pdeFx.value.trim(), gxExpr: pdeGx.value.trim() || "0", N, T }).then((box) => {
      let fFn, gFn;
      try {
        fFn = math.parse(pdeFx.value.trim()).compile();
        gFn = math.parse(pdeGx.value.trim() || "0").compile();
      } catch (e) {
        showError("Couldn't evaluate f(x) or g(x): " + e.message);
        setStatus(false, e.message);
        return;
      }
      const f = (x) => fFn.evaluate({ x }), g = (x) => gFn.evaluate({ x });

      if (!crossCheck(box, f, g)) {
        showError("The standing-wave series and d'Alembert's form did not agree — refusing to show an unconfirmed result.");
        setStatus(false, "Verification failed.");
        return;
      }

      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      ODERender.bigBox(resultsArea, box);
      plotsWrap.style.display = "";

      const u = (x, t) => ODESymbolic.waveSeriesValue(box.An, box.Bn, box.L, box.c, x, t);
      const NX = 60, NT = 50;
      const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * L);
      const ts = Array.from({ length: NT }, (_, i) => (i / (NT - 1)) * T);
      const z = ts.map((t) => xs.map((x) => u(x, t)));
      Plotly.newPlot("wavePlot", [{
        x: xs, y: ts, z, type: "heatmap",
        colorscale: [[0, "#090909"], [0.5, "#4f8fc0"], [1, "#e7e7e7"]]
      }], Engine.plotlyBaseLayout({
        xaxis: { title: "x" }, yaxis: { title: "t" }, margin: { l: 55, r: 20, t: 20, b: 45 }
      }), Engine.plotlyConfig);

      const snapTimes = [0, T * 0.1, T * 0.3, T * 0.6, T].filter((v, i, arr) => arr.indexOf(v) === i);
      const snapTraces = snapTimes.map((t, i) => ({
        x: xs, y: xs.map((x) => u(x, t)), mode: "lines", name: `t=${Engine.formatNum(t, 3)}`,
        line: { width: 2, color: ["#4f8fc0", "#5c939f", "#59a993", "#ed6d40", "#c15a86"][i % 5] }
      }));
      Plotly.newPlot("snapshotsPlot", snapTraces, Engine.plotlyBaseLayout({
        xaxis: { title: "x" }, yaxis: { title: "u(x,t)" }, legend: { orientation: "h", y: -0.2 }
      }), Engine.plotlyConfig);

      setStatus(true, "Solved — standing-wave and d'Alembert forms agree.");
    }).catch((err) => {
      showError(err.message || String(err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = "Solve";
    });
  });

  function updatePreviews() {
    Engine.renderKatex(document.getElementById("fxPreview"), pdeFx.value.trim() ? `f(x) = ${Engine.toLatex(pdeFx.value)}` : "", false);
    Engine.renderKatex(document.getElementById("gxPreview"), pdeGx.value.trim() ? `g(x) = ${Engine.toLatex(pdeGx.value)}` : "", false);
  }

  document.querySelectorAll("#presetRow .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      pdeFx.value = btn.dataset.fx;
      pdeGx.value = btn.dataset.gx;
      updatePreviews();
    });
  });

  Engine.attachMathKeypad(pdeFx, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));
  Engine.attachMathKeypad(pdeGx, document.getElementById("gxKeypad"));
  const debounced = Engine.debounce(updatePreviews, 220);
  [pdeFx, pdeGx, pdeL, pdeC, pdeN, pdeT].forEach((el) => el.addEventListener("input", debounced));
  updatePreviews();
})();
```

- [ ] **Step 3: Add the Wave Equation card to `methods.html`**

Insert a new card (following the existing card template, bumping every `engine-index`
denominator by one, same mechanical process as Phase 2's Task 9) linking to
`methods/wave-equation.html`, tags: "Standing waves", "d'Alembert form", "Cross-verified".

- [ ] **Step 4: Commit**

```bash
git add engines/ode/methods/wave-equation.html assets/js/ode-wave.js engines/ode/methods.html
git commit -m "feat(wave): add the Wave Equation page"
```

---

### Task 5: Manual browser verification pass

- [ ] **Step 1: Serve `math-lab/` locally and open `engines/ode/methods/wave-equation.html`**

Check:
1. Position-only IC (`f(x)=sin(pi*x)`, `g(x)=0`, `L=1`, `c=1`) — must solve, cross-check pass,
   heatmap showing a clean standing wave.
2. Velocity-only IC (`f(x)=0`, `g(x)=sin(2*pi*x)`, same `L`,`c`) — must solve and cross-check
   pass.
3. Mixed IC (`f(x)=x*(1-x)`, `g(x)=sin(pi*x)`) — must solve and cross-check pass.
4. Check the browser console for JS errors.
5. If any check fails, fix the underlying issue and repeat this pass before considering Phase
   5a done.
