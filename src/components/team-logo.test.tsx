import { fireEvent, render } from "@testing-library/react";
import { expect, it } from "vitest";
import { TeamLogo } from "@/components/team-logo";

it("shows placeholders for unavailable crests and recovers when the opponent changes", () => {
  const { container, rerender } = render(<TeamLogo />);
  expect(container.querySelector("svg")).toBeInTheDocument();
  rerender(<TeamLogo src="https://example.com/first.svg" />);
  expect(container.querySelector("img")).toHaveAttribute("alt", "");
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("svg")).toBeInTheDocument();
  rerender(<TeamLogo src="https://example.com/second.svg" />);
  expect(container.querySelector("img")).toHaveAttribute(
    "src",
    "https://example.com/second.svg",
  );
});
