import { describe, expect, it } from "vitest";
import "./locale-es";
import { parseLocale, translate, translator } from "./locale";
import spanish from "./messages.es.json";

describe("localization", () => {
  it("defaults to English and accepts only supported locales", () => {
    expect(parseLocale(undefined)).toBe("en");
    expect(parseLocale("fr")).toBe("en");
    expect(parseLocale("es")).toBe("es");
  });
  it("preserves interpolation parameters in every Spanish translation", () => {
    const parameters = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of Object.entries(spanish)) {
      expect(parameters(value), key).toEqual(parameters(key));
      expect(value.trim(), key).not.toBe("");
    }
  });
  it("translates known dynamic API responses without changing unknown names", () => {
    expect(
      translate(
        "es",
        "The price moved to 2.50. Tap the selection again to place at the new price.",
      ),
    ).toContain("La cuota cambió a 2.50");
    expect(
      translate(
        "es",
        "Invited oscar@example.com. The invite link is on its way.",
      ),
    ).toBe("Invitaste a oscar@example.com. El enlace está en camino.");
    expect(translate("es", "Real Madrid CF")).toBe("Real Madrid CF");
    expect(translate("en", "Place {p0} credits", { p0: 100 })).toBe(
      "Place 100 credits",
    );
    expect(translate("es", "Place {p0} credits", { p0: 100 })).toBe(
      "Apostar 100 créditos",
    );
  });
  it("formats display prices without changing the numeric wager value", () => {
    expect(translator("es").formatNumber(2.4, 2)).toBe("2,40");
    expect(translator("en").formatNumber(2.4, 2)).toBe("2.40");
  });
});

it("translates named market labels before broad goal templates", () => {
  expect(translate("es", "Real Madrid — 2+ goals")).toBe(
    "Real Madrid — 2+ goles",
  );
  expect(translate("es", "Yankees — 5+ runs")).toBe("Yankees — 5+ carreras");
  expect(translate("es", "Real Madrid — Handicap -1.5")).toBe(
    "Real Madrid — Hándicap −1,5",
  );
  expect(translate("es", "Real Madrid — draw no bet")).toBe(
    "Real Madrid — empate: anulada",
  );
});
