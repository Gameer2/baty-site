# Design: Top-Level "Mathematics" Hub

Date: 2026-08-01
Status: Approved by user, ready for implementation planning

## Purpose

The existing `math-lab/` site (currently self-titled "The Lab") is going to become one of
four verticals in a bigger project. This spec covers building the **new top-level hub page**
that will sit above all four — the first piece of that bigger project, built now so the other
three verticals can be added later without reworking this page's structure.

The four verticals:
1. **General Lab** — the existing, already-built `math-lab/` site. Live today.
2. **Universities** — a future vertical. Not built yet.
3. **Schools** — a future vertical. Not built yet.
4. **Games** — a future vertical. Not built yet.

Only the hub page itself is in scope for this spec. The three unbuilt verticals get
"coming soon" cards on the hub — no other pages, no scaffolding for them beyond that card.

## Visual reference

User asked for a design consistent with `math-lab/`'s existing identity (`DESIGN_SYSTEM.md`)
but wanted influence from **endgame.ai** (a chess platform). Reviewed live via browser:
bold oversized serif headlines, fully-rounded pill-shaped buttons, black header/nav, rounded
card modules with strong imagery, icon-tile pickers, colored banner strips.

Decision: borrow the traits that layer cleanly onto the existing system without breaking its
rules (dark-only, one accent per section via `--electric-teal`, Fraunces/Roc Grotesk/Azeret
Mono type system, `expo-out` motion curve) — reject anything that would (endgame's light
cream hero section, for instance, conflicts with math-lab's hard "no light section, ever"
rule, so it is not used).

Traits carried over:
- **Bigger, bolder serif headline statement** — math-lab already has Fraunces `.h1`; this page
  leans harder into that rather than importing new typography.
- **Fully-rounded pill buttons** — a scoped, page-local `.btn--pill` class (border-radius 999px
  override on the existing `.btn` — same fill-sweep hover mechanic, same colors) used only on
  this hub's CTAs. This is the one deliberate visual departure that marks this page as "one
  level up" from the per-vertical hubs below it.

Traits explicitly skipped (YAGNI — would be redundant with only 4 cards on the page):
- Icon-tile category picker row.
- Colored banner/announcement strip.

## Architecture

- **New file:** `index.html` at the repo root (sibling to `math-lab/`), plus nothing else new
  under the repo root — no new `assets/` folder.
- **Asset reuse, not duplication:** the page links to `math-lab/assets/css/engine.css`,
  `math-lab/assets/proto/proto.css`, `math-lab/assets/js/engine-core.js`,
  `math-lab/assets/proto/proto.js`, and the vendor libs (`three.min.js`, `gsap.min.js`) via
  relative paths (`math-lab/assets/...`) from the root file. No fonts, vendor libraries, or
  core CSS are copied — there is exactly one copy of the design system in the repo.
- **`math-lab/` is untouched.** Every file, path, and link inside it stays exactly as it is
  today; it keeps working standalone at `math-lab/index.html` as it does now. This root hub is
  purely additive.
- **No new JS modules.** Reuses `Engine.initChrome()` and `Proto.initRipple()` exactly as
  `math-lab/index.html` does today, retargeted with this page's own content and a page-scoped
  `<style>` block for the `.btn--pill` override and the disabled-card treatment (following the
  same pattern `math-lab/index.html` already uses for its own intro-animation-only CSS).

## Page structure

Same shell pattern as `math-lab/index.html`: fixed floating header → full-bleed particle hero
(three.js ripple field, bottom-aligned content) → one card section → footer.

### Header
- Logo/wordmark: **"Mathematics"** (mono, small dot before it, same pattern as `math-lab`'s
  "The Lab" logo).
- No nav link list (only one of the four verticals is live — a multi-item nav would mostly
  point at disabled things). A single pill CTA button on the right: "Enter General Lab →"
  linking to `math-lab/index.html`.

### Hero
- Eyebrow: short mono categorical label, e.g. "Four Labs · One Discipline".
- H1 (Fraunces serif, big): **"Mathematics, Every Stage."**
- Sub-paragraph (`.p1`, max-width ~520px): explains the four-vertical structure in one or two
  sentences — General Lab is live today, the other three are on the way.
- Hero actions: one pill primary button → "Enter General Lab" (`math-lab/index.html`), one
  ghost button → "See What's Coming" (`#verticals`, scrolls to the card section).
- Particle canvas tinted with the default flagship accent `#5c939f` — same as `math-lab`'s own
  hub hero — since this page isn't "owned" by any single vertical's accent.

### Card section (`#verticals`)
Four `.engine-card`s in the existing `.grid--2`/`.engine-grid` pattern (collapses to 1 column
under 900px, same as today).

| Card | Status | Accent (`--electric-teal` override) | Behavior |
|---|---|---|---|
| General Lab | Live | `#5c939f` (existing flagship teal — this card *is* the existing brand, so it keeps its color) | Real `<a>`, links to `math-lab/index.html` |
| Universities | Coming soon | `#6f7fc4` (new — muted indigo, not used anywhere else in the site) | Disabled |
| Schools | Coming soon | `#9ec23f` (reclaimed — previously the removed Optimization engine's accent, now unused) | Disabled |
| Games | Coming soon | `#c15a86` (reclaimed — previously the removed Graph engine's accent, now unused) | Disabled |

**Live card (General Lab):** standard `.engine-card` `<a>`, eyebrow "Live · 7 Engines", tags
`Live` / `7 Engines` / `126 Method Pages`, short description of what math-lab actually covers
(numerical methods, calculus, linear algebra, statistics, ODEs, number theory, complex
analysis — all computed client-side, no server round-trip).

**Coming-soon cards (Universities, Schools, Games):** rendered as a `<div>` (not an `<a>` —
nothing to link to yet), same `.engine-card` visual base but:
- Dashed border instead of solid hairline (reuses the existing `.proto-badge` dashed-border
  language, applied to the whole card).
- No hover lift / no glow-brighten on hover (`pointer-events` still allow the dashed-border
  card to sit inline, but no `:hover` transform).
- Muted text opacity (~0.6) on the body copy, full opacity kept on the heading so the card
  still reads clearly at a glance.
- A small `.proto-badge`-style pill reading "Coming Soon" in place of the tag row.
- One placeholder sentence of intent for each (kept short — this is a promise, not a pitch):
  - Universities: university-level courses beyond what General Lab already covers.
  - Schools: K-12 math, same interactive-first approach, different audience.
  - Games: math taught through play mechanics rather than lecture-style tools.

### Footer
Same `.site-footer` bar pattern as `math-lab/index.html`, updated copy ("Mathematics" /
"Four labs, one discipline" or similar — small, not load-bearing).

## Motion

Identical entrance sequence to `math-lab/index.html`: GSAP timeline (header → hero canvas →
eyebrow → title lines → subtext → buttons), degrading to instant reveal under
`prefers-reduced-motion` or if GSAP fails to load. Reveal-on-scroll (`.reveal` /
`IntersectionObserver`) on the card section, same as every other page.

## Testing / verification

Static HTML/CSS/JS, no build step, no compute logic to unit-test. Verification is manual:
serve the repo root with a static file server, open the page in a browser, confirm:
- Hero renders, particle field animates, entrance timeline plays.
- General Lab card links correctly to `math-lab/index.html` and that page still loads
  unmodified.
- The three coming-soon cards render with the disabled treatment and are not clickable.
- Responsive collapse to 1 column under 900px.
- No console errors (missing asset paths would be the main risk given the relative-path reuse
  of `math-lab/assets/`).

## What must NOT change

- `math-lab/` — no files inside it are modified, moved, or renamed by this work.
- The shared design tokens/mechanics in `math-lab/assets/css/engine.css` — this hub consumes
  them as-is; it does not edit them. The only new CSS is the page-scoped `.btn--pill` override
  and the disabled-card styling, both living in this new page's own `<style>` block.
