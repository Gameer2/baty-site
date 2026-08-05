# ODE Engine Phase 4 — Series Solutions: closing the Frobenius gap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (inline execution, no subagent dispatch). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two `raise ValueError(...)` refusals in `_series_solution` (repeated
indicial root; roots differing by an integer) with a real second solution via reduction of
order — verified numerically against Bessel's equation (both problem cases, at `x0=0` and a
nonzero point) during design. Retire `series-solution-fallback.js`'s duplicated
`compileRealFx`/`withArbitraryConstants` in favor of `ODESolver`'s shared versions.

**Architecture:** One new code path in `_series_solution`, replacing both refusal branches with
a single reduction-of-order computation (`y2 = y1 * ∫[e^(−∫(q/p)dx) / y1²] dx`) — the log term
(or its absence) falls out of the integral automatically, no separate case-detection needed.
The existing `residualShrinksTowardPoint` numeric verification in `series-solution-fallback.js`
needs no structural change (it already evaluates arbitrary compiled `y`/`yp`/`ypp` expressions,
`log` already in scope) — only its two duplicated helpers get swapped for `ODESolver`'s.

Full design rationale: `docs/superpowers/specs/2026-08-02-ode-engine-phase4-series-design.md`.

## Global Constraints

- The Pyodide/SymPy worker cannot be exercised from the Node test suite — Python-side changes
  are verified manually in a real browser, same as every other worker op on this site.
- If the reduction-of-order computation raises for any reason, refuse honestly with a clear
  message — never propagate a crash, never guess.
- The existing `residualShrinksTowardPoint` numeric gate stays the final check before anything
  is shown — the new code path does not bypass it.
- Named special functions (Bessel, Legendre, etc.) are not recognized or labeled as such — out
  of scope, the course doesn't cover them.

---

### Task 1: Reduction-of-order fix in `_series_solution`

**Files:**
- Modify: `assets/js/sympy-worker.js`

**Interfaces:**
- Modifies the existing `_series_solution(equation_text, point_str, order)` worker function.
  Its JSON output shape is unchanged (`{kind, y, yp, ypp, p, q, r, point}`) except `kind` gains
  a new possible value: `"regular-singular-log"`.

Not Node-testable (no `pyodide` npm package) — sanity-checked directly against a local `sympy`
install below (both cases already validated during design), then verified manually in-browser
in Task 4.

- [ ] **Step 1: Replace the two refusal branches**

In `assets/js/sympy-worker.js`, find `_series_solution` (search for `def _series_solution`).
Replace this block:

```python
        rsym = sp.symbols("r")
        roots = sp.solve(rsym * (rsym - 1) + p0 * rsym + q0, rsym)
        if len(roots) != 2:
            raise ValueError("The indicial equation has a repeated root here — the second solution needs a logarithmic term this page doesn't support yet.")
        diff = sp.simplify(roots[0] - roots[1])
        if diff.is_integer:
            raise ValueError("The indicial roots differ by an integer here — the second solution may need a logarithmic term this page doesn't support, so it refuses rather than risk an incomplete answer.")
        sol = sp.dsolve(sp.Eq(lhs_expr, 0), y, hint="2nd_power_series_regular", n=order, x0=point)
        kind = "regular-singular"
```

with:

```python
        rsym = sp.symbols("r")
        roots = sp.solve(rsym * (rsym - 1) + p0 * rsym + q0, rsym)
        distinct_non_integer = (
            len(roots) == 2 and not sp.simplify(roots[0] - roots[1]).is_integer
        )
        if distinct_non_integer:
            sol = sp.dsolve(sp.Eq(lhs_expr, 0), y, hint="2nd_power_series_regular", n=order, x0=point)
            series = sol.rhs.removeO()
            kind = "regular-singular"
        else:
            # Repeated root, or roots differing by an integer: SymPy's own hint still returns
            # a VALID first solution y1 in these cases (confirmed against Bessel orders 0 and
            # 1) -- it just silently omits the second, independent solution, which may need a
            # logarithmic term. Reduction of order, applied to that same y1, produces the
            # correct second solution directly; whether a log term appears (and with what
            # coefficient) falls out of the integral automatically -- one technique for both
            # cases, no separate branch needed.
            try:
                sol1 = sp.dsolve(sp.Eq(lhs_expr, 0), y, hint="2nd_power_series_regular", n=order, x0=point)
                y1 = sol1.rhs.removeO().subs(sp.Symbol('C1'), 1)
                weight = sp.exp(-sp.integrate(qp, x))
                integrand = sp.series(weight / y1**2, x, point, order).removeO()
                antideriv = sp.integrate(integrand, x)
                y2 = sp.expand(y1 * antideriv)
            except Exception as ex:
                raise ValueError("Could not compute a second, independent series solution here: " + str(ex))
            C1, C2 = sp.symbols('C1 C2')
            series = C1 * y1 + C2 * y2
            kind = "regular-singular-log"
```

Note: this replacement removes the assignment `sol = sp.dsolve(..., hint="2nd_power_series_regular", ...)` that used to sit *after* the two raises and be shared by both branches — it's now duplicated inside each branch of the new `if`/`else` (once for the direct case, once as `sol1` for the reduction-of-order case), which is why the line `series = sol.rhs.removeO()` immediately after this block (see Step 2) must be removed for the `else`-branch's `regular-singular-log` case — `series` is now set inside each branch directly instead.

- [ ] **Step 2: Adjust the trailing `series = sol.rhs.removeO()` line**

Directly below the block just replaced, find:

```python
    series = sol.rhs.removeO()
    yp = sp.diff(series, x)
```

Replace with (the `ordinary` branch still sets `sol`, not `series`, directly — this line now
only applies to that branch):

```python
    if kind == "ordinary":
        series = sol.rhs.removeO()
    yp = sp.diff(series, x)
```

- [ ] **Step 3: Sanity-check against a local `sympy` install**

Run (already verified during design — this confirms the exact code just written, not a
simplified stand-in):

```bash
python3 -c "
import sympy as sp
x = sp.symbols('x')
y = sp.Function('y')
point = sp.Integer(0)
eq = sp.Eq(x**2*y(x).diff(x,2) + x*y(x).diff(x) + x**2*y(x), 0)
lhs_expr = x**2*y(x).diff(x,2) + x*y(x).diff(x) + x**2*y(x)
sol1 = sp.dsolve(sp.Eq(lhs_expr, 0), y(x), hint='2nd_power_series_regular', n=8, x0=point)
y1 = sol1.rhs.removeO().subs(sp.Symbol('C1'), 1)
p, q = x**2, x
qp = sp.together(q/p)
weight = sp.exp(-sp.integrate(qp, x))
integrand = sp.series(weight/y1**2, x, point, 6).removeO()
antideriv = sp.integrate(integrand, x)
y2 = sp.expand(y1*antideriv)
print('y2 has log:', y2.has(sp.log))
print('y2 =', y2)
"
```

Expected: `y2 has log: True`, and `y2` matching the value already computed during design
(`-23*x**12/7962624 + ... - x**2*log(x)/4 + x**2/4 + log(x)` or equivalent after `expand`).

- [ ] **Step 4: Commit**

```bash
git add assets/js/sympy-worker.js
git commit -m "feat(series): close the Frobenius gap via reduction of order"
```

---

### Task 2: Retire `series-solution-fallback.js`'s duplicated helpers

**Files:**
- Modify: `assets/js/series-solution-fallback.js`

**Interfaces:**
- Consumes: `ODESolver.compileRealFx`, `ODESolver.withArbitraryConstants` (already exported —
  Phase 1/2 established this reuse pattern).
- No change to `SeriesSolutionFallback.solve`'s external interface.

- [ ] **Step 1: Add the `ODESolver` dependency to the UMD header**

In `assets/js/series-solution-fallback.js`, replace:

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SeriesSolutionFallback = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
```

with:

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ode-solver.js"));
  } else {
    root.SeriesSolutionFallback = factory(root.ODESolver);
  }
})(typeof self !== "undefined" ? self : this, function (ODESolver) {
  "use strict";
```

- [ ] **Step 2: Delete the local duplicates and their call sites**

Delete the local `function withArbitraryConstants(exprText) { ... }` and
`function compileRealFx(exprStr) { ... }` definitions entirely. In
`residualShrinksTowardPoint`, replace every call site:
- `compileRealFx(data.p)` → `ODESolver.compileRealFx(data.p)` (same for `data.q`, `data.r`)
- `compileRealFx(withArbitraryConstants(data.y))` → `ODESolver.compileRealFx(ODESolver.withArbitraryConstants(data.y))` (same for `data.yp`, `data.ypp`)

- [ ] **Step 3: Run the existing Node suites to confirm nothing broke**

```bash
node tests/verify-ode-solver.js
```

Expected: PASS (unaffected — this task doesn't touch `ode-solver.js` itself, just adds a new
consumer). There is no dedicated Node test file for `series-solution-fallback.js` today (its
`.solve` depends on `SympyClient`) — this is a structural refactor with no new Node-testable
surface, consistent with the file's existing test coverage.

- [ ] **Step 4: Commit**

```bash
git add assets/js/series-solution-fallback.js
git commit -m "refactor(series): reuse ODESolver.compileRealFx/withArbitraryConstants, drop local duplicates"
```

---

### Task 3: Label the new `"regular-singular-log"` kind

**Files:**
- Modify: `assets/js/series-solutions.js`

- [ ] **Step 1: Extend the kind-to-label mapping**

In `assets/js/series-solutions.js`, find:

```javascript
        const kindLabel = out.kind === "ordinary" ? "Ordinary point" : "Regular singular point";
```

Replace with:

```javascript
        const kindLabel = out.kind === "ordinary" ? "Ordinary point"
          : out.kind === "regular-singular-log" ? "Regular singular point (logarithmic case)"
          : "Regular singular point";
```

- [ ] **Step 2: Commit**

```bash
git add assets/js/series-solutions.js
git commit -m "feat(series): label the new logarithmic-case series result"
```

---

### Task 4: Docs update and manual QA

**Files:**
- Modify: `docs/ODE_PDE_ENGINE_PLAN.md`

- [ ] **Step 1: Add the Phase 4 completion note**

Find the `2026-08-02 — Phase 3 (Laplace Transform engine) shipped.` note (once Phase 3 has
landed — if this task runs before Phase 3 is merged, add this note directly after whatever the
most recent dated note is) and add:

```markdown
**2026-08-02 — Phase 4 (Series Solutions Frobenius fix) shipped.** Full plan:
`docs/superpowers/plans/2026-08-02-ode-engine-phase4-series.md`. Closed item #11's Frobenius
gap for real: `_series_solution`'s repeated-root and integer-difference-root cases now compute
a genuine second solution via reduction of order on SymPy's own (valid but incomplete) first
solution, instead of refusing. `series-solution-fallback.js` also retired its duplicated
`compileRealFx`/`withArbitraryConstants` in favor of `ODESolver`'s shared versions. Phases 5-6
(PDE, final docs rewrite) remain not started.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ODE_PDE_ENGINE_PLAN.md
git commit -m "docs(series): record Phase 4 completion"
```

- [ ] **Step 3: Full manual browser verification pass**

Serve `math-lab/` locally and open `engines/ode/methods/series-solutions.html`. Check:

1. **Repeated root:** `x^2*y'' + x*y' + x^2*y = 0` around `x0 = 0` (Bessel order 0) — must now
   solve and verify (previously refused), labeled "Regular singular point (logarithmic case)",
   and the shown series must contain a `log(x)` term.
2. **Integer-difference roots:** `x^2*y'' + x*y' + (x^2-1)*y = 0` around `x0 = 0` (Bessel order
   1) — same expectation.
3. **Nonzero expansion point, repeated root:** `(x-2)^2*y'' + (x-2)*y' + (x-2)^2*y = 0` around
   `x0 = 2` — must solve and verify, series in terms of `(x-2)` including a `log(x-2)` term.
4. **Regression check — cases that already worked must still work unchanged:** an ordinary-point
   example (e.g. `y'' - x*y = 0` around `x0 = 0`) and a distinct-non-integer-root regular-singular
   example already in this page's worked-example chips.
5. Check the browser console for JS errors.
6. If any check fails, fix the underlying issue and repeat this full pass before considering
   Phase 4 done. Do not proceed to Phase 5 (PDE) until this pass is clean.
