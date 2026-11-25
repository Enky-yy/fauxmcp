import Papa from "papaparse";
import type { Row } from "./faker.js";

export type OutputFormat = "json" | "csv" | "tsv" | "sql" | "markdown";

export function columnsOf(rows: Row[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

export function toJson(rows: Row[]): string {
  return JSON.stringify(rows, null, 2);
}

export function toDelimited(rows: Row[], delimiter: string): string {
  if (rows.length === 0) return "";
  return Papa.unparse(rows as Record<string, unknown>[], {
    delimiter,
    columns: columnsOf(rows),
    newline: "\n",
  });
}

export function toCsv(rows: Row[]): string {
  return toDelimited(rows, ",");
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTypeFor(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? "INTEGER" : "REAL";
  if (typeof value === "boolean") return "BOOLEAN";
  return "TEXT";
}

/** Build portable SQL: CREATE TABLE + INSERT statements. */
export function toSql(rows: Row[], tableName: string): string {
  const cols = columnsOf(rows);
  if (cols.length === 0) return "-- no rows to insert";
  const types = new Map<string, string>();
  for (const col of cols) {
    const sample = rows.find((row) => row[col] !== undefined && row[col] !== null);
    types.set(col, sample ? sqlTypeFor(sample[col]) : "TEXT");
  }
  const ident = quoteIdent(tableName);
  const create = `CREATE TABLE IF NOT EXISTS ${ident} (\n${cols
    .map((col) => `  ${quoteIdent(col)} ${types.get(col)}`)
    .join(",\n")}\n);`;
  const inserts = rows.map(
    (row) =>
      `INSERT INTO ${ident} (${cols.map(quoteIdent).join(", ")}) VALUES (${cols
        .map((col) => sqlLiteral(row[col]))
        .join(", ")});`,
  );
  return [create, "", ...inserts].join("\n");
}

function escapeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

/** Render rows as a GitHub-flavored Markdown table. */
export function toMarkdownTable(rows: Row[], options: { maxRows?: number; maxColumns?: number } = {}): string {
  if (rows.length === 0) return "_No rows._";
  const allCols = columnsOf(rows);
  const maxColumns = options.maxColumns ?? allCols.length;
  const cols = allCols.slice(0, maxColumns);
  const shown = options.maxRows ? rows.slice(0, options.maxRows) : rows;

  const header = `| ${cols.map(escapeCell).join(" | ")} |`;
  const divider = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = shown.map((row) => `| ${cols.map((col) => escapeCell(row[col])).join(" | ")} |`);

  let out = [header, divider, ...body].join("\n");
  const notes: string[] = [];
  if (options.maxRows && rows.length > options.maxRows) {
    notes.push(`… ${rows.length - options.maxRows} more row(s) not shown`);
  }
  if (allCols.length > maxColumns) {
    notes.push(`${allCols.length - maxColumns} more column(s) hidden`);
  }
  if (notes.length > 0) out += `\n\n_${notes.join(" · ")}._`;
  return out;
}

export function formatRows(
  rows: Row[],
  format: OutputFormat,
  tableName = "generated_data",
): string {
  switch (format) {
    case "json":
      return toJson(rows);
    case "csv":
      return toCsv(rows);
    case "tsv":
      return toDelimited(rows, "\t");
    case "sql":
      return toSql(rows, tableName);
    case "markdown":
      return toMarkdownTable(rows);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported output format: ${String(exhaustive)}`);
    }
  }
}

export function extensionFor(format: string): string {
  switch (format) {
    case "json":
      return "json";
    case "csv":
      return "csv";
    case "tsv":
      return "tsv";
    case "sql":
      return "sql";
    case "markdown":
    case "md":
      return "md";
    case "html":
      return "html";
    default:
      return "txt";
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (truncated ${text.length - max} character(s))`;
}
