# School lesson upgrade — handoff (2026-08-17)

## Reference "heavy lesson": JSXGraph + Motion stack

`schools/grade-6/4-5-geometric-constructions.html` (untracked, 498 lines) is the
reference build for the new stack:

- JSXGraph (`schools/assets/vendor/jsxgraphcore.js` + `jsxgraph-skin.css`) replaces
  hand-rolled SVG for the interactive geometry board.
- Motion (`schools/assets/js/lesson-motion.js`, wraps `motion.min.js`) replaces
  per-element gsap.fromTo calls — `springValue`, `appear`, `draw`, `reveal`.
- Two modes (perpendicular bisector / angle bisector), 4-step slider-driven reveal,
  live-highlighted textbook procedure panel, EN/AR i18n, tour retargeted to live
  JSXGraph element ids.

Last Playwright text-probe result was clean: `svgNodes: 10`, `procSteps: 4`,
`ERRORS: []`, `LOGS: []`. File read-through (this session) confirms structure is
complete and internally consistent — no half-finished code, both modes fully wired.

## Constraint: judge correctness from text probes only, not screenshots

The model running this work (glm-5.2:cloud) does not support image input — reading
any `.png` throws `API Error: 400 this model does not support image input`. Do not
`Read` screenshots. Verify lessons via:

- Playwright text probe: svg node count, `console` ERRORS[]/LOGS[], procedure step
  count — not a visual diff.
- Static syntax/structure checks.

The user reviews visuals themselves ("dont judge visually tell me and i will do
it.") — report probe results in text and let them look at the page.

## Status / next step

Reference lesson appears done and probe-clean. Not yet committed (untracked in git).
Next: either wait for the user to review visually, or move to the next lesson in the
schools rebuild using this file as the JSXGraph+Motion pattern reference.
