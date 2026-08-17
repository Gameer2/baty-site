# For delete — moved out of the project, nothing actually deleted

Update (2026-08-18): everything previously listed here has been physically moved out of
the project into `../baty-site-for-delete/` (a sibling folder next to
`baty site the new arc/`, i.e. one level up) — not deleted. That folder has its own
`README.md` restating what's there and why. This file now just records the evidence for
each move, matching `repo-organization-and-classification.md` §7.

## Moved — confirmed dead weight, no ambiguity

- `.claude/worktrees/agent-{a00f32b9bb7c7fe8f,a4f252ffce4ea9d56,a64521531eebba891,a7344e1f224ee2c58,aab4ffd2819151b17}/` → `../baty-site-for-delete/claude-worktrees/` — orphaned worktrees (not in `git worktree list`), superseded work, never git-tracked.
- `_probe_click.js`, `_probe_drag.js`, `_probe_edge.js`, `_probe_hl.js`, `_probe_size.js`, `_probe_size2.js` (were at root) → `../baty-site-for-delete/root-probe-scripts/` — one-off debug scripts hardcoded to an already-shipped lesson.
- `Pasted image.png` (was at root) → `../baty-site-for-delete/` — only referenced from an already-archived report.
- `prototypes/lesson-g6-1-1-integers-absolute-value.html` → `../baty-site-for-delete/prototypes/` — superseded by the shipped `schools/grade-6/1-1-integers-absolute-value.html` (same title, different/shorter content, confirmed via `diff`).
- `prototypes/syntropy-archetype-nodes.html` → same — self-titled "prototype"; all six archetypes it mocked up are shipped in `canvas/excalidraw-app/syntropy/nodes/`.
- `prototypes/number-line-primitive-pilot.html` → same — unreferenced anywhere; its concept is now inline in two shipped lessons.
- `prototypes/test-arabic-decimal-numerals.html`, `test-katex-bilingual.html`, `test-katex-equation-bar.html` → same — the bilingual Arabic/KaTeX technique they validated is now used in 92 shipped lesson files.

## Not moved

- `probe_all.js` — not dead weight, already re-homed to `scripts/probe_all.js` (a proper
  location inside the active project, not a delete candidate).
- `archive/numerical-engine-v1/`, `archive/worldquant-foundry-template/` — already
  correctly filed as dead-for-the-project by `.gitignore` itself; left where they are.
