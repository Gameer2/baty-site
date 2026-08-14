# Syntropy node archetype redesign

Date: 2026-08-14
Status: design (awaiting review)
Approved prototype: `prototypes/syntropy-archetype-nodes.html`

## Problem

Every Syntropy canvas node renders as one uniform card: a stack of text inputs and a
few `toFixed(3)` numbers. That is "cheap squares with numbers" — neither premium nor
functional. Two structural causes:

1. **The output type system is too coarse to carry what a method produced.**
   `PortOutputKind` is only `"number" | "plot2d" | "text"` (`portSpecs/types.ts:23`).
   Iteration history, matrix factors, eigenpairs, solution vectors, step traces,
   sampled distributions — all collapse to a final scalar or get thrown away. The node
   *cannot* show what the method did, because the type never carries it. The card UI is
   only honest about what it has: a couple of numbers.

2. **One card for every purpose.** `SyntropyNodeCard.tsx` treats a root-finder, an LU
   decomposition, a direction field, and a normal distribution identically. Methods
   with completely different purposes and completely different natural visualizations
   all get the same architecture.

## Goal

Nodes that look premium **and** are functional: each node's inputs are *functional
visuals* (editable matrix grids, draggable axis endpoints, sliders that morph a curve
live, a draggable point on a field) and its output is the method's genuine product,
rendered the way that product is meant to be seen (a filling trace table, a curve with
partition pieces, `A = LU` grids, a slope field with a solution curve, a shaded
distribution).

Categorize nodes by **visualization paradigm of the output** — the archetype — with
input editors chosen to be functional visuals that match that paradigm. One rule,
applied to all methods.

## Scope

**Rebuild:** the node UI layer (`SyntropyNodeCard.tsx` + `.scss`) and the output side of
the `PortSpec` contract (`PortOutputKind`, the `outputs[]` of all 90 registered specs).

**Keep unchanged:** the Excalidraw substrate, `createSyntropyNode.ts`, `NodeOverlay.tsx`,
the wiring/compute engine (`wiring.ts` — `computeWiredResults`, Kahn topological sort),
`portalPrefill.ts`, the `portSpecs/*` `compute()` bodies (pure math, untouched), and the
lab pages themselves.

This is a UI-layer + output-typing change. It does not touch method math.

## The archetype principle

A node's archetype = the visualization paradigm of its **output**. Input editors are then
chosen as functional visuals that fit that paradigm. Both sides are visuals; the
categorization falls out of the output.

Six archetypes:

| Archetype | Output is | Example |
|---|---|---|
| Trace | an iteration sequence | Newton–Raphson steps |
| Real-line plot | a curve over an interval | Riemann sum |
| Matrix grid | one or more matrices / vectors | LU = L·U |
| Field | a vector field + solution curve | ODE direction field |
| Distribution | a probability density / mass | Normal pdf |
| Scalar | a single value or compact value set | gcd, determinant |

## Output type system

Replace `PortOutputKind` with a union that actually carries the shape. The kind tags
the data; the archetype (derived from the primary output's kind) picks the renderer.

```ts
export type PortOutputKind =
  | "number"        // single scalar (kept)
  | "trace"         // iteration rows: { i, point, residual, … }[]
  | "curve"         // sampled f over [a,b] + optional partition/data overlay
  | "matrix"        // number[][]  (one or more named factors)
  | "eigenpairs"    // { lambda, vector }[]
  | "field"         // slope samples + solution path
  | "distribution"  // { x, pdf, cdf }[] + params (μ, σ, …)
  | "text";         // opaque string (kept)
```

`ComputeResult.outputs` values are typed to match each output's `kind`. A spec may emit
a primary rich output **and** a `number` summary (e.g. LU emits `matrix` factors **and**
a `number` det) — only the `number` summary remains wire-compatible downstream, matching
the existing `number → number` wiring.

Archetype derivation from a spec's outputs:

- a `trace` output → **Trace**
- a `curve` output → **Real-line plot**
- a `matrix` or `eigenpairs` output → **Matrix grid**
- a `field` output → **Field**
- a `distribution` output → **Distribution**
- only `number` / `text` outputs → **Scalar**

The spec author declares outputs; the node dispatches on kind. No manual archetype tag.

## Input kinds

Add one kind; the rest are kept:

```ts
export type PortInputKind =
  | "expression" | "number" | "points" | "coeffs" | "vector" | "matrix" | "expressions"
  | "point";   // NEW — a single draggable point on a canvas (field initial condition, etc.)
```

## The six archetypes

For each: input editors (functional visuals) and the output renderer.

### 1. Trace  (numerical accent `#5c939f`)
**Inputs:** expression field(s) + numeric wells for initial guess / tolerance.
**Output:** a step table that fills in as the iteration runs — columns for the iteration
index, the current point, the function/residual value, and the step error — plus a small
trajectory plot of the iterate over f(x). The latest row is accent-highlighted; the
converged row turns green.
**Methods:** bisection, false-position, fixed-point-iteration, newton-raphson, secant,
newton-multiple-roots, mullers-method, steffensen, numerical-diff, richardson-diff,
power-method, inverse-power-method, newton-nonlinear-systems, broydens-method,
iterative-solvers, conjugate-gradient, euclidean-algorithm, extended-euclidean.

### 2. Real-line plot  (calculus accent `#4f9e82`)
**Inputs:** expression field + draggable `[a,b]` endpoints on the plot + an `n` slider +
rule/mode toggle.
**Output:** the curve over `[a,b]` with the method's overlay drawn on it — partition
rectangles (quadrature), interpolant through data points (interpolation), fitted line
through a scatter (least-squares / regression). A running summary (area, error) lives
below.
**Methods:** riemann-sums, trapezoidal-rule, simpsons-rule, romberg-integration,
adaptive-quadrature, gaussian-quadrature, lagrange-interpolation, hermite-interpolation,
neville, newton-dd, least-squares (numerical), chebyshev-econ, linear-regression,
multiple-regression, least-squares (linalg).

### 3. Matrix grid  (linear-algebra accent `#8570b3`)
**Inputs:** an editable cell grid (the input matrix / vectors).
**Output:** the result matrix or factors shown side-by-side with equality glyphs —
`A = L · U`, `A = Q · R`, `A = U Σ Vᵀ`, `A → RREF`, `A = P D P⁻¹` — plus a scalar summary
(det, rank, condition) where relevant. Eigenpairs render as a list of `(λ, v)` rows.
**Methods:** row-reduction, linear-systems, four-subspaces, independence-basis,
matrix-inverse, lu-decomposition, eigenvalues, diagonalization, gram-schmidt, svd,
spectral-theorem, cholesky, qr-algorithm, markov-chains, linear-transformations.

### 4. Field  (ode accent `#4f8fc0`)
**Inputs:** a `dy/dx` (or system) expression field + a draggable initial point on the
canvas.
**Output:** a slope field with the integrated solution curve drawn through the dragged
point (Euler in the prototype; the real node reuses the method's own solver). For BVP
methods the curve is the boundary-value solution profile; for linear-transformations the
"field" is a warped unit grid (the same renderer, different sample generator).
**Methods:** shooting-method, finite-difference-bvp, linear-transformations (grid-warp
variant). Future: the not-yet-registered ODE/PDE and complex direction-field methods land
here when their async `run` mode unblocks.

### 5. Distribution  (statistics accent `#c99a3c`)
**Inputs:** parameter sliders that morph the curve live (μ, σ, df, n, p) + a draggable
`x` + tail/mode toggle.
**Output:** the pdf/pmf curve with the relevant tail shaded (`P(X ≤ x)` / `P(X ≥ x)`), or
a histogram + overlay for sample-based methods. The probability / p-value / interval is
the live summary.
**Methods:** continuous-distributions, discrete-distributions, descriptive-statistics,
sampling-distributions-clt, confidence-intervals, one-sample-t-test, two-sample-paired-tests,
chi-square-tests, anova-f-test, markov-chains (stationary distribution view).

### 6. Scalar  (number-theory accent `#a3623c`)
**Inputs:** numeric wells / expression field.
**Output:** one value (or a compact value set with no spatial structure — a factor list, a
prime list, a Bezout pair) rendered as accent stat rows. This is both the genuine product
for single-result methods **and** the wiring-source node that feeds a number downstream.
**Methods:** horner, determinant, divisibility, linear-diophantine, sieve-of-eratosthenes,
prime-factorisation, primality-testing, distribution-of-primes, modular-arithmetic,
linear-congruences, chinese-remainder-theorem, fermat-euler-theorem, wilsons-theorem,
euler-totient, divisor-functions, mobius-function, order-of-element, primitive-roots,
discrete-logarithm, quadratic-residues, quadratic-reciprocity, jacobi-symbol,
modular-exponentiation, rsa, diffie-hellman, classical-ciphers, continued-fractions,
pells-equation, frobenius-coin, probability-combinatorics.

A few methods sit on a boundary and get assigned by output during implementation (e.g.
`markov-chains` has both a transition-matrix view and a stationary-distribution view —
primary output decides). The mapping above is the design's coverage check, not a lock;
the dispatcher reads the spec's declared output kinds, so a spec that changes its mind
just changes its outputs.

## Wiring model

Keep `computeWiredResults` (Kahn topological sort, cycle detection). Compatibility today
is `number → number` only. Expand to **kind-equal** matching:

- `number → number` (existing) — scalar feeds a numeric input.
- `matrix → matrix` — a factor output feeds a matrix input.
- `distribution → distribution`, `field → field`, `point → point` — same.

A `trace`/`curve`/`eigenpairs` output is consumed in-place by its own node and is not
wired onward (it has no matching input kind) — except a trace's *final value*, which the
spec also emits as a `number` if downstream-consumable. Cross-kind promotion (e.g.
`matrix → number` via det) is left out of v1; a method that wants it emits the `number`
itself.

Type-mismatched drops show the existing toast (`"X output can't feed a Y input"`).

## Node UI layer rebuild

Replace `SyntropyNodeCard.tsx` (one component) with a small dispatcher + one renderer per
archetype, sharing the premium shell already in `SyntropyNodeCard.scss`:

- `syntropy/nodes/NodeShell.tsx` — the shared chrome (header, accent spine, radial glow,
  portal button, port dots, drag handle). What the prototype's `.node` / `.nd-head` /
  `.portal` / `.port` already express.
- `syntropy/nodes/dispatch.ts` — picks the renderer from the spec's primary output kind.
- `syntropy/nodes/TraceNode.tsx`, `RealLineNode.tsx`, `MatrixNode.tsx`, `FieldNode.tsx`,
  `DistributionNode.tsx`, `ScalarNode.tsx` — the six archetype bodies. Each owns its
  input editors + its output viz, all `pointer-events: auto` inside the
  `pointer-events: none` shell (the existing pass-through pattern).
- `syntropy/nodes/portDots.ts` — the half-in/half-out port dots, now keyed by output/input
  kind so wiring can kind-check on hover.
- `SyntropyNodeCard.scss` → split into `nodes/NodeShell.scss` (shared) + one small
  `.scss` per archetype for its viz-specific styling. The existing premium tokens
  (inputs-as-wells, radial glow, accent spine, fill-sweep portal, cubic-bezier easing,
  focus ring, mobile 16px guard) move into `NodeShell.scss` unchanged.

`NodeOverlay.tsx` keeps mounting the shell into the embeddable's DOM layer; only the
body it renders changes. `createSyntropyNode.ts` is untouched.

## What stays untouched

- `wiring.ts` compute engine (only `compatibleTargetInputKeys` widens).
- `portalPrefill.ts` and every `compute()` body — pure math, no changes.
- All 90 lab pages and the CAS architecture.
- `engineAccents.ts` (the real per-engine accents the prototype already uses).

## Migration

The 90 specs are rewritten output-by-output, not all at once:

1. Land the type union + dispatcher + `NodeShell` + `ScalarNode` first (Scalar reuses the
   old card almost verbatim, so the first slice ships without regressing anyone).
2. Add archetypes in order of method count: Matrix grid (18), Trace (18), Scalar (29),
   Distribution (12), Real-line plot (15), Field (3+future).
3. Each spec's `compute()` stays the same; only its `outputs[]` declaration and what it
   puts into `ComputeResult.outputs` change (it already computes the rich data — it just
   wasn't declaring or returning it). Verify with the existing `tests/` suites, which
   assert on `outputs` values.

Because the dispatcher reads the spec's declared output kinds, a spec can be migrated
independently — an unmigrated spec still renders via `ScalarNode` (its current `number`
outputs), so the migration is incremental with no big-bang cutover.

## Testing

- `tests/SyntropyNodeCard.test.tsx` → `tests/nodes/dispatch.test.tsx` (dispatch picks the
  archetype from output kinds) + one render test per archetype.
- `tests/compileExpression.test.ts` — unchanged.
- The 90 portSpec `compute()` outputs are already asserted by the engine verify suites;
  add assertions that each spec's declared `outputs[].kind` matches the shape its
  `compute()` actually returns (a one-line-per-spec contract test).

## Open questions

1. **Eigenpairs as its own kind vs. a `matrix` variant.** Kept separate above so the
   Matrix-grid renderer can show `(λ, v)` rows distinctly from factor grids. Confirm.
2. **`linear-transformations` grid-warp.** Lives under Field here (warped unit grid), but
   its input is a matrix, not a field equation. Alternative: a Matrix-grid variant that
   overlays a warped grid. Decide at implementation.
3. **Trace's final-value `number` output.** Should every Trace spec auto-emit a `number`
   summary of its converged value, or only specs that name one? Default: the spec
   declares it explicitly.