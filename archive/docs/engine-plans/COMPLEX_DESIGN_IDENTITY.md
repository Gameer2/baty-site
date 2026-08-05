# Complex Analysis Engine — Design Identity (V2 paradigm)

> Companion to `COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md`. That file defines *what the engine does*
> (animated two-plane mapping). This file defines *what the engine looks like* — the visual
> identity that gives the V2 paradigm its uniqueness and uses the screen as the instrument.
>
> Builds on the project's shared system documented in `DESIGN_SYSTEM.md`. It **adds** a
> complex-engine-specific layer (`assets/css/complex.css` + a `.cx-shell` page wrapper); it does
> **not** modify `engine.css` or any other engine. The other eight engines keep the shared,
> single-accent, boxed-panel identity. Complex alone gets the treatment below, because complex
> alone is a map between two planes.

Last updated: 2026-07-24

---

## 1. The identity, in one sentence

**A complex function is a curtain of light strung between two parallel planes — the domain
below, the codomain above — and the shape of that curtain *is* the function. Every calculation
in the engine happens inside that one space, and the camera is free to fly anywhere in it to
watch it happen.**

Every other engine plots a curve or a surface. Complex cannot: `f: ℂ → ℂ` is 4-dimensional.
The V2 plan's answer is "show the map in motion." This design's answer is *where* that map
lives: not two flat charts side by side, but **one 3D void** with the two planes stacked in
depth and a living bundle of connector strands between them — and this same void is the stage
for *every* operation the engine performs. The viewer flies through it. That single decision
is the identity.

---

## 2. The flagship scene — "The Mapping Field"

The plotting area is a single full-bleed 3D canvas (three.js — already in the vendor stack for
the hero particle field). It is **the universal canvas for the whole engine**, not one demo.
Inside it:

### 2.1 The two planes
- **Domain plane** — a horizontal grid lattice floating low in the void, tinted **purple**
  (`--cx-domain`, default `#b45fd0`, the engine's existing accent). The plane you act on.
- **Codomain plane** — an identical parallel grid lattice floating *above* it, tinted **gold**
  (`--cx-codomain`, default `#d0a93f`, same lightness family as the rest of the palette so it
  never fights `--infrared`). The plane you watch deform.
- Both planes are sparse point-grids (the same `THREE.Points` treatment the hero ripple already
  uses), not solid surfaces — you see *through* them, into the void and the strands between.
- `scene.fog` matches `--core-black` exactly, so the far edges of both grids dissolve into the
  dark instead of piling up at a horizon (the same fix the hero already needed — see
  `DESIGN_SYSTEM.md` §7).

### 2.2 The shapes on the planes
- On the **domain plane**: the input shape — grid, circle, contour, freehand path, or a cloud
  of points — drawn in purple.
- On the **codomain plane**: the image of that shape under `f(z)`, drawn in gold.
- The shape system from the build plan (§7 of `COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md`) maps
  directly: each shape type lives on the lower plane and its image on the upper plane.

### 2.3 The strands — the signature element
For each sampled point `z` on the domain plane, a **connector strand** rises from `z` (on the
lower plane) to `f(z)` (on the upper plane). This is the element no other engine has.

- **Geometry:** a cubic Bézier (or a gently curled path) through the gap, not a straight line —
  straight lines would read as a wireframe; curves read as a *form*. The control points bend
  the strand slightly toward the scene center so the whole field billows like a curtain.
- **Color:** a vertical gradient per strand, **purple at the domain end → gold at the codomain
  end.** This is why the two-accent system exists: the strand literally shows purple becoming
  gold, i.e. shows `f` turning the domain into the codomain.
- **Density:** sampled on a grid or along the active shape, dense enough to read as a surface
  in motion, sparse enough to see individual strands when you fly in close.
- **What the curtain reveals about `f`:**
  - Conformal regions → strands stay evenly spaced and parallel-ish; the curtain is smooth.
  - Near a **critical point** (`f'(z)=0`) → strands converge/fan; the curtain pinches.
  - Near a **pole** → strands flare upward toward a single gold point; the curtain sprays.
  - A **branch cut** → the curtain tears along a line; crossing it jumps a strand by `2πi`.
  - A **contour integral** → a highlighted strand-set traces the contour in purple and its
    image in gold; the accumulated `∮ f dz` reads as the sweep along the gold loop.
- The curtain is *the* visualization. The student does not decode a chart — they see the
  function's character as the shape of a hanging field.

### 2.4 Free-floating camera — capture the space from any point
The camera is **not** a clamped orbit around a fixed target. It is free in the void:

- **Full orbit, unclamped** — azimuth spins freely; polar range is the full sphere (no
  "can't go above the north pole" clamp), implemented quaternion-based to avoid gimbal flip, so
  you can swing from a top-down view of the gold codomain plane straight through to a
  bottom-up view of the purple domain plane in one continuous move.
- **Wide dolly** — zoom from a far overview that frames both planes as two thin sheets, all
  the way *into the gap* between the planes until a single strand fills the view (this is the
  build plan's local-mode entry — flying through the curtain).
- **Fly / reposition** — the camera target can be moved anywhere in the void, not just the
  scene origin, so the viewer can park the camera at any point in space and frame the curtain
  from there: side-on to read strand lengths as `|f|`, end-on to read the gold image, inside
  the gap to inspect one neighbourhood.
- **Viewpoint capture** — a "capture this view" affordance bookmarks the current camera pose
  (and can export the current frame), so a chosen composition can be saved and returned to.
  "Capture it from any point" is literal: the camera is a viewpoint you place, not a rail you
  ride.
- Pointer-fly on desktop, touch orbit/pinch-zoom on touch — degrade the fly freedom on small
  screens but keep full orbit so the dual-plane stack still reads.

### 2.5 Interaction (besides camera)
- **Drag a point** on the domain plane → its strand and the gold image update live.
- **Plane-separation slider** — raise/lower the codomain plane to thin or thicken the gap.
- **Zoom-to-local** — fly the camera down through the gap toward a domain point; the view
  refines to a single strand and its neighbourhood, where the derivative reads as the strand's
  local scaling + twist (the local-mode animation from the build plan §8).
- **Crosshair corners** (the existing instrument motif) frame the canvas — purple ticks on the
  lower-left, gold on the upper-right, finally giving that motif a real reason to exist.

### 2.6 Performance
Two planes of points + a few hundred strands is well within three.js budget at 60fps. Strands
as `Line`/`LineSegments` with vertex colors (no per-strand materials). Rebuild strand geometry
on input change only, not per frame. Fog + additive blending on the strands for the
"curtain of light" feel without bloom postprocessing.

---

## 3. Every operation lives in this one space

The Mapping Field is not a single showcase — it is **the visualization for every calculation in
the engine.** Each method page loads the same scene; what changes is the shape on the domain
plane, the function, and the overlay. One identity, the whole subject.

| Operation | What you see in the Mapping Field |
|---|---|
| **Complex arithmetic & the plane** | A purple `z` on the domain plane; the result on the gold plane; a strand connects operand→result. `n`-th roots of unity → `n` purple points on the domain circle, `n` gold images, strands fanning. |
| **Analyticity / Cauchy-Riemann** | A small square on the domain plane; its gold image is the same square rotated + scaled by `f'(z)` — the strand field is locally a rigid-ish transform. CR verified where the local grid cell maps without shear. |
| **Harmonic functions & conjugates** | `u` and `v` level-curve families drawn on the two planes, crossing at right angles by CR; the conjugate read as the matching gold family. |
| **Complex exp / log / powers & branches** | The full curtain over the plane; the branch cut shows as the **tear line** in the field. Clicking a point stacks its `k` branches as multiple gold images with one strand to each — "multivalued" is a fan of strands, not a sentence. |
| **Complex trig & hyperbolic** | The same field; periodicity reads as a repeating pattern on the gold plane. `\|f(x)\|` vs `\|f(iy)\|` still available as a supplementary 2D trace. |
| **Contour integration** | A purple path on the domain plane, its gold image on the codomain; the integral accumulates as the swept displacement of the gold loop; the result strip shows `∮ f dz`. |
| **Cauchy-Goursat** | A closed purple contour, analytic inside → the gold loop closes to a point and `∮ = 0`. Deform the contour → the curtain deforms but the gold loop's net stays 0. Cross a singularity → the gold loop opens and the integral changes. |
| **Cauchy integral formula** | A point `a` inside a contour; strands run from the boundary to `a`; the boundary integral tracks `a`. Drag `a` → the gold image tracks; move the contour → same value. |
| **Taylor series** | The circle of convergence drawn on the domain plane; the partial-sum curtain animates `Σ aₙ(z-z₀)ⁿ` — strands approximate `f` inside the circle, diverge outside. |
| **Laurent series** | The annulus of convergence on the domain plane; toggle the principal part on/off; the singularity is classified live from the curtain's behaviour at the centre. |
| **Residues & the residue theorem** | A purple contour, poles inside marked as gold flares; `∮ = 2πi · Σ Res` in the strip, with numeric contour quadrature as the `--infrared` check. Deform the contour → same result while the poles stay inside. |
| **Real integrals by residues** | The real integral shown as a side trace; the complex contour lives in the Mapping Field; the residue theorem gives the answer; the real value computes numerically to verify, side-by-side. |
| **Argument principle & Rouché** | The gold image loop's winding number around 0; zeros and poles inside counted; winding = zeros − poles. |
| **Conformal mapping** | A purple grid on the domain plane; its deformed gold image on the codomain. Angles preserved everywhere except at purple critical-point marks where `f'(z)=0`. |
| **Möbius transformations** | Purple circles on the domain → gold circles/lines on the codomain; fixed points marked where `f(z)=z`. Drag `a,b,c,d` and the curtain re-knits. |
| **Schwarz-Christoffel** | A polygon on the codomain plane; its preimage on the domain; the mapping animated as the curtain settling into polygonal shape. |

The rule, stated once: **put the relevant shape on the purple domain plane, watch its image
and the strand curtain on the gold codomain plane, read the result in the full-width strip,
fly the camera wherever it needs to be to see it.**

Domain colouring (the old Phase 1–2 flagship) survives as a supplementary 2D view toggleable
on either plane — exactly the "supplementary view" role the build plan §2 assigns it.

---

## 4. The two-accent system — the engine's unique move

Per `DESIGN_SYSTEM.md` §8, every engine is single-accent (`--electric-teal` overridden per
section). Complex breaks that rule *deliberately and only for itself*, because it is the one
engine whose subject is a pair of mirror spaces:

| Token | Default | Role |
|---|---|---|
| `--cx-domain` | `#b45fd0` (existing complex purple) | Domain plane, its grid, its shapes, drag handles, crosshair ticks, the lower end of every strand |
| `--cx-codomain` | `#d0a93f` (muted gold) | Codomain plane, its grid, image shapes, the upper end of every strand |
| `--infrared` | `#ed6d40` (unchanged) | Still the fixed CTA / active-marker / slider-thumb color, globally |

**Why two:** the whole point of the engine is "domain becomes codomain." Coloring the two planes
differently and grading every strand between the two hues makes `f` visible *as color flow*,
not just as geometry. No other engine has two spaces to color, so no other engine gets a second
accent — the rule for the rest of the site is preserved.

`--cx-domain`/`--cx-codomain` are local to `.cx-shell`; they do not leak into `--electric-teal`
or affect any other page. Hues are swappable in one place if gold is wrong.

---

## 5. Layout — full-bleed, de-boxed

This is the direct response to "no small boxes, no wasted space." The V2 complex pages drop
three things the shared `engine.css` imposes: the `1280px` container cap, the `.panel` box, and
the `.plot-wrap` box.

### 5.1 The shell
```
┌──────────────────────────────────────────────────────────────────┐
│  ● Complex Analysis   ·  Contour Integration        z ↦ f(z)  ▶  │  thin full-width chrome rail
├──────────────────────────────────────────────────────────────┬─┤
│                                                              │D│
│            THE MAPPING FIELD                                  │O│
│            (one full-bleed 3D canvas — two planes +           │M│
│             strands live inside it; fly the camera            │A│
│             anywhere in the void)                             │I│
│                                                              │N│
│                                                              │ │
│                                                              │R│
│                                                              │A│
│                                                              │I│
│                                                              │L│
├──────────────────────────────────────────────────────────────┴─┤
│  ∮ f(z) dz  =  2πi · Σ Res  =  6.283i   ✔ numeric match        │  full-width result strip
└────────────────────────────────────────────────────────────────┘
```

- **No `.container` cap** — the shell spans the viewport width. On ultrawide monitors the void
  gets wider, not more boxed.
- **The 3D canvas is the surface** — `border: 0; border-radius: 0; padding: 0; background:
  --core-black`. No `.plot-wrap`, no `.panel`. The chart *is* the page.
- **Domain rail** (right side, ~240px) — flush, `--core-black` (not `--rich-carbon`), no
  border, no radius. Holds the function input, shape controls, plane-separation slider, and a
  small camera-mode toggle (orbit / fly). Inputs are still "wells" (per the form rule) but the
  well is the page itself. Collapses below the canvas under ~1000px.
- **Result strip** — full-width, hairline top border only, mono readout on `--core-black`.
  The answer lives on the surface, not inside a tile. A single `--infrared` check-mark for the
  numeric verify gate (per the build plan's verify-gate discipline).
- **Responsive:** below ~1000px the rail moves under the canvas; the 3D scene keeps both planes
  (stacked depth still works on a tall canvas). No boxes are reintroduced at any width.

### 5.2 What this removes from the shared look (scoped to complex only)
| Shared element | On complex V2 pages |
|---|---|
| `.container` 1280px cap | removed — full-bleed |
| `.panel` boxed sidebar | replaced by flush domain rail |
| `.plot-wrap` boxed chart | replaced by full-bleed 3D canvas |
| `.result-strip` tile grid | replaced by single full-width strip |
| `.workspace` 380px+1fr grid | replaced by canvas + thin rail + bottom strip |

Everything else from `DESIGN_SYSTEM.md` stays: dark-only, mono chrome / serif headlines,
`--infrared` CTA, `cubic-bezier(.16,1,.3,1)` motion, reveal-on-scroll, hover-flip nav.

---

## 6. The complex index hero

The generic 3D particle ripple (shared across all engine index pages) is replaced on the
complex index with a **live, idle Mapping Field**: `f(z) = z²` (or `e^z`) rendered as the two
parallel planes + curtain of strands, the camera slowly drifting through the void on a lazy
path, with a single purple point moving on the domain plane and its gold image tracking across
the codomain plane. It is the engine's thesis statement, running, before the visitor clicks
anything — and it advertises the free camera by literally flying one. The shared ripple stays
on the other eight engines.

---

## 7. Implementation scope (for the build step, not done in this doc)

- `assets/css/complex.css` — new, scoped under `.cx-shell`. Defines `--cx-domain`,
  `--cx-codomain`, the full-bleed shell grid, flush domain rail, result strip, and overrides
  `.panel`/`.plot-wrap`/`.container` *only inside `.cx-shell`*. Loaded after `engine.css`.
- `assets/js/complex-scene.js` — new. The three.js Mapping Field: two grid planes, strand
  generation from a sampler over `f`, the purple→gold per-strand gradient, the **free-floating
  camera** (unclamped quaternion orbit + fly + viewpoint capture), drag-to-move-point, the
  plane-separation slider, and the zoom-to-local camera tween. This is the engine's universal
  renderer — every method page loads it.
- `assets/js/complex-viewer.js` / `complex-shapes.js` / `complex-animation.js` — from the build
  plan §3; these feed shape data and per-operation overlays into `complex-scene.js`.
- Each `engines/complex/methods/*.html` gets a `.cx-shell` wrapper, the new stylesheet, and the
  scene script, plus a small per-page "operation overlay" config (the row in §3 that matches
  the method). Existing method pages (Phases 1–2, built under the old domain-colouring
  paradigm) are retrofitted to place their existing 2D plots onto the lower/upper planes where it
  helps, keeping domain colouring as the supplementary view.
- `engine.css`, `proto.css`, `engine-core.js`, and the other eight engines: **unchanged**.

---

## 8. The identity in one paragraph

Two parallel planes hang in a dark void — the domain below in purple, the codomain above in
gold — and a curtain of curved strands connects every point to its image. The shape of that
curtain is the function: smooth where it's conformal, pinched at critical points, flared at
poles, torn at branch cuts. Every calculation in the engine — arithmetic, integrals, residues,
series, conformal maps — is performed in this same space: the relevant shape on the domain
plane, its image and the curtain on the codomain, the result in a strip below. The camera is
free to fly anywhere in the void to watch it from any point. There are no boxes, no margins,
no capped width — the screen is the void, and the function fills it.