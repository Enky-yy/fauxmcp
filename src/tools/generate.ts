import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../lib/env.js";
import {
  FIELD_TYPES,
  PRESETS,
  PRESET_NAMES,
  generateRows,
  getFaker,
  type FieldSpec,
  type Row,
} from "../lib/faker.js";
import {
  formatBytes,
  formatRows,
  fenced,
  toMarkdownTable,
  truncate,
  type OutputFormat,
} from "../lib/format.js";
import { saveDataset } from "../lib/cache.js";
import { ok, withErrors } from "../lib/result.js";

const fieldSpecSchema = z.object({
  name: z.string().min(1).max(64).describe("Column / field name"),
  type: z.enum(FIELD_TYPES).describe("Value generator type"),
  values: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Allowed values (required when type = enum)"),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .describe("Fixed value (required when type = constant)"),
  min: z.number().optional().describe("Inclusive lower bound for numeric types"),
  max: z.number().optional().describe("Inclusive upper bound for numeric types"),
});

const FORMATS = ["json", "csv", "tsv", "sql", "markdown"] as const;

const recordInput = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(config.maxRows)
    .default(10)
    .describe(`Number of rows to generate (max ${config.maxRows})`),
  fields: z
    .array(fieldSpecSchema)
    .max(100)
    .optional()
    .describe("Field definitions (max 100). Omit to use a preset."),
  preset: z
    .enum(PRESET_NAMES)
    .optional()
    .describe("Built-in schema to use when `fields` is omitted (default: people)"),
  format: z.enum(FORMATS).default("json").describe("Output format"),
  table_name: z
    .string()
    .default("generated_data")
    .describe("Table name used only when format = sql"),
  locale: z.string().optional().describe("Faker locale, e.g. en, de, fr, ja, pt_BR"),
  seed: z
    .number()
    .int()
    .optional()
    .describe("Seed for reproducible output (same seed = same data)"),
  name: z
    .string()
    .optional()
    .describe("Dataset name used when saving large results to the cache"),
});

type RecordArgs = z.infer<typeof recordInput>;

const FENCE: Record<string, string> = {
  json: "json",
  csv: "csv",
  tsv: "text",
  sql: "sql",
  markdown: "md",
};

function resolveFields(fields: FieldSpec[] | undefined, preset: string | undefined): FieldSpec[] {
  if (fields && fields.length > 0) return fields;
  const name = preset ?? "people";
  const resolved = PRESETS[name];
  if (!resolved) {
    throw new Error(`Unknown preset "${name}". Available presets: ${PRESET_NAMES.join(", ")}.`);
  }
  return resolved;
}

function presetLabel(fields: FieldSpec[] | undefined, preset: string | undefined): string {
  if (fields && fields.length > 0) return "custom";
  return preset ?? "people";
}

async function produceRows(opts: {
  rows: Row[];
  format: OutputFormat;
  tableName: string;
  locale?: string;
  seed?: number;
  name: string;
  maxPreviewRows?: number;
}): Promise<ReturnType<typeof ok>> {
  const { rows, format, tableName, locale, seed, name } = opts;
  const previewLimit = opts.maxPreviewRows ?? config.previewRows;
  const formatted = formatRows(rows, format, tableName);

  const header =
    `✅ Generated **${rows.length}** row(s)` +
    ` · format: \`${format}\`` +
    (locale ? ` · locale: \`${locale}\`` : "") +
    (seed !== undefined ? ` · seed: \`${seed}\`` : "");

  let body: string;
  if (rows.length <= previewLimit) {
    body =
      format === "markdown"
        ? toMarkdownTable(rows, { maxCellLength: config.maxCellChars })
        : fenced(truncate(formatted, config.previewChars), FENCE[format] ?? "");
  } else {
    body = truncate(
      toMarkdownTable(rows, {
        maxRows: previewLimit,
        maxColumns: 12,
        maxCellLength: config.maxCellChars,
      }),
      config.previewChars,
    );
  }

  let saveNote = "";
  if (rows.length > previewLimit) {
    const saved = await saveDataset({
      name,
      content: formatted,
      format,
      kind: "generated",
      rows: rows.length,
    });
    saveNote =
      `\n\n📦 Full result (${rows.length} rows, ${formatBytes(saved.bytes)}) saved as ` +
      `\`${saved.id}\` — read it with \`read_saved_dataset\` or \`fauxmcp://datasets/${saved.id}\`.`;
  }

  return ok(`${header}\n\n${body}${saveNote}`);
}

function generationHandler(forcedFormat?: OutputFormat) {
  return withErrors<RecordArgs>(async (args) => {
    const fields = resolveFields(args.fields, args.preset);
    const format: OutputFormat = forcedFormat ?? args.format;
    const label = presetLabel(args.fields, args.preset);
    const name = args.name ?? `${label}-${format}`;
    const rows = generateRows(fields, args.count, args.locale, args.seed);
    return produceRows({
      rows,
      format,
      tableName: args.table_name,
      locale: args.locale,
      seed: args.seed,
      name,
    });
  });
}

export function registerGenerationTools(server: McpServer): void {
  server.registerTool(
    "generate_people",
    {
      title: "Generate people",
      description:
        "Generate realistic fake people (name, email, phone, job, company, city, country, timestamps). " +
        "Great for seeding users tables or UI demos. Supports locales and reproducible seeds. " +
        `Up to ${config.maxRows} rows; large results are saved to the local dataset cache.`,
      inputSchema: z.object({
        count: z
          .number()
          .int()
          .min(1)
          .max(config.maxRows)
          .default(10)
          .describe(`Number of people to generate (max ${config.maxRows})`),
        locale: z.string().optional().describe("Faker locale, e.g. en, de, fr, ja, pt_BR"),
        seed: z.number().int().optional().describe("Seed for reproducible output"),
        format: z.enum(["json", "csv", "markdown"]).default("markdown").describe("Output format"),
        name: z.string().optional().describe("Dataset name used when the result is cached"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withErrors(async (args) => {
      const rows = generateRows(PRESETS.people, args.count, args.locale, args.seed);
      return produceRows({
        rows,
        format: args.format,
        tableName: "people",
        locale: args.locale,
        seed: args.seed,
        name: args.name ?? "people",
      });
    }),
  );

  server.registerTool(
    "generate_records",
    {
      title: "Generate records from a schema",
      description:
        "Generate N rows of fake data from a field schema you describe. " +
        "Provide `fields` (name + type, e.g. firstName, email, integer, enum, datetime) " +
        "or use a built-in preset (people, products, orders, companies). " +
        "Output as json, csv, tsv, sql, or a markdown table. Seeded for reproducibility.",
      inputSchema: recordInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    generationHandler(),
  );

  server.registerTool(
    "generate_json",
    {
      title: "Generate JSON fixtures",
      description:
        "Generate an array of JSON objects from a field schema or preset. " +
        "Ideal for API mocks and frontend fixtures. Returns pretty-printed JSON.",
      inputSchema: recordInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    generationHandler("json"),
  );

  server.registerTool(
    "generate_csv",
    {
      title: "Generate CSV",
      description:
        "Generate CSV rows from a field schema or preset, ready to import into a spreadsheet or database.",
      inputSchema: recordInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    generationHandler("csv"),
  );

  server.registerTool(
    "generate_sql",
    {
      title: "Generate SQL inserts",
      description:
        "Generate a CREATE TABLE statement plus INSERT statements for any table, " +
        "using a field schema or preset. Column types are inferred from the data.",
      inputSchema: recordInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    generationHandler("sql"),
  );

  server.registerTool(
    "generate_email",
    {
      title: "Generate email addresses",
      description:
        "Generate one or more realistic email addresses, optionally on a fixed domain/provider.",
      inputSchema: z.object({
        count: z.number().int().min(1).max(100).default(1).describe("How many emails (max 100)"),
        provider: z
          .string()
          .optional()
          .describe("Email provider/domain to use, e.g. example.com or acme.io"),
        locale: z.string().optional(),
        seed: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withErrors(async (args) => {
      const faker = getFaker(args.locale, args.seed);
      const emails: string[] = [];
      for (let i = 0; i < args.count; i++) {
        emails.push(faker.internet.email(args.provider ? { provider: args.provider } : {}));
      }
      const text =
        emails.length === 1
          ? `\`${emails[0]}\``
          : emails.map((email, i) => `${i + 1}. \`${email}\``).join("\n");
      return ok(text);
    }),
  );

  server.registerTool(
    "generate_address",
    {
      title: "Generate addresses",
      description: "Generate realistic postal addresses (street, city, state, zip, country).",
      inputSchema: z.object({
        count: z.number().int().min(1).max(100).default(1).describe("How many addresses (max 100)"),
        locale: z.string().optional(),
        seed: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withErrors(async (args) => {
      const faker = getFaker(args.locale, args.seed);
      const rows: Row[] = [];
      for (let i = 0; i < args.count; i++) {
        rows.push({
          line1: faker.location.streetAddress(),
          line2: faker.location.secondaryAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          zip: faker.location.zipCode(),
          country: faker.location.country(),
        });
      }
      return ok(toMarkdownTable(rows));
    }),
  );

  server.registerTool(
    "generate_phone",
    {
      title: "Generate phone numbers",
      description: "Generate realistic phone numbers, optionally for a specific locale.",
      inputSchema: z.object({
        count: z.number().int().min(1).max(100).default(1).describe("How many numbers (max 100)"),
        locale: z.string().optional(),
        seed: z.number().int().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withErrors(async (args) => {
      const faker = getFaker(args.locale, args.seed);
      const numbers: string[] = [];
      for (let i = 0; i < args.count; i++) numbers.push(faker.phone.number());
      return ok(numbers.map((n, i) => `${i + 1}. \`${n}\``).join("\n"));
    }),
  );
}
