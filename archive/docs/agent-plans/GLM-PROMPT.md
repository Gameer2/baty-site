# GLM-5.2 build session — paste this as your first message

You are extending an existing static website's Numerical Methods learning module (the
"Numerical Engine"). This is real, working production code with an established house
style — your job is to extend it consistently, not redesign it.

**Repo root — read carefully, this directory name has a trailing space:**
`/home/ameer/Desktop/baty site /` — note the space between `site` and the closing `/`.
Always `cd` into it explicitly and confirm with `pwd` before doing anything, and always
quote absolute paths exactly with that trailing space. Getting this wrong silently creates
a disconnected duplicate directory tree instead of erroring — this has already happened
once during planning; don't repeat it. When in doubt, use paths relative to the repo root
after `cd`-ing in, not fresh absolute paths.

All work happens under `math-lab/` inside that repo.

## Read before writing any code

1. `math-lab/docs/agent-plans/00-SHARED-CONVENTIONS.md` — the full house style: how
   `algorithms.js` is written, how per-method JS/HTML files are structured, the
   `tests/verify.js` pattern, the design system, and (§10) the rule about not touching
   `methods.html` directly while multiple builds are in flight.
2. The actual source files it references — `math-lab/assets/js/algorithms.js`,
   `math-lab/assets/js/secant.js`, `math-lab/engines/numerical/methods/secant.html`,
   `math-lab/tests/verify.js` — open and read these yourself. The shared-conventions doc
   describes them accurately as of when it was written, but the file is the ground truth,
   not the description.

## Your build queue, in this exact order (dependencies matter — don't reorder)

Each numbered item is a plan file at `math-lab/docs/agent-plans/<file>`. Work through them
one at a time: read the plan, implement it completely (algorithms.js function → test
cases in tests/verify.js → run `node tests/verify.js` and confirm 0 failures → HTML page →
per-method JS), verify against the plan's own acceptance-criteria section, then move to
the next. Do not batch multiple methods' code together in one pass — this project's own
stated discipline is one method fully done (tests passing) before starting the next.

1. `01-trapezoidal-rule.md` — Trapezoidal Rule
2. `02-simpsons-rule.md` — Simpson's Rule (1/3 & 3/8)
3. `03a-linear-algebra-helpers.md` — shared matrix/vector helpers for `algorithms.js`
   (not a page itself — build this once, before item 4)
4. `03-power-method.md` — Power Method
5. `04-inverse-power-method.md` — Inverse Power Method
6. `05-qr-algorithm.md` — QR Algorithm
7. `06-newton-nonlinear-systems.md` — Newton's Method for Nonlinear Systems
8. `07-broydens-method.md` — Broyden's Method
9. `08-hermite-interpolation.md` — Hermite Interpolation
10. `09-mullers-method.md` — Müller's Method
11. `10-romberg-integration.md` — Romberg Integration (needs item 1's
    `Algorithms.runTrapezoidal` — confirm it exists before starting this one)
12. `11-adaptive-quadrature.md` — Adaptive Quadrature (references item 2's Simpson's-rule
    math — read that plan/code first)
13. `12-gaussian-quadrature.md` — Gaussian Quadrature
14. `13-shooting-method.md` — Shooting Method
15. `14-finite-difference-bvp.md` — Finite-Difference BVP

That's 14 methods total (plus the one shared-helpers step).

## Every method, before you consider it done

- `node tests/verify.js` (run from `math-lab/`) passes with **zero failures**, and the
  passed-count increased by exactly the number of cases you added.
- The HTML page follows the exact skeleton in `00-SHARED-CONVENTIONS.md` §4 — copy
  `secant.html`'s structure, don't invent new markup/classes.
- Per-method JS follows §3 of the same doc — pure math stays in `algorithms.js`, the
  per-method file is DOM wiring only.
- Per §10 of the same doc: do **not** edit `math-lab/engines/numerical/methods.html`
  yourself. Instead append your method's card snippet (from your plan's own "methods.html
  card" section, with `.engine-index`/`transition-delay` left as `TODO`) to
  `math-lab/docs/agent-plans/PENDING-CARDS.md` (create this file, with a one-line header,
  if it doesn't exist yet — it's shared with the Qwen track building in parallel, so check
  whether it already exists and append rather than overwrite).
- No open questions the plan flagged are silently ignored — if a plan file notes an open
  risk/decision (several do — e.g. Müller's complex-root handling, the matrix-input UI),
  resolve it the way the plan recommends unless you find a concrete reason not to, and if
  you deviate, leave a one-line code comment explaining why.

## When you finish the whole queue

Report back: which methods are done, the final `node tests/verify.js` pass/fail count,
and any plan-file ambiguity you had to resolve with your own judgment call (so it can be
double-checked). Don't touch `methods.html` itself — that's a separate consolidation step
after both tracks (this one and the Qwen track) finish.
