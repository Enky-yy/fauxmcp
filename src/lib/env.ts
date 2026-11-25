import os from "node:os";
import path from "node:path";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Runtime configuration. Every guardrail is overridable through environment
 * variables so that the defaults protect you without ever hard-blocking you.
 */
export const config = {
  /** Maximum number of generated rows a single call may request. */
  maxRows: intEnv("FAUX_MAX_ROWS", 1000),
  /** Maximum download size in megabytes. */
  maxSizeMb: intEnv("FAUX_MAX_SIZE_MB", 10),
  /** Fetch timeout in milliseconds. */
  fetchTimeoutMs: intEnv("FAUX_FETCH_TIMEOUT_MS", 30_000),
  /** Number of rows shown inline in tool responses. */
  previewRows: intEnv("FAUX_PREVIEW_ROWS", 20),
  /** Maximum number of HTML tables scraped from one page. */
  maxTables: intEnv("FAUX_MAX_TABLES", 10),
  /** Where downloaded and generated datasets are cached. */
  cacheDir:
    process.env.FAUX_CACHE_DIR?.trim() ||
    path.join(os.homedir(), ".fauxmcp", "datasets"),
} as const;

export const serverInfo = {
  name: "fauxmcp",
  version: "0.1.0",
} as const;
