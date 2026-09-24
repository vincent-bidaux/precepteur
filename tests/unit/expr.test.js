import { describe, it, expect } from "vitest";
import { evaluate, normalizeExpr, parseNumber, tryEvaluate } from "../../src/lib/expr.js";

describe("evaluate — règles de priorité", () => {
  const cases = [
    ["7 × (10 + 3)", 91],
    ["(5 + 2) × (6 − 4)", 14],
    ["5 × [14 − (5 − 3)]", 60],
    ["3 + 4^2", 19],
    ["(3 + 4)^2", 49],
    ["5 × 2^3", 40],
    ["10 + 3 × 7", 31],
    ["17 − 6 ÷ 3", 15],
    ["2 × 2,5 + 4 × 1,25", 10],
    ["12 − 8 + 3", 7],
    ["12 ÷ 2 × 3", 18],
    ["2^3^2", 512],
    ["-3^2", -9],
    ["(-3)^2", 9],
    ["2 + 3 × (4 + 1)²", 77],
    ["10³", 1000],
    ["6 : 2 x (1+2)", 9],
    ["2 ** 5", 32],
  ];
  for (const [e, v] of cases) it(`${e} = ${v}`, () => expect(evaluate(e)).toBeCloseTo(v, 9));

  it("refuse les expressions invalides", () => {
    for (const bad of ["2 +", "(2 + 3", "2 ++ 3 )", "abc", "5 ÷ 0", "1.2.3"]) expect(tryEvaluate(bad)).toBeNull();
  });
});

describe("normalizeExpr / parseNumber", () => {
  it("unifie les symboles", () => {
    expect(normalizeExpr("7⁴")).toBe("7^4");
    expect(normalizeExpr(" 2 x 3 * 4 · 5 ")).toBe("2×3×4×5");
    expect(normalizeExpr("12 / 3 : 2")).toBe("12÷3÷2");
    expect(normalizeExpr("2,5 − 1")).toBe("2.5-1");
  });
  it("lit les nombres saisis", () => {
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber(" 1 000 ")).toBe(1000);
    expect(parseNumber("-4")).toBe(-4);
    expect(parseNumber("3+4")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });
});
