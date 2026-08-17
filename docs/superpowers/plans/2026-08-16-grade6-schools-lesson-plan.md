# Grade 6 — Schools Lesson-Build Plan

Status: ready to implement. Same pattern as Grade 5 (`docs/superpowers/plans/2026-08-14-grade5-schools-lesson-plan.md`, all 52 lessons shipped in `schools/grade-5/`) — page shell, bilingual system, KaTeX equation bar, tour engine, all settled in `DESIGN_SYSTEM.md` §14 and `schools/assets/{css,js}/lesson-shell.*`. This document doesn't re-decide any of that; it applies it to Grade 6's 39 lessons.

Source curriculum: `docs/curriculum-references/topics/grade06-topics.md` (8 units, 2 semesters, 39 lessons). That file already carries a "Visualization/interaction potential" idea per lesson — this plan turns each into a concrete Visual/Control/Tour/Reuse spec and sequences the build for reuse, same as the Grade 5 plan did.

One lesson (1.1) already has a hand-built reference implementation: `prototypes/lesson-g6-1-1-integers-absolute-value.html` — it's the file DESIGN_SYSTEM.md §14 was extracted *from*. Porting it into `schools/grade-6/1-1-...html` (drop the typography-lab panels, wire through `lesson-shell.js/css` like every Grade 5 page) is lesson 1.1's whole build.

---

## Build order recommendation

1. **1.1 (diver/ruler number line)** — port the existing prototype. Base for 1.2 (same ruler/scale grammar, two markers) and the "hop" tool in 1.3–1.5.
2. **1.2 → 1.3 → 1.4 → 1.5** — finish Unit 1 in curriculum order; each forks the previous lesson's number-line engine.
3. **4.1 (four-quadrant coordinate plane)** — extends Grade 5 5.2's first-quadrant grid; base for 4.2/4.3.
4. Everything else in curriculum order — the per-lesson Reuse notes below flag the real fork points (mostly within-unit, a few back to specific Grade 5 lessons).

---

## Semester 1

### Unit 1 — Integers and Operations (الأعداد الصحيحة والعمليات عليها)

**1.1 Integers and Absolute Value**
- Visual: sea-level diver scene — vertical ruler, draggable diver marker, mirrored "opposite" ghost marker, distance bracket from zero to the diver.
- Control: depth/height slider (−10..10), mirrors the drag.
- Tour: sea level = zero → drag to read a position → the opposite marker → the absolute-value bracket.
- Reuse: none — this *is* the source. Already built in `prototypes/lesson-g6-1-1-integers-absolute-value.html`; port directly.

**1.2 Comparing and Ordering Integers**
- Visual: the same vertical ruler, now with two draggable depth markers side by side; the one further down auto-labels "deeper" (more negative), live.
- Control: two depth sliders.
- Tour: two positions on the ruler → whichever is lower is smaller → negatives closer to zero are greater than negatives further away.
- Reuse: direct fork of 1.1's ruler/scale rendering, drop the ghost/bracket, add a second marker.

**1.3 Adding Integers**
- Visual: number-line hop animator — two colored arrows chain tip-to-tail from zero; same-sign hops stack in one direction, opposite-sign hops visually cancel before landing on the sum.
- Control: two integer inputs/sliders (the addends).
- Tour: first hop → second hop, tip-to-tail → same-sign reinforcing vs. opposite-sign canceling → the landing point is the sum.
- Reuse: forks 1.1's ruler; new hop-arrow grammar, reused by 1.4/1.5.

**1.4 Subtracting Integers**
- Visual: the same hop tool — "subtracting b" animates as a 180° flip of the second arrow into "adding −b," making the add-the-opposite rule visible as a mechanism, not just a rule.
- Control: two integer inputs (minuend, subtrahend).
- Tour: subtraction as written → watch the arrow flip → it's now an addition problem → land on the difference.
- Reuse: direct fork of 1.3's hop engine, adds the flip animation.

**1.5 Multiplying and Dividing Integers**
- Visual: repeated-hop animator — identical hops of the same signed size stack one after another to build the product; a sign-rule "combination lock" lets the student pick +/− for two factors and predict the result's sign before it's revealed.
- Control: factor inputs (value + hop count) for multiplication; a divide toggle for the inverse view.
- Tour: repeated hops build the product → same-sign pairs → different-sign pairs → the combination-lock quiz.
- Reuse: forks 1.3's hop engine (repeated instead of two single hops).

### Unit 2 — Fractions and Operations (الكسور والعمليات عليها)

**2.1 Adding and Subtracting Fractions**
- Visual: dual fraction-bar model — both bars re-partition live to a shared common-denominator grid (any two denominators, not just multiples) before shaded regions combine/subtract.
- Control: two fraction inputs (numerator/denominator each) + add/subtract toggle.
- Tour: unlike denominators → both re-partition to the LCM grid → combine or remove → simplify.
- Reuse: generalizes Grade 5's 4.3/4.4 pie-resize idea to a bar model that handles any denominator pair; new build, same family.

**2.2 Adding and Subtracting Mixed Numbers**
- Visual: stacked whole-circle + fraction-bar model; subtracting a larger fractional part animates borrowing a whole as extra fraction parts before subtracting.
- Control: two mixed-number inputs (whole + fraction each) + add/subtract toggle.
- Tour: common denominator on the fraction parts → add/subtract wholes and fractions separately → borrow-a-whole case, animated.
- Reuse: forks 2.1's bar-partition logic, adds the whole-circle stack and regroup animation.

**2.3 Multiplying Fractions and Mixed Numbers**
- Visual: overlapping-rectangle area model (rows × columns), generalized to mixed numbers by splitting the grid into whole-part and fraction-part blocks.
- Control: two inputs (fraction or mixed number each).
- Tour: shade rows for one factor → shade columns for the other → overlap is the product → mixed numbers split the grid into whole/fraction blocks first.
- Reuse: direct extension of Grade 5's 4.5 area model to mixed numbers.

**2.4 Dividing Fractions and Mixed Numbers**
- Visual: "how many fit" tiling animation extended to mixed-number divisors, with a toggle to the invert-and-multiply shortcut as an equivalent fast path.
- Control: two inputs (fraction or mixed number) + shortcut toggle.
- Tour: how many of the divisor fit in the dividend → count copies including partials → the shortcut gives the same answer.
- Reuse: direct extension of Grade 5's 4.6 tiling tool to mixed numbers.

### Unit 3 — Operations on Decimals (العمليات على الأعداد العشرية)

**3.1 Multiplying Decimals**
- Visual: multiply the digit strings as whole numbers, then a live decimal point "counts in" from the right by the combined decimal-place total of both factors.
- Control: two decimal inputs.
- Tour: strip the points, multiply as whole numbers → count total decimal places → point counts in from the right.
- Reuse: none — new grammar, but pairs conceptually with Grade 5's 6.7 (point-jump animation).

**3.2 Dividing Decimals**
- Visual: both dividend and divisor's decimal points shift simultaneously (animated) to clear the divisor to a whole number, then the standard long-division staircase runs.
- Control: dividend/divisor inputs; step button to advance the staircase.
- Tour: shift both points together → divisor is now whole → staircase, step by step → read the quotient.
- Reuse: forks Grade 5's 2.5 long-division staircase, adds the point-shift step first.

**3.3 Solving Problems with Different Measurement Units**
- Visual: a unit-conversion "funnel" — dragging mismatched-unit quantities into a shared-unit workspace auto-converts them before the calculation proceeds.
- Control: quantity inputs per mismatched unit; target-unit selector.
- Tour: two quantities, different units → drag into the funnel → both converted to one unit → now compute normally.
- Reuse: none.

**3.4 Problem-Solving Strategy: Solve a Simpler Problem**
- Visual: side-by-side "simplified vs. original" problem pair — adjusting the simplified numbers' roundness live-previews how the solving method transfers to the real problem.
- Control: roundness slider on the simplified version's numbers.
- Tour: the real (decimal-heavy) problem → a simplified rounder version → solve the simple one → the same method, checked by estimation, applies to the original.
- Reuse: none.

### Unit 4 — Geometric Transformations and Constructions (التحويلات والإنشاءات الهندسية)

**4.1 The Coordinate Plane**
- Visual: a full four-quadrant grid — click anywhere to drop a point with live coordinate and quadrant-name readout (quadrants numbered counterclockwise from top-right, per the textbook's own convention).
- Control: click/drag to place or move a point; a quadrant-highlight toggle.
- Tour: origin and both axes → all four quadrants, counterclockwise → plot a point → an axis case (a coordinate is zero).
- Reuse: extends Grade 5's 5.2 first-quadrant grid to all four quadrants; base for 4.2/4.3.

**4.2 Translation in the Coordinate Plane**
- Visual: a grid-based drag tool with separate horizontal/vertical sliders (a, b) that live-translates a shape and updates every vertex's new coordinate simultaneously.
- Control: horizontal slider (a) + vertical slider (b).
- Tour: original shape and coordinates → slide by (a, b) → each vertex's coordinate updates the same way → congruent image, nothing rotated.
- Reuse: forks 4.1's grid.

**4.3 Reflection in the Coordinate Plane**
- Visual: a draggable mirror-line tool (x-axis or y-axis) — dragging a shape's vertex shows its reflected image update in real time on the opposite side, with coordinate labels confirming the sign-flip rule.
- Control: mirror-axis selector (x-axis / y-axis) + vertex drag.
- Tour: pick the mirror line → drag a vertex → its image mirrors in real time → the coordinate sign that flips.
- Reuse: forks 4.1's grid and 4.2's vertex-coordinate readout.

**4.4 Relationship Between Diameter and Radius**
- Visual: a draggable point on a circle's edge with a live radius line from the center, plus a diameter line through the center, showing the 2:1 length relationship as the circle resizes.
- Control: circle-size slider (or drag the edge point to resize).
- Tour: center and radius → drag to resize → diameter line spans through the center → diameter is always 2× the radius.
- Reuse: none.

**4.5 Geometric Constructions**
- Visual: a simulated compass-and-straightedge tool — dragging the compass width and swinging arcs from two points shows their intersection defining a perpendicular bisector live; a mode switch covers a second construction (angle bisection or copying a segment).
- Control: compass-width drag + arc-swing trigger per center point; construction-type selector.
- Tour: two points, a segment → swing an arc from each end → the two intersections → the line through them is the perpendicular bisector.
- Reuse: none — budget real extra time here, closest thing Grade 6 has to Grade 5's 8.7 (the one genuinely bespoke-mechanics build in the set).

---

## Semester 2

### Unit 5 — Algebraic Expressions and Equations (المقادير الجبرية والمعادلات)

**5.1 Powers and Exponents**
- Visual: a "stack builder" — dragging repeated copies of a factor into a stack auto-generates exponential notation and computes the standard-form value live.
- Control: base input + a stack-height (exponent) stepper.
- Tour: one copy → stack a second → notation forms as base^exponent → read it aloud → the computed value.
- Reuse: none.

**5.2 Square Root and Cube Root**
- Visual: dual model — an n×n tile grid for square roots, an n×n×n stacked-cube model for cube roots; entering the area/volume highlights the matching root.
- Control: side-length slider (forward) or area/volume input (reverse, per mode) + a square/cube mode toggle.
- Tour: build a square, count tiles = n² → reverse: given the area, find n → same idea in 3D for cube root.
- Reuse: extends Grade 5's 3.5 square/root grid, adds a cube-stack mode.

**5.3 Order of Operations**
- Visual: a step-through expression evaluator that highlights which sub-expression resolves at each stage (parentheses → exponents/roots → ×÷ left-to-right → +− left-to-right), letting the student predict the next step before it's revealed.
- Control: step button (advance one resolution at a time) + an expression picker/input.
- Tour: parentheses first → exponents and roots → multiply/divide left to right → add/subtract left to right.
- Reuse: none.

**5.4 Algebraic Properties**
- Visual: a drag-and-regroup tile interface — reordering or regrouping addition/multiplication terms visually shows the total is unchanged; a separate "unfold" animation splits a(b+c) into ab+ac.
- Control: drag-to-reorder tiles + a distribute trigger.
- Tour: reorder terms, total unchanged (commutative) → regroup, still unchanged (associative) → unfold a(b+c) into ab+ac (distributive).
- Reuse: conceptually related to Grade 5's 7.1 tile system; new build (different operation, not evaluation).

**5.5 Equations**
- Visual: the balance-scale / equation-mat, extended to two-step equations — each inverse-operation move applies to both sides simultaneously, with a live substitution check at the end.
- Control: one add/remove or split action per step, always applied to both sides at once.
- Tour: balanced two-step equation → undo the +/− term first → undo the ×/÷ → variable isolated → check by substitution.
- Reuse: direct fork of Grade 5's 7.2/7.3 equation mat, extended past one step.

**5.6 Sequences**
- Visual: an interactive growing dot/shape pattern synced to a term list — a "next term" control extends both the visual pattern and the numeric sequence together.
- Control: "next term" stepper.
- Tour: the pattern so far → what's added each time (the rule) → extend the pattern → the matching term list.
- Reuse: none.

### Unit 6 — Ratio and Percentage (النسبة والنسبة المئوية)

**6.1 Ratio**
- Visual: a mixing-jar visual — dragging concentrate/water amounts live-displays and simplifies the resulting ratio in all three notations (a:b, a/b, "a to b").
- Control: two amount sliders (concentrate, water).
- Tour: mix two amounts → the ratio, unsimplified → divide by the GCF → simplified, same three notations.
- Reuse: base for 6.2.

**6.2 Equivalent Ratios**
- Visual: a side-by-side color-mixing simulator — two ratio recipes render as actual mixed colors, visually confirming or refuting equivalence.
- Control: two independent recipe sliders (one per jar).
- Tour: two recipes → mixed colors, compare → scale one recipe by a factor → colors match → that's what equivalent means.
- Reuse: forks 6.1's jar-mixing render.

**6.3 Percentage and Common Fractions**
- Visual: a 100-cell grid — click cells to shade (or drag a percentage slider) that shades to match; fraction/decimal/percent readouts update together live.
- Control: click-to-shade grid or an equivalent slider.
- Tour: shade cells → read as a fraction → simplify → read as a percent.
- Reuse: direct fork of Grade 5's 6.8 percentage grid.

**6.4 Percentage and Decimal Fractions**
- Visual: an animated decimal-point shift synced with a percentage readout — both representations update together as a slider changes.
- Control: value slider (percent or decimal, toggle which drives it).
- Tour: a percent → shift the point two places left → the decimal → reverse: shift right, back to percent.
- Reuse: forks Grade 5's 6.7 point-jump animator.

**6.5 Percentage of a Number**
- Visual: a price-tag calculator — dragging a discount-percentage slider live-recomputes and displays the discount amount and final price.
- Control: discount-percentage slider + base-price input.
- Tour: original price → pick a discount % → the fraction/decimal it converts to → the discount amount → final price.
- Reuse: forks 6.3/6.4's percent-conversion logic.

### Unit 7 — Geometry and Measurement (الهندسة والقياس)

**7.1 Quadrilaterals**
- Visual: a draggable-vertex quadrilateral with live angle readouts that always sum to 360° — dragging one angle visibly forces the others to compensate.
- Control: draggable vertices.
- Tour: four angles, sum 360° → drag one bigger → the others shrink to compensate → solve for one unknown given three.
- Reuse: direct fork of Grade 5's 8.5 draggable-vertex quadrilateral, angle readouts instead of category labels.

**7.2 Area of a Parallelogram**
- Visual: a shear-transform animation — the parallelogram visibly "straightens" into a rectangle of the same base and height, justifying why the area formula matches a rectangle's.
- Control: shear-angle slider (0 = rectangle, dragging increases the slant) + base/height inputs.
- Tour: a slanted parallelogram → shear it flat → now it's a rectangle, same base and height → area = base × height, unchanged by the shear.
- Reuse: base for 7.3/7.4's "combine into a known shape" grammar.

**7.3 Area of a Triangle**
- Visual: "duplicate and rotate" — a copy of the triangle rotates 180° to combine with the original into a parallelogram, visually deriving the ½ factor.
- Control: rotate-and-combine trigger + base/height inputs.
- Tour: one triangle → a congruent copy appears → rotate it 180° → together they form a parallelogram → its area, halved, is the triangle's.
- Reuse: forks Grade 5's 8.4 triangle component + 7.2's combine grammar.

**7.4 Area of a Trapezoid**
- Visual: the same duplicate-and-rotate idea — two congruent trapezoids combine (one rotated 180°) into a parallelogram with base (b1+b2), deriving the ½ factor the same way as the triangle lesson.
- Control: rotate-and-combine trigger + b1/b2/height inputs.
- Tour: one trapezoid → a rotated copy → together, a parallelogram with base b1+b2 → area = ½(b1+b2)×h.
- Reuse: direct fork of 7.3's combine animation, trapezoid geometry instead of triangle.

**7.5 Volume of a Rectangular Prism and Its Surface Area**
- Visual: an interactive box that fills with visible unit cubes as length/width/height sliders change, synced to a net-unfold view showing all six faces summing to the surface area.
- Control: length/width/height sliders + a fold↔unfold toggle.
- Tour: empty box → fill with unit cubes, count = volume → unfold to the net → six faces → sum their areas = surface area.
- Reuse: forks Grade 5's 8.7 fold/unfold 3D engine, adds the cube-fill volume view.

### Unit 8 — Statistics and Probability (الإحصاء والاحتمالات)

**8.1 Collecting Data**
- Visual: a sort activity — sample data points (a count, a color, a measured length) drag into classification bins (numerical/categorical, then discrete/continuous) with instant feedback on which property decided the answer.
- Control: drag-to-sort.
- Tour: numeric vs. categorical → within numeric, discrete vs. continuous → sort a full set, one at a time.
- Reuse: forks Grade 5's 5.1 sort-into-bins pattern.

**8.2 Frequency Tables**
- Visual: a live tally tool — dragging raw data values into a table auto-increments frequency counts and builds a matching bar chart alongside.
- Control: drag raw values in one at a time (or a "add next value" stepper).
- Tour: a raw data list → tally one value → the count increments → the table becomes a bar chart.
- Reuse: base for 8.3; bar rendering can reuse Grade 5's 5.4 bar-chart component.

**8.3 Frequency Tables and Charts with Class Intervals**
- Visual: an interactive histogram-builder — dragging the class-interval width live-regroups raw data points and redraws the frequency bars, showing how interval choice affects the distribution's shape.
- Control: interval-width slider.
- Tour: too many distinct values to tally one by one → group into intervals → widen/narrow the interval → the histogram's shape changes.
- Reuse: forks 8.2's tally/bar engine, groups by interval instead of exact value.

**8.4 Circle Sectors (Pie Charts)**
- Visual: an interactive pie chart — dragging a sector's boundary live-updates its angle, fraction, and percentage labels; a toggle compares the same data as a bar graph.
- Control: drag a sector boundary, or edit a category's value directly + pie/bar toggle.
- Tour: whole circle = 360°/100%/1 → one category's sector → drag it, watch angle/fraction/percent update together → toggle to bar graph, compare when each is more useful.
- Reuse: the bar-graph toggle reuses Grade 5's 5.4 bar component.

**8.5 Probabilities**
- Visual: a draggable marker on a 0–1 probability scale with labeled zones (impossible/unlikely/equally likely/likely/certain); selecting a real-world event (colored ball, die roll) auto-places the marker and explains why.
- Control: event picker (or direct drag on the scale).
- Tour: 0 = impossible, 1 = certain → the labeled zones between → pick an event → the marker lands and the reasoning shows.
- Reuse: extends Grade 5's 10.4 probability groundwork into a quantified 0–1 scale.

---

## Cross-cutting technical notes (carried over from Grade 5, still apply)

- Every equation bar renders through KaTeX (`renderEquation()` in `lesson-shell.js`), Western digits, `direction:ltr; unicode-bidi:isolate`, always — see DESIGN_SYSTEM.md §14.3.5.
- Every other signed-number or decimal UI element in Arabic mode needs `direction:ltr; unicode-bidi:isolate` on that specific span — checklist item per new numeric element, not a one-time fix (§14.4).
- Decimal-bearing values use `digitsDecimal()` (Western digits in both languages); whole numbers use `digits()`/`groupInt()` (Eastern Arabic-Indic in Arabic mode) — Unit 3 (decimals) and Unit 6 (percentage/ratio, which involves decimals) are this grade's heaviest users of the decimal path.
- Fractions (Unit 2, plus 2.3/2.4/6.3) use the shared KaTeX `\frac{}{}` pattern from Grade 5, not a hand-built stack.
- New this grade: negative-number handling in Unit 1 is heavier than Grade 5's single lesson (1.4) — the hop-arrow grammar (1.3–1.5) is new and shared only within this unit, budget it as real design time, not a quick reuse.
