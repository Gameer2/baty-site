# Antiderivative Strategy — how this site should compute integrals

Written 2026-07-22 in answer to: *"is there a better way to grasp the antiderivatives for
functions?"*

Applies to the Calculus Engine (§2 #6, Techniques of Integration), and to every engine that
consumes it — ODE/PDE (separable, integrating factors, exact equations, variation of
parameters) and Complex Analysis (residues, contour integrals).

---

## 1. What the site does today

`CalculusSymbolic` dispatches four named textbook techniques — `uSubstitution`,
`integrationByParts`, `partialFractions`, `trigSubstitution` — each of which:

1. classifies the integrand structurally,
2. emits the rewrite a textbook would show,
3. hands the reduced integral to nerdamer's `integrate()`,
4. **verifies** by differentiating back / finite differences, and
5. refuses with a reason rather than guessing.

**The shape of this design is right, and §3 below is external evidence for that.** The weakness
is step 3: nerdamer's `integrate()` is an opaque heuristic. When it fails you get nothing; worse,
when it "succeeds" it can return non-elementary junk — `∫e^(y²)dy` yields an `erf(i·y)·i^(-1)`
expression that looks like an answer. The Multiple Integrals verify gate exists precisely to
catch that.

So the question is not *should we replace the architecture* — it is *what should sit behind
step 3*.

---

## 2. The three real options, ranked

### Option A — Complete the rational case properly *(recommended first)*

**Every rational function has an elementary antiderivative, and there is a complete algorithm
to find it.** The standard pipeline (Bronstein, *Symbolic Integration I*, ch. 2) is:

1. **Hermite reduction** — square-free factorise the denominator and reduce to a remainder with
   only simple poles, peeling off the rational (non-logarithmic) part.
2. **Rothstein–Trager** — the remaining logarithmic part comes from the distinct roots of a
   resultant. (**Lazard–Rioboo–Trager** is the more efficient variant, using subresultant
   polynomial remainder sequences.)
3. **Polynomial part** — trivial.

Why this is the best first move here:

- It is **complete for its class**. Today `partialFractions` works when nerdamer's `partfrac`
  works. This would make it work *always*, for every rational function, with no heuristic.
- It is genuinely implementable — a few hundred lines given polynomial arithmetic, which
  `LinAlg.polynomialRoots`, `charPoly`, and the existing `isPolynomialIn` / `splitRational`
  helpers already substantially provide.
- Rational integrands are the **highest-traffic case on the site** — they dominate partial
  fractions, and they are what the ODE engine's integrating factors and the Complex Analysis
  engine's residues mostly produce.
- It removes an entire class of silent failure rather than papering over it.

### Option B — A curated rule-based (Rubi-style) table *(recommended second)*

[Rubi](https://rulebasedintegration.org/) is a decision tree of ~6600 pattern-matching rules.
On a large public test suite it scores **99.76% optimal antiderivatives against Mathematica's
75.37%** — and it frequently returns *dramatically simpler* results than commercial systems.

The critical property for this project is not the score. It is that **every Rubi rule is named
and its applicability condition is explicit.** That is exactly the derivation ladder this site
already renders — a rule-based integrator produces the pedagogy as a by-product, rather than
requiring it to be reconstructed around an opaque answer.

Caveats to be honest about:

- Rubi is implemented in Mathematica's pattern language. **Porting 6600 rules to JS is not
  realistic** and should not be attempted.
- The right move is a **curated subset** — on the order of 100–200 rules covering the standard
  undergraduate corpus (powers, exponentials, logs, the trig and hyperbolic families, products
  with polynomials, the standard radical forms). That is tractable, and it would beat nerdamer
  decisively on exactly the integrals a student actually types.
- Rule-based systems have **no completeness guarantee** — they are strong where rules exist and
  silent where they do not. Hence the verify gate stays, and hence Option A first for the one
  class that *can* be made complete.

### Option C — The Risch algorithm *(not recommended)*

Risch is the theoretical decision procedure: it determines whether an elementary antiderivative
exists and finds it. It is the "right answer" academically.

It is also not a realistic target here:

- **No CAS has a complete implementation**, decades after publication. The full algorithm
  including the algebraic-function case is a research-scale undertaking.
- It handles algebraic functions (`sqrt(x)`, non-integer powers) poorly in practice — precisely
  the cases undergraduates meet constantly.
- It produces an answer, not a *derivation*. A Risch result cannot be rendered as textbook steps,
  which forfeits the entire reason this site exists.

Worth knowing about; wrong tool for this project. Note the interesting middle path that
[SymbolicIntegration.jl](https://sciml.ai/news/2025/10/10/SymbolicIntegration/) takes — Risch
first, rule-based fallback — which is the same layered instinct as §4 below.

---

## 3. External validation of the current design

Two facts worth internalising:

1. **Rubi beating Mathematica by pattern-matching named rules** confirms that a structured
   decision tree of named textbook techniques is not a teaching-only compromise — it is
   *competitive with, and often better than*, general-purpose CAS integration.
2. **Optimality is a real metric.** Rubi's grading is on *how good* the antiderivative is, not
   just whether one was produced. A correct-but-monstrous answer is a poor answer. This site
   should adopt the same standard: prefer the form a textbook would print.

The existing `technique` field returned by every `CalculusSymbolic` integrator — naming which
method succeeded — is precisely the Rubi idea, already present.

---

## 4. Recommended target architecture

A four-layer cascade, tried in order, with the verify gate wrapping all of it:

```
∫ f dx
  │
  ├─ 1. Structural classification  (existing — uSub / by-parts / partial-fractions / trig-sub)
  │       names the technique for the derivation ladder
  │
  ├─ 2. Rational?  -> Hermite reduction + Rothstein-Trager      [Option A]
  │       COMPLETE. never fails on this class.
  │
  ├─ 3. Curated rule table (Rubi-derived, ~100-200 named rules) [Option B]
  │       each hit is a named, displayable step
  │
  ├─ 4. nerdamer integrate()  (last resort, as today)
  │
  └─ VERIFY GATE (existing, unchanged, applied to whatever came back)
          differentiate back / finite differences; on failure return ok:false and NO formula
```

Two rules that must not be relaxed:

- **The gate stays regardless of layer.** Completeness proofs do not survive contact with
  floating-point evaluation, `.simplify()` value-flips (`CALCULUS_ENGINE_PLAN.md` §3), or a
  non-elementary result dressed as an elementary one.
- **A refusal remains a first-class answer.** More capability means fewer refusals, never
  dishonest ones.

---

## 5. Suggested sequencing

| Step | Work | Value |
|---|---|---|
| 1 | Hermite reduction + Rothstein–Trager for rational functions | High — completes the highest-traffic class, removes a whole failure mode |
| 2 | Extract the rule-table layer with ~30 high-frequency rules | Medium — proves the mechanism, immediate wins |
| 3 | Grow the table toward ~150 rules as gaps appear in real use | Incremental |
| 4 | Adopt "optimality" as a test criterion, not just correctness | Cheap, raises answer quality |

**Do not** attempt Risch. **Do not** attempt a full Rubi port.

---

## Sources

- [Rubi — A Rule-based Integrator](https://rulebasedintegration.org/)
- [Rule-based integration: an extensive system of symbolic integration rules (JOSS)](https://www.theoj.org/joss-papers/joss.01073/10.21105.joss.01073.pdf)
- [Rubi integration test problems / grading](https://rulebasedintegration.org/testProblems.html)
- [SymbolicIntegration.jl — Risch + 3400 rules hybrid](https://sciml.ai/news/2025/10/10/SymbolicIntegration/)
- [Rational function integration with the Risch algorithm (Hermite / Rothstein–Trager)](https://docs.sciml.ai/SymbolicIntegration/dev/methods/risch_rational_functions/)
- [Integration of rational functions — SymPy notes](https://asmeurersympy.wordpress.com/2010/06/11/integration-of-rational-functions/)
