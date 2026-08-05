# Backlog — Numerical Engine, remaining methods

Status snapshot as of this planning pass. Source of truth for scope/order:
`math-lab/docs/CURRICULUM_ROADMAP.md` §1 and `FOUNDATION_CHECKLIST.md`.

**Built** (5 live pages + 2 planned in this batch): Bisection (1A.1), Fixed-Point
Iteration (1A.2), Newton-Raphson (1A.3), Secant (1A.4), Lagrange Interpolation +
Cubic Spline (1B.10/1B.14). **In this batch:** Trapezoidal Rule (1C.17, see
`01-trapezoidal-rule.md`), Simpson's Rule (1C.18, see `02-simpsons-rule.md`).

Everything below is **not yet turned into a detailed build plan**. Do not hand these to a
build agent without first writing a plan file for it in this same style (algorithm spec
with exact formulas, `algorithms.js` function signature, pre-verified hand-computed test
values via `node -e` before writing them down, HTML/JS file paths, plot design, card copy).
Producing 24 fully-detailed plans in one pass risks silent math errors going unreviewed —
this project's own stated discipline is one/two methods at a time, verify, then continue.
Pull the next 1-2 items off this list once the current batch is verified.

## Tier 1 (P1 — do next, roughly in this order)

1. **§1A.5 Method of False Position (Regula Falsi)** — root finding, bracketing like
   Bisection but weights by function value instead of midpoint. Natural cross-check:
   same test roots already used for Bisection/Newton/Secant in `tests/verify.js`.
2. **§1B.12 Newton's Divided-Difference Formula** — interpolation, alternate
   construction of the same polynomial Lagrange builds; good cross-check target against
   `Algorithms.runLagrange`-equivalent evaluation (see note below about `lagrange.js`).
3. **§1C.15 Numerical Differentiation** (forward/backward/central difference formulas)
   — straightforward, good candidate for a smaller/cheaper model.
4. **§1C.19 Romberg Integration** — builds directly on Trapezoidal's step-doubling
   (`h`, `2h` estimates) already introduced as "Est. error" in this batch; natural next
   integration method once Trapezoidal/Simpson's are live.
5. **§1G.24 Power Method** — first linear-algebra-flavored numerical method (dominant
   eigenvalue/eigenvector); check whether this overlaps with anything already planned in
   the Linear Algebra engine before starting, to avoid duplicate work.

## Tier 1 (P1, continued)

6. §1A.6 Newton's Method for Multiple Roots
7. §1A.9 Horner's Method + Deflation
8. §1B.11 Neville's Method
9. §1C.16 Richardson Extrapolation

## Tier 2 (P2)

10. §1A.7 Aitken's Δ² / Steffensen's Method
11. §1B.13 Hermite Interpolation
12. §1C.20 Adaptive Quadrature
13. §1C.21 Gaussian Quadrature
14. §1F.22 Discrete Least Squares
15. §1G.25 Inverse Power Method
16. §1G.26 QR Algorithm
17. §1H.27 Newton's Method for Nonlinear Systems

## Tier 3 (P3)

18. §1A.8 Müller's Method
19. §1F.23 Chebyshev Polynomials & Economization
20. §1H.28 Broyden's Method
21. §1I.29 Shooting Method
22. §1I.30 Finite-Difference Boundary Value Problems

## Explicitly out of scope for this engine

§1D/1E (Gaussian elimination, LU decomposition, Jacobi/Gauss-Seidel, etc.) are
cross-referenced in the roadmap to the **Linear Algebra Engine**, not this one — don't
pull them into a numerical-engine plan file.

## One open inconsistency to resolve before continuing far into this list

`lagrange.js` computes its Lagrange basis coefficients locally
(`lagrangeCoeffs(points)`) instead of through a shared `Algorithms.runLagrange` in
`algorithms.js`, unlike every other method. Item 2 above (Newton's Divided-Difference)
naturally wants to cross-check against Lagrange's result at the same points — decide then
whether to backfill `Algorithms.runLagrange` for consistency (preferred, matches the "one
implementation, two callers" rule) or treat Lagrange as a deliberate, documented exception.
