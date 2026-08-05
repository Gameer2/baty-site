# 02 — Target State

## The goal in one sentence

A **proprietary, server-hosted symbolic kernel** that is *closed over a defined corpus* of
undergraduate mathematics, exposed through a web/app product whose differentiator is **verified,
step-by-step derivations** — not raw CAS breadth.

---

## 1. Replacing "complete" with "closed over a corpus"

The stated ambition was a *complete* symbolic algebra system and a *complete* differential
equation solver. That word has to go, and the reason is technical, not motivational.

**Complete symbolic integration means the Risch algorithm.** Its full description runs to more
than 100 pages, it was only ever *almost* fully implemented (by Bronstein, in Scratchpad/Axiom),
and it is not completely implemented in any current system after fifty years of effort. The same
is true of "complete" ODE solving: SymPy, Maple, and Mathematica all handle *families*, never the
general case, because the general case is undecidable in the relevant sense.

So "complete" is not a target you can ever declare finished — which makes it useless as a goal.

**Corpus closure is the replacement.** Enumerate every problem type the three engines must handle,
turn that enumeration into a machine-runnable test corpus, and drive coverage to 100% *of that
corpus*. This is:

- **Finite** — the corpus has a known size
- **Measurable** — coverage is a number you can print today
- **Honest** — 100% means "everything I promised", not "everything that exists"
- **Defensible** — a student's syllabus is a corpus; a competitor's marketing claim is not

You already think this way: `verify-calculus.js` is a corpus and it reads 809/809.

## 2. Explicit non-goals

| Non-goal | Why |
|---|---|
| Broader than Mathematica | 37 years, large paid team, decades per specialised area. Breadth is not the fight |
| A complete Risch implementation | Years of work; Rubi (§06) gets you most of the value in months |
| Client-side kernel | Anything shipped to a browser is recoverable; see `11_PROTECTION.md` |
| Supporting arbitrary user-defined mathematics | The corpus defines the boundary. Outside it, refuse honestly |
| Beating any CAS on raw speed | Correctness and explanation are the product; milliseconds are not |

## 3. The competitive position

Mathematica gives **answers**. It does not explain, and when it silently picks a branch it does not
tell you. Wolfram sells step-by-step solutions as a *separate paid tier* precisely because the core
product does not do it.

Your engine already does two things Mathematica does not:

1. **Six-step narrated derivations** with `rule`, `text`, and `latex` per step — pedagogy as a
   first-class output.
2. **A verification gate that refuses rather than lies.** Raw nerdamer is 15% silently wrong; your
   layer turns that into refusals. *A system that says "I cannot do this" is pedagogically superior
   to one that hands a student confident garbage.*

**The winnable position is not "a better Mathematica." It is the CAS that shows its work and can
prove it is right.** Narrower than Wolfram, deeper where students actually get stuck, web-native,
at a fraction of the price.

This also explains the Rubi decision in `06_DATA_SOURCES.md`: a rule-based integrator produces
derivation steps as a *byproduct* of how it works. The technical choice and the product
differentiator are the same choice.

---

## 4. Definition of done, per engine

### Calculus
- 100% coverage of the Rubi corpus subset matching the syllabus in `CURRICULUM_ROADMAP.md` §2
- Every rational function integrates correctly — this class is **provably closed** (Hermite +
  Rothstein–Trager)
- Every technique emits verified steps; refusals carry a reason naming the correct technique
- All 22 existing method pages continue to work unchanged through the same API

### Differential Equations
- All Boyce & DiPrima Ch. 1–11 solution families classified and solved **with steps**:
  separable, linear, exact, homogeneous, Bernoulli, reduction of order, constant-coefficient
  (all three root cases), undetermined coefficients, variation of parameters, Laplace
  (incl. step/impulse/convolution), systems via eigenvalues, series/Frobenius
- PDE via separation of variables: heat, wave, Laplace on standard domains
- Every solution verified by substitution back into the original equation

### Complex Analysis
- Churchill & Brown one-semester scope
- **Branch cuts correct by construction, not by luck** — driven by assumptions, never guessed
- Laurent series with correct principal part; singularity classification
- Residues and the residue theorem, including real integrals by residues (`∫₀^∞ dx/(1+x²)`)
- Conformal and Möbius mappings

---

## 5. Non-functional targets

| Property | Target | Why |
|---|---|---|
| **Correctness** | Zero silently-wrong answers reaching a user | The verification gate is mandatory, not optional |
| **Honesty** | Every refusal names a reason and, where possible, the right technique | A refusal that teaches is still a good outcome |
| **Explanation** | Every result carries `{rule, text, latex}` steps | This is the product |
| **Determinism** | Same input → same output, always | Required for regression testing |
| **Latency** | < 300 ms typical for a server round trip | Beyond this, the interaction stops feeling live |
| **Secrecy** | Kernel source never reaches a client | Trade-secret status depends on it |
| **Testability** | Every kernel component runnable headless in Node | Preserve the existing `verify-*.js` discipline |

---

## 6. The migration contract

The kernel replaces nerdamer **behind an unchanged API**. The 24 `CalculusSymbolic` entry points,
10 `ODESymbolic` entry points, and 4 `ComplexSymbolic` entry points listed in `01_CURRENT_STATE.md`
are the contract.

As long as those signatures and return shapes hold:

- The other **129 JS modules never change**
- The 33 method pages never change
- The existing `verify-*.js` suites keep working and act as the regression net for the rewrite

**This is what makes an incremental rewrite possible instead of a rewrite-and-pray.**

---

## 7. What "finished" looks like

```
  ┌────────────────────────────────────────────────────────┐
  │  node tests/bench/baseline.js                          │
  │                                                        │
  │  Integration corpus (Rubi subset)   4,812/4,812  100%  │
  │  ODE corpus (Boyce & DiPrima)         318/318    100%  │
  │  Complex corpus (Churchill & Brown)   204/204    100%  │
  │  Silently wrong answers                     0            │
  │  Refusals with a stated reason             all           │
  │  Kernel fall-through to nerdamer            0            │
  └────────────────────────────────────────────────────────┘
```

Corpus sizes above are illustrative — they are set in `05_BENCHMARKS.md` once the corpora are
imported. The shape is the point: **three numbers, all at 100%, and a zero in the wrong-answer
row.**
