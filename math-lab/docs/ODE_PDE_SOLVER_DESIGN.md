# ODE/PDE Engine — Solver Architecture

**Full rewrite, 2026-08-02.** This document originally specified a hand-rolled
classify-then-dispatch decision tree (§6/§7 below) as the target architecture. That target was
superseded during implementation: SymPy's `dsolve()` (via a Pyodide Web Worker) turned out to
classify and solve single ODEs and linear systems generically, far more completely than a
hand-written decision tree ever would, so Phases 1-3 built on that instead of the tree this
file originally specified. What follows describes the architecture as it actually shipped. The
vision in §1-5 (one big output panel, classification stated plainly, verified before shown,
numeric fallback as a legitimate answer not a failure) is unchanged and still governs every
page — only the *mechanism* for classification changed.

## 1. The vision, restated

Type an ODE, a system of ODEs, or a PDE. The engine figures out what kind of equation it is,
solves it by the correct classical method, and shows one output panel: classification, the
worked solution (steps, where the method has meaningful intermediate stages — see §6), and the
final answer. Never a bare plot standing in for an explanation; never an unverified answer
presented as fact.

## 2. Textbook basis

**Boyce & DiPrima, *Elementary Differential Equations and Boundary Value Problems***.
Chapters 1-9 are the ODE material; Chapters 10-11 (Fourier Series, PDEs) are the PDE material.
Grounding scope in one book's full table of contents — rather than a separate graduate PDE
text — matches what a single differential-equations course actually covers.

## 3. What changed vs. the pre-redesign engine

| | Pre-redesign (retired) | Current |
|---|---|---|
| Classification | A hand-written decision tree per equation family, ~2600 lines | SymPy's own `classify_ode()` (single ODEs, via `dsolve()`'s hint system) or a single deliberately-bounded hand-rolled check (systems' eigenvalue classification, §6 below) |
| Solving | Hand-derived, step by step, per branch | `dsolve()` generically; PDEs remain hand-rolled (§7) since `pdsolve()` is too immature for boundary-value problems |
| Verification | Ad hoc per branch, uneven coverage (a root cause of several historical bugs — see `ODE_PDE_ENGINE_PLAN.md` §7's changelog) | One general numeric-substitution verifier (`ODESolver.verifyNthOrder`/`verifyNthOrderAt`) reused everywhere, plus problem-specific techniques (trajectory integration, cross-checking two independent derivations) where substitution alone isn't sufficient — see `ODE_PDE_ENGINE_PLAN.md` §4 for a real example of why that distinction matters |
| Numeric fallback | Present (Euler/RK4), stays present, same role: a legitimate labeled answer when no closed form exists, never disguised as symbolic |

## 4. Architecture

```
  input text
      │
      ▼
  parse (math.js normal form; SymPy's own parser for the worker-side path)
      │
      ▼
  solve generically (dsolve(), or the bounded hand-rolled piece — §6/§7)
      │
      ▼
  verify independently (never trust the solve step blindly)
      │
      ▼
  render (classification line + solution + plot)
```

If the generic solve fails (SymPy raises `NotImplementedError`, or verification fails), the
page shows an honest refusal — never a guessed result — and, where a numeric fallback exists
(first-order ODEs via Euler/RK4), that fallback is offered, clearly labeled as numeric.

## 5. Output shape

Every page follows the same shape, adapted to what that method actually has to show:

1. **Classification line** — names the method and states "verified" or, where applicable, why
   it couldn't be independently verified (e.g. a `DiracDelta` transform, which isn't
   Riemann-integrable — labeled distributional, not silently claimed verified).
2. **Worked stages**, where the method has genuine intermediate algebra to show — the Laplace
   IVP walkthrough is the clearest example (transform → solve algebraically → invert, each
   stage rendered). Pages built directly on `dsolve()` show the classification and the final
   answer only; there's no meaningful hand-derivable intermediate step to display when SymPy
   itself is doing the algebra.
3. **General solution**, and the **particular solution** if initial/boundary conditions were
   given.
4. **Plot** — a curve, a phase portrait, or a heatmap/surface, depending on the equation.
5. **Fallback or refusal notice**, when applicable — always distinguishable from a confirmed
   result.

## 6. ODE architecture

**Single equations, any order** (`engines/ode/methods/ode-solver.html`): SymPy's `dsolve()`
handles classification and solving in one call, tagged with `classify_ode()`'s best-match hint
for the classification line. No decision tree — this is the entire point of Phase 1's
redesign. Verified by substituting the candidate (and its finite-differenced derivatives) back
into the original equation at a quorum of sample points (`ODESolver.verifyNthOrder`).

**Systems, `x' = Ax + g(t)`, any n×n** (`engines/ode/methods/systems.html`): same `dsolve()`
approach, generalized to a system. The **one deliberately hand-rolled piece in the whole
engine**: at n=2, the equilibrium at the origin is classified (node, saddle, improper node,
star node, spiral, or center) via the standard trace-determinant chart, computed directly from
`LinAlg.eigenvalues` — a single bounded geometric calculation, not a second classify-then-derive
tree. (At n≥3 the five-way split doesn't generalize; the page instead reports the general
Lyapunov-style stability read — asymptotically stable / unstable / saddle-type — from the sign
of the eigenvalues' real parts.)

**Laplace transforms** (`engines/ode/methods/laplace-transform.html`): NOT solved via
`dsolve()`. The transform-of-derivative property (`L{y⁽ⁿ⁾} = sⁿY(s) − Σsⁿ⁻¹⁻ᵏy⁽ᵏ⁾(0)`) is
applied directly (the literal definition, not a per-case branch) to build the s-domain
algebraic equation, `sp.solve()` solves it for `Y(s)`, and `sp.inverse_laplace_transform`
inverts it — genuinely staged algebra, shown as three explicit steps. Verified by forward
numerically integrating the *original* system from the given initial conditions (with the
standard jump condition applied at each Dirac impulse) and comparing the candidate against
that trajectory on both sides of every jump — substitution alone can't distinguish a correct
particular solution from a wrong one that solves the same equation with different initial
conditions (see `ODE_PDE_ENGINE_PLAN.md` §4 for the bug this discipline was built to catch).
The standalone transform/inverse-transform calculator and the convolution-theorem demo use
`sp.laplace_transform`/`inverse_laplace_transform` directly, verified against the defining
integral (or the direct convolution integral) numerically.

**Series solutions** (`engines/ode/methods/series-solutions.html`): `dsolve()`'s power-series
hints handle the ordinary-point and distinct-non-integer-root regular-singular-point cases
directly. For the two cases those hints get wrong (repeated indicial root, or roots differing
by an integer — confirmed against Bessel's equation that the hint silently returns only one of
two independent solutions), reduction of order is applied to the hint's own first solution: `y2
= y1·∫[e^(−∫(q/p)dx)/y1²]dx`. One technique, not two hand-coded branches — whether a log term
appears falls out of the integral automatically. Verified by checking the residual shrinks
toward the expansion point (a truncated series can never satisfy the ODE exactly away from
that point — only approximately, with the residual shrinking as the series' region of validity
is approached).

## 7. PDE architecture

None of the PDE pages call `pdsolve()` — it's too immature for boundary-value problems. All
four are hand-rolled numerics, following the classical separation-of-variables method directly:

**Heat equation** (`u_t = k·u_xx`, Dirichlet — `engines/ode/methods/heat-equation.html`):
separation of variables gives the eigenvalue problem in `x` (sine modes) and a decay ODE in
`t`; the initial profile is matched by its Fourier sine coefficients (`Algorithms.runSimpson`,
computed directly — no symbolic engine needed for a definite integral). A second panel adds
explicit (FTCS), implicit (BTCS), and Crank-Nicolson finite-difference schemes against the same
problem, with the CFL ratio `r = kΔt/Δx²` always shown and the explicit scheme's divergence
past `r=1/2` displayed plainly rather than hidden — the roadmap's own explicit requirement.

**Wave equation** (`u_tt = c²·u_xx`, Dirichlet — `engines/ode/methods/wave-equation.html`):
same eigenvalue problem, now with `Tₙ(t) = Aₙcos(nπct/L) + Bₙsin(nπct/L)` (`Aₙ` from the
initial position `f(x)`, `Bₙ` from the initial velocity `g(x)`, both Fourier sine
coefficients). Independently cross-checked against **d'Alembert's traveling-wave form**
(`u(x,t) = [F(x−ct)+F(x+ct)]/2 + (1/2c)∫F(x−ct)^(x+ct) G(s)ds`, the odd `2L`-periodic reflection
extension of `f`/`g`) — two independently derived solutions, shown only once they agree
numerically at a quorum of sample points. This is the two-views-of-one-solution teaching
moment the original design called for, achieved as a verification technique rather than a
separate rendering mode.

**Laplace's and Poisson's equations** (`u_xx+u_yy=0` / `=f(x,y)`, rectangle —
`engines/ode/methods/laplace-poisson.html`): Laplace's equation with Dirichlet data on up to
all four edges is solved by the classic sinh-series formula (one edge placement, applied via
coordinate relabeling to whichever edges are nonzero, summed) — mathematically the same idea as
the original design's "decompose by superposition" but implemented as repeated application of
one formula rather than four separately-coded sub-problems. Cross-checked against numeric
relaxation (`LinAlg.jacobi`/`gaussSeidel` on the standard 5-point stencil, `M=20` interior
grid) on the same rectangle. Poisson's equation (nonzero source, zero boundary) is relaxation
only, verified by substituting the converged solution back into the discrete equation.

**Numeric PDE schemes and CFL stability**: built into the heat equation page (see above) rather
than a separate page — explicit/implicit/Crank-Nicolson are a companion demonstration on a PDE
the page already has a trusted analytic answer for, which is the whole pedagogical point (a
known-correct reference to diverge from or match).

## 8. Numeric fallbacks

**ODE**: Euler and RK4 (`ode-symbolic.js`), unchanged from before the redesign — the direction
fields page. Still the fallback underneath every symbolic ODE solver, still clearly labeled as
numeric when it fires.

**PDE**: the explicit/implicit/Crank-Nicolson schemes in §7 aren't a fallback in the "no closed
form" sense — the heat equation always has the analytic series answer available too — they're
a deliberate second, numerical view of the same problem, specifically to make the CFL stability
condition visible and concrete rather than asserted.

## 9. Status

Complete. Every technique in §6 and §7 has shipped, is Node-tested where the Pyodide/SymPy
worker allows it (pure-JS verification and numeric logic), and has been manually verified in a
real browser. See `ODE_PDE_ENGINE_PLAN.md` for the current file/module map, the reuse map, and
the full phase-by-phase changelog.
