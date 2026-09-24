import { describe, it, expect } from "vitest";
import { repairLesson, checkLesson, questionProblem } from "../../src/lib/lesson-check.js";
import { LESSONS } from "../../src/lessons/index.js";
import generated from "../fixtures/generated-lesson.js";

describe("vérification des leçons", () => {
  it("les leçons intégrées sont parfaites (aucune erreur, aucune alerte)", () => {
    for (const l of LESSONS) {
      expect(checkLesson(l)).toEqual({ errors: [], warnings: [] });
      expect(repairLesson(l).fixes).toEqual([]);
    }
  });

  it("répare une leçon générée : id, calcul faux, question cassée, bloc inconnu, quiz invalide", () => {
    const { lesson, fixes } = repairLesson(generated);
    expect(lesson.id).toBe("francais-le-participe-passe");
    const s1 = lesson.series[0];
    expect(s1.questions.map((q) => q.id)).toEqual(["q1", "q2", "q4", "q5"]);
    expect(s1.questions.find((q) => q.id === "q5").answer).toBe(14);
    expect(lesson.course[0].blocks.map((b) => b.type)).toEqual(["definition", "retenir", "liste"]);
    expect(lesson.beyond.groups[1].cards[0].quiz).toBeUndefined();
    expect(fixes.join("\n")).toMatch(/retirée \(QCM : index/);
    expect(fixes.join("\n")).toMatch(/corrigé 20 → 14/);
    expect(checkLesson(lesson).errors).toEqual([]);
    // l'original n'est pas modifié
    expect(generated.series[0].questions).toHaveLength(5);
  });

  it("détecte ce qui rend une leçon inutilisable", () => {
    expect(checkLesson({}).errors.length).toBeGreaterThan(0);
    expect(checkLesson(null).errors).toEqual(["leçon vide"]);
    const { lesson } = repairLesson({ title: "Vide", subject: "X", series: [{ title: "S", questions: [{ type: "zzz", prompt: "?" }] }] });
    expect(lesson.series).toHaveLength(0);
    expect(checkLesson(lesson).errors).toContain("aucune série d'exercices");
  });

  it("signale une réponse modèle qui ne contient pas les mots-clés", () => {
    const q = { type: "libre", prompt: "?", explain: "…", model: "Rien à voir.", concepts: [{ label: "idée", keywords: ["photosynthèse"] }] };
    const l = { id: "x", title: "x", subject: "x", course: [{ title: "c", blocks: [] }], series: [{ id: "s", title: "S", questions: [{ ...q, id: "q" }] }] };
    expect(checkLesson(l).warnings[0]).toMatch(/mots-clés/);
  });

  it("valide chaque type de question", () => {
    expect(questionProblem({ type: "vf", prompt: "?", answer: "vrai" })).toMatch(/booléenne/);
    expect(questionProblem({ type: "trous", prompt: "?", text: "a {0} {1}", blanks: [{ accept: ["x"] }] })).toMatch(/cases/);
    expect(questionProblem({ type: "associer", prompt: "?", pairs: [["a", "1"], ["b", "1"]] })).toMatch(/double/);
    expect(questionProblem({ type: "etapes", prompt: "?", steps: [{ label: "1+1 =", answer: "2" }] })).toMatch(/étapes/);
    expect(questionProblem({ type: "nombre", prompt: "?", answer: 3 })).toBeNull();
  });
});

import { finalText, extractJson } from "../../src/lib/lesson-check.js";
describe("lecture de la réponse de Claude", () => {
  it("extrait le JSON même entouré de texte ou de ```", () => {
    expect(extractJson('```json\n{"a":{"b":1}}\n```')).toEqual({ a: { b: 1 } });
    expect(() => extractJson("désolé")).toThrow(/lisible/);
    expect(() => extractJson("{ pas: json }")).toThrow(/mal formée/);
  });
  it("prend le texte après la dernière recherche", () => {
    expect(finalText([{ type: "text", text: "a{" }, { type: "web_fetch_tool_result" }, { type: "text", text: "{}" }])).toBe("{}");
    expect(finalText([{ type: "text", text: "x" }, { type: "text", text: "y" }])).toBe("xy");
  });
});
