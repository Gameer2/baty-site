# Agent Build Plans — Statistics Engine

Same purpose as `docs/agent-plans/00-SHARED-CONVENTIONS.md` (Numerical Engine), adapted for
Statistics. The restructuring pass and all nine Tier-0/1/2 plan files from the original
build queue are shipped (`engines/statistics/methods/*.html`, 12 pages, 356/356 tests
passing) — those plan files, the completed backlog items, and the delegation prompts used
to build them are archived at `archive/docs/agent-plans/statistics/` (git history intact).

**`00-SHARED-CONVENTIONS.md`** is still live — read it first before adding a new Statistics
Engine method. **`BACKLOG.md`** is trimmed to the two items never built (Point Estimation,
Wilcoxon/Kruskal-Wallis/Sign Tests) — both low-priority, neither has a plan file yet.

If building one of those two (or any new method): write a fresh per-method plan in
`00-SHARED-CONVENTIONS.md`'s style (look at an archived plan like
`archive/docs/agent-plans/statistics/03-confidence-intervals.md` for the shape) before
writing any code.
