import { describe, expect, it } from "vitest";
import {
  columnsOf,
  fenced,
  formatRows,
  toCsv,
  toDelimited,
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

  it("neutralizes spreadsheet formula prefixes when asked", () => {
    const csv = toCsv(
      [{ a: "=1+1", b: "+SUM(A1)", c: "-2", d: "@cmd", e: "ok", n: 5 }],
      { neutralizeFormulas: true },
    );
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("ok");
    // Numbers keep their type and are never prefixed.
    expect(csv).toContain("5");
    expect(csv).not.toContain("'5");
  });

  it("leaves values alone by default", () => {
    expect(toCsv([{ a: "=1+1" }])).toBe("a\n=1+1");
  });
});

describe("toDelimited", () => {
  it("supports TSV output", () => {
    expect(toDelimited([{ a: 1, b: 2 }], "\t").trim()).toBe("a\tb\n1\t2");
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

  it("truncates oversized cells", () => {
    const table = toMarkdownTable([{ data: "x".repeat(500) }], { maxCellLength: 10 });
    const row = table.split("\n")[2];
    expect(row.length).toBeLessThan(40);
    expect(row).toContain("…");
  });

  it("reports truncation notes", () => {
    const table = toMarkdownTable([{ a: 1 }, { a: 2 }, { a: 3 }], { maxRows: 2 });
    expect(table).toContain("1 more row");
  });

  it("renders an empty marker", () => {
    expect(toMarkdownTable([])).toBe("_No rows._");
  });
});

describe("fenced", () => {
  it("uses a longer fence when content contains backticks", () => {
    const out = fenced("before ``` inside", "json");
    expect(out.startsWith("````json")).toBe(true);
    expect(out.endsWith("````")).toBe(true);
  });

  it("uses a plain fence for normal content", () => {
    expect(fenced("hello", "json")).toBe("```json\nhello\n```");
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
