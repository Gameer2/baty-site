import { parse } from "mathjs";

export type CompiledExpression =
  | { ok: true; fn: (x: number) => number }
  | { ok: false; error: string };

/**
 * Parses and compiles a single-variable expression, e.g. "sin(x) + 2". Mirrors the contract of
 * math-lab's Engine.compileFx (math-lab/assets/js/engine-core.js) — same library, same
 * single-variable-scope evaluation shape — but imported as an npm dependency rather than
 * consumed as a vendored script global, since canvas is a real bundled app.
 */
export const compileExpression = (
  exprStr: string,
  variable = "x",
): CompiledExpression => {
  const trimmed = exprStr.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an expression." };
  }
  try {
    const node = parse(trimmed);
    const code = node.compile();
    const fn = (value: number): number => {
      const scope: Record<string, number> = {};
      scope[variable] = value;
      const result = code.evaluate(scope);
      if (typeof result !== "number" || Number.isNaN(result)) {
        throw new Error("not a real number");
      }
      return result;
    };
    fn(1); // smoke-test evaluation, matching Engine.compileFx's own smoke test
    return { ok: true, fn };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
