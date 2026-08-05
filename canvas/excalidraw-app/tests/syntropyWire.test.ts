import { describe, expect, it } from "vitest";

import {
  computeLinkedAccent,
  getSyntropyWireStyling,
  stampLinkedAccent,
  styleSyntropyWire,
  type SyntropyNodeData,
} from "../syntropy/syntropyWire";

type TestNode = {
  id: string;
  customData?: { syntropyNode?: SyntropyNodeData };
};

const node = (
  id: string,
  engineId: "complex" | "calculus",
): {
  id: string;
  customData: { syntropyNode: SyntropyNodeData };
} => ({
  id,
  customData: {
    syntropyNode: { engineId, methodId: `${id}-m`, name: id },
  },
});

const arrow = (
  id: string,
  startId: string | null,
  endId: string | null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: "arrow" as const,
  startBinding: startId === null ? null : { elementId: startId },
  endBinding: endId === null ? null : { elementId: endId },
  ...extra,
});

describe("getSyntropyWireStyling", () => {
  it("returns the source node's accent when both ends bind to Syntropy nodes and the arrow is unmarked", () => {
    const byId = new Map<string, TestNode>([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    // start = a (complex, purple), end = b → accent is the SOURCE's.
    expect(getSyntropyWireStyling(arrow("w", "a", "b"), resolve)).toBe(
      "#b45fd0",
    );
  });

  it("returns null when either end is not a Syntropy node", () => {
    const byId = new Map<string, TestNode>([
      ["a", node("a", "complex")],
      ["r", { id: "r", customData: {} }],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(getSyntropyWireStyling(arrow("w", "a", "r"), resolve)).toBeNull();
    expect(getSyntropyWireStyling(arrow("w", "r", "a"), resolve)).toBeNull();
  });

  it("returns null when the arrow is already marked syntropyWire", () => {
    const byId = new Map<string, TestNode>([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    const w = arrow("w", "a", "b", { customData: { syntropyWire: true } });
    expect(getSyntropyWireStyling(w, resolve)).toBeNull();
  });

  it("returns null when a binding is missing", () => {
    const byId = new Map<string, TestNode>([["a", node("a", "complex")]]);
    const resolve = (id: string) => byId.get(id);
    expect(getSyntropyWireStyling(arrow("w", "a", null), resolve)).toBeNull();
    expect(getSyntropyWireStyling(arrow("w", null, "a"), resolve)).toBeNull();
  });
});

describe("styleSyntropyWire", () => {
  it("produces a dashed, diamond-ended wire in the source accent, marked once", () => {
    const upd = styleSyntropyWire(arrow("w", "a", "b"), "#b45fd0");
    expect(upd.strokeStyle).toBe("dashed");
    expect(upd.startArrowhead).toBe("diamond");
    expect(upd.endArrowhead).toBe("diamond");
    expect(upd.strokeColor).toBe("#b45fd0");
    expect(upd.customData.syntropyWire).toBe(true);
  });

  it("preserves existing customData when stamping the marker", () => {
    const w = arrow("w", "a", "b", { customData: { foo: 1 } });
    const upd = styleSyntropyWire(w, "#4f9e82");
    expect(upd.customData.foo).toBe(1);
    expect(upd.customData.syntropyWire).toBe(true);
  });
});

describe("computeLinkedAccent", () => {
  it("returns the source accent for a node an arrow points at", () => {
    const byId = new Map<string, TestNode>([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(computeLinkedAccent("b", [arrow("w", "a", "b")], resolve)).toBe(
      "#b45fd0",
    );
  });

  it("returns null when no arrow targets the node", () => {
    const byId = new Map<string, TestNode>([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(
      computeLinkedAccent("b", [arrow("w", "a", "c")], resolve),
    ).toBeNull();
  });

  it("ignores arrows whose source is not a Syntropy node", () => {
    const byId = new Map<string, TestNode>([
      ["r", { id: "r", customData: {} }],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(
      computeLinkedAccent("b", [arrow("w", "r", "b")], resolve),
    ).toBeNull();
  });
});

describe("stampLinkedAccent", () => {
  it("writes linkedAccent onto the node's syntropyNode customData and preserves the rest", () => {
    const n = node("b", "calculus");
    const upd = stampLinkedAccent(n, "#b45fd0");
    expect(upd.customData.syntropyNode.linkedAccent).toBe("#b45fd0");
    expect(upd.customData.syntropyNode.engineId).toBe("calculus");
    expect(upd.customData.syntropyNode.methodId).toBe("b-m");
    expect(upd.customData.syntropyNode.name).toBe("b");
  });

  it("clears linkedAccent when passed null", () => {
    const n = node("b", "calculus");
    n.customData.syntropyNode.linkedAccent = "#b45fd0";
    const upd = stampLinkedAccent(n, null);
    expect(upd.customData.syntropyNode.linkedAccent).toBeNull();
  });
});
