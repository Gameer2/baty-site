# Complex Analysis Engine — Build Plan (V2)

> **Version 2 — animated two-plane mapping paradigm.**
> This is the revised build plan. The previous paradigm (domain colouring as flagship) is
> preserved verbatim in `COMPLEX_ANALYSIS_ENGINE_PLAN.md`; do not delete it. V2 keeps domain
> colouring as a *supplementary* view and promotes the animated two-plane map to the flagship
> visual for Phase 3+.

Everything needed to start this engine from nothing.

**Status: Phase 2 complete (6/6 topics shipped).** Phase 3 (contour integration) is next. See §6
for the per-topic build order and §4 for what changed along the way.

**Core Thesis:** *"A complex function is a geometric map from one plane to another. This engine shows you the map at every scale — global and local — on demand."*

**Scope of this file:** the Complex Analysis Engine. Companions:
- `CURRICULUM_ROADMAP.md` §9 — the topic list and priorities.
- `CALCULUS_ENGINE_PLAN.md` — the engine this one is modelled on. **Its §3 (hard-won facts
  about nerdamer) applies here verbatim and must not be re-derived.**
- `ANTIDERIVATIVE_STRATEGY.md` — relevant because the residue theorem is, in practice, an
  integration engine.

Last updated: 2026-07-24 (Major revision: replaced domain colouring with animated two-plane mapping as primary visual paradigm. Phase 1 & 2 shipped under old paradigm; Phase 3+ will use new paradigm. See §2 for the new visual approach and §6 for the revised build order.)

---

## 1. Textbook basis

**Churchill & Brown, *Complex Variables and Applications*** — the near-universal US
undergraduate text, cross-checked against Gamelin, *Complex Analysis*. Scope is a standard
one-semester junior/senior course: complex numbers → analytic functions → contour integration →
series → residues → conformal mapping.

Chapter order in Churchill & Brown maps almost exactly onto the build order in §6, which is
deliberate — a student taking the course should be able to follow the catalog top to bottom.

---

## 2. The one thing that makes this engine different

**Every other engine plots a function as a curve or a surface. Complex functions have a
4-dimensional graph and cannot be plotted that way at all.**

`f: ℂ → ℂ` needs two real dimensions in and two out. This is not a minor presentation problem —
it is *the* problem of the subject, and the reason complex analysis feels abstract to students
who can otherwise picture everything in calculus.

**This engine solves it by showing the mapping in motion:**

1. **The Animated Map** — two planes side-by-side. The domain shows shapes (grid, circles, paths, points). The codomain shows their images under `f(z)`. The mapping is animated in real-time — you watch the plane deform.

2. **Global Mode** — the full domain is visible. The grid deforms continuously, revealing the global structure of the mapping. Poles, zeros, and critical points are marked.

3. **Local Mode** — click any point to zoom in. The view scales to show infinitesimal behavior: the derivative as scaling + rotation, angle preservation (or failure), CR equations verified at that point.

4. **Seamless Transition** — zoom from global to local with a single click. The grid refines automatically. The mapping scales with you.

**This is not domain colouring** (which compresses 4D into 2D in a way that is clever but not geometric). This is the actual geometry of the mapping, shown directly. Domain colouring remains available as a supplementary view (see §6 Phase 1 #2), but the animated two-plane map is the flagship visual.

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
└─ assets/js/<method>.js DOM wiring only. No math.
└─ CAS (cas-client.js) timeout + terminate + respawn
└─ cas-worker.js math.js + nerdamer + calculus-symbolic + complex-symbolic
└─ assets/js/complex-symbolic.js pure, DOM-free, Node-testable
└─ assets/js/complex-geometric.js geometric computation engine
└─ assets/js/complex-animation.js time-parametrized animation engine
└─ assets/js/complex-viewer.js two-plane viewer
└─ assets/js/complex-shapes.js shape system
└─ assets/js/calc-core.js shared nerdamer/math.js injection + helpers
```

`complex-symbolic.js` is in `cas-worker.js`'s `importScripts` and `OPS` whitelist (`cauchyRiemann`,
`harmonicConjugate`), with `cas-client.js` wrappers of the same names; followed the 7-step
"Adding a method" checklist in `CALCULUS_ENGINE_PLAN.md` §4.

**Why the shared worker rather than a new one:** residues need differentiation and series
expansion; Laurent series need Taylor series. `CalculusSymbolic` already provides both, verified.
A second worker would duplicate the nerdamer bundle and the kill-switch machinery for no gain.

### New modules for the animated map paradigm

| Module | Purpose | Priority |
|---|---|---|
| `complex-viewer.js` | Two-plane viewer (domain + codomain) with linked views | Critical |
| `complex-animation.js` | Time-parametrized animation engine with global/local modes | Critical |
| `complex-geometric.js` | Grid generation, shape mapping, critical point detection | Critical |
| `complex-shapes.js` | Shape system (points, grids, circles, paths, freehand) | Critical |

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
| 2D plotting (grid maps, contour plots) | Plotly scatter + line traces | The two-plane viewer uses Plotly for rendering |

**Note the dependency direction:** this engine consumes the Calculus Engine, not the reverse.
Build it after Calculus Phase 5, or at least after Taylor/Power Series (both done).

---

## 6. Topics and build order

Numbered to match `CURRICULUM_ROADMAP.md` §9.

### Phase 0 — foundation — done
Probed nerdamer's complex capabilities (§4), promoted the `cx` complex-arithmetic helper into a
shared module (`complex.js`), created `tests/verify-complex.js`.

**New infrastructure for Phase 3+:**

| Module | Purpose | Status |
|---|---|---|
| `complex-viewer.js` | Two-plane viewer (domain + codomain) | Planned |
| `complex-animation.js` | Time-parametrized animation engine | Planned |
| `complex-geometric.js` | Grid generation, shape mapping, critical point detection | Planned |
| `complex-shapes.js` | Shape system (points, grids, circles, paths, freehand) | Planned |

### Phase 1 — the plane and analyticity *(P0)* — done 2026-07-24
1. **Complex Arithmetic & the Plane** — algebraic and polar form, modulus/argument, conjugate,
   De Moivre, `n`-th roots of unity drawn on the circle. `methods/complex-arithmetic.html` +
   `complex-arithmetic.js`, numeric (`complex.js` + Plotly Argand plane).
2. **Complex Functions & Domain Colouring** — the original flagship visual; every subsequent page
   reuses it as a supplementary view. `methods/complex-functions.html` + `complex-functions.js`,
   numeric (`domain-coloring.js`). **Note:** The animated two-plane map (§2) will become the new
   primary visual for Phase 3+; domain colouring remains available as a secondary view.
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
   angles by Cauchy-Riemann. Known, accepted gap: a genuinely harmonic `u` whose φ′(x) doesn't
   algebraically cancel `y` on its own (e.g. `ln(x²+y²)`, needs `atan(y/x)` simplification
   nerdamer won't do without `.simplify()`, which §3 rules out as unsafe) is honestly refused
   rather than risking a wrong or partially-reduced answer.

### Phase 2 — elementary functions *(P1)* — done 2026-07-24
5. **Complex exp, log, and powers** — done, numeric by design.
   `methods/complex-exp-log-powers.html` + `complex-exp-log-powers.js`, backed by `Complex.log`
   (already existed) and two new additions to `complex.js`: `Complex.logBranch(a,k)` and
   `Complex.powBranch(a,w,k)` — every branch is `exp(w·(log(a)+2πik))`, and nth roots turn out
   to just be `powBranch(a,1/n,k)` for `k=0..n-1`, verified in `tests/verify-complex.js` to
   reproduce `Complex.nthRoots` exactly. **Deliberately not routed through `complex-symbolic.js`**:
   `decompose()` (§4) refuses `sqrt`/`log`/fractional powers by name precisely because they're
   multivalued. So this page states the branch explicitly on screen (never silently), and the
   branch cut appears for free as a real seam in the domain-coloured plane. Clicking any point
   lists that point's other branches with a back-check per row, so "multivalued" is a table the
   visitor can read, not an assertion.
6. **Complex trig and hyperbolic functions** — done, numeric by design (same reasoning as #5's
   sibling pages: entire/meromorphic functions with no branch to choose need no CAS).
   `methods/complex-trig-hyperbolic.html` + `complex-trig-hyperbolic.js`. The signature visual
   is `|f(x)|` along the real axis plotted against `|f(iy)|` along the imaginary axis on the
   same chart: for `sin`/`cos` the real-axis trace is flat near `[0,1]` while the imaginary-axis
   trace is a steep exponential — the direct picture of `sin(iy) = i·sinh(y)`. The same chart
   is genuinely informative for `tan`/`cot` too, for the opposite reason: real-axis trace spikes
   at the real poles (`π/2 + kπ`) while the imaginary-axis trace stays bounded (`tan(iy) =
   i·tanh(y)`, and `tanh` is bounded). A live identity check confirms the extension to `ℂ`
   didn't break anything real-valued calculus relied on.

### Phase 3 — integration *(P0 — the heart of the course)* — revised for animated map paradigm

**All Phase 3+ pages will use the animated two-plane map as their primary visual.** The domain
colourer remains available as a supplementary view.

7. **Contour Integration (parametrised)** — the definition, with the path animated.

   *What the student sees:* A contour in the domain. A point travels along it. The image point
   travels along the image path in the codomain. The integral accumulates: `∫ f(z) dz`.

   *Interactive elements:*
   - Draw a contour (freehand or preset)
   - Watch the path traverse in both planes
   - See the integral accumulate numerically and visually
   - Trail shows the partial integral as a vector

8. **Cauchy-Goursat Theorem** — closed contour + analytic inside ⇒ 0. Show it numerically.

   *What the student sees:* A closed contour in the domain, its image path in the codomain,
   and the integral displayed.

   *Interactive elements:*
   - Draw a closed contour
   - See the integral = 0 (for analytic functions)
   - Deform the contour → integral stays 0
   - Cross a singularity → integral changes

9. **Cauchy Integral Formula & derivatives** — values inside determined by the boundary.

   *What the student sees:* A point `a` inside a contour. The boundary integral tracks it.

   *Interactive elements:*
   - Place a point `a` inside a contour
   - Formula: `f(a) = (1/2πi) ∮ f(z)/(z-a) dz`
   - Drag `a` → the integral tracks it
   - Move the contour → still gives the same value

### Phase 4 — series *(P1)* — revised for animated map paradigm

10. **Taylor Series in ℂ** — reuses `CalculusSymbolic.taylorSeries`; radius = distance to the
    nearest singularity, which finally *explains* the real-case radius.

    *What the student sees:* The domain with a circle of convergence. The Taylor approximation
    animated.

    *Interactive elements:*
    - Select a center `z₀`
    - See the circle of convergence
    - Animate the partial sum: `Σ_{n=0}^N a_n (z-z₀)^n`
    - Approximation good inside the circle, bad outside

11. **Laurent Series & annuli** — the principal part; classification of singularities
    (removable / pole of order m / essential).

    *What the student sees:* The domain with an annulus of convergence. The Laurent approximation
    animated.

    *Interactive elements:*
    - Select a center `z₀`
    - See the annulus of convergence
    - Toggle principal part on/off
    - Animate the partial sum
    - Singularity classified automatically

### Phase 5 — residues *(P0 — the payoff)* — revised for animated map paradigm

12. **Residues & the Residue Theorem** — the engine's centrepiece.

    *What the student sees:* A contour in the domain, poles inside marked. The integral computed.

    *Interactive elements:*
    - Draw a contour
    - Poles inside detected and marked
    - Residues computed for each pole
    - Integral = `2πi·Σ Res`
    - Numeric contour integration verifies
    - Deform the contour → same result (as long as poles inside stay inside)

13. **Real Integrals by Residues** — `∫₀^∞ dx/(1+x²)`, `∫₀^{2π} dθ/(a+b cosθ)`, Jordan's lemma.
    **Cross-link from Calculus §2 #7 (Improper Integrals).**

    *What the student sees:* A real integral on one side, the complex contour integral on the other.

    *Interactive elements:*
    - Select a real integral
    - See the corresponding complex contour
    - Residue theorem gives the answer
    - Real integral computed numerically to verify
    - Real method vs complex method side-by-side

14. **Argument Principle & Rouché's Theorem** — counting zeros by winding number.

    *What the student sees:* A contour in the domain, its image path in the codomain.

    *Interactive elements:*
    - Draw a contour
    - See the image path in the codomain
    - Winding number around 0 computed
    - Zeros and poles inside counted
    - Winding number = zeros - poles (with multiplicity)

### Phase 6 — mapping *(P2)* — revised for animated map paradigm

15. **Conformal Mapping** — the before/after grid visual; conformality fails exactly where
    `f'(z) = 0`, and that is worth showing.

    *What the student sees:* A grid in the domain, its image in the codomain. Critical points marked.

    *Interactive elements:*
    - Toggle grid on/off
    - See angles preserved (or not)
    - Critical points marked: ● where `f'(z)=0`
    - At critical points, angles NOT preserved

16. **Möbius Transformations** — circles-to-circles, fixed points, the cross-ratio.

    *What the student sees:* Circles in the domain, their images in the codomain.

    *Interactive elements:*
    - Drag parameters `a, b, c, d`
    - See circles map to circles/lines
    - Fixed points marked: where `f(z)=z`

17. **Schwarz-Christoffel** *(P3, stretch)* — polygon mapping; genuinely advanced.

    *What the student sees:* A polygon in the codomain, the preimage in the domain.

    *Interactive elements:*
    - Draw a polygon
    - See the mapping animated

---

## 7. The Shape System

Shapes are the primary interaction in the animated map paradigm. They exist in the domain and their
images appear in the codomain.

### Shape Types

| Shape | Domain representation | What it reveals |
|---|---|---|
| **Point** | A dot at `z₀` | Where does `z₀` go? |
| **Grid** | Rectangular lattice | Conformality (angles preserved) |
| **Polar grid** | Radial + angular lines | How radial/angular behavior transforms |
| **Circle** | Center + radius | Circles don't stay circles (except Möbius) |
| **Path** | Parametrized curve | Contour integrals, tracing |
| **Rectangle** | Four corners | How areas change |
| **Triangle** | Three vertices | Angle preservation (sum of angles = π?) |
| **Sector** | Arc + two radii | How sectors map |
| **Freehand** | User-drawn curve | Arbitrary mapping behavior |

### Shape Interactions

| Action | Behavior |
|---|---|
| **Drag** | Move a point/circle center/vertex; image updates in real-time |
| **Resize** | Change radius/rectangle size; image updates |
| **Draw** | Draw a path freehand; image traces it |
| **Animate** | Shape morphs/deforms over time; image morphs with it |
| **Trace** | A point moves along a shape; its image traces the corresponding path |

### Critical Point Detection

```javascript
// Mark where f'(z) = 0
function findCriticalPoints(f, xRange, yRange, resolution) {
    // Compute |f'(z)| on grid
    // Find local minima (where gradient is zero)
    // Verify f'(z) ≈ 0 numerically
    return criticalPoints;
}
```

---

## 8. The Animation System

### Global Animations

| Name | Description | Use case |
|---|---|---|
| **Flow** | Grid flows continuously | Default view |
| **Sweep** | Point moves along path | Contour integration |
| **Morph** | Shape deforms | Show deformation |
| **Trace** | Path appears gradually | Show path tracing |

### Local Animations

| Name | Description | Use case |
|---|---|---|
| **Zoom-in** | Smooth zoom to point | Local mode entry |
| **Tangent sweep** | Vectors rotate through angles | Show angle preservation |
| **Taylor convergence** | Taylor approximation improves | Show local approximation |

---

## 9. Risks and open questions

- **Animated map performance** — rendering two planes with real-time animation may be
  computationally intensive. Need to optimize with WebGL or efficient canvas rendering.
- **Branch cuts** are a correctness hazard, not just a display one. `log`, `sqrt`, and `z^α` are
  multivalued; a naive implementation silently picks a branch and produces answers that are
  wrong by 2πi. Every multivalued function must state its branch on screen.
- **Essential singularities** cannot be handled by the residue formulas — they need the Laurent
  coefficient directly. Detect and route them, or refuse by name.
- **nerdamer's complex depth is unmeasured.** §4 covers only what was tested. Phase 0 must
  establish the boundary before methods are designed around assumed capability.
- **Numeric contour integration near a pole** is delicate — the integrand is large and the
  quadrature must not straddle the singularity. Choose contour radii deliberately.
- **Global vs local mode transition** — needs to be smooth and intuitive. The student should
  not lose context when zooming in.

---

## 10. What This Engine Does Differently (Summary)

| Aspect | Traditional | This Engine |
|---|---|---|
| Primary visual | Formula or graph | Animated two-plane mapping |
| Domain colouring | Primary visual | Supplementary view |
| Global view | Static | Continuous deformation |
| Local view | Separate or absent | Seamless zoom from global to local |
| Conformality | Stated | Visible in grid angles at every scale |
| Critical points | Mentioned | Marked globally, visible locally |
| Derivative | Abstract number | Visualized as scaling + rotation locally |
| Integration | Formula | Animated accumulation along path |
| Series | Formula | Animated approximation with convergence circle |
| Branch cuts | Explained | Seen as seams when crossing in animation |

---

## 11. The Final Thesis

> "This engine shows you what a complex function does at every scale. Watch the entire plane
> deform under the mapping. Zoom in to any point and see the infinitesimal behavior — the
> scaling, the rotation, the angle preservation. Complex analysis is the geometry of the plane
> in motion, from the largest scale to the smallest."

Domain colouring is a supplementary view; the animated two-plane map is the flagship. The student
never asks "what does this function look like?" — they watch it happen. And they can zoom in to
any point to see the local geometry that makes complex analysis work.