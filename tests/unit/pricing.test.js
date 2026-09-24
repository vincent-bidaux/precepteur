import { describe, it, expect } from "vitest";
import { costOf, estimateCreation, estimateGrading, formatUsd, MODELS, CREATION_MODELS, DEFAULT_CREATION_MODEL, GRADING_MODEL } from "../../src/lib/pricing.js";
import { cleanSize, seriesFor, minutesForQuestions, lengthInfo, sizeInstruction, QUESTIONS, DEFAULT_LENGTH } from "../../src/lib/lesson-size.js";

describe("coûts IA", () => {
  it("calcule le coût réel d'après l'usage renvoyé par l'API", () => {
    const u = { input_tokens: 1_000_000, output_tokens: 100_000 };
    expect(costOf(u, "claude-haiku-4-5")).toBeCloseTo(1 + 0.5, 9);
    expect(costOf(u, "claude-sonnet-5")).toBeCloseTo(2 + 1, 9);
    expect(costOf(u, "claude-opus-5", { batch: true })).toBeCloseTo((5 + 2.5) / 2, 9);
    expect(costOf({ ...u, server_tool_use: { web_search_requests: 3 } }, "claude-sonnet-5")).toBeCloseTo(3.03, 9);
    expect(costOf({ cache_read_input_tokens: 1_000_000 }, "claude-sonnet-5")).toBeCloseTo(0.2, 9);
    expect(costOf(null, "claude-sonnet-5")).toBe(0);
    expect(costOf(u, "inconnu")).toBe(0);
  });

  it("modèles : le moins cher pour corriger, Sonnet 5 par défaut pour créer", () => {
    expect(GRADING_MODEL).toBe("claude-haiku-4-5");
    expect(DEFAULT_CREATION_MODEL).toBe("claude-sonnet-5");
    const prices = CREATION_MODELS.map((m) => estimateCreation(m));
    expect([...prices].sort((a, b) => a - b)).toEqual(prices); // du moins cher au plus cher
    expect(Object.keys(MODELS)).toEqual(expect.arrayContaining(CREATION_MODELS));
  });

  it("estimations : plus de questions / photos / longueur → plus cher", () => {
    const base = estimateCreation("claude-sonnet-5");
    expect(base).toBeGreaterThan(0.1);
    expect(base).toBeLessThan(0.5);
    expect(estimateCreation("claude-sonnet-5", { questions: 80 })).toBeGreaterThan(base);
    expect(estimateCreation("claude-sonnet-5", { length: 5 })).toBeGreaterThan(base);
    expect(estimateCreation("claude-sonnet-5", { photos: 5 })).toBeGreaterThan(base);
    expect(estimateGrading()).toBeLessThan(0.01);
  });

  it("affichage en dollars", () => {
    expect(formatUsd(0)).toBe("0 $");
    expect(formatUsd(0.004)).toBe("< 0,01 $");
    expect(formatUsd(0.4213)).toBe("0,42 $");
    expect(formatUsd(12)).toBe("12,00 $");
  });
});

describe("taille des leçons", () => {
  it("valeurs par défaut : fiche moyenne, 40 questions en 5 séries", () => {
    expect(cleanSize()).toEqual({ length: DEFAULT_LENGTH, questions: QUESTIONS.default, series: 5 });
    expect(QUESTIONS.default).toBe(40);
    expect(lengthInfo(DEFAULT_LENGTH).label).toBe("Moyenne");
  });
  it("bornes et arrondis", () => {
    expect(cleanSize({ length: 0, questions: 3 })).toEqual({ length: 3, questions: 10, series: 2 });
    expect(cleanSize({ length: "5", questions: "63" })).toEqual({ length: 5, questions: 65, series: 8 });
    expect(seriesFor(80)).toBe(10);
    expect(minutesForQuestions(40)).toBe(30);
  });
  it("consigne claire pour Claude", () => {
    const t = sizeInstruction({ length: 2, questions: 30 });
    expect(t).toContain("« Courte »");
    expect(t).toContain("exactement 30 questions au total, réparties en 4 séries");
  });
});
