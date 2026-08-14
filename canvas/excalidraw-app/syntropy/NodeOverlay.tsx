import { useCallback, useLayoutEffect, useRef, useState } from "react";

import "./NodeOverlay.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";
import { computeNodeScreenRect } from "./nodeGeometry";
import { getPortSpec } from "./portSpecs/registry";
import { SyntropyNode } from "./SyntropyNode";
import { NodeBody } from "./nodes/dispatch";
import {
  compatibleTargetInputKeys,
  computeWiredResults,
  extractWireConnections,
} from "./wiring";

import type { SyntropyNodeData } from "./syntropyWire";
import type { ArrowLike, NodeState, WiredComputeResult } from "./wiring";

type OverlayElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  customData?: Record<string, unknown>;
  isDeleted?: boolean;
};

type OverlayArrow = ArrowLike & {
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
};

type OverlayAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
};

type NodeOverlayProps = {
  elements: readonly OverlayElement[];
  arrows: readonly OverlayArrow[];
  appState: OverlayAppState;
  onNodeInputsChange: (
    elementId: string,
    inputs: Record<string, unknown>,
  ) => void;
  /** A drag from an output port dot was released over a compatible input port dot — create the
   *  real connection (App.tsx constructs the underlying invisible arrow, see
   *  createSyntropyWire.ts). */
  onCreateWire: (
    sourceNodeId: string,
    sourceOutputKey: string,
    targetNodeId: string,
    targetInputKey: string,
  ) => void;
  /** The user selected a connection (clicked its curve) and pressed Delete/Backspace. */
  onDeleteWire: (arrowId: string) => void;
  /** Presentation-mode mirror view (see syntropy/presentation.ts): node cards still render so the
   *  mirrored board shows real content, but nothing on this layer should be able to mutate the
   *  scene — the mirror has no `excalidrawAPI` calls of its own wired to anything meaningful, it's
   *  just replaying broadcast state, so an edit here would silently vanish on the next broadcast
   *  anyway. Gating input-editing and wire creation/deletion here (rather than leaving it to that
   *  eventual no-op) keeps the mirror from looking interactive when it isn't. */
  readOnly?: boolean;
};

const EMPTY_RESULT: WiredComputeResult = {
  outputs: {},
  wiredInputKeys: new Set(),
  effectiveInputs: {},
};

type Point = { x: number; y: number };

/** n8n-style connector curve: a horizontal cubic bezier between two ports. */
const bezierPath = (a: Point, b: Point): string => {
  const dx = Math.max(Math.abs(b.x - a.x) * 0.5, 40);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${
    b.y
  }`;
};

const portKey = (nodeId: string, role: "input" | "output", key: string) =>
  `${nodeId}:${role}:${key}`;

/**
 * Renders every Syntropy node as a DOM layer positioned in screen space over the canvas — see
 * docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md's
 * "Architecture" section for why this has to live outside Excalidraw's own DOM tree.
 *
 * Also the single place every wired node gets computed (wiring.ts's computeWiredResults needs
 * to see every node and every wire at once) and the home of the real n8n-style wiring
 * interaction: drag from an output port dot (rendered by SyntropyNodeCard), drop on a
 * compatible input port dot, and a real connection curve is drawn between their live-measured
 * screen positions — replacing the earlier "draw a generic Excalidraw arrow, then pick ports
 * from a dropdown chip" approach, which wasn't what "wire it like n8n" meant.
 */
export const NodeOverlay = ({
  elements,
  arrows,
  appState,
  onNodeInputsChange,
  onCreateWire,
  onDeleteWire,
  readOnly = false,
}: NodeOverlayProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [portPositions, setPortPositions] = useState<Map<string, Point>>(
    new Map(),
  );
  const [dragSource, setDragSource] = useState<{
    nodeId: string;
    outputKey: string;
    accent: string;
  } | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);

  const liveElements = elements.filter((el) => !el.isDeleted);
  const liveArrows = arrows.filter((a) => !a.isDeleted);

  const byId = new Map<string, OverlayElement>();
  for (const el of liveElements) {
    byId.set(el.id, el);
  }
  const resolveNode = (id: string) => byId.get(id);

  const nodeStates: NodeState[] = [];
  for (const el of liveElements) {
    const nodeData = el.customData?.syntropyNode as
      | SyntropyNodeData
      | undefined;
    if (!nodeData) {
      continue;
    }
    nodeStates.push({
      id: el.id,
      engineId: nodeData.engineId,
      methodId: nodeData.methodId,
      inputs: nodeData.inputs ?? {},
    });
  }

  const connections = extractWireConnections(liveArrows, resolveNode);
  const wiredResults = computeWiredResults(nodeStates, connections);

  // Re-measure every port dot's screen-space center whenever the scene (nodes, wires, or the
  // viewport transform) changes — after layout, before paint, so the connector curves never
  // visibly lag a stale position for a frame. Scoped to this overlay's own DOM via containerRef
  // rather than a global querySelectorAll.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const next = new Map<string, Point>();
    const dots = container.querySelectorAll<HTMLElement>(
      "[data-syntropy-port]",
    );
    dots.forEach((dot) => {
      const role = dot.dataset.syntropyPort as "input" | "output" | undefined;
      const nodeId = dot.dataset.portNodeId;
      const key = dot.dataset.portKey;
      if (!role || !nodeId || !key) {
        return;
      }
      const rect = dot.getBoundingClientRect();
      next.set(portKey(nodeId, role, key), {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    });
    setPortPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, arrows, appState]);

  const handleOutputPortPointerDown = useCallback(
    (
      nodeId: string,
      outputKey: string,
      accent: string,
      e: React.PointerEvent,
    ) => {
      if (readOnly) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setDragSource({ nodeId, outputKey, accent });
      setDragPoint({ x: e.clientX, y: e.clientY });
      setSelectedWireId(null);
    },
    [readOnly],
  );

  const specByNodeId = useRef(
    new Map<string, ReturnType<typeof getPortSpec>>(),
  );
  specByNodeId.current = new Map(
    liveElements.map((el) => {
      const nodeData = el.customData?.syntropyNode as
        | SyntropyNodeData
        | undefined;
      return [
        el.id,
        nodeData ? getPortSpec(nodeData.engineId, nodeData.methodId) : null,
      ];
    }),
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      setDragSource((source) => {
        if (!source) {
          return null;
        }
        const target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-syntropy-port="input"]');
        const targetNodeId = target?.dataset.portNodeId;
        const targetInputKey = target?.dataset.portKey;
        if (targetNodeId && targetInputKey && targetNodeId !== source.nodeId) {
          const sourceSpec = specByNodeId.current.get(source.nodeId);
          const targetSpec = specByNodeId.current.get(targetNodeId);
          if (sourceSpec && targetSpec) {
            const compatible = compatibleTargetInputKeys(
              sourceSpec,
              source.outputKey,
              targetSpec,
            );
            if (compatible.includes(targetInputKey)) {
              onCreateWire(
                source.nodeId,
                source.outputKey,
                targetNodeId,
                targetInputKey,
              );
            }
          }
        }
        return null;
      });
      setDragPoint(null);
    },
    [onCreateWire],
  );

  useLayoutEffect(() => {
    if (!dragSource) {
      return;
    }
    const handleMove = (e: PointerEvent) => {
      setDragPoint({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragSource, handlePointerUp]);

  useLayoutEffect(() => {
    if (!selectedWireId || readOnly) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        onDeleteWire(selectedWireId);
        setSelectedWireId(null);
      } else if (e.key === "Escape") {
        setSelectedWireId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedWireId, onDeleteWire, readOnly]);

  return (
    <div className="NodeOverlay" ref={containerRef}>
      {liveElements.map((element) => {
        const nodeData = element.customData?.syntropyNode as
          | SyntropyNodeData
          | undefined;
        if (!nodeData) {
          return null;
        }
        const spec = getPortSpec(nodeData.engineId, nodeData.methodId);
        const rect = computeNodeScreenRect(element, appState);
        const accent = ENGINE_ACCENTS[nodeData.engineId as EngineId];
        // Excalidraw rotates elements around their center, so the overlay card must too. The rect's
        // left/top is the screen-space top-left of the *scaled* box (transform-origin: top left).
        // To rotate around the same center we switch to transform-origin: center and reposition the
        // layout box so its center still lands on the scaled box's center — then rotate(angle) and
        // scale both happen about that center, matching the underlying element exactly.
        const angle = element.angle ?? 0;
        const cx = rect.left + (rect.width * rect.scale) / 2;
        const cy = rect.top + (rect.height * rect.scale) / 2;
        return (
          <div
            key={element.id}
            className="NodeOverlay__node"
            style={{
              left: cx - rect.width / 2,
              top: cy - rect.height / 2,
              width: rect.width,
              height: rect.height,
              transform: `rotate(${angle}rad) scale(${rect.scale})`,
              transformOrigin: "center center",
            }}
          >
            {spec ? (
              <NodeBody
                nodeId={element.id}
                spec={spec}
                name={nodeData.name}
                accent={accent}
                inputs={nodeData.inputs ?? {}}
                onInputsChange={(next) => onNodeInputsChange(element.id, next)}
                computedResult={wiredResults.get(element.id) ?? EMPTY_RESULT}
                onOutputPortPointerDown={(outputKey, e) =>
                  handleOutputPortPointerDown(element.id, outputKey, accent, e)
                }
                readOnly={readOnly}
              />
            ) : (
              <SyntropyNode
                engineId={nodeData.engineId as EngineId}
                methodId={nodeData.methodId}
                name={nodeData.name}
                linkedAccent={nodeData.linkedAccent}
              />
            )}
          </div>
        );
      })}

      <svg className="NodeOverlay__wires">
        {connections.map((c) => {
          const from = portPositions.get(
            portKey(c.sourceNodeId, "output", c.sourceOutputKey),
          );
          const to = portPositions.get(
            portKey(c.targetNodeId, "input", c.targetInputKey),
          );
          if (!from || !to) {
            return null;
          }
          const sourceData = resolveNode(c.sourceNodeId)?.customData
            ?.syntropyNode as SyntropyNodeData | undefined;
          const accent = sourceData
            ? ENGINE_ACCENTS[sourceData.engineId as EngineId]
            : "#ffffff";
          const hasError = Boolean(wiredResults.get(c.targetNodeId)?.error);
          const isSelected = selectedWireId === c.arrowId;
          return (
            <g key={c.arrowId}>
              {/* Fat transparent twin of the curve — the 2.5px visible stroke is
                  thinner than a fingertip, so this 28px hit-path is what a touch
                  actually lands on. Painted first so the visible stroke draws on
                  top; both share the select handler. */}
              <path
                d={bezierPath(from, to)}
                className="NodeOverlay__wire-hit"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!readOnly) {
                    setSelectedWireId(c.arrowId);
                  }
                }}
              />
              <path
                d={bezierPath(from, to)}
                className={`NodeOverlay__wire${
                  isSelected ? " NodeOverlay__wire--selected" : ""
                }${hasError ? " NodeOverlay__wire--error" : ""}`}
                style={{ "--wire-accent": accent } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!readOnly) {
                    setSelectedWireId(c.arrowId);
                  }
                }}
              />
            </g>
          );
        })}

        {dragSource && dragPoint && (
          <path
            d={bezierPath(
              portPositions.get(
                portKey(dragSource.nodeId, "output", dragSource.outputKey),
              ) ?? dragPoint,
              dragPoint,
            )}
            className="NodeOverlay__wire NodeOverlay__wire--dragging"
            style={
              { "--wire-accent": dragSource.accent } as React.CSSProperties
            }
          />
        )}
      </svg>

      {/* Touch has no keyboard for the Delete/Backspace wire-delete handler above, so a
          selected wire also shows a small Delete control at its midpoint. Harmless on desktop
          (more discoverable). position:fixed + translate(-50%,-50%) in CSS turns these viewport
          coords into the button's center. */}
      {(() => {
        const c = connections.find((co) => co.arrowId === selectedWireId);
        if (!c) {
          return null;
        }
        const from = portPositions.get(
          portKey(c.sourceNodeId, "output", c.sourceOutputKey),
        );
        const to = portPositions.get(
          portKey(c.targetNodeId, "input", c.targetInputKey),
        );
        if (!from || !to) {
          return null;
        }
        return (
          <button
            type="button"
            className="NodeOverlay__wireDelete"
            style={{ left: (from.x + to.x) / 2, top: (from.y + to.y) / 2 }}
            onClick={() => {
              onDeleteWire(c.arrowId);
              setSelectedWireId(null);
            }}
          >
            Delete
          </button>
        );
      })()}
    </div>
  );
};
