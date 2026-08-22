import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TourBar } from "@/components/tour-bar";
import { createDefaultState } from "@/lib/storage";
import { useMatchdayStore } from "@/lib/store";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

afterEach(cleanup);

describe("TourBar", () => {
  it("shows step 0 on the slate", () => {
    pathname = "/";
    useMatchdayStore.setState({
      ...createDefaultState(),
      hydrated: true,
      tourStep: 0,
    });
    render(<TourBar />);
    expect(
      screen.getByText("Start here — pick any game from the board."),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("renders nothing once the tour is finished", () => {
    pathname = "/";
    useMatchdayStore.setState({
      ...createDefaultState(),
      hydrated: true,
      tourStep: 4,
    });
    const { container } = render(<TourBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before hydration, to avoid an SSR/hydration flash", () => {
    pathname = "/";
    useMatchdayStore.setState({
      ...createDefaultState(),
      hydrated: false,
      tourStep: 0,
    });
    const { container } = render(<TourBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
