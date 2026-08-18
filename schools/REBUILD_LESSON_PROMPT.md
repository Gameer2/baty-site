# Rebuild-lesson task

**Usage:** tell the agent which lesson file to target, then say "follow
`schools/REBUILD_LESSON_PROMPT.md`." Everything it needs is either in this file or in
the docs this file points at.

---

Rebuild the target lesson to match the app-shell + notebook archetype documented in
`schools/SCHOOLS_FINGERPRINT.md`.

## Before touching any code

Read in full:
- `SCHOOLS_FINGERPRINT.md` §10.3, §10.5, §10.6, and §9.1 — that's the complete recipe
  and every pitfall already found. Do not skim; read the whole thing.
- Whichever completed reference lesson is closest in kind to the target:
  - `schools/grade-6/4-5-geometric-constructions-apple-integrated.html` — the base
    archetype (app-shell, procedure rail, notebook, explain popover).
  - `schools/grade-5/1-4-negative-numbers.html` — a draggable value on a number line
    (the JSXGraph pattern, §10.6).
  - `schools/grade-5/5-4-double-bar-graph.html` — no coordinate math, reveal-based
    steps instead of a value axis.
- The target lesson's current file, in full.

## Follow the §10.5 recipe, with real judgment

Apply §10.5 exactly, but use its point 5 — don't force a mode-toggle, a JSXGraph port,
or a 4-step template where the content doesn't call for one. In particular:

- **If the lesson has its own hand-rolled `value → pixel` formula** for a draggable
  diagram (a `yFor()`/`vFromClientY()`-style pair), port it onto JSXGraph (§10.6) — a
  constrained `point` is usually enough. If the lesson has no coordinate math (e.g. a
  chart built from CSS heights), don't force one in.
- **Write real 4-section notebook content** — *On the board now / The move / Why it
  holds / Next* (or *Result* on the last step) — in both EN and AR, for every step.
  Not filler: an actual invariant or reasoning per step, interpolating the live state
  into the text the way the reference lessons' `getEntry()` does.
- **Every dynamically-created text node needs its `ar-ui`/`ar-body` class added
  explicitly** in the JS that creates it — `initI18n`'s automatic `[data-role]` scan
  only reaches elements that exist in the static HTML, not ones built at runtime.
- **If anything is draggable**, split the render function into a labels-only part
  (text/equation/slider readout — callable from the drag handler) and the
  position-tween part. Never call the tween-driven render from inside a drag event;
  it fights the library's own drag with a redundant animation on top of it.
- **Decide the step axis honestly.** If the content has real sequential steps, reveal
  them progressively. If it's continuous/drag-driven with no natural steps, repurpose
  the step slider as "which of N ideas is being demonstrated," each step jumping to a
  representative state. Don't force a shape the content doesn't have.

## Verify with Playwright, not visual judgment

This agent has no image input — measure, don't eyeball. Load the local install with:

```js
const { chromium } = require('/home/ameer/node_modules/playwright');
```

Check, and report exact measured values (not "it looks right"):
- Zero console errors.
- No element's rect starts left of its `overflow:hidden` ancestor (the clipped-hint
  bug pattern).
- Every AR-mode text node's computed `font-family` and `direction`.
- A *simulated* drag actually updates app state — use several small `mouse.move`
  steps with short waits between them, not one large jump (a single big jump can be
  swallowed by the library's own drag threshold).
- The notebook opens and cycles through every step, with correctly interpolated text
  at each one.
- The mobile breakpoint (resize to ~480px width) still lays out correctly.

## When done

- Update `SCHOOLS_FINGERPRINT.md`'s backlog list — remove the file just finished.
- Add a short paragraph to `SCHOOLS_FINGERPRINT.md` (§10.5/§10.6 area) only if you
  found something the existing docs didn't already cover. Don't restate what's
  already written there.

Do this as one continuous pass. Don't stop to ask permission between steps — only ask
if you hit a genuine judgment call the docs above don't resolve.
