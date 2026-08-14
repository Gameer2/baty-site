import { describe, expect, it } from "vitest";

import {
  compatibleTargetInputKeys,
  computeWiredResults,
  extractWireConnections,
  readWireConfig,
} from "../syntropy/wiring";
import { BISECTION_PORT_SPEC } from "../syntropy/portSpecs/bisection";
import { NEWTON_RAPHSON_PORT_SPEC } from "../syntropy/portSpecs/newtonRaphson";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

import type { ArrowLike } from "../syntropy/wiring";
import type { NodeState } from "../syntropy/wiring";

const node = (
  id: string,
  overrides: Partial<{ customData: unknown }> = {},
) => ({
  id,
  customData: {
    syntropyNode: { engineId: "numerical", methodId: "bisection" },
  },
  ...overrides,
});

describe("extractWireConnections", () => {
  const resolve = (id: string) => {
    if (id === "A") {
      return node("A");
    }
    if (id === "B") {
      return node("B");
    }
    return undefined;
  };

  it("resolves an arrow carrying a real wire config between two known nodes", () => {
    const arrows: ArrowLike[] = [
      {
        id: "arrow1",
        startBinding: { elementId: "A" },
        endBinding: { elementId: "B" },
        customData: {
          syntropyWire: true,
          sourceOutputKey: "root",
          targetInputKey: "x0",
        },
      },
    ];
    const connections = extractWireConnections(arrows, resolve);
    expect(connections).toEqual([
      {
        arrowId: "arrow1",
        sourceNodeId: "A",
        sourceOutputKey: "root",
        targetNodeId: "B",
        targetInputKey: "x0",
      },
    ]);
  });

  it("ignores an arrow with no wire config (an ordinary drawn arrow)", () => {
    const arrows: ArrowLike[] = [
      {
        id: "arrow1",
        startBinding: { elementId: "A" },
        endBinding: { elementId: "B" },
      },
    ];
    expect(extractWireConnections(arrows, resolve)).toEqual([]);
  });

  it("ignores an arrow whose binding resolves to an unknown or non-node element", () => {
    const arrows: ArrowLike[] = [
      {
        id: "arrow1",
        startBinding: { elementId: "A" },
        endBinding: { elementId: "ghost" },
        customData: {
          syntropyWire: true,
          sourceOutputKey: "root",
          targetInputKey: "x0",
        },
      },
    ];
    expect(extractWireConnections(arrows, resolve)).toEqual([]);
  });

  it("ignores an unbound arrow even if it somehow carries a wire config", () => {
    const arrows: ArrowLike[] = [
      {
        id: "arrow1",
        startBinding: null,
        endBinding: { elementId: "B" },
        customData: {
          syntropyWire: true,
          sourceOutputKey: "root",
          targetInputKey: "x0",
        },
      },
    ];
    expect(extractWireConnections(arrows, resolve)).toEqual([]);
  });
});

describe("compatibleTargetInputKeys", () => {
  it("lists every number-kind input on the target for a number-kind source output", () => {
    const keys = compatibleTargetInputKeys(
      BISECTION_PORT_SPEC,
      "root",
      NEWTON_RAPHSON_PORT_SPEC,
    );
    expect(keys).toEqual(["x0", "tol", "maxIter"]);
  });

  it("returns nothing for a curve source output", () => {
    const keys = compatibleTargetInputKeys(
      RIEMANN_SUMS_PORT_SPEC,
      "rectangles",
      NEWTON_RAPHSON_PORT_SPEC,
    );
    expect(keys).toEqual([]);
  });

  it("returns nothing for an unknown source output key", () => {
    const keys = compatibleTargetInputKeys(
      BISECTION_PORT_SPEC,
      "doesNotExist",
      NEWTON_RAPHSON_PORT_SPEC,
    );
    expect(keys).toEqual([]);
  });
});

describe("readWireConfig", () => {
  it("reads a valid config", () => {
    expect(
      readWireConfig({
        syntropyWire: true,
        sourceOutputKey: "root",
        targetInputKey: "x0",
      }),
    ).toEqual({
      syntropyWire: true,
      sourceOutputKey: "root",
      targetInputKey: "x0",
    });
  });

  it("returns null for an ordinary arrow with no config", () => {
    expect(readWireConfig(undefined)).toBeNull();
    expect(readWireConfig({})).toBeNull();
  });
});

describe("computeWiredResults", () => {
  it("computes an unconnected node exactly as spec.compute would", () => {
    const nodes: NodeState[] = [
      {
        id: "A",
        engineId: "numerical",
        methodId: "bisection",
        inputs: { fx: "x^3 - x - 2", a: 1, b: 2, tol: 0.000001, maxIter: 40 },
      },
    ];
    const results = computeWiredResults(nodes, []);
    const direct = BISECTION_PORT_SPEC.compute(nodes[0].inputs);
    expect(results.get("A")?.outputs).toEqual(direct.outputs);
    expect(results.get("A")?.wiredInputKeys.size).toBe(0);
  });

  it("feeds an upstream node's output into a downstream node's wired input", () => {
    const nodes: NodeState[] = [
      {
        id: "A",
        engineId: "numerical",
        methodId: "bisection",
        inputs: { fx: "x^3 - x - 2", a: 1, b: 2, tol: 0.000001, maxIter: 40 },
      },
      {
        id: "B",
        engineId: "numerical",
        methodId: "newton-raphson",
        // x0 deliberately wrong/unset — the wire should override it with A's root.
        inputs: { fx: "x^3 - x - 2", x0: 999, tol: 0.000001, maxIter: 30 },
      },
    ];
    const connections = [
      {
        arrowId: "w1",
        sourceNodeId: "A",
        sourceOutputKey: "root",
        targetNodeId: "B",
        targetInputKey: "x0",
      },
    ];
    const results = computeWiredResults(nodes, connections);
    const bRoot = results.get("A")?.outputs.root;
    expect(bRoot).toBeCloseTo(1.5213797, 5);
    expect(results.get("B")?.wiredInputKeys.has("x0")).toBe(true);
    // Both A and B converge to the same real root of x^3-x-2, confirming B actually used A's
    // computed root as its starting guess rather than the bogus stored 999.
    expect(results.get("B")?.outputs.root).toBeCloseTo(1.5213797, 4);
  });

  it("chains through three nodes in dependency order", () => {
    const nodes: NodeState[] = [
      {
        id: "A",
        engineId: "numerical",
        methodId: "bisection",
        inputs: { fx: "x^3 - x - 2", a: 1, b: 2, tol: 0.000001, maxIter: 40 },
      },
      {
        id: "B",
        engineId: "numerical",
        methodId: "newton-raphson",
        inputs: { fx: "x^3 - x - 2", x0: 999, tol: 0.000001, maxIter: 30 },
      },
      {
        id: "C",
        engineId: "numerical",
        methodId: "secant",
        inputs: {
          fx: "x^3 - x - 2",
          x0: 999,
          x1: 998,
          tol: 0.000001,
          maxIter: 30,
        },
      },
    ];
    const connections = [
      {
        arrowId: "w1",
        sourceNodeId: "A",
        sourceOutputKey: "root",
        targetNodeId: "B",
        targetInputKey: "x0",
      },
      {
        arrowId: "w2",
        sourceNodeId: "B",
        sourceOutputKey: "root",
        targetNodeId: "C",
        targetInputKey: "x0",
      },
    ];
    const results = computeWiredResults(nodes, connections);
    expect(results.get("C")?.wiredInputKeys.has("x0")).toBe(true);
    expect(results.get("C")?.outputs.root).toBeCloseTo(1.5213797, 4);
  });

  it("marks every node in a cycle with a cycle error instead of computing or hanging", () => {
    const nodes: NodeState[] = [
      { id: "A", engineId: "numerical", methodId: "bisection", inputs: {} },
      {
        id: "B",
        engineId: "numerical",
        methodId: "newton-raphson",
        inputs: {},
      },
    ];
    const connections = [
      {
        arrowId: "w1",
        sourceNodeId: "A",
        sourceOutputKey: "root",
        targetNodeId: "B",
        targetInputKey: "x0",
      },
      {
        arrowId: "w2",
        sourceNodeId: "B",
        sourceOutputKey: "root",
        targetNodeId: "A",
        targetInputKey: "a",
      },
    ];
    const results = computeWiredResults(nodes, connections);
    expect(results.get("A")?.error).toMatch(/cycle/i);
    expect(results.get("B")?.error).toMatch(/cycle/i);
  });

  it("does not throw for a node whose methodId has no registered port spec", () => {
    const nodes: NodeState[] = [
      {
        id: "A",
        engineId: "numerical",
        methodId: "nonexistent-method",
        inputs: {},
      },
    ];
    const results = computeWiredResults(nodes, []);
    expect(results.get("A")).toEqual({
      outputs: {},
      wiredInputKeys: new Set(),
      effectiveInputs: {},
    });
  });
});
