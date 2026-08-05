# Foundation Checklist — completed history (archived 2026-08-02)

Split out of the root `FOUNDATION_CHECKLIST.md` on 2026-08-02 so the live checklist only
carries still-open items. This file is the completed record; nothing here needs action.

## Done (2026-07-20 reorganization)

- [x] Picked one canonical live folder, then restructured it into `math-lab/`
      (`numerical-engine-redesign/` → `numerical-engine/` → `math-lab/`)
- [x] Archived the superseded pre-redesign build → `archive/numerical-engine-v1/`
- [x] Archived the unrelated WorldQuant Foundry template → `archive/worldquant-foundry-template/`
      (its visual identity was already extracted into the site's design system per `DESIGN_SYSTEM.md`)
- [x] Flattened the site so every engine — including Numerical Engine — is a peer directory
      under `math-lab/engines/`; the former `prototypes/index.html` hub is now the site root
      (`math-lab/index.html`); every internal link and asset path rewritten and verified
      (0 broken local references)
- [x] Separated planning docs into `math-lab/docs/`
- [x] Separated course reference material into `reference/` (gitignored — copyrighted)
- [x] Root `README.md` — structure + how to run locally
- [x] `git init`, `.gitignore`, first commits, default branch renamed to `main`

## Done (2026-07-20 first Tier 0 build)

- [x] Added `math-lab/tests/verify.js` — Numerical Engine regression harness, runs against the
      shipped `assets/js/algorithms.js`.
- [x] Refactored `runBisection`/`runFixedPoint`/`runNewton` into `assets/js/algorithms.js`.
- [x] Built Fixed-Point Iteration and Newton-Raphson Method.
- [x] Built Secant Method.
- [x] Built Cubic Spline Interpolation + Runge's-phenomenon toggle (folded into the Lagrange
      Interpolation page as a fit-mode toggle, not a separate page).

## Decision (2026-07-20): finish Numerical Engine before other engines

Explicit call at the time: build out the rest of the Numerical Engine (Section 1 of
`math-lab/docs/CURRICULUM_ROADMAP.md`) before starting a second engine. Superseded by
subsequent work — as of 2026-08-02 all 7 engines are built, not just Numerical.

## Then — feature work (superseded)

The original next-up list (Trapezoidal Rule, Simpson's Rule, LU Decomposition, ODE separable
equations, Statistics descriptive explorer, etc.) — every item on it has since shipped. See
`math-lab/docs/CURRICULUM_ROADMAP.md` §10 (Cross-Engine Build Order) for what, if anything,
remains; as of 2026-08-02 that's just Complex Analysis's Schwarz–Christoffel page (P3) and a
handful of low-priority Statistics/ODE items — see the roadmap doc directly, don't duplicate
the list here.
