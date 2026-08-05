# GLM-5.2 build session — paste this as your first message

You are extending an existing static website's Statistics learning module (the
"Statistics Engine"). This is real, working production code with an established house
style, carried over from the Numerical Engine build — your job is to extend it
consistently, not redesign it.

**Repo root — read carefully, this directory name has a trailing space:**
`/home/ameer/Desktop/baty site /` — note the space between `site` and the closing `/`.
Always `cd` into it explicitly and confirm with `pwd` before doing anything, and always
quote absolute paths exactly with that trailing space. Getting this wrong silently creates
a disconnected duplicate directory tree instead of erroring — this has already happened
once during the Numerical Engine's planning; don't repeat it. When in doubt, use paths
relative to the repo root after `cd`-ing in, not fresh absolute paths.

All work happens under `math-lab/` inside that repo.

## Read before writing any code

1. `math-lab/docs/agent-plans/statistics/00-SHARED-CONVENTIONS.md` — the full house
   style for this engine: how `assets/js/stats-algorithms.js` is written (note: this is a
   **separate file from `algorithms.js`** — that one belongs to the Numerical Engine only,
   do not add statistics functions to it), how per-method JS/HTML files are structured,
   the `tests/verify-statistics.js` pattern (a **separate suite from `tests/verify.js`**),
   the design system, and (§10) the rule about not touching `methods.html` directly while
   multiple builds are in flight.
2. `math-lab/docs/agent-plans/00-SHARED-CONVENTIONS.md` (the Numerical Engine's original
   version, one directory up) — the statistics doc only states what's *different*; the
   general HTML skeleton / `engine-core.js` API / design-system rules it inherits are
   fully spelled out there.
3. The actual source files these reference — `math-lab/engines/statistics/index.html`
   (the current single-page prototype you're migrating out of),
   `math-lab/engines/numerical/methods/secant.html` and
   `math-lab/engines/numerical/methods/bisection.html` (structural precedents for the hub
   page and individual method pages), `math-lab/tests/verify.js` (structural precedent for
   the test harness you'll copy into `verify-statistics.js`). Open and read these yourself
   — the plan files describe them accurately as of when they were written, but the file is
   the ground truth, not the description.

## Your build queue, in this exact order (dependencies matter — don't reorder)

Each item is a plan file at `math-lab/docs/agent-plans/statistics/<file>`. Work through
them one at a time: read the plan, implement it completely (`stats-algorithms.js`
function(s) → test cases in `tests/verify-statistics.js` → run
`node tests/verify-statistics.js` and confirm 0 failures with the exact expected count the
plan states → HTML page → per-method JS), verify against the plan's own acceptance-criteria
section, then move to the next. Do not batch multiple methods' code together in one pass —
this project's own stated discipline (carried over from the Numerical Engine) is one method
fully done, tests passing, before starting the next.

1. `00-RESTRUCTURE-hub-migration.md` — **do this first, everything else depends on it.**
   Migrates the current `engines/statistics/index.html` prototype (inline t-test +
   regression math) into `assets/js/stats-algorithms.js` + `tests/verify-statistics.js` +
   a `methods.html` hub + two method pages, and fixes the 8 sitewide nav links that
   currently point at the old `index.html`. After this step,
   `node tests/verify-statistics.js` must report exactly **6 passed, 0 failed**.
2. `01-descriptive-statistics-explorer.md` — Descriptive Statistics Explorer. After this,
   the suite must report **24 passed, 0 failed**.
3. `02-sampling-distributions-clt.md` — Sampling Distributions & the Central Limit
   Theorem. Independent of item 2's code beyond both calling
   `StatsAlgorithms.descriptiveStats` — safe to build even if item 2 isn't merged yet, but
   if you're doing this whole queue solo and sequentially, just follow the numbered order.
   Adds 12 new assertions on top of whatever the suite was at before this item.
4. `03-confidence-intervals.md` — Confidence Intervals (Mean, Proportion, Variance).
   Reuses `StatsAlgorithms.betai`/`lgamma` from item 1 (the restructuring step) and
   `StatsAlgorithms.descriptiveStats` from item 2. Adds 17 new assertions on top of
   whatever the suite was at before this item.

That's 1 restructuring pass + 3 methods.

## Every method, before you consider it done

- `node tests/verify-statistics.js` (run from `math-lab/`) passes with **zero failures**,
  and the passed-count matches exactly what the plan's own §3 states (each plan spells out
  the running total or the increment — don't guess, read it).
- The HTML page follows the exact skeleton described in
  `docs/agent-plans/statistics/00-SHARED-CONVENTIONS.md` §4 (which points at the Numerical
  Engine's `secant.html` as the byte-for-byte structural template, adapted for statistics
  inputs) — don't invent new markup/classes.
- Per-method JS follows §2/§3 of the statistics conventions doc — pure math stays in
  `stats-algorithms.js`, the per-method file is DOM wiring only, and any random-simulation
  method takes an injected seeded RNG (`StatsAlgorithms.mulberry32`), never a bare
  `Math.random()` call.
- Per §10 of the conventions doc: do **not** edit
  `math-lab/engines/statistics/methods.html` yourself once more than one method is in
  flight. Instead append your method's card snippet (from your plan's own "methods.html
  card" section, with `.engine-index`/`transition-delay` left as `TODO`) to
  `math-lab/docs/agent-plans/PENDING-CARDS.md` (the same file used by the Numerical
  Engine's build tracks — add a `## Statistics Engine` heading above your cards to keep
  them visually separate from any numerical-engine cards still pending there, and check
  whether the file already exists before overwriting it).
- No open questions a plan flagged are silently ignored — if a plan notes an explicit
  decision point (e.g. `03`'s note that the repeated-intervals simulation can ship as a
  fast-follow if item 2 hasn't landed yet), resolve it the way the plan recommends unless
  you find a concrete reason not to, and if you deviate, leave a one-line code comment
  explaining why.

## When you finish the whole queue

Report back: which items are done, the final `node tests/verify-statistics.js` pass/fail
count, and any plan-file ambiguity you had to resolve with your own judgment call (so it
can be double-checked). Don't touch `methods.html` itself once more than one build is in
flight — that's a separate consolidation step, same as the Numerical Engine's process.
`math-lab/docs/agent-plans/statistics/BACKLOG.md` has the next Tier-1 items once this queue
is done — don't start on those without a fresh, fully-detailed plan file for each, written
the same way `01`-`03` were (pre-verified numbers via `node -e`, not hand-derived).
