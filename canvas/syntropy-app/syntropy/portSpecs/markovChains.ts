import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MARKOV_CHAINS_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "markov-chains",
  inputs: [
    {
      key: "A",
      label: "P (transition ;)",
      kind: "matrix",
      default: "0.9,0.5,0.1;0.05,0.4,0.3;0.05,0.1,0.6",
    },
  ],
  outputs: [
    { key: "steadyState", label: "π (steady state)", kind: "matrix" },
    { key: "uniqueSteadyState", label: "unique (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/linear-algebra/methods/markov-chains.html",
  pageStoreKey: "engine-lab:linear-algebra-markov-chains",
  compute: (inputs): ComputeResult => {
    const P = parseMatrix(inputs.A);
    if (P.length === 0 || P.length !== P[0].length) {
      return { outputs: {}, error: "Transition matrix must be square." };
    }
    try {
      const ss = LinAlg.markovSteadyState(P);
      // The steady-state distribution is a vector; render it as a single-column matrix.
      return {
        outputs: {
          steadyState: ss.steadyState.map((p) => [p]),
          uniqueSteadyState: ss.uniqueUpToScale ? 1 : 0,
        },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
