# Calculus Engine — Unblock + Redesign (25 Methods) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Read the design spec
> first: `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md`.
> **Depends on the Foundation plan** (async run mode, CAS bridge, Symbolic + Field renderers).
> **Unblock status: 25 / 25 CAS ops already exist** in `cas-client.js` — this plan is pure
> call-and-declare, the easiest engine rollout and the first end-to-end async validation.

**Goal:** Give all 25 unregistered calculus methods a Syntropy node: a run-mode port spec whose
async `compute()` calls the existing `CAS.<op>`, declares outputs matching its archetype, and
renders through the Foundation renderers. Each method is classified by output archetype.

**Architecture:** Each spec: `executionMode: "run"`, `engineId: "calculus"`,
`pagePath`/`pageStoreKey` pointing at the existing `math-lab/engines/calculus/methods/<m>.html`,
inputs mirroring the page's form, `compute: async (inputs) => { const r = await CAS.<op>(...);
return { outputs: ... } }`. No new math; the CAS op is the existing math. Tests stub `CAS.<op>`.

**Tech Stack:** TS, Vitest (mock `casClient`). Run from `canvas/`: `yarn test:app --run <files>`,
`yarn test:typecheck`, `yarn test:code`, `yarn fix:code`.

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md` (§5
calculus table).

## Global Constraints
- `executionMode: "run"` for all 25; `compute` is `async` and calls `CAS.<op>` via the bridge.
- First declared output's `kind` decides the archetype (per spec §7). Pin it per method below.
- No new math — call the existing op; unpack inputs into its existing signature (verify the op
  signature in `cas-client.js` per method before writing compute).
- `pagePath` = `/math-lab/engines/calculus/methods/<slug>.html`; `pageStoreKey` =
  `engine-lab:calculus-<slug>` (match the page's own localStorage key — verify per method).
- Tests mock `casClient.casCall` to return a canned op result; assert output shape + that
  `compute` calls the right `op` with unpacked args. No real nerdamer in unit tests.
- Engine accent: calculus #4f9e82.
- After every cross-cutting change, run the **full suite** (`yarn test:app --run`).

---

## Classification (the redesign)

| # | Method | CAS op | Archetype | First output kind | Other outputs |
|---|---|---|---|---|---|
| 1 | algebraic-substitution | `algebraicSubstitution` | Symbolic | `expression` | steps? |
| 2 | u-substitution | `uSubstitution` | Symbolic | `expression` | steps? |
| 3 | integration-by-parts | `integrationByParts` | Symbolic | `expression` | steps? |
| 4 | partial-fractions | `partialFractions` | Symbolic | `expression` | decomposition |
| 5 | trigonometric-substitution | `trigSubstitution` | Symbolic | `expression` | steps? |
| 6 | completing-the-square | `completeTheSquare` | Symbolic | `expression` | — |
| 7 | limits | `limit` | Symbolic | `expression` | (DNE/∞ as text) |
| 8 | lhopital | `lhopital` | Symbolic | `expression` | (reduction steps) |
| 9 | integral-calculator | `autoIntegrate` | Symbolic | `expression` | value (number) |
| 10 | improper-integrals | `improperIntegral` | Symbolic | `expression` | value (number) |
| 11 | arc-length-surface-area | `arcLengthSurfaceArea` | Symbolic | `expression` | value (number) |
| 12 | curve-sketching | `curveAnalysis` | Real-line | `curve` | features (text) |
| 13 | parametric-and-polar | `parametricAndPolar` | Real-line | `curve` | — |
| 14 | fourier-series | `fourierSeries` | Real-line | `curve` | coefficients (number[]) |
| 15 | taylor-series | `taylorSeries` | Real-line | `curve` | degree, remainder |
| 16 | power-series | `powerSeries` | Real-line | `curve` | radius (number) |
| 17 | convergence-tests | `convergenceTests` | Trace | `trace` | verdict (text), sum? |
| 18 | vector-calculus | `vectorCalculus` | Field | `field` | result (text) |
| 19 | partial-derivatives | `partialDerivatives` | Field | `field` | gradient (number[]) |
| 20 | vectors-in-space | `vectorOps` | Field | `field` | magnitude (number) |
| 21 | related-rates | `relatedRates` | Scalar | `number` (rate) | — |
| 22 | applied-optimization | `appliedOptimization` | Scalar | `number` (opt value) | point (text) |
| 23 | lagrange-multipliers | `lagrangeMultipliers` | Scalar | `number` (opt value) | point (text) |
| 24 | multiple-integrals | `multipleIntegral` | Scalar | `number` (value) | — |
| 25 | volumes-of-revolution | `volumeOfRevolution` | Scalar | `number` (volume) | — |

(Archetype counts: Symbolic 11, Real-line 5, Field 3, Trace 1, Scalar 5 = 25. Matches spec §5.)

---

## File Structure
- **Create:** `syntropy/portSpecs/calculus/<slug>.ts` for each of the 25 (or co-locate in
  `portSpecs/` per existing convention — match where `riemannSums.ts` lives; prefer the
  existing flat `portSpecs/` layout). Each exports `<UPPER>_PORT_SPEC`.
- **Modify:** `syntropy/portSpecs/registry.ts` — import + register
  `"calculus:<slug>"` for all 25.
- **Create:** `tests/<slug>PortSpec.test.ts` per method.
- **Modify:** `tests/portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts` — new specs pass
  contract; archetype counts updated.

---

## Per-method task template (applies to each task below)
Each method task follows these steps; the task body fills in the method-specific row.
- [ ] **Step A — Verify op signature & page form.** Read `cas-client.js`'s `CAS.<op>` arg list
  and the method page's input form (`math-lab/engines/calculus/methods/<slug>.html`) to pin
  exact input keys/labels/defaults and the op's return shape.
- [ ] **Step B — Write the failing test.** `tests/<slug>PortSpec.test.ts`: mock `casCall` to
  resolve the op's documented return; assert `compute` calls `casCall("<op>", [<unpacked
  args>])` and `outputs.<firstKey>` has the declared shape; assert `executionMode:"run"`,
  `engineId:"calculus"`, pagePath/pageStoreKey.
- [ ] **Step C — Run — FAIL.**
- [ ] **Step D — Implement the spec.** Declare inputs (from page form), outputs (first kind from
  the table), `executionMode:"run"`, `compute: async (inputs) => { const r = await casCall("<op>",
  [...]); return { outputs: { <map r to declared outputs> } }; }`. Map the op result into the
  archetype's output shape (`ExpressionOutput` / `CurveOutput` / `TraceOutput` / `FieldOutput`
  / scalars) — surfacing only fields the op returns; never inventing math.
- [ ] **Step E — Register in `registry.ts`; run test — PASS.** Typecheck + lint.
- [ ] **Step F — Commit.** `feat(syntropy): calculus <slug> → <Archetype> node (run-mode CAS)`

---

## Task 1: algebraic-substitution → Symbolic
**Op:** `CAS.algebraicSubstitution(expr, variable, opts)`. **Page inputs:** f(x), the
substitution u = g(x), variable. **Outputs:** `[{ key:"antiderivative", kind:"expression" }]`
(+ optional `steps` `kind:"text"` if the op returns a reduction). First kind `expression`
→ Symbolic. **Note:** if the op returns only a final expression (no steps), `structured.kind:"plain"`.

## Task 2: u-substitution → Symbolic
**Op:** `CAS.uSubstitution(expr, variable, opts)`. **Page inputs:** integrand, variable.
**Outputs:** `[{ key:"antiderivative", kind:"expression" }]`. `structured.kind:"plain"` unless
the op returns steps.

## Task 3: integration-by-parts → Symbolic
**Op:** `CAS.integrationByParts(expr, variable, opts)`. **Outputs:** `[{ key:"antiderivative",
kind:"expression" }]`.

## Task 4: partial-fractions → Symbolic
**Op:** `CAS.partialFractions(expr, variable, opts)`. **Outputs:** `[{ key:"decomposition",
kind:"expression" }]`. If the op returns the decomposed sum as a string → `display` =
that string; `structured.kind:"plain"`. (Number-theory `factorization` relation does not apply
here — leave `relation` unset; this is an algebraic decomposition, rendered as a plain expression line.)

## Task 5: trigonometric-substitution → Symbolic
**Op:** `CAS.trigSubstitution(expr, variable, opts)`. **Outputs:** `[{ key:"antiderivative",
kind:"expression" }]`.

## Task 6: completing-the-square → Symbolic
**Op:** `CAS.completeTheSquare(expr, variable, opts)`. **Outputs:** `[{ key:"completedForm",
kind:"expression" }]` (e.g. `a(x+h)² + k`).

## Task 7: limits → Symbolic
**Op:** `CAS.limit(expr, variable, at, opts)`. **Outputs:** `[{ key:"limit", kind:"expression"
}]`. **Special:** the page renders three legitimate outcomes — finite value, ±∞, DNE. Map:
finite → `display` the value; ∞/DNE → `display` the symbol/string ("∞", "DNE"). `structured.kind:
"plain"`. (Do not turn ∞/DNE into an error — the page treats them as answers; mirror that.)

## Task 8: lhopital → Symbolic
**Op:** `CAS.lhopital(expr, variable, at, opts)`. **Outputs:** `[{ key:"limit",
kind:"expression" }]` (+ `steps` `kind:"text"` if the op returns the L'Hôpital reduction chain).

## Task 9: integral-calculator → Symbolic
**Op:** `CAS.autoIntegrate(expr, variable, opts)`. **Outputs:** `[{ key:"antiderivative",
kind:"expression" }, { key:"value", kind:"number" }]` (definite value if bounds given).
First kind `expression` → Symbolic; the number is the scalar stat row.

## Task 10: improper-integrals → Symbolic
**Op:** `CAS.improperIntegral(f, variable, a, b, opts)`. **Outputs:** `[{ key:"integral",
kind:"expression" }, { key:"value", kind:"number" }]`. Convergence/divergence as in Task 7
(DNE/∞ are answers, not errors).

## Task 11: arc-length-surface-area → Symbolic
**Op:** `CAS.arcLengthSurfaceArea(f, variable, a, b, opts)`. **Outputs:** `[{ key:"setup",
kind:"expression" }, { key:"value", kind:"number" }]` (the symbolic arc-length/surface-area
integral setup is the headline; the evaluated value is the scalar row). **Borderline
(Spec §7):** v1 = Symbolic (setup integral is the point). If the op returns only a number and
no symbolic setup, fall back to Scalar and document the deviation.

## Task 12: curve-sketching → Real-line
**Op:** `CAS.curveAnalysis(expr, variable, a, b, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"features", kind:"text" }]`. Build `CurveOutput.points` by sampling the
CAS-evaluated f over [a,b] (the op returns f evaluatable, or sampled points — use whichever it
returns; if it returns only feature points, sample f via a separate `CAS` eval call). `features`
= critical points/inflection/intercepts the op returns, as text. First kind `curve` → Real-line.

## Task 13: parametric-and-polar → Real-line
**Op:** `CAS.parametricAndPolar(mode, spec, opts)`. **Outputs:** `[{ key:"curve", kind:"curve"
}]`. `CurveOutput.points` from the op's parametric/polar sampling.

## Task 14: fourier-series → Real-line
**Op:** `CAS.fourierSeries(f, variable, L, mode, N, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"coefficients", kind:"number" }]`. `curve.points` = partial-sum N
approximation vs f over [-L,L]; `coefficients` = a0/an/bn (first scalar or a representative).
First kind `curve` → Real-line.

## Task 15: taylor-series → Real-line
**Op:** `CAS.taylorSeries(expr, variable, at, degree, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"degree", kind:"number" }, { key:"remainder", kind:"text" }]`. `curve` =
Taylor poly vs f over a window; `degree` = N; `remainder` = error bound if returned.

## Task 16: power-series → Real-line
**Op:** `CAS.powerSeries(coeffs, variable, center, opts)`. **Outputs:** `[{ key:"curve",
kind:"curve" }, { key:"radius", kind:"number" }]`. `curve` = series over its convergence
interval; `radius` = radius of convergence.

## Task 17: convergence-tests → Trace
**Op:** `CAS.convergenceTests(term, variable, opts)`. **Outputs:** `[{ key:"iterationTrace",
kind:"trace" }, { key:"verdict", kind:"text" }, { key:"sum", kind:"number" }]`. `iterationTrace`
= partial-sum sequence `{n, partialSum, err?}[]` the op computes; `verdict` = converges/
diverges + which test; `sum` = the sum if convergent. First kind `trace` → Trace (reuses the
existing TraceNode; heterogeneous rows — partial sums are numbers).

## Task 18: vector-calculus → Field
**Op:** `CAS.vectorCalculus(operation, spec, opts)`. **Outputs:** `[{ key:"field",
kind:"field" }, { key:"result", kind:"text" }]`. `FieldOutput.variant:"arrows"` for
grad/div/curl (vector field); `result` = the symbolic/operator result text. First kind `field`
→ Field (Foundation FieldNode).

## Task 19: partial-derivatives → Field
**Op:** `CAS.partialDerivatives(expr, vars, point, opts)`. **Outputs:** `[{ key:"field",
kind:"field" }, { key:"gradient", kind:"number" }]`. `field` = gradient field over a domain
(`variant:"arrows"`); `gradient` = the gradient at the point (first component, or magnitude).
First kind `field` → Field. **Borderline (Spec §7):** the page shows a 3D surface — if the op
returns a 3D scalar field, `variant:"heatmap"` over the 2D domain; v1 keeps Field.

## Task 20: vectors-in-space → Field
**Op:** `CAS.vectorOps(operation, operands, opts)`. **Outputs:** `[{ key:"field",
kind:"field" }, { key:"magnitude", kind:"number" }]`. `field` = the vectors drawn in 3→2D
projection (`variant:"arrows"`); `magnitude` = the result vector's magnitude. First kind `field`
→ Field.

## Task 21: related-rates → Scalar
**Op:** `CAS.relatedRates(equation, vars, values, knownRates, unknownVar, opts)`. **Outputs:**
`[{ key:"rate", kind:"number" }, { key:"work", kind:"text" }]`. First kind `number` → Scalar
(the rate value is the headline; `work` = the implicit-differentiation steps as text).

## Task 22: applied-optimization → Scalar
**Op:** `CAS.appliedOptimization(expr, variable, a, b, goal, opts)`. **Outputs:** `[{ key:"optimal",
kind:"number" }, { key:"point", kind:"text" }]`. First kind `number` → Scalar. **Borderline
(Spec §7):** v1 Scalar; do NOT declare a `field`/`curve` first (would flip archetype).

## Task 23: lagrange-multipliers → Scalar
**Op:** `CAS.lagrangeMultipliers(f, g, c, vars, opts)`. **Outputs:** `[{ key:"optimal",
kind:"number" }, { key:"point", kind:"text" }]`. Scalar. Same borderline note as Task 22.

## Task 24: multiple-integrals → Scalar
**Op:** `CAS.multipleIntegral(f, opts)`. **Outputs:** `[{ key:"value", kind:"number" }]`.
Scalar. (3D region viz stays on the page, not the node — v1.)

## Task 25: volumes-of-revolution → Scalar
**Op:** `CAS.volumeOfRevolution(f, variable, a, b, opts)`. **Outputs:** `[{ key:"volume",
kind:"number" }]`. Scalar. (3D solid viz stays on the page — v1.)

## Task 26: Contract + full-suite gate
- [ ] **Step 1:** `portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts` — all 25 pass
  contract; archetype counts updated (Symbolic +11, Real-line +5, Field +3, Trace +1, Scalar +5).
- [ ] **Step 2:** `dispatch.test.tsx` — add fixture routing assertions for any archetype not
  already covered by an existing real spec (Field and Symbolic are covered by Foundation; Trace
  & Real-line already have residents). No new dispatch case needed (Foundation wired all 7).
- [ ] **Step 3:** `yarn test:app --run` full suite green; typecheck + lint clean.
- [ ] **Step 4: Commit.** `test(syntropy): calculus engine rollout green on full suite`

## Self-Review
- **Spec coverage:** spec §5 calculus table (25 methods, 5 archetypes) → Tasks 1–25; contract → 26.
- **Placeholders:** none — each task names the op, the page form source, the declared outputs +
  first kind, the output-shape mapping, the borderline decision, and the test assertion.
- **Type consistency:** `ExpressionOutput`/`CurveOutput`/`TraceOutput`/`FieldOutput` from
  Foundation Task 1; `casCall("<op>", args)` from Foundation Task 2; `useNodeCompute` run-mode from
  Foundation Task 6 (consumed implicitly by the renderers the spec routes to).
- **Borderlines (spec §7):** Tasks 11, 19, 22, 23, 24, 25 record the v1 decision in-task.