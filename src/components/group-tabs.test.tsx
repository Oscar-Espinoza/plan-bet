import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GroupTabs } from "./group-tabs";
import { LanguageProvider } from "./language-provider";

afterEach(cleanup);

describe("group sections", () => {
  it("opens activity first and keeps member forms in their own keyboard-accessible tab", () => {
    render(
      <GroupTabs
        overview={
          <>
            <h2>Recent bets</h2>
            <h2>Leaderboard</h2>
          </>
        }
        members={
          <label>
            Invite
            <input />
          </label>
        }
      />,
    );
    expect(screen.getByRole("heading", { name: "Recent bets" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Overview" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("tab", { name: "Members" })).toHaveFocus();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "friend@example.com" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Members" }));
    expect(screen.getByRole("textbox")).toHaveValue("friend@example.com");
  });

  it("translates both tabs", () => {
    render(
      <LanguageProvider locale="es">
        <GroupTabs overview="activity" members="members" />
      </LanguageProvider>,
    );
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Miembros" })).toBeVisible();
  });
});
