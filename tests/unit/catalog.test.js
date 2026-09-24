import { describe, it, expect, beforeEach } from "vitest";
import { setCatalog, lessonsFor, lessonById, findQuestion, statusOf, childrenOf } from "../../src/catalog.js";
import { repairLesson } from "../../src/lib/lesson-check.js";
import generated from "../fixtures/generated-lesson.js";

const created = { ...repairLesson(generated).lesson, addedAt: "2026-10-01" };

describe("catalogue client", () => {
  beforeEach(() => setCatalog({ lessons: [created], meta: {} }));

  it("leçon intégrée : publiée, pour les deux enfants par défaut", () => {
    expect(lessonsFor("livia").map((l) => l.id)).toEqual(["maths-regles-de-calcul-1"]);
    expect(statusOf(lessonById("maths-regles-de-calcul-1"))).toBe("publiee");
  });

  it("une leçon créée reste invisible tant qu'elle est en brouillon", () => {
    setCatalog({ lessons: [created], meta: { [created.id]: { children: ["livia"], status: "brouillon" } } });
    expect(lessonsFor("livia").map((l) => l.id)).not.toContain(created.id);
    setCatalog({ lessons: [created], meta: { [created.id]: { children: ["livia"], status: "publiee" } } });
    expect(lessonsFor("livia").map((l) => l.id)).toEqual([created.id, "maths-regles-de-calcul-1"]); // plus récente d'abord
    expect(lessonsFor("aurelius").map((l) => l.id)).toEqual(["maths-regles-de-calcul-1"]);
  });

  it("le parent peut retirer une leçon intégrée à un enfant", () => {
    setCatalog({ lessons: [], meta: { "maths-regles-de-calcul-1": { children: ["aurelius"] } } });
    expect(lessonsFor("livia")).toEqual([]);
    expect(childrenOf(lessonById("maths-regles-de-calcul-1"))).toEqual(["aurelius"]);
  });

  it("retrouve les questions des leçons créées", () => {
    expect(findQuestion(created.id, "s2/q1").type).toBe("libre");
    expect(findQuestion(created.id, "s9/q1")).toBeNull();
  });
});
