import { describe, it, expect } from "vitest";
import { gradeQuestion, gradeFree, earned, note20, points } from "../../src/lib/grading.js";

describe("correction par type", () => {
  it("qcm / vf", () => {
    const q = { type: "qcm", choices: ["a", "b"], answer: 1 };
    expect(gradeQuestion(q, 1).score).toBe(1);
    expect(gradeQuestion(q, 0).score).toBe(0);
    expect(gradeQuestion({ type: "vf", answer: false }, false).score).toBe(1);
    expect(gradeQuestion({ type: "vf", answer: false }, true).score).toBe(0);
  });
  it("nombre : virgule, espaces ; refuse un calcul au lieu d'un résultat", () => {
    const q = { type: "nombre", answer: 12.5 };
    expect(gradeQuestion(q, "12,5").score).toBe(1);
    expect(gradeQuestion({ type: "nombre", answer: 1000 }, "1 000").score).toBe(1);
    expect(gradeQuestion(q, "12").score).toBe(0);
    expect(gradeQuestion(q, "10+2,5").invalid).toBe("calcul");
    expect(gradeQuestion(q, "douze").invalid).toBe("nombre");
  });
  it("expression : formes acceptées", () => {
    const q = { type: "expression", accept: ["7^4"] };
    expect(gradeQuestion(q, "7⁴").score).toBe(1);
    expect(gradeQuestion(q, " 7 ^ 4 ").score).toBe(1);
    expect(gradeQuestion(q, "4^7").score).toBe(0);
  });
  it("expression : valeur + squelette (placer des parenthèses)", () => {
    const q = { type: "expression", value: 20, skeleton: "2+3×4" };
    expect(gradeQuestion(q, "(2+3)×4").score).toBe(1);
    expect(gradeQuestion(q, "(2 + 3) x 4").score).toBe(1);
    expect(gradeQuestion(q, "2+3×4").score).toBe(0);
    const cheat = gradeQuestion(q, "4×5");
    expect(cheat.score).toBe(0);
    expect(cheat.reason).toBe("skeleton");
  });
  it("expression : valeur + nombres imposés", () => {
    const q = { type: "expression", value: 34, mustUse: [3, 8, 2, 5] };
    expect(gradeQuestion(q, "3×8+2×5").score).toBe(1);
    expect(gradeQuestion(q, "2×5+8×3").score).toBe(1);
    expect(gradeQuestion(q, "34").reason).toBe("mustUse");
    expect(gradeQuestion(q, "3×8+2+5").score).toBe(0);
  });
  it("trous avec tolérance orthographique signalée", () => {
    const q = { type: "trous", blanks: [{ accept: ["exposant"] }, { accept: ["carré"] }] };
    expect(gradeQuestion(q, ["exposant", "carre"]).score).toBe(1);
    const r = gradeQuestion(q, ["exposent", "cube"]);
    expect(r.score).toBe(0.5);
    expect(r.spelling).toBe(true);
  });
  it("associer / ordre / étapes (crédit partiel)", () => {
    const a = { type: "associer", pairs: [["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"]] };
    expect(gradeQuestion(a, { 0: 0, 1: 1, 2: 2, 3: 3 }).score).toBe(1);
    expect(gradeQuestion(a, { 0: 1, 1: 0, 2: 2, 3: 3 }).score).toBe(0.5);
    const o = { type: "ordre", items: ["a", "b", "c", "d"] };
    expect(gradeQuestion(o, [0, 1, 2, 3]).score).toBe(1);
    expect(gradeQuestion(o, [1, 0, 2, 3]).score).toBe(0.25);
    const e = { type: "etapes", steps: [{ answer: 2 }, { answer: 12 }] };
    expect(gradeQuestion(e, ["2", "12"]).score).toBe(1);
    expect(gradeQuestion(e, ["2", "13"]).score).toBe(0.5);
  });
  it("réponse libre par mots-clés", () => {
    const q = {
      type: "libre",
      concepts: [
        { label: "addition", keywords: ["addition", "plus"] },
        { label: "résultat 9", keywords: ["9"] },
      ],
    };
    expect(gradeFree(q, "La somme c'est une addition, ça fait 9").score).toBe(1);
    expect(gradeFree(q, "La somme c'est une addition").score).toBe(0.5);
    expect(gradeFree(q, "je sais").invalid).toBe("court");
  });
  it("points, coup de pouce, note sur 20", () => {
    expect(points({ type: "nombre" })).toBe(1);
    expect(points({ type: "libre" })).toBe(2);
    expect(earned({ type: "nombre" }, 1, true)).toBe(0.75);
    expect(note20(7, 9)).toBe(15.5);
    expect(note20(9, 9)).toBe(20);
    expect(note20(0, 0)).toBe(0);
  });
});
