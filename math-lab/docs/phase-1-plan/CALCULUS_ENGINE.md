# Calculus Engine — Phase 1 (completed work)

Extracted from `docs/CALCULUS_ENGINE_PLAN.md`. Per that doc: **all 18 syllabus topics are
built — the engine is complete.**

## Shipped topics (each: own page + own `CalculusSymbolic.*` op + verify gate + tests)

- Limits — exact values, L'Hôpital, DNE detection, approach table.
- L'Hôpital's Rule — dedicated indeterminate-form classifier (`classifyForm`/`trendClassify`).
- Curve Sketching — f/f'/f'' linked plots; trusts `solve()` only on algebraic derivatives,
  numeric bisection fallback for transcendental ones.
- Applied Optimization — Extreme Value Theorem, critical points + both endpoints.
- u-Substitution — candidate search with refusal panel.
- Integration by Parts — LIATE split, one-level decomposition, differentiate-back check.
- Partial Fractions — `partfrac()` decomposition, product-tree `splitRational` detector.
- Trigonometric Substitution — all three radical forms, Pythagorean-identity cleanup,
  composition simplifier, finite-difference verify gate.
- Riemann Sums — numeric, `Algorithms.runRiemannSum` (deliberately in `algorithms.js`, not the
  symbolic core).
- Taylor Series — verified against f(a) and a numeric neighborhood check.
- Convergence Tests — 8-test decision tree (nth-term, geometric, p-series, integral,
  (limit-)comparison, ratio, root, alternating), partial-sum verification, honest refusal.
- Power Series & Radius of Convergence — ratio/root test, endpoints via Convergence Tests, any
  centre a, handles R=0 and R=∞.
- Vectors in Space — 11 standard 3D operations, numeric identity gate, first 3D page
  (`Scene3D`).
- Partial Derivatives & Tangent Planes — f_x, f_y, ∇f, tangent plane; central-difference gate;
  3D surface + tangent plane via `Scene3D.addSurface`.
- Volumes of Revolution — disk/washer/shell; π kept symbolic via `sub().toString()`
  (never `defint`/`.evaluate()`); independent Simpson verify gate; `Scene3D.addRevolution`.
- Multiple Integrals — double integrals, Cartesian Type I or polar region (auto Jacobian);
  nested-Simpson verify gate; `Scene3D.addParametricSurface`. Scope: double integrals only —
  triple integrals and cylindrical/spherical coordinates explicitly out of scope.
- Lagrange Multipliers — exact gradients via `diff()`, system solved by multi-start
  finite-difference-Jacobian Newton (nerdamer's own solver rejected — incomplete and inexact on
  the textbook circle case); verified via directional derivative along the constraint curve, not
  the Newton residual itself.
- Related Rates — chain rule built by hand (`Σ ∂f/∂v · dv/dt`); verified against an independent
  numeric total-derivative residual.
- Arc Length & Surface Area — via the shared `gatedIntegral`; Simpson verification; honest
  refusal for non-elementary lengths (e.g. `sin x`, `x²`).
- Parametric & Polar — slope/arc length/area, each independently verified; correctly refuses
  slope at a vertical tangent while area still resolves.
- Vector Calculus — divergence, curl, conservative test + potential recovery, line integrals,
  flux, Green's theorem (both sides computed and cross-checked).
- Improper Integrals — handles ±∞ and interior/boundary asymptotes; splits at interior
  singularities so a Cauchy-principal-value trap isn't mistaken for convergence; symbolic +
  independent numeric-sequence path must agree.
- Three supplementary integration calculators: algebraic-substitution, completing-the-square,
  integral-calculator (general "type any integral" tool with a kernel-backed rational-integration
  fallback path).

## Architecture (established, not to be re-derived)

- Every symbolic result is checked before being returned — differentiate-back for
  antiderivatives, two-sided numeric probe for limits. Failure returns `ok:false` and no
  formula; "this technique doesn't apply" / "the limit does not exist" are first-class results.
- Layering: page → `assets/js/<method>.js` (DOM only) → `cas-client.js` → `cas-worker.js` →
  `calculus-symbolic.js` (pure, DOM-free, Node-testable). The whole engine runs in the worker,
  not just CAS primitives, so a hang anywhere (e.g. inside a candidate search) is killable.
- `Scene3D` (`assets/js/calculus-3d.js`) is the shared 3D layer: hand-rolled orbit, colored axis
  arrows, `addArrow`/`addPoint`/`addLine`/`addSurface`/`addRevolution`/`addParametricSurface`.
- Test suites, all green as of last recorded run: `verify.js` 76, `verify-calculus.js` 809,
  `verify-cas-client.js` 17, `verify-cas-worker.js` 30.

## Hard-won nerdamer facts (apply to any future symbolic work anywhere on the site)

- `solve()` on an expression containing a transcendental function silently returns rational
  *approximations* with no indication they aren't exact (confirmed: `solve(cos(x),x)` gives ~38
  fractions instead of `π/2 + kπ`). Never trust it there.
- `limit(1/x, x, 0)` wrongly returns `Infinity` (the two-sided limit doesn't exist).
  `limit(abs(x)/x, x, 0)` hangs outright.
- `.simplify()` can change the *value*, not just the form — confirmed on a real case found while
  building Integration by Parts. Never call it on something about to be returned or verified;
  re-parsing via `.toString()`/`pretty()` is safe.
- Nerdamer normalizes away quotient structure (`/` becomes `^(-1)`) — anything needing to see a
  quotient must parse the user's original string, not the normalized one.
- `math.js`'s `node.toString()` inserts spaces (`e^x` → `e ^ x`), breaking naive regex
  classification — round-trip through nerdamer's `pretty()` first.
- Dispatch tables must use `Object.create(null)` — a plain object literal resolves `constructor`
  etc. from `Object.prototype`, which can pass a truthiness check and get invoked.
