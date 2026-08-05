# Design: Syntropy Canvas — visual identity pass

Date: 2026-08-04
Status: Design approved, ready for `writing-plans`.

Second sub-project of the Math Canvas work (see `2026-08-04-math-canvas-design.md` for the
overall vision, and `2026-08-04-math-canvas-fork-scaffold.md` / the branch
`worktree-math-canvas-fork-scaffold` for the vendored fork this builds on, now renamed
**Syntropy Canvas**). Scope: reskin the vendored Excalidraw app's own UI chrome to read as part
of this site, using the site's real, already-shipped tokens from `DESIGN_SYSTEM.md` — not a
node/library-panel build (that stays a separate future sub-project).

## Purpose

The fork-scaffold plan proved the vendored app boots and works. It still looks and reads as
stock Excalidraw. Before building the node/library-panel system on top of it, its own chrome
(toolbar, side panels, buttons, canvas background, dialogs) needs to visually belong to the
site — same dark palette, same fonts, the same restrained "instrument panel" motion language —
without restructuring how Excalidraw's components are laid out or behave.

## Architecture: override tokens, don't rewrite components

Investigated `canvas/packages/excalidraw/css/theme.scss` (owned source, not a black box): every
themeable value in the real Excalidraw UI — backgrounds, borders, the primary accent, shadows —
is already a CSS custom property scoped under `.excalidraw.theme--dark`. This is the same shape
as this site's own theming mechanic (`DESIGN_SYSTEM.md` §8: one CSS custom property per accent,
overridden per page). The approach is to add our own override block (a new stylesheet loaded
after `theme.scss`, or edits to `theme.scss` directly since we own this fork) that redefines
those existing variables — not to hunt through and rewrite individual component `.scss` files.
Component markup/structure is untouched; only the variables' values change.

## Colors

Syntropy Canvas gets its **own accent** — following the same per-section pattern already in use
across the 7 General Lab engines (Complex `#b45fd0`, Calculus `#4f9e82`, Linear Algebra
`#8570b3`, ODE `#4f8fc0`, Numerical `#9ec23f`, Statistics `#c15a86`, flagship default `#5c939f`)
— rather than reusing an existing one, since it's its own top-level surface, not a General Lab
engine page. New accent: **`#c9a24c`**, a muted gold — unused hue in the existing set, same
mid-tone/moderately-desaturated family so it doesn't fight `--infrared` or clash against
`--core-black`, confirmed legible against `#090909`.

Mapping (exact variable-by-variable mapping is a `writing-plans` task, this fixes the
direction):
- `--default-bg-color` / backdrop → `--core-black` (`#090909`)
- `--island-bg-color` (floating panels/toolbar) → `--rich-carbon` (`#111111`)
- `--color-primary` and its `-darker`/`-darkest`/`-hover`/`-light` variants → derived from
  `#c9a24c`
- Borders → the site's hairline convention: `rgba(255,255,255,.08–.2)`, never a solid gray
- Text → `--off-white` (`#e7e7e7`) primary, `--pulse-ash` (`#7d858c`) secondary/muted, matching
  Excalidraw's existing primary/muted text variable split
- Functional colors (danger/warning/success) are adjusted only if they visually clash once the
  background changes — not swapped wholesale, since they're semantic (error/warning states),
  not brand color.

## Typography

Found the single UI-chrome variable: `--ui-font` (default `"Assistant, system-ui, ..."`, set in
`packages/excalidraw/css/styles.scss` and `variables.module.scss`) — everything in the app's
chrome (buttons, menus, tooltips, dialogs) reads this one variable, mirroring
`DESIGN_SYSTEM.md`'s "UI chrome reads mono" rule. Overridden to the site's real self-hosted
Azeret Mono. Roc Grotesk is available for any more prose-like text if a component needs it
(e.g. dialog body copy), matching the site's existing body/chrome split.

**Explicitly untouched:** the canvas's own hand-drawn text font (Virgil/Excalifont) — that's
Excalidraw's actual drawing font for freehand text elements, confirmed in the earlier mockup
round as something the user wants kept exactly as-is. `--ui-font` only affects app chrome, never
the canvas content itself, so this separation is already structurally guaranteed by Excalidraw's
own variable split — no extra work needed to protect it.

Fonts are self-hosted `@font-face` (already present as files in `math-lab/assets/fonts/`),
consistent with the rest of the site's "no CDN fonts" rule.

## Motion / site-touch details

Two specific, bounded touches — not a full interaction redesign:

1. **Corner crosshairs** (`DESIGN_SYSTEM.md` §6's "instrument panel" tick-mark motif) added to
   the app's major floating surfaces: the toolbar pill and the side panels/dialogs.
2. **Standard easing curve** (`cubic-bezier(.16,1,.3,1)`, used everywhere else on the site) 
   applied to Excalidraw's own transition rules where it currently uses a different curve —
   swapping the timing function, not the transitions themselves.

Not in scope for this pass: the duplicate-text hover-flip (nav-link mechanic) — most of
Excalidraw's toolbar is icon-only buttons with no visible label to flip; revisit only if a
future pass adds real text buttons this would suit.

## Explicitly out of scope

- Any change to component layout, structure, or behavior — same panels, same tool order, same
  interactions as stock Excalidraw, just re-themed.
- The node system, library panel, and wiring graph — separate future sub-project per
  `2026-08-04-math-canvas-design.md`.
- Light theme — the site is dark-only (`DESIGN_SYSTEM.md` §1's hard rule); Syntropy Canvas only
  needs `.theme--dark` touched, not the light-theme block in the same file.

## Addendum: SaaS/account chrome removal (added mid-implementation)

Not in the original scope above — added after reviewing the first working build. Stock
Excalidraw's hamburger menu and welcome screen still read as a generic SaaS product (Sign
up/Sign in, an Excalidraw+ upsell link, Socials, a light/dark theme toggle) rather than an
integrated part of the math site. Removed from `AppMainMenu.tsx` and `AppWelcomeScreen.tsx`;
the welcome screen's logo slot now renders "Syntropy Canvas" (in the canvas's own hand-drawn
font) instead of the Excalidraw wordmark, and its copy was rewritten in `en.json`. Collaboration
is now unconditionally disabled in `App.tsx` (`isCollabDisabled = true`) rather than only inside
an iframe, consistent with "no collaboration server for v0."

Also surfaced and fixed during this pass: the app defaulted to `THEME.LIGHT`
(`useHandleAppTheme.ts`), which meant every `.theme--dark` color override above was invisible
until this was corrected — Syntropy Canvas now defaults to dark, matching the site's dark-only
rule, and the (now pointless) light/dark toggle was removed from the menu alongside the other
chrome.
