import { z } from "zod";
import type { Sport } from "./contracts";

export type SportPreference = "all" | Sport;

/** The board's sport chips, remembered in a cookie so the server can render
 *  the right board on the first paint. `?sport=` in the URL still wins. */
export const SPORT_COOKIE = "sport";
export const sportPreferenceSchema = z
  .enum(["all", "soccer", "baseball"])
  .catch("all");

export function sportPreferenceCookie(value: SportPreference) {
  return `${SPORT_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : ""
  }`;
}
