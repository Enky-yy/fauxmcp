import { config } from "./env.js";
import { formatBytes } from "./format.js";
import { assertHttpProtocol, assertNetworkAllowed, redactUrl } from "./security.js";

export interface FetchResult {
  text: string;
  contentType: string;
  finalUrl: string;
  bytes: number;
}

export class FetchLimitError extends Error {}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

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
 * Fetch a URL with guardrails:
 * - http(s) only
 * - cloud metadata / link-local hosts blocked (unless FAUX_ALLOW_METADATA=1)
 * - redirects followed manually so every hop is re-validated
 * - a timeout and a streaming byte cap
 *
 * Throws FetchLimitError when the response exceeds the configured size.
 */
export async function guardedFetch(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchResult> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${redactUrl(url)}`);
  }
  assertHttpProtocol(current);

  const timeoutMs = opts.timeoutMs ?? config.fetchTimeoutMs;
  const maxBytes = opts.maxBytes ?? config.maxSizeMb * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs} ms`));
  }, timeoutMs);

  try {
    let method = (init.method ?? "GET").toUpperCase();
    let body = init.body ?? null;
    const headers = new Headers(init.headers);
    let redirects = 0;

    while (true) {
      assertHttpProtocol(current);
      assertNetworkAllowed(current);

      const response = await fetch(current, {
        ...init,
        method,
        body: method === "GET" || method === "HEAD" ? undefined : body,
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (REDIRECT_STATUS.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect without a Location header from ${redactUrl(current)}`);
        }
        if (++redirects > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS})`);
        }

        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new Error(`Invalid redirect location: ${location}`);
        }

        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) && method === "POST")
        ) {
          method = "GET";
          body = null;
          headers.delete("content-type");
          headers.delete("content-length");
        }

        await response.body?.cancel().catch(() => undefined);
        current = next;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${redactUrl(current)}`);
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
        finalUrl: current.href,
        bytes,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
