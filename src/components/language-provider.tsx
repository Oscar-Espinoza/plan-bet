"use client";
import { createContext, use, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hasSpanish, type Locale, translator } from "@/lib/locale";
const LanguageContext = createContext<Locale>("en");
let loadingSpanish: Promise<unknown> | undefined;
export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  // The dictionary is its own chunk, fetched only for Spanish readers. Holding
  // the tree until it lands means nothing ever renders in English first.
  if (locale === "es" && !hasSpanish())
    use((loadingSpanish ??= import("@/lib/locale-es")));
  return (
    <LanguageContext.Provider value={locale}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useTranslation() {
  const locale = useContext(LanguageContext);
  return translator(locale);
}
export function LanguageSwitch() {
  const { locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(locale);
  return (
    <select
      className="language-switch"
      aria-label={locale === "es" ? "Idioma" : "Language"}
      value={pending ? selected : locale}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value === "es" ? "es" : "en";
        setSelected(next);
        document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        startTransition(() => router.refresh());
      }}
    >
      <option value="en" label="EN">
        English
      </option>
      <option value="es" label="ES">
        Español
      </option>
    </select>
  );
}
