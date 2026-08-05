# Complex Analysis Engine — Phase 1 (completed work)

**Note:** `docs/COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md` (last updated 2026-07-24) is stale — it says
"Phase 3 (contour integration) is next" and lists Phase 3-6 topics as "Planned." Verified
directly against the real files on 2026-07-31: 11 of 17 planned topics are actually shipped.
`COMPLEX_ANALYSIS_ENGINE_PLAN.md` (V1) is superseded by V2 and kept only as a historical record
of the pre-animated-map visual paradigm — no separate extraction needed, same underlying work.

## Shipped (11/17, verified against real pages, backend, and passing tests)

| Topic | Page / backend | Evidence |
|---|---|---|
| Complex Arithmetic & the Plane | `complex-arithmetic.html`/`.js` | `verify-complex.js` 56 passed |
| Complex Functions & Domain Colouring | `complex-functions.html`/`.js` + `domain-coloring.js` | `verify-domain-coloring.js` 28 passed |
| Analyticity & Cauchy-Riemann | `cauchy-riemann.html`/`.js` | part of `verify-complex-symbolic.js`, 52 passed |
| Harmonic Functions & Conjugates | `harmonic-functions.html`/`.js` | — |
| Complex exp, log, powers | `complex-exp-log-powers.html`/`.js` | — |
| Complex trig/hyperbolic | `complex-trig-hyperbolic.html`/`.js` | — |
| Contour Integration (parametrised) | `contour-integration.html` ("Contour Integration & Residues") | `ComplexResidues.contourIntegral`, adaptive Gauss-Kronrod verify gate; `verify-complex-residues.js` 27 passed |
| Laurent Series & singularity classification | `laurent-singularities.html`/`.js` | `ComplexResidues.laurentSeries` + `.classifySingularity` — limit-based, deliberately not series-parse-based (SymPy's `series()` fails on `e^(1/z)`/`sin(1/z)`) |
| Residues & the Residue Theorem | folded into the contour-integration page/backend | same `contourIntegral` — finds residues, sums them, `2πi·ΣRes`, independently verified |
| Real Integrals by Residues | `real-integrals-residues.html` | `ComplexResidues.realIntegralByResidues`, upper-semicircle closure, tanh-sinh numeric verification |
| Möbius Transformations | `mobius-mapping.html`/`.js` | fixed points, pole→∞, multiplier, type classification (parabolic/elliptic/hyperbolic/loxodromic); `verify-mobius.js` 36 passed — exceeds the plan's original scope |

## Not started (6/17)

- **Cauchy-Goursat Theorem** — no page specifically teaches "closed contour + analytic ⇒ 0" as
  its own topic (the general contour tool would only produce 0 as an emergent case).
- **Cauchy Integral Formula & derivatives** — `f(a) = (1/2πi)∮f(z)/(z-a)dz` not implemented.
- **Taylor Series in ℂ as a dedicated topic** — no convergence-circle visualization; only
  Laurent + classification currently exists.
- **Argument Principle & Rouché's Theorem** — no matching file.
- **Conformal Mapping (general, non-Möbius)** — only the Möbius special case exists.
- **Schwarz-Christoffel** — always marked stretch/P3 in the plan; confirmed nothing built.

## Architecture (established)

- Same layering as Calculus Engine: page → DOM-only JS → `cas-client.js` → `cas-worker.js` →
  `complex-symbolic.js` (pure, DOM-free, Node-testable) + `complex.js` (shared complex
  arithmetic, promoted out of `linalg-algorithms.js`'s private `cx` helper) + `complex-residues.js`
  (shared residue-theorem module, reused across contour-integration/laurent-singularities/
  real-integrals-residues).
- Numeric contour integration is the primary verify gate for the whole engine — independent of
  the CAS, cheap, catches essentially every symbolic mistake that matters.
- `decompose()` in `complex-symbolic.js` never asks nerdamer to separate a mixed real+imaginary
  expression (nerdamer's `realpart()`/`imagpart()` are confirmed wrong whenever a real term is a
  product of ≥2 distinct non-numeric factors — not an edge case, the general case past a bare
  quadratic). Instead it walks the math.js parse tree bottom-up carrying u/v as separate
  nerdamer strings, combined via ordinary complex-arithmetic identities. Deliberately refuses
  `sqrt`/`log`/inverse-trig by name (genuinely multivalued, needs a declared branch).
- Branch-explicit design: `Complex.logBranch`/`powBranch` state the branch on screen rather than
  silently picking one; clicking a point lists its other branches with a back-check per row.

## Minor known issue (not a functional bug)

The on-page blurb for Real Integrals by Residues still describes an outdated numeric method
("tangent substitution"); the actual code was upgraded to a tanh-sinh transform. Copy fix only.
