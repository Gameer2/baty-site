import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Parse "x = 3, y = 4" -> { x: "3", y: "4" }; mirrors related-rates.js parseAssignments so the
// node's flat text inputs map onto the op's value map.
const parseAssignments = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of raw.split(/[,;\n]/)) {
    const m = part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m) {
      out[m[1]] = m[2].trim();
    }
  }
  return out;
};

// Parse "dx/dt = 2, dy/dt = -1" -> { x: "2", y: "-1" }; also accepts bare "x = 2" (mirrors
// related-rates.js parseRates).
const parseRates = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of raw.split(/[,;\n]/)) {
    const m =
      part.match(/^\s*d([A-Za-z_][A-Za-z0-9_]*)\s*\/?\s*dt\s*=\s*(.+?)\s*$/i) ||
      part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m) {
      out[m[1]] = m[2].trim();
    }
  }
  return out;
};

// Run-mode Scalar spec: computeRun calls CAS.relatedRates(equation, vars, values, knownRates,
// unknown) and surfaces the solved rate (numeric) as a Scalar number plus the implicit-
// differentiation work as text. Inputs mirror the page (related-rates.js): the relationship
// equation, a comma-separated list of time-dependent vars, "k = v" instant values, "dk/dt = r"
// known rates, and the var whose rate to find. See the calculus plan Task 21.
export const RELATED_RATES_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "related-rates",
  inputs: [
    {
      key: "equation",
      label: "relationship",
      kind: "expression",
      default: "x^2+y^2=25",
    },
    {
      key: "vars",
      label: "time-dependent vars",
      kind: "expression",
      default: "x, y",
    },
    {
      key: "values",
      label: "values (k = v)",
      kind: "expression",
      default: "x = 3, y = 4",
    },
    {
      key: "knownRates",
      label: "known rates (dk/dt = r)",
      kind: "expression",
      default: "dx/dt = 2",
    },
    { key: "unknown", label: "find rate of", kind: "expression", default: "y" },
  ],
  outputs: [
    { key: "rate", label: "d?/dt", kind: "number" },
    { key: "work", label: "work", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/related-rates.html",
  pageStoreKey: "engine-lab:calculus-related-rates",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const equation = String(inputs.equation ?? "");
    const vars = String(inputs.vars ?? "")
      .split(/[, \n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const values = parseAssignments(String(inputs.values ?? ""));
    const knownRates = parseRates(String(inputs.knownRates ?? ""));
    const unknown = String(inputs.unknown ?? "");
    const r = await runCas("relatedRates", [
      equation,
      vars,
      values,
      knownRates,
      unknown,
    ]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    return {
      outputs: {
        rate: Number(r.result.numeric),
        work: stepsToText(r.result.steps),
      },
    };
  },
};
