// Parcours complets dans un vrai navigateur (ordinateur + mobile), avec l'API
// locale branchée sur un stockage fichier (.data-e2e), vidé avant chaque test.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import lesson from "../../src/lessons/maths-regles-de-calcul-1.js";

const L = lesson.id;
const serie = (id) => lesson.series.find((s) => s.id === id);

test.beforeEach(async ({ page }) => {
  fs.rmSync(".data-e2e", { recursive: true, force: true });
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Répond juste (ou faux si wrong=true) à la question affichée, d'après les données de la leçon. */
async function answer(page, q, { wrong = false } = {}) {
  const zone = page.locator(".question");
  switch (q.type) {
    case "qcm":
      await zone.locator(`.choice[data-v="${wrong ? (q.answer + 1) % q.choices.length : q.answer}"]`).click();
      break;
    case "vf":
      await zone.locator(`.choice[data-v="${wrong ? !q.answer : q.answer}"]`).click();
      break;
    case "nombre":
      await zone.locator(".answer").fill(String(wrong ? [].concat(q.answer)[0] + 1 : [].concat(q.answer)[0]).replace(".", ","));
      break;
    case "expression": {
      const txt = q.accept ? q.accept[0] : q.id === "q4" ? "(2+3)×4" : "3×8+2×5";
      await zone.locator(".answer").fill(wrong ? "1+1" : txt);
      break;
    }
    case "trous": {
      const blanks = zone.locator(".blank");
      for (let i = 0; i < q.blanks.length; i++) await blanks.nth(i).fill(wrong ? "truc" : q.blanks[i].accept[0]);
      break;
    }
    case "associer":
      // un toucher par paire : l'élément surligné passe tout seul au suivant
      for (let i = 0; i < q.pairs.length; i++) {
        await expect(zone.locator(`.m-left[data-l="${i}"]`)).toHaveClass(/active/);
        await zone.locator(`.m-right[data-r="${wrong ? (i + 1) % q.pairs.length : i}"]`).click();
      }
      break;
    case "ordre": {
      if (wrong) break;
      // tri à bulles avec les boutons ↑
      for (let pass = 0; pass < q.items.length; pass++) {
        const order = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
        const pos = order.findIndex((v, i) => i > 0 && order[i - 1] > v);
        if (pos < 0) break;
        await zone.locator(`.order-btns .up[data-pos="${pos}"]`).click();
        pass = -1;
      }
      break;
    }
    case "etapes": {
      const inputs = zone.locator(".step");
      for (let i = 0; i < q.steps.length; i++) await inputs.nth(i).fill(String(wrong ? q.steps[i].answer + 1 : q.steps[i].answer));
      break;
    }
    case "libre":
      await zone.locator(".free").fill(wrong ? "je ne sais pas du tout quoi répondre ici" : q.model);
      break;
  }
  await zone.locator(".validate").click();
  await expect(page.locator(".feedback .verdict")).toBeVisible();
}

async function playSeries(page, child, s, { wrongIds = [] } = {}) {
  await page.goto(`/#/enfant/${child}/lecon/${L}/serie/${s.id}`);
  for (const q of s.questions) {
    await expect(page.locator(".prompt")).toBeVisible();
    await answer(page, q, { wrong: wrongIds.includes(q.id) });
    await page.locator(".feedback .next").click();
  }
  await expect(page.locator(".result")).toBeVisible();
}

test("accueil : deux onglets, leçon nouvelle, rien qui déborde", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".child-tab")).toHaveCount(2);
  await expect(page.locator(".child-tab.active")).toContainText("Aurelius");
  await expect(page.locator("#nouveau .lesson-card")).toContainText("Les règles de calcul");
  await expect(page.locator("#a-suivre .empty-line")).toBeVisible();
  await expect(page.locator("#passees .empty-line")).toBeVisible();
  await noHorizontalScroll(page);

  await page.locator(".child-tab", { hasText: "Livia" }).click();
  await expect(page).toHaveURL(/#\/enfant\/livia$/);
  await expect(page.locator(".child-tab.active")).toContainText("Livia");
  await expect(page.locator("h1")).toContainText("Livia");
  // l'onglet est mémorisé
  await page.goto("/");
  await expect(page.locator(".child-tab.active")).toContainText("Livia");
});

test("fiche de révision, exemples pas à pas, aller plus loin", async ({ page }) => {
  await page.goto("/#/enfant/aurelius");
  await page.locator("#nouveau .lesson-card").click();
  await expect(page.locator(".lesson-tabs a.active")).toContainText("Réviser");
  await expect(page.locator(".course-section")).toHaveCount(3);
  await noHorizontalScroll(page);

  const ex = page.locator(".exemple").filter({ hasText: "C = 5 × [14 − (5 − 3)]" });
  await expect(ex.locator(".ex-step").first()).toBeHidden();
  for (let i = 0; i < 3; i++) await ex.locator(".ex-next").click();
  await expect(ex.locator(".ex-step").last()).toHaveText("C = 60");
  await expect(ex.locator(".ex-note")).toBeVisible();

  const carre = page.locator(".carre").nth(12);
  await carre.click();
  await expect(carre.locator("b")).toHaveText("144");

  await page.locator(".lesson-tabs a", { hasText: "Plus loin" }).click();
  await expect(page.locator(".beyond-group")).toHaveCount(3);
  const quiz = page.locator(".mini-quiz").first();
  await quiz.locator(".chip").nth(1).click();
  await expect(quiz.locator(".mq-feedback")).toContainText("Exact");
  await noHorizontalScroll(page);
});

test("série parfaite : 20/20, enregistrée, visible à l'accueil et au tableau de bord", async ({ page }) => {
  await playSeries(page, "aurelius", serie("s1-operations"));
  await expect(page.locator(".result .note-badge")).toContainText("20");
  await expect(page.locator(".confetti")).toHaveCount(1);
  await noHorizontalScroll(page);

  await page.goto("/#/enfant/aurelius");
  await expect(page.locator("#a-suivre .lesson-card")).toContainText("1/7 séries");
  await expect(page.locator("#nouveau .empty-line")).toBeVisible();
  // Livia n'est pas concernée
  await page.goto("/#/enfant/livia");
  await expect(page.locator("#nouveau .lesson-card")).toHaveCount(1);

  await page.goto("/#/parent");
  const aurelius = page.locator("#dash-aurelius");
  await expect(aurelius.locator(".journal")).toContainText("Échauffement : les 4 opérations");
  await expect(aurelius.locator(".dash-table")).toContainText("20");
  await expect(page.locator(".summary").first()).toContainText("20");
  // le serveur a bien reçu la tentative
  const res = await page.request.get("/api/log?child=aurelius");
  const { records } = await res.json();
  const attempt = records.find((r) => r.type === "attempt");
  expect(attempt.note20).toBe(20);
  expect(attempt.answers).toHaveLength(serie("s1-operations").questions.length);
});

test("erreurs : correction expliquée, note partielle, on refait ses erreurs", async ({ page }) => {
  const s = serie("s2-puissances");
  await page.goto(`/#/enfant/livia/lecon/${L}/serie/${s.id}`);
  // Q1 fausse
  await answer(page, s.questions[0], { wrong: true });
  await expect(page.locator(".feedback")).toHaveClass(/verdict-ko/);
  await expect(page.locator(".feedback")).toContainText("exposant");
  await page.locator(".feedback .next").click();
  // Q2 : « valider » sans rien choisir → message, pas de correction
  await page.locator(".validate").click();
  await expect(page.locator(".invalid")).toContainText("Choisis");
  await answer(page, s.questions[1], { wrong: true });
  await expect(page.locator(".choice.right")).toContainText("25");
  await page.locator(".feedback .next").click();
  // Q3 avec coup de pouce : 0,75 point
  await page.locator(".hint-btn").click();
  await expect(page.locator(".hint")).toBeVisible();
  await page.locator(".answer").fill("5×5×5");
  await page.locator(".validate").click();
  await expect(page.locator(".invalid")).toContainText("seulement le résultat");
  await page.locator(".answer").fill("125");
  await page.keyboard.press("Enter");
  await expect(page.locator(".v-pts")).toContainText("0,75");
  await page.locator(".feedback .next").click();
  for (const q of s.questions.slice(3)) {
    await answer(page, q);
    await page.locator(".feedback .next").click();
  }
  await expect(page.locator(".result")).toBeVisible();
  const total = s.questions.reduce((a, q) => a + (q.points ?? (q.type === "libre" ? 2 : 1)), 0);
  const expected = Math.round(((total - 2 - 0.25) / total) * 40) / 2;
  await expect(page.locator(".result .note-badge")).toContainText(String(expected).replace(".", ","));

  await page.locator(".retry").click();
  await expect(page.locator(".runner-head")).toContainText("On refait les erreurs");
  await expect(page.locator(".runner-head")).toContainText("/ 2"); // la question réussie avec coup de pouce n'est pas une erreur
  for (const q of s.questions.slice(0, 2)) {
    await answer(page, q);
    await page.locator(".feedback .next").click();
  }
  await expect(page.locator(".result")).toContainText("on a refait les erreurs");
  // le tour d'erreurs ne remplace pas la note de la série
  await page.goto(`/#/enfant/livia/lecon/${L}/entrainer`);
  await expect(page.locator(`[data-series="${s.id}"] .note-badge`)).toContainText(String(expected).replace(".", ","));
});

test("tous les types de questions (série défis) au clavier et à la souris", async ({ page }) => {
  const s = serie("s6-defis");
  await page.goto(`/#/enfant/livia/lecon/${L}/serie/${s.id}`);
  for (const q of s.questions) {
    if (q.id === "q4") {
      // clavier mathématique
      const input = page.locator(".answer");
      await input.fill("2+3");
      await input.evaluate((el) => el.setSelectionRange(0, 0));
      await page.locator('.key[data-k="("]').click();
      await input.press("End");
      await page.locator('.key[data-k=")"]').click();
      await page.locator('.key[data-k="×"]').click();
      await input.press("End");
      await input.type("4");
      await expect(input).toHaveValue("(2+3)×4");
      await page.locator(".validate").click();
    } else await answer(page, q);
    await expect(page.locator(".feedback")).toHaveClass(/verdict-ok/);
    await page.locator(".feedback .next").click();
  }
  await expect(page.locator(".result .note-badge")).toContainText("20");
});

test("réponse libre : idées repérées, réponse modèle, auto-évaluation visible par le parent", async ({ page }) => {
  const s = serie("s7-explique");
  await page.goto(`/#/enfant/aurelius/lecon/${L}/serie/${s.id}`);
  await page.locator(".free").fill("court");
  await page.locator(".validate").click();
  await expect(page.locator(".invalid")).toContainText("Développe");
  const txt = "Parce que la puissance est prioritaire, on calcule 4 au carré = 16 puis 3 + 16 = 19.";
  await page.locator(".free").fill(txt);
  await expect(page.locator(".wc")).toContainText("mots");
  await page.locator(".validate").click();
  await expect(page.locator(".feedback .ideas li.ok")).toHaveCount(3);
  await expect(page.locator(".feedback .ideas li.ko")).toHaveCount(1);
  await expect(page.locator(".feedback .model")).toContainText("(3 + 4)");
  await page.locator('[data-self="partie"]').click();
  await expect(page.locator('[data-self="partie"]')).toHaveClass(/selected/);
  await page.locator(".feedback .next").click();
  for (const q of s.questions.slice(1)) {
    await answer(page, q);
    await page.locator(".feedback .next").click();
  }
  await page.goto("/#/parent");
  const fa = page.locator("#dash-aurelius .free-answer").filter({ hasText: "4 au carré" });
  await expect(fa).toContainText("en partie");
  await expect(fa.locator("blockquote")).toHaveText(txt);
  await expect(page.locator("#dash-aurelius .weak")).toContainText("3 + 4");
});

test("synchronisation : ce qui est fait sur un appareil apparaît sur l'autre", async ({ page, browser }) => {
  await playSeries(page, "livia", serie("s5-gauche-droite"));
  const other = await browser.newContext(); // autre appareil : stockage local vide
  const phone = await other.newPage();
  await phone.goto("/#/enfant/livia");
  await expect(phone.locator("#a-suivre .lesson-card")).toContainText("1/7");
  await phone.goto(`/#/enfant/livia/lecon/${L}/entrainer`);
  await expect(phone.locator('[data-series="s5-gauche-droite"] .note-badge')).toContainText("20");
  await other.close();
});

test("hors ligne : rien n'est perdu, envoi au retour du réseau", async ({ page }) => {
  await page.goto("/#/enfant/aurelius");
  await page.route("**/api/log*", (route) => route.abort());
  await playSeries(page, "aurelius", serie("s3-parentheses"));
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem("precepteur:queue")).length);
  expect(queued).toBeGreaterThan(0);
  await page.goto(`/#/enfant/aurelius/lecon/${L}/entrainer`);
  await page.reload();
  await expect(page.locator(".pill.warn")).toContainText("Hors ligne");
  await expect(page.locator('[data-series="s3-parentheses"] .note-badge')).toContainText("20");

  await page.unroute("**/api/log*");
  await page.reload();
  await expect(page.locator(".pill.warn")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("precepteur:queue")).length)).toBe(0);
  const { records } = await (await page.request.get("/api/log?child=aurelius")).json();
  expect(records.some((r) => r.type === "attempt" && r.seriesId === "s3-parentheses")).toBe(true);
});

test("leçon entièrement réussie → rangée dans « Leçons passées » avec sa note", async ({ page }) => {
  for (const s of lesson.series) await playSeries(page, "livia", s);
  await page.goto("/#/enfant/livia");
  await expect(page.locator("#passees .past-row")).toContainText("Les règles de calcul");
  await expect(page.locator("#passees .note-badge")).toContainText("20");
  await expect(page.locator("#a-suivre .lesson-card")).toHaveCount(0);
  await page.goto("/#/parent");
  await expect(page.locator("#dash-livia .dash-table .pill")).toContainText("Réussie");
  await noHorizontalScroll(page);
});

test("association : un toucher par paire, correction d'un mauvais choix", async ({ page }) => {
  const s = serie("s1-operations");
  const q = s.questions.find((x) => x.type === "associer");
  await page.goto(`/#/enfant/aurelius/lecon/${L}/serie/${s.id}`);
  await answer(page, s.questions[0]);
  await page.locator(".feedback .next").click();
  const z = page.locator(".question");
  await expect(z.locator("select")).toHaveCount(0);
  await expect(z.locator('.m-left[data-l="0"]')).toHaveClass(/active/);
  // erreur : Addition → Produit, puis on corrige en touchant la case reliée
  await z.locator('.m-right[data-r="2"]').click();
  await expect(z.locator('.m-right[data-r="2"] .m-badge')).toHaveText("1");
  await expect(z.locator('.m-left[data-l="1"]')).toHaveClass(/active/);
  await z.locator('.m-right[data-r="2"]').click(); // délie
  await expect(z.locator('.m-left[data-l="0"]')).toHaveClass(/active/);
  await expect(z.locator('.m-right[data-r="2"] .m-badge')).toHaveText("");
  // valider trop tôt : message
  await z.locator(".validate").click();
  await expect(z.locator(".invalid")).toContainText("Associe");
  for (let i = 0; i < q.pairs.length; i++) await z.locator(`.m-right[data-r="${i}"]`).click();
  await z.locator(".validate").click();
  await expect(page.locator(".feedback")).toHaveClass(/verdict-ok/);
  await expect(z.locator(".m-left.right")).toHaveCount(q.pairs.length);
});

test("exemples de la fiche : étapes sans numéro", async ({ page }) => {
  await page.goto(`/#/enfant/livia/lecon/${L}/reviser`);
  const ex = page.locator(".exemple").filter({ hasText: "2^5" }).or(page.locator(".exemple").nth(2)).first();
  await ex.locator(".ex-next").click();
  const first = ex.locator(".ex-step").first();
  await expect(first).toBeVisible();
  expect(await first.evaluate((el) => getComputedStyle(el).listStyleType)).toBe("none");
  expect(await first.evaluate((el) => el.parentElement.tagName)).toBe("UL");
  await expect(first.locator(".ex-lead")).toHaveText("=");
});
