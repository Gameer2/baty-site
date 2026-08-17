/**
 * Parsers/formatters for the composite port-input kinds ("points", "coeffs", "vector",
 * "matrix") added in the port-spec rollout past Riemann Sums. SyntropyNodeCard's input renders
 * these as a plain text field, so a node's value starts as whatever shape the spec's `default`
 * declares (a real number[]/number[][] — nicer to author) but becomes a delimited string the
 * moment a user edits it. Every parse* function here accepts both shapes so compute() doesn't
 * have to care which one it got.
 *
 * String delimiters: "1,2,3" for coeffs/vector; "0,1;1,3;2,2" for points (semicolon-separated
 * x,y pairs); "1,2;3,4" for matrix rows.
 */

export type Point = { x: number; y: number };

export const parsePoints = (value: unknown): Point[] => {
  if (Array.isArray(value)) {
    return (value as number[][]).map(([x, y]) => ({
      x: Number(x),
      y: Number(y),
    }));
  }
  const str = String(value ?? "").trim();
  if (!str) {
    return [];
  }
  return str
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",").map((s) => Number(s.trim()));
      return { x, y };
    });
};

export const parseNumberList = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return (value as unknown[]).map(Number);
  }
  const str = String(value ?? "").trim();
  if (!str) {
    return [];
  }
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
};

export const parseMatrix = (value: unknown): number[][] => {
  if (Array.isArray(value) && Array.isArray((value as unknown[])[0])) {
    return (value as number[][]).map((row) => row.map(Number));
  }
  const str = String(value ?? "").trim();
  if (!str) {
    return [];
  }
  return str
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((row) => row.split(",").map((s) => Number(s.trim())));
};

export const parseExpressionList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return (value as unknown[]).map(String);
  }
  const str = String(value ?? "").trim();
  if (!str) {
    return [];
  }
  return str
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
};

export const formatPoints = (points: Point[]): string =>
  points.map((p) => `${p.x},${p.y}`).join(";");

export const formatNumberList = (values: number[]): string => values.join(",");

export const formatMatrix = (rows: number[][]): string =>
  rows.map((row) => row.join(",")).join(";");
