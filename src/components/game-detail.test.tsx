import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameDetail } from "@/components/game-detail";
import { createEvidenceBriefing } from "@/lib/briefing";
import { allGames, getSnapshot, getTeam } from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";
import { formatDateTime } from "@/lib/utils";
import type { GameSnapshot } from "@/lib/contracts";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/games/test",
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

const base = getSnapshot(allGames[0]!.id)!;
const team = getTeam(base.game.teamSlug)!;
const scheduledAt = base.game.scheduledAt;

const snapshot: GameSnapshot = {
  ...base,
  evidenceFacts: [
    {
      id: `${base.game.id}-fact-schedule`,
      label: "Scheduled time",
      value: scheduledAt,
      valueType: "datetime",
      sourceId: base.sources[0]!.id,
      observedAt: base.freshness.fetchedAt,
    },
    ...base.evidenceFacts,
  ],
};

describe("GameDetail evidence rendering", () => {
  beforeEach(() => {
    useMatchdayStore.getState().resetDemo();
  });

  afterEach(cleanup);

  it("renders datetime evidence in the browser timezone, never as a raw timestamp", () => {
    const { container } = render(
      <GameDetail
        data={{
          snapshot,
          briefing: createEvidenceBriefing(snapshot, team),
        }}
        team={team}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View demo brief" }));

    const brief = container.querySelector(".brief-list")!;
    expect(brief.textContent).toContain(
      `Scheduled time: ${formatDateTime(scheduledAt)}`,
    );

    const evidence = container.querySelector(".evidence-list")!;
    expect(evidence.textContent).toContain(formatDateTime(scheduledAt));

    expect(container.textContent).not.toContain(scheduledAt);
  });
});
