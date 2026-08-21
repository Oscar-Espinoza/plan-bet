import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "@/components/app-shell";
import { createDefaultState } from "@/lib/storage";
import { useMatchdayStore } from "@/lib/store";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => nav.pathname,
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

function renderShell(pathname: string) {
  nav.pathname = pathname;
  return render(
    <AppShell>
      <div />
    </AppShell>,
  );
}

describe("workspace controls on a game route", () => {
  beforeEach(() => {
    nav.push.mockClear();
    useMatchdayStore.setState({ ...createDefaultState(), hydrated: true });
  });

  afterEach(cleanup);

  it("sends a team change back to that team's games", () => {
    renderShell("/games/football-data-564630-barcelona");

    fireEvent.change(screen.getByLabelText("Selected team"), {
      target: { value: "barcelona" },
    });

    expect(useMatchdayStore.getState().selectedTeamSlug).toBe("barcelona");
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("sends a sport change back to that sport's games", () => {
    renderShell("/games/football-data-564630-barcelona");

    fireEvent.click(screen.getByRole("button", { name: "Baseball" }));

    expect(useMatchdayStore.getState().selectedSport).toBe("baseball");
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("leaves navigation alone when the current page already follows the selection", () => {
    renderShell("/groups");

    fireEvent.change(screen.getByLabelText("Selected team"), {
      target: { value: "barcelona" },
    });

    expect(useMatchdayStore.getState().selectedTeamSlug).toBe("barcelona");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("does not navigate when the active sport is re-selected", () => {
    renderShell("/games/football-data-564630-barcelona");

    fireEvent.click(screen.getByRole("button", { name: "Soccer" }));

    expect(nav.push).not.toHaveBeenCalled();
  });
});
