# Foundation: Async "Run" Mode + Symbolic/Field Renderers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or
> subagent-driven-development). Steps use `- [ ]` checkboxes. Read the design spec first:
> `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md`.

**Goal:** Build the shared foundation every per-engine rollout depends on: (1) widen the
PortSpec contract to `"live" | "run"` + async `compute`; (2) async-aware wiring + Run trigger
UX; (3) a CAS bridge to math-lab's existing worker; (4) the Symbolic archetype renderer; (5)
the Field archetype renderer.

**Architecture:** See spec §3–§5. The CAS worker already exists in math-lab; this plan connects
to it and adds the two missing renderers. Nothing here writes new math — run-mode `compute()`
calls existing `CAS.<op>`; the Symbolic/Field renderers only draw data the compute returns.

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react, SCSS, vitest mocks.
Run from `canvas/`: `yarn test:app --run <files>` (MUST pass `--run`), `yarn test:typecheck`,
`yarn test:code`, `yarn fix:code`.

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md`

## Global Constraints

- No new math. `compute()` for run-mode specs calls existing `CAS.<op>`; renderers only draw
  returned data. Surfacing an existing core as a `CAS.<op>` is allowed (a thin route), reimplementing math is not.
- `executionMode` widens from literal `"live"` to `"live" | "run"`; all 89 existing specs stay `"live"` and unchanged.
- A board with no run-mode nodes pays zero CAS bundle cost — the worker + nerdamer load on demand.
- Engine accents: linear-algebra #8570b3, numerical #5c939f, calculus #4f9e82, statistics
  #c99a3c, ode #4f8fc0, number-theory #a3623c, complex #7a5cd6 (new — add to `engineAccents.ts`).

---

## File Structure

- **Create:** `canvas/excalidraw-app/syntropy/cas/casClient.ts` — ES-module adapter exposing
  `CAS.call(op, args): Promise<unknown>`; lazy-loads the math-lab worker on first call.
- **Create:** `canvas/excalidraw-app/syntropy/cas/casClient.test.ts` — mocks the worker boot;
  asserts lazy-load + Promise protocol + timeout/error path.
- **Modify:** `canvas/excalidraw-app/syntropy/portSpecs/types.ts` — `executionMode: "live"|"run"`;
  `compute` return type `ComputeResult | Promise<ComputeResult>`; add `ExpressionOutput`,
  `FieldOutput` (spec §3); add `relation?: "factorization"` (already exists on matrix specs —
  generalize the type comment).
- **Modify:** `canvas/excalidraw-app/syntropy/wiring.ts` — async-aware `computeWiredResults`
  (`pending` flag + last-ready caching); a shared `useNodeCompute` hook.
- **Create:** `canvas/excalidraw-app/syntropy/nodes/useNodeCompute.ts` — hook returning
  `{ outputs, error, pending, stale }` for both live and run modes; renderers use this instead
  of calling `spec.compute` directly.
- **Modify:** `canvas/excalidraw-app/syntropy/nodes/dispatch.tsx` — add `symbolic` to `Archetype`
  + `ARCHETYPE_BY_KIND["expression"]="symbolic"`; add `case "symbolic"` → `SymbolicNode`,
  `case "field"` → `FieldNode`.
- **Create:** `canvas/excalidraw-app/syntropy/nodes/SymbolicNode.tsx` + `.scss` — renders the
  `expression` output (formatted math) + scalar stat rows + port dots.
- **Create:** `canvas/excalidraw-app/syntropy/nodes/FieldNode.tsx` + `.scss` — inline-SVG field
  (arrows/heatmap/contour/domainColor) + scalar stat rows + port dots.
- **Create:** `canvas/excalidraw-app/tests/nodes/SymbolicNode.test.tsx`,
  `FieldNode.test.tsx`, `useNodeCompute.test.tsx`.
- **Modify:** `canvas/excalidraw-app/syntropy/NodeOverlay.tsx` — Run button + status chip for
  run-mode nodes; stale hint on input edit.
- **Modify:** `canvas/excalidraw-app/tests/nodes/dispatch.test.tsx` — add `SYMBOLIC_FIXTURE`
  (`expression` first output) and `FIELD_FIXTURE` (`field` first output) routing tests; add a
  run-mode fixture asserting the dispatcher passes `pending` through (renderer-agnostic).
- **Modify:** `canvas/excalidraw-app/syntropy/engineAccents.ts` — add `complex` accent.

---

## Task 1: Contract — widen executionMode + async compute + new output kinds

**Files:** Modify `portSpecs/types.ts`. Test: `tests/portSpecsContract.test.ts`,
`tests/portSpecsOutputShape.test.ts`.

**Interfaces:**
- Produces: `ExecutionMode = "live" | "run"`; `compute: (inputs) => ComputeResult |
  Promise<ComputeResult>`; `ExpressionOutput`, `FieldOutput` types; `expression`/`field` as valid
  output kinds; `relation?: "factorization"` documented for symbolic+matrix use.

- [ ] **Step 1: Write the failing contract test.** In `portSpecsContract.test.ts`, add a fixture
  spec with `executionMode: "run"`, an async `compute: async () => ({ outputs: { e: { display:
  "x^2" } } })`, and outputs `[{ key: "e", kind: "expression" }]`. Assert the contract validator
  accepts it and `archetypeFromSpec` returns `"symbolic"` (after Task 4) — for now assert kind
  `expression` is in the allowed-kind set.
- [ ] **Step 2: Run — expect FAIL** (`yarn test:app --run tests/portSpecsContract.test.ts`):
  `executionMode` literal rejects `"run"`; `expression`/`field` output kinds not yet allowed.
- [ ] **Step 3: Edit `types.ts`.** Change `executionMode: "live"` → `executionMode: "live" |
  "run"`. Change `compute` return to `ComputeResult | Promise<ComputeResult>`. Add
  `ExpressionOutput` and `FieldOutput` types (spec §3). Add `expression` and `field` to the
  allowed output-kind union/comment. Generalize `relation?: "factorization"` to apply to any
  spec (comment: used by matrix LU and number-theory symbolic factorizations).
- [ ] **Step 4: Run contract + output-shape tests — expect PASS.**
- [ ] **Step 5: Run typecheck** (`yarn test:typecheck`) — the 89 existing specs' sync `compute`
  still satisfies the widened union (sync is assignable to sync|async). Expect clean.
- [ ] **Step 6: Commit.** `feat(syntropy): widen PortSpec to live|run + async compute; add
  expression/field output kinds`

## Task 2: CAS bridge — lazy ES-module client to math-lab worker

**Files:** Create `syntropy/cas/casClient.ts`, `syntropy/cas/casClient.test.ts`.

**Interfaces:**
- Produces: `casCall(op: string, args: unknown[]): Promise<unknown>` (and a `casReady()`
  boolean + `loadCas()` for tests). Lazy: the first `casCall` spawns the worker; subsequent
  calls reuse it. Errors/timeouts reject (never leave a caller pending).

- [ ] **Step 1: Failing test.** `casClient.test.ts` mocks a fake worker (a stub that resolves
  `{ok:true, result, id}` to a posted message) and asserts: (a) `casCall("limit",
  ["x","x",0])` resolves to the stub's result; (b) a second call reuses the same worker (spawn
  called once); (c) an `{ok:false, error}` response rejects; (d) timeout rejects. No real
  nerdamer import.
- [ ] **Step 2: Run — FAIL** (module doesn't exist).
- [ ] **Step 3: Implement `casClient.ts`.** Replicate `cas-client.js`'s protocol in TS: a
  `pending: Map<id, {resolve, reject, timer}>`, `worker.onmessage` matching by id, a
  `postMessage({id, op, args})`. Worker bootstrap: `new Worker(new URL(...cas-worker.js...))`
  resolved relative to math-lab assets (the exact path is resolved at Task 3 integration; here
  inject the worker constructor so the test can stub it). Export `casCall`, `loadCas`,
  `casReady`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `feat(syntropy): CAS bridge client to math-lab worker (lazy, Promise)`

## Task 3: Integrate worker path — verify the real worker boots from canvas

**Files:** Modify `casClient.ts` (worker URL). Test: manual + one integration spec behind a skip guard.

- [ ] **Step 1:** Resolve the on-demand worker bundle path. Confirm `cas-worker.js` + its
  symbolic-core imports can be spawned as a module worker from the canvas build (check
  `vite.config.mts` worker handling; if the IIFE scripts can't be module workers directly, add a
  tiny entry wrapper that imports `cas-worker.js`). Log the chosen path in the file header.
- [ ] **Step 2:** Add `casClient.integration.test.ts` that calls the *real* `casCall("limit",
  ["x","x",0])` and asserts a finite result — guarded by `it.skipUnless(process.env.CAS_INT)`
  so it never runs in normal CI. Document the env opt-in in the file header.
- [ ] **Step 3:** Run with `CAS_INT=1 yarn test:app --run casClient.integration` — confirm the
  real worker boots and returns. (If the path needs a build step, note it; do not block the
  suite.)
- [ ] **Step 4:** Ensure the default suite still passes (`yarn test:app --run casClient.test`).
- [ ] **Step 5: Commit.** `feat(syntropy): wire real math-lab CAS worker path (on-demand)`

## Task 4: Symbolic archetype — renderer + dispatch

**Files:** Create `SymbolicNode.tsx` + `.scss`; modify `dispatch.tsx`. Test:
`tests/nodes/SymbolicNode.test.tsx`, `tests/nodes/dispatch.test.tsx`.

**Interfaces:**
- Consumes: `NodeBodyProps`; the spec's first `kind:"expression"` output
  (`ExpressionOutput`); any `number`/`text` outputs as scalar rows; `relation:"factorization"`.
- Produces: a renderer identical in shell to TraceNode/DistributionNode (scrub inputs → rich
  output → scalar stat rows with PortDots), with the rich area showing the expression.

- [ ] **Step 1: Failing dispatch test.** Add `SYMBOLIC_FIXTURE` to `dispatch.test.tsx`: outputs
  `[{ key:"expr", kind:"expression" }, { key:"n", kind:"number" }]`, sync compute returning
  `{ expr: { display: "2*x^2 + 3" }, n: 5 }`. Assert the body renders an element
  `[data-syntropy-symbolic]` and the `n` output port dot. Run — FAIL.
- [ ] **Step 2: Add archetype wiring.** In `dispatch.tsx`: add `"symbolic"` to `Archetype`;
  `ARCHETYPE_BY_KIND["expression"] = "symbolic"`; `case "symbolic": return <SymbolicNode .../>`.
- [ ] **Step 3: Implement `SymbolicNode.tsx`.** Mirror DistributionNode structure: scrub
  inputs (existing scrub component), then the expression area. If `relation ===
  "factorization"`, render the `structured` form: factorization → `n = p₁^e₁ · p₂^e₂`;
  continuedFraction → `[a₀; a₁, …, aₖ]` (period under an overline span); congruenceSet →
  `x ≡ s₁, s₂, … (mod m)`; else render `display` as a monospace math line. Then scalar stat
  rows (number/text outputs) with `PortDot`s. Wrap rich area in `<div data-syntropy-symbolic>`.
- [ ] **Step 4: `SymbolicNode.scss`** — tokens mirroring DistributionNode.scss; the expression
  line in the node accent, factor bases bold, exponents superscript-styled.
- [ ] **Step 5: `SymbolicNode.test.tsx`** — inline `SYMBOLIC_SPEC` with each `structured` kind
  (factorization, continuedFraction, congruenceSet, plain). Tests: factorization renders
  `12 = 2²·3` form; continuedFraction renders the period; congruenceSet renders `mod`; scalar
  output port dot present; wired input chip read-only; pointerdown reports the output key.
- [ ] **Step 6: Run targeted + dispatch tests — PASS.** Typecheck + lint.
- [ ] **Step 7: Commit.** `feat(syntropy): Symbolic archetype renderer (expression output)`

## Task 5: Field archetype — renderer + dispatch

**Files:** Create `FieldNode.tsx` + `.scss`; modify `dispatch.tsx`. Test:
`tests/nodes/FieldNode.test.tsx`, `dispatch.test.tsx`.

- [ ] **Step 1: Failing dispatch test.** Add `FIELD_FIXTURE`: outputs
  `[{ key:"field", kind:"field" }, { key:"note", kind:"text" }]`, sync compute returning a
  small `FieldOutput` (`variant:"arrows"`, 3×3 grid + vectors). Assert
  `svg[aria-label*="field"]` and the `note` port dot. Run — FAIL.
- [ ] **Step 2: Implement `FieldNode.tsx`.** `RealLinePlot`-sized SVG (VIEW_W=260, VIEW_H=180).
  Map domain `[xLo,xHi]×[yLo,yHi]` → viewbox. Variants: `arrows` → draw vector lines+heads per
  `vectors`; `heatmap` → color each grid cell by `value` (accent-gradient); `contour` →
  isolines from `value` grid (marching-squares lite, or pre-computed by compute); `domainColor`
  → hue by arg / lightness by magnitude from a complex `value` grid. Then scalar stat rows +
  port dots. aria-label `field plot: <variant> over [xLo,xHi]×[yLo,yHi]`.
- [ ] **Step 3:** `FieldNode.scss` mirroring RealLineNode.scss plot tokens.
- [ ] **Step 4:** `FieldNode.test.tsx` — one fixture per variant (arrows/heatmap/contour/
  domainColor) asserting the distinguishing SVG element (arrows: `<line>`s; heatmap: colored
  `<rect>`s; contour: `<path>`s; domainColor: hue `<rect>`s) + scalar port dot + wired input.
- [ ] **Step 5:** Add `case "field": return <FieldNode .../>` to `dispatch.tsx` (replacing the
  current ScalarNode fallback for field). Update the dispatch doc comment.
- [ ] **Step 6: Run targeted + dispatch — PASS.** Typecheck + lint.
- [ ] **Step 7: Commit.** `feat(syntropy): Field archetype renderer (vector/scalar field plot)`

## Task 6: Async-aware compute — useNodeCompute hook

**Files:** Create `nodes/useNodeCompute.ts`; modify all node renderers' local-compute call.
Test: `tests/nodes/useNodeCompute.test.tsx`.

**Interfaces:**
- Produces: `useNodeCompute(spec, effectiveInputs, runSignal): { outputs, error, pending,
  stale }`. For `executionMode:"live"`: re-invokes `spec.compute` synchronously on every input
  change (existing behavior). For `"run"`: returns the last-run result; `pending` while a run
  is in flight; `stale` when inputs changed since the last run. A `run()` action triggers a
  compute.

- [ ] **Step 1: Failing test.** A live fixture (sync) → outputs always fresh, never pending.
  A run fixture (async, mocked compute) → initially `stale`/no outputs; after `run()` →
  `pending` then `ready` with outputs; edit input → `stale` again without losing the last
  result. Run — FAIL.
- [ ] **Step 2: Implement `useNodeCompute.ts`.** Track `lastInputs`, `lastResult`, `pending`,
  `runCount`. Live mode: compute synchronously each render (memoized on inputs). Run mode:
  compute only when `run()` called; keep `lastResult` across input edits; set `stale` when
  `effectiveInputs` !== `lastInputs`.
- [ ] **Step 3: Refactor renderers.** Replace each `const { outputs, error } =
  spec.compute(effectiveLocalInputs)` in `TraceNode`/`RealLineNode`/`DistributionNode`/
  `MatrixNode`/`ScalarNode`/`SymbolicNode`/`FieldNode` with `const { outputs, error, pending,
  stale } = useNodeCompute(spec, effectiveLocalInputs, runSignal)`. Renderers show `pending`/
  `stale` as a small chip (a shared `<NodeStatus>` component).
- [ ] **Step 4: Run all node tests — PASS.** (Live behavior unchanged → no regressions.)
- [ ] **Step 5: Commit.** `refactor(syntropy): useNodeCompute hook — async/run-mode aware`

## Task 7: Async wiring propagation

**Files:** Modify `wiring.ts`. Test: `tests/wiring.test.ts` (extend).

- [ ] **Step 1: Failing test.** Two run-mode nodes A→B (B's input wired to A's output). Both
  initially un-run → B's effective input is undefined, B shows waiting. Run A → A resolves;
  B's wired input now has A's value but B is stale until Run B. Run B → B resolves. Assert the
  results map carries `pending`/`stale` flags correctly and downstream sees upstream outputs
  once upstream is ready.
- [ ] **Step 2: Implement.** `computeWiredResults` keeps sync semantics for live nodes. For
  run nodes it reads from a `runStore` (Map of nodeId → last result + inputs hash + pending).
  A run node's wired inputs pull from the upstream's *ready* result (not pending). A run node
  with a pending/absent upstream → `pending`/waiting entry.
- [ ] **Step 3: Run — PASS.** Typecheck + lint.
- [ ] **Step 4: Commit.** `feat(syntropy): async-aware wired-result propagation`

## Task 8: Run trigger + status UX

**Files:** Modify `NodeOverlay.tsx` (and the node shell chrome). Test:
`tests/NodeOverlay.test.tsx` (extend).

- [ ] **Step 1: Failing test.** Render a run-mode node → Run button present, status chip
  "Press Run". Click Run → chip "running" → "ready". Edit an input → chip "stale". A live
  node → no Run button.
- [ ] **Step 2: Implement.** `NodeOverlay` reads `spec.executionMode`; for `"run"` it renders a
  Run button that calls the node's `run()` (wired into `useNodeCompute` via props) and a
  `<NodeStatus>` chip driven by `{pending, stale, error}`. Live nodes unchanged.
- [ ] **Step 3: Run — PASS.** Typecheck + lint.
- [ ] **Step 4: Commit.** `feat(syntropy): Run trigger + pending/stale/error status UX`

## Task 9: Full-suite regression gate

- [ ] **Step 1:** `yarn test:app --run` (full suite). Fix any cross-cutting breakage (the real
  lesson: targeted tests miss it). Target: 178+ files green, zero failures.
- [ ] **Step 2:** `yarn test:typecheck`, `yarn fix:code && yarn test:code` clean (benign
  MetaProperty jsx-ast-utils warning is fine if yarn exits 0).
- [ ] **Step 3:** Update `dispatch.tsx` doc comment to list SymbolicNode + FieldNode as shipped.
- [ ] **Step 4: Commit.** `test(syntropy): foundation green on full suite`

## Self-Review (before handoff)
- **Spec coverage:** spec §3 (output shapes) → Task 1; §4 (async mode) → Tasks 6–8; §2
  (Symbolic/Field) → Tasks 4–5; §1 (CAS bridge) → Tasks 2–3; contract/dispatch → Tasks 1,4,5.
- **Placeholders:** none — every step names files, fixtures, assertions, commit messages.
- **Type consistency:** `ExpressionOutput`/`FieldOutput` defined in Task 1, consumed in Tasks 4/5;
  `useNodeCompute` return shape `{outputs,error,pending,stale}` identical in Tasks 6/7/8.