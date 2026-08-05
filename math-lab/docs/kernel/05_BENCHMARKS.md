# 05 — Benchmarks

**Principle: if you cannot print a number, you do not know where you are.**

The harness lives at `tests/bench/baseline.js`. Run it after every phase gate. Snapshots land in
`tests/bench/snapshots/` so progress is a diff, not a memory.

```bash
node tests/bench/baseline.js              # run everything, print report, write snapshot
node tests/bench/baseline.js --quick      # integration + kernel probes only
node tests/bench/baseline.js --compare    # diff against the most recent snapshot
```

---

## 1. What gets measured

Four classifications per problem. The distinction between the middle two is the whole point.

| Class | Meaning | Severity |
|---|---|---|
| ✅ **CORRECT** | Result produced and independently verified | — |
| ❌ **WRONG** | Result produced, verification **failed** | **Critical — this is the number that matters** |
| ⚪ **REFUSED** | No result; declined or returned unevaluated | Acceptable — safe failure |
| ⚠️ **UNVERIFIABLE** | Result produced but could not be checked numerically | Investigate — may be hiding a WRONG |

**A refusal is a safe failure. A wrong answer shown to a student is the worst possible outcome.**
Any change that converts REFUSED → WRONG is a regression even if total coverage rises.

### Secondary metrics

| Metric | Why it matters |
|---|---|
| **Fall-through rate** | Fraction of calls reaching nerdamer. Tracks strangler-fig progress toward 0% |
| **Step completeness** | Fraction of successes emitting full `{rule, text, latex}` steps. This is the product |
| **Step count** | Steps emitted per solution. Watches for narration drifting toward either uselessly terse or unreadably long |
| **Refusal quality** | Fraction of refusals naming a *reason* and ideally the correct technique |
| **Latency p50/p95** | Guards the < 300 ms target from Phase 8 |
| **Peak / final expression size** | ⚠️ Added 2026-07-26. `cost(e)` at its maximum during a computation, and at the end. **Expression swell is the classic CAS failure mode and it is invisible without this** — intermediates grow by orders of magnitude while the final answer stays small, so a rule that doubles peak size every phase shows up only as a timeout, months later, with no obvious cause. Peak matters more than final; track both |
| **Rewrite steps per problem** | Machine-independent search cost, unlike latency. Regressions here predict latency regressions on slower hardware |
| **Determinism** | Same input → same output across runs **and across a rule-database reordering**. The second half is what catches iteration-order dependence, and it is required for regression testing to mean anything |

---

## 2. The corpora

| Corpus | Source | Licence | Size | Engine |
|---|---|---|---|---|
| **Integration** | [Rubi](https://rulebasedintegration.org/) test suite | **MIT** | 72,000 problems | Calculus |
| **Integration (syllabus subset)** | Rubi ∩ `CURRICULUM_ROADMAP.md` §2 | MIT | filtered | Calculus |
| **Kernel probes** | Hand-written, this repo | — | 20 probes | All |
| **ODE** | SymPy test suite + Boyce & DiPrima exercises | BSD | ~300 | ODE/PDE |
| **Complex** | FriCAS + SymPy + Churchill & Brown exercises | BSD | ~200 | Complex |
| **Regression** | Every bug ever found, permanently | — | grows | All |

**The syllabus subset is the one that defines "done."** The full 72k Rubi suite is a stretch
measure — it includes integrals far beyond an undergraduate syllabus. Do not let the full number
demoralise you; track the subset.

### The regression corpus rule

**Every bug found, in any phase, becomes a permanent test case the same day.** This corpus only
grows. It is the reason a rewrite of this size is survivable.

---

## 3. Baseline — the real one (Rubi syllabus corpus, 2026-07-25)

**875 undergraduate problems** — Stewart/Apostol/Moses/Hearn, special functions excluded.
Reproduce with `node tests/bench/baseline.js --corpus=syllabus`.

```
    correct                  372/875   42.5%
    SILENTLY WRONG           183/875   20.9%   <-- the number that matters
    refused (safe)           269/875   30.7%
    unverifiable              32/875    3.7%
    TIMEOUT (hung)            19/875    2.2%

  by Rubi difficulty (optimal rule applications):
      1-2 steps              250/446   56.1%
      3-5 steps              115/355   32.4%
      6-10 steps               7/62    11.3%
      11+ steps                0/12     0.0%
```

### Read this before quoting any other number in this folder

**The hand-picked 40-problem corpus said 70%. The real corpus says 42.5%.** That 27-point gap is
what selection bias looks like, and it is the single most important thing Phase 0 produced. Every
target in §4 below was set against the 40-problem number and is therefore optimistic; treat the
syllabus corpus as the measure from here on.

**The difficulty curve is the diagnosis.** 56% → 32% → 11% → 0% as Rubi's optimal step count rises
is the signature of a heuristic with no systematic algorithm underneath: it handles what pattern-
matches in one or two moves and falls off a cliff the moment real search is required. No amount of
pre/post-processing changes that shape — only a real algorithm does (Phase 3) or a real rule set
does (Phase 5).

**20.9% silently wrong is worse than the 15% the smoke corpus reported.** One in five answers a
student would be handed is confidently incorrect. Examples:

```
  ∫ sin(x)/(3+cos(x))^2      got  (1/3)cos³x + (3/2)cos²x − sin(x)/(3+cos x)
                        expected  1/(3+cos x)

  ∫ cos(2x)·√(4−sin 2x)      got  (1/4)cos²(2x) + 2sin(2x)
                        expected  −(1/3)(4−sin 2x)^(3/2)
```

**19 problems hang the CAS outright** — mostly Weierstrass-substitution cases like
`∫dx/(1+2cos x)` and `∫dx/(5−cos x+2 sin x)`. In a browser each of these is a frozen tab. This is
why the runner is process-isolated and why `TIMEOUT` exists as a class.

---

## 3a. Smoke corpus — 40 hand-picked problems

Fast feedback only. **Never quote as a headline.** Reproduce with `node tests/bench/baseline.js`.

```
  INTEGRATION (40 standard textbook problems, raw nerdamer)
    correct               28/40    70.0%
    SILENTLY WRONG         6/40    15.0%   ← the number that matters
    refused                5/40    12.5%
    unverifiable           1/40     2.5%

  KERNEL PROBES
    canonical simplification    6/8     75.0%
    inverse-trig composition    0/4      0.0%
    branch/domain arithmetic    3/3    100.0%
    assumptions system                 ABSENT
    symbolic dsolve                    ABSENT
    symbolic summation                 ABSENT
```

### Failure inventory (the 12 to fix)

| # | Integral | Class | Root cause | Fixed in |
|---|---|---|---|---|
| 1 | ∫1/((x−1)²(x+2)) | WRONG | `partfrac` repeated-factor bug | Phase 3 |
| 2 | ∫√(4−x²) | WRONG | no inverse-trig rewriting | Phase 2 |
| 3 | ∫√(9−x²) | WRONG | no inverse-trig rewriting | Phase 2 |
| 4 | ∫1/(x²√(x²−1)) | WRONG | wrong branch — no assumptions | Phase 1 |
| 5 | ∫1/(x²+2x+5) | ~~WRONG~~ **FIXED** | `integrate` never calls `simplify` | ✅ shipped |
| 6 | ∫1/(1+√x) | ~~WRONG~~ **FIXED** | no algebraic substitution | ✅ shipped |
| 7 | ∫√(1+x²) | REFUSED | no rule | Phase 5 |
| 8 | ∫√(x²−1) | REFUSED | no rule | Phase 5 |
| 9 | ∫1/√(x²+4x+13) | ~~REFUSED~~ **FIXED** | no completing the square | ✅ shipped |
| 10 | ∫x√(x+1) | ~~REFUSED~~ **FIXED** | no algebraic substitution | ✅ shipped |
| 11 | ∫e^√x | ~~REFUSED~~ **FIXED** | no algebraic substitution | ✅ shipped |
| 12 | ∫x²/√(x²−9) | UNVERIFIABLE | wrong branch — no assumptions | Phase 1 |

**Status 2026-07-25: 5 of the 12 are already fixed and shipped** in
`assets/js/integration-advanced.js` (44 assertions, 0 fail), taking the corpus from
**28/40 (70.0%) to 33/40 (82.5%)** with production code rather than a prototype. The two new
techniques — `algebraicSubstitution` and `completeTheSquare` — were genuinely absent from the
engine, not broken in it.

Of the remaining 7: Phase 1 (assumptions) clears the 2 branch-selection cases, Phase 2 clears
the inverse-trig rewriting cases, and Phase 3 clears the `partfrac` bug.

---

## 3b. Reachability experiment — how the 70% → 95% gap actually closes

`node tests/bench/reachability.js` prototypes the planned fixes above the untouched nerdamer and
measures the real lift. Run 2026-07-25:

| Layer added | Rate | Δ |
|---|---|---|
| baseline (raw nerdamer) | 70.0% | — |
| **v1** — post-processing only (`simplify` output, rewrite inverse-trig compositions) | 72.5% | **+2.5** |
| **v2** — + literal radical reduction, own trig/hyperbolic substitution, small standard-form table | 82.5% | +10.0 |
| **v3** — + *general* assumption-driven radical reduction | **87.5%** | +5.0 |

### The decisive finding

**Post-processing alone buys almost nothing (+2.5%).** The blockers are *inside* nerdamer's
simplifier, not at its boundary. Proof — nerdamer solves every one of these perfectly:

```
  integrate(2*u/(1+u),u)   ->  2*(u - log(1+u))            correct
  integrate(2*u*e^u,u)     ->  2*(u*e^u - e^u)             correct
  integrate(sinh(t)^2,t)   ->  -t/2 + sinh(2*t)/4          correct
  integrate(cosh(t)^2,t)   ->   t/2 + sinh(2*t)/4          correct
```

Yet `∫1/(1+√x)`, `∫e^√x`, `∫√(1+x²)` and `∫√(x²−1)` all fail. The *only* thing standing between
them is a reduction nerdamer will not perform:

| Needs to reduce | Requires knowing | nerdamer gives |
|---|---|---|
| `sqrt(u^2)` → `u` | `u ≥ 0` | `abs(u)` — then `integrate` gives up |
| `sqrt(4-4*sin(t)^2)` → `2*cos(t)` | `cos t ≥ 0` on the substitution range | unreduced |
| `sqrt(cosh(t)^2-1)` → `sinh(t)` | `t ≥ 0` | unreduced |
| `sqrt((u-2)^2+4*(u-2)+13)` → `sqrt(u^2+9)` | normalization under a radical | unreduced |

**Every row is an assumptions problem or a rewriting problem.** This is direct experimental
confirmation that Phase 1 and Phase 2 are correctly ordered, and that a thin adapter layer cannot
substitute for them.

### What remains at 87.5%, and what each needs

| Still failing | Needs | Phase |
|---|---|---|
| ∫1/((x−1)²(x+2)) | Real partial fractions — the `partfrac` bug | **3** |
| ∫√(x²−1), ∫1/(x²√(x²−1)) | `a=1` degenerate case; robust engineered reducer | 1–2 |
| ∫1/(1+√x), ∫e^√x | Same reducer firing on `sqrt(u^2)` in these shapes | 1–2 |

The last four are **prototype fragility, not fundamentals** — nerdamer solves all four reduced
forms correctly (shown above). A properly engineered L1+L2 should take this corpus to ~97%, with
the partial-fractions case waiting on Phase 3.

⚠️ **Calibration warning.** This is a 40-problem hand-picked corpus — *easy mode*. 95% here does
not imply 95% on Rubi's 72,000, which reaches far past an undergraduate syllabus. That is exactly
why "done" is defined against the **syllabus subset** (§2) and not a raw percentage.

---

## 4. Targets per phase

⚠️ **Recalibrated 2026-07-25** against the real 875-problem syllabus corpus. The previous version
of this table was set against the 40-problem smoke corpus and was optimistic by ~27 points.

| After phase | Correct (syllabus) | Silently wrong | Hangs | Fall-through |
|---|---|---|---|---|
| **baseline (measured)** | **42.5%** | **20.9%** | **19** | 100% |
| 1 — assumptions | 46% | 18% | 19 | 95% |
| 2 — rewrite | 55% | 12% | 19 | 90% |
| **2b — normalize to rational** | 62% | 8% | **13** | 85% |
| **2c — time budget** | 62% | 8% | **0** | 85% |
| **2d — search control** | 62% | 8% | 0 | 85% |
| 3 — poly algebra *(rational becomes complete)* | **78%** | ≤3% | 0 | 60% |
| 4 — series | 80% | ≤3% | 0 | 55% |
| 5 — Rubi rule port | **≥93%** | **0%** | 0 | ≤10% |
| 6/7 — engines | ≥93% | 0% | 0 | ≤5% |
| 8 — done | **100% of syllabus corpus** | **0%** | 0 | **0%** |

The jump at Phase 3 is the largest single step in the plan because rational integration becomes
*provably complete* — and Phase 2b feeds two more large classes into it.

**Phase 2d moves no coverage number, and that is expected.** Search control is not a capability;
it is what makes the capabilities reproducible and bounded. Its gate is measured on determinism,
idempotence and peak expression size (`04_BUILD_PHASES.md` Phase 2d), not on the correct column.
A phase that buys no coverage is still worth doing when it is what keeps later phases from becoming
unmeasurable.

**Note on the "silently wrong" column.** These figures measure **raw nerdamer**, not the shipped
engine. Every technique in `calculus-symbolic.js` wraps its result in a differentiate-back gate, so
in the product those wrong answers surface as *refusals*. The engine's true profile is closer to
**~42% correct / ~0% wrong / ~57% refused** — meaning the real problem is **coverage, not
correctness**. Measuring the engine end-to-end against the corpus is outstanding work.

**The "silently wrong" column reaching 0% matters more than the "correct" column reaching 100%.**
A kernel that refuses 20% honestly is a better product than one that is wrong on 5% silently.

---

## 5. Verification methods used by the harness

Each result type has an independent check that **never uses the kernel's own primitives**. See
`07_VALIDATION.md` for the full methodology.

| Result | Check |
|---|---|
| Antiderivative `F` of `f` | Central differences: `(F(x+h)−F(x−h))/2h ≈ f(x)` at ≥5 points, `h=1e-5`, tolerance `1e-4·max(1,\|f\|)` |
| ODE solution | Substitute into the original equation; residual ≈ 0 at sample points |
| Limit | Numeric approach from both sides |
| Series | Truncated partial sum vs. the function inside the radius |
| Residue | Numeric contour integral ÷ 2πi |
| Root / eigenvalue | Substitute back |

### Why finite differences and not symbolic differentiation

`verify-calculus.js:198` already documents this and it is worth restating as policy: **nerdamer's
`diff()` is wrong on √(quadratic) forms**, so using it to verify trig-substitution results would
*reject correct answers*. The harness therefore uses math.js finite differences, which shares no
code with the thing under test.

**Rule: the verifier and the thing verified must not share an implementation.**

### Sample-point selection

Points must lie inside the domain of both `F` and `f`. The harness uses per-problem point sets:

| Domain | Points |
|---|---|
| general / near origin | `0.21, 0.43, 0.67, 0.91, 1.17, 1.41, 1.63, 1.87` |
| `\|x\| > a` (e.g. √(x²−9)) | `3.4, 4.1, 5.3, 6.7, 8.2` |
| `\|x\| < a` (e.g. √(4−x²)) | `0.21, 0.43, 0.67, 0.91, 1.17, 1.41, 1.63, 1.87` |
| `x > 1` (logs) | `1.3, 1.9, 2.6, 3.4, 4.5` |
| `0 < x < 1` (asin) | `0.11, 0.29, 0.47, 0.62, 0.78` |

Irrational-looking offsets are deliberate: they avoid accidental symmetry, removable
singularities, and exact zeros that could make a wrong answer look right.

**A result checked at fewer than 3 usable points is UNVERIFIABLE, never CORRECT.**

---

## 6. Snapshot format

`tests/bench/snapshots/YYYY-MM-DDTHH-MM-SS.json`:

```json
{
  "timestamp": "2026-07-25T00:00:00Z",
  "git": "89224d4",
  "phase": 0,
  "integration": { "total": 40, "correct": 28, "wrong": 6, "refused": 5, "unverifiable": 1 },
  "kernel":      { "canonical": [6,8], "inverseTrig": [0,4], "branch": [3,3],
                   "assumptions": false, "dsolve": false, "summation": false },
  "fallThrough": 1.0,
  "stepCompleteness": null,
  "cost":        { "peakMax": null, "peakP95": null, "finalMedian": null,
                   "rewriteStepsP95": null },
  "determinism": { "acrossRuns": null, "acrossRuleReorder": null },
  "failures": [ { "problem": "1/((x-1)^2*(x+2))", "class": "WRONG",
                  "got": "-3*(-1+x)^(-1)+log(-1+x)", "cause": "partfrac repeated factor" } ]
}
```

The `cost` and `determinism` blocks are `null` until Phase 2d supplies a `cost(e)` function — they
are in the schema from now so that snapshots taken before and after that phase remain diffable.

`--compare` diffs the current run against the newest snapshot and **exits non-zero on any
regression** — so it can gate a commit hook or CI.

---

## 7. Rules for using benchmarks

1. **Run before and after every change.** A phase is not done until its gate is green *and*
   nothing regressed.
2. **Never delete a failing case to make a number look better.** Move it to a known-failures list
   with a reason and a target phase.
3. **REFUSED → WRONG is always a regression**, even if total coverage rose.
4. **Track the syllabus subset for morale; track the full corpus for honesty.**
5. **Snapshot every phase gate and keep it forever.** The record of how the number moved is how you
   know which decisions actually worked.
