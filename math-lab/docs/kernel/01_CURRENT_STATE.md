# 01 — Current State (Measured)

Everything in this file was **measured on 2026-07-25** by running the real vendored code in Node,
not inferred from documentation. Reproduce with `node tests/bench/baseline.js`.

---

## 1. Code inventory

### The three symbolic engines

| Engine | Symbolic module | Lines | CAS calls | Method pages | Test suite | Status |
|---|---|---|---|---|---|---|
| Calculus | `assets/js/calculus-symbolic.js` | 5,154 | 250 | 22 | `tests/verify-calculus.js` | 809 assertions, 0 fail |
| Calculus (advanced) | `assets/js/integration-advanced.js` | 430 | — | — | `tests/verify-integration-advanced.js` | 44 assertions, 0 fail |
| ODE/PDE | `assets/js/ode-symbolic.js` | 1,834 | 72 | 5 | `tests/verify-ode.js` (37 KB) | passing |
| Complex | `assets/js/complex-symbolic.js` | 513 | 14 | 6 | `verify-complex.js`, `verify-complex-symbolic.js` | passing |
| *(shared)* | `assets/js/calc-core.js` | 376 | 42 | — | — | — |

### Dependency surface

**Only 11 of 140 JS modules touch the CAS.** This is much smaller than it feels and is good news —
the blast radius of replacing the CAS is contained.

| Module | CAS references |
|---|---|
| `calculus-symbolic.js` | 250 |
| `ode-symbolic.js` | 72 |
| `calc-core.js` | 42 |
| `complex-symbolic.js` | 14 |
| `cas-worker.js` | 6 |
| `domain-coloring.js`, `complex.js` | 2 each |
| `vectors-in-space.js`, `u-substitution.js`, `ode-fourier.js`, `cas-client.js` | 1 each |

CAS primitive usage across the codebase: `diff` (33), `integrate` (15), `limit` (4), `solve` (1),
`partfrac` (1), `factor` (1). **The kernel needs to be excellent at `diff` and `integrate` before
anything else.**

### Public API currently exposed

`CalculusSymbolic` — 24 entry points: `uSubstitution`, `integrationByParts`, `partialFractions`,
`trigSubstitution`, `limit`, `lhopital`, `taylorSeries`, `convergenceTests`, `powerSeries`,
`curveAnalysis`, `appliedOptimization`, `vectorOps`, `partialDerivatives`, `volumeOfRevolution`,
`multipleIntegral`, `lagrangeMultipliers`, `relatedRates`, `arcLengthSurfaceArea`,
`parametricAndPolar`, `vectorCalculus`, `improperIntegral`, `fourierSeries`, `fourierSeriesValue`,
`configure`.

`ODESymbolic` — `classifyFirstOrder`, `classifySecondOrder`, `parseSecondOrder`,
`isSecondOrderInput`, `rhsFromInput`, `solveHeatEquation`, `heatSeriesValue`, `toLatex`,
`formatNum`, `configure`.

`ComplexSymbolic` — `cauchyRiemann`, `decompose`, `harmonicConjugate`, `configure`.

**This API is the contract the new kernel must satisfy.** It is also the migration boundary: as
long as these signatures hold, the 140 modules above never need to change.

---

## 2. The dependency: nerdamer

**Vendored:** `assets/vendor/nerdamer.min.js`, 436 KB, all-in-one bundle.
**Version:** reports `1.4.6` (plus module versions `2.0.3`, `1.4.2`).
**Lineage:** [nerdamer-prime](https://github.com/together-science/nerdamer-prime) — original
nerdamer stopped at 1.1.13 and was archived; prime is the maintained continuation.
**Licence:** MIT — closed-source derivatives are permitted.

**Upstream's stated philosophy:** *"Nerdamer wasn't meant to be a complete symbolic algebra
system."* The maintainers prioritise bug fixes over feature expansion. **Do not plan on upstream
building what you need.**

### Loading note

`tests/lib/load-cas.js` cannot `require()` the bundle directly — its CommonJS branch does a
`require('./nerdamer.core.js')` for the unbundled layout, which does not exist next to the
all-in-one file. It runs the bundle in a `vm` context faked to look like a browser (`self`/`window`
present, `module` absent). **Consequence: tests exercise byte-for-byte the same bundle the pages
load.** Preserve this property in any replacement.

---

## 3. Measured capability — integration

40 standard first/second-course integrals, run **straight at nerdamer**, bypassing the engine
layer. Verified by central-difference comparison in math.js — never nerdamer checking nerdamer.

### Headline

| Outcome | Count | % |
|---|---|---|
| ✅ Correct | 28 | 70% |
| ❌ **Silently wrong** | 6 | **15%** |
| ⚪ Refused / returned unevaluated | 5 | 12.5% |
| ⚠️ Unverifiable | 1 | 2.5% |

The 15% is the number that matters. A refusal is safe; a confident wrong answer shown to a
student is the worst possible failure mode.

### Every failure, with diagnosis

| Integral | Topic | What nerdamer returned | Root cause |
|---|---|---|---|
| ∫1/((x−1)²(x+2)) | repeated factor | `-3*(-1+x)^(-1)+log(-1+x)` — **missing the log(x+2) term** | `partfrac` bug |
| ∫√(4−x²) | trig sub a²−x² | `...cos(asin(x/2))*sin(asin(x/2))...` | no inverse-trig rewriting |
| ∫√(9−x²) | trig sub a²−x² | same shape | no inverse-trig rewriting |
| ∫√(1+x²) | trig sub a²+x² | returned unevaluated | no rule |
| ∫√(x²−1) | trig sub x²−a² | returned unevaluated | no rule |
| ∫x²/√(x²−9) | trig sub x²−a² | contains `sqrt(-9)` → NaN on ℝ | **wrong branch chosen — no assumptions** |
| ∫1/(x²√(x²−1)) | trig sub → asec | `-cot(asin(x))*sqrt(-1)^(-1)*sqrt(1)` | **wrong branch — no assumptions** |
| ∫1/√(x²+4x+13) | complete the square | returned unevaluated | no preprocessing |
| ∫1/(x²+2x+5) | complete the square | `((1+x)^2-1-2*x-x^2)^(-1)*log(...)` — **that denominator is algebraically 0** | `integrate` never calls `simplify` |
| ∫x√(x+1) | algebraic sub | returned unevaluated | no u=√(x+1) rule |
| ∫1/(1+√x) | algebraic sub | `log(1+sqrt(x))` — wrong | no u=√x rule |
| ∫e^√x | sub + by-parts | returned unevaluated | no u=√x rule |

### The four root causes

Twelve failures collapse to four causes, three of which are fixable **above** nerdamer:

| # | Root cause | Failures | Fix location |
|---|---|---|---|
| 1 | No inverse-trig composition rewriting (`cos(asin u) → √(1−u²)`) | 4 | **your layer** (L2) |
| 2 | No assumptions → wrong substitution branch | 2 | **your layer** (L1) |
| 3 | No completing-the-square / algebraic-substitution preprocessing | 5 | **your layer** (L2) |
| 4 | `partfrac` repeated-factor bug | 1 | upstream, or L3 |

---

## 4. Measured capability — the kernel itself

Pure algebra. No calculus. A real CAS kernel must nail all of these.

### Canonical simplification — 6/8

| Test | Input | Got | Want |
|---|---|---|---|
| ✅ expand-and-cancel | `(1+x)^2-1-2*x-x^2` | `0` | `0` |
| ✅ difference of squares | `(x-1)*(x+1)-x^2+1` | `0` | `0` |
| ✅ trig Pythagorean | `sin(x)^2+cos(x)^2-1` | `0` | `0` |
| ✅ exp/log inverse | `log(e^x)-x` | `0` | `0` |
| ✅ rational cancel | `(x^2-1)/(x-1)-x-1` | `0` | `0` |
| ✅ nested radical | `sqrt(x^2)-abs(x)` | `0` | `0` |
| ❌ **log product rule** | `log(x*y)-log(x)-log(y)` | `-log(x*y)^2+log(x)+log(y)` | `0` |
| ❌ **double angle** | `sin(2*x)-2*sin(x)*cos(x)` | unreduced | `0` |

> **Critical finding.** Row 1 passes — `simplify` *does* reduce `(1+x)^2-1-2x-x^2` to `0`. Yet the
> integral of `1/(x²+2x+5)` returned that exact expression **unsimplified in a denominator**. So
> `integrate()` never calls the simplifier it already has. This is a cheap algorithm bug, not a
> deep kernel flaw — the kernel is in better shape than the 70% suggests.

> The `log(xy)` row is worse than a miss: it *corrupts* the expression into `-log(x*y)^2`. That is
> a genuine simplifier bug, and it means log-heavy expressions cannot be trusted.

### Inverse-trig composition — 0/4

| Input | Got | Want |
|---|---|---|
| `cos(asin(x))` | unchanged | `sqrt(1-x^2)` |
| `sin(acos(x))` | unchanged | `sqrt(1-x^2)` |
| `tan(asin(x))` | unchanged | `x/sqrt(1-x^2)` |
| `sec(atan(x))` | `cos(atan(x))^(-1)` | `sqrt(1+x^2)` |

**Complete miss.** This is a finite, well-defined set of identities — cheap to fix in L2, and it
clears 4 of the 12 integration failures directly.

### Branch / domain handling — 3/3 pass

`sqrt(-9) → 3*i`, `i^2 → -1`, `1/sqrt(-1) → -i`. **Complex arithmetic itself is fine.** The
`sqrt(-1)` garbage in the asec integral was `integrate` choosing the wrong substitution family,
not broken arithmetic.

### Assumptions — absent entirely

`assume`, `assumptions`, `setAssumption`, `declare` — **none exist**.

Without assumptions the system cannot know `x>0`, therefore cannot:
- choose the branch for `√(x²−a²)` vs `√(a²−x²)` → the trig-substitution failures
- decide `√(x²) = x` versus `|x|`
- state domains of convergence for improper integrals and series
- keep `log`/`sqrt`/`z^a` on the correct branch in the complex plane

**This is the one genuine architectural hole and the one thing that cannot be retrofitted later.**

---

## 5. Measured capability — ODE and summation

| Probe | Result |
|---|---|
| `nerdamer.dsolve` | **not a function — does not exist** |
| `nerdamer("dsolve(diff(y,x)-y,y,x)")` | returns the garbage `(-y, y, x, dsolve)` — parsed `dsolve` as an unknown symbol |
| `nerdamer("sum(k^2,k,1,n)")` | returned unevaluated — **no symbolic summation** |
| `nerdamer.laplace` | present |
| `nerdamer("laplace(t^2,t,s)")` | `factorial(2)*s^(-3)` ✅ correct |
| `nerdamer.ilt` | present |

**Consequence:** `ode-symbolic.js` (1,834 lines, 72 CAS calls) is *already* a hand-built ODE solver
sitting on `diff`/`integrate`. That is the correct architecture and it proves the layering approach
works. It needs formalising into the kernel, not replacing.

**No symbolic summation** matters for series convergence, Fourier coefficients in closed form, and
generating functions.

---

## 5b. CRITICAL — nerdamer carries global state that a thrown error corrupts

Found by the Phase 0 ODE corpus, reproducible in three lines:

```js
O.classifyFirstOrder("y' = 2*y + x^2", null)        // -> a valid solution box
try { nerdamer("...log(abs(-1+y))...").evaluate({x:0.5, y:1}); }
catch (e) { /* "log(0) is undefined!" */ }
O.classifyFirstOrder("y' = 2*y + x^2", null)        // -> null. Same input. Different answer.
```

**One `evaluate()` that throws leaves nerdamer unable to classify a later, completely unrelated
equation.** No shared variables, no shared expression — the contamination is internal library
state that the throw leaves inconsistent.

### Why this is a product bug, not a test artifact

`cas-worker.js` is a **persistent** worker: one nerdamer instance serves an entire user session.
So the sequence is entirely realistic — a student solves the logistic equation `y' = y(1−y)`
(whose implicit solution contains `log|y−1|`, singular at `y=1`), the plot or verify step
evaluates near that singularity, and from then on **unrelated problems fail with a false
refusal**. The engine reports "I can't solve this" for something it solved correctly minutes
earlier, and nothing in the UI can distinguish that from a genuine limitation.

Worse, it is invisible to the existing suites: `verify-*.js` files are short and rarely
evaluate at a singularity before a later classification, so this survived 1,156 passing
assertions.

### Consequences

| Where | Action |
|---|---|
| **Benchmarks** | All corpus runners execute in short-lived child processes. Contamination is bounded to one chunk instead of poisoning a whole run — without this, Phase 0 under-reported ODE by 3 problems |
| **Product (must fix)** | The worker needs a **state reset between operations**, or a fresh nerdamer per request. Phase 2c's time budget should carry this too — an abandoned computation is exactly the case that leaves state dirty |
| **Kernel design** | A direct argument for L0's immutable, hash-consed representation: the new kernel must hold **no mutable global state**, so no operation can affect the next |
| **Regression corpus** | Permanently added — the three-line reproduction above is now a required test |

---

## 6. What is already right — do not rebuild

### The verification-gate architecture
Every technique: classify → rewrite → delegate → **verify numerically** → refuse with a reason.
This is what converts a 70%-correct dependency into a system that reads 809/809. **It is the most
valuable thing in the codebase.** Keep it mandatory in the new kernel.

### The `cas-worker` seam
`cas-client.js:101` is already Promise-based with a timeout, dispatching `{id, op, args}` to a
worker. Pages never see the CAS. This one seam serves as the swap point for **both** a new kernel
**and** a future server boundary. The hard part — async all the way up — is already done.

### Test discipline
`verify-calculus.js` asserts on *behaviour*, never string equality:
- `differentiatesBackTo` (line 39) differentiates the answer **inside the test** via nerdamer
- `fdCheck` (line 198) uses **pure math.js finite differences** — because nerdamer's `diff()` is
  wrong on √(quadratic) forms and would reject correct answers

That second point is a subtle, correct piece of engineering. Preserve the principle: **never let a
system verify itself.**

### Prior analysis
`ANTIDERIVATIVE_STRATEGY.md` already identifies the correct target — Hermite reduction plus
Rothstein–Trager for the complete rational case. That analysis is sound and is adopted here.

---

## 7. Documentation debt found

| Issue | Location | Correction |
|---|---|---|
| "The engine has zero automated tests" | `CURRICULUM_ROADMAP.md` §5 ODE | Stale. `tests/verify-ode.js` exists at 37 KB and passes |
| Missing licence files | `assets/vendor/` | `math.min.js`, `gsap.min.js`, `three.min.js` all reference `*.LICENSE.txt` files that are absent. Harmless while private; **fix before anything ships** |

---

## 8. Baseline summary — the numbers to beat

```
  Integration (40 standard problems)     28/40  =  70.0%   correct
                                          6/40  =  15.0%   SILENTLY WRONG
  Canonical simplification (8 probes)      6/8   =  75.0%
  Inverse-trig composition (4 probes)      0/4   =   0.0%
  Assumptions system                                ABSENT
  Symbolic dsolve                                   ABSENT
  Symbolic summation                                ABSENT
```

Re-run `node tests/bench/baseline.js` after every phase. **These numbers must never regress.**
