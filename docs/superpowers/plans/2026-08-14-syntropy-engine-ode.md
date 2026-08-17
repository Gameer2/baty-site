# ODE/PDE Engine — Unblock + Redesign (9 Methods) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Read the design spec
> first: `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md`.
> **Depends on the Foundation plan** (async run mode, CAS bridge, Real-line + Field renderers,
  `ode` engine accent).
> **Unblock status: 2 / 9 CAS ops exist** (`solveHeatEquation`, `solveWaveEquation`). This
> plan surfaces 7 existing cores (`ode-symbolic.js`, `laplace-engine.js`, `ode-solver.js`,
> `ode-direction-fields.js`, `ode-fourier.js`, `ode-poisson.js`, `ode-systems.js`,
> `series-solutions.js`) as `CAS.<op>` (thin routes — no new math), then writes the 9 run-mode specs.

**Goal:** Give all 9 unregistered ODE/PDE methods a Syntropy node and classify each by
archetype. ODE solving is numeric-heavy and/or symbolic (series solutions, Laplace), so all 9
are `executionMode: "run"`.

**Architecture:** Two sub-steps per method whose op doesn't exist: (1) **surface** the existing
core as a `CAS.<op>`; (2) **declare** the run-mode port spec. The 2 methods with existing ops
skip step (1).

**Tech Stack:** TS, Vitest (mock `casClient`). Run from `canvas/`: `yarn test:app --run <files>`,
`yarn test:typecheck`, `yarn test:code`, `yarn fix:code`.

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md` (§5
ode table).

## Global Constraints
- No new math: surfacing a core as a `CAS.<op>` is a thin route. Verify the core's function
  signature in the listed file before registering.
- `executionMode: "run"` for all 9; `engineId: "ode"`.
- `pagePath` = `/math-lab/engines/ode/methods/<slug>.html`; `pageStoreKey` = `engine-lab:ode-<slug>`
  (verify per method — some ode pages use distinct keys like `engine-lab:ode-solver`).
- First declared output's `kind` decides archetype. Pin per method below.
- ODE solution curves are `CurveOutput` (Real-line archetype); PDE solution fields are
  `FieldOutput` (Field archetype).
- Engine accent: ode #4f8fc0.
- After cross-cutting changes, run the **full suite**.

---

## Classification (the redesign)

| # | Method | CAS op (status) | Archetype | First output kind | Other outputs |
|---|---|---|---|---|---|
| 1 | ode-solver | `solveOde` (surface) | Real-line | `curve` | order, steps (number) |
| 2 | systems | `solveOdeSystems` (surface) | Real-line | `curve` | eigenvalues (text) |
| 3 | fourier-series | `odeFourier` (surface) | Real-line | `curve` | coefficients (text) |
| 4 | laplace-transform | `laplaceTransform` (surface) | Real-line | `curve` | F(s) (text) |
| 5 | series-solutions | `seriesSolutions` (surface) | Real-line | `curve` | coefficients (text) |
| 6 | direction-fields | `directionFields` (surface) | Field | `field` | equilibrium (text) |
| 7 | heat-equation | `solveHeatEquation` (exists) | Field | `field` | steadyState (text) |
| 8 | wave-equation | `solveWaveEquation` (exists) | Field | `field` | — |
| 9 | laplace-poisson | `solveLaplacePoisson` (surface) | Field | `field` | — |

(Archetype counts: Real-line 5, Field 4 = 9. Matches spec §5.)

---

## File Structure
- **Modify:** `math-lab/assets/js/cas-client.js` — register the 7 new `CAS.<op>` client methods.
- **Modify:** `math-lab/assets/js/cas-worker.js` — dispatch the 7 new ops to existing cores.
- **Create:** `canvas/excalidraw-app/syntropy/portSpecs/ode/<slug>.ts` (or flat `portSpecs/`,
  matching existing convention). Each exports `<UPPER>_PORT_SPEC`.
- **Modify:** `syntropy/portSpecs/registry.ts` — register `"ode:<slug>"` for all 9.
- **Create:** `canvas/excalidraw-app/tests/<slug>PortSpec.test.ts` per method.
- **Modify:** `tests/portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts`.

---

## Sub-plan A: Surface the 7 missing CAS ops (math-lab side)

### Task A1: solveOde op
- [ ] **Step 1:** Read `ode-solver.js` (or `ode-symbolic.js`) for the existing ODE integrator
  (RK4 / Adams / the page's chosen method). Pin the core function name + arg shape (equation,
  initial conditions, t-span, steps) + return shape (sampled solution points).
- [ ] **Step 2:** In `cas-client.js` add `CAS.solveOde = function(equation, ic, tSpan, steps,
  opts){ return CAS.call("solveOde", [equation, ic, tSpan, steps], opts); }`.
- [ ] **Step 3:** In `cas-worker.js` dispatch `"solveOde"` → the existing core. Confirm the page
  still solves identically (no behavior change).
- [ ] **Step 4: Commit** (math-lab repo): `feat(cas): expose solveOde op (existing core)`

### Task A2: solveOdeSystems op — surface systems-of-ODEs core (`ode-systems.js`); returns
multiple solution curves + (for linear systems) eigenvalues.
### Task A3: odeFourier op — surface the PDE separation-of-variables Fourier series solution
(`ode-fourier.js`); returns the series solution curve + coefficients.
### Task A4: laplaceTransform op — surface `laplace-engine.js` Laplace transform core; returns
F(s) (symbolic/expression) + the transform pair, optionally sampled for a curve.
### Task A5: seriesSolutions op — surface `series-solutions.js` power-series solution core;
returns the series coefficients + the solution curve.
### Task A6: directionFields op — surface `ode-direction-fields.js`; returns a vector grid over
the (t,y) phase plane.
### Task A7: solveLaplacePoisson op — surface `ode-poisson.js` (Laplace/Poisson solver);
returns the solution field grid over the 2D domain.

> Each A-task follows A1's 4 steps (read core → add client method → add worker dispatch →
> commit). One commit per op.

---

## Sub-plan B: The 9 run-mode specs (canvas side)

### Per-method task template
- [ ] **Step A — Verify op signature & page form.** Read `CAS.<op>` args and
  `math-lab/engines/ode/methods/<slug>.html` inputs/outputs.
- [ ] **Step B — Failing test.** Mock `casCall("<op>", ...)` → canned return; assert `compute`
  calls the op with unpacked args and `outputs.<firstKey>` matches the declared shape; assert
  `executionMode:"run"`, `engineId:"ode"`, pagePath/pageStoreKey.
- [ ] **Step C — Run — FAIL.**
- [ ] **Step D — Implement spec.** Inputs from page form; outputs first-kind per table;
  `compute: async (inputs) => { const r = await casCall("<op>", [...]); return { outputs: {
  <map> } }; }`. Map op result into the archetype output shape; surface only returned fields.
- [ ] **Step E — Register in `registry.ts`; run test — PASS.** Typecheck + lint.
- [ ] **Step F — Commit.** `feat(syntropy): ode <slug> → <Archetype> node (run-mode CAS)`

### Task B1: ode-solver → Real-line
**Op:** `CAS.solveOde(equation, ic, tSpan, steps, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"order", kind:"number" }, { key:"steps", kind:"number" }]`. `curve` =
`CurveOutput.points` = the sampled solution y(t) over tSpan; `order` = ODE order; `steps` =
integrator step count. First kind `curve` → Real-line (RealLineNode).

### Task B2: systems → Real-line
**Op:** `CAS.solveOdeSystems(equations, ic, tSpan, steps, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"eigenvalues", kind:"text" }]`. `curve` = multiple solution curves (use
`CurveOutput.points` for one representative + `samples` for the others, OR render via the
FieldNode if the page shows a phase portrait — verify). `eigenvalues` = for linear systems.
First kind `curve` → Real-line. **Borderline (spec §7):** if the page's headline is a 2D phase
portrait (vector field + trajectories), prefer `field` first → Field; v1 default Real-line
unless the op returns a phase-plane vector grid.

### Task B3: fourier-series (ode) → Real-line
**Op:** `CAS.odeFourier(params, opts)`. **Outputs:** `[{ key:"curve", kind:"curve" },
{ key:"coefficients", kind:"text" }]`. `curve` = the series solution (heat/wave separated
solution) over the domain; `coefficients` = the Fourier coefficients. Real-line.

### Task B4: laplace-transform → Real-line
**Op:** `CAS.laplaceTransform(f, opts)`. **Outputs:** `[{ key:"curve", kind:"curve" },
{ key:"transform", kind:"text" }]`. `curve` = F(s) sampled over a real-s window (magnitude);
`transform` = the symbolic F(s) expression. Real-line. **Note:** if the op returns only a
symbolic F(s) and no sampled curve, fall back to Symbolic (first kind `expression`) and
document — verify the core's return shape in Step A.

### Task B5: series-solutions → Real-line
**Op:** `CAS.seriesSolutions(equation, ic, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"coefficients", kind:"text" }]`. `curve` = the series solution sampled
over its convergence interval; `coefficients` = the recurrence/coefficients. Real-line.
**Borderline (spec §7):** if the core returns only the coefficient list (no curve), fall back
to Symbolic (first kind `expression`, `structured.kind:"series"`) — verify in Step A.

### Task B6: direction-fields → Field
**Op:** `CAS.directionFields(equation, domain, opts)`. **Outputs:** `[{ key:"field",
kind:"field" }, { key:"equilibrium", kind:"text" }]`. `FieldOutput.variant:"arrows"`,
`vectors` = the slope field over the (t,y) domain; `equilibrium` = equilibrium/nullcline info
if returned. First kind `field` → Field.

### Task B7: heat-equation → Field
**Op:** `CAS.solveHeatEquation(params, opts)` (exists). **Outputs:** `[{ key:"field",
kind:"field" }, { key:"steadyState", kind:"text" }]`. `FieldOutput.variant:"heatmap"`, `grid`
= temperature over the space domain at a representative time (or a chosen time-slice); if the
op returns a time series of grids, surface one snapshot (the node shows a single field; the
page keeps the animation). `steadyState` = the steady-state solution if returned. First kind
`field` → Field.

### Task B8: wave-equation → Field
**Op:** `CAS.solveWaveEquation(params, opts)` (exists). **Outputs:** `[{ key:"field",
kind:"field" }]`. `FieldOutput.variant:"heatmap"`, `grid` = the displacement field at a
representative time. First kind `field` → Field.

### Task B9: laplace-poisson → Field
**Op:** `CAS.solveLaplacePoisson(params, opts)`. **Outputs:** `[{ key:"field", kind:"field"
}]`. `FieldOutput.variant:"heatmap"` (solution over the 2D domain) or `"contour"` if the core
returns level sets — pick by the core's return shape in Step A. First kind `field` → Field.

### Task B10: Contract + full-suite gate
- [ ] **Step 1:** `portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts` — all 9 pass;
  archetype counts updated (Real-line +5, Field +4); `ode` already a valid engine id with accent.
- [ ] **Step 2:** `yarn test:app --run` full suite green; typecheck + lint clean. If Sub-plan A
  touched math-lab, confirm the affected ode pages still load.
- [ ] **Step 3: Commit.** `test(syntropy): ode engine rollout green on full suite`

## Self-Review
- **Spec coverage:** spec §5 ode table (9 methods, 2 archetypes) → Sub-plan B; the 7-op surface
  → Sub-plan A; contract → B10.
- **Placeholders:** none — each method names its op (existing vs surface), the core file, the
  page form source, declared outputs + first kind, the output-shape mapping, borderline
  fallback, and test assertion. Sub-plan A tasks share A1's pattern.
- **Type consistency:** `CurveOutput`/`FieldOutput` from Foundation Task 1; `casCall` from
  Foundation Task 2; `ode` accent already present in `engineAccents.ts`. The 2 existing ops
  skip Sub-plan A.
- **Borderlines (spec §7):** B2 (phase portrait vs curves), B4 (F(s) curve vs symbolic), B5
  (curve vs coefficient-only) record the v1 fallback in-task, gated on the core's actual return
  shape (verified in Step A).