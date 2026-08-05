# Symbolic Kernel — Documentation Set

**Created 2026-07-25.** The authoritative plan for the proprietary symbolic kernel behind the
Calculus, ODE/PDE, and Complex Analysis engines.

This folder supersedes `docs/SYMBOLIC_KERNEL_PLAN.md` (kept as a one-page executive summary) and
extends `docs/ANTIDERIVATIVE_STRATEGY.md` from integration to the whole symbolic surface.

---

## Read in this order

| # | File | What it answers |
|---|---|---|
| 01 | [`01_CURRENT_STATE.md`](01_CURRENT_STATE.md) | What do I have *right now*, measured rather than assumed? |
| 02 | [`02_TARGET_STATE.md`](02_TARGET_STATE.md) | What am I building toward, and what does "done" mean? |
| 03 | [`03_ARCHITECTURE.md`](03_ARCHITECTURE.md) | How is the kernel structured? What are the layers and interfaces? |
| 04 | [`04_BUILD_PHASES.md`](04_BUILD_PHASES.md) | What do I build, in what order, and when is a phase finished? |
| 05 | [`05_BENCHMARKS.md`](05_BENCHMARKS.md) | How do I measure progress with a number instead of a feeling? |
| 06 | [`06_DATA_SOURCES.md`](06_DATA_SOURCES.md) | Where do the algorithms, corpora, and curricula come from — and what may I legally use? |
| 07 | [`07_VALIDATION.md`](07_VALIDATION.md) | How do I know what I built is actually correct? |
| 08 | [`08_ENGINE_CALCULUS.md`](08_ENGINE_CALCULUS.md) | Calculus engine — symbolic requirements in detail |
| 09 | [`09_ENGINE_ODE_PDE.md`](09_ENGINE_ODE_PDE.md) | **ODE *and* PDE** engine — symbolic requirements in detail |
| 10 | [`10_ENGINE_COMPLEX.md`](10_ENGINE_COMPLEX.md) | Complex Analysis engine — symbolic requirements in detail |
| 11 | [`11_PROTECTION.md`](11_PROTECTION.md) | How do I keep the kernel from being copied? |
| 12 | [`12_RISKS.md`](12_RISKS.md) | What can go wrong, and what do I do about it? |

## Runnable artifacts

| Path | Purpose |
|---|---|
| `tests/bench/baseline.js` | The benchmark harness. `node tests/bench/baseline.js` prints coverage and writes a JSON snapshot |
| `tests/bench/snapshots/` | Timestamped results — the record of progress over time |
| `tests/bench/README.md` | How to run, read, and extend the benchmarks |
| `assets/js/kernel/*.js` | **Phase 1 kernel** — L0 expression representation + L1 assumptions. See `04_BUILD_PHASES.md` Phase 1 status |
| `tests/verify-kernel.js` | Phase 1 gate assertions, 76/76 passing. `node tests/verify-kernel.js` |
| `tests/verify-kernel-properties.js` | Phase 1 property-based tests, seeded, 5,550/5,550 passing |
| `assets/js/kernel/{pattern,rules,rewrite,cost,derivation,directed}.js` + `rulesets/` | **Phase 2 kernel** — L2 rewrite engine + Phase 2d search control. See `04_BUILD_PHASES.md` Phase 2 status |
| `tests/verify-rewrite.js` | Phase 2 gate assertions, 25/25 passing |
| `tests/verify-rewrite-properties.js` | Phase 2 property-based tests, seeded, 2,245/2,245 passing — includes rewrite soundness, deferred from Phase 1 |
| `assets/js/kernel/rulesets/{weierstrass,rationalizing-substitution,algebraic-substitution,trig-power-reduction}.js` | **Phase 2b** — normalization to rational form. See `04_BUILD_PHASES.md` Phase 2b status |
| `tests/verify-substitution.js` | Phase 2b gate assertions, 17/17 passing |
| `tests/verify-substitution-properties.js` | Phase 2b property-based tests, seeded, 1,150/1,150 passing |
| `assets/js/kernel/{polynomial,poly-of-expr,poly-gcd,resultant,squarefree,factor-rat,partial-fractions,rational-integrate}.js` | **Phase 3 foundation slice** — polynomial & rational algebra tasks 1–6 + kernel rational integrator (ℚ-splitting class only). See `04_BUILD_PHASES.md` Phase 3 status. Not yet in the bundle MODULES list (production wiring deferred, same boundary as Phases 1/2) |
| `tests/verify-poly.js` | Phase 3 foundation-slice gate assertions, 35/35 passing (incl. the measured `partfrac` repeated-factor bug fixed; ℚ(α) probes refused). `node tests/verify-poly.js` |
| `tests/verify-poly-properties.js` | Phase 3 property-based tests, seeded, 1,849/1,849 passing — resultant vs independent Sylvester, factor reconstitution + independent irreducibility, PFD recombination, integration numeric differentiate-back (Number arithmetic, independent of the symbolic Rational machinery) |
| `assets/js/kernel/{differentiate,taylor,laurent,singularity,convergence,limit}.js` | **Phase 4 foundation slice** — symbolic differentiator, Taylor/Maclaurin, rational Laurent, singularity classification, convergence radius/interval, series + L'Hôpital limit (Gruntz-*style*, not full mrv; Puiseux/essential/oscillatory refused). See `04_BUILD_PHASES.md` Phase 4 status. Not yet in the bundle MODULES list (production wiring deferred, same boundary as Phases 1/2/3) |
| `tests/verify-series.js` | Phase 4 foundation-slice gate assertions, 84/84 passing (incl. `sin x/x@0`, `(1+1/x)ˣ@∞=e`, `|x|/x@0`=dne, Laurent principal part, pole-order classification, convergence radii; Puiseux/essential/oscillatory refused). `node tests/verify-series.js` |
| `tests/verify-series-properties.js` | Phase 4 property-based tests, seeded (mulberry32 seed 20260727), 1,163/1,163 passing — differentiate by finite-difference, Taylor by coefficient reconstitution + partial sum, Laurent by constructed-pole order + annulus reconstruction, singularity by log-log blowup slope, convergence by partial-sum inside/outside, limit by two-sided numeric + numeric-infinity (finite-claim correctness; honest refusals counted) |
| `assets/js/kernel/rewrite.js` deadline check + `assets/js/cas-client.js` `CAS_DEADLINE` | **Phase 2c** — cooperative wall-clock deadline. See `04_BUILD_PHASES.md` Phase 2c status |
| `assets/js/kernel/bridge.js` | **Production wiring seam** — `simplify()`/`sqrtDifferenceOfSquaresValidUnderGT()`, the only kernel-internals-facing API production code calls. See `04_BUILD_PHASES.md` Phase 2 "Production integration" |
| `tools/build-kernel-bundle.js` → `assets/js/kernel/bundle.generated.js` | Bundles the kernel for the browser/worker (classic-script `let`/`const` share one top-level scope across files — a plain per-file `importScripts` throws; see the generator's own comment). Regenerate after any kernel source edit: `node tools/build-kernel-bundle.js` |
| `assets/js/calc-core.js` `CalcCore.kernel()` / `CalcCore.tidy()` + `assets/js/cas-worker.js` `self.KernelBridge` | Where production code (`calculus-symbolic.js`, `integration-advanced.js`) actually reaches the kernel, best-effort — a missing/unloadable kernel degrades to prior behavior, never breaks a page |
| `assets/js/integration-advanced.js` `IntegrationAdvanced.autoIntegrate()` | Technique dispatcher (u-sub → by-parts → partial fractions → trig-sub → algebraic-sub → complete-the-square → raw nerdamer) that makes the Phase 2 gate's "12 smoke-corpus failures → ≤4" line measurable against the real production pipeline instead of raw nerdamer alone |
| `tests/verify-cas-worker.js` | Also asserts the committed kernel bundle matches a fresh rebuild and that the worker's `self.KernelBridge` is live, 37/37 passing |

---

## The plan in one paragraph

Build the **expression kernel + assumptions system first**, because assumptions are the only
component that cannot be retrofitted and they are the root cause of the worst-performing category
in all three engines (trig substitution branches, complex branch cuts, domain conditions). Then
build **polynomial algebra**, because that single component simultaneously unlocks complete
rational integration, correct partial fractions, Laplace inversion, and complex residues — one
build, three engines. Then adopt **Rubi** (MIT, 6,700 rules, 72,000 test problems) rather than
implementing the Risch algorithm, because Rubi is rule-based, which means each rule application
*is* a derivation step — handing you step-by-step explanations, your actual product moat, for free.
Migrate by **strangler fig**: nerdamer remains the fallback and shrinks monotonically, so you ship
working software the entire time and a kernel bug degrades to a refusal rather than a wrong answer.

## The three facts that drove every decision

1. **Raw nerdamer is 70% correct and 15% *confidently wrong*** on 40 standard textbook integrals
   (§01). Your verification gate is what converts that 15% into refusals — it is the most valuable
   thing you have already built.
2. **Nerdamer has no assumptions system at all.** Not weak — absent. This is the single
   architectural hole, and it explains the trig-substitution and branch-cut failures across two
   engines (§01, §03).
3. **Rubi is MIT-licensed and rule-based.** 72,000 test problems turn "closed over a corpus" from
   an aspiration into a measurable target you can start tracking this week (§05, §06).

## Revision log

**2026-07-26 — external plan review.** Six findings folded in. The review's other points were
already covered here; several of them (verification framework, ODE/PDE method families, the
"shift from protection to advantage" argument) were raised against
`docs/SYMBOLIC_KERNEL_PLAN.md`, the one-page summary, rather than against this folder — worth
remembering when circulating the plan: **send `00_INDEX.md`, not the summary.**

| Finding | Where it landed |
|---|---|
| **Search control / cost model** — the one genuine hole; only a wall clock existed | New **Phase 2d** (`04`), new **L2b** (`03` §3), R7 upgraded (`12`) |
| **Relational assumptions + contradiction detection** — unary predicates cannot express `x>a`, and a flag set cannot detect its own inconsistency | `03` §3 L1, Phase 1 tasks 6b/6c, new **R3b** (`12`) |
| **Binder nodes** — `Integral`/`Derivative`/`Limit`/`Sum` are not `Func`; capture and α-equivalence | `03` §3 L0, Phase 1 task 1b |
| **Factorization over ℚ(α)** — Rothstein–Trager's resultant roots are algebraic; the Phase 3 "provably closed" claim fails without it | `03` §3 L3, Phase 3 task 5b, `08` §4 |
| **Derivation IR** — "derivation trees" was named but never designed | `03` §3 L5, Phase 2 task 5b, `07` §8 |
| **Expression-size growth as a metric** — swell is invisible without it | `05` §1, §6 schema, `07` §10 |

## Conventions used throughout

- **Gate** — a measurable condition that must be true before the next phase starts. Not a
  checklist item; a number or a passing test.
- **P0/P1/P2/P3** — priority tiers carried over from `CURRICULUM_ROADMAP.md`.
- **L0–L5** — kernel layers defined in `03_ARCHITECTURE.md`.
- Anything marked ⚠️ is a legal or correctness hazard, not a preference.
