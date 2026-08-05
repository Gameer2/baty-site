# Design: Syntropy Canvas — the site's real card/motion language, not a generic list

Date: 2026-08-05
Status: Design approved, ready for `writing-plans`.

## Purpose

User feedback after seeing the shipped library panel + node cards: "it looks totally cheap and
bad, specially the squares of the methods and the left panel, its design isnt like the lab
design and its totally cheap not premium at all." This design grounds that complaint in the
project's own documented visual identity (`DESIGN_SYSTEM.md`, the repo root's formal record of
the site's card/motion/typography system) and the two places Syntropy Canvas already
demonstrably falls short of specs it was already supposed to meet:

1. **The library panel never got the treatment its own design doc asked for.**
   `2026-08-04-math-canvas-design.md` (§ Library panel) says it should be "styled with the
   site's real `.engine-card` language (radial accent glow, crosshair corners) rather than a
   generic file tree." What shipped (`LibraryPanel.tsx`/`.scss`) is a flat text list — no glow,
   no crosshairs, no pulse, no lift. It reads exactly like the generic file tree the spec said
   to avoid.
2. **The node cards lost ambient polish the approved mockup already had.** The v6 mockup's
   `.node5` (approved 2026-08-04) carries a radial-glow bleed
   (`radial-gradient(circle, var(--electric-teal) 0%, transparent 72%); opacity:.15`), a real
   drop shadow (`box-shadow: 0 14px 34px rgba(0,0,0,.5)`), and a hover-lift
   (`translateY(-2px)` + brightening border). None of that made it into the current
   `SyntropyNode.scss` — it's flat, shadowless, and static on hover. This is restoring something
   already approved, not a new ask.

Both are made worse by a third, cross-cutting gap: **no motion**. `DESIGN_SYSTEM.md` §10 names
`cubic-bezier(.16,1,.3,1)` as the one easing curve used on every hover/lift/transition
site-wide — "consistency here is part of what makes the whole thing feel like one system."
Neither the panel nor the nodes use it anywhere. Interactions are instant snaps, which reads as
unfinished/cheap regardless of the static styling.

**Still visuals only, still every method** — same boundary as
`2026-08-05-syntropy-canvas-node-visual-language-design.md`. No computation, no plots, no 3D
viewport. This design is strictly: make the existing generic shell look like it belongs to this
site's actual identity instead of a bare-bones placeholder.

## 1. A shared `<CrosshairCorners />` component

The site's crosshair-corner motif (`DESIGN_SYSTEM.md` §6, §10) is normally injected by a
DOM-walking JS helper (`Engine.initChrome()` in `math-lab/assets/js/engine-core.js`) that finds
every `.crosshair-host` and appends four corner spans. Syntropy Canvas doesn't load that script
(different app, different stack) and `SyntropyNode.tsx` already hand-codes its four crosshair
spans inline. Rather than duplicating that markup a second time in `LibraryPanel.tsx`, extract
it once:

- New: `canvas/excalidraw-app/syntropy/CrosshairCorners.tsx` — a tiny component rendering the
  four `<span className="crosshair-corner crosshair-corner--{tl,tr,bl,br}" />` marks (styled via
  a shared `crosshairCorners.scss`, ported class-for-class from `engine.css`'s `.crosshair`
  rules: 10px, opacity .5, hairline cross via `::before`/`::after`).
- `SyntropyNode.tsx` swaps its four inline spans for `<CrosshairCorners />` (behavior-identical,
  just de-duplicated).
- The library panel's engine-card-styled rows (below) use `<CrosshairCorners />` too.

## 2. Library panel: the real `.engine-card` treatment

Applied to `LibraryPanel.scss`'s engine-header rows (the per-engine collapsible headers) —
method rows inside an expanded engine stay a plain list (a card-per-method inside an
already-open sidebar section would be visual overkill; the *engine* level is the "picker," per
`DESIGN_SYSTEM.md`'s own distinction between top-level picker grids and denser sub-lists):

- **Radial glow**: each engine header gets the `.engine-card::before` treatment — a radial
  gradient in that engine's own `ENGINE_ACCENTS` color, `opacity: .14` at rest, blurred, bleeding
  from the top-left corner; brightens to `.26` on hover (ported 1:1 from `proto.css`, colors
  substituted from the accent system already built).
- **Crosshair corners**: `<CrosshairCorners />` on each engine header.
- **Pulsing engine dot**: the small accent dot next to each engine name adopts the site's real
  `engineDotPulse` keyframe (scale 1→1.4, opacity 1→.5, 2.4s loop) — matches
  `DESIGN_SYSTEM.md` §6's `.engine-dot`, which the mockup's own (unanimated) `.eng5-dot` didn't
  carry but the real site convention does. Method-row dots stay static (no pulse) — only the
  "which engine" picker level pulses, avoiding a sidebar full of simultaneously-blinking dots.
- **Hover-lift, scaled to context**: the real `.engine-card:hover` lifts `translateY(-6px)`,
  tuned for a full-width page-grid card. A dense 240px sidebar row lifting 6px would look like a
  glitch, so this ports the *mechanic* (lift + border brightens to the engine accent), not the
  literal token, at `translateY(-2px)` — small, still readable as "this is alive," proportionate
  to a compact list row.
- **Easing**: every transition above (`opacity`, `transform`, `border-color`) uses
  `cubic-bezier(.16, 1, .3, 1)`, matching `DESIGN_SYSTEM.md` §10 exactly, not a default/linear
  transition.

Method rows (inside an expanded engine) keep their current flat-list layout but gain the same
easing curve on their existing hover background-tint transition, so they don't feel like a
dead zone next to the now-animated engine headers.

## 3. Node cards: restore the mockup's ambient polish

`SyntropyNode.scss`'s top-level `.SyntropyNode` rule gains exactly what the approved v6 mockup's
`.node5` already specified and the current implementation dropped:

- `box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5)` — real depth, not a flat flush-to-canvas card.
- A `::before` radial-glow bleed in `var(--node-accent)`, `opacity: .15`, blurred, top-left
  corner — same mechanic as the library panel's engine-card glow, using the node's own accent
  instead of re-deriving it.
- `:hover { border-color: rgba(255,255,255,.24); transform: translateY(-2px); }` — the mockup's
  exact hover values (a node is a small canvas object, not a full-page card, so no further
  scaling is needed the way the library panel's row needed one).
- Both the hover transform and the glow's opacity transition use `cubic-bezier(.16, 1, .3, 1)`.

The scrub chips and output row (already restyled by the prior node-visual-language plan) are
unchanged by this design — this is specifically the outer card shell's missing ambient polish,
not another pass over the inputs/outputs.

## Verification

1. Open the library panel: each engine header shows a soft accent-colored glow bleeding from its
   top-left corner, crosshair ticks in its corners, a gently pulsing dot, and lifts slightly with
   a brightening border on hover — reads as a card, not a file-tree row. Different engines show
   different glow colors matching their real accents.
2. Spawn a node: it now has visible depth (drop shadow separating it from the canvas background)
   and a faint accent-colored glow bleeding from its top-left corner, matching its engine.
   Hovering it lifts it slightly and brightens its border — it feels alive at rest, not flat.
3. All new transitions (glow opacity, hover lift, border color) visibly use the same snappy
   ease-out-expo curve as the rest of the site, not an instant snap or a generic ease.
4. `CrosshairCorners` renders identically wherever used (node header, library engine header) —
   confirm by comparing pixel position/opacity of the four ticks in both contexts.
5. `yarn test:app --watch=false` still passes at baseline.
