import { describe, it, expect } from "vitest";
import { norm, matchText, containsKeyword, levenshtein } from "../../src/lib/text.js";

describe("texte", () => {
  it("normalise accents, casse, articles", () => {
    expect(norm("  L’Exposant. ")).toBe("l'exposant");
    expect(matchText("l'exposant", ["exposant"])).toEqual({ ok: true, exact: true });
    expect(matchText("Carré", ["carré"])).toEqual({ ok: true, exact: true });
  });
  it("tolère une faute d'orthographe, pas un autre mot", () => {
    expect(matchText("exposent", ["exposant"])).toEqual({ ok: true, exact: false });
    expect(matchText("parentheses", ["parenthèses"]).ok).toBe(true);
    expect(matchText("facteur", ["exposant"]).ok).toBe(false);
    expect(matchText("cube", ["carré"]).ok).toBe(false);
    expect(matchText("", ["carré"]).ok).toBe(false);
  });
  it("repère des mots-clés", () => {
    expect(containsKeyword("On fait une multiplicaton", "multiplication")).toBe(true);
    expect(containsKeyword("c'est 4 fois 5", "fois")).toBe(true);
    expect(containsKeyword("le résultat est 19", "19")).toBe(true);
    expect(containsKeyword("rien à voir", "puissance")).toBe(false);
    expect(containsKeyword("Les parenthèses d'abord", "priorit")).toBe(false);
    expect(containsKeyword("c'est prioritaire", "priorit")).toBe(true);
  });
  it("levenshtein", () => {
    expect(levenshtein("chat", "chats")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });
});
