// Espace parents › Leçons : création avec Claude (faux serveur Claude, voir
// mock-claude.mjs), aperçu, publication, affectation aux enfants, suppression.
import { test, expect } from "@playwright/test";
import fs from "node:fs";

// petite image PNG valide (40×60 px)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACgAAAA8CAIAAACb22+3AAAAOElEQVR4nO3NQQkAAAgEsOufzBB20RgiDPZfqudExGKxWCwWi8VisVgsFovFYrFYLBaLxWLxp3gBeTe5iVfgoQIAAAAASUVORK5CYII=", "base64");
const photo = (name) => ({ name, mimeType: "image/png", buffer: PNG });
const TITLE = "L'accord du participe passé";

test.beforeEach(async ({ page }) => {
  fs.rmSync(".data-e2e", { recursive: true, force: true });
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

async function requestLesson(page, { notes = "", photos = 2, onlyLivia = false } = {}) {
  await page.goto("/#/parent/lecons");
  await expect(page.locator(".parent-tabs a.active")).toContainText("Leçons");
  await expect(page.locator(".generate")).toBeDisabled();
  if (photos) {
    await page.locator("#photo-input").setInputFiles(Array.from({ length: photos }, (_, i) => photo(`page${i + 1}.png`)));
    await expect(page.locator(".thumb")).toHaveCount(photos);
  }
  if (notes) await page.locator("#notes").fill(notes);
  if (onlyLivia) await page.locator('.creator .kid-check:has(input[value="aurelius"]) span').click();
  await page.locator(".generate").click();
  await expect(page.locator(".gen-status")).toContainText("C'est parti");
}

/** Revient plus tard sur la page (comme un parent qui l'avait fermée) jusqu'à voir la leçon. */
async function comeBackUntilReady(page) {
  await expect(async () => {
    await page.goto("/#/");
    await page.goto("/#/parent/lecons");
    await expect(page.locator(".admin-lesson:not(.job)", { hasText: TITLE })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20000 });
}

test("photos → demande envoyée, la page peut se fermer, la leçon arrive en brouillon", async ({ page, request }) => {
  await requestLesson(page, { notes: "Leçon de 5e, contrôle vendredi", onlyLivia: true });
  // le formulaire est vidé et la leçon apparaît comme « en cours de création »
  await expect(page.locator(".thumb")).toHaveCount(0);
  await expect(page.locator("#notes")).toHaveValue("");
  const job = page.locator(".admin-lesson.job");
  await expect(job).toContainText("en cours de création");
  await expect(job).toContainText("2 photos");
  await expect(job).toContainText("pour Livia");
  await expect(job.locator(".stop-job")).toContainText("Arrêter la génération et supprimer");

  // ce que Claude a reçu
  const last = await (await request.get("http://localhost:4319/last")).json();
  expect(last.images).toBe(2);
  expect(last.apiKey).toBe("cle-de-test");
  expect(last.text).toContain("contrôle vendredi");
  expect(last.tools).toEqual(["web_search_20260209", "web_fetch_20260209"]);

  // on quitte la page, on revient plus tard : la leçon est là, vérifiée, en brouillon
  await page.goto("/#/enfant/livia");
  await comeBackUntilReady(page);
  await expect(page.locator(".admin-lesson.job")).toHaveCount(0);
  const row = page.locator(".admin-lesson", { hasText: TITLE });
  await expect(row.locator(".al-status")).toHaveText("Brouillon");
  await expect(row.locator('input[value="livia"]')).toBeChecked();
  await expect(row.locator('input[value="aurelius"]')).not.toBeChecked();
  await row.locator(".al-notes summary").click();
  await expect(row.locator(".al-notes")).toContainText("corrigé 20 → 14");

  // brouillon : invisible pour les enfants
  await page.goto("/#/enfant/livia");
  await expect(page.locator(".lesson-card", { hasText: TITLE })).toHaveCount(0);
});

test("la page ouverte se met à jour toute seule quand la leçon est prête", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("precepteur:poll-ms", "500"));
  await requestLesson(page, { photos: 0, notes: "Programme de CM2 : les unités de mesure" });
  await expect(page.locator(".admin-lesson.job")).toContainText("unités de mesure");
  await expect(page.locator(".admin-lesson", { hasText: TITLE })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".admin-lesson.job")).toHaveCount(0);
});

test("sans photo : « Programme de CM2 : les unités de mesure » suffit", async ({ page, request }) => {
  await page.goto("/#/parent/lecons");
  const gen = page.locator(".generate");
  await page.locator("#notes").fill("CM2");
  await expect(gen).toBeDisabled(); // trop court pour construire une leçon
  await requestLesson(page, { photos: 0, notes: "Programme de CM2 : les unités de mesure" });
  const last = await (await request.get("http://localhost:4319/last")).json();
  expect(last.images).toBe(0);
  expect(last.text).toContain("Pas de photo");
  expect(last.text).toContain("Programme de CM2 : les unités de mesure");
  expect(last.domains).toEqual(["education.gouv.fr", "eduscol.education.fr"]);
  await comeBackUntilReady(page);
});

test("« Arrêter la génération et supprimer »", async ({ page }) => {
  await requestLesson(page, { photos: 1, notes: "LENT — leçon qui ne finit jamais" });
  const job = page.locator(".admin-lesson.job");
  await expect(job).toBeVisible();
  await page.reload();
  await expect(job).toContainText("en cours de création"); // toujours là après rechargement
  await job.locator(".stop-job").click();
  await expect(page.locator(".admin-lesson.job")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".admin-lesson.job")).toHaveCount(0);
});

test("refus de Claude : échec affiché, « Réessayer » ou supprimer", async ({ page }) => {
  await requestLesson(page, { photos: 1, notes: "REFUS — photos illisibles" });
  const job = page.locator(".admin-lesson.job");
  await expect(async () => {
    await page.reload();
    await expect(job).toContainText("refusé", { timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await expect(job.locator(".retry-job")).toBeVisible();
  await job.locator(".retry-job").click();
  await expect(job).toContainText("en cours de création");
  await expect(async () => {
    await page.reload();
    await expect(job).toContainText("refusé", { timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await job.locator(".stop-job").click();
  await expect(page.locator(".admin-lesson.job")).toHaveCount(0);
});

test("recherche web en pause : la génération reprend et aboutit", async ({ page, request }) => {
  await requestLesson(page, { photos: 0, notes: "PAUSE Programme de 5e : la grammaire du verbe" });
  await comeBackUntilReady(page);
  const last = await (await request.get("http://localhost:4319/last")).json();
  expect(last.turns).toBe(2); // demande relancée avec la suite de la conversation
});

test("aperçu parent : on peut tout parcourir, rien n'est enregistré", async ({ page, request }) => {
  await requestLesson(page);
  await comeBackUntilReady(page);
  await page.locator(".admin-lesson", { hasText: TITLE }).locator("a", { hasText: "Aperçu" }).click();
  await expect(page.locator(".preview-banner")).toContainText("Aperçu parent");
  await expect(page.locator(".callout.definition")).toContainText("Participe passé");
  await expect(page.locator(".liste li")).toHaveCount(3);
  await page.locator(".lesson-tabs a", { hasText: "S'entraîner" }).click();
  await page.locator(".series-card").first().click();
  await page.locator('.choice[data-v="2"]').click();
  await page.locator(".validate").click();
  await expect(page.locator(".feedback")).toHaveClass(/verdict-ok/);
  for (let i = 0; i < 3; i++) {
    await page.locator(".feedback .next").click();
    const q = page.locator(".question");
    if (await q.locator(".choice").count()) await q.locator(".choice").first().click();
    else if (await q.locator(".blank").count()) await q.locator(".blank").fill("être");
    else await q.locator(".answer").fill("14");
    await page.locator(".validate").click();
  }
  await page.locator(".feedback .next").click();
  await expect(page.locator(".result")).toBeVisible();
  const { records } = await (await request.get("/api/log")).json();
  expect(records).toEqual([]);
  await page.locator(".topbar .back").click();
  await page.locator(".topbar .back").click();
  await expect(page).toHaveURL(/#\/parent\/lecons$/);
});

test("publier, choisir les enfants, dépublier, supprimer", async ({ page }) => {
  await requestLesson(page);
  await comeBackUntilReady(page);
  const row = page.locator(".admin-lesson", { hasText: TITLE });
  await row.locator(".toggle-status").click();
  await expect(row.locator(".al-status")).toHaveText("Publiée");

  for (const kid of ["aurelius", "livia"]) {
    await page.goto(`/#/enfant/${kid}`);
    await expect(page.locator("#nouveau .lesson-card", { hasText: TITLE })).toBeVisible();
  }

  await page.goto("/#/parent/lecons");
  await row.locator('.kid-check:has(input[value="aurelius"]) span').click();
  await expect(row.locator(".al-msg")).toContainText("pour Livia");
  await page.goto("/#/enfant/aurelius");
  await expect(page.locator(".lesson-card", { hasText: TITLE })).toHaveCount(0);
  await page.goto("/#/enfant/livia");
  await expect(page.locator(".lesson-card", { hasText: TITLE })).toBeVisible();

  await page.goto("/#/parent/lecons");
  const builtin = page.locator(".admin-lesson", { hasText: "Les règles de calcul" });
  await expect(builtin.locator(".delete")).toHaveCount(0);
  await builtin.locator('.kid-check:has(input[value="livia"]) span').click();
  await expect(builtin.locator(".al-msg")).toContainText("Enregistré");
  await page.goto("/#/enfant/livia");
  await expect(page.locator(".lesson-card", { hasText: "Les règles de calcul" })).toHaveCount(0);

  await page.goto("/#/parent/lecons");
  await row.locator(".toggle-status").click();
  await expect(row.locator(".al-status")).toHaveText("Brouillon");
  await row.locator(".delete").click();
  await expect(page.locator(".admin-lesson", { hasText: TITLE })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("modèle, longueur, nombre de questions, correction IA : tout est réglable et chiffré", async ({ page, request }) => {
  await page.goto("/#/parent/lecons");
  // valeurs par défaut
  await expect(page.locator('input[name="model"][value="claude-sonnet-5"]')).toBeChecked();
  await expect(page.locator(".len-out")).toContainText("Moyenne");
  await expect(page.locator(".q-out")).toHaveText("40 questions en 5 séries — ≈ 30 min");
  await expect(page.locator('.model-cost[data-model="claude-haiku-4-5"]')).toContainText("$ la leçon");
  // réglages : Haiku, fiche courte, 20 questions, sans correction IA
  await page.locator('.model-card:has(input[value="claude-haiku-4-5"]) > span').click();
  await page.locator("#len").fill("2");
  await expect(page.locator(".len-out")).toContainText("Courte — 2 à 3 sections, ≈ 5 min de lecture");
  await page.locator("#nq").fill("20");
  await expect(page.locator(".q-out")).toHaveText("20 questions en 3 séries — ≈ 15 min");
  await page.locator(".new-ai .ios-track").click();
  await expect(page.locator(".new-ai input")).not.toBeChecked();
  await page.locator("#notes").fill("Programme de CM2 : les unités de mesure");
  await page.locator(".generate").click();
  await expect(page.locator(".admin-lesson.job")).toContainText("Haiku 4.5 · fiche courte · 20 questions · sans correction IA");
  const last = await (await request.get("http://localhost:4319/last")).json();
  expect(last.model).toBe("claude-haiku-4-5");
  expect(last.tools).toEqual(["web_search_20250305", "web_fetch_20250910"]);
  expect(last.text).toContain("exactement 20 questions au total, réparties en 3 séries");
  await comeBackUntilReady(page);
  const row = page.locator(".admin-lesson:not(.job)", { hasText: TITLE });
  // Haiku en batch : (20 000 × 1 + 30 000 × 5) / 1e6 / 2 + 1 recherche × 0,01 $ = 0,095 $
  await expect(row.locator(".al-cost")).toContainText("création 0,10 $ (Haiku 4.5)");
  await expect(row.locator(".ai-toggle input")).not.toBeChecked();
});

test("correction IA des réponses libres : coûts suivis, et coupure par le parent", async ({ page, request }) => {
  const grades = async () => (await (await request.get("http://localhost:4319/grades")).json()).grades;
  const before = await grades();
  const answerFree = async () => {
    await page.goto(`/#/enfant/livia/lecon/maths-regles-de-calcul-1/serie/s7-explique`);
    await page.locator(".free").fill("La puissance est prioritaire : 4 au carré = 16, donc 3 + 16 = 19.");
    await page.locator(".validate").click();
    await expect(page.locator(".feedback .verdict")).toBeVisible();
  };
  await answerFree();
  await expect(page.locator(".ai-feedback")).toContainText("Correction IA de test");
  expect(await grades()).toBe(before + 1);

  // coûts visibles : brique de la leçon et tableau de bord
  await page.goto("/#/parent/lecons");
  const row = page.locator(".admin-lesson", { hasText: "Les règles de calcul" });
  await expect(row.locator(".al-cost")).toContainText("corrections IA < 0,01 $ (1 réponse)");
  await page.goto("/#/parent");
  await expect(page.locator(".costs-card")).toContainText("Les règles de calcul");
  await expect(page.locator(".costs-card")).toContainText("(1 rép.)");
  await expect(page.locator("#dash-livia .dash-table")).toContainText("1 rép.");

  // le parent coupe l'IA pour cette leçon : plus aucun appel, correction par mots-clés
  await page.goto("/#/parent/lecons");
  await row.locator(".ai-toggle .ios-track").click();
  await expect(row.locator(".al-msg")).toContainText("désactivée");
  await answerFree();
  await expect(page.locator(".ai-feedback")).toHaveCount(0);
  await expect(page.locator(".feedback .ideas li.ok")).toHaveCount(3);
  expect(await grades()).toBe(before + 1);
});

test("coller depuis un document garde la structure (titres, listes, gras)", async ({ page }) => {
  await page.goto("/#/parent/lecons");
  const notes = page.locator("#notes");
  await notes.fill("Niveau : ");
  await notes.evaluate((el) => {
    el.setSelectionRange(el.value.length, el.value.length);
    const dt = new DataTransfer();
    dt.setData("text/html", "<h3>Chapitre 2</h3><ol><li>Les <b>seigneurs</b></li><li>Les paysans</li></ol>");
    dt.setData("text/plain", "Chapitre 2 Les seigneurs Les paysans");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(notes).toHaveValue("Niveau : ### Chapitre 2\n\n1. Les **seigneurs**\n2. Les paysans");
  await expect(page.locator(".generate")).toBeEnabled(); // le collage compte comme saisie
});
