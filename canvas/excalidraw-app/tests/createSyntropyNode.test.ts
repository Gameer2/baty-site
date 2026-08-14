import { describe, expect, it } from "vitest";

import { createSyntropyNode } from "../syntropy/createSyntropyNode";

// A minimal appState for the viewport-centered spawn (createSyntropyNode reads it to land the node
// under the center of the visible canvas). The tests below assert on size/customData, not
// position, so the exact viewport values don't matter — only that AppState is shaped right.
const fakeAppState = () => ({
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 },
  offsetLeft: 300,
  offsetTop: 0,
  width: 1000,
  height: 800,
});

describe("createSyntropyNode", () => {
  it("creates a transparent element sized for a method with a port spec", () => {
    let updated: { elements: readonly unknown[] } | null = null;
    const fakeAPI = {
      getSceneElements: () => [],
      getAppState: fakeAppState,
      updateScene: (args: { elements: readonly unknown[] }) => {
        updated = args;
      },
    } as unknown as Parameters<typeof createSyntropyNode>[0];

    createSyntropyNode(fakeAPI, {
      engineId: "calculus",
      methodId: "riemann-sums",
      name: "Riemann Sums",
    });

    expect(updated).not.toBeNull();
    const element = (updated!.elements[0] ?? {}) as Record<string, unknown>;
    expect(element.strokeColor).toBe("transparent");
    expect(element.backgroundColor).toBe("transparent");
    expect(element.height).toBeGreaterThan(200); // Riemann Sums has a plot output
    const customData = element.customData as {
      syntropyNode: { inputs?: Record<string, unknown> };
    };
    expect(customData.syntropyNode.inputs).toEqual({
      fx: "sin(x) + 2",
      a: 0,
      b: 6.283185307179586,
      n: 12,
    });
  });

  it("creates a placeholder-sized element with no inputs for a method with no port spec", () => {
    let updated: { elements: readonly unknown[] } | null = null;
    const fakeAPI = {
      getSceneElements: () => [],
      getAppState: fakeAppState,
      updateScene: (args: { elements: readonly unknown[] }) => {
        updated = args;
      },
    } as unknown as Parameters<typeof createSyntropyNode>[0];

    createSyntropyNode(fakeAPI, {
      engineId: "calculus",
      methodId: "not-a-real-method",
      name: "Unregistered Method",
    });

    const element = (updated!.elements[0] ?? {}) as Record<string, unknown>;
    expect(element.height).toBe(200);
    const customData = element.customData as {
      syntropyNode: { inputs?: Record<string, unknown> };
    };
    expect(customData.syntropyNode.inputs).toBeUndefined();
  });
});
