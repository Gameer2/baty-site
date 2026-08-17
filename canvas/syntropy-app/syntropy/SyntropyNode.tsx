import "./SyntropyNode.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";
import { methodPagePath, openMethodPageByPath } from "./portalPrefill";

type SyntropyNodeProps = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
};

export const SyntropyNode = ({
  engineId,
  methodId,
  name,
  linkedAccent,
}: SyntropyNodeProps) => {
  const accent = ENGINE_ACCENTS[engineId];

  const firstScrubStyle = {
    "--pct": linkedAccent ? "100%" : "50%",
    ...(linkedAccent ? { "--link-accent": linkedAccent } : {}),
  } as React.CSSProperties;
  const firstScrubClass = `SyntropyNode__scrub${
    linkedAccent ? " SyntropyNode__scrub--linked" : ""
  }`;

  return (
    <div
      className="SyntropyNode"
      style={{ "--node-accent": accent } as React.CSSProperties}
    >
      <div className="SyntropyNode__header">
        <span className="SyntropyNode__dot" />
        <span className="SyntropyNode__title">{name}</span>
        <button
          type="button"
          className="SyntropyNode__portal"
          aria-label={`Open ${name} in the lab`}
          onClick={() =>
            openMethodPageByPath(methodPagePath(engineId, methodId))
          }
        >
          Open ↗
        </button>
      </div>
      <div className="SyntropyNode__body">
        <div className={firstScrubClass} style={firstScrubStyle}>
          {linkedAccent && (
            <span className="SyntropyNode__scrubLinktag">↦ linked</span>
          )}
          <div className="SyntropyNode__scrubFill" />
          <div className="SyntropyNode__scrubRow">
            <span className="SyntropyNode__scrubLabel">input</span>
            <span className="SyntropyNode__scrubValue">—</span>
          </div>
        </div>
        <div
          className="SyntropyNode__scrub"
          style={{ "--pct": "50%" } as React.CSSProperties}
        >
          <div className="SyntropyNode__scrubFill" />
          <div className="SyntropyNode__scrubRow">
            <span className="SyntropyNode__scrubLabel">input</span>
            <span className="SyntropyNode__scrubValue">—</span>
          </div>
        </div>
        <div className="SyntropyNode__output">
          <div className="SyntropyNode__outRow">
            <span className="SyntropyNode__outKey">output</span>
            <span className="SyntropyNode__outVal">—</span>
          </div>
        </div>
      </div>
    </div>
  );
};
