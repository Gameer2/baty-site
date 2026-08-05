import { RIEMANN_SUMS_PORT_SPEC } from "./riemannSums";

import type { EngineId } from "../engineAccents";
import type { PortSpec } from "./types";

// One entry this phase. Phase D (port-spec rollout) adds to this map — nothing else about the
// node host changes to onboard a new method beyond adding its spec here.
const REGISTRY: Record<string, PortSpec> = {
  "calculus:riemann-sums": RIEMANN_SUMS_PORT_SPEC,
};

export const getPortSpec = (
  engineId: EngineId,
  methodId: string,
): PortSpec | null => REGISTRY[`${engineId}:${methodId}`] ?? null;
