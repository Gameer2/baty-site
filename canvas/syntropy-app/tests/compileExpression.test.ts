import { describe, expect, it } from "vitest";

import {
  compileExpression,
  differentiateExpression,
} from "../syntropy/compileExpression";

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

describe("differentiateExpression", () => {
  it("differentiates a polynomial and evaluates the derivative", () => {
    // d/dx(x^3 - x - 2) = 3x^2 - 1; at x=2 -> 11
    const result = differentiateExpression("x^3 - x - 2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(2)).toBeCloseTo(11, 10);
    }
  });

  it("reports a parse error for invalid syntax", () => {
    const result = differentiateExpression("sin(x +");
    expect(result.ok).toBe(false);
  });

  it("reports an error for a blank expression", () => {
    const result = differentiateExpression("   ");
    expect(result.ok).toBe(false);
  });

  it("respects a custom variable name", () => {
    // d/dt(t^2) = 2t; at t=3 -> 6
    const result = differentiateExpression("t^2", "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(3)).toBeCloseTo(6, 10);
    }
  });

  it("chains to a second derivative when order=2", () => {
    // d2/dx2(x^3 - x - 2) = 6x; at x=2 -> 12
    const result = differentiateExpression("x^3 - x - 2", "x", 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(2)).toBeCloseTo(12, 10);
    }
  });
});
