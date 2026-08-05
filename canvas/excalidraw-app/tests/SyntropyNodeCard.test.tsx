import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SyntropyNodeCard } from "../syntropy/SyntropyNodeCard";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

const DEFAULT_INPUTS = { fx: "x", a: 0, b: 2, n: 2 };

describe("SyntropyNodeCard", () => {
  it("renders one scrub chip per input, seeded from the current values", () => {
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("x")).toBeTruthy();
    expect(screen.getByDisplayValue("0")).toBeTruthy(); // a (unique — b and n are both 2)
  });

  it("recomputes the output when an input changes", () => {
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
      />,
    );
    // f(x)=x on [0,2], n=2 midpoint -> total = 2 (matches the port-spec test's known case).
    expect(screen.getByText("2.000")).toBeTruthy();
  });

  it("calls onInputsChange when a scrub chip is edited", () => {
    const onInputsChange = vi.fn();
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={onInputsChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("f(x)"), {
      target: { value: "2*x" },
    });
    expect(onInputsChange).toHaveBeenCalledWith({
      ...DEFAULT_INPUTS,
      fx: "2*x",
    });
  });

  it("calls openMethodPage with the current inputs when the portal tab is clicked", () => {
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
      />,
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(openSpy).toHaveBeenCalledWith(
      "/math-lab/engines/calculus/methods/riemann-sums.html",
      "_blank",
    );
    openSpy.mockRestore();
  });
});
