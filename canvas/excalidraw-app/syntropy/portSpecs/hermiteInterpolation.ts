import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

type HermiteTriple = { x: number; f: number; fp: number };

const parseHermitePoints = (value: unknown): HermiteTriple[] => {
  if (Array.isArray(value)) {
    return (value as number[][]).map(([x, f, fp]) => ({
      x: Number(x),
      f: Number(f),
      fp: Number(fp),
    }));
  }
  const str = String(value ?? "").trim();
  if (!str) {
    return [];
  }
  return str
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((triple) => {
      const [x, f, fp] = triple.split(",").map((s) => Number(s.trim()));
      return { x, f, fp };
    });
};

export const HERMITE_INTERPOLATION_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "hermite-interpolation",
  inputs: [
    {
      key: "points",
      label: "points (x,f,f';...)",
      kind: "points",
      default: "0,0,0;1,1,3",
    },
    { key: "x0", label: "x0", kind: "number", default: 0.5 },
  ],
  outputs: [
    { key: "curve", label: "interpolant", kind: "curve" },
    { key: "value", label: "H(x0)", kind: "number" },
    { key: "degree", label: "degree", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/hermite-interpolation.html",
  pageStoreKey: "engine-lab:numerical-hermite-interpolation",
  compute: (inputs): ComputeResult => {
    const points = parseHermitePoints(inputs.points);
    const x0 = Number(inputs.x0);

    if (
      points.length < 2 ||
      points.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.f) ||
          !Number.isFinite(p.fp),
      )
    ) {
      return {
        outputs: {},
        error: "Every point needs numeric x, f(x), and f'(x) values.",
      };
    }
    const xs = points.map((p) => p.x);
    if (new Set(xs).size !== xs.length) {
      return { outputs: {}, error: "x values must be distinct." };
    }
    try {
      const { z, Q } = Algorithms.runHermite(points);
      const value = Algorithms.evalHermite(z, Q, x0);
      // The Hermite interpolant traced over the data x-range via the core's own evaluator
      // (evalHermite on the returned z, Q), with the input nodes (x, f) as dots.
      const xMin = Math.min(...points.map((p) => p.x));
      const xMax = Math.max(...points.map((p) => p.x));
      const curve: CurveOutput = {
        points: samplePoints(
          (x) => Algorithms.evalHermite(z, Q, x),
          xMin,
          xMax,
        ),
        samples: points.map((p) => ({ x: p.x, y: p.f })),
      };
      return { outputs: { curve, value, degree: 2 * (points.length - 1) + 1 } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
