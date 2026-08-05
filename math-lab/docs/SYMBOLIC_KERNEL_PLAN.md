# Symbolic Kernel Plan — Executive Summary

> **The full plan now lives in [`docs/kernel/`](kernel/00_INDEX.md).** This page is the one-page
> version. Start at [`kernel/00_INDEX.md`](kernel/00_INDEX.md).
>
> ⚠️ **Do not review or circulate this page on its own.** It omits the architecture, the validation
> methodology, the risk register, and the per-engine detail. A 2026-07-26 external review read this
> summary rather than the folder and reported four "gaps" that are specified at length in
> `kernel/07`, `kernel/09` and `kernel/11`. Send the index.

Extends `ANTIDERIVATIVE_STRATEGY.md` from integration to the whole symbolic surface, covering the
three engines that live or die on symbolics: **Calculus, ODE/PDE, Complex Analysis**.

---

## The measured problem

Raw nerdamer, 40 standard textbook integrals, verified by independent finite differences:

**28/40 correct · 6 silently WRONG · 5 refused · 1 unverifiable — 70% correct, 15% confidently wrong.**

Kernel probes: canonical simplification 6/8 · inverse-trig composition **0/4** · **assumptions
system absent** · **`dsolve` absent** · symbolic summation absent.

Reproduce with `node tests/bench/baseline.js`.

## The three decisions

1. **Build assumptions first.** It is the only component that cannot be retrofitted, and three
   independent measured findings converge on it: trig-substitution branch failures in calculus,
   the branch-cut hazard already flagged in the complex roadmap, and the total absence of any
   assumptions machinery in nerdamer to extend.

2. **Then polynomial algebra.** One component simultaneously unlocks complete rational integration
   (Hermite + Rothstein–Trager), correct partial fractions, ODE characteristic polynomials past
   degree 2, inverse Laplace transforms, and complex residues — across all three engines.

3. **Adopt Rubi, not Risch.** MIT-licensed, 6,700 rules, 72,000 test problems — and *rule-based*,
   so every rule application **is** a derivation step. The technical choice and the product
   differentiator are the same choice. Full Risch is >100 pages and not completely implemented
   anywhere after fifty years.

## Migration

**Strangler fig.** Nerdamer stays as the fallback and shrinks monotonically. Working software at
every commit; a kernel bug degrades to a *refusal*, never a wrong answer, because the existing
verification gate catches it. The `cas-client.js:101` seam — already Promise-based — is where both
the new kernel and the eventual server boundary plug in.

## Phases

| Phase | Deliverable | Gate | Time |
|---|---|---|---|
| 0 | Benchmark harness + corpora | One command prints a baseline number | 1–2 wk |
| 1 | L0 AST + **L1 assumptions** | `√(x²)`→`x` under `x>0`, `\|x\|` otherwise | 2–3 mo |
| 2 | L2 rewrite engine | 4/4 inverse-trig; 12 failures → ≤4 | 1–2 mo |
| 2b | Normalize to rational | trig-rationals + radicals reduced to rational form | 3–4 wk |
| 2c | Time budget | `TIMEOUT` count on the syllabus corpus is **0** | 1 wk |
| 2d | **Search control & cost model** | `normalize` terminating; output deterministic | 2–3 wk |
| 3 | **Polynomial algebra** *(incl. ℚ(α))* | Rational integration provably closed | 2–3 mo |
| 4 | Series & limits | Laurent with correct principal part | 1–2 mo |
| 5 | Rubi rule port | ≥90% of syllabus corpus, with steps | 2–4 mo |
| 6 | ODE/PDE | Boyce & DiPrima Ch. 1–11, verified by substitution | 2–3 mo |
| 7 | Complex | ∫₀^∞dx/(1+x²) by residues, correct branch | 2–3 mo |
| 8 | Server boundary | Kernel never reaches a client; p95 < 300 ms | 2–3 mo |

**Realistic total: 12–24 months focused.** Stopping after Phase 2 still clears 8 of 12 measured
failures. Stopping after Phase 3 leaves a provably complete rational integrator.

## Definition of done

Not "complete" — that has no finish line. **Closed over a defined corpus:** 100% of the syllabus
subset, with **zero** in the silently-wrong column.

## Positioning

Not "a better Mathematica" — 37 years and a large team make breadth unwinnable. **The CAS that
shows its work and can prove it is right.** Wolfram sells step-by-step as a separate paid tier
because the core product does not explain anything; your engine already emits six-step verified
derivations and refuses rather than lying.
