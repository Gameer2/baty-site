# 07 — Validation: How To Know What You Built Is Correct

The hardest question in this project is not *"can I implement Rothstein–Trager?"* It is
**"how do I know my answer is right when I have no oracle?"**

You already solved this once. `verify-calculus.js` reads 809/809 on top of a dependency that is
70% correct and **15% silently wrong**. That gap is not luck — it is a methodology, and this file
writes it down so it survives the rewrite.

---

## 1. The one non-negotiable rule

> **A system may never verify itself with its own primitives.**

`verify-calculus.js:198` already embodies this, and the comment there explains why: nerdamer's
`diff()` is wrong on √(quadratic) forms, so verifying trig-substitution results with nerdamer's
own differentiator would **reject correct answers**. The suite therefore uses pure math.js finite
differences — code that shares nothing with the thing under test.

Applied to the new kernel:

| Under test | Verify with | Never verify with |
|---|---|---|
| Kernel `integrate` | math.js finite differences | kernel `diff` |
| Kernel `diff` | finite differences on the original | kernel `integrate` |
| Kernel `simplify` | numeric evaluation at random points | kernel `equals` |
| Kernel ODE solver | numeric substitution into the ODE | kernel `dsolve` |
| Kernel `limit` | numeric approach from both sides | kernel `series` |

**Rule: the verifier and the verified must not share an implementation.** When the kernel is
mature enough that finite differences are the only independent check left, that is the signal to
add a second, deliberately naive implementation for cross-checking — not to relax the rule.

---

## 2. The five levels of validation

Each level catches what the level below cannot.

```
  L5  Corpus closure     ── does it cover everything I promised?
  L4  Differential       ── do SymPy and FriCAS agree with me?
  L3  Metamorphic        ── do mathematical invariants hold?
  L2  Property-based     ── does it hold on thousands of random inputs?
  L1  Unit               ── does this one case work?
```

---

## 3. L1–L2 — Unit and property-based testing

### Unit tests
Follow the existing `verify-*.js` conventions. Two rules carried over from `verify-calculus.js`:

- **Assert on behaviour, never on strings.** `(-1/2)*cos(x^2)` and `-cos(x^2)/2` are the same
  answer; an antiderivative may differ from the book's by a constant. String comparison produces a
  suite that fails on cosmetics and passes on nothing that matters.
- **Assert the refusal cases too.** The suite already tests that `uSubstitution("x*e^x")` *declines*.
  Refusals are behaviour and must be locked down, or a future change will silently turn them into
  wrong answers.

### Property-based testing (new — add in Phase 1)

Generate thousands of random expressions and assert invariants that must hold for all of them.

| Property | Assertion |
|---|---|
| Canonical form | `normalize(a)` equals `normalize(b)` whenever `a` and `b` are numerically equal at 10 random points |
| Parse round-trip | `parse(print(e))` equals `e` — structurally, via hash-consing |
| Idempotence | `normalize(normalize(e))` equals `normalize(e)` |
| Assumption soundness | if `ask(x,'positive')` is `true`, then `x` evaluates positive at every sampled admissible point |
| **Assumption consistency** | no context ever answers `true` to both `P` and `¬P`. Generate random assumption sets, including deliberately contradictory ones, and assert the contradictory ones are **rejected at assertion time** rather than answered |
| Rewrite soundness | every rewrite preserves numeric value at 10 random points |
| Hash consistency | `a.equals(b)` implies `a.hash() === b.hash()` |
| **α-equivalence** | for binder nodes, renaming the bound variable changes neither `.equals` nor `.hash()`; `subst` never captures — generate substitutions that *would* capture under naive replacement and assert they do not |
| **Cost determinism** | `cost(e)` is a pure function of `e`; identical inputs give identical values across runs and across rule-database reorderings |
| **Search boundedness** | every operation either returns a result or refuses **within `maxSteps`** — the wall clock is never what stops it |

**The rewrite-soundness property is the most valuable single test in the plan.** It catches an
entire class of bug — a rule with a wrong sign, a missing guard, a bad pattern match — automatically,
across every rule you will ever add, including all 6,700 Rubi rules.

Generator design: build random expression trees from a weighted grammar over `+ − × ÷ ^ sin cos exp
log sqrt` with small integer coefficients; bound depth to 4–5. Reject samples with domain errors at
the test points rather than special-casing them.

---

## 4. L3 — Metamorphic testing

Assert relationships that must hold **without knowing the right answer**. This is the technique
that works when no oracle exists, and it is underused.

| Invariant | Why it catches things nothing else does |
|---|---|
| `d/dx(∫f dx) = f` | The fundamental one. Already in use — keep it central |
| `∫ₐᵇf + ∫ᵇᶜf = ∫ₐᶜf` | Catches branch and constant-of-integration errors that pointwise checks miss |
| `∫ₐᵇf = −∫ᵇₐf` | Orientation |
| `d/dx(f·g) = f'g + fg'` | Product rule as a check on `diff` itself |
| Series truncation converges | Partial sums approach `f` inside the radius, diverge outside — validates the radius, not just the coefficients |
| ODE solution substitutes back | Residual ≈ 0. **The only real check for a solver with no oracle** |
| Residue via two routes | Laurent `c₋₁` vs. numeric contour integral ÷ 2πi must agree |
| Laplace round-trip | `ilt(laplace(f)) = f` |
| Assumption monotonicity | Adding an assumption never turns a `true` answer into `false` — only `unknown` into `true`/`false` |

**Worked example — why the subdivision invariant matters.** A trig-substitution result that picked
the wrong branch can still differentiate back correctly on one side of the cut. Pointwise
verification passes. But `∫₁²f + ∫₂³f = ∫₁³f` fails, because the branch error contributes a constant
offset that cancels pointwise and not additively. This invariant catches exactly the measured
`√(x²−9)` class of failure.

---

## 5. L4 — Differential testing

Run every corpus problem through **three independent systems**: your kernel, SymPy (BSD), and
FriCAS (BSD). Adjudicate by finite differences.

| Outcome | Meaning | Action |
|---|---|---|
| All three agree, numerics confirm | High confidence | ✅ |
| Kernel differs, numerics confirm **kernel** | Others are wrong, or a different valid form | Investigate; likely fine |
| Kernel differs, numerics confirm **others** | **Your bug** | Fix; add to regression corpus |
| All disagree | Hard problem, or a shared misunderstanding | Escalate to hand-verification |
| Kernel refuses, others answer | Coverage gap | Add to backlog, targeted at a phase |

⚠️ Never treat another CAS as ground truth. This document exists because a widely-used CAS was
measured at **15% silently wrong**. Numerics adjudicate; systems only vote.

---

## 6. L5 — Corpus closure

The definition of done from `02_TARGET_STATE.md`. Coverage of the *syllabus subset*, tracked by
`tests/bench/baseline.js`, must reach 100% with **zero** in the silently-wrong column.

**Closure is stronger than coverage for one class:** after Phase 3, rational-function integration
is *provably* complete — Hermite + Rothstein–Trager is a complete algorithm for that class, not a
heuristic that happens to pass tests. Where you can get a proof, take the proof. Where you cannot,
corpus coverage is the honest substitute.

---

## 7. Runtime validation — distinct from test-time

Tests validate the kernel before shipping. **The verification gate validates every single answer
at runtime, in front of the user.** Both are mandatory; they are not the same thing.

```
   user input
       │
       ▼
   kernel computes a candidate result
       │
       ▼
   ┌─────────────────────────────────┐
   │  L4 VERIFICATION GATE           │
   │  differentiate back / substitute │
   │  independent numeric check       │
   └────────┬──────────────┬─────────┘
            │ pass         │ fail
            ▼              ▼
      show result     REFUSE with a reason
      + steps         ("failed the differentiate-back
                       check — try another technique")
```

This is why the current suite reads 809/809 over a 70% dependency, and it is the property that
makes an incremental rewrite safe: **a kernel bug degrades to a refusal, never to a wrong answer
shown to a student.**

Two policies:
- **Never return an unverified result.** If the check cannot run, refuse — do not guess.
- **Log every refusal** with input and reason. This log *is* your prioritised backlog: the most
  frequent refusals tell you what to build next, ranked by real user demand.

---

## 8. Validating the steps, not just the answer

Steps are the product, so they need their own validation. A correct answer with wrong reasoning is
a product defect even though the mathematics checks out.

Since Phase 2 the derivation is a **tree**, not a list (`03_ARCHITECTURE.md` §3, L5), so these
checks are a **post-order tree walk** — which localises a bad step to a node instead of to
"somewhere in the chain."

| Check | Assertion |
|---|---|
| Structural completeness | Every node has non-empty `rule`, `text`, and `latex` (already asserted in `verify-calculus.js`) |
| **Node validity** | At every node, `numeric(goal) == numeric(result)` at sample points. This is the tree form of the step-chain check — **automatable and rarely done** |
| **Child composition** | A node's `result` follows from its children's results under its own `rule` — catches a correct sub-derivation wired into the wrong place |
| Terminal agreement | The root's `result` equals the returned answer |
| Rule attribution | The named rule actually applies to that transformation, and `binding` re-derives `result` when replayed against `goal` |
| **Assumption honesty** | ⚠️ Every assumption in a node's `context` is either implied by the user's input or **surfaced in the narration**. A step valid only under `x>0` that does not say so is a wrong answer wearing a correct one's clothes — and it is the failure mode the L4 numeric gate cannot see, because it checks points where the assumption happens to hold |
| **Context consistency** | Every node's `context` is consistent (§3). An inconsistent context anywhere in the tree invalidates the whole derivation regardless of how the numerics land |
| Pedagogical order | The substitution chosen is the one a textbook teaches — already asserted via `sameExpr(r.u, c.u)` |

The node-validity check is worth building early: it turns the narration from prose into something
machine-verifiable, and it catches rules that produce the right answer by the wrong route.

**Reversibility is explicitly not required.** Re-checkability — `numeric(goal) == numeric(result)`
per node — is weaker, always achievable, and sufficient. Requiring every rule to be invertible would
constrain rule authoring (and the Rubi port in particular) for no product benefit.

---

## 9. Regression discipline

1. **Every bug becomes a permanent test case the same day it is found.** No exceptions. This corpus
   only grows.
2. **Snapshot at every phase gate**, keep forever (`tests/bench/snapshots/`).
3. **`--compare` exits non-zero on regression** — wire it into a commit hook or CI.
4. **REFUSED → WRONG is always a regression**, even when total coverage rises.
5. **Never delete a failing case to improve a number.** Move it to known-failures with a reason and
   a target phase.

---

## 10. Validation checklist per phase

Before declaring any phase done:

- [ ] Unit tests for every new capability, including refusal cases
- [ ] Property tests pass on ≥10,000 random inputs
- [ ] Metamorphic invariants hold across the corpus
- [ ] Differential test vs. SymPy and FriCAS shows no unexplained disagreement
- [ ] `node tests/bench/baseline.js` meets the phase gate in `04_BUILD_PHASES.md`
- [ ] `--compare` shows **no regression** on any metric
- [ ] Silently-wrong count is at or below the phase target
- [ ] Every new bug found during the phase is in the regression corpus
- [ ] Steps validated structurally *and* by per-node numeric equality over the derivation tree
- [ ] **Peak expression size did not regress**, and no operation is stopped by the wall clock
      rather than by `maxSteps` (from Phase 2d)
- [ ] **Output is deterministic across runs and across a rule-database reordering**
- [ ] Snapshot written and committed

---

## 11. The summary you should remember

**Three independent things must agree before you trust a result:** the symbolic answer, an
independent numeric check that shares no code with the kernel, and a mathematical invariant that
holds regardless of which is right. When they disagree, the numerics win — and the disagreement
becomes a permanent test case.

That discipline, not the algorithms, is what will make this kernel trustworthy enough to charge
money for.
