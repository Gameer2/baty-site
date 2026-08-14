// math-lab/assets/js/algorithms.js is a plain UMD module (see its own header comment: "pure,
// DOM-free numeric methods... shared between the browser pages and the Node verification suite"),
// not a TypeScript module. It already has zero DOM/window references. Vite serves it as an ES
// module with no static exports (the UMD wrapper only assigns to `module.exports` under CJS, or
// `self.Algorithms` in the browser), so it's imported here for its side effect and read off the
// global the UMD wrapper sets — this is the ONE place canvas calls the real core file rather than
// reimplementing the arithmetic, per the project's one-algorithm-one-file rule.
// @ts-ignore — algorithms.js lives outside canvas's rootDir (../../​../../math-lab/...), so tsc
// would report TS6059 if it followed the import; ignoring the import keeps it out of tsc's program
// while Vite resolves it fine at runtime.
import "../../../../math-lab/assets/js/algorithms.js";

import { compileExpression } from "../compileExpression";

import type { ComputeResult, PortSpec } from "./types";

type AlgorithmsModule = {
  runRiemannSum: (
    fn: (x: number) => number,
    a: number,
    b: number,
    n: number,
  ) => { total: number; width: number; rectangles: unknown };
};

const Algorithms = (globalThis as { Algorithms?: AlgorithmsModule })
  .Algorithms as AlgorithmsModule;

export const RIEMANN_SUMS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "riemann-sums",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "sin(x) + 2" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 6.283185307179586 },
    { key: "n", label: "n", kind: "number", default: 12 },
  ],
  outputs: [
    { key: "total", label: "total", kind: "number" },
    { key: "rectangles", label: "plot", kind: "curve" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/calculus/methods/riemann-sums.html",
  pageStoreKey: "engine-lab:calculus-riemann-sums",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const n = Number(inputs.n);

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runRiemannSum(compiled.fn, a, b, Math.round(n));
      return {
        outputs: {
          total: result.total,
          width: result.width,
          rectangles: result.rectangles,
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
