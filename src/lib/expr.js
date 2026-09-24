// Expressions numériques : normalisation d'une saisie (×, ÷, ², crochets…)
// et évaluation sûre (pas d'eval) avec les vraies règles de priorité.

const SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** Forme canonique : opérateurs + - × ÷ ^, parenthèses ( ) [ ], décimales avec un point. */
export function normalizeExpr(input = "") {
  let s = String(input)
    .replace(/\s+/g, "")
    .replace(/\*\*/g, "^")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^" + [...m].map((c) => SUP[c]).join(""))
    .replace(/[xX*·•⋅✕✖]/g, "×")
    .replace(/[:/]/g, "÷")
    .replace(/[−–—]/g, "-")
    .replace(/[{]/g, "[")
    .replace(/[}]/g, "]");
  s = s.replace(/(\d),(\d)/g, "$1.$2");
  return s;
}

function tokenize(s) {
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[\d.]/.test(c)) {
      let j = i;
      while (j < s.length && /[\d.]/.test(s[j])) j++;
      const txt = s.slice(i, j);
      if (!/^\d+(\.\d+)?$|^\.\d+$/.test(txt)) throw new Error("nombre invalide");
      tokens.push({ t: "n", v: parseFloat(txt) });
      i = j;
    } else if ("+-×÷^()[]".includes(c)) {
      tokens.push({ t: c });
      i++;
    } else {
      throw new Error(`caractère inattendu « ${c} »`);
    }
  }
  return tokens;
}

/** Évalue une expression (chaîne brute ou normalisée). Lève une erreur si invalide. */
export function evaluate(input) {
  const tokens = tokenize(normalizeExpr(input));
  let p = 0;
  const peek = () => tokens[p]?.t;
  const eat = (t) => {
    if (peek() !== t) throw new Error(`« ${t} » attendu`);
    p++;
  };
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[p++].t;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term() {
    let v = unary();
    while (peek() === "×" || peek() === "÷") {
      const op = tokens[p++].t;
      const r = unary();
      if (op === "÷" && r === 0) throw new Error("division par zéro");
      v = op === "×" ? v * r : v / r;
    }
    return v;
  }
  function unary() {
    if (peek() === "-") {
      p++;
      return -unary();
    }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() === "^") {
      p++;
      return Math.pow(base, unary()); // associatif à droite ; -3² = -(3²)
    }
    return base;
  }
  function primary() {
    const tk = tokens[p];
    if (!tk) throw new Error("expression incomplète");
    if (tk.t === "n") {
      p++;
      return tk.v;
    }
    if (tk.t === "(" || tk.t === "[") {
      p++;
      const v = expr();
      eat(tk.t === "(" ? ")" : "]");
      return v;
    }
    throw new Error(`« ${tk.t} » mal placé`);
  }
  const v = expr();
  if (p !== tokens.length) throw new Error("expression mal formée");
  return v;
}

export function tryEvaluate(input) {
  try {
    return evaluate(input);
  } catch {
    return null;
  }
}

export const sameNumber = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Lit un nombre saisi par un enfant : « 12,5 », « 1 000 », « 49 ». null sinon. */
export function parseNumber(input = "") {
  const s = String(input).replace(/\s+/g, "").replace(",", ".").replace(/[−–]/g, "-");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}
