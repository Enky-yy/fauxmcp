import { config } from "./env.js";
import { formatBytes } from "./format.js";

export interface FetchResult {
  text: string;
  contentType: string;
  finalUrl: string;
  bytes: number;
}

export class FetchLimitError extends Error {}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Fetch a URL with guardrails: http(s) only, a timeout, and a byte cap.
 * Throws FetchLimitError when the response exceeds the configured size.
 */
export async function guardedFetch(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http:// and https:// URLs are allowed (got ${parsed.protocol})`);
  }

  const timeoutMs = opts.timeoutMs ?? config.fetchTimeoutMs;
  const maxBytes = opts.maxBytes ?? config.maxSizeMb * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs} ms`));
  }, timeoutMs);

  try {
    const response = await fetch(parsed, { ...init, signal: controller.signal });
    const finalUrl = response.url || parsed.href;
    const finalParsed = new URL(finalUrl);
    if (finalParsed.protocol !== "http:" && finalParsed.protocol !== "https:") {
      throw new Error(`Redirected to a non-http(s) URL: ${finalUrl}`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${finalUrl}`);
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      throw new FetchLimitError(
        `Response is ${formatBytes(declared)}, above the ${formatBytes(maxBytes)} limit. ` +
          `Set FAUX_MAX_SIZE_MB to allow larger downloads.`,
      );
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new FetchLimitError(
            `Response exceeded the ${formatBytes(maxBytes)} limit. ` +
              `Set FAUX_MAX_SIZE_MB to allow larger downloads.`,
          );
        }
        chunks.push(value);
      }
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer());
      bytes = buffer.byteLength;
      if (bytes > maxBytes) {
        throw new FetchLimitError(
          `Response is ${formatBytes(bytes)}, above the ${formatBytes(maxBytes)} limit. ` +
            `Set FAUX_MAX_SIZE_MB to allow larger downloads.`,
        );
      }
      chunks.push(buffer);
    }

    const text = new TextDecoder("utf-8").decode(concatChunks(chunks));
    return {
      text,
      contentType: response.headers.get("content-type") ?? "",
      finalUrl,
      bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}
