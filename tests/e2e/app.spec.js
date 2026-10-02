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
/**
 * Glisse une étiquette et la dépose au-dessus d'une autre — au doigt (vrais
 * évènements tactiles) sur le projet mobile, à la souris sur ordinateur.
 */
async function dragOnto(page, from, onto) {
  const a = await from.boundingBox();
  const b = await onto.boundingBox();
  const x = a.x + a.width / 2;
  const y0 = a.y + a.height / 2;
  const y1 = b.y + (b.y < a.y ? 6 : b.height - 6); // un peu au-delà du milieu de la cible
  const steps = 12;
  if (test.info().project.name === "mobile") {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", y0);
    for (let i = 1; i <= steps; i++) await touch("touchMove", y0 + ((y1 - y0) * i) / steps);
    await touch("touchEnd");
  } else {
    await page.mouse.move(x, y0);
    await page.mouse.down();
    await page.mouse.move(x, y1, { steps });
    await page.mouse.up();
  }
}

/** Remet la liste dans l'ordre en glissant chaque étiquette à sa place. */
async function sortByDragging(page, zone) {
  const n = await zone.locator(".order-item").count();
  for (let i = 0; i < n; i++) {
    const order = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
    const pos = order.indexOf(i);
    if (pos === i) continue;
    await dragOnto(page, zone.locator(`.order-item[data-orig="${i}"]`), zone.locator(".order-item").nth(i));
  }
  const order = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
  expect(order).toEqual([...Array(n).keys()]);
}

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
      if (!wrong) await sortByDragging(page, zone);
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
  await expect(page.locator("#archivees .empty-line")).toBeVisible();
  await expect(page.locator("#archivees h2")).toContainText("Leçons archivées");
  await expect(page.locator("#nouveau .subject-tag")).toContainText("Mathématiques");
  await expect(page.locator("#nouveau .subject-tag")).toContainText("5e");
  await expect(page.locator("#matieres")).toContainText("Mathématiques");
  // toutes les matières enseignées, même sans leçon : un toucher prépare la demande
  await expect(page.locator("#matieres .ask-subject", { hasText: "Français" })).toBeVisible();
  await page.locator("#matieres .ask-subject", { hasText: "Français" }).click();
  await expect(page.locator("#request-text")).toHaveValue("Français : ");
  await expect(page.locator("#demande textarea")).toBeVisible();
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
  await expect(aurelius.locator(".lessons-table")).toContainText("20");
  await expect(aurelius.locator(".subjects-table")).toContainText("Mathématiques");
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

  await expect(page.locator(".note-kind")).toContainText("note initiale");
  await page.locator(".retry").click();
  await expect(page.locator(".runner-head")).toContainText("On refait les erreurs");
  await expect(page.locator(".runner-head")).toContainText("/ 2"); // la question réussie avec coup de pouce n'est pas une erreur
  for (const q of s.questions.slice(0, 2)) {
    await answer(page, q);
    await page.locator(".feedback .next").click();
  }
  await expect(page.locator(".result")).toContainText("on a refait les erreurs");
  await expect(page.locator(".note-kind")).toContainText("note après reprise");
  // le tour d'erreurs ne remplace pas la note initiale : il améliore la note après reprise
  await page.goto(`/#/enfant/livia/lecon/${L}/entrainer`);
  const card = page.locator(`[data-series="${s.id}"]`);
  await expect(card.locator(".note-badge").first()).toContainText(String(expected).replace(".", ","));
  await expect(card).toContainText("après reprise");
  const after = await card.locator(".note-badge").nth(1).innerText();
  expect(Number(after.replace(",", ".").match(/[\d.]+/)[0])).toBeGreaterThan(expected);
  await expect(page.locator(".note-box").first()).toContainText(String(expected).replace(".", ","));
  // boutons au niveau du test : la question avec coup de pouce (0,75) reste à reprendre
  await expect(card.locator(".redo-test")).toBeVisible();
  await card.locator(".redo-wrong").click();
  await expect(page).toHaveURL(new RegExp(`serie/${s.id}/erreurs$`));
  await expect(page.locator(".runner-head")).toContainText("On refait les erreurs");
  await expect(page.locator(".runner-head")).toContainText("/ 1");
  await answer(page, s.questions[2]);
  await page.locator(".feedback .next").click();
  await expect(page.locator(".result")).toContainText("pour ce test");
  await page.goto(`/#/enfant/livia/lecon/${L}/entrainer`);
  await expect(card.locator(".no-wrong")).toBeVisible();
  await expect(card.locator(".redo-wrong")).toHaveCount(0);
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

test("réponse libre : idées repérées, réponse modèle, points réclamés puis validés par le parent", async ({ page }) => {
  const s = serie("s7-explique");
  await page.goto(`/#/enfant/aurelius/lecon/${L}/serie/${s.id}`);
  await page.locator(".free").fill("court");
  await page.locator(".validate").click();
  await expect(page.locator(".invalid")).toContainText("Développe");
  const txt = "En bref : parce que la puissance est prioritaire, on calcule 4 au carré = 16 puis 3 + 16 = 19.";
  await page.locator(".free").fill(txt);
  await expect(page.locator(".wc")).toContainText("mots");
  await page.locator(".validate").click();
  await expect(page.locator(".feedback .ideas li.ok")).toHaveCount(3);
  await expect(page.locator(".feedback .ideas li.ko")).toHaveCount(1);
  await expect(page.locator(".feedback .model")).toContainText("(3 + 4)");
  await page.locator(".feedback .claim").click();
  await expect(page.locator(".claim-zone")).toContainText("Points réclamés");
  await expect(page.locator(".feedback .claim")).toHaveCount(0);
  await page.locator(".feedback .next").click();
  for (const q of s.questions.slice(1)) {
    await answer(page, q);
    await page.locator(".feedback .next").click();
  }
  await page.goto("/#/parent");
  const fa = page.locator("#dash-aurelius .free-answer").filter({ hasText: "4 au carré" });
  await expect(fa).toHaveClass(/claimed/);
  await expect(fa.locator(".claim-flag")).toContainText("à vérifier");
  await expect(fa.locator("blockquote")).toHaveText(txt);
  await expect(fa).toContainText("Correction IA"); // retour de l'IA visible par le parent
  // à quelle leçon et quel test appartient la réponse
  await expect(fa.locator(".fa-lesson")).toContainText("Les règles de calcul");
  await expect(fa.locator(".fa-lesson .subject-tag")).toContainText("Maths · 5e");
  await expect(fa.locator(".fa-test")).toContainText(s.title);
  // les réponses réclamées passent en tête
  await expect(page.locator("#dash-aurelius .free-answer").first()).toHaveClass(/claimed/);
  await fa.locator('[data-decision="valide"]').click();
  const fa2 = page.locator("#dash-aurelius .free-answer").filter({ hasText: "4 au carré" });
  await expect(fa2.locator(".claim-flag")).toContainText("validés");
  await expect(fa2.locator('[data-decision="valide"]')).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/log?child=aurelius")).json()).records.some((r) => r.type === "review" && r.decision === "valide")).toBe(true);
});

test("synchronisation : ce qui est fait sur un appareil apparaît sur l'autre", async ({ page, browser }) => {
  await playSeries(page, "livia", serie("s5-gauche-droite"));
  const other = await browser.newContext(); // autre appareil : stockage local vide
  const phone = await other.newPage();
  await phone.goto("/#/enfant/livia");
  await expect(phone.locator("#a-suivre .lesson-card")).toContainText("1/7");
  await phone.goto(`/#/enfant/livia/lecon/${L}/entrainer`);
  await expect(phone.locator('[data-series="s5-gauche-droite"] .note-badge').first()).toContainText("20");
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
  await expect(page.locator('[data-series="s3-parentheses"] .note-badge').first()).toContainText("20");

  await page.unroute("**/api/log*");
  await page.reload();
  await expect(page.locator(".pill.warn")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("precepteur:queue")).length)).toBe(0);
  const { records } = await (await page.request.get("/api/log?child=aurelius")).json();
  expect(records.some((r) => r.type === "attempt" && r.seriesId === "s3-parentheses")).toBe(true);
});

test("leçon entièrement réussie → refaire en entier, archiver, ressortir", async ({ page }) => {
  test.setTimeout(180000); // on joue les 7 séries
  for (const s of lesson.series) await playSeries(page, "livia", s);
  await page.goto(`/#/enfant/livia/lecon/${L}/entrainer`);
  // chaque test a son « Refaire » ; aucune question ratée nulle part
  await expect(page.locator(".series-card .redo-test")).toHaveCount(lesson.series.length);
  await expect(page.locator(".series-card .redo-wrong")).toHaveCount(0);
  const first = lesson.series[0];
  await page.locator(`[data-series="${first.id}"] .redo-test`).click();
  await expect(page).toHaveURL(new RegExp(`serie/${first.id}$`));
  await expect(page.locator(".runner-head")).toContainText(`/ ${first.questions.length}`);

  await page.goto("/#/enfant/livia");
  const card = page.locator("#a-suivre .lesson-card", { hasText: "Les règles de calcul" });
  await expect(card.locator(".note-badge")).toContainText("20");
  await card.locator(".archive-btn").click();
  await expect(page.locator("#archivees .past-row")).toContainText("Les règles de calcul");
  await expect(page.locator("#archivees .note-badge")).toContainText("20");
  await expect(page.locator("#a-suivre .lesson-card")).toHaveCount(0);
  await page.goto("/#/parent");
  await page.locator(".dash-child-tabs [data-child=livia]").click();
  await expect(page.locator("#dash-livia .lessons-table .pill").first()).toContainText("Réussie");
  await expect(page.locator("#dash-livia .journal")).toContainText("archivé");
  await noHorizontalScroll(page);
  // ressortir des archives
  await page.goto("/#/enfant/livia");
  await page.locator("#archivees .archive-btn").click();
  await expect(page.locator("#a-suivre .lesson-card")).toHaveCount(1);
  await expect(page.locator("#archivees .empty-line")).toBeVisible();
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

test("remettre dans l'ordre : glisser-déposer (doigt ou souris) et clavier", async ({ page }) => {
  const s = serie("s6-defis");
  const q = s.questions.find((x) => x.type === "ordre");
  await page.goto(`/#/enfant/aurelius/lecon/${L}/serie/${s.id}`);
  const zone = page.locator(".question");
  await expect(zone.locator(".order-btns, .order-list button")).toHaveCount(0); // plus de flèches
  await expect(zone.locator(".order-help")).toContainText("Fais glisser");
  // un glisser : l'étiquette change de place et les numéros suivent
  const before = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
  await dragOnto(page, zone.locator(".order-item").nth(3), zone.locator(".order-item").nth(0));
  const after = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
  expect(after).toEqual([before[3], before[0], before[1], before[2]]);
  await expect(zone.locator(".order-pos")).toHaveText(["1", "2", "3", "4"]);
  // au clavier : l'étiquette 1 descend d'un cran
  await zone.locator(".order-item").nth(0).focus();
  await page.keyboard.press("ArrowDown");
  const kb = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
  expect(kb).toEqual([after[1], after[0], after[2], after[3]]);
  await expect(zone.locator(".order-item").nth(1)).toBeFocused();
  // tout remettre en ordre puis valider
  await sortByDragging(page, zone);
  await zone.locator(".validate").click();
  await expect(page.locator(".feedback")).toHaveClass(/verdict-ok/);
  await expect(zone.locator(".order-item.right")).toHaveCount(q.items.length);
  // après correction, on ne peut plus rien déplacer
  const locked = await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)));
  await dragOnto(page, zone.locator(".order-item").nth(3), zone.locator(".order-item").nth(0));
  expect(await zone.locator(".order-item").evaluateAll((els) => els.map((e) => Number(e.dataset.orig)))).toEqual(locked);
});

test("tableau de bord : onglets enfants, leçons repliées, matières et programme, listes « Voir plus »", async ({ page }) => {
  // 30 visites d'Aurelius → journal long
  const records = Array.from({ length: 30 }, (_, i) => ({ id: `rec-visit-${String(i).padStart(3, "0")}`, type: "visit", child: "aurelius", lessonId: L, page: "reviser", ts: Date.now() - i * 3600e3, durationMs: 20 * 60e3 }));
  await page.request.post("/api/log", { data: { records } });
  await playSeries(page, "aurelius", serie("s1-operations"));
  await page.goto("/#/parent");
  await expect(page.locator(".dash-child-tabs .child-tab")).toHaveCount(2);
  await expect(page.locator("#dash-livia")).toHaveCount(0); // un seul enfant affiché à la fois
  await page.locator(".dash-child-tabs [data-child=aurelius]").click();
  const a = page.locator("#dash-aurelius");
  await expect(a).toBeVisible();
  // chaque enfant a son coût
  await expect(page.locator(".summary").first()).toContainText("$");
  // activité en heures (graduée au quart d'heure)
  await expect(a.locator(".chart .axis").filter({ hasText: /h|min/ }).first()).toBeVisible();
  // leçons repliées : le détail des séries est caché
  const lessonRow = a.locator(".lessons-table tbody").first();
  await expect(lessonRow.locator(".subject-tag")).toContainText("Maths · 5e");
  await expect(lessonRow.locator("tr.sub").first()).toBeHidden();
  await lessonRow.locator(".toggle-row").click();
  await expect(lessonRow.locator("tr.sub").first()).toBeVisible();
  // matières : sans classe renseignée, pas de lien ; on choisit la classe → lien officiel
  await expect(a.locator(".subjects-table")).toContainText("classe non renseignée");
  // toutes les matières, même sans leçon
  await expect(a.locator(".subjects-table tr.no-lesson", { hasText: "Français" })).toHaveCount(1);
  const toggle = await lessonRow.locator(".toggle-row").boundingBox();
  expect(toggle.width).toBeGreaterThanOrEqual(36); // flèche facile à toucher
  await a.locator('.level-picker [data-level="5e"]').click();
  await expect(page.locator("#dash-aurelius .subjects-table a[href*='eduscol']").first()).toHaveAttribute("href", /cycle-4/);
  // en 5e : SVT, LV2… mais plus « Questionner le monde » (CP-CE2)
  await expect(page.locator("#dash-aurelius .subjects-table")).toContainText("Physique-Chimie");
  await expect(page.locator("#dash-aurelius .subjects-table")).not.toContainText("Questionner le monde");
  await expect(page.locator(".summary").first()).toContainText("5e");
  // journal long : rogné, « Voir plus » puis « Voir tout »
  const j = page.locator("#dash-aurelius .journal-zone");
  await expect(j.locator("li")).toHaveCount(6);
  await j.locator(".more").click();
  await expect(j.locator("li")).toHaveCount(16);
  await j.locator(".all").click();
  await expect(j.locator(".more")).toHaveCount(0);
  expect(await j.locator("li").count()).toBeGreaterThan(30);
  expect(await j.locator(".journal").evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  await noHorizontalScroll(page);
});
