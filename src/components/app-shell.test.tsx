import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/components/language-provider";
import { AppShell } from "@/components/app-shell";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@/components/buddy", () => ({ Buddy: () => null }));
vi.mock("@/components/tour-bar", () => ({ TourBar: () => null }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

describe("Groups navigation", () => {
  it.each(["/groups", "/groups/new", "/groups/friends"])(
    "selects Groups in both layouts on %s",
    (pathname) => {
      navigation.pathname = pathname;
      render(
        <AppShell>
          <div />
        </AppShell>,
      );
      for (const name of ["Primary navigation", "Mobile navigation"]) {
        const nav = within(screen.getByRole("navigation", { name }));
        expect(nav.getByRole("link", { name: "Groups" })).toHaveAttribute(
          "href",
          "/groups",
        );
        expect(nav.getByRole("link", { name: "Groups" })).toHaveAttribute(
          "aria-current",
          "page",
        );
        expect(
          nav.queryByRole("link", { name: "Stats" }),
        ).not.toBeInTheDocument();
        expect(
          nav
            .getAllByRole("link")
            .filter((link) => link.getAttribute("aria-current") === "page"),
        ).toHaveLength(1);
      }
    },
  );

  it("labels the destination Grupos in Spanish", () => {
    navigation.pathname = "/groups";
    render(
      <LanguageProvider locale="es">
        <AppShell>
          <div />
        </AppShell>
      </LanguageProvider>,
    );
    expect(screen.getAllByRole("link", { name: "Grupos" })).toHaveLength(2);
  });
});
