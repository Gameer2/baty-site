# ODE Engine Phase 5c — Numerical PDE Schemes and CFL Stability — Design

**Context:** `CURRICULUM_ROADMAP.md` §5G item #23, P2, ⚪ Not started. Finite-difference schemes
(explicit FTCS, implicit BTCS, Crank-Nicolson) on the heat equation, with the CFL/von Neumann
stability condition made visible: "run the explicit scheme just past its stability limit and
let the solution visibly explode, next to the same problem solved implicitly and behaving...
the stability ratio must be on screen next to every numeric PDE answer, never buried." Suggested
reuse: `Algorithms.runFiniteDifference`'s grid machinery, `LinAlg.luDecompose`/`solveSystem` for
the implicit solves.

**Goal:** Add a "Numerical Schemes" section to the existing, already-shipped
`heat-equation.html` page (not a new page — this demonstrates stability behavior on a PDE
students already have the analytic answer for on that same page, which is the whole point: a
known-correct reference to diverge from or match). Three schemes, the CFL ratio always on
screen, and the explicit scheme's blow-up shown as the demonstration it is — not hidden as a
"failure."

## Verified this session

Explicit FTCS (`Uᵢⁿ⁺¹ = Uᵢⁿ + r(Uᵢ₊₁ⁿ−2Uᵢⁿ+Uᵢ₋₁ⁿ)`, `r=kΔt/Δx²`): accurate for `r=0.4` (matches
the analytic series solution to `~0.002`); at `r=0.9`, 60 steps, `max|U|` grows to `~4.9×10⁸` —
clearly, visibly exploded (at `r` just barely over `0.5`, growth is real but slow — floating-point
noise takes many steps to dominate, so demo chips should use `r` clearly past the limit, e.g.
`0.9`, not marginally past it, to make the point within a reasonable step count).

Implicit BTCS (`(1+2r)Uᵢⁿ⁺¹ − r(Uᵢ₊₁ⁿ⁺¹+Uᵢ₋₁ⁿ⁺¹) = Uᵢⁿ`, solved as a dense linear system each
step): accurate at `r=0.4`, `r=0.9`, **and `r=2.0`** — max error vs. the exact solution stays
`~0.004`–`0.009` throughout, confirming unconditional stability exactly where explicit diverges.

## Scope

- Applied to the heat equation only (`u_t=k·u_xx`), reusing the existing page's `L`, `k`,
  `f(x)`, `T` inputs — not a new PDE, not a new page.
- Three schemes: explicit FTCS, implicit BTCS, Crank-Nicolson (the average of explicit and
  implicit operators — also unconditionally stable, second-order accurate in time, the standard
  "best of both" scheme every numerical PDE course covers alongside the other two).
- A modest grid (`M=20`, matching Phase 5b's grid-size convention) — implicit/CN solves reuse
  `LinAlg.solveSystem` on a small dense tridiagonal-but-treated-as-dense system, exactly Phase
  5b's established pattern (`LinAlg.jacobi`/`gaussSeidel` there; direct solve here since a
  tridiagonal system solves exactly and fast, no relaxation needed).
- Out of scope: the wave equation's own CFL condition (`Δt≤Δx/c`) — this pass targets the heat
  equation specifically, matching how most intro courses introduce FTCS/BTCS/Crank-Nicolson.

## Architecture

**New pure-JS functions in `ode-symbolic.js`** (parallel to `heatSeriesValue`):
- `ODESymbolic.heatFTCS(f0Values, r, steps)` — explicit scheme, one array-length-`M+1` update
  per step (`f0Values`: the initial profile sampled at `M+1` grid points, endpoints already
  zero). Pure array arithmetic, no matrix needed.
- `ODESymbolic.heatBTCS(f0Values, r, steps)` — implicit scheme. Builds the dense
  `(M-1)×(M-1)` tridiagonal system (`1+2r` diagonal, `-r` off-diagonal) ONCE, reuses
  `LinAlg.solveSystem` (or `luDecompose` + back-substitution, to factor once and reuse across
  all `steps` — the system matrix doesn't change step to step, only the right-hand side) each
  step.
- `ODESymbolic.heatCrankNicolson(f0Values, r, steps)` — same tridiagonal structure with
  `1+r`/`-r/2` (implicit side) and `1-r`/`r/2` (explicit side, forming the right-hand side each
  step).
- All three return `{ profile, cflRatio: r, method }` after `steps` steps — the CFL ratio always
  travels with the result, per the roadmap's explicit "never buried" requirement.

**Page wiring (`ode-heat.js`, extended):** after the existing analytic solve, a new "Numerical
Schemes" panel lets the student pick a scheme and a `Δt` (or `r` directly), runs it, and plots
the result alongside the analytic series curve at the same final `t` — visually: explicit at
`r<0.5` tracks the analytic curve; explicit at `r>0.5` shows an exploded, clearly-wrong curve
next to the still-correct analytic one; implicit/Crank-Nicolson track the analytic curve at any
`r`. The CFL ratio is rendered as its own labeled stat, not buried in a caption.

## Reuse map

| Need | Reuse |
|---|---|
| Dense linear solve for the implicit/CN schemes | `LinAlg.solveSystem` (already built) |
| Grid/heatmap rendering conventions | The existing heat equation page's own Plotly setup |
| Reference answer to compare against | The page's own already-verified analytic series solution |

## Error handling

- Explicit scheme diverging past the CFL limit is NOT an error to catch and refuse — it is the
  demonstration. The page shows it plainly (with the CFL ratio labeled "> 1/2 — unstable"), never
  silently clips or hides the blown-up values.
- Implicit/Crank-Nicolson failing to solve (a degenerate `Δt`/grid combination) → honest refusal,
  same discipline as everywhere else.
- If `LinAlg.solveSystem` reports a singular/near-singular system, surface that, don't guess.

## Testing

- Node-runnable: `heatFTCS`, `heatBTCS`, `heatCrankNicolson` are pure JS (array arithmetic +
  `LinAlg.solveSystem`, already Node-tested) — fully Node-testable. Test against the *known
  exact* solution (`f0=sin(πx/L)`, single mode, exact decay `e^{-k(π/L)²t}`) at a stable `r` for
  all three schemes, and explicitly assert explicit diverges (`max|U|` grows) at `r=0.9` while
  implicit/CN stay bounded and accurate at the same `r`.
- Manual browser pass: run explicit at `r=0.4` (matches analytic) and `r=0.9` (visibly explodes,
  CFL ratio labeled unstable) next to implicit/CN at `r=0.9` (still matches analytic).
