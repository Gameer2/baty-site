# Agent Build Plans — Numerical Engine

This directory holds the house-style conventions used to build the Numerical Engine's
method pages. All 29 methods from the original build queue are now shipped (`engines/
numerical/methods/*.html`, 76/76 tests passing) — the per-method plan files, the completed
backlog, and the delegation prompts used to build them are archived at
`archive/docs/agent-plans/` (git history intact, `git mv`'d not deleted).

**`00-SHARED-CONVENTIONS.md`** is still live and still the reference to read first before
adding a new Numerical Engine method by hand or via a build agent — the conventions it
documents (one implementation/two callers, `algorithms.js` style, test-before-page
discipline) are how this repo still works, independent of any specific finished batch.

If a new Numerical Engine method needs building: write a fresh per-method plan in
`00-SHARED-CONVENTIONS.md`'s style (look at the archived `01-trapezoidal-rule.md` or
`05-qr-algorithm.md` for the shape), rather than reviving the old numbered sequence.
