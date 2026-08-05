# 06 — Data Sources

Everything you need falls into four categories. **Licence is a hard gate on every row**, because
the product is closed-source and commercial.

| Category | Question it answers |
|---|---|
| A — Algorithms | *How do I implement this?* |
| B — Test corpora | *How do I know it works?* |
| C — Curriculum | *What must I cover?* |
| D — Cross-validation | *Who else can I check against?* |

---

## 1. Licence gate — read this first

| Licence | Closed-source commercial use | Obligation |
|---|---|---|
| **MIT** | ✅ Yes | Retain copyright notice in source |
| **Modified/3-clause BSD** | ✅ Yes | Retain copyright notice |
| **Apache 2.0** | ✅ Yes | Retain notice; patent grant included |
| **CC-BY** | ✅ Yes | Attribute |
| **GPL** | ⚠️ **No** — for distributed code | Would force you to open-source derivatives |
| **CC BY-NC** | ⚠️ **No** | NonCommercial forbids your use case outright |

### The distribution nuance

MIT/BSD/GPL obligations trigger on **distribution**, not use. Two consequences:

- **While this stays on your device, essentially nothing triggers.** You are clear today.
- **A server-side kernel is never "distributed"** — this is the well-known SaaS gap that motivated
  the AGPL. Technically GPL code could run server-side without triggering obligations.

⚠️ **Do not rely on that gap.** It is legally delicate, it silently poisons any future desktop or
offline app, and with Rubi (MIT), SymPy (BSD), and FriCAS (BSD) all permissive, **you never need
GPL code.** Stay clean.

### Housekeeping debt

`assets/vendor/math.min.js`, `gsap.min.js`, and `three.min.js` each reference a `*.LICENSE.txt`
file that is **not present** in `assets/vendor/`. Harmless while private; **fix before anything
ships**, since MIT/Apache both require the notice to travel with the code.

---

## 2. Category A — Algorithms

### The three books that matter

| Book | What you get | Used in |
|---|---|---|
| **Bronstein, *Symbolic Integration I: Transcendental Functions*** | The Risch algorithm and its precursors. **Many algorithms given in pseudocode ready for immediate implementation** | Phase 3 (Hermite, Rothstein–Trager), later Risch |
| **Geddes, Czapor & Labahn, *Algorithms for Computer Algebra*** | GCDs, resultants, factorization, normal forms — the kernel primitives | Phase 3 |
| **Cohen, *Computer Algebra and Symbolic Computation* (2 vols)** | Expression representation, canonical simplification, rewrite systems | **Phase 1 and 2 — read this first** |

Bronstein is the standard reference for symbolic integration and is explicitly written for
implementers. Geddes et al. is the standard CAS-construction text. Cohen is the one that maps
directly onto your first two phases, so it is the one to start with.

Supplementary: von zur Gathen & Gerhard, *Modern Computer Algebra* (complexity and fast
algorithms — useful when performance matters, not before).

### Reference implementations you may legally read and adapt

| Source | Licence | Why |
|---|---|---|
| **FriCAS** | modified BSD | Contains **Bronstein's own Risch implementation** — the most complete anywhere. Descends from Axiom, re-released under BSD in 2001 |
| **SymPy** | modified BSD | Readable Python; good reference for assumptions, series, `dsolve` family dispatch |
| **Maxima** | **GPL** | ⚠️ Do not read with intent to copy. Use SymPy or FriCAS instead |

---

## 3. Category B — Test corpora

### Rubi — the single most valuable asset

| Property | Value |
|---|---|
| Licence | **MIT** ✅ |
| Rules | **6,700+**, organised as a decision tree on integrand form |
| Test problems | **72,000+** |
| Home | [rulebasedintegration.org](https://rulebasedintegration.org/) · [GitHub](https://github.com/RuleBasedIntegration/Rubi) |

**Two reasons this decides the plan:**

1. **Coverage without Risch.** 6,700 rules get you to high coverage in months rather than the years
   a full Risch implementation would take.
2. **Rule-based means every rule application *is* a derivation step.** Mathematica's `Integrate` is
   a black box that emits an answer. Rubi tells you which rule fired, with a literature reference.
   *That is exactly your product differentiator, available under MIT.*

The technical choice and the product choice are the same choice. This is the highest-leverage
decision in the document.

**How to use it**
- Import the 72,000 problems as the integration corpus in Phase 0 — *before* writing kernel code
- Filter to the subset matching `CURRICULUM_ROADMAP.md` §2; **that subset defines "done"**
- In Phase 5, translate rules from Rubi's Mathematica notation into your L2 rule-data format
- Port subtree by subtree, gated by coverage — partial ports are immediately useful

⚠️ The repository's MIT licence covers the package; the rule notebooks cite published literature
(Gradshteyn–Ryzhik and others). You are implementing *mathematics*, which is not copyrightable —
but retain the MIT notice, and cite rule provenance in your step output. Citing sources is also
better pedagogy.

### Other corpora

| Source | Licence | Contents | Use |
|---|---|---|---|
| **SymPy test suite** | modified BSD ✅ | ODEs, series, limits, matrices, integrals | ODE + general corpus |
| **FriCAS test suite** | modified BSD ✅ | Deep integration, special functions | Complex + hard integration |
| **Maxima test suite** | **GPL** ⚠️ | Large and mature | **Avoid** — unnecessary given the above |
| **Your own regression corpus** | yours | Every bug ever found | **Grows forever; never prune** |

---

## 4. Category C — Curriculum scope

Defines the corpus boundary — what "closed" actually means.

| Source | Licence | Use |
|---|---|---|
| **OpenStax** (Calculus 1–3, Statistics, Algebra) | **CC-BY** ✅ | Full sequences; commercial-friendly |
| **Textbook tables of contents** — Stewart, Boyce & DiPrima, Churchill & Brown, Burden & Faires | facts | ✅ **Topic lists are facts, not copyrightable.** The prose is |
| Your own `CURRICULUM_ROADMAP.md` | yours | ✅ Already the authoritative scope document |
| **MIT OCW** | **CC BY-NC**-SA | ⚠️ **NonCommercial — read for orientation, never ingest** |
| Paul's Online Math Notes | personal-use terms | ⚠️ Read only |

Your roadmap already names the textbook basis per engine (Boyce & DiPrima for ODE, Churchill &
Brown for complex, Stewart for calculus). **That mapping is the corpus specification** — you have
already done this work.

---

## 5. Category D — Cross-validation

| Approach | How | Notes |
|---|---|---|
| **Differential testing** | Run each problem through your kernel, SymPy, and FriCAS; compare | Disagreement flags a bug in *someone* — adjudicate numerically |
| **Numeric adjudication** | Finite differences settle every disagreement | Ground truth that shares no code with any CAS |
| **Metamorphic testing** | `d/dx(∫f dx) = f` must hold regardless of which system is right | See `07_VALIDATION.md` §4 |

⚠️ **Do not bulk-query the Wolfram Alpha API to build a corpus.** It violates their terms of
service and creates real legal exposure for a commercial product. You do not need it — Rubi's
72,000 problems already ship with expected answers.

---

## 6. Acquisition order

Matched to `04_BUILD_PHASES.md`:

| When | Get | For |
|---|---|---|
| **Now (Phase 0)** | Rubi corpus; SymPy + FriCAS test suites | Baseline measurement |
| **Now** | Cohen, *Computer Algebra and Symbolic Computation* | Phases 1–2 design |
| Phase 3 | Bronstein ch. 1–2; Geddes ch. 7–8 | Hermite, Rothstein–Trager, GCD |
| Phase 3 | FriCAS source — rational integration | Reference implementation |
| Phase 4 | SymPy `series/`, Gruntz's thesis | Series and limits |
| Phase 5 | Rubi rule notebooks | The rule port |
| Phase 6 | Boyce & DiPrima; SymPy `solvers/ode/` | ODE families |
| Phase 7 | Churchill & Brown; FriCAS complex | Branch cuts, residues |

**Start with Rubi and Cohen.** Rubi makes progress measurable this week; Cohen tells you how to
build the two layers that everything else depends on.

---

## 7. Licence ledger — maintain this

Keep a running table in the repo of every third-party source touched, its licence, and where it is
used. For a closed-source commercial product this is not bureaucracy — it is the document that
answers an acquirer's or a lawyer's first question.

| Source | Licence | Where used | Notice retained? |
|---|---|---|---|
| nerdamer-prime | MIT | `assets/vendor/nerdamer.min.js` | ⚠️ verify |
| math.js | Apache 2.0 | `assets/vendor/math.min.js` | ❌ **LICENSE.txt missing** |
| GSAP | custom | `assets/vendor/gsap.min.js` | ❌ **LICENSE.txt missing** |
| three.js | MIT | `assets/vendor/three.min.js` | ❌ **LICENSE.txt missing** |
| Plotly | MIT | `assets/vendor/plotly-cartesian.min.js` | ✅ present |
| KaTeX | MIT | `assets/vendor/katex.min.js` | ⚠️ verify |
| Rubi | MIT | *(planned — Phase 0/5)* | — |
| SymPy corpus | BSD | *(planned — Phase 0)* | — |
| FriCAS | BSD | *(planned — Phase 3)* | — |
