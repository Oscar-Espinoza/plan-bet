import { getContext, setContext } from "svelte";

export type RequestClock = { zone: string; now: number };

const KEY = Symbol("request-clock");

export function provideRequestClock(clock: RequestClock) {
  setContext(KEY, clock);
}

export function requestClock(): RequestClock {
  return getContext<RequestClock>(KEY) ?? { zone: "UTC", now: 0 };
}

export function useHydrated() {
  let hydrated = $state(false);
  $effect(() => {
    const browser = typeof document !== "undefined";
    hydrated = browser;
  });
  return {
    get current() {
      return hydrated;
    },
  };
}

/** Server and the hydration render use the request zone. The next render uses the browser. */
export function viewerClock() {
  const hydrated = useHydrated();
  const request = requestClock();
  return {
    get timeZone(): string | undefined {
      return hydrated.current ? undefined : request.zone;
    },
    now() {
      return hydrated.current ? Date.now() : request.now;
    },
  };
}
