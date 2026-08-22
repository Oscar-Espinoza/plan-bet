import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

// Phase B removed the topbar sport toggle and team select once the slate
// replaced them as the one way to find a game — WorkspaceControls now only
// carries whatever the caller passes as accountControl.
describe("workspace controls", () => {
  it("renders only the account control, with no sport toggle or team select", () => {
    render(
      <AppShell accountControl={<button type="button">Account</button>}>
        <div />
      </AppShell>,
    );

    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Selected team")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select sport")).not.toBeInTheDocument();
  });
});
