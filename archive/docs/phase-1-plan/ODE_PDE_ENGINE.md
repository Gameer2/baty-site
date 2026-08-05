# ODE/PDE Engine — Phase 1 (completed work) — SUPERSEDED, archived 2026-08-02

**Everything described below (the hand-rolled classify-then-derive tree, the BigInt
exact-arithmetic layer) was retired during the 2026-08 ODE engine redesign** — replaced by a
`dsolve()`-driven architecture. This file is kept only as a historical record of the
pre-redesign engine. For the current, accurate state of the ODE/PDE engine, see
`docs/ODE_PDE_ENGINE_PLAN.md` and `docs/ODE_PDE_SOLVER_DESIGN.md` (both complete, both
current as of 2026-08-02).

---

Extracted from `docs/ODE_PDE_ENGINE_PLAN.md`. Only what is actually built and verified.
Anything not listed here is not done — see `phase-2-plan/ODE_PDE_ENGINE.md`.

## Foundation

- Moved from `assets/proto/ode-solver.js` (prototype, 847 lines, main-thread) to
  `assets/js/ode-symbolic.js` — pure, DOM-free, Node-testable, hosted in the CAS worker
  (timeout/terminate/respawn hang protection, same as the Calculus Engine).
- `tests/verify-ode.js` created and grown to 176 cases (started at 51).
- `engines/ode/index.html` split into a `methods.html` catalog + per-method pages
  (`first-order.html`, `second-order.html`, `heat-equation.html`, `fourier-series.html`,
  `direction-fields.html`), matching the other engines. Wired via shared `assets/js/ode-render.js`.
- An exact-arithmetic layer was added (`frac`/`fAdd`/`fMul` on BigInt pairs,
  `solveExactLinearSystem`, `shapeMapOf`/`splitCoeffShape`, `matchCoefficientsExact`,
  `charRoots` with exact discriminants, `withAbsLogs`) — replaced float-based collocation
  with real symbolic derivation throughout.

## First-order ODEs

- `solveSeparable` — separable bug fixed (probe constants no longer leak into the answer).
- `solveLinear` (integrating factor) — verified.
- `solveExact` + `parseExactForm` — verified for the already-exact case.
- `solveHomogeneous` (y = vx) and `solveBernoulli` — both built and verified.
- `solveDirectIntegration` (dy/dx = g(x), no y at all) — detected symbolically, runs first.
- `solveLinearInX` (first-order linear symmetric in x) — wired into `classifyFirstOrder`, tested.
- `solveBernoulliInX` (Bernoulli symmetric in x) — wired, tested.
- `solveLinearCombination` (y' = f(ax+by+c) via linear substitution) — wired, tested. Needed a
  new `integrateReciprocalQuadratic` fallback (closed-form completed-square arctan) inside
  `verifiedIntegrate` for cases nerdamer's `integrate()` mishandles.
- `solveIntegratingFactor` for non-exact M dx + N dy = 0 (μ(x) or μ(y)) — wired, tested. Ratio
  independence decided numerically (`isIndependentOfOther`), recovered by fitting
  (`fitRatioToExpr`) rather than trusting symbolic cancellation (confirmed unreliable).

## Second-order ODEs

- `classifySecondOrder` + `charRoots` — all three root cases verified by direct substitution.
- `tryUndeterminedCoefficients` — rewritten from numeric collocation to exact coefficient
  matching; shows the matching equations as steps; handles P(x)e^(kx) right-hand sides.
- `tryVariationOfParameters` — verified.
- Euler-Cauchy: `parseEulerCauchy` + `classifyEulerCauchy` — full dedicated solver (indicial
  equation, 3 root cases, disguised-form rescaling), 16 test cases. Nonhomogeneous case via
  variation of parameters with Abel's-theorem Wronskian fit. Verified against a course worked
  example exactly.
- Nonlinear reduction, case A (y missing): `detectReducibleKind`/`isolateYpp`/
  `classifyYMissing` — verified end-to-end against course material.

## Numeric fallback

- `eulerRK4FirstOrder`, `rk4SecondOrder` — built.
- `solveHeatEquation` — verified (6 cases: coefficients, IC match, boundary conditions, the PDE
  itself via finite differences). Lives inside `ode-symbolic.js` (`ODESymbolic.solveHeatEquation`).

## PDE (Phase 6, partial)

- **Fourier series** — full series on [-L, L], plus half-range sine/cosine on [0, L].
  `CalculusSymbolic.fourierSeries` computes every coefficient via `Algorithms.runSimpson`, adds
  exact π-symbolic forms via `gatedIntegral` for small n. `fourierSeriesValue` rebuilds the
  partial sum for plotting. 30 test cases in `tests/verify-calculus.js`. Wired to
  `engines/ode/methods/fourier-series.html`. Gibbs phenomenon visible in the overlay.
- **Heat equation** (parabolic) — separation of variables, built and verified (see above).

## Hard-won rules now enforced (apply to every future solver here)

1. Construction probe points must differ from classification probe points (classification uses
   fixed generic numbers; construction re-derives with x0=1, y0=1, matching hand-solving).
2. Any float from arithmetic (not a literal in source) must go through `cleanNum()` (round to
   12 sig figs) before being dropped into a nerdamer expression string.
3. `e^(k·log(u))` must be collapsed to `u^k` manually before integrating — nerdamer will not do
   this itself, and it's the common case (not an edge case) for integrating factors.
4. Multi-point numeric verification loops must `continue` past a bad point, never abort the
   whole check on one bad sample.
5. Numeric verification is a safety net over a symbolic result, never a substitute for solving
   symbolically — every derivation must stay in exact rationals/closed forms.
6. A verify-by-sampling gate requires a quorum (≥3 agreeing points), not one lucky hit.
