import "./RiemannPlot.scss";

type Rectangle = {
  x0: number;
  x1: number;
  mid: number;
  height: number;
};

type RiemannPlotProps = {
  rectangles: Rectangle[];
  accent: string;
};

const VIEW_WIDTH = 260;
const VIEW_HEIGHT = 100;
const PAD = 6;

/**
 * Inline SVG bar chart of the Riemann rectangles Algorithms.runRiemannSum returns — the mockup's
 * .plot5-2d treatment (docs/superpowers/specs/assets/2026-08-04-math-canvas-v6-mockup.html),
 * built from the node's own real output rather than a placeholder box.
 */
export const RiemannPlot = ({ rectangles, accent }: RiemannPlotProps) => {
  if (rectangles.length === 0) {
    return <p className="RiemannPlot__empty">No data to plot.</p>;
  }

  const xMin = rectangles[0].x0;
  const xMax = rectangles[rectangles.length - 1].x1;
  const yMax = Math.max(0, ...rectangles.map((r) => r.height));
  const yMin = Math.min(0, ...rectangles.map((r) => r.height));
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const plotWidth = VIEW_WIDTH - PAD * 2;
  const plotHeight = VIEW_HEIGHT - PAD * 2;
  const scaleX = (x: number) => PAD + ((x - xMin) / xSpan) * plotWidth;
  const scaleY = (y: number) =>
    PAD + plotHeight - ((y - yMin) / ySpan) * plotHeight;
  const baselineY = scaleY(0);

  return (
    <svg
      className="RiemannPlot"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Riemann sum rectangles"
    >
      <line
        x1={PAD}
        y1={baselineY}
        x2={VIEW_WIDTH - PAD}
        y2={baselineY}
        // currentColor so the axis follows the theme — .RiemannPlot sets
        // color: var(--color-gray-60) (a hairline that reads on both the
        // light and dark plot surfaces).
        stroke="currentColor"
        strokeOpacity={0.5}
      />
      {rectangles.map((r, index) => {
        const x = scaleX(r.x0);
        const width = Math.max(0, scaleX(r.x1) - scaleX(r.x0));
        const top = Math.min(baselineY, scaleY(r.height));
        const height = Math.abs(scaleY(r.height) - baselineY);
        return (
          <rect
            key={index}
            x={x}
            y={top}
            width={width}
            height={height}
            fill={accent}
            fillOpacity={0.28}
            stroke={accent}
            strokeOpacity={0.7}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
};
