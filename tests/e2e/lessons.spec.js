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

async function createLesson(page, { notes = "", onlyLivia = false } = {}) {
  await page.goto("/#/parent/lecons");
  await expect(page.locator(".parent-tabs a.active")).toContainText("Leçons");
  await expect(page.locator(".generate")).toBeDisabled();
  await page.locator("#photo-input").setInputFiles([photo("page1.png"), photo("page2.png")]);
  await expect(page.locator(".thumb")).toHaveCount(2);
  if (notes) await page.locator("#notes").fill(notes);
  if (onlyLivia) await page.locator('.creator .kid-check:has(input[value="aurelius"]) span').click();
  await page.locator(".generate").click();
}

test("photos → leçon générée par Claude, vérifiée, en brouillon", async ({ page, request }) => {
  await createLesson(page, { notes: "Leçon de 5e, contrôle vendredi", onlyLivia: true });
  await expect(page.locator(".created h3")).toContainText(TITLE, { timeout: 30000 });
  await expect(page.locator(".created")).toContainText("2 séries");
  // les corrections automatiques sont signalées
  await page.locator(".created summary").click();
  await expect(page.locator(".created")).toContainText("corrigé 20 → 14");
  await expect(page.locator(".created")).toContainText("retirée");

  // ce que le faux Claude a reçu
  const last = await (await request.get("http://localhost:4319/last")).json();
  expect(last.images).toBe(2);
  expect(last.apiKey).toBe("cle-de-test");
  expect(last.text).toContain("contrôle vendredi");

  const row = page.locator(".admin-lesson", { hasText: TITLE });
  await expect(row.locator(".al-status")).toHaveText("Brouillon");
  await expect(row.locator('input[value="livia"]')).toBeChecked();
  await expect(row.locator('input[value="aurelius"]')).not.toBeChecked();

  // brouillon : invisible pour les enfants
  await page.goto("/#/enfant/livia");
  await expect(page.locator(".lesson-card", { hasText: TITLE })).toHaveCount(0);
});

test("aperçu parent : on peut tout parcourir, rien n'est enregistré", async ({ page, request }) => {
  await createLesson(page);
  await expect(page.locator(".created")).toBeVisible({ timeout: 30000 });
  await page.locator(".created a", { hasText: "aperçu" }).click();
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
  await createLesson(page);
  await expect(page.locator(".created")).toBeVisible({ timeout: 30000 });
  await page.locator(".publish-new").click();
  const row = page.locator(".admin-lesson", { hasText: TITLE });
  await expect(row.locator(".al-status")).toHaveText("Publiée");

  // publiée pour les deux → « Nouveau » chez chacun
  for (const kid of ["aurelius", "livia"]) {
    await page.goto(`/#/enfant/${kid}`);
    await expect(page.locator("#nouveau .lesson-card", { hasText: TITLE })).toBeVisible();
  }

  // on la retire à Aurelius
  await page.goto("/#/parent/lecons");
  await row.locator('.kid-check:has(input[value="aurelius"]) span').click();
  await expect(row.locator(".al-msg")).toContainText("pour Livia");
  await page.goto("/#/enfant/aurelius");
  await expect(page.locator(".lesson-card", { hasText: TITLE })).toHaveCount(0);
  await page.goto("/#/enfant/livia");
  await expect(page.locator(".lesson-card", { hasText: TITLE })).toBeVisible();

  // la leçon intégrée peut aussi être retirée à un enfant
  await page.goto("/#/parent/lecons");
  const builtin = page.locator(".admin-lesson", { hasText: "Les règles de calcul" });
  await expect(builtin.locator(".delete")).toHaveCount(0);
  await builtin.locator('.kid-check:has(input[value="livia"]) span').click();
  await expect(builtin.locator(".al-msg")).toContainText("Enregistré");
  await page.goto("/#/enfant/livia");
  await expect(page.locator(".lesson-card", { hasText: "Les règles de calcul" })).toHaveCount(0);

  // dépublier puis supprimer
  await page.goto("/#/parent/lecons");
  await row.locator(".toggle-status").click();
  await expect(row.locator(".al-status")).toHaveText("Brouillon");
  await row.locator(".delete").click();
  await expect(page.locator(".admin-lesson", { hasText: TITLE })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("refus de Claude : message clair, les photos restent là", async ({ page }) => {
  await createLesson(page, { notes: "REFUS" });
  await expect(page.locator(".gen-status .error")).toContainText("refusé", { timeout: 30000 });
  await expect(page.locator(".thumb")).toHaveCount(2);
  await expect(page.locator(".generate")).toBeEnabled();
});
