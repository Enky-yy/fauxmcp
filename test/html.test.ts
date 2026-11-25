import { describe, expect, it } from "vitest";
import { extractTables, tableToRows } from "../src/lib/html.js";

const withHeader = `<table>
  <caption>People</caption>
  <tr><th>Name</th><th>Role</th></tr>
  <tr><td>Alice</td><td>Engineer</td></tr>
  <tr><td>Bob</td><td>Designer</td></tr>
</table>`;

const withoutHeader = `<table>
  <tr><td>a</td><td>b</td></tr>
  <tr><td>c</td><td>d</td></tr>
</table>`;

describe("extractTables", () => {
  it("extracts headers from a <th> row and strips formatting", () => {
    const tables = extractTables(withHeader);
    expect(tables).toHaveLength(1);
    expect(tables[0].caption).toBe("People");
    expect(tables[0].headers).toEqual(["Name", "Role"]);
    expect(tables[0].rows).toEqual([
      ["Alice", "Engineer"],
      ["Bob", "Designer"],
    ]);
  });

  it("generates column names when there is no header row", () => {
    const tables = extractTables(withoutHeader);
    expect(tables[0].headers).toEqual(["column_1", "column_2"]);
    expect(tables[0].rows).toHaveLength(2);
  });

  it("normalizes ragged rows to the header width", () => {
    const tables = extractTables(
      `<table><tr><th>a</th><th>b</th></tr><tr><td>1</td></tr></table>`,
    );
    expect(tables[0].rows[0]).toEqual(["1", ""]);
  });

  it("deduplicates repeated headers", () => {
    const tables = extractTables(
      `<table><tr><th>x</th><th>x</th><th></th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>`,
    );
    expect(tables[0].headers).toEqual(["x", "x_2", "column_3"]);
  });

  it("respects maxTables", () => {
    const html = `<table><tr><td>1</td></tr></table>`.repeat(5);
    expect(extractTables(html, 2)).toHaveLength(2);
  });

  it("returns an empty array when no tables exist", () => {
    expect(extractTables("<p>hello</p>")).toEqual([]);
  });
});

describe("tableToRows", () => {
  it("maps headers to row values", () => {
    const [table] = extractTables(withHeader);
    expect(tableToRows(table)).toEqual([
      { Name: "Alice", Role: "Engineer" },
      { Name: "Bob", Role: "Designer" },
    ]);
  });
});
