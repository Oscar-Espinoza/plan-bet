import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { parseLocale, translator } from "./locale";
export const getTranslation = cache(async () =>
  translator(parseLocale((await cookies()).get("locale")?.value)),
);
