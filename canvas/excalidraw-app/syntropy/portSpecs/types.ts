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
  /** Never reimplements a method's math — always adapts the method's existing core file. */
  compute: (inputs: Record<string, unknown>) => ComputeResult;
  executionMode: "live";
  /**
   * Opt-in hint for the Matrix archetype's output layout. `"factorization"` means the
   * matrix outputs are factors whose product reconstructs the single matrix input (LU's
   * L·U, Gram-Schmidt's Q·R, SVD's U·Σ·V), so MatrixNode renders them on one line joined by
   * "·" with an "{A} =" prefix. Omit it for any spec whose matrix outputs are not a product
   * (four-subspaces' bases, an RREF, an inverse, a solution vector) — those render as
   * stacked labeled grids, since "A = A⁻¹" or "A = col · row · null" would read wrong.
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
