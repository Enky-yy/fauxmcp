import { describe, expect, it } from "vitest";
import {
  columnsOf,
  formatRows,
  toCsv,
  toMarkdownTable,
  toSql,
  truncate,
  formatBytes,
} from "../src/lib/format.js";
import type { Row } from "../src/lib/faker.js";

const rows: Row[] = [
  { id: 1, name: "Alice O'Brien", active: true, price: 12.5 },
  { id: 2, name: "Bob | Builder", active: false, price: 7 },
];

describe("columnsOf", () => {
  it("collects keys across rows in first-seen order", () => {
    expect(columnsOf([{ b: 1, a: 2 }, { c: 3, a: 4 }])).toEqual(["b", "a", "c"]);
  });

  it("returns an empty array for no rows", () => {
    expect(columnsOf([])).toEqual([]);
  });
});

describe("toCsv", () => {
  it("quotes values that contain commas or quotes", () => {
    const csv = toCsv([{ text: "hello, world", quote: 'say "hi"' }]);
    expect(csv).toContain('"hello, world"');
    expect(csv).toContain('"say ""hi"""');
  });
});

describe("toSql", () => {
  it("creates a table and escapes single quotes", () => {
    const sql = toSql(rows, "users");
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "users"');
    expect(sql).toContain('"active" BOOLEAN');
    expect(sql).toContain('"price" REAL');
    expect(sql).toContain("'Alice O''Brien'");
    expect(sql).toContain("TRUE");
  });

  it("handles an empty dataset", () => {
    expect(toSql([], "empty")).toContain("no rows");
  });
});

describe("toMarkdownTable", () => {
  it("escapes pipes so cells do not break the table", () => {
    const table = toMarkdownTable([{ name: "Bob | Builder" }]);
    expect(table).toContain("Bob \\| Builder");
  });

  it("reports truncation notes", () => {
    const table = toMarkdownTable([{ a: 1 }, { a: 2 }, { a: 3 }], { maxRows: 2 });
    expect(table).toContain("1 more row");
  });

  it("renders an empty marker", () => {
    expect(toMarkdownTable([])).toBe("_No rows._");
  });
});

describe("formatRows", () => {
  it("dispatches to the requested format", () => {
    expect(formatRows([{ a: 1 }], "json")).toContain('"a": 1');
    expect(formatRows([{ a: 1 }], "csv").trim()).toBe("a\n1");
    expect(formatRows([{ a: 1 }], "sql", "t")).toContain("INSERT INTO");
    expect(formatRows([{ a: 1 }], "markdown")).toContain("| a |");
  });
});

describe("helpers", () => {
  it("formats byte counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });

  it("truncates long text", () => {
    const out = truncate("abcdef", 3);
    expect(out.startsWith("abc")).toBe(true);
    expect(out).toContain("truncated 3 character(s)");
  });
});
