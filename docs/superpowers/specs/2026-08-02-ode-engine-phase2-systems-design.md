# ODE Engine Phase 2 — Systems of ODEs (`x' = Ax + g(t)`) — Design

**Context:** Phase 1 (`docs/superpowers/plans/2026-08-01-ode-engine-phase1-general-solver.md`)
replaced the hand-rolled single-equation classify tree with a general SymPy-`dsolve()`-backed
solver. This is Phase 2 of the same redesign, from the roadmap `ODE_PDE_ENGINE_PLAN.md` §5D
item #12 ("systems and phase portraits") — the first item explicitly deferred out of Phase 1's
scope.

**Goal:** A new consolidated page solving first-order linear systems `x' = Ax + g(t)`, any n×n,
the same answer-first / verified-before-shown way Phase 1 works — `dsolve()` does the algebra
generically instead of a hand-rolled per-case derivation.

## Scope

- Any n×n constant-coefficient `A`, homogeneous (`g(t) = 0`) or forced (`g(t) ≠ 0`).
- Phase-portrait rendering and node/saddle/spiral/center equilibrium classification apply only
  at n=2 — it's a 2D concept, not a generalization of the algebra. At n≥3 the page still shows
  the solved component functions, the eigenvalues, and a general stability read (all real parts
  negative → asymptotically stable; any positive → unstable; mixed signs → saddle-type), but no
  portrait plot.
- Out of scope for this phase: nonlinear system linearization (Jacobian-based), n≥3 phase-space
  visualization.

## Architecture

**SymPy worker (`sympy-worker.js`):** new op `_dsolve_system(matrix_rows, g_list, ics)`. Builds
a `sp.Matrix` from `matrix_rows`, symbolic functions `x1(t)…xn(t)`, the corresponding system of
`Eq`s (`xi'(t) = row_i(A)·x(t) + g_i(t)`), and calls `sp.dsolve(system, funcs, ics=ics)`. Same
error handling convention as `_dsolve_general`: `NotImplementedError` / parse failures become an
honest refusal message, never a guessed result.

**New pure-JS module (`ode-systems.js`, parallel to `ode-solver.js`):**
1. Parses `A` and `g(t)` from the page's matrix/vector inputs.
2. Calls the worker op via a new `SympyClient.dsolveSystem` wrapper (mirrors
   `dsolveGeneral`).
3. **Independently verifies** the returned solution by substituting it back into
   `xi'(t) = row_i(A)·x(t) + g_i(t)` at several t via finite differences — same
   never-trust-blindly discipline as `ode-solver.js`. A verification failure produces an honest
   refusal, never a faked result.
4. At n=2 only: classifies the equilibrium via `LinAlg.eigenvalues(A)` (trace–determinant
   chart → node / saddle / improper node / spiral / center). This is the **one deliberately
   hand-rolled piece** — a single bounded calculation, not a classify-then-derive tree, so it
   doesn't contradict the Phase 1 redesign's philosophy.
   - `LinAlg.eigenvectorsFor`/`nullSpaceBasis` are reused for real-eigenvalue cases only —
     `eigenvectorsFor` throws on a non-real λ, so complex-eigenvalue (spiral/center) cases lean
     on the SymPy solution directly rather than a JS-computed eigenvector.
5. At n=2 only: builds the phase-portrait plot — vector-field arrows via the same Plotly
   `shapes`-line-segment technique already in `ode-direction-fields.js` (fed `(dx/dt, dy/dt)`
   from `Ax+g` instead of a scalar slope), plus a few integrated trajectories.
6. **New, not a reuse:** a small vector-valued RK4 stepper (`rk4System`) for trajectory
   integration — no existing module has one (`ODESymbolic.eulerRK4FirstOrder`/`rk4SecondOrder`
   are scalar-only). Stays local to `ode-systems.js`, no duplication with other engine files.

**New page (`engines/ode/methods/systems.html`):** consolidated single page (matches the
Phase 1 `ode-solver.html` pattern), linked from `engines/ode/methods.html`.

## Reuse map

| Need | Reuse |
|---|---|
| Solve the system's algebra (any n, homogeneous or forced) | SymPy `dsolve()` (new worker op) |
| Equilibrium classification (n=2 only) | `LinAlg.eigenvalues` (already complex-aware) |
| Eigenvectors for the real-eigenvalue cases | `LinAlg.eigenvectorsFor` / `nullSpaceBasis` |
| Vector-field + trajectory plotting | Plotly `shapes` pattern from `ode-direction-fields.js`, `Engine.plotlyBaseLayout` |
| Numeric verification (finite-difference substitution) | Same pattern as `ode-solver.js` |

## Error handling

- Non-square or malformed matrix input → inline form error, no solve attempt.
- SymPy `NotImplementedError` / parse failure → honest refusal message, no plot.
- Verification failure (symbolic solution doesn't satisfy the system numerically) → honest
  refusal, never shown as if correct.

## Testing

- Node-runnable unit tests for `ode-systems.js`'s pure-JS logic (parsing, verification,
  n=2 classification, `rk4System`) — same constraint as Phase 1: the Pyodide/SymPy worker
  itself isn't Node-testable, verified manually in-browser.
- Manual browser verification pass covering: homogeneous 2×2 (all five equilibrium types),
  forced 2×2, and an n=3 case (no portrait, but solution + stability read shown).
