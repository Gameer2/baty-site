# Number Theory Engine — Phase 1 (completed work)

**Note: `docs/NUMBER_THEORY_ENGINE_PLAN.md` is badly stale.** It states "Status: not started.
No code, no pages, no tests" (dated 2026-07-22), but the engine is actually one of the most
complete on the site. Verified directly against the real files (not the doc) on 2026-07-31.

## Confirmed built and tested

- Backend: `assets/js/number-theory.js` — one monolithic UMD core (~65 functions), `BigInt`
  throughout. Every page confirmed calling into it rather than reimplementing (checked in an
  earlier duplication audit).
- `tests/verify-number-theory.js` — **194 passed, 0 failed** (verified by running it).
- 29 method pages under `engines/number-theory/methods/`, covering all 26 originally planned
  topics:

  Divisibility & Euclid: `divisibility.html`, `euclidean-algorithm.html`,
  `extended-euclidean.html`, `linear-diophantine.html`.
  Primes: `sieve-of-eratosthenes.html`, `prime-factorisation.html`, `primality-testing.html`,
  `distribution-of-primes.html`.
  Congruences: `modular-arithmetic.html`, `linear-congruences.html`,
  `chinese-remainder-theorem.html`, `fermat-euler-theorem.html`, `wilsons-theorem.html`.
  Multiplicative functions: `euler-totient.html`, `divisor-functions.html`,
  `mobius-function.html`.
  Primitive roots: `order-of-element.html`, `primitive-roots.html`, `discrete-logarithm.html`.
  Quadratic residues: `quadratic-residues.html`, `quadratic-reciprocity.html`,
  `jacobi-symbol.html`.
  Cryptography: `modular-exponentiation.html`, `rsa.html`, `diffie-hellman.html`,
  `classical-ciphers.html`.

## Also built: several of the plan's own "recommended additions" (§7)

The plan document itself listed 10 gap items vs. Mathematica's Number Theory catalog, ranked by
payoff. Confirmed shipped:

1. **Continued fractions & convergents** — `continued-fractions.html`.
2. **Pell's equation** (`x² − Dy² = 1`) — `pells-equation.html`.
3. **Modular square roots (Tonelli-Shanks)** — found in `quadratic-residues.js` /
   `number-theory.js`.
4. **Frobenius number / coin problem** — `frobenius-coin.html`.
5. **Liouville's λ(n)** — found in `number-theory.js` (Ω(n)/ω(n) not separately confirmed).
6. **Kronecker symbol** — found in `jacobi-symbol.js`.

## Architecture (established)

- `BigInt` everywhere in `number-theory.js`; conversion to `Number` only at the display layer.
- No CAS/nerdamer dependency — this is the one engine that's pure integer arithmetic, no
  floating-point verify gates needed.
- Every search takes an explicit operation budget, returns `{ok:false, reason, partial}` when
  exhausted rather than running unbounded.
- Certificates over bare answers: e.g. primality returns the witness that proves compositeness,
  not just `false`.
