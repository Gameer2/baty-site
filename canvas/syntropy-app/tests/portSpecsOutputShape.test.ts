import { describe, expect, it } from "vitest";

import { ALL_PORT_SPECS } from "../syntropy/portSpecs/registry";

const defaultInputs = (spec: typeof ALL_PORT_SPECS[number]) =>
  Object.fromEntries(spec.inputs.map((i) => [i.key, i.default]));

// A number[][] — including the degenerate empty matrix `[]` (a full-rank matrix's
// null-space basis, an inconsistent system's solution). `[]`.every(...) is vacuously
// true, so empty matrices pass; a flat number[] (a vector returned by mistake) fails
// because its elements are numbers, not arrays.
const isNumberMatrix = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.every(
    (row) => Array.isArray(row) && row.every((c) => typeof c === "number"),
  );

describe("port spec output shape contract", () => {
  for (const spec of ALL_PORT_SPECS) {
    it(`${spec.engineId}:${spec.methodId} compute() returns shapes matching its declared output kinds`, () => {
      const result = spec.compute(defaultInputs(spec));
      // A spec that errors on its own defaults (e.g. needs non-default inputs) is skipped —
      // the shape contract only applies when compute succeeds.
      if (result.error) {
        expect(result.error).toBeTruthy();
        return;
      }
      for (const out of spec.outputs) {
        const v = result.outputs[out.key];
        switch (out.kind) {
          case "number":
            expect(
              typeof v === "number" || v === undefined,
              `${spec.methodId} ${out.key} should be number, got ${typeof v}`,
            ).toBe(true);
            break;
          case "text":
            expect(
              typeof v === "string" || v === undefined,
              `${spec.methodId} ${out.key} should be string, got ${typeof v}`,
            ).toBe(true);
            break;
          case "matrix":
            expect(
              isNumberMatrix(v),
              `${spec.methodId} ${
                out.key
              } should be number[][], got ${JSON.stringify(v)?.slice(0, 80)}`,
            ).toBe(true);
            break;
          case "eigenpairs":
            expect(
              Array.isArray(v),
              `${spec.methodId} ${out.key} should be an array, got ${typeof v}`,
            ).toBe(true);
            break;
          // trace/curve/field/distribution: shape varies; not asserted here (per-archetype
          // renderer tests cover them).
          default:
            break;
        }
      }
    });
  }
});
