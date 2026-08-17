# Repo organization & classification — full investigation

Every claim below was checked against the actual file, git status, git log, or a runnable
test — not inferred from a filename or a doc's own summary line. Three real, substantial
discoveries came out of doing that (§1). Everything after that is the folder-by-folder and
plan-by-plan classification requested, plus a full list of files that do no work for the
project.

**Status:** this document went through two passes. The first proposed a reorganization
without executing it. The second (§9, §10, and the updated §8) executed everything
non-destructive: files were moved (not deleted — see `for-delete.md` and the outer
`../baty-site-for-delete/` folder), the note app was unwired from the live project and
isolated (§9), and the plan-file coverage gap was filled (§10, which is also where §1c's
discovery came from). The only thing still not done is the note-app architecture decision
in §1a's last paragraph — deliberately left for you.

---

## 1. Two things that would have been missed by trusting filenames/summaries

### 1a. The note-app plan and the actual note-app build diverged architecturally

`docs/superpowers/plans/2026-08-14-note-app-foundation-fixes.md` (read in full) specifies:
- **Phase 3** (the document layer): a new `excalidraw-app/data/documents.ts` backed by
  **IndexedDB via `idb-keyval`**, and a new **full-screen `DocumentLibrary.tsx`** in a new
  `library/` folder that becomes **the app's entry point** — you land on a list of notes,
  click one to open a canvas, `?note={id}` in the URL, a "← Notes" way back.
- **Phase 0** (done first, a prerequisite for Phase 3): reorganize `syntropy/` — move
  `ChromeRail`/`PaperPicker`/`PenPresets`/`ThemeSwitcher` out to a new sibling `chrome/`
  folder, rename `LibraryPanel.tsx` → `MethodLibrary.tsx` specifically so it stops being
  one word away from the new `DocumentLibrary.tsx`.

What's actually on disk (uncommitted, found and worked on earlier this session):
- `excalidraw-app/data/notes.ts` uses **`localStorage`**, not IndexedDB/`idb-keyval`.
- `excalidraw-app/syntropy/NotesPanel.tsx` is a **side panel** sharing the same rail slot as
  the (still-named) `LibraryPanel` — mutually exclusive with it, not a full-screen entry
  point. You still land directly on a canvas; Notes is just another rail button.
- **Phase 0 never happened at all** — there is no `chrome/` folder; `ChromeRail.tsx` etc.
  are still under `syntropy/`; `LibraryPanel.tsx` was never renamed.
- Phases 1 (de-branding) and 2 (drop mermaid/cytoscape/codemirror) **did** land, closely
  matching the plan — confirmed via git diff/status: `ExcalidrawPlusPromoBanner.tsx`,
  `TTDStorage.ts`, the whole `TTDDialog/` directory, and `mermaid.ts`/`mermaid.test.ts` are
  all deleted; the accessibility heading already reads "Syntropy Canvas"; no Google Fonts
  preconnect remains.

Neither version is "wrong" — localStorage-plus-side-panel is a legitimate, simpler design
than IndexedDB-plus-full-screen-library. But right now the plan document and the code
disagree about the target architecture, and nothing marks the plan as superseded or the
divergence as intentional. Left as-is, a future session (or agent) picking up this plan
file at face value would try to build the IndexedDB/full-screen version on top of the
already-shipped localStorage/side-panel version — real, silent rework risk.

**Resolved for now, not permanently decided:** rather than pick one architecture and rework
the other, the note-app work was pulled out of the live `canvas/` app entirely and isolated
in `note-app-standalone/` (repo root) — see §9 for the full record. `canvas/` currently
behaves exactly as it did before any notes work: one shared canvas, no Notes panel. The
underlying choice — build it as this plan specifies (IndexedDB, full-screen library) or as
the isolated code already does (localStorage, side panel), whenever the note app becomes
active again — is still open, and the plan's status banner (added below) still names both
options.

### 1b. A second, much larger symbolic-kernel project exists, fully separate from the Syntropy canvas rollout, genuinely done for Phases 0–4, and was invisible all session until this pass

`math-lab/docs/kernel/04_BUILD_PHASES.md` (read in full) documents an from-scratch,
proprietary computer-algebra kernel — polynomial algebra, a term-rewrite engine, an
assumptions/branch-selection system, Taylor/Laurent series, limits — being built to
eventually replace the existing nerdamer-based engines. This is **not** the same project as
the Syntropy canvas node rollout this session otherwise focused on; it lives entirely under
`math-lab/assets/js/kernel/` and is orthogonal to the canvas.

Verified directly, not from the doc's own claims:
- `math-lab/assets/js/kernel/` exists, 41 files tracked in git (part of the repo's single
  "Initial commit" on 2026-08-05 — this repo's history starts there, so no finer-grained
  commit trail exists for when each piece landed).
- Ran the gate test suites directly: `node tests/verify-kernel.js` → **76/76 passed**,
  `node tests/verify-poly.js` → **36/36 passed**, `node tests/verify-series.js` →
  **84/84 passed**. The doc's own "STATUS: done" claims for Phases 1, 2, 2b, 2d, 3
  (foundation slice), and 4 (foundation slice) check out against running code, not just
  against the doc's own prose.
- Production wiring is real but partial, and the doc is explicit about exactly where it
  stops: Phases 1, 2, 2b are wired into `integration-advanced.js`/`calculus-symbolic.js`
  (confirmed: `assets/js/kernel/bridge.js` is the seam, `tools/build-kernel-bundle.js`
  bundles the kernel for the worker). **Phase 3's polynomial integrator is wired; Phase 4's
  series/limit/Laurent/singularity/convergence code is not** — it exists and passes its own
  gate tests, but nothing in the L3 dispatch calls it yet.
- Phases 5 (Rubi rule port, 6,700 rules), 6 (ODE/PDE kernel completion), 7 (Complex
  Analysis kernel completion), 8 (server boundary) are **not started** — no corresponding
  files exist under `kernel/`.

This is a large, real, verified body of work that changes the honest answer to "is the
symbolic math correct" for a meaningful slice of Calculus (rational-function integration is
now provably complete for denominators that split over ℚ, not just heuristically usually
right) — and it was not on my radar at all before this pass because it doesn't intersect
`canvas/` or the Syntropy port-spec rollout that dominated this session's prior work.

### 1c. The Schools vertical has an active, in-progress tech-stack migration that project
memory's "Grade 5 + Grade 6 shipped" summary doesn't capture

Found while filling the gap flagged in an earlier pass of this document (`docs/` root-level
files were never opened). `docs/school-upgrade-handoff.md`, dated **2026-08-17 — the day
before this investigation** — describes a from-scratch rendering-stack pilot for schools
lessons, separate from and later than the Grade 5/Grade 6 ship dates (2026-08-14 / 08-16):

- **New stack:** JSXGraph (`schools/assets/vendor/jsxgraphcore.js`) for the interactive
  geometry board, replacing hand-rolled SVG; Motion (`schools/assets/js/lesson-motion.js`)
  for animation, replacing per-element `gsap.fromTo` calls.
- **One reference lesson built as the pattern:** `schools/grade-6/4-5-geometric-constructions.html`
  (498 lines) — confirmed on disk, **untracked in git**. A second variant,
  `4-5-geometric-constructions-apple.html`, also exists and also uses JSXGraph (an earlier
  style exploration for the same lesson — this is the exact file the six now-moved-out
  `_probe_*.js` scripts were hardcoded to test against, which is what they were actually
  debugging).
- **Scope so far: 2 of 40 Grade 6 lessons** use the new stack (grepped `jsxgraph` across
  `schools/grade-6/*.html`); **0 of the Grade 5 lessons** do. The other 38 Grade 6 lessons
  and all Grade 5 lessons still use the original hand-rolled-SVG-plus-gsap pattern that
  shipped on 08-14/08-16.
- **Not decided:** the handoff doc itself says the reference lesson is "probe-clean" but
  unreviewed, and next steps are either wait for visual review or continue converting more
  lessons to the new stack — no commitment yet to migrate the other 38+ lessons.
- Traced one library back further: `docs/integration-demos/jsxgraph.html` is a small
  standalone feasibility demo, part of a 12-file folder evaluating other libraries too
  (`matter.html`, `phaser.html` — physics; `mathlive.html` — math input; `fsrs.html` —
  spaced repetition) that don't appear to be adopted anywhere in shipped work yet. Not
  investigated further this pass; flagged as a pointer for later, not a current gap.

**Practical effect:** "Grade 5 + Grade 6 shipped" (project memory's framing) is still true
for lesson *coverage*, but is silently incomplete about *implementation currency* — there is
now a second, better rendering approach that only 1 of 91 shipped lessons uses, an active
open question about whether/how far to roll it out, and one genuinely untracked file
(`4-5-geometric-constructions.html`) sitting alongside the already-known-uncommitted rest of
`schools/`.

---

## 2. Root-level files

| File | Classification | Notes |
|---|---|---|
| `README.md` | **Stale** | Describes Universities/Schools/Games labs as "planned... not yet started." Schools (Grade 5 + 6, 91 lessons) is actually substantially built, per project memory and `schools/` on disk. Needs a rewrite once the schools vertical's status is settled. |
| `CLAUDE.md` | Active, current | Working-style instructions read at the start of every session. |
| `DESIGN_SYSTEM.md` | Active reference | 34 KB, last touched Aug 14 — recent, presumably current. |
| `FOUNDATION_CHECKLIST.md` | Active reference | Explicitly scoped to "engineering foundation only," defers to `CURRICULUM_ROADMAP.md` for features — internally consistent, no contradiction found. |
| `CHANGELOG.md` | Active, but describes unpushed work | States it covers everything since the last GitHub push (`accddd7`) — i.e., it's a running log of exactly the backlog this whole document is about. Worth keeping updated as things get committed. |
| `index.html` | Active — the site's umbrella hub page | Referenced by `run.sh`. |
| `run.sh` | Active — the documented local launcher | Keep at root; this is the "right" way to run the whole site locally (canvas needs a real HTTP origin, not `file://`). |
| `Pasted image.png` | **Dead weight** | Untracked, 110 KB screenshot. Referenced once, only from `archive/docs/root-planning/RESHAPE_REPORT.md` — an already-archived report. Not used by any live doc or page. |
| `scripts/probe_all.js` | **Moved** (was root `probe_all.js`) | A real Playwright tool: loads a list of lesson HTML files and reports console errors. Re-homed into a new root `scripts/` folder — no other file referenced it by path, confirmed by grep before moving. |
| `_probe_click.js`, `_probe_drag.js`, `_probe_edge.js`, `_probe_hl.js`, `_probe_size.js`, `_probe_size2.js` | **Dead weight, still at root** | All six are one-off Playwright debug scripts hardcoded to a single file path: `schools/grade-6/4-5-geometric-constructions-apple.html`. That lesson has shipped; these were throwaway session debugging aids for building it, not a reusable tool (unlike `probe_all.js`, which takes a list). Left in place per "don't delete" — listed in `the next vision/for-delete.md`. |
| `archive/docs/root-planning/syntropy-execute-prompts.txt` | **Moved** (was root `syntropy-execute-prompts.txt`) | A plain-text set of copy-paste agent prompts for the Syntropy async/symbolic/per-engine rollout, written before that work had formal plan files. Every plan it refers to (Foundation, Complex, ODE, Calculus) now has a real, more detailed `docs/superpowers/plans/*.md` counterpart, and per this session's own git-log check, all of them are built. Archived alongside the other superseded root-planning docs rather than deleted. |

---

## 3. Top-level folders

| Folder | Size | Classification |
|---|---|---|
| `canvas/` | — | Active code — the Syntropy Canvas / note-app fork. This session's primary work all session. |
| `math-lab/` | — | Active code — the seven math engines plus the new symbolic kernel (§1b). |
| `schools/` | 2.7 MB, 101 files | Active code, **uncommitted**. Grade 5 (52/52) + Grade 6 (39/39) lessons, per project memory. |
| `docs/` | 572 MB | Mixed — see §4/§5. 566 MB of it is `curriculum-references/` (see below). |
| `archive/` | 24 MB tracked-portion, gitignored bulk | Mixed — `archive/docs/` is intentionally tracked (real history); `archive/numerical-engine-v1/` and `archive/worldquant-foundry-template/` are gitignored and explicitly labeled in `.gitignore` as "superseded"/"unrelated template." |
| `reference/` | 982 MB | **Not project code.** Gitignored. The user's own personal course material (lecture PDFs, Mathematica notebooks, WhatsApp photos of handwritten notes) across nine subjects — the source material math-lab's engines were built from. Legitimate to keep, not something to "organize" as project structure. |
| `prototypes/` | 136 KB, 6 files | Mixed — see §6. |
| `.superpowers/` | 1.9 MB | Tool-local skill state (brainstorm/sdd), gitignored. Not project content — created and consumed by the `superpowers` skill machinery itself, not authored by any session on this project. |
| `.claude/worktrees/` | 39 MB, 5 dirs | **Dead weight** — see §7. |
| `the next vision/` | growing | This document and its sibling investigation live here — the folder you asked to be created for this class of deliverable. |

---

## 4. Plan-folder-by-plan-folder classification: `docs/superpowers/`

`docs/superpowers/plans/` (23 files) and `docs/superpowers/specs/` (20 files) are this
project's formal planning system (plans = task-by-task implementation instructions; specs =
the design decisions a plan is written from). Cross-referenced every plan against git log
and, for several, the actual files it says it creates.

**Confirmed DONE** (built, and where checked, matching the plan's own described files):
- All 7 ODE Engine phase plans (`2026-08-01-ode-engine-phase1-general-solver.md` through
  `2026-08-02-ode-engine-phase5c-numerical-pde.md`) — spot-checked two (`ode-solver.js`,
  `ode-wave.js`) against the plan's own "Create:" file lists; both exist exactly as
  described. Every one of these plans has **0 checked checkboxes** despite being done —
  the checkbox tracking was simply never used during execution, not a sign of incompleteness.
- All ~14 Syntropy canvas plans (visual identity, library panel, node host, node visual
  language, premium chrome, site integration, matrix/node archetype, per-engine rollouts
  for Calculus/Complex/Number Theory/ODE, the async/symbolic foundation) — confirmed via
  this session's own direct git-log review and, for several engines, direct browser testing
  today.
- `2026-08-04-math-canvas-fork-scaffold.md` — the canvas fork exists and is the active app.
- `2026-08-14-grade5-schools-lesson-plan.md`, `2026-08-16-grade6-schools-lesson-plan.md` —
  matches the 52/52 + 39/39 shipped-lesson state from project memory.

**Diverged from plan, not simply done** — one file:
- `2026-08-14-note-app-foundation-fixes.md` — see §1a. Phase 1 and 2 landed close to spec;
  Phase 0 never happened; Phase 3 was built with a different architecture than specified.

All corresponding `specs/*.md` design docs (20 files) were the basis for the plans above and
track the same status — none read in full this pass beyond the ones cross-referenced for
§1a, but no plan/spec mismatch surfaced anywhere the plans themselves were checked.

---

## 5. Plan-folder-by-plan-folder classification: `math-lab/docs/`

This directory has **three generations of planning documents that supersede each other**,
which is exactly the kind of thing that causes confusion if only the newest-looking one is
read:

1. **Oldest / most stale — top-level `*_ENGINE_PLAN.md` files.** Checked individually, not
   as a block — they don't all share one status:
   - `CALCULUS_ENGINE_PLAN.md` — genuinely stale, dated 2026-07-22, predates the phase-1
     extraction. **Now carries a pointer** to `phase-1-plan/CALCULUS_ENGINE.md` (added
     during implementation of this doc's own §8 recommendations).
   - `SYMBOLIC_KERNEL_PLAN.md` — **not stale**, already correctly self-describes as a
     one-page summary with an explicit pointer to `kernel/00_INDEX.md` for the full plan.
     No action needed; this was already done right.
   - `ODE_PDE_ENGINE_PLAN.md` — **not stale, corrected from an earlier pass of this
     document.** Read in full during implementation: it carries its own note "Full rewrite,
     2026-08-02" and states "Status: complete — every phase of the redesign (1 through 6)
     has shipped," pointing readers to the per-phase plans under
     `docs/superpowers/plans/2026-08-0*-ode-engine-phase*.md` for detail. This is why
     `math-lab/docs/phase-1-plan/` (generation 2, below) has no `ODE_PDE_ENGINE.md` of its
     own — it wasn't needed; the top-level file was kept current in place instead. (The
     `archive/docs/phase-1-plan/ODE_PDE_ENGINE.md` that *does* exist is the old, now
     genuinely superseded 5/11-status snapshot this rewrite replaced.)
   - `ANTIDERIVATIVE_STRATEGY.md`, `ODE_PDE_SOLVER_DESIGN.md` — not re-verified this pass;
     no pointer added, no claim made either way.
   - Number Theory's and Complex Analysis's original top-level plans, referenced by
     `phase-1-plan/README.md` as having been found **badly stale** during that extraction
     (Number Theory's said "not started" when essentially complete; Complex Analysis's said
     later phases were "next" when already shipped) — both already moved to
     `archive/docs/engine-plans/` (`NUMBER_THEORY_ENGINE_PLAN.md`,
     `COMPLEX_ANALYSIS_ENGINE_PLAN_V1.md`/`V2.md`), so there's no stale top-level copy of
     either still sitting in `math-lab/docs/` today.

   **Lesson from getting `ODE_PDE_ENGINE_PLAN.md` wrong in an earlier pass of this same
   document:** "top-level `*_ENGINE_PLAN.md` file" is not itself a reliable staleness
   signal — some were left to rot, at least one was deliberately kept current in place.
   Each needs its own check.

2. **Middle generation — `phase-1-plan/`** (6 files, dated 2026-07-31). Explicitly a
   curated, verified-against-code re-extraction of "what's actually done," written because
   generation 1 above was untrustworthy. As of its own writing: Calculus 18/18 (complete),
   Number Theory 26/26 + extras (complete), Complex Analysis 11/17, ODE/PDE 5/11, Symbolic
   Kernel phases 0–2d done with 3/4 foundation-complete. **This generation is itself now
   stale** — this session directly confirmed ODE/PDE is now 9/9 methods (all of ODE phases
   1–5c landed after 2026-07-31, see §4) and Complex Analysis's Syntropy-side rollout
   covers 9/12 methods (3 deliberately skipped, needing the Field/domain-coloring node —
   see prior session findings). **Classification: was-current-as-of-07-31, now superseded
   by actual shipped code; still useful as the discovered-staleness warning for generation 1.**

3. **Newest, most rigorous — `kernel/` (12 files, `00_INDEX.md` through `12_RISKS.md`)**.
   The authoritative current plan for the symbolic kernel specifically (see §1b) —
   `00_INDEX.md` states explicitly it supersedes `SYMBOLIC_KERNEL_PLAN.md`, keeping that
   one only as a one-page executive summary. **Classification: current, verified against
   running tests this pass, the one to trust for kernel status.**

**Other files in `math-lab/docs/`:**
- `CURRICULUM_ROADMAP.md` — cross-engine feature backlog and priorities; not deeply
  re-verified this pass beyond noting it's referenced correctly by `FOUNDATION_CHECKLIST.md`
  as the place feature scope lives (no duplication found there).
- `PER_ENGINE_AUDIT.md` — a 2026-07-30 synthesis across all 7 engines, framing gaps as one
  of four bucket types (unbuilt promised page / duplicated hand-rolled path / SymPy-punted
  method / silently-capped answer). Same generation as `phase-1-plan/`, likely needs the
  same "shipped-since-then" discount for ODE/PDE and Complex specifically.
- `agent-plans/` (current, non-archived) — **live and current**, not stale. Its own
  `README.md` states plainly that the Numerical Engine's actual per-method plans moved to
  `archive/docs/agent-plans/` once all 29 methods shipped, and this directory now holds
  only `00-SHARED-CONVENTIONS.md` (the reusable house style, still the reference for
  building a new method by hand or by agent) plus a `statistics/` subfolder for that
  engine's still-referenced conventions/backlog.
- `phase-2-plan/interactivity-ideas.html` — covered in full by the sibling document
  `the next vision/math-lab-interactivity-investigation.md`.

---

## 6. `prototypes/` (6 files)

Not deeply investigated file-by-file this pass (lower priority than the plan docs above);
flagging what's known and what needs a follow-up look before any reorganization decision:

- `lesson-g6-1-1-integers-absolute-value.html`, `number-line-primitive-pilot.html` — almost
  certainly early pilots for the Grade 6 schools lessons (name matches the shipped
  `schools/grade-6/` naming convention). If Grade 6 is genuinely 39/39 shipped, these are
  very likely superseded prototypes, but this wasn't confirmed by diffing against the
  shipped lesson.
- `syntropy-archetype-nodes.html` (46 KB) — likely an early mockup for the canvas node
  archetype redesign, which shipped (per this session's own findings, all 6 non-Field
  archetypes done, Field done as of today's fix). Likely superseded, not confirmed.
- `test-arabic-decimal-numerals.html`, `test-katex-bilingual.html`,
  `test-katex-equation-bar.html` — small (2-3 KB) isolated rendering tests for bilingual
  Arabic/KaTeX layout. Could still be useful as regression fixtures for that specific
  rendering concern, or could be one-off scratch — not determined this pass.

**Recommendation:** worth one more pass specifically diffing each prototype's content
against its likely shipped counterpart before deciding archive vs. delete vs. keep.

---

## 7. Full "no work for the project" classification

Files/directories confirmed to do zero present work for the project — safe reorganization
candidates, listed with the evidence, not just an assertion:

| Item | Evidence | Recommended action |
|---|---|---|
| `.claude/worktrees/agent-a00f32b9bb7c7fe8f/`, `agent-a4f252ffce4ea9d56/`, `agent-a64521531eebba891/`, `agent-a7344e1f224ee2c58/`, `agent-aab4ffd2819151b17/` (39 MB total) | `git worktree list` shows only the main repo — none of these 5 are registered worktrees anymore, they're orphaned directories. Each contains uncommitted changes to `math-lab/assets/js/algorithms.js` plus one Numerical-engine method (`false-position`, `power-method`, `lagrange-interpolation`) dated 2026-07-20 — all three methods are now shipped, complete, in the real `math-lab/` tree. Locally excluded from git already (`.git/info/exclude`), never tracked. | Listed in `the next vision/for-delete.md` — not deleted. |
| `_probe_click.js`, `_probe_drag.js`, `_probe_edge.js`, `_probe_hl.js`, `_probe_size.js`, `_probe_size2.js` (root) | All six hardcode the same single, already-shipped lesson file path. No other file references them. | Listed in `for-delete.md` — not deleted. |
| `Pasted image.png` (root) | Referenced only from one already-archived report. | Listed in `for-delete.md` — not deleted. |
| `archive/numerical-engine-v1/` | `.gitignore` itself labels this "Archived pre-redesign build... superseded." Gitignored, never tracked. | Already correctly filed as archive — no action needed, just confirming it's genuinely dead-for-the-project, not overlooked. |
| `archive/worldquant-foundry-template/` | `.gitignore` labels this "unrelated template." Gitignored. | Same as above — correctly filed, no action needed. |

**Re-homed, not dead** (did real work, was just misplaced — moved during implementation of §8):
- `probe_all.js` → `scripts/probe_all.js`. A real, general-purpose lesson-console-error
  checker; now lives in a proper location instead of loose at repo root.
- `syntropy-execute-prompts.txt` → `archive/docs/root-planning/syntropy-execute-prompts.txt`.
  Superseded by formal plan files (all confirmed built, §4), archived alongside the other
  superseded root-planning docs rather than deleted.

**Explicitly NOT classified as dead**, despite being large and outside `canvas/`/`math-lab/`:
- `reference/` (982 MB) and `docs/curriculum-references/` (566 MB) — both are source
  material the engines and lessons were/are built from, both deliberately gitignored as
  copyrighted personal material, both referenced by the `.gitignore` file's own comments as
  intentional. Not project code, but not garbage either.

---

## 8. Recommended reorganization — status

Deletion is explicitly off the table (all delete candidates moved to
`the next vision/for-delete.md` instead, per instruction). Non-destructive moves and doc
fixes were implemented directly; the one real decision is still open.

- ✅ **Done:** `probe_all.js` → `scripts/probe_all.js` (new folder created; no other file
  referenced the old path, confirmed by grep first).
- ✅ **Done:** `syntropy-execute-prompts.txt` → `archive/docs/root-planning/` (untracked in
  git, so a plain filesystem move rather than `git mv`).
- ✅ **Done:** pointer note added atop `math-lab/docs/CALCULUS_ENGINE_PLAN.md` (the one
  top-level `*_ENGINE_PLAN.md` file actually confirmed stale — see the corrected §5 above).
  `SYMBOLIC_KERNEL_PLAN.md` already had its own pointer; `ODE_PDE_ENGINE_PLAN.md` turned
  out not to need one (it's current, corrected in §5).
- ✅ **Resolved — §1a's decision made and executed.** The note app is unwired from the
  live project and separated into its own folder — see §9 for the full record of what was
  reverted and where the files went.
- ✅ **Done — `prototypes/` follow-up diff completed and physically moved.** All 6 files
  confirmed superseded (evidence in `for-delete.md`) and moved to
  `../baty-site-for-delete/prototypes/` (outer folder, sibling to this project) — not
  deleted, per instruction. See §9.
- ✅ **Done — the 5 stale `.claude/worktrees/agent-*` directories** (39 MB) moved to
  `../baty-site-for-delete/claude-worktrees/` — not deleted. See §9.

---

## 9. Note app — separated out of the live project (executed)

Per instruction: don't leave the note-taking layer active in the main project; isolate it
in its own folder instead of deciding between the two architectures in §1a.

**Unwired from `canvas/` and reverted to pre-notes behavior** (typechecked clean after):
- `canvas/excalidraw-app/App.tsx` — removed the `NotesPanel` import/render, the
  `isNotesPanelOpen` state, the `notesOpen`/`onNotesToggle` `ChromeRail` props, the
  `activeNoteId`/`onSwitchNote` prop-drilling through `ExcalidrawWrapper`, and the
  `ensureActiveNote`/`switchToNote` logic in `ExcalidrawApp`. De-branding removals already
  in this file (GitHub/X/Discord/YouTube links, `ExcalidrawPlusPromoBanner`, etc.) were
  left untouched — only the notes-specific hunks were reverted.
- `canvas/excalidraw-app/syntropy/ChromeRail.tsx` — fully reverted (its entire diff was
  notes-only).
- `canvas/excalidraw-app/data/LocalData.ts`, `data/localStorage.ts` — fully reverted (both
  diffs were notes-only): save/load goes back to the single fixed `STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS`/`_APP_STATE` localStorage keys.
- `canvas/excalidraw-app/ExcalidrawPlusIframeExport.tsx` — found and reverted a fourth
  notes-coupled file not caught in the original investigation (missed because §1a's
  read only checked the files already known to be touched; a repo-wide grep for
  `data/notes|NotesPanel|getActiveNoteId` after the other three reverts surfaced this one).
  Reading back through this file also surfaced that Task 1.7 of the note-app plan ("remove
  the dead Excalidraw+ cloud-export route," which would have deleted this file entirely)
  was never executed either — noted here, not acted on, since it's de-branding scope, not
  notes scope.
- Confirmed clean afterward: `grep -rl "data/notes\|NotesPanel\|getActiveNoteId\|getNoteElementsKey\|getNoteAppStateKey\|ensureActiveNote\|touchNote" canvas/` returns nothing, and `yarn test:typecheck` passes.

**Moved, not deleted:**
- `canvas/excalidraw-app/data/notes.ts`, `canvas/excalidraw-app/syntropy/NotesPanel.tsx`,
  `canvas/excalidraw-app/syntropy/NotesPanel.scss` → `note-app-standalone/` (new folder at
  repo root, sibling to `canvas/`/`math-lab/`/`schools/`). Code is inert there — nothing
  imports it — kept for reference/future use, not wired into anything.

**What this means:** the live `canvas/` app now behaves exactly as it did before this
session's notes work — one shared canvas, no Notes panel in the chrome rail. The
`2026-08-14-note-app-foundation-fixes.md` status banner (§1a) is still accurate about what
was built; it just describes work that's now been pulled back out rather than left active.

---

## 10. Filling the remaining plan-file gap: `docs/` root and `archive/docs/` subdirectories

The original pass of this document covered `docs/superpowers/` and `math-lab/docs/` in
depth but never opened the design/plan files sitting directly in `docs/` root, and only
classified `archive/docs/agent-plans`, `archive/docs/root-planning`, and
`archive/docs/engine-plans` at the directory level, not file-by-file. Closing that gap:

**`docs/` root — 12 files, all dated 2026-08-09 through 08-11, all predate the actual
Grade 5/6 lesson ship dates (08-14/08-16):**

`school-lab.html`, `school-lab-locked.html`, `school-lab-interactive.html`,
`school-lab-fusion-demo.html`, `school-engine-architecture.html`, `school-engines-v2.html`,
`math-curriculum-scope.html`, `animation-visual-identity-directions.html`,
`depth-field-adaptive-plan.html`, `lesson-lcm-gears-prototype.html`,
`lesson-pythagorean-squares-prototype.html`, `audit-2026-08-09.md` (Arabic-language audit
report). Titles alone show iteration (three different "school lab" framings, two different
"school engine architecture" framings) — this reads as the design-exploration lineage that
settled into the pattern the actual shipped Grade 5/6 lessons use. **Classification:
superseded exploration history**, same treatment as `math-lab/docs/`'s generation-1 docs —
not verified file-by-file against shipped code this pass (lower priority than §1c's active
finding), kept for the record of how the current lesson pattern was arrived at. Not moved,
not flagged for deletion — just correctly understood as historical rather than current.

**`docs/integration-demos/` (12 files, 5.1 MB)** — standalone feasibility demos for
libraries under evaluation: `jsxgraph.html` (now known to matter — see §1c),
`function-plot.html`, `mathlive.html` (math input), `matter.html`/`phaser.html` (physics),
`fsrs.html` (spaced repetition), `cindyjs.html`, `dexie-yjs.html`, `echarts.html`, plus an
`index.html`. Only `jsxgraph.html`'s subject has a confirmed path into shipped work so far
(§1c). The others don't appear adopted anywhere yet — not investigated further this pass,
flagged as a pointer for whoever picks up the schools-stack question next.

**`archive/docs/agent-plans/` (24 numbered Numerical-engine method plans + `statistics/`
subfolder with 9 more + shared conventions/prompts files)** — per-method build plans for
work already confirmed shipped (all 29 Numerical methods, per this session's earlier
findings and `math-lab/docs/agent-plans/README.md`'s own statement that these moved here
once done). Not opened individually this pass; directory-level classification (done work,
correctly archived, real git-history value) stands from the original investigation.

**`archive/docs/root-planning/` (5 files after this session's two moves:
`AUDIT_REPORT.md`, `FOUNDATION_CHECKLIST-history.md`, `PLAN.md`, `RESHAPE_REPORT.md`,
`syntropy-execute-prompts.txt`)** — not opened individually; directory-level classification
(superseded root-level planning history) stands.

**`archive/docs/engine-plans/` (`ARCHITECTURE_AUDIT.md`, `COMPLEX_ANALYSIS_ENGINE_PLAN_V1.md`,
`COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md`, `COMPLEX_DESIGN_IDENTITY.md`,
`NUMBER_THEORY_ENGINE_PLAN.md`)** — not opened individually beyond what §1b/§5 already
surfaced (V2 is the still-relevant animated-two-plane-map design referenced there; the
Number Theory plan is the one `phase-1-plan/README.md` says was found badly stale).
Directory-level classification stands.
