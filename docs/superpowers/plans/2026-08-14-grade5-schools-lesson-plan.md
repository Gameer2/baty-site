# Grade 5 — Schools Lesson-Build Plan

Status: detailed content/build plan, ready to implement. Design, typography, and page pattern are settled — see `DESIGN_SYSTEM.md` §14 and the reference implementation `prototypes/lesson-g6-1-1-integers-absolute-value.html`. This document does not re-decide any of that; it applies it to all 52 Grade 5 lessons.

Source curriculum: `docs/curriculum-references/topics/grade05-topics.md` (10 units, 2 semesters, 52 lessons). Every lesson below keeps that file's Arabic title, objective, and "what's taught" text as the page's actual content — this document adds the missing piece: **what the bespoke concept-native visual is, and what the one explicit control does**, per §14.3's rule (no shared generic widget — each lesson's visual matches what the concept literally *is*).

---

## How to read each entry

```
N.N Title (EN / AR)
  Visual — the bespoke scene: what's on screen and what it literally represents
  Control — the one explicit input that drives it (mirrors whatever direct-manipulation exists)
  Tour — the 3–4 "Explain this" spotlight beats, in order
  Reuse — which earlier lesson's rendering code this can fork from, if any (real reuse, not a shared component — see §14.3)
```

All 52 lessons follow the same page shell (crumb → bilingual title → objective → stage[equation bar + control + scene + teach caption] → nav pills) and the same bilingual/numeral rules from §14.4 — those aren't repeated per lesson below.

---

## Build order recommendation

Don't build in curriculum order. Build in this order to front-load the pieces that get reused most:

1. **1.1 (place-value chart)** — reused directly by 6.1 (thousandths extends the same chart rightward).
2. **1.3 (column add/sub with carry)** — the carry/regroup animation is reused by 2.3 (multiplication partial products, same "column + carry" grammar) and 6.6 (decimal add/sub, same grammar with a decimal-point alignment step added).
3. **1.2 (digit-scan compare)** — reused by 6.3 (decimal compare, same scanning-beam idea extended past the point).
4. **10.1 (mean-as-balance on a number line)** — this exact "tiles on a line, computed marker" mechanic recurs in Grade 7's mean lesson; building it well now pays off later.
5. Everything else has no direct sibling this grade and can be built in curriculum order from there.

This mirrors the primitive-tier logic in `docs/curriculum-references/topics/implementation-roadmap-by-primitive.md`, scoped down to only the reuse pairs that actually exist inside Grade 5 itself.

---

## Semester 1

### Unit 1 — Whole Numbers (الأعداد الكلّية)

**1.1 Place Value Within Millions**
- Visual: a place-value chart with 3 visually grouped, distinctly colored "periods" (ones / thousands / millions), each a row of digit slots. This *is* the textbook's own model — no abstraction layer.
- Control: a 7–8 digit number input (or per-digit steppers); a toggle reveals standard / word / expanded form simultaneously.
- Tour: what a period is → find a marked digit's place → read it in all three forms.
- Reuse: none (this is the source for 6.1's reuse).

**1.2 Comparing and Ordering Numbers**
- Visual: two numbers stacked, place-value-aligned; a scanning beam sweeps left→right, dimming matching digits, freezing and highlighting the first differing column to declare >/</=.
- Control: two number inputs.
- Tour: stack and align → scan from the left → the decisive column.
- Reuse: source for 6.3 (decimal compare extends the beam past the decimal point).

**1.3 Adding and Subtracting Whole Numbers**
- Visual: vertical column operation with a small glowing "carry/borrow" chip that visibly moves from one column into the next when regrouping happens; a rounded estimate ticks alongside the exact computation the whole time.
- Control: two number inputs (addend/subtrahend, with an add/subtract toggle).
- Tour: estimate first → column-by-column carry animation → compare exact to estimate.
- Reuse: source for 2.3 (multiplication partial products) and 6.6 (decimal add/sub).

**1.4 Negative Numbers**
- Visual: **directly adapt** the existing Grade 6 §1.1 sea-level diver scene (`prototypes/lesson-g6-1-1-integers-absolute-value.html`), scoped down — drop the ghost/opposite marker and the absolute-value bracket entirely (Grade 5 only introduces reading a signed position, not opposites or absolute value). Just the diver, the ruler, the sea-level badge, and the live signed-number readout.
- Control: the existing slider/drag, unchanged.
- Tour: sea level = zero → drag below → drag above → read the signed value.
- Reuse: G6.1.1 prototype, trimmed.

**1.5 Problem-Solving Strategy: Make a Table**
- Visual: an auto-growing two-column table; entering a rule (e.g. "3 red per green") live-fills successive rows as a "target row" slider advances.
- Control: rule inputs (ratio) + target-row slider.
- Tour: enter the rule → watch rows grow → jump straight to the target row.
- Reuse: none.

### Unit 2 — Multiplication and Division (الضرب والقسمة)

**2.1 Mental Multiplication (doubling/halving)**
- Visual: a literal balance/seesaw — one factor's bar shrinks by half while the other grows by double; a product-area bar stays constant width throughout, making visible *why* the trick preserves the product.
- Control: slider on one factor (the other adjusts inversely, locked).
- Tour: unequal factors → halve one, double the other → product area never changes.
- Reuse: none.

**2.2 Estimating Products**
- Visual: two factor sliders with a rounding "snap" marker each; exact product and rounded-estimate product shown side by side with an over/under arrow.
- Control: rounding-target slider per factor.
- Tour: round each factor → compute the easy estimate → is it over or under?
- Reuse: none (shares the "estimate alongside exact" idea with 1.3/6.5 conceptually, not code).

**2.3 Multiplying Whole Numbers**
- Visual: step-through partial-products animator — each partial product highlights as it's computed and placed, then the shifted partial products sum with carries, estimate docked as a running sanity check.
- Control: two number inputs (multiplicand, multiplier).
- Tour: estimate → first partial product → second partial product → sum → compare to estimate.
- Reuse: forked from 1.3's carry/column engine.

**2.4 Estimating Quotients**
- Visual: a number line showing the actual divisor plus nearby "easy" compatible numbers as selectable rungs; picking one computes the quick estimate live.
- Control: rung-select (drag or tap) among the compatible-number options.
- Tour: the real divisor → nearby easy options → pick one → instant estimate.
- Reuse: none.

**2.5 Dividing Whole Numbers**
- Visual: animated long-division "staircase" — divide/multiply/subtract/bring-down highlighted in sequence; ends with a real-world remainder-interpretation prompt (round up / keep as leftover / discard) the student must resolve.
- Control: dividend/divisor inputs; step button to advance the staircase; remainder-choice buttons at the end.
- Tour: estimate first → staircase cycle, step by step → what does the remainder mean here?
- Reuse: none (staircase is a distinct grammar from the column-carry one).

### Unit 3 — Properties of Numbers (خصائص الأعداد)

**3.1 Divisibility by 4, 6, 9**
- Visual: a live number scanner — as the number changes, the relevant digits highlight per rule (last two digits for 4, digit sum for 9, both checks for 6), with instant pass/fail per rule.
- Control: number slider/input.
- Tour: rule for 4 → rule for 9 → rule for 6 (both at once).
- Reuse: none.

**3.2 Prime Factorization**
- Visual: interactive factor tree — tap a composite node, choose a factor pair, tree grows to primes; toggle shows the same number's repeated-division ladder.
- Control: starting-number input; tap-to-split interaction on tree nodes.
- Tour: pick a composite → split → split again until every branch is prime → same result via the division ladder.
- Reuse: none.

**3.3 Greatest Common Factor**
- Visual: drag-and-drop Venn diagram — each number's factor list sorted into overlapping circles, shared factors land in the overlap, the largest auto-flags as GCF.
- Control: two number inputs.
- Tour: list both factor sets → sort into the circles → the overlap → the largest shared one.
- Reuse: none.

**3.4 Least Common Multiple**
- Visual: two interlocking gears with different tooth counts, animating rotation until a marked tooth on each realigns — literally the textbook's own example — with a dual skip-counting number line alongside.
- Control: tooth-count slider per gear (the two numbers).
- Tour: gears start misaligned → spin → realign at the LCM → confirm on the number line.
- Reuse: none.

**3.5 Square of a Number and Square Root**
- Visual: an n×n tile grid that grows live as a side-length slider moves; reverse mode takes an area input and highlights the matching square's side (its root).
- Control: side-length slider forward; area input in reverse mode (toggle).
- Tour: build a square → count the tiles = n² → reverse: given the area, find n.
- Reuse: none.

### Unit 4 — Fractions and Operations (الكسور والعمليات عليها)

**4.1 Mixed Numbers**
- Visual: a fraction number line plus a "pie stack" (whole circles + one partial circle) — dragging the line point updates both the improper-fraction and mixed-number labels and the pie stack simultaneously.
- Control: draggable point on the number line.
- Tour: drag past a whole → improper form → mixed form → pies confirm both are the same value.
- Reuse: none (different number-line grammar from 1.4's signed-position one — this one is fraction-scaled).

**4.2 Comparing and Ordering Fractions and Mixed Numbers**
- Visual: stacked, adjustable-denominator fraction bars that auto-realign to a shared grid so the size comparison is visible before any symbolic answer.
- Control: two fraction inputs (numerator/denominator each).
- Tour: same denominator, compare numerators → unlike denominators → common grid → compare.
- Reuse: none.

**4.3 Adding Fractions**
- Visual: dual-circle pie addition — one circle's slices resize to match the other's denominator, then the two fills visually combine into the sum.
- Control: two fraction inputs.
- Tour: unlike denominators → resize to match → combine → simplify.
- Reuse: none.

**4.4 Subtracting Fractions**
- Visual: a "take away" pie-slice animator — slices of the resized fraction are removed one by one from the larger pie, landing on the difference.
- Control: two fraction inputs (minuend/subtrahend).
- Tour: resize to common denominator → remove slices one by one → what's left is the difference.
- Reuse: forks 4.3's pie-resize logic.

**4.5 Multiplying Fractions**
- Visual: an overlapping-rectangle area model — one fraction's shaded rows cross another's shaded columns; the doubly-shaded overlap region *is* the product.
- Control: two fraction inputs.
- Tour: shade rows for one fraction → shade columns for the other → the overlap is the answer → simplify.
- Reuse: none.

**4.6 Dividing Fractions**
- Visual: a "how many fit" tiling animation — the divisor's unit is repeatedly laid inside the dividend's shaded region (including partial copies), then a toggle reveals invert-and-multiply as the fast equivalent.
- Control: two fraction inputs; a toggle between "measure it out" and "shortcut" views.
- Tour: how many sixths fit in two-thirds? → count copies → the shortcut gives the same answer.
- Reuse: none.

### Unit 5 — Representing and Interpreting Data (تمثيل البيانات وتفسيرها)

**5.1 The Statistical Question**
- Visual: a sort activity (drag sample questions into "statistical" / "not statistical" bins with instant reasoning shown), plus a typed-question box where a small panel of simulated respondents "answers" live to reveal whether responses vary.
- Control: text input (type your own question) + drag-to-sort.
- Tour: a fixed-answer example → a varies-by-person example → try typing your own.
- Reuse: none.

**5.2 The Coordinate Plane**
- Visual: an interactive first-quadrant grid — click to drop a point with a live (x,y) label; a second mode shows a clickable map scene (lake, forest, hospital, house) that reveals coordinates on click.
- Control: click/drag to place or move a point.
- Tour: origin and axes → plot a given point → read a landmark's coordinates off the map.
- Reuse: this is the base grid other lessons' coordinate work (Grade 6+) will fork from — build it cleanly.

**5.3 Line Graph Representation**
- Visual: a drag-to-plot builder from a data table that auto-draws the connecting line; a playback mode "draws" the line left-to-right over time with a value readout marker.
- Control: data-table inputs (or a dataset picker) + a playback scrubber.
- Tour: axis convention (time along the bottom) → plot from the table → play it back and read a value.
- Reuse: none.

**5.4 Double Bar Graph Representation**
- Visual: an interactive builder — assigning two data series per category renders paired colored bars with a live legend; hovering a category surfaces the numeric gap between its two bars.
- Control: value sliders per bar (two series × N categories).
- Tour: single bars → add a second series → compare the gap in one category.
- Reuse: none.

---

## Semester 2

### Unit 6 — Decimals and Percentage (الكسور العشرية والنسبة المئوية)

**6.1 Thousandths**
- Visual: the same place-value chart component as 1.1, extended rightward past the decimal point through tenths/hundredths/thousandths.
- Control: per-digit steppers either side of the decimal point.
- Tour: the decimal point boundary → the thousandths column → all three representations again.
- Reuse: **direct fork of 1.1** — build 1.1 generically enough that this is a config change, not a rebuild.

**6.2 Converting Between Fractions and Decimals**
- Visual: a live dual display — typing a fraction animates its long-division steps into a decimal; typing a decimal shows it become a fraction over a power of ten, with the simplification step highlighted.
- Control: a single value input + a fraction⇄decimal direction toggle.
- Tour: fraction → long division → decimal → reverse: decimal → power-of-ten fraction → simplify.
- Reuse: none.

**6.3 Comparing and Ordering Decimals**
- Visual: a zoomable number line — place two close decimals and see directly which sits further right.
- Control: two decimal inputs.
- Tour: place both → zoom in on the tie → the one further right wins.
- Reuse: **direct fork of 1.2's scanning-beam idea**, adapted to a zoomable line instead of column digits.

**6.4 Rounding Decimals**
- Visual: a slider on a zoomed number line showing a decimal's exact position between its two rounding targets, snapping to whichever is closer.
- Control: decimal-value slider + place-value selector (tenths/hundredths/whole).
- Tour: two nearby targets → where does the value actually sit? → snap to the closer one.
- Reuse: none.

**6.5 Estimating Sums and Differences of Decimals**
- Visual: a rounding slider on each addend, live estimate alongside the exact sum/difference.
- Control: two decimal sliders + rounding-precision selector.
- Tour: round each → mental estimate → compare to the exact computation.
- Reuse: conceptually mirrors 2.2, separate build (different number domain).

**6.6 Adding and Subtracting Decimals**
- Visual: column-aligned animator — decimal points snap into alignment, zero-padding tiles appear for missing places, then the same carry/borrow animation from 1.3 runs, decimal point dropped straight down into the answer.
- Control: two decimal inputs (add/subtract toggle).
- Tour: align the points → pad the missing places with zero → carry/borrow as usual → drop the point down.
- Reuse: **direct fork of 1.3**, decimal-alignment step added first.

**6.7 Multiplying and Dividing Decimals by 10, 100, 1000**
- Visual: an animated decimal point that visibly "jumps" the correct number of places across a digit strip as the power of ten is dialed in.
- Control: a ×10/×100/×1000 (and ÷ equivalents) selector.
- Tour: pick a power of ten → watch the point jump → read the new value.
- Reuse: none.

**6.8 Percentage**
- Visual: a 100-cell grid — click cells to shade (or drag a percentage slider that shades the grid to match); fraction/decimal/percent readouts update together, live, in all three forms.
- Control: click-to-shade grid, or the equivalent percentage slider.
- Tour: shade some cells → read as a fraction → as a decimal → as a percent, all at once.
- Reuse: none.

### Unit 7 — Algebraic Expressions and Equations (المقادير الجبرية والمعادلات)

**7.1 Evaluating an Algebraic Expression**
- Visual: an algebra-tile model (unit squares + one variable-rectangle tile); a slider on the variable's value live-updates both the tile count and the computed result.
- Control: variable-value slider.
- Tour: the expression as tiles → substitute a value → the computed result.
- Reuse: this tile system is the base for 7.2/7.3.

**7.2 Addition and Subtraction Equations**
- Visual: a balance-scale / equation-mat — removing or adding the same number of unit tiles from both sides simultaneously visually isolates the variable.
- Control: a single add/remove action that always applies to both sides at once (enforces "do the same thing to both sides" by construction, not just by instruction).
- Tour: balanced mat → remove the same amount from both sides → variable stands alone → check by substitution.
- Reuse: forks 7.1's tile rendering.

**7.3 Multiplication and Division Equations**
- Visual: the same equation mat, but solving means dragging to split the variable-side tiles into equal groups matching the constant side.
- Control: drag-to-split interaction (or a "divide into N groups" control).
- Tour: equal groups on both sides → split → one group = the value of x.
- Reuse: forks 7.2's mat.

**7.4 Problem-Solving Strategy: Draw a Model**
- Visual: a drag-to-build tape-diagram tool — constructing bar segments for each quantity and their stated relationship auto-generates the corresponding equation.
- Control: draggable bar-segment lengths + a "known difference/multiple" input.
- Tour: two quantities, one described relative to the other → build the tape → the equation falls out of the diagram.
- Reuse: none.

### Unit 8 — Geometric Shapes and Transformations (الأشكال الهندسية والتحويلات)

**8.1 Sum of Angles on a Line and Around a Point**
- Visual: a draggable-angle diagram (on a line, or around a point) — dragging one angle live-recalculates the remaining unknown angle to keep the fixed sum.
- Control: angle-value drag/slider on the known angle(s).
- Tour: angles on a line always sum to 180° → drag one, watch the other compensate → repeat around a point at 360°.
- Reuse: base angle-diagram component reused conceptually by 8.4 and later grades.

**8.2 Polygons**
- Visual: a sorting game — shapes dragged into polygon/non-polygon bins, each miss explained (curved side, open shape, crossing sides).
- Control: drag-to-sort.
- Tour: what disqualifies a shape → sort several → regular vs. irregular polygons.
- Reuse: none.

**8.3 Classifying Triangles by Side Length**
- Visual: a draggable-vertex triangle with live side-length readouts, auto-labeling equilateral/isosceles/scalene as vertices move.
- Control: draggable vertices.
- Tour: drag toward equal sides → label flips to isosceles/equilateral → drag to all-different → scalene.
- Reuse: base triangle component reused by 8.4.

**8.4 Classifying Triangles by Angle Measure**
- Visual: the same draggable-vertex triangle, now with live angle readouts, auto-classifying acute/right/obtuse; dragging toward a boundary case shows exactly where classification flips.
- Control: draggable vertices.
- Tour: acute example → drag toward a right angle → cross into obtuse.
- Reuse: forks 8.3's triangle component, swaps the readout from sides to angles.

**8.5 Classifying Quadrilaterals**
- Visual: a draggable-vertex quadrilateral that live-labels every applicable category at once, alongside a nested Venn/hierarchy diagram that highlights which region the current shape falls into.
- Control: draggable vertices.
- Tour: trapezoid → parallelogram → rectangle/rhombus/square, watching the Venn regions light up as the shape specializes.
- Reuse: none (quadrilateral vertex logic is distinct enough from the triangle one to warrant its own build).

**8.6 Translation**
- Visual: a grid-based drag tool — sliding a shape traces its image behind it in real time; side-length and angle readouts confirm nothing changed except position.
- Control: horizontal/vertical slide sliders (or direct drag).
- Tour: original shape → slide it → the image is congruent, nothing rotated or resized.
- Reuse: none.

**8.7 Prism and Pyramid**
- Visual: an animated fold/unfold — a 3D solid unfolds into its flat net and refolds on demand; face/edge/vertex counts tally live as each part is clicked.
- Control: fold↔unfold slider/button + a solid-type selector (prism or pyramid, base shape).
- Tour: the solid → unfold to its net → count F/E/V by clicking → refold.
- Reuse: none — this is the one genuinely 3D build in the whole grade; budget real extra time for it.

### Unit 9 — Measurement (القياس)

**9.1 Units of Mass**
- Visual: a digital scale readout that toggles between single-unit and compound-unit display as a mass slider moves.
- Control: mass slider (grams, spanning into kilograms).
- Tour: grams → the ×1000 jump to kilograms → a compound reading like "2 kg, 84 g."
- Reuse: base for 9.2's unit-ladder idea.

**9.2 Units of Capacity and Length**
- Visual: a unit-ladder slider (km→m→cm→mm, or mL↔L) — dragging up or down the ladder animates the decimal point shifting by the correct power of ten at each rung.
- Control: value slider + ladder-rung position.
- Tour: pick a length → climb the ladder → watch the point shift each rung.
- Reuse: forks 9.1's conversion logic, generalized to a multi-rung ladder instead of one jump.

**9.3 Time**
- Visual: a combined digital/analog clock-and-calendar; dragging an elapsed-time slider live-converts the duration into compound day/hour/minute form.
- Control: elapsed-time slider (or start/end time inputs).
- Tour: raw hours → convert to days + leftover hours → compute an event's end time.
- Reuse: none.

**9.4 Perimeter and Area of a Compound Shape**
- Visual: an interactive compound-shape tool — dragging a dividing line splits the shape into named sub-rectangles with live individual and running-total area labels; a toggle switches to "complete the rectangle and subtract" as an alternate method on the same shape.
- Control: draggable dividing line / notch size.
- Tour: decompose into rectangles, sum → toggle to the subtract method → same answer either way.
- Reuse: none.

### Unit 10 — Statistics and Probability (الإحصاء والاحتمالات)

**10.1 The Mean**
- Visual: draggable value-tiles on a number line; the mean renders as a computed marker that recalculates live as tiles are added, removed, or dragged — a literal balance point.
- Control: add/remove/drag tiles.
- Tour: a few tiles → the mean marker → drag in an outlier and watch it pull the marker toward itself.
- Reuse: this exact "tiles + balance marker" mechanic recurs in Grade 7's mean lesson — build it as a clean, generalizable component now.

**10.2 The Median and Mode**
- Visual: a sortable row of data tiles; clicking "find median" animates pairs crossing off simultaneously from each end toward the middle; a frequency-count overlay highlights the tallest stack(s) as the mode.
- Control: add/edit/remove tiles; a "find median" trigger.
- Tour: sort the tiles → cross off from both ends → the middle is the median → switch to frequency view for the mode.
- Reuse: forks 10.1's tile rendering.

**10.3 The Range**
- Visual: a number-line span tool — dragging endpoints to the data's min and max highlights the range as the interval between them.
- Control: data tiles (drag); range recomputes automatically from current min/max.
- Tour: spread the data out → drag to the extremes → the range is that gap.
- Reuse: forks 10.1/10.2's tile-on-a-line rendering.

**10.4 Chances of Occurrence**
- Visual: a configurable spinner or bag builder — changing the proportion of each outcome/color and running repeated random draws shows, empirically, whether outcomes feel equally or unequally likely.
- Control: proportion sliders per outcome + a "draw" trigger (single or repeated).
- Tour: an equal-slice spinner → an unequal bag → run draws → the pattern matches the proportions.
- Reuse: none — this is the seed for the probability-simulator work that recurs in later grades (per the primitive roadmap's Tier-1 "probability simulator" entry).

---

## Cross-cutting technical notes for this grade specifically

- **Every lesson's equation bar renders through KaTeX now, not styled mono text** — this was decided and verified after this plan was first written (see DESIGN_SYSTEM.md §14.3.5). Correction to an earlier draft of this note: it's not that Grade 5 "doesn't need" KaTeX because nothing here is symbolically complex — KaTeX is now the standard for every equation bar regardless of complexity, because it's simply better typeset than mono text even for `|−4| = 4`-level content, it's already fully self-hosted, and it's free. Grade 5 does get real use out of KaTeX's actual math-rendering power too: Unit 4's fraction lessons (4.1–4.6) and 6.2's fraction↔decimal conversion should render fractions as true stacked `\frac{a}{b}` rather than a fake numerator/denominator layout — this is a case where KaTeX earns its place beyond just "looks nicer."
- **Numeral system, with two now-confirmed hard rules** (see DESIGN_SYSTEM.md §14.4, tested directly, not assumed): (1) the equation bar is Western-digit-only, LTR, always — feeding Eastern Arabic-Indic digits into KaTeX corrupts the whole expression's layout, confirmed by direct test, not just a style choice. (2) Every *other* signed-number UI element in Arabic mode (any lesson showing a negative value outside the equation bar — Unit 1's negative numbers, Unit 6's decimals, Unit 7's equations) needs explicit `direction:ltr; unicode-bidi:isolate` on that specific span, or the minus sign visually reorders to the wrong end of the number — also confirmed by direct test.
- **Open problem, not yet solved, decide before building Unit 6**: Eastern Arabic-Indic ٠ and ٥ render too close to each other to reliably tell apart at UI sizes in both El Messiri and Vazirmatn (confirmed by direct test). Unit 6 (decimals) is the unit most exposed to this — a value like `٠٫٥` genuinely risks being misread. See DESIGN_SYSTEM.md §14.4 for the options under consideration; none has been chosen yet.
- **Decimals (Unit 6) need the digit-mapping helper extended**: the existing `digits(n, lang)` helper in the G6 prototype only handles integers. A `digitsDecimal(value, lang)` helper is needed that also maps `.` → `٫` (Arabic decimal separator, U+066B — confirmed to render correctly, distinct from a comma, in both Arabic fonts) before Unit 6 work starts.
- **Fractions (Unit 4) need a shared fraction-rendering helper** — now specifically a shared KaTeX `\frac{}{}` invocation pattern (not a hand-built numerator/denominator stack), reused across all six Unit 4 lessons plus 6.2. Build this once, early.
- **3D (8.7) is the one lesson that doesn't fit the otherwise-2D visual language of this grade** — flag it for extra design/build time rather than assuming it fits the same effort budget as everything else.
