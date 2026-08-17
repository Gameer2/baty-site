# Syntropy Async "Run" Mode + Symbolic Archetype + Per-Engine Rollout — Design

> **For agentic workers:** This spec is the architecture. Implementation plans live in
> `docs/superpowers/plans/2026-08-14-syntropy-*`. Read this spec first; every plan argues from it.

**Goal:** Unblock the 46 lab methods that have no Syntropy node (calculus/complex/ode CAS
methods) and the deferred **Field** archetype by connecting the node layer to math-lab's
existing CAS worker, then redesign every one of those methods by output archetype —
adding a 7th archetype (**Symbolic**) for the CAS-expression methods that were previously
lumped under Scalar.

**Spec lineage:** Extends the 6-archetype redesign in
`2026-08-14-syntropy-node-archetype-redesign-design.md`. That doc shipped Matrix / Trace /
Distribution / Real-line renderers for the 89 synchronous specs; this doc adds the async
execution model, the Symbolic and Field renderers, and the 46 unregistered methods.

## 1. Why this is lower-risk than it looks

The hard part — a symbolic CAS that runs off the UI thread — **already exists in math-lab**:

- `math-lab/assets/js/cas-worker.js` — the worker host.
- `math-lab/assets/js/cas-client.js` — a `CAS` client with a Promise-based RPC protocol
  (`CAS.call(op, args)` → `postMessage({id, op, args})` → worker → resolve on `{id, ok, result}`),
  plus an in-page fallback so callers never branch on sync/async.
- Per-method ops already registered for **all 25 calculus methods** (e.g. `CAS.autoIntegrate`,
  `CAS.uSubstitution`, `CAS.limit`, `CAS.taylorSeries`, `CAS.vectorCalculus`, …), plus
  `CAS.solveHeatEquation`, `CAS.solveWaveEquation`, `CAS.cauchyRiemann`, `CAS.harmonicConjugate`.
- `sympy-worker.js` + `sympy-client.js` — a Sympy fallback (`SympyClient`) for cases nerdamer
  refuses (e.g. contour integration).
- Symbolic cores already loaded worker-side: `calculus-symbolic.js`, `complex-symbolic.js`,
  `ode-symbolic.js`, `laplace-engine.js`, `ode-solver.js`, `ode-direction-fields.js`, …

So the node layer's job is to **connect to and call** this infrastructure, not build it. Where a
method's core exists but has no `CAS.<op>` yet (10 of 12 complex, 7 of 9 ode), the unblock work
is *surfacing that core as a `CAS.<op>`* — registering a thin client method + worker route to
existing math. No new math (consistent with the no-new-math rule across the whole redesign).

## 2. The 7-archetype model

The shipped redesign has six (`dispatch.tsx` `Archetype`): trace / real-line / matrix / field /
distribution / scalar. `ARCHETYPE_BY_KIND` maps rich output kinds to archetypes; `number`/`text`
fall through to scalar. **This spec adds a seventh:**

### Symbolic archetype (new)
For methods whose product is a **symbolic form** — an antiderivative, a series, a transform, a
decomposition, a factorization, a congruence-class set — not a plotted number. The renderer
(`SymbolicNode`) renders the expression as formatted math (the CAS already returns a
display-ready string form), plus any scalar summary rows and port dots, exactly as the other
archetypes render their rich output + scalar stat rows.

- **New output kind:** `expression`. Today `expression` is only an *input* kind (76 uses, for
  `f(x)`). Promote it to an *output* kind carrying the symbolic form string (and optionally a
  structured representation — see §3).
- **`ARCHETYPE_BY_KIND` gains** `expression: "symbolic"`. `archetypeFromSpec` then routes a spec
  whose first rich output is `kind: "expression"` to `SymbolicNode` (before falling to scalar).
- **Factorization relation (number-theory):** mirroring LU's `relation: "factorization"` on the
  matrix archetype, number-theory specs (prime-factorisation, continued-fractions,
  linear-congruences) carry `relation: "factorization"` so `SymbolicNode` renders the
  decomposition centered with an equals/bracket (e.g. `12 = 2²·3`, `[1; 1, 2]`,
  `x ≡ 2, 5, 8 (mod 9)`).

### Field archetype (shipped renderer was deferred)
The shipped redesign left Field routing to `ScalarNode`. This spec ships the `FieldNode`
renderer (inline-SVG over a 2D domain) with variants: direction-field arrows, heatmap (heat
equation / PDE solution), contour (harmonic functions / Laplace), and complex
domain-coloring/mapping (complex-functions, mobius-mapping). `field` is already a valid output
kind and already in `ARCHETYPE_BY_KIND`; only the renderer was missing.

### Scalar (narrowed)
After this spec, Scalar means a genuine **numeric value** answer (a length, a volume, an
integral value, a zero count, a rate). Symbolic-expression methods no longer fall here.

## 3. Output shapes

```ts
// portSpecs/types.ts — additions
export type ExpressionOutput = {
  /** Display-ready math string from the CAS, e.g. "2*x^2 + 3" or "[1; 1, 2]". */
  display: string;
  /** Optional structured form for richer rendering (factors, convergents, solution set). */
  structured?:
    | { kind: "factorization"; factors: { base: string; exponent: number }[] }
    | { kind: "continuedFraction"; a0: string; period: string[] }
    | { kind: "congruenceSet"; modulus: string; solutions: string[] }
    | { kind: "series"; coefficients: string[]; center?: string }
    | { kind: "plain" };
};

export type FieldOutput = {
  /** Grid of sampled points over the [xLo,xHi]×[yLo,yHi] domain. */
  grid: { x: number; y: number; value: number }[][];
  /** Optional vector field (direction fields, gradient, div/curl). */
  vectors?: { x: number; y: number; dx: number; dy: number }[][];
  xLo: number; xHi: number; yLo: number; yHi: number;
  /** Render variant the FieldNode picks from. */
  variant: "arrows" | "heatmap" | "contour" | "domainColor";
};
```

`kind: "expression"` output → `ExpressionOutput`; `kind: "field"` output → `FieldOutput`.

## 4. Async "run" execution mode

### PortSpec contract change
```ts
// before
executionMode: "live";
compute: (inputs) => ComputeResult;            // sync

// after
executionMode: "live" | "run";
compute: (inputs) => ComputeResult | Promise<ComputeResult>;  // sync or async
```
- **`"live"`** (all 89 existing specs): recompute on every input change, sync, no Run button —
  unchanged behavior.
- **`"run"`** (the 46 CAS methods): compute is async (calls the CAS worker) and is triggered
  **explicitly** by a Run button, not on every keystroke. CAS work is expensive and side-effecty
  (Sympy fallback, timeouts); live recompute would thrash. Run-mode nodes show **pending** /
  **ready** / **error** states and cache the last result keyed by inputs so the renderer is
  stable between runs.

### Wiring engine (`syntropy/wiring.ts`)
Today `computeWiredResults` is synchronous: it topologically orders nodes and calls
`spec.compute(effectiveInputs)` at line 243, building `Map<string, WiredComputeResult>`. For
run-mode nodes this must become **async-aware**:
- `computeWiredResults` returns `Map<string, WiredComputeResult>` where a run-mode entry may
  carry a `pending: true` flag (and the previous ready result) instead of fresh outputs.
- A run-mode node only (re)computes when its Run action fires or when an *upstream* output it
  depends on changes *and* it has been run at least once. Until first run, it shows "Press Run".
- Downstream nodes wired to a pending upstream show a pending/waiting indicator on that input
  chip (mirroring the existing wired-chip highlighting).
- The synchronous local-compute calls in each renderer (`TraceNode`/`RealLineNode`/etc. line
  `spec.compute(effectiveLocalInputs)`) move behind a shared hook that, for run-mode specs,
  returns the cached/last-run result instead of re-invoking compute live. This keeps the
  per-archetype renderers from each reimplementing async state.

### Run trigger + states (`NodeOverlay.tsx` / node host)
- Live nodes: unchanged (recompute on `onInputsChange`).
- Run nodes: a Run button in the node chrome; a status chip (`pending` / `ready` / `error`).
  Input edits after a run mark the node "stale" (inputs changed since last run) — a hint to
  press Run again, without auto-running.

### CAS bridge (canvas ↔ math-lab worker)
`cas-client.js`/`cas-worker.js` are browser IIFE scripts (`root.CAS = factory()`), not ES
modules. The bridge:
1. A thin ES-module adapter (`syntropy/cas/casClient.ts`) that loads `cas-client.js` + the
   worker bootstrap into the canvas worker context (or spawns the existing `cas-worker.js` as
   a module worker) and exposes the same `CAS.call(op, args)` Promise API.
2. `nerdamer`/`mathjs`/`sympy` stay bundled with the worker only (never the main canvas bundle),
   loaded on demand the first time a run-mode node exists — so a board with no CAS nodes pays
   zero bundle cost. This mirrors how the symbolic cores are already lazy-loaded in math-lab.
3. Port-spec `compute()` for a run-mode method: `async (inputs) => { const r = await
   CAS.<op>(...unpacked); return { outputs: { ... } }; }` — unpacking inputs into the op's
   existing signature (verified per method in the engine plans).

## 5. Per-engine method classification + unblock status

CAS-op coverage today (from `cas-client.js`):

| Engine | Methods | CAS op already exists | Unblock work |
|---|---|---|---|
| Calculus | 25 | **25 / 25** | pure call — no new ops |
| Complex | 12 | 2 / 12 (`cauchyRiemann`, `harmonicConjugate`) | surface 10 existing `complex-symbolic.js` cores as `CAS.<op>` |
| ODE/PDE | 9 | 2 / 9 (`solveHeatEquation`, `solveWaveEquation`) | surface 7 existing `ode-symbolic.js`/`laplace-engine.js`/`ode-solver.js` cores as `CAS.<op>` |
| Number-theory | 3 | n/a (synchronous) | none — already registered; redesign-only |

### Calculus (25) — all have a CAS op
- **Symbolic (11):** algebraic-substitution → `CAS.algebraicSubstitution`; u-substitution →
  `CAS.uSubstitution`; integration-by-parts → `CAS.integrationByParts`; partial-fractions →
  `CAS.partialFractions`; trigonometric-substitution → `CAS.trigSubstitution`;
  completing-the-square → `CAS.completeTheSquare`; limits → `CAS.limit`; lhopital → `CAS.lhopital`;
  integral-calculator → `CAS.autoIntegrate`; improper-integrals → `CAS.improperIntegral`;
  arc-length-surface-area → `CAS.arcLengthSurfaceArea`.
- **Real-line (5):** curve-sketching → `CAS.curveAnalysis`; parametric-and-polar →
  `CAS.parametricAndPolar`; fourier-series → `CAS.fourierSeries`; taylor-series →
  `CAS.taylorSeries`; power-series → `CAS.powerSeries`.
- **Field (3):** vector-calculus → `CAS.vectorCalculus`; partial-derivatives →
  `CAS.partialDerivatives`; vectors-in-space → `CAS.vectorOps`.
- **Trace (1):** convergence-tests → `CAS.convergenceTests`.
- **Scalar (5):** related-rates → `CAS.relatedRates`; applied-optimization →
  `CAS.appliedOptimization`; lagrange-multipliers → `CAS.lagrangeMultipliers`; multiple-integrals
  → `CAS.multipleIntegral`; volumes-of-revolution → `CAS.volumeOfRevolution`.

### Complex (12) — 2 ops exist, 10 to surface
- **Symbolic (5):** laurent-singularities; complex-exp-log-powers; complex-trig-hyperbolic;
  complex-arithmetic; cauchy-riemann → `CAS.cauchyRiemann` (exists).
- **Field (3):** complex-functions; mobius-mapping; harmonic-functions →
  `CAS.harmonicConjugate` (exists for the harmonic-conjugate case).
- **Scalar (4):** contour-integration; cauchy-integral-formula; real-integrals-residues;
  argument-rouche.
- *To surface as CAS ops (from `complex-symbolic.js` + `complex-residues.js`):*
  `complexArithmetic`, `complexExpLogPowers`, `complexTrigHyperbolic`, `complexFunctions`,
  `contourIntegration`, `laurentSingularities`, `mobiusMapping`, `realIntegralsResidues`,
  `cauchyIntegralFormula`, `argumentRouche`.

### ODE/PDE (9) — 2 ops exist, 7 to surface
- **Real-line (5):** ode-solver; systems; fourier-series; laplace-transform; series-solutions.
- **Field (4):** direction-fields; heat-equation → `CAS.solveHeatEquation` (exists);
  wave-equation → `CAS.solveWaveEquation` (exists); laplace-poisson.
- *To surface as CAS ops (from `ode-symbolic.js`/`laplace-engine.js`/`ode-solver.js`/
  `ode-direction-fields.js`/`ode-fourier.js`/`ode-poisson.js`/`ode-systems.js`/
  `series-solutions.js`):* `solveOde`, `solveOdeSystems`, `odeFourier`, `laplaceTransform`,
  `seriesSolutions`, `directionFields`, `solveLaplacePoisson`.

### Number-theory (3) — redesign-only, synchronous, ships first
- **Symbolic (3):** prime-factorisation (surface full `{p,exponent}[]` the core already returns
  via `factorizeFull`); continued-fractions (surface full `period[]` from
  `continuedFractionSqrt`); linear-congruences (surface full `solutions[]` from
  `solveLinearCongruence`). All three cores are synchronous BigInt already in the live node
  environment — **no async, no CAS worker**. They are the Symbolic archetype's founding residents
  and ship before the async foundation, exactly as Matrix shipped on synchronous linalg cores.

## 6. Sequencing

1. **Number-theory plan** (no async) — ships Symbolic archetype + 3 residents. Green, independent.
2. **Foundation plan** — async run mode + CAS bridge + Symbolic/Field renderers + dispatch/contract
   changes. Testable with fixtures (a fake run-mode spec + a fake CAS op), no real CAS needed for
   unit tests.
3. **Calculus plan** — easiest rollout (all 25 ops exist). First end-to-end async validation.
4. **Complex plan** — surface 10 ops, then 12 specs.
5. **ODE plan** — surface 7 ops, then 9 specs.

Field renderer (Foundation) unblocks the 10 Field methods (3 calculus + 3 complex + 4 ode) at
once; Symbolic renderer (Foundation / Number-theory) unblocks the 18 Symbolic methods.

## 7. v1 deviations & borderlines (decisions to confirm before/during rollout)

- `applied-optimization`, `lagrange-multipliers`, `multiple-integrals`, `volumes-of-revolution`
  lean Symbolic-or-Field (symbolic setup + numeric result + region/surface viz). v1 keeps them
  **Scalar** (the numeric answer is the headline); the symbolic setup string is an optional
  `expression` output they may additionally declare without changing archetype (first *rich*
  output wins, so if they declare `field` first they'd flip — keep `number` first).
- `arc-length-surface-area`, `complex-arithmetic`, `series-solutions` sit on the
  Symbolic/Scalar or Symbolic/Real-line line. v1: arc-length → Symbolic (the setup integral is
  the point); complex-arithmetic → Symbolic (simplification); series-solutions → Symbolic (the
  series is the product). Revisit if a method's CAS op returns primarily a curve.
- `systems` (ode) → Real-line (solution curves). If a method linearizes to an eigenproblem it
  could be Matrix; v1 keeps Real-line.
- `convergence-tests` → Trace (partial-sum sequence + verdict). Could be Real-line; Trace
  matches the existing iteration-trace renderer.
- Where a CAS op returns *both* a symbolic form and a plot, the declared first rich output
  decides the archetype (Symbolic if `expression` first, Real-line if `curve` first). Engine
  plans pin this per method.

## 8. Testing strategy

- **Contract:** `portSpecsContract.test.ts` + `portSpecsOutputShape.test.ts` extended for
  `expression`/`field` output kinds and the run-mode `executionMode` + async compute.
- **Foundation:** fixture run-mode spec with a fake `CAS.<op>` (resolved promise) — tests
  pending/ready/error states, Run trigger, stale-then-run, async wiring propagation, Field &
  Symbolic renderers. No real nerdamer in unit tests.
- **Per engine:** each method gets a port-spec test. Run-mode specs stub the CAS op (vitest
  mock of `casClient`) so tests are deterministic and offline; one or two integration specs may
  hit the real worker behind a skip guard.
- **Typecheck/lint:** `yarn test:typecheck`, `yarn fix:code && yarn test:code`. Full suite
  `yarn test:app --run` after each cross-cutting change (the lesson from the real-line
  regression: targeted tests miss cross-cutting breakage).

## 9. Out of scope

- The 5 `category-*` calculus pages (organizational landing pages, not methods) — no nodes.
- A general "history of runs" or undo for run-mode nodes — out of v1.
- Migrating the existing 89 synchronous specs to anything new — they stay `"live"`.
- Device-safety + push to GitHub — still deferred per the user's standing instruction.