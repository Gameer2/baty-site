# Per-Engine Audit — Best Tool, Where We Miss, How to Optimize

Synthesized 2026-07-30 from full inventories of all seven engines (Numerical, Calculus,
Linear Algebra, Statistics, ODE, Number Theory, Complex). Project constants: **no build
step, client-side only, answer-correctness first, every branch-sensitive answer independently
re-verified numerically, refusal is first-class.**

The headline: the architecture is sound and the correctness discipline is real. Almost every
"miss" falls into one of four buckets — (1) **a page promised in the roadmap that was never
built**, (2) **a hand-rolled path that duplicates a shared module that already exists**, (3) **a
symbolic method deliberately punted to SymPy that could be brought in-house for offline
correctness**, or (4) **a hardcoded cap that silently returns a partial answer without a clear
UI signal**. None of it is "wrong engine, throw it out."

---

## 1. Numerical (flagship) — 29 methods

**Best tool available:** For the *teaching* mission (show the algorithm, not just the answer),
a hand-rolled implementation per method is exactly right — GSL/SciPy would give answers but
hide the iteration. For production-grade numerics you'd reach for **GSL** (C) or **numeric.js**
(JS, browser-suitable). The honest assessment: this engine's value *is* the hand-rolled
iteration tables, so swapping in GSL would destroy the product. Keep hand-rolled.

**Where it misses:**
- **Lagrange interpolation is the only method not in the shared `algorithms.js`** — it's
  hand-rolled inside `lagrange.js`, so `verify.js` can't reach it. It has **no direct
  known-answer test**; correctness is only implied by Neville's cross-check on the same points.
- **QR algorithm is unshifted** (`runQRAlgorithm`) — won't converge for equal-magnitude or
  complex eigenpairs. The Linear Algebra engine already ships a *shifted* QR on Hessenberg
  (`LinAlg.eigenvaluesQR`) that handles both. The Numerical QR page is the weaker cousin.
- **`runRiemannSum`** is implemented but has no dedicated page and no test in this engine
  (the Calculus engine uses it instead).
- UI iteration caps (mostly `max=200`) are fine; the algorithms themselves take params and impose
  no internal ceiling. No silent-wrong answers found.

**How to optimize:**
- Move Lagrange's core (`lagrangeCoeffs`/`evalPoly`/`basisValueAt`) into `algorithms.js` and add
  a direct known-answer test. Small, removes the one test gap.
- Either reuse `LinAlg.eigenvaluesQR` inside the Numerical QR page (showing the shift as a
  labeled improvement) or document the unshifted limitation on the page itself — right now the
  non-convergence is undocumented.
- Lowest priority of the seven; this engine is the most complete.

---

## 2. Calculus — 25 methods

**Best tool available:** **SymPy** (via the existing Pyodide worker) is the gold standard for
exact symbolic integration/limits; **nerdamer** is the fast in-page fallback. The two-tier
strangler-fig (nerdamer → SymPy) already in place is the right shape. The genuinely hard cases
(Rubi-style rule-based integration) are where SymPy and even Mathematica differ.

**Where it misses:**
- **Fourier series has no method page** — `CalculusSymbolic.fourierSeries` + `fourierSeriesValue`
  are implemented, tested in `verify-calculus.js:1176`, and whitelisted as a worker op, but
  there is **no `fourier-series.html`** and `methods.html` doesn't list it. (The ODE engine
  *hosts* a Fourier page that calls the Calculus core — so the math works, the Calculus
  catalog just doesn't expose it.) This is the single biggest engine↔UI gap across all engines.
- **The symbolic kernel is best-effort but two technique pages still bypass it.**
  `algebraicSubstitution` and `completeTheSquare` use a numeric "prove-on-domain-sampling"
  workaround (`reduceRadical`) instead of the now-existing `AssumptionContext` (L1). That's
  documented debt, not a bug, but it's the kind of gap that produces the measured
  `√(x²−9)` branch failures elsewhere.
- **`file://` has no safety net** — the sync in-page fallback can't be interrupted and SymPy is
  unavailable entirely. Worker timeout protects `http(s)://` only.
- Stale test counts in `methods.html` ("757" vs the doc's "809") — cosmetic but rots trust.
- `CALCULUS_ENGINE_PLAN.md` is itself stale (says 18/22 cards; live is 25).

**How to optimize:**
- Build the Fourier page — the core is done and tested, this is pure wiring. Biggest
  visibility win for the least new math.
- Re-point `algebraicSubstitution`/`completeTheSquare` at `AssumptionContext` so the domain
  question becomes an assumption query instead of a sample. Closes the branch-correctness gap
  that motivated the kernel in the first place.
- Replace hardcoded test counts with a computed value (or just drop the number) so they stop
  rotting.
- Triple integrals / cylindrical-spherical / ℚ(α) integration are deliberately scoped out —
  leave them unless the roadmap demands them.

---

## 3. Linear Algebra — 18 methods

**Best tool available:** Hand-rolled is defensible for teaching (iteration visible), but this is
the one engine where a **proven numeric library would measurably improve answers**: LAPACK-grade
eigenvalue/SVD solvers are more accurate on ill-conditioned matrices than Faddeev–LeVerrier +
Durand–Kerner. A browser-suitable option is **numeric.js** or vendoring a small LAPACK port.
That said, the test suite shows the hand-rolled routes hold up to n=30 including ill-conditioned
sets — so this is about robustness margins, not known wrong answers.

**Where it misses:**
- **Linear Transformations is 2×2 only** — the page hardcodes four inputs. The roadmap promised
  the *general* idea including non-geometric maps (differentiation on polynomials). Most
  concrete partial implementation in the engine.
- **Several promised visuals were never built:** SVD image-compression viewer (roadmap called
  it "the single most compelling visual"), Markov state diagram, CG path-through-solution-space
  plot, SOR ω-slider, determinant cofactor-expansion tree, animated Gram-Schmidt. The math is
  all there and tested; the *pictures* the roadmap sold are missing.
- **Matrix inversion is reimplemented inside `stats-algorithms.js`** instead of reusing
  `LinAlg.inverse` / the shared matrix utilities — flagged by the stats BACKLOG itself.
- Numerical caps are well-chosen and documented (char-poly route n≤12, cofactor det ≤8×8, QR
  above). These are safety caps, not feature gaps.

**How to optimize:**
- Generalize Linear Transformations to n×n and add a non-geometric example (poly
  differentiation matrix). This is the one true *feature* gap.
- Build the SVD image-compression viewer — rank-k reconstruction is already computed
  (`lowRankApproximation`); it just needs an image-canvas front end. Highest "wow per line" of
  any gap.
- Have Statistics import `LinAlg.inverse` instead of its local `matInverse`.
- The roadmap text is stale (claims eigenvalues/LU are Tier-0 gaps when both are built and
  verified at n=30) — fix the roadmap, not the code.

---

## 4. Statistics — 11 methods

**Best tool available:** For the *computation*, hand-rolled special-function approximations
(Lanczos log-gamma, Lentz incomplete beta, AS erf) are textbook-correct and fast. The
gold-standard library is **Boost.Math / scipy.stats** — but those give answers, not the
visible PMF/CDF/CI construction this engine sells. Keep hand-rolled; the approximations are
the right tier (1e-7 erf, 3e-9 gamma — matches what scipy effectively uses internally).

**Where it misses:**
- **One-Way ANOVA (F-test) not built** — and it's a *cheap reuse*: F-CDF is
  `betai(df1/2, df2/2, df1·x/(df1·x+df2))`, already-implemented `betai`. Roadmap P2, BACKLOG
  Tier 2.
- **Polynomial regression not built** — reuses MLR matrix machinery with x, x², … columns.
- **Point estimation (MoM, MLE) and nonparametric tests (Wilcoxon/Kruskal-Wallis) not built**
  (P2/P3).
- **`matInverse` is duplicated** from the Linear Algebra engine (see above) — the BACKLOG
  explicitly warned against this.
- **Welch two-sample only exposes d₀=0 in the shared module** — the general hypothesized
  difference is handled in the page, not the algorithm.
- **MLR exact-fit reports p=0** (β/0 → ±Inf → `tCDF(Inf)=0`) — defensible convention, but
  flagged.
- **Roadmap §4 is stale** — marks ~10 fully-built-and-tested items as "⚪ Missing."

**How to optimize:**
- ANOVA first: `runANOVA` + `fCDF` (one betai call) + a page. Smallest code, fills an obvious
  syllabus hole.
- Polynomial regression second: trivial on the existing MLR matrix path.
- Deduplicate `matInverse` → `LinAlg.inverse`.
- Fix the roadmap statuses (the pattern repeats across engines — the roadmap is the most
  consistently stale doc in the repo).

---

## 5. ODE/PDE — 7 methods

**Best tool available:** **SymPy `dsolve`** (via Pyodide) is the only general symbolic ODE solver
that runs in a browser; nerdamer deliberately has *no* `dsolve`. The shipped three-tier design
(hand-rolled classifier → SymPy → numeric RK4) is the correct architecture and matches what
Mathematica/Maple do internally (classify → specialize → fall back).

**Where it misses:**
- **Laplace Transform page is a themed front-end over generic `dsolve()`** — no transform
  table, no shifting theorems, no partial-fraction inversion, no derivative/integration
  properties are ever computed. It's labeled as a Laplace solver but does no Laplace math.
  Plan marks the real engine ⚪ Not started.
- **Series Solutions refuses Frobenius cases 2 & 3** (repeated / integer-differing indicial
  roots) because SymPy's `2nd_power_series_regular` hint silently returns an incomplete
  solution. Honest refusal, but Bessel's equation — the canonical example — is refused.
  Plan marks a real Frobenius engine ⚪ Not started.
- **`charRoots` is degree-2 only** — blocks higher-order (n≥3) constant-coefficient equations.
  `LinAlg.polynomialRoots` already generalizes this; just not wired in.
- **Systems of ODEs (`x'=Ax`, phase portraits) not built** — though `LinAlg.eigenvalues` /
  `eigenvectorsFor` / `diagonalize` already exist. Cheap reuse, high pedagogical value.
- **Wave / Laplace-Poisson PDEs and numeric PDE schemes (explicit/implicit/Crank–Nicolson +
  CFL stability) not built.** The heat equation is the only PDE.
- **Two known bugs in x-missing reduction** (paused mid-fix): `C_1` renders as `C\_1` (math.js
  toTex escapes underscores), and `(y+1)y''=(y')²` returns a needlessly complex answer because
  verify sample points all sit in `y>-1`.
- **The SymPy fallback tier has no Node-runnable tests** — Laplace and Series correctness rests
  on manual verification only.

**How to optimize:**
- Wire `charRoots` → `LinAlg.polynomialRoots` to unlock order ≥3. One-line-ish generalization.
- Build the ODE systems page on the existing LinAlg eigensystem — phase portraits from
  eigenvalues are the classic payoff.
- Fix the two x-missing bugs (toTex subscript escaping + verify sample-point domain).
- A real Laplace engine (table + shifting + partial-fraction inversion) is the largest
  symbolic build but the highest "this page claims to do X and doesn't" payoff. A real
  Frobenius engine is similarly large; both are P2, not blocking.
- Add browser/Pyodide-context tests for the SymPy fallback tier so Laplace/Series have
  regression coverage.

---

## 6. Number Theory — 29 methods

**Best tool available:** **BigInt JS is exactly right** here — number theory lives or dies on
exact arithmetic, and BigInt gives it natively. The gold-standard library is **GMP/Pari** (C),
but for a browser site, hand-rolled BigInt is the correct choice. SymPy's `sympy.ntheory`
would also work but adds the multi-MB Pyodide load for zero correctness gain over BigInt. This
is the one engine where "don't change the tool" is unambiguous.

**Where it misses:**
- **No correctness gaps** — negative-remainder handling, sign fold-back in `extendedGcd`,
  non-coprime CRT, Tonelli–Shanks p≡3 mod 4 fast path, Carmichael test, and beyond-2⁵³ BigInt
  paths are all implemented *and* tested.
- **Performance, not correctness:** large inputs silently hit operation budgets and return
  `ok:false`/`prime:null` partials — by design, and surfaced with reasons. The budgets
  (factorize 100k ops, Pollard 100k, discreteLog 1M, etc.) are conservative for a browser.
- **Minor doc inaccuracy:** `number-theory.js:320` references a "compare methods page" that
  doesn't exist separately — the comparison is folded into `prime-factorisation.html`.
- Miller–Rabin deterministic-base bound (n < 3.3×10²⁴) is accurately stated.

**How to optimize:**
- Essentially nothing needed. Optionally surface the operation-budget limit in the UI before
  the user hits it (e.g. "inputs above ~N may return partial results"), and fix the one stale
  code comment. This is the healthiest engine.

---

## 7. Complex — 10 methods (built this session)

**Best tool available:** **SymPy** for branch-sensitive symbolic work (`sp.residue`,
`sp.singularities`, `sp.series`) — correctly tracking the principal branch — plus a **pure
Complex.js module** for closed-form arithmetic (Möbius). This is exactly the split shipped.
nerdamer is deliberately *not* used for branch-sensitive answers (it guesses branches).

**Where it misses (all documented in `10_ENGINE_COMPLEX.md` §7a):**
- **Argument principle & Rouché** — no page. Cheap: (1/2πi)∮f'/f = zeros−poles, reusing
  `findSingularitiesWithResidues` + a numeric f'/f contour.
- **Schwarz–Christoffel** — no page; the one genuinely hard conformal map (nonlinear parameter
  system). P3 tail.
- **Branch-cut standing test** — not yet a regression test. The exp/log/powers page states the
  principal branch but there's no automated "discontinuity is exactly at the cut, magnitude
  2πi" assertion.
- **Laurent series** — displayed only, not a standing numeric-equality test.
- **Cauchy integral formula** — covered by the contour page's core but no dedicated page.

**How to optimize:**
- Argument-principle/Rouché page next (highest syllabus value per line of code).
- Add the branch-cut standing test — this is the hazard the whole engine is built around, and
  it's the one validation row still marked ⚠️.
- Re-validate Phase 1/2 exp/log/powers against the L1 assumptions layer when that lands (debt
  noted in §3a) — closes the last branch-correctness gap.

---

## Cross-cutting optimizations (do once, helps all engines)

1. **Roadmap is the most stale doc in the repo.** Statistics §4, Linear Algebra §3/§10,
   Calculus `CALCULUS_ENGINE_PLAN.md`, and ODE plan all mark built-and-tested items as missing.
   A single pass to reconcile roadmap ↔ actual code removes the false "miss" signals the user
   is seeing. **This is likely the bulk of "my work is miss."**
2. **Deduplicate the matrix inversion** in `stats-algorithms.js` → `LinAlg.inverse`.
3. **Generalize `charRoots`** (ODE) → `LinAlg.polynomialRoots` to unlock order ≥3 ODEs and
   unify the two polynomial-root paths.
4. **Add browser/Pyodide-context tests** for the SymPy fallback tier (Calculus integrate,
   ODE Laplace/Series) so the lazy-load path has regression coverage it currently lacks.
5. **Replace hardcoded test counts** in engine `methods.html` badges with a computed value or
   drop them — they rot and undercut trust.
6. **Reuse, don't rebuild:** the pattern that pays off most is "the math already exists in a
   shared module; build only the page." Fourier (Calculus), ANOVA (Statistics), ODE systems
   (Linear Algebra eigensystem), Argument-principle (Complex residues) are all *page-only*
   builds over existing tested cores.

## Priority ordering (by payoff / cost)

| Rank | Task | Engine | Why |
|---|---|---|---|
| 1 | Reconcile roadmap ↔ code (fix stale "Missing" marks) | all | Removes the false-miss noise; cheap |
| 2 | Build Fourier page | Calculus | Core done+tested; pure wiring; biggest visibility |
| 3 | ANOVA (F-test) page | Statistics | One `betai` call + page; fills syllabus hole |
| 4 | Generalize Linear Transformations to n×n | Linear Algebra | Only true feature gap in that engine |
| 5 | Wire `charRoots`→`polynomialRoots`; add ODE systems page | ODE | Unlocks order ≥3 + phase portraits |
| 6 | SVD image-compression viewer | Linear Algebra | Highest wow/line; math already there |
| 7 | Argument-principle/Rouché page | Complex | Cheap on existing residue module |
| 8 | Branch-cut standing test | Complex | Closes the hazard the engine is built around |
| 9 | Re-point algebraic-sub/complete-square at AssumptionContext | Calculus | Closes branch-correctness debt |
| 10 | Lagrange core → `algorithms.js` + test | Numerical | Removes the one test gap |