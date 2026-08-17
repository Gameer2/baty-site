# Number-Theory Engine — Symbolic Redesign (3 Residents) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Read the design spec
> first: `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md`. This plan
> **does not depend on the async foundation** — these 3 methods are synchronous BigInt, already
> registered, and ship the Symbolic archetype first (exactly as Matrix shipped on synchronous
  linalg cores before async existed). Depends only on the **Symbolic renderer + `expression`
  output kind** from the Foundation plan (Tasks 1 + 4).

**Goal:** Stop under-rendering three number-theory nodes. Today each computes the full symbolic
form in its core and then **discards** it for numeric summaries (`factorCount`, `a0`,
`periodLength`, `solutions[0]`). Surface the form the core already returns as an `expression`
output → Symbolic archetype. No new math; no async.

**Architecture:** Each `compute()` already calls `NumberTheory.<core>` which returns the full
form. We add an `expression` output (first, so `archetypeFromSpec` picks Symbolic) carrying an
`ExpressionOutput`, keep the existing scalar outputs, and set `relation: "factorization"`.
`SymbolicNode` (Foundation) renders it.

**Tech Stack:** TS, Vitest. Run from `canvas/`: `yarn test:app --run <files>`, `yarn
test:typecheck`, `yarn test:code`, `yarn fix:code`.

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md` (§2
Symbolic, §5 number-theory rows).

## Global Constraints
- No new math: only surface what `NumberTheory.<core>` already returns (`factorizeFull`,
  `continuedFractionSqrt`, `solveLinearCongruence`).
- `expression` output declared **first** so `archetypeFromSpec` → `"symbolic"`.
- `relation: "factorization"` on all three (number-theory analog of LU's matrix factorization).
- Keep existing scalar outputs (don't break callers/tests that read them).
- Engine accent: number-theory #a3623c.

---

## File Structure
- **Modify:** `syntropy/portSpecs/primeFactorisation.ts`, `continuedFractions.ts`,
  `linearCongruences.ts` — add `expression` first output + `relation:"factorization"`; keep
  scalars; build the `ExpressionOutput` from the core's existing return.
- **Modify:** `tests/primeFactorisation*.test.ts`, `tests/continuedFractions*.test.ts`,
  `tests/linearCongruences*.test.ts` (or `*PortSpec.test.ts`) — assert the expression output
  shape + that the scalars still match.
- **No dispatch change** — Foundation already routes `expression` → `SymbolicNode`.

---

## Task 1: prime-factorisation → Symbolic

**Files:** Modify `portSpecs/primeFactorisation.ts`. Test: `tests/primeFactorisationPortSpec.test.ts`.

**Core contract (verified):** `NumberTheory.factorizeFull(n)` returns `{ ok, reason?, factors:
{p: bigint, exponent: number}[] }`. Currently the spec keeps `factorCount = factors.length`
and `smallestFactor = factors[0].p`. The full factorization is discarded.

- [ ] **Step 1: Failing test.** Assert `compute({n:12}).outputs.expression` is an
  `ExpressionOutput` with `display` rendering `12 = 2² · 3` (or `12 = 2^2 · 3`) and
  `structured.kind === "factorization"` with `factors: [{base:"2",exponent:2},
  {base:"3",exponent:1}]`. Assert `factorCount`/`smallestFactor` still present.
- [ ] **Step 2: Run — FAIL** (no `expression` output).
- [ ] **Step 3: Edit spec.** Add outputs `[{ key:"factorization", label:"factorization",
  kind:"expression" }, <existing number outputs>]`. In `compute()`, after
  `const r = NumberTheory.factorizeFull(n)`, build:
  ```ts
  const factors = r.factors.map((f) => ({ base: bigIntToDisplay(f.p), exponent: f.exponent }));
  const factorization: ExpressionOutput = {
    display: `${bigIntToDisplay(n)} = ` + factors
      .map((f) => (f.exponent === 1 ? f.base : `${f.base}^${f.exponent}`))
      .join(" · "),
    structured: { kind: "factorization", factors },
  };
  ```
  Return `{ factorization, factorCount: r.factors.length, smallestFactor: ... }`. Set
  `relation: "factorization"` on the spec.
- [ ] **Step 4: Run — PASS.** Typecheck + lint.
- [ ] **Step 5: Commit.** `feat(syntropy): prime-factorisation → Symbolic (surface full factorization)`

## Task 2: continued-fractions → Symbolic

**Files:** Modify `portSpecs/continuedFractions.ts`. Test:
`tests/continuedFractionsPortSpec.test.ts`.

**Core contract (verified):** `NumberTheory.continuedFractionSqrt(D)` returns `{ a0: bigint,
period: bigint[], perfectSquare: boolean }`. Currently keeps `a0`, `periodLength =
period.length`, `perfectSquare`. The full expansion is discarded.

- [ ] **Step 1: Failing test.** For `D=2` (period `[2]`, a0=1): assert
  `outputs.expression.display` is `[1; 2, 2, ...]` form with the period repeated (verify the
  page's own display convention by reading `continued-fractions` page JS — match it exactly);
  `structured.kind === "continuedFraction"` with `a0:"1"`, `period:["2"]`. Assert
  `periodLength`/`perfectSquare` unchanged.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Edit spec.** Add `expression` first output (`key:"expansion"`). Build:
  ```ts
  const expansion: ExpressionOutput = {
    display: `[${bigIntToDisplay(r.a0)}; ${r.period.map((q) => bigIntToDisplay(q)).join(", ")}]`,
    structured: { kind: "continuedFraction", a0: bigIntToDisplay(r.a0),
      period: r.period.map((q) => bigIntToDisplay(q)) },
  };
  ```
  Keep `a0`/`periodLength`/`perfectSquare`. Set `relation: "factorization"`.
- [ ] **Step 4: Run — PASS.** Typecheck + lint.
- [ ] **Step 5: Commit.** `feat(syntropy): continued-fractions → Symbolic (surface full expansion)`

## Task 3: linear-congruences → Symbolic

**Files:** Modify `portSpecs/linearCongruences.ts`. Test:
`tests/linearCongruencesPortSpec.test.ts`.

**Core contract (verified):** `NumberTheory.solveLinearCongruence(a, b, n)` returns
`{ solvable, count, solutions: bigint[] }`. Currently keeps `count` and `solutions[0]`
(`x0`). The full solution set is discarded.

- [ ] **Step 1: Failing test.** For `a=2,b=1,n=6` (solutions `2, 5` mod 6, count 2): assert
  `outputs.expression.display` is `x ≡ 2, 5 (mod 6)` and `structured.kind ===
  "congruenceSet"` with `modulus:"6"`, `solutions:["2","5"]`. Assert `count`/`x0` unchanged.
  For an unsolvable case, assert `expression` is omitted and `solvable:0` (per existing error
  path).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Edit spec.** Add `expression` first output (`key:"solutionSet"`). On the
  solvable branch build:
  ```ts
  const solutionSet: ExpressionOutput = {
    display: `x ≡ ${r.solutions.map((s) => bigIntToDisplay(s)).join(", ")} (mod ${bigIntToDisplay(n)})`,
    structured: { kind: "congruenceSet", modulus: bigIntToDisplay(n),
      solutions: r.solutions.map((s) => bigIntToDisplay(s)) },
  };
  ```
  Return `{ solutionSet, count, x0: bigIntToDisplay(r.solutions[0]) }`. Set
  `relation: "factorization"`.
- [ ] **Step 4: Run — PASS.** Typecheck + lint.
- [ ] **Step 5: Commit.** `feat(syntropy): linear-congruences → Symbolic (surface full solution set)`

## Task 4: Contract + dispatch + full-suite gate

- [ ] **Step 1:** `tests/portSpecsContract.test.ts` / `portSpecsOutputShape.test.ts` — confirm
  the 3 specs now report `archetypeFromSpec === "symbolic"` and `expression` first. (If the
  contract test asserts archetype counts, update expected numbers.)
- [ ] **Step 2:** Add a dispatch-routing assertion in `dispatch.test.tsx` that a spec shaped
  like prime-factorisation routes to `SymbolicNode` (use a self-contained fixture, decoupled
  from the real spec, as the existing pattern does).
- [ ] **Step 3:** `yarn test:app --run` full suite green; typecheck + lint clean.
- [ ] **Step 4: Commit.** `test(syntropy): number-theory Symbolic residents green on full suite`

## Self-Review
- **Spec coverage:** spec §5 number-theory rows (3 methods, all Symbolic) → Tasks 1–3; contract
  → Task 4.
- **Placeholders:** none. Each step names the core function, the discarded field, the exact
  `ExpressionOutput` shape, and the test assertions.
- **Type consistency:** `ExpressionOutput` + `structured` union (`factorization`/
  `continuedFraction`/`congruenceSet`) defined in Foundation Task 1, produced here identically.