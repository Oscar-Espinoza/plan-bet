"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type Locale, translator } from "@/lib/locale";
const LanguageContext = createContext<Locale>("en");
export function LanguageProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
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
