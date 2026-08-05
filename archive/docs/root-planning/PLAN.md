# The Lab — Site Plan & Current State

Last updated: 2026-07-19

## What this is

"The Lab" is the umbrella suite around **Numerical Engine** (the real, live product). It's a
family of client-side computational math tools — no server round-trip, everything computed
in the browser. Numerical Engine is the only one with a shipped compute core; the other six
are UI/interaction prototypes that already run real math client-side, built to show how the
full suite will look and feel before each gets promoted to a standalone product.

- **Hub (site root):** `math-lab/index.html` — "The Lab" landing page, links out to the
  flagship and all six prototype engines.
- **Flagship (live):** `math-lab/engines/numerical/` — `index.html`, `methods.html`,
  `methods/bisection.html`, `methods/lagrange-interpolation.html`
- **Prototype suite:** `math-lab/engines/{calculus,linear-algebra,statistics,ode,
  number-theory,complex}/index.html` — one directory per engine, sibling to `numerical/`,
  all sharing `assets/proto/proto.css` + `assets/proto/proto.js` (+ `assets/proto/
  ode-solver.js` for ODE). The Optimization and Graph prototypes were removed on 2026-07-30.

> Restructured 2026-07-20: originally `numerical-engine-redesign/` (flat, numerical-engine-
> centric: flagship at the root, everything else nested under `prototypes/`). Renamed to
> `numerical-engine/`, then reorganized into `math-lab/` with every engine — including
> Numerical Engine — as a peer under `engines/`, and the former `prototypes/index.html` hub
> promoted to the site root (`math-lab/index.html`). The old pre-redesign build is archived
> to `archive/numerical-engine-v1/`. Every internal link/asset path was rewritten and
> verified (no broken local references) as part of this move — see root `README.md` for the
> full tree.

## Naming

| Slot | Name | Status |
|---|---|---|
| Umbrella / hub | **The Lab** | site title, header logo, footer |
| Flagship | **Numerical Engine** | live |
| 1 | **Calculus Engine** | prototype |
| 2 | **Linear Algebra Engine** | prototype |
| 3 | **Statistics Engine** | prototype |
| 4 | **ODE Engine** | prototype |
| 5 | **Number Theory Engine** | prototype |
| 6 | **Complex Engine** | prototype |

Every page title follows `[Engine Name] — The Lab`. No other renaming pending.

## Shared design system

- **Palette (base):** core-black `#090909`, rich-carbon `#111`, urban-smoke `#1b1b1b`,
  pulse-ash `#7d858c` (tertiary text — bumped from the original `#535353`, which failed
  contrast on black), off-white `#e7e7e7`, neural-fog `#dadada`, electric-teal `#5c939f`
  (default accent), infrared `#ed6d40` (universal CTA / highlight color, never varies),
  validation-green `#59a993`, validation-red `#cb3500`.
- **Per-engine accent:** each prototype scopes its own `--electric-teal` via a one-line
  inline `<style>` override in `<head>`. Nothing else about the shell changes — same header,
  cards, panels, tables, buttons everywhere. Current accents: Calculus `#4f9e82`,
  Linear Algebra `#8570b3`, Statistics `#c99a3c`, ODE `#4f8fc0`, Optimization `#9ec23f`,
  Graph `#c15a86`.
- **Type:** Fraunces (serif, headings) / Roc Grotesk (display) / Azeret Mono (labels, data).
- **Fonts sizes** were bumped one notch across the board (base tokens in `engine.css`) for
  legibility — affects flagship and prototypes alike.
- **Shared components:** `.workspace` (380px input rail + output), `.panel`, `.card`,
  `.result-strip`, `.formula-block` (reference/result variants), `.data-table`,
  `.math-keypad`, `.chip-row`, `.step-controls`, `.scene-wrap` (3D canvases),
  `.matrix-grid` / `.adj-table` (numeric grid inputs).
- **Mobile:** `.field-row` stacks under 520px (fixed globally in `engine.css`); wide tables
  scroll horizontally inside their own wrapper.
- **Accessibility:** decorative 3D scenes and the graph SVG are `aria-hidden` (their data
  already exists as real text/tables alongside them); dynamic status regions use
  `aria-live="polite"`.

## Engine-by-engine capabilities

### Numerical Engine (live)
Bisection method, Lagrange interpolation. Real compute core, iteration tables, live plots.

### Calculus Engine
- **Derivative & Integral** — symbolic derivative (`math.derivative`), midpoint Riemann-sum
  integral, live plot with rectangles.
- **Taylor Series** — coefficients via repeated symbolic differentiation evaluated at a
  center point, degree slider (0–10), polynomial overlaid on f(x). Verified against the
  known Maclaurin series for sin(x).

### Linear Algebra Engine
- **Transform (2×2)** — det/trace/rank/eigenvalues (real or complex), live 3D grid
  transform under the matrix, singular-matrix warning.
- **Solve Ax=b (3×3)** — Gaussian elimination with partial pivoting, step-by-step augmented
  matrix, back-substitution. Verified against two known textbook systems.

### Statistics Engine
- **Hypothesis Test** — one-sample t-test, exact p-value via a regularized incomplete beta
  function (Lanczos approximation), histogram with H₀/x̄ markers.
- **Linear Regression** — ordinary least squares on pasted (x, y) pairs, R², scatter + fit
  line. Verified against a known slope/intercept/R² example.

### ODE Engine
Direction field for any f(x, y); Euler and RK4 paths overlaid (RK4 error ~340× smaller than
Euler at the same step size in testing); closed-form exact solution auto-detected whenever
f(x, y) is linear in x and y (sampled numerically, not string-matched — works for the whole
class, not one hardcoded equation).

## What's genuinely live vs. illustrative

Every algorithm above is **actually computed** client-side and was numerically verified
against a known answer (not hardcoded output) — this is true even in the six "prototype"
engines. What makes them prototypes rather than shipped products:
- No dedicated production polish pass (only the flagship has been through that)
- Node counts, matrix sizes, and iteration caps are capped for UI simplicity (e.g. Graph
  maxes at 8 nodes, Linear Algebra's solver is fixed at 3×3)
- Not yet linked from the flagship's own navigation — only reachable via the hub

## Persistence & state

Every engine autosaves its inputs to `localStorage` under `engine-lab:<name>` and restores
on reload (`Proto.saveState` / `Proto.loadState` in `assets/proto.js`). The hub reads all
six keys and shows a "Continue where you left off" section — hidden entirely for first-time
visitors, populated with a real one-line summary of saved work for returning ones.

## Known technical notes

- 3D scenes (`Proto.initMatrixScene`, `Proto.initSurfaceScene`, `Proto.initRipple`) return a
  `{ dispose() }` handle. Any code that recreates a scene on input change **must** call the
  previous handle's `dispose()` first — this was a real bug (leaked WebGL contexts / render
  loops) that's now fixed everywhere it applied.
- The hub hero has a GSAP entrance sequence (header → background → title lines → subtext →
  buttons) and a mouse-reactive ripple layer on fine-pointer devices only; both degrade to an
  instant, static reveal under `prefers-reduced-motion` or if GSAP fails to load.

## Open items / possible next steps

- Decide whether to promote any prototype engine to a second "live" product
- Link the flagship's own nav to the hub (currently one-directional: hub → flagship)
- Consider whether Linear Algebra's solver should extend beyond 3×3, and Graph beyond 8 nodes
- Mobile has been hardened at the CSS level but not verified on a real device
