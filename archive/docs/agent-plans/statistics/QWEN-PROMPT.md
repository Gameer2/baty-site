# Qwen3.5 build session — paste this as your first message

You are extending an existing static website's Statistics learning module (the
"Statistics Engine"). This is real, working production code with an established, strict
house style, carried over from the Numerical Engine build — follow it exactly rather than
improvising.

**Important difference from the GLM track's queue on this same engine:** GLM's queue
(`docs/agent-plans/statistics/GLM-PROMPT.md`) works through plan files that already exist,
fully detailed, with every test number pre-computed. **Your queue does not have that yet —
the plan files for your items don't exist.** `BACKLOG.md` only has a one-paragraph
description per item, on purpose (see its own header note: *"don't hand these to a build
agent without first writing a plan file for it in this same style first... Producing many
fully-detailed plans in one pass risks silent math errors going unreviewed."*). Your job is
therefore **two steps per item, not one**: first *write* that item's detailed plan file
yourself, with the same rigor as `01-descriptive-statistics-explorer.md`,
`02-sampling-distributions-clt.md`, and `03-confidence-intervals.md` (open and read all
three now — they are your template, both for format and for how much verification a plan
needs before any code gets written) — *then* build it. Do not skip straight to code from
`BACKLOG.md`'s one-paragraph description.

**Prerequisite — confirm before starting anything:** this whole queue assumes GLM's queue
(`00-RESTRUCTURE-hub-migration.md` through `03-confidence-intervals.md`) is already merged
and `node tests/verify-statistics.js` passes. Unlike the Numerical Engine's original
GLM/Qwen split (which was two genuinely independent, parallel tracks), **most items in this
queue directly reuse functions those plans introduce** (`StatsAlgorithms.descriptiveStats`,
`normalCDF`, `betai`/`tCDF`, the `mulberry32`/sampler functions) — check
`git log`/`node tests/verify-statistics.js` yourself before assuming that work is done, and
stop and ask rather than reimplementing something that should already exist.

**Repo root — read carefully, this directory name has a trailing space:**
`/home/ameer/Desktop/baty site /` — note the space between `site` and the closing `/`.
Always `cd` into it explicitly and confirm with `pwd` before doing anything, and always
quote absolute paths exactly with that trailing space. Getting this wrong silently creates
a disconnected duplicate directory tree instead of erroring — this has already happened
once during the Numerical Engine's planning; don't repeat it. When in doubt, use paths
relative to the repo root after `cd`-ing in, not fresh absolute paths.

All work happens under `math-lab/` inside that repo.

## Read before writing any plan or code

1. `math-lab/docs/agent-plans/statistics/00-SHARED-CONVENTIONS.md` — the full house style
   for this engine (`stats-algorithms.js` structure, the `pmf`/`pdf`/`cdf`/`quantile`
   shape for distributions, seeded-RNG rule for simulations, `tests/verify-statistics.js`
   pattern, §10's rule about not touching `methods.html` mid-batch).
2. `01-descriptive-statistics-explorer.md`, `02-sampling-distributions-clt.md`,
   `03-confidence-intervals.md` — read all three in full. These are what "a finished plan
   in this project's style" looks like: exact function bodies, exact pre-verified test
   values with their tolerances explained, exact HTML/JS file lists, exact card copy. Match
   this level of detail and rigor for every item you plan yourself.
3. `math-lab/docs/agent-plans/statistics/BACKLOG.md` — your actual task descriptions
   (Tier 1, items 1-6). Re-read each item's one-paragraph description there before planning
   it; don't rely on this prompt's restatement below as a substitute.
4. `math-lab/assets/js/stats-algorithms.js` and `math-lab/tests/verify-statistics.js` (once
   GLM's queue has landed) — open these directly, don't trust any plan's paraphrase of
   what's already in them.

## How to plan an item yourself (do this before writing any implementation code)

For each backlog item, before touching `stats-algorithms.js`:

1. Write `docs/agent-plans/statistics/<NN>-<kebab-name>.md` (see numbering below),
   following `01`-`03`'s exact section structure: what the method is, the
   `stats-algorithms.js` function(s) to add (full body, not a sketch), the
   `tests/verify-statistics.js` cases to add, files to create, inputs, outputs/plot design,
   the `methods.html` card, acceptance criteria.
2. **Every numeric value in your test cases must be computed with `node -e` (or a short
   `node` script) before you write it into the plan — never hand-derive or estimate a
   decimal expansion.** Run the computation, paste the literal output. This is the exact
   discipline `01`-`03` followed — you can see it in how many decimal places their test
   values carry.
3. **If the method reports a p-value, critical value, or any quantity with a known
   standard textbook table value (a binomial/Poisson probability, a z-value, an
   F-critical-value, etc.), cross-check your computed value against that table value and
   cite it in the plan** — same rule as `00-SHARED-CONVENTIONS.md` §9's addition for this
   engine. If your from-scratch implementation doesn't match the table value within a
   reasonable tolerance, the implementation is wrong — find the bug before writing the
   plan down, don't loosen the tolerance to make a wrong implementation pass.
4. Only after the plan file is written and its numbers are verified, implement it: the
   `stats-algorithms.js` function(s) → the test cases exactly as planned → run
   `node tests/verify-statistics.js`, confirm 0 failures and the passed-count increased by
   exactly the number of cases you planned → the HTML page → the per-method JS.

## Your build queue, in this exact order (dependencies matter — don't reorder)

Plan-then-build each of these, one at a time, per `BACKLOG.md`'s Tier-1 section:

1. **`04-discrete-distributions.md`** — Discrete Probability Distributions (Binomial,
   Poisson, Geometric, Hypergeometric). No dependency on GLM's queue beyond the
   restructuring pass. Establishes the `pmf`/`cdf` shape every later distribution method
   should match — get this one's shape right, it's the precedent for item 2.
2. **`05-continuous-distributions.md`** — Continuous Probability Distributions (Normal,
   Exponential, Uniform, Gamma). Reuses `StatsAlgorithms.normalCDF` (from GLM's
   `03-confidence-intervals.md`) and the `sampleNormal`/`sampleUniform`/
   `sampleExponential` samplers (from GLM's `02-sampling-distributions-clt.md`) — confirm
   both exist before planning this one; don't write a second copy of either.
3. **`06-two-sample-paired-tests.md`** — Two-Sample and Paired t-Tests, z-Test. The
   paired case should call `StatsAlgorithms.runOneSampleTTest` on the array of differences
   rather than reimplementing a one-sample t-test — decide and document in your plan
   whether the two-sample case uses a pooled or Welch's-approximation standard error (this
   prompt's author's recommendation, stated in `BACKLOG.md`: Welch's, since it doesn't
   assume equal variances and matches this site's general preference for not hiding
   assumptions — deviate only if you have a concrete reason to, and say why in the plan).
4. **`07-chi-square-tests.md`** — Chi-Square Tests (Goodness-of-Fit and Independence).
   Reuses `StatsAlgorithms.chiSquareCDF`/`chiSquareCritical` (from GLM's
   `03-confidence-intervals.md`) as a *test statistic* rather than only a confidence-
   interval bound — confirm those exist first.
5. **`08-multiple-linear-regression.md`** — Multiple Linear Regression, matrix form
   `(XᵀX)⁻¹Xᵀy`. **Check the Linear Algebra Engine first** (`math-lab/engines/
   linear-algebra/`, `math-lab/assets/js/` for any existing matrix-inversion/least-squares
   helper) before writing a new matrix inversion inside `stats-algorithms.js` — if a shared
   utility already exists, reuse it; if not, note in your plan that you're adding a
   minimal local matrix-inversion helper scoped to this one method, not a general linear-
   algebra module (that's out of scope for this engine).
6. **`09-probability-combinatorics.md`** — Probability & Combinatorics Basics (Counting,
   Conditional Probability, Bayes' Theorem). Marked P2 in `CURRICULUM_ROADMAP.md` §4A.2,
   not P1 — treat this as the queue's stretch goal, build it last, and it's fine to stop
   before this one if you're running low on budget/time; items 1-5 are the priority.

Stop after item 6. Everything past it in `BACKLOG.md` (Tier 2/3 — Point Estimation, ANOVA,
Polynomial Regression, nonparametric tests) needs its own fresh planning pass later, same
as this one — don't get ahead of the project's stated one-batch-at-a-time discipline.

## Every item, before you consider it done

- Its own plan file exists at `docs/agent-plans/statistics/<NN>-<name>.md`, written to the
  same standard as `01`-`03` (see "How to plan an item yourself" above).
- `node tests/verify-statistics.js` (run from `math-lab/`) passes with **zero failures**,
  and the passed-count increased by exactly the number of cases *your own plan* specifies.
- The HTML page follows the exact skeleton in
  `docs/agent-plans/statistics/00-SHARED-CONVENTIONS.md` §4. Per-method JS follows §2/§3 of
  the same doc — pure math stays in `stats-algorithms.js`, the per-method file is DOM
  wiring only.
- Per §10 of the same doc: do **not** edit `math-lab/engines/statistics/methods.html`
  yourself while more than one item is in flight (which is the normal case for this queue).
  Append your method's card snippet to `math-lab/docs/agent-plans/PENDING-CARDS.md` under
  a `## Statistics Engine` heading (shared with the GLM track — check whether cards are
  already there before overwriting) with `.engine-index`/`transition-delay` left as `TODO`.

## When you finish the whole queue (or stop partway, per item 6's note)

Report back: which items got a plan file and a working build, which you stopped before
(and why), the final `node tests/verify-statistics.js` pass/fail count, and every table
value you cross-checked a computed p-value/critical-value against (so it can be
double-checked independently). Don't touch `methods.html` itself — that's a separate
consolidation step after both this track and the GLM track finish.
