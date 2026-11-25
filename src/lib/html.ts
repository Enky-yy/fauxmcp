import * as cheerio from "cheerio";
import type { Row } from "./faker.js";

export interface ExtractedTable {
  index: number;
  caption?: string;
  headers: string[];
  rows: string[][];
}

function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((header, i) => {
    const base = header.trim() || `column_${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function normalizeRow(row: string[], width: number): string[] {
  const out = row.slice(0, width);
  while (out.length < width) out.push("");
  return out;
}

function cleanCell($: cheerio.CheerioAPI, cell: unknown): string {
  return $(cell as never)
    .text()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract every HTML table from a page. Handles header rows declared with
 * `<th>`; otherwise generates `column_1..n` headers and treats the first row
 * as data. Nested tables are flattened by the outer table scan.
 */
export function extractTables(html: string, maxTables = 20): ExtractedTable[] {
  const $ = cheerio.load(html);
  const tables: ExtractedTable[] = [];

  $("table").each((index, element) => {
    if (tables.length >= maxTables) return false;
    const $table = $(element);
    const caption = $table.find("caption").first().text().replace(/\s+/g, " ").trim() || undefined;

    const grid: string[][] = [];
    $table.find("tr").each((_, tr) => {
      const cells = $(tr)
        .find("th,td")
        .toArray()
        .map((cell) => cleanCell($, cell));
      if (cells.some((cell) => cell !== "")) grid.push(cells);
    });

    if (grid.length === 0) return;

    const firstRow = $table.find("tr").first();
    const hasHeaderCells = firstRow.find("th").length > 0;
    let headers: string[];
    let rows: string[][];

    if (hasHeaderCells) {
      headers = dedupeHeaders(grid[0]);
      rows = grid.slice(1);
    } else {
      const width = Math.max(...grid.map((row) => row.length));
      headers = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
      rows = grid;
    }

    tables.push({
      index,
      caption,
      headers,
      rows: rows.map((row) => normalizeRow(row, headers.length)),
    });
  });

  return tables;
}

export function tableToRows(table: ExtractedTable): Row[] {
  return table.rows.map((row) => {
    const obj: Row = {};
    table.headers.forEach((header, i) => {
      obj[header] = row[i] ?? "";
    });
    return obj;
  });
}
