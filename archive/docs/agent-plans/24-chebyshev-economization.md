# Build Plan — Chebyshev Polynomials & Polynomial Economization

Roadmap ref: `CURRICULUM_ROADMAP.md` §1F.23, Tier 3 (P3, lowest priority — build this one
last within the Qwen track). Assigned track: **Qwen3.5**. Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full before starting. This method is the
most conceptually involved of Qwen's batch — follow the given formulas and code exactly,
don't attempt to derive or "improve" the economization math yourself.

## 1. What this method is

**Part 1 — Chebyshev polynomials.** The Chebyshev polynomials of the first kind are
defined by the recurrence `T_0(x) = 1`, `T_1(x) = x`,
`T_{n+1}(x) = 2x·T_n(x) - T_{n-1}(x)`. They're bounded by `±1` on `[-1, 1]` and have the
smallest possible maximum magnitude on that interval among polynomials with the same
leading coefficient — this "flatness" property is exactly what makes them useful for
economization.

**Part 2 — Polynomial economization.** Given a degree-`n` polynomial `P(x)` (e.g. a
truncated Taylor series), economization produces a degree-`(n-1)` polynomial that closely
approximates `P(x)` on `[-1,1]`, by re-expressing the degree-`n` (leading) term through
`T_n` and dropping only the bounded `T_n` part. Concretely: since `T_n(x)` has leading
coefficient `2^{n-1}` (for `n ≥ 1`) and matches `x^n` exactly at that degree, we can write

```
x^n = ( T_n(x) - (T_n(x) minus its own leading term) ) / (leading coeff of T_n)
```

i.e. `x^n` equals `T_n(x)/leadCoeff` minus a *lower-degree* correction term (all of
`T_n`'s coefficients below degree `n`, divided by the same `leadCoeff`). Substituting this
into `P(x)`'s leading term `a_n·x^n` and **dropping the bounded `T_n(x)` piece** (whose
contribution is at most `|a_n / leadCoeff(T_n)|` in magnitude anywhere on `[-1,1]`, since
`|T_n(x)| ≤ 1` there) gives a new degree-`(n-1)` polynomial:

```
economized_k = P_k - (a_n / leadCoeff(T_n)) · T_n_k     for k = 0..n-1
```

where `T_n_k` is `T_n`'s monomial coefficient of degree `k`. The dropped term's maximum
possible error on `[-1,1]` is exactly `|a_n / leadCoeff(T_n)|`.

Category/eyebrow: **"Approximation Theory"**.

## 2. `algorithms.js` — functions to add (three functions)

```js
// Returns the ascending-power monomial coefficients of the Chebyshev polynomial T_n(x)
// (first kind), expanded from the recurrence T_0=1, T_1=x, T_{n+1}=2x*T_n - T_{n-1}.
// Result length is n+1 (coefficients for x^0 .. x^n).
Algorithms.chebyshevCoeffs = function (n) {
  if (!Number.isInteger(n) || n < 0) throw new Error("n must be a non-negative integer.");
  let Tprev = [1];
  if (n === 0) return Tprev;
  let Tcurr = [0, 1];
  if (n === 1) return Tcurr;
  for (let k = 2; k <= n; k++) {
    const shifted = [0, ...Tcurr.map((c) => 2 * c)];
    const Tnext = new Array(Math.max(shifted.length, Tprev.length)).fill(0);
    for (let i = 0; i < shifted.length; i++) Tnext[i] += shifted[i];
    for (let i = 0; i < Tprev.length; i++) Tnext[i] -= Tprev[i];
    Tprev = Tcurr;
    Tcurr = Tnext;
  }
  return Tcurr;
};

// coeffsAsc: ascending-power monomial coefficients, x: point. Direct polynomial evaluation
// via Horner's method (reused by both chebyshevT and the economization demo below).
Algorithms.evalMonomialPoly = function (coeffsAsc, x) {
  let result = 0;
  for (let k = coeffsAsc.length - 1; k >= 0; k--) result = result * x + coeffsAsc[k];
  return result;
};

// polyCoeffs: ascending-power monomial coefficients of a degree-n polynomial (length
// n+1, n >= 1). Drops the degree-n term by re-expressing it via T_n, the polynomial with
// the smallest possible max-magnitude (1) on [-1,1] at that degree — this is what keeps
// the truncation error small and bounded instead of arbitrary. Returns the degree-(n-1)
// economized polynomial plus the dropped term's guaranteed max-error bound on [-1,1].
Algorithms.chebyshevEconomize = function (polyCoeffs) {
  const n = polyCoeffs.length - 1;
  if (n < 1) throw new Error("Need a polynomial of degree >= 1 to economize.");
  const Tn = Algorithms.chebyshevCoeffs(n);
  const leadTn = Tn[n];
  const an = polyCoeffs[n];
  const scale = an / leadTn;
  const economized = new Array(n).fill(0);
  for (let k = 0; k < n; k++) economized[k] = polyCoeffs[k] - scale * Tn[k];
  return { economized, droppedScale: scale, errorBound: Math.abs(scale) };
};
```

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Chebyshev Polynomials: T_2(x) = 2x^2 - 1 and T_3(x) = 4x^3 - 3x (standard closed forms).
{
  const T2 = Algorithms.chebyshevCoeffs(2);
  const T3 = Algorithms.chebyshevCoeffs(3);
  approx(Algorithms.evalMonomialPoly(T2, 0.5), -0.5, 1e-12, "T_2(0.5) = 2(0.5)^2 - 1 = -0.5");
  approx(Algorithms.evalMonomialPoly(T3, 0.5), -1, 1e-12, "T_3(0.5) = 4(0.5)^3 - 3(0.5) = -1");
}

// Polynomial Economization: economize the degree-4 Maclaurin truncation of e^x,
// P4(x) = 1 + x + x^2/2 + x^3/6 + x^4/24, down to degree 3. The economized polynomial's
// max deviation from P4 on [-1,1] must not exceed the computed error bound (1/192).
{
  const P4 = [1, 1, 0.5, 1 / 6, 1 / 24];
  const result = Algorithms.chebyshevEconomize(P4);
  approx(result.errorBound, 1 / 192, 1e-12, "Economization of degree-4 e^x Maclaurin poly: error bound = 1/192");
  approx(result.economized[0], 191 / 192, 1e-9, "Economized P3 constant term = 191/192");
  let maxDiff = 0;
  for (let i = 0; i <= 40; i++) {
    const x = -1 + (2 * i) / 40;
    const diff = Math.abs(Algorithms.evalMonomialPoly(P4, x) - Algorithms.evalMonomialPoly(result.economized, x));
    if (diff > maxDiff) maxDiff = diff;
  }
  approx(maxDiff <= result.errorBound + 1e-9 ? 1 : 0, 1, 0.5, "Sampled max|P4-economized| on [-1,1] stays within the computed error bound");
}
```

All values verified with `node -e` before writing this plan: `T_2(0.5) = -0.5`,
`T_3(0.5) = -1` exactly; economizing `P4` gives `economized = [0.9947916666666666, 1,
0.5416666666666666, 0.16666666666666666]`, `errorBound = 1/192 ≈ 0.0052083`, and the
sampled max deviation across `[-1,1]` (200-point scan) came out to `0.00520833...` —
matching the bound almost exactly, as the theory predicts. Do not alter these numbers.
After adding these, run `node tests/verify.js` and confirm the passed count increased by
exactly 5, 0 failures.

## 4. Files to create

- `math-lab/assets/js/chebyshev.js`
- `math-lab/engines/numerical/methods/chebyshev-economization.html`

## 5. Inputs (the form panel)

This page doesn't take an `f(x)` expression input — it works on a **fixed, explicit
polynomial** entered as coefficients, which keeps the economization math well-defined
(economization needs literal polynomial coefficients, not an arbitrary symbolic
expression). Design:

- A small coefficient-entry row: one numeric input per coefficient, ascending degree,
  labeled `a₀, a₁, a₂, ...` — default to 5 inputs (degree 4) pre-filled with the Maclaurin
  `e^x` example `[1, 1, 0.5, 0.16667, 0.041667]` (i.e. `1, 1, 1/2, 1/6, 1/24`). If you want
  a variable-degree input instead of a fixed 5, an "Add/Remove coefficient" control
  mirroring the points-table add/remove pattern from `lagrange.js` is fine too — either a
  fixed 5-coefficient row or a variable-length one is acceptable, just keep the minimum
  degree at 1 (2 coefficients).
- A short field-note above the row: "Coefficients are for a polynomial on [-1, 1], e.g.
  the degree-4 Maclaurin series for eˣ: 1 + x + x²/2 + x³/6 + x⁴/24."
- `.status-line`: all coefficients numeric, at least 2 entered (degree ≥ 1).
- "Try Example": the `e^x` degree-4 coefficients above.

## 6. Outputs (results panel)

Result strip (3 tiles, first `accent`):
- **Error bound** (`accent`) — `Engine.formatNum(result.errorBound, 6)`.
- **Original degree** — `n`.
- **Economized degree** — `n - 1`.

Formula block:
```
a_n x^n \;\longrightarrow\; \frac{a_n}{\text{lead}(T_n)}\Big(T_n(x) - \big(T_n(x)\text{'s lower-degree part}\big)\Big),\quad \text{drop } T_n(x)
```
with a plain-text note: "the dropped T_n(x) term is bounded by ±1 on [-1,1], so the
resulting error never exceeds the error bound shown above, no matter where x falls in
that range."

Plot — **"Original vs. economized polynomial on [-1,1]"** (single plot, height 320px):
two curves over `x ∈ [-1,1]` (200 samples), original `P(x)` (teal) and economized
`P_economized(x)` (orange), plus a shaded band or a secondary small plot showing
`|P(x) - P_economized(x)|` against the flat `errorBound` line — this visually proves the
error stays inside the bound everywhere on `[-1,1]`, which is the whole point of the
method. A single combined plot (both curves) is the minimum bar; the error-vs-bound
overlay is a nice addition if not too complex, skip it if it is.

Also show, as a small table, the coefficients before/after: two rows (or two columns),
`a_0 .. a_n` (original) and `a_0 .. a_{n-1}` (economized, with a dash/blank in the dropped
`a_n` slot).

No step slider needed (this is a single closed-form transformation, not iterative) —
omit the step-through panel, same reasoning as Numerical Differentiation.

## 7. `methods.html` card (append to `PENDING-CARDS.md` per §10, do not edit `methods.html`)

```html
<a href="methods/chebyshev-economization.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Approximation Theory</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Chebyshev Polynomials &amp; Economization</h3>
  <p>Drops a polynomial's highest-degree term by re-expressing it through a Chebyshev polynomial — the flattest possible curve at that degree on [-1,1] — bounding the error exactly.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Coefficient input</span>
    <span class="tag">Degree reduction</span>
    <span class="tag">Bounded-error plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc **except** item 5 (no step slider), plus:
- `node tests/verify.js` → all new assertions pass, count increases by 5, 0 failures.
- Example inputs (`e^x` degree-4 coefficients) show `Error bound ≈ 0.005208` and an
  economized-vs-original plot where the two curves are visually almost indistinguishable
  on `[-1,1]` — that visual closeness *is* the demonstration.
