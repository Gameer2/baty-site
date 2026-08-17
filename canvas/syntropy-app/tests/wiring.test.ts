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
import type { NodeState, RunStore } from "../syntropy/wiring";
import type { EngineId } from "../syntropy/engineAccents";
import type {
  PortInputKind,
  PortOutputKind,
  PortSpec,
} from "../syntropy/portSpecs/types";

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

  // The rich kinds (matrix/field/distribution/point) don't appear on any registered spec's OUTPUTS
  // yet — they land with the per-archetype renderer migrations. These cases use minimal fake specs
  // to lock in the kind-equal rule forward-looking, so the migration is a no-op for wiring. Note
  // distribution/field/point are output-only kinds (not in PORT_INPUT_KINDS), so only number and
  // matrix form a real same-kind input/output pair today; the other wireable output kinds are
  // accepted as wireable sources but match no target input.
  const fakeSpec = (
    outputKind: PortOutputKind,
    inputKinds: PortInputKind[],
  ): PortSpec => ({
    engineId: "linear-algebra",
    methodId: "fake",
    inputs: inputKinds.map((kind, i) => ({
      key: `in${i}`,
      label: `in${i}`,
      kind,
      default: "",
    })),
    outputs: [{ key: "out", label: "out", kind: outputKind }],
    compute: () => ({ outputs: {} }),
    executionMode: "live",
    pagePath: "",
    pageStoreKey: "",
  });

  it("matches a matrix output only to matrix-kind inputs (kind-equal)", () => {
    const source = fakeSpec("matrix", []);
    const target = fakeSpec("number", ["number", "matrix", "vector"]);
    expect(compatibleTargetInputKeys(source, "out", target)).toEqual(["in1"]);
  });

  it("does not match a number output to a matrix input (kind-equal is strict)", () => {
    const source = fakeSpec("number", []);
    const target = fakeSpec("number", ["matrix", "number"]);
    expect(compatibleTargetInputKeys(source, "out", target)).toEqual(["in1"]);
  });

  it("yields nothing when no target input shares the source output's kind", () => {
    // matrix is wireable, but this target has only number/vector inputs — kind-equal finds none.
    const source = fakeSpec("matrix", []);
    const target = fakeSpec("number", ["number", "vector"]);
    expect(compatibleTargetInputKeys(source, "out", target)).toEqual([]);
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

// Run-mode propagation: a run node's real result lives in the host's runStore (populated when its
// Run action fires), not in the synchronous pass result. computeWiredResults reads the runStore so
// a downstream node's wired input sees the upstream's ready output, and carries pending/stale
// flags reflecting run state. No real run-mode spec is registered yet, so these tests inject a
// fake spec resolver (the 4th arg) — wiring's default resolver is the real registry. See
// docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §4.
describe("computeWiredResults — run-mode runStore propagation", () => {
  const runSpec = (methodId: string): PortSpec => ({
    engineId: "calculus",
    methodId,
    inputs: [{ key: "in", label: "in", kind: "number", default: 0 }],
    outputs: [{ key: "out", label: "out", kind: "number" }],
    compute: () => ({ outputs: {} }),
    computeRun: async () => ({ outputs: {} }),
    executionMode: "run",
    pagePath: "",
    pageStoreKey: "",
  });
  const A_SPEC = runSpec("run-a");
  const B_SPEC = runSpec("run-b");
  const resolveSpec = (
    _engineId: EngineId,
    methodId: string,
  ): PortSpec | undefined =>
    methodId === "run-a" ? A_SPEC : methodId === "run-b" ? B_SPEC : undefined;

  const nodes: NodeState[] = [
    { id: "A", engineId: "calculus", methodId: "run-a", inputs: { in: 1 } },
    { id: "B", engineId: "calculus", methodId: "run-b", inputs: { in: 0 } },
  ];
  const connections = [
    {
      arrowId: "w",
      sourceNodeId: "A",
      sourceOutputKey: "out",
      targetNodeId: "B",
      targetInputKey: "in",
    },
  ];

  it("both un-run: A is stale (needs its first run); B waits (pending) on an undefined wired input", () => {
    const results = computeWiredResults(
      nodes,
      connections,
      new Map(),
      resolveSpec,
    );
    // A has no upstream and has never run → stale (press Run), not pending.
    expect(results.get("A")?.pending).toBe(false);
    expect(results.get("A")?.stale).toBe(true);
    // B's upstream A isn't ready yet → B waits, wired input undefined.
    expect(results.get("B")?.pending).toBe(true);
    expect(results.get("B")?.effectiveInputs.in).toBeUndefined();
    expect(results.get("B")?.wiredInputKeys.has("in")).toBe(true);
  });

  it("after A runs: B sees A's value but is stale (not pending) until B runs", () => {
    const runStore: RunStore = new Map([
      ["A", { outputs: { out: 7 }, pending: false, inputs: { in: 1 } }],
    ]);
    const results = computeWiredResults(
      nodes,
      connections,
      runStore,
      resolveSpec,
    );
    expect(results.get("A")?.pending).toBe(false);
    expect(results.get("A")?.outputs.out).toBe(7);
    expect(results.get("B")?.effectiveInputs.in).toBe(7);
    expect(results.get("B")?.pending).toBe(false);
    expect(results.get("B")?.stale).toBe(true);
    expect(results.get("B")?.outputs).toEqual({});
  });

  it("after B runs with A's value: B is ready", () => {
    const runStore: RunStore = new Map([
      ["A", { outputs: { out: 7 }, pending: false, inputs: { in: 1 } }],
      ["B", { outputs: { out: 14 }, pending: false, inputs: { in: 7 } }],
    ]);
    const results = computeWiredResults(
      nodes,
      connections,
      runStore,
      resolveSpec,
    );
    expect(results.get("B")?.pending).toBe(false);
    expect(results.get("B")?.stale).toBe(false);
    expect(results.get("B")?.outputs.out).toBe(14);
    expect(results.get("B")?.effectiveInputs.in).toBe(7);
  });

  it("a live node downstream of a run node computes with the run node's ready output", () => {
    const liveSpec: PortSpec = {
      engineId: "calculus",
      methodId: "live-doubler",
      inputs: [{ key: "in", label: "in", kind: "number", default: 0 }],
      outputs: [{ key: "out", label: "out", kind: "number" }],
      compute: (inputs) => ({ outputs: { out: Number(inputs.in) * 2 } }),
      executionMode: "live",
      pagePath: "",
      pageStoreKey: "",
    };
    const resolve = (
      _engineId: EngineId,
      methodId: string,
    ): PortSpec | undefined =>
      methodId === "run-a"
        ? A_SPEC
        : methodId === "live-doubler"
        ? liveSpec
        : undefined;
    const wiredNodes: NodeState[] = [
      { id: "A", engineId: "calculus", methodId: "run-a", inputs: { in: 1 } },
      {
        id: "C",
        engineId: "calculus",
        methodId: "live-doubler",
        inputs: { in: 0 },
      },
    ];
    const wiredConns = [
      {
        arrowId: "w",
        sourceNodeId: "A",
        sourceOutputKey: "out",
        targetNodeId: "C",
        targetInputKey: "in",
      },
    ];
    const runStore: RunStore = new Map([
      ["A", { outputs: { out: 7 }, pending: false, inputs: { in: 1 } }],
    ]);
    const results = computeWiredResults(
      wiredNodes,
      wiredConns,
      runStore,
      resolve,
    );
    // C is live and computed synchronously using A's ready run output (7 → 14).
    expect(results.get("C")?.effectiveInputs.in).toBe(7);
    expect(results.get("C")?.outputs.out).toBe(14);
    expect(results.get("C")?.pending).toBeUndefined();
    expect(results.get("C")?.stale).toBeUndefined();
  });
});
