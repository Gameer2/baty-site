# ODE Engine Phase 4 — Series Solutions: closing the Frobenius gap — Design

**Context:** `series-solutions.js`/`series-solution-fallback.js` solve homogeneous linear
2nd-order ODEs by power series (Boyce & DiPrima ch. 5), wrapping SymPy's
`2nd_power_series_ordinary`/`2nd_power_series_regular` `dsolve()` hints. The regular-singular
hint has a confirmed gap (documented in the code's own comments, re-verified this session
against a real `sympy` install): for a repeated indicial root, or roots differing by an
integer, the hint silently returns only ONE of the two independent solutions — no error, an
incomplete general solution. The page currently refuses cleanly in both cases rather than risk
showing that incomplete answer. This is `ODE_PDE_ENGINE_PLAN.md` §5C-adjacent item #11 ("real
Frobenius/power-series engine... all 3 Frobenius cases"), marked ⚪ Not started.

**Goal:** Close the gap for real, not just re-confirm it. Also retire this page's locally
duplicated `compileRealFx`/`withArbitraryConstants` in favor of `ODESolver`'s shared,
already-exported versions (Phase 1-3 established this reuse pattern; this page never migrated).

## Finding (verified against real SymPy this session)

The hint's first solution `y1` (the larger-root/repeated-root series) is still valid and
complete even in the two problem cases — only the *second* independent solution is missing.
Given `y1`, the standard **reduction-of-order** formula produces the second solution directly:

```
y2 = y1 * ∫ [ e^(−∫ (q/p) dx) / y1² ] dx
```

This is one general technique, not two hand-coded branches for "repeated root" vs
"integer-difference roots" — whether a `log(x−x0)` term appears (and with what coefficient) falls
out of the integral automatically; no case-detection needed beyond "the direct hint doesn't
apply."

Verified numerically (finite-difference residual of the ODE, at points near the expansion
point) on both previously-refused cases, at both `x0=0` and a nonzero point (`x0=2`):

| Case | Equation | Residual (4 sample points) |
|---|---|---|
| Repeated root | Bessel order 0 at x0=0 | ~1e-7 to 2e-7 |
| Repeated root | same, shifted to x0=2 | ~2e-7 to 1e-5 |
| Integer-difference roots | Bessel order 1 at x0=0 | ~3e-7 to 5e-6 |

All comfortably within the existing verification tolerance this codebase already uses
elsewhere. `sp.integrate` on the (truncated, Laurent-polynomial) integrand never risks
`NotImplementedError` — termwise integration of `xⁿ` and `x⁻¹` is always closed-form — so the
new code path has no new failure mode beyond what a `try`/`except` + numeric re-verification
already guards against everywhere else on this site.

## Scope

1. **Frobenius fix:** in `_series_solution` (`sympy-worker.js`), replace the two `raise
   ValueError(...)` branches (repeated root; integer-differing roots) with the reduction-of-order
   computation above. Both cases collapse into one code path — no separate "case 2" vs "case 3"
   branch. If SymPy raises on the underlying computation, refuse honestly (same discipline as
   every other refusal on this site) rather than propagate a crash.
2. **General solution shape:** the working `ordinary`/`regular-singular` (non-integer-difference)
   cases already return a full two-constant (`C1`, `C2`) general solution from the hint directly.
   The new path constructs the same shape explicitly: `C1*y1 + C2*y2`.
3. **New `kind`:** `"regular-singular-log"`, distinct from `"regular-singular"` — the page
   labels it "Regular singular point (logarithmic case)" so students see which Frobenius case
   they're in, matching the textbook's own three-way split.
4. **Cleanup (the "same kind of cleanup" Phase 1-3 established):** `series-solution-fallback.js`
   currently has its own local `compileRealFx`/`withArbitraryConstants` (a near-duplicate of
   `ODESolver`'s exported versions, missing `Heaviside`/`DiracDelta` handling this page never
   needs anyway, and with a smaller constant table — irrelevant here since this page only ever
   needs `C1`/`C2`, and both give identical values for those). Swap to `ODESolver.compileRealFx`/
   `ODESolver.withArbitraryConstants` directly; delete the local copies.
5. Out of scope: named special functions (Bessel, Legendre) as first-class results — the course
   doesn't cover them, per `ODE_PDE_ENGINE_PLAN.md`'s own note on item #11. This fix produces a
   correct *series* for equations that happen to be Bessel's equation, but doesn't recognize or
   name the result as a Bessel function.

## Architecture

**`sympy-worker.js` (`_series_solution`):** the `else` branch (regular singular point) currently
does:
```
roots = sp.solve(indicial_eq, rsym)
if len(roots) != 2: raise ValueError(...)          # repeated root -> REMOVE, replace with fix
diff = simplify(roots[0]-roots[1])
if diff.is_integer: raise ValueError(...)           # integer difference -> REMOVE, replace with fix
sol = dsolve(..., hint="2nd_power_series_regular", ...)
kind = "regular-singular"
```
New shape: try the direct hint whenever `len(roots) == 2 and not diff.is_integer` (unchanged,
still the cheapest/most direct path when it applies); otherwise take the reduction-of-order path
using the hint's own `y1` (called with the SAME hint — it still returns a valid first solution
even in these cases, that's the documented gap: incomplete, not wrong).

**`series-solution-fallback.js`:** no structural change to `residualShrinksTowardPoint` — it
already generically evaluates `y`/`yp`/`ypp` from compiled expressions, and `log(...)` is already
in its evaluation scope (via `realLog`), so a `y` string containing `log(x-2)` verifies exactly
the same way an existing series result does. Only the helper-function source changes (reuse
`ODESolver`'s versions instead of local copies).

**`series-solutions.js`:** extend the `kind`-to-label ternary to a three-way switch including
`"regular-singular-log"`.

## Reuse map

| Need | Reuse |
|---|---|
| Expression compilation for verification | `ODESolver.compileRealFx` (was a local duplicate) |
| Arbitrary-constant substitution for verification | `ODESolver.withArbitraryConstants` (was a local duplicate) |
| Residual-shrinks-toward-point check | Unchanged, `series-solution-fallback.js`'s own (genuinely unique to this page) |

## Error handling

- If `sp.integrate`/`sp.series` on the reduction-of-order computation raises for some equation
  this fix doesn't anticipate, catch it and refuse honestly with a clear message — never a
  crash, never a guessed result.
- The existing residual-shrinks-toward-point numeric check remains the final gate before
  anything is shown, exactly as today — the new code path doesn't bypass it.

## Testing

- Node-runnable: none of the new Python logic is Node-testable (same Pyodide constraint as
  every other worker op). The `series-solutions.js`/`series-solution-fallback.js` label and
  reuse changes are small enough not to need new dedicated unit tests beyond what already
  exists.
- Manual browser pass: Bessel order 0 (repeated root) and order 1 (integer-difference) at
  `x0=0`, plus at least one at a nonzero expansion point — all three previously refused, now
  expected to solve and verify. Confirm the existing `"ordinary"` and `"regular-singular"`
  (non-integer-difference) cases still work unchanged.
