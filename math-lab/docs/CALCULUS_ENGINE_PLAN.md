# Calculus Engine — Build Plan

Everything needed to pick this engine up cold and keep building it.

**Scope of this file:** the Calculus Engine only. The cross-engine feature backlog lives in
`CURRICULUM_ROADMAP.md` §2 (topic descriptions, priorities, textbook basis); the project's
engineering foundation lives in `../../FOUNDATION_CHECKLIST.md`. This file is the *how* —
architecture, hard-won facts about the tooling, and the per-topic build order.

Last updated: 2026-07-22 (Multiple Integrals and Lagrange Multipliers shipped — Phase 4 is now
complete. Multiple Integrals: double integrals over a Cartesian Type I region or a polar
region, two nested antiderivatives evaluated by substitution and checked against an
independent nested-Simpson double integration, drawn via the new
`Scene3D.addParametricSurface`. Lagrange Multipliers: constrained optimization solved
numerically — nerdamer's own system solver was tried and rejected (inexact and incomplete even
on the textbook circle case) — via a multi-start finite-difference Newton search, each
candidate verified by an independent directional-derivative-along-the-curve check.)

---

## 1. The one thing that makes this engine different

Every other engine in the Lab approximates. Numerical Engine's core idiom is *iterate →
tabulate → converge*, and its shared module returns arrays of per-iteration objects.

**The Calculus Engine is symbolic.** It produces exact closed forms — `1/2`, `e`,
`(-1/2)*cos(x^2)` — and the derivation that produced them. Its shared module returns
`{ok, value/result, latex, steps[], verified}`, not iteration arrays. This is why
`calculus-symbolic.js` exists separately from `algorithms.js` and must stay separate.

Corollary for the UI: the numerical pages' iteration table + step slider becomes a
**derivation ladder** — one rule-annotated line per step, revealed in sequence. Same
`.data-table` + `#stepSlider` + `.is-current` machinery, different semantics: scrubbing walks
an argument, not successive approximations.

Two exceptions that are numeric on purpose and belong in `algorithms.js`, not here:
Riemann sums (the *definition* of the integral) and any numeric evaluation used for
verification or plotting.

### The verification gate — non-negotiable

A symbolic engine can be confidently, invisibly wrong in a way a numerical one cannot.
nerdamer will return an `erf` expression containing `i` for `∫e^(x²)dx` and look completely
sure of itself. So:

> Every symbolic result is checked before it is returned. An antiderivative is differentiated
> back and compared numerically against the integrand; a limit is checked against a two-sided
> numeric probe. On failure the engine returns `ok:false` **and no formula**.

"This is not a u-substitution problem" and "the limit does not exist" are **first-class
results**, not error states. They render as answers, with the evidence that produced them.

---

## 2. Current state

### Built and tested

| Thing | Path | Notes |
|---|---|---|
| Method catalog | `engines/calculus/methods.html` | 25 cards (26 with Fourier) |
| Limits | `engines/calculus/methods/limits.html` + `assets/js/limits.js` | exact values, L'Hôpital, DNE detection, approach table |
| L'Hôpital's Rule | `engines/calculus/methods/lhopital.html` + `assets/js/lhopital.js` | symbolic — `CalculusSymbolic.lhopital()`, own indeterminate-form classifier, refuses non-indeterminate quotients |
| Curve Sketching | `engines/calculus/methods/curve-sketching.html` + `assets/js/curve-sketching.js` | `CalculusSymbolic.curveAnalysis()` — f/f'/f'' linked plots, exact roots only when trustworthy, numeric bisection fallback otherwise |
| Applied Optimization | `engines/calculus/methods/applied-optimization.html` + `assets/js/applied-optimization.js` | `CalculusSymbolic.appliedOptimization()` — Extreme Value Theorem, candidates + endpoints |
| u-Substitution | `engines/calculus/methods/u-substitution.html` + `assets/js/u-substitution.js` | candidate search, refusal panel |
| Integration by Parts | `engines/calculus/methods/integration-by-parts.html` + `assets/js/integration-by-parts.js` | `CalculusSymbolic.integrationByParts()` — LIATE split, one-level decomposition (nerdamer's `integrate()` absorbs the second round), differentiate-back check, refusal panel |
| Partial Fractions | `engines/calculus/methods/partial-fractions.html` + `assets/js/partial-fractions.js` | `CalculusSymbolic.partialFractions()` — `partfrac()` does the decomposition (irreducible-quad, repeated, improper long-division); product-tree `splitRational` detector because nerdamer normalizes `/` to `^(-1)`; differentiate-back check, refusal panel |
| Trigonometric Substitution | `engines/calculus/methods/trigonometric-substitution.html` + `assets/js/trigonometric-substitution.js` | `CalculusSymbolic.trigSubstitution()` — recognises the three radical forms, Pythagorean-identity + reciprocal-power θ-integrand cleanup, composition simplifier for display, finite-difference verify gate, refusal panel |
| Riemann Sums | `engines/calculus/methods/riemann-sums.html` + `assets/js/riemann-sums.js` | numeric — `Algorithms.runRiemannSum` in `algorithms.js`, not the symbolic core |
| Taylor Series | `engines/calculus/methods/taylor-series.html` + `assets/js/taylor-series.js` | symbolic — `CalculusSymbolic.taylorSeries()`, verified against f(a) and a numeric neighborhood check |
| Convergence Tests | `engines/calculus/methods/convergence-tests.html` + `assets/js/convergence-tests.js` | symbolic — `CalculusSymbolic.convergenceTests()` — the 8-test decision tree (nth-term, geometric, p-series, integral, (limit-)comparison, ratio, root, alternating); partial-sum verification gate; honest refusal when no test is conclusive |
| Power Series & Radius | `engines/calculus/methods/power-series.html` + `assets/js/power-series.js` | symbolic — `CalculusSymbolic.powerSeries()` — radius from ratio/root test on the coefficients, endpoints classified by reusing convergenceTests, interval assembled (incl. R=0, R=∞); any centre a |
| Vectors in Space | `engines/calculus/methods/vectors-in-space.html` + `assets/js/vectors-in-space.js` | symbolic — `CalculusSymbolic.vectorOps()` — add/subtract/scale/dot/cross/magnitude/unit/distance/angle/projection/triple-product, exact components, numeric identity gate (cross ⟂ both factors, unit norm = 1, coplanar ⇒ triple = 0); first 3D page, arrows drawn via the shared `Scene3D` |
| Partial Derivatives & Tangent Planes | `engines/calculus/methods/partial-derivatives.html` + `assets/js/partial-derivatives.js` | symbolic — `CalculusSymbolic.partialDerivatives()` — f_x, f_y, ∇f, ∇f at (a,b), tangent plane; symbolic partials checked against central differences and the plane checked to touch the surface; 3D surface + tangent plane wireframes via `Scene3D.addSurface` |
| Volumes of Revolution | `engines/calculus/methods/volumes-of-revolution.html` + `assets/js/volumes-of-revolution.js` | symbolic — `CalculusSymbolic.volumeOfRevolution()` — disk, washer, shell; antiderivative then π kept symbolic through `sub().toString()` (nerdamer's `defint` is unreliable and `.evaluate()` numericizes π); independent Simpson integration of the integrand as the verify gate; the solid built live from sampled cross-sections via `Scene3D.addRevolution` |
| Multiple Integrals | `engines/calculus/methods/multiple-integrals.html` + `assets/js/multiple-integrals.js` | symbolic — `CalculusSymbolic.multipleIntegral()` — double integrals over a Cartesian Type I region or a polar region (r-Jacobian applied automatically); two nested antiderivatives, each bound evaluated by substitution (never `defint`); independent nested-Simpson double integration as the verify gate — also what catches a non-elementary inner integrand (`e^(y²)dy` → erf-of-`i`) since that expression is not `null`, only non-finite once evaluated; surface drawn via the new `Scene3D.addParametricSurface` |
| Lagrange Multipliers | `engines/calculus/methods/lagrange-multipliers.html` + `assets/js/lagrange-multipliers.js` | symbolic gradients, numeric solve — `CalculusSymbolic.lagrangeMultipliers()` — `f_x`, `f_y`, `g_x`, `g_y` via `diff()` (exact), but the 3-equation system in `(x, y, λ)` is solved by a finite-difference-Jacobian Newton's method from a multi-start grid (nerdamer's `solveEquations` returns only one of four solutions to the textbook circle case, and as an inexact decimal — rejected, see §3); verified per-candidate by the directional derivative of `f` (computed from `f` directly, never from `f_x`/`f_y`) along the tangent to the constraint curve; constraint curve traced onto the surface in 3D by a predictor-corrector march (tangent step + Newton correction back onto `g = c`), no CAS involved |
| Related Rates | `engines/calculus/methods/related-rates.html` + `assets/js/related-rates.js` | symbolic — `CalculusSymbolic.relatedRates()` — builds the chain rule by hand (`d/dt[f] = Σ ∂f/∂v · dv/dt`, since a CAS treats every other symbol as a constant), recovers the rate without `solve()` (which quietly numericizes π), verified against an independent numeric total-derivative residual that must vanish at the instant; 2D Plotly contour of the constraint with the instant point and its velocity arrow |
| Arc Length & Surface Area | `engines/calculus/methods/arc-length-surface-area.html` + `assets/js/arc-length-surface-area.js` | symbolic — `CalculusSymbolic.arcLengthSurfaceArea()` — `L = ∫√(1+(f′)²) dx` and `S = 2π∫f√(1+(f′)²) dx` via the shared `gatedIntegral` (textual bound substitution keeps π symbolic; never `.sub()`/`.evaluate()`/`defint`); Simpson-verification gate; a non-elementary length (elliptic, e.g. `sin x`, `x²`) is refused honestly; 2D Plotly curve with the polygonal-chain approximation to L (or the revolved region for S) |
| Parametric & Polar | `engines/calculus/methods/parametric-and-polar.html` + `assets/js/parametric-and-polar.js` | symbolic — `CalculusSymbolic.parametricAndPolar()` — slope, arc length, and area for parametric `(x(t),y(t))` and polar `r(θ)`, each quantity computed and verified independently via `qIntegral`/`gatedIntegral`; a vertical tangent at the midpoint refuses the slope while the area still resolves; a cardioid's non-elementary arc length is refused while its `3π/2` area lands; 2D Plotly trace of the curve with the midpoint tangent shown |
| Vector Calculus | `engines/calculus/methods/vector-calculus.html` + `assets/js/vector-calculus.js` | symbolic — `CalculusSymbolic.vectorCalculus()` — divergence, curl, the conservative test and a potential `φ` recovered by integration (curl = 0); line-integral work `∫F·dr` and flux `∫F·n ds` along a parametric curve; Green's theorem computed both as the 4-edge boundary line integral and as the double integral of `Q_x − P_y`, the theorem confirmed by the two sides agreeing; every quantity checked against central differences or Simpson; 2D Plotly quiver of the field with the curve or rectangle overlaid |
| Improper Integrals | `engines/calculus/methods/improper-integrals.html` + `assets/js/improper-integrals.js` | symbolic — `CalculusSymbolic.improperIntegral()` — `∫_a^b f` where a bound may be `±∞` or a vertical asymptote (at a bound, or inside the interval). Each troublesome bound becomes a limit; the interval is split at interior asymptotes so the Cauchy principal value of `∫_{-1}^1 1/x` is not mistaken for a convergent 0. Two paths — a symbolic antiderivative with one-sided limits (π kept symbolic) and a numeric sequence of partial integrals marching geometrically toward the improper end — must agree; the increment classifier catches the slow `ln` divergence of `∫_1^∞ 1/x` that a fixed cutoff misses. Verdict `converges`/`diverges`; 2D Plotly of `f` with bounds and asymptotes marked |
| Symbolic core | `assets/js/calculus-symbolic.js` | `uSubstitution()`, `integrationByParts()`, `partialFractions()`, `trigSubstitution()`, `limit()`, `taylorSeries()`, `lhopital()`, `curveAnalysis()`, `appliedOptimization()`, `convergenceTests()`, `powerSeries()`, `vectorOps()`, `partialDerivatives()`, `volumeOfRevolution()`, `multipleIntegral()`, `lagrangeMultipliers()`, `relatedRates()`, `arcLengthSurfaceArea()`, `parametricAndPolar()`, `vectorCalculus()`, `improperIntegral()` |
| 3D scene helper | `assets/js/calculus-3d.js` | `Scene3D` — hand-rolled orbit (no OrbitControls in the bundle), colored axis arrows + grid, `addArrow`/`addPoint`/`addLine`/`addSurface`/`addRevolution`/`addParametricSurface`/`clear`/`frame`/`dispose`; shared by every 3D page |
| CAS worker | `assets/js/cas-worker.js` | hosts math.js + nerdamer + calculus-symbolic |
| CAS client | `assets/js/cas-client.js` | promises, timeout, terminate, respawn, sync fallback |
| `engines/calculus/index.html` | redirect stub → `methods.html` | same pattern as linear-algebra/statistics |

Test suites — all green as of last commit:

```
tests/verify.js               76 passed    includes Algorithms.runRiemannSum
tests/verify-calculus.js     809 passed    symbolic results, incl. taylorSeries, lhopital,
                                            curveAnalysis, appliedOptimization, integrationByParts,
                                            partialFractions, trigSubstitution, convergenceTests,
                                            powerSeries, vectorOps (72), partialDerivatives (57),
                                            volumeOfRevolution (39), multipleIntegral,
                                            lagrangeMultipliers, relatedRates, arcLengthSurfaceArea,
                                            parametricAndPolar, vectorCalculus, improperIntegral,
                                            fourierSeries + fourierSeriesValue
tests/verify-cas-client.js    17 passed    timeout / terminate / respawn (mock worker)
tests/verify-cas-worker.js    30 passed    boots the real worker file, importScripts paths,
                                            incl. integrationByParts / partialFractions / trigSubstitution
                                            / convergenceTests / powerSeries / vectorOps
                                            / partialDerivatives / volumeOfRevolution
                                            / multipleIntegral / lagrangeMultipliers
                                            / relatedRates / arcLengthSurfaceArea
                                            / parametricAndPolar / vectorCalculus
                                            / improperIntegral dispatch
```

### Not started

Task 0, Phase 1, Phase 2, Phase 3, and Phase 4 are all done. L'Hôpital's Rule, Curve Sketching,
Applied Optimization, Related Rates, u-Substitution, Integration by Parts, Partial Fractions,
Trigonometric Substitution, Convergence Tests, Power Series & Radius of Convergence, Vectors in
Space, Partial Derivatives & Tangent Planes, Volumes of Revolution, Arc Length & Surface Area,
Multiple Integrals, Parametric & Polar Coordinates, Lagrange Multipliers, Vector Calculus, and
Improper Integrals have all shipped, plus three supplementary integration calculators
(algebraic-substitution, completing-the-square, integral-calculator) and the kernel-backed
rational-integration Phase 3 path. **All 18 syllabus topics in `CURRICULUM_ROADMAP.md` §2 are
built — the engine is complete.** A dedicated Fourier Series page is the one remaining
core-implemented-but-unexposed method (the `fourierSeries` core is tested and
worker-whitelisted).

---

## 3. Hard-won facts about the tooling — read before writing code

These were established by direct experiment against the vendored bundle. **Do not re-derive
them, and do not assume nerdamer is trustworthy by default.**

### nerdamer

`assets/vendor/nerdamer.min.js` is the full **1.1.13** bundle — core + Algebra + Calculus +
Solve + Extra + Statistics. `integrate`, `defint`, `diff`, `solve`, `limit` all work offline.

Confirmed behaviours:

| Call | Result | Verdict |
|---|---|---|
| `integrate(x*e^x, x)` | `-e^x+e^x*x` | by parts works |
| `integrate(1/(x^2-1), x)` | partial-fraction logs | works |
| `solve(diff(x^3-3*x,x), x)` | `[1,-1]` | works — polynomials are reliable |
| `solve(diff(sin(x),x), x)` i.e. `solve(cos(x), x)` | ~38 rational-approximation "roots" (e.g. `359657293/228964944` for what is really `pi/2`), no `+ k*pi` | **WRONG kind of answer** — silently falls back to a numeric search with no indication it isn't exact. Never trust `solve()` on an expression containing a transcendental function call; see `classifyForm`/`findRoots` in `calculus-symbolic.js` |
| `limit(sin(x)/x, x, 0)` | `1` | works |
| `limit(1/x, x, 0)` | `Infinity` | **WRONG** — the two-sided limit does not exist |
| `limit(abs(x)/x, x, 0)` | *never returns* | **HANGS** — freezes the tab |
| `limit(..., x, infinity)` | garbage | lowercase `infinity` is silently wrong; use `Infinity` |
| `simplify(cos(asin(x)))` | unchanged | does **not** simplify; needs a presentation layer |
| `nerdamer("(x)*(-cos(x))-(-sin(x))").simplify()` | `-(-cos(x)*x+sin(x))`, which **evaluates to the negative of the unsimplified expression** | **WRONG VALUE**, not just a different form — confirmed by direct numeric evaluation of both. Found while building Integration by Parts (`x*sin(x)`). Do not call `.simplify()` on a value that will be returned or verified; re-parsing via `.toString()` (what `pretty()` does) is safe, `.simplify()` is not, at least for this shape (a product distributed over a two-term subtraction) |
| `\mathrm{log}` in `toTeX` | — | nerdamer's `log` is natural log; render it as `\ln` |

**There is no step-by-step API.** nerdamer returns answers only. The derivation ladder is
ours to build: classify the input → name the technique → emit the rewrite → let nerdamer
execute the algebra → verify.

### Approaches already tried and rejected

- **One-sided limits via `x = a ± e^(-t)`, `t→∞`.** Looked elegant. It hangs on `sin(x)/x`
  and returned `325368125/59848122` (≈5.44) for a limit whose answer is 2. **Do not retry.**
- **Leading with nerdamer's `limit()`.** See the two disqualifying rows above. The engine
  uses direct substitution + L'Hôpital via `diff` (which never hangs, even on `abs`) plus
  numeric probing, and consults `limit()` only as a guarded last resort. The result is *more*
  correct than the CAS alone.
- **`CURRICULUM_ROADMAP.md` cites "Teacher Helper's `symbolicEngine.js`" as a proven CAS
  path. It is not.** That file is an exam-question generator (templates, polynomial
  coefficient cleanup, seeded RNG) and is currently in `~/.local/share/Trash/`. Ignore that
  line.

### Gotchas that cost time

- **Nerdamer normalizes away structure.** `(1-cos(x))/x^2` becomes `(-cos(x)+1)*x^(-2)` — a
  *product*. Anything that needs to see a quotient (L'Hôpital) must parse the **user's
  original string**, not the normalized one.
- **Converging numerically ≠ substitution works.** `sin(x)/(2x)` converges to `1/2` while
  still being `0/0` at the point. Only an exact symbolic value may end an L'Hôpital loop;
  accepting the probe's number yields `0.4999999999916666` instead of `1/2`.
- **Classify results from the answer, not the probe.** `lim(log(x)/x)` as `x→∞` is `0`, a
  finite limit, but the probe values are still shrinking at the last sample so the probe alone
  says "no verdict".
- **math.js and nerdamer are separate parsers.** Nerdamer's output is fed to math.js for
  plotting; that round-trip works today for everything shipped, but check it for new forms.
- **`math.js`'s `node.toString()` breaks whitespace-sensitive regex classification.** It
  renders `e^x` as `e ^ x` — a LIATE classifier (Integration by Parts) matching on `e\^` with
  no space silently misses it and falls through to the wrong category. Round-trip any
  math.js-derived factor through nerdamer (`pretty()`) before classifying it by string.
- **`.simplify()` can change the VALUE, not just the form.** `nerdamer("(x)*(-cos(x))-(-sin(x))").simplify()`
  returns an expression that evaluates to the *negative* of the unsimplified one — confirmed
  by direct numeric check. Never call `.simplify()` on something you are about to return or
  verify; plain re-parsing (`pretty()`) is safe.
- **Dispatch tables need `Object.create(null)`.** A plain object literal "resolves"
  `constructor`, `toString`, etc. from `Object.prototype` — they pass a truthiness check and
  get invoked.

---

## 4. Architecture and conventions

### Layering

```
page.html
  └─ assets/js/<method>.js        DOM wiring only. No math. No CAS calls except via CAS.
       └─ CAS (cas-client.js)     promises + timeout + terminate + respawn
            └─ cas-worker.js      math.js + nerdamer + calculus-symbolic.js
                 └─ calculus-symbolic.js   pure, DOM-free, Node-testable
```

**Why the whole engine runs in the worker, not just the CAS primitives:** a hang can happen
deep inside a candidate search or an L'Hôpital loop. If those loops ran on the main thread,
the kill switch would have nothing to kill.

### Adding a method — the order is not optional

1. Add the pure function to `assets/js/calculus-symbolic.js`. Returns
   `{ok, ..., latex, steps[], verified}` or `{ok:false, reason, ...}`. Plain JSON-shaped data
   only — it has to survive `structuredClone` across the worker boundary.
2. Add its cases to `tests/verify-calculus.js`, **including at least one case it must refuse**.
   Run `node tests/verify-calculus.js` — all pre-existing cases must still pass.
3. Add the op to the `OPS` table in `cas-worker.js` and a convenience wrapper in
   `cas-client.js`.
4. Add a case to `tests/verify-cas-worker.js` so the new op is covered end-to-end.
5. Only now write `assets/js/<method>.js` and `engines/calculus/methods/<method>.html`.
6. Add the card to `engines/calculus/methods.html` and bump the `N / total` indices and the
   hero badge counts.
7. Update the status in `CURRICULUM_ROADMAP.md` §2.

### Page conventions

- Copy `engines/calculus/methods/limits.html` as the template — it is the most complete.
- Assert on **behaviour, not strings**, in tests. `1/2`, `0.5` and `(1/2)` are all correct;
  only one is what nerdamer emits today. Compare numerically, or via
  `nerdamer("(a)-(b)").simplify() === "0"`.
- Every page must load `calculus-symbolic.js` **and** `cas-client.js`. The former is only the
  in-page fallback for `file://`, where browsers refuse to construct a Worker; the page should
  surface `CAS.mode() === "sync"` as a warning, because in that mode a hang freezes the tab
  and nothing can stop it.
- Use only classes that already exist in `engine.css` / `proto.css`. The one new hook so far
  is `.step-tex`, an unstyled KaTeX mount point inside table cells.
- Escape user-derived strings before `innerHTML` — candidate `u` values come from user input.

---

## 5. Build order

Priorities are from `CURRICULUM_ROADMAP.md` §2. Ordering here additionally reflects
dependencies and what the existing infrastructure already makes cheap.

### Task 0 — pay down the workspace page — done 2026-07-21

- Extracted Riemann sums into `Algorithms.runRiemannSum` in `algorithms.js` (numeric) and
  Taylor coefficients into `CalculusSymbolic.taylorSeries` (symbolic, verified: `P(a) = f(a)`
  plus a numeric neighborhood check).
- Cases added to `tests/verify.js` (Riemann sum) and `tests/verify-calculus.js` (Taylor
  series) — all pre-existing cases still pass.
- Split into `methods/riemann-sums.html` and `methods/taylor-series.html`.
- `engines/calculus/index.html` reduced to a redirect stub → `methods.html`, matching
  linear-algebra/statistics. Root hub's resume entry (`math-lab/index.html`, key
  `engine-lab:calculus`) now checks both `engine-lab:calculus-taylor-series` and
  `engine-lab:calculus-riemann-sums` and links to `methods.html`.
- `methods.html` cards repointed at the two new pages; hero badge count updated.

### Phase 1 — done 2026-07-22

| Topic | §2 | What shipped |
|---|---|---|
| L'Hôpital's Rule | #2 | Own page + own op (`lhopital()`). Turned out `applyLHopital()`'s internal indeterminate-form gate (probeSide-based) was too coarse to reuse as-is — see `classifyForm`/`trendClassify`, a dedicated, more reliable classifier built for this entry point. |
| Curve Sketching | #3 | Three linked plots (f, f′, f″). `solve(diff(f,x),x)` turned out **not** to be reliable for transcendental derivatives (see the nerdamer table above) — built a hybrid: trust `solve()` only on algebraic derivatives, numeric sign-change bisection otherwise. |
| Applied Optimization | #5 | Extreme Value Theorem: critical points (reusing Curve Sketching's `findRoots`) plus both endpoints, best one wins. Box-from-a-sheet and fence-along-a-river presets, live domain slider. |

### Phase 2 — Techniques of Integration (§2B #6) — done 2026-07-22

The largest single item in the engine. All four techniques are now shipped; each is a step
engine, not a single nerdamer call.

- **Integration by Parts — done 2026-07-22.** `CalculusSymbolic.integrationByParts()` picks
  `u`/`dv` by the LIATE heuristic, emits `uv − ∫v du`, and decomposes **one level deep** —
  nerdamer's `integrate()` resolves the reduced integral `∫v du` in a single call (confirmed
  on `x^2*e^x`, which textbook by-parts needs twice), so an explicit recursion/depth-bound was
  unnecessary. The `.simplify()` value-flip trap (§3) is sidestepped by never calling it; the
  differentiate-back check is what guards correctness. Refuses when `dv` has no elementary
  antiderivative (e.g. `x*sin(x^2)` — that is u-substitution's turf, not a wrong answer).
- **Partial Fractions — done 2026-07-22.** `CalculusSymbolic.partialFractions()` lets
  `partfrac()` do the decomposition (irreducible-quadratic factors, repeated factors, and the
  polynomial long division an improper fraction needs first), then integrates the result term
  by term. The non-obvious part was *detecting* the rational function: nerdamer normalizes every
  quotient away from the `/` operator (`1/(x^2-1)` → `(-1+x^2)^(-1)`), so the `/`-based
  `splitQuotient` the limits work uses returns nothing. `splitRational` instead flattens the
  top-level product and separates factors by the sign of their integer exponent — positive
  powers to the numerator, negative-integer powers to the denominator — then `isPolynomialIn`
  gates both sides, so `x*e^x` (a non-polynomial factor) and `1/sqrt(4-x^2)` (a radical
  denominator) are both refused by name. Verified by the finite-difference gate.
- **Trigonometric Substitution — done 2026-07-22.** `CalculusSymbolic.trigSubstitution()`
  recognises the three radical forms by numeric detection (sidesteps nerdamer's string
  reordering: it writes `4−x²` as `−x²+4`), clears the radical, integrates in θ, and
  back-substitutes. Two confirmed problems needed two confirmed fixes:
  (1) nerdamer's `integrate()` is unreliable on the raw substituted integrand *when the radical
  was in the integrand's denominator* — `1/√(a²−x²)` leaves a polynomial-in-sin denominator
  `(a²−a²sin²θ)^(-1)` it cannot integrate. `applyPythagorean` rewrites `k−k·sin²θ → k·cos²θ`
  (and the `+`/`−` forms nerdamer writes as a sum with a negative term) into a trig power that
  cancels against the radical·dx factor, and `convertNegPowers` flips `sec^(−1)→cos` so the
  θ-integrand is always a product of *positive* trig powers — the only shape nerdamer integrates
  reliably here.
  (2) nerdamer does not simplify `cos(asin(x))` and its `diff()` is wrong on the resulting
  `√(quadratic)` forms, so a tree-based composition simplifier cleans those up for display and
  the verify gate uses math.js finite differences (`fdVerifyAntideriv`), which never asks the
  CAS to differentiate. An unsimplified-but-correct answer still passes the gate.

Consider a `CalculusSymbolic.integrate()` front door that tries each technique in textbook
order and reports which one succeeded — the same "visible decision procedure" idea as the
series-tests page.

### Phase 3 — Series (§2C) — done 2026-07-22

- **Convergence Tests (#10).** `CalculusSymbolic.convergenceTests()` runs the full textbook
  decision tree in order — nth-term, geometric, p-series, integral, (limit-)comparison, ratio,
  root, alternating — and reports which test first gives a conclusive answer, not just the
  verdict. Each verdict is gated by a numeric partial-sum check (`numericSeriesCheck`); the
  engine honestly refuses when no standard test is conclusive (e.g. `1/(n log n)`) and routes a
  free-variable term to the Power Series method. `engines/calculus/methods/convergence-tests.html`.
- **Power Series & Radius of Convergence (#11).** `CalculusSymbolic.powerSeries()` finds the
  radius from the coefficients (ratio test, root-test fallback — handles R=0 via a 2×-growth
  heuristic for polynomial-growth ratios like n+1, and R=∞ for ratios tending to 0), classifies
  both endpoints by reusing `convergenceTests` (with a constant-term short-circuit for endpoints
  like cₙ=1, R=1 → term = 1 that the tree would otherwise refuse), and assembles the interval
  for any centre a. `engines/calculus/methods/power-series.html`. Depends on #10.

### Phase 4 — 3D (§2B #8, §2D #14–17)

`three.js` is vendored; the scene conventions live once in `assets/js/calculus-3d.js` (`Scene3D`),
built for #14 and reused by the rest.

- **Vectors in Space (#14) — done 2026-07-22.** `CalculusSymbolic.vectorOps()` does the 11
  standard 3D operations exactly (add, subtract, scale, dot, cross, magnitude, unit, distance,
  angle, projection, triple product) with a numeric identity gate — a cross product that isn't
  perpendicular to either factor, or a "unit" vector whose norm isn't 1, is withheld. `Scene3D`
  is the reusable foundation: hand-rolled spherical orbit (the bundle has no `OrbitControls`),
  colored axis arrows + grid, and `addArrow`/`addPoint`/`addLine`/`addSurface`/`clear`/`frame`/
  `dispose`. Surfaces are sampled into a plain `BufferGeometry` (the bundle has no
  `ParametricGeometry`); axis labels are an HTML legend (the bundle has no `FontLoader`). The
  page degrades to a note when `THREE` is missing — same honest-fallback discipline as the CAS
  worker over `file://`.
- **Partial Derivatives, Gradient, Tangent Planes (#15) — done 2026-07-22.**
  `CalculusSymbolic.partialDerivatives()` computes `f_x`, `f_y`, `∇f`, `∇f` at (a, b), and the
  tangent plane, all exact via `diff()`. The gate is the one the nerdamer table in §3 demands:
  the symbolic partials are checked against central-difference approximations computed from f
  itself (not from the derivative), and the tangent plane is checked to touch the surface at
  (a, b) with matching slopes — so a `diff()` the CAS gets wrong on a transcendental form is
  caught, not displayed. The signature visual reuses `Scene3D.addSurface` for both the surface
  and the (flat) tangent plane, so the kiss between them is legible; the gradient is drawn as a
  steepest-ascent arrow in the domain.
- **Volumes of Revolution (#8) — done 2026-07-22.** `CalculusSymbolic.volumeOfRevolution()`
  handles the disk, washer, and shell methods. The pipeline keeps π symbolic the way §3's nerdamer
  table demands: `integrate()` the core (constant factor pulled out), then `F.sub(v, bound).toString()`
  for the bounds (nerdamer's `defint` is unreliable — it errors on numeric bounds and leaves trig
  unevaluated — and `.evaluate()` numericizes π into a rational, so `.sub().toString()` is the only
  path that keeps π), then a final `.toString()` on the assembled volume reduces `sin(π)→0` and the
  arithmetic while leaving π and e symbolic. The verify gate is an independent Simpson integration
  of the full integrand (factor × core) — a π the CAS quietly turned rational is caught. The
  signature visual adds `Scene3D.addRevolution`: a wireframe of rings (the stacking disk/shell
  cross-sections) plus meridians (the profile curve carried around), with the generating curve and
  the axis of revolution drawn in. Washer adds a second, inner-skin revolution for the hole.
- **Multiple Integrals (#17) — done 2026-07-22.** `CalculusSymbolic.multipleIntegral()` handles
  the double integral over a Cartesian Type I region (`y` between two curves of `x`) and a
  polar region (`r` between two curves of `θ`, the extra Jacobian factor of `r` appended to the
  integrand automatically). Two nested antiderivatives — the inner one still a function of the
  outer variable, evaluated at the (possibly curved) inner bounds by `sub().toString()`, never
  `defint()` — then a second antiderivative in the outer variable, evaluated at the constant
  outer bounds the same way. The verify gate is a nested-Simpson numeric double integration (an
  outer Simpson, and at every outer sample an inner Simpson between that sample's bounds) — no
  CAS involved — which is also what catches a non-elementary inner integrand: `∫e^(y²)dy`
  returns nerdamer's erf-of-`i` expression (§3) rather than `null`, so the antiderivative step
  alone would not refuse, but the final `evalNum` on an expression containing `erf`/`i` is
  `NaN`, and the gate refuses honestly. **Scope note:** triple integrals and
  cylindrical/spherical coordinates are explicitly out of this pass — the double-integral case
  in both coordinate systems the roadmap names as common is what shipped; a third nested
  integration and a third spatial dimension for the visual were judged a separate, larger
  effort. The signature visual is new: `Scene3D.addParametricSurface`, a generalization of
  `addSurface` that takes the page's own `(u, v) → [x, y, z]` mapping instead of assuming
  `z = f(x, y)` directly — needed because a polar region's height plot is `z = f(r, θ)`
  positioned at `(r·cosθ, z, r·sinθ)`, not a rectangular `(x, y)` domain. The region's boundary
  is traced twice, once at the base (`z` held at the surface's minimum) and once lifted onto the
  roof (`z = f` along the boundary), so the "solid under the surface, over this region" reading
  is legible from any angle.
- **Lagrange Multipliers (#16) — done 2026-07-22.** `CalculusSymbolic.lagrangeMultipliers()`
  finds the extrema of `f(x, y)` on `g(x, y) = c`. `f_x`, `f_y`, `g_x`, `g_y` come from `diff()`
  (exact, never hangs), but nerdamer's own system solver was tried on the eliminated
  3-equation system in `(x, y, λ)` and rejected: on the textbook circle case
  (`f = xy`, `g = x²+y² = 1`), `solveEquations` returns exactly one of the four real solutions,
  and as an inexact decimal (`0.5` rather than `1/√2`) — both silently incomplete and silently
  inexact, the same "confidently wrong" failure mode §3 documents for `solve()` on
  transcendental forms. So the system is solved numerically instead: a finite-difference-
  Jacobian Newton's method (re-implemented locally rather than imported from
  `Algorithms.runNewtonSystem` — this module stays free of a dependency on `algorithms.js` by
  convention, see §4) run from a deterministic 5×5×3 multi-start grid so multiple critical
  points are all found, not just whichever one seed converges to first. The verify gate does
  *not* reuse the Newton residual — that would only confirm Newton did its own arithmetic
  correctly — but instead computes the directional derivative of `f` (via central differences
  on `f` itself, never on `f_x`/`f_y`) along the tangent to the constraint curve (⟂ `∇g`); a
  genuine constrained critical point has zero rate of change along the curve it sits on, and a
  spurious Newton convergence does not. Assumes the constraint traces a bounded curve (circle,
  ellipse) so the Extreme Value Theorem guarantees a global max and min among the points found;
  reports every verified point, tagged by comparing f-values. The signature visual traces the
  constraint curve itself numerically — a predictor step along the tangent, then a short Newton
  correction back onto `g = c`, no CAS involved — and lifts it onto the surface via
  `Scene3D.addSurface` + `addLine`, with each critical point marked and colored by whether it's
  the max, the min, or (rarely, if only one point survives verification) unclassified.

### Phase 5 — remainder

Complete. Related Rates (#4), Improper Integrals (#7), Arc Length & Surface Area (#9),
Parametric & Polar (#13), and Vector Calculus (#18) have all shipped. Every topic in
`CURRICULUM_ROADMAP.md` §2 is built.

---

## 6. Open issues and risks

- **Nothing has been verified in a browser.** Every page was built and checked headlessly
  (Node test suites, a worker-scope sandbox, a site-wide link checker). Layout, KaTeX inside
  `.data-table` cells, the Plotly `circle-open` limit marker, real `new Worker()` construction,
  and `document.currentScript`-based worker URL resolution are all **unconfirmed**. Serve over
  http:// and check:
  ```
  cd math-lab && python3 -m http.server 8000
  ```
- **The hang blocklist cannot be complete.** `LIMIT_HANG_RISK` in `calculus-symbolic.js` lists
  `abs|sign|floor|ceil|round|mod`. It is a mitigation, not a guarantee — the worker timeout is
  the real protection.
- **`methods.html` hardcodes counts** ("4 methods … 70 automated tests"). These rot. Same
  pattern as the other catalogs, so fixing it is a site-wide change or nothing.
- **`file://` has no safety net.** The sync fallback keeps pages working but cannot be
  interrupted. The pages warn; that is all they can do.
- **Plot windows are heuristic.** `limits.js` uses `a ± 2` for finite points and `[0.5, 60]`
  at infinity; `u-substitution.js` hardcodes `(0.05, 4]` to dodge `log(0)`. Fine for the
  shipped examples, arbitrary in general.
- **Roadmap statuses rot.** §2 statuses for Limits (#1), L'Hôpital (#2), Curve Sketching (#3),
  Applied Optimization (#5), Taylor Series (#12), Techniques of Integration (#6 — all four
  techniques done), Convergence Tests (#10), Power Series & Radius of Convergence (#11),
  Vectors in Space (#14), Partial Derivatives (#15), Volumes of Revolution (#8), Lagrange
  Multipliers (#16), and Multiple Integrals (#17) were updated as of 2026-07-22; keep them
  current or the doc stops being trustworthy.

---

## 7. Quick reference

```bash
cd math-lab

# all suites
for t in verify.js verify-linalg.js verify-statistics.js \
         verify-calculus.js verify-cas-client.js verify-cas-worker.js; do
  echo "$t: $(node tests/$t | tail -1)"
done

# serve (required — Workers do not run over file://)
python3 -m http.server 8000
```

Entry points: `engines/calculus/methods.html` (catalog) ·
`engines/calculus/index.html` (workspace) ·
`http://localhost:8000/engines/calculus/methods/limits.html`
