# Backlog — Statistics Engine, remaining methods

Everything from the original batch (descriptive statistics, sampling/CLT, confidence
intervals, discrete/continuous distributions, two-sample/paired t-tests, chi-square tests,
multiple regression, probability & combinatorics, ANOVA F-test) has shipped — 12 pages live
under `engines/statistics/methods/`, all covered by `tests/verify-statistics.js` (356/356
passing as of this cleanup pass). The completed plan files that built them are archived at
`archive/docs/agent-plans/statistics/`.

Two items from the original roadmap were never built. Both are low-priority per
`CURRICULUM_ROADMAP.md`'s own tiering, not missed — just never reached:

1. **§4B.6 Point Estimation** (Method of Moments, Maximum Likelihood) — P2, no plan file
   written yet.
2. **§4D.14 Wilcoxon / Kruskal-Wallis / Sign Tests** — distribution-free counterparts to the
   t-test/ANOVA family, P3, "usually one of the last chapters covered, if covered at all"
   per the roadmap's own reasoning. Lowest priority in the whole engine.

Same rule as before: don't hand either to a build agent without first writing a detailed
plan file in this directory's style (exact function signatures, pre-verified `node -e`
numbers cross-checked against a textbook table value, exact file paths, plot design, card
copy) — see `00-SHARED-CONVENTIONS.md`.
