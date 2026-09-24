// Collage dans le champ texte de l'espace parents : un <textarea> n'affiche
// que du texte brut, donc la mise en forme copiée depuis Word, Google Docs,
// un site ou un PDF (titres, listes numérotées ou à puces, gras, tableaux)
// est convertie en texte structuré lisible (façon Markdown) au lieu d'être
// perdue.

const BLOCKS = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "PRE", "TR", "DL", "DT", "DD", "FIGURE"]);
const SKIP = new Set(["STYLE", "SCRIPT", "HEAD", "META", "TITLE", "NOSCRIPT"]);

const styleOf = (el) => (el.getAttribute?.("style") || "").toLowerCase();
function isBold(el) {
  const st = styleOf(el);
  const w = st.match(/font-weight\s*:\s*(\w+)/)?.[1];
  if (w) return w === "bold" || w === "bolder" || Number(w) >= 600;
  return el.tagName === "STRONG" || el.tagName === "B";
}
const isItalic = (el) => /font-style\s*:\s*italic/.test(styleOf(el)) || ((el.tagName === "EM" || el.tagName === "I") && !/font-style\s*:\s*normal/.test(styleOf(el)));

function inline(node) {
  let out = "";
  for (const child of node.childNodes) out += convert(child, { inList: false });
  return out;
}

function wrap(text, mark) {
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text;
}

function list(el, depth) {
  const ordered = el.tagName === "OL";
  let n = Number(el.getAttribute("start")) || 1;
  const pad = "  ".repeat(depth);
  let out = "";
  for (const li of el.children) {
    if (li.tagName !== "LI") continue;
    let text = "";
    let nested = "";
    for (const c of li.childNodes) {
      if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) nested += list(c, depth + 1);
      else text += convert(c, { inList: true });
    }
    out += `${pad}${ordered ? `${n++}.` : "-"} ${text.replace(/\s*\n+\s*/g, " ").trim()}\n${nested}`;
  }
  return out;
}

function convert(node, ctx = {}) {
  if (node.nodeType === 3) return node.nodeValue.replace(/[ \t\r\n]+/g, " ");
  if (node.nodeType !== 1) return "";
  const tag = node.tagName;
  if (SKIP.has(tag)) return "";
  if (tag === "BR") return "\n";
  if (/^H[1-6]$/.test(tag)) return `\n\n${"#".repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`;
  if (tag === "UL" || tag === "OL") return `\n${list(node, 0)}\n`;
  if (tag === "TD" || tag === "TH") return `${inline(node).trim()} | `;
  if (tag === "TR") return `${inline(node).replace(/\s*\|\s*$/, "")}\n`;
  if (tag === "HR") return "\n---\n";
  let inner = inline(node);
  if (isBold(node)) inner = wrap(inner, "**");
  if (isItalic(node)) inner = wrap(inner, "*");
  if (BLOCKS.has(tag) || tag === "LI") return ctx.inList ? inner : `\n${inner}\n`;
  return inner;
}

/** HTML du presse-papiers → texte structuré. */
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return convert(doc.body)
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+(?=[^\s-\d])/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Branche la conversion sur un champ texte (garde le texte brut si pas d'HTML). */
export function keepFormattingOnPaste(textarea) {
  textarea.addEventListener("paste", (e) => {
    const html = e.clipboardData?.getData("text/html");
    if (!html) return; // texte brut : le comportement normal garde déjà les retours à la ligne
    const text = htmlToText(html);
    if (!text) return;
    e.preventDefault();
    const { selectionStart: s, selectionEnd: end, value } = textarea;
    textarea.value = value.slice(0, s) + text + value.slice(end);
    textarea.setSelectionRange(s + text.length, s + text.length);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
