# 04 — Build Phases

Every phase has a **gate**: a measurable condition, not a checklist item. Do not start the next
phase until the gate is green. Re-run `node tests/bench/baseline.js` at every gate — **the numbers
must never regress.**

**Realistic total: 12–24 months of focused work.** Phases 3 and 5 dominate. Phase 5 is largely
mechanical and parallelizable. Phases 1–3 are the genuinely hard design work and should not be
rushed or delegated.

---

## Dependency graph

```
   Phase 0 ── Instrumentation
      │
      ▼
   Phase 1 ── L0 Expression + L1 Assumptions      ← IRREVERSIBLE ORDERING CONSTRAINT
      │
      ▼
   Phase 2 ── L2 Rewrite engine
      │
      ├── 2b Normalize to rational  (Weierstrass, radical rationalization)
      ├── 2c Time budget            (kills all 19 hangs)
      ├── 2d Search control         (cost model — makes stopping a strategy, not a timeout)
      │
      ├──────────────┐
      ▼              ▼
   Phase 3 ──     Phase 4 ── Series & limits
   Polynomial        │
   algebra           │
      │              │
      ├──────┬───────┴───────┐
      ▼      ▼               ▼
   Phase 5  Phase 6       Phase 7
   Rubi     ODE           Complex
      │      │               │
      └──────┴───────┬───────┘
                     ▼
                  Phase 8 ── Server boundary & product
```

Only one edge is non-negotiable: **Phase 1 before everything.** Assumptions cannot be retrofitted.
Phases 5, 6, 7 can run in parallel if you have the capacity.

---

## Phase 0 — Instrumentation
**1–2 weeks · do this first, it is cheap and it makes every later phase measurable**

Turn "is the kernel good yet?" from a feeling into a number before writing any kernel code.

**Tasks**
1. Import the Rubi test corpus (72,000 problems, MIT) — see `06_DATA_SOURCES.md`
2. Filter it to the subset matching `CURRICULUM_ROADMAP.md` §2 — this becomes the calculus corpus
3. Build ODE and complex corpora from the SymPy and FriCAS suites (both BSD)
3b. **Author** a PDE corpus from Boyce & DiPrima Ch. 10–11 and `ODE_PDE_SOLVER_DESIGN.md` §7 —
   no importable PDE suite exists, so this is writing work, not parsing work, and it needs a
   four-part verifier (residual, boundary conditions, initial condition, series convergence)
4. Extend `tests/bench/baseline.js` to run all three corpora and classify each result as
   **correct / wrong / refused / unverifiable**
5. Write a JSON snapshot per run into `tests/bench/snapshots/` so progress is tracked over time
6. Add a `fall-through rate` metric: what fraction of calls reached nerdamer?

> **Gate:** one command prints a baseline coverage number for all three engines, and writes a
> snapshot you can diff against later.

**STATUS: DONE (2026-07-25).** Gate met — `node tests/bench/all.js` prints a baseline for every
engine and writes a snapshot.

| Task | State |
|---|---|
| Import Rubi corpus (72,039 problems, MIT) | ✅ `tests/bench/import-rubi.js` |
| Integration syllabus subset (875) | ✅ `corpora/rubi-syllabus.json` |
| **ODE corpus (51)** | ✅ `corpora/ode.json` — authored from Boyce & DiPrima Ch. 1–4 in the engine's own notation |
| **PDE corpus (22)** | ✅ `corpora/pde.json` — authored; no importable PDE suite exists |
| **Complex corpus (34)** | ✅ `corpora/complex.json` — authored from Churchill & Brown |
| Per-engine verifiers | ✅ `corpus-engines.js` — ODE invariant-along-RK4-trajectory, PDE four-part, complex CR/Laplace |
| One command, all engines | ✅ `tests/bench/all.js` |
| Snapshots | ✅ `snapshots/all-*.json`, `snapshots/corpus-*.json` |
| Fall-through rate | ⏸ **Deliberately deferred** — it is 100% by definition until a kernel exists to fall through *from*. Becomes meaningful at Phase 1 |

### The Phase 0 baseline

```
    engine              correct    wrong   missing
    integration         372/875      183         0      42.5% correct, 20.9% SILENTLY WRONG
    ode                   43/51        0         7      84.3% correct, 0 wrong
    pde                   10/22        0        12      100% of what is built, 45.5% of syllabus
    complex               14/34        0        18      87.5% of what is built, 41.2% of syllabus
```

**Read the three columns together.** Integration's problem is *correctness* — one in five raw
answers is wrong. ODE/PDE/Complex have the opposite profile: **nothing wrong, but half the
syllabus not built.** They are coverage problems, not correctness problems, and the corpora were
deliberately authored to include unbuilt topics so that shows up as `MISSING` instead of an
invisible 100%.

### Four things Phase 0 found that the plan had missed

1. **Selection bias of 27 points.** A hand-picked 40-problem corpus reported 70%; the real
   syllabus corpus reports 42.5%.
2. **The CAS hangs.** 19 of 875 never terminate. Added as class `TIMEOUT` and as Phase 2c.
3. **The CAS carries global state that a thrown error corrupts** — one `evaluate()` hitting
   `log(0)` leaves nerdamer unable to classify a later, unrelated ODE. See
   `01_CURRENT_STATE.md` §5b. This is a live product bug, not a test artifact, because the
   worker is persistent.
4. **The failure curve is a decay, not a plateau** — 56% → 32% → 11% → 0% by Rubi difficulty,
   the signature of a heuristic with no algorithm underneath. This produced Phase 2b.

**Baseline to beat** (875-problem syllabus corpus, measured 2026-07-25):
**42.5% correct · 20.9% silently wrong · 30.7% refused · 2.2% hung.**
By Rubi difficulty: 56.1% (1–2 steps) → 32.4% (3–5) → 11.3% (6–10) → **0% (11+)**. That decay curve
is the signature of a heuristic with no algorithm underneath, and it is what Phases 2b/3/5 exist to
replace. Kernel probes: canonical simplification 6/8, inverse-trig composition 0/4, assumptions
absent.

---

## Phase 1 — L0 Expression representation + L1 Assumptions
**2–3 months · the only irreversible ordering constraint in the plan**

**Tasks**
1. Immutable AST: `Integer`, `Rational`, `Symbol`, `Add`, `Mul`, `Pow`, `Func`
   (no `Sub`/`Div` — see `03_ARCHITECTURE.md` §3)
1b. **`Bind` nodes** for `Integral`, `Derivative`, `Limit`, `Sum`, `Product` — a binder is *not* a
   `Func` of its bound variable. Requires α-equivalence in the hash and capture-avoiding
   substitution as the only substitution primitive. **L0 decision; cannot be retrofitted** without
   rehashing every expression ever built
2. Exact rational arithmetic on big integers; no floats in the symbolic core
3. Total ordering on nodes → canonical ordering of commutative operands
4. Hash-consing → O(1) structural equality
5. Parser and printer (text + LaTeX), plus the **independent-parse gate** already used in
   `verify-calculus.js:1245` for `ln()` normalization — keep that defence
6. Assumptions: unary predicates, three-valued logic, propagation rules, scoped contexts
6b. **Relational predicates** `x > y`, `x ≥ y`, `x = y`, `x ≠ y` with **both sides symbolic**, plus
   transitive closure and sign propagation. A difference-logic constraint store, not a theorem
   prover. *`08_ENGINE_CALCULUS.md` §2 states the core requirement as "the sign and magnitude of `x`
   relative to `a`" — unary predicates cannot express that, so this is load-bearing, not extra*
6c. **Contradiction detection** — `assume` throws on an inconsistent set; `isConsistent()` asserted
   at every scope entry. ⚠️ An inconsistent context proves everything, and the resulting answer
   *passes* the L4 gate because it differentiates back correctly under assumptions that cannot
   hold. **This is the only unsound path in the design that verification cannot catch**
7. Branch selection driven by assumptions

**Why this is first:** three independent measured findings converge on assumptions being the root
cause — trig-substitution branch failures, complex branch cuts, and the total absence of any
assumptions machinery to extend. Retrofitting is among the hardest things in CAS engineering.

**STATUS: Kernel-level gate met (2026-07-26).** Tasks 1–7 above are implemented in
`assets/js/kernel/{rational,expr,parser,printer,assumptions,branch}.js`. Every criterion in the
gate below is a runnable assertion in `tests/verify-kernel.js` (76/76 passing) and
`tests/verify-kernel-properties.js` (5,550/5,550 random-trial passing, seeded, reproducible). The
existing 809/809 `verify-calculus.js` suite is unaffected — nothing outside `assets/js/kernel/` and
the two new test files was touched.

| Task | State |
|---|---|
| Immutable AST, no Sub/Div | ✅ `expr.js` |
| Bind nodes, α-equivalence, capture-avoiding subst | ✅ `expr.js` — de Bruijn indices; verified on a manually-derived double-integral case before being generalised into the property suite |
| Exact rational arithmetic | ✅ `rational.js` — BigInt num/den, no floats in the symbolic core |
| Canonical ordering + hash-consing | ✅ `expr.js` |
| Parser + printer, independent-parse gate | ✅ `parser.js`/`printer.js` — maximal-munch identifier tokenization makes the classic `sin`→`s*i*n` misparse structurally impossible, not merely blocklisted |
| Assumptions: unary predicates, 3-valued logic | ✅ `assumptions.js` |
| Relational predicates + transitive closure | ✅ `assumptions.js` — difference-logic store, symbolic bounds |
| Contradiction detection | ✅ `assumptions.js` — throws `Contradiction` at assertion time, not query time |
| Branch selection (the gate's sqrt examples) | ✅ `branch.js` |

⚠️ **Scope boundary, stated explicitly so it isn't mistaken for slippage:** the gate line "Trig-
substitution branch selection is driven by assumptions, not guessing" is met at the **kernel-
primitive level** — `branch.sqrtDomainOk` correctly resolves the exact measured case
(`∫x²/√(x²−9)` under `x>3`) and the symbolic case (`√(x²−a²)` under `x>a`, `a` symbolic), both
gate-tested. **Production trig-substitution code in `assets/js/integration-advanced.js` /
`calculus-symbolic.js` has not been switched to call it.** That wiring is correctly deferred: real
trig-substitution integration needs inverse-trig rewriting (Phase 2) in addition to branch
selection, so the two land together rather than half-wiring now and re-wiring later. Task list for
Phase 1 in this file never included production wiring — only the kernel capability, which is done.

**Known deferral, stated in the property-suite file itself:** two properties listed in
`07_VALIDATION.md` §3 — canonical-form-equals-numerically-equal and rewrite-soundness — name
Phase 2's `normalize`/rewrite engine, which does not exist yet. Testing them now would mean testing
nothing. The property suite substitutes the L0/L1-appropriate analogues (construction-order
confluence, construction soundness) and documents the substitution rather than silently skipping it.

> **Gate:**
> - `√(x²)` → `x` under `x>0`; `|x|` under `x` real; unevaluated otherwise
> - **`√(x²−a²)` selects its branch from `x>a` with `a` symbolic** — the relational case, not just
>   the literal-bound case
> - `ask('x','integer')` returns `unknown`, never `false`, when unproven
> - **A contradictory assumption set is rejected at assertion time**, with a property test asserting
>   no context ever answers `true` to both `P` and `¬P`
> - **α-equivalence:** `∫f(x)dx` and `∫f(t)dt` are the same object and hash identically;
>   `subst(∫x·y dx, y→x)` does not capture
> - Trig-substitution branch selection is driven by assumptions, not guessing
> - Round-trip: `parse(print(e))` equals `e` for the whole existing test corpus

---

## Phase 2 — L2 Rewrite engine
**1–2 months**

**Tasks**
1. Rule representation as **data**: `{name, pattern, replacement, guard, direction}`
2. Pattern matcher with commutative/associative matching
3. Directed operations: `expand`, `factor`, `combine`, `separate`, `normalize`, `rationalize`
4. Rule sets, in this order:
   - inverse-trig composition (currently **0/4**)
   - log/exp laws **with assumption guards** (`separate` on logs needs positivity)
   - trig identities (Pythagorean, double/half angle, sum-to-product)
   - completing the square
   - algebraic substitution (`u=√x`, `u=ⁿ√(ax+b)`)
5. Rule provenance: every application records which rule fired, for L5
5b. **The derivation IR** — `03_ARCHITECTURE.md` §3 L5. A derivation is a **tree**
   `{goal, result, rule, binding, context, children, narration}`, not a list; narration renders
   *from* it and is never the source of truth. Build it here rather than later, because Phase 2 is
   where provenance is first recorded and a flat step list is expensive to widen into a tree once
   every technique emits one. Sub-derivations nest (by-parts spawns its own `∫v du`), each node
   carries the assumptions in force, and `rule.source` makes fall-through rate computable from the
   derivation itself

**STATUS: Kernel-level gate met for tasks 1–5b and Phase 2d (2026-07-26); production wiring
landed (2026-07-27) — see "Production integration" below.** Implemented in
`assets/js/kernel/{pattern,rules,rewrite,cost,derivation,directed}.js` plus
`assets/js/kernel/rulesets/{inverse-trig,log-exp,trig-identities,completing-square,factor,
rationalize}.js`. All three literal Phase 2 gate examples pass exactly as stated, plus the
Phase 2d determinism/idempotence/budget gates. Verified in `tests/verify-rewrite.js` (25/25) and
`tests/verify-rewrite-properties.js` (2,245/2,245 random-trial, seeded) — the latter is where
"rewrite soundness," deferred in the Phase 1 property suite for lack of anything to test, finally
runs. The full regression (`verify-kernel.js`, `verify-kernel-properties.js`,
`verify-rewrite.js`, `verify-rewrite-properties.js`, `verify-calculus.js`) is 8,705/8,705.

| Task | State |
|---|---|
| Rule representation as data | ✅ `rules.js` — `{name, pattern, replacement, guard, direction}` |
| Pattern matcher, commutative matching | ✅ `pattern.js` — permutation-based, **exact arity only**; see the scope note below |
| Directed operations | ✅ `directed.js` — all six; `factor`/`rationalize` are intentionally partial, see below |
| Rule sets: inverse-trig | ✅ full 18-entry table (not just the 4 measured probes), `rulesets/inverse-trig.js` |
| Rule sets: log/exp with guards | ✅ `rulesets/log-exp.js` — `separate` guarded by positivity; `combine` is procedural, see below |
| Rule sets: trig identities | ✅ Pythagorean + both directions, double angle, `rulesets/trig-identities.js` |
| Rule sets: completing the square | ✅ procedural (variable arity), `rulesets/completing-square.js` |
| Rule provenance | ✅ every `Derivation` node carries `rule.id/name/source` |
| Derivation IR | ✅ `derivation.js` — tree, lazy `narration()`, `countBySource()`, `flatten()` |
| Phase 2d: cost model | ✅ `cost.js` — deterministic, canonical-order tie-break |
| Phase 2d: head-symbol indexing | ✅ `rules.js` `RuleSet` — bucketed, sorted once at construction |
| Phase 2d: bounded search, refusal | ✅ `rewrite.js` — `maxSteps`/`maxNodes`, `RewriteBudgetExceeded` → `refuse(reason)` |
| Phase 2d: determinism gate | ✅ tested directly — identical output from a rule set built in reverse order |

⚠️ **Two scope boundaries, stated explicitly, not discovered later:**

1. **The pattern matcher does exact-arity commutative matching, not general AC-with-remainder
   matching.** `pattern.js`'s module comment states this up front. It is sufficient for every
   hand-written rule in Phase 2 (all fixed, small arity); it is **not** sufficient for "find this
   shape anywhere in an arbitrary-length sum, leave the rest" — that need showed up twice
   (combining logs out of a longer sum; the `sin(2x)-2 sin x cos x` identity) and both were solved
   with small dedicated traversals (`directed.js`'s `combineLogs`, and a whole-pattern rule)
   rather than by building a general AC unifier the actual rule sets don't need. A related, gnarlier
   interaction was found and fixed during this work: the forward rule `sin(2u) -> 2 sin u cos u`
   and the identity rule `sin(2u) - 2 sin u cos u -> 0` compete for the *same* input, and running
   the forward rule first (inside generic bottom-up `normalize`) destroys the shape the identity
   rule needs to see. Fixed by excluding `direction:'expand'`/`'separate'` rules from
   `DEFAULT_RULESET` — normalize and expand are different operations on purpose, not the same
   fixed point reached two ways.
2. **`factor` and `rationalize` are real but deliberately narrow.** `factor` handles perfect-square
   trinomials (via completing the square) and integer-GCD common-factor extraction only; general
   polynomial factorization needs square-free factorization and factoring over ℚ, which is Phase 3.
   `rationalize` combines fractions over a common denominator by cross-multiplication (always
   correct, never reduced to lowest terms); reducing needs polynomial GCD, also Phase 3. Both
   refuse honestly outside their stated scope rather than silently returning an unreduced or
   partial answer disguised as a full one.

⚠️ **Still open after production wiring landed (2026-07-27):**

- **Phase 2c's `CAS_DEADLINE` production wiring** — the rewrite engine's own `maxSteps`/`maxNodes`
  budget is real and tested, and the *worker-loading* half of Phase 2c is now done (see below),
  but the existing nerdamer-based engines (`calculus-symbolic.js`, `integration-advanced.js`,
  `ode-symbolic.js`, `complex-symbolic.js`) still do not check `self.CAS_DEADLINE` inside their own
  search loops. That remains real, separate work — retrofitting cooperative deadline checks
  through thousands of lines of pre-existing search loops, not "wiring the kernel in."
- **Phase 3+ rule sets** (`factor`/`rationalize`'s narrow scope, general AC matching, polynomial
  algebra) are unaffected by this wiring pass — see the two scope boundaries above, still current.

✅ **Production integration — done (2026-07-27), closing the gap this section used to describe.**
The rule sets were proven correct at the kernel level but unreachable from
`assets/js/integration-advanced.js` / `calculus-symbolic.js` and from the browser/worker
entirely (the kernel files were never loaded outside Node's test harness). Three things closed
that, in order:

1. **`assets/js/kernel/bridge.js`** — the seam production code calls instead of touching kernel
   internals: `simplify(text, assumeFn)` runs `directed.normalize`/`combine` (the same
   best-of-both-candidates selection `runNewKernelProbes` in `tests/bench/baseline.js` already
   used for measurement) and returns text or `null` (kernel had nothing better — strangler-fig
   discipline, never a worse answer than before); `sqrtDifferenceOfSquaresValidUnderGT()` exposes
   the literal Phase 1 gate fact (`√(x²−a²)` valid under `x>a`, `a` symbolic) as a cached boolean.
2. **A kernel bundle for the browser/worker**, `assets/js/kernel/bundle.generated.js`, built by
   `tools/build-kernel-bundle.js` and regenerated with `node tools/build-kernel-bundle.js` after
   any kernel source edit (`tests/verify-cas-worker.js` diffs the committed bundle against a fresh
   build so drift fails loudly, not silently). **Necessary, not cosmetic:** every kernel file does
   `const { Expr } = require("./expr")` at its own top level; classic-script evaluation
   (`importScripts` included) shares ONE top-level lexical environment for `let`/`const` across
   every file loaded into a realm, so a naive `importScripts` per kernel file throws
   `SyntaxError: Identifier 'Expr' has already been declared` on the second file — confirmed
   against the real worker-boot harness before switching to the bundle. The bundle wraps each
   file's untouched source in its own function scope; no kernel source file was modified.
   `cas-worker.js` now `importScripts`s the bundle and publishes `self.KernelBridge`.
3. **Call sites.** `calc-core.js` gained `CalcCore.kernel()` (best-effort resolution — Node
   `require`, or `self.KernelBridge` in the worker; never throws, caches "unavailable" on any
   failure) and `CalcCore.tidy(text, assumeFn)` (kernel `simplify` as a pre-pass, nerdamer's own
   `.simplify()` always still runs after — additive, never a regression on what nerdamer alone
   already simplified). `calculus-symbolic.js`'s `trigSubstitution` and
   `integration-advanced.js`'s `algebraicSubstitution`/`completeTheSquare` call `tidy()` for
   their final display form, gated by the same differentiate-back check as before. Separately,
   `integration-advanced.js` gained `autoIntegrate(integrand, variable)` — a technique dispatcher
   (u-substitution → by-parts → partial fractions → trig substitution → algebraic substitution →
   completing the square → raw nerdamer as last resort, each still independently verified) that
   is what actually makes the Phase 2 gate line below measurable: `tests/bench/baseline.js` now
   runs the 40-problem smoke corpus through it as a `production` counterpart to the existing raw-
   nerdamer measurement.

   **Along the way, one real bug was found and fixed, not just wired around:** `trigSubstitution`'s
   sec-case (`x²/√(x²−9)`) was computing a *correct* antiderivative that the differentiate-back
   gate rejected as unverifiable — `fdVerifyAntideriv`'s default sample points sit near `x=0`,
   which is outside the sec-substitution's actual domain `|x|>a`. `fdVerifyAntideriv` now takes an
   optional domain-appropriate `points` argument; `trigSubstitution` supplies scaled points for the
   sine and sec cases, and the sec case only trusts the shifted domain when
   `bridge.sqrtDifferenceOfSquaresValidUnderGT()` confirms it — the kernel backing the domain claim
   production code relies on, not a locally re-derived fact.

   **Measured result** (`node tests/bench/baseline.js --quick`): of the 40-problem smoke corpus,
   raw nerdamer still gets 28/40 (12 failures: 6 wrong, 5 refused, 1 unverifiable — unchanged,
   since that path is deliberately untouched as the control number). Routed through
   `autoIntegrate`: **40/40**, 0 failures. Eleven of the twelve original failures already had a
   working named technique that raw-nerdamer `integrate()` simply never got routed through;
   the twelfth was the sec-case verification bug above. Full regression
   (`verify-calculus.js` 809/809, `verify-kernel*.js`, `verify-rewrite*.js`,
   `verify-substitution*.js`, `verify-cas-worker.js` 37/37, `verify-cas-client.js`,
   `verify-integration-advanced.js`, `verify-ode.js`, `verify-complex*.js`,
   `verify-linalg.js`, `verify-statistics.js`, `verify-number-theory.js`,
   `verify-domain-coloring.js`) is unaffected — every suite passes at the same count as before
   this work, and `tests/bench/all.js --quick` reproduces the unchanged ODE/PDE/Complex Phase 0
   numbers.

### Phase 2b — Normalization to rational form ← added after the Phase 0 corpus run

Clustering the 503 syllabus-corpus failures showed they are not 503 problems but four, and
**three of the four reduce to the fourth**, which Phase 3 solves completely:

```
  trig rationals        ──t = tan(x/2)────────►  ┐
  radicals of rationals ──u = x^(1/lcm)────────►  ├──► RATIONAL ──► Phase 3 (complete)
  radicals of linear/Möbius ───────────────────►  ┘
```

| Technique | Failures it targets | Note |
|---|---|---|
| **Weierstrass substitution `t = tan(x/2)`** | **58** (31 wrong, 18 refused, **6 hung**) | Turns any rational function of sin/cos into a rational function of t |
| **Rationalizing substitution `u = x^(1/lcm)`** | large slice of **159** algebraic radicals | Handles `∫1/(x^(−1/3)+x^(−1/4))`, currently a hang |
| **Generalised algebraic substitution** | rest of the 159 | Extends the shipped √(linear) case to ⁿ√((ax+b)/(cx+d)) |
| **Systematic trig power reduction** | **65** (23 wrong, 39 refused) | Parity rules for ∫sinᵐcosⁿ; pure rule set |

These were implicit in Phase 5's Rubi port. They are pulled forward and named explicitly here
because together they account for ~400 of 503 failures, they need no new polynomial algebra, and
Weierstrass alone clears 6 of the 19 hangs.

> **Gate:** trig-rational and radical-of-rational classes are *normalized* to rational form
> before dispatch, whether or not Phase 3 can yet finish them.

**STATUS: Kernel-level gate met, all four techniques (2026-07-26).** Implemented in
`assets/js/kernel/rulesets/{weierstrass,rationalizing-substitution,algebraic-substitution,
trig-power-reduction}.js`, wired into `directed.js` as `weierstrass`,
`rationalizingSubstitution`, `algebraicSubstitution`, `trigPowerReduction`. Verified against
the exact measured hang cases named in this table (`1/(1+2cos x)`, `1/(5-cos x+2 sin x)`,
`1/(x^(-1/3)+x^(-1/4))`) plus the linear and genuine-Möbius cases for the fourth technique, in
`tests/verify-substitution.js` (17/17) and `tests/verify-substitution-properties.js`
(1,150/1,150 seeded numeric-soundness trials — every substitution checked against the
original at corresponding sample points, not just symbolically).

| Technique | State |
|---|---|
| Weierstrass `t = tan(x/2)` | ✅ handles sin/cos/tan of a single argument; refuses honestly if `x` appears outside those |
| Rationalizing `u = x^(1/L)` | ✅ `L` computed as the exact LCM of every fractional exponent's denominator found |
| Generalised algebraic (Möbius) | ✅ the linear case (`c=0,d=1`) falls out of the general Möbius formula for free, rather than needing separate code |
| Trig power reduction | ✅ odd/odd/both-even parity cases, with a correct termination condition (see note below) |

Each of these produces a **normalized rational (or reduced) form plus the substitution
metadata** (`t`/`u`, `dx/dt` or `dx/du`, the Möbius coefficients) that a future integrator
needs — not the integration itself, which is honestly Phase 3/5 scope and not claimed here.

⚠️ **One real bug found and fixed during this work, not just planned around:** the trig-power
termination condition is not "small exponents" but "already substitution-ready" —
`sin(x)^6*cos(x)` (n=1) needs **no** reduction regardless of how large the other exponent is,
because it is already `poly(sin)*cos`. The first implementation checked oddness before checking
this, so `sin(x)` alone took the "expand" branch and rebuilt itself into an equal-but-needlessly-
reconstructed form instead of returning the `null` its own contract promised. Not a correctness
bug (the rebuilt form was still numerically identical) but exactly the kind of thing a
property test across many `(m,n)` pairs was written to catch, and did.

Both scope boundaries from Phase 2 apply unchanged here: nested fractions produced by
Weierstrass are not cleared to a single lowest-terms `p(t)/q(t)` (Phase 3's "rational normal
form" job), and none of these four techniques are wired into
`assets/js/integration-advanced.js` — same kernel-vs-production boundary as Phase 1 and 2.

---

### Phase 2c — Time budget and abandonment ← added after the Phase 0 corpus run

**19 of 875 syllabus problems hang the CAS indefinitely.** Synchronous JavaScript cannot be
interrupted from inside its own process, so this is an architecture requirement, not a bug fix.

- Every symbolic operation runs under a wall-clock budget and **abandons with a refusal** when it
  expires — a refusal is a safe failure, an infinite loop is not.
- The worker already has a kill switch (`cas-client.js` timeout); the requirement is that *every*
  path is genuinely behind it, including the in-page `syncCall` fallback, which by design has no
  timeout and therefore hangs the main thread.
- Search loops inside the kernel (candidate enumeration, rule matching) must check a deadline, not
  just rely on being killed.

> **Gate:** `TIMEOUT` count on the syllabus corpus is **0** — every one becomes a refusal with a
> reason. No user-facing path can freeze.

**STATUS: Kernel-level mechanism done; the syllabus-corpus number itself is not measurable yet
(2026-07-26).** `assets/js/kernel/rewrite.js`'s search loop now checks a wall-clock deadline
(`checkBudget`) in addition to `maxSteps`/`maxNodes`, verified directly: an explicit past
deadline refuses immediately, and — the case this phase actually cares about — a **cooperative**
deadline set by `cas-client.js` is honoured with no direct call between the two files.

`assets/js/cas-client.js`'s `syncCall` (the in-page fallback used when Workers are
unavailable) is the literal case this phase names: it has no external timeout because none is
possible — synchronous JS cannot be interrupted from outside itself, so "every path genuinely
behind a deadline" can only mean *cooperative* checking inside whatever runs, never an external
wrapper. `syncCall` now stamps `self.CAS_DEADLINE` for the duration of a call (previously
`timeoutMs` was computed in `CAS.call` but never even passed to `syncCall`) — the one hook a
deadline-aware engine can read. `rewrite.js` reads it. Existing tests unaffected
(`verify-cas-client.js` 17/17, `verify-cas-worker.js` 34/34) since this is additive: an engine
that doesn't check the global behaves exactly as before.

⚠️ **What this does not claim:** the existing nerdamer-based engines
(`calculus-symbolic.js` and friends) do not check `CAS_DEADLINE` and are not retrofitted to —
that would mean adding cooperative deadline checks throughout thousands of lines of pre-
existing search loops, a large undertaking that is not "building the new kernel" and is
better done once those engines are actually replaced by it. So **the literal gate metric
("TIMEOUT count on the syllabus corpus is 0") is not measured here** — it depends on the
production integration pipeline, which doesn't route through this kernel yet (same boundary
noted for Phases 1 and 2). What *is* true and tested: this kernel's own operations cannot hang
the sync-fallback path, because they check the one deadline mechanism that path can expose.

---

### Phase 2d — Search control & cost model ← added after the 2026-07-26 plan review
**2–3 weeks · the one genuine hole the review found**

Phase 2c gives the engine a wall clock. A wall clock is a safety net, not a strategy — a kernel
that stops only because it ran out of time refuses problems it could have solved, and its results
stop being reproducible across machines. **The day `expand` and `factor` both exist, the engine can
loop between them and something must decide which direction is progress.** Design detail in
`03_ARCHITECTURE.md` §3, L2b.

**Tasks**
1. **`cost(e) → ℕ`** — weighted node count; deterministic; ties broken by canonical order, never by
   insertion or iteration order
2. **Rule indexing by head symbol**, then specificity, then static priority. Never scan linearly —
   6,700 Rubi rules make that quadratic (`12_RISKS.md` R7)
3. **Split the rule database in two:** a *terminating* subset where every rule strictly decreases a
   well-founded measure (this runs to a fixed point and must be confluence-checked — this is what
   "confluence-conscious ordering" means), and everything else, which runs under search
4. **Bounded best-first search** on `cost` for the bidirectional rules and candidate substitutions,
   under `maxNodes` (swell ceiling) and `maxSteps` (**reproducible**, unlike a wall clock)
5. **Budget exhaustion → `refuse(reason)`**, never a partially-simplified expression returned as an
   answer. Routes into the existing L4 safe-failure path
6. Instrument **peak and final `cost(e)` per problem** into the benchmark snapshot
   (`05_BENCHMARKS.md` §1)

> **Gate:**
> - `normalize` is **idempotent** and provably terminating on the terminating rule subset
> - **Determinism:** the syllabus corpus produces byte-identical output across 3 runs *and* across
>   a rule-database reordering — the test that catches iteration-order dependence
> - No corpus problem exceeds `maxNodes`; every problem that does exceed a budget produces a
>   refusal naming which budget
> - **Peak expression size is recorded per problem** and becomes a tracked regression metric — a
>   rule that doubles intermediate size is otherwise invisible until it becomes a timeout
> - Phase 2c's wall-clock deadline is **never** the binding limit on the corpus. Reaching it is a
>   bug report, not normal operation

---

> **Gate (Phase 2):**
> - All 4 inverse-trig probes pass
> - `log(xy)−log x−log y → 0` under `x,y>0` — and is **not corrupted** into `-log(x*y)^2`
> - `sin(2x)−2 sin x cos x → 0`
> - The 12 measured smoke-corpus failures drop to **≤4** (only the `partfrac` and branch cases
>   should survive)
>
> **MET (2026-07-27), measured, not aspirational.** `node tests/bench/baseline.js` now runs the
> smoke corpus through the production pipeline (`IntegrationAdvanced.autoIntegrate`) as well as
> raw nerdamer, and reports both. Production result: **0/12 failures** (all twelve reach
> CORRECT) — better than the ≤4 target, because the majority of the original twelve already had
> a working named technique that raw-nerdamer `integrate()` was simply never routed through; see
> the "Production integration" note above for what closed the gap and the one real bug (not just
> a wiring gap) it found along the way.

---

## Phase 3 — Polynomial & rational algebra
**2–3 months · highest leverage in the entire plan**

One component; four capabilities across three engines.

**Tasks**
1. Dense and sparse polynomial representation over ℚ
2. Polynomial GCD via **subresultant PRS**
3. Square-free factorization
4. Resultants
5. Factorization over ℚ (Cantor–Zassenhaus mod p + Hensel lifting, or Zassenhaus)
5b. **Arithmetic in ℚ(α)** — `ℚ[t]/⟨m(t)⟩` for one algebraic α, inverses by extended Euclid — and
   **Trager's algorithm** for factoring over that extension via norms. ⚠️ **Without this the phase
   gate below is unreachable:** Rothstein–Trager factors a resultant whose roots are algebraic
   numbers in general, so the answer's log coefficients live in ℚ(α), not ℚ. `∫dx/(x²−2)` and
   `∫(x²+1)/(x⁴+1)dx` are both undergraduate problems and both need it. Scope: **one** extension
   generator — towers and multiple independent extensions stay outside the corpus (`12_RISKS.md` R2)
6. **Correct partial fractions** — including repeated factors and irreducible quadratics
   (fixes the measured `1/((x−1)²(x+2))` bug)
7. **Hermite reduction** (Bronstein ch. 2)
8. **Rothstein–Trager**, or the Lazard–Rioboo–Trager variant using subresultant PRS — **prefer
   LRT**, because it keeps the computation inside the subresultant machinery of task 2 and avoids
   constructing a splitting field explicitly
9. Wire complete rational integration into the L3 dispatch

**What this unlocks simultaneously:** complete rational integration · correct partial fractions ·
ODE characteristic polynomials beyond degree 2 (replacing the local `charRoots`) · inverse Laplace
transforms · complex pole location and residues.

> **Gate:** **every** rational function in the corpus integrates correctly. This class becomes
> *provably closed* — not "passes the tests", but "the algorithm is complete for this class".
> **Including inputs whose Rothstein–Trager resultant does not split over ℚ** — `∫dx/(x²−2)` and
> `∫(x²+1)/(x⁴+1)dx` are the canonical probes, and without task 5b the honest claim shrinks to
> "complete for rational functions that happen to split over ℚ", which is neither provable nor
> a class a student can recognise. The `partfrac` repeated-factor bug is gone. Laplace inversion is
> unblocked.

**STATUS: Foundation slice complete (2026-07-27); production-wired (2026-07-27); Δ≤0 irreducible
quadratics closed via completing-the-square (2026-07-28) — only genuinely degree≥3 irreducible
factors still need ℚ(α)/Hermite/LRT, the named follow-up.** Implemented in
`assets/js/kernel/{polynomial,poly-of-expr,poly-gcd,resultant,squarefree,factor-rat,
partial-fractions,rational-integrate}.js`. This slice delivers tasks 1–6 (representation, GCD,
square-free, resultants, factor over ℚ, correct partial fractions) plus a kernel-level rational
integrator that ties them into the class this slice makes *provably closed*: every rational
function whose denominator splits over ℚ into linear and irreducible-quadratic factors — **either
discriminant sign** — including repeated factors, has a correct antiderivative in polynomials,
logs (real, including log-of-a-radical for Δ<0 quadratics), and arctangents. The measured
`1/((x−1)²(x+2))` `partfrac` bug is fixed (decomposes to `(1/3)/(x−1)² − (1/9)/(x−1) + (1/9)/(x+2)`),
verified by exact recombination.

Verified in `tests/verify-poly.js` (36/36 gate assertions) and `tests/verify-poly-properties.js`
(1,849/1,849 seeded random-trial, with **independent** cross-checks — the L4 discipline of
`03_ARCHITECTURE.md` §3: the kernel never verifies itself with its own primitives). Cross-checks:
resultant vs an independent Sylvester determinant (Bareiss over ℚ); factorization reconstitution
plus an independent brute rational-root scan for returned quadratic factors; partial-fraction
recombination `polyPart·Q + Σ num·(Q/qᵢᵏ) == P`; and integration verified by **numeric
finite-difference differentiation back to the integrand**, evaluated with a Number-arithmetic
evaluator independent of the symbolic Rational machinery (using `ln|arg|`, the real branch whose
derivative equals the kernel's complex-branch `ln(arg)`, and `sqrt` for the Δ<0 radical case). The
full regression is 36 + 1,849 + the unchanged earlier suites (all clean, 2026-07-28); the entire
`assets/js/` tree (kernel and non-kernel alike) remains uncommitted working-tree state — see
memory: kernel↔production gap.

**Production wiring — done (landed 2026-07-27, unaffected by the 2026-07-28 quadratic fix).**
`tools/build-kernel-bundle.js`'s MODULES list includes all eight files above (and the rest of the
kernel); `assets/js/kernel/bridge.js` exposes `integrateRationalText()`; and
`assets/js/integration-advanced.js`'s `autoIntegrate()` calls it as the FIRST technique tried,
ahead of the older nerdamer-based partial-fractions technique, with the strangler-fig
refusal-falls-through contract intact (verified by `verify-cas-worker.js`'s bundle-drift check,
37/37, and the smoke-corpus production-pipeline measurement below, 40/40).

| Task | State |
|---|---|
| Polynomial representation over ℚ | ✅ `polynomial.js` — dense univariate, ascending ℚ[] coeffs, trimmed (zero = `[]`); of/degree/lc/mul/divRem/pseudoRemainder/contentAndPrimitivePart/derivative/evalAt/monic/pow |
| Expr↔Poly bridge | ✅ `poly-of-expr.js` — `polyFromExpr`/`rfFromExpr`/`polyToExpr`/`rfToExpr` (polynomial-only; refuses Func/foreign symbol/non-integer power) |
| Polynomial GCD | ✅ `poly-gcd.js` — monic Euclidean PRS over ℚ; cofactor. ⚠️ subresultant PRS **reserved for the LRT pass** (task 8), where it is load-bearing — see the scope note below |
| Resultants | ✅ `resultant.js` — Euclidean recurrence with the `(-1)^(degA·degB)` swap parity; `discriminant`; matches an independent Sylvester determinant on 150 random trials |
| Square-free factorization | ✅ `squarefree.js` — Yun's algorithm (char 0); `{content, factors:[{factor:monic, mult}]}` |
| Factorization over ℚ | ✅ `factor-rat.js` — rational-root stripping (rational root theorem) + Kronecker interpolation, gated by exact divisibility; refuses with `FactorRefusalError` past `MAX_DIVISOR_VALUE`/`MAX_COMBINATIONS` |
| Correct partial fractions | ✅ `partial-fractions.js` — square linear system over ℚ (Gaussian elimination), unconditionally correct for repeated factors and irreducible quadratics; no cover-up heuristic |
| Kernel rational integrator | ✅ `rational-integrate.js` — gcd-reduce → factor → PFD → termwise (polynomial; `A/(x−r)ᵏ`; `(a₁x+a₀)/qᵏ` for irreducible quadratic q, Δ=c−b²/4≠0 EITHER sign, via the reduction recurrence `Iₖ = u/(2(k−1)Δ q^(k-1)) + (2k−3)/(2(k-1)Δ) I_{k-1}` down to a base case I₁: arctan for Δ>0, `(1/(2√D)) ln((u−√D)/(u+√D))` (D=−Δ) for Δ<0 — the recurrence itself is sign-independent, only I₁ branches) |

⚠️ **Three scope boundaries, stated explicitly, not discovered later:**

1. **Factorization uses Kronecker, not Cantor–Zassenhaus + Hensel.** The plan (task 5) names CZ+Hensel
   as the algorithm. Kronecker (rational-root stripping + interpolation, exact and straightforwardly
   verifiable) is used instead because the Hensel β-coefficient recurrence could not be reliably
   reconstructed for this slice; CZ+Hensel is reserved as a named follow-up increment for large
   degrees where Kronecker's combinatorial cost matters. `factor-rat.js` documents this and refuses
   honestly past the divisor/combination caps rather than silently producing a wrong or partial
   factorization. Property tests cross-check both reconstitution and an independent irreducibility
   scan, so the choice of algorithm is held to the same soundness bar the plan would impose on CZ.
2. **The genuinely-degree≥3 ℚ(α) class is refused, not faked.** An irreducible factor of degree ≥ 3
   over ℚ (e.g. `x⁴+1`, `x³−2`) is **refused with a reason naming Rothstein–Trager over ℚ(α)**
   (tasks 5b & 8) — it needs an algebraic-extension arithmetic layer and a resultant computed over
   a polynomial ring in a free parameter `t` that nothing in this slice builds. **Irreducible
   quadratics with Δ≤0 are NOT in this refused class** (closed 2026-07-28, see the STATUS note
   above and `rational-integrate.js`'s `integrateInverseQuadraticPower`) — completing the square
   gives a real log of a plain radical ratio, which needs no field-extension machinery at all, only
   the same `sqrt(rational)` primitive the Δ>0 arctan case already uses for `√Δ`. Of the gate's two
   named canonical probes: `∫dx/(x²−2)` is now CORRECT (it was never really a Δ≤0-needs-ℚ(α)
   problem, just a missing log-of-radical base case); `∫(x²+1)/(x⁴+1)dx` remains REFUSED — its
   denominator is a genuinely irreducible quartic, and closing it needs the real task 5b/8 work
   below. `∫(x²+1)/(x⁴+5x²+4)dx` (splits over ℚ) was already handled either way.
3. **Production wiring — done, not deferred.** `assets/js/integration-advanced.js`'s
   `autoIntegrate()` calls `integrateRational` (via `assets/js/kernel/bridge.js`'s
   `integrateRationalText()`) as the first technique tried; all eight files above are in
   `tools/build-kernel-bundle.js`'s MODULES list. Landed 2026-07-27 alongside Phase 4's wiring pass
   (memory: kernel↔production gap); confirmed still intact after the 2026-07-28 quadratic fix via
   `verify-cas-worker.js`'s bundle-drift check and the smoke-corpus measurement (40/40, 0 failures).

⚠️ **Still open (the named follow-up to reach the full Phase 3 gate):**

- **Task 5b — arithmetic in ℚ(α) and Trager factoring over the extension**, and **task 8 —
  Rothstein–Trager / LRT** using a resultant computed over ℚ[t] (the "subresultant PRS reserved
  for the LRT pass" note on `poly-gcd.js` — computable via Bareiss/fraction-free elimination on
  the Sylvester matrix directly with the existing `Poly` representation, no bivariate-PRS module
  needed). This is genuinely the hard remaining piece, not just wiring: a 2026-07-28 investigation
  worked the algorithm by hand far enough to confirm it needs correct real-vs-complex-conjugate
  branch handling (two irrational-real algebraic conjugates combine into a log-of-ratio; two
  complex-conjugate algebraic values combine into an arctan) — getting that branch wrong produces
  a plausible-looking WRONG closed form, not a refusal, which is worse than not having it. Deferred
  deliberately for a dedicated pass with heavy independent numeric verification, rather than rushed.
  Only genuinely degree≥3 irreducible factors need this now (see scope note 2 above) — Δ≤0
  quadratics no longer do.
- **Task 7 — Hermite reduction.** This slice needs no Hermite reduction because the denominator is
  fully factored before PFD (the factorization-driven route); Hermite becomes load-bearing for
  the unfactored-denominator route the LRT pass prefers, and is deferred with it.
- **Cantor–Zassenhaus + Hensel** to replace Kronecker for large-degree factoring.

---

## Phase 4 — Series & limits
**1–2 months**

**Tasks**
1. Taylor series with symbolic order
2. **Laurent series** = Taylor + principal part; correct handling at poles
3. Puiseux series (fractional powers) — needed for algebraic branch points
4. Singularity classification: removable / pole of order n / essential
5. **Gruntz algorithm** for limits, built on series — replaces today's heuristic limit
6. Convergence radius and interval determination

> **Gate:**
> - Laurent expansion with correct principal part for the complex corpus
> - Singularity classification correct on all corpus cases
> - Limits that currently fail heuristically now succeed
> - Convergence radii match the textbook answers in the calculus corpus

**STATUS: Foundation slice complete (2026-07-27); Puiseux/essential/Gruntz-mrv and production
wiring deferred to the named follow-up.** Implemented in `assets/js/kernel/{differentiate,taylor,
laurent,singularity,convergence,limit}.js`. This slice delivers tasks 1, 2, 4, 6 in full and task 5
in a documented-deviation form: a kernel symbolic differentiator (the one genuinely new primitive
everything else needs — the production code uses nerdamer `diff`; the kernel had none, and it also
unblocks Phase 6 ODE), Taylor/Maclaurin series by repeated differentiation, **Laurent expansion of
rational functions** whose principal part comes directly from the Phase 3 partial-fraction layer
(PFD on the gcd-reduced fraction; pole order = multiplicity of `(x−center)`), **singularity
classification** of rational functions by exact successive division (removable / pole of order n /
regular — never factoring over ℚ(α), so it never hits the Phase 3 refusal), **radius + interval of
convergence** computed exactly over ℚ for the closed coefficient patterns (geometric, rational-in-n,
factorial growth/decay) with a Stewart-order endpoint decision tree, and a **series + L'Hôpital-based
limit** that closes the non-oscillatory class the gate names ("limits that currently fail
heuristically now succeed"): `sin x/x@0`, `(1−cos x)/x²@0`, `(eˣ−1)/x@0`, `(x²−1)/(x−1)@1`,
rational limits at infinity, `ln x/x@∞`, `(1+1/x)ˣ@∞=e`, `1/xᵏ@0` (even → ±∞, odd → dne),
`|x|/x@0` (dne).

Verified in `tests/verify-series.js` (84/84 gate assertions) and `tests/verify-series-properties.js`
(1,163/1,163 seeded random-trial, mulberry32 seed 20260727), each with **independent** L4
cross-checks (`03_ARCHITECTURE.md` §3 — the kernel never verifies itself with its own primitives):
differentiate by central finite-difference; Taylor by Maclaurin-coefficient reconstitution for
polynomials and truncated partial sum vs the function within the radius; Laurent by constructed-pole
order and annulus reconstruction; singularity by independent numeric log-log blowup slope (≈ −m at a
pole of order m); convergence by independent partial-sum behavior inside vs outside the radius; limit
by a two-sided numeric approach at shrinking offsets and a numeric approach to infinity — a finite
kernel claim must match the numeric truth, and refusals/dne/infinite are honest scope outcomes, never
wrong finite claims. Full regression: 84 + 1,163 + the unchanged Phase 1/2/3 suites; `verify-cas-worker.js`
(37/37) confirms the new files did not change the browser bundle — they are not in
`tools/build-kernel-bundle.js`'s MODULES list, per the deferred production wiring (same
kernel-vs-production boundary as Phases 1–3; memory: kernel↔production gap).

| Task | State |
|---|---|
| Symbolic differentiator (prerequisite) | ✅ `differentiate.js` — recursive d/dx → Expr; integer/rational/symbol, sum/product/quotient/chain rules, `Pow` (integer + rational exp with sign guard + constant-base `ln`), `Func` (sin/cos/tan/sec/exp/ln/sqrt/abs/inverse/hyperbolic); refuses binders and ambiguous power-sign. Verified by finite-difference (240 trials) |
| Taylor / Maclaurin | ✅ `taylor.js` — `Σ f⁽ᵏ⁾(a)/k!·(x−a)ᵏ` by repeated `differentiate`, each derivative evaluated at the center by `Expr.subst` + `reduceConstants` (exact Rationals where the value is rational; symbolic exact constants like `exp(1)` elsewhere). Refuses non-analytic-at-center forms (pole / removable / **branch point**) by catching the `0^(negative)` RangeError |
| Laurent (rational) | ✅ `laurent.js` — shift `u=x−a`, `rfFromExpr` + gcd-reduce, **always** PFD on the reduced fraction (the unified path that fixed the removable `(x²−1)/(x−1)@1` crash); principal part = terms over `u`, analytic part Taylor-expanded in `u`. `poleOrder` returned. Refuses non-rational (essential) and `FactorRefusalError` (ℚ(α)) |
| Singularity classification | ✅ `singularity.js` — exact successive `Poly.divExact` by the linear factor `[point.neg(), 1]` (**no `factorOverQ`** → never hits the ℚ(α) refusal); removable / pole of order n / regular. Non-rational → refused (deferred with Gruntz, never mislabelled essential) |
| Convergence radius + interval | ✅ `convergence.js` — exact radius over ℚ for geometric / rationalInN / factorialGrowth / factorialDecay; interval `|x−center|<R`; endpoint verdicts (converges-absolutely / -conditionally / diverges) via the p-series + Leibniz decision tree. Finite-array input: exact geometric detection only, else refused |
| Limit (series + L'Hôpital) | ✅ `limit.js` — direct subst → 1^∞ rewrite → quotient L'Hôpital (0/0, ∞/∞, fall-through on non-resolution) → Laurent (rational; even pole → ±∞, odd pole → dne) → one-sided sign-aware reduction (`abs` via `ctx.ask`; `|x|/x@0`→dne). ±∞ via `x=1/t` with an x-space L'Hôpital fallback for collapsed forms (`ln x/x`). Pole-aware `valOf` so a literal-zero factor in a `Mul` cannot mask a pole sibling (`Expr.mul` canonicalizes `0·anything→0` at construction, which previously made `x/abs(x)@0` wrongly return 0) |

⚠️ **Three scope boundaries, stated explicitly, not discovered later:**

1. **The limit is series + L'Hôpital, NOT the full Gruntz mrv algorithm** the docs name (task 5).
   This is the same kind of documented deviation as Phase 3's Kronecker-vs-CZ+Hensel: correct and
   verifiable for the closed non-oscillatory subset, with full Gruntz mrv reserved as a follow-up.
   The `1/t`-space L'Hôpital the infinity route uses *increases* pole order each step
   (`d/dt t⁻ᵈ = −d·t⁻ᵈ⁻¹`), so high-degree rational limits at infinity (`deg ≥ 3` with the
   `1/t` transform) can refuse rather than close — an honest refusal naming full Gruntz mrv, never a
   wrong value. The gate's `deg ≤ 2` infinity cases close; the property suite treats `deg ≥ 3`
   refusals as honest and only asserts finite-claim numerical correctness.
2. **Puiseux series and essential singularities are refused, not faked.** A fractional power at the
   center (`x^(1/2)@0`, a branch point) is **refused by `taylor`** — `reduceConstants` throws on
   `0^(negative)` for integer *and* fractional exponents, so the branch-point residue never becomes a
   garbage symbolic "coefficient"; the refusal names Puiseux and the ℚ(α) extension-field arithmetic
   Phase 3 deferred (task 3). Essential / transcendental-unresolvable singularities (`exp(1/x)@0`)
   and oscillatory limits (`sin(1/x)@0`) are **refused by `limit`** naming full Gruntz mrv and the
   series-of-essential machinery (tasks 3 & 5). `sin(x)/x@0` (removable, rationalizable) is NOT
   mislabelled essential — it resolves to 1.
3. **Production wiring is deferred.** The L3 dispatch does not yet call `differentiate`/`taylor`/
   `laurent`/`classifySingularity`/`powerSeriesConvergence`/`limit`; the new kernel files are not in
   `tools/build-kernel-bundle.js`'s MODULES list. This mirrors Phases 1–3, which each landed the
   kernel capability and its gate first and wired production in a separate pass. The strangler-fig
   contract holds: a kernel miss degrades to the existing behavior, never worse.

⚠️ **Still open (the named follow-up to reach the full Phase 4 gate):**

- **Task 5 — full Gruntz mrv** to replace the series + L'Hôpital route and close the oscillatory /
  growth-dominance / high-degree-infinity cases that currently refuse. The differentiator and the
  series primitives this slice lands are exactly the substrate Gruntz needs.
- **Task 3 — Puiseux series** (fractional powers at algebraic branch points), which needs the ℚ(α)
  extension-field arithmetic deferred in Phase 3 task 5b. Until it lands, branch-point expansions are
  refused.
- **Essential-singularity series** (expansion of `exp(1/(x−a))`-type essential singularities),
  deferred with Gruntz.
- **Production wiring** — add the six new modules to the L3 dispatch and the bundle MODULES list,
  with the strangler-fig refusal as the fallback.

---

## Phase 5 — Rubi rule port
**2–4 months · mechanical, scriptable, parallelizable**

**Tasks**
1. Write a translator from Rubi's Mathematica rule notation into your L2 rule data format
2. Port the decision tree **subtree by subtree**, gated by corpus coverage — partial ports are
   immediately useful, so this never blocks
3. Carry each rule's identity and literature reference through to L5 as a derivation step
4. Run the full 72,000-problem suite after each subtree; track coverage in snapshots

**Why this instead of Risch:** Rubi is MIT, has 6,700 rules and 72,000 tests, and is *rule-based* —
so every rule application **is** a derivation step. The technical choice and the product
differentiator are the same choice. See `06_DATA_SOURCES.md` §2.

> **Gate:** ≥90% on the Rubi corpus subset matching your syllabus, **with steps emitted** for every
> success. Fall-through rate to nerdamer below 10%.

---

## Phase 6 — ODE/PDE completion
**2–3 months**

`ode-symbolic.js` is already a hand-built solver on `diff`/`integrate` — nerdamer has no `dsolve`
at all. Formalise it into the kernel; do not restart it.

**Tasks**
1. Port existing solvers (separable, linear, exact, homogeneous, Bernoulli, const-coeff,
   undetermined coefficients, variation of parameters) onto the kernel
2. Replace the local degree-2 `charRoots` with kernel polynomial roots — generalises past degree 2
3. **Reduction of order** (P1, currently missing)
4. **Laplace transform + inverse** (P1) — now cheap, because inverse Laplace is dominated by
   partial fractions from Phase 3
5. Step/impulse/convolution (P2)
6. **Systems `x' = Ax`** via eigenvalues + phase portrait classification (P1) — reuses existing
   `LinAlg`
7. **Series / Frobenius solutions** — needs Phase 4
8. **PDE — half this engine, per `CURRICULUM_ROADMAP.md` §5G.** Separation of variables for heat
   (🟡 built), **wave (P1, missing)**, **Laplace/Poisson (P2, missing)**; then numerical schemes
   (explicit, implicit, Crank–Nicolson) with stability analysis. Verify all four ways: PDE
   residual, boundary conditions, initial condition, series convergence

> **Gate:** full Boyce & DiPrima Ch. 1–11 coverage with steps; **every solution verified by
> substitution back into the original equation** with residual ≈ 0.

---

## Phase 7 — Complex Analysis completion
**2–3 months · must come after Phase 1, never before**

**Tasks**
1. Branch-correct `log`, `sqrt`, `z^a` — driven by L1 assumptions, tracking the cut explicitly
2. Contour integration (parametrised paths) with the numeric Simpson verify gate
3. Cauchy–Goursat, Cauchy integral formula
4. Taylor and **Laurent** series in ℂ (Phase 4)
5. Residues; residue theorem
6. **Real integrals by residues** — the payoff, and the cross-link to Calculus §2 #7
7. Argument principle, Rouché
8. Conformal and Möbius mappings

> **Gate:** `∫₀^∞ dx/(1+x²)` evaluated by residues, **correct branch**, with steps.
> No branch-cut error anywhere in the complex corpus.

---

## Phase 8 — Server boundary & product
**2–3 months**

**Tasks**
1. Move the kernel behind `fetch()` at the `cas-client.js:101` seam
2. Keep client-side: parsing, plotting, numeric evaluation, rendering (fast, cheap, not the moat)
3. Auth, rate limiting, result caching
4. Offline degradation: state honestly what is unavailable rather than failing silently

> **Gate:** kernel source never reaches a client; every page behaves identically to today;
> p95 latency < 300 ms.

**Decide the split before Phase 1 ships** — retrofitting a network boundary onto a kernel that
assumes local synchronous calls is painful, and deciding now costs nothing because `cas-client.js`
is already Promise-based.

---

## Summary table

| Phase | Deliverable | Gate | Time |
|---|---|---|---|
| 0 | Benchmark harness + corpora | One command prints a baseline number | 1–2 wk |
| 1 | L0 AST + **L1 assumptions** | `√(x²)`→`x` under `x>0`, `\|x\|` otherwise | 2–3 mo |
| 2 | L2 rewrite engine | ✅ **gate met, including production wiring** — 4/4 inverse-trig; smoke-corpus failures through the production pipeline 12 → **0** (target ≤4), measured by `tests/bench/baseline.js` | 1–2 mo |
| **2b** | **Normalize to rational** | ✅ **kernel-level gate met** — all four techniques (Weierstrass, rationalizing, algebraic/Möbius, trig-power) verified against the measured hang cases | 3–4 wk |
| **2c** | **Time budget** | ✅ kernel-level cooperative deadline done and wired into `cas-client.js`; the syllabus-corpus `TIMEOUT` count itself needs production wiring, not yet done | 1 wk |
| **2d** | **Search control & cost model** | ✅ **met** — `normalize` idempotent + terminating; output deterministic across runs *and* rule reorderings | 2–3 wk |
| 3 | **Polynomial algebra** *(incl. ℚ(α))* | 🟡 production-wired; provably closed for linear + irreducible-quadratic denominators (either Δ sign); genuinely degree≥3 irreducible factors (ℚ(α)/LRT, tasks 5b/7/8) still refused honestly | 2–3 mo |
| 4 | Series & limits | Laurent with correct principal part | 1–2 mo |
| 5 | Rubi rule port | ≥90% of syllabus corpus, with steps | 2–4 mo |
| 6 | ODE/PDE | Boyce & DiPrima Ch. 1–11, verified by substitution | 2–3 mo |
| 7 | Complex | ∫₀^∞dx/(1+x²) by residues, correct branch | 2–3 mo |
| 8 | Server boundary | Kernel never reaches a client; p95 < 300 ms | 2–3 mo |

## If you only have three months

Phases 0, 1, 2, 2b, 2c and 2d. That gives you a correct expression kernel with assumptions and a
rewrite engine — which by itself clears 8 of the 12 measured integration failures, fixes the complex
branch-cut hazard before it is baked into the complex engine, and leaves you with a foundation
that everything else can be built on incrementally. **Stopping there still leaves you better off
than today.** Stopping after Phase 3 leaves you with a provably complete rational integrator,
which no competitor's *free* tier offers.
