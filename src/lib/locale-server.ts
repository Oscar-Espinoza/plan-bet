import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import "./locale-es";
import { requestLocale, translator } from "./locale";
export const getLocale = cache(async () =>
  requestLocale(
    (await cookies()).get("locale")?.value,
    (await headers()).get("accept-language"),
  ),
);
export const getTranslation = cache(async () => translator(await getLocale()));
