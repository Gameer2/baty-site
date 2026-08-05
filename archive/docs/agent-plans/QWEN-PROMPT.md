# Qwen3.5 build session — paste this as your first message

You are extending an existing static website's Numerical Methods learning module (the
"Numerical Engine"). This is real, working production code with an established, strict
house style — follow it exactly rather than improvising. These tasks were picked for you
specifically because each one has a close existing precedent file to copy the structure
from — always find and read that precedent before writing anything new.

**Repo root — read carefully, this directory name has a trailing space:**
`/home/ameer/Desktop/baty site /` — note the space between `site` and the closing `/`.
Always `cd` into it explicitly and confirm with `pwd` before doing anything, and always
quote absolute paths exactly with that trailing space. Getting this wrong silently creates
a disconnected duplicate directory tree instead of erroring — this has already happened
once during planning; don't repeat it. When in doubt, use paths relative to the repo root
after `cd`-ing in, not fresh absolute paths.

All work happens under `math-lab/` inside that repo.

## Read before writing any code

1. `math-lab/docs/agent-plans/00-SHARED-CONVENTIONS.md` — the full house style. Read it
   completely, including §10 (rule about not touching `methods.html` while builds are in
   flight in parallel).
2. Each plan below names a specific existing file as its closest structural precedent
   (e.g. "copy `algorithms.js`'s `runBisection`"). Open and read that exact file yourself
   before writing your version — do not write code from the plan's paraphrase alone, the
   plan's summary can be incomplete and the real file is the ground truth.

## Your build queue, in this exact order

Each numbered item is a plan file at `math-lab/docs/agent-plans/<file>`. Work through
them **one at a time, fully**: read the plan, read its named precedent file, implement
completely (algorithms.js function → test cases in tests/verify.js → run
`node tests/verify.js` and confirm 0 failures → HTML page → per-method JS), verify against
the plan's acceptance criteria, then move to the next. Do not start a second method before
the first one's tests pass — that's not a suggestion, it's this project's stated rule and
it's how regressions get caught immediately instead of days later.

1. `15-false-position.md` — Method of False Position (closest precedent: `runBisection`)
2. `16-newton-multiple-roots.md` — Newton's Method for Multiple Roots (precedent:
   `runNewton` — needs a second derivative via two calls to `Engine.derivativeFx`, spelled
   out exactly in the plan)
3. `17-aitken-steffensen.md` — Steffensen's Method (precedent: `runFixedPoint`)
4. `18-horners-method.md` — Horner's Method + Deflation (no direct precedent — this one's
   input is a coefficient list, not an `f(x)` expression; the plan spells out the full
   "find all roots" loop explicitly, follow it exactly rather than inventing your own
   structure)
5. `19-nevilles-method.md` — Neville's Method (precedent for the points-table input UI:
   `lagrange-interpolation.html` / `lagrange.js`)
6. `20-newton-divided-difference.md` — Newton's Divided-Difference Formula (cross-checks
   against item 5's result on the same data — build item 5 first)
7. `21-numerical-differentiation.md` — Numerical Differentiation (simplest method in the
   whole set — no iteration/step-through UI needed, just a comparison table)
8. `22-richardson-extrapolation.md` — Richardson Extrapolation (self-contained — has its
   own inline central-difference helper, does not depend on item 7's code)
9. `23-discrete-least-squares.md` — Discrete Least Squares (self-contained 3x3 solve,
   does not depend on the other GLM-track linear-algebra helpers)
10. `24-chebyshev-economization.md` — Chebyshev Polynomials & Economization (takes raw
    polynomial coefficients as input, like item 4 — not an `f(x)` expression; don't force
    the usual math-keypad pattern where it doesn't fit)

That's 10 methods, fully independent of the parallel GLM-track queue — no need to wait on
anything from that track.

## Every method, before you consider it done

- `node tests/verify.js` (run from `math-lab/`) passes with **zero failures**, and the
  passed-count increased by exactly the number of cases you added.
- The HTML page follows the exact skeleton in `00-SHARED-CONVENTIONS.md` §4 — copy the
  named precedent page's structure, don't invent new markup/classes/IDs.
- Per-method JS follows §3 of the same doc — pure math stays in `algorithms.js`, the
  per-method file is DOM wiring only.
- Per §10 of the same doc: do **not** edit `math-lab/engines/numerical/methods.html`
  yourself. Instead append your method's card snippet (from your plan's own "methods.html
  card" section, with `.engine-index`/`transition-delay` left as `TODO`) to
  `math-lab/docs/agent-plans/PENDING-CARDS.md` (create this file, with a one-line header,
  if it doesn't exist yet — it's shared with the GLM track building in parallel, so check
  whether it already exists and append rather than overwrite).
- Every plan in this batch was written with extra explicit detail specifically because
  it's your queue — if something still seems ambiguous, re-read the named precedent file
  again before guessing; the answer is almost always "match what that file already does."

## When you finish the whole queue

Report back: which methods are done, the final `node tests/verify.js` pass/fail count,
and anything you weren't sure how to resolve. Don't touch `methods.html` itself — that's a
separate consolidation step after both tracks (this one and the GLM track) finish.
