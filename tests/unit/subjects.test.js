import { describe, it, expect } from "vitest";
import { subjectOf, levelOf, programUrl, cycleOf, taughtSubjects } from "../../src/data/subjects.js";
import { subjectBreakdown, withAllSubjects } from "../../src/lib/stats.js";
import { svgOk, repairLesson } from "../../src/lib/lesson-check.js";
import { userPrompt, SYSTEM_PROMPT } from "../../netlify/shared/prompt.js";
import { estimateCreation } from "../../src/lib/pricing.js";
import generated from "../fixtures/generated-lesson.js";

describe("matières et classes", () => {
  it("reconnaît une matière quelle que soit l'écriture", () => {
    expect(subjectOf("Maths").id).toBe("mathematiques");
    expect(subjectOf("mathématiques").id).toBe("mathematiques");
    expect(subjectOf("Géographie").id).toBe("histoire-geographie");
    expect(subjectOf("ANGLAIS").icon).toBe("🇬🇧");
    expect(subjectOf("SVT").id).toBe("svt");
    expect(subjectOf("").id).toBe("autre");
    expect(subjectOf("Cuisine moléculaire").id).toBe("autre");
  });

  it("normalise la classe", () => {
    expect(levelOf("5ème")).toBe("5e");
    expect(levelOf("cinquième")).toBe("5e");
    expect(levelOf("5e")).toBe("5e");
    expect(levelOf("cm2")).toBe("CM2");
    expect(levelOf("terminale")).toBeNull();
    expect(levelOf("")).toBeNull();
  });

  it("lien vers le programme officiel du cycle", () => {
    expect(cycleOf("CM2")).toBe(3);
    expect(cycleOf("5e")).toBe(4);
    expect(programUrl("CE1")).toMatch(/eduscol\.education\.gouv\.fr\/.*cycle-2/);
    expect(programUrl("6e")).toMatch(/cycle-3/);
    expect(programUrl("3e")).toMatch(/cycle-4/);
    expect(programUrl(null)).toBeNull();
  });

  it("matières enseignées selon la classe", () => {
    const ids = (lv) => taughtSubjects(lv).map((s) => s.id);
    expect(ids(["CE1"])).toEqual(expect.arrayContaining(["francais", "mathematiques", "questionner-le-monde", "eps"]));
    expect(ids(["CE1"])).not.toContain("histoire-geographie");
    expect(ids(["CM2"])).toEqual(expect.arrayContaining(["histoire-geographie", "sciences", "anglais"]));
    expect(ids(["CM2"])).not.toContain("svt");
    expect(ids(["5e"])).toEqual(expect.arrayContaining(["svt", "physique-chimie", "technologie", "espagnol", "latin"]));
    expect(ids(["5e"])).not.toContain("questionner-le-monde");
    expect(ids(["CM2", "5e"])).toEqual(expect.arrayContaining(["sciences", "svt"]));
    expect(ids([]).length).toBe(17); // sans classe : toutes, sauf « autre »
    expect(ids([])).not.toContain("autre");
  });

  it("toutes les matières apparaissent, même sans leçon", () => {
    const maths = { subjectInfo: subjectOf("maths"), subject: "Mathématiques" };
    const odd = { subjectInfo: subjectOf("Cuisine"), subject: "Cuisine" };
    const p = { status: "nouveau", note: null, reprise: null, done: 0, total: 2 };
    const rows = withAllSubjects(subjectBreakdown([{ lesson: maths, p }, { lesson: odd, p }]), taughtSubjects(["CM2"]));
    expect(rows[0].label).toBe("Mathématiques");
    expect(rows[0].count).toBe(1);
    expect(rows.find((r) => r.subject.id === "francais").count).toBe(0);
    expect(rows.at(-1).label).toBe("Cuisine");
    expect(rows).toHaveLength(taughtSubjects(["CM2"]).length + 1);
  });

  it("tableau par matière : nombre, statuts, moyennes", () => {
    const maths = { subjectInfo: subjectOf("maths"), subject: "Mathématiques" };
    const ang = { subjectInfo: subjectOf("anglais"), subject: "Anglais" };
    const p = (status, note, reprise = null) => ({ status, note, reprise, done: note === null ? 0 : 2, total: 2 });
    const rows = subjectBreakdown([
      { lesson: maths, p: p("nouveau", null) },
      { lesson: maths, p: p("maitrise", 16) },
      { lesson: maths, p: p("a-revoir", 8, 14), archived: true },
      { lesson: ang, p: p("en-cours", 12) },
    ]);
    expect(rows[0]).toMatchObject({ label: "Mathématiques", count: 3, nouveau: 1, reussies: 1, archivees: 1, avg: 12, avgReprise: 15 });
    expect(rows[0].completion).toBeCloseTo(4 / 6);
    expect(rows[1]).toMatchObject({ label: "Anglais", count: 1, enCours: 1, avg: 12 });
  });
});

describe("illustrations dessinées par l'IA", () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="40" height="20" fill="#eee"/><text x="5" y="15">A</text></svg>';
  it("n'accepte que du SVG inoffensif", () => {
    expect(svgOk(ok)).toBe(true);
    expect(svgOk('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(svgOk('<svg><rect onclick="x()"/></svg>')).toBe(false);
    expect(svgOk('<svg><image href="http://x/a.png"/></svg>')).toBe(false);
    expect(svgOk('<svg><a href="javascript:x()">a</a></svg>')).toBe(false);
    expect(svgOk("<div>pas svg</div>")).toBe(false);
    expect(svgOk(`<svg>${"x".repeat(20000)}</svg>`)).toBe(false);
  });

  it("la réparation retire les illustrations dangereuses, garde les bonnes", () => {
    const lesson = structuredClone(generated);
    lesson.course[0].blocks.push({ type: "illustration", svg: ok, caption: "Figure" }, { type: "illustration", svg: "<svg><script/></svg>" });
    lesson.series[0].questions[0].illustration = { svg: "<svg onload='x'></svg>", alt: "x" };
    const { lesson: fixed } = repairLesson(lesson);
    const illus = fixed.course[0].blocks.filter((b) => b.type === "illustration");
    expect(illus).toHaveLength(1);
    expect(fixed.series[0].questions[0].illustration).toBeUndefined();
  });

  it("demandées seulement si le parent l'a choisi ; coût estimé plus élevé", () => {
    expect(userPrompt("notes", 0, undefined)).toContain("Pas d'illustration");
    expect(userPrompt("notes", 0, undefined, { illustrations: true })).toContain('"type":"illustration"');
    expect(estimateCreation("claude-sonnet-5", { illustrations: true })).toBeGreaterThan(estimateCreation("claude-sonnet-5"));
  });

  it("les consignes imposent une matière et une classe de la liste", () => {
    expect(SYSTEM_PROMPT).toContain('"Mathématiques"');
    expect(SYSTEM_PROMPT).toContain('"CM2"');
    expect(SYSTEM_PROMPT).not.toMatch(/"icon": "📘"/);
  });
});
