import type { EngineId } from "../engineAccents";

export type PortInputKind = "expression" | "number";
export type PortOutputKind = "number" | "plot2d";

export type PortInput = {
  key: string;
  label: string;
  kind: PortInputKind;
  default: string | number;
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
  /** The method's real page on math-lab, opened by the node's portal tab. */
  pagePath: string;
  /** The Proto.saveState/loadState localStorage key that page already reads on load. */
  pageStoreKey: string;
};
