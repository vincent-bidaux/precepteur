// Vérifie la cohérence de TOUTES les leçons : identifiants, réponses exactes
// (recalculées par le moteur d'expressions), et réponses modèles bien notées.
import { describe, it, expect } from "vitest";
import { LESSONS, findQuestion } from "../../src/lessons/index.js";
import { CHILDREN } from "../../src/data/children.js";
import { CHILD_IDS } from "../../netlify/shared/children.js";
import { gradeQuestion, gradeFree } from "../../src/lib/grading.js";
import { tryEvaluate, sameNumber } from "../../src/lib/expr.js";

const TYPES = ["qcm", "vf", "nombre", "expression", "trous", "associer", "ordre", "etapes", "libre"];

it("la liste blanche serveur correspond aux enfants", () => {
  expect(CHILD_IDS).toEqual(CHILDREN.map((c) => c.id));
});

for (const lesson of LESSONS) {
  describe(`leçon ${lesson.id}`, () => {
    it("métadonnées complètes", () => {
      for (const k of ["id", "subject", "title", "subtitle", "icon", "addedAt", "objectives", "course", "series", "beyond"]) expect(lesson[k], k).toBeTruthy();
      expect(lesson.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const c of lesson.children || []) expect(CHILD_IDS).toContain(c);
    });

    it("identifiants uniques", () => {
      const sids = lesson.series.map((s) => s.id);
      expect(new Set(sids).size).toBe(sids.length);
      for (const s of lesson.series) {
        const qids = s.questions.map((q) => q.id);
        expect(new Set(qids).size, s.id).toBe(qids.length);
      }
    });

    for (const s of lesson.series) {
      for (const q of s.questions) {
        it(`${s.id}/${q.id} (${q.type}) est cohérente`, () => {
          expect(TYPES).toContain(q.type);
          expect(q.prompt).toBeTruthy();
          expect(q.explain, "explication manquante").toBeTruthy();
          expect(findQuestion(lesson.id, `${s.id}/${q.id}`)).toBe(q);

          if (q.type === "qcm") {
            expect(q.answer).toBeGreaterThanOrEqual(0);
            expect(q.answer).toBeLessThan(q.choices.length);
          }
          if (q.type === "vf") expect(typeof q.answer).toBe("boolean");
          if (q.type === "nombre") {
            // « Calcule X = <expr>. » : la réponse doit être le vrai résultat
            const m = q.prompt.match(/Calcule (?:[A-Z] = )?(.+?)\.?$/);
            const v = m ? tryEvaluate(m[1].replace(/\*\*/g, "")) : null;
            if (v !== null) expect(sameNumber(v, q.answer), `${m[1]} = ${v}`).toBe(true);
          }
          if (q.type === "etapes") {
            for (const st of q.steps) {
              const expr = st.label.replace(/^[A-Z] = /, "").replace(/=\s*$/, "");
              const v = tryEvaluate(expr);
              if (v !== null) expect(sameNumber(v, st.answer), `${st.label} ${v}`).toBe(true);
            }
            expect(gradeQuestion(q, q.steps.map((x) => String(x.answer))).score).toBe(1);
          }
          if (q.type === "ordre") {
            expect(gradeQuestion(q, q.items.map((_, i) => i)).score).toBe(1);
            // chaque étape « a op b = c » est juste
            for (const it of q.items) {
              const [l, r] = it.split("=");
              if (r) expect(sameNumber(tryEvaluate(l), Number(r.trim())), it).toBe(true);
            }
          }
          if (q.type === "associer") {
            expect(gradeQuestion(q, Object.fromEntries(q.pairs.map((_, i) => [i, i]))).score).toBe(1);
            for (const [l, r] of q.pairs) {
              const v = tryEvaluate(l);
              if (v !== null) expect(v, l).toBe(Number(r));
            }
          }
          if (q.type === "trous") {
            expect((q.text.match(/\{\d+\}/g) || []).length).toBe(q.blanks.length);
            expect(gradeQuestion(q, q.blanks.map((b) => b.accept[0])).score).toBe(1);
          }
          if (q.type === "expression") {
            expect(q.accept || q.value !== undefined).toBeTruthy();
            if (q.accept) expect(gradeQuestion(q, q.accept[0]).score).toBe(1);
          }
          if (q.type === "libre") {
            expect(q.model).toBeTruthy();
            expect(q.concepts.length).toBeGreaterThan(0);
            // la réponse modèle doit obtenir (presque) tous les points
            const r = gradeFree(q, q.model);
            expect(r.score, `manque : ${r.missing}`).toBeGreaterThanOrEqual(0.99);
            // une réponse hors sujet ne doit pas avoir la moyenne
            expect(gradeFree(q, "je ne sais pas du tout quoi répondre ici").score).toBeLessThan(0.5);
          }
        });
      }
    }

    it("les exemples de la fiche sont justes", () => {
      for (const sec of lesson.course)
        for (const b of sec.blocks)
          if (b.type === "exemples")
            for (const ex of b.items) {
              const start = tryEvaluate(ex.calc.replace(/^[A-Z] = /, ""));
              const end = tryEvaluate(ex.steps.at(-1).replace(/^[A-Z] = /, "").replace(/\s/g, ""));
              expect(start, ex.calc).not.toBeNull();
              expect(sameNumber(start, end), `${ex.calc} → ${ex.steps.at(-1)}`).toBe(true);
              for (const st of ex.steps) {
                const v = tryEvaluate(st.replace(/^[A-Z] = /, "").replace(/\s/g, ""));
                if (v !== null) expect(sameNumber(v, start), `${ex.calc} : étape ${st}`).toBe(true);
              }
            }
    });

    it("mini-quiz « aller plus loin » valides", () => {
      for (const g of lesson.beyond.groups)
        for (const c of g.cards) if (c.quiz) expect(c.quiz.answer).toBeLessThan(c.quiz.choices.length);
    });
  });
}
