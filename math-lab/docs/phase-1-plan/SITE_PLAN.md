# Site Plan — Phase 1 (completed work)

**Note: `docs/PLAN.md` is severely stale** (last updated 2026-07-19, near the start of the
project). It describes every engine except Numerical as a 1-2-feature "prototype" — that is no
longer true for any of them. The individual engine plan extractions in this folder
(`CALCULUS_ENGINE.md`, `NUMBER_THEORY_ENGINE.md`, `COMPLEX_ANALYSIS_ENGINE.md`,
`ODE_PDE_ENGINE.md`, `SYMBOLIC_KERNEL.md`) are the current source of truth for what each engine
actually does today. What's extracted below is only the durable, still-architecturally-true
site-level structure and conventions — not the per-engine capability claims, which are obsolete.

## Site structure (still current)

- Hub: `math-lab/index.html` — landing page linking to every engine.
- One directory per engine under `math-lab/engines/<name>/`, each with its own `index.html` +
  `methods.html` catalog + `methods/<page>.html` per topic — the pattern every engine plan
  above confirms was followed consistently.
- The Optimization and Graph engine prototypes were removed 2026-07-30.

## Shared design system

- Palette: core-black `#090909`, rich-carbon `#111`, urban-smoke `#1b1b1b`, pulse-ash `#7d858c`
  (tertiary text), off-white `#e7e7e7`, neural-fog `#dadada`, electric-teal `#5c939f` (default
  accent), infrared `#ed6d40` (universal CTA color, never varies), validation-green `#59a993`,
  validation-red `#cb3500`.
- Per-engine accent: each engine scopes its own `--electric-teal` via a one-line inline
  `<style>` override; nothing else about the shell changes.
- Type: Fraunces (serif, headings) / Roc Grotesk (display) / Azeret Mono (labels, data).
- Shared components: `.workspace`, `.panel`, `.card`, `.result-strip`, `.formula-block`,
  `.data-table`, `.math-keypad`, `.chip-row`, `.step-controls`, `.scene-wrap` (3D canvases),
  `.matrix-grid`/`.adj-table`.
- Accessibility: decorative 3D scenes are `aria-hidden` (data exists as real text/tables
  alongside them); dynamic status regions use `aria-live="polite"`.
- Mobile: `.field-row` stacks under 520px; wide tables scroll horizontally in their own wrapper.

## Persistence pattern (as originally designed — verify still accurate before relying on it)

Each engine was designed to autosave inputs to `localStorage` under `engine-lab:<name>` and
restore on reload, with the hub showing a "continue where you left off" summary. This predates
the CAS-worker architecture built for Calculus/ODE/Complex — worth confirming this pattern
survived that restructure rather than assuming it did.

## Known technical notes (worth re-verifying, written when the site was much smaller)

- 3D scene helpers must have their previous `dispose()` handle called before recreating a scene
  on input change, to avoid leaked WebGL contexts — was a real, fixed bug in the original
  prototype code. `calculus-3d.js`'s `Scene3D` (built later, see `CALCULUS_ENGINE.md`) should be
  checked for the same discipline if not already covered by its own docs.
