# Mathematics — Four Labs, One Discipline

A client-side math site. `index.html` (this directory) is the umbrella hub; **General Lab**
(`math-lab/`) is the one live, fully-built lab today. Three more labs — Universities, Schools,
Games — are planned, shown as "coming soon" cards on the hub, not yet started.

## Structure

```
index.html                   umbrella hub — "Mathematics — Four Labs, One Discipline"
math-lab/                    General Lab — the live, fully-built site
├── index.html                 General Lab landing page, links to all 7 engines
├── engines/
│   ├── numerical/              29 method pages — tests/verify.js
│   ├── calculus/                31 method pages — tests/verify-calculus.js
│   ├── linear-algebra/          18 method pages — tests/verify-linalg.js
│   ├── statistics/              12 method pages — tests/verify-statistics.js
│   ├── ode/                     9 pages (ODE + PDE) — tests/verify-ode*.js
│   ├── number-theory/           29 method pages — tests/verify-number-theory.js
│   └── complex/                 12 method pages — tests/verify-complex*.js
├── assets/                    shared CSS/JS/fonts/vendor libs (KaTeX, Plotly, math.js,
│                               three.js, GSAP, Alpine, nerdamer) + the CAS kernel (assets/js/kernel/)
└── docs/                      living planning docs (read before adding features)
    ├── CURRICULUM_ROADMAP.md    full per-engine method backlog + status, textbook-checked
    ├── ODE_PDE_ENGINE_PLAN.md   current ODE/PDE architecture (dsolve()-driven, complete)
    ├── ODE_PDE_SOLVER_DESIGN.md ODE/PDE solver architecture spec
    └── kernel/                  the symbolic-CAS-kernel build plan (00_INDEX.md first)

docs/                         umbrella-level planning (currently: docs/superpowers/, the ODE
                               engine redesign's phase plans/specs — kept as historical record)
reference/                    course materials (syllabus, textbooks) — local only, gitignored
archive/                      superseded work, kept for reference — gitignored
├── numerical-engine-v1/        pre-redesign build (superseded by math-lab/)
├── worldquant-foundry-template/  WQF site clone — source of the visual identity, no longer live
└── docs/                       retired/completed planning docs, archived 2026-08-02 (see below)
```

## Current state (2026-08-02)

**All 7 General Lab engines are built and tested** — Numerical, Calculus, Linear Algebra,
Statistics, ODE/PDE, Number Theory, and Complex Analysis. Every test suite in the project
passes (28 suites, ~14,000+ assertions, 0 failures — run `cd math-lab && node tests/<file>.js`
per suite). The only known gap is Complex Analysis's Schwarz–Christoffel page (P3, not built).

`math-lab/docs/CURRICULUM_ROADMAP.md` is the source of truth for per-method status — it was
reconciled against the actual files/tests on 2026-08-02 after being found badly stale (it had
marked Number Theory "not started" and 24 of 30 Numerical Engine items "missing" when both
were, in fact, fully built).

## Design system

`DESIGN_SYSTEM.md` (this directory) is the complete, standalone visual-identity reference —
colors, type, spacing, component/animation patterns. Source of truth in code is
`math-lab/assets/css/engine.css` + `math-lab/assets/proto/proto.css` +
`math-lab/assets/js/engine-core.js`; the doc is a snapshot of that code, not a replacement.

## Documentation history

`archive/docs/` holds retired planning docs, organized by what they covered — engine plans
superseded once the engine shipped, agent-plans for individual methods once those methods
were built, the pre-redesign ODE/PDE kernel notes, and point-in-time audit/reshape reports.
Moved there (not deleted) on 2026-08-02 so the design rationale in them stays available
without cluttering the living docs. `FOUNDATION_CHECKLIST.md` (this directory) keeps only the
still-open engineering decisions (deploy target, LICENSE, GitHub push); its completed history
moved to `archive/docs/root-planning/`.

## Running locally

Serve `math-lab/` with any static file server (some assets, including the Pyodide/SymPy
worker, don't load reliably over `file://`):

```bash
cd math-lab
python3 -m http.server 8000
# open http://localhost:8000/
```

## Before adding a feature

1. Check `math-lab/docs/CURRICULUM_ROADMAP.md` — your feature is very likely already scoped
   there with a priority tag (P0–P3) and a description of how it should look on the site.
2. Read `DESIGN_SYSTEM.md` (visual identity) and skim the engine's existing pages for
   conventions (page shape, script-tag order, verify-suite pattern).
3. Add the new method's known-answer/property tests to the engine's `tests/verify*.js` in the
   same commit — not after.
4. Keep `CURRICULUM_ROADMAP.md` current as things get built, or it rots again.
