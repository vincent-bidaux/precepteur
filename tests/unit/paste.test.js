// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { htmlToText } from "../../src/lib/paste.js";

describe("collage avec mise en forme", () => {
  it("garde titres, listes numérotées et à puces (imbriquées), gras et italique", () => {
    const html = `<h2>Chapitre 3 — La société féodale</h2>
      <p>Un <b>seigneur</b> protège ses <i>vassaux</i>.</p>
      <ol><li>Les seigneurs<ul><li>châteaux</li><li>ban</li></ul></li><li>Les paysans</li></ol>
      <ul><li>Contrôle <strong>vendredi</strong></li></ul>`;
    expect(htmlToText(html)).toBe(
      "## Chapitre 3 — La société féodale\n\nUn **seigneur** protège ses *vassaux*.\n\n1. Les seigneurs\n  - châteaux\n  - ban\n2. Les paysans\n\n- Contrôle **vendredi**",
    );
  });

  it("Google Docs : ignore le faux gras englobant, garde le vrai gras en style", () => {
    const html = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-x"><p dir="ltr"><span style="font-weight:700;">Objectif</span><span style="font-weight:400;"> : dates clés</span></p></b>`;
    expect(htmlToText(html)).toBe("**Objectif** : dates clés");
  });

  it("tableaux et sauts de ligne", () => {
    const html = `<table><tr><th>Date</th><th>Évènement</th></tr><tr><td>1789</td><td>Révolution</td></tr></table><p>ligne 1<br>ligne 2</p>`;
    expect(htmlToText(html)).toBe("Date | Évènement\n1789 | Révolution\n\nligne 1\nligne 2");
  });

  it("numérotation d'une liste qui commence ailleurs qu'à 1", () => {
    expect(htmlToText('<ol start="3"><li>c</li><li>d</li></ol>')).toBe("3. c\n4. d");
  });
});
