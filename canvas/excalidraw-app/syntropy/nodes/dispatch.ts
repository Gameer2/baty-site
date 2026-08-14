import type { PortSpec } from "../portSpecs/types";

/** The six visualization archetypes — see
 *  docs/superpowers/specs/2026-08-14-syntropy-node-archetype-redesign-design.md. */
export type Archetype =
  | "trace"
  | "real-line"
  | "matrix"
  | "field"
  | "distribution"
  | "scalar";

// First rich (non-number, non-text) output kind wins. A spec may carry a `number` summary
// alongside its rich output (LU emits matrix factors AND a number det) — the number must not
// mask the archetype. number/text-only specs are scalar.
const ARCHETYPE_BY_KIND: Record<string, Archetype> = {
  trace: "trace",
  curve: "real-line",
  matrix: "matrix",
  eigenpairs: "matrix",
  field: "field",
  distribution: "distribution",
};

/** Picks a node's archetype from its declared outputs. The dispatcher (`NodeBody`) reads this to
 *  choose the body renderer; v1 routes every archetype to `ScalarNode` until the per-archetype
 *  renderers land in their follow-on plans. */
export const archetypeFromSpec = (spec: PortSpec): Archetype => {
  for (const output of spec.outputs) {
    const arch = ARCHETYPE_BY_KIND[output.kind];
    if (arch) {
      return arch;
    }
  }
  return "scalar";
};