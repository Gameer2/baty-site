# Architecture Audit — The Lab

**Date:** 2026-07-22
**Scope:** the whole site — delivery/payload, shared-module structure, code duplication, test
coverage, and cross-engine consistency. 87 engine pages, 89 JS modules, 7 test suites, 7 MB of
vendored libraries.

**Relationship to `../AUDIT_REPORT.md` (project root):** that document audits *test quality* and
*per-method page wiring* for the Numerical Engine, plus roadmap staleness. This one audits
*architecture* — what gets shipped to the browser, what is duplicated, and what will break as
engines are added. They do not overlap; read both.

**Method:** every number below was measured against the working tree, not estimated. The
commands are reproducible — see §7.

---

## 0. TL;DR

**The engine-level architecture is sound.** Clean layering (page → wiring → CAS client → worker →
pure module), a real verify-gate discipline, worker-based hang protection, and genuinely
consistent page conventions. Nothing here argues for a rewrite.

**Every significant problem is at the delivery and duplication layers** — and one is far larger
than previously reported.

> ### ⚠️ Correction to earlier reporting
> A previous pass in this session cited **2,527 KB per page**. That figure was measured on a
> three.js page (`multiple-integrals.html`) and wrongly generalised. **Plotly-based pages — which
> are the majority — are 5.0–6.8 MB.** Page weight was under-reported by roughly 2.5×.
>
> A second figure, "20 pages load Plotly but never call it", was produced by a heuristic that
> only inspected the *last* `<script>` tag on each page and so missed shared viz modules. The
> verified count is **7**.

Measured page weights:

| Page | Weight | Dominated by |
|---|---:|---|
| Root hub | 945 KB | three (744K) |
| Calculus 3D (`multiple-integrals`) | 2,558 KB | three (744K), math (655K) |
| Statistics (`linear-regression`) | 4,980 KB | **plotly (4,452K)** |
| Numerical (`bisection`) | 5,631 KB | **plotly (4,452K)** |
| Calculus 2D (`limits`) | 6,248 KB | **plotly (4,452K)** |
| **ODE** (`index.html`) | **6,808 KB** | plotly + three + math + nerdamer |

**Plotly alone is 4,451 KB — 70–80% of a typical page, and 63% of the entire vendor directory.**

---

## 1. Critical — delivery

### 1.1 Plotly is the dominant cost, and most of it is unused

Trace types actually used across the site:

| Trace | Occurrences |
|---|---:|
| `scatter` | 111 |
| `line` (scatter mode) | 35 |
| `histogram` | 7 |
| `bar` | 7 |
| `scatter3d` | 3 |

API surface actually used: `Plotly.newPlot` (51), `Plotly.react` (32), `Plotly.restyle` (17),
`Plotly.purge` (15). **That is the entire dependency.**

This is squarely within **`plotly.js-basic`** (scatter + bar + pie, ≈1 MB), which would cut
≈3.4 MB from **71 of 74** Plotly pages.

Only two modules use `scatter3d` — `assets/js/linalg-viz.js` and `assets/js/multiple-regression.js`.
Those three pages either keep the fuller bundle, or migrate to `Scene3D` (`assets/js/calculus-3d.js`),
which already renders 3D surfaces and scatter for the Calculus Engine.

### 1.2 Seven pages load Plotly and never call it

4,451 KB of entirely dead payload each:

```
engines/numerical/methods/chebyshev-econ.html
engines/numerical/methods/horner.html
engines/numerical/methods/least-squares.html
engines/numerical/methods/neville.html
engines/numerical/methods/newton-dd.html
engines/numerical/methods/numerical-diff.html
engines/numerical/methods/richardson-diff.html
```

Verified by scanning *every* local script a page loads (plus inline `<script>` blocks) for a
`Plotly.` call — not just the last tag. ~31 MB of pointless transfer if all seven are visited.

### 1.3 Two vendor files are referenced by zero pages

| File | Size |
|---|---:|
| `assets/vendor/alpine.min.js` | 43 KB |
| `assets/vendor/auto-render.min.js` | 3 KB |

Safe to delete.

### 1.4 Compression is not enabled

| File | Raw | gzip -9 | Saving |
|---|---:|---:|---:|
| `plotly.min.js` | 4,451 KB | 1,299 KB | 71% |
| `three.min.js` | 743 KB | 185 KB | 75% |
| `math.min.js` | 654 KB | 179 KB | 73% |
| `nerdamer.min.js` | 425 KB | 158 KB | 63% |

One server-config line. (Brotli was not measurable — not installed locally — but typically beats
gzip by a further 15–20% on JS.)

**Combined effect of §1.1–1.4:** a representative Calculus 2D page drops from **6,248 KB to
roughly 450 KB gzipped**. This is the highest-value work available anywhere in the codebase, and
it requires no changes to any engine's logic.

### 1.5 The `file://` fallback ships on every page

Independently of Plotly: all 16 Calculus pages eagerly load `nerdamer.min.js` (426 KB) and
`calculus-symbolic.js` (208 KB) on the main thread, purely to serve the sync fallback used when
`Worker` construction fails. Over http:// the worker has its own copies via `importScripts`, so
these are parsed and never called.

Verified: no page-side code touches `CalculusSymbolic` or `nerdamer` — all such references are
comments, and `Engine.toLatex` uses math.js. `syncCall` already returns a Promise, so the
fallback can be injected on demand; `<script>` injection works over `file://`, where only
Workers are blocked.

---

## 2. Critical — correctness

| Issue | Detail |
|---|---|
| **ODE separable solver returns wrong answers** | `y'=y` → `ln(y)=(7/10)x+C` (should be `ln(y)=x+C`). Root-caused: `solveSeparable` never divides by `f(x₀,y₀)`, so probe constants leak into the result. **Live in production.** See `ODE_PDE_ENGINE_PLAN.md` §2a. |
| **ODE/PDE has zero tests over 847 lines** | The only engine doing symbolic mathematics with no suite — which is exactly why the above shipped. |
| **Optimization and Graph have zero tests** | No suite exists for either. |
| **ODE runs nerdamer on the main thread** | No kill switch, unlike every Calculus page. `CALCULUS_ENGINE_PLAN.md` §3 documents that nerdamer hangs outright on some inputs and that `terminate()` is the only remedy. A user typing the wrong ODE can freeze the tab unrecoverably. |

### Test coverage by engine

| Engine | Suite | Tests |
|---|---|---:|
| Numerical | `verify.js` | 76 |
| Calculus | `verify-calculus.js` | 612 |
| Linear Algebra | `verify-linalg.js` | 197 |
| Statistics | `verify-statistics.js` | 320 |
| CAS harness | `verify-cas-worker.js` / `verify-cas-client.js` | 25 / 17 |
| **ODE/PDE** | **none** | **0** |
| **Optimization** | **none** | **0** |
| **Graph** | **none** | **0** |
| | **Total** | **1,247** |

---

## 3. Structural

### 3.1 Three engines are still monolithic prototypes

| Engine | Method pages | Catalog |
|---|---:|---|
| Numerical | 29 | yes |
| Calculus | 18 | yes |
| Linear Algebra | 18 | yes |
| Statistics | 11 | yes |
| **ODE** | **0** | **no** |
| **Optimization** | **0** | **no** |
| **Graph** | **0** | **no** |

`assets/proto/` is still load-bearing: `proto.js` (28 pages), `proto.css` (12 pages),
`ode-solver.js` (1 page). The first two are legitimately shared UI; `ode-solver.js` is 847 lines
of symbolic mathematics sitting in a prototype folder.

### 3.2 Page-wiring boilerplate is copy-pasted across 79 files

`assets/js` splits into **10 shared modules (402 KB)** and **79 page-wiring files (616 KB)**.
The wiring files repeat the same patterns:

| Pattern | Duplicated in |
|---|---:|
| `placeholderPanel.style.display` | **59 files** |
| `Engine.debounce` wiring | **58 files** |
| `updateStep` + `stepSlider` handler | **34 files** |
| `escapeHtml` | **17 files** |
| `CAS.mode() === "sync"` warning | **17 files** |

This is why a single UI defect has to be fixed 59 times — precisely the failure mode
`../AUDIT_REPORT.md` recorded (a status-indicator bug spanning 9 pages). A shared `MethodPage`
helper owning the placeholder/results swap, the step slider, the debounce wiring, and the sync
warning would collapse most of it.

### 3.3 Scaling issues that will bite as engines are added

Three new engines are planned (ODE/PDE completion, Complex Analysis, Number Theory).

- **Triple registration.** Every method is declared in `cas-worker.js` OPS, a `cas-client.js`
  wrapper, and a `verify-cas-worker.js` case. Current counts: **17 / 20 / 20** — already
  inconsistent. The three planned engines add ~63 methods → ~189 more manual registrations.
  **Fix:** one manifest (`{name, arity, module}`) generating all three, plus a test asserting
  they agree.
- **Monolithic worker: 1,289 KB per spawn** (math 655 + nerdamer 426 + calculus-symbolic 208).
  Number Theory needs *none* of it (pure `BigInt`); Complex needs nerdamer; ODE needs both.
  **Fix:** per-domain workers.
- **No shared polynomial module.** Polynomial code is duplicated across four files
  (`linalg-algorithms.js` 22 refs, `calculus-symbolic.js` 26, `ode-solver.js` 4,
  `algorithms.js` 5). Complex Analysis and Number Theory both need more of it.
  **Fix:** extract `assets/js/poly.js` before this becomes six copies.
- **The complex-arithmetic helper is private.** `cx` (add/sub/mul/div/abs) lives inside
  `linalg-algorithms.js` with **zero exports**, and is the foundation the Complex Analysis
  engine needs. **Fix:** promote to a shared module rather than writing a second one.
- **One global 8 s timeout** (`DEFAULT_TIMEOUT_MS`) covers everything from `gcd` to factoring,
  and a timeout calls `failAll()` — killing *every* in-flight call and forcing a 1,289 KB
  re-parse on respawn. For Number Theory, where budget exhaustion is a *normal* outcome, that is
  backwards. **Fix:** enforce operation budgets inside the pure modules (returning
  `{ok:false, partial}`), leaving the worker timeout as a backstop.
- **`calculus-symbolic.js` is 208 KB / ~3,900 lines.** A split into a shared core plus ~5 domain
  modules is warranted for maintainability. It is **perf-neutral** — the same bytes in more
  requests — so it should not be sold as an optimisation, and it should follow §1, not precede it.

---

## 4. What is working well

Stated explicitly, because it is most of the system:

- **Zero orphaned JS modules.** Every file in `assets/js` is referenced.
- **Load-pattern consistency is perfect** across all 76 mature method pages — gsap, engine-core,
  and katex appear in 29/29, 18/18, 18/18, 11/11.
- **No CDN dependencies, no hardcoded paths, fully relative URLs.** Deploys to any host or
  subdirectory; no third-party outage or tracking surface.
- **The verify-gate discipline is real and load-bearing** — it demonstrably catches CAS errors
  (non-elementary `erf` results, π silently rationalised, wrong `diff()` on transcendentals).
- **The worker kill-switch** is the correct answer to nerdamer's hangs, and the CAS harness is
  itself tested (42 tests) against a mock that hangs.
- **Client-side compute** means user count costs bandwidth only — no server CPU, no contention,
  no shared failure mode.

---

## 5. Recommended order

| # | Action | Effort | Payoff |
|---|---|---|---|
| 1 | ✅ **DONE 2026-07-22** — deleted `alpine.min.js` + `auto-render.min.js`; dropped Plotly from the 7 pages that never plot | Trivial | ~31 MB |
| 2 | Enable gzip/brotli on the host | Trivial | **−70% sitewide** |
| 3 | ✅ **DONE 2026-07-22** — vendored `plotly-cartesian.min.js` (1,391 KB, MIT); switched 48 non-3D pages | Small | **−3.06 MB/page** |

### Items 1 and 3 — completion notes (2026-07-22)

**Correction to §1.1's recommendation.** `plotly.js-basic` was the original proposal, but its
README confirms it contains only `bar`, `pie`, and `scatter` — **no `histogram`**, which four
Statistics modules require (`descriptive-statistics`, `one-sample-t-test`,
`two-sample-paired-tests`, `sampling-distributions`). **`plotly.js-cartesian-dist-min` was
vendored instead** at 1,391 KB (vs basic's 1,093 KB). The extra 298 KB also buys `heatmap`,
`contour`, `box`, and `violin` — all of which the roadmap already needs (PDE §5G #22 Laplace
heatmaps, Number Theory §9 modular-arithmetic tables, Statistics box plots).

**Bundle assignment.** Trace usage was mapped per module rather than per page:

| Pages | Bundle | Reason |
|---|---|---|
| 48 | `plotly-cartesian.min.js` (1,391 KB) | scatter / bar / histogram / box only |
| 19 | `plotly.min.js` (4,451 KB) | load `linalg-viz.js` (needs `bar` + `scatter3d` + `surface`) or `multiple-regression.js` (`scatter3d` + `surface`) |

No single partial bundle covers `bar` + `scatter3d` + `surface` together — `gl3d` (1,651 KB) has
scatter3d and surface but not bar — so those 19 initially kept the full bundle.

**Follow-up completed the same day: `linalg-viz.js` migrated to `Scene3D`.** Its two 3-D
functions (`Viz.vectors`, `Viz.span`) now draw through the three.js scene helper already shared
by five Calculus pages, so 18 of those 19 pages dropped to cartesian. Final split: **66 pages on
cartesian, 1 on full Plotly** (`multiple-regression.html`, whose own module still uses
`scatter3d` + `surface`).

| Page | Before | After | Saved |
|---|---:|---:|---:|
| `four-subspaces` (3D) | 5,568 KB | 2,759 KB | 2,809 KB |
| `eigenvalues` (3D) | 5,568 KB | 2,761 KB | 2,807 KB |
| `svd` (2-D only) | 5,568 KB | 2,000 KB | 3,568 KB |
| `cholesky` (2-D only) | 5,568 KB | 1,999 KB | 3,569 KB |

Three things the migration had to handle, none of them obvious from the trace list:

1. **WebGL context leak.** `linalg-page.js` rebuilds output panels with
   `outputBlocks.innerHTML = ""`, which drops the canvas but leaves the WebGL context allocated
   and Scene3D's `requestAnimationFrame` loop running. Browsers cap live contexts (~16), so a
   dozen re-runs would exhaust them and every later 3-D plot would silently fail. Added
   `LinAlgViz.disposeAll()`, called from `makeUI()` before the wipe. Verified: **10 consecutive
   re-runs leave 2 canvases and 2 live contexts, 0 lost.**
2. **Fixed vs. auto-ranged axes.** Plotly's 3-D axes auto-ranged to the data; Scene3D's grid
   (±5) and axis arrows (length 5) are fixed, so unit-ish basis vectors rendered as a speck.
   Geometry is now scaled into the fixed frame (largest component → 3.5 units). Honest here:
   Scene3D draws no tick labels (no `FontLoader` in the vendored bundle), so there is no numeric
   scale on screen to contradict, and every 3-D view in the module is about direction / plane
   orientation / orthogonality, never magnitude — which is shown exactly in the adjacent tables.
3. **Degenerate span patches.** Sweeping the raw parallelogram `u·a + w·b` is correct but often
   a terrible picture: for the default `A = [[1,2,3],[4,5,6],[7,8,9]]` the column-space basis
   vectors sit ~5° apart, so their parallelogram is a sliver that reads as a line rather than a
   plane. `Viz.span` now Gram-Schmidts to an orthonormal pair spanning the *same* plane and
   sweeps a square over it.

Verified in-browser on `four-subspaces` (plane + line spans) and `eigenvalues` (3-D eigenvector
arrows with λ legend): correct geometry, orbit works, zero console errors, all 1,247 tests green.

**`multiple-regression.js` migrated too — no page loads full Plotly any more.** Its `p = 2` view
(data cloud + fitted plane) moved to `Scene3D`; `multiple-regression.html` went 5,020 KB →
2,689 KB. **Final state: 67 pages on cartesian, 0 on full Plotly.** `assets/vendor/plotly.min.js`
was then **deleted** (4,451 KB) — nothing referenced it. `docs/agent-plans/00-SHARED-CONVENTIONS.md`
was corrected in the same pass: it still told future work to load the now-missing full bundle,
and now specifies `plotly-cartesian.min.js` for 2-D and `Scene3D` for anything 3-D. Verified
afterwards that every `<script src>` on all 87 pages resolves. **Vendor directory: 7.0 MB → 4.0 MB.**

That migration needed three things the Linear Algebra one did not, each found by testing rather
than by reading the trace list:

1. **Per-axis normalisation, not uniform.** Regression axes carry different units and ranges
   (`x1` might be 0–100 while `y` is 0–10⁶), so the uniform scale used for vectors — where
   relative length *is* the content — would flatten the cloud to a line. Each axis is mapped
   independently onto ±3.5, which is what Plotly's auto-ranged 3-D axes did.
2. **`Plotly.purge` before reusing the container.** One div serves `p=1`/`p≥3` (Plotly 2-D) and
   `p=2` (Scene3D). Clearing `innerHTML` behind Plotly's back leaves its internal `_fullLayout`
   state attached to the element, so the next `Plotly.react` reconciles against a DOM that no
   longer exists and **renders nothing**. Observed switching `p=1 → p=3`: the panel went blank.
3. **Explicit legend sweep.** The legend is a DOM sibling of the canvas, so `Scene3D.clear()`
   never touches it. This host is persistent (the Linear Algebra pages build a fresh plot div
   per render, which is why they are immune), and `render()` fires on every debounced keystroke
   — so legends stacked, **16 of them after 16 edits**, before a `[data-viz-legend]` sweep was
   added.

Also adjusted: Scene3D's default orbit (θ = +45°) looks straight down the edge of a typical
regression plane, rendering it as a line. The camera is set once at creation to θ = −45°,
φ ≈ 68° — the spherical equivalent of the Plotly view it replaced (`eye: 1.6, −1.6, 0.9`) — and
deliberately *not* reset on re-render, so typing does not yank the view back from wherever the
user orbited to.

Verified: all five `p` transitions render correctly (2→1→3→1→2), and 15 keystroke-triggered
re-renders leave **1 canvas, 1 legend, 0 lost WebGL contexts**.

**Measured result:**

| Page | Before | After | Saved |
|---|---:|---:|---:|
| Calculus 2D (`limits`) | 6,248 KB | 3,189 KB | 3,059 KB |
| Numerical (`bisection`) | 5,631 KB | 2,571 KB | 3,060 KB |
| Statistics (`descriptive-statistics`) | 4,980 KB | 1,920 KB | 3,060 KB |
| `horner` (dead-Plotly page) | 5,079 KB | 1,174 KB | 3,905 KB |

**≈174 MB less transfer across the site.** Verified in-browser: histogram + box plot both render
(`descriptive-statistics`), log-scale convergence scatter renders (`bisection`), `horner` computes
correctly (p(2)=7), zero console errors on all three. All 1,247 tests green.

**Also fixed en route:** `calculus-symbolic.js` had a duplicate `scanLo`/`scanHi` declaration
(lines 4264–4272) from an in-flight Improper Integrals edit, which made the whole file fail to
parse — breaking every Calculus page and the CAS worker. The orphaned `const` pair was removed;
it was both unreferenced and unusable (its `±1e4` window with `N=400` gives a grid spacing of 50,
far too coarse to detect a pole, versus the surviving `let` pair's ±100 window at spacing 0.25).
| 4 | Fix the ODE separable bug; write `tests/verify-ode.js` | Medium | Correctness |
| 5 | Lazy-load the `file://` fallback (§1.5) | Small | −623 KB/page |
| 6 | Extract `poly.js`, promote `cx`, single method manifest | Medium | Prevents 3-engine drift |
| 7 | `MethodPage` helper for the 59-file boilerplate | Medium | Maintainability |
| 8 | Split ode / optimization / graph into method pages + catalogs | Large | Consistency |

**Items 1–3 are a few hours for the largest single win in the codebase**, and touch no engine
logic. Items 6–7 are best done *before* the three new engines, not after.

---

## 6. Open questions

- **Where will this be hosted?** §1.4 and cache headers depend on it, and `python3 -m http.server`
  (single-threaded) collapses at ~10 concurrent users. This is a deployment choice, not an
  architecture flaw — the site is fully static and deploys anywhere.
- **Is the `file://` path still wanted?** If the site is always served over http://, deleting the
  sync fallback removes §1.5 entirely and simplifies `cas-client.js`.
- **Should `scatter3d` migrate to `Scene3D`?** Doing so would let *every* page use
  `plotly.js-basic` and drop the fuller bundle completely.

---

## 7. Reproducing this audit

```bash
cd math-lab

# page weight
python3 -c "
import os,re
p='engines/calculus/methods/limits.html'; h=open(p).read(); t=0
for s in re.findall(r'(?:src|href)=\"([^\"]+\.(?:js|css))\"',h):
    f=os.path.normpath(os.path.join(os.path.dirname(p),s))
    if os.path.exists(f): t+=os.path.getsize(f)/1024
print(f'{t:.0f} KB')"

# plotly usage
grep -rho "Plotly\.[a-zA-Z]*" assets/js/*.js engines/ | sort | uniq -c

# dead vendor files
for f in assets/vendor/*.js; do
  echo "$(basename $f): $(grep -rl "$(basename $f)" engines/ index.html | wc -l) pages"; done

# boilerplate duplication
grep -l "placeholderPanel.style.display" assets/js/*.js | wc -l

# test totals
for t in tests/verify*.js; do echo "$t: $(node $t | tail -1)"; done
```
