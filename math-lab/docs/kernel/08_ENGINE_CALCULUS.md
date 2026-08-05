# 08 — Calculus Engine: Symbolic Requirements

**Textbook basis:** Stewart, *Calculus* (per `CURRICULUM_ROADMAP.md` §2).
**Current state:** `calculus-symbolic.js`, 5,154 lines, 250 CAS calls, 22 method pages,
`verify-calculus.js` at 809 assertions / 0 failures.

This is the largest and most mature of the three engines. It is also where the measured failures
concentrate, because integration is the hardest thing the kernel does.

---

## 1. Current API — the migration contract

24 entry points that must keep working unchanged:

```
  uSubstitution        integrationByParts     partialFractions      trigSubstitution
  limit                lhopital               taylorSeries          convergenceTests
  powerSeries          curveAnalysis          appliedOptimization   vectorOps
  partialDerivatives   volumeOfRevolution     multipleIntegral      lagrangeMultipliers
  relatedRates         arcLengthSurfaceArea   parametricAndPolar    vectorCalculus
  improperIntegral     fourierSeries          fourierSeriesValue    configure
```

The existing design is correct and is kept: **classify → rewrite → delegate → verify → refuse with
a reason.** Only the delegate step changes.

---

## 2. Where the failures are

From `01_CURRENT_STATE.md`, all 12 measured integration failures, mapped to the phase that fixes
them:

| Technique | Failures | Root cause | Phase |
|---|---|---|---|
| **Trig substitution** | 6 of 12 | No assumptions → wrong branch; no inverse-trig rewriting | 1, 2 |
| Algebraic substitution | 3 | Technique does not exist | 2 |
| Completing the square | 2 | No preprocessing | 2 |
| Partial fractions | 1 | `partfrac` repeated-factor bug | 3 |

**Trig substitution is half the problem and it is an assumptions problem.** Choosing between
`√(a²−x²)`, `√(a²+x²)`, and `√(x²−a²)` requires knowing the sign and magnitude of `x` relative to
`a`. With no assumptions system, nerdamer guesses — and produced `sqrt(-9)` on a standard Stewart
§7.3 exercise.

---

## 3. Integration strategy

```
   ∫ f dx
     │
     ├─ 1. NORMALIZE  (L2)
     │     complete the square · rationalize · algebraic substitution u=√x
     │
     ├─ 2. IS f RATIONAL?  ──yes──►  Hermite reduction
     │                                → Rothstein–Trager (Lazard–Rioboo–Trager)
     │                                → PROVABLY COMPLETE for this class
     │
     ├─ 3. TECHNIQUE CLASSIFIER  (pedagogy — must stay, this is the product)
     │       u-substitution · by parts (LIATE) · partial fractions · trig sub
     │       → each emits its textbook derivation
     │
     ├─ 4. RUBI RULE TREE  ──hit──►  answer + rule chain as steps
     │
     └─ 5. nerdamer fallback ──►  L4 gate ──►  answer or honest refusal
```

**Step 3 must not be skipped even when steps 2 or 4 could answer directly.** A student asking for
∫x·sin(x²)dx wants to see *u-substitution*, not a Rothstein–Trager certificate. The classifier is
the pedagogy; the algorithms are the engine underneath it.

---

## 4. Capability requirements

| Capability | Depends on | Phase | Notes |
|---|---|---|---|
| Complete rational integration | polynomial algebra | 3 | The only provably-closed class |
| **Rational integrals needing ℚ(α)** | **extension-field factorization** | **3** | `∫dx/(x²−2)`, `∫(x²+1)/(x⁴+1)dx`. Rothstein–Trager's resultant roots are algebraic, not rational — without this the "provably closed" claim does not hold |
| Correct partial fractions | polynomial algebra | 3 | Fixes repeated-factor bug |
| Inverse-trig simplification | rewrite engine | 2 | Currently **0/4**; clears 4 failures |
| Completing the square | rewrite engine | 2 | Clears 2 failures |
| Algebraic substitution `u=√x` | rewrite engine | 2 | Clears 3 failures |
| **Trig-sub branch selection** | **assumptions** | **1** | Clears 2 failures; the worst category |
| Transcendental integration | Rubi rules | 5 | Broad coverage |
| Limits (Gruntz) | series | 4 | Replaces heuristic |
| Taylor / power series | series | 4 | Partly built |
| Convergence tests | series + limits | 4 | Partly built |
| Improper integrals | limits + assumptions | 4 | Domain conditions need L1 |
| Fourier series | integration + series | 4 | Built; needs symbolic summation for closed forms |
| Multivariable (partials, gradient, Lagrange) | L0 multi-symbol support | 1 | Mostly mechanical once L0 is right |
| Vector calculus (div, curl, Green) | partials | 1 | Built and verified |

---

## 5. Multivariable considerations

Several existing entry points are multivariable — `partialDerivatives`, `multipleIntegral`,
`lagrangeMultipliers`, `vectorCalculus`. Two L0 requirements follow:

- **Multi-symbol expressions must be first-class**, not a special case. Canonical ordering must be
  total across all symbols so `x·y` and `y·x` hash identically.
- **Per-symbol assumptions.** `x>0` and `y∈ℝ` must be independently representable, and iterated
  integration must scope its variable's domain correctly (`∫₀¹∫₀ˣ` implies `0<y<x<1` in the inner
  integral).

The existing `vectorCalculus` tests are a good model: they assert div/curl against *independently
computed* symbolic forms **and** central differences of the field. Keep that pattern.

---

## 6. What is already good — preserve it

- **The refusal cases.** `verify-calculus.js` asserts that `uSubstitution("x*e^x")` *declines*,
  that `partialFractions("1/sqrt(4-x^2)")` declines and says trig substitution is the right tool.
  Refusals that name the correct technique are excellent pedagogy — do not lose them in the port.
- **`fdCheck` for trig substitution.** Uses math.js finite differences specifically because
  nerdamer's `diff()` is wrong on √(quadratic) forms. Keep the principle; the new kernel must be
  verified by something that does not share its implementation.
- **LIATE ranking** for by-parts. Correct pedagogy, already matches textbook choices.
- **The `ln()` independent-parse gate** (`verify-calculus.js:1245`) — blocks `foo(x)`, `lg(x)`,
  `sen(x)`, `arctg(x)` that nerdamer would silently misread as products of symbols. **This class of
  defence must survive into the new parser**, or you inherit a silent-misparse hazard.

---

## 7. Gates specific to this engine

| Phase | Calculus-specific gate |
|---|---|
| 1 | Trig-sub branch chosen by assumptions; `∫x²/√(x²−9)` no longer produces `sqrt(-9)`; the **symbolic-bound** case `√(x²−a²)` selects from `x>a` |
| 2 | 4/4 inverse-trig probes; ∫1/(x²+2x+5), ∫x√(x+1), ∫1/(1+√x), ∫e^√x all correct |
| 2d | Corpus output is deterministic across runs and rule reorderings; no problem stopped by the wall clock |
| 3 | Every rational function in the corpus integrates; ∫1/((x−1)²(x+2)) correct; **∫dx/(x²−2) and ∫(x²+1)/(x⁴+1)dx correct** — the ℚ(α) cases |
| 4 | Convergence radii match textbook answers; improper integrals state domain conditions |
| 5 | ≥90% of the Rubi syllabus subset, with steps |
| all | `verify-calculus.js` stays at 809/809 — **it is the regression net for the whole rewrite** |
