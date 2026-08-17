import { derivative, parse } from "mathjs";

export type CompiledExpression =
  | { ok: true; fn: (x: number) => number }
  | { ok: false; error: string };

export type CompiledVectorExpression =
  | { ok: true; fn: (xVec: number[]) => number }
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

/**
 * Symbolically differentiates and compiles an expression, e.g. "x^3 - x" -> "3 * x^2 - 1".
 * Mirrors math-lab's Engine.derivativeFx (math-lab/assets/js/engine-core.js) — same mathjs
 * `derivative()` call, same single-variable-scope evaluation shape — so methods like
 * Newton-Raphson that auto-derive f'(x) on the page get the identical function on canvas.
 *
 * `order` chains `derivative()` on its own output node (order=2 gives f''), matching
 * newton-multiple-roots.js's own `Engine.derivativeFx(Engine.derivativeFx(compiled.node).node)`.
 */
export const differentiateExpression = (
  exprStr: string,
  variable = "x",
  order = 1,
): CompiledExpression => {
  const trimmed = exprStr.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an expression." };
  }
  try {
    let dnode = derivative(trimmed, variable);
    for (let i = 1; i < order; i++) {
      dnode = derivative(dnode, variable);
    }
    const code = dnode.compile();
    const fn = (value: number): number => {
      const scope: Record<string, number> = {};
      scope[variable] = value;
      const result = code.evaluate(scope);
      if (typeof result !== "number" || Number.isNaN(result)) {
        throw new Error("not a real number");
      }
      return result;
    };
    fn(1); // smoke-test evaluation
    return { ok: true, fn };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Parses and compiles a multi-variable expression over a scope x1..xn, e.g.
 * "x1^2 + x2^2 - 2" with n=2. Mirrors newton-nonlinear-systems.js's and broydens-method.js's own
 * local `compileEq`/`compileEquation` (there is no shared engine-core equivalent for the
 * multi-variable case — those page functions are themselves the thing being mirrored, same
 * mathjs parse/compile call and x1..xn scope convention).
 */
export const compileVectorExpression = (
  exprStr: string,
  n: number,
): CompiledVectorExpression => {
  const trimmed = exprStr.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an expression." };
  }
  try {
    const node = parse(trimmed);
    const code = node.compile();
    const fn = (xVec: number[]): number => {
      const scope: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        scope[`x${i + 1}`] = xVec[i];
      }
      const result = code.evaluate(scope);
      if (typeof result !== "number" || Number.isNaN(result)) {
        throw new Error("not a real number");
      }
      return result;
    };
    fn(new Array(n).fill(1)); // smoke-test evaluation
    return { ok: true, fn };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
