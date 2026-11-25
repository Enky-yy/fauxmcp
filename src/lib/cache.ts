import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./env.js";
import { extensionFor } from "./format.js";

export type DatasetKind = "fetch" | "scrape" | "api" | "generated";

export interface DatasetMeta {
  /** Stable slug used in resource URIs and tool calls. */
  id: string;
  /** Human-friendly name. */
  name: string;
  /** File name inside the cache directory. */
  file: string;
  /** Data format, e.g. csv, json, sql, md. */
  format: string;
  kind: DatasetKind;
  sourceUrl?: string;
  rows?: number;
  bytes: number;
  createdAt: string;
  updatedAt: string;
}

const INDEX_FILE = "index.json";

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.cacheDir, { recursive: true });
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "dataset";
}

export async function loadIndex(): Promise<DatasetMeta[]> {
  try {
    const raw = await fs.readFile(path.join(config.cacheDir, INDEX_FILE), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is DatasetMeta => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as DatasetMeta).id === "string" &&
        typeof (entry as DatasetMeta).file === "string"
      );
    });
  } catch {
    return [];
  }
}

async function saveIndex(entries: DatasetMeta[]): Promise<void> {
  await ensureDir();
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(
    path.join(config.cacheDir, INDEX_FILE),
    JSON.stringify(sorted, null, 2),
    "utf8",
  );
}

export interface SaveDatasetInput {
  name: string;
  content: string;
  format: string;
  kind: DatasetKind;
  sourceUrl?: string;
  rows?: number;
}

/** Persist a dataset and return its metadata (overwrites same-named datasets). */
export async function saveDataset(input: SaveDatasetInput): Promise<DatasetMeta> {
  await ensureDir();
  const entries = await loadIndex();
  const id = slugify(input.name);
  const existing = entries.find((entry) => entry.id === id);
  const file = `${id}.${extensionFor(input.format)}`;
  await fs.writeFile(path.join(config.cacheDir, file), input.content, "utf8");

  const now = new Date().toISOString();
  const meta: DatasetMeta = {
    id,
    name: input.name,
    file,
    format: input.format,
    kind: input.kind,
    sourceUrl: input.sourceUrl,
    rows: input.rows,
    bytes: Buffer.byteLength(input.content, "utf8"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = entries.filter((entry) => entry.id !== id);
  next.push(meta);
  await saveIndex(next);
  return meta;
}

export interface LoadedDataset {
  meta: DatasetMeta;
  content: string;
}

/** Read a cached dataset by id (or file name). */
export async function getDataset(id: string): Promise<LoadedDataset | null> {
  const entries = await loadIndex();
  const meta = entries.find((entry) => entry.id === id || entry.file === id);
  if (!meta) return null;
  try {
    const content = await fs.readFile(path.join(config.cacheDir, meta.file), "utf8");
    return { meta, content };
  } catch {
    return null;
  }
}

/** Find a cached dataset previously downloaded from the same URL. */
export async function findByUrl(url: string): Promise<DatasetMeta | undefined> {
  const entries = await loadIndex();
  return entries.find((entry) => entry.sourceUrl === url);
}

/** List cached datasets, most recently updated first. */
export async function listDatasets(): Promise<DatasetMeta[]> {
  const entries = await loadIndex();
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
