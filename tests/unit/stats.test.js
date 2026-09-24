import { describe, it, expect } from "vitest";
import { lessonProgress, streak, xpOf, levelOf, childOverview, weakQuestions, dailyActivity } from "../../src/lib/stats.js";
import { LESSONS, findQuestion } from "../../src/lessons/index.js";
import { gradeFree } from "../../src/lib/grading.js";

const lesson = LESSONS[0];
const DAY = 86400000;
const NOW = new Date("2026-09-24T18:00:00").getTime();
const att = (seriesId, note20, ts, extra = {}) => ({ id: Math.random().toString(36).slice(2, 10), type: "attempt", child: "livia", lessonId: lesson.id, seriesId, note20, ts, durationMs: 60000, answers: [], ...extra });

describe("progression d'une leçon", () => {
  it("nouveau → en cours → à revoir / réussie", () => {
    expect(lessonProgress(lesson, [], "livia").status).toBe("nouveau");
    const visit = { id: "v1xxxxx", type: "visit", child: "livia", lessonId: lesson.id, page: "reviser", ts: NOW, durationMs: 120000 };
    expect(lessonProgress(lesson, [visit], "livia").status).toBe("en-cours");
    const weak = lesson.series.map((s, i) => att(s.id, 8, NOW + i));
    const p1 = lessonProgress(lesson, weak, "livia");
    expect(p1.status).toBe("a-revoir");
    expect(p1.note).toBe(8);
    const better = [...weak, ...lesson.series.map((s, i) => att(s.id, 17, NOW + 100 + i))];
    const p2 = lessonProgress(lesson, better, "livia");
    expect(p2.status).toBe("maitrise");
    expect(p2.note).toBe(17); // meilleure note par série
    expect(p2.series[lesson.series[0].id].attempts).toBe(2);
    expect(lessonProgress(lesson, better, "aurelius").status).toBe("nouveau"); // l'autre enfant n'est pas concerné
  });
  it("les tours « erreurs » ne comptent pas dans la note", () => {
    const recs = [att(lesson.series[0].id, 10, NOW), att(lesson.series[0].id, 20, NOW + 1, { mode: "retry" })];
    expect(lessonProgress(lesson, recs, "livia").series[lesson.series[0].id].best).toBe(10);
  });
});

describe("motivation & synthèse", () => {
  it("jours d'affilée", () => {
    const recs = [0, 1, 2, 4].map((d) => att("s1-operations", 10, NOW - d * DAY));
    expect(streak(recs, "livia", NOW)).toBe(3);
    expect(streak(recs.slice(1), "livia", NOW)).toBe(2); // pas encore travaillé aujourd'hui : la série tient
    expect(streak([], "livia", NOW)).toBe(0);
  });
  it("XP et niveaux", () => {
    const recs = [att("a", 20, 1), att("a", 10, 2), att("b", 0, 3)];
    expect(xpOf(recs, "livia")).toBe(100 + 20 + 50 + 0 + 20);
    expect(levelOf(0).index).toBe(1);
    expect(levelOf(150).title).toBe("Tiro");
    expect(levelOf(99999).next).toBeUndefined();
  });
  it("synthèse enfant + activité quotidienne", () => {
    const recs = [att("a", 12, NOW - 2 * DAY), att("b", 16, NOW), { id: "v2xxxxx", type: "visit", child: "livia", ts: NOW, durationMs: 30000 }];
    const ov = childOverview(recs, "livia", NOW);
    expect(ov.avgNote).toBe(14);
    expect(ov.timeMs).toBe(150000);
    expect(ov.activeDays).toBe(2);
    const days = dailyActivity(recs, "livia", 7, NOW);
    expect(days).toHaveLength(7);
    expect(days.at(-1).ms).toBe(90000);
  });
  it("points faibles", () => {
    const recs = [
      att("a", 10, 1, { answers: [{ qid: "s2-puissances/q2", score: 0, max: 1, given: "10" }, { qid: "s2-puissances/q3", score: 1, max: 1 }] }),
      att("a", 10, 2, { answers: [{ qid: "s2-puissances/q2", score: 1, max: 1, given: "25" }] }),
    ];
    const w = weakQuestions(recs, "livia");
    expect(w).toHaveLength(1);
    expect(w[0].rate).toBe(0.5);
    expect(findQuestion(lesson.id, w[0].qid).prompt).toContain("5^2");
  });
});

describe("réponses libres réalistes (correction par mots-clés)", () => {
  const q = (id) => findQuestion(lesson.id, id);
  it("réponse d'enfant correcte, formulée à sa façon", () => {
    expect(gradeFree(q("s1-operations/q9"), "la somme c'est quand on additionne 4+5=9 et le produit c'est 4 fois 5 = 20").score).toBe(1);
    expect(gradeFree(q("s5-gauche-droite/q7"), "il a fait 8+3 en premier alors qu'il faut faire de gauche a droite donc ca fait 7").score).toBe(1);
    expect(gradeFree(q("s7-explique/q1"), "parce que la puissance est prioritaire : 4 au carré ça fait 16 et 3+16=19. Pour 49 il faut des parenthèses").score).toBe(1);
  });
  it("réponse incomplète : note partielle", () => {
    const r = gradeFree(q("s7-explique/q4"), "il faut faire d'abord les parenthèses et après ça les multiplications dans le calcul");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(0.6);
  });
});
