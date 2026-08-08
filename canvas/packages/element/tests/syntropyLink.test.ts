import { isSyntropyLinkElement } from "../src/syntropyLink";

describe("isSyntropyLinkElement", () => {
  it("returns true for a syntropy:// link", () => {
    expect(
      isSyntropyLinkElement({ link: "syntropy://node/calculus/riemann-sums" }),
    ).toBe(true);
  });

  it("returns false for a normal http link", () => {
    expect(isSyntropyLinkElement({ link: "https://example.com" })).toBe(
      false,
    );
  });

  it("returns false when there is no link", () => {
    expect(isSyntropyLinkElement({ link: undefined })).toBe(false);
    expect(isSyntropyLinkElement({})).toBe(false);
  });

  it("returns false for an empty string link", () => {
    expect(isSyntropyLinkElement({ link: "" })).toBe(false);
  });
});
