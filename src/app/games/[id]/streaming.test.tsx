// @vitest-environment node
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { getSnapshot, getTeam } from "@/lib/seed";

vi.mock("@/lib/auth", () => ({ requireAccount: () => new Promise(() => {}) }));
vi.mock("@/lib/locale-server", () => ({
  getTranslation: async () => ({ t: (text: string) => text }),
}));
vi.mock("@/data/sports-data", () => ({
  getGameDetail: async () => ({ snapshot: getSnapshot("soc-rma-01") }),
}));
vi.mock("@/components/game-detail", () => ({
  GameDetail: ({
    wageringPanel,
    socialPanel,
  }: {
    wageringPanel: React.ReactNode;
    socialPanel: React.ReactNode;
  }) => (
    <main>
      <h1>Public match content</h1>
      {wageringPanel}
      {socialPanel}
    </main>
  ),
}));

it("flushes public match content while the account lookup is still pending", async () => {
  expect(getTeam("real-madrid")).toBeDefined();
  const { default: GamePage } = await import("./page");
  const page = await GamePage({
    params: Promise.resolve({ id: "soc-rma-01" }),
  });
  const output = new PassThrough();
  const firstChunk = new Promise<string>((resolve) =>
    output.once("data", (chunk) => resolve(chunk.toString())),
  );
  const stream = renderToPipeableStream(page, {
    onShellReady() {
      stream.pipe(output);
    },
    onError() {},
  });
  try {
    expect(await firstChunk).toContain("Public match content");
  } finally {
    stream.abort();
    output.destroy();
  }
});
