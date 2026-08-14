import { runCas } from "./casRunHelpers";

import type { FieldOutput } from "./types";

// Display-only field sampling: calls the worker `sampleField` op and reshapes its result into
// the FieldOutput FieldNode expects. sampleField returns `vectors` as a FLAT array (pushed
// row-major by y), but FieldOutput.vectors is row-grouped `{x,y,dx,dy}[][]` — FieldNode iterates
// `for (const row of vecs) for (const v of row)`, so we regroup the flat list by y-coordinate
// (sampleField visits rows in increasing-y order, so a y change marks a new row). This is pure
// display shaping; it performs no math.
export async function sampleFieldOutput(
  cfg: Record<string, unknown>,
): Promise<{ ok: true; field: FieldOutput } | { ok: false; error?: string }> {
  const r = await runCas("sampleField", [cfg]);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  const grid = r.result.grid as { x: number; y: number; value: number }[][];
  const flat = r.result.vectors as
    | Array<{ x: number; y: number; dx: number; dy: number }>
    | undefined;
  const vectors: { x: number; y: number; dx: number; dy: number }[][] = [];
  let curY: number | null = null;
  let curRow: { x: number; y: number; dx: number; dy: number }[] = [];
  for (const v of flat ?? []) {
    if (curY === null || Math.abs(v.y - curY) > 1e-9) {
      if (curRow.length) {
        vectors.push(curRow);
      }
      curRow = [v];
      curY = v.y;
    } else {
      curRow.push(v);
    }
  }
  if (curRow.length) {
    vectors.push(curRow);
  }
  return {
    ok: true,
    field: {
      grid,
      vectors,
      xLo: Number(r.result.xLo),
      xHi: Number(r.result.xHi),
      yLo: Number(r.result.yLo),
      yHi: Number(r.result.yHi),
      variant: (r.result.variant as FieldOutput["variant"]) ?? "arrows",
    },
  };
}
