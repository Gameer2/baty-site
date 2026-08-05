import { describe, expect, it } from "vitest";

import { compileExpression } from "../syntropy/compileExpression";

describe("compileExpression", () => {
  it("compiles a valid expression and evaluates it", () => {
    const result = compileExpression("sin(x) + 2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(0)).toBeCloseTo(2, 10);
    }
  });

  it("reports a parse error for invalid syntax", () => {
    const result = compileExpression("sin(x +");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("reports an error for a blank expression", () => {
    const result = compileExpression("   ");
    expect(result.ok).toBe(false);
  });

  it("respects a custom variable name", () => {
    const result = compileExpression("t * 2", "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(3)).toBe(6);
    }
  });
});
