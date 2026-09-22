import spanish from "./messages.es.json";
export type Locale = "en" | "es";
export type Message = keyof typeof spanish;
export type TranslationValues = Record<string, string | number | undefined>;
export function parseLocale(value: string | undefined): Locale {
  return value === "es" ? "es" : "en";
}
export function intlLocale(locale: Locale) {
  return locale === "es" ? "es-AR" : "en-US";
}
// Some existing API responses and stored wager labels contain interpolated
// English. Match only complete known messages, never words in user content.
const templates = Object.entries(spanish)
  .filter(([key]) => key.includes("{p"))
  // Specific wager labels must win over broad templates such as "{p0} goals".
  .sort(
    ([a], [b]) =>
      b.replace(/\{p\d+\}/g, "").length - a.replace(/\{p\d+\}/g, "").length,
  )
  .map(([key, translated]) => {
    const names = [...key.matchAll(/\{(p\d+)\}/g)].map((match) => match[1]!);
    const escaped = key
      .split(/\{p\d+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return {
      pattern: new RegExp("^" + escaped.join("(.+?)") + "$"),
      names,
      translated,
    };
  });
export function translate(
  locale: Locale,
  message: string | null | undefined,
  values: TranslationValues = {},
): string {
  if (!message) return "";
  let translated =
    locale === "es"
      ? ((spanish as Record<string, string>)[message.trim()] ?? message)
      : message;
  if (
    locale === "es" &&
    translated === message &&
    Object.keys(values).length === 0
  ) {
    for (const template of templates) {
      const match = template.pattern.exec(message);
      if (!match) continue;
      translated = template.translated;
      values = Object.fromEntries(
        template.names.map((key, index) => [key, match[index + 1]]),
      );
      break;
    }
  }
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );
}
export function translator(locale: Locale) {
  return {
    locale,
    formatNumber: (value: number, decimals?: number) =>
      new Intl.NumberFormat(intlLocale(locale), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value),
    t: (message: string | null | undefined, values?: TranslationValues) =>
      translate(locale, message, values),
  };
}
