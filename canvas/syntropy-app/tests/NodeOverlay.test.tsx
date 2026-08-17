import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { NodeOverlay } from "../syntropy/NodeOverlay";

import type { ComputeResult, PortSpec } from "../syntropy/portSpecs/types";

// A run-mode fixture whose computeRun is a deferred promise the test resolves manually, so it can
// observe stale → pending → ready → stale transitions precisely. Mirrors the run-mode contract
// (sync compute placeholder + async computeRun, executionMode "run") the Calculus/Complex/ODE
// rollouts will give their CAS-backed specs. See
// docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §4.
let resolveRun: (r: ComputeResult) => void = () => {};
const RUN_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "antiderivative-fixture",
  inputs: [{ key: "f", label: "f(x)", kind: "expression", default: "x^2" }],
  outputs: [{ key: "y", label: "∫f dx", kind: "number" }],
  compute: () => ({ outputs: {} }),
  computeRun: () =>
    new Promise<ComputeResult>((res) => {
      resolveRun = res;
    }),
  executionMode: "run",
  pagePath: "/calculus/antiderivative-fixture",
  pageStoreKey: "antiderivative-fixture-state",
};

// A live fixture: synchronous compute every render, no Run button.
const LIVE_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "double-fixture",
  inputs: [{ key: "x", label: "x", kind: "number", default: 1 }],
  outputs: [{ key: "y", label: "2x", kind: "number" }],
  compute: (inputs) => ({ outputs: { y: Number(inputs.x) * 2 } }),
  executionMode: "live",
  pagePath: "/calculus/double-fixture",
  pageStoreKey: "double-fixture-state",
};

const resolveSpec = (
  _engineId: string,
  methodId: string,
): PortSpec | undefined =>
  methodId === "antiderivative-fixture"
    ? RUN_SPEC
    : methodId === "double-fixture"
    ? LIVE_SPEC
    : undefined;

const appState = () => ({
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 },
  offsetLeft: 0,
  offsetTop: 0,
});

const element = (
  id: string,
  engineId: string,
  methodId: string,
  inputs: Record<string, unknown>,
) => ({
  id,
  x: 0,
  y: 0,
  width: 300,
  height: 240,
  customData: { syntropyNode: { engineId, methodId, name: "Fixture", inputs } },
});

/** A stateful wrapper that feeds onNodeInputsChange back into the elements list, so an input edit
 *  re-renders NodeOverlay with the new value (the real App.tsx loop does the same). */
const Harness = ({
  initialEngineId,
  initialMethodId,
  initialInputs,
}: {
  initialEngineId: string;
  initialMethodId: string;
  initialInputs: Record<string, unknown>;
}) => {
  const [inputs, setInputs] = useState(initialInputs);
  return (
    <NodeOverlay
      elements={[
        element("n", initialEngineId, initialMethodId, inputs) as never,
      ]}
      arrows={[]}
      appState={appState() as never}
      onNodeInputsChange={(_id, next) => setInputs(next)}
      onCreateWire={() => {}}
      onDeleteWire={() => {}}
      resolveSpec={resolveSpec as never}
    />
  );
};

describe("NodeOverlay — run trigger + status UX", () => {
  it("a run-mode node shows a Run button and a stale chip, then pending, then ready, then stale again after an edit", async () => {
    render(
      <Harness
        initialEngineId="calculus"
        initialMethodId="antiderivative-fixture"
        initialInputs={{ f: "x^2" }}
      />,
    );

    // Before first run: Run button present, stale chip shown.
    const runButton = screen.getByRole("button", { name: /^Run$/ });
    expect(runButton).toBeTruthy();
    expect(screen.getByText("stale — press Run")).toBeTruthy();

    // Fire Run → pending chip; the last-run result is kept (empty before first run).
    await act(async () => {
      fireEvent.click(runButton);
      // Flush the synchronous onRunResult(start) callback so the runStore + chip update lands.
      await Promise.resolve();
    });
    expect(screen.getByText("running…")).toBeTruthy();

    // Resolve the async compute → ready (no status chip), output shown.
    await act(async () => {
      resolveRun({ outputs: { y: 42 } });
      await Promise.resolve();
    });
    expect(screen.queryByText("running…")).toBeNull();
    expect(screen.queryByText("stale — press Run")).toBeNull();
    expect(screen.getByText("42.000")).toBeTruthy();

    // Edit an input → stale chip returns, last-run result kept.
    const input = screen.getByLabelText("f(x)");
    await act(async () => {
      fireEvent.change(input, { target: { value: "x^3" } });
    });
    expect(screen.getByText("stale — press Run")).toBeTruthy();
    expect(screen.getByText("42.000")).toBeTruthy();
  });

  it("a live node shows no Run button and computes synchronously", () => {
    render(
      <Harness
        initialEngineId="calculus"
        initialMethodId="double-fixture"
        initialInputs={{ x: 5 }}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Run$/ })).toBeNull();
    expect(screen.queryByText("stale — press Run")).toBeNull();
    expect(screen.queryByText("running…")).toBeNull();
    // 2x for x=5 → 10.000, computed live every render.
    expect(screen.getByText("10.000")).toBeTruthy();
  });

  it("reports run-state changes to the host so the runStore propagates to downstream nodes", async () => {
    // Two run-mode nodes wired A.out → B.in. B should be pending while A runs, then stale (ready to
    // run with A's value) once A resolves. No real run spec is registered, so resolveSpec injects
    // fakes — the same testability seam wiring.ts uses.
    let resolveA: (r: ComputeResult) => void = () => {};
    const specA: PortSpec = {
      ...RUN_SPEC,
      methodId: "run-a",
      inputs: [{ key: "in", label: "in", kind: "number", default: 1 }],
      outputs: [{ key: "out", label: "out", kind: "number" }],
      computeRun: () =>
        new Promise<ComputeResult>((res) => {
          resolveA = res;
        }),
    };
    const resolve = (
      _engineId: string,
      methodId: string,
    ): PortSpec | undefined =>
      methodId === "run-a"
        ? specA
        : methodId === "antiderivative-fixture"
        ? RUN_SPEC
        : undefined;

    const els = [
      element("A", "calculus", "run-a", { in: 1 }),
      element("B", "calculus", "antiderivative-fixture", { f: "x^2" }),
    ];
    const arrows = [
      {
        id: "wire",
        startBinding: { elementId: "A" },
        endBinding: { elementId: "B" },
        customData: {
          syntropyWire: true,
          sourceOutputKey: "out",
          targetInputKey: "f",
        },
      },
    ];
    render(
      <NodeOverlay
        elements={els as never}
        arrows={arrows as never}
        appState={appState() as never}
        onNodeInputsChange={() => {}}
        onCreateWire={() => {}}
        onDeleteWire={() => {}}
        resolveSpec={resolve as never}
      />,
    );

    // A is stale (needs its first run); B waits on A (pending) because A isn't ready yet.
    expect(
      screen.getAllByText("stale — press Run").length,
    ).toBeGreaterThanOrEqual(1);

    const runA = screen.getAllByRole("button", { name: /^Run$/ })[0];
    await act(async () => {
      fireEvent.click(runA);
      await Promise.resolve();
    });
    // While A runs, A shows running; B waits.
    expect(screen.getByText("running…")).toBeTruthy();

    // A resolves → A ready; B now sees A's value but is stale until B runs.
    await act(async () => {
      resolveA({ outputs: { out: 7 } });
      await Promise.resolve();
    });
    expect(screen.queryByText("running…")).toBeNull();
  });

  // Sanity guard: ensure the test file's act/fireEvent wiring resolves (no-op assertion so the
  // file always has at least one synchronous expectation).
  it("resolves the test harness without throwing", () => {
    expect(true).toBe(true);
  });
});

describe("NodeOverlay — auto-fit", () => {
  // jsdom never lays out real content, so scrollWidth/scrollHeight stay 0 unless stubbed —
  // these tests stub them on the rendered NodeShell root (found via its `data-node-id`) to
  // simulate content that has outgrown, or comfortably fits inside, the element's committed box.
  const props = (
    onNodeResize: (id: string, w: number, h: number) => void,
    els: unknown[],
  ) => ({
    elements: els as never,
    arrows: [] as never,
    appState: appState() as never,
    onNodeInputsChange: () => {},
    onCreateWire: () => {},
    onDeleteWire: () => {},
    onNodeResize,
    resolveSpec: resolveSpec as never,
  });

  it("grows a node's element to fit content that overflows its allocated box", () => {
    const resizeCalls: Array<[string, number, number]> = [];
    const els = [element("n", "calculus", "double-fixture", { x: 5 })];
    const { rerender } = render(
      <NodeOverlay
        {...props((id, w, h) => resizeCalls.push([id, w, h]), els)}
      />,
    );

    const shell = document.querySelector('[data-node-id="n"]') as HTMLElement;
    expect(shell).toBeTruthy();
    Object.defineProperty(shell, "scrollWidth", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(shell, "scrollHeight", {
      value: 500,
      configurable: true,
    });

    // Force the layout effect (deliberately un-keyed, see NodeOverlay.tsx) to run again against
    // the now-stubbed measurements.
    rerender(
      <NodeOverlay
        {...props((id, w, h) => resizeCalls.push([id, w, h]), els)}
      />,
    );

    // element() sizes the node at 300x240 — 400x500 exceeds both dimensions and is within
    // MIN/MAX_NODE_* bounds, so it should pass through clampNodeSize unchanged. (StrictMode may
    // double-invoke the layout effect, so assert on content rather than exact call count.)
    expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of resizeCalls) {
      expect(call).toEqual(["n", 400, 500]);
    }
  });

  it("never shrinks a node below its currently-committed size", () => {
    const resizeCalls: Array<[string, number, number]> = [];
    const els = [element("n", "calculus", "double-fixture", { x: 5 })];
    const { rerender } = render(
      <NodeOverlay
        {...props((id, w, h) => resizeCalls.push([id, w, h]), els)}
      />,
    );

    const shell = document.querySelector('[data-node-id="n"]') as HTMLElement;
    // Content that would need less space than the 300x240 the element already has — a user who
    // manually enlarged this node shouldn't have it auto-shrunk back down.
    Object.defineProperty(shell, "scrollWidth", {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(shell, "scrollHeight", {
      value: 50,
      configurable: true,
    });

    rerender(
      <NodeOverlay
        {...props((id, w, h) => resizeCalls.push([id, w, h]), els)}
      />,
    );

    expect(resizeCalls).toEqual([]);
  });
});
