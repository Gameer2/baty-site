import { getSyntropyMinSize } from "../src/syntropyMinSize";

describe("getSyntropyMinSize", () => {
  it("returns the min size when customData carries it", () => {
    expect(
      getSyntropyMinSize({
        customData: { syntropyNode: { minWidth: 260, minHeight: 336 } },
      }),
    ).toEqual({ minWidth: 260, minHeight: 336 });
  });

  it("returns null when there is no syntropyNode customData", () => {
    expect(getSyntropyMinSize({})).toBeNull();
    expect(getSyntropyMinSize({ customData: {} })).toBeNull();
    expect(
      getSyntropyMinSize({ customData: { somethingElse: true } }),
    ).toBeNull();
  });

  it("returns null when minWidth/minHeight are missing or not numbers", () => {
    expect(
      getSyntropyMinSize({
        customData: { syntropyNode: { engineId: "calculus" } },
      }),
    ).toBeNull();
    expect(
      getSyntropyMinSize({
        customData: { syntropyNode: { minWidth: "260", minHeight: 336 } },
      }),
    ).toBeNull();
  });
});
