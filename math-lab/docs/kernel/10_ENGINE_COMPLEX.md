# 10 — Complex Analysis Engine: Symbolic Requirements

**Textbook basis:** Churchill & Brown, *Complex Variables and Applications*, cross-checked against
Gamelin. Scope is a standard one-semester junior/senior course.
**Current state (updated 2026-08-01):** all six phases of the engine's plan are now built —
**12 method pages** live (arithmetic, functions/domain-colouring, Cauchy–Riemann, harmonic
conjugates, exp/log/powers, trig/hyperbolic, contour integration & residues, the Cauchy integral
formula, Laurent series & singularity classification, real integrals by residues, the argument
principle & Rouché, conformal/Möbius mapping) plus three three.js prototypes. The branch-sensitive
work (residues, contour integration, Laurent series, real integrals) was built by routing through
the Pyodide-SymPy worker for the branch-correct symbolic answer and independently verifying each
result numerically, rather than blocking on the hand-rolled L1 assumptions layer — see §3a below
for why this is sound and what the residual debt is. The Cauchy integral formula and the argument
principle & Rouché pages need no SymPy: both reuse the contour machinery (adaptive Gauss–Kronrod
quadrature, the circle parametrization) exported from `complex-residues.js` via a new
`complex-contour-theorems.js` module, and verify by two independent numeric checks (two-radius
contour independence for CIF; winding-number vs logarithmic-derivative integral for the argument
principle). Tested by `tests/verify-complex.js`, `verify-complex-symbolic.js`, `verify-complex-residues.js`
(27 cases), `verify-contour-theorems.js` (49 cases), `verify-mobius.js` (36 cases),
`verify-domain-coloring.js`, `verify-cas-worker.js`.

---

## 1. The defining hazard: branch cuts

`CURRICULUM_ROADMAP.md` §8 already states it exactly right:

> *"Branch cuts are a **correctness** hazard, not a display one — a naive `log`/`sqrt` silently
> picks a branch and is wrong by 2πi."*

**This is an assumptions problem, and it is the third independent argument for building L1 first.**

The same root cause produced the measured calculus failures: `∫x²/√(x²−9)` returned an expression
containing `sqrt(-9)` because the system applied the `√(a²−x²)` substitution family to an
`√(x²−a²)` integrand. It had no way to know `x>3`.

**Therefore: the complex engine must not be built out before Phase 1.** Building residues and
contour integration on a system that guesses branches bakes 2πi errors into results that *look*
plausible and pass pointwise numeric checks.

Nerdamer's underlying complex arithmetic is fine — `sqrt(-9)→3i`, `i²→−1`, `1/sqrt(-1)→−i` all
measured correct. The gap is not arithmetic; it is **knowing which branch is intended**.

---

## 2. Current API

`complex-symbolic.js` exposes:
```
  cauchyRiemann      decompose      harmonicConjugate      configure
```

`complex-residues.js` (the shared residue-theorem module, reused by the planned ODE Laplace page) exposes:
```
  findSingularitiesWithResidues   contourIntegral   numericContourIntegral
  classify                         laurentSeries     classifySingularity
  realIntegralByResidues           numericRealIntegral
```

`mobius.js` (pure Complex-arithmetic core, no CAS) exposes: `apply`, `classify` (fixed points /
pole / multiplier / geometric type), `fixedPoints`, `fmt`.

`complex-contour-theorems.js` (the Cauchy integral formula + argument principle / Rouché module,
no CAS — reuses `complex-residues.js`'s adaptive Gauss–Kronrod quadrature, circle parametrization,
and `e^z`→`exp(z)` normalizer) exposes:
```
  cauchyIntegralFormula   windingNumber   logDerivativeIntegral
  argumentPrinciple       rouche          sampleImage
```

Plus `complex.js`, `complex-arithmetic.js`, `complex-functions.js`, `complex-exp-log-powers.js`,
`complex-trig-hyperbolic.js`, `cauchy-riemann.js`, `harmonic-functions.js`, `domain-coloring.js`,
`complex-contour-integration.js`, `complex-cauchy-integral-formula.js`, `laurent-singularities.js`,
`real-integrals-residues.js`, `complex-argument-rouche.js`, `mobius-mapping.js`.

---

## 3. Phase map (from the engine's own plan)

| Phase | Topics | Priority | Kernel dependency |
|---|---|---|---|
| 1 ✅ | Complex arithmetic · complex functions & **domain colouring** · analyticity & Cauchy–Riemann · harmonic functions | P0 | partial derivatives |
| 2 ✅ | exp/log/powers & **branch cuts** · complex trig & hyperbolic | P1 | **assumptions** |
| 3 ✅ | Contour integration · Cauchy–Goursat · Cauchy integral formula | P0 | integration + parametrisation |
| 4 ✅ | Taylor in ℂ · **Laurent series** & singularity classification | P1 | **series machinery** |
| 5 ✅ | Residues · **real integrals by residues** · argument principle & Rouché | P0 | series + poles |
| 6 ✅ | Conformal mapping · Möbius · Schwarz–Christoffel (P3) | P2 | rewrite engine |

> Phases 3–6 were built 2026-07-30. Argument principle / Rouché (Phase 5) and
> Schwarz–Christoffel (Phase 6) are the two Phase-5/6 topics **not** yet given a page — see the
> "still open" list below.

## 3a. How the branch-cut hazard was actually resolved

§1 below argues the engine must not be built before a hand-rolled L1 assumptions layer, because a
system that guesses branches bakes 2πi errors into plausible-looking results. That argument is
still correct in principle — but the shipped Phases 3–6 resolved it a different, sound way:

- **Branch-sensitive symbolic answers go through SymPy** (Pyodide, via `sympy-worker.js`), which
  tracks principal branches correctly — `sp.residue`, `sp.series`, `sp.singularities` all use the
  principal branch consistently. nerdamer (which the §1 hazard was measured on) is **not** used for
  any branch-sensitive complex answer; it is only used where its arithmetic is provably fine
  (evaluating real integrands numerically, real/imag decomposition at the `decompose` level).
- **Every branch-sensitive answer is independently re-verified numerically** before it is shown:
  `contourIntegral` walks the actual contour with Simpson and refuses if the residue-theorem
  prediction disagrees; `realIntegralByResidues` integrates the original real integral directly
  (tangent substitution) and refuses on disagreement; `classifySingularity` is limit-based, not
  series-based, precisely because `sp.series` is unreliable on essential singularities.
- **Refusal is first-class**: a REFUSED→WRONG result is always a regression, and the verify gate
  means a wrong branch produces a *refusal*, not a silently-wrong number.

**Residual debt (unchanged from the original warning):** the Phase 1/2 exp/log/powers *page* work
predates the assumptions layer and picks the principal branch explicitly on-screen rather than
from assumptions. It is correct for the principal branch but cannot state *which* branch a user
means. Re-validating it against L1 assumptions when that layer lands is still the right move; it
just no longer blocks the rest of the engine.

---

## 4. Capability requirements

| Capability | Depends on | Phase | Notes |
|---|---|---|---|
| Branch-correct `log`, `sqrt`, `z^a` | **assumptions** | 1, 7 | Track the cut explicitly; never guess |
| Cauchy–Riemann verification | partial derivatives | done | Built |
| Harmonic conjugates | partial derivatives + integration | done | Built; links to PDE Laplace equation |
| Contour integration | integration + parametrisation | 7 | Verify with numeric Simpson |
| Cauchy–Goursat, Cauchy integral formula | contour integration | 7 | |
| Taylor series in ℂ | series | 4 | Reuses `CalculusSymbolic.taylorSeries` |
| **Laurent series** | series | 4 | **Laurent = Taylor + principal part** |
| Singularity classification | Laurent | 4 | Removable / pole of order n / essential |
| **Residues** | Laurent + limits + **poles** | 5, 7 | Residue = Laurent `c₋₁`; poles need polynomial algebra |
| Residue theorem | residues | 7 | |
| **Real integrals by residues** | residue theorem | 7 | **The payoff** — cross-links to Calculus §2 #7 |
| Argument principle, Rouché | residues | 7 | |
| Conformal / Möbius | rewrite engine | 7 | |

---

## 5. Why this engine is cheap once the kernel exists

The engine's own plan already identifies the reuse, and it is extensive:

| Need | Reuse | Status |
|---|---|---|
| Laurent = Taylor + principal part | `CalculusSymbolic.taylorSeries` | ✅ exists |
| Radius of convergence | `CalculusSymbolic.powerSeries` | ✅ exists |
| Pole location | `LinAlg.polynomialRoots` | ✅ exists, **already returns complex roots** |
| Complex arithmetic | `LinAlg`'s internal `cx` helper | ✅ exists — **should be promoted to a shared module** |
| Contour-integral verification | `Algorithms.runSimpson` | ✅ exists |
| \|f(z)\| surfaces | `Scene3D` | ✅ exists |
| Worker hosting | `cas-worker` harness | ✅ exists |

**Almost every primitive already exists.** What is missing is branch correctness (Phase 1) and
Laurent series (Phase 4). This is why Phase 7 is short despite covering a whole course.

---

## 6. The distinctive product contribution

`f: ℂ → ℂ` has a 4-dimensional graph and cannot be drawn as a curve or a surface. **That is the
difficulty of the subject**, and it is a visualisation problem no symbolic engine solves.

**Domain colouring** (hue = `arg f(z)`, brightness = `|f(z)|`) makes zeros and poles unmistakable,
and their *order literally countable* as hue cycles. Combined with before/after conformal grid maps
and animated contour traversal, this is genuinely better than what Mathematica shows a student —
and it is a place where you can win on the visual rather than the symbolic axis.

Known implementation risk from the engine plan: domain colouring is per-pixel and may need a raw
`<canvas>` rather than Plotly.

---

## 7. Validation

| Result | Check | Status |
|---|---|---|
| Residue | SymPy `sp.residue` **vs.** numeric contour integral ÷ 2πi — two independent routes must agree | ✅ `contourIntegral` refuses on disagreement; `verify-complex-residues.js` exercises the numeric side |
| Contour integral | Numeric Simpson along the parametrised path | ✅ `numericContourIntegral` |
| Real integral by residues | Numeric quadrature of the original **real** integral (tangent substitution x = tan θ) | ✅ `numericRealIntegral`, 1e-6–1e-15 relerr |
| Singularity classification | Limit definitions (removable / pole order m / essential), not a series parse | ✅ `classifySingularity` (limit-based; `sp.series` is unreliable on essentials) |
| Laurent series | Truncated series vs. `f` in the annulus of convergence | ⚠️ displayed only; not yet a standing numeric-equality test |
| Cauchy–Riemann | Central differences of `u` and `v` | ✅ Built |
| Harmonic conjugate | Verify `∇²u = 0` and `∇²v = 0` numerically | ✅ Built |
| **Branch correctness** | Evaluate on **both sides of the cut**; confirm the 2πi jump is where it should be, and only there | ⚠️ standing test not yet added — see debt note in §3a |

That last row is the one that catches the hazard this engine is built around. **Make it a standing
test, not a one-off**: for every multivalued function the engine exposes, assert the discontinuity
location and magnitude explicitly.

## 7a. Still open (after the 2026-07-30 build-out)

- **Argument principle & Rouché** (Phase 5) — no page yet. Cheap once residues exist: argument
  principle = (1/2πi)∮ f'/f = zeros−poles, reusing `findSingularitiesWithResidues` + a numeric
  f'/f contour integral. Rouché follows.
- **Schwarz–Christoffel** (Phase 6, P3) — no page; the one genuinely hard conformal map (the
  Schwarz–Christoffel parameters are a nonlinear system). Möbius is done; this is the P3 tail.
- **Branch-cut standing test** (§7 last row) — not yet a regression test. The exp/log/powers page
  states the principal branch and lists every other branch cross-checked against e^value = z, but
  there is no automated "discontinuity is exactly at the cut, magnitude 2πi" assertion across the
  multivalued-function set.
- **Cauchy–Goursat / Cauchy integral formula** — Phase 3 lists these; the contour-integration page
  covers the residue-theorem core but a dedicated Cauchy-integral-formula page (f(z₀) = (1/2πi)∮f/(z−z₀))
  is not separately built; it would reuse `numericContourIntegral` + `findSingularitiesWithResidues`.

---

## 8. Gates specific to this engine

| Phase | Complex-specific gate | Status |
|---|---|---|
| 1 | Branch of `log`/`sqrt`/`z^a` determined by assumptions; discontinuity is exactly at the declared cut | ⚠️ principal branch stated explicitly; full assumptions-driven branch not yet |
| 1 | Existing Phase-1/2 exp/log/powers work **re-validated** against the assumptions layer | ⚠️ open (debt note §3a) |
| 4 | Laurent expansion with correct principal part; singularity classification correct on the corpus | ✅ classification limit-based & tested; ⚠️ Laurent series not a standing numeric-equality test |
| 7 | Residues agree via both routes (SymPy `sp.residue` and numeric contour) | ✅ `contourIntegral` verify gate |
| 7 | **`∫₀^∞ dx/(1+x²)` by residues**, correct branch | ✅ `realIntegralByResidues` half-line mode gives π/2, verified |
| 7 | Zero branch-cut errors across the complex corpus | ⚠️ standing branch test not yet added |
