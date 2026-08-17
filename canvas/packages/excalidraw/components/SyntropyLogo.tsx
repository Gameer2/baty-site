import "./SyntropyLogo.scss";

type LogoSize = "xs" | "small" | "normal" | "large" | "custom" | "mobile";

interface LogoProps {
  size?: LogoSize;
  withText?: boolean;
  style?: React.CSSProperties;
}

export const SyntropyLogo = ({
  style,
  size = "small",
  withText,
}: LogoProps) => {
  return (
    <div className={`SyntropyLogo is-${size}`} style={style}>
      <img
        className="SyntropyLogo-icon"
        src="/syntropy-logo.png"
        alt="Syntropy"
      />
      {withText && <span className="SyntropyLogo-text">Syntropy Canvas</span>}
    </div>
  );
};
