import { useSyncExternalStore } from "react";
const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};
const location = () => window.location.pathname + window.location.search;
export function useLocation() {
  return useSyncExternalStore(subscribe, location, location);
}
export function usePathname() {
  return useLocation().split("?")[0]!;
}
export function useSearchParams() {
  return new URLSearchParams(useLocation().split("?")[1]);
}
export function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useRouter() {
  return {
    push: navigate,
    refresh: () => window.dispatchEvent(new Event("fixture-refresh")),
  };
}
