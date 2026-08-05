# The Lab — Full Curriculum & Build Roadmap

Every method below is checked against the actual textbook that teaches it, not against
which engine page felt convenient. The goal: when you sit down to build, you know exactly
what to build, in what order (the order the subject itself requires — later methods lean on
earlier ones), and roughly when relative to everything else on the site.

## How this document is organized

- One section per engine. Each section names its real textbook(s) — the same way a
  university course would list "required text."
- Methods are listed in **teaching order**, not alphabetical — the order matches how the
  subject builds on itself, so if you build top-to-bottom within an engine you never hit a
  method that assumes something you haven't built yet.
- Every method has: what it is, why a student actually needs it, how it should look on the
  site (in the language the site already uses — iteration tables, step sliders, live plots),
  and a **Priority** tag.
- A final section flattens everything into one cross-engine build order.

## Priority tiers

- **P0 — Build next.** Fills an obvious hole in an engine that's already live or already has
  momentum. A student who knows the existing page would be surprised this isn't here yet.
- **P1 — Core curriculum.** Appears in every mainstream edition of the textbook; heavily
  tested, heavily used. Build once P0 is clear.
- **P2 — Standard but secondary.** Real textbook content, but a given course sometimes skips
  it, or it's less frequently the thing a student is stuck on at 11pm before an exam.
- **P3 — Advanced / enrichment.** Appears in some courses, not all; specialized, or a natural
  "stretch" feature once the core of that engine is solid.

## A structural note carried over from the last planning pass

Two engines already contain content that is, strictly speaking, Numerical Analysis textbook
material rather than material from their own subject's textbook:

- **Linear Algebra Engine** already has Gaussian elimination with partial pivoting (a Ch. 6
  Numerical Analysis topic) living on a "Linear Algebra" page.
- **ODE Engine** already has Euler and RK4 (a Ch. 5 Numerical Analysis topic) living on an
  "ODE" page.

Decision (kept as-is per the last discussion): that precedent stays. New numerical methods
that are the direct siblings of what's already there (Jacobi/Gauss-Seidel next to Gaussian
elimination; Heun's/multistep next to Euler/RK4) stay in those engines too, for consistency.
Everything else that's genuinely Numerical Analysis content — root finding, interpolation,
numerical differentiation/integration, iterative eigenvalue methods, nonlinear systems — goes
in the Numerical Engine, which is this site's actual Numerical Analysis textbook engine.

---

# 1. Numerical Engine

**Textbook basis:** Burden & Faires, *Numerical Analysis* (the standard US text) — cross-
checked against Chapra & Canale, *Numerical Methods for Engineers*. This is the flagship;
its scope is exactly this book's table of contents, minus the two chapters that already live
in Linear Algebra Engine and ODE Engine per the note above.

**Status: complete.** All 30 items below are built — 29 method pages under
`engines/numerical/methods/`, covered by `tests/verify.js` (76/76 passing). Reconciled
2026-08-02 after a full file-by-file check found the status markers badly stale (only the
first 6 items were marked built; the other 24 had shipped without the roadmap being updated).

## 1A. Solutions of Equations in One Variable (Ch. 2)

#### 1. Bisection Method
- **Status:** ✅ Built.
- Halves a bracketing interval `[a, b]` where `f(a)·f(b) < 0` until the root is trapped
  within tolerance. Slow (linear convergence) but never fails to converge once bracketed —
  the reason it's taught first.

#### 2. Fixed-Point Iteration
- **Status:** ✅ Built. (Bumped P1 → P0 during the Tier 0 pass, 2026-07-20 — built alongside
  Newton-Raphson since it's the conceptual prerequisite the roadmap itself flags below.)
- Rewrite `f(x) = 0` as `x = g(x)`, then iterate `x_{n+1} = g(x_n)`. Converges only if
  `|g'(x)| < 1` near the root — the first place students meet the idea that a method can
  *diverge*, which is the conceptual hinge the rest of the chapter hangs on.
- **Why it matters:** Every other method in this section (Newton, Secant) is a smarter
  choice of `g`. Skipping this makes Newton's method look like it came from nowhere.
- **On the site:** input `g(x)` and `x₀`, iteration table of `x_n`, a cobweb-diagram plot
  (the classic staircase/spiral converging or flying apart toward `y = x`) — visually
  distinct from the bisection bracket viz already built.
- **Depends on:** nothing new; pairs directly with Bisection's existing UI shell.

#### 3. Newton-Raphson Method
- **Status:** ✅ Built.
- `x_{n+1} = x_n - f(x_n)/f'(x_n)`. Quadratic convergence near a simple root — this is the
  method every student actually remembers from the course, and its absence next to Bisection
  on a "root-finding" page is the single most obvious gap on the whole site.
- **Why it matters:** It's the workhorse method, and it's the natural home for the "empirical
  convergence order" idea and the Newton-fractal basin-of-convergence visual discussed
  earlier — both live here once this exists.
- **On the site:** same input surface as Bisection (`f(x)`, `x₀`, tolerance, max iter),
  iteration table with an added `f'(xₙ)` column, tangent-line-per-step overlay on the f(x)
  plot (draw the actual tangent line at each iterate before it jumps to the next point).
- **Depends on:** `Engine.derivativeFx` already exists in `engine-core.js` — this is mostly
  UI work, the math hook is already built.

#### 4. Secant Method
- **Status:** ✅ Built.
- Same idea as Newton but replaces `f'(x_n)` with a finite-difference slope through the last
  two iterates — for when the derivative is hard or expensive to compute. Superlinear
  convergence (order ≈ 1.618, the golden ratio — a genuinely fun fact to surface on the
  page).
- **On the site:** needs two starting points `x₀, x₁` instead of one; plot shows the secant
  line through the last two points instead of a tangent.
- **Depends on:** none beyond what Newton needs.

#### 5. Method of False Position (Regula Falsi)
- **Status:** ✅ Built. (Priority was P1 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- A bracketed hybrid: same secant-line construction as above, but always keeps the two
  endpoints on opposite sides of the root like Bisection — trading some speed for the
  guarantee it never diverges. Textbooks pair it directly with Secant to teach the
  bracketed-vs-open-method distinction.
- **On the site:** reuse the bracket-viz component already built for Bisection; the fill bar
  narrows unevenly instead of always by half, which is itself the visual lesson.

#### 6. Newton's Method for Multiple Roots (Modified Newton)
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Plain Newton slows to linear convergence at a repeated root (`f'(root) = 0` too). The fix:
  `x_{n+1} = x_n - m·f(x_n)/f'(x_n)` where `m` is the root's multiplicity, restoring
  quadratic convergence.
- **On the site:** a toggle on the Newton page ("multiplicity") plus a side-by-side
  convergence-order comparison against plain Newton on the same repeated-root example —
  ties directly into the "empirical order of convergence" diagnostic.

#### 7. Aitken's Δ² and Steffensen's Method
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Aitken's Δ² accelerates any linearly-converging sequence (e.g. plain Fixed-Point Iteration)
  algebraically, without changing the underlying formula. Steffensen's Method bolts Aitken's
  acceleration directly onto Fixed-Point Iteration to recover Newton-like quadratic
  convergence without ever computing a derivative.
- **On the site:** an "accelerate" button on the Fixed-Point Iteration page that overlays the
  accelerated sequence next to the raw one — a great, concrete demonstration of "the same
  numbers, converging twice as fast," which is exactly the kind of live proof this site is
  built to show.

#### 8. Müller's Method
- **Status:** ✅ Built. (Priority was P3 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Fits a parabola through the last three iterates instead of a line, letting it find complex
  roots even starting from real numbers. The standard method for polynomial root-finding when
  roots aren't all real.
- **On the site:** pairs naturally with the polynomial-specific deflation method below.

#### 9. Zeros of Polynomials — Horner's Method + Deflation
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Horner's method evaluates a polynomial (and its derivative, via synthetic division) in
  minimal operations; once one root is found, deflate the polynomial by dividing it out and
  repeat. This is how you find *all* roots of a polynomial, not just the one nearest your
  guess.
- **On the site:** enter polynomial coefficients, watch roots get found and struck off one at
  a time, degree ticking down — satisfying, countable progress, and a legitimate practical
  need (finding all roots, not one).

## 1B. Interpolation and Polynomial Approximation (Ch. 3)

#### 10. Lagrange Interpolation
- **Status:** ✅ Built.
- Constructs the unique degree-`(n-1)` polynomial through `n` points directly via the
  Lagrange basis functions.

#### 11. Neville's Method
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Computes the interpolated *value* at one specific point via a recursive table, without ever
  building the explicit polynomial — cheaper when you only need one evaluation, and the
  textbook's bridge from Lagrange to divided differences.
- **On the site:** the recursive table itself *is* the visualization — a triangular grid
  filling in cell by cell, exactly the kind of "nothing hidden" transparency the site already
  values in its iteration tables.

#### 12. Newton's Divided-Difference Formula
- **Status:** ✅ Built. (Priority was P1 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Builds the same interpolating polynomial as Lagrange, but incrementally — add a new data
  point without recomputing everything from scratch. The practical reason real interpolation
  code uses this form instead of raw Lagrange.
- **On the site:** the divided-difference triangle table (a staple visual in every numerical
  analysis textbook) with a "add another point" button that visibly extends the table and the
  fitted curve live.

#### 13. Hermite Interpolation
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Matches not just function values but derivative values at each point too — doubles the
  data used per point and gets a smoother, more accurate fit.
- **On the site:** points table gains an optional `f'(x)` column; overlay the Hermite curve
  against a plain Lagrange curve through the same points to show the visible difference in
  smoothness.

#### 14. Cubic Spline Interpolation
- **Status:** ✅ Built.
- Instead of one high-degree polynomial through all points (which oscillates wildly — Runge's
  phenomenon), fit a separate cubic between each pair of adjacent points, constrained to match
  value, slope, and curvature where they meet. This is what every real plotting/graphics
  library actually uses.
- **Why it matters:** it is the direct, dramatic answer to Lagrange's weak point. Toggle
  "equally spaced points, degree 10" on the existing Lagrange page and the curve visibly
  blows up at the edges (Runge's phenomenon) — then switch to splines on the same points and
  it stays smooth. That side-by-side is one of the most convincing things a numerical methods
  page can show, and the machinery for it (tridiagonal system solve) is small.
- **On the site:** natural extension of the existing Lagrange page as a second curve-fit mode,
  not a new page.

## 1C. Numerical Differentiation and Integration (Ch. 4)

#### 15. Numerical Differentiation (Forward, Backward, Central Difference)
- **Status:** ✅ Built. (Priority was P1 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Approximates `f'(x)` from function values alone via finite-difference formulas; central
  difference is second-order accurate, the other two are first-order — the first place
  students see truncation error stated as an explicit `O(h)` / `O(h²)` claim they can verify.
- **On the site:** a slider on `h` with a live-updating error-vs-true-derivative readout
  (when `f'(x)` is known symbolically via `Engine.derivativeFx`) — turns an abstract "order of
  accuracy" claim into a number visibly shrinking as `h` shrinks, then visibly *growing again*
  past a certain point (floating-point cancellation) — a genuinely eye-opening, rarely-shown
  detail.

#### 16. Richardson Extrapolation
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Combines two estimates at different step sizes to cancel the leading error term
  algebraically, producing a higher-order estimate for free. The general trick that Romberg
  Integration below is one specific application of.
- **On the site:** small add-on toggle on the differentiation page ("extrapolate") showing
  the error drop by an order of magnitude with no new function evaluations needed.

#### 17. Trapezoidal Rule
- **Status:** ✅ Built. (Priority was P0 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Approximates `∫f(x)dx` by summing trapezoid areas under the curve. The simplest numerical
  integration rule and the on-ramp to everything else in this section.
- **On the site:** shaded trapezoids under the curve, a slider for number of subintervals,
  running total updating live — visually similar territory to the existing Riemann-sum mode
  in Calculus Engine, but this is the numerical-analysis-book version with an explicit,
  provable error bound shown alongside the estimate.

#### 18. Simpson's Rule (1/3 and 3/8)
- **Status:** ✅ Built. (Priority was P0 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Fits parabolas instead of straight lines between points, two orders of accuracy better than
  Trapezoidal for smooth functions. The rule every engineering student has memorized the name
  of but rarely sees animated.
- **On the site:** race Trapezoidal vs. Simpson's on the same integral, same number of
  subintervals, both converging toward the true value — a direct, honest "why does the parabola
  one win" demonstration.

#### 19. Romberg Integration
- **Status:** ✅ Built. (Priority was P1 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Applies Richardson extrapolation repeatedly to a sequence of Trapezoidal-rule estimates,
  building a triangular table where each column is dramatically more accurate than the last.
- **On the site:** the Romberg table itself, filling in top-to-bottom, left-to-right — another
  natural fit for the site's love of a live-filling grid.

#### 20. Adaptive Quadrature
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Instead of a fixed number of subintervals everywhere, recursively subdivide only where the
  function is misbehaving (checked via Simpson's rule at two resolutions per interval) —
  spend effort where it's needed.
- **On the site:** a visual where subinterval width visibly shrinks in the "hard" regions of
  the function and stays wide in the "easy" regions — makes the abstract idea of adaptivity
  immediately legible.

#### 21. Gaussian Quadrature
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Instead of evenly-spaced sample points, choose specific optimal points (roots of Legendre
  polynomials) that make an `n`-point rule exact for polynomials up to degree `2n-1` — far
  more accurate per function evaluation than Simpson's.
- **On the site:** overlay the (uneven, specifically-placed) sample points against Simpson's
  even ones on the same function, same point count, and show the accuracy gap.

## 1D. Direct Methods — cross-reference only

Gaussian Elimination, LU/Cholesky Decomposition: **kept in Linear Algebra Engine** per the
existing-precedent decision. See Section 3 below. Not duplicated here.

## 1E. Iterative Techniques in Matrix Algebra — cross-reference only

Jacobi, Gauss-Seidel, SOR, Conjugate Gradient: **kept in Linear Algebra Engine** for the same
reason. See Section 3.

## 1F. Approximation Theory (Ch. 8)

#### 22. Discrete Least Squares Approximation
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Fits a low-degree polynomial to noisy data by minimizing total squared error — the
  numerical-analysis-book treatment of the same math the Statistics Engine's regression uses,
  but framed as function approximation rather than statistical inference (no p-values, no
  confidence intervals — just "best-fitting curve").
- **On the site:** degree slider (1 through 5) over pasted data points, fitted curve updating
  live, residual-squared readout — a genuinely different lens on the same numbers as the
  Statistics Engine's regression tool, worth having once that engine's core is done.

#### 23. Chebyshev Polynomials & Economization
- **Status:** ✅ Built. (Priority was P3 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Chebyshev points minimize interpolation error (they're the fix for Runge's phenomenon that
  doesn't require switching to splines) and Chebyshev economization shrinks a high-degree
  Taylor polynomial down to a much lower degree with barely any accuracy loss.
- **On the site:** toggle "equally spaced vs. Chebyshev spaced" on the Lagrange/spline page —
  directly answers "is there a way to fix Runge's phenomenon without splines," which a
  curious student will ask right after seeing #14.

## 1G. Numerically Approximating Eigenvalues (Ch. 9)

#### 24. The Power Method
- **Status:** ✅ Built. (Priority was P1 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Repeatedly multiply a matrix by a vector and renormalize; the vector converges to the
  dominant eigenvector, and the scaling factor converges to the dominant eigenvalue. This is
  distinct from Linear Algebra Engine's existing *exact* 2×2 eigenvalue solve — this is the
  genuinely iterative, numerical-analysis-book method used for large matrices where solving
  the characteristic polynomial directly isn't practical.
- **On the site:** an animated arrow (the current vector estimate) visibly rotating and
  stretching toward its final direction over successive multiplications — a satisfying,
  literal "watch it converge" visual distinct from anything else on the site.

#### 25. Inverse Power Method
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Apply the Power Method to `(A - σI)⁻¹` instead of `A` to converge to whichever eigenvalue is
  *closest to σ*, not just the largest — lets you target any eigenvalue, not only the
  dominant one.
- **On the site:** a draggable `σ` value showing which eigenvalue "wins" as you slide it
  across the spectrum.

#### 26. The QR Algorithm
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Repeatedly factor `A = QR` and reassemble as `RQ`; the matrix converges toward upper-
  triangular form with all eigenvalues on the diagonal at once — the industrial-strength
  method (what `eig()` actually calls) versus the Power Method's one-eigenvalue-at-a-time
  approach.
- **Depends on:** QR/Gram-Schmidt decomposition (Section 3, #34).

## 1H. Numerical Solutions of Nonlinear Systems (Ch. 10)

#### 27. Newton's Method for Nonlinear Systems
- **Status:** ✅ Built. (Priority was P2 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Generalizes Newton-Raphson to several equations and several unknowns at once, using the
  Jacobian matrix in place of a single derivative. Distinct from Newton's method *for
  optimization* — that one solves `∇f(x) = 0` to *minimize* a single function; this one solves
  `F(x) = 0` for a vector-valued `F` directly.
- **On the site:** 2-equation, 2-unknown case only (visualizable): both curves plotted in the
  plane, intersection point being homed in on step by step.

#### 28. Broyden's Method
- **Status:** ✅ Built. (Priority was P3 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- A quasi-Newton method for systems: approximates the Jacobian from successive function
  evaluations instead of computing it directly — useful once the Jacobian is expensive or
  unavailable. Natural "advanced" follow-up to #27.

## 1I. Boundary-Value Problems (Ch. 11) — stretch

#### 29. The Shooting Method
- **Status:** ✅ Built. (Priority was P3 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Converts a boundary-value ODE problem into a sequence of initial-value problems, adjusting
  the guessed initial slope (via Bisection or Secant, tying back into Section 1A) until the
  far boundary condition is hit.
- **Depends on:** an ODE solver (Section 4).

#### 30. Finite-Difference Method for BVPs
- **Status:** ✅ Built. (Priority was P3 — confirmed shipped and covered by `tests/verify.js`, reconciled 2026-08-02.)
- Replaces derivatives in the ODE with difference formulas at a grid of points, turning the
  whole boundary-value problem into one linear system solved all at once.
- **Depends on:** a linear solver (Section 3).

---

# 2. Calculus Engine

**Textbook basis:** Stewart, *Calculus: Early Transcendentals* (the most common US text) —
cross-checked against Thomas' *Calculus*. Scope is deliberately the *analytic* side of
calculus only — anything that's really a Numerical Analysis approximation technique (numeric
integration/differentiation) has already been moved to the Numerical Engine above.

**Already built:** Limits, L'Hôpital's Rule, Curve Sketching, Applied Optimization,
u-Substitution, Integration by Parts, Partial Fractions, Trigonometric Substitution,
Riemann Sums, Convergence Tests, Power Series & Radius of Convergence, Taylor Series,
Vectors in Space, Partial Derivatives & Tangent Planes, Volumes of Revolution, Multiple
Integrals, Lagrange Multipliers — each its own page under
`engines/calculus/methods/`. See `docs/CALCULUS_ENGINE_PLAN.md` for the engine's architecture
and build order.

Note: the midpoint Riemann sum (`engines/calculus/methods/riemann-sums.html`, backed by
`Algorithms.runRiemannSum` in `algorithms.js`) stays here — it's the *definition* of the
integral as every calculus book teaches it (the limit of Riemann sums), not a
numerical-analysis approximation technique. That distinction is exactly why
Trapezoidal/Simpson's/Romberg moved out and this didn't.

## 2A. Limits and Derivatives

#### 1. Limits — Numerically and Graphically
- **Status:** ✅ Built 2026-07-21 — `engines/calculus/methods/limits.html`. Verified by
  `tests/verify-calculus.js`. Went beyond "numerically and graphically": limits are solved
  *symbolically* (exact `1/2`, `e`, `0`) via direct substitution + L'Hôpital, with the numeric
  approach table kept as the on-screen evidence. Detects and reports DNE — nerdamer's own
  `limit()` answers `Infinity` for `1/x` at 0, which is wrong. See
  `docs/CALCULUS_ENGINE_PLAN.md` §3.
- Estimate `lim_{x→a} f(x)` by evaluating `f` at points closer and closer to `a` from both
  sides, and by zooming in on the graph. The first idea in the whole subject, and currently
  the site has nothing before "here's a derivative."
- **On the site:** a table of `f(x)` at `x = a ± 0.1, 0.01, 0.001, ...` filling in live as you
  drag `a`, next to a graph that auto-zooms toward `(a, L)`.

#### 2. L'Hôpital's Rule
- **Status:** ✅ Built 2026-07-21 — `engines/calculus/methods/lhopital.html`, backed by
  `CalculusSymbolic.lhopital()`. Verified by `tests/verify-calculus.js`. The indeterminate-form
  check is a dedicated classifier (`classifyForm`/`trendClassify` in `calculus-symbolic.js`) —
  the naive probe-based check that `limit()` uses internally turned out to be too coarse
  (misses `sin(x)/x`'s 0/0 and `log(x)/x`'s ∞/∞ at infinity), so this entry point does not
  reuse that gate. A quotient that isn't actually indeterminate at the point is refused, even
  though `limit()` itself would happily evaluate it by direct substitution.

#### 3. Curve Sketching (First & Second Derivative Tests)
- **Status:** ✅ Built 2026-07-22 — `engines/calculus/methods/curve-sketching.html`, backed by
  `CalculusSymbolic.curveAnalysis()`. Verified by `tests/verify-calculus.js`. One function in,
  three linked plots out (`f`, `f'`, `f''`), critical points classified by the sign change of
  `f'` (not the second-derivative test alone — that test is inconclusive for `x^4` at its own
  minimum). Critical/inflection points are exact (via `solve()`) only when the derivative is
  algebraic; nerdamer's `solve()` turns out not to be trustworthy on transcendental
  derivatives — `solve(diff(sin(x),x),x)` returns ~38 rational-approximation "roots" instead of
  `pi/2 + k*pi` — so those cases fall back to numeric sign-change bisection over the requested
  interval and are marked inexact.

#### 4. Related Rates
- **Status:** ✅ Built 2026-07-23 — `engines/calculus/methods/related-rates.html`, backed by
  `CalculusSymbolic.relatedRates()`. Verified by `tests/verify-calculus.js`.
- Differentiate an implicit relationship between quantities with respect to time to relate
  their rates of change — famously taught through the ladder-sliding-down-a-wall problem.
- **On the site:** pick a canonical scenario (ladder, expanding balloon, shadow length),
  animate the physical picture live while showing the differentiated equation update in
  parallel — genuinely a place where an animation earns its keep pedagogically.

#### 5. Applied Optimization (Critical-Point Word Problems)
- **Status:** ✅ Built 2026-07-22 — `engines/calculus/methods/applied-optimization.html`,
  backed by `CalculusSymbolic.appliedOptimization()`. Verified by `tests/verify-calculus.js`.
  The Extreme Value Theorem procedure: every critical point of `f` in `[a,b]` plus the two
  endpoints are evaluated, and the best one wins — which is also why a strictly monotonic
  objective (no critical points at all) still resolves correctly, at whichever endpoint is
  better. Ships with the box-from-a-flat-sheet and fence-along-a-river presets, plus a live
  slider over the domain showing f and f' at the current x. Distinct from the Optimization
  Engine's Gradient Descent/Simplex — this is the single-variable, closed-form Calc-1
  treatment specifically.

## 2B. Techniques and Applications of Integration

#### 6. Techniques of Integration (Substitution, By Parts, Partial Fractions, Trig Substitution)
- **Status:** ✅ Built — all four techniques shipped.
  - **u-Substitution** done 2026-07-21 (`engines/calculus/methods/u-substitution.html`, verified
    by `tests/verify-calculus.js`).
  - **Integration by Parts** done 2026-07-22 (`engines/calculus/methods/integration-by-parts.html`,
    backed by `CalculusSymbolic.integrationByParts()`, verified by `tests/verify-calculus.js`).
    The engine picks `u`/`dv` by the LIATE heuristic and decomposes one level deep — nerdamer's
    `integrate()` resolves the reduced `∫v du` in a single call, so an explicit recursion was
    unnecessary — and refuses when `dv` has no elementary antiderivative (e.g. `x*sin(x^2)`,
    which is u-substitution's turf).
  - **Partial Fractions** done 2026-07-22 (`engines/calculus/methods/partial-fractions.html`,
    backed by `CalculusSymbolic.partialFractions()`, verified by `tests/verify-calculus.js`).
    nerdamer's `partfrac()` does the decomposition itself — irreducible-quadratic factors,
    repeated factors, and the polynomial long division an improper fraction needs first — so the
    engine's job is to *show* it and integrate the result. The rational-function detector is a
    product-tree walker (`splitRational`), because nerdamer normalizes every quotient away from
    the `/` operator (`1/(x^2-1)` becomes `(-1+x^2)^(-1)`), which the `/`-based detector the limits
    work uses cannot see. Non-rational integrands (`x*e^x`, `1/sqrt(4-x^2)`) are refused by name.
  - **Trigonometric Substitution** done 2026-07-22
    (`engines/calculus/methods/trigonometric-substitution.html`, backed by
    `CalculusSymbolic.trigSubstitution()`, verified by `tests/verify-calculus.js`). Recognises the
    three radical forms by numeric detection (sidestepping nerdamer's string reordering), clears
    the radical, and back-substitutes. Two tree rewrites make nerdamer's `integrate()` reliable on
    the θ-integrand: a **Pythagorean-identity pass** (turns a polynomial-in-sin denominator like
    `(a²−a²sin²θ)^(-1)` into a trig power) and a **negative-power reciprocal pass**
    (`sec^(−1)→cos`), so the θ-integrand is always a product of positive trig powers. The
    differentiate-back gate uses math.js finite differences, not nerdamer's `diff()`, which is
    wrong on `√(quadratic)` forms. A composition simplifier cleans up `cos(asin x)` for display.
- The four standard symbolic integration techniques. `nerdamer` (vendored, v1.1.13, full
  bundle) does the algebra, but returns **answers only — it has no step API**, so the
  technique selection and the derivation ladder are hand-built. Correction: this entry used to
  cite the Teacher Helper project's `symbolicEngine.js` as a proven path; that file is an
  exam-question generator, not a CAS, and is no longer on disk. See
  `docs/CALCULUS_ENGINE_PLAN.md` §3 for what nerdamer can and cannot do.
- **On the site:** step-by-step symbolic derivation shown one line at a time (substitution
  chosen, integral rewritten, back-substituted) — not just the final antiderivative, since the
  method *is* the content here.

#### 7. Improper Integrals
- **Status:** ✅ Built 2026-07-23 — `engines/calculus/methods/improper-integrals.html`, backed by
  `CalculusSymbolic.improperIntegral()`. Verified by `tests/verify-calculus.js`.
- Integrals with an infinite bound or an infinite discontinuity, evaluated as a limit;
  converges or diverges.
- **On the site:** a limit-of-partial-integrals readout that either settles to a number
  (converges) or visibly grows without bound (diverges) as the upper bound slider is dragged
  further out — makes "does this converge" a visible race instead of an abstract yes/no.

#### 8. Volumes by Disk, Washer, and Shell Methods (Solids of Revolution)
- **Status:** ✅ Built (2026-07-22).
- Spin a 2D region around an axis and compute the resulting solid's volume via integration.
  One of the most visually rewarding topics in the entire course and currently the Lab has no
  3D calculus visualization at all.
- **On the site:** the actual 3D solid rendered and rotating in three.js, built live from the
  2D curve as the axis and bounds are adjusted.

#### 9. Arc Length and Surface Area
- **Status:** ✅ Built 2026-07-23 — `engines/calculus/methods/arc-length-surface-area.html`,
  backed by `CalculusSymbolic.arcLengthSurfaceArea()`. Verified by `tests/verify-calculus.js`.
- Integrate `√(1 + f'(x)²)` for arc length; a related integral for surface area of
  revolution. Natural pairing with #8.

## 2C. Sequences, Series, and Power Series

#### 10. Sequences and Series Convergence Tests
- **Status:** ✅ Built 2026-07-22 — `engines/calculus/methods/convergence-tests.html`, backed by
  `CalculusSymbolic.convergenceTests()`. Verified by `tests/verify-calculus.js`.
- The nth-term test, geometric/`p`-series, integral test, comparison/limit-comparison,
  ratio test, root test, alternating series test — the single densest "which tool do I reach
  for" chapter in the course.
- **On the site:** enter a series, the tool tries each test in the textbook's actual decision-
  tree order and shows which one first gives a conclusive answer — turns a memorization
  chapter into a visible decision procedure.

#### 11. Power Series & Radius/Interval of Convergence
- **Status:** ✅ Built 2026-07-22 — `engines/calculus/methods/power-series.html`, backed by
  `CalculusSymbolic.powerSeries()`. Verified by `tests/verify-calculus.js`.
- Apply the Ratio Test to a power series to find the radius of convergence, then check the
  endpoints individually.
- **Depends on:** #10.

#### 12. Taylor & Maclaurin Series
- **Status:** ✅ Built 2026-07-21 — `engines/calculus/methods/taylor-series.html`, backed by
  `CalculusSymbolic.taylorSeries()`. Verified by `tests/verify-calculus.js`. Coefficients are
  computed by exact repeated symbolic differentiation (`f^(k)(a)/k!`), not numeric finite
  differences, and the resulting polynomial is checked — `P(a) = f(a)` and `P` tracks `f`
  numerically near `a` — before being reported.

## 2D. Parametric, Polar, Vectors, and Multivariable

#### 13. Parametric Equations & Polar Coordinates
- **Status:** ✅ Built 2026-07-23 — `engines/calculus/methods/parametric-and-polar.html`,
  backed by `CalculusSymbolic.parametricAndPolar()`. Verified by `tests/verify-calculus.js`.
- Curves given by `(x(t), y(t))` or `r = f(θ)`; compute slopes, arc length, and area
  (`½∫r²dθ`) in these coordinate systems.
- **On the site:** live curve tracer — a dot moving along the curve as `t` or `θ` sweeps,
  with the corresponding Cartesian trace drawn behind it.

#### 14. Vectors and the Geometry of Space
- **Status:** ✅ Built. (2026-07-22 — "Vectors in Space"; establishes the three.js scene
  conventions the rest of the 3D engine reuses.)
- Dot product, cross product, equations of lines and planes in 3D — the on-ramp to
  multivariable calculus.
- **On the site:** an interactive 3D scene (three.js, already loaded site-wide) with
  draggable vectors and a live-computed dot/cross product and angle between them.

#### 15. Partial Derivatives, Gradient, and Tangent Planes
- **Status:** ✅ Built. (2026-07-22 — "Partial Derivatives, Gradient & Tangent Planes";
  reuses the `Scene3D` from #14 for the surface + tangent plane visual.)
- `f(x, y)` as a surface; partial derivatives as slopes in the `x`- and `y`-directions, the
  gradient as the direction of steepest ascent, and the tangent plane at a point.
- **On the site:** the 3D-surface-plus-tangent-plane visual — same "signature" idea floated
  earlier, and this is its correct textbook home (Calc 3, not a generic "3D demo").
- **Depends on:** #14 for the 3D scene conventions.

#### 16. Lagrange Multipliers (Calc 3 treatment)
- **Status:** ✅ Built 2026-07-22 — `engines/calculus/methods/lagrange-multipliers.html`,
  backed by `CalculusSymbolic.lagrangeMultipliers()`. Verified by `tests/verify-calculus.js`.
  Find the extrema of `f(x, y)` subject to a constraint `g(x, y) = c` via `∇f = λ∇g`. nerdamer's
  own system solver (`solveEquations`) was tried and rejected — on the textbook circle example
  it returns exactly one of the four real solutions, and as an inexact decimal, the same
  "confidently wrong" failure mode §3 of `CALCULUS_ENGINE_PLAN.md` documents for `solve()` on
  transcendental forms. Solved instead with a finite-difference-Jacobian Newton's method run
  from a deterministic multi-start grid, verified per-candidate by an independent check: the
  directional derivative of `f` (from `f` itself, never from `f_x`/`f_y`) along the tangent to
  the constraint curve must vanish. (The general Operations-Research/n-variable Lagrange
  multipliers treatment is out of scope here; this is the two-variable, visualizable Calc-3
  version now built.)

#### 17. Multiple Integrals (Double, Cartesian & Polar)
- **Status:** ✅ Built 2026-07-22 — `engines/calculus/methods/multiple-integrals.html`, backed
  by `CalculusSymbolic.multipleIntegral()`. Verified by `tests/verify-calculus.js`. Volume under
  a surface over a Type I Cartesian region (`y` between two curves of `x`) or a polar region
  (`r` between two curves of `θ`, the Jacobian factor of `r` applied automatically). Two nested
  antiderivatives, each bound evaluated by substitution — never `defint`, per the same
  reasoning as Volumes of Revolution — verified against an independent nested-Simpson numeric
  double integration, which is also what catches a non-elementary inner integrand (`e^(y²)dy`
  returns an erf-of-`i` expression rather than failing outright). **Scope note:** triple
  integrals and cylindrical/spherical coordinates are deliberately out of this pass — see
  `docs/CALCULUS_ENGINE_PLAN.md` §5 — the double-integral case (both coordinate systems the
  roadmap names as the common case) is what shipped.
- **Depends on:** #15 for the 3D surface rendering machinery.

#### 18. Vector Calculus (Line Integrals, Green's/Stokes'/Divergence Theorems)
- **Status:** ✅ Built 2026-07-23 — `engines/calculus/methods/vector-calculus.html`, backed by
  `CalculusSymbolic.vectorCalculus()` (divergence-curl, line-integral, greens — 2D; Stokes'/3D
  Divergence theorem not yet covered). Verified by `tests/verify-calculus.js`.
- The capstone chapter — line integrals over vector fields, and the three theorems relating
  them to double/triple integrals. Advanced, visually rich, but only worth it once everything
  above in this engine exists.

---

# 3. Linear Algebra Engine

**Textbook basis:** Lay, *Linear Algebra and Its Applications* — cross-checked against
Strang, *Introduction to Linear Algebra*. Per the structural note, this engine also keeps the
numerical-linear-algebra chapter (direct + iterative solvers) that overlaps with Burden &
Faires, since Gaussian elimination already lives here.

**Already built:** 2×2 Transform (det/trace/rank/eigenvalues, real or complex), Solve `Ax=b`
(3×3) via Gaussian elimination with partial pivoting.

## 3A. Systems of Linear Equations & Matrix Algebra

#### 1. Gaussian Elimination with Partial Pivoting
- **Status:** ✅ Built.

#### 2. LU Decomposition
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/lu-decomposition.html`. Verified by `tests/verify-linalg.js`.
- Factor `A = LU` once, then solve `Ax = b` for many different `b` vectors cheaply by
  forward/back substitution — the practical reason real solvers don't just re-run Gaussian
  elimination every time.
- **On the site:** show `L` and `U` being built up alongside the existing elimination steps
  (they're the same row operations, just recorded instead of discarded) — a natural "oh, this
  was free the whole time" extension of the page that's already built.

#### 3. Cholesky Decomposition
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/cholesky.html`. Verified by `tests/verify-linalg.js`.
- The `A = LLᵀ` factorization, twice as fast as LU, but only valid for symmetric
  positive-definite matrices — a natural "special case" callout right after LU.
- **Depends on:** #2.

## 3B. Iterative Techniques in Matrix Algebra

#### 4. Jacobi Method
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/iterative-solvers.html`. Verified by `tests/verify-linalg.js`.
- Solve `Ax = b` by repeatedly updating each `xᵢ` from the *previous full iteration's*
  values of the others — simple, parallelizable, converges for diagonally-dominant systems.
- **On the site:** iteration table of the vector `x` converging row by row, plus a
  convergence-condition check (diagonal dominance) shown as a pass/fail readout before the
  user even hits compute — mirrors the existing sign-check pattern on the Bisection page.

#### 5. Gauss-Seidel Method
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/iterative-solvers.html`. Verified by `tests/verify-linalg.js`.
- Same idea as Jacobi, but uses each updated `xᵢ` immediately within the same iteration —
  usually converges faster. The natural side-by-side comparison against #4.
- **On the site:** race Jacobi vs. Gauss-Seidel on the same system, same starting vector —
  directly reuses the "race two methods" idea in the correct textbook context.

#### 6. Successive Over-Relaxation (SOR)
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/iterative-solvers.html`. Verified by `tests/verify-linalg.js`.
- Gauss-Seidel with an extra relaxation factor `ω` that can accelerate convergence further
  if tuned well (and hurt it if tuned badly).
- **On the site:** a draggable `ω` slider showing the iteration count needed to converge
  rise and fall as you search for the optimal value — turns "tuning a hyperparameter" into a
  tangible, visible thing.

#### 7. Conjugate Gradient Method
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/conjugate-gradient.html`. Verified by `tests/verify-linalg.js`.
- For large symmetric positive-definite systems; converges in at most `n` steps in exact
  arithmetic by choosing search directions that don't undo previous progress.
- **On the site:** for a 2- or 3-variable system, plot the actual path taken through solution
  space — visually distinct from gradient descent's path because it never backtracks along a
  previous direction.

## 3C. Vector Spaces, Rank, and Orthogonality

#### 8. Vector Spaces, Span, Basis, and Dimension
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/independence-basis.html` (basis/dimension, with the geometric span view via `LinAlgViz.span`). Verified by `tests/verify-linalg.js`.
- The conceptual foundation the rest of the course depends on: what a basis is, why dimension
  is well-defined, what "spanning" means geometrically.
- **On the site:** for 2D/3D, an interactive scene where dragging vectors shows the span they
  generate (a line, a plane, or all of space) filling in live as more vectors are added.

#### 9. Linear Independence
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/independence-basis.html`. Verified by `tests/verify-linalg.js`.
- Whether a set of vectors has redundancy — determined via whether `Ax = 0` has only the
  trivial solution.
- **Depends on:** #8; reuses Gaussian elimination (#1) as the actual test.

#### 10. The Four Fundamental Subspaces (Row Space, Column Space, Null Space, Rank-Nullity)
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/four-subspaces.html`. Verified by `tests/verify-linalg.js`.
- Every matrix decomposes the picture into these four subspaces; rank-nullity ties their
  dimensions together. Strang's own signature topic — a defining idea of the modern linear
  algebra course.
- **On the site:** one matrix in, four subspaces visualized simultaneously (as lines/planes
  in 2D or 3D where possible) with their dimensions labeled and rank-nullity shown as an
  equation that visibly balances.

#### 11. General Linear Transformations
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/linear-transformations.html (2x2 case)`. Verified by `tests/verify-linalg.js`.
- Extends the existing 2×2 "grid transform" visual to the general idea of a linear map
  between vector spaces, including non-geometric examples (e.g. differentiation as a linear
  transformation on polynomials).
- **Depends on:** the existing 2×2 transform scene in `proto.js`.

#### 12. Orthogonality and the Gram-Schmidt Process
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/gram-schmidt.html`. Verified by `tests/verify-linalg.js`.
- Turn any basis into an orthogonal (or orthonormal) one by successively subtracting
  projections — the constructive proof behind QR decomposition.
- **On the site:** vectors starting skewed, animated one at a time into their orthogonalized
  positions — a clean, geometric, step-by-step animation that matches the site's existing
  step-slider pattern well.

#### 13. QR Decomposition
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/gram-schmidt.html`. Verified by `tests/verify-linalg.js`.
- Factor `A = QR` via Gram-Schmidt; used directly by the QR Algorithm for eigenvalues
  (Numerical Engine, #26) and for solving least-squares problems more stably than the normal
  equations.
- **Depends on:** #12.

## 3D. Determinants, Eigenvalues, and Diagonalization

#### 14. Determinants (Cofactor Expansion, General n×n)
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/determinant.html`. Verified by `tests/verify-linalg.js`.
- Extends the existing 2×2 determinant to general `n×n` via cofactor expansion, plus the
  much faster row-reduction-based computation.
- **On the site:** for a 3×3 or 4×4 matrix, show the cofactor expansion tree (each minor
  computed and highlighted) next to the much shorter row-echelon-form shortcut — a genuine
  "here's why we don't do it this way in practice" moment.

#### 15. Eigenvalues, Eigenvectors, and Diagonalization (General n×n)
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/eigenvalues.html + diagonalization.html`. Verified by `tests/verify-linalg.js`.
- Extends the existing 2×2 eigenvalue solve to `n×n` via the characteristic polynomial, and
  adds diagonalization `A = PDP⁻¹` — arguably the single most important idea in the whole
  course, and currently capped at 2×2 on the site.
- **On the site:** 3×3 case with a real 3D scene (the existing `initMatrixScene` pattern),
  eigenvectors drawn as the only directions the transform doesn't rotate off their own line.

#### 16. Symmetric Matrices and the Spectral Theorem
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/spectral-theorem.html`. Verified by `tests/verify-linalg.js`.
- Symmetric matrices always diagonalize with *real* eigenvalues and *orthogonal*
  eigenvectors — a strong, clean special case worth its own callout right after #15.

#### 17. Singular Value Decomposition (SVD)
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/svd.html`. Verified by `tests/verify-linalg.js`.
- Factor *any* matrix (not just square ones) as `A = UΣVᵀ` — arguably the most practically
  important idea in the entire subject (it's the basis of PCA, image compression, and
  recommender systems). This is exactly where the "drag a slider, watch a photo compress"
  visual from the earlier brainstorm belongs — not as a gimmick, but as the correct, standard
  way every textbook motivates SVD's importance.
- **On the site:** load a small image, keep only the top-`k` singular values, watch the
  reconstructed image sharpen as `k` increases — genuinely the single most compelling,
  legitimately-textbook visual this engine can have.
- **Depends on:** #15, #16.

#### 18. Least Squares and the Normal Equations
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/least-squares.html`. Verified by `tests/verify-linalg.js`.
- `AᵀAx = Aᵀb` as the linear-algebra-textbook derivation of best-fit lines — the same result
  as the Statistics Engine's regression, arrived at through projections instead of
  probability. Worth having both eventually (different course, different reasoning), low
  urgency since the numeric answer duplicates existing functionality.
- **Depends on:** #12/#13 for the numerically stable version via QR.

#### 19. Markov Chains
- **Status:** ✅ Built 2026-07-21 — `engines/linear-algebra/methods/markov-chains.html`. Verified by `tests/verify-linalg.js`.
- A standard "applications" chapter: transition matrices, steady-state vectors as an
  eigenvector problem (`eigenvalue = 1`).
- **On the site:** a small state diagram with probabilities on the edges, animated forward
  step by step until the distribution visibly settles — concrete, intuitive, and ties directly
  back to eigenvalues (#15).

---

# 4. Statistics Engine

**Textbook basis:** Walpole, Myers, Myers & Ye, *Probability & Statistics for Engineers and
Scientists* — cross-checked against Devore, *Probability and Statistics for Engineering and
the Sciences*.

**Already built (2026-07-30):** Descriptive Statistics, Probability & Combinatorics,
Discrete Distributions, Continuous Distributions, Sampling Distributions & CLT, Confidence
Intervals, One-Sample t-Test, Two-Sample/Paired/z-Tests, Chi-Square Tests, Simple & Multiple
Linear Regression — 11 method pages, all tested by `tests/verify-statistics.js` (323 assertions).

## 4A. Descriptive Statistics and Probability

#### 1. Descriptive Statistics Explorer
- **Status:** ✅ Built.
- Mean, median, mode, variance, standard deviation, quartiles — paste a dataset, get every
  summary statistic and a histogram/box-plot at once. The obvious missing "front door" before
  a student ever gets to hypothesis testing; right now the engine assumes you already know
  what you're testing.
- **On the site:** paste numbers, live histogram + box plot + the full summary-statistic
  table, updating on every edit — cheap to build, immediately useful, and the natural landing
  point for this entire engine.

#### 2. Probability & Combinatorics Basics (Counting, Conditional Probability, Bayes' Theorem)
- **Status:** ✅ Built.
- Permutations/combinations, conditional probability, and Bayes' Theorem — usually taught via
  a tree diagram.
- **On the site:** an interactive probability tree where branch values are editable and the
  final Bayes'-theorem posterior recomputes live.

#### 3. Discrete Probability Distributions (Binomial, Poisson, Geometric, Hypergeometric)
- **Status:** ✅ Built.
- The standard discrete-distribution family; PMF bar charts, mean/variance formulas.
- **On the site:** pick a distribution, drag its parameters, watch the bar chart reshape live
  — cheap, standard, and sets up #4 and #5 below.

#### 4. Continuous Probability Distributions (Normal, Exponential, Uniform, Gamma)
- **Status:** ✅ Built.
- PDF/CDF visualizer with draggable parameters (mean/std dev, rate, etc.) and shaded-area
  probability queries (`P(a < X < b)`).
- **Depends on:** none; natural partner to #3.

## 4B. Sampling, Estimation, and Inference

#### 5. Sampling Distributions & the Central Limit Theorem
- **Status:** ✅ Built.
- Repeatedly draw samples from *any* distribution, plot the distribution of the sample means,
  and watch it approach normal as sample size grows — arguably the single most important
  result in the whole intro-stats course and the direct theoretical justification for why the
  already-built t-test is valid at all.
- **On the site:** pick any distribution (including a deliberately weird/skewed one drawn by
  hand), a sample-size slider, and watch a live-accumulating histogram of sample means morph
  into a bell curve.

#### 6. Point Estimation (Method of Moments, Maximum Likelihood)
- **Status:** ⚪ Missing. **Priority: P2.**
- How a distribution's parameters get estimated from data in the first place — the step that
  logically precedes every hypothesis test already on the site.

#### 7. Confidence Intervals (Mean, Proportion, Variance)
- **Status:** ✅ Built.
- The direct counterpart to the hypothesis test that's already built — in most courses these
  two ideas (interval estimation and hypothesis testing) are taught back-to-back from the same
  formula, and having only one half on the site is an obvious gap.
- **On the site:** sample data in, confidence level slider, interval drawn on a number line
  with the sample mean marked — and, since it's free once #5 exists, a live simulation
  showing what fraction of repeated intervals actually contain the true mean at the stated
  confidence level.

#### 8. Two-Sample and Paired t-Tests, z-Test
- **Status:** ✅ Built.
- Direct extensions of the one-sample t-test already built (comparing two independent
  samples, comparing before/after pairs, or using the z-test when population variance is
  known) — the natural next rows in the same "hypothesis test" family the site already has UI
  for.

#### 9. Chi-Square Tests (Goodness-of-Fit and Independence)
- **Status:** ✅ Built.
- Tests whether observed category counts match an expected distribution, or whether two
  categorical variables are independent — the standard test for categorical (non-numeric)
  data, filling a real gap since everything built so far assumes continuous measurements.

#### 10. One-Way ANOVA (F-Test)
- **Status:** ✅ Built 2026-07-30 — `engines/statistics/methods/anova-f-test.html`. Verified by `tests/verify-statistics.js` (356 passed).
- Compares means across three or more groups at once (rather than running many pairwise
  t-tests) — the standard next step after #8 in most course sequences. SSB/SSW split,
  exact F-distribution p-value via regularized incomplete beta (`betai`), critical F
  by bisection, with a group-means (±1 SD) bar plot and an F-density plot shaded with the
  upper-tail rejection region.

## 4C. Regression and Correlation

#### 11. Simple Linear Regression
- **Status:** ✅ Built.

#### 12. Multiple Linear Regression
- **Status:** ✅ Built.
- Extends the existing regression to several predictors at once — matrix form
  (`(XᵀX)⁻¹Xᵀy`), directly reusable once Linear Algebra Engine's least-squares (#18 above)
  exists.
- **Depends on:** Linear Algebra Engine's least-squares machinery.

#### 13. Polynomial Regression
- **Status:** ⚪ Missing. **Priority: P2.**
- Fit a curve instead of a line by treating `x, x², x³, ...` as separate predictors — a small
  , natural extension of #12.

## 4D. Nonparametric Methods — stretch

#### 14. Wilcoxon/Kruskal-Wallis/Sign Tests
- **Status:** ⚪ Missing. **Priority: P3.**
- The distribution-free counterparts to the t-test/ANOVA family, used when normality can't be
  assumed. Genuinely part of most textbooks but usually one of the last chapters covered, if
  covered at all — correctly low priority.

---

# 5. ODE/PDE Engine

**Textbook basis:** Boyce & DiPrima, *Elementary Differential Equations and Boundary Value
Problems* — the near-universal US text for a first ODE course, used front-to-back. Chapters 1–9
are the ODE material in §5A–5F; Chapters 10–11 (Fourier Series, Partial Differential Equations)
are the PDE material in §5G. PDE is **first-class scope for this engine**, not a stretch goal —
see `docs/ODE_PDE_SOLVER_DESIGN.md` for the classification trees and
`docs/ODE_PDE_ENGINE_PLAN.md` for the build plan and reuse map.

> **⚠️ 2026-08-02 — reconciled against the shipped SymPy-`dsolve()`-based redesign.** The
> hand-rolled classify-tree architecture this section's item-level detail used to describe
> (`assets/proto/ode-solver.js`, then `assets/js/ode-symbolic.js`'s `classifyFirstOrder`/
> `classifySecondOrder`) was fully retired across Phases 1-5 of that redesign — see
> `docs/ODE_PDE_ENGINE_PLAN.md` for the current architecture and file map, and
> `docs/superpowers/plans/2026-08-0*-ode-engine-phase*.md` for each phase's full detail. One
> general solver now covers separable/linear/exact/homogeneous/Bernoulli/second-order/
> Cauchy-Euler/higher-order (n≥3) generically — items #1-4, #7-8 below are covered by it, not
> by the deleted functions their status lines used to name. Automated test coverage now exists
> (`math-lab/tests/verify-ode*.js`, `verify-laplace-engine.js`, `verify-ode-systems.js`,
> `verify-ode-poisson.js`) — the "zero automated tests" caveat below no longer applies. Items
> still genuinely not built (Applications §5A#5, Autonomous/phase-line §5A#6, Mechanical
> Vibrations §5B#9, nonlinear systems §5D#13, Heun's/multistep §5E#15-16, BVP framing §5F#18)
> stay `⚪ Missing`, unaffected by the redesign — these are presentation/animation layers or
> genuinely separate techniques, not things the general solver happens to also cover.

**Already built:** Direction fields for any `f(x, y)`, Euler and RK4 (numerical fallback under
every symbolic solver); a general SymPy-`dsolve()`-backed solver covering any single ODE of any
order (§5A-5B); systems `x' = Ax + g(t)` with eigenvalue-based equilibrium classification at
n=2 (§5D#12); a real Laplace transform engine — forward/inverse calculator, staged IVP
walkthrough including discontinuous/impulsive forcing, convolution theorem (§5C#10-11); power
series solutions including all 3 Frobenius cases (§5F#17); and heat, wave, and Laplace/Poisson
PDEs with a numerical-schemes/CFL-stability companion panel (§5G#20-23). Solvers live across
`ode-solver.js`, `ode-systems.js`, `laplace-engine.js`, `ode-poisson.js`, `ode-symbolic.js`, and
`sympy-worker.js` (Pyodide-hosted), wired to per-method pages under `engines/ode/methods/` via
a `methods.html` catalog.

## 5A. First-Order Differential Equations

#### 1. Separable Equations
- **Status:** ✅ Built — covered generically by the Phase 1 general solver
  (`assets/js/ode-solver.js`, `engines/ode/methods/ode-solver.html`), which calls SymPy's
  `dsolve()` rather than a hand-rolled `solveSeparable` branch. The historical scale bug this
  status line used to describe (§2a of the old `ODE_PDE_ENGINE_PLAN.md`) was specific to the
  since-deleted hand-rolled solver and does not apply to the current architecture.
- `dy/dx = g(x)h(y)` solved by separating variables and integrating both sides — the very
  first solution *technique* taught in the course, and currently the site can only auto-detect
  the linear case, not walk through the far more common separable case a student is actually
  assigned.
- **On the site:** step-by-step symbolic derivation (separate → integrate both sides →
  solve for `y`) shown as discrete steps, the same "nothing hidden" transparency already used
  elsewhere on the site.

#### 2. Linear First-Order Equations (Integrating Factor)
- **Status:** ✅ Built — covered generically by the Phase 1 general solver (`dsolve()`), same as
  #1. No dedicated integrating-factor branch needed or present.
- `dy/dx + P(x)y = Q(x)`, solved by multiplying through by `e^∫P(x)dx`. The second core
  technique, taught immediately after separable equations.

#### 3. Exact Equations (and Integrating Factors to Make Non-Exact Equations Exact)
- **Status:** ✅ Built — covered generically by the Phase 1 general solver (`dsolve()`), same as
  #1-2. `M(x,y)dx + N(x,y)dy = 0` form is accepted directly; no dedicated exactness-check branch
  needed.

#### 4. Homogeneous and Bernoulli Equations (Substitution Methods)
- **Status:** ✅ Built — covered generically by the Phase 1 general solver (`dsolve()`), same as
  #1-3.
- Two standard substitution tricks (`y = vx` for homogeneous equations; `v = y^{1-n}` for
  Bernoulli) that reduce to the separable or linear case.

#### 5. Applications of First-Order Equations
- **Status:** ⚪ Missing. **Priority: P1.**
- Population growth/decay, mixing problems, Newton's Law of Cooling, terminal velocity — the
  "word problem" chapter, and the natural place to make the existing direction-field/Euler/RK4
  machinery feel concrete instead of abstract.
- **On the site:** pick a scenario (a cooling cup of coffee, a draining tank), watch a small
  physical animation (temperature dropping, tank level falling) driven directly by the
  already-built numerical solver underneath.
- **Depends on:** the site's existing Euler/RK4 engine — this is a presentation layer on top
  of what's already built, genuinely cheap relative to payoff.

#### 6. Autonomous Equations, Equilibrium Solutions, and Stability
- **Status:** ⚪ Missing. **Priority: P2.**
- `dy/dx = f(y)` (no explicit `x`); equilibrium solutions where `f(y) = 0`, classified as
  stable/unstable/semi-stable via a phase line.
- **On the site:** the phase line itself — arrows along a vertical axis showing which way
  solutions flow — a small, distinctive visual not used anywhere else on the site.

## 5B. Second-Order Linear Equations

#### 7. Homogeneous Equations with Constant Coefficients
- **Status:** ✅ Built — covered generically by the Phase 1 general solver (`dsolve()`), any
  order (not capped at 2), including all three characteristic-root cases.

#### 8. Reduction of Order, Undetermined Coefficients, Variation of Parameters
- **Status:** ✅ Built — covered generically by the Phase 1 general solver (`dsolve()`), which
  handles nonhomogeneous forcing (undetermined coefficients' and variation of parameters'
  combined scope) and reduction-of-order-requiring equations without needing a separate
  "given one known solution `y₁`" tool — `dsolve()` solves the whole equation directly.

#### 9. Mechanical Vibrations and Electrical Circuits
- **Status:** ⚪ Missing. **Priority: P1.**
- The spring-mass-damper equation (undamped, underdamped, critically damped, overdamped —
  plus forced resonance) and its direct electrical analogue (RLC circuits). This is the
  correct, textbook-native home for an animated mass-on-a-spring or swinging pendulum visual —
  not a standalone gimmick, but the standard worked application of #7/#8.
- **On the site:** a literal animated spring-mass system on screen, driven by the solved
  equation, with damping-ratio and forcing-frequency sliders — genuinely one of the best
  "impressive but legitimate" builds on this whole list.
- **Depends on:** #7, #8.

## 5C. Laplace Transforms

#### 10. The Laplace Transform and Its Inverse
- **Status:** ✅ **Built** (Phase 3, 2026-08-02) — `assets/js/laplace-engine.js`,
  `engines/ode/methods/laplace-transform.html`. A standalone forward/inverse transform
  calculator (`sp.laplace_transform`/`inverse_laplace_transform`, verified against the defining
  integral) plus a full staged "solve an IVP via Laplace" walkthrough (transform → solve
  algebraically → inverse transform, any order), each stage shown explicitly, exactly as
  originally specified here.

#### 11. Step Functions, Impulses, and Convolution
- **Status:** ✅ **Built** (Phase 3, 2026-08-02) — the IVP walkthrough accepts `Heaviside`/
  `DiracDelta` forcing directly (verified via forward trajectory integration with the standard
  jump condition applied at each impulse — see `ODE_PDE_ENGINE_PLAN.md` §4 for why pointwise
  substitution alone isn't sufficient here), and a dedicated convolution-theorem section
  (`L{f∗g}=F(s)·G(s)`, verified against the direct convolution integral) is on the same page.

## 5D. Systems of Differential Equations

#### 12. Systems of Linear ODEs (Eigenvalue Method) and Phase Portraits
- **Status:** ✅ **Built** (Phase 2, 2026-08-02) — `assets/js/ode-systems.js`,
  `engines/ode/methods/systems.html`. `x' = Ax + g(t)` for any n×n via `dsolve()`; at n=2 the
  origin is classified (node, saddle, improper node, star node, spiral, or center) via
  `LinAlg.eigenvalues` and a phase portrait rendered (vector field + trajectories from several
  starting points) — exactly as originally specified here, plus nonhomogeneous forcing and
  general n (the five-way classification is 2D-specific; n≥3 gets a general stability read
  instead).

#### 13. Nonlinear Systems and Stability (Linearization)
- **Status:** ⚪ Missing. **Priority: P2.**
- Linearize a nonlinear system near an equilibrium (via the Jacobian) to classify its local
  stability; classic examples are the predator-prey (Lotka-Volterra) system and the nonlinear
  pendulum.
- **Depends on:** #12.

## 5E. Numerical Methods — cross-reference

#### 14. Euler's Method, RK4
- **Status:** ✅ Built & verified — `eulerRK4FirstOrder` / `rk4SecondOrder` in
  `assets/js/ode-symbolic.js`, wired to the dedicated Direction Field page
  (`engines/ode/methods/direction-fields.html`).

#### 15. Heun's Method (Improved Euler / RK2)
- **Status:** ⚪ Missing. **Priority: P1.**
- The natural stepping-stone between Euler and RK4 — averages the slope at the start and end
  of the step instead of using RK4's four evaluations. Kept in this engine per the existing
  Euler/RK4 precedent.
- **On the site:** add as a third overlay next to Euler/RK4 on the existing comparison plot.

#### 16. Multistep Methods (Adams-Bashforth / Adams-Moulton, Predictor-Corrector)
- **Status:** ⚪ Missing. **Priority: P2.**
- Uses several previous points (not just the current one) to take the next step — more
  efficient than RK4 for the same accuracy once past the first few steps, at the cost of
  needing a separate "starter" method (usually RK4) to get going.
- **Depends on:** #14 for the starting steps.

## 5F. Boundary Value Problems & Series Solutions — stretch

#### 17. Power Series Solutions
- **Status:** ✅ **Built**, exceeding original scope (Phase 4, 2026-08-02) —
  `engines/ode/methods/series-solutions.html`. Homogeneous 2nd-order equations around an
  ordinary or regular singular point, at any `x0`, covering **all 3 Frobenius cases**
  (distinct-non-integer roots directly via SymPy's hint; repeated or integer-differing roots
  via reduction of order on the hint's own first solution — a genuine second, logarithmic
  solution, not a refusal). No named special functions (Bessel, Legendre) are recognized by
  name — not needed for this course's scope.

#### 18. Boundary Value Problems
- **Status:** ⚪ Missing here, but **the numerical half is already built** — Numerical Engine's
  `Algorithms.runShooting` and `Algorithms.runFiniteDifference` both exist and are wired to
  pages. What is missing is the ODE-side framing (eigenvalue/Sturm-Liouville BVPs) and the link
  from this engine. **Priority: P2** (raised from P3 — the hard part is done).
- The bridge into §5G below; Fourier series has moved there, where it is a prerequisite rather
  than an afterthought.

## 5G. Partial Differential Equations

**First-class scope**, not a stretch goal. Grounded in Boyce & DiPrima chapters 10–11 — the same
textbook as the rest of this engine, whose final chapters are exactly a first taste of the
heat/wave/Laplace equations. Classification trees are specified in
`docs/ODE_PDE_SOLVER_DESIGN.md` §7; build order and reuse map in `docs/ODE_PDE_ENGINE_PLAN.md` §5
Phase 6.

Every prerequisite this section used to be blocked on now exists: symbolic integration
(Calculus Engine), Simpson's Rule and Gaussian Quadrature (Numerical), Jacobi/Gauss-Seidel and
general eigenvalues (Linear Algebra), and a 3D surface renderer (`Scene3D`).

#### 19. Fourier Series (Sine, Cosine, and Full)
- **Status:** ✅ Built 2026-07-23 — `CalculusSymbolic.fourierSeries` in
  `assets/js/calculus-symbolic.js`, wired to `engines/ode/methods/fourier-series.html` via the
  CAS worker. **Priority: P0 for this section** — every separation-of-variables solution below
  needs the coefficients, so nothing else in §5G could ship first; this unblocks #20–#23.
- Expand a function on `[-L, L]` as a sum of sines and cosines; half-range sine/cosine expansions
  on `[0, L]` for the boundary conditions the heat and wave equations impose. Three modes: full,
  half-range sine (odd extension), half-range cosine (even extension). Coefficients by Simpson's
  rule for every `n`, plus exact `π`-symbolic forms via `gatedIntegral` for the first few `n`
  where the integral is elementary (so the `1/n`-type pattern shows across rows); a cleanliness
  gate rejects `π`-numericized garbage.
- **On the site:** the partial sum converging against the target function, with the
  **Gibbs phenomenon** visible as persistent overshoot at a jump discontinuity; a coefficient
  table with exact + numeric columns; the series and partial-sum formulas in KaTeX.
- **Reuses:** `gatedIntegral` (π-preserving symbolic integration) and `simpson` (numeric
  fallback) from the Calculus Engine — the same primitives the rest of the engine is built on.
  Verified by 30 cases in `tests/verify-calculus.js` (square wave, sawtooth, constant, refusals).

#### 20. Heat / Diffusion Equation `u_t = k·u_xx` (Parabolic)
- **Status:** ✅ **Built & verified** — `solveHeatEquation` in `assets/js/ode-symbolic.js`
  (separation of variables, Fourier sine coefficients via Simpson's rule), wired to
  `engines/ode/methods/heat-equation.html`. **Phase 5c (2026-08-02) added** a numerical-schemes
  companion panel on the same page — explicit FTCS, implicit BTCS, and Crank-Nicolson, with the
  CFL ratio always shown and the explicit scheme's divergence past `r=1/2` displayed plainly
  (item #23 below, scoped to this page). Still not done: the `Scene3D` 3D surface treatment
  over `(x,t)` — currently a Plotly heatmap + time-slice snapshots, a possible future
  enhancement, not attempted.

#### 21. Wave Equation `u_tt = c²·u_xx` (Hyperbolic)
- **Status:** ✅ **Built** (Phase 5a, 2026-08-02) — `engines/ode/methods/wave-equation.html`.
  Both views specified here are present: the standing-wave (normal-mode) series from separation
  of variables, and d'Alembert's traveling-wave form for the finite Dirichlet string (the odd,
  `2L`-periodic reflection extension, not the infinite-string form this item originally
  sketched) — cross-checked against each other and shown only once they agree numerically,
  which is exactly the "seeing them agree is the teaching moment" this item asked for.

#### 22. Laplace's and Poisson's Equations (Elliptic, Steady State)
- **Status:** ✅ **Built** (Phase 5b, 2026-08-02) — `engines/ode/methods/laplace-poisson.html`.
  Laplace's equation on a rectangle with Dirichlet data on up to all four edges, solved by
  separation of variables (sinh-series) and cross-checked against relaxation
  (`LinAlg.jacobi`/`gaussSeidel`, as originally specified); Poisson's `=f(x,y)` by relaxation,
  verified against the discrete equation. Draggable boundary values (a UI enhancement) not
  attempted — inputs are typed expressions.

#### 23. Numerical PDE Schemes (Explicit, Implicit, Crank-Nicolson) and Stability
- **Status:** ✅ **Built** (Phase 5c, 2026-08-02), scoped to the heat equation page — see #20.
  Explicit FTCS, implicit BTCS, and Crank-Nicolson on the same problem the page already has a
  trusted analytic answer for; the CFL ratio is always on screen, and running explicit past
  `r=1/2` visibly diverges (confirmed: `max|u| ~ 10²²` after 60 steps at `r=0.9`) right next to
  implicit/Crank-Nicolson staying accurate at the same `r` — exactly the demonstration this item
  called for. Not built as a separate general framework applied to every PDE page (e.g. the
  wave equation has no numerical-schemes panel of its own).
- **Should reuse:** `Algorithms.runFiniteDifference`'s grid machinery (built) and
  `LinAlg.luDecompose` / `solveSystem` for the implicit solves (built).

---


> **§6 Optimization Engine and §7 Graph Engine were removed 2026-07-30** (engines deleted; see git). Their items in the §10 cross-engine build order have been dropped. Section numbers §8–§10 are left unchanged so existing cross-references still resolve.

# 8. Complex Analysis Engine

**Status: all six phases built (2026-08-01) — 12 method pages live.** Full state and the
branch-cut resolution in `docs/kernel/10_ENGINE_COMPLEX.md`. The Cauchy integral formula and the
argument principle & Rouché pages were added on 2026-08-01 (both reuse the existing contour
machinery via a new `complex-contour-theorems.js` module, verified by
`tests/verify-contour-theorems.js`). The one remaining topic without a page is
**Schwarz–Christoffel** (Phase 6, P3).

**Textbook basis:** Churchill & Brown, *Complex Variables and Applications* — the near-universal
US undergraduate text — cross-checked against Gamelin, *Complex Analysis*. Scope is a standard
one-semester junior/senior course.

**Why this engine:** it is the natural completion of the Calculus Engine. The residue theorem
evaluates real integrals (`∫₀^∞ dx/(1+x²)`, `∫₀^{2π} dθ/(a+b cosθ)`) that are hard or impossible
by real methods — so §8 #13 should cross-link directly from §2 #7 (Improper Integrals). Harmonic
functions (§8 #4) are the real parts of analytic functions, linking straight to Laplace's
equation in §5G #22.

**The distinctive problem it solves:** `f: ℂ → ℂ` has a 4-dimensional graph and cannot be plotted
as a curve or a surface. That is *the* difficulty of the subject. The engine's core contribution
is **domain colouring** (hue = `arg f(z)`, brightness = `|f(z)|`), in which zeros and poles become
unmistakable and their *order* is literally countable as hue cycles — plus before/after conformal
grid maps and animated contour traversal.

**Reuses (now realized):** `CalculusSymbolic.taylorSeries` (Laurent = Taylor + principal part),
`powerSeries` (radius of convergence), `LinAlg.polynomialRoots` (**already returns complex
roots**), `LinAlg`'s internal `cx` complex-arithmetic helper (promoted to the shared `complex.js`
module, now consumed by `mobius.js`), `Algorithms.runSimpson` (the numeric contour-integration
verify gate), `Scene3D` (|f(z)| surfaces), and the `cas-worker` harness. Phases 3–6 route the
branch-sensitive symbolic work through the Pyodide-SymPy worker (`sympy-worker.js`) and verify
every answer numerically — see `complex-residues.js` and `10_ENGINE_COMPLEX.md` §3a.

| Phase | Topics | Priority |
|---|---|---|
| 1 ✅ | 1 Complex arithmetic & the plane · 2 Complex functions & **domain colouring** · 3 Analyticity & Cauchy-Riemann · 4 Harmonic functions & conjugates | P0 |
| 2 ✅ | 5 exp/log/powers & branch cuts · 6 Complex trig & hyperbolic | P1 |
| 3 ✅ | 7 Contour integration · 8 Cauchy-Goursat · 9 Cauchy integral formula | P0 |
| 4 ✅ | 10 Taylor series in ℂ · 11 Laurent series & singularity classification | P1 |
| 5 ✅ | 12 Residues & the residue theorem · 13 **Real integrals by residues** · 14 Argument principle & Rouché | P0 |
| 6 ✅ | 15 Conformal mapping · 16 Möbius transformations · 17 Schwarz-Christoffel *(P3)* | P2 |

> Phase 6 #17 (Schwarz–Christoffel, P3) is the one listed topic not yet given a page — the
> argument principle & Rouché (Phase 5 #14) and a dedicated Cauchy integral formula page (Phase 3
> #9) were added on 2026-08-01. Tested by `verify-complex.js`, `verify-complex-symbolic.js`,
> `verify-complex-residues.js` (27), `verify-contour-theorems.js` (49), `verify-mobius.js` (36),
> `verify-domain-coloring.js`, `verify-cas-worker.js`.

**Main risks:** branch cuts are a *correctness* hazard, not a display one (a naive `log`/`sqrt`
silently picks a branch and is wrong by `2πi`); domain colouring is per-pixel and may need a raw
`<canvas>` rather than Plotly; nerdamer's complex depth beyond basic arithmetic is unmeasured and
must be probed before methods are designed around it. — The first risk is now mitigated by
routing branch-sensitive answers through SymPy + an independent numeric verify gate (refusal is
first-class); the standing branch-cut *test* is still open debt.

---

# 9. Number Theory Engine

**Status: complete.** All 26 topics below are built — 29 method pages under
`engines/number-theory/methods/`, `assets/js/number-theory.js` (1087 lines), covered by
`tests/verify-number-theory.js` (194/194 passing). Reconciled 2026-08-02 — this line
previously said "not started," which was badly stale. Historical build plan archived at
`archive/docs/engine-plans/NUMBER_THEORY_ENGINE_PLAN.md`; the ground-truth build record is
`docs/phase-1-plan/NUMBER_THEORY_ENGINE.md`.

**Textbook basis:** Rosen, *Elementary Number Theory and Its Applications* — the most widely used
US undergraduate text — cross-checked against Niven, Zuckerman & Montgomery.

**Why this engine is architecturally unlike every other one:** it has **no floating point, no CAS,
and no approximation.** Every other engine's central risk is numeric drift, and every verify gate
exists to catch a result quietly wrong by `1e-9`. Here `gcd(48,180) = 12` exactly, forever. There
is no tolerance parameter anywhere in this engine.

Three consequences:
1. **No nerdamer dependency.** Pure integer arithmetic.
2. **`BigInt` is the substrate, not `Number`** (verified available natively). RSA, Miller-Rabin on
   large primes, and Carmichael numbers all blow past `Number`'s 2⁵³ exact range immediately.
   **Using `Number` for arithmetic in this engine is a bug**, and the test suite must include a
   case beyond 2⁵³ that fails loudly if someone does.
3. **The risk moves from correctness to termination.** Nothing here returns a wrong answer;
   several things run effectively forever on a large input. So the honesty discipline shifts from
   "verify the answer" to **"bound the work and report when the bound is hit"** — a partial
   factorisation labelled *"stopped after N operations"* is a legitimate result, exactly as
   "this is not a u-substitution problem" is in the Calculus Engine.

It is also the most visual-per-concept engine on the site, and the visuals are *discrete*: sieve
animations, Ulam spirals, modular multiplication heatmaps, primitive-root rosettes — none of which
need any continuous-function machinery.

| Phase | Topics | Priority |
|---|---|---|
| 1 | 1 Divisibility · 2 Euclidean algorithm · 3 **Extended Euclidean & Bézout** · 4 Linear Diophantine | P0 |
| 2 | 5 Sieve of Eratosthenes · 6 Factorisation (trial/Fermat/Pollard rho) · 7 Primality (Fermat, Miller-Rabin, **Carmichael numbers**) · 8 Distribution & Ulam spiral *(P2)* | P0 |
| 3 | 9 Modular arithmetic · 10 Linear congruences · 11 **Chinese Remainder Theorem** · 12 Fermat's little & Euler's theorem · 13 Wilson *(P2)* | P0 |
| 4 | 14 Euler's totient φ · 15 Divisor functions τ, σ, perfect numbers · 16 Möbius inversion *(P2)* | P1 |
| 5 | 17 Order of an element · 18 **Primitive roots** · 19 Discrete logarithm *(P2)* | P1 |
| 6 | 20 Quadratic residues & Legendre symbol · 21 **Quadratic reciprocity** · 22 Jacobi symbol *(P2)* | P1 |
| 7 | 23 Modular exponentiation · 24 **RSA** · 25 Diffie-Hellman · 26 Classical ciphers *(P3)* | P1 |

**Note on #24:** RSA must use `BigInt` moduli large enough that the factoring page (#6) visibly
*fails* to break them within its operation budget. A textbook demo with `p=61, q=53` teaches the
mechanics but implies the cipher is breakable by hand — the wrong intuition. That contrast between
#6 and #24 is the actual lesson.

---

# 10. Cross-Engine Build Order

Flattening everything above into one sequence. Within a tier, engines are interleaved rather
than finishing one engine before starting the next — the Numerical Engine is the flagship and
should stay ahead, but a fully "textbook-complete" ODE Engine with nothing built in Statistics
is a worse use of the same hours than moving each engine forward together.

## Tier 0 — the glaring gaps (build first)
1. Numerical Engine — Newton-Raphson (§1A.3) ✅ Built 2026-07-20, together with Fixed-Point
   Iteration (§1A.2, bumped P1 → P0 as its conceptual prerequisite) — see `tests/verify.js`
   for the regression cases.
2. Numerical Engine — Secant Method (§1A.4) ✅ Built 2026-07-20 — see `tests/verify.js`.
3. Numerical Engine — Cubic Spline Interpolation, incl. the Runge's-phenomenon toggle
   against the existing Lagrange page (§1B.14) ✅ Built 2026-07-20 — see `tests/verify.js`.
4. ~~Graph Engine — Depth-First Search (§7A.1)~~ — Graph Engine removed 2026-07-30
5. Numerical Engine — Trapezoidal Rule (§1C.17) ✅ Built
6. Numerical Engine — Simpson's Rule (§1C.18) ✅ Built
7. Linear Algebra Engine — LU Decomposition (§3A.2) ✅ Built
8. Linear Algebra Engine — Eigenvalues/Diagonalization, general n×n (§3D.15) ✅ Built
9. ODE Engine — Separable Equations (§5A.1) ✅ Built
10. ODE Engine — Linear First-Order / Integrating Factor (§5A.2) ✅ Built
11. ODE Engine — 2nd-Order Homogeneous, Constant Coefficients (§5B.7) ✅ Built
12. Statistics Engine — Descriptive Statistics Explorer (§4A.1) ✅ Built
13. Statistics Engine — Sampling Distributions & CLT (§4B.5) ✅ Built
14. Statistics Engine — Confidence Intervals (§4B.7) ✅ Built

## Tier 1 — core curriculum, right after
15. Numerical Engine — Fixed-Point Iteration, False Position, Divided Differences, Numerical
    Differentiation, Romberg Integration, Power Method
16. Calculus Engine — Curve Sketching, Techniques of Integration, Series Convergence Tests,
    Partial Derivatives/Tangent Planes, Volumes of Revolution
17. Linear Algebra Engine — Jacobi, Gauss-Seidel, Vector Spaces/Basis/Dimension, Four
    Fundamental Subspaces, Gram-Schmidt, SVD ✅ Built
18. Statistics Engine — Discrete & Continuous Distributions, Two-Sample/Paired t-Tests,
    Chi-Square Tests, Multiple Linear Regression ✅ Built
19. ODE Engine — Exact Equations, Applications (cooling/mixing/growth), Reduction of
    Order/Undetermined Coefficients/Variation of Parameters, Mechanical Vibrations, Laplace
    Transforms, Systems of Linear ODEs/Phase Portraits, Heun's Method
20. ~~Optimization Engine — Newton's Method for Optimization, Lagrange Multipliers (Calc-3
    version first), Duality/Sensitivity Analysis~~ — Optimization Engine removed 2026-07-30
21. ~~Graph Engine — Topological Sort, Kruskal's Algorithm, Bellman-Ford~~ — Graph Engine removed 2026-07-30

## Tier 2 — standard but secondary
22. Everything tagged P2 above, roughly in the order listed within each engine section.

## Tier 3 — advanced / enrichment, once the rest is solid
23. Everything tagged P3 above — Vector Calculus, Metaheuristics, Network Flow,
    Power Series Solutions.

> **Updated 2026-07-22 — two items moved out of Tier 3:**
> - **PDEs are no longer Tier 3.** They are first-class scope for the ODE/PDE Engine (§5G
>   #19–23), and every prerequisite they were waiting on now exists. Fourier Series (#19) is
>   P0 *within* that section, since nothing else in §5G can ship before it.
> - **Boundary-Value Problems** dropped to P2 (§5F #18) — the numerical half is already built
>   (`Algorithms.runShooting`, `Algorithms.runFiniteDifference`).
>
> The genuine Tier 0 blocker for the ODE/PDE Engine is not a topic at all: it is
> `ODE_PDE_ENGINE_PLAN.md` §5 **Phase 0** — fix the separable bug, write `tests/verify-ode.js`,
> and audit the unverified solvers before building anything new on top of them.

---

*This document is a living plan, not a spec — update statuses as items get built, and re-rank
if a course you're actually supporting emphasizes something differently than the general
textbook order above.*
