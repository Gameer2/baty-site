import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RiemannPlot } from "../syntropy/RiemannPlot";

const RECTANGLES = [
  { i: 0, x0: 0, x1: 1, mid: 0.5, height: 2, area: 2, running: 2 },
  { i: 1, x0: 1, x1: 2, mid: 1.5, height: 3, area: 3, running: 5 },
];

describe("RiemannPlot", () => {
  it("draws one rect per rectangle", () => {
    const { container } = render(
      <RiemannPlot rectangles={RECTANGLES} accent="#4f9e82" />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(2);
  });

  it("renders nothing but the empty-state message for zero rectangles", () => {
    const { container, getByText } = render(
      <RiemannPlot rectangles={[]} accent="#4f9e82" />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(0);
    expect(getByText(/no data/i)).toBeTruthy();
  });
});
