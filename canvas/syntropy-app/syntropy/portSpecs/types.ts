import type { EngineId } from "../engineAccents";

// Runtime arrays drive both the type union and the dispatch/contract checks. Add a kind here
// and it flows to PortInputKind/PortOutputKind, the dispatch map, and the contract test
// automatically.
export const PORT_INPUT_KINDS = [
  "expression",
  "number",
  // "points"/"coeffs"/"vector" default to (and, once edited via the node's generic text input,
  // always become) a comma/semicolon-delimited string — "0,1;1,3;2,2" for points, "1,-2,3" for
  // coeffs/vector — parsed by each compute() via portSpecs/parseComposite.ts. The default may
  // start as a real number[]/number[][] (nicer to author), which the parser also accepts, but the
  // node always writes back a string after the first edit.
  "points",
  "coeffs",
  "vector",
  "matrix",
  // "expressions": semicolon-separated multi-variable expression strings (x1..xn scope), e.g.
  // "x1^2+x2^2-2;x1-x2" — a system F(x)=0, one equation per node the vector-system methods
  // (Newton's method for systems, Broyden's method) solve for.
  "expressions",
  // "point": a single draggable point on a canvas (a field's initial condition, an ODE's
  // starting state). Wired point→point; not a composite string like "points".
  "point",
] as const;

export type PortInputKind = typeof PORT_INPUT_KINDS[number];

export const PORT_OUTPUT_KINDS = [
  "number", // single scalar
  "trace", // iteration rows: { i, point, residual, … }[]
  "curve", // sampled f over [a,b] + optional partition/data overlay (was "plot2d")
  "matrix", // number[][]  (one or more named factors)
  "eigenpairs", // { lambda, vector }[]
  "field", // slope samples + solution path
  "distribution", // { x, pdf, cdf }[] + params
  // "text": a short string result with no numeric meaning (a ciphertext, say) — rendered as-is
  // instead of the node's `.toFixed(3)` number formatting. Kept separate from "number" rather
  // than a display heuristic on the value's type, since a method that legitimately returns
  // digits-as-a-string (e.g. a large BigInt rendered for exact display) still wants text formatting.
  "text",
  // "expression": a symbolic form — an antiderivative, a series, a transform, a factorization, a
  // congruence-class set — the product of the Symbolic archetype methods. Carries an
  // ExpressionOutput (a display-ready math string + optional structured form). Promoted from an
  // input-only kind; see
  // docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §2.
  "expression",
] as const;

export type PortOutputKind = typeof PORT_OUTPUT_KINDS[number];

/** The value carried by a `distribution` output: a sampled pdf/pmf curve (`points`, each
 *  carrying the density `pdf` and cumulative `cdf` at sample `x`) plus the region `[lo, hi]` the
 *  renderer shades — a lower tail `P(X ≤ x)` for the pdf/pmf methods, the central interval
 *  `[lower, upper]` for a confidence interval. Distribution parameters (μ, σ, n, p, …) stay as the
 *  spec's separate `number` outputs; only the curve and its shade region live here. compute()
 *  assembles `points` by calling the core's existing pdf/cdf primitives at sample x's — display
 *  sampling, not new math. */
export type DistributionOutput = {
  points: { x: number; pdf: number; cdf: number }[];
  lo: number;
  hi: number;
};

/** The value carried by a `curve` (real-line) output: a sampled curve over its x-range — the
 *  integrand `f` for quadrature, the interpolant for interpolation, the fitted line/polynomial
 *  for regression — plus optional overlays the method's own core already returns:
 *  `samples` (a HANDFUL of discrete points — interpolation nodes or a regression scatter, drawn
 *  as dots; not for a second dense curve, which reads as a smudged blob at 100+ points) and
 *  `rectangles` (Riemann partition rectangles or adaptive-quadrature leaves, drawn as bars).
 *  `overlay` is a second continuous curve over the SAME domain, drawn as its own stroked path
 *  (dashed, secondary weight) rather than dots — e.g. the target function a Fourier partial sum
 *  is approximating. `fillArea` fills the area under the curve (quadrature: the signed integral
 *  region). The curve itself is the method's input function sampled for display via the
 *  already-compiled expression, or the core's own evaluator applied at sample x's — display
 *  sampling, not new math; the method's real result (the total, the coefficients, the fitted
 *  value) stays as the spec's `number` outputs. */
export type CurveOutput = {
  points: { x: number; y: number }[];
  samples?: { x: number; y: number }[];
  overlay?: { x: number; y: number }[];
  rectangles?: { x0: number; x1: number; height: number }[];
  fillArea?: boolean;
};

/** The value carried by an `expression` (Symbolic) output: a display-ready math string from the
 *  core (e.g. `"12 = 2^2 · 3"`, `"[1; 2, 2, ...]"`, `"x ≡ 2, 5 (mod 6)"`) plus an optional structured
 *  form the SymbolicNode renders with archetype-specific formatting (factor bases bold with
 *  superscript exponents, a continued-fraction period under an overline, a congruence set mod
 *  clause). compute() assembles it from the form the core already returns — no new math. See spec
 *  §3. */
export type ExpressionOutput = {
  /** Display-ready math string, e.g. "2*x^2 + 3" or "[1; 1, 2]". */
  display: string;
  /** Optional structured form for richer rendering (factors, convergents, solution set). */
  structured?:
    | { kind: "factorization"; factors: { base: string; exponent: number }[] }
    | { kind: "continuedFraction"; a0: string; period: string[] }
    | { kind: "congruenceSet"; modulus: string; solutions: string[] }
    | { kind: "series"; coefficients: string[]; center?: string }
    | { kind: "plain" };
};

/** The value carried by a `field` output: a sampled 2D field over the rectangular domain
 *  `[xLo, xHi] × [yLo, yHi]`. `grid` is rows of points each carrying a scalar `value` (a heatmap's
 *  temperature, a contour's potential, a domain-coloring's magnitude); `vectors` is an optional
 *  vector field (direction-field arrows, a gradient, a curl) sampled on the same domain. `variant`
 *  is the render style FieldNode picks from. compute() samples the method's existing core over the
 *  domain — display sampling, not new math; the method's real result (a zero count, a residue, a
 *  steady-state value) stays as the spec's `number`/`text` outputs. See spec §3. */
export type FieldOutput = {
  /** Grid of sampled points over the domain, rows × cols. `value` is the scalar field at (x, y). */
  grid: { x: number; y: number; value: number }[][];
  /** Optional vector field (direction fields, gradient, div/curl) sampled over the domain. */
  vectors?: { x: number; y: number; dx: number; dy: number }[][];
  xLo: number;
  xHi: number;
  yLo: number;
  yHi: number;
  /** Render variant the FieldNode picks from. */
  variant: "arrows" | "heatmap" | "contour" | "domainColor";
};

export type PortInput = {
  key: string;
  label: string;
  kind: PortInputKind;
  default: string | number | number[] | number[][];
};

export type PortOutput = {
  key: string;
  label: string;
  kind: PortOutputKind;
};

export type ComputeResult = {
  outputs: Record<string, unknown>;
  error?: string;
};

/**
 * The repeatable unit for turning one existing math-lab method into a real canvas node, without
 * touching the method's own pure-core file. See
 * docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md.
 */
export type PortSpec = {
  engineId: EngineId;
  methodId: string;
  inputs: PortInput[];
  outputs: PortOutput[];
  /** Never reimplements a method's math — always adapts the method's existing core file.
   *  Synchronous for `executionMode: "live"` (all 89 existing specs — recompute on every input
   *  change, invoked by the render path and wiring on every keystroke). For `executionMode:
   *  "run"` (the CAS methods) `compute` stays sync but returns a not-yet-run placeholder — the
   *  real async result comes from `computeRun`, triggered explicitly by a Run button, not on
   *  every keystroke. See
   *  docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §4. */
  compute: (inputs: Record<string, unknown>) => ComputeResult;
  /** Async compute for `executionMode: "run"` specs (the CAS methods). Undefined for `"live"`
   *  specs. The render path never awaits this on every keystroke — useNodeCompute invokes it only
   *  when the node's Run action fires, keeping the last result stable between runs. See spec §4. */
  computeRun?: (inputs: Record<string, unknown>) => Promise<ComputeResult>;
  executionMode: "live" | "run";
  /**
   * Marks a `"run"` spec whose `computeRun` is backed by the nested Pyodide/SymPy worker (see
   * casRunHelpers.ts) rather than the fast in-process nerdamer engine — solving ODEs, ODE
   * systems, series solutions, Laplace transforms, and the residue-calculus Complex Analysis
   * methods. Pyodide's cold boot alone runs several seconds, so these get a longer CAS timeout
   * and are eligible for the canvas's warm-start (spawning the worker as soon as the node is
   * placed, instead of waiting for the user's first Run click). Omitted for every other spec.
   */
  casTier?: "sympy";
  /**
   * Opt-in hint for a factorization-shaped output layout. On the Matrix archetype `"factorization"`
   * means the matrix outputs are factors whose product reconstructs the single matrix input (LU's
   * L·U, Gram-Schmidt's Q·R, SVD's U·Σ·V), so MatrixNode renders them on one line joined by "·"
   * with an "{A} =" prefix; omit it for any spec whose matrix outputs are not a product
   * (four-subspaces' bases, an RREF, an inverse, a solution vector) — those render as stacked
   * labeled grids, since "A = A⁻¹" or "A = col · row · null" would read wrong. On the Symbolic
   * archetype the number-theory methods (prime-factorisation, continued-fractions,
   * linear-congruences) carry it so SymbolicNode renders the decomposition centered with an
   * equals/bracket (e.g. `12 = 2²·3`, `[1; 2, 2, …]`, `x ≡ 2, 5 (mod 6)`).
   */
  relation?: "factorization";
  /** The method's real page on math-lab, opened by the node's portal tab. */
  pagePath: string;
  /** The Proto.saveState/loadState localStorage key that page already reads on load. */
  pageStoreKey: string;
  /**
   * Overrides portalPrefill.ts's default `state[input.key] = inputs[input.key]` mapping for
   * pages whose saved-state shape isn't a flat 1:1 copy of the node's own input keys — a
   * multi-mode page storing `{ mode, params: { mean, sd } }` (continuous-distributions.js) or a
   * page using a different in-string delimiter than the node's own "vector"/"matrix" convention
   * (linear-regression.js wants newline-separated pairs, not the node's semicolon-separated
   * "points" format). Most specs don't need this — only reach for it when the generic per-key
   * copy would produce a shape the page's own `Proto.loadState` restore block can't read.
   */
  toPageState?: (inputs: Record<string, unknown>) => Record<string, unknown>;
};
