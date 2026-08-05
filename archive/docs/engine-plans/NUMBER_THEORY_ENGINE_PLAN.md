# Number Theory Engine — Build Plan

Everything needed to start this engine from nothing.

**Status: not started.** No code, no pages, no tests. This document is the plan only.

**Scope of this file:** the Number Theory Engine. Companion: `CURRICULUM_ROADMAP.md` §10 for the
topic list and priorities.

Last updated: 2026-07-22 (first edition).

---

## 1. Textbook basis

**Rosen, *Elementary Number Theory and Its Applications*** — the most widely used US
undergraduate text, cross-checked against Niven, Zuckerman & Montgomery, *An Introduction to the
Theory of Numbers*. Scope is a standard one-semester course: divisibility → primes → congruences
→ multiplicative functions → primitive roots → quadratic reciprocity, with cryptography as the
running application.

---

## 2. The one thing that makes this engine different

**This is the only engine on the site with no floating point, no CAS, and no approximation.**

Every other engine's central risk is numeric drift, and every other engine's verify gate exists
to catch a symbolic result that is quietly wrong by `1e-9` or by a rational approximation of π.
Number theory has none of that. `gcd(48, 180) = 12` is exactly 12, forever. There is no tolerance
parameter anywhere in this engine, and a test asserting exact equality is correct rather than
brittle.

This inverts the architecture in three ways:

1. **No nerdamer, no CAS worker required for correctness.** The algorithms are pure integer
   arithmetic. (A worker is still worth using for *responsiveness* — see §3 — but not for the
   kill-switch reasons that make it mandatory in Calculus.)
2. **`BigInt` is the substrate, not `Number`.** Verified available natively
   (`2n**64n = 18446744073709551616`). RSA with a 512-bit modulus, Fermat/Miller-Rabin on large
   primes, and Carmichael numbers all overflow `Number`'s 2⁵³ exact-integer range immediately.
   **Using `Number` anywhere in this engine is a bug**, and the tests should include a case
   large enough to catch it.
3. **The risk moves from correctness to *termination*.** No algorithm here returns a wrong
   answer; several will run effectively forever on a large input (trial-division factoring of a
   60-digit semiprime). The engine's honesty discipline therefore shifts from "verify the answer"
   to **"bound the work and report when the bound is hit"** — a partial factorisation with
   "stopped after N operations" is a legitimate result, exactly as "this is not a
   u-substitution problem" is in the Calculus Engine.

The second differentiator: **this is the most visual-per-concept engine on the site, and the
visuals are discrete.** Sieve animations, Ulam spirals, modular multiplication circles, and
primitive-root rosettes are all genuinely beautiful and, unlike much of the Lab's plotting,
require no continuous-function machinery at all.

---

## 3. Architecture

Simpler than the other engines, because there is no CAS dependency:

```
engines/number-theory/methods/<method>.html
  └─ assets/js/<method>.js               DOM wiring only
       └─ assets/js/number-theory.js     pure, DOM-free, Node-testable, BigInt throughout
```

**On workers:** not required for correctness, but recommended for the search-heavy methods
(factoring, primitive-root search, large sieves) so the UI stays responsive and the existing
timeout/terminate pattern in `cas-client.js` can cancel a runaway search. Reuse that harness
rather than writing a second one; a second worker file hosting `number-theory.js` alone is
appropriate here since it needs neither nerdamer nor math.js.

### Conventions

- **`BigInt` everywhere** in `number-theory.js`. Convert to `Number` only at the display layer,
  and never for arithmetic.
- **Every search takes an explicit operation budget** and returns `{ok:false, reason, partial}`
  when it is exhausted. No unbounded loops.
- **Deterministic where the textbook is deterministic.** Miller-Rabin with random bases is
  standard, but seed the RNG so a student re-running the same input gets the same witnesses,
  and *show the witnesses* — the witness is the interesting part.
- **Return the certificate, not just the answer.** `isPrime(n) → false` is far less useful than
  "composite, witness `a = 2`, because `2^(n−1) mod n = 137 ≠ 1`". The certificate *is* the
  teaching.

---

## 4. What to reuse

Little, and that is fine — this engine is deliberately self-contained.

| Need | Reuse |
|---|---|
| Page chrome, keypad, KaTeX rendering | `engine-core.js` (`Engine.initChrome`, `renderKatex`) |
| Table + step-slider derivation UI | The `.data-table` + `#stepSlider` pattern used by every method page |
| Worker timeout / terminate / respawn | `cas-client.js` harness (pointed at a new worker) |
| Catalog + method-page structure | `engines/calculus/methods.html` as the template |
| Modular arithmetic in matrices *(optional, later)* | `LinAlg.rref` — Hill ciphers and linear congruence systems mod p |

What it must **not** reuse: `CalculusSymbolic`, nerdamer, or any floating-point helper.
`Algorithms.solveLinear` is Gaussian elimination in doubles and is wrong for modular arithmetic.

---

## 5. Topics and build order

Numbered to match `CURRICULUM_ROADMAP.md` §10.

### Phase 0 — foundation
`assets/js/number-theory.js` with BigInt gcd/modpow/modinv primitives, `tests/verify-number-theory.js`,
the catalog page, and the operation-budget convention. Primitives first because everything else
composes them.

### Phase 1 — divisibility and the Euclidean algorithm *(P0)*
1. **Divisibility & the Division Algorithm** — quotient/remainder, the basic object.
2. **Euclidean Algorithm & GCD** — the step table is the visual; each row is one division.
3. **Extended Euclidean & Bézout** — `gcd(a,b) = ax + by`, back-substitution shown. This is the
   workhorse: modular inverses, linear congruences, CRT, and RSA key generation all need it.
4. **Linear Diophantine Equations** — `ax + by = c`, solvability and the full solution family.

### Phase 2 — primes *(P0)*
5. **Sieve of Eratosthenes** — the animation is the classic, and genuinely good: multiples
   struck out colour by colour.
6. **Prime Factorisation** — trial division, Fermat's method, and Pollard's rho, with the
   operation budget visible. Comparing them on the same semiprime is the lesson.
7. **Primality Testing** — Fermat, Miller-Rabin, with **witnesses shown**; Carmichael numbers
   (561, 1105) as the reason Fermat's test is not enough. A strong "the obvious test is wrong"
   moment.
8. **Distribution of Primes** *(P2)* — `π(x)` against `x/ln x`, prime gaps, the **Ulam spiral**.

### Phase 3 — congruences *(P0)*
9. **Modular Arithmetic** — arithmetic mod `n`, addition/multiplication tables as heatmaps.
10. **Linear Congruences** — `ax ≡ b (mod n)`, solvability via `gcd(a,n) | b`.
11. **Chinese Remainder Theorem** — simultaneous congruences, constructive solution.
12. **Fermat's Little Theorem & Euler's Theorem** — with `φ(n)`; the engines of exponentiation.
13. **Wilson's Theorem** *(P2)*.

### Phase 4 — multiplicative functions *(P1)*
14. **Euler's Totient φ(n)** — multiplicativity, the product formula.
15. **Divisor Functions τ(n), σ(n)** — perfect, deficient, abundant numbers; Mersenne primes.
16. **Möbius Function & Inversion** *(P2)*.

### Phase 5 — primitive roots *(P1)*
17. **Order of an Element** — the multiplicative order, and its divisibility of `φ(n)`.
18. **Primitive Roots** — existence conditions; the **modular rosette** visual (plot `g^k mod n`
    around a circle and connect consecutive powers — a primitive root traces every point).
19. **Discrete Logarithm** *(P2)* — baby-step giant-step; the basis of Diffie-Hellman's security.

### Phase 6 — quadratic residues *(P1)*
20. **Quadratic Residues & Legendre Symbol** — which numbers are squares mod p.
21. **Law of Quadratic Reciprocity** — the deepest theorem in the course; Euler's criterion and
    Gauss's lemma as the computational path.
22. **Jacobi Symbol** *(P2)*.

### Phase 7 — cryptography *(P1 — the application that justifies the course)*
23. **Modular Exponentiation** — fast/binary exponentiation; the step table shows why it is fast.
24. **RSA** — key generation, encrypt/decrypt, and *why* it works (Euler's theorem, from #12).
    Must use real `BigInt` moduli, not toy 2-digit primes, or the point is lost.
25. **Diffie-Hellman Key Exchange** — the shared-secret animation.
26. **Classical Ciphers** *(P3)* — affine and Hill ciphers as congruence applications.

---

## 6. Risks and open questions

- **`Number` overflow is the silent killer.** `2⁵³` is reached fast. Every function must take
  and return `BigInt`, and `tests/verify-number-theory.js` must include at least one case beyond
  `2⁵³` that fails loudly if someone converts to `Number`.
- **Unbounded search is the main failure mode.** Factoring is the obvious one, but primitive-root
  search and discrete log are also exponential in the wrong regime. The operation budget is not
  optional and must be enforced in the pure module, not in the page.
- **RSA must be honest about scale.** A textbook RSA demo with `p = 61, q = 53` teaches the
  mechanics but implies the cipher is breakable-by-hand, which is the wrong intuition. Use
  moduli large enough that the factoring page visibly *fails* to break them within budget —
  that contrast is the actual lesson, and it links Phase 2 #6 to Phase 7 #24.
- **Quadratic reciprocity is a proof, not an algorithm.** The engine can compute Legendre symbols
  and *demonstrate* reciprocity on pairs, but must not imply it has proved it. Be careful with
  the framing.
- **BigInt has no `Math` library.** `sqrt`, `log`, and friends need integer implementations
  (Newton's method for integer square root, bit-length for `log₂`). Write them once, in Phase 0.

---

## 7. Mathematica parity — gap audit (added 2026-07-23)

Cross-referenced against the Wolfram Language Number Theory function catalog
(`reference.wolfram.com/language/guide/NumberTheory.html` and the individual `PrimeQ`/`PowerMod`
reference pages) to find capabilities worth matching or exceeding. Organized by this plan's
existing phases; "GAP" means the current 26-topic list doesn't mention it.

| Mathematica function | What it does | Maps to / status |
|---|---|---|
| `GCD`, `ExtendedGCD` | gcd, and gcd as `ax+by` | Phase 1 #2–3 — covered |
| `Mod`, `QuotientRemainder` | division algorithm | Phase 1 #1 — covered |
| `Reduce`/`FindInstance` over `Integers` | general and particular Diophantine solutions, **including Pell's equation `x²−Dy²=1`** | Phase 1 #4 covers linear Diophantine only — **GAP: Pell's equation** not in the plan at all |
| `FactorInteger` | trial division + Pollard rho + (for large inputs) quadratic sieve/ECM tiers | Phase 2 #6 — covered, but plan only names trial/Fermat/Pollard rho; Mathematica's tiered fallback (small-factor sieve → Pollard rho → ECM for larger factors) is a **GAP**: the "compare methods on the same semiprime" lesson would be stronger with a third, harder tier |
| `PrimeQ` | composite algorithm: trial division by small primes, then a Miller-Rabin base-2 test, then a Lucas pseudoprime test (the standard BPSW combination) — no counterexample is known but it is not a proof | Phase 2 #7 — covered, but the plan's language ("Fermat, Miller-Rabin, with witnesses shown") doesn't mention **BPSW / the Lucas test as a second, independent check** — **GAP**: showing *both* a Miller-Rabin witness AND a Lucas-sequence check side by side is a stronger "why do we combine two different tests" lesson than Miller-Rabin alone |
| `NextPrime`, `PrimePi` | next prime ≥ n; prime-counting function | Phase 2 #8 (`π(x)` vs `x/ln x`) covers `PrimePi`'s role; `NextPrime` as a standalone primality-testing utility is implicit but not named — minor |
| `PrimeOmega`, `PrimeNu`, `LiouvilleLambda` | `Ω(n)` (factors with multiplicity), `ω(n)` (distinct factors), Liouville's `λ(n) = (−1)^Ω(n)` | **GAP** — none are in the plan; natural one-line additions to Phase 4 alongside `τ`/`σ` since they reuse the same factorization |
| `MangoldtLambda` | von Mangoldt function `Λ(n)` | **GAP** — not in the plan; only worth adding if Phase 4 wants to gesture at analytic number theory (prime-counting proofs), otherwise skip — low pedagogical value for a undergrad-level course |
| `EulerPhi` | totient | Phase 4 #14 — covered |
| `DivisorSigma`, `Divisors`, `DivisorSum`, `PerfectNumber` | `σ_k(n)`, divisor list, divisor-indexed sums, perfect-number generation/testing | Phase 4 #15 — covered |
| `MoebiusMu` | Möbius function | Phase 4 #16 — covered |
| `PowerMod[a, -1, m]` | modular inverse via extended Euclid | Phase 1 #3 / Phase 7 #23 — covered |
| `PowerMod[a, 1/r, m]` | **modular r-th roots**, returns unevaluated (i.e. "no solution") when none exists | **GAP** — the plan has modular exponentiation (Phase 7 #23) but not its inverse operation, modular root-finding. Natural pairing with quadratic residues (Phase 6): "is `a` a QR mod p" (#20) is exactly "does a modular square root exist," and computing it (Tonelli-Shanks) is the missing operational half of that topic |
| `ChineseRemainder` | CRT solver; Mathematica's version silently requires/assumes pairwise-coprime moduli | Phase 3 #11 — covered; worth explicitly noting in the build (not the roadmap) that non-coprime moduli should raise a clear "no solution / not pairwise coprime" message rather than silently returning wrong output — a place where being more honest than Mathematica is easy |
| `MultiplicativeOrder`, `PrimitiveRoot` | order of `a` mod `n`; smallest primitive root | Phase 5 #17–18 — covered |
| `JacobiSymbol`, `KroneckerSymbol` | Jacobi symbol (odd `n`); Kronecker symbol generalizes to all integers `n` including even and negative | Phase 6 #22 names Jacobi only — **GAP: Kronecker symbol** as the fully-general version. Low priority (P2 in the plan already for Jacobi; Kronecker only matters once you get to class-number/quadratic-form territory, out of scope for Rosen) |
| `ContinuedFraction`, `FromContinuedFraction`, `Convergents` | regular continued fraction expansion, convergents, and their use in **solving Pell's equation** | **GAP** — entirely absent from the plan. This is the standard bridge topic between the Euclidean algorithm (Phase 1) and Pell's equation, and it's a genuinely good visual (convergent accuracy shrinking, spiral-of-squares style diagrams) |
| `IntegerPartitions`, `PartitionsP`, `PartitionsQ` | partition enumeration/counting | **GAP** — Rosen doesn't emphasize partitions, and Ramanujan-style asymptotics are graduate territory; reasonable to leave out, note explicitly as "considered, out of scope" rather than an oversight |
| `FrobeniusNumber` | largest integer *not* representable as a non-negative combination of given coprime integers ("coin problem") | **GAP** — a fun, concrete extension of linear Diophantine equations (Phase 1 #4) with an accessible visual (a number line with reachable/unreachable points). Small addition, high intuition payoff |
| `SquareFreeQ`, `CoprimeQ` | predicates | Trivial helpers; implicit in Phase 1/4 arithmetic, not worth separate topics |
| `IntegerDigits`, `DigitCount`, `RealDigits` | digit-level utilities | Not number-theoretic content in Rosen's sense (more combinatorics-of-digits); correctly out of scope |
| `AlgebraicNumber`, `GaussianIntegers`, `MinimalPolynomial`, `ToNumberField` | algebraic number theory (rings of integers in number fields, Gaussian integers as a factorization domain) | **GAP**, but explicitly graduate-level / beyond Rosen's scope — correctly excluded, though **Gaussian integers as a *teaser*** (why `5 = (2+i)(2−i)` and primes `≡ 1 mod 4` split) would make an excellent stretch/P3 topic since it recontextualizes Phase 2's prime-factorization visuals in a new ring |
| `DirichletL`, `Zeta`, `ZetaZero`, `LogIntegral` | analytic number theory (L-functions, the Riemann zeta function, PNT error terms) | Out of scope — correctly excluded, this is a different course entirely |

### Recommended additions

Ranked by pedagogical payoff relative to implementation cost:

1. **Continued fractions & convergents** (new topic, Phase 1 or a new Phase 1.5) — natural output of the Euclidean algorithm already being built in Phase 1 #2; unlocks Pell's equation and is a strong standalone visual.
2. **Pell's equation `x² − Dy² = 1`** (new topic, pairs with #1) — the classic capstone of the continued-fraction method; currently entirely missing despite being a standard Rosen/Niven-Zuckerman-Montgomery topic.
3. **Modular square roots (Tonelli-Shanks)** — pairs directly with Phase 6 #20 (Quadratic Residues) as the constructive half of "is it a QR" instead of only the yes/no test.
4. **BPSW-style two-test primality** — extend Phase 2 #7 to show a Miller-Rabin witness *and* an independent Lucas pseudoprime check side by side, matching what `PrimeQ` actually does and reinforcing "no single cheap test is proof."
5. **Frobenius number / coin problem** — small addition to Phase 1 #4 (Linear Diophantine), concrete and visual, low build cost.
6. **`Ω(n)`, `ω(n)`, Liouville's `λ(n)`** — near-free additions to Phase 4 once factorization exists; reinforce the difference between "with multiplicity" and "distinct" that trips students up on `τ`/`σ`.
7. **Third factoring tier for large semiprimes** — extend Phase 2 #6's trial/Fermat/Pollard-rho comparison with one harder method (e.g. Pollard p−1 or a basic quadratic sieve) so the "why RSA is safe" contrast in Phase 7 #24 has a real teeth-gnashing example, not just an operation-budget cutoff.
8. **Explicit non-coprime-moduli error path for CRT** — not a new topic, a correctness note for Phase 3 #11's implementation: fail loudly and explain *why*, rather than mirroring Mathematica's silent behavior.
9. **Gaussian integers as a P3 stretch topic** — reframes Phase 2's factorization visuals in `ℤ[i]`, explaining why some primes split and others don't; good "and here's where it goes next" hook at the end of the course.
10. **Kronecker symbol** as a one-line generalization note on Phase 6 #22's Jacobi symbol, not a separate topic — low cost, mostly a "what if n is even/negative" footnote.
