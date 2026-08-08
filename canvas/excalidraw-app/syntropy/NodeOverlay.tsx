import "./NodeOverlay.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";
import { computeNodeScreenRect } from "./nodeGeometry";
import { getPortSpec } from "./portSpecs/registry";
import { SyntropyNode } from "./SyntropyNode";
import { SyntropyNodeCard } from "./SyntropyNodeCard";

import type { SyntropyNodeData } from "./syntropyWire";

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

type OverlayAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
};

type NodeOverlayProps = {
  elements: readonly OverlayElement[];
  appState: OverlayAppState;
  onNodeInputsChange: (
    elementId: string,
    inputs: Record<string, unknown>,
  ) => void;
};

/**
 * Renders every Syntropy node as a DOM layer positioned in screen space over the canvas — see
 * docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md's
 * "Architecture" section for why this has to live outside Excalidraw's own DOM tree: embeddable
 * content is pointer-events:none !important (packages/excalidraw/css/styles.scss) unless
 * `.excalidraw--embeds`, so an in-tree Open button would be unclickable. Rendering here escapes
 * that gate for ALL nodes — port-spec nodes get the interactive SyntropyNodeCard, the rest get the
 * SyntropyNode shell (whose Open button now works too, where it didn't when it went through
 * renderEmbeddable).
 */
export const NodeOverlay = ({
  elements,
  appState,
  onNodeInputsChange,
}: NodeOverlayProps) => {
  return (
    <div className="NodeOverlay">
      {elements.map((element) => {
        // `elements` includes soft-deleted elements (App.tsx feeds this from
        // getElementsIncludingDeleted, since Excalidraw's own onChange does
        // too) — skip them, or a deleted node's card stays stuck on screen
        // forever even though the underlying element is correctly gone.
        if (element.isDeleted) {
          return null;
        }
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
              <SyntropyNodeCard
                spec={spec}
                name={nodeData.name}
                accent={accent}
                inputs={nodeData.inputs ?? {}}
                onInputsChange={(next) => onNodeInputsChange(element.id, next)}
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
    </div>
  );
};
