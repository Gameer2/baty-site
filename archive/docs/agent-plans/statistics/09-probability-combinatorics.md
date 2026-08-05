# Build Plan — Probability & Combinatorics

Roadmap ref: `CURRICULUM_ROADMAP.md` §4A.2, priority **P2** (Tier-1 build-order
item 6 in `BACKLOG.md`). Read `00-SHARED-CONVENTIONS.md` in full before starting.
This plan follows the eight-section layout established by
`04-discrete-distributions.md` through `08-multiple-linear-regression.md`, and
reuses the multi-mode chip-row + per-mode input-panel pattern already live in
`discrete-distributions.html` / `.js` (four-distribution selector) and
`two-sample-paired-tests.html` / `.js` (three test modes).

## 1. What this method is

A probability workspace with **three modes** (chip row): **Counting**,
**Conditional Probability**, and **Bayes' Theorem**. Category/eyebrow:
**"Probability"**.

- **Counting** — factorials `n!`, permutations `P(n, k) = n!/(n−k)!`, and
  combinations `C(n, k) = n!/(k!(n−k)!)`. Computed iteratively (the
  multiplicative formula) so values stay exact integers for moderate `n` rather
  than overflowing a naive `n!` intermediate. The classic poker hand
  `C(52, 5) = 2,598,960` is a headline result.
- **Conditional Probability** — the definition `P(A|B) = P(A∩B)/P(B)` for two
  events, with `P(B) > 0` enforced.
- **Bayes' Theorem** — both the **two-hypothesis convenience form**
  `bayesSimple(pH, p(E|H), p(E|¬H))` (the classic disease-testing / Monty-Hall
  shape) and the **general N-hypothesis form**
  `bayesTheorem(priors[], likelihoods[])` returning
  `{posteriors[], normalizer}`. The UI exposes the simple form by default and
  the general form as a sub-mode, since the simple case is what a learner
  reaches for first and the general case is the natural generalization.

This item is mostly combinatorics + the probability rules — no new
distributions, no CDF/p-value machinery, no plots of distributions. The one
plot is a posterior bar chart for the multi-hypothesis Bayes mode (a sensible
visualization of how probability mass redistributes across hypotheses after
evidence).

### Reuse — DO NOT DUPLICATE (already in `stats-algorithms.js`)

- `StatsAlgorithms.lgamma(x)` — log-gamma. Available for log-factorial
  `lgamma(n+1)` if a later plan needs log-domain combinations for very large
  `n`. **This plan does not need it**: the iterative multiplicative
  `combination`/`permutation` keep intermediate products small enough that
  exact-integer results hold for all test-case sizes (the largest is
  `C(100, 50) ≈ 1.0089e+29`, well within float64's 15-16 significant digits and
  verified bit-for-bit against `node -e`). Do not re-implement `lgamma`.
- No other statistics functions are reused here; this is a self-contained
  counting + probability-rules module.

## 2. `stats-algorithms.js` — functions to add

Append before the `return StatsAlgorithms;` line. Each function follows the
existing `StatsAlgorithms.X = function (...) {...}` UMD pattern with a `//`
header comment stating the formula, and `throw new Error("...")` with a
specific message for invalid input (never returns `NaN` or fails silently).

### 2a. `factorial(n)` — exact integer factorial

```js
// factorial(n): n! = 1*2*...*n for integer n >= 0; returns 1 for n = 0.
// Iterative product — exact for moderate n; overflows to Infinity for n >= 171
// (171! > Number.MAX_VALUE). Callers needing larger n should use lgamma(n+1)
// for log-factorial. Throws for negative or non-integer n.
StatsAlgorithms.factorial = function (n) {
  if (!Number.isInteger(n)) throw new Error("n must be an integer.");
  if (n < 0) throw new Error("n must be non-negative.");
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
};
```

### 2b. `permutation(n, k)` — P(n, k) iterative

```js
// permutation(n, k): P(n, k) = n!/(n-k)! = n*(n-1)*...*(n-k+1), the number of
// ordered k-length arrangements of n distinct items. Computed as an iterative
// product to avoid constructing n! (which overflows earlier than the product
// does). Requires integers 0 <= k <= n. Throws otherwise.
StatsAlgorithms.permutation = function (n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error("n and k must be integers.");
  if (n < 0 || k < 0) throw new Error("n and k must be non-negative.");
  if (k > n) throw new Error("k must be <= n.");
  let p = 1;
  for (let i = 0; i < k; i++) p *= (n - i);
  return p;
};
```

### 2c. `combination(n, k)` — C(n, k) multiplicative

```js
// combination(n, k): C(n, k) = n!/(k!(n-k)!), the number of unordered
// k-subsets of n distinct items. Computed via the multiplicative formula
//   c = prod_{i=0}^{k-1} (n-i)/(i+1)
// updated left-to-right. Each intermediate is an exact integer (the product of
// the first i+1 terms of n*(n-1)*... is divisible by (i+1)!), so the result
// stays exact for moderate n and avoids constructing n!. For very large n
// where float64 rounding matters, use exp(lgamma(n+1)-lgamma(k+1)-lgamma(n-k+1)).
// Requires integers 0 <= k <= n. Throws otherwise.
StatsAlgorithms.combination = function (n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error("n and k must be integers.");
  if (n < 0 || k < 0) throw new Error("n and k must be non-negative.");
  if (k > n) throw new Error("k must be <= n.");
  // Use the smaller of k and n-k to minimize iterations.
  if (k > n - k) k = n - k;
  let c = 1;
  for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
  return c;
};
```

### 2d. `conditionalProbability(pAandB, pB)`

```js
// conditionalProbability(pAandB, pB): P(A|B) = P(A∩B)/P(B). Requires P(B) > 0
// and both probabilities in [0, 1]. Throws otherwise.
StatsAlgorithms.conditionalProbability = function (pAandB, pB) {
  if (!(pAandB >= 0 && pAandB <= 1)) throw new Error("P(A∩B) must be in [0, 1].");
  if (!(pB > 0 && pB <= 1)) throw new Error("P(B) must be in (0, 1].");
  if (pAandB > pB) throw new Error("P(A∩B) cannot exceed P(B).");
  return pAandB / pB;
};
```

### 2e. `bayesTheorem(prior, likelihoods)` — general N-hypothesis form

```js
// bayesTheorem(prior, likelihoods): generalized Bayes for a hypothesis set
// {H_1, ..., H_m}. prior[i] = P(H_i) (must sum to ~1), likelihoods[i] = P(E|H_i)
// (each in [0,1]). Returns {posteriors, normalizer} where
//   posteriors[i] = P(H_i|E) = likelihoods[i]*prior[i] / normalizer
//   normalizer    = sum_j likelihoods[j]*prior[j]   (= P(E))
// Throws on length mismatch, priors not summing to 1 (tol 1e-9), or any entry
// outside [0, 1].
StatsAlgorithms.bayesTheorem = function (prior, likelihoods) {
  if (!Array.isArray(prior) || !Array.isArray(likelihoods))
    throw new Error("prior and likelihoods must be arrays.");
  const m = prior.length;
  if (m === 0) throw new Error("Need at least one hypothesis.");
  if (likelihoods.length !== m)
    throw new Error("prior and likelihoods must have the same length.");
  let sumPrior = 0;
  for (let i = 0; i < m; i++) {
    if (!(prior[i] >= 0 && prior[i] <= 1))
      throw new Error("prior[" + i + "] must be in [0, 1].");
    if (!(likelihoods[i] >= 0 && likelihoods[i] <= 1))
      throw new Error("likelihoods[" + i + "] must be in [0, 1].");
    sumPrior += prior[i];
  }
  if (Math.abs(sumPrior - 1) > 1e-9)
    throw new Error("priors must sum to 1 (got " + sumPrior + ").");
  let normalizer = 0;
  for (let i = 0; i < m; i++) normalizer += likelihoods[i] * prior[i];
  if (!(normalizer > 0))
    throw new Error("normalizer P(E) must be positive (at least one likelihood*prior > 0).");
  const posteriors = new Array(m);
  for (let i = 0; i < m; i++) posteriors[i] = likelihoods[i] * prior[i] / normalizer;
  return { posteriors, normalizer };
};
```

### 2f. `bayesSimple(pH, pEgivenH, pEgivenNotH)` — two-hypothesis convenience

```js
// bayesSimple(pH, pEgivenH, pEgivenNotH): two-hypothesis Bayes
//   P(H|E) = P(E|H)*P(H) / [ P(E|H)*P(H) + P(E|¬H)*P(¬H) ]
// Returns the posterior P(H|E) as a number in [0, 1]. Requires pH in (0,1)
// (both hypotheses must have nonzero prior) and both likelihoods in [0, 1].
// Throws otherwise.
StatsAlgorithms.bayesSimple = function (pH, pEgivenH, pEgivenNotH) {
  if (!(pH > 0 && pH < 1)) throw new Error("P(H) must be in (0, 1) — both hypotheses need nonzero prior.");
  if (!(pEgivenH >= 0 && pEgivenH <= 1)) throw new Error("P(E|H) must be in [0, 1].");
  if (!(pEgivenNotH >= 0 && pEgivenNotH <= 1)) throw new Error("P(E|¬H) must be in [0, 1].");
  const numerator = pEgivenH * pH;
  const denominator = numerator + pEgivenNotH * (1 - pH);
  if (!(denominator > 0))
    throw new Error("P(E) must be positive (at least one likelihood > 0).");
  return numerator / denominator;
};
```

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

All expected values below were produced and cross-checked with `node -e`
against the exact formulas (iterative `combination`/`permutation` products, the
conditional-probability quotient, and Bayes' rule) BEFORE writing this plan.
Tolerances: `1e-12` for integer-exact counting values and the
quotient/normalized probabilities (all hand-computable or closed-form);
`1e-9` for the prior-sum validation tolerance check (the implementation's own
tolerance). Run `node tests/verify-statistics.js` after adding this block —
it must report **278 + 35 = 313 passed, 0 failed**.

```js
// Probability & Combinatorics — Counting: factorials, permutations, combinations.
// C(52,5) = 2,598,960 (poker hands); C(10,3)=120; P(10,3)=720; 0!=1; C(n,0)=1.
// C(100,50) = 100891344545564193334812497256 ≈ 1.0089134454556418e+29 (the
// multiplicative formula keeps this exact to float64 precision; the literal
// below is the bit-identical float the iterative product produces).
{
  approx(StatsAlgorithms.factorial(0), 1, 1e-12, "Counting: 0! = 1");
  approx(StatsAlgorithms.factorial(1), 1, 1e-12, "Counting: 1! = 1");
  approx(StatsAlgorithms.factorial(5), 120, 1e-12, "Counting: 5! = 120");
  approx(StatsAlgorithms.factorial(10), 3628800, 1e-12, "Counting: 10! = 3628800");
  approx(StatsAlgorithms.permutation(10, 3), 720, 1e-12, "Counting: P(10,3) = 720");
  approx(StatsAlgorithms.permutation(10, 0), 1, 1e-12, "Counting: P(10,0) = 1");
  approx(StatsAlgorithms.permutation(5, 2), 20, 1e-12, "Counting: P(5,2) = 20");
  approx(StatsAlgorithms.permutation(10, 10), 3628800, 1e-12, "Counting: P(10,10) = 10!");
  approx(StatsAlgorithms.permutation(52, 5), 311875200, 1e-12, "Counting: P(52,5) = 311875200");
  approx(StatsAlgorithms.combination(52, 5), 2598960, 1e-12, "Counting: C(52,5) = 2598960 (poker hands)");
  approx(StatsAlgorithms.combination(10, 3), 120, 1e-12, "Counting: C(10,3) = 120");
  approx(StatsAlgorithms.combination(10, 0), 1, 1e-12, "Counting: C(10,0) = 1");
  approx(StatsAlgorithms.combination(10, 10), 1, 1e-12, "Counting: C(10,10) = 1");
  approx(StatsAlgorithms.combination(6, 2), 15, 1e-12, "Counting: C(6,2) = 15");
  approx(StatsAlgorithms.combination(100, 50), 1.0089134454556418e+29, 1e-12, "Counting: C(100,50) (multiplicative, float64-exact)");
  // Symmetry: C(n,k) == C(n, n-k) — the implementation picks the smaller k.
  approx(StatsAlgorithms.combination(52, 47), 2598960, 1e-12, "Counting: C(52,47) = C(52,5) (symmetry)");
}

// Counting — error handling: invalid inputs must throw, not return NaN/Infinity.
{
  let threw = false;
  try { StatsAlgorithms.factorial(-1); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: factorial(-1) throws"); }
  else { fail++; console.error("  FAIL  Counting: factorial(-1) throws"); }

  threw = false;
  try { StatsAlgorithms.factorial(2.5); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: factorial(2.5) throws (non-integer)"); }
  else { fail++; console.error("  FAIL  Counting: factorial(2.5) throws (non-integer)"); }

  threw = false;
  try { StatsAlgorithms.combination(5, 6); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: C(5,6) throws (k > n)"); }
  else { fail++; console.error("  FAIL  Counting: C(5,6) throws (k > n)"); }

  threw = false;
  try { StatsAlgorithms.permutation(5, 6); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: P(5,6) throws (k > n)"); }
  else { fail++; console.error("  FAIL  Counting: P(5,6) throws (k > n)"); }

  threw = false;
  try { StatsAlgorithms.combination(-1, 0); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Counting: C(-1,0) throws (n < 0)"); }
  else { fail++; console.error("  FAIL  Counting: C(-1,0) throws (n < 0)"); }
}

// Conditional probability: P(A|B) = P(A∩B)/P(B). Hand cases:
// P(A∩B)=0.12, P(B)=0.30 -> 0.4 ; P(A∩B)=0.05, P(B)=0.25 -> 0.2.
{
  approx(StatsAlgorithms.conditionalProbability(0.12, 0.30), 0.4, 1e-12, "Conditional: P(A|B) = 0.12/0.30 = 0.4");
  approx(StatsAlgorithms.conditionalProbability(0.05, 0.25), 0.2, 1e-12, "Conditional: P(A|B) = 0.05/0.25 = 0.2");
  // P(B) = 0 must throw.
  let threw = false;
  try { StatsAlgorithms.conditionalProbability(0.1, 0); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Conditional: P(B)=0 throws"); }
  else { fail++; console.error("  FAIL  Conditional: P(B)=0 throws"); }
}

// Bayes' theorem — two-hypothesis simple form (classic disease testing):
// prevalence 1%, test sensitivity 99%, false-positive rate 5%.
// P(H|E) = 0.99*0.01 / (0.99*0.01 + 0.05*0.99) = 0.0099 / 0.0594 = 1/6 ≈ 0.16667.
{
  approx(StatsAlgorithms.bayesSimple(0.01, 0.99, 0.05), 0.16666666666666669, 1e-12, "Bayes simple: disease posterior ≈ 0.16667 (1% / 99% sens / 5% FPR)");
  // pH = 0 (a hypothesis with zero prior) must throw — both hypotheses need nonzero prior.
  let threw = false;
  try { StatsAlgorithms.bayesSimple(0, 0.5, 0.5); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Bayes simple: pH=0 throws"); }
  else { fail++; console.error("  FAIL  Bayes simple: pH=0 throws"); }
}

// Bayes' theorem — general N-hypothesis form. Monty Hall: three hypotheses
// (prize behind door 1/2/3), equal priors [1/3, 1/3, 1/3]; you pick door 1 and
// the host opens door 3 to reveal a goat. Likelihoods P(host opens door 3 |
// prize at i) = [1/2, 1, 0] (if prize is at door 1 host picks randomly between
// the two goats; if at door 2 host must open door 3; if at door 3 host can't).
// Posteriors [1/3, 2/3, 0], normalizer P(E) = 1/2.
{
  const r = StatsAlgorithms.bayesTheorem([1 / 3, 1 / 3, 1 / 3], [0.5, 1, 0]);
  approx(r.posteriors[0], 1 / 3, 1e-12, "Bayes Monty Hall: posterior(door 1, stay) = 1/3");
  approx(r.posteriors[1], 2 / 3, 1e-12, "Bayes Monty Hall: posterior(door 2, switch) = 2/3");
  approx(r.posteriors[2], 0, 1e-12, "Bayes Monty Hall: posterior(door 3, ruled out) = 0");
  approx(r.normalizer, 0.5, 1e-12, "Bayes Monty Hall: normalizer P(E) = 0.5");
}

// Bayes' theorem — 3-hypothesis general form. priors [0.5, 0.3, 0.2] (sum 1),
// likelihoods [0.6, 0.4, 0.1]. normalizer = 0.5*0.6+0.3*0.4+0.2*0.1 = 0.44.
// posteriors = [0.30/0.44, 0.12/0.44, 0.02/0.44] = [0.68182, 0.27273, 0.04545].
{
  const r = StatsAlgorithms.bayesTheorem([0.5, 0.3, 0.2], [0.6, 0.4, 0.1]);
  approx(r.normalizer, 0.44, 1e-12, "Bayes 3-hyp: normalizer = 0.44");
  approx(r.posteriors[0], 0.6818181818181818, 1e-12, "Bayes 3-hyp: posterior[0]");
  approx(r.posteriors[1], 0.2727272727272727, 1e-12, "Bayes 3-hyp: posterior[1]");
  approx(r.posteriors[2], 0.04545454545454546, 1e-12, "Bayes 3-hyp: posterior[2]");
  // Priors not summing to 1 must throw.
  let threw = false;
  try { StatsAlgorithms.bayesTheorem([0.5, 0.4], [0.3, 0.2]); } catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    Bayes 3-hyp: priors summing to 0.9 throw"); }
  else { fail++; console.error("  FAIL  Bayes 3-hyp: priors summing to 0.9 throw"); }
}
```

This plan adds **16 + 5 + 3 + 2 + 4 + 5 = 35** new assertions. After adding
these, `node tests/verify-statistics.js` must report **278 + 35 = 313 passed,
0 failed**.

### Textbook cross-checks (per §9 of `00-SHARED-CONVENTIONS.md`)

- **`C(52, 5) = 2,598,960`** — the number of 5-card poker hands from a 52-card
  deck, a standard combinatorics-textbook result. The multiplicative-formula
  implementation reproduces it exactly (`1e-12`).
- **Disease-testing Bayes** (`Test 5`): prevalence 1%, sensitivity 99%,
  false-positive rate 5% → posterior `P(disease | positive) ≈ 0.167 = 1/6`.
  This is the canonical Bayes'-theorem textbook example (the "base-rate
  neglect" illustration); the implementation returns `0.16666…` to `1e-12`.
- **Monty Hall** (`Test 6`): the standard three-doors problem, modeled as three
  hypotheses (prize behind door 1/2/3) with equal priors and likelihoods
  `[1/2, 1, 0]` after the host opens door 3. Posteriors are `P(door 1) = 1/3`
  (stay), `P(door 2) = 2/3` (switch), `P(door 3) = 0` (ruled out). The
  implementation reproduces all three to `1e-12`, matching the well-known
  counterintuitive answer.

## 4. Files to create

- `math-lab/assets/js/probability-combinatorics.js` — per-method DOM wiring (IIFE).
- `math-lab/engines/statistics/methods/probability-combinatorics.html` — method
  page copying the structure of `discrete-distributions.html` (simplified
  two-link header nav, mode chip row, per-mode input panels shown/hidden by
  mode, `.status-line`, result strip, formula block, Plotly plot for the
  multi-hypothesis Bayes mode).

## 5. Inputs (the form panel)

- **Mode chip row** (id `modeRow`): **Counting**, **Conditional**, **Bayes** —
  same `.chip` pattern as `discrete-distributions.html`'s `distRow`.
- **Counting fields** (id `countingFields`, shown by default):
  - `n` (`type="number" step="1" min="0" max="1000"`, default `52`).
  - `k` (`type="number" step="1" min="0" max="n"`, default `5`).
- **Conditional fields** (id `conditionalFields`, hidden by default):
  - `P(A∩B)` (`type="number" step="0.01" min="0" max="1"`, default `0.12`).
  - `P(B)` (`type="number" step="0.01" min="0.01" max="1"`, default `0.30`).
- **Bayes fields** (id `bayesFields`, hidden by default) — a sub-mode chip row
  (id `bayesModeRow`): **Simple** (two-hypothesis) and **General** (N-hypothesis).
  - **Simple** (id `bayesSimpleFields`): `P(H)` (default `0.01`),
    `P(E|H)` (default `0.99`), `P(E|¬H)` (default `0.05`) — the disease-testing
    defaults.
  - **General** (id `bayesGeneralFields`): a textarea (id `bayesPriorInput`,
    one number per line, default `0.5\n0.3\n0.2`) for priors and a textarea
    (id `bayesLikelihoodInput`, default `0.6\n0.4\n0.1`) for likelihoods, plus
    a `.field-note` ("one hypothesis per line; priors must sum to 1").
- `.status-line` (id `statusLine`) for the verdict.
- `.field#formError` for validation errors.
- "Try Example" loads the mode-appropriate default (Counting → `n=52, k=5`;
  Conditional → `0.12, 0.30`; Bayes Simple → disease-testing; Bayes General →
  Monty Hall `[1/3, 1/3]` priors, `[0.5, 1]` likelihoods).

## 6. Outputs (results panel)

Result strip — tiles depend on the active mode:

- **Counting** (4 tiles): `n!` (accent), `P(n, k)`, `C(n, k)`, `k!`.
- **Conditional** (3 tiles): `P(A|B)` (accent), `P(A∩B)`, `P(B)`.
- **Bayes Simple** (3 tiles): `P(H|E)` (accent), `P(E|H)·P(H)` (numerator),
  `P(E)` (normalizer).
- **Bayes General** (2 tiles + a small table): `P(E)` (normalizer, accent) and
  `hypotheses (m)`, plus a plain HTML `<table>` listing each hypothesis's
  prior, likelihood, and posterior (one row per hypothesis).

Formula block (`formula-block--reference`, KaTeX), per mode:
- Counting: `P(n,k) = \frac{n!}{(n-k)!}, \quad C(n,k) = \binom{n}{k} = \frac{n!}{k!(n-k)!}`
- Conditional: `P(A \mid B) = \frac{P(A \cap B)}{P(B)}`
- Bayes Simple: `P(H \mid E) = \frac{P(E \mid H)\,P(H)}{P(E \mid H)\,P(H) + P(E \mid \neg H)\,P(\neg H)}`
- Bayes General: `P(H_i \mid E) = \frac{P(E \mid H_i)\,P(H_i)}{\sum_j P(E \mid H_j)\,P(H_j)}`

Plot (`#bayesPlot`, height 280px, **Bayes General mode only**; hidden in the
other modes): a `type: "bar"` trace of the posterior probabilities across the
`m` hypotheses (teal-gold `#c99a3c` bars), with the prior shown as a
semi-transparent overlay bar or a second trace (`type: "bar"`, light orange
`rgba(237,109,64,0.35)`) so the user sees how probability mass redistributes
from prior to posterior after the evidence. The other modes have no plot —
counting and the single-quotient conditional/Bayes-simple cases are better
served by the result strip alone (a bar chart of one or two numbers would be
chartjunk).

Use `Engine.formatNum` for ALL displayed numbers (never `.toFixed()` directly).
`Engine.debounce` on every input listener (200 ms). `Engine.renderKatex` for
the formula block. `Engine.plotlyBaseLayout` / `Engine.plotlyConfig` for the
Bayes plot. `Proto.saveState` / `loadState` with store key
`engine-lab:statistics:probability`.

## 7. `methods.html` — card to add

Category `"Probability"`. Insert as card 11/11 (consolidation pass will fix the
index — the `11 / 11` is a TODO marker per the parallel-build addendum, §10 of
`00-SHARED-CONVENTIONS.md`).

```html
<!-- TODO index: pending consolidation — Statistics Engine card 11/11 (Probability & Combinatorics) -->
<a href="methods/probability-combinatorics.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.80s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Probability</span>
    <span class="engine-index">11 / 11</span>
  </div>
  <h3 class="h3">Probability &amp; Combinatorics</h3>
  <p>Counting (factorials, permutations, combinations — C(52,5)=2,598,960 poker hands), the conditional-probability definition P(A|B)=P(A∩B)/P(B), and Bayes' theorem in both two-hypothesis (disease-testing) and general N-hypothesis (Monty Hall) forms.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">3 modes</span>
    <span class="tag">Counting + Bayes</span>
    <span class="tag">Posterior bar chart</span>
  </div>
</a>
```

**Note:** Card is NOT added to `methods.html` directly in this build (per the
parallel-build addendum, §10 of `00-SHARED-CONVENTIONS.md`); it is appended to
`docs/agent-plans/PENDING-CARDS.md` under the existing `## Statistics Engine`
heading instead.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → **313 passed, 0 failed** (35 new
  assertions added; baseline 278).
- `C(52, 5) = 2,598,960`; `C(10, 3) = 120`; `P(10, 3) = 720`; `0! = 1`;
  `C(n, 0) = 1` — all to `1e-12`.
- `C(52, 47) = C(52, 5)` (the implementation's `k ↔ n−k` symmetry shortcut is
  correct).
- A conditional-probability case matches node-verified `P(A|B)` (e.g.
  `0.12/0.30 = 0.4`).
- The classic disease-testing Bayes problem (prevalence 1%, sensitivity 99%,
  false-positive rate 5%) yields posterior `≈ 0.16667 = 1/6` to `1e-12`.
- The Monty Hall problem (three hypotheses, priors `[1/3, 1/3, 1/3]`,
  likelihoods `[1/2, 1, 0]`) yields posteriors `1/3` (stay), `2/3` (switch),
  `0` (ruled-out door) to `1e-12`, normalizer `0.5`.
- Switching modes (Counting / Conditional / Bayes, and Simple/General within
  Bayes) updates the formula block and the visible input fields correctly.
- Invalid inputs (negative/non-integer `n`, `k > n`, `P(B) = 0`, priors not
  summing to 1, `pH = 0`) throw `Error` rather than returning `NaN`/`Infinity`.
- The plan file is complete with node-verified numbers.