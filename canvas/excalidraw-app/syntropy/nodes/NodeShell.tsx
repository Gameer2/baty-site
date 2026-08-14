import "./NodeShell.scss";

import type { PortOutputKind, PortSpec } from "../portSpecs/types";

type NodeShellProps = {
  name: string;
  accent: string;
  nodeId: string;
  spec: PortSpec;
  onPortalClick: () => void;
  children: React.ReactNode;
  className?: string;
};

/** Shared chrome for every archetype: header (engine dot + title + portal), body wrapper, error
 *  slot. The premium shell (radial glow, accent spine, fill-sweep portal) lives in NodeShell.scss
 *  — moved verbatim from SyntropyNodeCard.scss. No crosshair corners (explicitly rejected). */
export const NodeShell = ({
  name,
  accent,
  nodeId,
  spec,
  onPortalClick,
  children,
  className,
}: NodeShellProps) => (
  <div
    className={`NodeShell${className ? ` ${className}` : ""}`}
    style={{ "--node-accent": accent } as React.CSSProperties}
    data-node-id={nodeId}
  >
    <div className="NodeShell__header">
      <span className="NodeShell__dot" />
      <span className="NodeShell__title">{name}</span>
      <button
        type="button"
        className="NodeShell__portal"
        aria-label={`Open ${name} in the lab`}
        onClick={onPortalClick}
      >
        Open ↗
      </button>
    </div>
    <div className="NodeShell__body">{children}</div>
  </div>
);

type PortDotProps = {
  role: "input" | "output";
  nodeId: string;
  portKey: string;
  kind: PortOutputKind;
  onPointerDown?: (event: React.PointerEvent<HTMLSpanElement>) => void;
  className?: string;
};

/** The one component that owns the wiring DOM contract. `NodeOverlay.tsx` queries
 *  `[data-syntropy-port]` and reads `data-port-node-id` / `data-port-key` to measure port screen
 *  positions and resolve drag-to-wire drops — every archetype renders its port dots through
 *  this so the contract can't drift. */
export const PortDot = ({
  role,
  nodeId,
  portKey,
  onPointerDown,
  className,
}: PortDotProps) => (
  <span
    className={`NodeShell__port NodeShell__port--${role}${
      className ? ` ${className}` : ""
    }`}
    data-syntropy-port={role}
    data-port-node-id={nodeId}
    data-port-key={portKey}
    onPointerDown={onPointerDown}
    role={role === "output" ? "button" : undefined}
    tabIndex={role === "output" ? -1 : undefined}
    aria-hidden={role === "input" ? true : undefined}
    aria-label={
      role === "output" ? `Drag to wire ${portKey} to another node` : undefined
    }
  />
);
