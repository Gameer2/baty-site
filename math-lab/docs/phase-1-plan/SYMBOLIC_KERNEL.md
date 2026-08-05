# Symbolic Kernel — Phase 1 (completed work)

Extracted from `docs/SYMBOLIC_KERNEL_PLAN.md` (executive summary) and the authoritative detail
doc `docs/kernel/04_BUILD_PHASES.md`. The kernel plan has its own internal phase numbers
(0-8) — do not confuse those with this project's "phase-1-plan / phase-2-plan" folders. Kernel
phases 0 through 2d are fully done; 3 and 4 are foundation-complete with named, deliberately
deferred gaps; 5-8 are not started.

## Why this exists

Measured baseline: raw nerdamer on 40 standard textbook integrals — 28/40 correct, 6 silently
**wrong**, 5 refused, 1 unverifiable (70% correct, 15% confidently wrong). Reproducible via
`node tests/bench/baseline.js`. This is the problem the kernel exists to fix, engine by engine
(Calculus, ODE/PDE, Complex Analysis), via a strangler-fig migration — nerdamer stays as
fallback and shrinks; a kernel bug degrades to a refusal, never a wrong answer.

## Kernel Phase 0 — Instrumentation — ✅ DONE (2026-07-25)

Benchmark harness (`tests/bench/all.js`), Rubi corpus import (72,039 problems, MIT-licensed),
authored ODE (51)/PDE (22)/complex (34) corpora, per-engine verifiers, snapshots.

## Kernel Phase 1 — L0 Expression + L1 Assumptions — ✅ kernel-level gate met (2026-07-26)

Immutable AST (no Sub/Div nodes), bind nodes with capture-avoiding substitution, exact rational
arithmetic (`rational.js`, BigInt, no floats in the symbolic core), canonical ordering +
hash-consing, parser/printer with an independent-parse gate, a full assumptions system (unary
predicates, 3-valued logic, relational predicates + transitive closure, contradiction detection
at assertion time), and branch selection for the `√(x²)` gate example. This was the
non-negotiable "build first" component — assumptions cannot be retrofitted onto a kernel that
lacks them from the start.

## Kernel Phase 2 — L2 Rewrite engine — ✅ gate met, production-wired (2026-07-26/27)

Rule representation as data, commutative pattern matching, 18-entry inverse-trig rule table,
log/exp rules with positivity guards, trig identities, completing-the-square, full derivation
provenance (every step carries `rule.id/name/source`). Smoke-corpus failures through the actual
production pipeline: 12 → **0**.

- **2b (Normalize to rational)** — ✅ done: Weierstrass, rationalizing, algebraic/Möbius, and
  trig-power substitutions all verified against the measured hang cases.
- **2c (Time budget)** — ✅ kernel-level cooperative deadline mechanism done and wired into
  `cas-client.js`.
- **2d (Search control & cost model)** — ✅ done: `normalize` is idempotent and terminating,
  output is deterministic across runs and rule reorderings.

## Kernel Phase 3 — Polynomial & rational algebra — 🟡 foundation slice complete, production-wired (2026-07-27/28)

Dense polynomial representation over ℚ, polynomial GCD, square-free factorization (Yun's
algorithm), resultants, factorization over ℚ (via Kronecker interpolation, not the originally-
planned Cantor–Zassenhaus+Hensel — a stated, deliberate scope substitution), correct partial
fractions (fixes the measured `1/((x−1)²(x+2))` repeated-factor bug), and a kernel rational
integrator. **Provably closed** for every rational function whose denominator splits over ℚ into
linear and irreducible-quadratic factors (either discriminant sign) — includes `∫dx/(x²−2)`.
Verified: `tests/verify-poly.js` (36/36) + `tests/verify-poly-properties.js` (1,849/1,849,
independent cross-checks per the kernel's own no-self-verification rule). Wired into
`assets/js/integration-advanced.js`'s `autoIntegrate()` as the first technique tried.

**Deliberately still refused, not faked:** genuinely degree≥3 irreducible denominator factors
(e.g. `∫(x²+1)/(x⁴+1)dx`) — needs arithmetic in ℚ(α) and Rothstein–Trager/LRT, named as the
explicit follow-up, not attempted with a shortcut that could produce a plausible wrong answer.

## Kernel Phase 4 — Series & limits — 🟡 foundation slice complete (2026-07-27)

Kernel symbolic differentiator (new primitive — nerdamer's `diff` was never wrapped by the
kernel until this), Taylor/Maclaurin series by repeated differentiation, Laurent expansion of
rational functions (principal part from the Phase 3 partial-fraction layer), singularity
classification (removable/pole-of-order-n/regular) by exact division, radius + interval of
convergence over ℚ for closed coefficient patterns.

**Deferred:** Puiseux series (fractional powers), essential-singularity handling, the Gruntz
algorithm for limits, and production wiring of this phase into the live pages.

## What this unblocks (already true, not aspirational)

Phase 3 alone simultaneously improved rational integration, partial fractions, and laid the
groundwork for ODE characteristic polynomials past degree 2, inverse Laplace transforms, and
complex residues — the reason it was prioritized as "highest leverage in the entire plan."
