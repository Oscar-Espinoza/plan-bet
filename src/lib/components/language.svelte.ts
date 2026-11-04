import { getContext, setContext } from "svelte";
import { refreshAll } from "$app/navigation";
import {
  translate,
  translator,
  type Locale,
  type TranslationValues,
} from "#lib/shared/locale";

type LocaleContext = { readonly locale: Locale };

const KEY = Symbol("locale");

export function provideLocale(context: LocaleContext) {
  setContext(KEY, context);
}

export function useTranslation() {
  const context = getContext<LocaleContext>(KEY) ?? { locale: "en" as Locale };
  return {
    get locale(): Locale {
      return context.locale;
    },
    t(message: string | null | undefined, values?: TranslationValues) {
      return translate(context.locale, message, values);
    },
    formatNumber(value: number, decimals?: number) {
      return translator(context.locale).formatNumber(value, decimals);
    },
  };
}

function localeCookie(next: Locale) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  return `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function useSetLocale() {
  const i18n = useTranslation();
  let pending = $state(false);
  let selected = $state<Locale>(i18n.locale);

  return {
    get locale() {
      return i18n.locale;
    },
    get pending() {
      return pending;
    },
    get selected() {
      return selected;
    },
    get current(): Locale {
      return pending ? selected : i18n.locale;
    },
    async choose(next: Locale) {
      if (next === (pending ? selected : i18n.locale)) return;
      selected = next;
      document.cookie = localeCookie(next);
      pending = true;
      try {
        await refreshAll();
      } finally {
        pending = false;
      }
    },
  };
}
