import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RefreshVisiblePage } from "./refresh-visible-page";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh };
vi.mock("next/navigation", () => ({
  usePathname: () => "/you",
  useRouter: () => router,
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  refresh.mockClear();
});

it("deduplicates timer/focus refreshes, pauses while hidden, and cleans up", () => {
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const view = render(<RefreshVisiblePage />);
  act(() => {
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event("focus"));
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("hidden");
  act(() => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(refresh).toHaveBeenCalledTimes(2);
  view.unmount();
  act(() => vi.advanceTimersByTime(60_000));
  expect(refresh).toHaveBeenCalledTimes(2);
});
