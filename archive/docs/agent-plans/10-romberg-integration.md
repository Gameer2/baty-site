# Build Plan — Romberg Integration

Roadmap ref: §1C.19. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10), and `01-trapezoidal-rule.md` (Romberg builds directly on
`Algorithms.runTrapezoidal`, which must exist first — if it hasn't been built yet, build
it per that plan before starting this one, or coordinate so it lands first).

## 1. What this method is

Romberg integration applies Richardson extrapolation to a sequence of composite
Trapezoidal-rule estimates at `h, h/2, h/4, ...`, cancelling the leading error term at
each extrapolation level to get much faster convergence. Build a triangular table:

```
R(i,0) = Trapezoidal rule with n = 2^i subintervals on [a,b],  i = 0..m
R(i,j) = R(i,j-1) + [R(i,j-1) - R(i-1,j-1)] / (4^j - 1),        j = 1..i
```

`R(m,m)` is the final, most-accurate estimate. Do **not** reimplement the trapezoidal
sum here — `R(i,0)` is exactly `Algorithms.runTrapezoidal(f, a, b, 2**i).total`, so call
that existing function for every row-0 entry. This keeps Romberg "self-contained" in the
sense of not depending on any *other* new method (specifically: don't depend on a
possibly-not-yet-built generic "Richardson Extrapolation" method from another track —
the recurrence above is Romberg's own, applied directly to Trapezoidal output).

## 2. `algorithms.js` — function to add

```js
// f: number -> number, Romberg integration on [a, b] via m+1 levels of Richardson
// extrapolation applied to composite Trapezoidal-rule estimates at n = 1, 2, 4, ..., 2^m
// subintervals. Returns the full triangular table; R[m][m] is the final estimate.
Algorithms.runRomberg = function (f, a, b, m) {
  if (!Number.isInteger(m) || m < 1) throw new Error("m (number of extrapolation levels) must be a positive integer.");
  const R = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= m; i++) {
    R[i][0] = Algorithms.runTrapezoidal(f, a, b, Math.pow(2, i)).total;
  }
  for (let j = 1; j <= m; j++) {
    for (let i = j; i <= m; i++) {
      R[i][j] = R[i][j - 1] + (R[i][j - 1] - R[i - 1][j - 1]) / (Math.pow(4, j) - 1);
    }
  }
  return { R, total: R[m][m] };
};
```

## 3. `tests/verify.js` — cases to add (pre-verified via `node -e`)

```js
// Romberg Integration: e^x on [0,1], m=4 -> converges to e-1 far tighter than plain
// Trapezoidal at the same base n, thanks to Richardson extrapolation.
{
  const { fn } = compile("e^x");
  const result = Algorithms.runRomberg(fn, 0, 1, 4);
  approx(result.total, Math.E - 1, 1e-9, "Romberg e^x on [0,1], m=4 (extrapolated)");
}

// Romberg Integration: sin(x) on [0,pi], m=4 -> converges to the true integral, 2.
{
  const { fn } = compile("sin(x)");
  const result = Algorithms.runRomberg(fn, 0, Math.PI, 4);
  approx(result.total, 2, 1e-7, "Romberg sin(x) on [0,pi], m=4 (extrapolated)");
}
```

## 4. Files to create

- `math-lab/assets/js/romberg.js`
- `math-lab/engines/numerical/methods/romberg-integration.html`

## 5. Inputs

`f(x)` + preview + keypad. `a`, `b` in a `.field-row`. `m` (extrapolation levels) numeric
field, `type="number" step="1" min="1" max="10"` (keep small — `2^m` subintervals grows
fast; `m=10` already means 1024 subintervals per row, plenty). Default example:
`f(x) = "e^x"`, `a=0`, `b=1`, `m=4`.

## 6. Outputs

Result strip: **Estimate** (`accent`, `R[m][m]`), **Levels (m)**, **Base panels (n at i=0)**
(always `1`), **Est. error** — use `|R[m][m] - R[m-1][m-1]|` (the last diagonal step)
as a practical convergence indicator, same idea as the step-doubling estimate on the
Trapezoidal page but here it's free (already computed as part of the table).

Formula block: the two-line recurrence from §1, rendered as KaTeX (numerator/denominator
fraction form, not the raw code).

Plot 1 — **"Convergence of R(i,i) vs. i"**: x-axis = `i` (0..m), y-axis = `R[i][i]`,
`lines+markers`, orange — shows the diagonal converging rapidly; this is the headline
visual for this method (dramatically faster than Trapezoidal/Simpson's convergence plots
at the same base panel count — the page copy should say so explicitly).

Data table: render the full **triangular** `R` table (row `i` shows columns `0..i`, blank
for `j > i`) — this is different from every other page's per-iteration row-table, so it
needs its own small layout; still use `table.data-table` with the same mono/zebra
styling, just triangular content. Highlight the final `R[m][m]` cell (`.is-current` or a
dedicated `accent`-tinted cell class already used elsewhere for the "accent" result tile,
whichever fits without inventing new CSS).

No step slider — there's no natural single-step-at-a-time narrative here beyond "look at
the table," so omit that panel (same reasoning as Hermite's plan).

## 7. `methods.html` card (→ `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Integration"**.
```html
<a href="methods/romberg-integration.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Integration</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Romberg Integration</h3>
  <p>Richardson-extrapolates a sequence of Trapezoidal-rule estimates into far higher accuracy — watch the diagonal converge in just a few rows.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + [a,b] + levels</span>
    <span class="tag">Triangular table</span>
    <span class="tag">Fast convergence plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: requires `Algorithms.runTrapezoidal` to already exist
— if `node tests/verify.js` errors with "runTrapezoidal is not a function," build
`01-trapezoidal-rule.md` first. `R[m][m]` for the example inputs should visibly be far
closer to the true value than `Algorithms.runTrapezoidal(fn, a, b, 2**m).total` alone —
worth a quick manual comparison to confirm the extrapolation is actually helping, not
just replicating the base row.
