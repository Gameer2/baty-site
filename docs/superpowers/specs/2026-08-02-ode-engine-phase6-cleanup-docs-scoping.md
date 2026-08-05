# ODE Engine Phase 6 — Cleanup & Docs — Scoping Note (not a full plan)

**Why this isn't a full design + implementation plan like Phases 1-5:** Phase 6's actual work —
deleting now-dead code, rewriting `ODE_PDE_ENGINE_PLAN.md`/`ODE_PDE_SOLVER_DESIGN.md`,
reconciling `CURRICULUM_ROADMAP.md` §5, fixing `tests/bench/corpus-engines.js` — all depend on
knowing the *actual final shape* of Phases 3, 4, and 5's code. Right now those three are
committed **plans**, not shipped code (Phases 1-2 are the only ones merged to `main`). Writing
line-by-line deletion/rewrite instructions against code that doesn't exist yet would mean
fabricating file contents I can't verify — exactly the kind of guessing this whole engine's own
"never trust blindly" discipline exists to prevent. This note captures what's already known and
durable, so Phase 6 can be planned quickly and accurately once 3-5 land — it is not itself the
plan.

## What's already known and won't change

**1. `tests/bench/corpus-engines.js` gap (recorded in `ODE_PDE_ENGINE_PLAN.md`'s 2026-08-01
note, still open):** calls the deleted `ODESymbolic.classifyFirstOrder`/`classifySecondOrder`
directly for its ODE corpus section — will throw if invoked. Fixing it means adapting that
synchronous Node script to drive the new async, Worker-based `ODESolver.solve()` (Phase 1)
instead. This dependency is on Phase 1 only (already merged) — **this piece could be scoped and
planned right now, independent of Phases 3-5**, if you want it pulled out of Phase 6 and done on
its own. Flagging rather than doing, since it wasn't asked for this session.

**2. Every phase's own plan already names its exact dead-code deletions** (no guessing needed
once each phase ships): Phase 3 deletes `sympy-dsolve-fallback.js` + three `ODESymbolic`
parsing helpers + three worker ops. Phase 4 deletes two local duplicate helper functions in
`series-solution-fallback.js`. Phase 1 (merged) already deleted the classify tree; Phase 2
(merged) added no deletions. Phase 5a/5b/5c are additive only (new files/functions), no
deletions. **So Phase 6's "delete now-dead code" step, once 3-5 ship, should mostly already be
done by each phase's own plan** — Phase 6's real remaining job here is a final grep sweep to
catch anything those individual phases missed, not a fresh audit from scratch.

**3. Every phase's plan already records its own dated completion note** in
`ODE_PDE_ENGINE_PLAN.md` (2026-08-01 for Phase 1, 2026-08-02 for Phases 2/3/4/5a/5b/5c per their
own plans) — these accumulate as a running changelog at the top of that file. Phase 6's docs
rewrite is not starting from nothing; it's consolidating an already-written trail.

## What Phase 6 will actually need to do (outline, to become a real plan once 3-5 ship)

1. **Full grep sweep** for anything still referencing retired symbols across the whole
   `math-lab/` tree (the pattern every phase's own plan already uses in its cleanup task —
   Phase 6 just runs it one more time at the end, broader).
2. **Fix `tests/bench/corpus-engines.js`'s ODE section** (see point 1 above) — can happen now,
   independent of 3-5, if wanted.
3. **Rewrite `ODE_PDE_ENGINE_PLAN.md`** from a dated-notes-on-top-of-a-stale-body document into
   a clean description of the actually-shipped architecture — sections 1-8 (the retired
   classify-tree description) get deleted outright, not just annotated as stale.
4. **Rewrite `ODE_PDE_SOLVER_DESIGN.md`** similarly — its §6A-6D classification trees describe
   the pre-Phase-1 architecture; its §7 PDE classification section should instead point at
   whatever Phase 5 actually built.
5. **Reconcile `CURRICULUM_ROADMAP.md` §5**: flip items #10 (Laplace), #11 (series/Frobenius),
   #21 (wave), #22 (Laplace/Poisson), #23 (numerical schemes) from ⚪/🟡 to ✅ once each phase
   is confirmed shipped and manually verified per its own plan's final QA task.

## Recommendation

Don't write Phase 6's real plan yet — revisit it after Phases 3, 4, and 5 (or however many of
them you choose to implement) actually land. At that point Phase 6 becomes a fast, low-risk
"survey what's there, delete what's dead, update three docs" pass, not a speculative one.
