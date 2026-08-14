import { parseNumberList } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, DistributionOutput, PortSpec } from "./types";

// The page also supports proportion and variance intervals (mode switch); this node fixes mode
// to "mean" — the page's own default landing mode — so the card stays a single, focused shape.
export const CONFIDENCE_INTERVALS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "confidence-intervals",
  inputs: [
    {
      key: "data",
      label: "data",
      kind: "vector",
      default: "78,85,92,67,74,88,95,81,73,90,84,79",
    },
    { key: "confidence", label: "confidence", kind: "number", default: 0.95 },
  ],
  outputs: [
    { key: "distribution", label: "sampling dist", kind: "distribution" },
    { key: "lower", label: "lower", kind: "number" },
    { key: "upper", label: "upper", kind: "number" },
    { key: "margin", label: "margin", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/confidence-intervals.html",
  pageStoreKey: "engine-lab:statistics:ci",
  toPageState: (inputs) => ({
    data: inputs.data,
    confidence: inputs.confidence,
    mode: "mean",
  }),
  compute: (inputs): ComputeResult => {
    const data = parseNumberList(inputs.data);
    const confidence = Number(inputs.confidence);
    if (data.length < 2) {
      return { outputs: {}, error: "Enter at least two numeric values." };
    }
    try {
      const r = StatsAlgorithms.confidenceIntervalMean(data, confidence);
      // Visualize the interval on the sampling distribution of the mean: a normal curve
      // N(mean, se) (normalPDF/normalCDFValue — the page's own primitives) with the method's
      // exact [lower, upper] interval shaded. The t-based interval is computed by the core; the
      // curve is only the pedagogical normal approximation for display, so no new math. A
      // degenerate sample (se == 0) yields no curve; the scalar bounds still render.
      const { mean, se, lower, upper } = r;
      let distribution: DistributionOutput | undefined;
      if (se > 0) {
        const loBound = Math.min(mean - 4 * se, lower);
        const hiBound = Math.max(mean + 4 * se, upper);
        const step = (hiBound - loBound) / 24;
        const xs = new Set<number>([lower, upper]);
        for (let i = 0; i <= 24; i += 1) {
          xs.add(loBound + i * step);
        }
        const sorted = [...xs].sort((a, b) => a - b);
        distribution = {
          points: sorted.map((s) => ({
            x: s,
            pdf: StatsAlgorithms.normalPDF(s, mean, se),
            cdf: StatsAlgorithms.normalCDFValue(s, mean, se),
          })),
          lo: lower,
          hi: upper,
        };
      }
      return {
        outputs: {
          distribution,
          lower: r.lower,
          upper: r.upper,
          margin: r.margin,
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
