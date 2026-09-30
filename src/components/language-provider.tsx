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
function useSetLocale() {
  const { locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(locale);
  const choose = (next: Locale) => {
    setSelected(next);
    document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    startTransition(() => router.refresh());
  };
  return { locale, pending, selected, choose };
}

export function LanguageSwitch() {
  const { locale, pending, selected, choose } = useSetLocale();
  return (
    <select
      className="language-switch"
      aria-label={locale === "es" ? "Idioma" : "Language"}
      value={pending ? selected : locale}
      disabled={pending}
      onChange={(event) => choose(event.target.value === "es" ? "es" : "en")}
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

/** The footer's quiet switch: each language named in itself. */
export function LanguageLinks() {
  const { locale, pending, selected, choose } = useSetLocale();
  const current = pending ? selected : locale;
  return (
    <span
      className="language-links"
      role="group"
      aria-label={locale === "es" ? "Idioma" : "Language"}
    >
      {(
        [
          ["es", "Español"],
          ["en", "English"],
        ] as const
      ).map(([value, label]) => (
        <button
          type="button"
          key={value}
          lang={value}
          aria-pressed={current === value}
          disabled={pending}
          onClick={() => current !== value && choose(value)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}
