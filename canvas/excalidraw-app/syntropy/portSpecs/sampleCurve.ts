/** Display sampling for the real-line (curve) archetype: evaluate a function at a uniform set
 *  of x's over `[lo, hi]` and return the `{ x, y }` points a CurveOutput's `points` field carries.
 *
 *  The function is either the method's already-compiled input expression (quadrature — the
 *  integrand `f` graphed over `[a, b]`) or the core's own evaluator applied at sample x's
 *  (interpolation / regression — the interpolant or fitted line traced over the data range).
 *  Either way this is display sampling, not new math: the method's real result (the quadrature
 *  total, the interpolation value, the regression coefficients) stays a separate `number`
 *  output. Non-finite samples (a singularity at an endpoint) are dropped so a single blow-up
 *  can't NaN the whole plot; if too few finite samples remain the renderer simply draws no
 *  curve. */
export const samplePoints = (
  fn: (x: number) => number,
  lo: number,
  hi: number,
  steps = 60,
): { x: number; y: number }[] => {
  const span = hi - lo;
  if (!Number.isFinite(span) || span === 0) {
    const y = fn(lo);
    const y2 = fn(hi);
    const pts: { x: number; y: number }[] = [];
    if (Number.isFinite(y)) {
      pts.push({ x: lo, y });
    }
    if (Number.isFinite(y2)) {
      pts.push({ x: hi, y: y2 });
    }
    return pts;
  }
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = lo + (i * span) / steps;
    const y = fn(x);
    if (Number.isFinite(y)) {
      pts.push({ x, y });
    }
  }
  return pts;
};
