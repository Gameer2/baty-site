# ODE/PDE Engine — Build Plan

Everything needed to pick this engine up cold. **Full rewrite, 2026-08-02** — this file
previously described a hand-rolled classify-then-derive architecture that was retired in
stages across Phases 1-5 (see the Changelog below); everything past this point describes the
architecture as it actually ships today, not the historical one.

**Companion documents:**
- `ODE_PDE_SOLVER_DESIGN.md` — the architectural vision and both classification trees (ODE and
  PDE), also rewritten 2026-08-02 to match what actually shipped.
- `CURRICULUM_ROADMAP.md` §5 — the topic list, textbook basis (Boyce & DiPrima), and status per
  item; reconciled 2026-08-02 to mark every item this engine now covers as ✅ Built.
- Each phase's own plan doc under `docs/superpowers/plans/2026-08-0*-ode-engine-phase*.md` —
  the authoritative, detailed record of what each phase built, its design rationale, and its
  manual QA pass. This file gives the current-state summary; those give the full history.

## 1. Status: complete

Every phase of the redesign (1 through 6) has shipped. All Node test suites are green (see
§5). Every page has been manually verified in a real browser, including every bug found and
fixed during that verification (§4).

## 2. Architecture

**The governing principle:** SymPy's `dsolve()` (via a Pyodide/WebAssembly Web Worker,
`assets/js/sympy-worker.js`) does the algebra generically wherever it can. Nothing is
hand-classified into a decision tree the way the old architecture worked. The exceptions are
narrow, named, and each justified by something `dsolve()` genuinely cannot do:

| Hand-rolled piece | Why `dsolve()` alone doesn't cover it | Where |
|---|---|---|
| n=2 equilibrium classification (node/saddle/spiral/center) | A 2D geometric concept, not an algebraic one — reuses `LinAlg.eigenvalues` directly, not a second classify tree | `ode-systems.js` |
| Reduction of order for the second Frobenius solution | SymPy's `2nd_power_series_regular` hint returns only one of two independent solutions when the indicial roots are repeated or differ by an integer (confirmed against Bessel's equation) | `sympy-worker.js`'s `_series_solution` |
| Wave/Laplace/Poisson separation of variables | `pdsolve()` is too immature for boundary-value problems; these are pure numerics (Simpson's rule for Fourier coefficients, `LinAlg.jacobi`/`gaussSeidel` for relaxation) — no SymPy involved at all | `ode-symbolic.js`, `ode-poisson.js` |
| Explicit/implicit/Crank-Nicolson finite-difference schemes | Demonstrating the CFL stability condition requires the actual numerical schemes, not a closed form | `ode-symbolic.js` |

Every result — hand-rolled or `dsolve()`-derived — is independently verified numerically
before it is ever shown. The specific technique varies by what's being verified (substitution
into the original equation, forward trajectory integration from the given initial conditions,
cross-checking two independently-derived forms against each other, or comparing a relaxation
solve against its own discrete equation) — see each phase's plan doc for which technique it
uses and why.

## 3. Pages and modules

| Page | Pure-logic module(s) | What it solves |
|---|---|---|
| `engines/ode/methods/ode-solver.html` | `ode-solver.js` | Any single ODE, any order, via `dsolve()` |
| `engines/ode/methods/systems.html` | `ode-systems.js` | `x' = Ax + g(t)`, any n×n; n=2 gets equilibrium classification + phase portrait |
| `engines/ode/methods/laplace-transform.html` | `laplace-engine.js` | Forward/inverse transform calculator, staged IVP walkthrough (any order, incl. `Heaviside`/`DiracDelta` forcing), convolution theorem |
| `engines/ode/methods/series-solutions.html` | (worker-side, `_series_solution`) + `series-solution-fallback.js` | Power series around an ordinary or regular singular point, all 3 Frobenius cases |
| `engines/ode/methods/heat-equation.html` | `ode-symbolic.js` (`solveHeatEquation`, `heatFTCS`/`heatBTCS`/`heatCrankNicolson`) | `u_t = k·u_xx`, Dirichlet; analytic series plus a numerical-schemes/CFL panel |
| `engines/ode/methods/wave-equation.html` | `ode-symbolic.js` (`solveWaveEquation`, `waveSeriesValue`, `dAlembertValue`) | `u_tt = c²·u_xx`, Dirichlet; standing-wave series cross-checked against d'Alembert's traveling-wave form |
| `engines/ode/methods/laplace-poisson.html` | `ode-poisson.js` | Laplace's equation (sinh-series + relaxation, cross-checked) and Poisson's equation (relaxation, residual-verified) on a rectangle |
| `engines/ode/methods/fourier-series.html` | `calculus-symbolic.js` (`fourierSeries`) | Full/half-range Fourier series — prerequisite for the PDE pages |
| `engines/ode/methods/direction-fields.html` | `ode-symbolic.js` (`eulerRK4FirstOrder`) | Euler vs. RK4 comparison — the numeric fallback underneath every symbolic solver above |

`ode-solver.js` is the shared substitution-verification primitive (`compileRealFx`,
`withArbitraryConstants`, `toPlaceholdersGeneral`, `detectOrder`, `verifyNthOrder`/
`verifyNthOrderAt`) — every other module reuses it rather than reimplementing expression
compilation or numeric verification.

## 4. Bugs found and fixed during the Phase 6 browser verification pass

The implementation-plan browser QA steps for Phases 3-5c were deferred during initial
development; this cleanup pass ran them for real and found (and fixed) three genuine bugs,
all now covered by regression tests:

1. **Symbol-identity bug in the Laplace worker** (`sympy-worker.js`) — the shared
   `_LAPLACE_LOCALS_X`/`_LAPLACE_LOCALS_S` dicts defined `x`/`s` without `positive=True`, but
   every consumer function declared its own local `positive=True` versions. SymPy treats
   differently-assumed symbols with the same name as distinct objects, so
   `sp.laplace_transform`/`inverse_laplace_transform` never found the transform variable inside
   the parsed expression at all — `L{e^{-2x}}` returned `exp(-2*x)/s` instead of `1/(s+2)`.
2. **A verification blind spot this exposed** — `ODESolver.verifyNthOrder`'s fixed sample
   points (`[0.37, 0.83, 1.29, 1.71, 2.13, -0.61, -1.47]`) never test past a
   `Heaviside`/`DiracDelta` jump located further out, and substitution-only verification can't
   distinguish a correct particular solution from a wrong one that happens to solve the same
   differential equation with different initial conditions. `y''+y=Heaviside(x-3)` showed a
   wrong answer (missing the `x-3` shift) as "✓ verified". Fixed by
   `LaplaceEngine.verifyIvpTrajectory` — forward RK4 integration of the actual system from the
   given initial conditions (with the standard jump condition applied at each Dirac impulse
   location), compared against the candidate on both sides of every jump.
3. **Two cosmetic rendering bugs** — the IVP walkthrough's "Transform:" stage showed the
   literal text `Eq(...)` (math.js doesn't know what `Eq` means); the Poisson page's caption
   used `\times` inside a `\text{}` block, invalid in KaTeX.

All three are fixed, regression-tested, and re-verified live in a browser. See
`docs/superpowers/plans/2026-08-02-ode-engine-phase3-laplace.md`'s git history for the exact
commits.

## 5. Testing

```bash
cd math-lab
for t in verify-ode.js verify-ode-solver.js verify-ode-systems.js verify-laplace-engine.js \
         verify-ode-poisson.js; do
  echo "$t: $(node tests/$t | tail -1)"
done

# serve (required — Workers, including the SymPy/Pyodide one, do not run over file://)
python3 -m http.server 8000
```

The Pyodide/SymPy worker (`sympy-worker.js`) cannot be exercised from the Node test suite — no
`pyodide` npm package in this repo, deliberately (see §6). Every page that depends on it is
verified manually in a real browser; every *pure*-JS piece (verification, coefficient
extraction, numeric schemes, trajectory integration) is Node-tested.

`tests/bench/corpus-engines.js`'s ODE corpus section (a separate, broader coverage-benchmark
harness, distinct from the suites above) cannot invoke `ODESolver.solve()` for the same reason
— it now reports this honestly (`UNVERIFIABLE` with an explicit note) instead of the
`classifyFirstOrder`/`classifySecondOrder`-based approach it used before Phase 1, which would
have silently reported 100% failure. Running that corpus for real against the current
architecture would need a Node-compatible Pyodide runtime — real, separate infrastructure work,
not attempted here. Its PDE and Complex corpus sections are unaffected and fully functional.
The PDE corpus's `laplace`/`poisson`/`wave`/`numerical-pde` entries are still correctly marked
`implemented:false` (`MISSING`) — Phase 5 built those pages with their own dedicated Node test
coverage (`verify-ode.js`, `verify-ode-poisson.js`), but nobody has written this *separate*
corpus-style four-part verifier (residual, boundary conditions, initial condition, convergence)
for them yet. A legitimate follow-up, not attempted this pass.

## 6. Reuse map

| Need | Reuse |
|---|---|
| Any single ODE, any order | SymPy `dsolve()` via the Pyodide worker |
| Systems `x' = Ax`, eigenvalue-based classification | `LinAlg.eigenvalues`, `eigenvectorsFor` |
| Relaxation solve (Laplace/Poisson, implicit PDE schemes) | `LinAlg.jacobi`, `gaussSeidel`, `solveSystem` |
| Fourier/sine coefficients (heat/wave/Laplace pages) | `Algorithms.runSimpson` (direct in `ode-symbolic.js`, not through the Calculus Engine — these are plain definite integrals) |
| Fourier series (the standalone method page) | `CalculusSymbolic.fourierSeries` |
| Expression compilation / numeric verification | `ODESolver.compileRealFx`, `withArbitraryConstants`, `verifyNthOrder`/`verifyNthOrderAt` — reused directly by `laplace-engine.js`, `ode-systems.js`, `series-solution-fallback.js` |
| PDE solution surfaces | Plotly heatmaps (matching the heat equation page's original convention) — `Scene3D`'s 3D surface treatment remains a possible future enhancement, not attempted |

## 7. Changelog

Full detail lives in each phase's own plan doc (`docs/superpowers/plans/`); this is a
compressed index.

- **2026-07-22 to 2026-07-30** — pre-redesign hand-rolled engine (classify tree,
  BigInt-exact-arithmetic layer, Phase 0 bug fixes). Entirely retired by Phase 1; no longer
  described here. See git history (`docs/superpowers/plans/2026-08-01-ode-engine-phase1-general-solver.md`'s
  own retrospective) if the old architecture's rationale is ever needed.
- **2026-08-01 — Phase 1.** Replaced the hand-rolled classify-then-derive pipeline with one
  general `dsolve()` path (`ode-solver.js`), verified by numeric substitution. Deleted
  `classifyFirstOrder`/`classifySecondOrder` and ~2600 lines of supporting code.
- **2026-08-02 — Phase 2.** Systems of ODEs, `x' = Ax + g(t)`, any n×n; n=2 equilibrium
  classification via `LinAlg.eigenvalues`.
- **2026-08-02 — Phase 3.** Real Laplace transform engine (`laplace-engine.js`): forward/inverse
  calculator, staged IVP walkthrough, convolution theorem. Deleted `sympy-dsolve-fallback.js`
  and the `ODESymbolic` parsing helpers only it used.
- **2026-08-02 — Phase 4.** Closed the Frobenius gap for real via reduction of order — repeated
  and integer-difference indicial-root cases now get a genuine second solution instead of an
  honest refusal.
- **2026-08-02 — Phase 5.** Wave equation (5a, standing-wave series cross-checked against
  d'Alembert's form), Laplace's/Poisson's equations (5b, sinh-series + relaxation), numerical
  PDE schemes and CFL stability (5c, on the heat equation page).
- **2026-08-02 — Phase 6.** This cleanup pass: found and fixed the three bugs in §4 during the
  manual browser QA every prior phase's plan had deferred; fixed `tests/bench/corpus-engines.js`'s
  ODE section (§5); rewrote this file and `ODE_PDE_SOLVER_DESIGN.md`; reconciled
  `CURRICULUM_ROADMAP.md` §5.
