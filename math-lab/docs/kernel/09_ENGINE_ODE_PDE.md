# 09 — ODE **and PDE** Engine: Symbolic Requirements

**Textbook basis:** Boyce & DiPrima, *Elementary Differential Equations and Boundary Value
Problems*. Ch. 1–9 are ODE; Ch. 10–11 (Fourier, PDE) are first-class scope, not a stretch goal.
**Current state:** `ode-symbolic.js`, 1,834 lines, 72 CAS calls, 5 method pages, `verify-ode.js`.

---

## 1. The defining fact

**Nerdamer has no `dsolve` at all.**

```
  nerdamer("dsolve(diff(y,x)-y,y,x)")   →   (-y, y, x, dsolve)
```

It parsed `dsolve` as an unknown function and returned a tuple. There is no ODE solver underneath
this engine.

**Consequence:** `ode-symbolic.js` is *already* a hand-built solver standing on `diff` and
`integrate`. That is the correct architecture, and it is proof the layering approach works. Phase 6
**formalises** it into the kernel — it does not restart it.

A second gap matters here: **no symbolic summation** (`sum(k^2,k,1,n)` returns unevaluated). That
blocks closed-form Fourier coefficients and series-solution recurrences.

---

## 2. Coverage status

Statuses below reflect `CURRICULUM_ROADMAP.md` §5 as audited 2026-07-22.

### 5A — First-order

| # | Family | Status | Kernel dependency |
|---|---|---|---|
| 1 | Separable | ✅ built & verified (`solveSeparable`) | integration |
| 2 | Linear / integrating factor | ✅ built & verified (`solveLinear`) | integration |
| 3 | Exact (+ integrating factors) | ✅ built & verified (`solveExact`) | partial derivatives |
| 4 | Homogeneous (`y=vx`), Bernoulli (`v=y^{1−n}`) | ✅ both built & verified | reduces to 1, 2 |
| 5 | Applications (cooling, mixing, growth) | ⚪ missing — **P1** | presentation layer only |
| 6 | Autonomous equations, phase line, stability | ⚪ missing — P2 | root finding |

### 5B — Second-order

| # | Family | Status | Kernel dependency |
|---|---|---|---|
| 7 | Constant-coefficient homogeneous | ✅ built (`classifySecondOrder`, `charRoots`) | **polynomial roots** |
| 8a | Undetermined coefficients | ✅ built & verified | linear solve |
| 8b | Variation of parameters | ✅ built & verified | integration |
| 8c | **Reduction of order** | ⚪ **missing — P1** | integration |
| 9 | Mechanical vibrations / RLC circuits | ⚪ missing — P1 | 7, 8 |

> `charRoots` is local and degree-2 only. Phase 3 replaces it with kernel polynomial roots, which
> **generalises the engine past second order for free** — higher-order constant-coefficient
> equations become available without new solver code.

### 5C — Laplace transforms

| # | Family | Status | Kernel dependency |
|---|---|---|---|
| 10 | Laplace transform and inverse | ⚪ missing — **P1** | **partial fractions** ← Phase 3 |
| 11 | Step, impulse, convolution | ⚪ missing — P2 | 10 |

> **Inverse Laplace is dominated by partial-fraction decomposition.** Once Phase 3 lands, most of
> this chapter is mechanical. Nerdamer's forward `laplace` already works
> (`laplace(t^2,t,s) → factorial(2)*s^(-3)` ✅) and its `ilt` exists — but both need the kernel's
> correct partial fractions to be trustworthy.

### 5D — Systems

| # | Family | Status | Kernel dependency |
|---|---|---|---|
| 12 | `x' = Ax` via eigenvalues; phase portraits | ⚪ missing — **P1** | eigenvalues — **`LinAlg` already has them, incl. complex roots** |

### 5F — Series solutions

| Family | Status | Kernel dependency |
|---|---|---|
| Power-series solutions, Frobenius method | ⚪ missing | **series machinery** (Phase 4) + symbolic summation |

## 5G — PDE (first-class scope, not a stretch goal)

`CURRICULUM_ROADMAP.md` §5G states this explicitly: PDE is **first-class scope for this engine**,
grounded in Boyce & DiPrima Ch. 10–11, with classification trees already specified in
`docs/ODE_PDE_SOLVER_DESIGN.md` §7. Treat it as half the engine, not an appendix.

| # | Family | Status | Priority | Kernel dependency |
|---|---|---|---|---|
| 19 | Fourier series (full, half-range sine/cosine) | ✅ built — `CalculusSymbolic.fourierSeries` | P0 | integration |
| 20 | **Heat / diffusion** `u_t = k·u_xx` (parabolic) | 🟡 built — `solveHeatEquation`, `heatSeriesValue` | P1 | Fourier + separation |
| 21 | **Wave** `u_tt = c²·u_xx` (hyperbolic) | ⚪ **missing** | **P1** | same machinery as #20 |
| 22 | **Laplace / Poisson** `u_xx+u_yy = 0` (elliptic) | ⚪ **missing** | P2 | same machinery; links to Complex §8 #4 harmonic functions |
| 23 | Numerical schemes (explicit, implicit, Crank–Nicolson) + stability | ⚪ **missing** | P2 | LinAlg iterative solvers |

**Only one of the three canonical PDEs exists.** Fourier series (#19) was the hard prerequisite and
it is done, so #21 and #22 largely reuse #20's separation-of-variables machinery — this is cheaper
than it looks, but it is not free and it is not built.

### Why PDE needs its own corpus and its own verifier

**There is no Rubi for PDEs.** Nothing comparable to the 72,039-problem integration suite exists:
SymPy's `pde` module is thin, and FriCAS barely covers PDEs. **The PDE corpus must be *authored***
from Boyce & DiPrima Ch. 10–11 and the classification trees in `ODE_PDE_SOLVER_DESIGN.md` §7. That
is writing work, not importing work — a different and slower cost profile than Phase 0's calculus
third, and it must be planned as such.

**PDE verification is a strictly harder check than ODE verification.** For an ODE you substitute
the solution back and require residual ≈ 0. A PDE solution must satisfy *four* things:

| Check | What it catches |
|---|---|
| PDE residual ≈ 0 on an interior grid | wrong separation constant, wrong eigenfunctions |
| **Boundary conditions** at every boundary | the classic failure — right PDE, wrong BCs |
| **Initial condition** at t = 0 | wrong Fourier coefficients |
| Series convergence as terms increase | truncation masking a divergent solution |

A PDE solver that satisfies the equation but not the boundary conditions is wrong in exactly the
way a student cannot detect, so all four are mandatory — the same discipline as the antiderivative
gate, applied to a harder object.

---

## 3. Solver architecture

Table-driven classification, mirroring how the textbook itself is organised:

```
   input ODE
       │
       ▼
   PARSE & NORMALIZE  ──►  order · linearity · autonomy · homogeneity
       │
       ▼
   CLASSIFY  (ordered — first match wins, matching teaching order)
       │
       ├─ order 1 ─┬─ separable?        → solveSeparable
       │           ├─ linear?           → integrating factor
       │           ├─ exact?            → potential reconstruction
       │           ├─ homogeneous?      → y = vx      ──► reduces to separable
       │           └─ Bernoulli?        → v = y^{1−n} ──► reduces to linear
       │
       └─ order ≥2 ┬─ const-coeff homogeneous? → characteristic polynomial (3 root cases)
                   ├─ const-coeff + forcing?   → undetermined coefficients / variation
                   ├─ one solution known?      → reduction of order
                   ├─ discontinuous forcing?   → Laplace
                   └─ variable coefficients?   → series / Frobenius
       │
       ▼
   SOLVE  ──►  VERIFY BY SUBSTITUTION  ──►  steps, or refuse with a reason
```

**Classification order matters pedagogically.** A separable equation that is also linear should be
presented as *separable*, because that is what the student was taught first and what the assignment
expects.

---

## 4. Validation — substitution is the only real check

There is no antiderivative to differentiate back. **The check is: substitute the solution into the
original equation and confirm the residual is ≈ 0** at sample points.

| Solution type | Check |
|---|---|
| Explicit `y = f(x)` | Substitute; residual ≈ 0 at ≥5 points |
| Implicit `F(x,y) = C` | Differentiate implicitly; confirm the ODE is recovered |
| IVP | Residual ≈ 0 **and** the initial condition is satisfied exactly |
| System | Each component's residual ≈ 0 |
| Series solution | Truncated series satisfies the ODE to the truncation order |
| PDE | Residual ≈ 0 **and** boundary/initial conditions satisfied |

`verify-ode.js` already has an `invariantAlongTrajectory` check that caught a scale bug in
`solveSeparable` — a good example of a metamorphic invariant catching what pointwise checks miss.
**Keep and extend that pattern.**

---

## 5. Cross-engine reuse — already identified in the roadmap

| Need | Reuse | Status |
|---|---|---|
| Polynomial roots for characteristic equations | `LinAlg.polynomialRoots` / `charPoly` | ✅ exists, **already returns complex roots** |
| Eigenvalues for systems `x'=Ax` | `LinAlg` eigenvalue routines | ✅ exists |
| Verified integration for integrating factors | `CalculusSymbolic` integration suite | ✅ exists — replaces `ode-solver.js`'s single-technique `verifiedIntegrate` |
| Fourier coefficients for PDE | `CalculusSymbolic.fourierSeries` | ✅ exists |
| Numeric fallback / overlay | Euler, RK4 | ✅ exists |

**The ODE engine should be mostly composition, not new mathematics.** Its unique contribution is
the classifier and the step narration.

---

## 6. Gates specific to this engine

| Phase | ODE-specific gate |
|---|---|
| 3 | `charRoots` replaced by kernel polynomial roots; **order ≥3 const-coeff works** |
| 3 | Inverse Laplace correct on the corpus (depends on partial fractions) |
| 4 | Frobenius series solutions correct to truncation order |
| 6 | All Boyce & DiPrima Ch. 1–11 families solved **with steps** |
| 6 | **Every** solution verified by substitution; residual ≈ 0 |
| 6 | Wave and Laplace PDEs join heat via shared separation-of-variables machinery |
