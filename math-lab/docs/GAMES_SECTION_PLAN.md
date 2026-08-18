# Games Section — Build Plan

Last updated: 2026-08-18 (initial deep plan — nothing built yet, no code exists for this
section; this file is the *what and why* before anyone opens an editor).

**Scope of this file:** a new `games` surface for the Lab — daily/practice puzzles that sit
on top of the seven existing engines (and, later, the Schools vertical) rather than
duplicating their math. It follows the same "read the shared conventions before writing
code" discipline as `docs/agent-plans/00-SHARED-CONVENTIONS.md` (Numerical) and
`docs/agent-plans/statistics/00-SHARED-CONVENTIONS.md` — this file is that document for
Games, written before any per-game plan exists.

Origin: this section is a response to studying dailyintegral.com (a Wordle-style daily
calculus/logic puzzle site) and asking what of its *mechanics* — not its visual identity —
is worth adapting. See §1 for what that audit concluded.

---

## 1. The one thing that makes this section different

Every other surface in the Lab is a **reference/workbench**: pick a method, type your own
`f(x)`, get a worked solution. Nothing asks you to produce an answer and tells you if
you're right. Games is the first surface built around **retrieval, not lookup** — a
problem is generated, you answer without being shown the method, and you're graded.

This inverts the existing data flow. Every method page today is: *user input → engine →
displayed steps*. A game is: *engine → generated problem (engine hides its own steps) →
user input → engine checks it → steps revealed only as a hint or on completion*. The
generator and the checker are two different calls into the *same* pure functions the
method pages already call — a game must never reimplement calculus, linear algebra, or
number theory. It only decides *what problem to ask* and *whether the typed answer
matches*.

Corollary: **a game is cheap to build only for engines whose pure functions already
produce an exact, comparable answer** (a number, a fraction, a closed-form expression, a
matrix, an integer). Engines whose output is fundamentally a picture or a multi-step
narrative (contour plots, ODE direction fields, 3-D surfaces) need a different game shape
— see §8.

---

## 2. What the dailyintegral.com audit actually found (mechanics, not skin)

Full findings live in conversation history; the load-bearing facts carried into this plan:

- It is **one generic puzzle shell** reused across every calculus/logic topic — not nine
  separate apps. Header (streak / attempts / countdown-to-reset), KaTeX-rendered problem
  with a "submitted by X" credit line, a live math-expression input, a hint ladder, a
  worked solution revealed on completion or give-up.
- The **hint ladder gives strategy, not the number** — hint 1 always names the technique
  ("combine into a single fraction and factor the difference of squares"), never the
  answer. This is the single most valuable idea to copy literally.
- The math **answer input renders live** as you type (`1/2+1/3` → a real fraction glyph,
  `sqrt(2)/2` → a real radical) instead of asking for raw LaTeX or a decimal-only field.
- **LilyPath** is the one structurally different game: a 5×5 grid, a token with an
  arrow+magnitude, tap the destination tile — vector/coordinate reasoning as a
  path-finding puzzle, not an engine-generated problem at all.
- Difficulty tiers (Easy/Medium/Hard) are just different problem pools on the *same*
  shell, not different code.
- Everything pedagogical (hints, worked solution) is free; only the **archive of past
  days** is paywalled behind an account + credit system.
- Visual identity is bright pastel "orbs" on a light background — the opposite of this
  site's `--core-black` dark, restrained identity (`tokens.css`). **Do not adopt this.**
  Reinterpret the same interaction pattern (a small set of entry points into different
  topics) inside the existing dark/mono/accent-per-engine visual language, the same way
  the engine cards on `index.html` already do.

What's explicitly **not** being adopted: accounts, credits, Pro subscription, paywalled
archive, community problem-submission review pipeline. All of that is monetization/growth
infrastructure for a different kind of product. Revisit only if this site later wants
accounts for an unrelated reason (see §10).

---

## 3. Architecture — how this plugs into the existing house style

Same hard rule as every other engine (`00-SHARED-CONVENTIONS.md` §1): **one
implementation, two callers.** Concretely:

- **Problem generation and answer-checking are pure functions.** They live in a new
  `assets/js/games-core.js` (site-wide) plus, where a game needs domain logic the engine
  doesn't already expose as a reusable function, a small pure addition to that engine's
  *existing* algorithm file (e.g. a "give me a random factorable quadratic" helper next to
  `completing-the-square.js`'s logic, not inside a game file). **Never duplicate a
  derivative, an integral, a determinant, or a primality test inside a game file** — call
  the engine's existing pure function.
- **DOM wiring is separate**, per game, in `assets/js/games/<game-id>.js` — reads the
  daily seed, calls the generator, renders the shell, reads the answer field, calls the
  checker, renders feedback. This file is the game's only DOM-touching code, mirroring
  `secant.js`'s role for the Numerical Engine (§3 of the shared conventions).
- **Tests before pages.** Every new pure generator/checker function gets a case in a new
  `tests/verify-games.js` (same `compile`/`approx` helper pattern as `tests/verify.js`)
  *before* its HTML page is written. A generator is "done" when a fixed seed always
  produces the same problem and the checker accepts the known-correct answer and rejects a
  known-wrong one — that's the test.
- **HTML skeleton is copied, not invented.** The puzzle shell page structure (see §4) is
  written once as the literal template every game's `.html` file copies, the same way
  every Numerical method page copies `secant.html` byte-for-byte and only swaps content
  (§4 of the shared conventions). One shell template, N thin content differences.
- **Design system rules are unchanged**, not relaxed for this section (`00-SHARED-
  CONVENTIONS.md` §8): dark background only, no hardcoded hex colors outside the existing
  token variables, headings stay serif/`.h1`/`.h2`, UI chrome stays `.mono`, decorative
  glow/crosshair markup only ever comes from `Engine.initChrome()` — never hand-written.
  Games gets **one new accent-neutral color role**, not a new palette (`00-SHARED-
  CONVENTIONS.md` §8).

### Directory layout

```
math-lab/
  engines/
    games/
      index.html              → landing: entry points into each game, styled like the
                                 existing engine cards on the site index, not DI's orbs
      play/
        integral-daily.html    → one game = one page, copies the shared shell template
        derivative-daily.html
        number-theory-cipher.html
        matrix-drill.html
        lilypath.html          → the one non-generic game, its own template (§8)
        ...
      SHELL_TEMPLATE.html      → the literal byte-for-byte template every play/*.html
                                 copies from (mirrors numerical/methods/secant.html's role)
  assets/js/
    games-core.js              → shell wiring shared by every generic game: seed-from-date,
                                  streak/attempts state, hint-ladder UI, math-keypad answer
                                  field (wraps existing Engine.attachMathKeypad /
                                  Engine.compileFx — does not reimplement them)
    games/
      integral-daily.js        → per-game generator + DOM wiring
      derivative-daily.js
      number-theory-cipher.js
      matrix-drill.js
      lilypath.js               → self-contained grid/solver logic, does not use
                                   games-core.js's answer-checking path at all
  tests/
    verify-games.js            → one case per generator+checker pair, run alongside the
                                  existing per-engine verify-*.js files
  docs/
    GAMES_SECTION_PLAN.md      → this file
    agent-plans/
      games/                   → created once the first game is actually being built,
        00-SHARED-CONVENTIONS.md   mirroring docs/agent-plans/statistics/'s structure:
        BACKLOG.md                 shared conventions + a living backlog + per-game plans
        README.md
```

---

## 4. The generic puzzle shell — spec

One HTML template, one `games-core.js` module, reused by every engine-generated game.

**States:** `loading → active → (correct | exhausted) → revealed`. `active` is the only
state with a visible countdown/attempts UI; `revealed` shows the worked solution
regardless of how the player got there (matches the DI finding that solutions are never
gated).

**Header:** game title, difficulty (if the game has tiers), streak count, attempts used /
attempts allowed, "resets in HH:MM:SS" countdown to the next local-midnight seed change.

**Problem area:** rendered via `Engine.renderKatex` for anything symbolic; plain text for
word-problem-style games (the number-theory/logic-style games). No "submitted by" credit
line — there's no community-submission pipeline in this plan (§10), so that field is
dropped rather than faked.

**Answer field:** wraps `Engine.attachMathKeypad` + `Engine.compileFx` — the site already
has the DI "type it like Desmos, see it render live" behavior for free via the existing
math-input keypad used on every engine page. This is not new work, it's reuse.
`games-core.js` adds only the submit/attempt-counting behavior around it.

**Checking:** never string-compare the raw typed input against a stored answer string
(too brittle — `1/2` vs `0.5` vs `2^-1` are all correct). Compile the typed expression
with `Engine.compileFx`, evaluate it (or, where the engine's own compare function already
exists — e.g. two `nerdamer` expressions for symbolic equality — call that), and compare
against the generator's exact answer within a tight numeric tolerance or via structural
equality for symbolic answers. This mirrors the calculus engine's own "verification gate"
discipline (`CALCULUS_ENGINE_PLAN.md` §"non-negotiable") — a game must never accept an
answer it can't actually verify. This rule applies just as strictly to any problem whose
*phrasing* was borrowed from an outside source (§6) — the answer shown is always this
repo's own computed value, never an imported answer key.

**Hint ladder:** array of strings per problem, ordered strategy-first. Hint 1 is always
free and always names the *technique*, never a number derived from the answer (copy the
DI finding literally — this is the pedagogical core of the whole section, not
decoration). Later hints may narrow further but the *final* number only ever appears in
the worked solution, post-completion.

**Worked solution:** for engines that already produce a step list (Calculus's
`{steps[]}` shape, ODE's derivation ladder), reuse that step array directly — don't
hand-author a second explanation. For engines that don't (e.g. a number-theory
"factor this" game), the generator must build a minimal step list itself, following the
`{ok, result, latex, steps[], verified}` shape used elsewhere in the codebase so any
future step-renderer works unmodified.

This section describes structure and state only. For exactly what every one of these
pieces should *look like* — and, just as importantly, a concrete list of what it must
never look like — see §12.

---

## 5. Data model

A generic generator+checker pair has this shape (documented here once so every per-game
plan just implements it, rather than re-deriving it):

```js
// GameSpec, one per game
{
  id: "integral-daily",
  engine: "calculus",                 // which existing engine's pure functions it calls
  difficulties: ["easy","medium","hard"],   // omit if the game has none
  generate(seed, difficulty) => {
    prompt,        // plain string, for word-problem games
    latex,          // KaTeX string, for symbolic games (one of prompt/latex is set)
    answer,         // canonical answer value/expression — never shown to the DOM layer
                     // until `revealed`
    hints: [str, ...],       // strategy-first, ordered
    steps: [{text, latex?}, ...]   // worked solution, reuses engine step shape where possible
  },
  checkAnswer(userInputString, answer) => boolean   // wraps Engine.compileFx + a tolerance
                                                      // or structural-equality comparison
}
```

`seed` is derived from the local date (`YYYYMMDD` as an integer) plus the game's `id`, so
every player gets the same problem on the same day per game, and different games on the
same day don't collide. A deterministic seeded RNG (a small mulberry32/xorshift — a dozen
lines, no dependency) picks parameters within a difficulty's ranges; the *engine's own
pure function* then computes the exact answer from those parameters. The generator never
hand-writes a "problem bank" array — it randomizes parameters and lets the engine do the
math, which is what makes the section cheap to extend (§1).

---

## 6. Problem sourcing — generation vs. imported problem banks

Before committing to "the generator writes every problem" (§5) as the *only* source of
content, it's worth naming what large, pre-built math-problem datasets already exist —
re-deriving one from scratch would be wasted effort if a good one already fit the need.

**What's actually out there:**

- **DeepMind's Mathematics Dataset** (`github.com/deepmind/mathematics_dataset`, Apache
  2.0 license) — the closest prior art to this entire plan. ~2 million
  procedurally-generated question/answer pairs spanning algebra, arithmetic, calculus,
  comparison, measurement, numbers, polynomials, and probability. It's built the *exact*
  way §5 proposes here — randomize parameters, compute the exact answer programmatically
  — just done once already, at Google's scale, and openly licensed. Worth reading as a
  reference for **phrasing patterns and parameter-range choices per topic** (how do they
  word "compute the derivative," what number ranges keep a generated problem from being
  trivially easy or absurdly hard) — not as a drop-in problem source, per the caveat
  below.
- **MATH dataset / GSM8K** — competition-style and grade-school word problems, a few
  thousand to ~12k each, free, but shipped as static question+answer pairs with no
  reusable step-by-step derivation attached.
- **AMC / AIME / Putnam archives** (via the AoPS wiki) — thousands of real competition
  problems, but copyrighted by the sponsoring bodies (MAA etc.); not safe to bulk-import
  into a product.
- **Project Euler** — a well-known problem bank that explicitly forbids republishing its
  problems elsewhere.
- **OpenStax textbooks** — openly licensed (CC-BY) exercise sets, but authored as
  textbook homework, not game-shaped; would need rephrasing to fit the puzzle shell (§4).

**Why generation still wins as the primary approach here, not import.** Every answer this
section ever shows a player has to pass this repo's own verification gate (§4's "never
accept an answer it can't actually verify" — the same non-negotiable rule the Calculus
engine already holds itself to, per `CALCULUS_ENGINE_PLAN.md`). Importing a bank's answer
key doesn't remove that requirement — the checking code still has to exist either way,
just pointed at someone else's questions instead of this site's own generated ones. A
bank saves *authoring* effort, not *verification* effort, and this plan's whole cost
advantage (§1) is that generation needs no authoring at all: the engine writes infinite
problems for free, with a guaranteed-correct answer, because it computed that answer
itself.

**Where a bank still earns its place.** Natural-language *word problems* are the one spot
generation is genuinely weak at — a generator can invent endless "factor x²+5x+6" all
day, but it's bad at inventing "a train leaves the station..." For the games in §9 that
lean on phrasing (the Optimization Word-Problem Ladder in §9.1, Cipher Break in §9.3),
borrow **sentence structure and framing** from DeepMind/GSM8K-style templates and drop in
this site's own randomized numbers and its own engine-computed answer — never the
imported answer verbatim. Treat these datasets as a style reference for *how to phrase* a
generator's output in words, not as a source of ready-to-ship problems.

---

## 7. Persistence — no backend, matches the note-taker's own pattern

There is no server for this site beyond `note-taker/serve.py`'s local dev convenience
(itself optional — the widget already falls back to localStorage-only, per
`note-taver/notes-widget.js`'s own pattern of caching to `localStorage` first and POSTing
only as a bonus). Games follows the same discipline: **localStorage only, phase 1.**

```js
// one key per game, mirroring the note-taker's single-key-per-concern pattern
"games:<game-id>:state" → {
  lastPlayedSeed,      // last date-seed completed, prevents replaying today's after solving
  streak,               // consecutive days solved
  bestStreak,
  attemptsToday,
  solvedDates: [...]    // sparse list, used for a simple calendar/heatmap view later
}
```

No accounts, no cross-device sync, no leaderboard in phase 1 — a leaderboard needs a
server to be meaningful (comparing your streak to a stranger's) and this site has none.
If that's wanted later, it's a distinct, larger project (see §10) — do not let it block
shipping the single-player version.

---

## 8. Games that don't fit the generic shell

Two categories need their own template because "generate a problem, type an answer" isn't
the right interaction:

**Spatial/path games (LilyPath-style).** Grid-based, tap-to-move, deterministic
puzzle-generation-with-a-guaranteed-solution rather than "compute the right number." This
is genuinely new logic (a small path-generator + validator), not a wrapper around an
existing engine. Good fit for teaching vectors (direction + magnitude), coordinate
translations/reflections (ties directly to Schools grade-6 `4-2-translation.html` /
`4-3-reflection.html`), and modular arithmetic (wrap-around grid = clock arithmetic).
Scope as its own template (`lilypath.html` + `lilypath.js`), phase 2+ (§11).

**Visual/perceptual games.** Anything whose "answer" is picking the right picture rather
than typing a value — matching a function to its graph, a matrix to its transformation, a
complex map to its Möbius picture, a distribution shape to its parameters. These reuse
the engine's existing *plotting* code (Plotly/`Scene3D`/domain-coloring canvas) as the
answer options, and the "check" is just "did they click the option whose parameters match
the generator's hidden ones" — no symbolic answer-checking needed at all, which makes
these some of the *cheapest* games to build despite feeling the most different. See the
catalog in §9 for specific ideas (curve-matching, transformation-matching,
distribution-matching, Möbius-matching).

---

## 9. Game concepts catalog — every domain in the Lab

This is the deep, exhaustive pass requested: for each existing engine (and Schools),
concrete game ideas grounded in a pure function or page that **already exists** in this
repo (file paths given so nothing here is speculative), organized by mechanic, not just
"daily version of the method page."

### 9.1 Calculus (`engines/calculus/`, `assets/js/calc-core.js`,
`assets/js/calculus-symbolic.js`)

- **Daily Integral / Daily Derivative** — direct DI analogue. Generator picks a random
  expression from a template family per difficulty tier (e.g. easy = polynomial/trig
  product; hard = requires substitution *and* partial fractions), calls the existing
  symbolic engine, answer is the closed form. Reuses `calculus-symbolic.js`'s
  `{steps[]}` output directly as the worked solution — zero new step-authoring.
- **Limit Sprint** — `limits.js`'s existing evaluator, timed mode: N limits in a row
  (L'Hôpital candidates, one-sided, at infinity), score = correct count under a clock.
  Good fit for a **speed-run mode** distinct from the daily/streak mode — same generator,
  different shell chrome (timer instead of countdown-to-reset).
- **Curve Sketching Detective** — `curve-sketching.js` already computes critical points,
  inflection points, concavity intervals. Game shows a bare `f(x)` and asks the player to
  place markers (click on a rendered axis) at the local max, local min, and inflection
  point before seeing the actual curve. This is a **visual/perceptual game** (§8) —
  checking is "click within tolerance of the true x-coordinate," reusing the existing plot
  infrastructure as the answer surface instead of a text field.
- **Series Convergence Call** — `convergence-tests.js` already classifies a series as
  convergent/divergent/conditionally-convergent and by which test. Game shows the series,
  player picks the classification from a small fixed set of buttons (multiple-choice, not
  free-text) — one of the few games where checking is trivially exact-match, no tolerance
  needed.
- **Optimization Word-Problem Ladder** — `applied-optimization.js`'s existing problem
  shapes (box volume, fence area, etc.) parametrized randomly; player must set up *and*
  solve, hints reveal the setup step ("what are you optimizing, what's the constraint")
  before the calculus step — a hint ladder with two tiers of hint by design, not just
  numeric hints. Phrasing for this one is a good candidate to borrow structure from an
  external word-problem dataset (§6) rather than hand-authoring sentences from scratch.
- **Taylor/Power Series Coefficient Recall** — `taylor-series.js` / `power-series.js`;
  player fills in the next coefficient in a partially-revealed series, Wordle-style
  (reveal terms one at a time, guess the pattern) — a genuinely different mechanic from
  "solve the whole problem at once."

### 9.2 Linear Algebra (`engines/linear-algebra/`, `assets/js/linalg-algorithms.js`,
`assets/js/matrix-ui.js`)

- **Matrix Drill** — `row-reduction.js`/`determinant.js`/`matrix-inverse.js` already
  compute exact results for integer-entry matrices; generate a small (2×2 or 3×3)
  integer matrix, ask for the determinant or full inverse, `matrix-ui.js`'s existing
  grid-entry widget becomes the answer input instead of the math keypad.
- **Eigenvalue Guess-and-Check** — `eigenvalues.js`; show a matrix, player enters
  candidate eigenvalues; unlike most games here this is naturally **multi-answer** (a
  2×2 matrix has two eigenvalues) — checker accepts either order, partial credit for
  getting one of two right, which is a distinct scoring shape worth designing once and
  reusing (e.g. also fits the "all primitive roots mod p" number-theory game below).
- **Transformation Match** — `linear-transformations.js` already renders before/after
  vector pictures. Show the "after" picture for a hidden transformation (rotation,
  shear, reflection, scaling) applied to a fixed shape; player picks which of 4 candidate
  matrices produced it. Visual/perceptual game (§8), multiple-choice, no tolerance math
  needed at all.
- **Independence or Not** — `independence-basis.js`; show 3 vectors, single yes/no
  question "do these span R³ / are they independent" — the fastest possible game to build
  in the whole catalog (boolean generator + boolean checker, no answer-field UI at all).
- **Markov Steady-State Race** — `markov-chains.js` already iterates to a stationary
  distribution; player predicts which state has the highest steady-state probability
  before the engine's own convergence animation runs — turns an existing visualization
  into a prediction game with zero new math.

### 9.3 Number Theory (`engines/number-theory/`, `assets/js/*` — this engine has the
richest catalog because most of its 29 methods are already integer-in/integer-out)

- **Cipher Break** — `classical-ciphers.js` already implements Caesar/Vigenère
  encode/decode; generate a short encoded phrase, player decodes it, hint ladder =
  "it's a shift cipher" → "the shift is a common English-word-frequency clue" → shift
  value. This is the closest thing to DI's "Logic" category but grounded in an engine the
  site already has, not a hand-authored word-problem bank. The plaintext phrase pool is
  another good spot to borrow short, natural sentences from an external source (§6)
  rather than writing dozens by hand.
- **RSA Break-the-Toy-Key** — `rsa.js`; generate a deliberately small RSA modulus (two
  small primes, so it's crackable), player factors `n` and recovers the private
  exponent. Naturally tiered by modulus size = difficulty.
- **Modular Exponentiation Speed Round** — `modular-exponentiation.js`; timed mode,
  compute `a^b mod n` for a rapid sequence of small values — fastest possible drill
  format, good candidate for the "speed-run" shell variant from §9.1's Limit Sprint.
- **GCD Race (Euclidean Algorithm)** — `euclidean-algorithm.js`/`extended-euclidean.js`;
  player predicts each remainder in the algorithm's own step sequence before it's
  revealed — same "predict the next step of a known-correct trace" mechanic as the Taylor
  series idea in §9.1, reusable pattern worth naming once (**step-prediction game**) and
  applying anywhere an engine already returns a step array.
- **Primality Judge** — `primality-testing.js`; rapid-fire true/false on whether a
  number is prime, mixing in numbers deliberately chosen to be Carmichael-adjacent at
  hard difficulty (tests understanding of *why* naive tests fail) — content difficulty
  tuned by generator parameter choice, not by different code.
- **Quadratic Residue Sort** — `quadratic-residues.js`; given a small modulus, sort a
  set of numbers into residue/non-residue bins (drag-into-bin UI) — a categorization
  game, distinct mechanic from both text-answer and multiple-choice.
- **Divisor Function Bingo** — `divisor-functions.js`; a bingo-card grid of numbers,
  daily called-values are "n such that σ(n) is prime" style clues — a stretch/fun format
  worth prototyping last, after the core mechanics are proven.

### 9.4 Numerical Methods (`engines/numerical/`, `assets/js/algorithms.js` — this engine's
whole existing shape is "iterate → tabulate → converge," which maps unusually well onto a
**step-prediction game**, per §9.3)

- **Root-Finding Race** — `bisection.js`/`newton-raphson.js`/`secant.js` all already
  return per-iteration arrays; player predicts the next iterate's approximate value
  before it's revealed, scored on closeness, not exact match — the first game in the
  catalog where "checking" is a continuous score rather than boolean correct/incorrect,
  worth designing the scoring UI once and reusing for §9.5's numerical-integration ideas.
- **Convergence Order Detective** — given two methods' iteration tables side by side
  (e.g. bisection vs. Newton on the same root), player picks which converges faster and
  roughly why (multiple choice on the *reason*, not just the observation) — pairs nicely
  with the existing comparison instinct the method pages already encourage.
- **Quadrature Panel Estimate** — `trapezoidal.js`/`simpsons-rule.js`; show the function
  and the panel boundaries, player estimates the numeric integral value before computing,
  scored by closeness — same continuous-scoring mechanic as Root-Finding Race.

### 9.5 ODE/PDE (`engines/ode/`, `assets/js/ode-*.js`)

- **Direction Field Trajectory Guess** — `ode-direction-fields.js` already renders the
  field; player sketches (click-drag a path, or picks from 4 candidate curves) where a
  solution starting at a given point goes, before the actual solution curve is overlaid.
  Visual/perceptual game (§8), and one of the highest-payoff ideas for building real
  intuition, since direction fields are exactly the kind of thing that's hard to reason
  about without practice guessing.
- **Stability Classifier** — `systems.js`'s existing phase-portrait classification
  (node/saddle/spiral/center); show a system's matrix or its phase portrait, player
  classifies it — same multiple-choice-classification mechanic as Calculus's Series
  Convergence Call (§9.1), reusable UI.
- **Laplace Transform Pair Match** — `laplace-transform.js`; matching game, N functions
  on one side, N transforms shuffled on the other, drag to pair — same
  categorization/matching mechanic as Number Theory's Quadratic Residue Sort (§9.3).

### 9.6 Complex Analysis (`engines/complex/`, `assets/js/complex-*.js`,
`assets/js/mobius.js`, `assets/js/domain-coloring.js`)

- **Möbius Match** — `mobius-mapping.js`/`mobius.js` already render the picture; show the
  image of a fixed shape (circle/line) under a hidden Möbius transformation, player picks
  which of 4 candidate transformations produced it. Reuses existing domain-coloring/
  mapping visualization wholesale — the single cheapest visual game to build in the whole
  catalog because the rendering code is 100% already written for the method page.
- **Residue Speed Check** — `real-integrals-residues.js`/`laurent-singularities.js`;
  given a rational function, player identifies pole locations and orders before computing
  the residue — a two-stage hint ladder (locate poles → classify order → compute residue)
  matching the existing method page's own derivation order.
- **Cauchy–Riemann Yes/No** — `cauchy-riemann.js`; fastest game in this engine to build,
  same boolean mechanic as Linear Algebra's Independence-or-Not (§9.2): is this function
  holomorphic at this point, yes or no.

### 9.7 Statistics (`engines/statistics/`, `assets/js/stats-algorithms.js`)

- **Distribution Match** — `discrete-distributions.js`/`continuous-distributions.js`
  already plot PMFs/PDFs; show a plotted shape, player picks the distribution family +
  rough parameter from a small set of candidates — visual/perceptual game (§8), reuses
  existing plotting.
- **p-value Call** — `one-sample-t-test.js`/`chi-square-tests.js`/`anova-f-test.js`;
  given a test statistic and stated significance level, player predicts reject/fail-to-
  reject before the engine computes the exact p-value — boolean-with-a-twist (there's a
  numeric p-value shown after, so the player also sees *how close* their intuition was,
  not just right/wrong).
- **Regression Residual Spotter** — `linear-regression.js` already computes residuals;
  show a scatter + fitted line, player clicks the point with the largest residual before
  the values are revealed — visual/perceptual, reuses the existing plot.

### 9.8 Schools vertical (`schools/grade-5/`, `schools/grade-6/`) — a different audience,
worth a distinct, simpler shell, not the same puzzle template

The Schools lessons are static one-page-per-topic content for younger students (per
`project_school_visualization_state` — 52/52 + 39/39 lessons already shipped), not
engine-backed. Games here should be **drill/arcade format**, not the daily-streak
puzzle shell — different audience, different session length, different stakes:

- **Times-table / mental-math sprint** (grade 5, `2-1-mental-multiplication.html`
  territory) — pure client-side arithmetic generator, no engine call needed at all,
  timed, immediate feedback, designed for repeat short sessions rather than once-a-day.
- **Fraction/decimal matching** (grade 5 `4-x`/`6-x` lessons) — drag-to-match cards,
  same matching mechanic as §9.5's Laplace Pair Match, content pulled from the existing
  lesson topic list so the game reinforces a specific lesson rather than being generic.
- **Coordinate-plane translation/reflection game** — directly reuses the LilyPath
  grid-and-token mechanic from §8, and directly matches
  `schools/grade-6/4-2-translation.html` / `4-3-reflection.html`'s own content — build
  LilyPath once, skin it twice (a Lab-identity "vector jump" version and a
  Schools-identity "coordinate game" version), rather than building two grid engines.
- **Probability spinner/dice game** (grade-5 `10-4-chances-of-occurrence.html`, grade-6
  `8-5-probabilities.html`) — simulate spins/rolls client-side, player predicts outcome
  frequency, compare to the true probability after N trials — a hands-on complement to
  the static lesson page rather than a replacement for it.

### 9.9 Generative-art extensions — not gameplay, still on the Games hub

Approved alongside the rest of the catalog (§13). These don't ask the player to solve
anything, so they don't fit the generic puzzle shell (§4) or the visual-match pattern
(§8) — they're a third, simpler category: point an existing engine's renderer at a
frame and let it be looked at, listened to, or collected rather than answered.

- **Sound of Math** — the calculus engine's Fourier-series builder already assembles a
  partial sum term by term; sonify each added term through the Web Audio API and a
  square wave's construction (Gibbs phenomenon included) becomes audible, not just
  plotted. Reuses `fourier-series.js`'s existing term-by-term output — no new
  dependency, no new math.
- **Living Wallpaper** — the site's own hero particle field (`Proto.initRipple`,
  `DESIGN_SYSTEM.md` §7) is already a live three.js point cloud with cursor
  interactivity built in. Feed it a strange attractor's coordinates instead of a static
  flat grid and the Games hub's own hero stops being decoration and starts being the
  actual math — same renderer, same interaction, a different point-source function.
- **Theorem Cards** — one collectible-card visual per named result, auto-built from a
  method page's own title, formula, and category (no hand-authored card copy). A study
  aid and a shareable object at once, out of content every engine already has — number
  theory alone is 29 cards for free.

---

## 10. Explicitly deferred (do not build in phase 1, and why)

- **Accounts / login.** Nothing else on this site has auth. Adding it only for Games'
  streak-sync-across-devices is a large, separate infrastructure project (real backend,
  session handling, migration of the localStorage-first data model) that shouldn't gate
  shipping a single-player games section. Revisit only if the site adds accounts for a
  reason bigger than this section.
- **Leaderboards.** Needs a server to compare across players — meaningless as a
  client-only feature. A *local* "your best streak" is in scope (§7); a *global*
  leaderboard is not.
- **Credits / paywalled archive / monetization.** Not a fit for this site's current
  model; DI's own credit system is specifically about gating replay of past days behind
  payment, which has no analogue here since there's no revenue model in place at all.
- **Community problem submission.** DI's "submitted by X" pipeline needs moderation,
  review, and a submission form backend. The generator-based approach in this plan
  (§5–§6) removes most of the *need* for hand-submitted problems in the first place — new
  content mostly means new generator parameter ranges, not new hand-written problems.

---

## 11. Suggested build sequence

Not a committed roadmap — a recommended order, to be turned into real per-game plans
(`docs/agent-plans/games/`) once work actually starts:

1. **Shell pilot, one engine.** Build `SHELL_TEMPLATE.html` + `games-core.js` + exactly
   one game end-to-end — Daily Integral or Daily Derivative (§9.1), since Calculus's
   symbolic engine already returns `{steps[]}` in the exact shape the hint ladder and
   worked-solution panel need, minimizing new plumbing. This proves the architecture
   (§3–§5) before anything is templated for reuse.
2. **Generalize the shell.** Once the pilot works, extract anything pilot-specific back
   out of `games-core.js` into the per-game file, confirming the shell is actually
   generic — add a second, structurally different game (a boolean/multiple-choice one
   like Independence-or-Not or Cauchy–Riemann Yes/No, §9.2/§9.6) to stress-test that the
   shell doesn't secretly assume "free-text math answer."
3. **Fill out one game per engine** from §9's catalog, prioritizing the ones marked as
   cheapest (reuse existing plots/step arrays, boolean/multiple-choice checking) before
   the ones needing new generator logic.
4. **Visual/perceptual and matching games** (§8) — these need a second shell variant
   (answer = pick a rendered option, not type a value) but reuse the most existing
   plotting code per unit of new work.
5. **LilyPath-equivalent spatial game**, skinned once for the Lab and once for Schools
   (§9.8) — the single largest chunk of genuinely new logic in this plan, deliberately
   sequenced last so it doesn't block anything reusing existing engine functions.
6. **Schools drill games** (§9.8) — lowest technical risk (mostly no engine dependency)
   but a distinct audience/design pass, fine to run in parallel with step 3 onward if
   capacity allows rather than strictly after it.

Nothing above requires phase 1 to include streak-sync, accounts, or leaderboards (§10) —
each step ships a complete, playable feature on its own.

---

## 12. UI design direction — premium, not generic

Researched directly (not guessed) before writing this: a pass through current
design-critique writing on why AI-generated interfaces converge on the same look, plus a
look at how real, well-regarded daily-puzzle and math-learning products (Puzzmo, NYT
Games, Brilliant.org) actually handle the specific problem this section has — making a
"fun/game" surface feel considered rather than templated. Sources at the end of this
section.

### 12.1 What "AI slop" actually is, named plainly

The recurring, named pattern across every source consulted: purple-or-violet gradients
(often on a white background, but just as often as a neon glow on dark), Inter/Roboto as
the default typeface, a centered hero followed by three identical feature cards,
glassmorphism applied to everything regardless of whether it means anything, infinite
micro-animations with no motivation, and emoji standing in for actual icon design. The
underlying cause, as one source put it: a generator "has never seen your product, so it
invents one" — it reaches for the statistical average of its training data the moment
nothing tells it to decide otherwise. **The fix isn't "add more polish," it's "make
actual decisions and hold them consistently"** — which is exactly what
`DESIGN_SYSTEM.md` already does for the rest of this site (one accent per section, one
motion curve everywhere, one radius scale, colors never hardcoded outside tokens).

### 12.2 The slop risk specific to a *games/gamification* surface

Generic SaaS slop (purple gradients, glassmorphism) is one failure mode. A "make it feel
like a game" brief pulls toward a **second, different failure mode** just as generic:
mascot characters, flame emoji for streaks, confetti-canvas celebrations, circular
XP/level-progress rings, neon-glow achievement badges, a candy pastel palette, and a
friendlier/rounder font swapped in "because games should feel fun" — the Duolingo-clone
aesthetic, which is exactly as templated as the purple-gradient SaaS look, just aimed at
a different genre. dailyintegral.com's own bright pastel orbs (§2) are this same failure
mode. **Do not solve AI-slop by walking into gamification-slop.** Every rule below exists
to hold the line against both at once.

### 12.3 Concrete "never" list for this section

None of the following appear anywhere in Games, without exception:

- A mascot character or persistent guide/companion illustration.
- Flame emoji (or any emoji) standing in for the streak icon — the streak is a number, in
  mono, like every other stat this site already shows (`.result-stat`).
- A confetti/particle celebration library on solving a puzzle.
- A circular progress ring / XP bar / "Level 7" framing. This site has no concept of
  player levels anywhere else and Games shouldn't invent one.
- Neon-glow "achievement unlocked" badges or toast popups.
- A candy/pastel accent palette, or any accent outside the existing per-section family
  (`DESIGN_SYSTEM.md` §8 — same mid-tone, moderately desaturated lightness/saturation
  band as every other accent already in use).
- A rounder, "friendlier" display or body font swapped in for the occasion. Games reads
  in the same three typefaces as everything else (Fraunces / Roc Grotesk / Azeret Mono)
  — see §12.4 for exactly which role each one keeps.
- Green/yellow/gray Wordle-style tile coloring borrowed wholesale — it means something
  specific in Wordle (letter position feedback) and means nothing here; don't cargo-cult
  the color language of a different game's mechanic.
- Any new JS animation/confetti/toast library. Everything below is built from GSAP +
  three.js + the existing `engine-core.js` helpers already vendored in this repo
  (`DESIGN_SYSTEM.md` §12) — no new dependency for this section, full stop.
- Em dashes, filler verbs ("elevate," "unleash," "supercharge your practice"), or
  fabricated-precise stats ("94% of solvers...") in any hint, button label, or streak
  copy. Write hint/feedback text the same plain, technical-voice way the rest of the
  site's copy already reads (`DESIGN_SYSTEM.md` §11).

### 12.4 What to build instead — extend the existing system, don't invent a new one

Every UI need §4 describes already has a real analogue somewhere in this codebase.
Reusing it is both the anti-slop move and the cheap one — no new component design work,
no new visual language to keep consistent:

| Games needs | Reuse this existing pattern | Not this |
|---|---|---|
| Game entry point (landing grid) | `.engine-card` — dark card, soft accent-tinted radial glow top-left, brightens on hover, `.engine-dot` pulse, `.engine-card-head` eyebrow+index row | A colorful "orb" or icon-tile grid |
| Streak count, attempts used | `.result-stat` mono numeral tile, same as every method page's results strip | A flame icon + big number badge |
| "Correct" feedback | `Engine.pulseFlash()` (existing expanding-ring border flash) in `--validation-green`, scaled up slightly for a puzzle-completion moment | Confetti canvas, checkmark burst animation |
| "Wrong" / attempt used | Same `pulseFlash` mechanic in `--validation-red` | A shake animation + red toast |
| Hint revealed | `.proto-badge` — the existing dashed-border pill used to honestly flag in-progress states — repurposed to mark "hint 1 unlocked" | A speech-bubble mascot tip |
| Difficulty tier | `.tag` chip, same component already on every numerical/calculus method card | Colored belts, medal icons |
| Daily-reset countdown | Mono numerals styled like the numerical engine's `#stepLabel` step-through indicator | A big circular countdown ring |
| Worked solution | The calculus engine's existing `{steps[]}` derivation-ladder renderer, reused as-is | A new "explanation card" component |
| Grid/spatial game (LilyPath-equivalent) | `.crosshair-host` corner-tick "instrument panel" motif, leaned into for the grid's own frame | A cute pond/lily-pad illustrated skin |
| Game landing hero | The existing full-bleed `Proto.initRipple` particle field, tinted with a Games-appropriate accent from the existing family (§8) | A new static illustration or gradient hero |

Typography stays exactly as assigned sitewide: **Fraunces** for the game's own `.h1`/`.h2`
title only, **Azeret Mono** for every number, label, streak count, timer, and hint-ladder
step marker, **Roc Grotesk** for the problem statement's supporting prose (when a game
has any — most problem text itself is KaTeX, not prose). No new font is introduced for
this section.

### 12.5 Where Games is deliberately allowed to diverge — the "premium," not just "restrained," half

Pure restraint isn't the whole brief — a games section that's *only* the sober method-page
treatment risks feeling like a spreadsheet wearing a party hat. Two specific,
narrow permissions, both still built from existing mechanics:

- **Motion gets slightly louder exactly at the moment of success or failure, nowhere
  else.** This mirrors what Brilliant.org actually does well per the research pass —
  bespoke motion tied to brand identity, deployed specifically at moments that matter
  (their tangram-shaped loading state instead of a generic spinner is the same instinct).
  Concretely: the existing `pulseFlash` + the existing GSAP `back.out(1.7)` elastic ease
  already used in the Schools vertical's state-change animations (`DESIGN_SYSTEM.md`
  §14.3's GSAP conventions) is the one moment Games is allowed a slightly more
  "elastic"/celebratory feel than the flat `expo-out` curve used everywhere else. Every
  other interaction in Games (hovering a game card, opening a hint) stays on the
  site-standard `cubic-bezier(.16,1,.3,1)` curve, unchanged.
- **The streak/history metaphor is editorial, not game-y.** Per the research pass,
  Puzzmo's own visual metaphor for "you solved this" is explicitly *"a newspaper page,
  results memorialized in pencil"* — not a trophy shelf. Adopt that framing directly: a
  solved day shows as a small, quiet mono mark in a calendar-strip (think a sparse
  attendance record, not a badge wall), consistent with the mono/data-forward voice this
  site already uses for tables and stat tiles (`DESIGN_SYSTEM.md` §9). No trophy icons,
  no badge collection screen.

Both permissions are additive to the existing system, not exceptions to it — same fonts,
same accent-token discipline, same GSAP/three.js stack, same "no hardcoded hex outside a
token" rule. The line this section draws is specifically: *slightly more motion at
climax moments, and an editorial rather than arcade framing for progress* — nothing else
about the visual language changes for Games.

### 12.6 Sources consulted

- [AI Design Slop: Why AI-Generated UI Looks Generic — and the Fix](https://smoothui.dev/blog/ai-design-slop)
- [Why Every AI-Generated Landing Page Looks the Same (and How to Fix It)](https://dev.to/_46ea277e677b888e0cd13/why-every-ai-generated-landing-page-looks-the-same-and-how-to-fix-it-1kmo)
- [The End of "AI Slop": How UI/UX Pro Max is Solving the Design Crisis in AI-Generated Code](https://medium.com/@abhinav.dobhal/the-end-of-ai-slop-how-ui-ux-pro-max-is-solving-the-design-crisis-in-ai-generated-code-bbc23995f0e0)
- [Puzzmo co-creator Zach Gage on building newspaper games that can last forever](https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever)
- [How Brilliant.org motivates learners with animations](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations)
- `DESIGN_SYSTEM.md` (this repo, project root) — the existing identity every rule above
  extends rather than replaces.

---

## 13. Approved visual reference — the storyboard

**Status: approved, 2026-08-18.** §12 was the *rules*; this is the *screens* — every
frame was mocked up as a working HTML/CSS storyboard (device-frame mockups, not
screenshots, matching this codebase's real tokens) and signed off in full, including
the three generative-art extensions from §9.9. This section is the durable record of
that approval — the artifact it was reviewed in is a working surface, not the source of
truth; this file is. If the two ever disagree, treat this file as current and the
artifact as the snapshot that was true at review time.

Seventeen frames, in the order reviewed:

| # | Frame | What it shows | Spec section |
|---|---|---|---|
| 01 | Hub | `.engine-card` grid, one card per game, own accent per card from the existing per-section family | §12.4 |
| 02 | Daily shell | Header stat strip (streak/attempts/reset), KaTeX problem, live math-keypad answer field, hint ladder (locked/unlocked chips) | §4 |
| 03 | Feedback | Correct/wrong close-up — `pulseFlash` in `--validation-green`/`--validation-red`, no confetti, no shake | §12.4 |
| 04 | Worked solution | The calculus engine's own `{steps[]}` derivation ladder, "current row" infrared tint | §4, §12.4 |
| 05 | Yes/no | Independence-or-Not — two pill buttons, no answer field at all | §9.2 |
| 06 | Classify | Series Convergence Call — four fixed classification buttons, exact-match check | §9.1 |
| 07 | Visual match | Möbius Match — four candidate pictures, click the right one, no typed answer | §8, §9.6 |
| 08 | Sort/drag | Quadratic Residue Sort — chip pool dragged into two bins | §9.3 |
| 09 | Predict the step | Root-Finding Race — iteration table, a "predict the next value" row, closeness scoring | §9.4 |
| 10 | Speed run | Limit Sprint — same shell, timer chrome instead of countdown-to-reset, streak-of-correct dots | §9.1 |
| 11 | Vector Jump | The LilyPath-equivalent spatial game, framed through `.crosshair-host` instrument-panel styling, not an illustrated pond | §8, §9.8 |
| 12 | Archive | Calendar-strip of solved days, mono stat tiles — editorial "marked in pencil," not a trophy wall | §12.5 |
| 13 | Schools crossover | One Schools drill (Coordinate Jump) shown in the Apple-pass identity, deliberately distinct from every other frame — proves the two verticals stay correctly separated | `SCHOOLS_FINGERPRINT.md` §3 |
| 14 | Sound of Math | Fourier partial-sum sonification — play button, term chips, waveform bars | §9.9 |
| 15 | Living Wallpaper | The hero particle field re-pointed at a live attractor instead of a flat grid | §9.9 |
| 16 | Theorem Cards | A three-card stack, auto-built from method-page metadata | §9.9 |
| 17 | Reference map | A table tracing every frame back to the existing pattern it reuses, and naming what it deliberately avoids | §12.4 |

**What "approved" changes about §11's build sequence:** nothing about the order —
§11 still sequences by cost/reuse, not by review order. What it does change: frames 01,
02, 03, 04, 05, and 12 (the shell pilot, its feedback states, its worked-solution
panel, the cheapest boolean game, and the archive) are no longer *proposed* visual
design, they're the *locked* visual design for §11 step 1–2 — implementation should
match them, not reinterpret them. Frames 14–16 (§9.9) are approved content but were not
in the original build-sequence priority order; slot them in after step 3 (§11) as
low-effort, high-visibility additions, since none of them depend on the generic shell
existing first.
