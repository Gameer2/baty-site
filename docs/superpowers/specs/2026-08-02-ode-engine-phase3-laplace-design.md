# ODE Engine Phase 3 — Laplace Transform Engine — Design

**Context:** Phase 1 replaced the hand-rolled single-equation classify tree with a general
SymPy-`dsolve()`-backed solver; Phase 2 did the same for systems. This is Phase 3, from the
roadmap `ODE_PDE_ENGINE_PLAN.md` §5C item #10/#11 — the second item explicitly deferred out of
Phase 1's scope. Today's `laplace-transform.html` is not a Laplace solver at all: it's a themed
front end over generic `dsolve()` that happens to accept `Heaviside`/`DiracDelta` forcing. No
transform, no algebra-in-`s`-space, no inverse transform is ever computed.

**Goal:** A real Laplace Transform engine: a standalone transform/inverse-transform calculator,
a fully staged "solve an IVP via Laplace" walkthrough (transform → solve algebraically →
invert, any order), and a convolution-theorem demonstration — replacing the current page and
retiring the scaffolding it depends on.

## Scope

- **Transform Calculator section:** type `f(t)` → `F(s)`, or `F(s)` → `f(t)` (toggle). Verified
  by numeric quadrature (truncated improper integral, see Verification below). `DiracDelta`
  inputs are shown but labeled "not independently verified (distributional)" rather than
  falsely claiming a check that isn't mathematically possible via Riemann quadrature.
- **Worked IVP walkthrough section:** any order (generalizing today's 1st/2nd-order-only
  scope), constant-coefficient linear equations only (`aₙy⁽ⁿ⁾ + ... + a₀y = f(t)`) — the only
  case the transform-of-derivative property applies to. Shows all three stages explicitly:
  the s-domain algebraic equation, the solved `Y(s)`, and the inverse-transformed `y(t)`. Final
  answer verified by reusing `ODESolver.verifyNthOrder` against the *original* equation — no new
  verifier needed for this section.
- **Convolution section:** `L{f∗g} = F(s)·G(s)`, demonstrated and independently verified by
  comparing the direct convolution integral `∫₀ᵗf(τ)g(t−τ)dτ` (a proper, finite-bounds integral
  — no impropriety) against the inverse transform of the product.
- Out of scope: periodic-function Laplace transforms, transfer-function/systems framing —
  neither is in the curriculum item's scope.

## Architecture

**SymPy worker (`sympy-worker.js`) — three new ops:**
1. `laplaceTransform(exprText)` → `_laplace_transform_of`: `sp.laplace_transform(f, t, s,
   noconds=True)`.
2. `inverseLaplaceTransform(exprText)` → `_inverse_laplace_transform_of`:
   `sp.inverse_laplace_transform(F, s, t)`.
3. `laplaceSolveIvp(coeffs, rhsText, icsList)` → `_laplace_solve_ivp`: builds the s-domain
   equation via `sⁿY(s) − Σsⁿ⁻¹⁻ᵏy⁽ᵏ⁾(0)` for each derivative term (the literal definition of
   the transform-of-derivative property — not a per-case branch), forms `Eq(lhs_s, rhs_s)`,
   solves for `Y` via `sp.solve`, inverse-transforms to `y(t)`. Returns all three stages as JSON
   for display.
4. `laplaceConvolution(fText, gText)` → `_laplace_convolution`: computes `F(s)`, `G(s)`,
   `F(s)·G(s)`, and its inverse transform — returned together for display.

Verified directly against real SymPy this session (homogeneous, step-forcing, and
impulse-forcing IVPs; forward/inverse transform pairs including both shifting theorems;
convolution) — all match known textbook answers.

**New pure-JS module (`laplace-engine.js`):**
- `extractLinearCoeffs(equationText)` — the coefficient extractor the IVP walkthrough needs.
  Reuses the same numeric-sampling technique `ode-direction-fields.js`'s `detectLinear` already
  uses: compile the LHS via math.js with placeholder substitution (`y→Y0, y'→Y1, ...`, same
  convention as `ode-solver.js`'s `toPlaceholdersGeneral`), evaluate at unit basis points
  (`Yₖ=1`, all others `0`) to read off each `aₖ` directly, then cross-check linearity at a
  random combination — refuses honestly if the equation isn't actually constant-coefficient
  linear (variable coefficients, nonlinear terms).
- `verifyTransformPair(fFn, gFn, direction)` — the one numeric verification primitive used by
  *both* transform directions: numerically evaluate `∫₀ᵀf(t)e⁻ˢᵗdt` (truncated at large `T`,
  `Algorithms.runSimpson`, reused) at several sample `s`, compare against the candidate `F(s)`
  evaluated at those same points. Forward: compare the returned `F(s)`. Inverse: forward-transform
  the *candidate* `f(t)` and compare to the *original* `F(s)` — same primitive, opposite roles.
- `solveIvp(equationText, icsList)` — orchestrates: `extractLinearCoeffs` +
  `ODESolver.detectOrder` (reused) → `laplaceSolveIvp` worker call → verify the final `y(t)` via
  `ODESolver.verifyNthOrder` (reused, not reimplemented) against the original equation text.
- `verifyConvolution(fText, gText, convResultText)` — numerically integrates the direct
  convolution integral via `Algorithms.runSimpson` (proper bounds `[0,t]`) at several `t`,
  compares against the candidate result.

**New page (`laplace-transform.html`):** rewritten with the three sections above, replacing
today's single IVP-only form.

## Dead-code cleanup this phase triggers

Verified via grep — nothing else in the codebase depends on these once this page stops calling
them:
- `assets/js/sympy-dsolve-fallback.js` — delete the whole file (its only consumer today).
- `_dsolve_first_order`, `_dsolve_second_order`, `_dsolve_second_order_general` (Python,
  `sympy-worker.js`) and their `dsolveFirstOrder`/`dsolveSecondOrder`/`dsolveSecondOrderGeneral`
  op registrations and `SympyClient` wrappers — only `sympy-dsolve-fallback.js` called them.
  (`_prepare_ode_text` stays — `_series_solution` also uses it.)
- `ODESymbolic.isSecondOrderInput`, `parseSecondOrder`, `rhsFromInput` (`ode-symbolic.js`) and
  their tests in `tests/verify-ode.js` — only `sympy-dsolve-fallback.js` and the old
  `laplace-transform.js` called them.

This is the concrete form of "drop the SympyDsolveFallback/parseSecondOrder dependency in favor
of ode-solver.js" from the roadmap note — not a separate cleanup pass, a direct consequence of
this phase's own rewrite.

## Reuse map

| Need | Reuse |
|---|---|
| Order detection | `ODESolver.detectOrder` |
| Final-answer verification (IVP walkthrough) | `ODESolver.verifyNthOrder` |
| Constant substitution for verification | `ODESolver.withArbitraryConstants` |
| Expression compilation | `ODESolver.compileRealFx` |
| Numeric quadrature (transform/convolution verification) | `Algorithms.runSimpson` |
| Coefficient-extraction sampling technique | Same pattern as `ode-direction-fields.js`'s `detectLinear` (not shared code — the technique, applied to a different shape) |

## Error handling

- Non-constant-coefficient or nonlinear input to the IVP walkthrough → honest refusal from
  `extractLinearCoeffs`, no solve attempt.
- SymPy `NotImplementedError` / parse failure (any of the three ops) → honest refusal message.
- Numeric verification failure → honest refusal, never shown as if correct.
- `DiracDelta`-containing transform inputs → shown with an explicit "not independently
  verified (distributional)" label, not a refusal and not a false "✓ verified".

## Testing

- Node-runnable unit tests for `laplace-engine.js`'s pure-JS logic (`extractLinearCoeffs`,
  `verifyTransformPair`, `verifyConvolution`) — the Pyodide/SymPy worker itself isn't
  Node-testable, verified manually in-browser, same constraint as Phase 1/2.
- Manual browser pass covering: transform/inverse pairs (including a `DiracDelta` case), the
  three worked-IVP textbook cases already validated against real SymPy this session, an
  order-3 IVP (generality check), a convolution pair, and a nonlinear/variable-coefficient
  equation rejected honestly by the coefficient extractor.
