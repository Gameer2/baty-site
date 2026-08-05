# ODE Engine Phase 5b — Laplace's and Poisson's Equations — Design

**Context:** `CURRICULUM_ROADMAP.md` §5G item #22, P2, ⚪ Not started. `u_xx+u_yy=0` (Laplace,
steady-state) on a rectangle with Dirichlet boundary data, by separation of variables; Poisson's
`u_xx+u_yy=f(x,y)` numerically. The roadmap explicitly flags reuse: `LinAlg.jacobi`/
`LinAlg.gaussSeidel` (both already built) for the relaxation solve.

**Goal:** One page, two equations. Laplace: solved TWO independent ways — the classic
separation-of-variables sinh-series (for Dirichlet data nonzero on one or more of the four
edges), and numeric relaxation — cross-checked against each other (same discipline as Phase 5a's
wave equation: two independent derivations agreeing IS the verification). Poisson: relaxation
only (no closed form attempted, matching the roadmap's own framing "numerically"), verified by
its discrete residual.

## Verified this session (pure numerics)

Classic single-edge Dirichlet case (`u=0` on three sides, `u(x,b)=f(x)` on the fourth):
`u(x,y) = Σ cₙsin(nπx/a)sinh(nπy/a)`, `cₙ = [2/(a·sinh(nπb/a))]∫f(x)sin(nπx/a)dx`. Cross-checked
against Jacobi relaxation on a 40×40 grid: agreement to `~2e-5`–`4e-5` (matches expected
discretization error).

Poisson relaxation, validated against a KNOWN exact solution (`u=sin(πx/a)sin(πy/b)`, with the
matching source `F` derived analytically): numeric relaxation matched the exact solution to
`~2e-4`–`5e-4` on a 40×40 grid (standard `O(h²)` error) — confirms the discretization and
relaxation loop are correct, independent of any curve-fitting to the boundary-only case above.

## Scope

- Rectangle domain `[0,a]×[0,b]` only.
- **Laplace section:** Dirichlet data on up to all four edges (each edge independently zero or a
  typed function), solved by superposition of the single-edge sinh-series formula applied once
  per nonzero edge (a coordinate relabeling of the same formula, not four separate derivations),
  summed. Cross-verified against numeric relaxation on the same rectangle.
- **Poisson section:** zero Dirichlet boundary, nonzero source `f(x,y)` typed as an expression in
  `x,y`. Relaxation only. Verified two ways: (1) the discrete 5-point-stencil residual at
  interior grid points against the typed `f(x,y)`, directly — the strongest, most direct check;
  (2) Jacobi and Gauss-Seidel independently converge to the same answer, shown as a secondary
  confidence indicator.
- Grid resolution: a modest `M×M` interior grid (`M=20`, 400 unknowns) so the linear system
  built for `LinAlg.jacobi`/`gaussSeidel` (dense, matching how every other `LinAlg` consumer on
  this site already uses it) stays small and fast — a teaching-app resolution, not a
  high-fidelity simulation.
- Out of scope: non-rectangular domains, Neumann/mixed boundary conditions, nonzero-boundary
  Poisson (would need superposing the Laplace solve on top — a natural follow-on, not this pass).

## Architecture

**New pure-JS module (`ode-poisson.js`, parallel to how `ode-symbolic.js` holds the heat/wave
solvers, but large enough — matrix construction, two solve modes — to warrant its own file per
this project's "one clear responsibility per file" convention):**

- `PoissonEngine.laplaceSeriesValue(edges, a, b, x, y)` — `edges`: `{bottom, top, left, right}`,
  each either `null` or `{coeffs}` (the sinh-series coefficients for that edge, precomputed).
  Sums each edge's contribution (coordinate-relabeled sinh-series term).
- `PoissonEngine.solveLaplaceEdges({a, b, bottomExpr, topExpr, leftExpr, rightExpr, N})` —
  computes coefficients for each nonzero edge via the same Simpson-integral pattern as
  `solveHeatEquation`/`solveWaveEquation`.
- `PoissonEngine.buildGridSystem({a, b, M, boundaryFn, sourceFn})` — builds the dense `A`, `b`
  for the interior `(M-1)×(M-1)` unknowns via the standard 5-point stencil (`4u_{i,j} -
  u_{i+1,j} - u_{i-1,j} - u_{i,j+1} - u_{i,j-1} = -h²f(x_i,y_j)`, boundary-adjacent points fold
  known boundary values into `b`). Row index `= (i-1)*(M-1) + (j-1)` for interior indices
  `i,j ∈ [1, M-1]`.
- `PoissonEngine.solveGrid(A, b, method)` — thin wrapper: `method === "jacobi" ? LinAlg.jacobi(A,
  b, ...) : LinAlg.gaussSeidel(A, b, ...)`, reshapes the flat solution vector back into a 2D
  grid.
- `PoissonEngine.gridResidual(U, h, sourceFn)` — the discrete-stencil residual check for Poisson:
  `(U[i+1][j]+U[i-1][j]+U[i][j+1]+U[i][j-1]-4U[i][j])/h² - f(x_i,y_j)` at interior points, same
  quorum/tolerance pattern used everywhere else on this site.

**New page (`engines/ode/methods/laplace-poisson.html`) + wiring
(`assets/js/laplace-poisson-page.js`):** two sections (Laplace / Poisson), each with a rectangle
heatmap (Plotly, matching the heat/wave pages' convention) and a verification status line naming
which cross-check passed.

## Reuse map

| Need | Reuse |
|---|---|
| Fourier sine coefficients for each Laplace edge | Same Simpson-integral pattern as `solveHeatEquation`/`solveWaveEquation` |
| Dense linear system solve (both equations' relaxation) | `LinAlg.jacobi`, `LinAlg.gaussSeidel` (already built, exactly the roadmap's own suggestion) |
| Heatmap rendering | The heat/wave pages' existing Plotly conventions |

## Error handling

- Laplace: if the series-vs-relaxation cross-check disagrees beyond tolerance, refuse honestly.
- Poisson: if the discrete residual check fails, refuse honestly. If `LinAlg.jacobi`/
  `gaussSeidel` fail to converge within their iteration budget (both already report this),
  surface that as a refusal too, not a silently wrong answer.

## Testing

- Node-runnable: `laplaceSeriesValue`, `buildGridSystem`, `gridResidual` are pure JS, no
  Pyodide/CAS-worker dependency — fully Node-testable (same as Phase 5a). `solveLaplaceEdges`
  and `solveGrid` are also pure JS (Simpson + `LinAlg`, both already Node-tested elsewhere) —
  Node-testable too, unlike Phases 1-4.
- Manual browser pass: single-edge Laplace (cross-check must pass), multi-edge Laplace, Poisson
  with a source matching a known exact solution (residual + Jacobi/Gauss-Seidel agreement must
  both pass, and the displayed surface should visually match the known exact solution's shape).
