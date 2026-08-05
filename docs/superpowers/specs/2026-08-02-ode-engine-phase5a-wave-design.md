# ODE Engine Phase 5a — Wave Equation — Design

**Context:** `ODE_PDE_ENGINE_PLAN.md`/`CURRICULUM_ROADMAP.md` §5G item #21, P1, ⚪ Not started —
"the single best 'oh, *that's* what that means' opportunity in the engine." No wave equation
page exists today; the heat equation page (item #20, built) is the direct architectural
template: pure numeric separation-of-variables in `ODESymbolic`, wired through the lightweight
`cas-worker.js` (no Pyodide/SymPy needed — the solution *form* is textbook-known, only the
Fourier coefficients need computing), Plotly heatmap + snapshot rendering.

**Goal:** `u_tt = c²u_xx`, `0<x<L`, Dirichlet ends, initial position `f(x)` and velocity `g(x)`
— shown two ways side by side: the standing-wave (normal-mode) series, and d'Alembert's
traveling-wave form. Each is independently derived; showing they agree numerically *is* the
verification (same "never trust blindly" discipline as every other page, applied via
cross-checking two independent derivations instead of substituting back into the PDE).

## Verified this session (pure numerics, no sympy needed)

Standing-wave form: `u(x,t) = Σ [Aₙcos(nπct/L) + Bₙsin(nπct/L)]sin(nπx/L)`, with `Aₙ` the usual
Fourier sine coefficients of `f`, and `Bₙ = (2/(nπc))∫g(x)sin(nπx/L)dx`.

d'Alembert form (reflection method for the finite string): `u(x,t) = [F(x−ct)+F(x+ct)]/2 +
(1/2c)∫_{x−ct}^{x+ct} G(s)ds`, where `F`/`G` are the odd, `2L`-periodic extensions of `f`/`g`.

Tested both against each other at several `(x,t)` points, position-only IC (`g=0`) and
velocity-only IC (`f=0`, multi-mode `g`): agreement to `1e-6`–`1e-11` (limited only by series
truncation `N` and quadrature resolution, not a structural error).

## Scope

- Dirichlet BCs only (`u(0,t)=u(L,t)=0`) — matches the heat equation page's existing scope and
  the curriculum item's own framing (no Neumann/mixed BC this pass).
- Both `f(x)` and `g(x)` (initial position and velocity) — the d'Alembert integral term only
  matters when `g≠0`, so both are needed to actually exercise it.
- Two views rendered side by side: a heatmap of `u(x,t)` (matching the heat page's convention)
  built from the standing-wave series, and an explicit numeric agreement check against
  d'Alembert at sample points, surfaced as the verification badge/line.
- Out of scope: Plotly/Scene3D 3D surface treatment (heat equation itself hasn't migrated to
  that yet either — stay consistent with what's actually built, not the aspirational note in
  the heat equation's own curriculum entry).

## Architecture

**`assets/js/ode-symbolic.js` — three new pure functions** (parallel to
`heatSeriesValue`/`solveHeatEquation`):
- `ODESymbolic.waveSeriesValue(An, Bn, L, c, x, t)` — evaluates the standing-wave series.
- `ODESymbolic.oddPeriodicExtension(fn, L)` — returns a new function: the odd, `2L`-periodic
  extension of `fn` (defined on `[0,L]`) to all reals. Shared by both `F` and `G`.
- `ODESymbolic.dAlembertValue(Fext, Gext, c, x, t)` — `[Fext(x−ct)+Fext(x+ct)]/2 +
  (1/2c)·simpsonIntegrate(Gext, x−ct, x+ct, n)`, reusing the module's existing
  `simpsonIntegrate` helper (already private to this file, used by `solveHeatEquation`).
- `ODESymbolic.solveWaveEquation({L, c, fxExpr, gxExpr, N, T})` — computes `An`/`Bn` via Simpson
  (same pattern as `solveHeatEquation`'s `bn`), returns the derivation steps + coefficients
  (plain numbers, structured-clone-safe across the worker boundary, same reason
  `solveHeatEquation` does this).

**`cas-worker.js` / `cas-client.js`:** new op `solveWaveEquation`, mirroring
`solveHeatEquation`'s registration exactly (`solveWaveEquation: (args) =>
ODESymbolic.solveWaveEquation(args[0])`; `CAS.solveWaveEquation = function(params, opts) {
return CAS.call("solveWaveEquation", [params], opts); }`).

**New page (`engines/ode/methods/wave-equation.html`) + wiring (`assets/js/ode-wave.js`):**
mirrors `ode-heat.js` structurally. After `CAS.solveWaveEquation` returns, the page:
1. Reconstructs `u_series(x,t)` via `waveSeriesValue`.
2. Builds `Fext`/`Gext` via `oddPeriodicExtension` from the same compiled `f`/`g`, and
   reconstructs `u_dalembert(x,t)` via `dAlembertValue`.
3. **Verifies** by comparing `u_series` and `u_dalembert` at a quorum of sample `(x,t)` points
   (same `usable >= 3` / relative-tolerance pattern used throughout this engine) before
   rendering anything — a genuine disagreement (not expected mathematically, but checked
   anyway per this site's discipline) produces an honest refusal.
4. Renders the derivation box, a `u(x,t)` heatmap (standing-wave form, matching the heat page's
   heatmap convention), and time-slice snapshots — plus a status line naming the cross-check
   ("Standing-wave and d'Alembert forms agree to within tolerance at N sample points").

## Reuse map

| Need | Reuse |
|---|---|
| Fourier sine coefficients | Same Simpson-integral pattern as `solveHeatEquation`'s `bn` |
| Numeric quadrature | The module's existing private `simpsonIntegrate` |
| Worker plumbing | `cas-worker.js`/`cas-client.js`, mirroring `solveHeatEquation`'s registration |
| Heatmap + snapshot rendering | `ode-heat.js`'s existing Plotly conventions |

## Error handling

- `f`/`g` fail to compile or evaluate → inline form error, no solve attempt (matches
  `ode-heat.js`'s existing `updateStartCheck` pattern).
- Standing-wave vs d'Alembert disagreement beyond tolerance → honest refusal, never shown as
  if correct.

## Testing

- Node-runnable: `waveSeriesValue`, `oddPeriodicExtension`, and `dAlembertValue` are pure JS
  (no Pyodide, no `CAS`/Worker dependency) — fully Node-testable, unlike Phases 1-4's SymPy-worker
  code. `solveWaveEquation` itself is also pure JS (Simpson's rule + `math.js` compile, same as
  `solveHeatEquation`) — also Node-testable, calling it directly rather than through `CAS`.
- Manual browser pass: position-only IC, velocity-only IC, and a mixed case; confirm the
  agreement check passes and the two views' numbers actually match by eye at a few points.
