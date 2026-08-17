# National Curriculum (Jordan) — Implementation Roadmap by Shared Primitive

Re-groups the grade 5–10 topic lists (`grade05-topics.md` … `grade10-topics.md`) not by grade, but by the interactive tool/primitive each lesson needs. Build top-down: each tier reuses the tier above it, so earlier tiers unlock the most lessons per unit of engineering effort. Lesson refs are `Grade.Unit.Lesson`.

---

## Tier 0 — Core primitives (build first)

### 1. Number line (point, distance, comparison, signed hops, shaded intervals)
- G5.1.4 (negative numbers)
- G6.1.1–1.5 (integers, absolute value, compare, add, subtract, multiply/divide via hops)
- G7.1.1, 1.3, 1.4 (rational numbers, comparing, adding/subtracting)
- G8.1.2, 5.1, 5.2 (irrational estimate, writing inequalities, solving by add/sub)
- G9.1.1, 1.2 (sets/intervals, compound inequalities)

### 2. Place value chart
- G5.1.1 (millions), G5.6.1 (thousandths)

### 3. Fraction / area models (bars, pies, grids)
- G5.4.1–4.6 (mixed numbers → dividing fractions), G5.6.2, G5.6.8 (decimal↔fraction, percent grid)
- G6.2.1–2.4 (fraction/mixed number ops), G6.6.3–6.5 (percent conversions)
- G7.1.2, 1.5 (decimal form, multiply/divide via area model)

### 4. Coordinate plane (plotting, quadrants — pre-transformation)
- G5.5.2 (Q1), G6.4.1 (four quadrants), G9.4.1 (distance/midpoint)

### 5. Bar / line / pie graph builder
- G5.5.3, 5.4 (line graph, double bar)
- G6.8.2–8.4 (frequency table, class intervals, pie chart)
- G8.9.2 (choosing representation)

### 6. Basic 2D shape classifier
- G5.8.2–8.5 (polygons, triangle types, quadrilateral hierarchy)

### 7. Algebra substitution / expression evaluator
- G5.7.1, G6.3.1, G6.5.3–5.4, G7.2.2, 2.3

---

## Tier 1 — Primitive extensions (reuse Tier 0, one added layer of logic)

### 8. Whole-number/decimal operation animators (regroup + estimate-first)
- G5.1.3, 1.5, 2.1–2.5, 6.4–6.7
- G6.3.1–3.2

### 9. Divisibility / factor tools (rules, prime factorization, GCF/LCM, square/cube root grid)
- G5.3.1–3.5, G6.5.2

### 10. Coordinate transformation engine (translate/reflect/rotate/dilate — one parameterized tool)
- G5.8.6 (translation), G6.4.2–4.3 (translation, reflection), G7.4.5 (rotation), G8.7.6 (dilation)

### 11. Equation balance-scale solver (one-step → multi-step → inequalities → systems)
- G5.7.2–7.3, G6.5.5, G7.2.4–2.6, 3.1
- G8.5.2–5.4 (inequalities), 6.1–6.3 (systems: graph/substitute/eliminate)
- G9.1.3 (feasible region)

### 12. Ratio / proportion / percent tools (mixing jars, scale drawing, variation)
- G6.6.1–6.2, G7.5.1–5.7, G7.6.2, G8.1.5

### 13. Area/perimeter derivation animator (shear, duplicate-rotate proofs)
- G5.9.4, G6.7.2–7.4

### 14. Volume/surface-area + net-unfold tool
- G5.8.7, G6.7.5, G7.7.1–7.6, G8.8.3 (sphere)

### 15. Sequence / pattern builder (visual pattern ↔ terms ↔ general formula)
- G6.5.6, G7.3.3, G10.5.5 (quadratic/cubic via difference table)

### 16. Statistics dashboard (mean → variance → quartiles → grouped/histogram → scatter)
- G5.10.1–10.3, G6.8.1, G7.8.1–8.3, G8.9.1, G9.8.1–8.3, G10.8.1–8.3

### 17. Probability simulator (equal/unequal → experimental → compound/tree → Venn → conditional)
- G5.10.4, G6.8.5, G7.8.4–8.5, G8.9.3–9.4, G9.8.4–8.5, G10.8.4–8.5

### 18. Function grapher (slider-driven: linear → quadratic → polynomial → rational → composition/inverse)
- G8.3.1–3.5 (linear forms)
- G9.2.1–2.4 (functions, quadratic + transforms), 3.1–3.4 (solving quadratics 4 ways), 6.1–6.3 (exponents/radicals), 7.1–7.3 (rational expressions/equations)
- G10.1.1–1.3 (higher-degree & systems w/ quadratics), 5.1–5.4 (polynomial, rational, composition, inverse)

### 19. Factoring workbench (GCF → trinomial → special cases, area-model based)
- G8.2.1–2.4

---

## Tier 2 — Domain-specific suites (larger, still 2D, mostly self-contained)

### 20. Angle relationship explorer (adjacent/vertical/supp → transversal → triangle sum → polygon n-gon)
- G5.8.1, G6.7.1, G7.4.1–4.4

### 21. Congruence & similarity toolkit (matching-overlay, ratios)
- G7.6.1, 6.3, 6.5

### 22. Right-triangle trig tool (static ratios, elevation/depression)
- G8.1.3 (Pythagorean theorem), G9.5.4–5.5

### 23. Triangle special-segments tool (midsegment, bisectors, medians/altitudes, concurrency)
- G9.5.1–5.3

---

## Tier 3 — Standalone hard builds (least reuse; build last, one at a time)

### 24. Compass-and-straightedge construction simulator
- G6.4.4–4.5

### 25. Formal proof system (two-column / flow proof builder)
- G8.4.1–4.3 (congruence criteria), G8.7.1–7.4 (parallelogram proofs)

### 26. 3D projection & cross-section tool (isometric, orthographic, slicing plane, solids of revolution)
- G8.8.1–8.2, G10.4.5 (3D trig)

### 27. Circle theorem suite (chords/tangents, arcs/sectors, inscribed angles, cyclic quads, circle equation)
- G10.2.1–2.4

### 28. Unit-circle trig engine (standard position, reference angles, periodic graphing, trig equations)
- G10.3.1–3.4

### 29. Oblique triangle solver (law of sines w/ ambiguous case, law of cosines, sine-area, bearings)
- G10.4.1–4.4

### 30. Vector tool (2D vectors, add/subtract, dot product)
- G10.7.1–7.3

### 31. Calculus primitives (secant→tangent limit, derivative/power rule, critical points)
- G10.6.1–6.3 — **blocked on async "run" mode**, same blocker already noted for Syntropy's Calculus engine.

---

## Why this order

Tiers 0–1 alone cover the large majority of grades 5–7 and a meaningful slice of 8–10, because the same handful of manipulables (number line, coordinate plane, area model, graph builder, balance-scale equation solver) get reused with more parameters each grade rather than rebuilt. Tier 2 is where content stops being purely "manipulate a diagram" and starts requiring domain logic (angle chains, similarity ratios). Tier 3 is where each item is a one-off engineering project with little carryover — proofs, 3D projection, circle theorems, and full trig/vectors/calculus don't reduce to any earlier primitive, so they're correctly saved for last regardless of which grade they happen to sit in.
