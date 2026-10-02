// Captures d'écran pour vérification visuelle (lancé à la main : SHOTS=dossier).
import { test, expect } from "@playwright/test";
import fs from "node:fs";
const dir = process.env.SHOTS;
test.skip(!dir, "captures seulement à la demande");
test("captures", async ({ page }, info) => {
  fs.rmSync(".data-e2e", { recursive: true, force: true });
  const p = info.project.name;
  await page.request.post("/api/lessons?action=request", { data: { child: "livia", text: "Les fractions, contrôle mardi" } });
  await page.goto("/#/enfant/aurelius/lecon/maths-regles-de-calcul-1/serie/s7-explique");
  await page.locator(".free").fill("En bref : la puissance passe avant : 4 au carré = 16, puis 3 + 16 = 19.");
  await page.locator(".validate").click();
  await page.locator(".feedback .claim").click();
  for (let i = 1; i < 6; i++) {
    await page.locator(".feedback .next").click();
    if (!(await page.locator(".free").count())) break;
    await page.locator(".free").fill("En bref : je pense que la règle des priorités dit de commencer par les parenthèses.");
    await page.locator(".validate").click();
  }
  await page.screenshot({ path: `${dir}/${p}-runner-claim.png`, fullPage: true });
  for (const [name, url] of [["home", "/#/enfant/aurelius"], ["lecon", "/#/enfant/aurelius/lecon/maths-regles-de-calcul-1/entrainer"], ["suivi", "/#/parent"], ["lecons", "/#/parent/lecons"]]) {
    await page.goto(url);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${p}-${name}.png`, fullPage: true });
  }
  await page.locator(".admin-lesson .al-expand").first().click();
  await page.screenshot({ path: `${dir}/${p}-lecons-open.png`, fullPage: true });
  await expect(page.locator(".al-body").first()).toBeVisible();
});
