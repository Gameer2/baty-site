# Complex-Analysis Engine — Unblock + Redesign (12 Methods) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Read the design spec
> first: `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md`.
> **Depends on the Foundation plan** (async run mode, CAS bridge, Symbolic + Field renderers,
> `complex` engine accent).
> **Unblock status: 2 / 12 CAS ops exist** (`cauchyRiemann`, `harmonicConjugate`). This plan's
> distinctive work is **surfacing 10 existing `complex-symbolic.js` / `complex-residues.js`
> cores as `CAS.<op>`** (thin client routes to existing math — no new math), then writing the
> 12 run-mode specs.

**Goal:** Give all 12 unregistered complex-analysis methods a Syntropy node and classify each by
archetype. Complex analysis is a CAS-heavy engine (symbolic + contour integration via the Sympy
fallback), so all 12 are `executionMode: "run"`.

**Architecture:** Two sub-steps per method whose op doesn't exist: (1) **surface** the existing
core as a `CAS.<op>` — register the client method in `cas-client.js` + the worker route in
`cas-worker.js` to call the existing core function; (2) **declare** the run-mode port spec
calling it. The 2 methods with existing ops skip step (1).

**Tech Stack:** TS, Vitest (mock `casClient`). Run from `canvas/`: `yarn test:app --run <files>`,
`yarn test:typecheck`, `yarn test:code`, `yarn fix:code`.

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md` (§5
complex table).

## Global Constraints
- No new math: surfacing a core as a `CAS.<op>` is a thin route (`CAS.<op> = (a,b,..) =>
  CAS.call("<op>", [a,b,..])` client-side + the worker dispatching to the existing core). Verify
  the existing core function signature in `complex-symbolic.js` / `complex-residues.js` before
  registering; do not reimplement.
- `executionMode: "run"` for all 12; `engineId: "complex"`.
- `pagePath` = `/math-lab/engines/complex/methods/<slug>.html`; `pageStoreKey` =
  `engine-lab:complex-<slug>` (verify per method against the page's localStorage key).
- First declared output's `kind` decides archetype. Pin per method below.
- Contour/residue methods use the Sympy fallback where nerdamer refuses — the existing
  `CAS.call` + `SympyClient` plumbing handles this; the spec just calls `CAS.<op>`.
- Engine accent: complex #7a5cd6 (added in Foundation).
- After cross-cutting changes, run the **full suite**.

---

## Classification (the redesign)

| # | Method | CAS op (status) | Archetype | First output kind | Other outputs |
|---|---|---|---|---|---|
| 1 | complex-arithmetic | `complexArithmetic` (surface) | Symbolic | `expression` | cartesian/polar (text) |
| 2 | complex-exp-log-powers | `complexExpLogPowers` (surface) | Symbolic | `expression` | — |
| 3 | complex-trig-hyperbolic | `complexTrigHyperbolic` (surface) | Symbolic | `expression` | — |
| 4 | cauchy-riemann | `cauchyRiemann` (exists) | Symbolic | `expression` | crSatisfied (number) |
| 5 | laurent-singularities | `laurentSingularities` (surface) | Symbolic | `expression` | residues (text) |
| 6 | complex-functions | `complexFunctions` (surface) | Field | `field` | — |
| 7 | mobius-mapping | `mobiusMapping` (surface) | Field | `field` | fixedPoints (text) |
| 8 | harmonic-functions | `harmonicConjugate` (exists) | Field | `field` | conjugate (text) |
| 9 | contour-integration | `contourIntegration` (surface) | Scalar | `value` (number) | antiderivative (text) |
| 10 | cauchy-integral-formula | `cauchyIntegralFormula` (surface) | Scalar | `value` (number) | — |
| 11 | real-integrals-residues | `realIntegralsResidues` (surface) | Scalar | `value` (number) | residues (text) |
| 12 | argument-rouche | `argumentRouche` (surface) | Scalar | `count` (number) | — |

(Archetype counts: Symbolic 5, Field 3, Scalar 4 = 12. Matches spec §5.)

---

## File Structure
- **Modify:** `math-lab/assets/js/cas-client.js` — register the 10 new `CAS.<op>` client
  methods (thin `CAS.call` wrappers).
- **Modify:** `math-lab/assets/js/cas-worker.js` — dispatch the 10 new ops to the existing
  core functions in `complex-symbolic.js` / `complex-residues.js` (the cores are already loaded
  worker-side; verify in `cas-worker.js` import list and add the dispatch lines).
- **Modify:** `canvas/excalidraw-app/syntropy/cas/casClient.ts` — no change (it calls ops by
  name; new ops are transparent), but its integration test can be extended.
- **Create:** `canvas/excalidraw-app/syntropy/portSpecs/complex/<slug>.ts` (or flat
  `portSpecs/` per existing convention — match `riemannSums.ts` location). Each exports
  `<UPPER>_PORT_SPEC`.
- **Modify:** `syntropy/portSpecs/registry.ts` — register `"complex:<slug>"` for all 12.
- **Create:** `canvas/excalidraw-app/tests/<slug>PortSpec.test.ts` per method.
- **Modify:** `tests/portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts`.

---

## Sub-plan A: Surface the 10 missing CAS ops (math-lab side)

### Task A1: complexArithmetic op
- [ ] **Step 1:** Read `complex-symbolic.js` for the existing arithmetic core (add/sub/mul/div
  of complex numbers, cartesian↔polar). Pin its function name + arg shape.
- [ ] **Step 2:** In `cas-client.js` add `CAS.complexArithmetic = function(operation, operands,
  opts){ return CAS.call("complexArithmetic", [operation, operands, opts], opts); }`.
- [ ] **Step 3:** In `cas-worker.js` dispatch `"complexArithmetic"` → the existing core. Run the
  math-lab page (or a node script) to confirm `CAS.complexArithmetic(...)` returns the existing
  result; no behavior change to the page.
- [ ] **Step 4: Commit** (math-lab repo): `feat(cas): expose complexArithmetic op (existing core)`

### Task A2: complexExpLogPowers op — same pattern, surface exp/log/powers of z.
### Task A3: complexTrigHyperbolic op — surface sin/cos/tan/sinh/cosh/etc. of z.
### Task A4: complexFunctions op — surface f(z) domain-coloring/mapping evaluation (returns a
  value grid the FieldNode consumes; the core computes arg+mag over a domain grid).
### Task A5: mobiusMapping op — surface the Möbius transform of a grid of points (returns
  transformed grid + fixed points).
### Task A6: contourIntegration op — surface contour integral (path f(z) dz); uses Sympy fallback
  where nerdamer refuses (verify the existing core already calls `SympyClient`).
### Task A7: laurentSingularities op — surface Laurent series + isolated singularities/residues.
### Task A8: realIntegralsResidues op — surface real integrals via residues (Sympy fallback path).
### Task A9: cauchyIntegralFormula op — surface the Cauchy integral formula evaluation.
### Task A10: argumentRouche op — surface argument principle / Rouché zero-count.

> Each A-task follows the 4 steps of A1 (read core → add client method → add worker dispatch →
> commit). One commit per op. Verify the worker already imports the relevant core; if not, add
> the import (the core file already exists — this is wiring, not math).

---

## Sub-plan B: The 12 run-mode specs (canvas side)

### Per-method task template
- [ ] **Step A — Verify op signature & page form.** Read `CAS.<op>` args (after Sub-plan A) and
  `math-lab/engines/complex/methods/<slug>.html` inputs/outputs to pin keys/defaults.
- [ ] **Step B — Failing test.** Mock `casCall("<op>", ...)` → canned return; assert `compute`
  calls the op with unpacked args and `outputs.<firstKey>` matches the declared shape; assert
  `executionMode:"run"`, `engineId:"complex"`, pagePath/pageStoreKey.
- [ ] **Step C — Run — FAIL.**
- [ ] **Step D — Implement spec.** Inputs from page form; outputs first-kind per table;
  `compute: async (inputs) => { const r = await casCall("<op>", [...]); return { outputs: {
  <map> } }; }`. Map op result into the archetype output shape; surface only returned fields.
- [ ] **Step E — Register in `registry.ts`; run test — PASS.** Typecheck + lint.
- [ ] **Step F — Commit.** `feat(syntropy): complex <slug> → <Archetype> node (run-mode CAS)`

### Task B1: complex-arithmetic → Symbolic
**Op:** `CAS.complexArithmetic(operation, operands, opts)`. **Outputs:** `[{ key:"result",
kind:"expression" }, { key:"forms", kind:"text" }]`. `result.display` = the simplified complex
form (e.g. `(2+3i)(1-i) = 5+i`); `forms` = cartesian + polar. First kind `expression` → Symbolic.

### Task B2: complex-exp-log-powers → Symbolic
**Op:** `CAS.complexExpLogPowers(expr, opts)`. **Outputs:** `[{ key:"result", kind:"expression"
}]` (e.g. `e^(iπ) = -1`, `log(i)`, `z^n`). `structured.kind:"plain"`.

### Task B3: complex-trig-hyperbolic → Symbolic
**Op:** `CAS.complexTrigHyperbolic(func, z, opts)`. **Outputs:** `[{ key:"result",
kind:"expression" }]` (e.g. `sin(i) = i·sinh(1)`).

### Task B4: cauchy-riemann → Symbolic
**Op:** `CAS.cauchyRiemann(f, point, opts)` (exists). **Outputs:** `[{ key:"result",
kind:"expression" }, { key:"satisfied", kind:"number" }]`. `result.display` = the CR partial
derivatives + verdict; `satisfied` = 1/0. First kind `expression` → Symbolic.

### Task B5: laurent-singularities → Symbolic
**Op:** `CAS.laurentSingularities(f, opts)`. **Outputs:** `[{ key:"series", kind:"expression"
}, { key:"residues", kind:"text" }]`. `series.display` = the Laurent series; `residues` =
residue at each singularity. First kind `expression` → Symbolic.

### Task B6: complex-functions → Field
**Op:** `CAS.complexFunctions(f, domain, opts)`. **Outputs:** `[{ key:"field", kind:"field"
}]`. `FieldOutput.variant:"domainColor"`, `grid` = |f(z)| over the domain grid (lightness),
vectors/arg from arg(f(z)) if the core returns them. First kind `field` → Field (FieldNode
domainColor variant). **Note:** the page shows a domain-coloring canvas; the node shows the
same grid via SVG domainColor. If the core returns only a flat value grid, `variant:
"domainColor"` still works (hue by index, lightness by value) — acceptable v1.

### Task B7: mobius-mapping → Field
**Op:** `CAS.mobiusMapping(transform, domain, opts)`. **Outputs:** `[{ key:"field",
kind:"field" }, { key:"fixedPoints", kind:"text" }]`. `field.variant:"arrows"` (the Möbius
image of a grid of points as displacement vectors); `fixedPoints` = the transform's fixed
points. First kind `field` → Field.

### Task B8: harmonic-functions → Field
**Op:** `CAS.harmonicConjugate(u, basepoint, opts)` (exists). **Outputs:** `[{ key:"field",
kind:"field" }, { key:"conjugate", kind:"text" }]`. `field.variant:"contour"` (level curves of
u over a domain); `conjugate` = the harmonic conjugate v. First kind `field` → Field.

### Task B9: contour-integration → Scalar
**Op:** `CAS.contourIntegration(f, contour, opts)`. **Outputs:** `[{ key:"value",
kind:"number" }, { key:"antiderivative", kind:"text" }]`. First kind `number` → Scalar (the
contour integral value is the headline; the antiderivative is a text row). The contour path viz
stays on the page (v1).

### Task B10: cauchy-integral-formula → Scalar
**Op:** `CAS.cauchyIntegralFormula(f, z0, n, opts)`. **Outputs:** `[{ key:"value",
kind:"number" }]`. Scalar.

### Task B11: real-integrals-residues → Scalar
**Op:** `CAS.realIntegralsResidues(f, a, b, opts)`. **Outputs:** `[{ key:"value",
kind:"number" }, { key:"residues", kind:"text" }]`. Scalar; `residues` = the residues used.

### Task B12: argument-rouche → Scalar
**Op:** `CAS.argumentRouche(f, g, contour, mode, opts)`. **Outputs:** `[{ key:"count",
kind:"number" }]` (number of zeros inside the contour, per argument principle / Rouché).
Scalar. Contour viz stays on the page (v1).

### Task B13: Contract + full-suite gate
- [ ] **Step 1:** `portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts` — all 12 pass;
  archetype counts updated (Symbolic +5, Field +3, Scalar +4); `complex` engine now a valid
  engine id with accent.
- [ ] **Step 2:** `engineAccents.test.ts` — assert `complex` accent present (added in Foundation).
- [ ] **Step 3:** `yarn test:app --run` full suite green; typecheck + lint clean. If Sub-plan A
  touched math-lab, also run any math-lab test if present (else confirm pages still load).
- [ ] **Step 4: Commit.** `test(syntropy): complex engine rollout green on full suite`

## Self-Review
- **Spec coverage:** spec §5 complex table (12 methods, 3 archetypes) → Sub-plan B; the 10-op
  surface → Sub-plan A; contract → B13.
- **Placeholders:** none — each method names its op (existing vs surface), page form source,
  declared outputs + first kind, output-shape mapping, borderline/v1 note, and test assertion.
  Sub-plan A tasks share A1's 4-step pattern (stated once, applied per op).
- **Type consistency:** output shapes from Foundation Task 1; `casCall("<op>", args)` from
  Foundation Task 2; `complex` accent from Foundation. The 2 existing ops (`cauchyRiemann`,
  `harmonicConjugate`) skip Sub-plan A.
- **Borderlines (spec §7):** B6 (domainColor from value-only grid), B9/B12 (contour viz stays on
  page) record the v1 decision in-task.