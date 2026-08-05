# Foundation Checklist

Engineering-foundation items only (repo, structure, deploy). The feature backlog lives in
`math-lab/docs/CURRICULUM_ROADMAP.md` — don't duplicate it here. Completed history (the
2026-07-20 reorg, the original Tier-0 build log) moved to
`archive/docs/root-planning/FOUNDATION_CHECKLIST-history.md` on 2026-08-02 — all 7 engines are
now built, so that log is no longer actionable.

## Open

- [ ] **Push to GitHub.** Repo is set up for this whenever it's time: default branch is
      `main`, `.gitignore` keeps `archive/` and `reference/*.pdf`/`*.PDF` local-only. When
      ready: `gh auth login`, then
      `gh repo create math_Lab --private --source=. --remote=origin --push` (or create the
      repo on github.com and `git remote add origin <url>` + `git push -u origin main`).
- [ ] **Pick a deploy target.** Static site, no build step → GitHub Pages, Netlify, or Vercel
      all work with zero config. Note: the umbrella hub is now at the repo root (`index.html`)
      with General Lab under `math-lab/` — a deploy target just needs to serve the repo root,
      no redirect needed (this is simpler than it was before the umbrella hub existed).
- [ ] **Add a LICENSE file** — repo is private for now, but worth deciding before it isn't.
      (This is about *your code's* license — the vendored libraries in `assets/vendor/` and
      `reference/` already have their own; don't relicense those.)
- [ ] **Decide on the vendored-library strategy.** KaTeX/Plotly/math.js/three.js/GSAP/Alpine/
      nerdamer are committed as raw `.min.js` files with no version pinned anywhere. Fine at
      this size; revisit if/when a build step gets adopted (see the module-system discussion
      in `archive/docs/root-planning/RESHAPE_REPORT.md` §1.4 if that becomes relevant).
- [ ] **Optional: basic CI.** A GitHub Action that runs an HTML validator / broken-link
      checker, and/or the Node test suites (`for f in math-lab/tests/verify*.js; do node "$f";
      done`), on push. Not urgent for a static site with no build step, but cheap once on
      GitHub.

## Feature work

None of the above needs to happen before writing code. All 7 General Lab engines are built —
see `math-lab/docs/CURRICULUM_ROADMAP.md` for the handful of remaining low-priority items
(Complex Analysis's Schwarz–Christoffel page, a couple of Statistics/ODE items) and for
whatever comes after that (the three "coming soon" labs on the umbrella hub — Universities,
Schools, Games — have no scoping doc yet; that's a brainstorming task, not a checklist item).
