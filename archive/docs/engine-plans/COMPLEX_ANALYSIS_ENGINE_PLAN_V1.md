# Complex Analysis Engine — Build Plan

Everything needed to start this engine from nothing.

**Status: Phase 2 complete (6/6 topics shipped).** Phase 3 (contour integration) is next. See §6
for the per-topic build order and §4 for what changed along the way.

**Scope of this file:** the Complex Analysis Engine. Companions:
- `CURRICULUM_ROADMAP.md` §9 — the topic list and priorities.
- `CALCULUS_ENGINE_PLAN.md` — the engine this one is modelled on. **Its §3 (hard-won facts
  about nerdamer) applies here verbatim and must not be re-derived.**
- `ANTIDERIVATIVE_STRATEGY.md` — relevant because the residue theorem is, in practice, an
  integration engine.

Last updated: 2026-07-24 (Phase 2 shipped, same day as Phase 1: Complex Logarithms & Powers
— branch cuts — and Complex Trigonometric & Hyperbolic Functions. Both are numeric, deliberately
— see §6's Phase 2 entry for why log/fractional-power branches were never routed through
complex-symbolic.js. Phase 1 shipped Analyticity & Cauchy-Riemann and Harmonic Functions &
Conjugates, both symbolic — see §4 for why the plan's original realpart()/imagpart() approach
was abandoned mid-build and what replaced it.)

---

## 1. Textbook basis

**Churchill & Brown, *Complex Variables and Applications*** — the near-universal US
undergraduate text, cross-checked against Gamelin, *Complex Analysis*. Scope is a standard
one-semester junior/senior course: complex numbers → analytic functions → contour integration →
series → residues → conformal mapping.

Chapter order in Churchill & Brown maps almost exactly onto the build order in §5, which is
deliberate — a student taking the course should be able to follow the catalog top to bottom.

---

## 2. The one thing that makes this engine different

**Every other engine plots a function as a curve or a surface. Complex functions have a
4-dimensional graph and cannot be plotted that way at all.**

`f: ℂ → ℂ` needs two real dimensions in and two out. This is not a minor presentation problem —
it is *the* problem of the subject, and the reason complex analysis feels abstract to students
who can otherwise picture everything in calculus. The engine's core visual contribution is
solving it, three ways:

1. **Domain colouring** — colour the input plane by the output: hue = `arg f(z)`, brightness =
   `|f(z)|`. Zeros and poles become visually unmistakable (colour wheels winding forward or
   backward), and the *order* of a zero or pole is literally countable as the number of hue
   cycles. Nothing else in the Lab conveys this much information in one image.
2. **Before/after grid mapping** — draw a grid (or a set of circles) in the `z`-plane and its
   image in the `w`-plane. Conformality — angles preserved — becomes something you *see*, and
   the failure of conformality at critical points where `f'(z) = 0` becomes visible too.
3. **Contours as animated paths** — a contour integral is a walk around a closed path; showing
   the path traversed while the partial integral accumulates makes "the integral depends only
   on the poles enclosed" a visual fact rather than a claimed theorem.

The second differentiator: **this engine pays a debt the Calculus Engine cannot.** Real integrals
like `∫₀^∞ dx/(1+x²)` or `∫₀^{2π} dθ/(2+cosθ)` are hard-to-impossible by real methods, and the
residue theorem makes them nearly mechanical. Cross-linking those from the Calculus Engine's
Improper Integrals page (§2 #7) is the single best "why does this subject exist" moment available
on the whole site.

---

## 3. Architecture

Same layering as the Calculus Engine, sharing the same CAS worker — wired up starting Phase 1:

```
engines/complex/methods/<method>.html
  └─ assets/js/<method>.js            DOM wiring only. No math.
       └─ CAS (cas-client.js)         timeout + terminate + respawn
            └─ cas-worker.js          math.js + nerdamer + calculus-symbolic + complex-symbolic
                 └─ assets/js/complex-symbolic.js    pure, DOM-free, Node-testable
                      └─ assets/js/calc-core.js      shared nerdamer/math.js injection + helpers
```

`complex-symbolic.js` is in `cas-worker.js`'s `importScripts` and `OPS` whitelist (`cauchyRiemann`,
`harmonicConjugate`), with `cas-client.js` wrappers of the same names; followed the 7-step
"Adding a method" checklist in `CALCULUS_ENGINE_PLAN.md` §4. Two of the engine's four Phase-1
pages (Complex Arithmetic, Complex Functions/domain colouring) are deliberately numeric-only —
see domain-coloring.js's header for why — and load no CAS worker at all; only Cauchy-Riemann and
Harmonic Functions pull it in so far.

**Why the shared worker rather than a new one:** residues need differentiation and series
expansion; Laurent series need Taylor series. `CalculusSymbolic` already provides both, verified.
A second worker would duplicate the nerdamer bundle and the kill-switch machinery for no gain.

### The verify gate

Complex results are as silently-wrong-able as real ones, so the same discipline applies. Per
method:

| Method | Gate |
|---|---|
| Residue at a pole | Numerically integrate `f` around a small circle centred at the pole; must equal `2πi·Res`. |
| Contour integral | Direct numeric parametrised quadrature around the contour must match the residue-theorem answer. |
| Cauchy-Riemann / analyticity | Check `u_x = v_y` and `u_y = −v_x` numerically via central differences, not only symbolically. |
| Laurent / Taylor series | Evaluate the truncated series against `f` at sample points inside the annulus of convergence. |
| Conformal map | Check angle preservation numerically: two curves crossing at angle θ must still cross at θ. |
| Roots / zeros / poles | Substitute back: `|f(z₀)|` must be ≈ 0 for a zero; `1/|f(z₀)|` ≈ 0 for a pole. |

**Numeric contour integration is the workhorse gate for this whole engine** — it is independent
of the CAS, cheap, and catches essentially every symbolic mistake that matters.

---

## 4. Tooling facts — verified 2026-07-22

Tested directly against the vendored nerdamer bundle. Do not re-derive.

| Call | Result | Verdict |
|---|---|---|
| `nerdamer("sqrt(-1)")` | `i` | works — complex literals are native |
| `nerdamer("abs(3+4*i)")` | `5` | modulus works |
| `nerdamer("e^(i*pi)")` | `-1` | Euler's identity reduces correctly |
| `nerdamer("(1+i)^2")` | `(1+i)^2` — **unexpanded** | must call `.expand()`; do not assume normalisation |
| `nerdamer("factorial(10)")` | `factorial(10)` — **unevaluated** | needed for Taylor/Laurent coefficients; compute factorials in JS, not nerdamer |

Plus, inherited from `CALCULUS_ENGINE_PLAN.md` §3 and fully applicable here:
- **`.simplify()` can change the value, not just the form.** Never call it on anything being
  returned or verified. `.toString()` re-parsing is safe.
- **`solve()` on transcendental functions returns rational approximations**, silently. Finding
  poles of `1/sin(z)` this way will produce garbage that looks exact. Use structural analysis
  (find zeros of the denominator by known form) plus numeric root-finding, and verify.
- **nerdamer hangs outright on some inputs.** Everything runs in the worker. Not negotiable.

**Open tooling question, must be resolved in Phase 0:** how much complex arithmetic nerdamer
does reliably beyond the above. Test `series()`, `residue()` (if present), complex `diff()`, and
complex `integrate()` *before* designing around them. The Calculus Engine's history is a long
list of nerdamer capabilities that looked present and were not.

### `realpart()`/`imagpart()` are unreliable — resolved 2026-07-24, do not re-derive

The plan above called for substituting `z = x+i*y`, `expand()`-ing, and calling nerdamer's
`realpart()`/`imagpart()` to get `u(x,y)` and `v(x,y)` for Analyticity/Cauchy-Riemann. Tested
directly against the vendored bundle before building Phase 1: **both functions are wrong — not
refused, wrong — whenever a real (non-`i`) term in the sum is itself a product of two or more
distinct non-numeric factors.**

| Call | Result | Correct answer |
|---|---|---|
| `imagpart(a*b + i*c)` | `a*b+c` | `c` |
| `imagpart(e^x*cos(y) + i*e^x*sin(y))` | `cos(y)*e^x+e^x*sin(y)` | `e^x*sin(y)` |
| `imagpart(x^2-y^2 + i*2*x*y)` (z², single-factor real terms) | `2*x*y` | `2*x*y` — correct, but only by luck |

z² alone looked fine only because its real terms (`x^2`, `-y^2`) each happen to be a single
factor. The very next textbook case, z³, already has a real term (`-3xy²`) that is a two-factor
product and would hit the same bug — and every transcendental function (`e^z`, `sin z`, `cos z`)
hits it immediately, since Euler's identity always produces a real part like `e^x·cos(y)`. This
is not an edge case; it is the general case for anything past a bare quadratic.

**What replaced it:** `complex-symbolic.js`'s `decompose()` never asks nerdamer to separate a
mixed real+imaginary expression. It walks f(z)'s math.js parse tree bottom-up and carries
`u` and `v` as two SEPARATE nerdamer strings at every node, combined with the ordinary
complex-arithmetic identities (`(u₁+iv₁)(u₂+iv₂) = (u₁u₂−v₁v₂, u₁v₂+v₁u₂)`, etc.) and, for the
entire functions, their textbook Euler-type identities (`exp(u+iv) = eᵘ(cos v + i sin v)`, and
similarly for sin/cos/sinh/cosh). Since u and v are never mixed together and then pulled apart,
the bug above is structurally impossible to hit. Verified against z², z³, 1/z, exp(z), sin(z),
conj(z), and |z|² in `tests/verify-complex-symbolic.js`.

**Scope line this drew:** `decompose()` refuses by name (not silently) on `sqrt`, `log`/`ln`, and
inverse trig — anything genuinely multivalued needs a declared branch, which is Phase 2's job,
not Phase 1's. Fractional/complex powers of z are refused the same way. This is a deliberate
scope boundary, not a limitation discovered late.

---

## 5. What to reuse

| Need | Reuse | Notes |
|---|---|---|
| Laurent/Taylor coefficients | `CalculusSymbolic.taylorSeries()` | Built and verified; Laurent is Taylor plus a principal part |
| Residue at a higher-order pole | `CalculusSymbolic` differentiation path | Residue of order `m` is a scaled `(m−1)`-th derivative |
| Radius/annulus of convergence | `CalculusSymbolic.powerSeries()` | Ratio/root test on coefficients — already handles `R=0`, `R=∞` |
| Real-integral applications | `CalculusSymbolic.multipleIntegral`, `Algorithms.runSimpson` | For the numeric verification gate |
| Numeric contour quadrature | `Algorithms.runSimpson` / `runGaussLegendre` | The main verify gate |
| Polynomial zeros/poles | `LinAlg.polynomialRoots` | **Already returns complex roots** as `{re, im}` via Durand-Kerner |
| Complex scalar arithmetic | `LinAlg`'s local `cx` helper (add/sub/mul/div/abs) | Currently private to `linalg-algorithms.js` — **promote it** to a shared module rather than writing a second one |
| Harmonic functions / Laplace's equation link | ODE/PDE Engine §5G #22 | `u_xx + u_yy = 0` is exactly the real part of an analytic function — genuine cross-engine payoff |
| Hang protection | `cas-worker.js` / `cas-client.js` | |
| 3D surface plots (`|f(z)|` as a surface) | `Scene3D.addSurface` / `addParametricSurface` | Built for Calculus; direct reuse |
| 2D plotting (domain colouring, grid maps) | Plotly heatmap + scatter | Domain colouring is an RGB image — may need a raw `<canvas>` rather than Plotly |

**Note the dependency direction:** this engine consumes the Calculus Engine, not the reverse.
Build it after Calculus Phase 5, or at least after Taylor/Power Series (both done).

---

## 6. Topics and build order

Numbered to match `CURRICULUM_ROADMAP.md` §9.

### Phase 0 — foundation — done
Probed nerdamer's complex capabilities (§4), promoted the `cx` complex-arithmetic helper into a
shared module (`complex.js`), created `tests/verify-complex.js`, and built the domain-colouring
renderer (`domain-coloring.js`, numeric — see its own header for why). The renderer is
infrastructure, not a topic — every later page reuses it.

### Phase 1 — the plane and analyticity *(P0)* — done 2026-07-24
1. **Complex Arithmetic & the Plane** — algebraic and polar form, modulus/argument, conjugate,
   De Moivre, `n`-th roots of unity drawn on the circle. `methods/complex-arithmetic.html` +
   `complex-arithmetic.js`, numeric (`complex.js` + Plotly Argand plane).
2. **Complex Functions & Domain Colouring** — the flagship visual; every subsequent page reuses
   it. `methods/complex-functions.html` + `complex-functions.js`, numeric (`domain-coloring.js`).
3. **Analyticity & the Cauchy-Riemann Equations** — done, symbolic. `methods/cauchy-riemann.html`
   + `cauchy-riemann.js`, backed by `ComplexSymbolic.decompose()`/`.cauchyRiemann()` (§4 — the
   realpart/imagpart replacement) via `CAS.cauchyRiemann()`. Exact `u_x`, `u_y`, `v_x`, `v_y` are
   evaluated at the requested point AND sampled across the whole plotted plane (compiling the
   returned closed forms once, no further CAS calls) to tell "analytic in a neighbourhood" apart
   from the `|z|²` trap — Cauchy-Riemann holding at one isolated point without the function being
   analytic there. Verified by an independent finite-difference cross-check on `u`/`v` — same
   discipline as `partialDerivatives` in the Calculus Engine.
4. **Harmonic Functions & Conjugates** — done, symbolic. `methods/harmonic-functions.html` +
   `harmonic-functions.js`, backed by `ComplexSymbolic.harmonicConjugate()` via
   `CAS.harmonicConjugate()`: `∇²u` checked first (honest refusal if u isn't harmonic), then
   `v = ∫u_x dy − ∫(∂ₓ∫u_x dy + u_y) dx`, shifted so `v` lands on the requested base-point value.
   Every step is real-valued nerdamer algebra (`diff`/`integrate`, never touching `i`), so none
   of §4's realpart/imagpart problems apply here — only `CALCULUS_ENGINE_PLAN.md` §3's ordinary
   diff/integrate caveats do. Plotted as `u`/`v` level-curve families, which cross at right
   angles by Cauchy-Riemann (Mathematica-parity audit §8 rec #7). Known, accepted gap: a
   genuinely harmonic `u` whose φ′(x) doesn't algebraically cancel `y` on its own (e.g.
   `ln(x²+y²)`, needs `atan(y/x)` simplification nerdamer won't do without `.simplify()`, which
   §3 rules out as unsafe) is honestly refused rather than risking a wrong or partially-reduced
   answer — see §4's worked example.

Links directly to PDE §5G #22 (`u_xx+u_yy=0` as an analytic function's real part) conceptually;
the ODE/PDE Engine has no dedicated Laplace's-equation page to link to yet.

### Phase 2 — elementary functions *(P1)* — done 2026-07-24
5. **Complex exp, log, and powers** — done, numeric by design.
   `methods/complex-exp-log-powers.html` + `complex-exp-log-powers.js`, backed by `Complex.log`
   (already existed) and two new additions to `complex.js`: `Complex.logBranch(a,k)` and
   `Complex.powBranch(a,w,k)` — every branch is `exp(w·(log(a)+2πik))`, and nth roots turn out
   to just be `powBranch(a,1/n,k)` for `k=0..n-1`, verified in `tests/verify-complex.js` to
   reproduce `Complex.nthRoots` exactly. **Deliberately not routed through
   `complex-symbolic.js`**: `decompose()` (§4) refuses `sqrt`/`log`/fractional powers by name
   precisely because they're multivalued, and there is no honest way to hand back a single
   symbolic `u(x,y), v(x,y)` for a function that doesn't have one value at a point — the correct
   symbolic answer to "differentiate log(z)" is "which branch?", not a formula. So this page
   states the branch explicitly on screen (never silently), and the branch cut appears for free
   as a real seam in the domain-coloured plane once the evaluator is `Complex.log`/`Complex.pow`
   (principal, `Arg ∈ (−π,π]`, cut on the negative real axis) — confirmed live: colouring
   `Log(z)` shows a hard colour discontinuity crossing `z < 0`. Clicking any point lists that
   point's other branches (5 consecutive `k` for `Log`/general `z^w`, all `q` of them for
   rational `z^(p/q)` in lowest terms) with a back-check per row (`e^(value) = z`, or
   `value^q = z^p`), so "multivalued" is a table the visitor can read, not an assertion.
6. **Complex trig and hyperbolic functions** — done, numeric by design (same reasoning as #5's
   sibling pages, complex-functions.js and complex-arithmetic.js: entire/meromorphic functions
   with no branch to choose need no CAS). `methods/complex-trig-hyperbolic.html` +
   `complex-trig-hyperbolic.js`. The signature visual is `|f(x)|` along the real axis plotted
   against `|f(iy)|` along the imaginary axis on the same chart: for `sin`/`cos` the real-axis
   trace is flat near `[0,1]` while the imaginary-axis trace is a steep exponential — the direct
   picture of `sin(iy) = i·sinh(y)`. The same chart is genuinely informative for `tan`/`cot`
   too, for the opposite reason: real-axis trace spikes at the real poles (`π/2 + kπ`) while the
   imaginary-axis trace stays bounded (`tan(iy) = i·tanh(y)`, and `tanh` is bounded) — an
   unplanned but correct bonus of building one general chart instead of hard-coding the sin/cos
   case. A live identity check (`sin²z+cos²z=1`, `cosh²z−sinh²z=1`, evaluated at whatever point
   was last probed) confirms the extension to `ℂ` didn't break anything real-valued calculus
   relied on.

### Phase 3 — integration *(P0 — the heart of the course)*
7. **Contour Integration (parametrised)** — the definition, with the path animated.
8. **Cauchy-Goursat Theorem** — closed contour + analytic inside ⇒ 0. Show it numerically.
9. **Cauchy Integral Formula & derivatives** — values inside determined by the boundary.

### Phase 4 — series *(P1)*
10. **Taylor Series in ℂ** — reuses `CalculusSymbolic.taylorSeries`; radius = distance to the
    nearest singularity, which finally *explains* the real-case radius.
11. **Laurent Series & annuli** — the principal part; classification of singularities
    (removable / pole of order m / essential).

### Phase 5 — residues *(P0 — the payoff)*
12. **Residues & the Residue Theorem** — the engine's centrepiece.
13. **Real Integrals by Residues** — `∫₀^∞ dx/(1+x²)`, `∫₀^{2π} dθ/(a+b cosθ)`, Jordan's lemma.
    **Cross-link from Calculus §2 #7 (Improper Integrals).**
14. **Argument Principle & Rouché's Theorem** — counting zeros by winding number; the winding
    number is directly visible in the domain colouring.

### Phase 6 — mapping *(P2)*
15. **Conformal Mapping** — the before/after grid visual; conformality fails exactly where
    `f'(z) = 0`, and that is worth showing.
16. **Möbius Transformations** — circles-to-circles, fixed points, the cross-ratio.
17. **Schwarz-Christoffel** *(P3, stretch)* — polygon mapping; genuinely advanced.

---

## 7. Risks and open questions

- **Domain colouring may need a raw `<canvas>`.** It is a per-pixel RGB computation; Plotly's
  heatmap may be too slow or too coarse. Prototype this in Phase 0 before committing.
- **Branch cuts are a correctness hazard, not just a display one.** `log`, `sqrt`, and `z^α` are
  multivalued; a naive implementation silently picks a branch and produces answers that are
  wrong by `2πi`. Every multivalued function must state its branch on screen.
- **Essential singularities cannot be handled by the residue formulas** — they need the Laurent
  coefficient directly. Detect and route them, or refuse by name.
- **nerdamer's complex depth is unmeasured.** §4 covers only what was tested. Phase 0 must
  establish the boundary before methods are designed around assumed capability.
- **Numeric contour integration near a pole is delicate** — the integrand is large and the
  quadrature must not straddle the singularity. Choose contour radii deliberately.

---

## 8. Mathematica parity — plotting & visualization gap audit (added 2026-07-23)

Cross-checked against `ComplexPlot`, `ComplexPlot3D`, `ComplexRegionPlot`, `ComplexContourPlot`
(all core Wolfram Language, `reference.wolfram.com`), plus `RiemannSurfacePlot3D` and
`ComplexMapVisualization` (Wolfram Function Repository, not core language — noted as such below).

### Domain colouring (maps to plan Phase 1 #2)

| Mathematica feature | What it does visually | Status vs plan | Note |
|---|---|---|---|
| `ComplexPlot` default cyclic hue | Hue = `Arg[f]`, cycles counterclockwise around zeros, clockwise around poles; brightness from `Abs[f]` | Covered — matches planned hue/brightness scheme | Confirms the plan's hue-cycle-counting approach is exactly Mathematica's own pedagogical device, not a simplification |
| `ColorFunction` presets: `"CyclicLogAbs"`, `"CyclicArg"`, `"CyclicLogAbsArg"`, `"GlobalAbs"`, `"QuantileAbs"`, `"MaxAbs"`, `"LocalMaxAbs"`, `"CyclicReImLogAbs"`, `"ShiftedCyclicLogAbs"` | Multiple named colouring modes — some cycle log-magnitude as rings (contour-like), some highlight zeros dark / poles light, some are purely phase (no magnitude at all) | **GAP** — plan has only one fixed hue/brightness scheme | Worth adding a color-mode switcher, at minimum: (a) current phase+magnitude, (b) phase-only (pure `Arg`, no brightness) for clean zero/pole counting, (c) log-magnitude-as-rings — rings make `\|f(z)\|` level sets directly countable, which is a genuinely different teaching read than brightness gradients |
| `PlotLegends -> Automatic` (colour wheel) | Displays a colour-wheel key mapping hue back to phase angle | **GAP** — plan doesn't mention a legend/key | Cheap, high value: without a legend, "colour = phase" is not self-explanatory to a first-time viewer |
| `Mesh -> Automatic` showing `\|f\|` and `Arg[f]` contour curves overlaid on the colouring | Overlays level curves of magnitude and phase directly on the domain-coloured image | **GAP** — plan's domain colouring is flat colour only | Overlaying `\|f\|` iso-contours on top of the hue image is a low-cost canvas addition (draw contour lines after the pixel fill) and makes magnitude legible where brightness alone is hard to read precisely |
| Exclusions/branch-cut rendering as "sharp color transitions" at the cut, auto-detected | Visually renders the branch cut as a hard seam in the color field rather than an error or blank region | Partially covered — plan's §7 risk notes branch cuts must "state on screen" | Plan should specify *how*: render the seam as a visible line/discontinuity in the colouring itself (which naturally happens if the branch is computed correctly) plus an explicit on-screen label, not just correctness in the math |
| Custom `ColorFunction` receiving `Re[z], Im[z], \|z\|, Arg[z], Re[f], Im[f], \|f\|, Arg[f]` (8 args) | Lets any of those 8 quantities drive colour, not just `Arg[f]`/`Abs[f]` | Informational — not something to replicate as an API, but confirms the value of exposing `Re[f]`/`Im[f]` as alternate colour channels, see next row | |

### 3D surfaces (maps to plan §5 "3D surface plots" reuse row / Phase 4-5)

| Mathematica feature | What it does | Status vs plan | Note |
|---|---|---|---|
| `ComplexPlot3D` — height = `\|f(z)\|`, colour on the surface = `Arg[f(z)]` | Combines the 3D-surface approach already planned with domain colouring *on* the surface, rather than the two being separate views | **GAP** — plan lists flat `\|f(z)\|` surfaces and 2D domain colouring as two separate reuse items, not combined | High value, low cost: this is just applying the existing domain-colouring pixel shader as the surface's vertex/fragment colour instead of a flat Plotly colorscale — same `Scene3D.addSurface` call, different colour source |
| `ClippingStyle` + `ScalingFunctions -> "Log"` near poles | Caps or logarithmically compresses the vertical spike at a pole so the surface stays legible instead of shooting off-screen | **GAP** — not mentioned | Real problem for any `\|f(z)\|` surface with a pole in view (e.g. `1/z`, `1/sin z` pages in Phase 2/5) — without capping, the surface is unreadable near the singularity. Cheap fix: clip height at a configurable max and note "clipped" on screen |

### Contour / conformal mapping (maps to plan §6 items 15-16, Phase 6, and the "before/after grid" approach)

| Mathematica feature | What it does | Status vs plan | Note |
|---|---|---|---|
| `ComplexContourPlot` — filled/line contours of `Re[f]`, `Im[f]`, `Abs[f]`, or `Arg[f]` as level sets | Draws iso-lines of any of the four scalar fields derived from `f`, independent of domain colouring | **GAP** — plan doesn't separate these out; useful standalone for harmonic-function pages | For Phase 1 #4 (Harmonic Functions): plotting `u = Re[f]` and `v = Im[f]` as two separate contour families that cross orthogonally is a clean way to *show* the Cauchy-Riemann orthogonality claim, distinct from domain colouring |
| Conformal-map illustration via `ComplexPlot` mesh at `f'(z)=0` | Marks critical points directly on the mesh where conformality fails | Covered by plan's "conformality fails exactly where f'(z)=0" language | Confirms the plan's framing is right; just ensure the before/after grid renderer explicitly marks these points, not just relies on the visual becoming non-orthogonal |
| `StreamPlot` combined with `ComplexPlot` for field lines/potential lines (fluid flow, electrostatics framing) | Draws streamlines (flow) and equipotential lines together, both derivable from a harmonic conjugate pair | **GAP** — not in plan | Optional but pedagogically strong for harmonic functions (Phase 1 #4) since Churchill & Brown covers the fluid-flow/electrostatics interpretation explicitly; streamlines = level curves of the harmonic conjugate, which the engine already computes |
| `RiemannSurfacePlot3D` (Function Repository, **not core language**) | Plots the Riemann surface of a multivalued function (e.g. `sqrt`, `log`) as a literal 3D sheet structure showing how branches connect | **GAP**, optional/stretch | Not core Mathematica and non-trivial to build (parametric multi-sheet 3D mesh), but if built it would be the single most direct visual for "why branch cuts exist" — worth a stretch-goal note rather than a committed phase item |
| `ComplexMapVisualization` (Function Repository, **not core language**) | Purpose-built before/after conformal-map animation between z-plane and w-plane | Confirms plan's approach (item 15) is the right shape | Not a new capability, just validates the before/after grid design already planned |

### Recommended additions (highest value, ranked)

1. **Colour-wheel legend on every domain-coloured plot** (`PlotLegends`-equivalent) — trivial to add, currently the biggest self-explanatory gap.
2. **Magnitude contour overlay on domain colouring** (`\|f\|` iso-lines drawn over the hue field) — cheap canvas addition, makes magnitude precisely readable.
3. **Phase-only colour mode (no brightness)** as a toggle — isolates zero/pole counting from magnitude noise, useful specifically for the Argument Principle / Rouché page (item 14).
4. **Domain-coloured 3D surface** (`ComplexPlot3D`-style: height = `\|f\|`, surface colour = `Arg[f]`) — merges two already-planned reuse items into one strictly-better view, same underlying renderer.
5. **Pole-height clipping / log-scaling on 3D surfaces** — without it, every `\|f(z)\|` surface near a pole is unreadable; needed as soon as Phase 2 rational/trig functions are plotted in 3D.
6. **Explicit critical-point markers on the before/after conformal grid** where `f'(z)=0`, not just relying on the visual loss of orthogonality.
7. **Separate `Re[f]`/`Im[f]` contour-line view** for the harmonic-conjugate/Cauchy-Riemann pages — orthogonal crossing families are a more direct visual proof than domain colouring alone.
8. **Log-magnitude "ring" colour mode** (Mathematica's `"CyclicLogAbs"`) as a second domain-colouring preset — turns magnitude into countable rings the same way phase becomes countable hue cycles.
