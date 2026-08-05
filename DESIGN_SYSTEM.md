# Visual Identity — Design System Reference

A complete, standalone record of this project's visual identity: every color, font, spacing
token, component pattern, and animation rule. Written so it can be lifted into an unrelated
project — swap the hex values and copy in section "0. What to change vs. keep" and the rest
carries over mechanically.

Source of truth in this repo: `math-lab/assets/css/engine.css` (base system) +
`math-lab/assets/proto/proto.css` (extra components) + `math-lab/assets/js/engine-core.js`
(chrome behavior) + `math-lab/assets/proto/proto.js` (hero particle field). This file is a
snapshot/explanation of that code, not a replacement for it — if the two ever disagree, the
code is correct and this file is stale.

---

## 0. What to change vs. keep, when reusing this for another site

- **Change:** the 10 color values in section 1, the 3 typefaces in section 2, the per-section
  accent-color list in section 8.
- **Keep as mechanics** (these are what make it feel like "one identity," independent of the
  actual colors): the dark-only rule (no light sections, ever), the single-accent-color-per-
  variant system via one CSS custom property, the duplicate-text hover-flip on nav/buttons,
  the corner-crosshair motif, the reveal-on-scroll pattern, the full-bleed interactive particle
  hero, and the `expo-out` cubic-bezier used on every transition.

---

## 1. Color palette

All colors are CSS custom properties on `:root`, defined once in `engine.css`. Nothing is ever
hardcoded as a raw hex in a component rule — every rule reads `var(--token-name)`.

| Token | Hex | Role |
|---|---|---|
| `--core-black` | `#090909` | Page background. The *only* background color for the page itself — never white, never light gray. |
| `--rich-carbon` | `#111111` | Card/panel/table-stat background — one step up from the page so components read as "raised" without a hard border. |
| `--urban-smoke` | `#1b1b1b` | Scrolled-header background, table header row, step-number badges — a second, slightly lighter raised surface. |
| `--pulse-ash` | `#7d858c` | Tertiary text (labels, captions, muted body copy). Bumped up from an earlier `#535353` because that failed contrast on black — keep tertiary text light enough to pass contrast on `--core-black`. |
| `--off-white` | `#e7e7e7` | Primary text color (headings, button labels). |
| `--neural-fog` | `#dadada` | Secondary body text (`.p1` paragraphs). |
| `--electric-teal` | `#5c939f` | **The** accent color slot — see section 8. Every accent-colored thing in the UI (eyebrow dots, focus rings, links-on-hover, plot lines, panel titles) reads this one variable. |
| `--infrared` | `#ed6d40` | Universal CTA / highlight color. Never varies per section/theme — it's the one color that means "primary action" everywhere, independent of accent. Also used as the fixed "hot" color in the interactive hero (cursor proximity heats points toward it). |
| `--validation-green` | `#59a993` | Success/OK state only. |
| `--validation-red` | `#cb3500` | Error/bad state only. |

**Non-token colors that do appear directly** (deliberately, not tokens because they're one-off): `#ff8a5c` (primary-button hover lighten), `#ffffff` (glow-blur color behind the primary button on hover), `rgba(255,255,255,.08)` and similar low-opacity whites (all hairline borders — never a solid gray border color, always white-on-black at 6–20% opacity so it self-adjusts against whatever's behind it).

**Hard rule:** no white or light-gray *section* background anywhere on the site. If you need visual rhythm between sections, alternate between `--core-black` and `--urban-smoke` (both dark) — never introduce a light section. This was an explicit correction during this project's build: an earlier draft had a white "light rhythm" section and it was wrong.

---

## 2. Typography

Three typefaces, each with one job:

| Family | File format | Used for |
|---|---|---|
| **Roc Grotesk** | woff2/woff, weights 400 & 500 | Body/display default (`--font-display`) — base font on `<body>`. |
| **Azeret Mono** | otf, weight range 400–700 | Every label, nav item, button, eyebrow tag, table cell, stat value — anything "data" or "UI chrome" reads mono. This is a strong identity signal: prose is Roc Grotesk, everything functional/numeric is mono. |
| **Fraunces** | variable woff2, weights 300/450/600 declared | Serif, used *only* for large headings (`.h1`, `.h2`, card `<h3>`) and the hero title. Gives the "editorial/lab-notebook" contrast against the mono UI chrome. |

Self-hosted via `@font-face` with `font-display: swap`, not loaded from a CDN.

Type scale:
```css
.h1 { font-family: var(--font-serif); font-weight: 350; font-size: clamp(44px, 7.5vw, 104px); line-height: 0.98; letter-spacing: -0.02em; }
.h2 { font-family: var(--font-serif); font-weight: 400; font-size: clamp(32px, 4.6vw, 54px); line-height: 1.06; letter-spacing: -0.01em; }
.h3 { font-size: clamp(21px, 2.5vw, 29px); line-height: 1.15; }  /* not serif — inherits body font */
.p1 { font-size: 17px; color: var(--neural-fog); }
.p2 { font-size: 15px; color: var(--pulse-ash); }
```

**Eyebrow tag** (small uppercase category label, used above nearly every heading):
```css
.eyebrow {
  font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--electric-teal); display: inline-flex; align-items: center; gap: 8px;
}
.eyebrow::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
```
A small solid dot always precedes an eyebrow. This single component (colored mono label + dot) is reused everywhere: section labels, card category tags, status indicators.

---

## 3. Layout tokens

```css
--radius-sm: 4px;    /* buttons, inputs */
--radius-md: 8px;    /* header pill, formula blocks, keypad */
--radius-lg: 20px;   /* cards, panels, plot wraps — the "big rounded surface" radius */
--container-w: 1280px;
--header-h: 84px;
```
- `.container`: `max-width: 1280px; margin: 0 auto; padding: 0 24px;`
- Section vertical rhythm: `.section { padding: 90px 0; }`, `.section--tight { padding: 50px 0; }` (used right under a hero, or for tool/workspace pages that don't need as much breathing room).
- Grids: `.grid { display:grid; gap:24px; }` with `.grid--2` / `.grid--3` column-count modifiers, collapsing to 1 column under 900px.

---

## 4. Header / navigation

- `position: fixed`, floats **20px from the top** (not flush) — reads as a floating pill, not a bar.
- At rest: transparent background, no border.
- On scroll (`.is-scrolled`, toggled by a `scrollY > 40` listener): background becomes `--urban-smoke`, margins pull in 16px from each side, gets a soft drop shadow. This is a *shrink-and-solidify* effect, not just a background swap.
- Logo: mono, uppercase, a small solid dot in `--infrared` before the wordmark (the one place `--infrared` appears outside a CTA — it's the brand dot).
- Nav links and buttons share a **duplicate-text hover-flip**: each label is rendered twice (`<span>Label</span><span class="dup">Label</span>`), the real one stacked on top of an absolutely-positioned duplicate directly below. On hover, both slide up by 100% — the real label exits upward, the duplicate (styled slightly brighter) slides in to take its place. This needs a wrapping element with `overflow:hidden; height:1.2em`. Injected automatically by a small JS helper so component markup never has to remember to duplicate the text by hand (see section 10).
- Nav collapses entirely under 860px — **no hamburger menu fallback**. This is a deliberate scope decision for this project (a small number of top-level items), not a general recommendation; a bigger site would need a real mobile nav.

---

## 5. Buttons

Two variants, both mono/uppercase/small-radius, sharing one hover mechanic: a **fill-sweep**.
```css
.btn::before {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit;
  background: currentColor; transform: scaleX(0); transform-origin: left;
  transition: transform .4s cubic-bezier(.16,1,.3,1);
}
```
The ghost variant starts transparent; on hover, `::before` scales in from the left edge to fully fill the button in the accent color, while text color flips to `--core-black` to stay readable. A second element (`.glow`, a blurred 40px circle) scales in from 0 to 1.6 behind the button on hover for a soft light-bleed effect.

- `.btn--primary`: always filled `--infrared` at rest (it's the CTA color, always visible, never needs a hover reveal) — hover just lightens to `#ff8a5c`.
- `.btn--ghost`: transparent at rest, sweeps to `--electric-teal` (the *contextual* accent, not the fixed CTA color) on hover.
- `.btn--sm`: same button, smaller padding/font, used in the header.

---

## 6. Cards & the "engine-card" pattern

**Base `.card`**: `--rich-carbon` background, 1px near-invisible white border (`rgba(255,255,255,.08)`), `--radius-lg`, hovers by lifting `translateY(-4px)` and brightening its border to `rgba(255,255,255,.2)`.

**Solid-fill variants** `.card--teal` / `.card--infrared`: the *entire* card fills with the accent/CTA color, text flips to near-black. Used sparingly and only where the card is a real, distinct, clickable unit that benefits from being visually "loud" — **never** for plain descriptive/marketing text with no destination. (An earlier draft of this project used these for pure-text filler cards; that was identified as a mistake and removed — solid-fill cards should always be doing navigational work.)

**`.engine-card`** — the actual "identity" card pattern, used for every picker/index grid in the final design (top-level section picker, sub-item picker, everywhere a grid of "go here next" cards appears):
```css
.engine-card { background: var(--rich-carbon); position: relative; overflow: hidden; }
.engine-card::before {
  content: ""; position: absolute; top: -35%; left: -15%; width: 75%; height: 75%;
  background: radial-gradient(circle, var(--electric-teal) 0%, transparent 72%);
  opacity: .14; filter: blur(6px); transition: opacity .4s ease;
}
.engine-card:hover { border-color: var(--electric-teal); transform: translateY(-6px); }
.engine-card:hover::before { opacity: .26; }
```
Stays dark at rest, but has a soft accent-colored radial glow bleeding in from the top-left corner (14% opacity, blurred) that brightens on hover. This is the signature "this card belongs to this colored section" cue, without ever making the card itself a solid color block.

Companion sub-elements, always used together inside an `.engine-card`:
- `.engine-dot` — small solid dot in the accent color, gently pulsing (`scale(1)→scale(1.4)`, `opacity 1→.5`, 2.4s loop) — sits above the card's eyebrow row, reads as "this is live/active."
- `.engine-card-head` — a flex row holding the eyebrow tag on the left and a small `N / total` index counter (mono, `--pulse-ash`) on the right.
- An `.engine-grid` wrapper class on the parent grid bumps padding to 40px and title size to 30px for a "top-level" picker; omit it for a denser sub-picker.

**Crosshair corners** (`.crosshair-host`): any card or panel can opt into four small tick marks in its corners (a horizontal + vertical hairline, low opacity) — a recurring "instrument panel" motif. Injected automatically by JS, not written by hand per component (section 10).

---

## 7. Hero section — full-bleed interactive particle field

This is the single most identity-defining piece. Every top-level landing page (the site index and every section's own index) opens with:

```css
.hero { min-height: 100vh; display: flex; align-items: flex-end; padding: calc(var(--header-h) + 40px) 0 100px; overflow: hidden; }
.hero-canvas { position: absolute; inset: 0; z-index: 0; opacity: .8; }
.hero-inner { position: relative; z-index: 1; width: 100%; }
```
- Full viewport height, content **bottom-aligned** (not centered) — the canvas fills the whole box, text sits low.
- Content stack, in order: eyebrow → big serif `.h1` title → `.p1` sub-paragraph (max-width 520px so it doesn't run the full container width) → a row of `.hero-actions` buttons.

**The canvas itself** (three.js), current implementation — `Proto.initRipple(canvas, accentHex)`:
- A `PlaneGeometry` ground grid (34×34 units, 40 segments per side ⇒ ~1,681 points) rendered as `THREE.Points`, rotated flat.
- `PerspectiveCamera` at FOV 46, positioned at `(0, 6.6, 6.8)` looking at the origin — a fairly steep downward angle. **This angle matters**: a shallower/closer camera on a large flat grid makes far points visually compress into a smear near the horizon (a real bug hit and fixed during this build) — keep the angle steep and the grid modest in size.
- `scene.fog = new THREE.Fog(coreBlackHex, 5, 18)` — fades far points into the background color instead of letting them pile up at the horizon. Fog color must match the page background exactly.
- Each point's color is the accent color lerped toward a light "fog tint" (`#e7e7e7`) by a random amount per point (`Math.random() * 0.35`) — gives natural variation instead of flat single-color dots.
- Ambient motion: every point's height oscillates via `sin(x·0.35 + t·0.6)·0.55 + cos(z·0.3 + t·0.4)·0.45`, plus the whole field slowly rotates (`rotation.y = t·0.03`).
- **Mouse interactivity** (fine-pointer devices only, checked via `matchMedia("(hover:hover) and (pointer:fine)")`): a raycaster hits an invisible ground plane at the cursor position; nearby points bulge upward and shift color toward `--infrared` with an exponential falloff by distance, decaying back to ambient when the cursor stops moving or leaves. This is what makes the field read as "reacting to you live," not a looping background video.
- Point material: `size: 0.11, sizeAttenuation: true, transparent: true, opacity: .85, fog: true`.

**Per-page tint**: the *only* thing that changes between one section's hero and another's is the `accentHex` argument passed to `Proto.initRipple` — same geometry, same motion, same interaction, different color. This is the literal mechanism behind "one shell, N accents."

---

## 8. One accent color per section, everywhere

The whole multi-section identity is one trick, applied consistently: **`--electric-teal` is treated as a per-page override, not a fixed value.** Every component (eyebrows, focus rings, panel titles, chip active-states, plot line colors, the `engine-card` glow, the hero tint) reads `var(--electric-teal)` — never a hardcoded color. A page declares its own accent in one line in `<head>`:
```html
<style>:root{ --electric-teal:#4f9e82; }</style>
```
and every one of those dozens of component rules picks it up automatically. `--infrared` is the one exception — it's the fixed, global "primary action" color and never changes per section.

Accent values used in this project (swap these for a different site):
| Section | Accent hex |
|---|---|
| Flagship / default | `#5c939f` |
| Section 1 | `#4f9e82` |
| Section 2 | `#8570b3` |
| Section 3 | `#c99a3c` |
| Section 4 | `#4f8fc0` |
| Section 5 | `#9ec23f` |
| Section 6 | `#c15a86` |

Picking new accents: keep them all roughly the same *lightness/saturation family* (this set is all mid-tone, moderately desaturated) so none of them fight the fixed `--infrared` CTA color or feel out of place against `--core-black`. Avoid pure primaries and avoid anything as saturated/warm as the infrared itself.

---

## 9. Forms, data display, feedback

- **Inputs**: `--core-black` background (darker than the card it sits in — inputs are always a "well," never flush with their panel), thin white-ish border, mono font, `--radius-sm`. Focus = border turns `--electric-teal`, nothing else moves.
- **Number inputs never show native spinner arrows** — `-webkit-appearance:none` on the spin buttons, `-moz-appearance:textfield` on Firefox. If a numeric control needs stepping, build a real slider or dedicated +/- control instead of relying on the tiny native arrows.
- **Sliders** (`input[type=range]`): a thin 3px track, with a solid `--infrared` circular thumb (this is one of the few UI elements that always uses the fixed CTA color rather than the section accent — a slider thumb is a "you are here" marker, treated like a highlight, not a themed element).
- **Stat tiles** (`.result-strip` / `.result-stat`): a row of equal-width tiles separated by 1px hairlines (achieved via a grid gap filled with a hairline-colored background, not individual borders — avoids doubled borders between tiles). One tile can be `.accent` (filled solid `--infrared`) to call out the single most important number.
- **Data tables**: sticky mono header row in `--urban-smoke`, zebra-striped body rows (`rgba(255,255,255,.02)` on odd rows — extremely subtle), and a "current row" state that tints the row `rgba(infrared, .12)` and colors its first cell in `--infrared` — used for step-through/iteration UIs where one row is "the current step."
- **Status line** (inline ok/bad indicator): a small dot + colored text, green for ok / red for bad, never anything more elaborate than that for simple validation feedback.

---

## 10. Motion & interaction rules

- **Standard easing curve, used everywhere**: `cubic-bezier(.16,1,.3,1)` — a snappy "ease-out-expo" feel. Header transitions, button sweeps, card lifts, nav hover-flips all use this exact curve. Consistency here is part of what makes the whole thing feel like one system.
- **Reveal-on-scroll**: any element with class `.reveal` starts `opacity:0; translateY(28px)`, and an `IntersectionObserver` (threshold 0.15, `rootMargin: "0px 0px -40px 0px"`) adds `.is-visible` once it's ~15% into view, which transitions it to full opacity/position over 0.7s. Fires once per element (unobserves after triggering), not on every scroll pass.
- **pulseFlash**: a brief expanding-ring border flash (0.5s) used to visually confirm "your input just changed this output" — e.g. flashing a formula preview right after the user edits the source field.
- **Chrome injection is centralized, not hand-written per page.** One JS function (`Engine.initChrome()`, called on every page) walks the DOM after load and:
  1. Wires the header's scroll-based `.is-scrolled` toggle.
  2. Finds every `.btn` and injects the `.glow` span + duplicate-text `<span class="dup">` markup if not already present.
  3. Finds every `.crosshair-host` and injects the four corner-tick spans.
  4. Sets up the reveal-on-scroll `IntersectionObserver` for every `.reveal` element.
  This means component *markup* just needs the right class names — the repetitive decorative DOM (glow spans, duplicate text, crosshairs) is generated once, centrally, so it can't drift out of sync between pages.

---

## 11. Voice / content patterns

- Section labels (eyebrows) are short, mono, uppercase, categorical ("Root Finding", "Derivatives · Integrals · Series") — never a full sentence.
- Headings are short and punchy, often an imperative or a claim ("Find The Minimum", "Every Path, Visualized"), set in the large serif face for contrast against the mono chrome everywhere else.
- Body copy explains *why the visual demonstrates something*, not just what a feature does — e.g. describing what a live interaction will visibly show the user, not just naming the interaction.
- A dashed-border "status badge" pattern (`.proto-badge`: dashed border, pill radius, small dot) is used to honestly flag work-in-progress vs. fully-live functionality inline in the hero copy, rather than hiding that distinction.

---

## 12. Vendor stack (for context, not required by the identity itself)

Three.js (hero/3D canvases), GSAP (entrance timelines), Plotly (2D charts, themed dark via a shared `plotlyBaseLayout()` helper so every chart matches the palette automatically), KaTeX (math typesetting), math.js (expression parsing/symbolic math). All self-hosted, no CDN calls, no analytics/tracking scripts. This is a "no build step" static site — plain HTML/CSS/JS per page, no bundler.

---

## 13. Responsive rules actually in place

- Nav links hidden entirely below 860px (no fallback menu — see section 4 caveat).
- Two/three-column grids collapse to one column below 900px.
- Side-by-side form rows (`.field-row`) stack below 520px.
- `engine-card` padding steps down (40px→28px) and its title shrinks (30px→24px) below 700px.
