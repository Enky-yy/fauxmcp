import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Papa from "papaparse";
import { z } from "zod";
import { config } from "../lib/env.js";
import {
  findByUrl,
  getDataset,
  listDatasets,
  saveDataset,
  type DatasetMeta,
} from "../lib/cache.js";
import { guardedFetch } from "../lib/fetch.js";
import { formatBytes, formatRows, toMarkdownTable, truncate } from "../lib/format.js";
import { extractTables, tableToRows } from "../lib/html.js";
import type { Row } from "../lib/faker.js";
import { ok, withErrors } from "../lib/result.js";

const USER_AGENT = "fauxmcp/0.1 (dataset toolbox MCP)";

type DetectedFormat = "csv" | "tsv" | "json" | "html" | "text";

interface ParsedPayload {
  rows: Row[] | null;
  json: unknown;
  format: DetectedFormat;
}

function detectFormat(
  explicit: string,
  contentType: string,
  url: string,
  text: string,
): DetectedFormat {
  if (explicit !== "auto") return explicit as DetectedFormat;

  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("csv")) return "csv";
  if (ct.includes("tab-separated")) return "tsv";
  if (ct.includes("html")) return "html";

  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = "";
  }
  if (pathname.endsWith(".json")) return "json";
  if (pathname.endsWith(".csv")) return "csv";
  if (pathname.endsWith(".tsv")) return "tsv";
  if (pathname.endsWith(".html") || pathname.endsWith(".htm")) return "html";

  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // not valid JSON after all
    }
  }

  const newline = text.indexOf("\n");
  const firstLine = newline === -1 ? text : text.slice(0, newline);
  if (firstLine.includes("\t")) return "tsv";
  if (firstLine.includes(",")) return "csv";
  return "text";
}

function normalizeRow(input: Record<string, unknown>): Row {
  const row: Row = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      row[key] = value;
    } else if (value === null || value === undefined) {
      row[key] = "";
    } else {
      row[key] = String(value);
    }
  }
  return row;
}

function jsonToRows(json: unknown): Row[] | null {
  if (Array.isArray(json)) {
    if (json.length === 0) return [];
    const allObjects = json.every(
      (item) => item !== null && typeof item === "object" && !Array.isArray(item),
    );
    if (allObjects) return (json as Record<string, unknown>[]).map(normalizeRow);
    return null;
  }
  if (json !== null && typeof json === "object") {
    for (const value of Object.values(json as Record<string, unknown>)) {
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))
      ) {
        return (value as Record<string, unknown>[]).map(normalizeRow);
      }
    }
  }
  return null;
}

function parseDelimited(text: string, delimiter: string): Row[] {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter,
  });
  return (result.data ?? [])
    .filter((row) => row && typeof row === "object")
    .map((row) => normalizeRow(row));
}

function parsePayload(text: string, format: DetectedFormat): ParsedPayload {
  if (format === "json") {
    try {
      const json: unknown = JSON.parse(text);
      return { rows: jsonToRows(json), json, format };
    } catch {
      return { rows: null, json: undefined, format: "text" };
    }
  }
  if (format === "csv" || format === "tsv") {
    const rows = parseDelimited(text, format === "tsv" ? "\t" : ",");
    return { rows: rows.length > 0 ? rows : [], json: undefined, format };
  }
  return { rows: null, json: undefined, format };
}

function previewPayload(parsed: ParsedPayload, text: string, maxRows: number): string {
  if (parsed.rows && parsed.rows.length > 0) {
    return toMarkdownTable(parsed.rows, { maxRows, maxColumns: 12 });
  }
  if (parsed.rows && parsed.rows.length === 0) {
    return "_The dataset is empty (0 rows)._";
  }
  if (parsed.json !== undefined) {
    return `\`\`\`json\n${truncate(JSON.stringify(parsed.json, null, 2), 3000)}\n\`\`\``;
  }
  return `\`\`\`\n${truncate(text, 3000)}\n\`\`\``;
}

function nameFromUrl(url: string, fallback = "dataset"): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1]?.replace(/\.[a-z0-9]+$/i, "");
    if (last) return `${parsed.hostname}-${last}`;
    return parsed.hostname || fallback;
  } catch {
    return fallback;
  }
}

function savedNoteFor(meta: DatasetMeta): string {
  return (
    `\n\n📦 Saved as \`${meta.id}\` (${formatBytes(meta.bytes)}` +
    `${meta.rows !== undefined ? `, ${meta.rows} rows` : ""}) — read it with ` +
    `\`read_saved_dataset\` or \`fauxmcp://datasets/${meta.id}\`.`
  );
}

export function registerRetrievalTools(server: McpServer): void {
  server.registerTool(
    "fetch_dataset",
    {
      title: "Fetch a dataset from a URL",
      description:
        "Download a CSV, TSV, or JSON dataset from any http(s) URL (data.gov, GitHub raw files, " +
        "public APIs, Kaggle mirrors, …). Detects the format, parses it, previews the rows, and caches " +
        "the full file locally so it can be reused without downloading again. " +
        `Downloads are capped at ${config.maxSizeMb} MB and ${config.fetchTimeoutMs / 1000}s by default.`,
      inputSchema: z.object({
        url: z.url().describe("Direct URL to a CSV, TSV, or JSON file"),
        name: z.string().optional().describe("Name to save the dataset under"),
        format: z
          .enum(["auto", "csv", "tsv", "json", "text"])
          .default("auto")
          .describe("Force a format instead of auto-detecting"),
        refresh: z.boolean().default(false).describe("Ignore the cache and download again"),
        save: z.boolean().default(true).describe("Store the full dataset in the local cache"),
        max_rows: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Rows to show in the preview (does not truncate the saved file)"),
      }),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    withErrors(async (args) => {
      let text: string | null = null;
      let contentType = "";
      let source = args.url;
      let fromCache = false;

      if (!args.refresh) {
        const cached = await findByUrl(args.url);
        if (cached) {
          const loaded = await getDataset(cached.id);
          if (loaded) {
            text = loaded.content;
            fromCache = true;
            source = cached.sourceUrl ?? args.url;
          }
        }
      }

      if (text === null) {
        const result = await guardedFetch(args.url, {
          headers: { "user-agent": USER_AGENT },
        });
        text = result.text;
        contentType = result.contentType;
        source = result.finalUrl;
      }

      const format = detectFormat(args.format, contentType, source, text);
      const parsed = parsePayload(text, format);

      const lines = [
        `✅ ${fromCache ? "Loaded from cache" : "Fetched"}: ${source}`,
        `- **Detected format:** \`${parsed.format}\`` +
          (contentType ? ` · **Content-Type:** \`${contentType}\`` : ""),
        `- **Size:** ${formatBytes(Buffer.byteLength(text, "utf8"))}` +
          (parsed.rows ? ` · **Rows:** ${parsed.rows.length}` : ""),
      ];

      let saved = "";
      if (args.save) {
        const meta = await saveDataset({
          name: args.name ?? nameFromUrl(source),
          content: text,
          format: parsed.format,
          kind: "fetch",
          sourceUrl: args.url,
          rows: parsed.rows?.length,
        });
        saved = savedNoteFor(meta);
      }

      const previewLimit = args.max_rows ?? config.previewRows;
      return ok(`${lines.join("\n")}\n\n${previewPayload(parsed, text, previewLimit)}${saved}`);
    }),
  );

  server.registerTool(
    "scrape_table",
    {
      title: "Scrape HTML tables",
      description:
        "Extract HTML tables from a webpage (Wikipedia, docs, stats sites, …) into structured rows. " +
        "Returns a preview and saves the table(s) as CSV in the local cache. " +
        "Works on server-rendered HTML; pages that build tables with JavaScript are not supported. " +
        `Up to ${config.maxTables} tables are extracted per page.`,
      inputSchema: z.object({
        url: z.url().describe("Page URL that contains one or more <table> elements"),
        table_index: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Which table on the page to extract (0-based)"),
        all_tables: z
          .boolean()
          .default(false)
          .describe("Extract and save every table on the page instead of just one"),
        name: z.string().optional().describe("Base name to save the table(s) under"),
        max_rows: z.number().int().min(1).optional().describe("Rows to show in the preview"),
      }),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    withErrors(async (args) => {
      const fetched = await guardedFetch(args.url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      });
      const tables = extractTables(fetched.text, config.maxTables);

      if (tables.length === 0) {
        throw new Error(
          "No <table> elements found on the page. It may render tables with JavaScript, " +
            "which fauxmcp does not execute.",
        );
      }

      const base = args.name ?? nameFromUrl(args.url, "tables");
      const previewLimit = args.max_rows ?? config.previewRows;

      if (args.all_tables) {
        const lines = [`✅ Found **${tables.length}** table(s) on ${fetched.finalUrl}`];
        for (const table of tables) {
          const rows = tableToRows(table);
          const csv = formatRows(rows, "csv");
          const meta = await saveDataset({
            name: `${base}-table-${table.index + 1}`,
            content: csv,
            format: "csv",
            kind: "scrape",
            sourceUrl: args.url,
            rows: rows.length,
          });
          lines.push(
            `- **Table ${table.index + 1}**${table.caption ? ` — “${table.caption}”` : ""}: ` +
              `${rows.length} rows × ${table.headers.length} cols → \`${meta.id}\``,
          );
        }
        const first = tables[0];
        const preview = toMarkdownTable(tableToRows(first), {
          maxRows: previewLimit,
          maxColumns: 12,
        });
        return ok(
          `${lines.join("\n")}\n\n#### Preview — table ${first.index + 1}\n\n${preview}`,
        );
      }

      const table = tables[args.table_index];
      if (!table) {
        const available = tables
          .map(
            (candidate) =>
              `- index ${candidate.index}: ${candidate.caption ?? "(no caption)"} — ` +
              `${candidate.rows.length} rows`,
          )
          .join("\n");
        throw new Error(
          `Table index ${args.table_index} not found. Available tables:\n${available}`,
        );
      }

      const rows = tableToRows(table);
      const csv = formatRows(rows, "csv");
      const meta = await saveDataset({
        name: `${base}-table-${table.index + 1}`,
        content: csv,
        format: "csv",
        kind: "scrape",
        sourceUrl: args.url,
        rows: rows.length,
      });

      const header = [
        `✅ Extracted table **${table.index + 1}**` +
          (table.caption ? ` — “${table.caption}”` : "") +
          ` from ${fetched.finalUrl}`,
        `- **Rows:** ${rows.length} · **Columns:** ${table.headers.length}` +
          ` · **Size:** ${formatBytes(meta.bytes)}`,
        `- **Saved as:** \`${meta.id}\` (CSV)`,
      ].join("\n");

      return ok(
        `${header}\n\n${toMarkdownTable(rows, {
          maxRows: previewLimit,
          maxColumns: 12,
        })}`,
      );
    }),
  );

  server.registerTool(
    "query_public_api",
    {
      title: "Query a public API",
      description:
        "Call a public REST dataset API with query params, headers, and an optional JSON body. " +
        "Parses the JSON response, previews it as a table when possible, and caches the full response. " +
        "GET responses are cached by URL unless `refresh` is true.",
      inputSchema: z.object({
        url: z.url().describe("API endpoint URL"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe("Query-string parameters"),
        headers: z.record(z.string(), z.string()).optional().describe("Extra request headers"),
        body: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .optional()
          .describe("Request body (objects are JSON-encoded)"),
        name: z.string().optional().describe("Name to save the response under"),
        refresh: z.boolean().default(false).describe("Ignore the cache and call the API again"),
        save: z.boolean().default(true).describe("Store the full response in the local cache"),
        max_items: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Items to show in the preview"),
      }),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    withErrors(async (args) => {
      const target = new URL(args.url);
      for (const [key, value] of Object.entries(args.params ?? {})) {
        target.searchParams.set(key, String(value));
      }
      const cacheKey = target.toString();

      const headers: Record<string, string> = {
        accept: "application/json",
        "user-agent": USER_AGENT,
        ...(args.headers ?? {}),
      };

      let body: string | undefined;
      if (args.body !== undefined) {
        body = typeof args.body === "string" ? args.body : JSON.stringify(args.body);
        const hasContentType = Object.keys(headers).some(
          (key) => key.toLowerCase() === "content-type",
        );
        if (!hasContentType) headers["content-type"] = "application/json";
      }

      let text: string | null = null;
      let contentType = "";
      let finalUrl = cacheKey;
      let fromCache = false;

      if (args.method === "GET" && !args.refresh) {
        const cached = await findByUrl(cacheKey);
        if (cached) {
          const loaded = await getDataset(cached.id);
          if (loaded) {
            text = loaded.content;
            fromCache = true;
            finalUrl = cached.sourceUrl ?? cacheKey;
          }
        }
      }

      if (text === null) {
        const result = await guardedFetch(cacheKey, {
          method: args.method,
          headers,
          body,
        });
        text = result.text;
        contentType = result.contentType;
        finalUrl = result.finalUrl;
      }

      let json: unknown;
      let isJson = false;
      try {
        json = JSON.parse(text);
        isJson = true;
      } catch {
        isJson = false;
      }

      const rows = isJson ? jsonToRows(json) : null;
      const limit = args.max_items ?? config.previewRows;

      let preview: string;
      if (rows && rows.length > 0) {
        preview = toMarkdownTable(rows, { maxRows: limit, maxColumns: 12 });
      } else if (rows && rows.length === 0) {
        preview = "_Empty array._";
      } else if (isJson) {
        preview = `\`\`\`json\n${truncate(JSON.stringify(json, null, 2), 3000)}\n\`\`\``;
      } else {
        preview = `\`\`\`\n${truncate(text, 3000)}\n\`\`\``;
      }

      const header = [
        `✅ ${fromCache ? "Loaded from cache" : `${args.method} ${finalUrl}`}`,
        `- **Status:** OK · **Type:** \`${isJson ? "json" : "text"}\`` +
          (contentType ? ` · **Content-Type:** \`${contentType}\`` : ""),
        `- **Size:** ${formatBytes(Buffer.byteLength(text, "utf8"))}` +
          (rows ? ` · **Items:** ${rows.length}` : ""),
      ].join("\n");

      let saved = "";
      if (args.save) {
        const meta = await saveDataset({
          name: args.name ?? nameFromUrl(finalUrl, "api-response"),
          content: text,
          format: isJson ? "json" : "text",
          kind: "api",
          sourceUrl: cacheKey,
          rows: rows?.length,
        });
        saved = savedNoteFor(meta);
      }

      return ok(`${header}\n\n${preview}${saved}`);
    }),
  );

  server.registerTool(
    "list_saved_datasets",
    {
      title: "List saved datasets",
      description:
        "List every dataset cached locally by fauxmcp (downloads, scraped tables, API responses, " +
        "large generated results). Shows id, name, format, row count, size, and source.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(50).describe("Maximum entries to show"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withErrors(async (args) => {
      const datasets = await listDatasets();
      if (datasets.length === 0) {
        return ok(
          "No saved datasets yet. Use `fetch_dataset`, `scrape_table`, `query_public_api`, " +
            "or generate more than one preview worth of rows to create one.",
        );
      }

      const shown = datasets.slice(0, args.limit);
      const rows: Row[] = shown.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        format: dataset.format,
        rows: dataset.rows ?? "",
        size: formatBytes(dataset.bytes),
        kind: dataset.kind,
        updated: dataset.updatedAt.slice(0, 19).replace("T", " "),
        source: dataset.sourceUrl ? truncate(dataset.sourceUrl, 60) : "",
      }));

      const header =
        `📚 **${datasets.length}** saved dataset(s)` +
        (datasets.length > shown.length ? ` (showing ${shown.length})` : "") +
        ` in \`${config.cacheDir}\``;

      return ok(
        `${header}\n\n${toMarkdownTable(rows)}\n\n` +
          "Read any of them with `read_saved_dataset` or the resource `fauxmcp://datasets/{id}`.",
      );
    }),
  );

  server.registerTool(
    "read_saved_dataset",
    {
      title: "Read a saved dataset",
      description:
        "Page through a dataset previously cached by fauxmcp. Supports CSV/TSV/JSON tabular data " +
        "plus SQL and text files (line-based). Use `list_saved_datasets` to find ids.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Dataset id from list_saved_datasets"),
        offset: z.number().int().min(0).default(0).describe("Row/line offset to start from"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(config.maxRows)
          .default(config.previewRows)
          .describe("Rows/lines to return"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withErrors(async (args) => {
      const dataset = await getDataset(args.id);
      if (!dataset) {
        const datasets = await listDatasets();
        const available = datasets.map((entry) => `- ${entry.id} (${entry.format})`).join("\n");
        throw new Error(
          `Dataset "${args.id}" not found.` +
            (available ? ` Available datasets:\n${available}` : " The cache is empty."),
        );
      }

      const { meta, content } = dataset;
      const format = meta.format === "tsv" ? "tsv" : meta.format === "csv" ? "csv" : meta.format === "json" ? "json" : "text";
      const parsed = parsePayload(content, format);

      const header =
        `📖 **${meta.name}** (\`${meta.id}\`) · \`${meta.format}\` · ${formatBytes(meta.bytes)}` +
        (meta.rows !== undefined ? ` · ${meta.rows} rows` : "") +
        (meta.sourceUrl ? `\nSource: ${meta.sourceUrl}` : "");

      if (parsed.rows && parsed.rows.length > 0) {
        const slice = parsed.rows.slice(args.offset, args.offset + args.limit);
        if (slice.length === 0) {
          return ok(
            `${header}\n\n_No rows at offset ${args.offset} (dataset has ${parsed.rows.length})._`,
          );
        }
        const end = args.offset + slice.length;
        return ok(
          `${header}\n\nShowing rows ${args.offset + 1}–${end} of ${parsed.rows.length}:\n\n` +
            toMarkdownTable(slice, { maxColumns: 12 }),
        );
      }

      if (parsed.json !== undefined) {
        return ok(
          `${header}\n\n\`\`\`json\n${truncate(JSON.stringify(parsed.json, null, 2), 6000)}\n\`\`\``,
        );
      }

      const lines = content.split("\n");
      const slice = lines.slice(args.offset, args.offset + args.limit);
      return ok(
        `${header}\n\nShowing lines ${args.offset + 1}–${args.offset + slice.length} of ` +
          `${lines.length}:\n\n\`\`\`\n${slice.join("\n")}\n\`\`\``,
      );
    }),
  );
}
