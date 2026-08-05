# ODE Engine Phase 5c — Numerical PDE Schemes and CFL Stability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit (FTCS), implicit (BTCS), and Crank-Nicolson finite-difference schemes to
the existing, already-shipped heat equation page, with the CFL ratio always shown and the
explicit scheme's instability past `r=1/2` demonstrated plainly (not hidden) next to the still-
accurate implicit/Crank-Nicolson results and the page's own already-verified analytic series
solution.

**Architecture:** Three new pure functions in `ode-symbolic.js`. Explicit is direct array
arithmetic; implicit/Crank-Nicolson build a small dense tridiagonal system each step and reuse
`LinAlg.solveSystem` (already built, strictly diagonally dominant by construction so always a
unique solution). The existing heat equation page gains a new panel wired to these.

Full design rationale: `docs/superpowers/specs/2026-08-02-ode-engine-phase5c-numerical-pde-design.md`.

## Global Constraints

- Applies to the heat equation only, reusing the existing page's `L`, `k`, `f(x)` inputs.
- The CFL ratio `r=kΔt/Δx²` travels with every result and is always rendered, never buried in a
  caption — the roadmap's own explicit requirement.
- Explicit divergence past `r=1/2` is NOT an error to suppress — render it plainly.
- All new logic is pure JS (array arithmetic + `LinAlg.solveSystem`, already Node-tested) —
  Node-testable, same as Phase 5a/5b.

---

### Task 1: `heatFTCS`, `heatBTCS`, `heatCrankNicolson`

**Files:**
- Modify: `assets/js/ode-symbolic.js`
- Modify: `tests/verify-ode.js`

**Interfaces:**
- Produces: `ODESymbolic.heatFTCS(f0Values, r, steps)`, `ODESymbolic.heatBTCS(f0Values, r,
  steps)`, `ODESymbolic.heatCrankNicolson(f0Values, r, steps)` — each takes `f0Values`
  (`number[]` of length `M+1`, endpoints already `0`) and returns `{ profile: number[],
  cflRatio: r, method: "explicit"|"implicit"|"crank-nicolson" }`. Implicit/CN consume
  `LinAlg.solveSystem` (already in the codebase, no new dependency wiring needed since
  `ode-symbolic.js` is only ever loaded on pages that already load `linalg-algorithms.js` — see
  Task 3).

- [ ] **Step 1: Write the failing tests**

Add to `tests/verify-ode.js`, in a new section after the wave equation tests (Phase 5a, if
already landed — otherwise after the heat equation tests):

```javascript
console.log("\nheatFTCS / heatBTCS / heatCrankNicolson:");
{
  const L = 1, k = 1, M = 20;
  const h = L / M;
  const f0 = Array.from({ length: M + 1 }, (_, i) => Math.sin(Math.PI * i * h / L));
  function exact(x, t) { return Math.exp(-k * (Math.PI / L) ** 2 * t) * Math.sin(Math.PI * x / L); }

  // Stable case: r = 0.4, all three schemes should track the exact solution closely.
  {
    const r = 0.4, steps = 30, dt = r * h * h / k, tFinal = steps * dt;
    const exactProfile = Array.from({ length: M + 1 }, (_, i) => exact(i * h, tFinal));
    for (const [name, fn] of [["heatFTCS", ODESymbolic.heatFTCS], ["heatBTCS", ODESymbolic.heatBTCS], ["heatCrankNicolson", ODESymbolic.heatCrankNicolson]]) {
      const out = fn(f0, r, steps);
      const maxErr = Math.max(...out.profile.map((v, i) => Math.abs(v - exactProfile[i])));
      ok(maxErr < 0.02, `${name} matches the exact solution at r=0.4`, `maxErr=${maxErr}`);
      ok(out.cflRatio === r, `${name} reports the CFL ratio`);
    }
  }

  // Unstable case for explicit only: r = 0.9, explicit should blow up, implicit/CN should not.
  {
    const r = 0.9, steps = 60, dt = r * h * h / k;
    const explicitOut = ODESymbolic.heatFTCS(f0, r, steps);
    const maxExplicit = Math.max(...explicitOut.profile.map(Math.abs));
    ok(maxExplicit > 1000, "explicit scheme visibly diverges at r=0.9", `max|U|=${maxExplicit}`);

    const btcsOut = ODESymbolic.heatBTCS(f0, r, steps);
    const maxBtcs = Math.max(...btcsOut.profile.map(Math.abs));
    ok(maxBtcs < 2, "implicit scheme stays bounded at r=0.9 (unconditionally stable)", `max|U|=${maxBtcs}`);

    const cnOut = ODESymbolic.heatCrankNicolson(f0, r, steps);
    const maxCn = Math.max(...cnOut.profile.map(Math.abs));
    ok(maxCn < 2, "Crank-Nicolson stays bounded at r=0.9 (unconditionally stable)", `max|U|=${maxCn}`);
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/verify-ode.js`
Expected: FAIL — `ODESymbolic.heatFTCS is not a function`.

- [ ] **Step 3: Resolve the new `LinAlg` dependency**

`heatBTCS`/`heatCrankNicolson` need `LinAlg.solveSystem`, but `ode-symbolic.js` currently only
resolves `CalcCore` this way — `LinAlg` isn't part of that chain yet. In
`assets/js/ode-symbolic.js`, find the existing `CalcCore` resolution block (search for `const
CalcCore =`) and add directly after its closing `}` (the `if (!CalcCore) { throw ... }` block):

```javascript
  // Same require-or-global resolution as CalcCore above, for the two new numerical PDE
  // schemes (Phase 5c) that need LinAlg.solveSystem. Pages that don't load linalg-algorithms.js
  // (everything except heat-equation.html) simply never call heatBTCS/heatCrankNicolson, so an
  // unresolved LinAlg there is harmless.
  const LinAlg =
    (typeof module === "object" && module.exports)
      ? require("./linalg-algorithms.js")
      : (typeof self !== "undefined" ? self.LinAlg : root.LinAlg);
```

- [ ] **Step 4: Implement the three functions**

In `assets/js/ode-symbolic.js`, add directly after `ODESymbolic.heatSeriesValue`/
`solveHeatEquation` (or after Phase 5a's wave equation functions, if already landed — either
way, directly before the `Numeric fallbacks` section comment):

```javascript
  /* ============================================================
   * PDE — Numerical schemes for the Heat Equation (Phase 5c)
   * ============================================================ */

  // Explicit FTCS: U[i]^(n+1) = U[i]^n + r*(U[i+1]^n - 2U[i]^n + U[i-1]^n). Endpoints stay 0
  // (Dirichlet). Stable iff r <= 1/2 -- unstable r visibly diverges, which is the point of this
  // section, not a bug to hide.
  ODESymbolic.heatFTCS = function (f0Values, r, steps) {
    let U = f0Values.slice();
    const M = U.length - 1;
    for (let s = 0; s < steps; s++) {
      const next = U.slice();
      for (let i = 1; i < M; i++) next[i] = U[i] + r * (U[i + 1] - 2 * U[i] + U[i - 1]);
      next[0] = 0; next[M] = 0;
      U = next;
    }
    return { profile: U, cflRatio: r, method: "explicit" };
  };

  // Implicit BTCS: (1+2r)U[i]^(n+1) - r*U[i+1]^(n+1) - r*U[i-1]^(n+1) = U[i]^n. Unconditionally
  // stable -- solved as a dense linear system each step via LinAlg.solveSystem (strictly
  // diagonally dominant by construction: 1+2r > 2r always, so always a unique solution).
  ODESymbolic.heatBTCS = function (f0Values, r, steps) {
    const M = f0Values.length - 1;
    const n = M - 1;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      A[i][i] = 1 + 2 * r;
      if (i > 0) A[i][i - 1] = -r;
      if (i < n - 1) A[i][i + 1] = -r;
    }
    let interior = f0Values.slice(1, M);
    for (let s = 0; s < steps; s++) {
      const result = LinAlg.solveSystem(A, interior);
      if (result.type !== "unique") throw new Error("The implicit scheme's linear system did not have a unique solution.");
      interior = result.solution;
    }
    return { profile: [0, ...interior, 0], cflRatio: r, method: "implicit" };
  };

  // Crank-Nicolson: averages the explicit and implicit operators -- (1+r)U[i]^(n+1) -
  // (r/2)(U[i+1]^(n+1)+U[i-1]^(n+1)) = (1-r)U[i]^n + (r/2)(U[i+1]^n+U[i-1]^n). Also
  // unconditionally stable, second-order accurate in time (vs BTCS's first-order).
  ODESymbolic.heatCrankNicolson = function (f0Values, r, steps) {
    const M = f0Values.length - 1;
    const n = M - 1;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      A[i][i] = 1 + r;
      if (i > 0) A[i][i - 1] = -r / 2;
      if (i < n - 1) A[i][i + 1] = -r / 2;
    }
    let U = f0Values.slice();
    for (let s = 0; s < steps; s++) {
      const rhs = new Array(n);
      for (let k = 0; k < n; k++) {
        const i = k + 1;
        rhs[k] = (1 - r) * U[i] + (r / 2) * (U[i + 1] + U[i - 1]);
      }
      const result = LinAlg.solveSystem(A, rhs);
      if (result.type !== "unique") throw new Error("The Crank-Nicolson scheme's linear system did not have a unique solution.");
      U = [0, ...result.solution, 0];
    }
    return { profile: U, cflRatio: r, method: "crank-nicolson" };
  };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/verify-ode.js`
Expected: PASS, all new assertions green (the Node test run resolves `LinAlg` automatically via
the `require("./linalg-algorithms.js")` branch added in Step 3 — no test-file changes needed).

- [ ] **Step 6: Commit**

```bash
git add assets/js/ode-symbolic.js tests/verify-ode.js
git commit -m "feat(heat): add heatFTCS/heatBTCS/heatCrankNicolson finite-difference schemes (TDD)"
```

---

### Task 2: Wire the Numerical Schemes panel into the heat equation page

**Files:**
- Modify: `engines/ode/methods/heat-equation.html`
- Modify: `assets/js/ode-heat.js`

**Interfaces:**
- Consumes: `ODESymbolic.heatFTCS`/`heatBTCS`/`heatCrankNicolson` (Task 1), the page's already-
  computed analytic series solution (`ODESymbolic.heatSeriesValue`, already wired).

- [ ] **Step 1: Add the panel markup**

In `engines/ode/methods/heat-equation.html`, find the `plotsWrap` div (search for
`id="plotsWrap"`) and add a new panel directly after the existing `snapshotsPlot` panel, still
inside `plotsWrap`:

```html
          <div class="plot-wrap crosshair-host">
            <div class="plot-wrap-head"><span class="panel-title" style="margin:0;">Numerical schemes vs. the analytic solution</span></div>
            <div class="field-row" style="margin-bottom:14px;">
              <div class="field"><label for="schemeSelect">Scheme</label>
                <select id="schemeSelect" class="mono">
                  <option value="explicit">Explicit (FTCS)</option>
                  <option value="implicit">Implicit (BTCS)</option>
                  <option value="crank-nicolson">Crank-Nicolson</option>
                </select>
              </div>
              <div class="field"><label for="schemeR">CFL ratio r = kΔt/Δx&sup2;</label><input type="number" id="schemeR" value="0.4" step="any" min="0.01" /></div>
              <div class="field"><label for="schemeSteps">Steps</label><input type="number" id="schemeSteps" value="30" step="1" min="1" max="500" /></div>
            </div>
            <button type="button" class="btn btn--ghost btn--sm" id="runSchemeBtn"><span class="btn-text">Run scheme</span></button>
            <div class="status-line ok" id="schemeStatus" style="margin-top:12px;"><span class="status-dot"></span><span id="schemeStatusText">Pick a scheme and press Run.</span></div>
            <div id="schemePlot" style="height:280px; margin-top:12px;"></div>
          </div>
```

- [ ] **Step 2: Include `linalg-algorithms.js`/`algorithms.js` (needed by `heatBTCS`/
  `heatCrankNicolson`)**

In the same file, find the `<script src="...assets/js/ode-symbolic.js" defer></script>` line
and add these two lines directly before it (matching the dependency order every other page
using `LinAlg` already follows — `algorithms.js` before `linalg-algorithms.js`):

```html
<script src="../../../assets/js/algorithms.js" defer></script>
<script src="../../../assets/js/linalg-algorithms.js" defer></script>
```

- [ ] **Step 3: Wire the panel in `ode-heat.js`**

At the end of `assets/js/ode-heat.js` (after the existing `updateStartCheck();` call at the very
end of the file), add:

```javascript

  // ---- Numerical schemes vs. the analytic solution (Phase 5c) ----
  const schemeSelect = document.getElementById("schemeSelect");
  const schemeR = document.getElementById("schemeR");
  const schemeSteps = document.getElementById("schemeSteps");
  const schemeStatus = document.getElementById("schemeStatus"), schemeStatusText = document.getElementById("schemeStatusText");

  document.getElementById("runSchemeBtn").addEventListener("click", () => {
    const L = parseFloat(pdeL.value), k = parseFloat(pdeK.value);
    if (!(L > 0) || !(k > 0) || !pdeFx.value.trim()) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = "Set a valid length, diffusivity, and initial profile above first.";
      return;
    }
    const r = parseFloat(schemeR.value), steps = parseInt(schemeSteps.value, 10);
    if (!(r > 0) || !(steps >= 1)) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = "r must be positive and steps at least 1.";
      return;
    }

    let fFn;
    try { fFn = math.parse(pdeFx.value.trim()).compile(); } catch (e) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = "Couldn't evaluate f(x): " + e.message;
      return;
    }

    const M = 20, h = L / M;
    const f0 = Array.from({ length: M + 1 }, (_, i) => fFn.evaluate({ x: i * h }));
    const dt = (r * h * h) / k;
    const tFinal = steps * dt;

    let out;
    try {
      out = schemeSelect.value === "explicit" ? ODESymbolic.heatFTCS(f0, r, steps)
        : schemeSelect.value === "implicit" ? ODESymbolic.heatBTCS(f0, r, steps)
        : ODESymbolic.heatCrankNicolson(f0, r, steps);
    } catch (e) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = e.message || String(e);
      return;
    }

    const xs = Array.from({ length: M + 1 }, (_, i) => i * h);
    const N = 40; // matches solveHeatEquation's default term count closely enough for a comparison curve
    const bn = [];
    for (let n = 1; n <= N; n++) {
      const integrand = (x) => fFn.evaluate({ x }) * Math.sin((n * Math.PI * x) / L);
      bn.push((2 / L) * (function simpsonLocal(fn, a, b, nSub) { if (nSub % 2) nSub++; const hh = (b - a) / nSub; let s = fn(a) + fn(b); for (let i = 1; i < nSub; i++) s += (i % 2 ? 4 : 2) * fn(a + i * hh); return (hh / 3) * s; })(integrand, 0, L, 120));
    }
    const analyticYs = xs.map((x) => ODESymbolic.heatSeriesValue(bn, L, k, x, tFinal));

    const traces = [
      { x: xs, y: out.profile, mode: "lines+markers", name: schemeSelect.value, line: { color: "#ed6d40", width: 2.5 } },
      { x: xs, y: analyticYs, mode: "lines", name: "analytic (series)", line: { color: "#59a993", width: 2, dash: "dot" } },
    ];
    Plotly.react("schemePlot", traces, Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: `u(x, t=${Engine.formatNum(tFinal, 3)})` }, legend: { orientation: "h", y: -0.2 } }), Engine.plotlyConfig);

    const stable = r <= 0.5;
    const maxVal = Math.max(...out.profile.map(Math.abs));
    schemeStatus.className = "status-line " + (schemeSelect.value !== "explicit" || stable || maxVal < 10 ? "ok" : "bad");
    schemeStatusText.textContent = `r = ${Engine.formatNum(r, 3)} (CFL limit for explicit: r ≤ 0.5, ${stable ? "stable" : "UNSTABLE"} regime) — max|u| = ${Engine.formatNum(maxVal, 4)}`;
  });
```

- [ ] **Step 4: Commit**

```bash
git add engines/ode/methods/heat-equation.html assets/js/ode-heat.js
git commit -m "feat(heat): add the numerical schemes panel (explicit/implicit/Crank-Nicolson + CFL)"
```

---

### Task 3: Manual browser verification pass

- [ ] **Step 1: Serve `math-lab/` locally and open `engines/ode/methods/heat-equation.html`**

Check:
1. Solve the analytic solution first (any preset), then run **Explicit** at `r=0.4`, 30 steps —
   curve should closely track the analytic (dotted) curve, status line shows "stable regime."
2. Run **Explicit** at `r=0.9`, 60 steps — curve should be wildly different from the analytic
   curve (or off the visible axis range entirely), status line shows "UNSTABLE regime" with a
   large `max|u|`.
3. Run **Implicit** at `r=0.9`, 60 steps — curve should still closely track the analytic curve.
4. Run **Crank-Nicolson** at `r=0.9`, 60 steps — same expectation as implicit.
5. Check the browser console for JS errors.
6. If any check fails, fix the underlying issue and repeat this pass before considering Phase
   5c (and Phase 5 overall) done.
