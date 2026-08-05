# 03 — Kernel Architecture

## 1. The central insight: one kernel, three engines

Calculus, ODE, and Complex Analysis look like three independent problems. They are not. Their
symbolic requirements converge on **two shared primitives**, and building each once serves all
three.

```
                    ┌──────────────────────────────────────┐
                    │     POLYNOMIAL & RATIONAL ALGEBRA    │
                    │  square-free factorization           │
                    │  polynomial GCD (subresultant PRS)   │
                    │  resultants                          │
                    │  factorization over ℚ                │
                    └──┬──────────────┬──────────────┬─────┘
                       │              │              │
         complete      │  characteristic│    pole      │
         rational      │   polynomials  │  location &  │
       integration     │                │   residues   │
                       ▼              ▼              ▼
                  CALCULUS          ODE          COMPLEX
                       ▲              ▲              ▲
                       │              │              │
                  Taylor,        Frobenius,      Laurent,
                 convergence      series          residues,
                   radii        solutions      singularities
                       │              │              │
                    ┌──┴──────────────┴──────────────┴─────┐
                    │          SERIES MACHINERY            │
                    │   Taylor · Laurent · Puiseux         │
                    │   (Laurent = Taylor + principal part)│
                    └──────────────────────────────────────┘
```

**Concretely.** Build polynomial algebra once and you get, in the same stroke:
- complete rational integration (Hermite + Rothstein–Trager)
- correct partial fractions — fixing the measured repeated-factor bug
- ODE characteristic polynomials (currently a local `charRoots`, degree-2 only)
- **inverse Laplace transforms**, which are dominated by partial-fraction decomposition
- complex pole location and residue computation

Build series once and you get Taylor, convergence radii, Laurent expansions, singularity
classification, Frobenius ODE solutions, and Gruntz-algorithm limits.

**This is the argument for a kernel rather than three patched engines.**

---

## 2. The layer stack

```
  ┌──────────────────────────────────────────────────────────────┐
  │ L5  PEDAGOGY                                                 │
  │     step narration {rule, text, latex} · derivation trees    │  ← the product moat
  ├──────────────────────────────────────────────────────────────┤
  │ L4  VERIFICATION GATE                                        │
  │     differentiate-back · finite differences · substitute-back │  ← already built; keep
  │     refuse-with-reason                                        │
  ├──────────────────────────────────────────────────────────────┤
  │ L3  ALGORITHMS                                               │
  │     integration · ODE families · residues · limits ·          │
  │     series · transforms · polynomial & rational algebra       │
  ├──────────────────────────────────────────────────────────────┤
  │ L2  REWRITE ENGINE                                           │
  │     directed rules · expand/combine/normalize/rationalize     │
  │     rule database · confluence-conscious ordering             │
  ├──────────────────────────────────────────────────────────────┤
  │ L1  ASSUMPTIONS                                              │
  │     positive · real · integer · nonzero · intervals           │  ← cannot be retrofitted
  │     query propagation · branch selection                      │
  ├──────────────────────────────────────────────────────────────┤
  │ L0  EXPRESSION REPRESENTATION                                │
  │     immutable AST · canonical ordering · hash-consing ·       │
  │     structural equality                                       │
  └──────────────────────────────────────────────────────────────┘
                              │
                              │ falls through when unhandled
                              ▼
                   ┌─────────────────────┐
                   │      nerdamer       │  ← shrinks monotonically; never blocks you
                   └─────────────────────┘
```

---

## 3. Layer-by-layer design

### L0 — Expression representation

Everything depends on this, and it is the cheapest thing to get wrong permanently.

**Requirements**
- **Immutable nodes.** No in-place mutation, ever. Rewriting returns new trees.
- **Canonical ordering.** Commutative operands sorted by a total order so that `x+y` and `y+x`
  are the *same object*. This is what makes structural equality meaningful.
- **Hash-consing.** Identical subtrees share one node. Gives O(1) structural equality, cheap
  memoisation, and a large constant-factor win on rewriting.
- **Explicit node kinds.** `Integer`, `Rational`, `Symbol`, `Add`, `Mul`, `Pow`, `Func`. Note
  there is no `Sub` or `Div` — `a−b` is `Add(a, Mul(−1,b))`, `a/b` is `Mul(a, Pow(b,−1))`. Fewer
  cases means fewer bugs.
- **Binder nodes are a separate kind — not `Func`.** ⚠️ `Integral`, `Derivative`, `Limit`, `Sum`,
  `Product` each **bind a variable**, and a binder is not a function of its bound variable. See
  below; getting this wrong is a silent-corruption hazard, not a cosmetic one.
- **Exact arithmetic.** Rationals as numerator/denominator big-integer pairs. Never floats in the
  symbolic core; floats belong only at the numeric-evaluation boundary.

**Why binders cannot be `Func`** — added after the 2026-07-26 plan review

An unevaluated `∫f dx` modelled as `Func('integrate', [f, x])` makes `x` look like a *free* symbol
in the second argument slot. Three things then break, all silently:

| Failure | What happens |
|---|---|
| **Substitution capture** | `subst(∫x·y dx, y → x)` yields `∫x·x dx` — the substituted `x` is captured by the binder. The correct result requires renaming the bound variable first |
| **Hash-consing collision** | `∫f(x)dx` and `∫f(t)dt` are the *same value* and must hash identically (α-equivalence). As `Func` they hash differently, so the memo table misses and structural equality lies |
| **Assumption leakage** | `∫₀^∞ … dx` scopes `x>0` inside the binder only. With `x` free, that assumption escapes into the enclosing expression — exactly the bug class L1 exists to prevent |

**Requirement:** a `Bind` node kind carrying `{head, boundVar, body, …extra}`, with α-equivalence
built into the hash (canonical de Bruijn indexing, or canonical renaming at construction), and
capture-avoiding substitution as the *only* substitution primitive. This is an L0 decision — it
cannot be added later without rehashing every expression ever built.

**Interface sketch**
```
  Expr.add(a, b)        Expr.mul(a, b)       Expr.pow(base, exp)
  Expr.func(name, args) Expr.sym(name)       Expr.int(n)   Expr.rat(p, q)

  Expr.bind(head, boundVar, body, extra)     -- 'Integral' | 'Derivative' | 'Limit' | 'Sum' | ...
  expr.boundVar         -> Expr   (Symbol; free only inside expr.body)
  expr.alphaEquals(other) -> boolean   (implied by .equals — bound-name-independent)

  expr.equals(other)    -> boolean   (O(1) via hash-consing; α-equivalent for binders)
  expr.hash()           -> integer
  expr.kind             -> 'Add' | 'Mul' | 'Pow' | 'Func' | 'Bind'
                         | 'Symbol' | 'Integer' | 'Rational'
  expr.args             -> Expr[]   (frozen)
  subst(expr, from, to) -> Expr     (capture-avoiding, always)
```

**Why not reuse nerdamer's representation:** it is mutable, has no canonical ordering guarantee,
and has no place to hang assumptions. Those three gaps are exactly what L1 and L2 need.

---

### L1 — Assumptions ← **build this first**

The one component that **cannot be retrofitted**. Three independent lines of evidence, all
measured, converge on it:

1. Trig substitution is the worst-performing integration category, because choosing between
   `√(a²−x²)` and `√(x²−a²)` requires knowing whether `x>a`. Measured: `∫x²/√(x²−9)` returns an
   expression containing `sqrt(-9)`.
2. `CURRICULUM_ROADMAP.md` §8 already flags branch cuts as *"a correctness hazard, not a display
   one — a naive log/sqrt silently picks a branch and is wrong by 2πi."* Same root cause.
3. Nerdamer has **no assumptions system at all** — `assume`, `declare`, `setAssumption` are all
   absent. There is nothing to extend.

Retrofitting assumptions into an existing CAS is among the hardest things in the field; SymPy's
assumptions system is one of its most complex subsystems precisely because of this.

**Predicates to support**

*Unary:* `real`, `positive`, `negative`, `nonnegative`, `nonzero`, `integer`, `rational`, `even`,
`odd`, `finite`, plus **interval domains** (`x ∈ (a,b)`).

*Binary (relational) — added after the 2026-07-26 plan review:* `x > y`, `x ≥ y`, `x = y`, `x ≠ y`
where **both sides may be symbolic**.

⚠️ **Unary predicates are not sufficient, and the plan's own motivating example proves it.**
`08_ENGINE_CALCULUS.md` §2 states the requirement as *"choosing between `√(a²−x²)`, `√(a²+x²)` and
`√(x²−a²)` requires knowing the sign and magnitude of **x relative to a**."* That is a relation
between two symbols. A predicate set that can only say `positive(x)` cannot express `x > a`, so it
cannot drive the branch selection this layer exists to drive. Interval domains with symbolic
endpoints (`x ∈ (a,∞)`) are the same requirement in another notation and must be handled by the
same machinery.

**Required behaviours**
- **Query with three-valued logic:** `true` / `false` / `unknown`. Never collapse `unknown` into
  `false` — that is how wrong branches get chosen silently.
- **Propagation:** if `x` is positive then `x²` is positive, `√x` is real, `log x` is real.
- **Relational closure:** transitivity (`x>a` and `a>0` ⟹ `x>0`), sign propagation through `Add`
  and `Mul`, and comparison against literal bounds. This is a small constraint store over a
  difference-logic fragment (`x − y > c`), not a general theorem prover — deliberately, because the
  general problem is undecidable and the undergraduate corpus does not need it.
- **Contradiction detection.** ⚠️ `assume(x, positive)` followed by `assume(x, negative)` must
  **fail loudly at assertion time**, not produce a context that answers `true` to both queries.
  An inconsistent context proves everything, which means every downstream branch selection is
  unsound and no verification gate can catch it — the result differentiates back correctly under
  assumptions that cannot hold. This is the one failure mode in the whole design that L4 cannot
  see, so it must be prevented at the source.
- **Contextual scoping:** an integral over `[3,∞)` implies `x>3` *within that computation*, and
  the assumption is discarded with the scope.
- **Branch selection:** `√(x²)` → `x` when `x>0`, `|x|` when `x` real, unevaluated otherwise.

**Interface sketch**
```
  ctx = Assumptions.create()
  ctx.assume('x', 'positive')
  ctx.assume(Rel.gt('x', 'a'))        -- relational; both sides symbolic
  ctx.assume('a', 'positive')

  ctx.ask('x', 'nonzero')             -> true      (propagated)
  ctx.ask('x', 'positive')            -> true      (transitive: x > a > 0)
  ctx.ask(Rel.gt('x', 0))             -> true
  ctx.ask('x', 'integer')             -> unknown   (NOT false)

  ctx.assume('x', 'negative')         -> THROWS Contradiction: x > a > 0
  ctx.isConsistent()                  -> boolean   (cheap; assert at every scope entry)
  ctx.withScope(() => { ... })        -> temporary assumptions for one computation
```

**Gate:** `√(x²)` returns `x` under `x>0` and `|x|` otherwise; **`√(x²−a²)` selects its branch from
`x>a` with `a` symbolic**; a contradictory assumption set is rejected rather than answered; and
trig-substitution branch selection is driven by assumptions rather than guessing.

---

### L2 — Rewrite engine

Nerdamer has one fixed `simplify()`. A real CAS needs to rewrite in a **chosen direction** — that
is why `log(xy)−log x−log y` fails to reach zero today (measured), and why the same expression is
*corrupted* into `-log(x*y)^2`.

**Directed operations**
| Operation | Direction | Example |
|---|---|---|
| `expand` | products → sums | `(x+1)²` → `x²+2x+1` |
| `factor` | sums → products | `x²+2x+1` → `(x+1)²` |
| `combine` | many terms → one | `log x + log y` → `log(xy)` |
| `separate` | one term → many | `log(xy)` → `log x + log y` *(needs `x,y>0`!)* |
| `normalize` | canonical form | ordering, collecting, rational normal form |
| `rationalize` | clear denominators | `1/x + 1/y` → `(x+y)/(xy)` |

Note that `separate` on logs is **only valid under positivity assumptions** — a direct demonstration
that L2 depends on L1, and that ordering matters.

**Rule sets to implement (Phase 2)**
1. **Inverse-trig composition** — currently 0/4. Finite, well-defined: `cos(asin u)=√(1−u²)`,
   `sin(acos u)=√(1−u²)`, `tan(asin u)=u/√(1−u²)`, `sec(atan u)=√(1+u²)`, and the rest of the table.
   Clears 4 measured integration failures.
2. **Log/exp laws** — with assumption guards.
3. **Trig identities** — Pythagorean, double/half angle, sum-to-product.
4. **Completing the square** — clears 2 measured failures.
5. **Algebraic substitution** (`u=√x`, `u=ⁿ√(ax+b)`) — clears 3 measured failures.

**Design constraint:** rules must be **data, not code**. A rule is `{name, pattern, replacement,
guard, direction}`. This is what lets Phase 5 mechanically import 6,700 Rubi rules, and it is what
lets L5 report *which rule fired* as a derivation step.

---

### L2b — Search control and cost model ← added after the 2026-07-26 plan review

A rewrite engine without a stopping criterion does not terminate, and a rule database without a
selection strategy explores combinatorially. **This was the one genuine hole in the plan:** the only
control specified anywhere was the wall-clock budget of Phase 2c, and a wall clock is a safety net,
not a strategy. A kernel that only stops because it ran out of time is a kernel that returns a
refusal on problems it could have solved.

This is a **Phase 2 deliverable, not a Phase 5 optimisation.** The day `expand` and `factor` both
exist, the engine can loop between them, and something has to decide which direction is progress.

**Four mechanisms, in dependency order**

**1. A complexity metric `cost(e) → ℕ`.** A total order on expressions answering *"is this form
better?"* — the question every simplifier silently assumes it can answer. Weighted node count is
the workable default: leaves cheap, `Add`/`Mul` linear in arity, `Pow` weighted by exponent
complexity, `Func` by a per-head table (a nested radical costs more than a log), unevaluated
binders most expensive of all. Two properties matter more than the exact weights:

- **Deterministic** — required by the determinism target in `02_TARGET_STATE.md` §5.
- **Tie-broken by canonical order**, never by insertion or iteration order, so the same input
  yields the same output across runs and across rule-database growth.

**2. Rewrite scoring and rule indexing.** Rules are indexed by **head symbol** of their pattern,
never scanned linearly — 6,700 Rubi rules make linear scanning quadratic in the worst case
(`12_RISKS.md` R7). Within a bucket, order by specificity (most specific pattern first), then by a
static priority carried in the rule data.

**3. A search strategy with an explicit budget.** Normalization runs to a fixed point under a
**terminating** rule subset (each rule strictly decreases `cost`, or decreases a well-founded
measure — this subset must be confluence-checked, which is what "confluence-conscious ordering" in
the layer diagram means and where it is now defined). Everything outside that subset — bidirectional
rules like expand/factor, and candidate substitutions — runs as **bounded best-first search** keyed
on `cost`, with three limits:

| Limit | Purpose |
|---|---|
| `maxNodes` — expression-size ceiling | Aborts intermediate expression swell before it consumes memory |
| `maxSteps` — rewrite applications | Bounds the search independently of machine speed, so it is *reproducible* where a wall clock is not |
| `deadline` — wall clock (Phase 2c) | The outermost safety net only. Reaching it is a **bug report**, not normal operation |

**4. Abandonment is a refusal, with a reason.** Exceeding any limit produces
`refuse("search budget exceeded", {limit, cost, steps})` — never a partially-simplified expression
presented as an answer. This routes budget exhaustion into the existing L4 safe-failure path.

⚠️ **Expression swell is the classic CAS failure mode** and it is invisible without instrumentation:
intermediate results grow by orders of magnitude while the final answer stays small. `cost(e)` is
therefore also a **benchmark metric** — peak and final expression size per problem, tracked per run
(`05_BENCHMARKS.md` §1). Without it, a rule that quietly doubles intermediate size every phase is
undetectable until it becomes a timeout.

**Gate:** see Phase 2d in `04_BUILD_PHASES.md`.

---

### L3 — Algorithms

The mathematics proper. Detailed per-engine breakdowns live in files 08, 09, and 10.

**Polynomial & rational algebra** (highest leverage — see §1)
- square-free factorization
- polynomial GCD via **subresultant PRS**
- resultants
- factorization over ℚ (Zassenhaus, or Cantor–Zassenhaus mod p with Hensel lifting)
- **factorization over algebraic extensions ℚ(α)** — see the note below
- **Hermite reduction** → **Rothstein–Trager** (or the Lazard–Rioboo–Trager variant) for
  complete rational integration

⚠️ **Factoring over ℚ alone does not deliver the Phase 3 gate** — added after the 2026-07-26 review.
Rothstein–Trager computes `res_x(a − t·b′, b)`, factors *that* resultant, and the roots `tᵢ` it
produces are in general **algebraic numbers, not rationals**. The answer's logarithms are
`Σ tᵢ·log(gcd(a − tᵢb′, b))` with coefficients in ℚ(α). Stopping at ℚ means:

| Input | With ℚ only | With ℚ(α) |
|---|---|---|
| `∫ 1/(x²−2) dx` | resultant irreducible over ℚ → refuse or fall through | `(1/(2√2))·log((x−√2)/(x+√2))` |
| `∫ (x²+1)/(x⁴+1) dx` | unfactorable over ℚ | correct closed form |

Both are undergraduate problems. The Phase 3 gate claims rational integration becomes **provably
closed**, and that claim is false without extension-field arithmetic: what you get instead is
"complete for rational functions whose Rothstein–Trager resultant happens to split over ℚ", which
is neither provable nor a class a student can recognise.

**Required:** arithmetic in ℚ(α) for α a root of a given irreducible polynomial (represented as
`ℚ[t]/⟨m(t)⟩`, with inverses via the extended Euclidean algorithm), plus **Trager's algorithm** for
factoring over that extension via norms and a ℚ-factorization of the norm. The **Lazard–Rioboo–
Trager** variant of Rothstein–Trager is the right choice here precisely because it keeps the
computation in terms of subresultant PRS and avoids constructing the splitting field explicitly —
it reuses machinery already on this list rather than adding a parallel one.

*Scope boundary:* extensions generated by **one** algebraic number, the case rational integration
actually produces. Multiple independent extensions and full algebraic-number-field towers are
outside the corpus and stay outside it (`12_RISKS.md` R2).

**Integration strategy**
```
   ∫ f dx
     │
     ├─ f rational? ──yes──►  Hermite + Rothstein–Trager      COMPLETE — provable
     │
     ├─ Rubi rule tree match? ──hit──►  answer + rule chain as steps
     │
     └─ nerdamer fallback ──►  L4 verification gate ──►  answer, or honest refusal
```

Rational functions get a **provably complete** algorithm. Everything else gets a 6,700-rule tree
with 72,000 tests behind it. Risch becomes long-term enrichment, never a blocker.

**Series** — Taylor, Laurent (= Taylor + principal part), Puiseux.
**Limits** — Gruntz algorithm, built on series. Replaces today's heuristic.
**ODE and PDE families** — table-driven classifiers; see `09_ENGINE_ODE_PDE.md`. PDE is half that
engine (Boyce & DiPrima Ch. 10–11), not an appendix to the ODE work.
**Transforms** — Laplace and inverse; inverse is dominated by partial fractions, so it comes almost
free once polynomial algebra lands.

---

### L4 — Verification gate ← **already built; do not weaken**

This is the most valuable existing asset. It converts a 15% silently-wrong dependency into
refusals, which is why the suite reads 809/809 over a 70%-correct base.

**Mandatory rule: the kernel may never verify itself with its own primitives.**
`verify-calculus.js:198` already embodies this — it uses pure math.js finite differences precisely
because nerdamer's `diff()` is wrong on √(quadratic) forms and would reject correct answers.

| Result type | Verification |
|---|---|
| Antiderivative | differentiate back **and** central-difference check at ≥5 sample points |
| ODE solution | substitute into the original equation; check residual ≈ 0 |
| Limit | numeric approach from both sides |
| Series | truncated partial sum vs. the function on the interval of convergence |
| Residue | numeric contour integral (Simpson) ÷ 2πi |
| Root / eigenvalue | substitute back |

**Failure mode is always: refuse with a reason.** Never return an unverified result.

---

### L5 — Pedagogy

Every result carries `{rule, text, latex}` steps. This already exists (the 6-step derivations) and
is the product differentiator.

**The Rubi synergy:** because Rubi is rule-based, the *rule that fired is the derivation step*.
The technical choice in L3 and the product differentiator in L5 are the same choice. Mathematica's
`Integrate` cannot do this because it is not rule-based.

#### The derivation IR — specified after the 2026-07-26 plan review

"Derivation trees" appeared in the layer diagram and rule provenance was a Phase 2 task, but the
*shape* of a derivation was never decided. Since steps **are** the product, the representation is a
product decision and it belongs here rather than emerging by accident from whatever the first
integration technique happens to return.

**A derivation is a tree, and it is flattened for display — it is not authored as a list.**
The tree is the truth; the numbered list a student reads is a *rendering* of it.

```
  Derivation
    goal      : Expr                    -- what this node set out to compute
    result    : Expr                    -- what it produced
    rule      : { id, name, source }    -- 'rubi:1.2.3' | 'kernel:by-parts' | 'nerdamer:fallback'
    binding   : { pattern var -> Expr } -- how the rule matched; makes the step re-checkable
    context   : AssumptionSet           -- assumptions IN FORCE (see below)
    children  : Derivation[]            -- sub-derivations, in dependency order
    narration : { text, latex }         -- rendered lazily, never the source of truth
```

**Why a tree and not a list:**

| Property | What it buys |
|---|---|
| Sub-derivations nest | `∫u dv` spawns a *separate* `∫v du` derivation. A flat list cannot express "this step required solving another problem", which is exactly what by-parts, substitution and variation of parameters all do |
| Every node is independently checkable | `07_VALIDATION.md` §8's step-chain check becomes a tree walk asserting `numeric(child.result) == numeric(child.goal)` at each node — a wrong step is localised to a node rather than to "somewhere in the chain" |
| **Assumptions are recorded per node** | A step valid only under `x>0` carries that fact. This is what lets the UI state *"valid for x > 0"* instead of silently omitting the condition — and it is how the L1 contradiction check gets a second, after-the-fact audit |
| Provenance survives to the UI | `rule.source` distinguishes a Rubi rule, a kernel algorithm, and a nerdamer fallback. **Fall-through rate becomes computable from the derivation itself** rather than needing separate instrumentation |
| Nodes collapse for display | An expert wants six steps; a struggling student wants sixteen. Same tree, two renderings. Impossible from a pre-flattened list |

**Reversibility is not a requirement.** The critique that prompted this section asked for reversible
steps; that is a stronger property than needed and it constrains rule authoring for no product
benefit. What is actually required is that each node be **independently re-checkable** —
`numeric(goal) == numeric(result)` at sample points — which is weaker, always achievable, and
already the discipline in `07_VALIDATION.md` §8.

**Narration renders from the tree; it is never the source of truth.** `text` and `latex` are
derived from `{rule, binding, goal, result}` at display time. Storing prose as the primary record is
how step data rots into something unverifiable — and the machine-checkability of steps is the claim
the whole product rests on.

---

## 4. Migration: strangler fig

**Never rewrite in place.** Each capability implemented in L0–L3 stops falling through to nerdamer.
Nerdamer's share shrinks monotonically and reaches zero on its own schedule.

```
  Phase 1        Phase 3            Phase 5          Phase 7
  ┌──────┐      ┌──────┐          ┌──────┐         ┌──────┐
  │kernel│      │kernel│          │kernel│         │kernel│
  │  5%  │      │ 35%  │          │ 80%  │         │ 100% │
  ├──────┤      ├──────┤          ├──────┤         └──────┘
  │nerd. │      │nerd. │          │nerd. │
  │ 95%  │      │ 65%  │          │ 20%  │
  └──────┘      └──────┘          └──────┘
```

**Properties this buys you**
- Working software at every commit — never mid-rewrite
- A kernel bug degrades to a **refusal** (L4 catches it), never a wrong answer to a student
- Progress is measurable as *fall-through rate*, printed by the benchmark harness
- You can stop at any phase and still have a better product than you started with

---

## 5. Where the kernel sits in the running system

```
   33 method pages  ·  129 non-CAS modules      (unchanged, forever)
                        │
                        ▼
              ┌───────────────────┐
              │   cas-client.js   │   Promise-based, timeout, {id, op, args}
              └─────────┬─────────┘   ← THE SEAM (already exists, line 101)
                        │
          ┌─────────────┴─────────────┐
          │                           │
    Web Worker                   fetch() → server        ← Phase 8 swaps this
          │                           │
          ▼                           ▼
   ┌──────────────────────────────────────┐
   │  KERNEL  L0 → L5                     │
   │  falls through to nerdamer as needed  │
   └──────────────────────────────────────┘
```

**The seam already exists and is already async.** Swapping `postMessage` for `fetch()` is contained
to `cas-client.js`, and none of the 129 modules notice. This is the single luckiest fact about the
current architecture — it makes the server-side move (required for kernel secrecy) cheap.

**Decide the client/server split before Phase 1 ships.** Retrofitting a network boundary onto a
kernel that assumes local synchronous calls is painful; deciding now costs nothing.
