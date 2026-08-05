# Audit Report — The Lab / math-lab

**Date:** 2026-07-22
**Scope:** (1) whether the test suites can actually catch bugs vs. just replaying examples,
(2) bugs in the built engines' pages, (3) what's remaining vs. the roadmap.

---

## 0. TL;DR

- **Test quality is not uniform.** `verify-linalg.js`, `verify-calculus.js`, and the two
  `verify-cas-*.js` suites are genuinely good (invariants / behavior / failure-path tests).
  `verify-statistics.js` is mixed (point-checks backed by real property tests). **`verify.js`
  (the Numerical Engine suite) is weak** — one hardcoded textbook example per method. This is
  the one that matches "lots of tests just test examples, not general cases."
- **Engine wiring (Numerical only, audited so far):** no critical or wrong-answer bugs. Four
  cosmetic defects — a negative-constant sign bug in polynomial-display LaTeX on three pages
  (visible on the chebyshev-econ **default example**), and a status-indicator dot that
  disappears on first input across 9 pages.
- **Roadmap is massively stale:** 26 of 30 Numerical-Engine Section-1 items are marked
  "⚪ Missing" but are actually built and wired. Two genuine partials remain (Aitken overlay,
  Horner all-roots loop).
- **Coverage caveat:** this report fully covers all 6 test files and the Numerical Engine's
  page wiring. The other four engines' page wiring (Calculus, Linear Algebra, Statistics,
  ODE/Optimization/Graph) were **not** audited for page bugs in this pass — only their test
  suites were reviewed.

---

## 1. Test-suite quality audit

### Methodology

Read all six test files in full. A test is "strong" if it asserts a property that holds for
*all* valid inputs (an invariant, a cross-identity, a convergence/order property, a
refusal/negative case, or seeded-random fuzz) so a bug cannot hide by being right on the one
example. A test is "weak" if it asserts a single hardcoded input → a single hand-computed
constant, which only proves the code reproduces that one number.

All suites currently pass: `verify.js` 76, `verify-linalg.js` 197, `verify-calculus.js` 347,
`verify-statistics.js` 320, `verify-cas-worker.js` 19, `verify-cas-client.js` 17 → **976 / 0**.

### Verdict by suite

| Suite | Tests | Quality | Pattern |
|---|---|---|---|
| `verify-linalg.js` | 197 | **Strong** | self-verifying invariants + seeded random large matrices |
| `verify-calculus.js` | 347 | **Strong** | behavior-based (differentiate the answer back) + refusal tests |
| `verify-cas-worker.js` | 19 | **Strong** | boots the real worker in a VM sandbox; op-whitelist + error-survival |
| `verify-cas-client.js` | 17 | **Strong** | kill-switch (timeout/terminate/respawn) against a mock that hangs |
| `verify-statistics.js` | 320 | **Mixed** | many point-checks, but backed by real property tests |
| `verify.js` (Numerical) | 76 | **Weak** | one hardcoded example per method |

### 1a. The strong suites (what makes them good)

**`verify-linalg.js`** — the gold standard. Its header says *"Most cases here are
self-verifying."* It checks properties that pin the answer down without any stored constant:
`P·A = L·U`, `Q'Q = I`, `A·A⁻¹ = I`, `‖Av − λv‖ = 0`, `det(AB) = det(A)det(B)`,
Cayley-Hamilton `p(A)=0`, rank+nullity = cols, Eckart-Young Frobenius error, least-squares
residual ⟂ columns of A, SVD `U diag(S) Vᵀ = A` with `σ = √eig(AᵀA)`. Plus **seeded random
matrices at n = 8 / 15 / 20 / 30**, named regression tests, and real edge cases: defective
matrices, complex rotation eigenvalues, ill-conditioned Gram-Schmidt, non-square, rank-
deficient, zero diagonal, non-SPD Cholesky, non-stochastic Markov.

**`verify-calculus.js`** — behavior-based, not string-based. For every antiderivative it
**differentiates the reported answer numerically at 5 sample points and compares to the
integrand** (`differentiatesBackTo`, `verify-calculus.js:39`); for trig-sub it uses an
*independent* math.js finite-difference check (`fdCheck`, `:199`) precisely because
nerdamer's own `diff()` is wrong on those forms. It tests **refusal** cases — the worst
failure mode, a confident wrong answer: refuses `∫x·eˣ` for u-sub, refuses `∫e^(x²)`
(non-elementary), refuses continuous functions at L'Hôpital, refuses non-rational functions
at partial fractions. Full decision-tree coverage for convergence tests (13 cases + refusals)
and power-series radius + endpoint classification (9 cases). Edge cases: degree 0, `b ≤ a`,
NaN center, the `abs(x)/x` hang case, DNE-vs-infinite classification.

**`verify-cas-worker.js`** — infrastructure test. Boots the real `cas-worker.js` in a `vm`
sandbox that emulates the worker global scope; verifies every `importScripts` path resolves,
`onmessage` is installed, the `__ready__` signal fires once, every op dispatches and returns
correct results, the op-whitelist refuses unknown names, and the worker **still answers
correctly after an error** (so one bad request can't kill every later one).

**`verify-cas-client.js`** — tests the kill-switch against a mock worker that can be made to
hang (impossible to test with a real worker, which is the whole point): a hang rejects at
~the configured timeout, `terminate()` is called exactly once, a fresh worker is respawned,
**bystander calls killed by the terminate also reject** (collateral damage), and there's a
sync fallback path when Workers are unavailable.

### 1b. The mixed suite

**`verify-statistics.js`** — many distribution PMF/CDF cases are point-checks against
textbook tables (binomial, Poisson, geometric, hypergeometric, normal, exponential, uniform,
gamma). That's the weak part: a bug right at the tested points but wrong elsewhere would pass.
**But** the CDFs are backed by real property tests that make them honest: `p === tCDF(|t|, df)`,
`p === 1 − chiSquareCDF(stat, df)`, `stat === Σ contributions`, `Gamma CDF == chi-square CDF`
at several points, MLR-p1 must match simple OLS, `C(n,k) == C(n,n-k)` symmetry, PRNG
determinism, CLT simulated-SE ≈ theoretical `σ/√n`, and a **4000-point monotonicity sweep**
of the gamma CDF (`verify-statistics.js:709`) that is literally labeled as having caught a
real regression ("2102 backward steps"). Plus error-handling (collinear predictors, `n < p+2`,
`factorial(-1)`, `k > n`, `P(B)=0`, priors not summing to 1). The PMF point-checks are the
gap; the cross-identities keep the CDFs honest.

### 1c. The weak suite — `verify.js` (Numerical Engine) — detailed

Almost every case is **one hardcoded textbook example → one hand-computed constant**:

- Bisection → only `x³−x−2` → `1.5213797068045676` (`verify.js:43`).
- Newton → `x²−2` and `x³−x−2`, both root constants (`:57`, `:66`).
- Secant → the same two functions (`:75`, `:82`).
- **Power method and QR algorithm use the identical matrix `[[2,1],[1,2]]`** (`:184`, `:214`)
  — they don't even use different inputs from each other.
- Shooting method & FD-BVP → one problem (`y'' = −y`), checked at **one grid point** (`:197`,
  `:227`).
- Numerical diff & Richardson → one function (`sin`), one point (`π/4`), one `h` (`:366`,
  `:375`).
- Neville, Newton-DD, Hermite (two pts), least-squares, Horner, Muller, False Position,
  Steffensen, Broyden, Newton-system → one case each.

The only things keeping it from pure example-memorization: the cross-checks
(Bisection↔Newton↔Secant↔Muller↔FalsePosition all → `1.5213797068045676`, a genuine
consistency invariant), Simpson's exactness-through-cubics, the spline properties
(collinear→line, `S(xᵢ)=yᵢ`), and the input-guard block.

#### Concrete bug-classes that slip straight through `verify.js`

Grounded against the shipped `math-lab/assets/js/algorithms.js`:

1. **Every divergence / horizontal-tangent guard is untested.** `runNewton` throws on
   `f′ ≈ 0` (`algorithms.js:92`) and on divergence (`:97`); `runSecant` throws on a near-
   horizontal secant (`:113`) and divergence (`:121`). The *only* throw-tests in the entire
   file (`verify.js:429–465`) cover Bisection, NumericalDiff, Richardson, and CubicSpline —
   **none** for Newton/Secant/FalsePosition/PowerMethod/QR. Delete those guards and the suite
   stays 76/0 green; a student hits a 0-tangent `x³−3x+2` and gets a NaN page.
2. **No convergence-rate tests.** Newton is quadratic, Secant ≈1.62, fixed-point linear when
   contractive. Tests assert only the *final value*, so an implementation that degraded Newton
   to linear convergence (still crawls to the root) would pass.
3. **No iteration-count / stopping-criterion tests.** Newton stops on `‖xₙ₊₁−xₙ‖ < tol`
   (`algorithms.js:96`), not `|f(x)| < tol`. Nothing tests that the criterion is sane —
   e.g., that it doesn't terminate one step early on a slowly-converging case, or that
   `maxIter` exhaustion is reported rather than silently returning a bad iterate.
4. **Iterative eigensolvers have no failure-mode coverage.** Power method and QR are each
   tested on one well-separated symmetric 2×2. No test for: complex dominant eigenvalue
   (power method can't converge — a known limitation worth pinning), eigenvalues of equal
   magnitude (power method stalls), or that QR actually *iterates* vs just returning the
   diagonal. `verify-linalg.js` already tests all of this properly (rotation→complex,
   defective, n=20) — the Numerical suite could mirror it.
5. **Quadrature has no error-decrease / error-order property.** Each rule is checked at one
   `n` against the true integral. Nothing asserts error → 0 as `n` grows (the *defining*
   property), or Simpson's `O(h⁴)` rate — so a bug that broke the error order but still
   roughly converged would pass.
6. **No seeded random fuzz** (unlike linalg). Every input is hand-picked.

### 1d. Prioritized recommendations to strengthen `verify.js`

1. **Test the guards** (biggest blind spot, cheapest). Newton/Secant/FalsePosition: a
   function with a horizontal tangent at the iterate, a divergent starting guess, a zero
   secant denominator — assert they throw.
2. **Quadrature property tests.** For each rule: integrate polynomials up to its exactness
   degree (must be exact), and assert `|Iₙ − I_true|` decreases with `n` (and the right
   rate: `O(h²)` trapezoid, `O(h⁴)` Simpson).
3. **Convergence-order tests.** Newton: `‖eₙ₊₁‖/‖eₙ‖²` bounded; Secant: measured rate ≈1.6;
   fixed-point: linear.
4. **Mirror linalg's eigensolver tests** for power/inverse-power/QR: complex spectrum,
   repeated eigenvalues, the `Av = λv` defining property (one-liner with `matVec`),
   trace/det invariants.
5. **Seeded-random fuzz** for polynomial-exact methods: interpolation `P(xᵢ) = yᵢ` on random
   data; Horner on random polynomials vs a naive `Σ cᵢxⁱ`.

---

## 2. Numerical Engine — page-wiring bugs

Scope: all 29 Numerical method pages + `methods.html` hub + the (deleted) index. Every
page's element IDs, Plotly target divs, page-module `<script src>`, vendor paths, and
`Algorithms.*` / `Engine.*` references resolve; all kernel signatures match their call sites;
input validation (NaN, empty, zero, negative-where-required, sign-change brackets, distinct
points) is present on every page. **No critical or wrong-answer bugs.** Four cosmetic defects:

### 2.1 [medium] chebyshev-econ — negative constant term rendered positive
- **File:** `math-lab/assets/js/chebyshev-econ.js:81-88`
- **Trigger:** load page → click "Try Example" (`x⁴ → degree 2`).
- **Result:** the formula block renders `p_econ(x) = 0.125000 + 1.000000x^{2}`. The correct
  economized polynomial (and the numeric coefficient cards below, and `verify.js:396`) is
  `−0.125 + x²`. The constant term is built as `${sign}${absC.toFixed(6)}` with `sign = ""`
  for `i === 0` (line 82 only sets `+`/`-` when `i > 0`), so a negative constant always shows
  positive. The kernel returns `−0.125` correctly; only the page LaTeX is wrong.
- **Note:** the `origLatex` built at line 72 is dead code — never displayed.
- **Severity medium because it's on the default example** (first thing a user sees).

### 2.2 [low-med] horner — negative leading coefficient sign dropped in preview
- **File:** `math-lab/assets/js/horner.js:28-35`
- **Trigger:** enter coeffs `−2, 3` (i.e. `−2x + 3`).
- **Result:** KaTeX preview renders `p(x) = 2x + 3` (positive leading term). The Horner
  computation and table use the parsed coefficients directly and are correct; only the
  preview is wrong. The default example (`2, -3, 4, -5`) has a positive leading coefficient,
  so it doesn't trigger.

### 2.3 [low-med] least-squares — negative constant term sign dropped
- **File:** `math-lab/assets/js/least-squares.js:73-79`
- **Trigger:** any fit whose intercept is negative.
- **Result:** fitted `p(x)` displayed with a positive constant. Same `sign = ""` for `i === 0`
  pattern as chebyshev-econ. Coefficient cards and residual table are correct.

### 2.4 [low] status-indicator dot wiped on 9 pages
- **Files:** `steffensen.js:38/42/48`, `newton-multiple-roots.js:38/44/48`,
  `neville.js:33/38/42`, `newton-dd.js:33/38/42`, `horner.js:25/45/50/54`,
  `least-squares.js:33/38/43/47`, `chebyshev-econ.js:29/34/39/43`,
  `numerical-diff.js:30/37/42/46`, `richardson-diff.js:30/37/42/46`.
- **Cause:** each HTML has
  `<div class="status-line" id="statusLine"><span class="status-dot"></span><span>…</span></div>`
  and `engine.css:455-459` colors `.status-dot`. These pages assign
  `statusLine.textContent = …`, which replaces both child spans with a text node, so the
  colored dot disappears on the first input/status update. Status is still conveyed by the
  surrounding `.status-line.ok/.bad` color — just the dot is gone.
- **Fix:** the root-finding/integration/eigen pages correctly update a separate
  `startStatusText` span; convert these 9 to that pattern.

---

## 3. What's remaining — roadmap reconciliation (Numerical Engine, Section 1)

The roadmap `math-lab/docs/CURRICULUM_ROADMAP.md` Section 1 is **massively stale**: 26 of 30
items are marked "⚪ Missing" but are actually built and wired into `methods.html`.

| # | Method | Roadmap status | Actual status |
|---|---|---|---|
| 1 | Bisection | ✅ Built | Built & Wired |
| 2 | Fixed-Point Iteration | ✅ Built | Built & Wired |
| 3 | Newton-Raphson | ✅ Built | Built & Wired |
| 4 | Secant | ✅ Built | Built & Wired |
| 5 | False Position | ⚪ Missing P1 | **Built & Wired** |
| 6 | Newton Multiple Roots | ⚪ Missing P2 | **Built & Wired** |
| 7 | Aitken Δ² / Steffensen | ⚪ Missing P2 | **Partial** — Steffensen page built; the Aitken "accelerate" overlay on the Fixed-Point page described in the roadmap is **not** built |
| 8 | Müller's Method | ⚪ Missing P2 | **Built & Wired** |
| 9 | Horner + Deflation | ⚪ Missing P2 | **Partial** — single Horner eval + one deflation step; the repeated-deflation "find all roots" loop is **not** built |
| 10 | Lagrange | ✅ Built | Built & Wired |
| 11 | Neville | ⚪ Missing P2 | **Built & Wired** |
| 12 | Newton Divided-Difference | ⚪ Missing P1 | **Built & Wired** |
| 13 | Hermite | ⚪ Missing P2 | **Built & Wired** |
| 14 | Cubic Spline | ✅ Built | Built (a mode toggle inside `lagrange-interpolation.html`, not a standalone page) |
| 15 | Numerical Differentiation | ⚪ Missing P1 | **Built & Wired** |
| 16 | Richardson Extrapolation | ⚪ Missing P2 | **Built & Wired** |
| 17 | Trapezoidal Rule | ⚪ Missing P0 | **Built & Wired** |
| 18 | Simpson's Rule | ⚪ Missing P0 | **Built & Wired** |
| 19 | Romberg Integration | ⚪ Missing P1 | **Built & Wired** |
| 20 | Adaptive Quadrature | ⚪ Missing P2 | **Built & Wired** |
| 21 | Gaussian Quadrature | ⚪ Missing P2 | **Built & Wired** |
| 22 | Discrete Least Squares | ⚪ Missing P2 | **Built & Wired** |
| 23 | Chebyshev Economization | ⚪ Missing P3 | **Built & Wired** |
| 24 | Power Method | ⚪ Missing P1 | **Built & Wired** |
| 25 | Inverse Power Method | ⚪ Missing P2 | **Built & Wired** |
| 26 | QR Algorithm | ⚪ Missing P2 | **Built & Wired** |
| 27 | Newton Nonlinear Systems | ⚪ Missing P2 | **Built & Wired** |
| 28 | Broyden's Method | ⚪ Missing P3 | **Built & Wired** |
| 29 | Shooting Method | ⚪ Missing P3 | **Built & Wired** |
| 30 | Finite-Difference BVP | ⚪ Missing P3 | **Built & Wired** |

**Genuine remaining build work (Numerical Engine):**
1. Aitken Δ² "accelerate" overlay on the Fixed-Point Iteration page (item 7).
2. Repeated-deflation "find all roots" loop on the Horner page (item 9).
3. Update the 26 stale "⚪ Missing" statuses to "✅ Built" in `CURRICULUM_ROADMAP.md`.

**Clean-up note:** the `M math-lab/engines/numerical/index.html` shown in git status is
actually a working-tree deletion (`D`) of a file nothing links to — `math-lab/index.html`
links directly to `engines/numerical/methods.html`. Safe.

---

## 4. Scope & coverage caveats

- **Test suites:** all 6 files (`verify.js`, `verify-linalg.js`, `verify-calculus.js`,
  `verify-statistics.js`, `verify-cas-worker.js`, `verify-cas-client.js`) read in full and
  assessed. Test-quality findings are complete.
- **Page wiring:** only the **Numerical Engine** (29 method pages + hub) was audited for
  page-level bugs. The other four engines' wiring — Calculus, Linear Algebra, Statistics,
  ODE/Optimization/Graph — were **not** audited for page bugs in this pass. (Their test
  suites were reviewed, but a passing kernel suite says nothing about page wiring: broken
  IDs, orphaned pages, dead "Try Example" buttons, etc. would not be caught by these tests
  at all — they run the kernel in Node, not the pages in a browser.)
- **Math correctness of kernels:** not re-derived; taken as covered by the passing suites,
  with the caveat (§1c) that `verify.js` under-covers several numerical methods.

---

## 5. Prioritized action list

1. **Strengthen `verify.js`** per §1d — start with the guard tests (#1) and quadrature
   property tests (#2), which close the biggest blind spots for the least code.
2. **Fix the 4 Numerical wiring bugs** per §2 — the chebyshev-econ sign bug is on the default
   example and should go first; sweep the same `${sign}${absC}` pattern across
   `chebyshev-econ.js` / `horner.js` / `least-squares.js`; then convert the 9
   `statusLine.textContent` pages to the `startStatusText`-span pattern.
3. **Audit the other four engines' page wiring** (Calculus, Linear Algebra, Statistics,
   ODE/Optimization/Graph) — the same check the Numerical engine got.
4. **Reconcile `CURRICULUM_ROADMAP.md`** — flip the 26 stale "Missing" → "Built"; record the
   two genuine partials (Aitken overlay, Horner all-roots).
5. **Build the two Numerical partials** (Aitken overlay on Fixed-Point; repeated-deflation
   loop on Horner) if/when prioritized.

---

## 6. Resume notes (paused 2026-07-22)

Status of the page-wiring audit across engines:

| Engine | Test-suite review | Page-wiring audit |
|---|---|---|
| Numerical | ✅ done | ✅ done (§2) |
| Calculus | ✅ done | ⏸ **incomplete** — re-run |
| Linear Algebra | ✅ done | ⏸ **incomplete** — re-run |
| Statistics | ✅ done | ⏸ **incomplete** — re-run |
| ODE / Optimization / Graph | — | ❌ out of scope (user: don't audit) |

The Calculus / Linear Algebra / Statistics page-wiring audits were launched as parallel
background agents with paradigm-aware instructions (Calculus=symbolic, LinAlg=float-with-
tolerance, Statistics=numerical; only flag violations of an engine's *own* paradigm), then
**stopped mid-run at the user's request** before any delivered a final report. Their findings
are therefore NOT in this report — nothing for those three engines should be treated as
audited. Re-launch the three agents to complete §2-equivalent sections for them.

**One unverified lead to check when resuming (Statistics):** the Statistics agent's last
transcript line said it had found a "z-test `mu0` scope bug" and was about to re-read the
function boundary to confirm — so it was close to done but NOT confirmed. Treat this as a
lead, not a finding: when re-running, specifically check the z-test page/module for a `mu0`
scoping issue. Do not act on it until verified.

**When resuming:**
1. Re-run the three page-wiring audits (Calculus, LinAlg, Statistics) — prompts already
   paradigm-aware (see memory `respect-engine-paradigm`). Each should produce a §2-style
   "Bugs found / roadmap reconciliation / verdict" block to append here.
2. Then update the §0 TL;DR and §4 coverage caveats to reflect the completed audits.
3. Optionally act on the prioritized list in §5 (strengthen `verify.js`; fix the 4 Numerical
   wiring bugs; reconcile the roadmap).

**Saved as durable memory:** `respect-engine-paradigm` — each engine is symbolic or
numerical by design; don't flag one for lacking another's idiom when auditing/building.