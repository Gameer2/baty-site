# Build Plan — Method of False Position (Regula Falsi)

Roadmap ref: `CURRICULUM_ROADMAP.md` §1A.5, priority P1. Earmarked for **Qwen3.5**. Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full first — this plan assumes it,
including §10 (do not touch `methods.html` yourself; append your card to
`PENDING-CARDS.md` instead).

**Closest precedent, read it in full before starting:** `math-lab/assets/js/bisection.js`
and `math-lab/engines/numerical/methods/bisection.html`, plus `Algorithms.runBisection`
in `math-lab/assets/js/algorithms.js`. This method is Bisection with exactly one line of
math changed — build by literally copying those three files and making the specific
edits below. Do not redesign anything; do not invent new UI. If you find yourself writing
something that isn't in Bisection's files, stop and re-read them.

## 1. What this method is

Like Bisection, False Position brackets a root in `[a,b]` where `f(a)·f(b) < 0`. Instead
of bisecting at the midpoint, it draws the secant line through `(a, f(a))` and `(b, f(b))`
and uses *that line's* x-intercept as the next estimate:

```
c = b - f(b)·(b - a) / (f(b) - f(a))
```

Then, exactly like Bisection: evaluate `f(c)`. If `sign(f(a)) === sign(f(c))`, replace `a`
with `c` (root is in `[c,b]`); otherwise replace `b` with `c` (root is in `[a,c]`). Repeat.

The one algorithmic difference from Bisection you must implement correctly: False
Position's interval width does **not** necessarily shrink to zero (one endpoint can get
"stuck" for many iterations if `f` is convex/concave near the root — this is a well-known,
expected property of this method, not a bug). So the convergence check cannot be
"interval half-width < tol" the way Bisection's is. Use `|f(c)| < tol` as the stopping
condition instead — check this exact detail, it is the single most important thing to get
right in this plan.

## 2. `algorithms.js` — function to add

Add after `Algorithms.runBisection` (keep it directly below/near Bisection since they're
conceptually paired):

```js
// f: number -> number, brackets a root in [a, b] where f(a)*f(b) < 0. Like Bisection but
// replaces the midpoint with the secant-line x-intercept through (a,f(a)),(b,f(b)).
// Stops on |f(c)| < tol rather than interval width, since the bracket need not shrink to 0.
Algorithms.runFalsePosition = function (f, a, b, tol, maxIter) {
  const iterations = [];
  let lo = a, hi = b;
  let flo, fhi;
  try { flo = f(lo); fhi = f(hi); } catch { throw new Error("f(x) could not be evaluated at a or b."); }
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) throw new Error("f(x) produced a non-finite value at a or b.");
  for (let n = 1; n <= maxIter; n++) {
    const c = hi - (fhi * (hi - lo)) / (fhi - flo);
    let fc;
    try { fc = f(c); } catch { throw new Error(`f(x) could not be evaluated at x = ${c}.`); }
    if (!Number.isFinite(fc)) throw new Error(`f(x) produced a non-finite value at x = ${c}.`);
    iterations.push({ n, a: lo, b: hi, c, fc, err: Math.abs(fc) });
    if (Math.abs(fc) < tol) break;
    if (Math.sign(flo) === Math.sign(fc)) { lo = c; flo = fc; } else { hi = c; fhi = fc; }
  }
  return iterations;
};
```

Return shape matches `runBisection`'s exactly: array of `{n, a, b, c, fc, err}` — this is
deliberate, it means the per-method JS/HTML can reuse Bisection's rendering code almost
line for line.

## 3. `tests/verify.js` — case to add (pre-verified, use exactly)

```js
// False Position: x^3 - x - 2 = 0 on [1, 2] -> same known root as Bisection/Newton/Secant
// above, cross-checking a fourth independent method against the others. Converges to
// |f(c)| < 1e-9, which lands within ~1.5e-7 of the true root (looser than the other
// methods' tolerance because False Position's stopping rule is on |f(c)|, not interval
// width or step size — see the plan for why).
{
  const { fn } = compile("x^3 - x - 2");
  const iters = Algorithms.runFalsePosition(fn, 1, 2, 1e-9, 100);
  approx(iters[iters.length - 1].c, 1.5213797068045676, 1e-6, "False Position root of x^3 - x - 2 (cross-check)");
}
```

Append after whatever cases already exist in the file (don't assume a specific count —
other methods may be added to this file by other build agents around the same time).

## 4. Files to create

- `math-lab/assets/js/false-position.js` — copy `bisection.js` verbatim, then: rename
  `bisectionForm` → `falsePositionForm` (and its DOM id lookups), change the
  `Algorithms.runBisection` call to `Algorithms.runFalsePosition`, change the formula
  block LaTeX (see §6), and change the status-line message wording from "bracket is
  valid" to something equivalent (the sign-check logic itself is identical — keep it).
  Everything else (bracket-viz slider markers, plot construction, step function) is
  identical to `bisection.js` — copy it unchanged.
- `math-lab/engines/numerical/methods/false-position.html` — copy `bisection.html`
  verbatim, then: change `<title>`, `.eyebrow` stays `"Root Finding"`, `<h1>` → "Method
  of False Position", `.method-summary` describes the secant-line-intercept idea (one
  sentence, in the same terse voice as Bisection's), form id → `falsePositionForm`,
  script tag → `false-position.js`. The bracket-viz markup block (`#bracketViz`,
  `#bracketTrack`, `#bracketFill`, `#markerA/B/C`) stays **identical** — this method
  still has a shrinking-ish bracket to visualize the same way, just don't assume it
  reaches exactly `c` at the midpoint.

## 5. Inputs

Identical to Bisection: `f(x)`, `a`, `b` (field-row), tolerance, max iterations. Same
field ids pattern (`fxInput`, `aInput`, `bInput`, `tolInput`, `maxIterInput`). Same
sign-check status line logic (`f(a)·f(b) < 0` validity check) — copy verbatim from
`bisection.js`'s `updateSignCheck()`.

"Try Example": same values as Bisection's example (`x^3 - x - 2`, `a=1`, `b=2`,
`tol=0.000001`) so a user can compare the two methods on the identical problem — change
only `maxIterInput.value` to `"60"` (False Position can take more iterations than
Bisection to reach the same `|f(c)|` tolerance on some functions, per §1's note about the
bracket not always shrinking — 60 is a safe headroom, not a requirement).

## 6. Outputs

Identical layout to Bisection's results panel (result-strip stats: Root≈/Iterations/
f(root)/Final error — reuse `Engine.formatNum` the same way), same iteration table
columns (`n`, `a`, `b`, `c`, `f(c)`, `error`), same bracket-viz number line, same
step-through slider behavior, same two plots (`f(x) & root trace`, `error decay log
scale`) with the same trace styling/colors as `bisection.js`.

The only visible content difference: the formula block should render:

```
c_n = b_n - \dfrac{f(b_n)\,(b_n - a_n)}{f(b_n) - f(a_n)}
```

## 7. `methods.html` card (append to `PENDING-CARDS.md`, do not edit `methods.html`)

```html
<a href="methods/false-position.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Root Finding</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Method of False Position</h3>
  <p>Brackets a root like Bisection, but replaces the midpoint with the secant line's x-intercept — usually fewer iterations, but the bracket doesn't always shrink evenly.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + interval</span>
    <span class="tag">Bracket visualization</span>
    <span class="tag">Iteration table</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` passes, including the new False Position case.
- With the example inputs, the result should closely match Bisection's result on the same
  function/interval (`root ≈ 1.52137...`), reached in noticeably fewer iterations than
  Bisection needed for the same tolerance (Bisection took ~20 iterations at `tol=1e-6`;
  False Position should take meaningfully fewer — if it doesn't, or if it errors, that's
  a bug, not an acceptable variation).
- The bracket-viz still renders sensibly even though `c` won't sit near the midpoint of
  `[a,b]` the way Bisection's does — check visually that the `c` marker moves smoothly
  across steps rather than jumping or overlapping `a`/`b` incorrectly.
