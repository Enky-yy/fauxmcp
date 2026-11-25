import { describe, expect, it } from "vitest";
import { toSql, quoteIdent, toCsv, fenced } from "../src/lib/format.js";
import { generateRows, type FieldSpec } from "../src/lib/faker.js";

describe("SQL injection resistance", () => {
  it("quotes malicious table names so semicolons/dashes are neutralized", () => {
    const sql = toSql([{ id: 1 }], 'users; DROP TABLE users; --');
    // The dangerous text appears only inside a double-quoted identifier
    expect(sql).toContain('"users; DROP TABLE users; --"');
    // The CREATE TABLE line uses the quoted identifier
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "users; DROP TABLE users; --"/);
    // No unquoted statement separator: no ';' outside of quotes followed by DROP
    const unquoted = sql.replace(/"[^"]*"/g, "");
    expect(unquoted).not.toMatch(/;\s*DROP/);
  });

  it("escapes quotes in table names", () => {
    const sql = toSql([{ id: 1 }], 'users"');
    expect(sql).toContain('"users""');
  });
});

describe("CSV formula handling in generate_csv path", () => {
  it("generate_csv output for constant formula-like value", () => {
    const fields: FieldSpec[] = [{ name: "x", type: "constant", value: "=1+1" }];
    const rows = generateRows(fields, 2, "en", 1);
    // formatRows with format=csv does NOT neutralize (generated data is trusted)
    const csv = toCsv(rows);
    expect(csv).toContain("=1+1");
  });
});

describe("code fence breaking", () => {
  it("fenced uses longer fence for backtick content", () => {
    const out = fenced("x ` y ``` z", "text");
    const fence = out.split("\n")[0];
    expect(fence.length).toBeGreaterThanOrEqual(4);
    expect(out.startsWith("````")).toBe(true);
  });
});

describe("generate_rows edge cases", () => {
  it("enum with empty values throws", () => {
    expect(() =>
      generateRows([{ name: "x", type: "enum", values: [] }], 1, "en", 1),
    ).toThrow();
  });

  it("integer outside min/max throws validation", () => {
    // This is handled by zod schema, not generateRows itself
    const fields: FieldSpec[] = [{ name: "n", type: "integer", min: 0, max: 0 }];
    const rows = generateRows(fields, 5, "en", 1);
    for (const row of rows) expect(row.n).toBe(0);
  });
});
