import { describe, expect, it } from "vitest";

import { QR_ALGORITHM_PORT_SPEC } from "../syntropy/portSpecs/qrAlgorithm";

describe("QR_ALGORITHM_PORT_SPEC", () => {
  it("identifies the numerical/qr-algorithm method", () => {
    expect(QR_ALGORITHM_PORT_SPEC.engineId).toBe("numerical");
    expect(QR_ALGORITHM_PORT_SPEC.methodId).toBe("qr-algorithm");
    expect(QR_ALGORITHM_PORT_SPEC.executionMode).toBe("live");
  });

  it("converges the eigenvalues of [[2,1],[1,2]] to 3 and 1", () => {
    const result = QR_ALGORITHM_PORT_SPEC.compute({
      matrix: "2,1;1,2",
      tol: 0.00000001,
      maxIter: 100,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.dominantEigenvalue).toBeCloseTo(3, 4);
    expect(result.outputs.offNorm).toBeLessThan(0.001);
  });

  it("declares and returns the eigenvalues as a matrix (column grid)", () => {
    const result = QR_ALGORITHM_PORT_SPEC.compute({
      matrix: "2,1;1,2",
      tol: 0.00000001,
      maxIter: 100,
    });
    expect(result.error).toBeUndefined();
    const eigs = result.outputs.eigenvalues as number[][];
    expect(Array.isArray(eigs) && eigs.every((row) => Array.isArray(row))).toBe(
      true,
    );
    // eigenvalues of [[2,1],[1,2]] are 3 and 1 — the column grid holds both (order may vary).
    const flat = eigs.map((row) => row[0]).sort((a, b) => a - b);
    expect(flat[0]).toBeCloseTo(1, 4);
    expect(flat[1]).toBeCloseTo(3, 4);
  });

  it("returns an error for a non-square matrix", () => {
    const result = QR_ALGORITHM_PORT_SPEC.compute({
      matrix: "2,1,0;1,2,0",
      tol: 0.00000001,
      maxIter: 100,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(QR_ALGORITHM_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/qr-algorithm.html",
    );
    expect(QR_ALGORITHM_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-qr-algorithm",
    );
  });
});
