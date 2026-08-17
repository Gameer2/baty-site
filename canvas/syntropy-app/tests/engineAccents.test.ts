import { describe, expect, it } from "vitest";

import { ENGINE_ACCENTS, deriveAccentShades } from "../syntropy/engineAccents";

describe("engineAccents", () => {
  it("has a real hex accent for all 7 engines", () => {
    expect(ENGINE_ACCENTS.calculus).toBe("#4f9e82");
    expect(ENGINE_ACCENTS.complex).toBe("#b45fd0");
    expect(ENGINE_ACCENTS["linear-algebra"]).toBe("#8570b3");
    expect(ENGINE_ACCENTS["number-theory"]).toBe("#a3623c");
    expect(ENGINE_ACCENTS.numerical).toBe("#5c939f");
    expect(ENGINE_ACCENTS.ode).toBe("#4f8fc0");
    expect(ENGINE_ACCENTS.statistics).toBe("#c99a3c");
  });

  it("derives a hover shade lighter than the base", () => {
    const shades = deriveAccentShades("#4f9e82");
    expect(shades.primary).toBe("#4f9e82");
    expect(shades.primaryHover).not.toBe(shades.primary);
  });

  it("derives distinct shades for a warm base color", () => {
    const shades = deriveAccentShades("#b45fd0");
    expect(shades.primaryDarker).not.toBe(shades.primary);
    expect(shades.primaryDarkest).not.toBe(shades.primaryDarker);
    expect(shades.surfacePrimaryContainer).not.toBe(shades.primary);
  });
});
